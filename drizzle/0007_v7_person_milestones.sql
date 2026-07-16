CREATE TABLE `person_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`closed_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `person_milestones_user_idx` ON `person_milestones` (`user_id`);