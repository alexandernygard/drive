import { Hono } from "hono"
import { signTicket } from "@alexandernygard/collab/cloudflare"
import { isDocKind, template, type Activity, type Content, type Item, type Kind, type Person, type ShareRole, type Ticket } from "@alexandernygard/drive/core"
import {
  accessFor,
  accessOne,
  audience,
  canEdit,
  getRow,
  hydrate,
  ids,
  isWithin,
  logActivity,
  newId,
  pathFor,
  subtree,
  type Access,
  type ItemRow,
} from "./db"
import { notifyChanged, notifyUsers } from "./feed"
import { allowedOrigins, cors, fail, requireUser, type AppEnv } from "./http"
import { PRESENCE_TTL, type Env } from "./env"
import type { User } from "./auth/auth"

export const api = new Hono<AppEnv>()
api.use("*", cors)
api.use("*", requireUser)

// Keep a display copy of each user's profile, and connect shares made to their email before they
// ever signed in. At most every few minutes per user and isolate.
const touched = new Map<string, number>()
api.use("*", async (c, next) => {
  const u = c.var.user
  if ((touched.get(u.id) ?? 0) < Date.now() - 5 * 60_000) {
    touched.set(u.id, Date.now())
    await touchUser(c.env.DB, u)
  }
  await next()
})

async function touchUser(db: D1Database, u: User) {
  await db.batch([
    db
      .prepare(
        "INSERT INTO users (id, email, name, picture, seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture, seen_at = excluded.seen_at",
      )
      .bind(u.id, u.email, u.name, u.picture, Date.now()),
    db.prepare("UPDATE shares SET user_id = ? WHERE user_id IS NULL AND email = ?").bind(u.id, u.email.toLowerCase()),
  ])
}

// ---------- helpers ----------

const MAX_NAME = 200
const MAX_UPLOAD = 95 * 1024 * 1024
const MAX_THUMB = 256 * 1024
const TRASH_DAYS = 30

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/[\u0000-\u001f]/g, "").trim() : ""
  if (!name) fail(400, "bad_name", "Give it a name.")
  return name.slice(0, MAX_NAME)
}

async function body<T>(req: Request): Promise<Partial<T>> {
  return ((await req.json().catch(() => ({}))) ?? {}) as Partial<T>
}

/** Access to an item, or 404 (also when the viewer has none, so ids can't be probed). */
async function need(env: Env, id: string, user: User, opts: { edit?: boolean; owner?: boolean; trashed?: boolean } = {}) {
  const found = await accessOne(env.DB, id, user.id)
  if (!found) return fail(404, "not_found", "This item doesn't exist or isn't shared with you.")
  if (!opts.trashed && found.row.trashed_at) fail(404, "trashed", "This item is in the trash.")
  if (opts.owner && found.access.role !== "owner") fail(403, "forbidden", "Only the owner can do that.")
  if (opts.edit && !canEdit(found.access.role)) fail(403, "forbidden", "You can only view this item.")
  return found
}

async function one(env: Env, row: ItemRow, user: User, access?: Access): Promise<Item> {
  const [item] = await hydrate(env.DB, [row], user.id, access ? new Map([[row.id, access]]) : undefined)
  return item!
}

async function fresh(env: Env, id: string, user: User): Promise<Item> {
  const found = await accessOne(env.DB, id, user.id)
  if (!found) return fail(404, "not_found")
  return one(env, found.row, user, found.access)
}

const roomFor = (env: Env, id: string) => env.ROOMS.get(env.ROOMS.idFromName(id))

const folderFirst = (a: ItemRow, b: ItemRow) => Number(b.kind === "folder") - Number(a.kind === "folder") || a.name.localeCompare(b.name, undefined, { numeric: true })

