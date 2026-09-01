import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, toSettingRows, toSettingsValues } from '@/domain/system-settings';
import { isPasswordPolicySatisfied } from '@/lib/password';

describe('시스템 설정 변환', () => {
  it('DB 값이 없으면 기본값을 사용한다', () => {
    expect(toSettingsValues([])).toEqual(DEFAULT_SETTINGS);
  });

  it('DB 값을 타입에 맞게 변환한다', () => {
    const values = toSettingsValues([
      { settingKey: 'RESERVATION_MIN_LEAD_MINUTES', settingValue: '90' },
      { settingKey: 'PARKING_OPEN_TIME', settingValue: '08:00' },
      { settingKey: 'DOUBLE_PARKING_ENABLED', settingValue: 'false' },
    ]);

    expect(values.reservationMinLeadMinutes).toBe(90);
    expect(values.parkingOpenTime).toBe('08:00');
    expect(values.doubleParkingEnabled).toBe(false);
    // 지정하지 않은 값은 기본값 유지
    expect(values.parkingCloseTime).toBe(DEFAULT_SETTINGS.parkingCloseTime);
  });

  it('숫자로 해석할 수 없는 값은 기본값으로 대체한다', () => {
    const values = toSettingsValues([
      { settingKey: 'EXIT_REMINDER_MINUTES', settingValue: 'not-a-number' },
    ]);
    expect(values.exitReminderMinutes).toBe(DEFAULT_SETTINGS.exitReminderMinutes);
  });

  it('설정 객체 ↔ 저장용 행 변환이 왕복 가능하다', () => {
    expect(toSettingsValues(toSettingRows(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it('Seed 기본값이 요구사항과 일치한다', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      reservationMinLeadMinutes: 60,
      parkingOpenTime: '07:00',
      parkingCloseTime: '22:00',
      exitReminderMinutes: 10,
      maxReservationHours: 12,
      spaceAssignmentEnabled: true,
      parkingCapacity: 55,
      doubleParkingEnabled: false,
      appTimeZone: 'Asia/Seoul',
      entryExitManagementEnabled: true,
      dashboardRefreshIntervalMinutes: 5,
      personalDataRetentionDays: 365,
    });
  });
});

describe('관리자 비밀번호 정책', () => {
  it('10자 이상이며 3종류 이상 문자를 포함해야 한다', () => {
    expect(isPasswordPolicySatisfied('Admin!2345')).toBe(true);
    expect(isPasswordPolicySatisfied('abcdefghij')).toBe(false);
    expect(isPasswordPolicySatisfied('Ab1!')).toBe(false);
    expect(isPasswordPolicySatisfied('Abcdefghi1')).toBe(true);
  });
});
