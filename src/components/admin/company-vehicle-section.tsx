'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { Alert } from '@/components/ui/alert';
import { ActiveSwitch } from '@/components/ui/active-switch';
import { inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';

type SpaceOption = { spaceId: number; spaceCode: string; areaName: string };

type Vehicle = {
  vehicleId: number;
  vehicleNo: string;
  vehicleModel: string | null;
  memo: string | null;
  isActive: boolean;
  parkingSpaceId: number | null;
  parkingSpace: { spaceId: number; spaceCode: string; area: { areaName: string } } | null;
};

type Draft = {
  vehicleNo: string;
  vehicleModel: string;
  memo: string;
  parkingSpaceId: string;
  isActive: boolean;
};

function toDraft(vehicle: Vehicle): Draft {
  return {
    vehicleNo: vehicle.vehicleNo,
    vehicleModel: vehicle.vehicleModel ?? '',
    memo: vehicle.memo ?? '',
    parkingSpaceId: vehicle.parkingSpaceId ? String(vehicle.parkingSpaceId) : '',
    isActive: vehicle.isActive,
  };
}

function isSameDraft(a: Draft, b: Draft): boolean {
  return (
    a.vehicleNo === b.vehicleNo &&
    a.vehicleModel === b.vehicleModel &&
    a.memo === b.memo &&
    a.parkingSpaceId === b.parkingSpaceId &&
    a.isActive === b.isActive
  );
}

const EMPTY_DRAFT: Draft = {
  vehicleNo: '',
  vehicleModel: '',
  memo: '',
  parkingSpaceId: '',
  isActive: true,
};

export function CompanyVehicleSection({
  vehicles,
  spaces,
}: {
  vehicles: Vehicle[];
  spaces: SpaceOption[];
}) {
  const router = useRouter();
  const [sectionEditMode, setSectionEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useDismissOnInteraction(Boolean(message), () => setMessage(null));

  function draftOf(vehicle: Vehicle): Draft {
    return drafts[vehicle.vehicleId] ?? toDraft(vehicle);
  }

  function updateDraft(vehicleId: number, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [vehicleId]: { ...draftOf(vehicleFor(vehicleId)), ...patch } }));
  }

  function vehicleFor(vehicleId: number): Vehicle {
    return vehicles.find((vehicle) => vehicle.vehicleId === vehicleId)!;
  }

  function bodyFrom(draft: Draft) {
    return {
      vehicleNo: draft.vehicleNo,
      vehicleModel: draft.vehicleModel || null,
      memo: draft.memo || null,
      parkingSpaceId: draft.parkingSpaceId ? Number(draft.parkingSpaceId) : null,
      isActive: draft.isActive,
    };
  }

  function enterEditMode() {
    setSectionEditMode(true);
    setDrafts({});
    setMessage(null);
    setFieldErrors({});
  }

  async function handleCreate() {
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest('/api/admin/company-vehicles', {
      method: 'POST',
      body: JSON.stringify(bodyFrom(createDraft)),
    });

    setPending(false);
    if (response.ok) {
      setCreating(false);
      setCreateDraft(EMPTY_DRAFT);
      setMessage({ variant: 'success', text: '법인차량을 등록했습니다.' });
      router.refresh();
      return;
    }
    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  async function handleDelete(vehicle: Vehicle) {
    if (
      !window.confirm(
        `"${vehicle.vehicleNo}" 차량을 삭제하시겠습니까? 목록에서 완전히 사라지며 이 화면에서 되돌릴 수 없습니다.\n(과거 운행 기록은 운행 대장에 그대로 남습니다.)`,
      )
    ) {
      return;
    }

    setPending(true);
    setMessage(null);

    const response = await apiRequest(`/api/admin/company-vehicles/${vehicle.vehicleId}`, {
      method: 'DELETE',
    });

    setPending(false);
    if (response.ok) {
      setMessage({ variant: 'success', text: `"${vehicle.vehicleNo}" 차량을 삭제했습니다.` });
      router.refresh();
      return;
    }
    setMessage({ variant: 'error', text: response.error.message });
  }

  /** 편집 모드의 모든 행 중 실제로 값이 바뀐 차량만 한꺼번에 저장한다. */
  async function handleSaveAll() {
    const changed = vehicles.filter((vehicle) => !isSameDraft(draftOf(vehicle), toDraft(vehicle)));

    if (changed.length === 0) {
      setSectionEditMode(false);
      setDrafts({});
      return;
    }

    setPending(true);
    setMessage(null);

    const results = await Promise.all(
      changed.map((vehicle) =>
        apiRequest(`/api/admin/company-vehicles/${vehicle.vehicleId}`, {
          method: 'PATCH',
          body: JSON.stringify(bodyFrom(draftOf(vehicle))),
        }).then((response) => ({ vehicle, response })),
      ),
    );

    setPending(false);

    const failures = results.filter((result) => !result.response.ok);
    if (failures.length === 0) {
      setSectionEditMode(false);
      setDrafts({});
      setMessage({ variant: 'success', text: `${changed.length}건을 저장했습니다.` });
      router.refresh();
      return;
    }

    setMessage({
      variant: 'error',
      text: failures
        .map(({ vehicle, response }) =>
          response.ok ? '' : `${vehicle.vehicleNo}: ${response.error.message}`,
        )
        .join(' / '),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant={message.variant === 'success' ? 'success' : 'error'}>{message.text}</Alert>
      )}

      <section className="card">
        <div className="card-body space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title">법인차량 목록</h2>
            <div className="flex items-center gap-2">
              {sectionEditMode && (
                <button
                  type="button"
                  className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                  onClick={() => setCreating(true)}
                >
                  법인차량 추가
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
                disabled={pending}
                onClick={sectionEditMode ? handleSaveAll : enterEditMode}
              >
                {sectionEditMode ? (pending ? '저장 중…' : '저장') : '수정'}
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table table-fixed">
              <thead>
                <tr>
                  <th className="w-32">차량번호</th>
                  <th className="w-28">차종</th>
                  <th className="w-28">주차 위치</th>
                  <th>메모</th>
                  <th className="w-24">상태</th>
                  {sectionEditMode && <th className="w-16">삭제</th>}
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 && !creating && (
                  <tr>
                    <td colSpan={sectionEditMode ? 6 : 5} className="text-ink-faint text-center text-sm">
                      등록된 법인차량이 없습니다.
                    </td>
                  </tr>
                )}
                {vehicles.map((vehicle) => {
                  const draft = draftOf(vehicle);

                  if (sectionEditMode) {
                    return (
                      <tr key={vehicle.vehicleId}>
                        <td>
                          <input
                            className={inputClassName(false)}
                            value={draft.vehicleNo}
                            onChange={(event) =>
                              updateDraft(vehicle.vehicleId, { vehicleNo: event.target.value })
                            }
                            maxLength={20}
                          />
                        </td>
                        <td>
                          <input
                            className={inputClassName(false)}
                            value={draft.vehicleModel}
                            onChange={(event) =>
                              updateDraft(vehicle.vehicleId, { vehicleModel: event.target.value })
                            }
                            placeholder="예: 쏘나타"
                            maxLength={50}
                          />
                        </td>
                        <td>
                          <select
                            className={inputClassName(false)}
                            value={draft.parkingSpaceId}
                            onChange={(event) =>
                              updateDraft(vehicle.vehicleId, { parkingSpaceId: event.target.value })
                            }
                          >
                            <option value="">미지정</option>
                            {spaces.map((space) => (
                              <option key={space.spaceId} value={space.spaceId}>
                                {space.spaceCode}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className={inputClassName(false)}
                            value={draft.memo}
                            onChange={(event) =>
                              updateDraft(vehicle.vehicleId, { memo: event.target.value })
                            }
                            maxLength={500}
                          />
                        </td>
                        <td>
                          <ActiveSwitch
                            checked={draft.isActive}
                            disabled={false}
                            label={`${vehicle.vehicleNo} ${draft.isActive ? '비활성화' : '활성화'}`}
                            onToggle={() =>
                              updateDraft(vehicle.vehicleId, { isActive: !draft.isActive })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger-outline min-h-8 w-8 px-0"
                            disabled={pending}
                            aria-label={`${vehicle.vehicleNo} 삭제`}
                            title="삭제"
                            onClick={() => handleDelete(vehicle)}
                          >
                            <TrashIcon />
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <ClickableTableRow
                      key={vehicle.vehicleId}
                      href={`/admin/company-vehicles/log?vehicleId=${vehicle.vehicleId}`}
                    >
                      <td className="font-mono font-bold whitespace-nowrap">{vehicle.vehicleNo}</td>
                      <td className="text-xs whitespace-nowrap">{vehicle.vehicleModel ?? '-'}</td>
                      <td className="font-mono text-xs whitespace-nowrap">
                        {vehicle.parkingSpace?.spaceCode ?? '미지정'}
                      </td>
                      <td className="text-xs break-words">{vehicle.memo ?? '-'}</td>
                      <td className="text-xs whitespace-nowrap">
                        {vehicle.isActive ? (
                          <span className="badge bg-green-100 text-green-800">활성</span>
                        ) : (
                          <span className="badge bg-surface-hover text-ink-muted">비활성</span>
                        )}
                      </td>
                    </ClickableTableRow>
                  );
                })}

                {sectionEditMode && creating && (
                  <>
                    <tr className="bg-surface-muted">
                      <td>
                        <input
                          className={inputClassName(Boolean(fieldErrors.vehicleNo))}
                          value={createDraft.vehicleNo}
                          onChange={(event) =>
                            setCreateDraft({ ...createDraft, vehicleNo: event.target.value })
                          }
                          placeholder="12가3456"
                          maxLength={20}
                        />
                      </td>
                      <td>
                        <input
                          className={inputClassName(false)}
                          value={createDraft.vehicleModel}
                          onChange={(event) =>
                            setCreateDraft({ ...createDraft, vehicleModel: event.target.value })
                          }
                          placeholder="예: 쏘나타"
                          maxLength={50}
                        />
                      </td>
                      <td>
                        <select
                          className={inputClassName(Boolean(fieldErrors.parkingSpaceId))}
                          value={createDraft.parkingSpaceId}
                          onChange={(event) =>
                            setCreateDraft({ ...createDraft, parkingSpaceId: event.target.value })
                          }
                        >
                          <option value="">미지정</option>
                          {spaces.map((space) => (
                            <option key={space.spaceId} value={space.spaceId}>
                              {space.spaceCode}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className={inputClassName(false)}
                          value={createDraft.memo}
                          onChange={(event) =>
                            setCreateDraft({ ...createDraft, memo: event.target.value })
                          }
                          maxLength={500}
                        />
                      </td>
                      <td>
                        <ActiveSwitch
                          checked={createDraft.isActive}
                          disabled={false}
                          label={`신규 법인차량 ${createDraft.isActive ? '비활성화' : '활성화'}`}
                          onToggle={() =>
                            setCreateDraft({ ...createDraft, isActive: !createDraft.isActive })
                          }
                        />
                      </td>
                      <td />
                    </tr>
                    <tr className="bg-surface-muted">
                      <td colSpan={6} className="text-right">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={pending || createDraft.vehicleNo.trim() === ''}
                          onClick={handleCreate}
                        >
                          등록
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm ml-1"
                          disabled={pending}
                          onClick={() => {
                            setCreating(false);
                            setCreateDraft(EMPTY_DRAFT);
                            setFieldErrors({});
                          }}
                        >
                          취소
                        </button>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

/** 삭제 픽토그램(휴지통). 차량 행별 삭제 버튼에 쓴다. */
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