/** Delete items and everything inside them, with their rooms and files. */
export async function destroy(env: Env, rootIds: string[]): Promise<number> {
  const rows = new Map<string, ItemRow>()
  for (const id of rootIds) for (const r of await subtree(env.DB, id)) rows.set(r.id, r)
  if (rows.size === 0) return 0
  const users = new Set<string>()
  for (const id of rootIds) for (const u of await audience(env.DB, id)) users.add(u)
  await env.DB.prepare("DELETE FROM items WHERE id IN (SELECT value FROM json_each(?))").bind(ids(rows.keys())).run()
  const list = [...rows.values()]
  await Promise.allSettled([
    ...list.filter((r) => isDocKind(r.kind)).map((r) => roomFor(env, r.id).purge()),
    env.FILES.delete(list.flatMap((r) => [`files/${r.id}`, `thumbs/${r.id}`])),
  ])
  await notifyUsers(env, users, { type: "changed", itemIds: rootIds })
  return rows.size
}

// ---------- me & listings ----------

api.get("/me", async (c) => {
  const u = c.var.user
  await touchUser(c.env.DB, u)
  const usage = await c.env.DB.prepare("SELECT COUNT(*) AS items, COALESCE(SUM(size), 0) AS bytes FROM items WHERE owner_id = ? AND kind != 'folder'")
    .bind(u.id)
    .first<{ items: number; bytes: number }>()
  return c.json({ id: u.id, email: u.email, name: u.name, picture: u.picture, usage: usage ?? { items: 0, bytes: 0 } })
})

api.get("/items", async (c) => {
  const db = c.env.DB
  const me = c.var.user.id
  const view = c.req.query("view") ?? "mine"
  const parent = c.req.query("parent")

  if (parent) {
    const { row, access } = await need(c.env, parent, c.var.user)
    if (row.kind !== "folder") fail(400, "not_a_folder")
    const { results } = await db.prepare("SELECT * FROM items WHERE parent_id = ? AND trashed_at IS NULL").bind(parent).all<ItemRow>()
    const [folder, items, path] = await Promise.all([one(c.env, row, c.var.user, access), hydrate(db, results.sort(folderFirst), me), pathFor(db, parent, me)])
    return c.json({ items, folder, path })
  }

  let rows: ItemRow[] = []
  let keepLinkOnly = false
  switch (view) {
    case "mine":
      rows = (await db.prepare("SELECT * FROM items WHERE owner_id = ? AND parent_id IS NULL AND trashed_at IS NULL").bind(me).all<ItemRow>()).results.sort(folderFirst)
      break
    case "shared":
      rows = (
        await db
          .prepare("SELECT i.* FROM items i JOIN shares s ON s.item_id = i.id WHERE s.user_id = ?1 AND i.owner_id != ?1 AND i.trashed_at IS NULL ORDER BY s.created_at DESC")
          .bind(me)
          .all<ItemRow>()
      ).results
      break
    case "sharing":
      rows = (
        await db
          .prepare(
            "SELECT * FROM items WHERE owner_id = ? AND trashed_at IS NULL AND (link_role IS NOT NULL OR EXISTS (SELECT 1 FROM shares s WHERE s.item_id = items.id)) ORDER BY updated_at DESC",
          )
          .bind(me)
          .all<ItemRow>()
      ).results
      break
    case "starred":
      keepLinkOnly = true
      rows = (await db.prepare("SELECT i.* FROM items i JOIN stars s ON s.item_id = i.id WHERE s.user_id = ? AND i.trashed_at IS NULL ORDER BY s.created_at DESC").bind(me).all<ItemRow>()).results
      break
    case "recent":
    case "home": {
      keepLinkOnly = true
      const limit = view === "home" ? 30 : 60
      const recent = (
        await db
          .prepare("SELECT i.* FROM items i JOIN recents r ON r.item_id = i.id WHERE r.user_id = ? AND i.trashed_at IS NULL AND i.kind != 'folder' ORDER BY r.opened_at DESC LIMIT ?")
          .bind(me, limit)
          .all<ItemRow>()
      ).results
      // Home also lists documents someone is in right now, if you can see them.
      const live =
        view === "home"
          ? (
              await db
                .prepare("SELECT * FROM items WHERE trashed_at IS NULL AND id IN (SELECT item_id FROM presence WHERE seen_at > ?) LIMIT 100")
                .bind(Date.now() - PRESENCE_TTL)
                .all<ItemRow>()
            ).results
          : []
      const seen = new Set(recent.map((r) => r.id))
      rows = [...recent, ...live.filter((r) => !seen.has(r.id))]
      break
    }
    case "trash":
      rows = (
        await db
          .prepare("SELECT * FROM items WHERE trashed_at IS NOT NULL AND trashed_via IS NULL AND (owner_id = ?1 OR trashed_by = ?1) ORDER BY trashed_at DESC")
          .bind(me)
          .all<ItemRow>()
      ).results
      break
    case "search": {
      const q = (c.req.query("q") ?? "").trim()
      if (!q) return c.json({ items: [], folder: null, path: [] })
      const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
      rows = (await db.prepare("SELECT * FROM items WHERE trashed_at IS NULL AND name LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 400").bind(like).all<ItemRow>()).results
      break
    }
    default:
      fail(400, "bad_view")
  }

  const access = await accessFor(db, rows.map((r) => r.id), me)
  let items = await hydrate(db, rows, me, access)
  // "Anyone with the link" items only show up once you have opened them.
  items = items.filter((i) => !access.get(i.id)?.linkOnly || (keepLinkOnly && i.openedAt))
  if (view === "search") items = items.slice(0, 60)
  return c.json({ items, folder: null, path: [] })
})

