import type { Prisma } from '@prisma/client';

import {
  SETTING_DESCRIPTIONS,
  toSettingRows,
  toSettingsValues,
  type SystemSettingsValues,
} from '@/domain/system-settings';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/** 시스템 설정 조회 (DB 값 + 기본값 병합) */
export async function getSystemSettings(db: Db = prisma): Promise<SystemSettingsValues> {
  const rows = await db.systemSetting.findMany({
    select: { settingKey: true, settingValue: true },
  });
  return toSettingsValues(rows);
}

/** 시스템 설정 저장 (SYSTEM_ADMIN 전용) */
export async function updateSystemSettings(
  values: SystemSettingsValues,
  adminUserId: number,
): Promise<SystemSettingsValues> {
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

  return getSystemSettings();
}
