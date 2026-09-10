# 법인 공용 차량 운영 관리 기능 — 구현 계획

이 문서는 SynopexParking(Next.js App Router + Prisma/MySQL 주차·방문 예약 시스템)에 "법인
공용 차량 운행 신청/관리" 기능을 추가하기 위한 자기완결적(self-contained) 구현 계획이다.
이 문서만으로 별도 대화 맥락 없이 그대로 구현을 진행할 수 있도록 배경, 설계 결정, 파일별
작업 내용, 검증 방법을 전부 담는다.

## Context

회사에 법인 공용 차량 2대가 있고 각각 주차면 `B1-40`, `B1-41`에 고정 배정되어 있다
(두 코드는 `src/domain/parking-map-layout.ts`에 이미 정의되어 있는 실제 stall 코드다).
지금까지 시스템은 방문객 주차 예약만 관리했는데, 이제 이 차량들의 운행 신청·승인·배정·
입출차·이력 관리를 시스템에 편입시켜야 한다. 직원이 방문 예약을 신청하듯 법인 차량 운행도
신청하고, 관리자가 승인하면서 2대 중 어느 차를 배정할지 정하고, 입출차까지 관리한다.

기존 "방문 예약(`ParkingReservation`)" 도메인과 흐름은 비슷하지만(신청→승인→입출차→이력),
방문객 전용 필드(개인정보 동의 NOT NULL, 보안서약서, 회사명, 신청자 이메일 안내 등)가
전혀 맞지 않고, 배정 대상도 "주차 공간"이 아니라 "차량 자산"이라 근본적으로 다르다. 조사
결과 기존 `ParkingReservation` 테이블을 억지로 재사용하기보다 **별도 모델**을 만들되,
상태 전이·감사 로그·화면 레이아웃 등 기존 **코드 패턴은 그대로 모방**하는 것이 가장
안전하다는 결론을 냈다(테이블을 공유하는 재사용이 아니라 패턴/유틸 재사용).

### 사용자 확정 사항 (질의응답 결과)

- "운행 요청 시간을 관리자가 설정한다"는 요구는 **시스템 설정에 운영 가능 시간대(정책)를
  미리 지정**해두는 방식으로 구현한다. (승인 시점에 관리자가 실제 시간을 직접 조정하는
  기능은 이번 범위에 없음.)
- 승인/반려 시 신청 직원에게 보내는 **이메일 알림은 이번 범위에서 생략**한다.
- 신청 폼에는 사유 외에 **행선지**를 추가로 받는다.
- "법인차량 관리" 관리자 메뉴는 **모든 관리자**(`SYSTEM_ADMIN`, `PARKING_ADMIN`)에게
  노출한다 — 반복예약처럼 시스템 관리자 전용으로 제한하지 않는다.

## 예상 소요 시간

1인 개발 기준(설계는 완료된 상태, 순수 구현+테스트+수동 검증 시간). 리뷰/QA/배포 절차는
별도.

| 작업 | 예상 시간 |
|---|---|
| Prisma 스키마 설계·마이그레이션 작성/적용 | 0.5일 |
| 시스템 설정 키 추가(도메인 값+검증+관리자 설정 UI) | 0.5일 |
| 관리자 사이드바 메뉴 변경 | 0.5시간 |
| 법인차량 CRUD(서비스+API+관리자 화면) | 1일 |
| 운행 신청 서비스(승인 시 차량 배정 충돌검증·반려·입출차·취소, 상태 전이+감사로그) | 1.5일 |
| 관리자 운행 신청 목록/상세 화면 + 액션 패널 | 1.5일 |
| 주차 평면도 색상 연동(대시보드 서비스+평면도 컴포넌트+배정 후보 제외) | 1일 |
| 직원 신청 폼+API+메인페이지 버튼 | 1일 |
| 단위/통합 테스트 작성 | 1일 |
| 통합 검증 및 버그 수정 버퍼 | 1일 |
| **합계** | **약 9.5 영업일 (2주 이내)** |

