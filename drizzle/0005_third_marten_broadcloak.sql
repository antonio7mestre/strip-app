CREATE TABLE `viewed_strips` (
	`user_id` text NOT NULL,
	`strip_id` text NOT NULL,
	`viewed_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `strip_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_viewed_strips_user_viewed` ON `viewed_strips` (`user_id`,`viewed_at`);