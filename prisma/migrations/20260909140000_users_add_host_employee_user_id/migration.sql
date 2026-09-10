ALTER TABLE `users` ADD COLUMN `host_employee_user_id` INTEGER NULL;

CREATE INDEX `idx_users_host_employee_user_id` ON `users`(`host_employee_user_id`);

ALTER TABLE `users` ADD CONSTRAINT `users_host_employee_user_id_fkey` FOREIGN KEY (`host_employee_user_id`) REFERENCES `employee_users`(`employee_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;
