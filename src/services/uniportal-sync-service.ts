import { AccountStatus } from '@prisma/client';

import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import {
  fetchUniportalEmployees,
  isUniportalConfigured,
  type UniportalEmployee,
} from '@/lib/uniportal-db';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/**
 * 그룹웨어(유니포탈) 직원 명부 동기화.
 *
 * ── 왜 메일이 기준인가 ──────────────────────────────────────────
 * 사번(EMPLOYEE_ID)은 그룹웨어에서 유일하지 않다. 2026-09-03 실측 기준 재직자 815명 중
 * 사번은 798개뿐이었고(한 사번을 두 사람이 공유), 16명은 사번이 아예 비어 있었다.
 * 반면 SYSMAIL 은 815명 전원이 유일했고 주차 시스템 796명과 한 명도 빠짐없이 일치했다.
 * 그래서 메일을 식별 기준으로 삼고, 사번은 따라오는 참조값으로만 취급한다.
 *
 * ── 건드리지 않는 값 ────────────────────────────────────────────
 * 차량번호 · 사업장명 · 마지막 로그인 · 예약은 그룹웨어에 없는 주차 시스템 고유 정보라
 * 절대 덮어쓰지 않는다. 계정 상태도 "그룹웨어에서 사라진 사람 비활성" 외에는 바꾸지 않는다.
 * 관리자가 손으로 활성/비활성을 조정해 둔 것을 동기화가 되돌리면 안 되기 때문이다.
 *
 * ── 삭제하지 않는 이유 ──────────────────────────────────────────
 * 퇴사자라도 과거 예약에 "당사 담당자" 로 걸려 있다. 지우면 그 예약 이력이 깨진다.
 * 그래서 비활성 처리만 한다(검색·로그인에서 제외되고, 이력은 남는다).
 */

/** 사번을 확정하지 못한 사유. 등록 자체는 정상적으로 되고, 사번 칸만 비워 둔다. */
export type CodeIssueReason =
  /** 그룹웨어에 사번이 비어 있음 */
  | 'NO_EMPLOYEE_CODE'
  /** 그룹웨어에서 같은 사번을 여러 명이 사용 중 — 누구 것인지 확정할 수 없음 */
  | 'DUPLICATE_EMPLOYEE_CODE';

export type SyncRow = {
  email: string;
  name: string;
  departmentName: string;
  employeeCode: string | null;
  /** 사람이 읽는 변경 요약. UPDATE 일 때만 채운다. */
  changes?: string[];
};

export type CodeIssueRow = SyncRow & {
  reason: CodeIssueReason;
  /** 같은 사번을 쓰는 다른 사람의 메일 */
  conflictWith?: string[];
};

export type SyncPlan = {
  /** 그룹웨어에서 읽어온 재직자 수 */
  sourceCount: number;
  /** 주차 시스템의 현재 직원 수(삭제되지 않은 것) */
  localCount: number;
  create: SyncRow[];
  update: SyncRow[];
  deactivate: SyncRow[];
  /** 사번을 비워 둔 사람. 등록은 되며, 관리자가 확인하라고 알려 주는 목록이다. */
  codeIssues: CodeIssueRow[];
  unchangedCount: number;
};

export type SyncApplyResult = SyncPlan & {
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
};

type LocalEmployee = {
  employeeUserId: number;
  email: string;
  name: string;
  employeeCode: string | null;
  departmentCode: string | null;
  departmentName: string;
  accountStatus: AccountStatus;
};

/**
 * 그룹웨어 명부와 현재 명부를 비교해 "무엇이 바뀔지" 를 계산한다. 아무것도 변경하지 않는다.
 *
 * 미리보기와 실제 반영이 같은 함수를 쓰게 해서, 보여준 것과 다른 것이 반영되는 일을 막는다.
 */
