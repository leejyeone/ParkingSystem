import { EmailSendStatus, EmailType } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime } from '@/lib/datetime';
import { listEmailLogs } from '@/services/log-query-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '이메일 발송 이력' };

const EMAIL_TYPE_LABEL: Record<EmailType, string> = {
  REQUEST_RECEIVED: '신청 접수',
  NEW_REQUEST_TO_ADMIN: '관리자 신규 알림',
  APPROVED: '승인',
  REJECTED: '반려',
  UPDATED: '변경',
  CANCELLED: '취소',
  EXIT_REMINDER: '출차 예정 알림',
  DOUBLE_PARKING_NOTICE: '이중주차 안내',
};

const STATUS_LABEL: Record<EmailSendStatus, string> = {
  PENDING: '발송 중',
  SUCCESS: '성공',
  FAILED: '실패',
};

type PageProps = {
  searchParams: Promise<{
    reservationNo?: string;
    emailType?: string;
    sendStatus?: string;
    page?: string;
  }>;
};

export default async function AdminEmailLogsPage({ searchParams }: PageProps) {
  await requireAdminPage('/admin/email-logs');
  const params = await searchParams;

  const emailType =
    params.emailType && params.emailType in EmailType ? (params.emailType as EmailType) : undefined;
  const sendStatus =
    params.sendStatus && params.sendStatus in EmailSendStatus
      ? (params.sendStatus as EmailSendStatus)
      : undefined;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const result = await listEmailLogs({
    reservationNo: params.reservationNo || undefined,
    emailType,
    sendStatus,
    page,
    pageSize: 30,
  });

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">이메일 발송 이력</h1>
        <p className="mt-1 text-sm text-slate-600">
          Gmail API 발송 실패 시 실패 사유를 이 화면에서 확인할 수 있습니다. 수신자 주소는
          마스킹됩니다.
        </p>
      </div>

      <section className="card">
        <div className="card-body">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="log-reservation" className="label">
                예약번호
              </label>
              <input
                id="log-reservation"
                name="reservationNo"
                defaultValue={params.reservationNo ?? ''}
                className="input"
                placeholder="PK-20260820-XXXXXX"
              />
            </div>
            <div>
              <label htmlFor="log-type" className="label">
                이메일 종류
              </label>
              <select
                id="log-type"
                name="emailType"
                defaultValue={emailType ?? ''}
                className="input"
              >
                <option value="">전체</option>
                {Object.values(EmailType).map((value) => (
                  <option key={value} value={value}>
                    {EMAIL_TYPE_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="log-status" className="label">
                발송 상태
              </label>
              <select
                id="log-status"
                name="sendStatus"
                defaultValue={sendStatus ?? ''}
                className="input"
              >
                <option value="">전체</option>
                {Object.values(EmailSendStatus).map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn btn-primary px-6">
                검색
              </button>
              <Link href="/admin/email-logs" className="btn btn-secondary">
                초기화
              </Link>
            </div>
          </form>
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <p className="text-sm font-bold text-slate-700">전체 {result.totalCount}건</p>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>요청 일시</th>
                  <th>종류</th>
                  <th>예약번호</th>
                  <th>수신자</th>
                  <th>제목</th>
                  <th>상태</th>
                  <th>실패 사유</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((log) => (
                  <tr key={log.emailLogId}>
                    <td className="text-xs whitespace-nowrap">
                      {formatKstDateTime(log.requestedAt)}
                    </td>
                    <td className="text-xs">{EMAIL_TYPE_LABEL[log.emailType]}</td>
                    <td className="font-mono text-xs">
                      {log.reservation ? (
                        <Link
                          href={`/admin/reservations/${log.reservation.reservationId}`}
                          className="text-brand-700"
                        >
                          {log.reservation.reservationNo}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="text-xs">{log.recipientEmail}</td>
                    <td className="max-w-[260px] truncate text-xs">{log.subject}</td>
                    <td>
                      <span
                        className={`badge ${
                          log.sendStatus === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.sendStatus === 'FAILED'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {STATUS_LABEL[log.sendStatus]}
                      </span>
                    </td>
                    <td className="max-w-[280px] text-xs break-words text-red-600">
                      {log.failReason ?? '-'}
                    </td>
                  </tr>
                ))}
                {result.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-sm text-slate-500">
                      발송 이력이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
