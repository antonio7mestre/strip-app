CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`cover_kind` text DEFAULT 'color' NOT NULL,
	`cover_color` text,
	`cover_block_id` text,
	`content_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_drafts_owner_updated` ON `drafts` (`owner_id`,`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
