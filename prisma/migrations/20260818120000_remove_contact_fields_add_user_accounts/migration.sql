-- AlterTable
ALTER TABLE `parking_reservations` DROP COLUMN `department_name`,
    DROP COLUMN `requester_phone`,
    DROP COLUMN `vehicle_no_masked`,
    ADD COLUMN `user_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `users` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `company_or_branch_name` VARCHAR(100) NOT NULL,
    `vehicle_no` VARCHAR(20) NULL,
    `account_status` ENUM('ACTIVE', 'INACTIVE', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `login_fail_count` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `password_changed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `uq_users_email`(`email`),
    INDEX `idx_users_account_status`(`account_status`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_reservations_user_created` ON `parking_reservations`(`user_id`, `created_at`);

-- AddForeignKey
ALTER TABLE `parking_reservations` ADD CONSTRAINT `parking_reservations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