api.get("/items/:id", async (c) => {
  const { row, access } = await need(c.env, c.req.param("id"), c.var.user, { trashed: true })
  const [item, path] = await Promise.all([one(c.env, row, c.var.user, access), row.parent_id ? pathFor(c.env.DB, row.parent_id, c.var.user.id) : Promise.resolve([])])
  return c.json({ item, items: [], folder: null, path })
})

// ---------- create, upload, change ----------

api.post("/items", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const b = await body<{ kind: Kind; name: string; parentId: string | null; content: Content }>(c.req.raw)
  const kind = b.kind
  if (kind !== "folder" && !isDocKind(kind ?? "")) fail(400, "bad_kind")
  const name = cleanName(b.name)
  let owner = u.id
  if (b.parentId) {
    const p = await need(c.env, b.parentId, u, { edit: true })
    if (p.row.kind !== "folder") fail(400, "not_a_folder")
    owner = p.row.owner_id
  }
  const id = newId()
  const now = Date.now()
  await db.batch([
    db
      .prepare("INSERT INTO items (id, kind, name, parent_id, owner_id, created_by, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, kind, name, b.parentId ?? null, owner, u.id, now, now, u.id),
    logActivity(db, id, u.id, "created"),
    ...(kind === "folder" ? [] : [db.prepare("INSERT INTO recents (user_id, item_id, opened_at) VALUES (?, ?, ?)").bind(u.id, id, now)]),
  ])
  if (isDocKind(kind!)) {
    const content = b.content && (b.content.text !== undefined || b.content.files) ? b.content : template(kind, name)
    await roomFor(c.env, id).seed(id, kind, content)
  }
  c.executionCtx.waitUntil(notifyChanged(c.env, [id]))
  return c.json(await fresh(c.env, id, u), 201)
})

api.post("/upload", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const name = cleanName(c.req.query("name"))
  const parentId = c.req.query("parent") || null
  let owner = u.id
  if (parentId) {
    const p = await need(c.env, parentId, u, { edit: true })
    if (p.row.kind !== "folder") fail(400, "not_a_folder")
    owner = p.row.owner_id
  }
  const length = Number(c.req.header("Content-Length") ?? 0)
  if (length > MAX_UPLOAD) fail(413, "too_large", "Files can be up to 95 MB.")
  if (!c.req.raw.body) fail(400, "empty")
  const id = newId()
  const mime = c.req.header("Content-Type") || "application/octet-stream"
  const obj = await c.env.FILES.put(`files/${id}`, c.req.raw.body, { httpMetadata: { contentType: mime } })
  const now = Date.now()
  await db.batch([
    db
      .prepare("INSERT INTO items (id, kind, name, parent_id, owner_id, created_by, created_at, updated_at, updated_by, mime, size) VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, name, parentId, owner, u.id, now, now, u.id, mime, obj.size),
    logActivity(db, id, u.id, "uploaded"),
  ])
  c.executionCtx.waitUntil(notifyChanged(c.env, [id]))
  return c.json(await fresh(c.env, id, u), 201)
})

