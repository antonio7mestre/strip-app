import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
