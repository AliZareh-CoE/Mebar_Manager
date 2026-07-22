CREATE TABLE `utf_students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `utf_students_archived_idx` ON `utf_students` (`archived`);--> statement-breakpoint
ALTER TABLE `project_people` ADD `utf_student_id` text REFERENCES utf_students(id);