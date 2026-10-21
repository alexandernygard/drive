import { DurableObject } from "cloudflare:workers"
import type { FeedEvent } from "@alexandernygard/drive/core"
import { audience } from "./db"
import type { Env } from "./env"

/**
 * One per user (`idFromName(userId)`): the open dashboards of that person. Rooms and API routes push
 * events here; with no dashboard open a push is a no-op. Hibernates between pushes.
 */
export class UserFeed extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 })
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  push(event: FeedEvent): void {
    const data = JSON.stringify(event)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data)
      } catch {
        // closing
      }
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code === 1005 || code === 1006 ? 1000 : code, reason)
  }
}

export async function notifyUsers(env: Env, userIds: Iterable<string>, event: FeedEvent): Promise<void> {
  await Promise.allSettled([...new Set(userIds)].map((u) => env.FEEDS.get(env.FEEDS.idFromName(u)).push(event)))
}

/** Tell everyone who can see these items that they changed (their dashboards refetch). */
export async function notifyChanged(env: Env, itemIds: string[]): Promise<void> {
  const users = new Set<string>()
  for (const id of new Set(itemIds)) for (const u of await audience(env.DB, id)) users.add(u)
  await notifyUsers(env, users, { type: "changed", itemIds })
}