각 항목은 독립적으로 진행 가능한 단위이므로, 여러 명이 나눠 병렬로 진행하면 전체 기간은
더 줄어들 수 있다(단, 스키마 확정이 다른 모든 작업의 선행 조건).

## 데이터 모델 (`prisma/schema.prisma`)

기존 `ReservationStatus`/`ChangedByType` enum을 그대로 재사용한다(의미가 동일:
REQUESTED/APPROVED/REJECTED/CANCELLED/PARKING/EXITED/NO_SHOW).

```prisma
model CompanyVehicle {
  vehicleId      Int      @id @default(autoincrement()) @map("vehicle_id")
  vehicleNo      String   @map("vehicle_no") @db.VarChar(20)
  memo           String?  @db.VarChar(500)
  parkingSpaceId Int?     @unique @map("parking_space_id")
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  parkingSpace ParkingSpace?        @relation(fields: [parkingSpaceId], references: [spaceId])
  trips        CompanyVehicleTrip[]

  @@map("company_vehicles")
}

model CompanyVehicleTrip {
  tripId            Int               @id @default(autoincrement()) @map("trip_id")
  employeeUserId    Int               @map("employee_user_id")
  destination       String            @db.VarChar(200)
  reason            String            @db.VarChar(500)
  requestStartAt    DateTime          @map("request_start_at")
  requestEndAt      DateTime          @map("request_end_at")
  actualEntryAt     DateTime?         @map("actual_entry_at")
  actualExitAt      DateTime?         @map("actual_exit_at")
  tripStatus        ReservationStatus @default(REQUESTED) @map("trip_status")
  assignedVehicleId Int?              @map("assigned_vehicle_id")
  approvalAdminId   Int?              @map("approval_admin_id")
  approvedAt        DateTime?         @map("approved_at")
  rejectedAt        DateTime?         @map("rejected_at")
  rejectionReason   String?           @db.VarChar(500) @map("rejection_reason")
  cancelledAt       DateTime?         @map("cancelled_at")
  cancelReason      String?           @db.VarChar(500) @map("cancel_reason")
  createdAt         DateTime          @default(now()) @map("created_at")
  updatedAt         DateTime          @updatedAt @map("updated_at")

  employee        EmployeeUser                  @relation(fields: [employeeUserId], references: [employeeUserId])
  assignedVehicle CompanyVehicle?               @relation(fields: [assignedVehicleId], references: [vehicleId])
  approvalAdmin   AdminUser?                    @relation(fields: [approvalAdminId], references: [adminUserId])
  statusLogs      CompanyVehicleTripStatusLog[]

  @@index([tripStatus, requestStartAt], map: "idx_company_vehicle_trips_status_start")
  @@index([assignedVehicleId], map: "idx_company_vehicle_trips_vehicle")
  @@map("company_vehicle_trips")
}

model CompanyVehicleTripStatusLog {
  statusLogId      Int                @id @default(autoincrement()) @map("status_log_id")
  tripId           Int                @map("trip_id")
  previousStatus   ReservationStatus? @map("previous_status")
  currentStatus    ReservationStatus  @map("current_status")
  changedByType    ChangedByType      @map("changed_by_type")
  changedByAdminId Int?               @map("changed_by_admin_id")
  changeReason     String?            @db.VarChar(500) @map("change_reason")
  createdAt        DateTime           @default(now()) @map("created_at")

  trip           CompanyVehicleTrip @relation(fields: [tripId], references: [tripId], onDelete: Cascade)
  changedByAdmin AdminUser?         @relation(fields: [changedByAdminId], references: [adminUserId], onDelete: SetNull)

  @@index([tripId, createdAt], map: "idx_company_vehicle_trip_status_logs_trip_created")
  @@map("company_vehicle_trip_status_logs")
}
```

