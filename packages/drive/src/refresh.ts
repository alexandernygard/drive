/**
 * Browser helper for Nyggis accounts, from auth.nyggis.com's client/browser.ts.
 *
 * Access tokens last 10 minutes. When an API call returns 401 token_expired, this refreshes the
 * session once (POST to the auth service, which sets fresh cookies) and retries the request.
 */
let refreshing: Promise<boolean> | null = null

function refresh(origin: string): Promise<boolean> {
  refreshing ??= fetch(`${origin}/refresh`, { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => (refreshing = null))
  return refreshing
}

export async function fetchWithRefresh(input: RequestInfo | URL, init: RequestInit | undefined, origin: string): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status !== 401) return res
  const body = (await res.clone().json().catch(() => null)) as { error?: string } | null
  if (body?.error !== "token_expired") return res
  return (await refresh(origin)) ? fetch(input, init) : res
}
