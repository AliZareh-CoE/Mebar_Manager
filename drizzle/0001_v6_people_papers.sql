CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`quartile_note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'DRAFTING' NOT NULL,
	`submitted_at` integer,
	`accepted_at` integer,
	`closed_at` integer,
	`closure_note` text,
	`link` text DEFAULT '' NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `papers_project_idx` ON `papers` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_people` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text,
	`external_name` text,
	`affiliation` text,
	`role` text DEFAULT 'CONTRIBUTOR' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`email` text,
	`notify` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_people_project_idx` ON `project_people` (`project_id`);