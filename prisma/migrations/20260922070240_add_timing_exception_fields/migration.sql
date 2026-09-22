-- AlterTable
ALTER TABLE `company_vehicle_trips` ADD COLUMN `timing_exception_approved_at` DATETIME(3) NULL,
    ADD COLUMN `timing_exception_approved_by_admin_id` INTEGER NULL,
    ADD COLUMN `timing_exception_reason` VARCHAR(300) NULL;

-- AlterTable
ALTER TABLE `parking_reservations` ADD COLUMN `timing_exception_approved_at` DATETIME(3) NULL,
    ADD COLUMN `timing_exception_approved_by_admin_id` INTEGER NULL,
    ADD COLUMN `timing_exception_reason` VARCHAR(300) NULL;

-- AddForeignKey
ALTER TABLE `parking_reservations` ADD CONSTRAINT `parking_reservations_timing_exception_approved_by_admin_id_fkey` FOREIGN KEY (`timing_exception_approved_by_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_vehicle_trips` ADD CONSTRAINT `company_vehicle_trips_timing_exception_approved_by_admin_id_fkey` FOREIGN KEY (`timing_exception_approved_by_admin_id`) REFERENCES `admin_users`(`admin_user_id`) ON DELETE SET NULL ON UPDATE CASCADE;
