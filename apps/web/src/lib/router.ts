import { useSyncExternalStore } from "react"

export type Route =
  | { name: "home" }
  | { name: "files" }
  | { name: "folder"; id: string }
  | { name: "shared" }
  | { name: "sharing" }
  | { name: "starred" }
  | { name: "recent" }
  | { name: "trash" }
  | { name: "search"; q: string }

export function parse(path: string, search = ""): Route {
  const folder = path.match(/^\/folders\/([^/]+)/)
  if (folder) return { name: "folder", id: decodeURIComponent(folder[1]!) }
  switch (path.replace(/\/$/, "")) {
    case "/files":
      return { name: "files" }
    case "/shared":
      return { name: "shared" }
    case "/sharing":
      return { name: "sharing" }
    case "/starred":
      return { name: "starred" }
    case "/recent":
      return { name: "recent" }
    case "/trash":
      return { name: "trash" }
    case "/search":
      return { name: "search", q: new URLSearchParams(search).get("q") ?? "" }
    default:
      return { name: "home" }
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case "home":
      return "/"
    case "folder":
      return `/folders/${encodeURIComponent(route.id)}`
    case "search":
      return `/search?q=${encodeURIComponent(route.q)}`
    default:
      return `/${route.name}`
  }
}

const listeners = new Set<() => void>()
let current = typeof location !== "undefined" ? location.pathname + location.search : "/"
const notify = () => {
  current = location.pathname + location.search
  for (const l of listeners) l()
}
if (typeof window !== "undefined") window.addEventListener("popstate", notify)

export function navigate(to: string | Route, opts: { replace?: boolean } = {}) {
  const href = typeof to === "string" ? to : hrefFor(to)
  if (href === location.pathname + location.search) return
  history[opts.replace ? "replaceState" : "pushState"](null, "", href)
  notify()
}

let cached: { key: string; route: Route } | null = null
export function useRoute(): Route {
  const key = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => current,
  )
  if (cached?.key !== key) cached = { key, route: parse(location.pathname, location.search) }
  return cached.route
}

/** Links that navigate in place, and still open in a new tab with ⌘/Ctrl-click. */
export function linkProps(to: Route | string) {
  const href = typeof to === "string" ? to : hrefFor(to)
  return {
    href,
    onClick: (e: React.MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      navigate(href)
    },
  }
}
