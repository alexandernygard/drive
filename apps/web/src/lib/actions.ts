import { toast } from "@alexandernygard/components"
import { APPS, DriveError, isDocKind, type DocKind, type Item } from "@alexandernygard/drive"
import { navigate } from "./router"
import { drive, useDrive } from "./store"

const message = (e: unknown) => (e instanceof DriveError ? e.message : "Something went wrong. Try again.")

/** Documents open in their app in a new tab, folders open here, uploads open in a new tab. */
export function openItem(item: Pick<Item, "id" | "kind">) {
  if (item.kind === "folder") return navigate({ name: "folder", id: item.id })
  window.open(drive.openUrl(item), "_blank", "noopener")
}

const UNTITLED: Record<DocKind, string> = { doc: "Untitled document", sheet: "Untitled spreadsheet", deck: "Untitled presentation", diagram: "Untitled diagram", board: "Untitled board" }

/**
 * Create a document and open it in its app. The tab is opened during the click, before the request,
 * so popup blockers allow it; it is pointed at the app once the document exists.
 */
export async function createDocument(kind: DocKind, parentId: string | null) {
  const tab = window.open("about:blank", "_blank")
  try {
    const item = await drive.create({ kind, name: UNTITLED[kind], parentId })
    if (tab) tab.location.href = drive.openUrl(item)
    else window.location.href = drive.openUrl(item)
    useDrive.setState((s) => ({ changed: s.changed + 1 }))
    toast.success(`Created ${UNTITLED[kind].toLowerCase()}`, { description: `Opened in ${APPS[kind].label}.` })
  } catch (e) {
    tab?.close()
    toast.error(message(e))
  }
}

export async function createFolder(name: string, parentId: string | null) {
  try {
    const folder = await drive.create({ kind: "folder", name, parentId })
    useDrive.setState((s) => ({ changed: s.changed + 1 }))
    return folder
  } catch (e) {
    toast.error(message(e))
    return null
  }
}

export async function uploadFiles(files: FileList | File[], parentId: string | null) {
  const list = [...files]
  if (list.length === 0) return
  const id = toast.loading(list.length === 1 ? `Uploading ${list[0]!.name}` : `Uploading ${list.length} files`)
  let ok = 0
  for (const f of list) {
    try {
      await drive.upload(f, parentId)
      ok++
    } catch (e) {
      toast.error(`${f.name}: ${message(e)}`)
    }
  }
  toast.dismiss(id)
  if (ok) toast.success(ok === 1 ? `Uploaded ${list.length === 1 ? list[0]!.name : "1 file"}` : `Uploaded ${ok} files`)
  useDrive.setState((s) => ({ changed: s.changed + 1 }))
}

async function run<T>(fn: () => Promise<T>, done?: string): Promise<T | null> {
  try {
    const r = await fn()
    if (done) toast.success(done)
    useDrive.setState((s) => ({ changed: s.changed + 1 }))
    return r
  } catch (e) {
    toast.error(message(e))
    return null
  }
}

export const toggleStar = (item: Item) => run(() => drive.update(item.id, { starred: !item.starred }))
export const rename = (item: Item, name: string) => run(() => drive.update(item.id, { name }))
export const move = (item: Pick<Item, "id" | "name">, parentId: string | null, where: string) => run(() => drive.update(item.id, { parentId }), `Moved “${item.name}” to ${where}`)
export const copy = (item: Item) => run(() => drive.copy(item.id), `Made a copy of “${item.name}”`)

export async function trash(item: Item) {
  const r = await run(() => drive.trash(item.id))
  if (r === null) return
  useDrive.setState((s) => (s.selected?.id === item.id ? { selected: null } : {}))
  toast(`Moved “${item.name}” to the trash`, { action: { label: "Undo", onClick: () => void restore(item, true) } })
}

export const restore = (item: Item, quiet = false) => run(() => drive.restore(item.id), quiet ? undefined : `Restored “${item.name}”`)
export const destroy = (item: Item) => run(() => drive.destroy(item.id), `Deleted “${item.name}” forever`)
export const emptyTrash = () => run(() => drive.emptyTrash(), "Emptied the trash")

/** Leave something shared with you (removes your own access). */
export async function leave(item: Item, email: string) {
  await run(() => drive.unshare(item.id, email), `Removed “${item.name}” from Shared with me`)
}

export function download(item: Item) {
  const a = document.createElement("a")
  a.href = drive.contentUrl(item.id, true)
  a.rel = "noopener"
  a.click()
}

export const canOpenInApp = (item: Item) => isDocKind(item.kind)
