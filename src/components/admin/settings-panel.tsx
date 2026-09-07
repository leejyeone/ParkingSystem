'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MapImageUploader, type PendingMapImage } from '@/components/admin/map-image-uploader';
import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { SpaceTypeBadge } from '@/components/ui/status-badge';
import { SPACE_TYPE_LABEL } from '@/domain/reservation-status';
import type { SystemSettingsValues } from '@/domain/system-settings';
import { apiRequest } from '@/lib/client/api-client';
import { buildMapImageUrl } from '@/lib/map-image';

type NotificationEmail = {
  notificationEmailId: number;
  email: string;
  recipientName: string | null;
  receiveNewRequest: boolean;
  receiveChangeAlert: boolean;
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
  adminName: string;
  email: string;
  phone: string | null;
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  role: 'SYSTEM_ADMIN' | 'PARKING_ADMIN';
  lastLoginAt: string | null;
};

const ADMIN_ROLE_LABEL = { SYSTEM_ADMIN: '시스템 관리자', PARKING_ADMIN: '주차 관리자' } as const;

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

export function PolicySection({ initialSettings }: { initialSettings: SystemSettingsValues }) {
  const [form, setForm] = useState(initialSettings);
  const { pending, message, fieldErrors, mutate } = useMutation();

  return (
    <section className="card">
      <div className="card-body space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">방문 시스템 정보</h2>
          <button
            type="button"
            className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() =>
              mutate('/api/admin/settings', 'PUT', { settings: form }, '설정을 저장했습니다.')
            }
          >
            {pending ? '저장 중…' : '설정 저장'}
          </button>
        </div>
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
          <FormField
            label="주차면 간 완충 시간(분)"
            htmlFor="spaceBufferMinutes"
            required
            hint="같은 주차면에 배정된 예약 사이에 최소로 띄울 시간입니다."
            errors={fieldErrors.spaceBufferMinutes}
          >
            <input
              id="spaceBufferMinutes"
              type="number"
              min={0}
              max={60}
              className={inputClassName(Boolean(fieldErrors.spaceBufferMinutes))}
              value={form.spaceBufferMinutes}
              onChange={(event) =>
                setForm({ ...form, spaceBufferMinutes: Number(event.target.value) })
              }
            />
          </FormField>
          <FormField
            label="대시보드 자동 새로고침 주기(분)"
            htmlFor="dashboardRefreshInterval"
            required
            hint="대시보드를 상시 띄워 놓을 때 자동으로 갱신되는 간격입니다."
            errors={fieldErrors.dashboardRefreshIntervalMinutes}
          >
            <input
              id="dashboardRefreshInterval"
              type="number"
              min={1}
              max={60}
              className={inputClassName(Boolean(fieldErrors.dashboardRefreshIntervalMinutes))}
              value={form.dashboardRefreshIntervalMinutes}
              onChange={(event) =>
                setForm({ ...form, dashboardRefreshIntervalMinutes: Number(event.target.value) })
              }
            />
          </FormField>
          <FormField
            label="개인정보 보관 기간(일)"
            htmlFor="personalDataRetentionDays"
            required
            hint="방문 종료 후 개인 정보 보관 기간을 설정해주세요."
            errors={fieldErrors.personalDataRetentionDays}
          >
            <input
              id="personalDataRetentionDays"
              type="number"
              min={1}
              max={3650}
              className={inputClassName(Boolean(fieldErrors.personalDataRetentionDays))}
              value={form.personalDataRetentionDays}
              onChange={(event) =>
                setForm({ ...form, personalDataRetentionDays: Number(event.target.value) })
              }
            />
          </FormField>
        </div>

        <div className="space-y-2">
          <label className="border-line flex min-h-12 items-center gap-3 rounded-lg border px-3">
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={form.entryExitManagementEnabled}
              onChange={(event) =>
                setForm({ ...form, entryExitManagementEnabled: event.target.checked })
              }
            />
            <span className="text-ink text-sm font-semibold">실제 입·출차 관리 사용</span>
          </label>
        </div>

        <div className="space-y-2">
          <label className="border-line flex min-h-12 items-center gap-3 rounded-lg border px-3">
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={form.spaceAssignmentEnabled}
              onChange={(event) =>
                setForm({ ...form, spaceAssignmentEnabled: event.target.checked })
              }
            />
            <span className="text-ink text-sm font-semibold">주차면 배정 사용</span>
          </label>
          <p className="text-ink-faint text-xs">
            끄면 특정 주차 위치를 배정하지 않고 <strong>주차 가능 여부만</strong> 관리합니다.
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
            className={`border-line flex min-h-12 items-center gap-3 rounded-lg border px-3 ${
              form.spaceAssignmentEnabled ? '' : 'bg-surface-muted opacity-60'
            }`}
          >
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={form.doubleParkingEnabled}
              disabled={!form.spaceAssignmentEnabled}
              onChange={(event) => setForm({ ...form, doubleParkingEnabled: event.target.checked })}
            />
            <span className="text-ink text-sm font-semibold">이중주차 사용</span>
          </label>
          {form.spaceAssignmentEnabled ? null : (
            <p className="text-ink-faint text-xs">
              주차면 배정을 끈 상태에서는 이중주차 설정이 적용되지 않습니다.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

type NotificationDraft = {
  recipientName: string;
  receiveNewRequest: boolean;
  receiveChangeAlert: boolean;
  isActive: boolean;
};

function toNotificationDraft(item: NotificationEmail): NotificationDraft {
  return {
    recipientName: item.recipientName ?? '',
    receiveNewRequest: item.receiveNewRequest,
    receiveChangeAlert: item.receiveChangeAlert,
    isActive: item.isActive,
  };
}

function toNotificationDraftById(emails: NotificationEmail[], id: number): NotificationDraft {
  const found = emails.find((item) => item.notificationEmailId === id);
  return found
    ? toNotificationDraft(found)
    : { recipientName: '', receiveNewRequest: true, receiveChangeAlert: true, isActive: true };
}

function isSameNotification(a: NotificationDraft, b: NotificationDraft): boolean {
  return (
    a.recipientName === b.recipientName &&
    a.receiveNewRequest === b.receiveNewRequest &&
    a.receiveChangeAlert === b.receiveChangeAlert &&
    a.isActive === b.isActive
  );
}

/**
 * 알림 수신자 목록. 구역·주차면과 같은 편집 모드로 수정·삭제한다.
 *
 * 이메일 주소는 편집 대상에서 뺀다. 등록/수정에 쓰는 `PUT /api/admin/settings` 가 **주소를 키로**
 * upsert 하기 때문에, 주소를 고치면 수정이 아니라 새 행이 생긴다.
 * 주소를 바꿔야 하면 지우고 아래 카드에서 다시 등록한다.
 */
function NotificationTable({ emails }: { emails: NotificationEmail[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  /** 편집 중인 값. 상단 [저장]을 누를 때 한꺼번에 반영한다. */
  const [drafts, setDrafts] = useState<Record<number, NotificationDraft>>({});
  /** 삭제 표시된 수신자. 저장 시 함께 처리한다. */
  const [removed, setRemoved] = useState<number[]>([]);

  function draftOf(item: NotificationEmail): NotificationDraft {
    return drafts[item.notificationEmailId] ?? toNotificationDraft(item);
  }

  function updateDraft(id: number, patch: Partial<NotificationDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? toNotificationDraftById(emails, id)), ...patch },
    }));
  }

  function reset() {
    setDrafts({});
    setRemoved([]);
    setMessage(null);
  }

  const changedCount =
    removed.length +
    emails.filter(
      (item) =>
        drafts[item.notificationEmailId] &&
        !isSameNotification(drafts[item.notificationEmailId], toNotificationDraft(item)),
    ).length;

  /** 변경된 것만 순서대로 반영한다. 일부가 실패해도 나머지는 계속 처리하고 결과를 알린다. */
  async function saveAll() {
    setPending(true);
    setMessage(null);

    const failures: string[] = [];
    let done = 0;

    for (const id of removed) {
      const target = emails.find((item) => item.notificationEmailId === id);
      const response = await apiRequest(`/api/admin/notification-emails/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) done += 1;
      else failures.push(`${target?.email ?? id} 삭제: ${response.error.message}`);
    }

    for (const item of emails) {
      const draft = drafts[item.notificationEmailId];
      if (!draft || removed.includes(item.notificationEmailId)) continue;
      if (isSameNotification(draft, toNotificationDraft(item))) continue;

      const response = await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          notificationEmail: {
            email: item.email,
            recipientName: draft.recipientName || null,
            receiveNewRequest: draft.receiveNewRequest,
            receiveChangeAlert: draft.receiveChangeAlert,
            isActive: draft.isActive,
          },
        }),
      });
      if (response.ok) done += 1;
      else failures.push(`${item.email} 수정: ${response.error.message}`);
    }

    setPending(false);
    router.refresh();

    if (failures.length === 0) {
      // reset() 이 내부적으로 setMessage(null) 을 호출하므로, 반드시 먼저 비운 뒤에
      // 성공 메시지를 설정해야 화면에 남는다(순서를 바꾸면 방금 띄운 메시지가 곧바로 지워진다).
      reset();
      setEditing(false);
      setMessage({ variant: 'success', text: `${done}건을 저장했습니다.` });
      return;
    }
    setMessage({
      variant: 'error',
      text: `${done}건 저장, ${failures.length}건 실패 — ${failures.join(' / ')}`,
    });
    // 실패한 항목을 고칠 수 있도록 편집 상태는 유지한다.
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">관리자 알림 이메일 ({emails.length}명)</h2>
          {editing ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
                disabled={pending || changedCount === 0}
                onClick={saveAll}
              >
                {pending ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                disabled={pending}
                onClick={() => {
                  reset();
                  setEditing(false);
                }}
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
              disabled={emails.length === 0}
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
            값을 고치고 [삭제]로 수신자를 지운 뒤, 상단 [저장]을 한 번 누르면 모두 반영됩니다. 이미
            등록된 주소는 바꿀 수 없으니, 주소를 바꾸려면 지우고 아래에서 다시 등록하세요.
          </p>
        )}

        <div className="table-scroll mt-3">
          {/* 편집 모드는 칸마다 입력이 들어가 보기 모드보다 넓은 폭이 필요하다. */}
          <table className={`data-table ${editing ? 'min-w-[820px] table-fixed' : ''}`}>
            <thead>
              <tr>
                <th className={editing ? 'w-64' : ''}>이메일</th>
                <th className={editing ? 'w-40' : ''}>수신자</th>
                <th className={editing ? 'w-24' : ''}>신규신청</th>
                <th className={editing ? 'w-24' : ''}>변경/취소</th>
                <th className={editing ? 'w-32' : ''}>상태</th>
                {editing && <th className="w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {emails.map((item) => {
                const draft = draftOf(item);
                const isRemoved = removed.includes(item.notificationEmailId);

                if (!editing) {
                  return (
                    <tr key={item.notificationEmailId}>
                      <td className="text-xs">{item.email}</td>
                      <td className="text-xs">{item.recipientName ?? '-'}</td>
                      <td>{item.receiveNewRequest ? '✓' : '-'}</td>
                      <td>{item.receiveChangeAlert ? '✓' : '-'}</td>
                      <td>
                        <span
                          className={`badge ${item.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-active text-ink-muted'}`}
                        >
                          {item.isActive ? '활성' : '비활성'}
                        </span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={item.notificationEmailId}
                    className={isRemoved ? 'bg-red-50 opacity-60' : ''}
                  >
                    {/* 주소는 upsert 의 키라 고치면 새 행이 생긴다. 읽기 전용으로 둔다. */}
                    <td className="text-xs break-all">{item.email}</td>
                    <td>
                      <input
                        className="input"
                        value={draft.recipientName}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(item.notificationEmailId, {
                            recipientName: event.target.value,
                          })
                        }
                        aria-label={`${item.email} 수신자 이름`}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="accent-brand-700 size-5"
                        checked={draft.receiveNewRequest}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(item.notificationEmailId, {
                            receiveNewRequest: event.target.checked,
                          })
                        }
                        aria-label={`${item.email} 신규 신청 알림`}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="accent-brand-700 size-5"
                        checked={draft.receiveChangeAlert}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(item.notificationEmailId, {
                            receiveChangeAlert: event.target.checked,
                          })
                        }
                        aria-label={`${item.email} 변경/취소 알림`}
                      />
                    </td>
                    <td>
                      <select
                        className="input"
                        value={draft.isActive ? 'ACTIVE' : 'INACTIVE'}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(item.notificationEmailId, {
                            isActive: event.target.value === 'ACTIVE',
                          })
                        }
                        aria-label={`${item.email} 상태`}
                      >
                        <option value="ACTIVE">활성</option>
                        <option value="INACTIVE">비활성</option>
                      </select>
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
                              ? previous.filter((id) => id !== item.notificationEmailId)
                              : [...previous, item.notificationEmailId],
                          )
                        }
                      >
                        {isRemoved ? '취소' : '삭제'}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {emails.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-ink-faint text-center text-sm">
                    등록된 알림 이메일이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function NotificationSection({ emails }: { emails: NotificationEmail[] }) {
  const { pending, message, fieldErrors, mutate } = useMutation();
  const [form, setForm] = useState({
    email: '',
    recipientName: '',
    receiveNewRequest: true,
    receiveChangeAlert: true,
    isActive: true,
  });

  return (
    <div className="space-y-4">
      <NotificationTable emails={emails} />

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
                ['receiveChangeAlert', '변경/취소 알림'],
                ['isActive', '활성화'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="border-line flex min-h-11 items-center gap-3 rounded-lg border px-3"
              >
                <input
                  type="checkbox"
                  className="accent-brand-700 size-5"
                  checked={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
                />
                <span className="text-ink-muted text-sm">{label}</span>
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
export function SpaceSection({
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
  /**
   * 지금 개별 저장 중인 행. 기존 행은 `existing-{spaceId}`, 새로 추가한 행은
   * `added-{index}` 로 구분한다. 전체 [저장]과 별개로 한 행만 즉시 반영할 때 쓴다.
   */
  const [rowPending, setRowPending] = useState<string | null>(null);

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
      // reset() 이 내부적으로 setMessage(null) 을 호출하므로, 반드시 먼저 비운 뒤에
      // 성공 메시지를 설정해야 화면에 남는다(순서를 바꾸면 방금 띄운 메시지가 곧바로 지워진다).
      reset();
      setEditing(false);
      setMessage({ variant: 'success', text: `${done}건을 저장했습니다.` });
      return;
    }
    setMessage({
      variant: 'error',
      text: `${done}건 저장, ${failures.length}건 실패 — ${failures.join(' / ')}`,
    });
    // 실패한 항목을 고칠 수 있도록 편집 상태는 유지한다.
  }

  /** 상단 [저장]까지 기다리지 않고, 고친 주차면 한 행만 바로 반영한다. */
  async function saveOneSpace(space: Space) {
    const draft = draftOf(space);
    if (isSameDraft(draft, toSpaceDraft(space))) return;

    setRowPending(`existing-${space.spaceId}`);
    setMessage(null);
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
    setRowPending(null);

    if (response.ok) {
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[space.spaceId];
        return next;
      });
      setMessage({ variant: 'success', text: `${draft.spaceCode}을(를) 저장했습니다.` });
      router.refresh();
      return;
    }
    setMessage({
      variant: 'error',
      text: `${draft.spaceCode} 저장 실패: ${response.error.message}`,
    });
  }

  /** 새로 추가한 행 한 개만 바로 등록한다. */
  async function saveOneAdded(index: number) {
    const draft = added[index];
    if (!draft?.spaceCode.trim()) return;

    setRowPending(`added-${index}`);
    setMessage(null);
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
    setRowPending(null);

    if (response.ok) {
      setAdded((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
      setMessage({ variant: 'success', text: `${draft.spaceCode}을(를) 추가했습니다.` });
      router.refresh();
      return;
    }
    setMessage({
      variant: 'error',
      text: `${draft.spaceCode} 추가 실패: ${response.error.message}`,
    });
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
              구역과 주차면이 모두 반영됩니다. [삭제]해도 이력 보존을 위해 실제로 지워지지 않고
              &lsquo;비활성&rsquo; 상태로 바뀌어 운영에서만 제외됩니다.
            </p>
          )}

          {/* 구역·도면 — 주차면 표 위에 둔다. */}
          <div className="mt-4 space-y-3">
            <h3 className="text-ink-muted text-sm font-bold">구역 및 도면</h3>
            {areas.length === 0 && <p className="field-hint">등록된 구역이 없습니다.</p>}
            {areas.map((area) => {
              const draft = areaDraftOf(area);
              return (
                <div key={area.areaId} className="border-line rounded-lg border p-3">
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

                      <label className="border-line flex min-h-12 items-center gap-3 rounded-lg border px-3">
                        <input
                          type="checkbox"
                          className="accent-brand-700 size-5"
                          checked={draft.isActive}
                          onChange={(event) =>
                            updateAreaDraft(area.areaId, { isActive: event.target.checked })
                          }
                        />
                        <span className="text-ink text-sm font-semibold">구역 활성화</span>
                      </label>
                    </div>
                  ) : (
                    <dl className="grid gap-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink font-bold">{area.areaName}</span>
                        <span
                          className={`badge ${
                            area.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-surface-active text-ink-muted'
                          }`}
                        >
                          {area.isActive ? '활성' : '비활성'}
                        </span>
                      </div>
                      {area.description && (
                        <p className="text-ink-faint text-xs">{area.description}</p>
                      )}
                      <p className="text-ink-faint text-xs break-all">
                        도면: {area.mapImageName ?? '등록 안 함'}
                      </p>
                      {area.mapImageName && (
                        <a
                          href={buildMapImageUrl(
                            area.areaId,
                            area.mapImageUpdatedAt ? new Date(area.mapImageUpdatedAt) : null,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border-line bg-surface-muted mt-1 block max-w-xs overflow-hidden rounded-lg border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={buildMapImageUrl(
                              area.areaId,
                              area.mapImageUpdatedAt ? new Date(area.mapImageUpdatedAt) : null,
                            )}
                            alt={`${area.areaName} 도면 미리보기 — 새 탭에서 크게 보기`}
                            className="max-h-40 w-full object-contain"
                          />
                        </a>
                      )}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="text-ink-muted mt-5 text-sm font-bold">주차면</h3>
          <div className="table-scroll mt-2">
            {/*
              편집 모드는 칸마다 입력·선택이 들어가서 보기 모드와 필요한 폭이 다르다. auto
              레이아웃에 그대로 맡기면 좁은 화면에서 select 의 화살표만 남고 내용이 잘린다.
              편집할 때만 table-fixed + 열별 고정 폭을 주고 가로 스크롤로 보게 한다.
              메모는 내용 길이가 다양해 고정하지 않고 남는 폭을 가져가게 둔다.
            */}
            <table className={`data-table ${editing ? 'min-w-[860px] table-fixed' : ''}`}>
              <thead>
                <tr>
                  <th className={editing ? 'w-28' : ''}>코드</th>
                  <th className={editing ? 'w-32' : ''}>유형</th>
                  <th className={editing ? 'w-28' : ''}>상태</th>
                  <th className={editing ? 'w-56' : ''}>구역</th>
                  <th>메모</th>
                  {editing && <th className="w-24"></th>}
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
                        <td className="whitespace-nowrap">{space.isActive ? '활성' : '비활성'}</td>
                        <td className="text-xs">{space.area.areaName}</td>
                        <td className="text-ink-faint text-xs">{space.memo ?? '-'}</td>
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
                        <div className="flex items-center gap-1">
                          {!isRemoved && (
                            <button
                              type="button"
                              className="btn btn-primary min-h-9 px-2 py-1.5 text-xs"
                              disabled={
                                pending ||
                                rowPending !== null ||
                                isSameDraft(draft, toSpaceDraft(space))
                              }
                              title="이 행만 바로 저장"
                              aria-label={`${space.spaceCode} 저장`}
                              onClick={() => saveOneSpace(space)}
                            >
                              {rowPending === `existing-${space.spaceId}` ? (
                                '저장 중…'
                              ) : (
                                <SaveIcon />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            className={`btn min-h-9 px-2 py-1.5 text-xs ${
                              isRemoved ? 'btn-secondary' : 'btn-danger-outline'
                            }`}
                            disabled={pending || rowPending !== null}
                            title={isRemoved ? '삭제 취소' : '삭제'}
                            aria-label={
                              isRemoved ? `${space.spaceCode} 삭제 취소` : `${space.spaceCode} 삭제`
                            }
                            onClick={() =>
                              setRemoved((previous) =>
                                isRemoved
                                  ? previous.filter((id) => id !== space.spaceId)
                                  : [...previous, space.spaceId],
                              )
                            }
                          >
                            {isRemoved ? <UndoIcon /> : <TrashIcon />}
                          </button>
                        </div>
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
                      <td className="text-ink-faint text-xs whitespace-nowrap">활성</td>
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
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="btn btn-primary min-h-9 px-2 py-1.5 text-xs"
                            disabled={pending || rowPending !== null || !draft.spaceCode.trim()}
                            title="이 행만 바로 추가"
                            aria-label={`새 주차면 ${index + 1} 저장`}
                            onClick={() => saveOneAdded(index)}
                          >
                            {rowPending === `added-${index}` ? '저장 중…' : <SaveIcon />}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger-outline min-h-9 px-2 py-1.5 text-xs"
                            disabled={pending || rowPending !== null}
                            title="삭제"
                            aria-label={`새 주차면 ${index + 1} 삭제`}
                            onClick={() =>
                              setAdded((previous) =>
                                previous.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                          >
                            <TrashIcon />
                          </button>
                        </div>
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

type AdminUserDraft = {
  adminName: string;
  email: string;
  phone: string;
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  role: 'SYSTEM_ADMIN' | 'PARKING_ADMIN';
};

function toAdminUserDraft(user: AdminUser): AdminUserDraft {
  return {
    adminName: user.adminName,
    email: user.email,
    phone: user.phone ?? '',
    accountStatus: user.accountStatus,
    role: user.role,
  };
}

function toAdminUserDraftById(users: AdminUser[], id: number): AdminUserDraft {
  const found = users.find((user) => user.adminUserId === id);
  return found
    ? toAdminUserDraft(found)
    : {
        adminName: '',
        email: '',
        phone: '',
        accountStatus: 'ACTIVE',
        role: 'PARKING_ADMIN',
      };
}

function isSameAdminUser(a: AdminUserDraft, b: AdminUserDraft): boolean {
  return (
    a.adminName === b.adminName &&
    a.email === b.email &&
    a.phone === b.phone &&
    a.accountStatus === b.accountStatus &&
    a.role === b.role
  );
}

const ACCOUNT_STATUS_LABEL = { ACTIVE: '활성', INACTIVE: '비활성', LOCKED: '잠금' } as const;

/**
 * 관리자 계정 목록. 구역·주차면과 같은 편집 모드로 수정·삭제한다.
 *
 * 생성은 아래 [관리자 계정 추가] 카드에 그대로 둔다. 비밀번호는 여기서 다루지 않는다 —
 * 관리자라도 다른 관리자의 비밀번호를 바꿀 수 없고, 본인 비밀번호는 상단 내비게이션의
 * [관리자: 이름] 배지에서만 바꿀 수 있다.
 */
function AdminUserTable({ adminUsers }: { adminUsers: AdminUser[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<number, AdminUserDraft>>({});
  const [removed, setRemoved] = useState<number[]>([]);

  function draftOf(user: AdminUser): AdminUserDraft {
    return drafts[user.adminUserId] ?? toAdminUserDraft(user);
  }

  function updateDraft(id: number, patch: Partial<AdminUserDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? toAdminUserDraftById(adminUsers, id)), ...patch },
    }));
  }

  function reset() {
    setDrafts({});
    setRemoved([]);
    setMessage(null);
  }

  const changedCount =
    removed.length +
    adminUsers.filter(
      (user) =>
        drafts[user.adminUserId] &&
        !isSameAdminUser(drafts[user.adminUserId], toAdminUserDraft(user)),
    ).length;

  /** 변경된 것만 순서대로 반영한다. 일부가 실패해도 나머지는 계속 처리하고 결과를 알린다. */
  async function saveAll() {
    setPending(true);
    setMessage(null);

    const failures: string[] = [];
    let done = 0;

    for (const id of removed) {
      const target = adminUsers.find((user) => user.adminUserId === id);
      const response = await apiRequest(`/api/admin/admin-users/${id}`, { method: 'DELETE' });
      if (response.ok) done += 1;
      else failures.push(`${target?.email ?? id} 삭제: ${response.error.message}`);
    }

    for (const user of adminUsers) {
      const draft = drafts[user.adminUserId];
      if (!draft || removed.includes(user.adminUserId)) continue;
      if (isSameAdminUser(draft, toAdminUserDraft(user))) continue;

      const response = await apiRequest(`/api/admin/admin-users/${user.adminUserId}`, {
        method: 'PUT',
        body: JSON.stringify({
          adminName: draft.adminName,
          email: draft.email,
          phone: draft.phone || null,
          accountStatus: draft.accountStatus,
          role: draft.role,
        }),
      });
      if (response.ok) done += 1;
      else failures.push(`${user.email} 수정: ${response.error.message}`);
    }

    setPending(false);
    router.refresh();

    if (failures.length === 0) {
      // reset() 이 내부적으로 setMessage(null) 을 호출하므로, 반드시 먼저 비운 뒤에
      // 성공 메시지를 설정해야 화면에 남는다(순서를 바꾸면 방금 띄운 메시지가 곧바로 지워진다).
      reset();
      setEditing(false);
      setMessage({ variant: 'success', text: `${done}건을 저장했습니다.` });
      return;
    }
    setMessage({
      variant: 'error',
      text: `${done}건 저장, ${failures.length}건 실패 — ${failures.join(' / ')}`,
    });
    // 실패한 항목을 고칠 수 있도록 편집 상태는 유지한다.
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">관리자 계정 ({adminUsers.length}명)</h2>
          {editing ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
                disabled={pending || changedCount === 0}
                onClick={saveAll}
              >
                {pending ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                disabled={pending}
                onClick={() => {
                  reset();
                  setEditing(false);
                }}
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
            값을 고치고 [삭제]로 계정을 지운 뒤, 상단 [저장]을 한 번 누르면 모두 반영됩니다. 계정
            추가는 아래 카드에서 하세요. 비밀번호는 본인만 상단의 [관리자: 이름] 배지에서 바꿀 수
            있습니다. 삭제한 계정의 이메일은 이력 보존을 위해 다시 사용할 수 없습니다.
          </p>
        )}

        <div className="table-scroll mt-3">
          {/* 편집 모드는 칸마다 입력이 들어가 보기 모드보다 넓은 폭이 필요하다. */}
          <table className={`data-table ${editing ? 'min-w-[1180px] table-fixed' : ''}`}>
            <thead>
              <tr>
                <th className={editing ? 'w-32' : ''}>이름</th>
                <th className={editing ? 'w-60' : ''}>이메일</th>
                <th className={editing ? 'w-36' : ''}>연락처</th>
                <th className={editing ? 'w-28' : ''}>권한</th>
                <th className={editing ? 'w-32' : ''}>상태</th>
                {editing && <th className="w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {/* 삭제 표시로 계정이 0개가 되는 걸 막는다. 마지막 1개는 삭제 버튼을 비활성화한다. */}
              {adminUsers.map((user) => {
                const draft = draftOf(user);
                const isRemoved = removed.includes(user.adminUserId);
                const remainingCount = adminUsers.length - removed.length;
                const isLastRemaining = !isRemoved && remainingCount <= 1;

                if (!editing) {
                  return (
                    <tr key={user.adminUserId}>
                      <td>{user.adminName}</td>
                      <td className="text-xs">{user.email}</td>
                      <td className="text-xs">{user.phone ?? '-'}</td>
                      <td>
                        <span
                          className={`badge ${
                            user.role === 'SYSTEM_ADMIN'
                              ? 'bg-brand-100 text-brand-700'
                              : 'bg-surface-active text-ink-muted'
                          }`}
                        >
                          {ADMIN_ROLE_LABEL[user.role]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            user.accountStatus === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : user.accountStatus === 'LOCKED'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-surface-active text-ink-muted'
                          }`}
                        >
                          {ACCOUNT_STATUS_LABEL[user.accountStatus]}
                        </span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={user.adminUserId} className={isRemoved ? 'bg-red-50 opacity-60' : ''}>
                    <td>
                      <input
                        className="input"
                        value={draft.adminName}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(user.adminUserId, { adminName: event.target.value })
                        }
                        aria-label={`${user.email} 이름`}
                      />
                    </td>
                    <td>
                      <input
                        type="email"
                        className="input"
                        value={draft.email}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(user.adminUserId, { email: event.target.value })
                        }
                        aria-label={`${user.email} 이메일`}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={draft.phone}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(user.adminUserId, { phone: event.target.value })
                        }
                        aria-label={`${user.email} 연락처`}
                      />
                    </td>
                    <td>
                      <select
                        className="input"
                        value={draft.role}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(user.adminUserId, {
                            role: event.target.value as AdminUserDraft['role'],
                          })
                        }
                        aria-label={`${user.email} 권한`}
                      >
                        <option value="SYSTEM_ADMIN">{ADMIN_ROLE_LABEL.SYSTEM_ADMIN}</option>
                        <option value="PARKING_ADMIN">{ADMIN_ROLE_LABEL.PARKING_ADMIN}</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className="input"
                        value={draft.accountStatus}
                        disabled={isRemoved}
                        onChange={(event) =>
                          updateDraft(user.adminUserId, {
                            accountStatus: event.target.value as AdminUserDraft['accountStatus'],
                          })
                        }
                        aria-label={`${user.email} 상태`}
                      >
                        <option value="ACTIVE">활성</option>
                        <option value="INACTIVE">비활성</option>
                        {/*
                          잠금은 로그인 연속 실패로 시스템이 거는 상태라 직접 고를 일은 없지만,
                          현재 값이 잠금이면 선택지에 있어야 select 가 빈 값이 되지 않는다.
                          활성으로 바꾸면 서버가 실패 횟수와 잠금 시각을 함께 푼다.
                        */}
                        {user.accountStatus === 'LOCKED' && <option value="LOCKED">잠금</option>}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn min-h-9 px-2 py-1.5 text-xs ${
                          isRemoved ? 'btn-secondary' : 'btn-danger-outline'
                        }`}
                        disabled={pending || isLastRemaining}
                        title={
                          isLastRemaining ? '관리자 계정이 최소 1개는 있어야 합니다.' : undefined
                        }
                        onClick={() =>
                          setRemoved((previous) =>
                            isRemoved
                              ? previous.filter((id) => id !== user.adminUserId)
                              : [...previous, user.adminUserId],
                          )
                        }
                      >
                        {isRemoved ? '취소' : '삭제'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function AdminUserSection({ adminUsers }: { adminUsers: AdminUser[] }) {
  return (
    <div className="space-y-4">
      <AdminUserTable adminUsers={adminUsers} />
      <AdminUserCreateForm />
    </div>
  );
}

/**
 * 관리자 계정 생성 폼. 권한(시스템 관리자/주차 관리자)을 여기서 직접 선택한다 —
 * 기본값은 주차 관리자. 이 화면 자체가 이미 시스템 관리자 전용이라, 권한을 고를 수
 * 있어도 주차 관리자가 스스로를 승격시키는 경로가 되지 않는다.
 */
function AdminUserCreateForm() {
  const { pending, message, fieldErrors, mutate } = useMutation();
  const [form, setForm] = useState({
    email: '',
    password: '',
    adminName: '',
    phone: '',
    role: 'PARKING_ADMIN' as 'SYSTEM_ADMIN' | 'PARKING_ADMIN',
  });

  return (
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
            label="이메일"
            htmlFor="admin-email"
            required
            hint="이 이메일로 신규 신청/승인 알림 메일을 받도록 관리자 알림 이메일 목록에 자동 등록됩니다."
            errors={fieldErrors.email}
          >
            <input
              id="admin-email"
              type="email"
              className={inputClassName(Boolean(fieldErrors.email))}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </FormField>
          <FormField
            label="비밀번호"
            htmlFor="admin-password"
            required
            hint="10자 이상, 영문 대/소문자·숫자·특수문자 중 3종류 이상"
            errors={fieldErrors.password}
          >
            <PasswordInput
              id="admin-password"
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
          <FormField label="연락처" htmlFor="admin-phone" errors={fieldErrors.phone}>
            <input
              id="admin-phone"
              className={inputClassName(Boolean(fieldErrors.phone))}
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </FormField>
          <FormField
            label="권한"
            htmlFor="admin-role"
            hint="반복 예약·이메일 이력·직원 등록·관리자 계정 관리는 시스템 관리자만 볼 수 있습니다."
            errors={fieldErrors.role}
          >
            <select
              id="admin-role"
              className={inputClassName(Boolean(fieldErrors.role))}
              value={form.role}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value as typeof form.role })
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
          disabled={pending || !form.email || !form.password}
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
                password: '',
                adminName: '',
                email: '',
                phone: '',
                role: 'PARKING_ADMIN',
              });
          }}
        >
          {pending ? '생성 중…' : '관리자 계정 생성'}
        </button>
      </div>
    </section>
  );
}

/** 저장 픽토그램(디스켓). 주차면 행별 저장 버튼에 쓴다. */
function SaveIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M4 3h9l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M6.5 3v4.5h6V3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="6.5" y="12" width="7" height="5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** 삭제 픽토그램(휴지통). 주차면 행별 삭제 버튼에 쓴다. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path d="M4 6h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 3h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M6 6l.8 10.2A1 1 0 0 0 7.8 17h4.4a1 1 0 0 0 1-.8L14 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8.3 9v5M11.7 9v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** 삭제 취소(되돌리기) 픽토그램. 삭제 표시된 행을 다시 살릴 때 쓴다. */
function UndoIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M5 8H12a4 4 0 1 1 0 8H8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 5L5 8l3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
