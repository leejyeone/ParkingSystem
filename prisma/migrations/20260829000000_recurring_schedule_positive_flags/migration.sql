-- Rename skip_approval/skip_email to their positive-sense equivalents and invert
-- existing values so the stored meaning matches the new column names.
ALTER TABLE `recurring_reservation_schedules`
  CHANGE COLUMN `skip_approval` `approval_enabled` BOOLEAN NOT NULL DEFAULT true,
  CHANGE COLUMN `skip_email` `email_enabled` BOOLEAN NOT NULL DEFAULT true;

UPDATE `recurring_reservation_schedules`
SET `approval_enabled` = NOT `approval_enabled`,
    `email_enabled` = NOT `email_enabled`;
