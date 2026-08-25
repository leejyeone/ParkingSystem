import { AccountStatus, ReservationStatus } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '@/lib/errors';
import { verifyPassword } from '@/lib/password';
import { lookupByReservationNo } from '@/services/reservation-lookup-service';
import { resolveAccessToken } from '@/services/reservation-access-service';
import { createReservation, listReservationsForUser } from '@/services/reservation-service';
import {
  getUserProfile,
  loginUser,
  MAX_LOGIN_FAILURES,
  signUpUser,
  updateUserProfile,
} from '@/services/user-auth-service';
import { baseReservationInput, prisma, resetDatabase, seedFixtures } from './helpers';

/**
 * 회원 계정(선택 로그인) + 예약번호 조회 통합 시나리오.
 */

const SIGN_UP = {
  email: 'member@example.com',
  password: 'Member!2345',
  name: '김회원',
  companyOrBranchName: '대구사업장',
  vehicleNo: '34나5678',
};

beforeEach(async () => {
  await resetDatabase();
  await seedFixtures({ normalSpaces: 2 });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('회원가입', () => {
  it('가입하면 비밀번호가 해시로 저장된다', async () => {
    const session = await signUpUser(SIGN_UP);

    expect(session.email).toBe(SIGN_UP.email);
    const saved = await prisma.siteUser.findUnique({ where: { userId: session.userId } });
    expect(saved?.passwordHash).not.toBe(SIGN_UP.password);
    expect(saved?.passwordHash.startsWith('$2')).toBe(true);
    expect(await verifyPassword(SIGN_UP.password, saved!.passwordHash)).toBe(true);
  });

  it('차량번호는 정규화되어 저장된다', async () => {
    const session = await signUpUser({ ...SIGN_UP, vehicleNo: '34나 - 5678' });
    const profile = await getUserProfile(session.userId);

    expect(profile?.vehicleNo).toBe('34나5678');
  });

  it('차량번호는 선택 입력이다', async () => {
    const session = await signUpUser({ ...SIGN_UP, vehicleNo: null });
    const profile = await getUserProfile(session.userId);

    expect(profile?.vehicleNo).toBeNull();
  });

  it('같은 이메일로 두 번 가입할 수 없다', async () => {
    await signUpUser(SIGN_UP);
    await expect(signUpUser(SIGN_UP)).rejects.toBeInstanceOf(ConflictError);
  });

  it('비밀번호 정책을 만족하지 않으면 가입할 수 없다', async () => {
    await expect(signUpUser({ ...SIGN_UP, password: 'short' })).rejects.toThrowError(/비밀번호/);
  });
});

describe('로그인', () => {
  beforeEach(async () => {
    await signUpUser(SIGN_UP);
  });

  it('올바른 자격 증명으로 로그인된다', async () => {
    const session = await loginUser({ email: SIGN_UP.email, password: SIGN_UP.password });

    expect(session.name).toBe(SIGN_UP.name);
    const saved = await prisma.siteUser.findUnique({ where: { email: SIGN_UP.email } });
    expect(saved?.lastLoginAt).not.toBeNull();
    expect(saved?.loginFailCount).toBe(0);
  });

  it('존재하지 않는 이메일과 틀린 비밀번호의 오류 메시지가 같다', async () => {
    const unknown = await loginUser({ email: 'nobody@example.com', password: 'x' }).catch(
      (error: Error) => error.message,
    );
    const wrongPassword = await loginUser({ email: SIGN_UP.email, password: 'x' }).catch(
      (error: Error) => error.message,
    );

    expect(unknown).toBe(wrongPassword);
  });

  it(`실패가 ${MAX_LOGIN_FAILURES}회 누적되면 계정이 잠긴다`, async () => {
    for (let attempt = 0; attempt < MAX_LOGIN_FAILURES; attempt += 1) {
      await loginUser({ email: SIGN_UP.email, password: 'wrong' }).catch(() => undefined);
    }

    const saved = await prisma.siteUser.findUnique({ where: { email: SIGN_UP.email } });
    expect(saved?.accountStatus).toBe(AccountStatus.LOCKED);

    // 잠긴 뒤에는 올바른 비밀번호로도 로그인할 수 없다.
    await expect(
      loginUser({ email: SIGN_UP.email, password: SIGN_UP.password }),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it('틀린 비밀번호는 UnauthorizedError 를 던진다', async () => {
    await expect(loginUser({ email: SIGN_UP.email, password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('내 정보 수정 (자동완성 원본)', () => {
  it('수정한 값이 프로필 조회에 반영된다', async () => {
    const session = await signUpUser(SIGN_UP);

    await updateUserProfile(session.userId, {
      name: '김수정',
      companyOrBranchName: '부산사업장',
      vehicleNo: '56다 7890',
    });

    const profile = await getUserProfile(session.userId);
    expect(profile).toMatchObject({
      name: '김수정',
      companyOrBranchName: '부산사업장',
      vehicleNo: '56다7890',
      email: SIGN_UP.email,
    });
  });

  it('비밀번호를 함께 변경할 수 있다', async () => {
    const session = await signUpUser(SIGN_UP);

    await updateUserProfile(session.userId, {
      name: SIGN_UP.name,
      companyOrBranchName: SIGN_UP.companyOrBranchName,
      vehicleNo: SIGN_UP.vehicleNo,
      password: 'NewMember!2345',
    });

    await expect(
      loginUser({ email: SIGN_UP.email, password: 'NewMember!2345' }),
    ).resolves.toMatchObject({ userId: session.userId });
  });
});

describe('회원 예약 연결 / 내 예약 목록', () => {
  it('로그인 회원의 신청은 계정에 연결되어 목록에 나온다', async () => {
    const session = await signUpUser(SIGN_UP);

    const { reservation } = await createReservation(
      baseReservationInput({ userId: session.userId }),
    );
    expect(reservation.userId).toBe(session.userId);

    const myReservations = await listReservationsForUser(session.userId, {
      entryExitManagementEnabled: false,
    });
    expect(myReservations).toHaveLength(1);
    expect(myReservations[0].reservationNo).toBe(reservation.reservationNo);
  });

  it('다른 회원의 예약은 내 목록에 나오지 않는다', async () => {
    const mine = await signUpUser(SIGN_UP);
    const other = await signUpUser({ ...SIGN_UP, email: 'other@example.com' });

    await createReservation(baseReservationInput({ userId: other.userId }));

    expect(
      await listReservationsForUser(mine.userId, { entryExitManagementEnabled: false }),
    ).toHaveLength(0);
  });

  it('비로그인 신청은 어떤 회원 목록에도 포함되지 않는다', async () => {
    const session = await signUpUser(SIGN_UP);
    await createReservation(baseReservationInput());

    expect(
      await listReservationsForUser(session.userId, { entryExitManagementEnabled: false }),
    ).toHaveLength(0);
  });
});

describe('예약번호로 예약 조회', () => {
  it('예약번호로 조회하면 접근 토큰이 발급되고 해당 예약으로 연결된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const { rawToken, reservationId } = await lookupByReservationNo(reservation.reservationNo);
    expect(reservationId).toBe(reservation.reservationId);

    const resolved = await resolveAccessToken(rawToken);
    expect(resolved.reservationId).toBe(reservation.reservationId);
  });

  it('소문자로 입력해도 조회된다', async () => {
    const { reservation } = await createReservation(baseReservationInput());

    const { reservationId } = await lookupByReservationNo(reservation.reservationNo.toLowerCase());
    expect(reservationId).toBe(reservation.reservationId);
  });

  it('조회로 발급된 토큰은 유효시간이 짧다 (2시간 이내)', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await lookupByReservationNo(reservation.reservationNo);

    const token = await prisma.reservationAccessToken.findFirst({
      where: { reservationId: reservation.reservationId },
      orderBy: { tokenId: 'desc' },
    });

    const remainingMinutes = (token!.expiresAt.getTime() - Date.now()) / 60_000;
    expect(remainingMinutes).toBeGreaterThan(0);
    expect(remainingMinutes).toBeLessThanOrEqual(120);
  });

  it('없는 예약번호와 형식이 틀린 값의 오류 메시지가 같다', async () => {
    const notFound = await lookupByReservationNo('PK-20260820-ZZZZZZ').catch(
      (error: Error) => error.message,
    );
    const malformed = await lookupByReservationNo('abc').catch((error: Error) => error.message);

    expect(notFound).toBe(malformed);
  });

  it('없는 예약번호는 NotFoundError 를 던진다', async () => {
    await expect(lookupByReservationNo('PK-20260820-ZZZZZZ')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('취소된 예약도 예약번호로 조회할 수 있다', async () => {
    const { reservation } = await createReservation(baseReservationInput());
    await prisma.parkingReservation.update({
      where: { reservationId: reservation.reservationId },
      data: { reservationStatus: ReservationStatus.CANCELLED },
    });

    const { reservationId } = await lookupByReservationNo(reservation.reservationNo);
    expect(reservationId).toBe(reservation.reservationId);
  });
});