api.patch("/items/:id", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const id = c.req.param("id")
  const b = await body<{ name: string; parentId: string | null; starred: boolean }>(c.req.raw)
  const { row, access } = await need(c.env, id, u)
  const stmts: D1PreparedStatement[] = []
  let changed = false

  if (b.starred !== undefined) {
    stmts.push(
      b.starred
        ? db.prepare("INSERT OR IGNORE INTO stars (user_id, item_id, created_at) VALUES (?, ?, ?)").bind(u.id, id, Date.now())
        : db.prepare("DELETE FROM stars WHERE user_id = ? AND item_id = ?").bind(u.id, id),
    )
  }
  if (b.name !== undefined) {
    if (!canEdit(access.role)) fail(403, "forbidden", "You can only view this item.")
    const name = cleanName(b.name)
    if (name !== row.name) {
      stmts.push(db.prepare("UPDATE items SET name = ? WHERE id = ?").bind(name, id), logActivity(db, id, u.id, "renamed", row.name))
      changed = true
    }
  }
  if (b.parentId !== undefined && b.parentId !== row.parent_id) {
    if (!canEdit(access.role)) fail(403, "forbidden", "You can only view this item.")
    let destName = "My files"
    if (b.parentId === null) {
      if (access.role !== "owner") fail(403, "forbidden", "Only the owner can move this to their files.")
    } else {
      const dest = await need(c.env, b.parentId, u, { edit: true })
      if (dest.row.kind !== "folder") fail(400, "not_a_folder")
      if (dest.row.owner_id !== row.owner_id) fail(400, "other_owner", "Items can only move between folders with the same owner.")
      if (row.kind === "folder" && (await isWithin(db, b.parentId, id))) fail(400, "cycle", "A folder can't go inside itself.")
      destName = dest.row.name
    }
    stmts.push(db.prepare("UPDATE items SET parent_id = ? WHERE id = ?").bind(b.parentId, id), logActivity(db, id, u.id, "moved", destName))
    changed = true
  }
  if (stmts.length) await db.batch(stmts)
  if (changed) c.executionCtx.waitUntil(notifyChanged(c.env, [id, ...(row.parent_id ? [row.parent_id] : [])]))
  return c.json(await fresh(c.env, id, u))
})

api.post("/items/:id/copy", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const { row } = await need(c.env, c.req.param("id"), u)
  if (row.kind === "folder") fail(400, "folder_copy", "Folders can't be copied yet.")
  const b = await body<{ parentId: string | null }>(c.req.raw)
  // The copy goes next to the original if you can add files there, else to your own files.
  let parentId = b.parentId !== undefined ? b.parentId : row.parent_id
  let owner = u.id
  if (parentId) {
    const p = await accessOne(db, parentId, u.id)
    if (p && canEdit(p.access.role) && !p.row.trashed_at) owner = p.row.owner_id
    else parentId = null
  }
  const id = newId()
  const now = Date.now()
  const name = `Copy of ${row.name}`.slice(0, MAX_NAME)
  if (row.kind === "file") {
    const obj = await c.env.FILES.get(`files/${row.id}`)
    if (!obj) fail(404, "missing_file")
    await c.env.FILES.put(`files/${id}`, obj!.body, { httpMetadata: obj!.httpMetadata })
  }
  await db.batch([
    db
      .prepare(
        "INSERT INTO items (id, kind, name, parent_id, owner_id, created_by, created_at, updated_at, updated_by, mime, size, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(id, row.kind, name, parentId, owner, u.id, now, now, u.id, row.mime, row.size, row.preview),
    logActivity(db, id, u.id, "created", `Copy of ${row.name}`),
  ])
  if (isDocKind(row.kind)) await roomFor(c.env, id).seedUpdate(id, row.kind, await roomFor(c.env, row.id).snapshot())
  c.executionCtx.waitUntil(notifyChanged(c.env, [id]))
  return c.json(await fresh(c.env, id, u), 201)
})

// ---------- trash ----------

