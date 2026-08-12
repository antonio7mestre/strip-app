CREATE TABLE `strips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`cover_kind` text NOT NULL,
	`cover_color` text,
	`cover_shape` text,
	`cover_object_key` text,
	`cover_alt` text,
	`published_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_strips_owner_published` ON `strips` (`owner_id`,`published_at`);
--> statement-breakpoint
PRAGMA optimize;
