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
  SPACE_ASSIGNMENT_ENABLED: 'SPACE_ASSIGNMENT_ENABLED',
  PARKING_CAPACITY: 'PARKING_CAPACITY',
  DOUBLE_PARKING_ENABLED: 'DOUBLE_PARKING_ENABLED',
  APP_TIME_ZONE: 'APP_TIME_ZONE',
  ENTRY_EXIT_MANAGEMENT_ENABLED: 'ENTRY_EXIT_MANAGEMENT_ENABLED',
  DASHBOARD_REFRESH_INTERVAL_MINUTES: 'DASHBOARD_REFRESH_INTERVAL_MINUTES',
  PERSONAL_DATA_RETENTION_DAYS: 'PERSONAL_DATA_RETENTION_DAYS',
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
  /**
   * 주차면 배정 기능 사용 여부.
   *
   * false 이면 특정 주차면을 배정하지 않고 "주차 가능 여부"만 관리한다.
   * 승인 시 주차면을 잡지 않으므로 이메일·목록·상세·대시보드에서 주차 위치 관련 표시가 사라진다.
   */
  spaceAssignmentEnabled: boolean;
  /**
   * 동시에 주차할 수 있는 최대 대수(정원).
   *
   * 주차면 배정을 사용할 때는 주차면 개수가 곧 정원이므로 이 값을 쓰지 않는다.
   * 배정을 끈 운영에서만 승인 시 정원 초과 여부를 판정하는 기준이 된다.
   */
  parkingCapacity: number;
  /** 이중주차 사용 여부. 주차면 배정을 끄면 의미가 없다. */
  doubleParkingEnabled: boolean;
  /** 표시 기준 타임존 */
  appTimeZone: string;
  /**
   * 입차 / 출차 / 미방문(NO_SHOW) 처리 사용 여부.
   *
   * false 이면
   *  - 관리자 예약 상세의 [입·출차 처리] 영역과 "실제 입차/출차" 표시가 나타나지 않는다.
   *  - 관련 API(entry / exit / no-show)가 거부된다.
   *  - 자동 NO_SHOW 배치가 아무것도 처리하지 않는다.
   *  - 신청자 화면의 "사용 중/사용 완료"는 방문 예정 시간만 보고 추정한다.
   *
   * 현장에서 입출차를 확인할 수단(차단기 연동, 상주 인력 등)이 갖춰졌을 때 관리자가 직접 켠다.
   */
  entryExitManagementEnabled: boolean;
  /** 관리자 대시보드를 상시 띄워 놨을 때 자동으로 새로고침할 주기(분) */
  dashboardRefreshIntervalMinutes: number;
  /**
   * 방문객·직원 개인정보(성명·이메일·차량번호 등) 보관 기간(일).
   *
   * 방문 신청 폼의 "개인정보 수집 및 이용 동의" 카드에 그대로 노출된다. 이 값 자체가
   * 실제 데이터를 자동 파기하지는 않는다 — 표시되는 안내 문구를 관리자가 정할 수 있게
   * 할 뿐이다.
   */
  personalDataRetentionDays: number;
};

export const DEFAULT_SETTINGS: SystemSettingsValues = {
  reservationMinLeadMinutes: 60,
  parkingOpenTime: '07:00',
  parkingCloseTime: '22:00',
  exitReminderMinutes: 10,
  maxReservationHours: 12,
  spaceAssignmentEnabled: true,
  // 실제 주차면 수(지하 1층 55면). 주차면 배정을 껐을 때의 상한으로 쓰인다.
  parkingCapacity: 55,
  // 도면상 이중주차 구역이 없어 기본값은 끔. 필요하면 시스템 설정에서 켠다.
  doubleParkingEnabled: false,
  appTimeZone: 'Asia/Seoul',
  //실제 입출차 관리 기능 사용 여부
  entryExitManagementEnabled: true,
  dashboardRefreshIntervalMinutes: 5,
  // 아직 확정된 값이 아니다 — 관리자가 시스템 설정에서 실제 정책값으로 바꿔야 한다.
  personalDataRetentionDays: 365,
};

