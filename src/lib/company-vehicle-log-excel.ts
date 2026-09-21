import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

import {
  COMPANY_VEHICLE_LOG_COLUMNS,
  COMPANY_VEHICLE_LOG_PAGE_SIZE,
  renumberRowsByPage,
  type CompanyVehicleLogCellRow,
} from '@/domain/company-vehicle-log';

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

/**
 * 한 페이지(시트) 분량("차량 배차 신청 현황" 로고/제목/관리부서 박스 + 헤더 + 데이터
 * 행)을 그린다. 원본 종이 양식 한 장이 20행짜리라 `pageRows`가 그보다 적어도 20행까지
 * 빈 칸으로 채운다.
 */
function addLogSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  pageRows: CompanyVehicleLogCellRow[],
  logoImageId: number | null,
): void {
  // fitToHeight를 안 주면(undefined) 세로 방향으로는 축소·확대를 안 해서, 실제 내용이
  // A4 한 장보다 짧을 때 인쇄 미리보기가 위쪽 절반만 채워진 것처럼 보인다(원본 종이
  // 양식은 20행이 한 페이지 전체를 꽉 채운다) — fitToHeight: 1을 같이 줘서 항상 세로로도
  // 한 페이지에 꽉 차게 늘려 찍는다.
  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  // [No, 신청일자, 신청부서, 신청자(운전자), 배차차량(차종), 운행일시(일정), 행선지(목적),
  // 주행거리(km), 진행상태] — 신청자(운전자)는 좁히고 그만큼 신청부서를 넓혔다. 운행일시도
  // 3.25만큼, 신청일자도 1.38만큼 좁혀서 그만큼씩 행선지·신청부서를 넓혔다.
  const columnWidths = [5, 8.62, 17.38, 12, 16, 14.75, 25.25, 12, 14];
  sheet.columns = columnWidths.map((width) => ({ width }));

  // 헤더 3분할: 좌상단 로고 / 중앙 제목(신청자~행선지 위) / 우상단 관리부서 박스(주행거리·
  // 진행상태 위에만 — 사용자 지시대로 행선지 칸은 관리부서 박스에서 뺐다).
  for (let row = 1; row <= 3; row += 1) {
    sheet.getRow(row).height = 23;
  }
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

  sheet.mergeCells(2, 8, 3, 9);
  const orgValueCell = sheet.getCell(2, 8);
  orgValueCell.value = '총무팀';
  orgValueCell.font = { bold: true };

  for (const cell of [orgLabelCell, orgValueCell]) {
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  }

  if (logoImageId !== null) {
    // 셀 (1,1)~(3,3) 병합 영역(약 217x92px, 열폭 5/8.62/17.38·행높이 23pt×3 기준)
    // 한가운데에 로고(원본 비율 350:100 유지, 160x46)를 앉힌다 — tl 은 그 영역 안에서의
    // 여백 비율이다.
    sheet.addImage(logoImageId, { tl: { col: 0.81, row: 0.75 }, ext: { width: 160, height: 46 } });
  }

  // 4행은 제목 박스와 별개의 "헤더/본문 구분" 행이다 — 위 제목 박스(1~3행)와 병합하지는
  // 않되, 높이는 그 제목 행들과 동일하게 맞춘다.
  sheet.getRow(4).height = 23;

  // 원본 양식은 이 구분 행 바로 아래에 표 헤더가 온다(5행).
  const headerRowIndex = 5;
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.values = [...COMPANY_VEHICLE_LOG_COLUMNS];
  // "신청자\n(운전자)"/"행선지\n(목적)"가 두 줄이라 wrapText 를 켜고 행 높이를 넉넉히 둔다.
  headerRow.height = 35;
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

  // No 1~20이 매겨지는 본문 데이터 행 — 기존(31pt)의 1.3배로 키운다.
  const DATA_ROW_HEIGHT = 31 * 1.3;
  const rowCount = Math.max(pageRows.length, COMPANY_VEHICLE_LOG_PAGE_SIZE);
  for (let index = 0; index < rowCount; index += 1) {
    const rowValues = pageRows[index];
    const row = sheet.getRow(headerRowIndex + 1 + index);
    row.height = DATA_ROW_HEIGHT;
    row.values = rowValues ?? [index + 1];
    for (let col = 1; col <= COMPANY_VEHICLE_LOG_COLUMNS.length; col += 1) {
      const cell = row.getCell(col);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = THIN_BORDER;
    }
  }
}

/**
 * 종이 운행대장("차량 배차 신청 현황") 그대로의 양식으로 엑셀 워크북을 만든다 — 좌상단
 * 로고, 중앙 제목, 우상단 "관리부서: 총무팀" 남색 박스 + 아래 남색 헤더 표. 원본 양식
 * 한 장이 20행짜리라 20건이 넘으면 같은 양식의 시트를 한 장 더 만들어 No를 1부터
 * 다시 매긴다(`renumberRowsByPage` 참고) — 시트가 1장뿐이면 이름은 지금까지처럼
 * '차량 배차 신청 현황', 여러 장이면 '1페이지', '2페이지'...로 붙인다.
 *
 * `rows`는 DB에서 막 조회한 값일 수도, 미리보기 패널에서 관리자가 고친 값일 수도 있다 —
 * 이 함수는 그 출처를 구분하지 않고 그대로 셀에 써 넣는다(`domain/company-vehicle-log`의
 * `tripsToLogRows` 참고). 0번 칸(No)은 클라이언트가 무엇을 보냈든 페이지 안 순번으로
 * 항상 다시 계산된다.
 */
export async function buildCompanyVehicleLogWorkbook(
  rows: CompanyVehicleLogCellRow[],
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const pages = renumberRowsByPage(rows);

  const logoPath = path.join(process.cwd(), 'public', 'synopex-logo.png');
  const logoImageId = fs.existsSync(logoPath)
    ? workbook.addImage({ filename: logoPath, extension: 'png' })
    : null;

  pages.forEach((pageRows, index) => {
    const sheetName = pages.length > 1 ? `${index + 1}페이지` : '차량 배차 신청 현황';
    addLogSheet(workbook, sheetName, pageRows, logoImageId);
  });

  return workbook;
}
