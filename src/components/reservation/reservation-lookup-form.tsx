'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { StatusBadge } from '@/components/ui/status-badge';
import { apiRequest, type ApiErrorPayload } from '@/lib/client/api-client';
import { formatKstRange } from '@/lib/datetime';

type LookupResult = {
  reservationId: number;
  visitStartAt: string;
  visitEndAt: string;
  reservationStatus:
    'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'PARKING' | 'EXITED' | 'NO_SHOW';
};

/**
 * 예약자 성명 + 차량번호(AND 조건)로 예약을 검색하는 폼.
 *
 * 예약번호를 몰라도 검색할 수 있도록, 검색에 성공하면 일치하는 예약을 모두 목록으로
 * 보여주고(방문 일정으로 구분 — 예약번호는 이제 DB 내부 식별자일 뿐 화면에 노출하지 않는다)
 * 행을 고르면 그때 접근 토큰을 발급해 조회·수정·취소 화면(/r/<token>)으로 이동한다.
 */
export function ReservationLookupForm() {
  const router = useRouter();
  const [requesterName, setRequesterName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [entering, setEntering] = useState<number | null>(null);
  const [results, setResults] = useState<LookupResult[] | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) return;

    setSearching(true);
    setErrorMessage(null);
    setFieldErrors({});
    setResults(null);

    const response = await apiRequest<{ reservations: LookupResult[] }>(
      '/api/reservations/lookup',
      {
        method: 'POST',
        body: JSON.stringify({ requesterName, vehicleNo }),
      },
    );

    setSearching(false);

    if (response.ok) {
      setResults(response.data.reservations);
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setErrorMessage((response.error as ApiErrorPayload).message);
  }

  async function handleEnter(reservationId: number) {
    if (entering !== null) return;
    setEntering(reservationId);
    setErrorMessage(null);

    const response = await apiRequest<{ accessPath: string }>('/api/reservations/lookup/access', {
      method: 'POST',
      body: JSON.stringify({ reservationId, requesterName, vehicleNo }),
    });

    if (response.ok) {
      router.push(response.data.accessPath);
      return;
    }

    setEntering(null);
    setErrorMessage((response.error as ApiErrorPayload).message);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} noValidate className="card">
        <div className="card-body space-y-4">
          <h2 className="card-title">성명·차량번호로 검색</h2>

          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

          <FormField
            label="성명"
            htmlFor="requesterName"
            required
            hint="신청 시 입력한 성명과 정확히 일치해야 합니다."
            errors={fieldErrors.requesterName}
          >
            <input
              id="requesterName"
              name="requesterName"
              className={inputClassName(Boolean(fieldErrors.requesterName))}
              value={requesterName}
              onChange={(event) => setRequesterName(event.target.value)}
              maxLength={50}
              autoComplete="off"
            />
          </FormField>

          <FormField
            label="차량번호"
            htmlFor="vehicleNo"
            required
            hint="예) 12가3456"
            errors={fieldErrors.vehicleNo}
          >
            <input
              id="vehicleNo"
              name="vehicleNo"
              className={inputClassName(Boolean(fieldErrors.vehicleNo))}
              value={vehicleNo}
              onChange={(event) => setVehicleNo(event.target.value)}
              placeholder="12가3456"
              maxLength={20}
              autoComplete="off"
            />
          </FormField>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={searching || requesterName.trim() === '' || vehicleNo.trim() === ''}
          >
            {searching ? '검색 중…' : '예약 검색하기'}
          </button>
        </div>
      </form>

      {results && (
        <section className="card">
          <div className="card-body space-y-3">
            <h2 className="card-title">검색 결과</h2>
            {results.length === 0 ? (
              <Alert variant="info">
                일치하는 예약이 없습니다. 성명과 차량번호가 신청 당시와 정확히 같은지 확인해 주세요.
              </Alert>
            ) : (
              <ul className="divide-y divide-slate-100">
                {results.map((reservation) => (
                  <li key={reservation.reservationId}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md py-3 text-left transition hover:bg-slate-50 disabled:opacity-60"
                      disabled={entering !== null}
                      onClick={() => handleEnter(reservation.reservationId)}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {formatKstRange(
                              new Date(reservation.visitStartAt),
                              new Date(reservation.visitEndAt),
                            )}
                          </span>
                          <StatusBadge status={reservation.reservationStatus} />
                        </div>
                      </div>
                      {/* <span className="text-xs text-slate-500">
                        {entering === reservation.reservationId ? '이동 중…' : '자세히 보기 →'}
                      </span> */}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
