-- 감사 로그 보관 기간 정리(DELETE ... WHERE created_at < ?) 용 인덱스
-- CreateIndex
CREATE INDEX `idx_audit_logs_created_at` ON `audit_logs`(`created_at`);
