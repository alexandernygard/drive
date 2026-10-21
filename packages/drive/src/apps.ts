import type { DocKind, Kind } from "./types.js"

export interface AppInfo {
  kind: DocKind
  /** App id at auth.nyggis.com, and its name. */
  app: "word2" | "xl2" | "ppt2"
  label: string
  /** "New …" menu entries and empty states. */
  noun: string
  origin: string
  devOrigin: string
  /** Accent for icons and covers. */
  color: string
  /** How the Y.Doc holds the content: one text named "source", or a map of texts named "files". */
  layout: "text" | "files"
}

export const APPS: Record<DocKind, AppInfo> = {
  doc: {
    kind: "doc",
    app: "word2",
    label: "word2",
    noun: "Document",
    origin: "https://word2.nyggis.com",
    devOrigin: "http://localhost:5273",
    color: "#3b6fd8",
    layout: "text",
  },
  sheet: {
    kind: "sheet",
    app: "xl2",
    label: "xl2",
    noun: "Spreadsheet",
    origin: "https://xl2.nyggis.com",
    devOrigin: "http://localhost:5199",
    color: "#1f9a5b",
    layout: "files",
  },
  deck: {
    kind: "deck",
    app: "ppt2",
    label: "ppt2",
    noun: "Presentation",
    origin: "https://ppt2.nyggis.com",
    devOrigin: "http://localhost:5291",
    color: "#e0662f",
    layout: "text",
  },
}

export const DOC_KINDS: DocKind[] = ["doc", "sheet", "deck"]

export const KIND_COLORS: Record<Kind, string> = {
  folder: "#f2a922",
  doc: APPS.doc.color,
  sheet: APPS.sheet.color,
  deck: APPS.deck.color,
  file: "#7a8794",
}

export const KIND_LABELS: Record<Kind, string> = {
  folder: "Folder",
  doc: "Document",
  sheet: "Spreadsheet",
  deck: "Presentation",
  file: "File",
}

export const isDocKind = (kind: string): kind is DocKind => kind === "doc" || kind === "sheet" || kind === "deck"

export interface Origins {
  /** The drive's API and rooms. */
  api: string
  /** The dashboard. */
  web: string
  /** auth.nyggis.com. */
  auth: string
  /** Each app's origin. */
  apps: Record<DocKind, string>
}

/** Production origins, or the local dev ports when the page is served from localhost. */
export function defaultOrigins(hostname = (globalThis as { location?: { hostname: string } }).location?.hostname ?? ""): Origins {
  const local = hostname === "localhost" || hostname === "127.0.0.1"
  return local
    ? {
        api: "http://localhost:8790",
        web: "http://localhost:5310",
        auth: "http://localhost:8787",
        apps: { doc: APPS.doc.devOrigin, sheet: APPS.sheet.devOrigin, deck: APPS.deck.devOrigin },
      }
    : {
        api: "https://drive.nyggis.com",
        web: "https://drive.nyggis.com",
        auth: "https://auth.nyggis.com",
        apps: { doc: APPS.doc.origin, sheet: APPS.sheet.origin, deck: APPS.deck.origin },
      }
}
