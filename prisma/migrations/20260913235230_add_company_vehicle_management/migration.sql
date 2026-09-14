-- CreateTable
CREATE TABLE `company_vehicles` (
    `vehicle_id` INTEGER NOT NULL AUTO_INCREMENT,
    `vehicle_no` VARCHAR(20) NOT NULL,
    `memo` VARCHAR(500) NULL,
    `parking_space_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_vehicles_parking_space_id_key`(`parking_space_id`),
    PRIMARY KEY (`vehicle_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_vehicle_trips` (
    `trip_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_user_id` INTEGER NOT NULL,
    `destination` VARCHAR(200) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `request_start_at` DATETIME(3) NOT NULL,
    `request_end_at` DATETIME(3) NOT NULL,
    `actual_entry_at` DATETIME(3) NULL,
    `actual_exit_at` DATETIME(3) NULL,
    `assigned_vehicle_id` INTEGER NULL,
    `trip_status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARKING', 'EXITED', 'NO_SHOW') NOT NULL DEFAULT 'REQUESTED',
    `approval_admin_id` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `rejected_at` DATETIME(3) NULL,
    `rejection_reason` VARCHAR(500) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_company_vehicle_trips_status_start`(`trip_status`, `request_start_at`),
    INDEX `idx_company_vehicle_trips_vehicle_range`(`assigned_vehicle_id`, `request_start_at`, `request_end_at`),
    INDEX `idx_company_vehicle_trips_employee_created`(`employee_user_id`, `created_at`),
    PRIMARY KEY (`trip_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_vehicle_trip_status_logs` (
    `status_log_id` INTEGER NOT NULL AUTO_INCREMENT,
    `trip_id` INTEGER NOT NULL,
    `previous_status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARKING', 'EXITED', 'NO_SHOW') NULL,
    `current_status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARKING', 'EXITED', 'NO_SHOW') NOT NULL,
    `changed_by_type` ENUM('REQUESTER', 'ADMIN', 'SYSTEM') NOT NULL,
    `changed_by_admin_id` INTEGER NULL,
    `change_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_company_vehicle_trip_status_logs_trip_created`(`trip_id`, `created_at`),
    INDEX `idx_company_vehicle_trip_status_logs_admin`(`changed_by_admin_id`),
    PRIMARY KEY (`status_log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `company_vehicles` ADD CONSTRAINT `company_vehicles_parking_space_id_fkey` FOREIGN KEY (`parking_space_id`) REFERENCES `parking_spaces`(`space_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_vehicle_trips` ADD CONSTRAINT `company_vehicle_trips_employee_user_id_fkey` FOREIGN KEY (`employee_user_id`) REFERENCES `employee_users`(`employee_user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_vehicle_trips` ADD CONSTRAINT `company_vehicle_trips_assigned_vehicle_id_fkey` FOREIGN KEY (`assigned_vehicle_id`) REFERENCES `company_vehicles`(`vehicle_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_vehicle_trips` ADD CONSTRAINT `company_vehicle_trips_approval_admin_id_fkey` FOREIGN KEY (`approval_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_vehicle_trip_status_logs` ADD CONSTRAINT `company_vehicle_trip_status_logs_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `company_vehicle_trips`(`trip_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_vehicle_trip_status_logs` ADD CONSTRAINT `company_vehicle_trip_status_logs_changed_by_admin_id_fkey` FOREIGN KEY (`changed_by_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;
