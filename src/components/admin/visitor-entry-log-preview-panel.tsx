'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import {
  VISITOR_ENTRY_LOG_COLUMNS,
  VISITOR_ENTRY_LOG_PAGE_SIZE,
  renumberRowsByPage,
} from '@/domain/visitor-entry-log';
import { apiRequest } from '@/lib/client/api-client';

type CellRow = (string | number)[];

/** 엑셀 빌더(`visitor-entry-log-excel.ts`)의 열 폭과 정확히 같은 비율. */
const COLUMN_WIDTHS = [5, 9, 15, 10, 13, 12, 12, 29, 20];
const NAVY = '#1F3864';

/**
 * 법인차량 운행 내역 미리보기 패널(`company-vehicle-log-preview-panel.tsx`)과 같은
 * 양식 — 컬럼 구성·API 엔드포인트만 방문 차량 입출차 현황에 맞게 바꿨다. "엑셀 다운로드"
 * 전에 실제 파일과 똑같은 모양으로 미리 보여주고, 데이터 행은 셀 단위로 고칠 수 있게
 * 한다. 조회는 GET(JSON), 다운로드는 편집된 값을 POST 로 그대로 보내 서버가 그 값
 * 그대로 엑셀을 만들어 돌려준다(재조회하지 않음) — `visitor-entry-log-excel.ts`의 병합
 * 범위(로고 1~3행×1~3열 / 제목 1~3행×4~7열 / 관리부서 1행×8~9열 / 총무팀 2~3행×8~9열,
 * 4행은 병합 없이 헤더/본문을 나누는 구분 행)를 HTML 표의 rowSpan/colSpan으로 그대로
 * 재현한다.
 */
