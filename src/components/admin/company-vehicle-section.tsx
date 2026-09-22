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

  /**
   * 이 차량(수정 중이면 자기 자신은 제외)이 고를 수 있는 주차면만 남긴다 — 서버의
   * `assertSpaceNotTakenByOtherVehicle`와 같은 기준(삭제되지 않은 다른 차량이 쓰는
   * 주차면 제외). `keepSelected`가 그 사이 다른 차량에 넘어간 값이어도, 지금 드롭다운에
   * 이미 선택돼 있는 값 자체는 목록에서 사라지지 않게 한다.
   */
  function availableSpaces(excludeVehicleId: number | undefined, keepSelected: string): SpaceOption[] {
    const takenIds = new Set(
      vehicles
        .filter((vehicle) => vehicle.parkingSpaceId !== null && vehicle.vehicleId !== excludeVehicleId)
        .map((vehicle) => vehicle.parkingSpaceId as number),
    );
    const filtered = spaces.filter((space) => !takenIds.has(space.spaceId));
    const keptId = keepSelected ? Number(keepSelected) : null;
    if (keptId !== null && !filtered.some((space) => space.spaceId === keptId)) {
      const kept = spaces.find((space) => space.spaceId === keptId);
      if (kept) return [...filtered, kept];
    }
    return filtered;
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

  /**
   * 편집 모드의 모든 행 중 실제로 값이 바뀐 차량과, "법인차량 추가"로 열어 둔 신규 행을
   * 한꺼번에 저장한다 — 신규 행에 따로 있던 "등록" 버튼(같은 역할이 중복돼 있던 것)을
   * 없애고 이 저장 버튼 하나로 합쳤다.
   */
  async function handleSaveAll() {
    const changed = vehicles.filter((vehicle) => !isSameDraft(draftOf(vehicle), toDraft(vehicle)));

    if (creating && createDraft.vehicleNo.trim() === '') {
      setFieldErrors({ vehicleNo: ['차량번호를 입력해 주세요.'] });
      return;
    }
    const shouldCreate = creating;

    if (changed.length === 0 && !shouldCreate) {
      setSectionEditMode(false);
      setDrafts({});
      return;
    }

    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const [createResponse, updateResults] = await Promise.all([
      shouldCreate
        ? apiRequest('/api/admin/company-vehicles', {
            method: 'POST',
            body: JSON.stringify(bodyFrom(createDraft)),
          })
        : Promise.resolve(null),
      Promise.all(
        changed.map((vehicle) =>
          apiRequest(`/api/admin/company-vehicles/${vehicle.vehicleId}`, {
            method: 'PATCH',
            body: JSON.stringify(bodyFrom(draftOf(vehicle))),
          }).then((response) => ({ vehicle, response })),
        ),
      ),
    ]);

    setPending(false);

    const createFailed = createResponse !== null && !createResponse.ok;
    const updateFailures = updateResults.filter((result) => !result.response.ok);

    if (createFailed) {
      setFieldErrors(createResponse.error.fieldErrors ?? {});
    } else if (shouldCreate) {
      setCreating(false);
      setCreateDraft(EMPTY_DRAFT);
    }

    if (!createFailed && updateFailures.length === 0) {
      setSectionEditMode(false);
      setDrafts({});
      const savedCount = changed.length + (shouldCreate ? 1 : 0);
      setMessage({ variant: 'success', text: `${savedCount}건을 저장했습니다.` });
      router.refresh();
      return;
    }

    setMessage({
      variant: 'error',
      text: [
        ...(createFailed ? [`신규 등록: ${createResponse.error.message}`] : []),
        ...updateFailures.map(({ vehicle, response }) =>
          response.ok ? '' : `${vehicle.vehicleNo}: ${response.error.message}`,
        ),
      ]
        .filter(Boolean)
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
                            {availableSpaces(vehicle.vehicleId, draft.parkingSpaceId).map((space) => (
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
                      href={`/admin/logs/company-vehicles?vehicleId=${vehicle.vehicleId}`}
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
                        {fieldErrors.vehicleNo && (
                          <p className="field-error">{fieldErrors.vehicleNo[0]}</p>
                        )}
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
                          {availableSpaces(undefined, createDraft.parkingSpaceId).map((space) => (
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
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost min-h-8 w-8 px-0"
                          disabled={pending}
                          aria-label="신규 등록 취소"
                          title="취소"
                          onClick={() => {
                            setCreating(false);
                            setCreateDraft(EMPTY_DRAFT);
                            setFieldErrors({});
                          }}
                        >
                          <XIcon />
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

/** 취소 픽토그램(X). 신규 등록 행의 취소 버튼에 쓴다 — 삭제 아이콘과 같은 칸에 놓인다. */
function XIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
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
