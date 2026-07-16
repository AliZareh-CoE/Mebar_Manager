PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_data_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`external_requester` text,
	`external_contact` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`needed_by` integer NOT NULL,
	`requester_id` text NOT NULL,
	`assignee_id` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`delivery_note` text,
	`created_at` integer NOT NULL,
	`delivered_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_data_requests`("id", "project_id", "title", "description", "needed_by", "requester_id", "assignee_id", "status", "delivery_note", "created_at", "delivered_at") SELECT "id", "project_id", "title", "description", "needed_by", "requester_id", "assignee_id", "status", "delivery_note", "created_at", "delivered_at" FROM `data_requests`;--> statement-breakpoint
DROP TABLE `data_requests`;--> statement-breakpoint
ALTER TABLE `__new_data_requests` RENAME TO `data_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `data_requests_status_idx` ON `data_requests` (`status`);--> statement-breakpoint
CREATE INDEX `data_requests_project_idx` ON `data_requests` (`project_id`);