import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

import { COMPANY_VEHICLE_LOG_COLUMNS, type CompanyVehicleLogCellRow } from '@/domain/company-vehicle-log';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

/** 원본 종이 양식의 헤더 남색(진한 네이비) — 표 헤더 행과 "관리부서" 라벨 칸에 쓴다. */
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F3864' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };

/** 원본 양식이 실제 신청 건수와 무관하게 20행짜리 빈 칸을 미리 인쇄해 둔 것과 맞춘다. */
const MIN_ROW_COUNT = 20;

/**
 * 종이 운행대장("차량 배차 신청 현황") 그대로의 양식으로 엑셀 워크북 1장을 만든다 —
 * 좌상단 로고, 중앙 제목, 우상단 "관리부서: 총무팀" 남색 박스 + 아래 남색 헤더 표.
 *
 * `rows`는 DB에서 막 조회한 값일 수도, 미리보기 패널에서 관리자가 고친 값일 수도 있다 —
 * 이 함수는 그 출처를 구분하지 않고 그대로 셀에 써 넣는다(`domain/company-vehicle-log`의
 * `tripsToLogRows` 참고).
 */
export async function buildCompanyVehicleLogWorkbook(
  rows: CompanyVehicleLogCellRow[],
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('차량 배차 신청 현황', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });

  // [No, 신청일자, 신청부서, 신청자(운전자), 배차차량(차종), 운행일시(일정), 행선지(목적),
  // 주행거리(km), 진행상태] — 신청자(운전자)는 좁히고 그만큼 신청부서를 넓혔다.
  const columnWidths = [5, 10, 16, 12, 16, 18, 22, 12, 14];
  sheet.columns = columnWidths.map((width) => ({ width }));

  // 헤더 3분할: 좌상단 로고 / 중앙 제목(신청자~행선지 위) / 우상단 관리부서 박스(주행거리·
  // 진행상태 위에만 — 사용자 지시대로 행선지 칸은 관리부서 박스에서 뺐다).
  sheet.mergeCells(1, 1, 3, 3);
  sheet.mergeCells(1, 4, 3, 7);
  sheet.getCell(1, 4).value = '차량 배차 신청 현황';
  sheet.getCell(1, 4).font = { bold: true, size: 22 };
  sheet.getCell(1, 4).alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells(1, 8, 1, 9);
  const orgLabelCell = sheet.getCell(1, 8);
  orgLabelCell.value = '관리부서';
  orgLabelCell.font = HEADER_FONT;
  orgLabelCell.fill = HEADER_FILL;

  sheet.mergeCells(2, 8, 2, 9);
  const orgValueCell = sheet.getCell(2, 8);
  orgValueCell.value = '총무팀';
  orgValueCell.font = { bold: true };

  for (const cell of [orgLabelCell, orgValueCell]) {
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  }

  const logoPath = path.join(process.cwd(), 'public', 'synopex-logo.png');
  if (fs.existsSync(logoPath)) {
    const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
    // 셀 (1,1)~(3,3) 병합 영역(대략 232x60px, 열폭 5/10/16 기준) 한가운데에 로고(원본
    // 비율 350:100 유지, 160x46)를 앉힌다 — tl 은 그 영역 안에서의 여백 비율이다.
    sheet.addImage(imageId, { tl: { col: 0.9, row: 0.35 }, ext: { width: 160, height: 46 } });
  }

  const headerRowIndex = 5;
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.values = [...COMPANY_VEHICLE_LOG_COLUMNS];
  // "신청자\n(운전자)"/"행선지\n(목적)"가 두 줄이라 wrapText 를 켜고 행 높이를 넉넉히 둔다.
  headerRow.height = 32;
  const TWO_LINE_HEADER_COLUMNS = new Set([4, 7]); // 신청자(운전자), 행선지(목적)
  headerRow.eachCell((cell, colNumber) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: TWO_LINE_HEADER_COLUMNS.has(colNumber),
    };
    cell.border = THIN_BORDER;
  });

  const rowCount = Math.max(rows.length, MIN_ROW_COUNT);
  for (let index = 0; index < rowCount; index += 1) {
    const rowValues = rows[index];
    const row = sheet.getRow(headerRowIndex + 1 + index);
    row.height = 22;
    row.values = rowValues ?? [index + 1];
    for (let col = 1; col <= COMPANY_VEHICLE_LOG_COLUMNS.length; col += 1) {
      const cell = row.getCell(col);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = THIN_BORDER;
    }
  }

  return workbook;
}
