import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@alexandernygard/components"
import { GlobeIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { getDrive, type DriveClient } from "../client.js"
import type { Item } from "../types.js"
import { AvatarStack } from "./avatars.js"
import { DriveLogo } from "./icons.js"
import { ShareDialog } from "./share-dialog.js"

type Who = { id?: string; name: string | null; email?: string; picture?: string | null }

/**
 * For an app's header while a drive document is open: a link back to its folder in the drive, who else
 * is here, and Share (the drive's share dialog, in place).
 */
export function DriveFileButton({
  fileId,
  item,
  peers = [],
  onItemChange,
  drive = getDrive(),
}: {
  fileId: string
  item?: Item | null
  /** Other people in the document right now. */
  peers?: Who[]
  onItemChange?(item: Item): void
  drive?: DriveClient
}) {
  const [open, setOpen] = useState(false)
  const folder = item?.parentId && item.role === "owner" ? `/folders/${item.parentId}` : item?.role === "owner" ? "/files" : "/shared"
  const shared = !!item && (item.sharedWith.length > 0 || !!item.linkRole || item.role !== "owner")
  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={drive.webUrl(folder)} target="_blank" rel="noopener" aria-label="Open in Drive">
              <DriveLogo size={18} />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Show in Drive</TooltipContent>
      </Tooltip>
      <AvatarStack people={peers} size={24} max={3} live label={(p) => `${p.name || p.email || "Someone"} is here`} />
      <Button variant={shared ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
        {item?.linkRole ? <GlobeIcon /> : <UsersIcon />}
        Share
      </Button>
      <ShareDialog itemId={fileId} initial={item} open={open} onOpenChange={setOpen} onChange={onItemChange} drive={drive} />
    </div>
  )
}
