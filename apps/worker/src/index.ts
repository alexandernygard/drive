import { Hono } from "hono"
import { createCollabHandler, verifyTicket } from "@alexandernygard/collab/cloudflare"
import { authFor, allowedOrigins, HttpError, type AppEnv } from "./http"
import { api, emptyOldTrash, forgetUser } from "./routes"
import { HEADER_ITEM, type Env } from "./env"

export { DriveRoom } from "./room"
export { UserFeed } from "./feed"

// Document rooms. Apps get a ticket from POST /api/items/:id/ticket (which checks the share) and open
// /collab/<id>?ticket=…; the ticket says who they are and whether they may write.
let collab: ReturnType<typeof createCollabHandler<Env>> | null = null
const collabFor = (env: Env, request: Request) =>
  (collab ??= createCollabHandler<Env>({
    rooms: (e) => e.ROOMS as unknown as DurableObjectNamespace,
    allowedOrigins: allowedOrigins(env, request),
    authorize: async (req, e, docId) => {
      const ticket = new URL(req.url).searchParams.get("ticket")
      const t = ticket ? await verifyTicket(e.TICKET_SECRET, ticket, docId) : null
      return t ? { userId: t.sub, readOnly: !!t.ro } : null
    },
  }))

const app = new Hono<AppEnv>()

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.code, message: err.message }, err.status as 400)
  console.error(err)
  return c.json({ error: "server_error" }, 500)
})

// Above everything else: the auth service signs these, and they come from no browser.
app.post("/auth-events", async (c) => {
  let event
  try {
    event = await authFor(c.env).verifyEvent(c.req.raw)
  } catch {
    return c.text("bad event", 400)
  }
  if (event.type === "user.deleted") await forgetUser(c.env, event.userId)
  return c.text("ok")
})

app.all("/collab/*", async (c) => {
  const id = decodeURIComponent(new URL(c.req.url).pathname.slice("/collab/".length))
  const headers = new Headers(c.req.raw.headers)
  headers.set(HEADER_ITEM, id)
  const res = await collabFor(c.env, c.req.raw)(new Request(c.req.raw, { headers }), c.env)
  return res ?? c.notFound()
})

app.route("/api", api)

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(emptyOldTrash(env))
  },
} satisfies ExportedHandler<Env>
