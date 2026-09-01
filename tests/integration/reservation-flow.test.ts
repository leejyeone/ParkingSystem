import { EmailType, ReservationStatus } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { resolveAccessToken } from '@/services/reservation-access-service';
import {
  approveReservation,
  cancelReservationByAdmin,
  cancelReservationByRequester,
  createProxyReservationForVisitor,
  createReservation,
  getReservationForRequester,
  updateReservationByRequester,
} from '@/services/reservation-service';
import {
  baseReservationInput,
  futureVisitRange,
  prisma,
  resetDatabase,
  seedEmployeeFixture,
  seedFixtures,
  type TestFixtures,
} from './helpers';

/**
 * 예약 신청 ~ 조회 ~ 수정 ~ 취소 통합 시나리오.
 * 실제 MySQL 테스트 DB 를 사용한다.
 */

let fixtures: TestFixtures;

beforeEach(async () => {
  await resetDatabase();
  fixtures = await seedFixtures({ normalSpaces: 2 });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** 이메일 링크에서 원본 토큰만 추출 */
function extractToken(accessUrl: string): string {
  return accessUrl.split('/r/')[1];
}

describe('1. 비로그인 방문객 예약 신청', () => {
  it('예약이 REQUESTED 상태로 생성되고 주차면을 점유하지 않는다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    expect(reservation.reservationStatus).toBe(ReservationStatus.REQUESTED);
    expect(reservation.reservationNo).toMatch(/^PK-\d{8}-[A-Z2-9]{6}$/);
    // REQUESTED 상태는 주차면을 확정 점유하지 않는다.
    expect(reservation.assignedSpaceId).toBeNull();
  });

  it('차량번호는 공백/하이픈이 제거되어 정규화 저장된다', async () => {
    const { reservation } = await createReservation(
      baseReservationInput({ vehicleNo: '12가 - 3456' }),
    );

    expect(reservation.vehicleNo).toBe('12가3456');
  });

  it('비로그인 신청은 회원 계정에 연결되지 않는다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    expect(reservation.visitorUserId).toBeNull();
  });

  it('신청자와 관리자에게 이메일이 발송되고 이력이 기록된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const logs = await prisma.emailSendLog.findMany({
      where: { reservationId: reservation.reservationId },
    });

    expect(logs.map((log) => log.emailType).sort()).toEqual(
      [EmailType.NEW_REQUEST_TO_ADMIN, EmailType.REQUEST_RECEIVED].sort(),
    );
    expect(logs.every((log) => log.sendStatus === 'SUCCESS')).toBe(true);
    expect(fixtures.mail.findByRecipient('hong@example.com')).toHaveLength(1);
    expect(fixtures.mail.findByRecipient('notify@example.com')).toHaveLength(1);
  });

  it('상태 이력이 생성된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const logs = await prisma.parkingReservationStatusLog.findMany({
      where: { reservationId: reservation.reservationId },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].previousStatus).toBeNull();
    expect(logs[0].currentStatus).toBe(ReservationStatus.REQUESTED);
    expect(logs[0].changedByType).toBe('REQUESTER');
  });
});

describe('2. 비로그인 직원 분류 예약 신청', () => {
  it('EMPLOYEE 도 동일하게 REQUESTED 로 생성되며 추가 권한이 없다', async () => {
    const { reservation } = await createReservation(
      baseReservationInput({
        requesterType: 'EMPLOYEE',
        companyOrBranchName: '대구사업장',
        requesterEmail: 'employee@example.com',
        vehicleNo: '34나5678',
      }),
    );

    expect(reservation.requesterType).toBe('EMPLOYEE');
    // 자동 승인되지 않는다.
    expect(reservation.reservationStatus).toBe(ReservationStatus.REQUESTED);
    expect(reservation.assignedSpaceId).toBeNull();
    expect(reservation.approvalAdminId).toBeNull();
  });
});

