-- AlterTable
ALTER TABLE `email_send_logs` MODIFY `email_type` ENUM('REQUEST_RECEIVED', 'NEW_REQUEST_TO_ADMIN', 'APPROVED', 'REJECTED', 'UPDATED', 'CANCELLED', 'EXIT_REMINDER', 'ENTRY_REMINDER', 'RECURRING_SCHEDULE_CREATED', 'RECURRING_OCCURRENCE_SKIPPED', 'RECURRING_SCHEDULE_CANCELLED') NOT NULL;

-- AlterTable
ALTER TABLE `parking_reservations` ADD COLUMN `recurring_schedule_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `recurring_reservation_schedules` (
    `schedule_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_user_id` INTEGER NOT NULL,
    `assigned_space_id` INTEGER NOT NULL,
    `requester_name` VARCHAR(50) NOT NULL,
    `requester_email` VARCHAR(255) NOT NULL,
    `company_or_branch_name` VARCHAR(100) NULL,
    `vehicle_no` VARCHAR(20) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `weekdays_mask` INTEGER NOT NULL,
    `daily_start_time` VARCHAR(5) NOT NULL,
    `daily_end_time` VARCHAR(5) NOT NULL,
    `skip_approval` BOOLEAN NOT NULL DEFAULT false,
    `skip_email` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `created_by_admin_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_recurring_schedules_employee`(`employee_user_id`),
    INDEX `idx_recurring_schedules_space`(`assigned_space_id`),
    INDEX `idx_recurring_schedules_status`(`status`),
    PRIMARY KEY (`schedule_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_reservations_recurring_schedule` ON `parking_reservations`(`recurring_schedule_id`);

-- AddForeignKey
ALTER TABLE `parking_reservations` ADD CONSTRAINT `parking_reservations_recurring_schedule_id_fkey` FOREIGN KEY (`recurring_schedule_id`) REFERENCES `recurring_reservation_schedules`(`schedule_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_reservation_schedules` ADD CONSTRAINT `recurring_reservation_schedules_employee_user_id_fkey` FOREIGN KEY (`employee_user_id`) REFERENCES `employee_users`(`employee_user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_reservation_schedules` ADD CONSTRAINT `recurring_reservation_schedules_assigned_space_id_fkey` FOREIGN KEY (`assigned_space_id`) REFERENCES `parking_spaces`(`space_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_reservation_schedules` ADD CONSTRAINT `recurring_reservation_schedules_created_by_admin_id_fkey` FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

