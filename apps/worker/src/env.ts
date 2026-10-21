import type { DriveRoom } from "./room"
import type { UserFeed } from "./feed"

export interface Env {
  DB: D1Database
  FILES: R2Bucket
  ROOMS: DurableObjectNamespace<DriveRoom>
  FEEDS: DurableObjectNamespace<UserFeed>
  ASSETS: Fetcher
  /** https://auth.nyggis.com, or http://localhost:8787 in dev. */
  AUTH_ORIGIN: string
  /** Comma-separated origins (the apps, and the dashboard in dev) allowed to call the API and open rooms. */
  APP_ORIGINS: string
  TICKET_SECRET: string
}

/** Header the Worker sets when it forwards a socket to a room, so the room knows which item it is. */
export const HEADER_ITEM = "x-drive-item"

/** Presence rows older than this are from a room that went away without saying so. */
export const PRESENCE_TTL = 3 * 60_000
