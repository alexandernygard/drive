import { defaultOrigins, isDocKind, type Origins } from "./apps.js"
import { fetchWithRefresh } from "./refresh.js"
import type { Activity, Content, DocKind, FeedEvent, Item, Kind, Listing, Me, Person, ShareRole, Ticket, View } from "./types.js"

export class DriveError extends Error {
  constructor(
    readonly status: number,
    /** `unauthenticated` (sign in), `forbidden`, `not_found`, or a short reason from the server. */
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
  get signedOut() {
    return this.status === 401
  }
}

export interface ListOptions {
  /** Folder to list (views "mine" and "shared"). */
  parent?: string | null
  /** Search text (view "search"). */
  q?: string
}

export interface CreateOptions {
  kind: Exclude<Kind, "file">
  name: string
  parentId?: string | null
  /** Initial content for a document. Defaults to the app's starter template. */
  content?: Content
}

export interface ItemPatch {
  name?: string
  parentId?: string | null
  starred?: boolean
}

export type DriveClient = ReturnType<typeof createDrive>

/**
 * Talks to the drive from any page on *.nyggis.com (or localhost in dev). Requests carry the Nyggis
 * cookie, and an expired token is refreshed once and retried.
 */
export function createDrive(origins: Partial<Origins> = {}) {
  const o: Origins = { ...defaultOrigins(), ...origins }
  const wsBase = o.api.replace(/^http/, "ws")

  async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const { json, ...rest } = init
    const headers = new Headers(rest.headers)
    if (json !== undefined) headers.set("Content-Type", "application/json")
    const res = await fetchWithRefresh(
      `${o.api}/api${path}`,
      { credentials: "include", ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body },
      o.auth,
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
      throw new DriveError(res.status, body?.error ?? `http_${res.status}`, body?.message ?? body?.error)
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  const enc = encodeURIComponent

  const client = {
    origins: o,

    me: () => api<Me>("/me"),
    list(view: View, opts: ListOptions = {}) {
      const q = new URLSearchParams({ view })
      if (opts.parent) q.set("parent", opts.parent)
      if (opts.q) q.set("q", opts.q)
      return api<Listing>(`/items?${q}`)
    },
    item: (id: string) => api<Listing & { item: Item }>(`/items/${enc(id)}`),
    create: (opts: CreateOptions) => api<Item>("/items", { method: "POST", json: opts }),
    /** Upload any file. Office formats stay files; open documents with the apps instead. */
    upload(file: Blob & { name?: string }, parentId?: string | null, name = file.name ?? "Untitled") {
      const q = new URLSearchParams({ name })
      if (parentId) q.set("parent", parentId)
      return api<Item>(`/upload?${q}`, { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } })
    },
    update: (id: string, patch: ItemPatch) => api<Item>(`/items/${enc(id)}`, { method: "PATCH", json: patch }),
    copy: (id: string, parentId?: string | null) => api<Item>(`/items/${enc(id)}/copy`, { method: "POST", json: { parentId } }),
    trash: (id: string) => api<void>(`/items/${enc(id)}/trash`, { method: "POST" }),
    restore: (id: string) => api<void>(`/items/${enc(id)}/restore`, { method: "POST" }),
    /** Delete forever. Owner only. */
    destroy: (id: string) => api<void>(`/items/${enc(id)}`, { method: "DELETE" }),
    emptyTrash: () => api<{ deleted: number }>("/trash", { method: "DELETE" }),

    share: (id: string, email: string, role: ShareRole) => api<Item>(`/items/${enc(id)}/shares`, { method: "PUT", json: { email, role } }),
    unshare: (id: string, email: string) => api<Item>(`/items/${enc(id)}/shares/${enc(email)}`, { method: "DELETE" }),
    setLinkRole: (id: string, role: ShareRole | null) => api<Item>(`/items/${enc(id)}/link`, { method: "PUT", json: { role } }),
    /** People you have shared with or who shared with you, for suggestions. */
    people: () => api<Person[]>("/people"),
    activity: (itemId?: string) => api<Activity[]>(itemId ? `/items/${enc(itemId)}/activity` : "/activity"),

    /** Access to a document's room. Also records the document as recently opened. */
    ticket: (id: string) => api<Ticket>(`/items/${enc(id)}/ticket`, { method: "POST" }),
    /**
     * Options for `new CollabProvider(...)` from @alexandernygard/collab. A fresh ticket is fetched before
     * every (re)connect; `onTicket` sees each one (current name, role and read-only flag). `onDenied` is
     * called when retrying can't help (signed out, no access, deleted): disconnect and tell the user.
     */
    roomOptions(id: string, onTicket?: (t: Ticket) => void, onDenied?: (e: DriveError) => void) {
      return {
        url: `${wsBase}/collab/${enc(id)}`,
        getTicket: async () => {
          try {
            const t = await client.ticket(id)
            onTicket?.(t)
            return t.ticket
          } catch (e) {
            if (e instanceof DriveError && [401, 403, 404].includes(e.status)) onDenied?.(e)
            throw e
          }
        },
      }
    },
    /** Apps call this with a small image (≤ 256 KB) of the document's first page or slide. */
    setThumbnail: (id: string, image: Blob) =>
      api<void>(`/items/${enc(id)}/thumbnail`, { method: "PUT", body: image, headers: { "Content-Type": image.type || "image/png" } }),
    thumbnailUrl: (item: Pick<Item, "id" | "thumbAt">) => (item.thumbAt ? `${o.api}/api/items/${enc(item.id)}/thumbnail?v=${item.thumbAt}` : null),
    /** Download an upload, or a document's source. */
    contentUrl: (id: string, download = false) => `${o.api}/api/items/${enc(id)}/content${download ? "?download=1" : ""}`,

    /** Where an item opens: its app for documents, the dashboard for folders, the file itself for uploads. */
    openUrl(item: Pick<Item, "id" | "kind">): string {
      if (isDocKind(item.kind)) return client.appUrl(item.kind, item.id)
      if (item.kind === "folder") return `${o.web}/folders/${enc(item.id)}`
      return client.contentUrl(item.id)
    },
    appUrl: (kind: DocKind, id: string) => `${o.apps[kind]}/?file=${enc(id)}`,
    /** The dashboard, at a path like "/" or "/shared". */
    webUrl: (path = "/") => `${o.web}${path}`,
    /** The dashboard with the share dialog open for an item. */
    shareUrl: (id: string) => `${o.web}/?share=${enc(id)}`,

    loginUrl: (next = globalThis.location?.href ?? o.web) => `${o.auth}/login?${new URLSearchParams({ next })}`,
    logoutUrl: (next = o.web) => `${o.auth}/logout?${new URLSearchParams({ next })}`,
    accountUrl: `${o.auth}/account/`,

    /**
     * Live events for the signed-in user (presence, changes, new shares). Reconnects with backoff.
     * Returns a function that closes it.
     */
    live(onEvent: (e: FeedEvent) => void, onStatus?: (connected: boolean) => void): () => void {
      let ws: WebSocket | null = null
      let stopped = false
      let attempts = 0
      let timer: ReturnType<typeof setTimeout> | undefined
      let ping: ReturnType<typeof setInterval> | undefined
      const connect = async () => {
        if (stopped) return
        // Refresh an expired token first: a WebSocket cannot read a 401.
        try {
          await client.me()
        } catch (e) {
          if (e instanceof DriveError && e.signedOut) return
        }
        if (stopped) return
        ws = new WebSocket(`${wsBase}/api/live`)
        ws.onopen = () => {
          attempts = 0
          onStatus?.(true)
          ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000)
        }
        ws.onmessage = (m) => {
          if (typeof m.data !== "string" || m.data === "pong") return
          try {
            onEvent(JSON.parse(m.data) as FeedEvent)
          } catch {
            // ignore malformed events
          }
        }
        ws.onclose = () => {
          clearInterval(ping)
          onStatus?.(false)
          if (stopped) return
          timer = setTimeout(connect, Math.min(15_000, 500 * 2 ** attempts++))
        }
      }
      void connect()
      return () => {
        stopped = true
        clearTimeout(timer)
        clearInterval(ping)
        ws?.close()
      }
    },
  }
  return client
}

let shared: DriveClient | null = null
/** The client for this page's environment (production, or localhost ports in dev). */
export function getDrive(): DriveClient {
  return (shared ??= createDrive())
}

/** What to tell someone whose room ticket was refused. */
export function deniedMessage(e: DriveError): string {
  if (e.status === 401) return "Sign in to open this file."
  if (e.code === "trashed") return "This file is in the trash."
  return "This file doesn't exist, or it isn't shared with you."
}

/** `?file=<id>` in the current URL: the drive document this app was opened for. */
export function fileFromUrl(search = globalThis.location?.search ?? ""): string | null {
  return new URLSearchParams(search).get("file")
}
