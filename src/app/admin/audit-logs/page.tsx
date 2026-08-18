import type { Metadata } from 'next';
import Link from 'next/link';

import { requireSystemAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime } from '@/lib/datetime';
import { AUDIT_ACTIONS } from '@/services/audit-service';
import { listAuditLogs } from '@/services/log-query-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '감사 로그' };

const ACTION_LABEL: Record<string, string> = {
  RESERVATION_DETAIL_VIEW: '예약 상세 개인정보 조회',
  RESERVATION_APPROVE: '예약 승인',
  RESERVATION_REJECT: '예약 반려',
  RESERVATION_SPACE_CHANGE: '주차 위치 변경',
  RESERVATION_ENTRY: '입차 처리',
  RESERVATION_EXIT: '출차 처리',
  RESERVATION_NO_SHOW: '미방문 처리',
  NOTIFICATION_EMAIL_CHANGE: '알림 이메일 변경',
  PARKING_SPACE_CREATE: '주차면 생성',
  PARKING_SPACE_UPDATE: '주차면 수정',
  PARKING_SPACE_DEACTIVATE: '주차면 비활성화',
  PARKING_AREA_CREATE: '구역 생성',
  PARKING_AREA_UPDATE: '구역 수정',
  SYSTEM_SETTING_CHANGE: '시스템 설정 변경',
  ADMIN_USER_CREATE: '관리자 계정 생성',
  ADMIN_USER_UPDATE: '관리자 계정 수정',
  ADMIN_USER_DEACTIVATE: '관리자 계정 비활성화',
  ADMIN_LOGIN: '관리자 로그인',
  ADMIN_LOGOUT: '관리자 로그아웃',
};

type PageProps = {
  searchParams: Promise<{ actionType?: string; page?: string }>;
};

export default async function AdminAuditLogsPage({ searchParams }: PageProps) {
  await requireSystemAdminPage('/admin/audit-logs');
  const params = await searchParams;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const result = await listAuditLogs({
    actionType: params.actionType || undefined,
    page,
    pageSize: 30,
  });

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">감사 로그</h1>
        <p className="mt-1 text-sm text-slate-600">
          개인정보 열람, 승인/반려, 설정 변경 등 주요 관리자 행위 기록입니다.
        </p>
      </div>

      <section className="card">
        <div className="card-body">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-56">
              <label htmlFor="audit-action" className="label">
                행위 유형
              </label>
              <select
                id="audit-action"
                name="actionType"
                defaultValue={params.actionType ?? ''}
                className="input"
              >
                <option value="">전체</option>
                {Object.values(AUDIT_ACTIONS).map((value) => (
                  <option key={value} value={value}>
                    {ACTION_LABEL[value] ?? value}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary px-6">
              검색
            </button>
            <Link href="/admin/audit-logs" className="btn btn-secondary">
              초기화
            </Link>
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
                  <th>일시</th>
                  <th>행위</th>
                  <th>수행자</th>
                  <th>대상</th>
                  <th>IP</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((log) => (
                  <tr key={log.auditLogId}>
                    <td className="text-xs whitespace-nowrap">
                      {formatKstDateTime(log.createdAt)}
                    </td>
                    <td className="text-xs font-bold">
                      {ACTION_LABEL[log.actionType] ?? log.actionType}
                    </td>
                    <td className="text-xs">
                      {log.actorAdmin
                        ? `${log.actorAdmin.adminName} (${log.actorAdmin.loginId})`
                        : '시스템'}
                    </td>
                    <td className="text-xs">
                      {log.targetType}
                      {log.targetId ? ` #${log.targetId}` : ''}
                    </td>
                    <td className="text-xs">{log.ipAddress ?? '-'}</td>
                    <td className="max-w-[320px] text-xs break-words text-slate-500">
                      {log.detailJson ? JSON.stringify(log.detailJson) : '-'}
                    </td>
                  </tr>
                ))}
                {result.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                      감사 로그가 없습니다.
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
