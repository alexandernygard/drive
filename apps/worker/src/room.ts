import { DocRoom } from "@alexandernygard/collab/cloudflare"
import { APPS, isDocKind, type Content, type DocKind, type Editor, type Preview } from "@alexandernygard/drive/core"
import * as Y from "yjs"
import { notifyChanged, notifyUsers } from "./feed"
import { audience, logActivity } from "./db"
import { HEADER_ITEM, PRESENCE_TTL, type Env } from "./env"

interface Attachment {
  id: string
  userId: string | null
  readOnly: boolean
}

/** Write "edited" to the item at most this often while people type. */
const SAVE_EVERY = 15_000
/** Refresh presence rows this often while anyone is connected. */
const HEARTBEAT = 60_000
/** One "edited" activity entry per person per document within this window. */
const ACTIVITY_WINDOW = 30 * 60_000

/**
 * A document's room. collab's DocRoom does the syncing; this adds what the drive needs to know: who has
 * the document open (presence rows + pushes to dashboards), who last changed it and when, and a small
 * preview of the content. The item id comes from the Worker on the first connection and is kept in storage.
 */
export class DriveRoom extends DocRoom<Env> {
  private item: { id: string; kind: DocKind } | null = null
  /** Users who changed the document since the last save. Also kept in storage: an idle room hibernates before its alarm. */
  private editedBy = new Set<string>()
  private lastPresence = ""

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.room.doc.on("update", (_update: Uint8Array, origin: unknown) => {
      // Updates from peers carry their socket id as the origin; storage loads and seeds do not.
      if (typeof origin !== "string") return
      const userId = this.socketUser(origin)
      if (!userId || this.editedBy.has(userId)) return
      this.editedBy.add(userId)
      void this.ctx.storage.put("editedBy", [...this.editedBy]).then(() => this.schedule(SAVE_EVERY))
    })
  }

  override async fetch(request: Request): Promise<Response> {
    const id = request.headers.get(HEADER_ITEM)
    if (id) await this.remember(id)
    const res = await super.fetch(request)
    await this.presenceChanged()
    await this.schedule(HEARTBEAT)
    return res
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    super.webSocketClose(ws, code, reason)
    await this.presenceChanged(ws)
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    super.webSocketError(ws)
    await this.presenceChanged(ws)
  }

  override async alarm(): Promise<void> {
    for (const u of (await this.ctx.storage.get<string[]>("editedBy")) ?? []) this.editedBy.add(u)
    if (this.editedBy.size > 0) await this.save()
    await this.presenceChanged(undefined, true)
    if (this.ctx.getWebSockets().length > 0) await this.schedule(HEARTBEAT)
  }

  // --- called by the Worker over RPC ---

  /** Fill a new, empty document. */
  async seed(id: string, kind: DocKind, content: Content): Promise<void> {
    await this.remember(id, kind)
    await this.room.init()
    const doc = this.room.doc
    doc.transact(() => {
      if (APPS[kind].layout === "text") {
        const text = doc.getText("source")
        if (text.length === 0 && content.text) text.insert(0, content.text)
      } else {
        const files = doc.getMap<Y.Text>("files")
        if (files.size === 0) {
          const entries = Object.entries(content.files ?? (content.text ? { main: content.text } : {}))
          for (const [name, text] of entries) files.set(name, new Y.Text(text))
        }
      }
    }, "seed")
    await this.room.flush()
    await this.writePreview()
  }

  /** Copy another document's content into this new one. */
  async seedUpdate(id: string, kind: DocKind, update: ArrayBuffer): Promise<void> {
    await this.remember(id, kind)
    await this.room.init()
    Y.applyUpdate(this.room.doc, new Uint8Array(update), "seed")
    await this.room.flush()
    await this.writePreview()
  }

  /** The content as text, for downloads. */
  async export(): Promise<Content> {
    await this.room.init()
    const doc = this.room.doc
    const files = doc.getMap<Y.Text>("files")
    if (files.size > 0) return { files: Object.fromEntries([...files].map(([k, v]) => [k, v.toString()])) }
    return { text: doc.getText("source").toString() }
  }

  /** Deleted forever: disconnect everyone and drop the storage. */
  async purge(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4403, "deleted")
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  // --- internals ---

  private async remember(id: string, kind?: DocKind) {
    if (this.item?.id === id && (!kind || this.item.kind === kind)) return
    if (!kind) {
      const row = await this.env.DB.prepare("SELECT kind FROM items WHERE id = ?").bind(id).first<{ kind: string }>()
      if (!row || !isDocKind(row.kind)) return
      kind = row.kind
    }
    this.item = { id, kind }
    await this.ctx.storage.put("item", this.item)
  }

  private async itemInfo() {
    this.item ??= (await this.ctx.storage.get<{ id: string; kind: DocKind }>("item")) ?? null
    return this.item
  }

  private socketUser(socketId: string): string | null {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null
      if (a?.id === socketId) return a.userId
    }
    return null
  }

  private async schedule(ms: number) {
    const current = await this.ctx.storage.getAlarm()
    if (current === null || current > Date.now() + ms) await this.ctx.storage.setAlarm(Date.now() + ms)
  }

  /** Write who is here to D1 and tell dashboards, when it changed (or on a heartbeat, to keep rows fresh). */
  private async presenceChanged(closing?: WebSocket, heartbeat = false) {
    const item = await this.itemInfo()
    if (!item) return
    const counts = new Map<string, number>()
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing) continue
      const a = ws.deserializeAttachment() as Attachment | null
      if (a?.userId) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1)
    }
    const key = JSON.stringify([...counts].sort())
    const changed = key !== this.lastPresence
    if (!changed && !heartbeat) return
    this.lastPresence = key

    const db = this.env.DB
    const now = Date.now()
    const stmts = [
      db.prepare("DELETE FROM presence WHERE item_id = ? AND user_id NOT IN (SELECT value FROM json_each(?))").bind(item.id, JSON.stringify([...counts.keys()])),
      ...[...counts].map(([userId, conns]) =>
        db
          .prepare(
            "INSERT INTO presence (item_id, user_id, conns, since, seen_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT (item_id, user_id) DO UPDATE SET conns = ?3, seen_at = ?4",
          )
          .bind(item.id, userId, conns, now),
      ),
    ]
    try {
      await db.batch(stmts)
    } catch {
      // The item was deleted: nothing to report.
      return
    }
    if (!changed) return
    const { results } = await db
      .prepare(
        "SELECT p.user_id AS id, p.conns, p.since, u.email, u.name, u.picture FROM presence p LEFT JOIN users u ON u.id = p.user_id WHERE p.item_id = ? AND p.seen_at > ? ORDER BY p.since",
      )
      .bind(item.id, now - PRESENCE_TTL)
      .all<Editor>()
    const editors = results.map((e) => ({ ...e, email: e.email ?? "" }))
    await notifyUsers(this.env, await audience(db, item.id), { type: "presence", itemId: item.id, editors })
  }

  /** Record who changed the document, refresh its preview, and tell dashboards. */
  private async save() {
    const item = await this.itemInfo()
    if (!item) return
    const users = [...this.editedBy]
    this.editedBy.clear()
    await this.ctx.storage.delete("editedBy")
    const db = this.env.DB
    const now = Date.now()
    const last = users[users.length - 1]!
    const stmts = [
      db.prepare("UPDATE items SET updated_at = ?, updated_by = ?, preview = ? WHERE id = ?").bind(now, last, JSON.stringify(this.preview(item.kind)), item.id),
    ]
    for (const u of users) {
      const recent = await db
        .prepare("SELECT 1 FROM activity WHERE item_id = ? AND actor_id = ? AND action = 'edited' AND at > ?")
        .bind(item.id, u, now - ACTIVITY_WINDOW)
        .first()
      if (!recent) stmts.push(logActivity(db, item.id, u, "edited"))
    }
    try {
      await db.batch(stmts)
    } catch {
      return
    }
    await notifyChanged(this.env, [item.id])
  }

  private async writePreview() {
    const item = await this.itemInfo()
    if (!item) return
    await this.env.DB.prepare("UPDATE items SET preview = ? WHERE id = ?").bind(JSON.stringify(this.preview(item.kind)), item.id).run()
  }

  private preview(kind: DocKind): Preview {
    const doc = this.room.doc
    if (kind === "sheet") {
      const files = doc.getMap<Y.Text>("files")
      const main = files.get("main")?.toString() ?? ""
      const csv = [...files].find(([name]) => name !== "main")?.[1].toString()
      return {
        title: main.match(/workbook\(\s*["'`]([^"'`]*)/)?.[1],
        rows: csv
          ? csv
              .split(/\r?\n/)
              .filter(Boolean)
              .slice(0, 8)
              .map((line) => line.split(",").slice(0, 6).map((c) => c.replace(/^"|"$/g, "").slice(0, 24)))
          : undefined,
        text: csv ? undefined : main.slice(0, 400),
      }
    }
    const source = doc.getText("source").toString()
    if (kind === "deck") {
      return {
        title: source.match(/<Deck[^>]*\btitle="([^"]*)"/)?.[1],
        slides: [...source.matchAll(/<Title[^>]*>([^<{]*)<\/Title>/g)].map((m) => m[1]!.trim()).filter(Boolean).slice(0, 12),
      }
    }
    if (kind === "diagram") {
      return { title: source.match(/\btitle:\s*["'`]([^"'`]*)/)?.[1], text: source.slice(0, 600) }
    }
    // word2 markdown: title from the front matter, then the body as plain text.
    const fm = source.match(/^---\n([\s\S]*?)\n---\n?/)
    const title = fm?.[1]?.match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1]
    const body = (fm ? source.slice(fm[0].length) : source)
      .replace(/\{[~=+-]{2}.*?[~=+-]{2}\}|\{>>.*?<<\}/g, "") // CriticMarkup
      .replace(/^:::.*$|^::\w+.*$/gm, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\^\[[^\]]*\]|\[@[^\]]*\]|\{[#.][^}]*\}/g, "")
      .replace(/[*_`>|]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    return { title, text: body.slice(0, 600) }
  }
}
