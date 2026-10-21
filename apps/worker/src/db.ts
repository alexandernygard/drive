import type { Crumb, Editor, Item, Kind, Person, Preview, Role, ShareRole } from "@alexandernygard/drive/core"
import { PRESENCE_TTL } from "./env"

export interface ItemRow {
  id: string
  kind: Kind
  name: string
  parent_id: string | null
  owner_id: string
  created_by: string
  created_at: number
  updated_at: number
  updated_by: string | null
  link_role: ShareRole | null
  mime: string | null
  size: number | null
  thumb_at: number | null
  preview: string | null
  trashed_at: number | null
  trashed_by: string | null
  trashed_via: string | null
}

interface UserRow {
  id: string
  email: string
  name: string | null
  picture: string | null
}

export interface Access {
  role: Role
  /** The item itself is shared with this person (not only a folder above it). */
  direct: boolean
  /** The only access is "anyone with the link". Such items stay out of search. */
  linkOnly: boolean
  /** A folder above it is shared with someone (or by link), so more people than its own shares can open it. */
  viaFolder: boolean
}

const RANK: Record<number, ShareRole> = { 1: "viewer", 2: "editor" }

export const ids = (xs: Iterable<string>) => JSON.stringify([...new Set(xs)])

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function getRow(db: D1Database, id: string): Promise<ItemRow | null> {
  return db.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<ItemRow>()
}

/**
 * The viewer's access to each item: owner, else the best share on the item or any folder above it,
 * else the best link role on that chain. Items without access are missing from the map.
 */
export async function accessFor(db: D1Database, itemIds: string[], userId: string): Promise<Map<string, Access>> {
  const out = new Map<string, Access>()
  if (itemIds.length === 0) return out
  const { results } = await db
    .prepare(
      `WITH RECURSIVE chain(start, id, parent_id, depth) AS (
         SELECT id, id, parent_id, 0 FROM items WHERE id IN (SELECT value FROM json_each(?1))
         UNION ALL
         SELECT c.start, i.id, i.parent_id, c.depth + 1 FROM items i JOIN chain c ON i.id = c.parent_id WHERE c.depth < 64
       )
       SELECT c.start AS id,
         MAX(i.owner_id = ?2) AS owner,
         MAX(CASE s.role WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END) AS share_rank,
         MAX(CASE WHEN c.depth = 0 AND s.role IS NOT NULL THEN 1 ELSE 0 END) AS direct,
         MAX(CASE i.link_role WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END) AS link_rank,
         MAX(CASE WHEN c.depth > 0 AND (i.link_role IS NOT NULL OR EXISTS (SELECT 1 FROM shares x WHERE x.item_id = c.id)) THEN 1 ELSE 0 END) AS via_folder
       FROM chain c
       JOIN items i ON i.id = c.id
       LEFT JOIN shares s ON s.item_id = c.id AND s.user_id = ?2
       GROUP BY c.start`,
    )
    .bind(ids(itemIds), userId)
    .all<{ id: string; owner: number; share_rank: number; direct: number; link_rank: number; via_folder: number }>()
  for (const r of results) {
    const viaFolder = !!r.via_folder
    if (r.owner) out.set(r.id, { role: "owner", direct: false, linkOnly: false, viaFolder })
    else {
      const rank = Math.max(r.share_rank, r.link_rank)
      if (rank > 0) out.set(r.id, { role: RANK[rank]!, direct: !!r.direct, linkOnly: r.share_rank === 0, viaFolder })
    }
  }
  return out
}

export async function accessOne(db: D1Database, itemId: string, userId: string): Promise<{ row: ItemRow; access: Access } | null> {
  const [row, access] = await Promise.all([getRow(db, itemId), accessFor(db, [itemId], userId)])
  const a = access.get(itemId)
  return row && a ? { row, access: a } : null
}

export const canEdit = (role: Role | undefined) => role === "owner" || role === "editor"

