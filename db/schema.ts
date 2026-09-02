import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    phoneE164: text("phone_e164").notNull().unique(),
    username: text("username").unique(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => [index("idx_users_phone").on(table.phoneE164)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    index("idx_auth_sessions_user").on(table.userId),
    index("idx_auth_sessions_expiry").on(table.expiresAt),
  ],
);

export const authRateLimits = sqliteTable(
  "auth_rate_limits",
  {
    key: text("rate_key").primaryKey(),
    windowStartedAt: integer("window_started_at").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [index("idx_auth_rate_limits_window").on(table.windowStartedAt)],
);

export const strips = sqliteTable(
  "strips",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull().default(""),
    coverKind: text("cover_kind").notNull(),
    coverColor: text("cover_color"),
    coverShape: text("cover_shape"),
    coverObjectKey: text("cover_object_key"),
    coverAlt: text("cover_alt"),
    contentJson: text("content_json").notNull().default("[]"),
    publishedAt: integer("published_at").notNull(),
  },
  (table) => [
    index("idx_strips_owner_published").on(table.ownerId, table.publishedAt),
  ],
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull().default(""),
    coverKind: text("cover_kind").notNull().default("color"),
    coverColor: text("cover_color"),
    coverBlockId: text("cover_block_id"),
    contentJson: text("content_json").notNull().default("[]"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_drafts_owner_updated").on(table.ownerId, table.updatedAt),
  ],
);

export const viewedStrips = sqliteTable(
  "viewed_strips",
  {
    userId: text("user_id").notNull(),
    stripId: text("strip_id").notNull(),
    viewedAt: integer("viewed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.stripId] }),
    index("idx_viewed_strips_user_viewed").on(table.userId, table.viewedAt),
  ],
);
