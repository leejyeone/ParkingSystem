-- AlterTable
ALTER TABLE `employee_users` DROP COLUMN `branch_name`,
    DROP COLUMN `department`,
    DROP COLUMN `locked_until`,
    DROP COLUMN `login_fail_count`,
    DROP COLUMN `must_change_password`,
    DROP COLUMN `password_changed_at`,
    DROP COLUMN `password_hash`,
    ADD COLUMN `department_code` VARCHAR(50) NULL,
    ADD COLUMN `department_name` VARCHAR(100) NOT NULL,
    ADD COLUMN `employee_code` VARCHAR(20) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `uq_employee_users_employee_code` ON `employee_users`(`employee_code`);

