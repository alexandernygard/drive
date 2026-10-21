import { useEffect, useState } from "react"
import { getDrive, DriveError, type DriveClient } from "../client.js"
import type { Me } from "../types.js"

export type DriveUserState = { status: "loading" } | { status: "signed-out" } | { status: "error"; error: string } | { status: "signed-in"; me: Me }

/** Who is signed in, as the drive sees it. */
export function useDriveUser(drive: DriveClient = getDrive()): DriveUserState {
  const [state, setState] = useState<DriveUserState>({ status: "loading" })
  useEffect(() => {
    let cancelled = false
    drive
      .me()
      .then((me) => !cancelled && setState({ status: "signed-in", me }))
      .catch((e) => !cancelled && setState(e instanceof DriveError && e.signedOut ? { status: "signed-out" } : { status: "error", error: String(e) }))
    return () => {
      cancelled = true
    }
  }, [drive])
  return state
}
