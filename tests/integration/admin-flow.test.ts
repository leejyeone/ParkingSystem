import { EmailType, ReservationStatus, SpaceType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AUDIT_ACTIONS } from '@/services/audit-service';
import { ConflictError, InvalidStateTransitionError } from '@/lib/errors';
import {
  approveReservation,
  changeAssignedSpace,
  createReservation,
  getReservationDetailForAdmin,
  listReservationsForAdmin,
  markEntry,
  markExit,
  markNoShow,
  rejectReservation,
} from '@/services/reservation-service';
import { runExitReminderJob } from '@/services/exit-reminder-service';
import {
  baseReservationInput,
  futureVisitRange,
  prisma,
  resetDatabase,
  seedFixtures,
  type TestFixtures,
} from './helpers';

let fixtures: TestFixtures;

afterAll(async () => {
  await prisma.$disconnect();
});

describe('7. 승인 대기 예약을 일반 주차면으로 승인', () => {
  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures({ normalSpaces: 2 });
  });

  it('추천 주차면으로 승인되고 승인 메일이 발송된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const approved = await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    expect(approved.reservationStatus).toBe(ReservationStatus.APPROVED);
    expect(approved.assignedSpaceId).toBe(fixtures.normalSpaceIds[0]);
    expect(approved.assignedSpace?.spaceType).toBe(SpaceType.NORMAL);
    expect(approved.approvalAdminId).toBe(fixtures.parkingAdminId);
    expect(approved.approvedAt).not.toBeNull();

    const approvedMails = await prisma.emailSendLog.findMany({
      where: { reservationId: reservation.reservationId, emailType: EmailType.APPROVED },
    });
    expect(approvedMails).toHaveLength(1);
  });

  it('관리자가 추천과 다른 주차면을 직접 지정할 수 있다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const approved = await approveReservation({
      reservationId: reservation.reservationId,
      spaceId: fixtures.normalSpaceIds[1],
      adminUserId: fixtures.parkingAdminId,
    });

    expect(approved.assignedSpaceId).toBe(fixtures.normalSpaceIds[1]);
  });

  it('승인 처리는 감사 로그에 기록된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { actionType: AUDIT_ACTIONS.RESERVATION_APPROVE },
    });
    expect(audit?.actorAdminId).toBe(fixtures.parkingAdminId);
    expect(audit?.targetId).toBe(String(reservation.reservationId));
  });

  it('이미 승인된 예약은 다시 승인할 수 없다 (상태 전이 차단)', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    await expect(
      approveReservation({
        reservationId: reservation.reservationId,
        adminUserId: fixtures.parkingAdminId,
      }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });
});

