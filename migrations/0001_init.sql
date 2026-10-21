-- People who have used the drive. A display copy of their Nyggis profile, refreshed on every request;
-- permissions never live here.
CREATE TABLE users (
  id TEXT PRIMARY KEY,               -- usr_… from auth.nyggis.com
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  seen_at INTEGER NOT NULL
);
CREATE INDEX users_email ON users (lower(email));

-- Files and folders. Everything in a tree has the owner of its top folder; created_by is who made it.
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                -- folder | doc | sheet | deck | file
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES items (id),
  owner_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  -- Anyone signed in who has the link: NULL (off), viewer or editor. Inherited by everything inside a folder.
  link_role TEXT,
  -- Uploads (kind = file): R2 key is files/<id>.
  mime TEXT,
  size INTEGER,
  -- Set when an app uploaded a thumbnail (R2 thumbs/<id>); the value busts caches.
  thumb_at INTEGER,
  -- Small JSON excerpt of a document for the dashboard, written by its room.
  preview TEXT,
  -- Trash. trashed_via is the folder whose trashing took this item with it (NULL for the item trashed itself).
  trashed_at INTEGER,
  trashed_by TEXT,
  trashed_via TEXT
);
CREATE INDEX items_parent ON items (parent_id, trashed_at);
CREATE INDEX items_owner ON items (owner_id, parent_id, trashed_at);
CREATE INDEX items_trash ON items (trashed_at);

-- Direct shares with a person. user_id is filled in once someone with that email signs in.
CREATE TABLE shares (
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  email TEXT NOT NULL,               -- lowercased
  user_id TEXT,
  role TEXT NOT NULL,                -- viewer | editor
  shared_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, email)
);
CREATE INDEX shares_user ON shares (user_id);
CREATE INDEX shares_email ON shares (email) WHERE user_id IS NULL;

CREATE TABLE stars (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE recents (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  opened_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX recents_user ON recents (user_id, opened_at DESC);

-- Who has a document open right now, kept by its room. Rows older than a few minutes are stale.
CREATE TABLE presence (
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  conns INTEGER NOT NULL,
  since INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, user_id)
);

-- What happened, for the activity panel.
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,              -- created | edited | renamed | moved | shared | unshared | trashed | restored | uploaded
  detail TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX activity_item ON activity (item_id, at DESC);
