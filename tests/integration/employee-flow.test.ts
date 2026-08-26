import { RequesterType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ConflictError, UnauthorizedError, ValidationError } from '@/lib/errors';
import { createReservationSchema } from '@/lib/validation/reservation-schema';
import {
  createEmployeeReservation,
  createProxyReservationForVisitor,
  createVisitorReservation,
  listReservationsForEmployee,
  listReservationsForUser,
} from '@/services/reservation-service';
import { loginEmployee, signUpEmployee } from '@/services/employee-auth-service';
import { loginUser, signUpUser } from '@/services/user-auth-service';
import {
  baseReservationInput,
  prisma,
  resetDatabase,
  seedEmployeeFixture,
  seedFixtures,
} from './helpers';

/**
 * 직원 계정(방문객과 완전 분리) + 본인 방문/대리 신청 통합 시나리오.
 */

beforeEach(async () => {
  await resetDatabase();
  await seedFixtures({ normalSpaces: 2 });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('직원 계정은 방문객 계정과 완전히 분리되어 있다', () => {
  it('같은 이메일로 방문객과 직원 양쪽에 각각 가입할 수 있다', async () => {
    const email = 'both@example.com';

    const visitorSession = await signUpUser({
      email,
      password: 'Visitor!2345',
      name: '홍길동',
      companyOrBranchName: '시노펙스',
    });
    const employeeSession = await signUpEmployee({
      email,
      password: 'Employee!2345',
      name: '홍길동',
      branchName: '시노펙스 본사',
    });

    expect(visitorSession.email).toBe(email);
    expect(employeeSession.email).toBe(email);
  });

  it('서로의 비밀번호로는 로그인되지 않는다', async () => {
    const email = 'both2@example.com';
    await signUpUser({
      email,
      password: 'Visitor!2345',
      name: '홍길동',
      companyOrBranchName: '시노펙스',
    });
    await signUpEmployee({
      email,
      password: 'Employee!2345',
      name: '홍길동',
      branchName: '시노펙스 본사',
    });

    await expect(loginUser({ email, password: 'Employee!2345' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(loginEmployee({ email, password: 'Visitor!2345' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    await expect(loginUser({ email, password: 'Visitor!2345' })).resolves.toMatchObject({ email });
    await expect(loginEmployee({ email, password: 'Employee!2345' })).resolves.toMatchObject({
      email,
    });
  });

  it('이미 가입된 이메일로 다시 직원 가입하면 충돌 오류가 난다', async () => {
    const email = 'dup@example.com';
    await signUpEmployee({
      email,
      password: 'Employee!2345',
      name: '홍길동',
      branchName: '시노펙스 본사',
    });

    await expect(
      signUpEmployee({
        email,
        password: 'Employee!2345',
        name: '다른사람',
        branchName: '시노펙스 본사',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
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
      ...baseReservationInput(),
      visitorUserId: visitorSession.userId,
    });
    await createEmployeeReservation(baseReservationInput(), employee.employeeUserId);
    await createProxyReservationForVisitor(baseReservationInput(), employee.employeeUserId);

    const myReservations = await listReservationsForUser(visitorSession.userId, {
      entryExitManagementEnabled: false,
    });
    expect(myReservations).toHaveLength(1);
  });

  it('직원의 "내 신청 내역"에는 본인 방문과 대리 신청이 모두 나온다', async () => {
    const employee = await seedEmployeeFixture();

    await createEmployeeReservation(baseReservationInput(), employee.employeeUserId);
    await createProxyReservationForVisitor(baseReservationInput(), employee.employeeUserId);

    const items = await listReservationsForEmployee(employee.employeeUserId, {
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
      requesterType: 'EMPLOYEE',
      visitStartAt: '2026-08-20T10:00',
      visitEndAt: '2026-08-20T12:00',
    });

    expect(parsed).not.toHaveProperty('requesterType');
  });
});
