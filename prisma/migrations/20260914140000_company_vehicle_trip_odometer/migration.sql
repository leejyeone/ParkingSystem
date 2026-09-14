-- AlterTable
ALTER TABLE `company_vehicle_trips`
    ADD COLUMN `odometer_start_km` INTEGER NULL,
    ADD COLUMN `odometer_end_km` INTEGER NULL;
