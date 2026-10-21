import { useCallback, useEffect, useRef, useState } from "react"
import type { Activity, Item, Listing, View } from "@alexandernygard/drive"
import { drive, useDrive } from "./store"

type Load<T> = { data: T | null; error: string | null; loading: boolean; reload(): void; patch(fn: (d: T) => T): void }

/** Fetch something, and fetch it again whenever the live feed says anything changed. */
function useLive<T>(key: string, fetcher: () => Promise<T>): Load<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const changed = useDrive((s) => s.changed)
  const [nonce, setNonce] = useState(0)
  const keyRef = useRef(key)

  useEffect(() => {
    let cancelled = false
    // A new key shows the loading state; refetches of the same key keep the old data on screen.
    if (keyRef.current !== key) {
      keyRef.current = key
      setData(null)
    }
    setLoading(true)
    fetcher()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
      })
      .catch((e) => !cancelled && setError(e?.message ?? String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, changed, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const patch = useCallback((fn: (d: T) => T) => setData((d) => (d ? fn(d) : d)), [])
  return { data, error, loading, reload, patch }
}

export function useListing(view: View, opts: { parent?: string | null; q?: string } = {}) {
  return useLive<Listing>(`${view}|${opts.parent ?? ""}|${opts.q ?? ""}`, () => drive.list(view, opts))
}

export function useActivity(itemId?: string) {
  return useLive<Activity[]>(`activity|${itemId ?? ""}`, () => drive.activity(itemId))
}

/** Replace one item in a listing (after a star, rename or share) without a refetch. */
export const withItem = (item: Item) => (l: Listing): Listing => ({
  ...l,
  items: l.items.map((i) => (i.id === item.id ? item : i)),
  folder: l.folder?.id === item.id ? item : l.folder,
})