export function VisitorEntryLogPreviewPanel({ exportQuery }: { exportQuery: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CellRow[]>([]);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);

    const response = await apiRequest<{ rows: CellRow[] }>(
      `/api/admin/reservations/entry-log-export?${exportQuery}&format=json`,
    );

    setLoading(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setRows(response.data.rows);
  }

  function handleClose() {
    setOpen(false);
  }

  const pages = renumberRowsByPage(rows);

  function updateCell(rowIndex: number, colIndex: number, value: string) {
    setRows((previous) =>
      previous.map((row, r) => (r === rowIndex ? row.map((cell, c) => (c === colIndex ? value : cell)) : row)),
    );
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/reservations/entry-log-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });

      if (!response.ok) {
        setError('엑셀 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '방문차량입출차현황.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={handleOpen}>
        엑셀 다운로드
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="visitor-entry-log-preview-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="닫기"
            onClick={handleClose}
          />

          <div className="card relative max-h-[92vh] w-full max-w-5xl overflow-hidden">
            <div className="card-body flex max-h-[92vh] flex-col space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 id="visitor-entry-log-preview-title" className="card-title">
                  엑셀 미리보기 · 편집
                </h3>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={loading || downloading || rows.length === 0}
                    onClick={handleDownload}
                  >
                    {downloading ? '만드는 중…' : '다운로드'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleClose}>
                    닫기
                  </button>
                </div>
              </div>

              <p className="text-ink-muted text-sm">
                실제 다운로드될 엑셀과 같은 모양입니다. 아래 표의 칸을 눌러 값을 고친 뒤
                다운로드할 수 있습니다.
              </p>

              {error && <Alert variant="error">{error}</Alert>}

              {loading ? (
                <p className="text-ink-faint text-sm">불러오는 중…</p>
              ) : (
                <div className="flex-1 space-y-6 overflow-auto rounded-lg border border-slate-300 bg-slate-50 p-3">
                  {pages.map((pageRows, pageIndex) => (
                    <div key={pageIndex} className="rounded-md border border-slate-300 bg-white p-2 shadow-sm">
                      {pages.length > 1 && (
                        <p className="text-ink-faint mb-1 text-xs font-bold">{pageIndex + 1}페이지</p>
                      )}
                      <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                          {COLUMN_WIDTHS.map((width, index) => (
                            <col key={index} style={{ width: `${(width / 125) * 100}%` }} />
                          ))}
                        </colgroup>
                        <tbody>
                          {/* 1~3행: 로고 / 제목 / 관리부서·총무팀 — 엑셀 병합 범위 그대로 재현 */}
                          <tr>
                            <td
                              rowSpan={3}
                              colSpan={3}
                              className="border border-slate-300 p-2 text-center align-middle"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/synopex-logo.png" alt="SYNOPEX" className="mx-auto h-10 w-auto" />
                            </td>
                            <td
                              rowSpan={3}
                              colSpan={4}
                              className="border border-slate-300 p-2 text-center align-middle text-xl font-bold"
                            >
                              방문 차량 입출차 현황
                            </td>
                            <td
                              colSpan={2}
                              className="border border-slate-300 p-1.5 text-center align-middle font-bold text-white"
                              style={{ backgroundColor: NAVY }}
                            >
                              관리부서
                            </td>
                          </tr>
                          <tr>
                            <td
                              rowSpan={2}
                              colSpan={2}
                              className="border border-slate-300 p-1.5 text-center align-middle font-bold"
                            >
                              총무팀
                            </td>
                          </tr>
                          <tr />

                          {/* 4행: 제목 박스와 별개의 헤더/본문 구분 행 — 위와 병합하지 않는다 */}
                          <tr>
                            {VISITOR_ENTRY_LOG_COLUMNS.map((column) => (
                              <td key={`sep-${column}`} className="border border-slate-300" style={{ height: 31 }} />
                            ))}
                          </tr>

                          {/* 헤더 행 — 엑셀 35pt ≈ 47px */}
                          <tr>
                            {VISITOR_ENTRY_LOG_COLUMNS.map((column) => (
                              <th
                                key={column}
                                className="border border-slate-300 p-1.5 text-center align-middle font-bold whitespace-pre-line text-white"
                                style={{ backgroundColor: NAVY, height: 47 }}
                              >
                                {column}
                              </th>
                            ))}
                          </tr>

                          {/* 데이터 행 — No는 페이지 안 순번으로 고정, 나머지는 편집 가능.
                              엑셀 40.3pt(31pt×1.3) ≈ 54px. */}
                          {pageRows.map((row, rowIndexInPage) => {
                            const flatIndex = pageIndex * VISITOR_ENTRY_LOG_PAGE_SIZE + rowIndexInPage;
                            return (
                              <tr key={rowIndexInPage} style={{ height: 54 }}>
                                {row.map((cell, colIndex) =>
                                  colIndex === 0 ? (
                                    <td key={colIndex} className="border border-slate-300 p-1.5 text-center">
                                      {rowIndexInPage + 1}
                                    </td>
                                  ) : (
                                    <td key={colIndex} className="border border-slate-300 p-0">
                                      <input
                                        className="w-full border-0 bg-transparent px-1.5 py-1.5 text-center text-xs focus:bg-brand-100 focus:outline-none"
                                        value={cell}
                                        onChange={(event) => updateCell(flatIndex, colIndex, event.target.value)}
                                      />
                                    </td>
                                  ),
                                )}
                              </tr>
                            );
                          })}

                          {/* 원본 양식처럼 마지막 페이지도 20행까지 빈 칸으로 채운다 */}
                          {Array.from({ length: Math.max(0, VISITOR_ENTRY_LOG_PAGE_SIZE - pageRows.length) }).map(
                            (_, blankIndex) => (
                              <tr key={`blank-${blankIndex}`} style={{ height: 54 }}>
                                {VISITOR_ENTRY_LOG_COLUMNS.map((column, colIndex) => (
                                  <td key={column} className="border border-slate-300 p-1.5 text-center">
                                    {colIndex === 0 ? pageRows.length + blankIndex + 1 : ''}
                                  </td>
                                ))}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