export async function buildUniportalSyncPlan(): Promise<SyncPlan> {
  if (!isUniportalConfigured()) {
    throw new ValidationError(
      '그룹웨어 접속 정보가 설정되어 있지 않습니다. 서버 관리자에게 문의해 주세요.',
    );
  }

  const source = await fetchUniportalEmployees();
  if (source.length === 0) {
    // 연결은 됐는데 0건이면 조회 조건이나 그룹웨어 쪽 문제다. 이 상태로 반영하면
    // 전 직원이 비활성 처리되므로 반드시 막는다.
    throw new ValidationError('그룹웨어에서 재직자를 한 명도 읽지 못했습니다. 반영을 중단합니다.');
  }

  const locals: LocalEmployee[] = await prisma.employeeUser.findMany({
    where: { deletedAt: null },
    select: {
      employeeUserId: true,
      email: true,
      name: true,
      employeeCode: true,
      departmentCode: true,
      departmentName: true,
      accountStatus: true,
    },
  });
  const localByEmail = new Map(locals.map((row) => [row.email.trim().toLowerCase(), row]));

  // 같은 사번을 쓰는 사람이 둘 이상이면 누구 것인지 확정할 수 없다. 양쪽 다 비워 둔다.
  const emailsByCode = new Map<string, string[]>();
  for (const row of source) {
    if (!row.employeeCode) continue;
    const list = emailsByCode.get(row.employeeCode) ?? [];
    list.push(row.email);
    emailsByCode.set(row.employeeCode, list);
  }
  const duplicatedCodes = new Set(
    [...emailsByCode.entries()].filter(([, emails]) => emails.length > 1).map(([code]) => code),
  );

  const plan: SyncPlan = {
    sourceCount: source.length,
    localCount: locals.length,
    create: [],
    update: [],
    deactivate: [],
    codeIssues: [],
    unchangedCount: 0,
  };

  const seenEmails = new Set<string>();

  for (const row of source) {
    if (!row.email) continue;
    seenEmails.add(row.email);

    // 확정할 수 없는 사번은 넣지 않는다. 엉뚱한 사람으로 로그인되는 것보다 안 되는 편이 낫다.
    const targetCode = row.employeeCode && !duplicatedCodes.has(row.employeeCode)
      ? row.employeeCode
      : null;

    if (targetCode === null) {
      plan.codeIssues.push({
        ...toRow(row, null),
        reason: row.employeeCode ? 'DUPLICATE_EMPLOYEE_CODE' : 'NO_EMPLOYEE_CODE',
        conflictWith: row.employeeCode
          ? (emailsByCode.get(row.employeeCode) ?? []).filter((mail) => mail !== row.email)
          : undefined,
      });
    }

    const local = localByEmail.get(row.email);
    if (!local) {
      plan.create.push(toRow(row, targetCode));
      continue;
    }

    const changes: string[] = [];
    if (row.name && row.name !== local.name) {
      changes.push(`이름 ${local.name} → ${row.name}`);
    }
    if (row.departmentName && row.departmentName !== local.departmentName) {
      changes.push(`부서 ${local.departmentName} → ${row.departmentName}`);
    }
    if (row.departmentCode && row.departmentCode !== (local.departmentCode ?? '')) {
      changes.push(`부서코드 ${local.departmentCode ?? '(없음)'} → ${row.departmentCode}`);
    }
    if (targetCode !== (local.employeeCode ?? null)) {
      changes.push(`사번 ${local.employeeCode ?? '(없음)'} → ${targetCode ?? '(없음)'}`);
    }

    if (changes.length === 0) plan.unchangedCount += 1;
    else plan.update.push({ ...toRow(row, targetCode), changes });
  }

  // 그룹웨어에서 사라진 사람. 이미 비활성이면 다시 건드리지 않는다.
  for (const local of locals) {
    const email = local.email.trim().toLowerCase();
    if (seenEmails.has(email)) continue;
    if (local.accountStatus !== AccountStatus.ACTIVE) continue;
    plan.deactivate.push({
      email,
      name: local.name,
      departmentName: local.departmentName,
      employeeCode: local.employeeCode,
    });
  }

  return plan;
}