api.post("/items/:id/trash", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const id = c.req.param("id")
  await need(c.env, id, u, { edit: true })
  const inside = (await subtree(db, id)).filter((r) => r.id !== id && !r.trashed_at).map((r) => r.id)
  const now = Date.now()
  await db.batch([
    db.prepare("UPDATE items SET trashed_at = ?, trashed_by = ?, trashed_via = NULL WHERE id = ?").bind(now, u.id, id),
    db.prepare("UPDATE items SET trashed_at = ?, trashed_by = ?, trashed_via = ? WHERE id IN (SELECT value FROM json_each(?))").bind(now, u.id, id, ids(inside)),
    logActivity(db, id, u.id, "trashed"),
  ])
  c.executionCtx.waitUntil(notifyChanged(c.env, [id]))
  return c.body(null, 204)
})

api.post("/items/:id/restore", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const id = c.req.param("id")
  const { row, access } = await need(c.env, id, u, { edit: true, trashed: true })
  if (!row.trashed_at) return c.body(null, 204)
  // Back where it was, unless that folder is gone or in the trash too: then the owner's files.
  const parent = row.parent_id ? await getRow(db, row.parent_id) : null
  const parentId = parent && !parent.trashed_at ? parent.id : null
  if (!parentId && row.parent_id && access.role !== "owner") fail(409, "parent_trashed", "Its folder is in the trash. Ask the owner to restore it.")
  await db.batch([
    db.prepare("UPDATE items SET trashed_at = NULL, trashed_by = NULL, trashed_via = NULL, parent_id = ? WHERE id = ?").bind(parentId, id),
    db.prepare("UPDATE items SET trashed_at = NULL, trashed_by = NULL, trashed_via = NULL WHERE trashed_via = ?").bind(id),
    logActivity(db, id, u.id, "restored"),
  ])
  c.executionCtx.waitUntil(notifyChanged(c.env, [id]))
  return c.body(null, 204)
})

api.delete("/items/:id", async (c) => {
  const id = c.req.param("id")
  await need(c.env, id, c.var.user, { owner: true, trashed: true })
  await destroy(c.env, [id])
  return c.body(null, 204)
})

api.delete("/trash", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id FROM items WHERE owner_id = ? AND trashed_at IS NOT NULL AND trashed_via IS NULL").bind(c.var.user.id).all<{ id: string }>()
  return c.json({ deleted: await destroy(c.env, results.map((r) => r.id)) })
})

// ---------- sharing ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

api.put("/items/:id/shares", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const id = c.req.param("id")
  const b = await body<{ email: string; role: ShareRole }>(c.req.raw)
  const email = (b.email ?? "").trim().toLowerCase()
  if (!EMAIL.test(email)) fail(400, "bad_email", "That doesn't look like an email address.")
  if (b.role !== "viewer" && b.role !== "editor") fail(400, "bad_role")
  const { row } = await need(c.env, id, u, { edit: true })
  const owner = await db.prepare("SELECT email FROM users WHERE id = ?").bind(row.owner_id).first<{ email: string }>()
  if (owner?.email.toLowerCase() === email) fail(400, "is_owner", "That's the owner.")
  const target = await db.prepare("SELECT id, email, name, picture FROM users WHERE lower(email) = ?").bind(email).first<Person>()
  const before = await db.prepare("SELECT role FROM shares WHERE item_id = ? AND email = ?").bind(id, email).first<{ role: string }>()
  await db.batch([
    db
      .prepare(
        "INSERT INTO shares (item_id, email, user_id, role, shared_by, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (item_id, email) DO UPDATE SET role = excluded.role",
      )
      .bind(id, email, target?.id ?? null, b.role, u.id, Date.now()),
    logActivity(db, id, u.id, "shared", `${email}:${b.role}`),
  ])
  if (target && before?.role !== b.role) {
    const by: Person = { id: u.id, email: u.email, name: u.name, picture: u.picture }
    c.executionCtx.waitUntil(notifyUsers(c.env, [target.id], { type: "shared", itemId: id, name: row.name, kind: row.kind, by, role: b.role! }))
  }
  c.executionCtx.waitUntil(notifyChanged(c.env, [id]))
  return c.json(await fresh(c.env, id, u))
})

