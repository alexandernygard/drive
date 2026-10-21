import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@alexandernygard/components"
import { APPS, isDocKind, type Item } from "@alexandernygard/drive"
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderInputIcon,
  InfoIcon,
  LinkIcon,
  LogOutIcon,
  PencilIcon,
  RotateCcwIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { copy, destroy, download, leave, openItem, restore, toggleStar, trash } from "../lib/actions"
import { drive, useDrive } from "../lib/store"

type Action = { label: string; icon: LucideIcon; run(): void; danger?: boolean } | "separator"

function actionsFor(item: Item): Action[] {
  const set = useDrive.getState().set
  const me = useDrive.getState().account
  const myEmail = me.status === "signed-in" ? me.me.email.toLowerCase() : ""
  const edit = item.role === "owner" || item.role === "editor"

  if (item.trashedAt) {
    return [
      ...(edit ? [{ label: "Restore", icon: RotateCcwIcon, run: () => void restore(item) }] : []),
      ...(item.role === "owner" ? ["separator" as const, { label: "Delete forever", icon: Trash2Icon, danger: true, run: () => void destroy(item) }] : []),
    ]
  }
  const open: Action =
    item.kind === "folder"
      ? { label: "Open", icon: ExternalLinkIcon, run: () => openItem(item) }
      : { label: isDocKind(item.kind) ? `Open in ${APPS[item.kind].label}` : "Open", icon: ExternalLinkIcon, run: () => openItem(item) }
  const directShare = item.sharedWith.some((s) => s.email === myEmail)
  return [
    open,
    "separator",
    { label: "Share", icon: UserPlusIcon, run: () => set({ shareId: item.id }) },
    {
      label: "Copy link",
      icon: LinkIcon,
      run: () =>
        navigator.clipboard.writeText(drive.openUrl(item)).then(
          () => toast.success("Link copied", { description: item.linkRole ? "Anyone signed in with the link can open it." : "Only people with access can open it." }),
          () => toast.error("Couldn't copy the link."),
        ),
    },
    "separator",
    ...(edit ? [{ label: "Rename", icon: PencilIcon, run: () => set({ renaming: item }) }, { label: "Move to…", icon: FolderInputIcon, run: () => set({ moving: item }) }] : []),
    ...(item.kind !== "folder" ? [{ label: "Make a copy", icon: CopyIcon, run: () => void copy(item) }] : []),
    ...(item.kind !== "folder" ? [{ label: "Download", icon: DownloadIcon, run: () => download(item) }] : []),
    { label: item.starred ? "Remove star" : "Add star", icon: item.starred ? StarOffIcon : StarIcon, run: () => void toggleStar(item) },
    { label: "Details", icon: InfoIcon, run: () => set({ selected: item, detailsOpen: true }) },
    ...(item.role !== "owner" && directShare ? ["separator" as const, { label: "Remove from Shared with me", icon: LogOutIcon, run: () => void leave(item, myEmail) }] : []),
    ...(edit ? ["separator" as const, { label: "Move to trash", icon: Trash2Icon, danger: true, run: () => void trash(item) }] : []),
  ]
}

function trimSeparators(actions: Action[]) {
  return actions.filter((a, i, all) => a !== "separator" || (i > 0 && i < all.length - 1 && all[i - 1] !== "separator"))
}

export function ItemDropdown({ item, children, align = "end" }: { item: Item; children: ReactNode; align?: "start" | "end" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56" onClick={(e) => e.stopPropagation()}>
        {trimSeparators(actionsFor(item)).map((a, i) =>
          a === "separator" ? (
            <DropdownMenuSeparator key={i} />
          ) : (
            <DropdownMenuItem key={a.label} onSelect={a.run} variant={a.danger ? "destructive" : "default"}>
              <a.icon /> {a.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ItemContextMenu({ item, children }: { item: Item; children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {trimSeparators(actionsFor(item)).map((a, i) =>
          a === "separator" ? (
            <ContextMenuSeparator key={i} />
          ) : (
            <ContextMenuItem key={a.label} onSelect={a.run} variant={a.danger ? "destructive" : "default"}>
              <a.icon /> {a.label}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