추가로 필요한 역참조(Prisma 양방향 관계 요구사항):
- `ParkingSpace`에 `companyVehicle CompanyVehicle?` 추가
- `EmployeeUser`에 `companyVehicleTrips CompanyVehicleTrip[]` 추가
- `AdminUser`에 `companyVehicleTrips CompanyVehicleTrip[]`, `companyVehicleTripStatusLogs CompanyVehicleTripStatusLog[]` 추가

스키마 상단 주석(`prisma/schema.prisma` 1~12번째 줄)의 "vehicles 테이블을 만들지 않는다"
제약은 문맥상 "방문 예약 차량번호를 정규화된 테이블로 만들지 않고 `parking_reservations`에
직접 저장한다"는 의미로 한정되어 있어(해당 줄: "차량번호는 parking_reservations 에 직접
저장한다"), 회사 소유 자산을 관리하는 `CompanyVehicle`과는 무관하다. 다만 오독을 막기 위해
그 주석 옆에 "법인 소유 공용차량 관리(CompanyVehicle)는 이 제약의 예외"라는 한 줄을
추가한다.

작업 순서: 위 모델/필드를 스키마에 추가 → `npx prisma migrate dev --name
add_company_vehicle_management`으로 마이그레이션 생성 및 로컬 개발 DB에 적용 →
`npx prisma generate`.

## 시스템 설정 추가 (`src/domain/system-settings.ts`)

- 새 키: `COMPANY_VEHICLE_OPERATING_START_TIME`, `COMPANY_VEHICLE_OPERATING_END_TIME`
  (형식 `HH:mm`). 법인 차량 운행 신청이 가능한 시간대를 관리자가 정책으로 지정한다.
  `PARKING_OPEN_TIME`/`PARKING_CLOSE_TIME`과 동일한 `timeOfDaySchema` 검증 패턴을
  재사용하되, 방문 예약 운영시간과는 독립적으로 바뀔 수 있어야 하므로 별도 키로 둔다.
  기본값은 `PARKING_OPEN_TIME`/`PARKING_CLOSE_TIME`과 동일하게(`07:00`/`22:00`) 시작한다.
- `SystemSettingsValues` 타입, `DEFAULT_SETTINGS`, `SETTING_DESCRIPTIONS`,
  `toSettingsValues`, `toSettingRows`에 위 패턴대로(기존 `exitReminderMinutes` 등과 동일한
  구조) 필드 추가.
- `src/lib/validation/admin-schema.ts`의 `systemSettingsSchema`에 두 필드 추가(시간
  포맷 검증 + `end > start` refine, `parkingOpenTime`/`parkingCloseTime` 쌍의 검증 로직을
  그대로 복제).
- `src/components/admin/settings-panel.tsx`에 두 입력 필드 추가(기존 운영시간 입력 UI
  옆에 배치).
- 신규 도메인 검증 함수: `src/domain/company-vehicle-rules.ts` 신설, 방문 예약의
  `src/domain/reservation-rules.ts`의 `checkOperatingHours` 함수를 본떠
  `checkCompanyVehicleOperatingHours(requestStartAt, requestEndAt, settings, timeZone)`
  작성 — 신청 시간이 설정 범위를 벗어나면 `ValidationError`를 던진다. 같은 파일에 "요청
  시작/종료 분(minute)이 10의 배수인지" 검증하는 `assertTenMinuteAligned(date)`도 추가
  (클라이언트 `step=600` UI를 우회해도 서버가 최종적으로 막는다).

## 관리자 사이드바 메뉴 (`src/components/admin/admin-shell.tsx`)

현재 `buildMenu()`에서 "예약"은 자식 없는 단일 링크다(`{ href: '/admin/reservations',
label: '예약' }`). "시스템 설정" 그룹과 동일한 패턴으로 자식을 가진 그룹으로 바꾼다.
`menuItemMatches()`가 "그룹 자신이 곧 페이지인 경우 자식 목록에 자기 href를 포함시켜야
활성 판정이 깨지지 않는다"고 요구하므로 아래처럼 자기 자신도 자식으로 포함시킨다:

