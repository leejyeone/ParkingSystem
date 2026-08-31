import { RequesterType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { NotFoundError, ValidationError } from '@/lib/errors';
import { createReservationSchema } from '@/lib/validation/reservation-schema';
import {
  createEmployeeReservation,
  createProxyReservationForVisitor,
  createVisitorReservation,
  listReservationsForEmployee,
  listReservationsForUser,
} from '@/services/reservation-service';
import { enterByEmail, enterByEmployeeCode } from '@/services/employee-auth-service';
import { signUpUser } from '@/services/user-auth-service';
import {
  baseReservationInput,
  prisma,
  resetDatabase,
  seedEmployeeFixture,
  seedFixtures,
} from './helpers';

/**
 * 직원 계정(방문객과 완전 분리, 비밀번호 없이 사번만으로 로그인) + 본인 방문/대리 신청
 * 통합 시나리오.
 */

beforeEach(async () => {
  await resetDatabase();
  await seedFixtures({ normalSpaces: 2 });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('직원 계정은 사번만으로 진입한다(비밀번호 없음)', () => {
  it('시드된 사번으로 진입하면 세션이 발급되고 마지막 로그인 시각이 갱신된다', async () => {
    const employee = await seedEmployeeFixture({ employeeCode: 'E1001' });

    const session = await enterByEmployeeCode('E1001');
    expect(session.employeeUserId).toBe(employee.employeeUserId);
    expect(session.email).toBe(employee.email);

    const updated = await prisma.employeeUser.findUniqueOrThrow({
      where: { employeeUserId: employee.employeeUserId },
    });
    expect(updated.lastLoginAt).not.toBeNull();
  });

  it('존재하지 않는 사번으로는 진입할 수 없다', async () => {
    await expect(enterByEmployeeCode('NO-SUCH-CODE')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('같은 이메일로 방문객과 직원 양쪽에 계정이 있어도 서로 무관하다', async () => {
    const email = 'both@example.com';

    const visitorSession = await signUpUser({
      email,
      password: 'Visitor!2345',
      name: '홍길동',
      companyOrBranchName: '시노펙스',
    });
    const employee = await seedEmployeeFixture({ email, employeeCode: 'E2002' });

    expect(visitorSession.email).toBe(email);
    const employeeSession = await enterByEmployeeCode('E2002');
    expect(employeeSession.employeeUserId).toBe(employee.employeeUserId);
  });
});

describe('개발 편의용: 이메일로도 진입할 수 있다(운영 계약인 사번의 보조 경로)', () => {
  it('시드된 이메일로 진입하면 세션이 발급되고 마지막 로그인 시각이 갱신된다', async () => {
    const employee = await seedEmployeeFixture({ email: 'dev-entry@example.com' });

    const session = await enterByEmail('dev-entry@example.com');
    expect(session.employeeUserId).toBe(employee.employeeUserId);
    expect(session.employeeCode).toBe(employee.employeeCode);

    const updated = await prisma.employeeUser.findUniqueOrThrow({
      where: { employeeUserId: employee.employeeUserId },
    });
    expect(updated.lastLoginAt).not.toBeNull();
  });

  it('존재하지 않는 이메일로는 진입할 수 없다', async () => {
    await expect(enterByEmail('no-such-employee@example.com')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('직원 본인 방문 신청', () => {
  it('requesterType=EMPLOYEE, employeeUserId=본인, visitorUserId=NULL 로 저장되고 동의 없이도 통과한다', async () => {
    const employee = await seedEmployeeFixture();

    const { reservation } = await createEmployeeReservation(
      baseReservationInput(),
      employee.employeeUserId,
    );

    expect(reservation.requesterType).toBe(RequesterType.EMPLOYEE);
    expect(reservation.employeeUserId).toBe(employee.employeeUserId);
    expect(reservation.visitorUserId).toBeNull();
  });
});

describe('직원의 방문객 대리 신청', () => {
  it('requesterType=VISITOR, employeeUserId=담당 직원, visitorUserId=NULL 로 저장된다', async () => {
    const employee = await seedEmployeeFixture();

    const { reservation } = await createProxyReservationForVisitor(
      baseReservationInput(),
      employee.employeeUserId,
    );

    expect(reservation.requesterType).toBe(RequesterType.VISITOR);
    expect(reservation.employeeUserId).toBe(employee.employeeUserId);
    expect(reservation.visitorUserId).toBeNull();
  });

  it('방문객 동의 확인값이 없으면 신청할 수 없다', async () => {
    const employee = await seedEmployeeFixture();

    await expect(
      createProxyReservationForVisitor(
        baseReservationInput({ privacyConsent: false }),
        employee.employeeUserId,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('방문객/직원 예약 목록 분리', () => {
  it('직원이 만든 예약(본인 방문/대리 신청)은 방문객 마이페이지 목록에 섞이지 않는다', async () => {
    const visitorSession = await signUpUser({
      email: 'visitor-only@example.com',
      password: 'Visitor!2345',
      name: '방문객',
      companyOrBranchName: '외부업체',
    });
    const employee = await seedEmployeeFixture();

    await createVisitorReservation({
      ...baseReservationInput({ vehicleNo: '11가1111' }),
      visitorUserId: visitorSession.userId,
    });
    await createEmployeeReservation(
      baseReservationInput({ vehicleNo: '22나2222' }),
      employee.employeeUserId,
    );
    await createProxyReservationForVisitor(
      baseReservationInput({ vehicleNo: '33다3333' }),
      employee.employeeUserId,
    );

    const { items: myReservations } = await listReservationsForUser(visitorSession.userId, {
      entryExitManagementEnabled: false,
    });
    expect(myReservations).toHaveLength(1);
  });

  it('직원의 "내 신청 내역"에는 본인 방문과 대리 신청이 모두 나온다', async () => {
    const employee = await seedEmployeeFixture();

    await createEmployeeReservation(
      baseReservationInput({ vehicleNo: '22나2222' }),
      employee.employeeUserId,
    );
    await createProxyReservationForVisitor(
      baseReservationInput({ vehicleNo: '33다3333' }),
      employee.employeeUserId,
    );

    const { items } = await listReservationsForEmployee(employee.employeeUserId, {
      entryExitManagementEnabled: false,
    });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.requesterType).sort()).toEqual(
      [RequesterType.EMPLOYEE, RequesterType.VISITOR].sort(),
    );
  });
});

describe('보안 회귀: 방문객 공개 엔드포인트는 신청 구분을 클라이언트가 지정할 수 없다', () => {
  it('createReservationSchema 는 requesterType 필드를 알지 못하므로 파싱 결과에 남지 않는다', () => {
    const parsed = createReservationSchema.parse({
      ...baseReservationInput(),
      hostEmployeeUserId: 1,
      requesterType: 'EMPLOYEE',
      visitStartAt: '2026-08-20T10:00',
      visitEndAt: '2026-08-20T12:00',
    });

    expect(parsed).not.toHaveProperty('requesterType');
  });
});
