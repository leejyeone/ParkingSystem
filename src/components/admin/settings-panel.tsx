'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { SpaceTypeBadge } from '@/components/ui/status-badge';
import { SPACE_TYPE_LABEL } from '@/domain/reservation-status';
import type { SystemSettingsValues } from '@/domain/system-settings';
import { apiRequest } from '@/lib/client/api-client';

type NotificationEmail = {
  notificationEmailId: number;
  email: string;
  recipientName: string | null;
  receiveNewRequest: boolean;
  receiveApprovalAlert: boolean;
  receiveDailySummary: boolean;
  receiveDoubleParkingAlert: boolean;
  isActive: boolean;
};

type Area = {
  areaId: number;
  areaCode: string;
  areaName: string;
  description: string | null;
  mapImageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
};

type Space = {
  spaceId: number;
  spaceCode: string;
  spaceName: string | null;
  spaceType: keyof typeof SPACE_TYPE_LABEL;
  displayOrder: number;
  isActive: boolean;
  memo: string | null;
  area: { areaId: number; areaCode: string; areaName: string };
};

type AdminUser = {
  adminUserId: number;
  loginId: string;
  adminName: string;
  email: string;
  phone: string | null;
  roleCode: 'PARKING_ADMIN' | 'SYSTEM_ADMIN';
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  lastLoginAt: string | null;
};

type Props = {
  initialSettings: SystemSettingsValues;
  notificationEmails: NotificationEmail[];
  areas: Area[];
  spaces: Space[];
  adminUsers: AdminUser[];
};

const TABS = [
  { key: 'policy', label: '주차장 정보' },
  { key: 'areas', label: '도면' },
  { key: 'spaces', label: '주차면' },
  { key: 'notification', label: '알림 이메일' },
  { key: 'admins', label: '관리자 계정' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function SettingsPanel(props: Props) {
  const [tab, setTab] = useState<TabKey>('policy');

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow-sm">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-md px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
              tab === item.key ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'policy' && <PolicySection initialSettings={props.initialSettings} />}
      {tab === 'notification' && <NotificationSection emails={props.notificationEmails} />}
      {tab === 'areas' && <AreaSection areas={props.areas} />}
      {tab === 'spaces' && (
        <SpaceSection
          spaces={props.spaces}
          areas={props.areas}
          spaceAssignmentEnabled={props.initialSettings.spaceAssignmentEnabled}
        />
      )}
      {tab === 'admins' && <AdminUserSection adminUsers={props.adminUsers} />}
    </div>
  );
}

function useMutation() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function mutate(url: string, method: 'POST' | 'PUT', body: unknown, successText: string) {
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest(url, { method, body: JSON.stringify(body) });
    setPending(false);

    if (response.ok) {
      setMessage({ variant: 'success', text: successText });
      router.refresh();
      return true;
    }
    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
    return false;
  }

  return { pending, message, fieldErrors, mutate };
}

