import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@alexandernygard/components"
import { APPS, DOC_KINDS, displayName, formatBytes, type Me } from "@alexandernygard/drive"
import { DriveLogo, KindIcon, PersonAvatar } from "@alexandernygard/drive/react"
import {
  ClockIcon,
  FolderPlusIcon,
  HardDriveIcon,
  HouseIcon,
  LogOutIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  StarIcon,
  SunIcon,
  Trash2Icon,
  UploadIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { createDocument, uploadFiles } from "../lib/actions"
import { linkProps, type Route } from "../lib/router"
import { drive, useDrive } from "../lib/store"

const NAV: { route: Route; label: string; icon: LucideIcon }[] = [
  { route: { name: "home" }, label: "Home", icon: HouseIcon },
  { route: { name: "files" }, label: "My files", icon: HardDriveIcon },
  { route: { name: "shared" }, label: "Shared with me", icon: UsersIcon },
  { route: { name: "sharing" }, label: "Shared by me", icon: Share2Icon },
  { route: { name: "recent" }, label: "Recent", icon: ClockIcon },
  { route: { name: "starred" }, label: "Starred", icon: StarIcon },
  { route: { name: "trash" }, label: "Trash", icon: Trash2Icon },
]

/** Where "New" puts things: the open folder if you may add to it, else My files. */
export interface Place {
  parentId: string | null
  canAdd: boolean
}

export function NewMenu({ place, children }: { place: Place; children: ReactNode }) {
  const set = useDrive((s) => s.set)
  const fileRef = useRef<HTMLInputElement>(null)
  const parentId = place.canAdd ? place.parentId : null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {DOC_KINDS.map((k) => (
            <DropdownMenuItem key={k} onSelect={() => void createDocument(k, parentId)} className="gap-3 py-2">
              <KindIcon kind={k} size={26} />
              <span className="flex-1">
                <span className="block font-medium">{APPS[k].noun}</span>
                <span className="block text-xs text-muted-foreground">Opens in {APPS[k].label}</span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => set({ newFolderIn: parentId })}>
            <FolderPlusIcon /> New folder
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
            <UploadIcon /> Upload files
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void uploadFiles(e.target.files, parentId)
          e.target.value = ""
        }}
      />
    </>
  )
}

export function Shell({ route, place, me, children, aside }: { route: Route; place: Place; me: Me; children: ReactNode; aside?: ReactNode }) {
  const set = useDrive((s) => s.set)
  const live = useDrive((s) => s.live)
  const [dropping, setDropping] = useState(false)
  const active = (r: Route) => r.name === route.name || (r.name === "files" && route.name === "folder")

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="gap-4 px-3 pt-4">
          <a {...linkProps({ name: "home" })} className="flex items-center gap-2.5 px-1.5">
            <DriveLogo size={28} />
            <span className="text-[17px] font-semibold tracking-tight">Drive</span>
          </a>
          <NewMenu place={place}>
            <Button size="lg" className="w-full justify-start gap-2.5 rounded-xl shadow-sm">
              <PlusIcon /> New
            </Button>
          </NewMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((n) => (
                  <SidebarMenuItem key={n.label}>
                    <SidebarMenuButton asChild isActive={active(n.route)}>
                      <a {...linkProps(n.route)}>
                        <n.icon />
                        <span>{n.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Apps</p>
            <SidebarMenu>
              {DOC_KINDS.map((k) => (
                <SidebarMenuItem key={k}>
                  <SidebarMenuButton asChild size="sm">
                    <a href={drive.origins.apps[k]} target="_blank" rel="noopener">
                      <KindIcon kind={k} size={18} />
                      <span>{APPS[k].label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            {me.usage.items} {me.usage.items === 1 ? "file" : "files"}
            {me.usage.bytes > 0 && `, ${formatBytes(me.usage.bytes)} uploaded`}
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset
        className="min-w-0"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files") || !place.canAdd) return
          e.preventDefault()
          setDropping(true)
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDropping(false)
          void uploadFiles(e.dataTransfer.files, place.parentId)
        }}
      >
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 bg-background/85 px-3 backdrop-blur md:px-5">
          <SidebarTrigger className="md:hidden" />
          <button
            onClick={() => set({ searchOpen: true })}
            className="flex h-9 w-full max-w-xl items-center gap-2.5 rounded-xl border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
          >
            <SearchIcon className="size-4" />
            <span className="flex-1 text-left">Search files and folders</span>
            <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`size-2 rounded-full ${live ? "bg-positive" : "bg-muted-foreground/40"}`} aria-label={live ? "Live" : "Reconnecting"} />
              </TooltipTrigger>
              <TooltipContent>{live ? "Live: changes and who's editing update by themselves" : "Reconnecting…"}</TooltipContent>
            </Tooltip>
            <UserMenu me={me} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 px-3 pt-2 pb-16 md:px-8">{children}</main>
          {aside && <div className="sticky top-14 hidden h-[calc(100svh-3.5rem)] xl:block">{aside}</div>}
        </div>
        {dropping && (
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-highlight/10 ring-4 ring-highlight ring-inset">
            <p className="rounded-2xl bg-background px-5 py-3 text-sm font-medium shadow-xl">Drop to upload</p>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}

function UserMenu({ me }: { me: Me }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("drive.theme", next ? "dark" : "light")
    } catch {}
    setDark(next)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account">
          <PersonAvatar person={me} size={32} ring={false} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">{displayName(me)}</p>
          <p className="truncate text-xs text-muted-foreground">{me.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggle}>
          {dark ? <SunIcon /> : <MoonIcon />} {dark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={drive.accountUrl}>
            <UserIcon /> Account
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={drive.logoutUrl()}>
            <LogOutIcon /> Sign out
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