export const SETTING_DESCRIPTIONS: Record<SettingKey, string> = {
  RESERVATION_MIN_LEAD_MINUTES:
    '예약 최소 사전 신청 시간(분). 수정/취소 마감 기준으로도 사용됩니다.',
  PARKING_OPEN_TIME: '주차장 운영 시작 시간(HH:mm, Asia/Seoul).',
  PARKING_CLOSE_TIME: '주차장 운영 종료 시간(HH:mm, Asia/Seoul).',
  EXIT_REMINDER_MINUTES: '출차 예정 알림을 발송할 기준 시간(분 전).',
  MAX_RESERVATION_HOURS: '예약 1건의 최대 이용 시간(시간).',
  SPACE_ASSIGNMENT_ENABLED:
    '주차면 배정 기능 사용 여부(true/false). false 이면 주차 위치를 배정하지 않습니다.',
  PARKING_CAPACITY:
    '동시 주차 가능 최대 대수. 주차면 배정을 사용하지 않을 때 정원 초과 승인을 막는 기준입니다.',
  DOUBLE_PARKING_ENABLED: '이중주차 위치 배정 사용 여부(true/false).',
  APP_TIME_ZONE: '시스템 표시 기준 타임존.',
  ENTRY_EXIT_MANAGEMENT_ENABLED:
    '실제 입·출차/미방문 처리 사용 여부(true/false). false 이면 관련 화면·API가 비활성화됩니다.',
  DASHBOARD_REFRESH_INTERVAL_MINUTES: '관리자 대시보드 자동 새로고침 주기(분).',
  PERSONAL_DATA_RETENTION_DAYS:
    '방문객·직원 개인정보 보관 기간(일). 방문 신청 폼의 개인정보 수집·이용 동의 문구에 노출됩니다.',
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
    spaceAssignmentEnabled: readBoolean(
      SETTING_KEYS.SPACE_ASSIGNMENT_ENABLED,
      DEFAULT_SETTINGS.spaceAssignmentEnabled,
    ),
    parkingCapacity: readNumber(SETTING_KEYS.PARKING_CAPACITY, DEFAULT_SETTINGS.parkingCapacity),
    doubleParkingEnabled: readBoolean(
      SETTING_KEYS.DOUBLE_PARKING_ENABLED,
      DEFAULT_SETTINGS.doubleParkingEnabled,
    ),
    appTimeZone: readString(SETTING_KEYS.APP_TIME_ZONE, DEFAULT_SETTINGS.appTimeZone),
    entryExitManagementEnabled: readBoolean(
      SETTING_KEYS.ENTRY_EXIT_MANAGEMENT_ENABLED,
      DEFAULT_SETTINGS.entryExitManagementEnabled,
    ),
    dashboardRefreshIntervalMinutes: readNumber(
      SETTING_KEYS.DASHBOARD_REFRESH_INTERVAL_MINUTES,
      DEFAULT_SETTINGS.dashboardRefreshIntervalMinutes,
    ),
    personalDataRetentionDays: readNumber(
      SETTING_KEYS.PERSONAL_DATA_RETENTION_DAYS,
      DEFAULT_SETTINGS.personalDataRetentionDays,
    ),
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
      settingKey: SETTING_KEYS.SPACE_ASSIGNMENT_ENABLED,
      settingValue: String(values.spaceAssignmentEnabled),
    },
    {
      settingKey: SETTING_KEYS.PARKING_CAPACITY,
      settingValue: String(values.parkingCapacity),
    },
    {
      settingKey: SETTING_KEYS.DOUBLE_PARKING_ENABLED,
      settingValue: String(values.doubleParkingEnabled),
    },
    { settingKey: SETTING_KEYS.APP_TIME_ZONE, settingValue: values.appTimeZone },
    {
      settingKey: SETTING_KEYS.ENTRY_EXIT_MANAGEMENT_ENABLED,
      settingValue: String(values.entryExitManagementEnabled),
    },
    {
      settingKey: SETTING_KEYS.DASHBOARD_REFRESH_INTERVAL_MINUTES,
      settingValue: String(values.dashboardRefreshIntervalMinutes),
    },
    {
      settingKey: SETTING_KEYS.PERSONAL_DATA_RETENTION_DAYS,
      settingValue: String(values.personalDataRetentionDays),
    },
  ];
}
