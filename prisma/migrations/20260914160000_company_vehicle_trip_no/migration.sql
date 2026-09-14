-- AlterTable
ALTER TABLE `company_vehicle_trips`
    ADD COLUMN `trip_no` VARCHAR(20) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `company_vehicle_trips_trip_no_key` ON `company_vehicle_trips`(`trip_no`);