function PolicySection({ initialSettings }: { initialSettings: SystemSettingsValues }) {
  const [form, setForm] = useState(initialSettings);
  const { pending, message, fieldErrors, mutate } = useMutation();

  return (
    <section className="card">
      <div className="card-body space-y-5">
        <h2 className="card-title">주차 시스템 정보</h2>
        {message && (
          <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
            {message.text}
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="운영 시작 시간"
            htmlFor="open"
            required
            errors={fieldErrors.parkingOpenTime}
          >
            <input
              id="open"
              type="time"
              className={inputClassName(Boolean(fieldErrors.parkingOpenTime))}
              value={form.parkingOpenTime}
              onChange={(event) => setForm({ ...form, parkingOpenTime: event.target.value })}
            />
          </FormField>
          <FormField
            label="운영 종료 시간"
            htmlFor="close"
            required
            errors={fieldErrors.parkingCloseTime}
          >
            <input
              id="close"
              type="time"
              className={inputClassName(Boolean(fieldErrors.parkingCloseTime))}
              value={form.parkingCloseTime}
              onChange={(event) => setForm({ ...form, parkingCloseTime: event.target.value })}
            />
          </FormField>
          <FormField
            label="예약 최소 사전 신청 시간(분)"
            htmlFor="lead"
            required
            hint="신청자의 수정·취소 마감 기준으로도 사용됩니다."
            errors={fieldErrors.reservationMinLeadMinutes}
          >
            <input
              id="lead"
              type="number"
              min={0}
              max={1440}
              className={inputClassName(Boolean(fieldErrors.reservationMinLeadMinutes))}
              value={form.reservationMinLeadMinutes}
              onChange={(event) =>
                setForm({ ...form, reservationMinLeadMinutes: Number(event.target.value) })
              }
            />
          </FormField>
          <FormField
            label="출차 알림 기준(분 전)"
            htmlFor="reminder"
            required
            errors={fieldErrors.exitReminderMinutes}
          >
            <input
              id="reminder"
              type="number"
              min={1}
              max={180}
              className={inputClassName(Boolean(fieldErrors.exitReminderMinutes))}
              value={form.exitReminderMinutes}
              onChange={(event) =>
                setForm({ ...form, exitReminderMinutes: Number(event.target.value) })
              }
            />
          </FormField>
          <FormField
            label="최대 예약 시간(시간)"
            htmlFor="maxHours"
            required
            errors={fieldErrors.maxReservationHours}
          >
            <input
              id="maxHours"
              type="number"
              min={1}
              max={24}
              className={inputClassName(Boolean(fieldErrors.maxReservationHours))}
              value={form.maxReservationHours}
              onChange={(event) =>
                setForm({ ...form, maxReservationHours: Number(event.target.value) })
              }
            />
          </FormField>
        </div>

        <div className="space-y-2">
          <label className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 px-3">
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={form.spaceAssignmentEnabled}
              onChange={(event) =>
                setForm({ ...form, spaceAssignmentEnabled: event.target.checked })
              }
            />
            <span className="text-sm font-semibold text-slate-800">주차면 배정 사용</span>
          </label>
          <p className="text-xs text-slate-500">
            끄면 특정 주차 위치를 배정하지 않고 <strong>주차 가능 여부만</strong> 관리합니다. 승인
            메일, 예약 목록·상세, 대시보드에서 주차 위치 관련 항목이 함께 사라집니다. 이미 배정된
            예약의 기록은 그대로 보존되며, 다시 켜면 복원됩니다.
          </p>

          {!form.spaceAssignmentEnabled && (
            <FormField
              label="최대 주차 가능 대수"
              htmlFor="capacity"
              required
              errors={fieldErrors.parkingCapacity}
              hint="같은 시간대에 이 대수를 이미 채웠다면 승인이 차단됩니다. 주차면 배정을 사용할 때는 주차면 개수가 정원이 되므로 이 값을 쓰지 않습니다."
            >
              <input
                id="capacity"
                type="number"
                min={1}
                max={999}
                className={inputClassName(Boolean(fieldErrors.parkingCapacity))}
                value={form.parkingCapacity}
                onChange={(event) =>
                  setForm({ ...form, parkingCapacity: Number(event.target.value) })
                }
              />
            </FormField>
          )}

          <label
            className={`flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 px-3 ${
              form.spaceAssignmentEnabled ? '' : 'bg-slate-50 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={form.doubleParkingEnabled}
              disabled={!form.spaceAssignmentEnabled}
              onChange={(event) => setForm({ ...form, doubleParkingEnabled: event.target.checked })}
            />
            <span className="text-sm font-semibold text-slate-800">이중주차 사용</span>
          </label>
          {form.spaceAssignmentEnabled ? null : (
            <p className="text-xs text-slate-500">
              주차면 배정을 끈 상태에서는 이중주차 설정이 적용되지 않습니다.
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            mutate('/api/admin/settings', 'PUT', { settings: form }, '설정을 저장했습니다.')
          }
        >
          {pending ? '저장 중…' : '설정 저장'}
        </button>
      </div>
    </section>
  );
}

function NotificationSection({ emails }: { emails: NotificationEmail[] }) {
  const { pending, message, fieldErrors, mutate } = useMutation();
  const [form, setForm] = useState({
    email: '',
    recipientName: '',
    receiveNewRequest: true,
    receiveApprovalAlert: true,
    receiveDailySummary: false,
    receiveDoubleParkingAlert: true,
    isActive: true,
  });

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="card-body">
          <h2 className="card-title">관리자 알림 이메일</h2>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>수신자</th>
                  <th>신규신청</th>
                  <th>승인/변경</th>
                  <th>이중주차</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((item) => (
                  <tr key={item.notificationEmailId}>
                    <td className="text-xs">{item.email}</td>
                    <td className="text-xs">{item.recipientName ?? '-'}</td>
                    <td>{item.receiveNewRequest ? '✓' : '-'}</td>
                    <td>{item.receiveApprovalAlert ? '✓' : '-'}</td>
                    <td>{item.receiveDoubleParkingAlert ? '✓' : '-'}</td>
                    <td>{item.receiveDailySummary ? '✓' : '-'}</td>
                    <td>
                      <span
                        className={`badge ${item.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
                      >
                        {item.isActive ? '활성' : '비활성'}
                      </span>
                    </td>
                  </tr>
                ))}
                {emails.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-sm text-slate-500">
                      등록된 알림 이메일이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body space-y-4">
          <h2 className="card-title">알림 이메일 등록 / 수정</h2>
          <p className="field-hint">이미 등록된 이메일을 입력하면 수신 설정이 갱신됩니다.</p>
          {message && (
            <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
              {message.text}
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="이메일" htmlFor="notify-email" required errors={fieldErrors.email}>
              <input
                id="notify-email"
                type="email"
                className={inputClassName(Boolean(fieldErrors.email))}
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </FormField>
            <FormField label="수신자 이름" htmlFor="notify-name" errors={fieldErrors.recipientName}>
              <input
                id="notify-name"
                className={inputClassName(Boolean(fieldErrors.recipientName))}
                value={form.recipientName}
                onChange={(event) => setForm({ ...form, recipientName: event.target.value })}
              />
            </FormField>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['receiveNewRequest', '신규 신청 알림'],
                ['receiveApprovalAlert', '변경/취소 알림'],
                ['receiveDoubleParkingAlert', '이중주차 알림'],
                ['isActive', '활성화'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3"
              >
                <input
                  type="checkbox"
                  className="accent-brand-700 size-5"
                  checked={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
                />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !form.email}
            onClick={async () => {
              const saved = await mutate(
                '/api/admin/settings',
                'PUT',
                { notificationEmail: { ...form, recipientName: form.recipientName || null } },
                '알림 이메일을 저장했습니다.',
              );
              if (saved) setForm({ ...form, email: '', recipientName: '' });
            }}
          >
            {pending ? '저장 중…' : '알림 이메일 저장'}
          </button>
        </div>
      </section>
    </div>
  );
}

function AreaSection({ areas }: { areas: Area[] }) {
  const { pending, message, fieldErrors, mutate } = useMutation();
  const [editing, setEditing] = useState<Area | null>(areas[0] ?? null);

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="card-body">
          <h2 className="card-title">주차 구역 및 도면</h2>
          <p className="field-hint">
            도면은 참고용 이미지 URL 로만 관리합니다. 좌표 기반 배정 기능은 제공하지 않습니다.
          </p>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>코드</th>
                  <th>이름</th>
                  <th>도면 이미지</th>
                  <th>정렬</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {areas.map((area) => (
                  <tr key={area.areaId}>
                    <td className="font-mono text-xs">{area.areaCode}</td>
                    <td>{area.areaName}</td>
                    <td className="max-w-[240px] truncate text-xs text-slate-500">
                      {area.mapImageUrl ?? '-'}
                    </td>
                    <td>{area.displayOrder}</td>
                    <td>{area.isActive ? '활성' : '비활성'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        onClick={() => setEditing(area)}
                      >
                        수정
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {editing && (
        <section className="card">
          <div className="card-body space-y-4">
            <h2 className="card-title">{editing.areaCode} 구역 수정</h2>
            {message && (
              <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
                {message.text}
              </Alert>
            )}

            <FormField label="구역 이름" htmlFor="area-name" required errors={fieldErrors.areaName}>
              <input
                id="area-name"
                className={inputClassName(Boolean(fieldErrors.areaName))}
                value={editing.areaName}
                onChange={(event) => setEditing({ ...editing, areaName: event.target.value })}
              />
            </FormField>

            <FormField
              label="도면 이미지 URL"
              htmlFor="area-map"
              hint="/images/parking-map.svg 처럼 public 경로 또는 외부 URL 을 입력합니다."
              errors={fieldErrors.mapImageUrl}
            >
              <input
                id="area-map"
                className={inputClassName(Boolean(fieldErrors.mapImageUrl))}
                value={editing.mapImageUrl ?? ''}
                onChange={(event) => setEditing({ ...editing, mapImageUrl: event.target.value })}
              />
            </FormField>

            <FormField label="설명" htmlFor="area-desc" errors={fieldErrors.description}>
              <input
                id="area-desc"
                className={inputClassName(Boolean(fieldErrors.description))}
                value={editing.description ?? ''}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              />
            </FormField>

            <label className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 px-3">
              <input
                type="checkbox"
                className="accent-brand-700 size-5"
                checked={editing.isActive}
                onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
              />
              <span className="text-sm font-semibold text-slate-800">활성화</span>
            </label>

            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                mutate(
                  `/api/admin/parking-areas/${editing.areaId}`,
                  'PUT',
                  {
                    areaName: editing.areaName,
                    description: editing.description || null,
                    mapImageUrl: editing.mapImageUrl || null,
                    displayOrder: editing.displayOrder,
                    isActive: editing.isActive,
                  },
                  '구역 정보를 저장했습니다.',
                )
              }
            >
              {pending ? '저장 중…' : '구역 저장'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function SpaceSection({
  spaces,
  areas,
  spaceAssignmentEnabled,
}: {
  spaces: Space[];
  areas: Area[];
  spaceAssignmentEnabled: boolean;
}) {
  const { pending, message, fieldErrors, mutate } = useMutation();
  const [form, setForm] = useState({
    areaId: areas[0]?.areaId ?? 0,
    spaceCode: '',
    spaceName: '',
    spaceType: 'NORMAL' as keyof typeof SPACE_TYPE_LABEL,
    displayOrder: 0,
    isActive: true,
    memo: '',
  });

  return (
    <div className="space-y-4">
      {!spaceAssignmentEnabled && (
        <Alert variant="info" title="주차면 배정을 사용하지 않는 중입니다">
          [주차장 정보] 탭에서 주차면 배정이 꺼져 있어, 아래 주차면 정보는 현재 예약 처리에 사용되지
          않습니다. 등록해 둔 내용은 그대로 보존되며 다시 켜면 즉시 적용됩니다.
        </Alert>
      )}

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">주차면 목록 ({spaces.length}면)</h2>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>코드</th>
                  <th>유형</th>
                  <th>구역</th>
                  <th>정렬</th>
                  <th>상태</th>
                  <th>메모</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {spaces.map((space) => (
                  <tr key={space.spaceId}>
                    <td className="font-mono font-bold">{space.spaceCode}</td>
                    <td>
                      <SpaceTypeBadge spaceType={space.spaceType} />
                    </td>
                    <td className="text-xs">{space.area.areaName}</td>
                    <td>{space.displayOrder}</td>
                    <td>{space.isActive ? '활성' : '비활성'}</td>
                    <td className="text-xs text-slate-500">{space.memo ?? '-'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        disabled={pending}
                        onClick={() =>
                          mutate(
                            `/api/admin/parking-spaces/${space.spaceId}`,
                            'PUT',
                            { isActive: !space.isActive },
                            space.isActive
                              ? '주차면을 비활성화했습니다.'
                              : '주차면을 활성화했습니다.',
                          )
                        }
                      >
                        {space.isActive ? '비활성화' : '활성화'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body space-y-4">
          <h2 className="card-title">주차면 추가</h2>
          {message && (
            <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
              {message.text}
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="구역" htmlFor="space-area" required errors={fieldErrors.areaId}>
              <select
                id="space-area"
                className="input"
                value={form.areaId}
                onChange={(event) => setForm({ ...form, areaId: Number(event.target.value) })}
              >
                {areas.map((area) => (
                  <option key={area.areaId} value={area.areaId}>
                    {area.areaName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="주차면 코드"
              htmlFor="space-code"
              required
              errors={fieldErrors.spaceCode}
            >
              <input
                id="space-code"
                className={inputClassName(Boolean(fieldErrors.spaceCode))}
                value={form.spaceCode}
                onChange={(event) => setForm({ ...form, spaceCode: event.target.value })}
                placeholder="A-18"
              />
            </FormField>
            <FormField label="유형" htmlFor="space-type" required errors={fieldErrors.spaceType}>
              <select
                id="space-type"
                className="input"
                value={form.spaceType}
                onChange={(event) =>
                  setForm({
                    ...form,
                    spaceType: event.target.value as keyof typeof SPACE_TYPE_LABEL,
                  })
                }
              >
                {Object.entries(SPACE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="정렬 순서"
              htmlFor="space-order"
              required
              errors={fieldErrors.displayOrder}
            >
              <input
                id="space-order"
                type="number"
                min={0}
                className={inputClassName(Boolean(fieldErrors.displayOrder))}
                value={form.displayOrder}
                onChange={(event) => setForm({ ...form, displayOrder: Number(event.target.value) })}
              />
            </FormField>
          </div>

          <FormField label="메모" htmlFor="space-memo" errors={fieldErrors.memo}>
            <input
              id="space-memo"
              className={inputClassName(Boolean(fieldErrors.memo))}
              value={form.memo}
              onChange={(event) => setForm({ ...form, memo: event.target.value })}
            />
          </FormField>

          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !form.spaceCode}
            onClick={async () => {
              const saved = await mutate(
                '/api/admin/parking-spaces',
                'POST',
                {
                  ...form,
                  spaceName: form.spaceName || null,
                  memo: form.memo || null,
                },
                '주차면을 추가했습니다.',
              );
              if (saved) setForm({ ...form, spaceCode: '', memo: '' });
            }}
          >
            {pending ? '저장 중…' : '주차면 추가'}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminUserSection({ adminUsers }: { adminUsers: AdminUser[] }) {
  const { pending, message, fieldErrors, mutate } = useMutation();
  const [form, setForm] = useState({
    loginId: '',
    password: '',
    adminName: '',
    email: '',
    phone: '',
    roleCode: 'PARKING_ADMIN' as 'PARKING_ADMIN' | 'SYSTEM_ADMIN',
  });

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="card-body">
          <h2 className="card-title">관리자 계정</h2>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>로그인 ID</th>
                  <th>이름</th>
                  <th>이메일</th>
                  <th>연락처</th>
                  <th>권한</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((user) => (
                  <tr key={user.adminUserId}>
                    <td className="font-mono text-xs">{user.loginId}</td>
                    <td>{user.adminName}</td>
                    <td className="text-xs">{user.email}</td>
                    <td className="text-xs">{user.phone ?? '-'}</td>
                    <td>{user.roleCode === 'SYSTEM_ADMIN' ? '시스템 관리자' : '주차 관리자'}</td>
                    <td>
                      <span
                        className={`badge ${
                          user.accountStatus === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : user.accountStatus === 'LOCKED'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {user.accountStatus === 'ACTIVE'
                          ? '활성'
                          : user.accountStatus === 'LOCKED'
                            ? '잠금'
                            : '비활성'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        disabled={pending}
                        onClick={() =>
                          mutate(
                            `/api/admin/admin-users/${user.adminUserId}`,
                            'PUT',
                            {
                              accountStatus:
                                user.accountStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                            },
                            '계정 상태를 변경했습니다.',
                          )
                        }
                      >
                        {user.accountStatus === 'ACTIVE' ? '비활성화' : '활성화'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body space-y-4">
          <h2 className="card-title">관리자 계정 추가</h2>
          {message && (
            <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
              {message.text}
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="로그인 ID"
              htmlFor="admin-login"
              required
              errors={fieldErrors.loginId}
            >
              <input
                id="admin-login"
                className={inputClassName(Boolean(fieldErrors.loginId))}
                value={form.loginId}
                onChange={(event) => setForm({ ...form, loginId: event.target.value })}
                autoComplete="off"
              />
            </FormField>
            <FormField
              label="비밀번호"
              htmlFor="admin-password"
              required
              hint="10자 이상, 영문 대/소문자·숫자·특수문자 중 3종류 이상"
              errors={fieldErrors.password}
            >
              <input
                id="admin-password"
                type="password"
                className={inputClassName(Boolean(fieldErrors.password))}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="이름" htmlFor="admin-name" required errors={fieldErrors.adminName}>
              <input
                id="admin-name"
                className={inputClassName(Boolean(fieldErrors.adminName))}
                value={form.adminName}
                onChange={(event) => setForm({ ...form, adminName: event.target.value })}
              />
            </FormField>
            <FormField label="이메일" htmlFor="admin-email" required errors={fieldErrors.email}>
              <input
                id="admin-email"
                type="email"
                className={inputClassName(Boolean(fieldErrors.email))}
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </FormField>
            <FormField label="연락처" htmlFor="admin-phone" errors={fieldErrors.phone}>
              <input
                id="admin-phone"
                className={inputClassName(Boolean(fieldErrors.phone))}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </FormField>
            <FormField label="권한" htmlFor="admin-role" required errors={fieldErrors.roleCode}>
              <select
                id="admin-role"
                className="input"
                value={form.roleCode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    roleCode: event.target.value as 'PARKING_ADMIN' | 'SYSTEM_ADMIN',
                  })
                }
              >
                <option value="PARKING_ADMIN">주차 관리자</option>
                <option value="SYSTEM_ADMIN">시스템 관리자</option>
              </select>
            </FormField>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !form.loginId || !form.password}
            onClick={async () => {
              const saved = await mutate(
                '/api/admin/admin-users',
                'POST',
                { ...form, phone: form.phone || null },
                '관리자 계정을 생성했습니다.',
              );
              if (saved)
                setForm({
                  ...form,
                  loginId: '',
                  password: '',
                  adminName: '',
                  email: '',
                  phone: '',
                });
            }}
          >
            {pending ? '생성 중…' : '관리자 계정 생성'}
          </button>
        </div>
      </section>
    </div>
  );
}
