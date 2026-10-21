import { createMiddleware } from "hono/factory"
import { createAuth, type Auth, type User } from "./auth/auth"
import type { Env } from "./env"

export type AppEnv = { Bindings: Env; Variables: { user: User } }

let nyggis: Auth | null = null
export const authFor = (env: Env) => (nyggis ??= createAuth({ appId: "drive", origin: env.AUTH_ORIGIN }))

/** The dashboard's own origin plus the office apps (and localhost ports in dev). */
export function allowedOrigins(env: Env, request: Request): string[] {
  return [new URL(request.url).origin, ...env.APP_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)]
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export const fail = (status: number, code: string, message?: string): never => {
  throw new HttpError(status, code, message)
}

/**
 * CORS for the apps, which call the API from their own origins with the Nyggis cookie. Writes from any
 * other origin are refused: the cookie is shared by every *.nyggis.com site.
 */
export const cors = createMiddleware<AppEnv>(async (c, next) => {
  const origin = c.req.header("Origin")
  const allowed = !!origin && allowedOrigins(c.env, c.req.raw).includes(origin)
  if (c.req.method === "OPTIONS") {
    if (!allowed) return c.body(null, 403)
    return c.body(null, 204, {
      "Access-Control-Allow-Origin": origin!,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    })
  }
  const write = !["GET", "HEAD"].includes(c.req.method)
  if (write && !allowed) return c.json({ error: "bad_origin" }, 403)
  await next()
  // A WebSocket upgrade's headers are immutable, and CORS doesn't apply to it.
  if (allowed && c.res.status !== 101) {
    c.res.headers.set("Access-Control-Allow-Origin", origin!)
    c.res.headers.set("Access-Control-Allow-Credentials", "true")
    c.res.headers.append("Vary", "Origin")
  }
})

/** Every API route needs a signed-in user. The page itself is static and asks the API who is signed in. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const result = await authFor(c.env).authenticate(c.req.raw)
  const json = (status: number, error: string) => c.json({ error }, status as 401, { "Cache-Control": "no-store" })
  if (result.status === "refresh") return json(401, "token_expired")
  if (result.status === "deny") return json(403, "forbidden")
  if (result.status !== "allow" || !result.user) return json(401, "unauthenticated")
  c.set("user", result.user)
  await next()
  // Routes may choose their own private caching (thumbnails); anything else is never cached.
  if (c.res.status !== 101 && !c.res.headers.get("Cache-Control")?.startsWith("private")) c.res.headers.set("Cache-Control", "private, no-store")
})
