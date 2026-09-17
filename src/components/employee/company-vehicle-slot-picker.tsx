'use client';

import { useMemo, useState } from 'react';

const SLOT_MINUTES = 10;

type Props = {
  /** 'yyyy-MM-dd' — 이미 정해진 운행일. */
  date: string;
  operatingStartTime: string;
  operatingEndTime: string;
  /** 서버가 계산한 최소 선택 가능 시각('yyyy-MM-ddTHH:mm', KST) — 오늘 날짜일 때만 의미가 있다. */
  minDateTimeInput: string;
  /** 1회 최대 사용 가능 시간(시간 단위). */
  maxUsageHours: number;
  /** 이미 고른 차량의 그날 기존 예약(승인 대기 포함) 구간(분 단위, 그날 0시 기준). */
  busyMinuteRanges: { start: number; end: number }[];
  /** 'yyyy-MM-ddTHH:mm' (KST) — 이미 고른 구간이 있으면 파란색으로 보여준다. */
  requestStartAt: string;
  requestEndAt: string;
  onChange: (value: { requestStartAt: string; requestEndAt: string }) => void;
};

function toMinutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToInput(date: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${pad(h)}:${pad(m)}`;
}

export function CompanyVehicleSlotPicker({
  date,
  operatingStartTime,
  operatingEndTime,
  minDateTimeInput,
  maxUsageHours,
  busyMinuteRanges,
  requestStartAt,
  requestEndAt,
  onChange,
}: Props) {
  const [pickStart, setPickStart] = useState<number | null>(null);

  const operatingStartMin = toMinutesOfDay(operatingStartTime);
  const operatingEndMin = toMinutesOfDay(operatingEndTime);

  // 최소 사전 신청 시간: 운행일이 "오늘"(minDateTimeInput과 같은 날짜)일 때만 의미가 있다 —
  // 그 외 미래 날짜는 운영시간 시작부터 전부 선택 가능하다.
  const [minDate, minTime] = minDateTimeInput.split('T');
  const leadCutoffMin = date === minDate ? toMinutesOfDay(minTime) : operatingStartMin;
  const maxUsageMinutes = maxUsageHours * 60;

  const slots = useMemo(() => {
    const list: number[] = [];
    for (let m = operatingStartMin; m < operatingEndMin; m += SLOT_MINUTES) list.push(m);
    return list;
  }, [operatingStartMin, operatingEndMin]);

  const selectedRange = useMemo(() => {
    if (!requestStartAt || !requestEndAt || !requestStartAt.startsWith(date)) return null;
    return {
      start: toMinutesOfDay(requestStartAt.split('T')[1]),
      end: toMinutesOfDay(requestEndAt.split('T')[1]),
    };
  }, [requestStartAt, requestEndAt, date]);

  /** 예약(승인 대기 포함)·최소 리드타임 중 하나라도 걸리면 클릭할 수 없다. */
  function isBlocked(slotStart: number): boolean {
    if (slotStart < leadCutoffMin) return true;
    const slotEnd = slotStart + SLOT_MINUTES;
    return busyMinuteRanges.some((range) => range.start < slotEnd && range.end > slotStart);
  }

  function hasBlockedBetween(from: number, to: number): boolean {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    if (lo < leadCutoffMin) return true;
    return busyMinuteRanges.some((range) => range.start < hi && range.end > lo);
  }

  function handleSlotClick(slotStart: number) {
    if (isBlocked(slotStart)) return;

    if (pickStart === null) {
      setPickStart(slotStart);
      return;
    }

    const rangeStart = Math.min(pickStart, slotStart);
    const rangeEnd = Math.max(pickStart, slotStart) + SLOT_MINUTES;
    // 이미 예약된 칸이 사이에 끼어 있거나, 1회 최대 사용 시간을 넘으면 완성하지 않고
    // 지금 누른 칸을 새 시작점으로 다시 고르게 한다.
    if (hasBlockedBetween(rangeStart, rangeEnd) || rangeEnd - rangeStart > maxUsageMinutes) {
      setPickStart(slotStart);
      return;
    }

    setPickStart(null);
    onChange({
      requestStartAt: minutesToInput(date, rangeStart),
      requestEndAt: minutesToInput(date, rangeEnd),
    });
  }

  return (
    <div className="space-y-2">
      <p className="field-hint">
        회색은 선택할 수 없는 시간대(다른 신청 또는 최소 사전 신청 시간 이전)입니다. 시작 칸과
        종료 칸을 순서대로 클릭해 시간대를 고르세요(10분 단위, 1회 최대 {maxUsageHours}시간).
      </p>
      <div className="table-scroll">
        <table className="data-table table-fixed text-xs">
          <colgroup>
            {slots.map((slot) => (
              <col key={slot} className="w-5" />
            ))}
          </colgroup>
          <thead>
            <tr>
              {slots.map((slot) => (
                <th
                  key={slot}
                  className={`border-line h-6 border-l p-0 text-left align-bottom whitespace-nowrap ${slot % 60 === 0 ? 'border-l-2' : ''}`}
                >
                  {slot % 60 === 0 ? (
                    <span className="relative -left-px block pl-0.5">
                      {String(Math.floor(slot / 60)).padStart(2, '0')}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {slots.map((slot) => {
                const blocked = isBlocked(slot);
                const isSelected =
                  selectedRange !== null && slot >= selectedRange.start && slot < selectedRange.end;
                const isPickingStart = pickStart === slot;

                return (
                  <td
                    key={slot}
                    className={`border-line h-8 w-5 border-l p-0 text-center ${slot % 60 === 0 ? 'border-l-2' : ''}`}
                  >
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => handleSlotClick(slot)}
                      title={`${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`}
                      className={`block h-8 w-full ${
                        blocked
                          ? 'bg-surface-hover text-ink-faint cursor-not-allowed'
                          : isSelected || isPickingStart
                            ? 'bg-brand-700'
                            : 'bg-surface hover:bg-brand-100'
                      }`}
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {pickStart !== null && (
        <p className="text-brand-700 text-xs font-bold">
          시작 시간을 선택했습니다 — 종료 시간을 눌러 완성해 주세요.
        </p>
      )}
    </div>
  );
}