async function usersById(db: D1Database, userIds: Iterable<string>): Promise<Map<string, Person>> {
  const list = [...new Set(userIds)].filter(Boolean)
  const out = new Map<string, Person>()
  if (list.length === 0) return out
  const { results } = await db.prepare("SELECT id, email, name, picture FROM users WHERE id IN (SELECT value FROM json_each(?))").bind(ids(list)).all<UserRow>()
  for (const u of results) out.set(u.id, u)
  return out
}

const unknownPerson = (id: string): Person => ({ id, email: "", name: null, picture: null })

/** Turn rows into what the dashboard shows: people, shares, stars, presence and the viewer's role. */
export async function hydrate(db: D1Database, rows: ItemRow[], userId: string, known?: Map<string, Access>): Promise<Item[]> {
  if (rows.length === 0) return []
  const itemIds = ids(rows.map((r) => r.id))
  const since = Date.now() - PRESENCE_TTL
  const [access, shares, stars, recents, presence] = await Promise.all([
    known ?? accessFor(db, rows.map((r) => r.id), userId),
    db
      .prepare("SELECT item_id, email, user_id, role, shared_by, created_at FROM shares WHERE item_id IN (SELECT value FROM json_each(?)) ORDER BY created_at")
      .bind(itemIds)
      .all<{ item_id: string; email: string; user_id: string | null; role: ShareRole; shared_by: string; created_at: number }>(),
    db.prepare("SELECT item_id FROM stars WHERE user_id = ? AND item_id IN (SELECT value FROM json_each(?))").bind(userId, itemIds).all<{ item_id: string }>(),
    db.prepare("SELECT item_id, opened_at FROM recents WHERE user_id = ? AND item_id IN (SELECT value FROM json_each(?))").bind(userId, itemIds).all<{ item_id: string; opened_at: number }>(),
    db
      .prepare("SELECT item_id, user_id, conns, since FROM presence WHERE seen_at > ? AND item_id IN (SELECT value FROM json_each(?)) ORDER BY since")
      .bind(since, itemIds)
      .all<{ item_id: string; user_id: string; conns: number; since: number }>(),
  ])
  const people = await usersById(db, [
    ...rows.flatMap((r) => [r.owner_id, r.updated_by ?? ""]),
    ...shares.results.flatMap((s) => [s.user_id ?? "", s.shared_by]),
    ...presence.results.map((p) => p.user_id),
  ])
  const person = (id: string) => people.get(id) ?? unknownPerson(id)
  const starred = new Set(stars.results.map((s) => s.item_id))
  const opened = new Map(recents.results.map((r) => [r.item_id, r.opened_at]))

  const out: Item[] = []
  for (const r of rows) {
    const a = access.get(r.id)
    if (!a) continue
    const itemShares = shares.results.filter((s) => s.item_id === r.id)
    const mine = itemShares.find((s) => s.user_id === userId)
    out.push({
      id: r.id,
      kind: r.kind,
      name: r.name,
      parentId: r.parent_id,
      owner: person(r.owner_id),
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by ? person(r.updated_by) : null,
      role: a.role,
      starred: starred.has(r.id),
      sharedWith: itemShares.map((s) => ({
        email: s.email,
        role: s.role,
        sharedBy: s.shared_by,
        createdAt: s.created_at,
        person: s.user_id ? person(s.user_id) : null,
      })),
      linkRole: r.link_role,
      sharedBy: mine ? person(mine.shared_by) : null,
      sharedAt: mine?.created_at ?? null,
      inherited: a.role !== "owner" && !a.direct,
      sharedViaFolder: a.viaFolder,
      mime: r.mime,
      size: r.size,
      thumbAt: r.thumb_at,
      preview: r.preview ? (JSON.parse(r.preview) as Preview) : null,
      openedAt: opened.get(r.id) ?? null,
      trashedAt: r.trashed_at,
      editors: presence.results.filter((p) => p.item_id === r.id).map((p): Editor => ({ ...person(p.user_id), conns: p.conns, since: p.since })),
    })
  }
  return out
}

