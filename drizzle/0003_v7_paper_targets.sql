ALTER TABLE `papers` ADD `target_submission_at` integer;--> statement-breakpoint
ALTER TABLE `papers` ADD `venue_shortlist` text DEFAULT '[]' NOT NULL;