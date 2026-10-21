/** Documents that open in one of the office apps. */
export type DocKind = "doc" | "sheet" | "deck"
/** Everything the drive holds: folders, app documents and uploaded files. */
export type Kind = "folder" | DocKind | "file"

export type ShareRole = "viewer" | "editor"
/** What the signed-in person may do with an item. */
export type Role = "owner" | ShareRole

export interface Person {
  id: string
  email: string
  name: string | null
  picture: string | null
}

/** Someone with the document open right now. */
export interface Editor extends Person {
  /** Open tabs. */
  conns: number
  since: number
}

/** Small excerpt of a document's content, kept up to date by its room. */
export interface Preview {
  /** Document title, if the format has one. */
  title?: string
  /** Plain text from the start of the document. */
  text?: string
  /** First rows of a sheet's table or data file. */
  rows?: string[][]
  /** Slide titles. */
  slides?: string[]
}

export interface Item {
  id: string
  kind: Kind
  name: string
  parentId: string | null
  owner: Person
  createdBy: string
  createdAt: number
  updatedAt: number
  updatedBy: Person | null
  /** The viewer's access. */
  role: Role
  starred: boolean
  /** People it is shared with directly (not inherited from a folder). */
  sharedWith: (Share & { person: Person | null })[]
  /** Anyone signed in with the link: off, or the role they get. */
  linkRole: ShareRole | null
  /** For items shared with the viewer: who shared it, and when. */
  sharedBy: Person | null
  sharedAt: number | null
  /** The viewer's access comes through a folder rather than a share on the item itself. */
  inherited: boolean
  /** A folder above it is shared, so people beyond `sharedWith` can open it too. */
  sharedViaFolder: boolean
  mime: string | null
  size: number | null
  thumbAt: number | null
  preview: Preview | null
  openedAt: number | null
  trashedAt: number | null
  editors: Editor[]
}

export interface Share {
  email: string
  role: ShareRole
  sharedBy: string
  createdAt: number
}

export interface Crumb {
  id: string | null
  name: string
}

export type View = "home" | "mine" | "shared" | "sharing" | "starred" | "recent" | "trash" | "search"

export interface Listing {
  items: Item[]
  /** The folder being listed, when browsing one. */
  folder: Item | null
  /** From "My files" (or "Shared with me") down to the folder. */
  path: Crumb[]
}

export interface Activity {
  id: number
  itemId: string
  itemName: string
  itemKind: Kind
  actor: Person | null
  action: "created" | "edited" | "renamed" | "moved" | "shared" | "unshared" | "trashed" | "restored" | "uploaded" | "link"
  detail: string | null
  at: number
}

export interface Me extends Person {
  usage: { items: number; bytes: number }
}

/** Opening a document in an app. */
export interface Ticket {
  item: Item
  /** WebSocket URL of the document's room; send `ticket` as `?ticket=` (CollabProvider's getTicket does). */
  url: string
  ticket: string
  readOnly: boolean
}

/** Pushed to open dashboards over /api/live. */
export type FeedEvent =
  | { type: "presence"; itemId: string; editors: Editor[] }
  | { type: "changed"; itemIds: string[] }
  | { type: "shared"; itemId: string; name: string; kind: Kind; by: Person; role: ShareRole }

/** Initial content for a new document, e.g. when an app saves a local file to the drive. */
export interface Content {
  /** The document's source text (word2 markdown, ppt2 TSX). */
  text?: string
  /** Named text files (xl2: "main" is the workbook code, the rest are CSV). */
  files?: Record<string, string>
}