api.delete("/items/:id/shares/:email", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const id = c.req.param("id")
  const email = decodeURIComponent(c.req.param("email")).toLowerCase()
  const found = await accessOne(db, id, u.id)
  if (!found) fail(404, "not_found")
  const self = email === u.email.toLowerCase()
  if (!self && !canEdit(found!.access.role)) fail(403, "forbidden", "You can only view this item.")
  const users = await audience(db, id)
  await db.batch([db.prepare("DELETE FROM shares WHERE item_id = ? AND email = ?").bind(id, email), logActivity(db, id, u.id, "unshared", email)])
  c.executionCtx.waitUntil(notifyUsers(c.env, users, { type: "changed", itemIds: [id] }))
  if (self && found!.access.role !== "owner") return c.body(null, 204)
  return c.json(await fresh(c.env, id, u))
})

api.put("/items/:id/link", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const id = c.req.param("id")
  const b = await body<{ role: ShareRole | null }>(c.req.raw)
  const role = b.role ?? null
  if (role !== null && role !== "viewer" && role !== "editor") fail(400, "bad_role")
  await need(c.env, id, u, { edit: true })
  await db.batch([db.prepare("UPDATE items SET link_role = ? WHERE id = ?").bind(role, id), logActivity(db, id, u.id, "link", role ?? "off")])
  c.executionCtx.waitUntil(notifyChanged(c.env, [id]))
  return c.json(await fresh(c.env, id, u))
})