/**
 * 계산한 내용을 실제로 반영한다.
 *
 * 미리보기에서 넘어온 값을 그대로 믿지 않고 여기서 다시 계산한다. 미리보기를 띄워 둔 사이에
 * 그룹웨어나 명부가 바뀌었을 수 있고, 화면에서 온 값을 신뢰하면 조작될 여지도 생긴다.
 *
 * 사번 변경은 두 단계로 나눈다. A 의 새 사번을 B 가 아직 들고 있는 경우가 실제로 있어서
 * (조직에서 사번을 재부여하면 생긴다) 한 번에 갱신하면 UNIQUE 제약에 걸린다. 그래서
 * 먼저 바뀔 사번을 NULL 로 비켜 놓고, 그다음 최종값을 넣는다. 트랜잭션 안에서 처리하므로
 * 중간에 실패하면 비워 둔 것도 함께 되돌아간다.
 */
export async function applyUniportalSync(params: {
  adminUserId: number;
  requestContext?: RequestContext;
}): Promise<SyncApplyResult> {
  const plan = await buildUniportalSyncPlan();

  const touchedEmails = [...plan.update, ...plan.deactivate].map((row) => row.email);
  const locals = await prisma.employeeUser.findMany({
    where: { deletedAt: null, email: { in: touchedEmails } },
    select: { employeeUserId: true, email: true, employeeCode: true },
  });
  const localByEmail = new Map(locals.map((row) => [row.email.trim().toLowerCase(), row]));

  let createdCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;

  await prisma.$transaction(
    async (tx) => {
      // 1단계 — 사번이 바뀌는 사람의 사번을 먼저 비운다(UNIQUE 충돌 회피).
      for (const row of plan.update) {
        const local = localByEmail.get(row.email);
        if (!local) continue;
        if (row.employeeCode === (local.employeeCode ?? null)) continue;
        await tx.employeeUser.update({
          where: { employeeUserId: local.employeeUserId },
          data: { employeeCode: null },
        });
      }

      // 2단계 — 기존 직원 갱신. 차량번호·계정상태·로그인이력은 손대지 않는다.
      for (const row of plan.update) {
        const local = localByEmail.get(row.email);
        if (!local) continue;
        await tx.employeeUser.update({
          where: { employeeUserId: local.employeeUserId },
          data: {
            name: row.name || undefined,
            departmentName: row.departmentName || undefined,
            employeeCode: row.employeeCode,
          },
        });
        updatedCount += 1;
      }

      // 3단계 — 신규 등록.
      for (const row of plan.create) {
        await tx.employeeUser.create({
          data: {
            email: row.email,
            name: row.name || row.email,
            employeeCode: row.employeeCode,
            departmentName: row.departmentName || '(미지정)',
            // 그룹웨어에서 막 넘어온 계정은 담당자 검색에 바로 노출하지 않는다.
            // 공용 계정(그룹메일, 시스템 계정)이 섞여 들어오므로 관리자가 보고 켜도록 한다.
            accountStatus: AccountStatus.INACTIVE,
          },
        });
        createdCount += 1;
      }

      // 4단계 — 그룹웨어에서 사라진 사람 비활성. 삭제하지 않는다.
      for (const row of plan.deactivate) {
        const local = localByEmail.get(row.email);
        if (!local) continue;
        await tx.employeeUser.update({
          where: { employeeUserId: local.employeeUserId },
          data: { accountStatus: AccountStatus.INACTIVE },
        });
        deactivatedCount += 1;
      }
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  // 건별로 남기면 감사 로그가 명부 갱신으로 도배된다. 한 건에 요약만 남긴다.
  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.EMPLOYEE_USER_UPDATE,
    targetType: AUDIT_TARGETS.EMPLOYEE_USER,
    targetId: null,
    detail: {
      source: 'UNIPORTAL_SYNC',
      sourceCount: plan.sourceCount,
      created: createdCount,
      updated: updatedCount,
      deactivated: deactivatedCount,
      codeIssues: plan.codeIssues.length,
    },
    context: params.requestContext,
  });

  logger.info('그룹웨어 명부 동기화 완료', {
    created: createdCount,
    updated: updatedCount,
    deactivated: deactivatedCount,
    codeIssues: plan.codeIssues.length,
  });

  return { ...plan, createdCount, updatedCount, deactivatedCount };
}

function toRow(row: UniportalEmployee, employeeCode: string | null): SyncRow {
  return {
    email: row.email,
    name: row.name,
    departmentName: row.departmentName,
    employeeCode,
  };
}
