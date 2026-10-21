import { create } from "zustand"
import { getDrive, type Editor, type Item, type Me } from "@alexandernygard/drive"
import { toast } from "@alexandernygard/components"

export const drive = getDrive()

export type Layout = "grid" | "list"
type Account = { status: "loading" } | { status: "signed-out" } | { status: "error"; message: string } | { status: "signed-in"; me: Me }

interface State {
  account: Account
  /** Live presence from the feed, newer than what listings carry. */
  presence: Record<string, Editor[]>
  /** Bumped when the feed says something changed; listings refetch. */
  changed: number
  live: boolean
  layout: Layout
  /** The item shown in the details panel. */
  selected: Item | null
  detailsOpen: boolean
  shareId: string | null
  renaming: Item | null
  moving: Item | null
  /** Parent of the folder being created (null = My files); undefined when the dialog is closed. */
  newFolderIn: string | null | undefined
  searchOpen: boolean
  set(patch: Partial<State>): void
}

const LAYOUT_KEY = "drive.layout"
const loadLayout = (): Layout => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid"
  } catch {
    return "grid"
  }
}

export const useDrive = create<State>()((set) => ({
  account: { status: "loading" },
  presence: {},
  changed: 0,
  live: false,
  layout: loadLayout(),
  selected: null,
  detailsOpen: false,
  shareId: new URLSearchParams(location.search).get("share"),
  renaming: null,
  moving: null,
  newFolderIn: undefined,
  searchOpen: false,
  set: (patch) => {
    if (patch.layout) {
      try {
        localStorage.setItem(LAYOUT_KEY, patch.layout)
      } catch {}
    }
    set(patch)
  },
}))

/** Who is in a document right now: the feed's latest word, else what the listing said. */
export function editorsOf(item: Item, presence: Record<string, Editor[]>, meId?: string): Editor[] {
  const list = presence[item.id] ?? item.editors
  return meId ? list.filter((e) => e.id !== meId) : list
}

let stopLive: (() => void) | null = null

export async function signIn() {
  try {
    const me = await drive.me()
    useDrive.setState({ account: { status: "signed-in", me } })
    stopLive?.()
    let timer: ReturnType<typeof setTimeout> | undefined
    stopLive = drive.live(
      (e) => {
        if (e.type === "presence") useDrive.setState((s) => ({ presence: { ...s.presence, [e.itemId]: e.editors } }))
        else if (e.type === "changed") {
          // Several changes in a burst become one refetch.
          clearTimeout(timer)
          timer = setTimeout(() => useDrive.setState((s) => ({ changed: s.changed + 1 })), 250)
        } else if (e.type === "shared") {
          useDrive.setState((s) => ({ changed: s.changed + 1 }))
          toast(`${e.by.name || e.by.email} shared “${e.name}” with you`, {
            description: e.role === "editor" ? "You can edit it." : "You can view it.",
            action: { label: "Open", onClick: () => window.open(drive.openUrl({ id: e.itemId, kind: e.kind }), e.kind === "folder" ? "_self" : "_blank") },
          })
        }
      },
      (live) => {
        useDrive.setState({ live })
        // Reconnected after a gap: catch up on anything missed.
        if (live) useDrive.setState((s) => ({ changed: s.changed + 1, presence: {} }))
      },
    )
  } catch (e) {
    const err = e as { signedOut?: boolean; message?: string }
    useDrive.setState({ account: err.signedOut ? { status: "signed-out" } : { status: "error", message: err.message ?? String(e) } })
  }
}
