-- CreateTable
CREATE TABLE `admin_users` (
    `admin_user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `login_id` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `admin_name` VARCHAR(50) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `role_code` ENUM('PARKING_ADMIN', 'SYSTEM_ADMIN') NOT NULL,
    `account_status` ENUM('ACTIVE', 'INACTIVE', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `login_fail_count` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `password_changed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `uq_admin_users_login_id`(`login_id`),
    UNIQUE INDEX `uq_admin_users_email`(`email`),
    INDEX `idx_admin_users_account_status`(`account_status`),
    PRIMARY KEY (`admin_user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `parking_areas` (
    `area_id` INTEGER NOT NULL AUTO_INCREMENT,
    `area_code` VARCHAR(20) NOT NULL,
    `area_name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `map_image_data` LONGBLOB NULL,
    `map_image_mime_type` VARCHAR(100) NULL,
    `map_image_name` VARCHAR(255) NULL,
    `map_image_updated_at` DATETIME(3) NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_parking_areas_area_code`(`area_code`),
    INDEX `idx_parking_areas_active_order`(`is_active`, `display_order`),
    PRIMARY KEY (`area_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_spaces` (
    `space_id` INTEGER NOT NULL AUTO_INCREMENT,
    `area_id` INTEGER NOT NULL,
    `space_code` VARCHAR(20) NOT NULL,
    `space_name` VARCHAR(100) NULL,
    `space_type` ENUM('NORMAL', 'DOUBLE', 'DISABLED', 'EV', 'UNAVAILABLE') NOT NULL DEFAULT 'NORMAL',
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `memo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_parking_spaces_type_active_order`(`space_type`, `is_active`, `display_order`),
    UNIQUE INDEX `uq_parking_spaces_area_code`(`area_id`, `space_code`),
    PRIMARY KEY (`space_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_reservations` (
    `reservation_id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservation_no` VARCHAR(30) NOT NULL,
    `user_id` INTEGER NULL,
    `requester_type` ENUM('VISITOR', 'EMPLOYEE') NOT NULL,
    `company_or_branch_name` VARCHAR(100) NOT NULL,
    `requester_name` VARCHAR(50) NOT NULL,
    `requester_email` VARCHAR(255) NOT NULL,
    `vehicle_no` VARCHAR(20) NOT NULL,
    `visit_purpose` VARCHAR(200) NULL,
    `request_memo` TEXT NULL,
    `visit_start_at` DATETIME(3) NOT NULL,
    `visit_end_at` DATETIME(3) NOT NULL,
    `actual_entry_at` DATETIME(3) NULL,
    `actual_exit_at` DATETIME(3) NULL,
    `assigned_space_id` INTEGER NULL,
    `reservation_status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARKING', 'EXITED', 'NO_SHOW') NOT NULL DEFAULT 'REQUESTED',
    `approval_admin_id` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `rejected_at` DATETIME(3) NULL,
    `rejection_reason` VARCHAR(500) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(500) NULL,
    `privacy_consent_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_parking_reservations_no`(`reservation_no`),
    INDEX `idx_reservations_user_created`(`user_id`, `created_at`),
    INDEX `idx_reservations_created`(`created_at`),
    INDEX `idx_reservations_status`(`reservation_status`),
    INDEX `idx_reservations_visit_range`(`visit_start_at`, `visit_end_at`),
    INDEX `idx_reservations_space_range_status`(`assigned_space_id`, `visit_start_at`, `visit_end_at`, `reservation_status`),
    INDEX `idx_reservations_vehicle_range`(`vehicle_no`, `visit_start_at`, `visit_end_at`),
    INDEX `idx_reservations_email_created`(`requester_email`, `created_at`),
    INDEX `idx_reservations_approval_admin`(`approval_admin_id`),
    PRIMARY KEY (`reservation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservation_access_tokens` (
    `token_id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservation_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_reservation_access_tokens_hash`(`token_hash`),
    INDEX `idx_access_tokens_reservation`(`reservation_id`, `is_active`),
    PRIMARY KEY (`token_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_reservation_status_logs` (
    `status_log_id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservation_id` INTEGER NOT NULL,
    `previous_status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARKING', 'EXITED', 'NO_SHOW') NULL,
    `current_status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARKING', 'EXITED', 'NO_SHOW') NOT NULL,
    `changed_by_type` ENUM('REQUESTER', 'ADMIN', 'SYSTEM') NOT NULL,
    `changed_by_admin_id` INTEGER NULL,
    `change_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_status_logs_reservation_created`(`reservation_id`, `created_at`),
    INDEX `idx_status_logs_admin`(`changed_by_admin_id`),
    PRIMARY KEY (`status_log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_notification_emails` (
    `notification_email_id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `recipient_name` VARCHAR(50) NULL,
    `receive_new_request` BOOLEAN NOT NULL DEFAULT true,
    `receive_approval_alert` BOOLEAN NOT NULL DEFAULT true,
    `receive_double_parking_alert` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_admin_notification_emails_email`(`email`),
    INDEX `idx_admin_notification_emails_active`(`is_active`),
    PRIMARY KEY (`notification_email_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_send_logs` (
    `email_log_id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservation_id` INTEGER NULL,
    `email_type` ENUM('REQUEST_RECEIVED', 'NEW_REQUEST_TO_ADMIN', 'APPROVED', 'REJECTED', 'UPDATED', 'CANCELLED', 'EXIT_REMINDER', 'DOUBLE_PARKING_NOTICE') NOT NULL,
    `recipient_email` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(300) NOT NULL,
    `send_status` ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `provider_message_id` VARCHAR(255) NULL,
    `fail_reason` TEXT NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sent_at` DATETIME(3) NULL,
    `dedupe_key` VARCHAR(100) NULL,

    UNIQUE INDEX `uq_email_send_logs_dedupe_key`(`dedupe_key`),
    INDEX `idx_email_logs_reservation_type_status`(`reservation_id`, `email_type`, `send_status`),
    INDEX `idx_email_logs_status_requested`(`send_status`, `requested_at`),
    PRIMARY KEY (`email_log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `audit_log_id` INTEGER NOT NULL AUTO_INCREMENT,
    `actor_admin_id` INTEGER NULL,
    `action_type` VARCHAR(50) NOT NULL,
    `target_type` VARCHAR(50) NOT NULL,
    `target_id` VARCHAR(50) NULL,
    `detail_json` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_audit_logs_actor_created`(`actor_admin_id`, `created_at`),
    INDEX `idx_audit_logs_action_created`(`action_type`, `created_at`),
    INDEX `idx_audit_logs_target`(`target_type`, `target_id`),
    INDEX `idx_audit_logs_created_at`(`created_at`),
    PRIMARY KEY (`audit_log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `setting_key` VARCHAR(100) NOT NULL,
    `setting_value` VARCHAR(500) NOT NULL,
    `description` VARCHAR(500) NULL,
    `updated_by_admin_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_system_settings_updated_by`(`updated_by_admin_id`),
    PRIMARY KEY (`setting_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_login_attempts` (
    `login_attempt_id` INTEGER NOT NULL AUTO_INCREMENT,
    `login_id` VARCHAR(50) NOT NULL,
    `succeeded` BOOLEAN NOT NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_login_attempts_login_created`(`login_id`, `created_at`),
    INDEX `idx_login_attempts_ip_created`(`ip_address`, `created_at`),
    PRIMARY KEY (`login_attempt_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `parking_spaces` ADD CONSTRAINT `parking_spaces_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `parking_areas`(`area_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_reservations` ADD CONSTRAINT `parking_reservations_assigned_space_id_fkey` FOREIGN KEY (`assigned_space_id`) REFERENCES `parking_spaces`(`space_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_reservations` ADD CONSTRAINT `parking_reservations_approval_admin_id_fkey` FOREIGN KEY (`approval_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_reservations` ADD CONSTRAINT `parking_reservations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_access_tokens` ADD CONSTRAINT `reservation_access_tokens_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `parking_reservations`(`reservation_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_reservation_status_logs` ADD CONSTRAINT `parking_reservation_status_logs_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `parking_reservations`(`reservation_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_reservation_status_logs` ADD CONSTRAINT `parking_reservation_status_logs_changed_by_admin_id_fkey` FOREIGN KEY (`changed_by_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_send_logs` ADD CONSTRAINT `email_send_logs_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `parking_reservations`(`reservation_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_admin_id_fkey` FOREIGN KEY (`actor_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_updated_by_admin_id_fkey` FOREIGN KEY (`updated_by_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

