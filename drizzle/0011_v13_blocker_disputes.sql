CREATE TABLE `blocker_disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`blocker_id` text NOT NULL,
	`penalized_user_id` text,
	`by_user_id` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blocker_id`) REFERENCES `blockers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`penalized_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `blocker_disputes_penalized_idx` ON `blocker_disputes` (`penalized_user_id`,`created_at`);