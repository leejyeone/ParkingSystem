/**
 * 코드 수준 기능 스위치.
 *
 * 시스템 설정(system_settings)과 달리 운영자가 화면에서 바꾸는 값이 아니라,
 * "아직 운영에 쓰지 않기로 한 기능"을 한곳에서 끄기 위한 상수다.
 * 다시 쓰기로 하면 이 값만 true 로 되돌리면 된다.
 */

/**
 * 입차 / 출차 / 미방문(NO_SHOW) 처리 사용 여부.
 *
 * false 이면
 *  - 관리자 예약 상세의 [입·출차 처리] 영역이 나타나지 않는다.
 *  - 관련 API(entry / exit / no-show)가 거부된다.
 *  - 자동 NO_SHOW 배치가 아무것도 처리하지 않는다.
 *
 * 현장에서 입출차를 확인할 수단(차단기 연동, 상주 인력 등)이 정해지기 전까지 꺼 둔다.
 * 켜기 전에 예약 상태 흐름(APPROVED → PARKING → EXITED)을 다시 점검할 것.
 */
export const ENTRY_EXIT_MANAGEMENT_ENABLED = false;