describe('8. 일반 주차면 만차 시 이중주차로 승인', () => {
  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures({ normalSpaces: 1 });
  });

  it('일반 주차면이 모두 차면 이중주차 위치를 추천하고 안내 메일을 추가 발송한다', async () => {
    const range = futureVisitRange({ startHour: 10, hours: 2 });

    const first = await createReservation(baseReservationInput(range));
    await approveReservation({
      reservationId: first.reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    const second = await createReservation(
      baseReservationInput({ ...range, vehicleNo: '34나5678', requesterEmail: 'b@example.com' }),
    );
    expect(second.reservation.recommendedSpaceId).toBe(fixtures.doubleSpaceIds[0]);

    const approved = await approveReservation({
      reservationId: second.reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    expect(approved.assignedSpace?.spaceType).toBe(SpaceType.DOUBLE);

    const doubleMails = await prisma.emailSendLog.findMany({
      where: {
        reservationId: second.reservation.reservationId,
        emailType: EmailType.DOUBLE_PARKING_NOTICE,
      },
    });
    // 신청자 1건 + 이중주차 알림 수신 관리자 1건
    expect(doubleMails).toHaveLength(2);
  });

  it('모든 주차면이 만차이면 승인할 수 없다', async () => {
    const range = futureVisitRange({ startHour: 10, hours: 2 });
    const vehicles = ['12가3456', '34나5678', '56다7890'];

    for (const vehicleNo of vehicles) {
      const created = await createReservation(
        baseReservationInput({ ...range, vehicleNo, requesterEmail: `${vehicleNo}@example.com` }),
      );
      await approveReservation({
        reservationId: created.reservation.reservationId,
        adminUserId: fixtures.parkingAdminId,
      });
    }

    const overflow = await createReservation(
      baseReservationInput({ ...range, vehicleNo: '78라1234', requesterEmail: 'over@example.com' }),
    );
    expect(overflow.reservation.recommendedSpaceId).toBeNull();

    await expect(
      approveReservation({
        reservationId: overflow.reservation.reservationId,
        adminUserId: fixtures.parkingAdminId,
      }),
    ).rejects.toThrowError(/배정 가능한 주차면이 없습니다/);
  });
});

describe('9. 동일 주차면의 중복 시간대 승인 실패', () => {
  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures({ normalSpaces: 2 });
  });

  it('이미 사용 중인 주차면을 지정하면 승인이 거부된다', async () => {
    const range = futureVisitRange({ startHour: 10, hours: 2 });

    const first = await createReservation(baseReservationInput(range));
    await approveReservation({
      reservationId: first.reservation.reservationId,
      spaceId: fixtures.normalSpaceIds[0],
      adminUserId: fixtures.parkingAdminId,
    });

    const second = await createReservation(
      baseReservationInput({
        ...futureVisitRange({ startHour: 11, hours: 2 }),
        vehicleNo: '34나5678',
        requesterEmail: 'b@example.com',
      }),
    );

    await expect(
      approveReservation({
        reservationId: second.reservation.reservationId,
        spaceId: fixtures.normalSpaceIds[0],
        adminUserId: fixtures.parkingAdminId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('시간이 겹치지 않으면 같은 주차면을 다시 배정할 수 있다', async () => {
    const first = await createReservation(
      baseReservationInput(futureVisitRange({ startHour: 9, hours: 2 })),
    );
    await approveReservation({
      reservationId: first.reservation.reservationId,
      spaceId: fixtures.normalSpaceIds[0],
      adminUserId: fixtures.parkingAdminId,
    });

    const second = await createReservation(
      baseReservationInput({
        ...futureVisitRange({ startHour: 11, hours: 2 }),
        vehicleNo: '34나5678',
        requesterEmail: 'b@example.com',
      }),
    );

    const approved = await approveReservation({
      reservationId: second.reservation.reservationId,
      spaceId: fixtures.normalSpaceIds[0],
      adminUserId: fixtures.parkingAdminId,
    });
    expect(approved.assignedSpaceId).toBe(fixtures.normalSpaceIds[0]);
  });
});

describe('반려 / 입차 / 출차 / 미방문 처리', () => {
  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures({ normalSpaces: 2 });
  });

  it('반려하면 사유가 저장되고 반려 메일이 발송된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const rejected = await rejectReservation({
      reservationId: reservation.reservationId,
      rejectionReason: '해당 시간대 주차 공간 부족',
      adminUserId: fixtures.parkingAdminId,
    });

    expect(rejected.reservationStatus).toBe(ReservationStatus.REJECTED);
    expect(rejected.rejectionReason).toBe('해당 시간대 주차 공간 부족');
    expect(rejected.assignedSpaceId).toBeNull();

    const mails = await prisma.emailSendLog.findMany({
      where: { reservationId: reservation.reservationId, emailType: EmailType.REJECTED },
    });
    expect(mails).toHaveLength(1);
  });

  it('입차 → 출차 흐름에서 실제 시각이 기록된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    const parking = await markEntry({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });
    expect(parking.reservationStatus).toBe(ReservationStatus.PARKING);
    expect(parking.actualEntryAt).not.toBeNull();

    const exited = await markExit({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });
    expect(exited.reservationStatus).toBe(ReservationStatus.EXITED);
    expect(exited.actualExitAt).not.toBeNull();
  });

  it('승인 전에는 입차 처리를 할 수 없다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    await expect(
      markEntry({ reservationId: reservation.reservationId, adminUserId: fixtures.parkingAdminId }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('NO_SHOW 처리 시 주차면이 해제된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    const noShow = await markNoShow({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    expect(noShow.reservationStatus).toBe(ReservationStatus.NO_SHOW);
    expect(noShow.assignedSpaceId).toBeNull();
  });

  it('주차 위치 변경이 감사 로그에 남는다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      spaceId: fixtures.normalSpaceIds[0],
      adminUserId: fixtures.parkingAdminId,
    });

    const changed = await changeAssignedSpace({
      reservationId: reservation.reservationId,
      spaceId: fixtures.normalSpaceIds[1],
      adminUserId: fixtures.parkingAdminId,
    });

    expect(changed.assignedSpaceId).toBe(fixtures.normalSpaceIds[1]);

    const audit = await prisma.auditLog.findFirst({
      where: { actionType: AUDIT_ACTIONS.RESERVATION_SPACE_CHANGE },
    });
    expect(audit).not.toBeNull();
  });

  it('상세 조회(개인정보 열람)는 감사 로그에 기록된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    await getReservationDetailForAdmin(reservation.reservationId, {
      adminUserId: fixtures.parkingAdminId,
      requestContext: { ipAddress: '10.0.0.1', userAgent: 'vitest' },
    });

    const audit = await prisma.auditLog.findFirst({
      where: { actionType: AUDIT_ACTIONS.RESERVATION_DETAIL_VIEW },
    });
    expect(audit?.ipAddress).toBe('10.0.0.1');
  });

  it('목록 조회도 감사 로그에 기록되며 검색어 원문은 남지 않는다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    await listReservationsForAdmin(
      { requesterName: '홍길동', vehicleNo: '12가3456' },
      {
        adminUserId: fixtures.parkingAdminId,
        requestContext: { ipAddress: '10.0.0.2', userAgent: 'vitest' },
      },
    );

    const audit = await prisma.auditLog.findFirst({
      where: { actionType: AUDIT_ACTIONS.RESERVATION_LIST_VIEW },
    });
    expect(audit?.ipAddress).toBe('10.0.0.2');

    // 검색어(성명/차량번호)는 그 자체가 개인정보이므로 입력 여부만 남아야 한다.
    const serialized = JSON.stringify(audit?.detailJson);
    expect(serialized).not.toContain('홍길동');
    expect(serialized).not.toContain('12가3456');
    expect(audit?.detailJson).toMatchObject({
      filters: { requesterNameKeyword: true, vehicleNoKeyword: true },
    });

    // 어떤 정보주체를 처리했는지는 추적할 수 있어야 한다.
    const detail = audit?.detailJson as { reservationIds?: number[] } | null;
    expect(detail?.reservationIds).toContain(reservation.reservationId);
  });

  it('같은 관리자가 5분 안에 같은 대상을 반복 열람하면 한 건으로 묶인다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    const actor = {
      adminUserId: fixtures.parkingAdminId,
      requestContext: { ipAddress: '10.0.0.3', userAgent: 'vitest' },
    };

    await getReservationDetailForAdmin(reservation.reservationId, actor);
    await getReservationDetailForAdmin(reservation.reservationId, actor);
    await getReservationDetailForAdmin(reservation.reservationId, actor);

    const viewCount = await prisma.auditLog.count({
      where: { actionType: AUDIT_ACTIONS.RESERVATION_DETAIL_VIEW },
    });
    expect(viewCount).toBe(1);
  });

  it('상태 변경 행위는 반복해도 묶이지 않는다', async () => {
    const first = await createReservation(baseReservationInput());
    const second = await createReservation(
      baseReservationInput({ vehicleNo: '34나5678', ...futureVisitRange({ daysFromToday: 2 }) }),
    );

    await approveReservation({
      reservationId: first.reservation.reservationId,
      spaceId: fixtures.normalSpaceIds[0],
      adminUserId: fixtures.parkingAdminId,
    });
    await approveReservation({
      reservationId: second.reservation.reservationId,
      spaceId: fixtures.normalSpaceIds[1],
      adminUserId: fixtures.parkingAdminId,
    });

    const approveCount = await prisma.auditLog.count({
      where: { actionType: AUDIT_ACTIONS.RESERVATION_APPROVE },
    });
    expect(approveCount).toBe(2);
  });
});

