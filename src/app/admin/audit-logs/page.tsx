import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';

import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGETS,
  VIEW_AUDIT_ACTIONS,
  writeAuditLog,
} from '@/services/audit-service';
import { countViewAuditLogs, listAuditLogs } from '@/services/log-query-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '감사 로그' };

const ACTION_LABEL: Record<string, string> = {
  RESERVATION_LIST_VIEW: '예약 목록 조회',
  RESERVATION_DETAIL_VIEW: '예약 상세 개인정보 조회',
  AUDIT_LOG_VIEW: '감사 로그 열람',
  RESERVATION_UPDATE: '예약 내용 수정',
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
  PARKING_SPACE_DELETE: '주차면 삭제',
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
  searchParams: Promise<{ actionType?: string; includeViews?: string; page?: string }>;
};

export default async function AdminAuditLogsPage({ searchParams }: PageProps) {
  const session = await requireAdminPage('/admin/audit-logs');
  const params = await searchParams;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;
  const actionType = params.actionType || undefined;
  // 열람 기록은 건수가 많아 변경 이력을 가리므로 기본으로 제외한다.
  // 포함해서 보려면 includeViews=1 을 붙인다. (숨긴 건수는 화면에 항상 표시한다)
  const includeViews = params.includeViews === '1';

  // 감사 기록을 누가 열어봤는지도 추적 대상이다.
  await writeAuditLog({
    actorAdminId: session.adminUserId,
    actionType: AUDIT_ACTIONS.AUDIT_LOG_VIEW,
    targetType: AUDIT_TARGETS.AUDIT_LOG,
    targetId: null,
    detail: { actionTypeFilter: actionType ?? null, includeViews, page },
    context: getRequestContext(await headers()),
  });

  const result = await listAuditLogs({
    actionType,
    excludeActionTypes: includeViews ? undefined : VIEW_AUDIT_ACTIONS,
    page,
    pageSize: 30,
  });

  // 기록을 감췄다는 사실 자체는 항상 보이게 한다. (감사 자료가 조용히 사라지면 안 된다)
  const hiddenViewCount = includeViews ? 0 : await countViewAuditLogs(actionType);

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({
      actionType,
      includeViews: includeViews ? '1' : undefined,
      ...overrides,
    })) {
      if (value) query.set(key, value);
    }
    const queryString = query.toString();
    return queryString ? `/admin/audit-logs?${queryString}` : '/admin/audit-logs';
  };

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">감사 로그</h1>
        <p className="mt-1 text-sm text-slate-600">
          개인정보 열람, 승인/반려, 설정 변경 등 주요 관리자 행위 기록입니다. 「개인정보의 안전성
          확보조치 기준」 제8조에 따른 접속기록으로, 1년간 보관 후 자동 삭제됩니다. 같은 관리자가
          같은 대상을 5분 안에 반복 열람한 경우는 한 건으로 묶입니다.
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
                defaultValue={actionType ?? ''}
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
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="includeViews"
                value="1"
                defaultChecked={includeViews}
                className="size-4"
              />
              열람 기록 포함
            </label>
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
          <p className="text-sm font-bold text-slate-700">
            전체 {result.totalCount}건
            {includeViews ? null : (
              <span className="ml-2 text-xs font-normal text-slate-500">
                (개인정보 열람 기록 {hiddenViewCount}건 숨김 —{' '}
                <Link href={buildHref({ includeViews: '1' })} className="text-brand-700 font-bold">
                  포함해서 보기
                </Link>
                )
              </span>
            )}
          </p>
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
                        ? `${log.actorAdmin.adminName} (${log.actorAdmin.email})`
                        : '시스템'}
                    </td>
                    <td className="text-xs">
                      {log.targetType}
                      {log.targetId ? ` #${log.targetId}` : ''}
                    </td>
                    <td className="text-xs whitespace-nowrap">{log.ipAddress ?? '-'}</td>
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