/** The folders above an item, top first, including the item. */
async function chain(db: D1Database, id: string): Promise<{ id: string; name: string; owner_id: string; link_role: string | null }[]> {
  const { results } = await db
    .prepare(
      `WITH RECURSIVE chain(id, parent_id, depth) AS (
         SELECT id, parent_id, 0 FROM items WHERE id = ?1
         UNION ALL SELECT i.id, i.parent_id, c.depth + 1 FROM items i JOIN chain c ON i.id = c.parent_id WHERE c.depth < 64
       )
       SELECT i.id, i.name, i.owner_id, i.link_role FROM chain c JOIN items i ON i.id = c.id ORDER BY c.depth DESC`,
    )
    .bind(id)
    .all<{ id: string; name: string; owner_id: string; link_role: string | null }>()
  return results
}

/**
 * Breadcrumbs for a folder: "My files" down to it for the owner; for others, "Shared with me" down from
 * the highest folder they were given access to.
 */
export async function pathFor(db: D1Database, folderId: string, userId: string): Promise<Crumb[]> {
  const c = await chain(db, folderId)
  if (c.length === 0) return []
  if (c[0]!.owner_id === userId) return [{ id: null, name: "My files" }, ...c.map((x) => ({ id: x.id, name: x.name }))]
  const { results } = await db
    .prepare("SELECT item_id FROM shares WHERE user_id = ? AND item_id IN (SELECT value FROM json_each(?))")
    .bind(userId, ids(c.map((x) => x.id)))
    .all<{ item_id: string }>()
  const shared = new Set(results.map((r) => r.item_id))
  const top = c.findIndex((x) => shared.has(x.id) || x.link_role)
  return [{ id: null, name: "Shared with me" }, ...c.slice(Math.max(0, top)).map((x) => ({ id: x.id, name: x.name }))]
}

/** The item and everything inside it. */
export async function subtree(db: D1Database, id: string): Promise<ItemRow[]> {
  const { results } = await db
    .prepare(
      `WITH RECURSIVE tree(id, depth) AS (
         SELECT id, 0 FROM items WHERE id = ?1
         UNION ALL SELECT i.id, t.depth + 1 FROM items i JOIN tree t ON i.parent_id = t.id WHERE t.depth < 64
       )
       SELECT items.* FROM tree JOIN items ON items.id = tree.id`,
    )
    .bind(id)
    .all<ItemRow>()
  return results
}

/** True if `ancestor` is `id` or one of the folders above it. */
export async function isWithin(db: D1Database, id: string, ancestor: string): Promise<boolean> {
  return (await chain(db, id)).some((x) => x.id === ancestor)
}

/** Everyone who can see an item: its owner, people it (or a folder above it) is shared with, and link visitors who opened it. */
export async function audience(db: D1Database, itemId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `WITH RECURSIVE chain(id, parent_id, depth) AS (
         SELECT id, parent_id, 0 FROM items WHERE id = ?1
         UNION ALL SELECT i.id, i.parent_id, c.depth + 1 FROM items i JOIN chain c ON i.id = c.parent_id WHERE c.depth < 64
       )
       SELECT owner_id AS user_id FROM items WHERE id = ?1
       UNION SELECT s.user_id FROM shares s JOIN chain c ON s.item_id = c.id WHERE s.user_id IS NOT NULL
       UNION SELECT r.user_id FROM recents r WHERE r.item_id = ?1`,
    )
    .bind(itemId)
    .all<{ user_id: string }>()
  return results.map((r) => r.user_id)
}

export function logActivity(db: D1Database, itemId: string, actorId: string, action: string, detail: string | null = null) {
  return db.prepare("INSERT INTO activity (item_id, actor_id, action, detail, at) VALUES (?, ?, ?, ?, ?)").bind(itemId, actorId, action, detail, Date.now())
}