```ts
{
  href: '/admin/reservations',
  label: '예약',
  children: [
    { href: '/admin/reservations', label: '예약 목록' },
    { href: '/admin/company-vehicles', label: '법인차량 관리' },
  ],
},
```

역할 제한 없이 `buildMenu` 최상단 배열(모든 역할 공통 부분)에 그대로 둔다 — 모든 관리자에게
노출.

## 관리자 화면/서비스/API

`src/services/parking-space-service.ts`(단순 CRUD 패턴)와
`src/app/admin/reservations/[id]/`+`src/components/admin/reservation-detail-cards.tsx`/
`reservation-action-panel.tsx`(상세+액션 패널 패턴)를 그대로 본떠 새 모듈을 만든다.

### 차량 관리

- 화면: `src/app/admin/company-vehicles/page.tsx` — 목록(차량번호/주차위치/메모/활성여부)
  + 추가/수정/비활성화 폼. `src/app/admin/settings/areas-spaces/page.tsx`의 "구역/주차면
  선택 드롭다운" UI를 참고해 `parkingSpaceId` 선택 드롭다운을 구성한다(이미 다른 차량이
  쓰고 있는 주차면은 후보에서 제외).
- 서비스: `src/services/company-vehicle-service.ts` — `listCompanyVehicles`,
  `createCompanyVehicle`, `updateCompanyVehicle`, `deleteCompanyVehicle`(또는 `isActive`
  토글로 대체 — 진행 중/과거 운행일지가 있는 차량은 물리 삭제 대신 비활성화 권장). 각 변경
  끝에 `writeAuditLog` 호출 — `src/services/audit-service.ts`의 `AUDIT_ACTIONS`에
  `COMPANY_VEHICLE_CREATE`/`COMPANY_VEHICLE_UPDATE`/`COMPANY_VEHICLE_DELETE`,
  `AUDIT_TARGETS`에 `COMPANY_VEHICLE` 추가.
- API: `src/app/api/admin/company-vehicles/route.ts`(GET 목록/POST 생성),
  `src/app/api/admin/company-vehicles/[id]/route.ts`(PATCH 수정/DELETE).
- validation: `src/lib/validation/admin-schema.ts`에 `companyVehicleCreateSchema`(차량번호
  필수, 주차위치 선택값, 메모 선택)/`companyVehicleUpdateSchema`(partial) 추가.

### 운행 신청 목록/상세

- 화면: `src/app/admin/company-vehicles/trips/page.tsx`(전체 목록, `?vehicleId=` 쿼리로
  특정 차량 필터 — 차량 관리 목록 행에서 "운행일지 보기" 링크로 연결),
  `src/app/admin/company-vehicles/trips/[id]/page.tsx`(상세).
  - 목록 컬럼: 상태, 운행 일시(`requestStartAt`~`requestEndAt`), 신청 직원, 사유. 행 클릭
    시 상세 페이지로 이동.
  - 상세 레이아웃은 `reservation-detail-cards.tsx`/`reservation-action-panel.tsx`의 카드
    순서(입출차 처리 → 배정/승인 → 반려 → 취소, 최근 정렬된 순서)를 그대로 복제한다 —
    "주차면 배정" 카드 자리에 "차량 배정" 드롭다운(활성 차량 중 선택, 겹치는 시간대에 이미
    배정된 차량은 비활성 표시)을 넣는다.
