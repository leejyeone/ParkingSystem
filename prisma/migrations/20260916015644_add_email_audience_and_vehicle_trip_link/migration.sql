-- AlterTable
ALTER TABLE `email_send_logs` ADD COLUMN `audience` ENUM('EMPLOYEE', 'VISITOR', 'ADMIN') NULL,
    ADD COLUMN `company_vehicle_trip_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `idx_email_logs_company_vehicle_trip` ON `email_send_logs`(`company_vehicle_trip_id`);

-- AddForeignKey
ALTER TABLE `email_send_logs` ADD CONSTRAINT `email_send_logs_company_vehicle_trip_id_fkey` FOREIGN KEY (`company_vehicle_trip_id`) REFERENCES `company_vehicle_trips`(`trip_id`) ON DELETE SET NULL ON UPDATE CASCADE;
