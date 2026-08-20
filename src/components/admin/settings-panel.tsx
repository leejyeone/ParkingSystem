'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MapImageUploader, type PendingMapImage } from '@/components/admin/map-image-uploader';
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
  isActive: boolean;
};

/** areaCode / displayOrder 는 DB 내부 구분·정렬용이라 화면 타입에서 제외한다. */
type Area = {
  areaId: number;
  areaName: string;
  description: string | null;
  /** 도면은 파일로 업로드해 DB 에 보관한다. 화면에는 파일명과 미리보기만 쓴다. */
  mapImageName: string | null;
  mapImageUpdatedAt: string | Date | null;
  isActive: boolean;
};

type Space = {
  spaceId: number;
  spaceCode: string;
  spaceName: string | null;
  spaceType: keyof typeof SPACE_TYPE_LABEL;
  isActive: boolean;
  memo: string | null;
  area: { areaId: number; areaName: string };
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
  { key: 'spaces', label: '구역·주차면' },
  { key: 'notification', label: '관리자 이메일' },
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

  async function mutate(
    url: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: unknown,
    successText: string,
  ) {
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
                    <td colSpan={6} className="text-center text-sm text-slate-500">
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

/**
 * 주차 구역(도면) + 주차면을 한 카드에서 관리한다.
 *
 * 구역 코드(area_code)와 정렬 순서(display_order)는 화면에 노출하지 않는다.
 * DB 내부 구분/정렬용이며 서버가 자동으로 부여한다.
 */
function SpaceSection({
  spaces,
  areas,
  spaceAssignmentEnabled,
}: {
  spaces: Space[];
  areas: Area[];
  spaceAssignmentEnabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  /** 편집 중인 구역 값 */
  const [areaDrafts, setAreaDrafts] = useState<Record<number, AreaDraft>>({});
  /** 선택했지만 아직 저장하지 않은 도면 파일 (구역별) */
  const [mapFiles, setMapFiles] = useState<Record<number, PendingMapImage | null>>({});
  /** 저장 시 도면을 지울 구역 */
  const [mapRemovals, setMapRemovals] = useState<number[]>([]);
  /** 도면 선택 단계에서 생긴 오류 (구역별) */
  const [mapErrors, setMapErrors] = useState<Record<number, string>>({});
  /** 편집 중인 기존 주차면 값. 상단 [저장]을 누를 때 한꺼번에 반영한다. */
  const [drafts, setDrafts] = useState<Record<number, SpaceDraft>>({});
  /** 삭제 표시된 주차면. 저장 시 함께 처리한다. */
  const [removed, setRemoved] = useState<number[]>([]);
  /** 새로 추가한 주차면. 표 맨 아래에 쌓인다. */
  const [added, setAdded] = useState<SpaceDraft[]>([]);

  function areaDraftOf(area: Area): AreaDraft {
    return areaDrafts[area.areaId] ?? toAreaDraft(area);
  }

  function updateAreaDraft(areaId: number, patch: Partial<AreaDraft>) {
    setAreaDrafts((previous) => ({
      ...previous,
      [areaId]: { ...(previous[areaId] ?? toAreaDraftById(areas, areaId)), ...patch },
    }));
  }

  function draftOf(space: Space): SpaceDraft {
    return drafts[space.spaceId] ?? toSpaceDraft(space);
  }

  function updateDraft(spaceId: number, patch: Partial<SpaceDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [spaceId]: { ...(previous[spaceId] ?? toSpaceDraftById(spaces, spaceId)), ...patch },
    }));
  }

  function reset() {
    setAreaDrafts({});
    setMapFiles({});
    setMapRemovals([]);
    setMapErrors({});
    setDrafts({});
    setRemoved([]);
    setAdded([]);
    setMessage(null);
  }

  function closeEditing() {
    reset();
    setEditing(false);
  }

  const changedCount =
    added.length +
    removed.length +
    Object.values(mapFiles).filter(Boolean).length +
    mapRemovals.length +
    areas.filter(
      (area) => areaDrafts[area.areaId] && !isSameArea(areaDrafts[area.areaId], toAreaDraft(area)),
    ).length +
    spaces.filter(
      (space) => drafts[space.spaceId] && !isSameDraft(drafts[space.spaceId], toSpaceDraft(space)),
    ).length;

  /** 변경된 것만 순서대로 반영한다. 일부가 실패해도 나머지는 계속 처리하고 결과를 알린다. */
  async function saveAll() {
    setPending(true);
    setMessage(null);

    const failures: string[] = [];
    let done = 0;

    // 도면은 multipart 라 JSON 요청과 함께 보낼 수 없다. 같은 [저장]에서 순서대로 처리한다.
    for (const area of areas) {
      if (mapRemovals.includes(area.areaId)) {
        const response = await fetch(`/api/admin/parking-areas/${area.areaId}/map`, {
          method: 'DELETE',
        });
        if (response.ok) done += 1;
        else failures.push(`${area.areaName} 도면 삭제 실패`);
        continue;
      }

      const selected = mapFiles[area.areaId];
      if (!selected) continue;

      const body = new FormData();
      body.append('file', selected.file);
      const response = await fetch(`/api/admin/parking-areas/${area.areaId}/map`, {
        method: 'POST',
        body,
      });
      if (response.ok) {
        done += 1;
      } else {
        const payload = await response.json().catch(() => null);
        failures.push(`${area.areaName} 도면: ${payload?.error?.message ?? '업로드 실패'}`);
      }
    }

    for (const area of areas) {
      const draft = areaDrafts[area.areaId];
      if (!draft || isSameArea(draft, toAreaDraft(area))) continue;

      const response = await apiRequest(`/api/admin/parking-areas/${area.areaId}`, {
        method: 'PUT',
        body: JSON.stringify({
          areaName: draft.areaName,
          description: draft.description || null,
          isActive: draft.isActive,
        }),
      });
      if (response.ok) done += 1;
      else failures.push(`${area.areaName} 구역: ${response.error.message}`);
    }

    for (const spaceId of removed) {
      const target = spaces.find((space) => space.spaceId === spaceId);
      const response = await apiRequest(`/api/admin/parking-spaces/${spaceId}`, {
        method: 'DELETE',
      });
      if (response.ok) done += 1;
      else failures.push(`${target?.spaceCode ?? spaceId} 삭제: ${response.error.message}`);
    }

    for (const space of spaces) {
      const draft = drafts[space.spaceId];
      if (!draft || removed.includes(space.spaceId)) continue;
      if (isSameDraft(draft, toSpaceDraft(space))) continue;

      const response = await apiRequest(`/api/admin/parking-spaces/${space.spaceId}`, {
        method: 'PUT',
        body: JSON.stringify({
          areaId: draft.areaId,
          spaceCode: draft.spaceCode,
          spaceType: draft.spaceType,
          isActive: draft.isActive,
          memo: draft.memo || null,
        }),
      });
      if (response.ok) done += 1;
      else failures.push(`${space.spaceCode} 수정: ${response.error.message}`);
    }

    for (const draft of added) {
      if (!draft.spaceCode.trim()) continue;
      const response = await apiRequest('/api/admin/parking-spaces', {
        method: 'POST',
        body: JSON.stringify({
          areaId: draft.areaId,
          spaceCode: draft.spaceCode,
          spaceName: null,
          spaceType: draft.spaceType,
          isActive: draft.isActive,
          memo: draft.memo || null,
        }),
      });
      if (response.ok) done += 1;
      else failures.push(`${draft.spaceCode} 추가: ${response.error.message}`);
    }

    setPending(false);
    router.refresh();

    if (failures.length === 0) {
      setMessage({ variant: 'success', text: `${done}건을 저장했습니다.` });
      reset();
      setEditing(false);
      return;
    }
    setMessage({
      variant: 'error',
      text: `${done}건 저장, ${failures.length}건 실패 — ${failures.join(' / ')}`,
    });
    // 실패한 항목을 고칠 수 있도록 편집 상태는 유지한다.
  }

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title">주차 구역 및 주차면 ({spaces.length}면)</h2>
            {editing ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                  disabled={pending}
                  onClick={() => setAdded((previous) => [...previous, emptySpaceDraft(areas)])}
                >
                  + 추가
                </button>
                <button
                  type="button"
                  className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
                  disabled={pending || changedCount === 0}
                  onClick={saveAll}
                >
                  {pending ? '저장 중…' : `저장`}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                  disabled={pending}
                  onClick={closeEditing}
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                onClick={() => setEditing(true)}
              >
                수정
              </button>
            )}
          </div>

          {message && (
            <div className="mt-3">
              <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
                {message.text}
              </Alert>
            </div>
          )}

          {editing && (
            <p className="field-hint mt-2">
              값을 고치고 [추가]·[삭제]로 주차면을 늘리거나 지운 뒤, 상단 [저장]을 한 번 누르면
              구역과 주차면이 모두 반영됩니다. 예약에 사용된 적 있는 주차면은 이력 보존을 위해
              삭제되지 않으니 상태를 &lsquo;비활성&rsquo;으로 바꿔 운영에서 제외하세요.
            </p>
          )}

          {/* 구역·도면 — 주차면 표 위에 둔다. */}
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-700">구역 및 도면</h3>
            {areas.length === 0 && <p className="field-hint">등록된 구역이 없습니다.</p>}
            {areas.map((area) => {
              const draft = areaDraftOf(area);
              return (
                <div key={area.areaId} className="rounded-lg border border-slate-200 p-3">
                  {editing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField label="구역 이름" htmlFor={`area-name-${area.areaId}`} required>
                          <input
                            id={`area-name-${area.areaId}`}
                            className="input"
                            value={draft.areaName}
                            onChange={(event) =>
                              updateAreaDraft(area.areaId, { areaName: event.target.value })
                            }
                          />
                        </FormField>
                        <FormField label="설명" htmlFor={`area-desc-${area.areaId}`}>
                          <input
                            id={`area-desc-${area.areaId}`}
                            className="input"
                            value={draft.description}
                            onChange={(event) =>
                              updateAreaDraft(area.areaId, { description: event.target.value })
                            }
                          />
                        </FormField>
                      </div>

                      <MapImageUploader
                        area={area}
                        pending={mapFiles[area.areaId] ?? null}
                        markedForRemoval={mapRemovals.includes(area.areaId)}
                        disabled={pending}
                        error={mapErrors[area.areaId]}
                        onSelect={(selected) =>
                          setMapFiles((previous) => ({ ...previous, [area.areaId]: selected }))
                        }
                        onToggleRemoval={() =>
                          setMapRemovals((previous) =>
                            previous.includes(area.areaId)
                              ? previous.filter((id) => id !== area.areaId)
                              : [...previous, area.areaId],
                          )
                        }
                        onError={(text) =>
                          setMapErrors((previous) => ({ ...previous, [area.areaId]: text }))
                        }
                      />

                      <label className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 px-3">
                        <input
                          type="checkbox"
                          className="accent-brand-700 size-5"
                          checked={draft.isActive}
                          onChange={(event) =>
                            updateAreaDraft(area.areaId, { isActive: event.target.checked })
                          }
                        />
                        <span className="text-sm font-semibold text-slate-800">구역 활성화</span>
                      </label>
                    </div>
                  ) : (
                    <dl className="grid gap-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">{area.areaName}</span>
                        <span
                          className={`badge ${
                            area.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {area.isActive ? '활성' : '비활성'}
                        </span>
                      </div>
                      {area.description && (
                        <p className="text-xs text-slate-500">{area.description}</p>
                      )}
                      <p className="text-xs break-all text-slate-500">
                        도면: {area.mapImageName ?? '등록 안 함'}
                      </p>
                    </dl>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="mt-5 text-sm font-bold text-slate-700">주차면</h3>
          <div className="table-scroll mt-2">
            <table className="data-table">
              <thead>
                <tr>
                  <th>코드</th>
                  <th>유형</th>
                  <th>구역</th>
                  <th>상태</th>
                  <th>메모</th>
                  {editing && <th></th>}
                </tr>
              </thead>
              <tbody>
                {spaces.map((space) => {
                  const draft = draftOf(space);
                  const isRemoved = removed.includes(space.spaceId);

                  if (!editing) {
                    return (
                      <tr key={space.spaceId}>
                        <td className="font-mono font-bold">{space.spaceCode}</td>
                        <td>
                          <SpaceTypeBadge spaceType={space.spaceType} />
                        </td>
                        <td className="text-xs">{space.area.areaName}</td>
                        <td className="whitespace-nowrap">{space.isActive ? '활성' : '비활성'}</td>
                        <td className="text-xs text-slate-500">{space.memo ?? '-'}</td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={space.spaceId} className={isRemoved ? 'bg-red-50 opacity-60' : ''}>
                      <td>
                        <input
                          className="input"
                          value={draft.spaceCode}
                          disabled={isRemoved}
                          onChange={(event) =>
                            updateDraft(space.spaceId, { spaceCode: event.target.value })
                          }
                          aria-label={`${space.spaceCode} 코드`}
                        />
                      </td>
                      <td>
                        <select
                          className="input"
                          value={draft.spaceType}
                          disabled={isRemoved}
                          onChange={(event) =>
                            updateDraft(space.spaceId, {
                              spaceType: event.target.value as keyof typeof SPACE_TYPE_LABEL,
                            })
                          }
                          aria-label={`${space.spaceCode} 유형`}
                        >
                          {Object.entries(SPACE_TYPE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="input"
                          value={draft.areaId}
                          disabled={isRemoved}
                          onChange={(event) =>
                            updateDraft(space.spaceId, { areaId: Number(event.target.value) })
                          }
                          aria-label={`${space.spaceCode} 구역`}
                        >
                          {areas.map((area) => (
                            <option key={area.areaId} value={area.areaId}>
                              {area.areaName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="input"
                          value={draft.isActive ? 'ACTIVE' : 'INACTIVE'}
                          disabled={isRemoved}
                          onChange={(event) =>
                            updateDraft(space.spaceId, {
                              isActive: event.target.value === 'ACTIVE',
                            })
                          }
                          aria-label={`${space.spaceCode} 상태`}
                        >
                          <option value="ACTIVE">활성</option>
                          <option value="INACTIVE">비활성</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="input"
                          value={draft.memo}
                          disabled={isRemoved}
                          onChange={(event) =>
                            updateDraft(space.spaceId, { memo: event.target.value })
                          }
                          aria-label={`${space.spaceCode} 메모`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`btn min-h-9 px-2 py-1.5 text-xs ${
                            isRemoved ? 'btn-secondary' : 'btn-danger-outline'
                          }`}
                          disabled={pending}
                          onClick={() =>
                            setRemoved((previous) =>
                              isRemoved
                                ? previous.filter((id) => id !== space.spaceId)
                                : [...previous, space.spaceId],
                            )
                          }
                        >
                          {isRemoved ? '취소' : '삭제'}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* 새로 추가한 행은 항상 표 맨 아래에 쌓인다. */}
                {editing &&
                  added.map((draft, index) => (
                    <tr key={`new-${index}`} className="bg-brand-50">
                      <td>
                        <input
                          className="input"
                          value={draft.spaceCode}
                          onChange={(event) =>
                            setAdded((previous) =>
                              previous.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, spaceCode: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="A-18"
                          aria-label={`새 주차면 ${index + 1} 코드`}
                        />
                      </td>
                      <td>
                        <select
                          className="input"
                          value={draft.spaceType}
                          onChange={(event) =>
                            setAdded((previous) =>
                              previous.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      spaceType: event.target
                                        .value as keyof typeof SPACE_TYPE_LABEL,
                                    }
                                  : item,
                              ),
                            )
                          }
                          aria-label={`새 주차면 ${index + 1} 유형`}
                        >
                          {Object.entries(SPACE_TYPE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="input"
                          value={draft.areaId}
                          onChange={(event) =>
                            setAdded((previous) =>
                              previous.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, areaId: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                          aria-label={`새 주차면 ${index + 1} 구역`}
                        >
                          {areas.map((area) => (
                            <option key={area.areaId} value={area.areaId}>
                              {area.areaName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="text-xs whitespace-nowrap text-slate-500">활성</td>
                      <td>
                        <input
                          className="input"
                          value={draft.memo}
                          onChange={(event) =>
                            setAdded((previous) =>
                              previous.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, memo: event.target.value } : item,
                              ),
                            )
                          }
                          aria-label={`새 주차면 ${index + 1} 메모`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-danger-outline min-h-9 px-2 py-1.5 text-xs"
                          disabled={pending}
                          onClick={() =>
                            setAdded((previous) =>
                              previous.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

type AreaDraft = {
  areaName: string;
  description: string;
  isActive: boolean;
};

function toAreaDraft(area: Area): AreaDraft {
  return {
    areaName: area.areaName,
    description: area.description ?? '',
    isActive: area.isActive,
  };
}

function toAreaDraftById(areas: Area[], areaId: number): AreaDraft {
  const found = areas.find((area) => area.areaId === areaId);
  return found ? toAreaDraft(found) : { areaName: '', description: '', isActive: true };
}

function isSameArea(a: AreaDraft, b: AreaDraft): boolean {
  return a.areaName === b.areaName && a.description === b.description && a.isActive === b.isActive;
}

type SpaceDraft = {
  areaId: number;
  spaceCode: string;
  spaceType: keyof typeof SPACE_TYPE_LABEL;
  isActive: boolean;
  memo: string;
};

function toSpaceDraft(space: Space): SpaceDraft {
  return {
    areaId: space.area.areaId,
    spaceCode: space.spaceCode,
    spaceType: space.spaceType,
    isActive: space.isActive,
    memo: space.memo ?? '',
  };
}

function toSpaceDraftById(spaces: Space[], spaceId: number): SpaceDraft {
  const found = spaces.find((space) => space.spaceId === spaceId);
  return found ? toSpaceDraft(found) : emptySpaceDraft([]);
}

function emptySpaceDraft(areas: Area[]): SpaceDraft {
  return {
    areaId: areas[0]?.areaId ?? 0,
    spaceCode: '',
    spaceType: 'NORMAL',
    isActive: true,
    memo: '',
  };
}

function isSameDraft(a: SpaceDraft, b: SpaceDraft): boolean {
  return (
    a.areaId === b.areaId &&
    a.spaceCode === b.spaceCode &&
    a.spaceType === b.spaceType &&
    a.isActive === b.isActive &&
    a.memo === b.memo
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