- 서비스: `src/services/company-vehicle-trip-service.ts`:
  - `listCompanyVehicleTrips(filter?: { vehicleId?: number })`
  - `getCompanyVehicleTripDetail(tripId)`
  - `createCompanyVehicleTrip(input, employeeUserId)` — 직원 신청 진입점(운영시간/10분단위
    검증 포함)
  - `approveCompanyVehicleTrip({ tripId, vehicleId, adminUserId, requestContext })` —
    선택한 차량이 해당 시간대에 이미 다른 `APPROVED`/`PARKING` 트립에 배정돼 있으면 거부
    (`src/services/reservation-service.ts`의 `findConflictingReservation` 로직을 차량
    단위로 이식한 `findConflictingTrip` 헬퍼 작성)
  - `rejectCompanyVehicleTrip({ tripId, rejectionReason, adminUserId })`
  - `markCompanyVehicleEntry`/`markCompanyVehicleExit`(admin 컨텍스트) — 기존
    `markEntry`/`markExit`와 동일하게 시스템 설정 `entryExitManagementEnabled` 체크
  - `cancelCompanyVehicleTripByAdmin`
  - 각 함수는 `assertTransition` 패턴(허용된 상태 전이만 통과)을 복제하고, 전이마다
    `CompanyVehicleTripStatusLog`를 남긴 뒤 `writeAuditLog` 호출.
- API: `src/app/api/admin/company-vehicle-trips/route.ts`(GET 목록),
  `.../[id]/route.ts`(GET 상세), `.../[id]/approve/route.ts`, `.../[id]/reject/route.ts`,
  `.../[id]/entry/route.ts`, `.../[id]/exit/route.ts`, `.../[id]/cancel/route.ts` — 전부
  `src/app/api/admin/reservations/[id]/*` 파일들과 동일한 구조(세션 확인 →
  `readJsonBody`+zod 파싱 → 서비스 호출 → `apiSuccess`/`handleApiError`).

## 주차 평면도 색상 연동

- `src/services/dashboard-service.ts`의 `SpaceStatusRow` 타입(30~51번째 줄)에
  `companyVehicle: { vehicleId: number; vehicleNo: string } | null` 필드를 추가하고,
  `spaceRows` 매핑 로직(169번째 줄 부근)에서 `CompanyVehicle` 테이블과 조인해 채운다.
  대시보드(`src/app/admin/page.tsx`)와 모니터 페이지(`src/app/admin/parking-map/page.tsx`)
  둘 다 `getDashboardData()` 하나를 공유하므로 이 한 곳만 고치면 두 화면에 자동 반영된다.
- `src/components/parking-map.tsx`:
  - 새 스타일 상수 `COMPANY_VEHICLE: StallStyle` 추가(기존 팔레트(노랑=사용가능, 초록=
    사용중, 회색=비활성)와 구분되는 색, 예: 보라 계열 `{ fill: '#ddd6fe', stroke:
    '#6d28d9', text: '#4c1d95' }`).
  - `styleFor(space)`(160~164번째 줄)에 `isActive` 체크 다음, 일반 배정 판정 이전에
    `if (space.companyVehicle) return COMPANY_VEHICLE;` 분기 추가.
  - dashboard 모드 범례(Legend)에 "법인차량" 항목 추가 — 최근 작업한 `/admin/parking-map`
    최대화 모드의 범례 텍스트 2배 확대 로직도 같은 목록에 있으므로 자동 적용됨.
- 법인차량 전용 주차면은 방문 예약 배정 후보에서 제외해야 하므로,
  `src/services/space-assignment-service.ts`의 후보 조회 쿼리(`listAvailableSpaces`,
  `pickAvailableSpace` 등)에 "이 주차면에 연결된 활성 `CompanyVehicle`이 없을 것" 조건을
  추가한다.

## 직원 신청 화면

- **메인 페이지** `src/app/employee/page.tsx` — 기존 2열 그리드(`내 방문 신청`/`방문객
  대리 신청`, 73~79번째 줄) 아래, `관리자 대시보드` 버튼처럼 단독 줄로 추가:
  ```tsx
  <Link href="/employee/company-vehicle/new" className="btn btn-primary btn-lg w-full">
    법인 차량 신청
  </Link>
  ```
