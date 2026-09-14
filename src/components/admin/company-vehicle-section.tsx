'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';

type SpaceOption = { spaceId: number; spaceCode: string; areaName: string };

type Vehicle = {
  vehicleId: number;
  vehicleNo: string;
  memo: string | null;
  isActive: boolean;
  parkingSpaceId: number | null;
  parkingSpace: { spaceId: number; spaceCode: string; area: { areaName: string } } | null;
};

type Draft = { vehicleNo: string; memo: string; parkingSpaceId: string; isActive: boolean };

function toDraft(vehicle: Vehicle): Draft {
  return {
    vehicleNo: vehicle.vehicleNo,
    memo: vehicle.memo ?? '',
    parkingSpaceId: vehicle.parkingSpaceId ? String(vehicle.parkingSpaceId) : '',
    isActive: vehicle.isActive,
  };
}

const EMPTY_DRAFT: Draft = { vehicleNo: '', memo: '', parkingSpaceId: '', isActive: true };

export function CompanyVehicleSection({
  vehicles,
  spaces,
}: {
  vehicles: Vehicle[];
  spaces: SpaceOption[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
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
      memo: draft.memo || null,
      parkingSpaceId: draft.parkingSpaceId ? Number(draft.parkingSpaceId) : null,
      isActive: draft.isActive,
    };
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

  async function handleUpdate(vehicleId: number) {
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest(`/api/admin/company-vehicles/${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify(bodyFrom(draftOf(vehicleFor(vehicleId)))),
    });

    setPending(false);
    if (response.ok) {
      setEditingId(null);
      setMessage({ variant: 'success', text: '수정했습니다.' });
      router.refresh();
      return;
    }
    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  async function handleDeactivate(vehicleId: number) {
    setPending(true);
    setMessage(null);

    const response = await apiRequest(`/api/admin/company-vehicles/${vehicleId}`, {
      method: 'DELETE',
    });

    setPending(false);
    if (response.ok) {
      setMessage({ variant: 'success', text: '비활성화했습니다.' });
      router.refresh();
      return;
    }
    setMessage({ variant: 'error', text: response.error.message });
  }

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant={message.variant === 'success' ? 'success' : 'error'}>{message.text}</Alert>
      )}

      <section className="card">
        <div className="card-body space-y-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>차량번호</th>
                  <th>주차 위치</th>
                  <th>메모</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-ink-faint text-center text-sm">
                      등록된 법인차량이 없습니다.
                    </td>
                  </tr>
                )}
                {vehicles.map((vehicle) => {
                  const isEditing = editingId === vehicle.vehicleId;
                  const draft = draftOf(vehicle);
                  return (
                    <tr key={vehicle.vehicleId}>
                      {isEditing ? (
                        <>
                          <td>
                            <input
                              className={inputClassName(Boolean(fieldErrors.vehicleNo))}
                              value={draft.vehicleNo}
                              onChange={(event) =>
                                updateDraft(vehicle.vehicleId, { vehicleNo: event.target.value })
                              }
                              maxLength={20}
                            />
                          </td>
                          <td>
                            <select
                              className={inputClassName(Boolean(fieldErrors.parkingSpaceId))}
                              value={draft.parkingSpaceId}
                              onChange={(event) =>
                                updateDraft(vehicle.vehicleId, {
                                  parkingSpaceId: event.target.value,
                                })
                              }
                            >
                              <option value="">미지정</option>
                              {spaces.map((space) => (
                                <option key={space.spaceId} value={space.spaceId}>
                                  {space.spaceCode} ({space.areaName})
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
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={draft.isActive}
                                onChange={(event) =>
                                  updateDraft(vehicle.vehicleId, { isActive: event.target.checked })
                                }
                              />
                              사용
                            </label>
                          </td>
                          <td className="whitespace-nowrap">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={pending}
                              onClick={() => handleUpdate(vehicle.vehicleId)}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm ml-1"
                              disabled={pending}
                              onClick={() => setEditingId(null)}
                            >
                              취소
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="font-mono font-bold">{vehicle.vehicleNo}</td>
                          <td className="text-xs">
                            {vehicle.parkingSpace
                              ? `${vehicle.parkingSpace.spaceCode} (${vehicle.parkingSpace.area.areaName})`
                              : '미지정'}
                          </td>
                          <td className="text-xs">{vehicle.memo ?? '-'}</td>
                          <td className="text-xs">
                            {vehicle.isActive ? (
                              <span className="badge bg-green-100 text-green-800">사용</span>
                            ) : (
                              <span className="badge bg-surface-hover text-ink-muted">비활성</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingId(vehicle.vehicleId)}
                            >
                              수정
                            </button>
                            {vehicle.isActive && (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm ml-1"
                                disabled={pending}
                                onClick={() => handleDeactivate(vehicle.vehicleId)}
                              >
                                비활성화
                              </button>
                            )}
                            <Link
                              href={`/admin/company-vehicles/trips?vehicleId=${vehicle.vehicleId}`}
                              className="text-brand-700 ml-2 text-xs font-semibold"
                            >
                              운행일지 보기 →
                            </Link>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {creating ? (
            <div className="border-line-muted grid gap-3 border-t pt-3 sm:grid-cols-2">
              <FormField label="차량번호" htmlFor="new-vehicle-no" required errors={fieldErrors.vehicleNo}>
                <input
                  id="new-vehicle-no"
                  className={inputClassName(Boolean(fieldErrors.vehicleNo))}
                  value={createDraft.vehicleNo}
                  onChange={(event) =>
                    setCreateDraft({ ...createDraft, vehicleNo: event.target.value })
                  }
                  placeholder="12가3456"
                  maxLength={20}
                />
              </FormField>
              <FormField
                label="주차 위치"
                htmlFor="new-vehicle-space"
                errors={fieldErrors.parkingSpaceId}
              >
                <select
                  id="new-vehicle-space"
                  className={inputClassName(Boolean(fieldErrors.parkingSpaceId))}
                  value={createDraft.parkingSpaceId}
                  onChange={(event) =>
                    setCreateDraft({ ...createDraft, parkingSpaceId: event.target.value })
                  }
                >
                  <option value="">미지정</option>
                  {spaces.map((space) => (
                    <option key={space.spaceId} value={space.spaceId}>
                      {space.spaceCode} ({space.areaName})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="메모"
                htmlFor="new-vehicle-memo"
                errors={fieldErrors.memo}
              >
                <input
                  id="new-vehicle-memo"
                  className={inputClassName(false)}
                  value={createDraft.memo}
                  onChange={(event) => setCreateDraft({ ...createDraft, memo: event.target.value })}
                  maxLength={500}
                />
              </FormField>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending || createDraft.vehicleNo.trim() === ''}
                  onClick={handleCreate}
                >
                  등록
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={pending}
                  onClick={() => {
                    setCreating(false);
                    setCreateDraft(EMPTY_DRAFT);
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              법인차량 추가
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
