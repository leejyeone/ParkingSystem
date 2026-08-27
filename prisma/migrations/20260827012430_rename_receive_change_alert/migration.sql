-- 기존 값을 보존하기 위해 DROP+ADD 대신 RENAME COLUMN 을 쓴다.
ALTER TABLE `admin_notification_emails`
  RENAME COLUMN `receive_approval_alert` TO `receive_change_alert`;