- **신청 페이지** `src/app/employee/company-vehicle/new/page.tsx` — `requireEmployeePage`
  (`src/lib/employee-page-guard.ts`)로 세션 확보(전화번호 미등록 시 자동으로 마이페이지로
  리다이렉트되는 기존 가드가 그대로 적용됨), `getEmployeeProfile`로 이름 표시.
- **폼 컴포넌트** `src/components/employee/company-vehicle-request-form.tsx`(신규) —
  기존 `src/components/reservation/reservation-form.tsx`의 제출/에러 처리 패턴(`apiRequest`
  호출 → 성공 시 완료 뷰 전환, 실패 시 `fieldErrors` 표시)을 단순화해 본뜬다:
  - 운행 예정자: 세션 이름 표시(읽기 전용, `reservation-form.tsx`의 `disabled+readOnly`
    패턴과 동일).
  - 행선지, 사유: 텍스트 입력.
  - 운행 요청 시작/종료 시간: `<input type="datetime-local" step={600}>`(10분 단위) +
    `src/lib/datetime.ts`의 `earliestSelectableInput`으로 최소 선택 가능 시각 계산(리드
    타임은 별도 요구가 없었으므로 우선 기존 `RESERVATION_MIN_LEAD_MINUTES` 설정을 그대로
    재사용). 브라우저별 네이티브 스텝 동작 차이가 있으므로 실질적 강제는 서버 측
    `assertTenMinuteAligned` 검증으로 한다("화면에서 막아도 API 직접 두드리면 우회
    가능하므로 서버에서도 검증한다"는 이 코드베이스의 기존 원칙과 동일).
- **신청 API** `src/app/api/company-vehicle-trips/route.ts`(POST) —
  `requireActiveEmployee()` + `assertEmployeePhoneRegistered(session)`(기존 전화번호 필수
  가드 재사용, `src/services/employee-auth-service.ts`) → 서버가 신청자
  `employeeUserId`를 세션값으로 고정(클라이언트가 보낸 값 무시) →
  `checkCompanyVehicleOperatingHours` + `assertTenMinuteAligned` 검증 →
  `createCompanyVehicleTrip` 서비스 호출 → `REQUESTED` 상태로 저장, `apiSuccess` 응답.
- **신청 이력 조회**: 직원이 본인 법인차량 신청 이력을 조회하는 화면은 이번 범위에
  명시적으로 요청되지 않았으므로 1차 구현에서는 제외한다 — 신청 완료 후 완료 안내만
  보여준다. 필요해지면 `/employee/company-vehicle` 목록 페이지를 추가하는 후속 작업으로
  분리한다.

## 검증

1. `npx tsc --noEmit`
2. `npx prisma migrate dev`(로컬 개발 DB)로 새 마이그레이션 생성/적용 확인, `.env.test`
   DB에도 `npm run test:integration:setup`으로 적용
3. 단위 테스트(`tests/unit/`): `checkCompanyVehicleOperatingHours`, `assertTenMinuteAligned`
   등 새 도메인 검증 함수에 대한 테스트 추가
4. 통합 테스트(`tests/integration/company-vehicle-flow.test.ts` 신규): 직원 신청 → 관리자
   승인(차량 배정, 겹치는 시간대 배정 거부 케이스 포함) → 입차 → 출차 → 상태 로그 확인,
   반려/취소 플로우, 운영시간 밖 신청 거부, 전화번호 미등록 직원의 신청 차단
5. 개발 서버에서 수동 확인: 관리자 메뉴 진입 → 차량 2대 등록(B1-40/41 배정) → 주차
   평면도(대시보드+모니터 페이지 양쪽)에서 색상 확인 → 직원 계정으로 신청 → 관리자
   승인(차량 배정) → 입출차 처리까지 흐름 확인
6. 기존 회귀 테스트 전체 재실행: `npm run test:unit && npm run test:integration`(그리고
   가능하면 `npm run test:e2e`)으로 기존 기능에 영향이 없는지 확인
