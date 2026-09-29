CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`font` text DEFAULT 'sans' NOT NULL,
	`background` text DEFAULT '#000000' NOT NULL,
	`accent` text DEFAULT '#3155FF' NOT NULL,
	`photo_key` text,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
