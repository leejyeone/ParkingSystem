import { Prisma, SpaceType } from '@prisma/client';

import {
  SETTING_DESCRIPTIONS,
  toSettingRows,
  toSettingsValues,
  type SystemSettingsValues,
} from '@/domain/system-settings';
import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

type Db = Prisma.TransactionClient | typeof prisma;

/** 시스템 설정 조회 (DB 값 + 기본값 병합) */
export async function getSystemSettings(db: Db = prisma): Promise<SystemSettingsValues> {
  const rows = await db.systemSetting.findMany({
    select: { settingKey: true, settingValue: true },
  });
  return toSettingsValues(rows);
}

/** 시스템 설정 저장 */
export async function updateSystemSettings(
  values: SystemSettingsValues,
  adminUserId: number,
): Promise<SystemSettingsValues> {
  const before = await getSystemSettings();
  const rows = toSettingRows(values);

  await prisma.$transaction(
    rows.map((row) =>
      prisma.systemSetting.upsert({
        where: { settingKey: row.settingKey },
        create: {
          settingKey: row.settingKey,
          settingValue: row.settingValue,
          description: SETTING_DESCRIPTIONS[row.settingKey],
          updatedByAdminId: adminUserId,
        },
        update: {
          settingValue: row.settingValue,
          description: SETTING_DESCRIPTIONS[row.settingKey],
          updatedByAdminId: adminUserId,
        },
      }),
    ),
  );

  if (before.doubleParkingEnabled !== values.doubleParkingEnabled) {
    await setDoubleParkingSpacesActive(adminUserId, values.doubleParkingEnabled);
  }

  return getSystemSettings();
}

/**
 * 이중주차 사용 토글은 항상 모든 이중주차(DOUBLE) 주차면에 대해 일괄 동작해야 한다.
 * 켜면 비활성 상태인 이중주차면을 전부 활성화하고, 끄면 활성 상태인 이중주차면을 전부
 * 비활성화한다.
 *
 * 설정만 바꿔 두면 새 배정 가능 여부만 달라질 뿐 화면·목록의 개별 주차면 상태는 그대로
 * 남아 혼란을 준다. 개별 활성/비활성화(updateParkingSpace)와 동일하게 주차면 단위
 * 감사 로그를 남긴다.
 */
async function setDoubleParkingSpacesActive(adminUserId: number, active: boolean): Promise<void> {
  const spaces = await prisma.parkingSpace.findMany({
    where: { spaceType: SpaceType.DOUBLE, isActive: !active },
    select: { spaceId: true, spaceCode: true },
  });
  if (spaces.length === 0) return;

  await prisma.parkingSpace.updateMany({
    where: { spaceId: { in: spaces.map((space) => space.spaceId) } },
    data: { isActive: active },
  });

  await Promise.all(
    spaces.map((space) =>
      writeAuditLog({
        actorAdminId: adminUserId,
        actionType: active
          ? AUDIT_ACTIONS.PARKING_SPACE_UPDATE
          : AUDIT_ACTIONS.PARKING_SPACE_DEACTIVATE,
        targetType: AUDIT_TARGETS.PARKING_SPACE,
        targetId: space.spaceId,
        detail: {
          spaceCode: space.spaceCode,
          reason: active ? 'DOUBLE_PARKING_ENABLED' : 'DOUBLE_PARKING_DISABLED',
        },
      }),
    ),
  );
}