describe('3. 동일 차량번호 시간 중복 예약 실패', () => {
  it('겹치는 시간대에 같은 차량번호로 신청하면 거부한다', async () => {
    const range = futureVisitRange({ startHour: 10, hours: 2 });
    await createReservation(baseReservationInput(range));

    await expect(
      createReservation(
        baseReservationInput({
          ...futureVisitRange({ startHour: 11, hours: 2 }),
          requesterEmail: 'other@example.com',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('시간이 겹치지 않으면 같은 차량번호도 신청할 수 있다', async () => {
    await createReservation(baseReservationInput(futureVisitRange({ startHour: 9, hours: 2 })));

    const { reservation } = await createReservation(
      baseReservationInput(futureVisitRange({ startHour: 11, hours: 2 })),
    );
    expect(reservation.reservationStatus).toBe(ReservationStatus.REQUESTED);
  });

  it('취소된 예약과는 중복으로 보지 않는다', async () => {
    const range = futureVisitRange({ startHour: 10, hours: 2 });
    const created = await createReservation(baseReservationInput(range));
    await cancelReservationByRequester(created.reservation.reservationId, '일정 취소');

    const again = await createReservation(baseReservationInput(range));
    expect(again.reservation.reservationStatus).toBe(ReservationStatus.REQUESTED);
  });
});

describe('4. 60분 이내 예약 신청 실패', () => {
  it('현재로부터 60분 이내 시작하는 예약은 거부한다', async () => {
    const start = new Date(Date.now() + 30 * 60_000);
    const end = new Date(start.getTime() + 60 * 60_000);

    const error = await createReservation(
      baseReservationInput({ visitStartAt: start, visitEndAt: end }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors?.visitStartAt?.[0]).toContain('60분');
  });

  it('개인정보 동의가 없으면 거부한다', async () => {
    await expect(
      createReservation(baseReservationInput({ privacyConsent: false })),
    ).rejects.toThrowError(/개인정보/);
  });
});

describe('5~6. 토큰 기반 예약 조회', () => {
  it('이메일 링크의 토큰으로 본인 예약 1건을 조회할 수 있다', async () => {
    const { reservation, accessUrl } = await createReservation(baseReservationInput());

    const resolved = await resolveAccessToken(extractToken(accessUrl));
    expect(resolved.reservationId).toBe(reservation.reservationId);

    const view = await getReservationForRequester(resolved.reservationId);
    expect(view.reservationNo).toBe(reservation.reservationNo);
    expect(view.canChange).toBe(true);
  });

  it('원본 토큰은 DB 에 저장되지 않는다 (해시만 저장)', async () => {
    const { accessUrl } = await createReservation(baseReservationInput());
    const rawToken = extractToken(accessUrl);

    const tokens = await prisma.reservationAccessToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).not.toBe(rawToken);
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('잘못된 토큰은 조회할 수 없다', async () => {
    await createReservation(baseReservationInput());

    await expect(resolveAccessToken('x'.repeat(43))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('만료된 토큰은 조회할 수 없다', async () => {
    const { accessUrl } = await createReservation(baseReservationInput());
    await prisma.reservationAccessToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(resolveAccessToken(extractToken(accessUrl))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('비활성화된 토큰은 조회할 수 없다', async () => {
    const { accessUrl } = await createReservation(baseReservationInput());
    await prisma.reservationAccessToken.updateMany({ data: { isActive: false } });

    await expect(resolveAccessToken(extractToken(accessUrl))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('10. 신청자 수정 (승인 대기 상태에서만 가능)', () => {
  it('REQUESTED 상태에서는 수정할 수 있다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const nextRange = futureVisitRange({ daysFromToday: 2, startHour: 13, hours: 2 });
    const updated = await updateReservationByRequester(reservation.reservationId, {
      companyOrBranchName: '시노펙스',
      requesterName: '홍길동',
      vehicleNo: '12가3456',
      visitPurpose: null,
      requestMemo: null,
      ...nextRange,
    });

    expect(updated.reservationStatus).toBe(ReservationStatus.REQUESTED);
    expect(updated.assignedSpaceId).toBeNull();
  });

  it('변경 이력과 변경 메일이 남는다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    await updateReservationByRequester(reservation.reservationId, {
      companyOrBranchName: '시노펙스',
      requesterName: '홍길동',
      vehicleNo: '12가3456',
      visitPurpose: null,
      requestMemo: null,
      ...futureVisitRange({ daysFromToday: 2, startHour: 13, hours: 2 }),
    });

    const statusLogs = await prisma.parkingReservationStatusLog.findMany({
      where: { reservationId: reservation.reservationId },
      orderBy: { statusLogId: 'asc' },
    });
    expect(statusLogs.at(-1)?.currentStatus).toBe(ReservationStatus.REQUESTED);
    expect(statusLogs.at(-1)?.previousStatus).toBe(ReservationStatus.REQUESTED);
    expect(statusLogs.at(-1)?.changedByType).toBe('REQUESTER');

    const updatedMails = await prisma.emailSendLog.findMany({
      where: { reservationId: reservation.reservationId, emailType: EmailType.UPDATED },
    });
    // 신청자 1건 + 관리자 알림 1건
    expect(updatedMails).toHaveLength(2);
  });

  it('승인 완료 이후에는 신청자가 직접 수정할 수 없다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.secondAdminId,
    });

    await expect(
      updateReservationByRequester(reservation.reservationId, {
        companyOrBranchName: '시노펙스',
        requesterName: '홍길동',
        vehicleNo: '12가3456',
        visitPurpose: null,
        requestMemo: null,
        ...futureVisitRange({ daysFromToday: 2, startHour: 13, hours: 2 }),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('방문 시작 60분 이내에는 수정할 수 없다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    // 방문 시작 시각을 30분 뒤로 강제 변경해 마감 이후 상황을 만든다.
    await prisma.parkingReservation.update({
      where: { reservationId: reservation.reservationId },
      data: {
        visitStartAt: new Date(Date.now() + 30 * 60_000),
        visitEndAt: new Date(Date.now() + 90 * 60_000),
      },
    });

    await expect(
      cancelReservationByRequester(reservation.reservationId, '지금 취소'),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('11. 예약 취소', () => {
  it('REQUESTED 상태에서는 신청자가 직접 취소할 수 있다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const cancelled = await cancelReservationByRequester(
      reservation.reservationId,
      '방문 일정 취소',
    );

    expect(cancelled.reservationStatus).toBe(ReservationStatus.CANCELLED);
    expect(cancelled.cancelReason).toBe('방문 일정 취소');
    expect(cancelled.cancelledAt).not.toBeNull();

    const cancelMails = await prisma.emailSendLog.findMany({
      where: { reservationId: reservation.reservationId, emailType: EmailType.CANCELLED },
    });
    expect(cancelMails.length).toBeGreaterThanOrEqual(2);
  });

  it('승인 완료 이후에는 신청자가 직접 취소할 수 없다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.secondAdminId,
    });

    await expect(
      cancelReservationByRequester(reservation.reservationId, '방문 일정 취소'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('관리자가 승인 완료된 예약을 취소하면 주차면이 해제되고 사유/시각이 기록된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.secondAdminId,
    });

    const cancelled = await cancelReservationByAdmin({
      reservationId: reservation.reservationId,
      cancelReason: '담당자 요청으로 취소',
      adminUserId: fixtures.secondAdminId,
    });

    expect(cancelled.reservationStatus).toBe(ReservationStatus.CANCELLED);
    expect(cancelled.assignedSpaceId).toBeNull();
    expect(cancelled.cancelReason).toBe('담당자 요청으로 취소');
    expect(cancelled.cancelledAt).not.toBeNull();

    const statusLogs = await prisma.parkingReservationStatusLog.findMany({
      where: { reservationId: reservation.reservationId },
      orderBy: { statusLogId: 'asc' },
    });
    expect(statusLogs.at(-1)?.changedByType).toBe('ADMIN');

    const cancelMails = await prisma.emailSendLog.findMany({
      where: { reservationId: reservation.reservationId, emailType: EmailType.CANCELLED },
    });
    expect(cancelMails.length).toBeGreaterThanOrEqual(2);
  });

  it('관리자 취소로 비워진 주차면은 다른 예약이 사용할 수 있다', async () => {
    const range = futureVisitRange({ startHour: 10, hours: 2 });
    const first = await createReservation(baseReservationInput(range));
    await approveReservation({
      reservationId: first.reservation.reservationId,
      adminUserId: fixtures.secondAdminId,
    });
    await cancelReservationByAdmin({
      reservationId: first.reservation.reservationId,
      cancelReason: '취소',
      adminUserId: fixtures.secondAdminId,
    });

    const second = await createReservation(
      baseReservationInput({ ...range, vehicleNo: '34나5678', requesterEmail: 'b@example.com' }),
    );
    const approved = await approveReservation({
      reservationId: second.reservation.reservationId,
      adminUserId: fixtures.secondAdminId,
    });

    expect(approved.assignedSpaceId).toBe(fixtures.normalSpaceIds[0]);
  });
});

describe('12. 당사 담당자 전용 메일', () => {
  it('방문객 자가신청에서 고른 담당자는 신청자와 다른 문구·제목의 메일을 받는다', async () => {
    const host = await seedEmployeeFixture({ email: 'host@example.com', name: '박담당' });

    const { reservation } = await createReservation(
      baseReservationInput({ employeeUserId: host.employeeUserId }),
    );

    const requesterMails = fixtures.mail.findByRecipient('hong@example.com');
    const hostMails = fixtures.mail.findByRecipient('host@example.com');
    expect(requesterMails).toHaveLength(1);
    expect(hostMails).toHaveLength(1);
    expect(requesterMails[0].text).toContain('홍길동님, 방문 신청이 정상 접수되었습니다');
    expect(hostMails[0].text).toContain(
      '담당하고 계신 방문객 홍길동님의 방문 신청이 접수되었습니다',
    );
    expect(hostMails[0].subject).toBe('[시노펙스] 시노펙스 홍길동님 방문 신청이 접수되었습니다');
    expect(requesterMails[0].subject).toBe('[시노펙스] 방문 신청이 접수되었습니다');

    await approveReservation({
      reservationId: reservation.reservationId,
      adminUserId: fixtures.secondAdminId,
    });
    const hostApprovedMails = fixtures.mail.findByRecipient('host@example.com');
    expect(hostApprovedMails.at(-1)?.text).toContain(
      '담당하고 계신 방문객 홍길동님의 방문 신청이 승인되었습니다',
    );

    await cancelReservationByAdmin({
      reservationId: reservation.reservationId,
      cancelReason: '방문 취소',
      adminUserId: fixtures.secondAdminId,
    });
    const hostCancelledMails = fixtures.mail.findByRecipient('host@example.com');
    expect(hostCancelledMails.at(-1)?.text).toContain(
      '담당하고 계신 방문객 홍길동님의 방문 예약이 취소되었습니다',
    );
  });

  it('직원 대리 신청도 담당자(대리 신청한 직원 본인)는 신청자용이 아닌 담당자용 문구를 받는다', async () => {
    const host = await seedEmployeeFixture({ email: 'proxy-host@example.com', name: '김대리' });

    await createProxyReservationForVisitor(
      baseReservationInput({ requesterEmail: 'visitor-guest@example.com' }),
      host.employeeUserId,
    );

    const requesterMails = fixtures.mail.findByRecipient('visitor-guest@example.com');
    const hostMails = fixtures.mail.findByRecipient('proxy-host@example.com');
    expect(requesterMails).toHaveLength(1);
    expect(hostMails).toHaveLength(1);
    expect(requesterMails[0].text).toContain('홍길동님, 방문 신청이 정상 접수되었습니다');
    // 대리 신청한 직원 본인도 "신청자용"이 아니라 "담당자용" 문구로 받는다(경로 무관).
    expect(hostMails[0].text).toContain(
      '담당하고 계신 방문객 홍길동님의 방문 신청이 접수되었습니다',
    );
  });

  it('담당자가 없으면 담당자용 메일이 따로 나가지 않는다', async () => {
    await createReservation(baseReservationInput());

    const requesterMails = fixtures.mail.findByRecipient('hong@example.com');
    expect(requesterMails).toHaveLength(1);
    // 신청자(hong@example.com) + 신규 신청 관리자 알림(notify@example.com, seedFixtures) 2건뿐.
    expect(fixtures.mail.sentMessages).toHaveLength(2);
  });
});
