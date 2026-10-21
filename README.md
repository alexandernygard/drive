# Drive

The home of the office suite at **https://drive.nyggis.com**: every document, sheet and deck from
[word2](../word2), [xl2](../xl2) and [ppt2](../ppt2), plus folders, uploads, and everything shared with
you. Clicking a document opens it in its app in a new tab, and the dashboard shows who is in which file
right now.

```
dashboard (drive.nyggis.com) ──/api──▶ Worker ──▶ D1: items, shares, stars, recents, presence, activity
                                  │            └─▶ R2: uploads, thumbnails
word2 / xl2 / ppt2 ──ticket──▶ /api/items/:id/ticket
       └──────── WebSocket ──▶ /collab/:id ──▶ DriveRoom (Durable Object, one per document)
                                                  │ presence + "edited by" ─▶ D1
dashboard ◀── /api/live ── UserFeed (Durable Object, one per user) ◀── pushes from rooms and the API
```

```bash
pnpm install
pnpm dev:worker   # API + rooms on :8790 (applies D1 migrations locally first)
pnpm dev          # dashboard on :5310
```

Sign-in uses [Nyggis accounts](../auth). Locally, run the auth Worker too (`npm run dev` in `../auth`,
:8787), copy `.dev.vars.example` to `.dev.vars`, and register the app `drive` at
http://localhost:8787/admin/apps (mode *Signed in*). The apps' dev servers (`pnpm dev` in each) open
drive files from `?file=<id>`.

## How it fits together

- **The drive owns the documents.** Each document is a collab room (`@alexandernygard/collab`) hosted
  here, not in the app. Creating a document writes the app's starter content into its room
  (`template()`), so whoever opens it first sees the same thing as everyone after.
- **Access follows sharing.** An app asks `POST /api/items/:id/ticket`; the Worker checks the share and
  signs a 2-minute ticket saying who you are and whether you may write. The room drops writes from
  viewers. Tickets are fetched again on every reconnect, so revoked access sticks.
- **Sharing.** Share with people by email as viewer or editor (`shares`), or turn on "anyone with the
  link". Sharing a folder shares everything in it. People who haven't signed in yet show as *Invited*;
  the share attaches to their account the first time they sign in with that email. Everything in a
  folder tree has the owner of its top folder.
- **Presence.** A room knows who is connected. It writes `presence` rows (refreshed every minute) and
  pushes `{type: "presence"}` to the feed of everyone who can see the file, so dashboards show
  "Ola is editing" without polling. Edits are recorded as `updated_by` and `edited` activity at most every
  15 s per room.
- **Previews.** Rooms keep a small excerpt in `items.preview` (a document's text, a sheet's first rows, a
  deck's slide titles), which the dashboard draws as a miniature of the file. ppt2 also uploads a picture
  of the first slide (`PUT /api/items/:id/thumbnail`).
- **Trash.** Trashing a folder takes its contents with it (`trashed_via`), restoring brings them back,
  and a daily cron deletes what has been in the trash for 30 days, rooms and files included.

## Repository

| Folder | What it is |
|---|---|
| `apps/worker` | The Worker: Hono API, `DriveRoom` (extends collab's `DocRoom`), `UserFeed`, the auth webhook and the trash cron. |
| `apps/web` | The dashboard: Vite + React + Tailwind 4 + `@alexandernygard/components`. |

Both use [`@alexandernygard/drive`](https://github.com/alexandernygard/drive-sdk) from npm, like the apps
do: types, the app registry (doc → word2, sheet → xl2, deck → ppt2), starter templates, a typed API client
with token refresh, and React pieces (`ShareDialog`, `DriveFileButton`, `AvatarStack`, `KindIcon`,
`DriveLogo`). The Worker imports `@alexandernygard/drive/core`. The apps update the package on their own
schedule, so keep the API backwards compatible: add fields and routes, don't rename or remove them. To
try an unreleased package change here, `pnpm pack` in drive-sdk and `pnpm add <path to the .tgz>` in the
app that needs it, without committing that.

## API

All under `/api`, JSON, signed-in only. Writes are accepted from the dashboard and `APP_ORIGINS` only.

| Route | |
|---|---|
| `GET /me` | You, and how much you store |
| `GET /items?view=home\|mine\|shared\|sharing\|starred\|recent\|trash\|search&parent=&q=` | Listings |
| `GET /items/:id`, `POST /items`, `PATCH /items/:id` | An item; create a folder or document; rename, move, star |
| `POST /upload?name=&parent=` | Upload any file (up to 95 MB) |
| `POST /items/:id/copy`, `/trash`, `/restore`, `DELETE /items/:id`, `DELETE /trash` | Copy, trash, restore, delete forever |
| `PUT /items/:id/shares`, `DELETE /items/:id/shares/:email`, `PUT /items/:id/link` | Sharing |
| `POST /items/:id/ticket` | Open a document: a room ticket, and it goes to Recent |
| `GET\|PUT /items/:id/thumbnail`, `GET /items/:id/content` | Thumbnails; download a file or a document's source |
| `GET /people`, `GET /activity`, `GET /items/:id/activity` | Share suggestions; activity |
| `GET /live` (WebSocket) | Presence, changes and new shares, pushed |

## Deploy

The database (`drive`) and the bucket (`drive-files`) are declared in `wrangler.jsonc` by name only;
`wrangler deploy` creates them the first time and finds them by name after that. What's left by hand:

1. `openssl rand -base64 32 | npx wrangler secret put TICKET_SECRET` (it offers to create the Worker if it
   doesn't exist yet).
2. Register the app at https://auth.nyggis.com/admin/apps: id `drive`, URL `https://drive.nyggis.com`,
   mode *Signed in* (the apps call the API for anyone who opens a file, so invite-only would lock out
   people you share with). Set its webhook to `https://drive.nyggis.com/auth-events`.

Then `pnpm run deploy` (not `pnpm deploy`, which is a pnpm command): it builds, applies migrations and
deploys. On the very first run the database doesn't exist yet, so it deploys once to create it, then
migrates and deploys again. To deploy from Git with Workers Builds, set the deploy command to
`pnpm run deploy`.
