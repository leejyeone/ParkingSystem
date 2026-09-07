-- 승인 메일에 배정 주차 위치 평면도 이미지를 인라인(cid) 첨부로 넣기 위한 컬럼 추가.
--
-- 실패한 메일을 관리자가 재발송할 때도 원래 나갔던 첨부(이미지)가 그대로 다시 실려야
-- 하므로, 발송 당시 첨부파일을 이 컬럼에 저장해 둔다.
-- [{ filename, contentType, cid, contentBase64 }] 형태의 JSON 배열. 첨부가 없으면 NULL.
ALTER TABLE `email_send_logs` ADD COLUMN `attachments_json` JSON NULL;