api.get("/people", async (c) => {
  const me = c.var.user.id
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT u.id, u.email, u.name, u.picture FROM users u WHERE u.id != ?1 AND u.id IN (
       SELECT s.user_id FROM shares s WHERE s.shared_by = ?1
       UNION SELECT s.shared_by FROM shares s WHERE s.user_id = ?1
       UNION SELECT i.owner_id FROM items i JOIN shares s ON s.item_id = i.id WHERE s.user_id = ?1
     ) ORDER BY u.name`,
  )
    .bind(me)
    .all<Person>()
  return c.json(results)
})

// ---------- activity ----------

type ActivityRow = { id: number; item_id: string; name: string; kind: Kind; actor_id: string; action: Activity["action"]; detail: string | null; at: number; email: string | null; uname: string | null; picture: string | null }

const activityJson = (r: ActivityRow): Activity => ({
  id: r.id,
  itemId: r.item_id,
  itemName: r.name,
  itemKind: r.kind,
  actor: r.email !== null ? { id: r.actor_id, email: r.email, name: r.uname, picture: r.picture } : null,
  action: r.action,
  detail: r.detail,
  at: r.at,
})

const ACTIVITY_SELECT = "SELECT a.id, a.item_id, i.name, i.kind, a.actor_id, a.action, a.detail, a.at, u.email, u.name AS uname, u.picture FROM activity a JOIN items i ON i.id = a.item_id LEFT JOIN users u ON u.id = a.actor_id"

api.get("/activity", async (c) => {
  const me = c.var.user.id
  const { results } = await c.env.DB.prepare(
    `${ACTIVITY_SELECT}
     WHERE i.trashed_at IS NULL AND (i.owner_id = ?1 OR i.id IN (SELECT item_id FROM shares WHERE user_id = ?1) OR i.id IN (SELECT item_id FROM recents WHERE user_id = ?1))
     ORDER BY a.at DESC LIMIT 60`,
  )
    .bind(me)
    .all<ActivityRow>()
  return c.json(results.map(activityJson))
})

api.get("/items/:id/activity", async (c) => {
  const id = c.req.param("id")
  await need(c.env, id, c.var.user, { trashed: true })
  const { results } = await c.env.DB.prepare(`${ACTIVITY_SELECT} WHERE a.item_id = ? ORDER BY a.at DESC LIMIT 60`).bind(id).all<ActivityRow>()
  return c.json(results.map(activityJson))
})

// ---------- opening documents ----------

api.post("/items/:id/ticket", async (c) => {
  const db = c.env.DB
  const u = c.var.user
  const id = c.req.param("id")
  const { row, access } = await need(c.env, id, u)
  if (!isDocKind(row.kind)) fail(400, "not_a_document")
  await touchUser(db, u)
  await db.prepare("INSERT INTO recents (user_id, item_id, opened_at) VALUES (?1, ?2, ?3) ON CONFLICT (user_id, item_id) DO UPDATE SET opened_at = ?3").bind(u.id, id, Date.now()).run()
  const readOnly = access.role === "viewer"
  const origin = new URL(c.req.url).origin.replace(/^http/, "ws")
  const ticket: Ticket = {
    item: await one(c.env, row, u, access),
    url: `${origin}/collab/${encodeURIComponent(id)}`,
    ticket: await signTicket(c.env.TICKET_SECRET, { sub: u.id, doc: id, ro: readOnly }, 120),
    readOnly,
  }
  return c.json(ticket)
})

api.put("/items/:id/thumbnail", async (c) => {
  const id = c.req.param("id")
  await need(c.env, id, c.var.user, { edit: true })
  const type = c.req.header("Content-Type") ?? ""
  if (!/^image\/(png|jpeg|webp)$/.test(type)) fail(415, "bad_type", "Thumbnails are PNG, JPEG or WebP.")
  const data = await c.req.arrayBuffer()
  if (data.byteLength > MAX_THUMB) fail(413, "too_large", "Thumbnails can be up to 256 KB.")
  await c.env.FILES.put(`thumbs/${id}`, data, { httpMetadata: { contentType: type } })
  await c.env.DB.prepare("UPDATE items SET thumb_at = ? WHERE id = ?").bind(Date.now(), id).run()
  c.executionCtx.waitUntil(notifyChanged(c.env, [id]))
  return c.body(null, 204)
})

api.get("/items/:id/thumbnail", async (c) => {
  const id = c.req.param("id")
  await need(c.env, id, c.var.user, { trashed: true })
  const obj = await c.env.FILES.get(`thumbs/${id}`)
  if (!obj) fail(404, "no_thumbnail")
  return new Response(obj!.body, {
    headers: { "Content-Type": obj!.httpMetadata?.contentType ?? "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
  })
})

const EXTENSIONS: Record<string, string> = { doc: ".w2.md", deck: ".deck.tsx", diagram: ".diagram.ts", sheet: ".xl2.json", board: ".board.html" }
const filename = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")

api.get("/items/:id/content", async (c) => {
  const { row } = await need(c.env, c.req.param("id"), c.var.user, { trashed: true })
  const download = c.req.query("download") === "1"
  if (row.kind === "folder") fail(400, "folder")
  if (row.kind === "file") {
    const obj = await c.env.FILES.get(`files/${row.id}`)
    if (!obj) fail(404, "missing_file")
    // Anything that could run script in our origin downloads instead of rendering.
    const inline = !download && /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|text\/plain|video\/|audio\/)/.test(row.mime ?? "")
    return new Response(obj!.body, {
      headers: {
        "Content-Type": row.mime ?? "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename(row.name))}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    })
  }
  const content = await roomFor(c.env, row.id).export()
  const name = filename(row.name) + EXTENSIONS[row.kind]
  const text = row.kind === "sheet" ? JSON.stringify(content, null, 2) : (content.text ?? "")
  return new Response(text, {
    headers: {
      "Content-Type": row.kind === "sheet" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  })
})

// ---------- live feed ----------

api.get("/live", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") fail(426, "expected_websocket")
  // Cross-site WebSocket hijacking: only our pages may open the feed with the cookie.
  const origin = c.req.header("Origin")
  if (origin && !allowedOrigins(c.env, c.req.raw).includes(origin)) fail(403, "bad_origin")
  return c.env.FEEDS.get(c.env.FEEDS.idFromName(c.var.user.id)).fetch(c.req.raw)
})

// ---------- maintenance ----------

/** Delete items that have been in the trash for 30 days. */
export async function emptyOldTrash(env: Env) {
  const { results } = await env.DB.prepare("SELECT id FROM items WHERE trashed_at < ? AND trashed_via IS NULL LIMIT 200")
    .bind(Date.now() - TRASH_DAYS * 86_400_000)
    .all<{ id: string }>()
  if (results.length) await destroy(env, results.map((r) => r.id))
}

/** A Nyggis account was deleted: remove everything it owns and its traces. */
export async function forgetUser(env: Env, userId: string) {
  const { results } = await env.DB.prepare("SELECT id FROM items WHERE owner_id = ? AND parent_id IS NULL").bind(userId).all<{ id: string }>()
  await destroy(env, results.map((r) => r.id))
  const db = env.DB
  await db.batch([
    db.prepare("DELETE FROM shares WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM stars WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM recents WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM presence WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ])
}
