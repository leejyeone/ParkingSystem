import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

import {
  VISITOR_ENTRY_LOG_COLUMNS,
  VISITOR_ENTRY_LOG_PAGE_SIZE,
  renumberRowsByPage,
  type VisitorEntryLogCellRow,
} from '@/domain/visitor-entry-log';

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
 * 한 페이지(시트) 분량("방문 차량 입출차 현황" 로고/제목/관리부서 박스 + 헤더 + 데이터
 * 행)을 그린다. 법인차량 운행 내역(`company-vehicle-log-excel.ts`)과 같은 양식이며,
 * 치수(행 높이·로고 위치·구분 행 등)도 그대로 맞춘다 — 같은 9칸 표라 그대로 맞는다.
 */
function addLogSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  pageRows: VisitorEntryLogCellRow[],
  logoImageId: number | null,
): void {
  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  // [No, 방문일자, 회사명, 방문자, 차량번호, 입차 시간, 출차 시간, 방문 목적, 배정 위치] —
  // 방문 목적이 가장 길어질 수 있어 그 칸을 넉넉히 잡았다.
  const columnWidths = [5, 9, 15, 10, 13, 12, 12, 29, 20];
  sheet.columns = columnWidths.map((width) => ({ width }));

  // 헤더 3분할: 좌상단 로고 / 중앙 제목(방문자~출차 시간 위) / 우상단 관리부서 박스(방문
  // 목적·배정 위치 위에만 — 법인차량과 동일하게 마지막 두 칸 위에만 올린다).
  for (let row = 1; row <= 3; row += 1) {
    sheet.getRow(row).height = 23;
  }
  sheet.mergeCells(1, 1, 3, 3);
  sheet.mergeCells(1, 4, 3, 7);
  sheet.getCell(1, 4).value = '방문 차량 입출차 현황';
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
    // 법인차량 운행 내역과 같은 3행짜리 로고 영역(약 217x92px 상당, 열폭 5/9/20·행높이
    // 23pt×3 기준) 한가운데에 로고(원본 비율 350:100 유지, 160x46)를 앉힌다.
    sheet.addImage(logoImageId, { tl: { col: 0.81, row: 0.75 }, ext: { width: 160, height: 46 } });
  }

  // 4행은 제목 박스와 별개의 "헤더/본문 구분" 행이다 — 위 제목 박스(1~3행)와 병합하지는
  // 않되, 높이는 그 제목 행들과 동일하게 맞춘다.
  sheet.getRow(4).height = 23;

  // 원본 양식은 이 구분 행 바로 아래에 표 헤더가 온다(5행).
  const headerRowIndex = 5;
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.values = [...VISITOR_ENTRY_LOG_COLUMNS];
  headerRow.height = 35;
  headerRow.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  // No 1~20이 매겨지는 본문 데이터 행 — 법인차량과 같은 높이(31pt의 1.3배)로 맞춘다.
  const DATA_ROW_HEIGHT = 31 * 1.3;
  const rowCount = Math.max(pageRows.length, VISITOR_ENTRY_LOG_PAGE_SIZE);
  for (let index = 0; index < rowCount; index += 1) {
    const rowValues = pageRows[index];
    const row = sheet.getRow(headerRowIndex + 1 + index);
    row.height = DATA_ROW_HEIGHT;
    row.values = rowValues ?? [index + 1];
    for (let col = 1; col <= VISITOR_ENTRY_LOG_COLUMNS.length; col += 1) {
      const cell = row.getCell(col);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = THIN_BORDER;
    }
  }
}

/**
 * 종이 운행대장과 같은 양식("방문 차량 입출차 현황")으로 완료된(EXITED) 방문 예약
 * 엑셀 워크북을 만든다 — 좌상단 로고, 중앙 제목, 우상단 "관리부서: 총무팀" 남색 박스 +
 * 아래 남색 헤더 표. 법인차량 운행 내역(`company-vehicle-log-excel.ts`)과 같은 원칙으로
 * 20건이 넘으면 시트를 한 장 더 만들어 No를 1부터 다시 매긴다(`renumberRowsByPage` 참고).
 *
 * `rows`는 DB에서 막 조회한 값일 수도, 미리보기 패널에서 관리자가 고친 값일 수도 있다 —
 * 0번 칸(No)은 클라이언트가 무엇을 보냈든 페이지 안 순번으로 항상 다시 계산된다.
 */
export async function buildVisitorEntryLogWorkbook(
  rows: VisitorEntryLogCellRow[],
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const pages = renumberRowsByPage(rows);

  const logoPath = path.join(process.cwd(), 'public', 'synopex-logo.png');
  const logoImageId = fs.existsSync(logoPath)
    ? workbook.addImage({ filename: logoPath, extension: 'png' })
    : null;

  pages.forEach((pageRows, index) => {
    const sheetName = pages.length > 1 ? `${index + 1}페이지` : '방문 차량 입출차 현황';
    addLogSheet(workbook, sheetName, pageRows, logoImageId);
  });

  return workbook;
}
