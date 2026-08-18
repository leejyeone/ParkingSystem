/**
 * system_settings 키 정의와 기본값.
 * DB 에 값이 없으면 아래 기본값을 사용한다.
 */

export const SETTING_KEYS = {
  RESERVATION_MIN_LEAD_MINUTES: 'RESERVATION_MIN_LEAD_MINUTES',
  PARKING_OPEN_TIME: 'PARKING_OPEN_TIME',
  PARKING_CLOSE_TIME: 'PARKING_CLOSE_TIME',
  EXIT_REMINDER_MINUTES: 'EXIT_REMINDER_MINUTES',
  MAX_RESERVATION_HOURS: 'MAX_RESERVATION_HOURS',
  DOUBLE_PARKING_ENABLED: 'DOUBLE_PARKING_ENABLED',
  APP_TIME_ZONE: 'APP_TIME_ZONE',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export type SystemSettingsValues = {
  /** 예약 최소 사전 신청 시간(분) */
  reservationMinLeadMinutes: number;
  /** 주차장 운영 시작 시간 'HH:mm' */
  parkingOpenTime: string;
  /** 주차장 운영 종료 시간 'HH:mm' */
  parkingCloseTime: string;
  /** 출차 예정 알림 발송 기준(분 전) */
  exitReminderMinutes: number;
  /** 1건당 최대 예약 시간(시간) */
  maxReservationHours: number;
  /** 이중주차 사용 여부 */
  doubleParkingEnabled: boolean;
  /** 표시 기준 타임존 */
  appTimeZone: string;
};

export const DEFAULT_SETTINGS: SystemSettingsValues = {
  reservationMinLeadMinutes: 60,
  parkingOpenTime: '07:00',
  parkingCloseTime: '22:00',
  exitReminderMinutes: 10,
  maxReservationHours: 12,
  doubleParkingEnabled: true,
  appTimeZone: 'Asia/Seoul',
};

export const SETTING_DESCRIPTIONS: Record<SettingKey, string> = {
  RESERVATION_MIN_LEAD_MINUTES:
    '예약 최소 사전 신청 시간(분). 수정/취소 마감 기준으로도 사용됩니다.',
  PARKING_OPEN_TIME: '주차장 운영 시작 시간(HH:mm, Asia/Seoul).',
  PARKING_CLOSE_TIME: '주차장 운영 종료 시간(HH:mm, Asia/Seoul).',
  EXIT_REMINDER_MINUTES: '출차 예정 알림을 발송할 기준 시간(분 전).',
  MAX_RESERVATION_HOURS: '예약 1건의 최대 이용 시간(시간).',
  DOUBLE_PARKING_ENABLED: '이중주차 위치 추천/배정 사용 여부(true/false).',
  APP_TIME_ZONE: '시스템 표시 기준 타임존.',
};

/** DB 의 key/value 목록을 타입이 있는 설정 객체로 변환 */
export function toSettingsValues(
  rows: { settingKey: string; settingValue: string }[],
): SystemSettingsValues {
  const map = new Map(rows.map((row) => [row.settingKey, row.settingValue]));

  const readNumber = (key: SettingKey, fallback: number): number => {
    const raw = map.get(key);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const readString = (key: SettingKey, fallback: string): string =>
    map.get(key)?.trim() || fallback;

  const readBoolean = (key: SettingKey, fallback: boolean): boolean => {
    const raw = map.get(key)?.trim().toLowerCase();
    if (raw === undefined) return fallback;
    return raw === 'true' || raw === '1' || raw === 'y';
  };

  return {
    reservationMinLeadMinutes: readNumber(
      SETTING_KEYS.RESERVATION_MIN_LEAD_MINUTES,
      DEFAULT_SETTINGS.reservationMinLeadMinutes,
    ),
    parkingOpenTime: readString(SETTING_KEYS.PARKING_OPEN_TIME, DEFAULT_SETTINGS.parkingOpenTime),
    parkingCloseTime: readString(
      SETTING_KEYS.PARKING_CLOSE_TIME,
      DEFAULT_SETTINGS.parkingCloseTime,
    ),
    exitReminderMinutes: readNumber(
      SETTING_KEYS.EXIT_REMINDER_MINUTES,
      DEFAULT_SETTINGS.exitReminderMinutes,
    ),
    maxReservationHours: readNumber(
      SETTING_KEYS.MAX_RESERVATION_HOURS,
      DEFAULT_SETTINGS.maxReservationHours,
    ),
    doubleParkingEnabled: readBoolean(
      SETTING_KEYS.DOUBLE_PARKING_ENABLED,
      DEFAULT_SETTINGS.doubleParkingEnabled,
    ),
    appTimeZone: readString(SETTING_KEYS.APP_TIME_ZONE, DEFAULT_SETTINGS.appTimeZone),
  };
}

/** 설정 객체를 DB 저장용 key/value 배열로 변환 */
export function toSettingRows(
  values: SystemSettingsValues,
): { settingKey: SettingKey; settingValue: string }[] {
  return [
    {
      settingKey: SETTING_KEYS.RESERVATION_MIN_LEAD_MINUTES,
      settingValue: String(values.reservationMinLeadMinutes),
    },
    { settingKey: SETTING_KEYS.PARKING_OPEN_TIME, settingValue: values.parkingOpenTime },
    { settingKey: SETTING_KEYS.PARKING_CLOSE_TIME, settingValue: values.parkingCloseTime },
    {
      settingKey: SETTING_KEYS.EXIT_REMINDER_MINUTES,
      settingValue: String(values.exitReminderMinutes),
    },
    {
      settingKey: SETTING_KEYS.MAX_RESERVATION_HOURS,
      settingValue: String(values.maxReservationHours),
    },
    {
      settingKey: SETTING_KEYS.DOUBLE_PARKING_ENABLED,
      settingValue: String(values.doubleParkingEnabled),
    },
    { settingKey: SETTING_KEYS.APP_TIME_ZONE, settingValue: values.appTimeZone },
  ];
}