describe('12. 출차 예정 알림 중복 발송 방지', () => {
  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures({ normalSpaces: 2 });
  });

  it('여러 번 실행해도 같은 예약에 한 번만 발송된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    // 출차 예정 시각을 5분 뒤로 옮겨 알림 대상으로 만든다.
    await prisma.parkingReservation.update({
      where: { reservationId: reservation.reservationId },
      data: { visitEndAt: new Date(Date.now() + 5 * 60_000) },
    });

    const first = await runExitReminderJob();
    expect(first.sentCount).toBe(1);

    const second = await runExitReminderJob();
    expect(second.sentCount).toBe(0);
    const third = await runExitReminderJob();
    expect(third.sentCount).toBe(0);

    const reminderMails = await prisma.emailSendLog.findMany({
      where: {
        reservationId: reservation.reservationId,
        emailType: EmailType.EXIT_REMINDER,
        sendStatus: 'SUCCESS',
      },
    });
    expect(reminderMails).toHaveLength(1);
  });

  it('알림 시간 범위 밖의 예약은 발송하지 않는다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });

    const result = await runExitReminderJob();
    expect(result.targetCount).toBe(0);
  });

  it('발송에 실패하면 멱등성 키가 해제되어 다음 실행에서 재시도한다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.parkingAdminId,
    });
    await prisma.parkingReservation.update({
      where: { reservationId: reservation.reservationId },
      data: { visitEndAt: new Date(Date.now() + 5 * 60_000) },
    });

    fixtures.mail.shouldFail = true;
    const failed = await runExitReminderJob();
    expect(failed.failedCount).toBe(1);

    fixtures.mail.shouldFail = false;
    const retried = await runExitReminderJob();
    expect(retried.sentCount).toBe(1);
  });
});
