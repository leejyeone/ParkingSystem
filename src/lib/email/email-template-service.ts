import { EmailType, RequesterType, SpaceType } from '@prisma/client';

import { formatKstHuman, formatKstRange } from '@/lib/datetime';
import { REQUESTER_TYPE_LABEL } from '@/domain/reservation-status';
import type { EmailAttachment } from '@/lib/email/email-provider';
import { PARKING_MAP_CID, renderParkingMapAttachment } from '@/lib/email/parking-map-image';
import { getAppBaseUrl } from '@/lib/env';

/**
 * 이메일 제목 / HTML / Text 템플릿.
 *
 * 규칙
 *  - 한 통의 메일에는 해당 예약 1건의 정보만 담는다. 타인의 정보는 절대 포함하지 않는다.
 *  - 성명과 차량번호는 마스킹 없이 원문으로 표시한다.
 *  - 예약 조회 링크에는 보안 토큰이 포함되며 해당 예약 1건만 접근할 수 있다.
 */

const BRAND = '시노펙스 방문 관리';

export type ReservationEmailData = {
  reservationNo: string;
  requesterName: string;
  requesterType: RequesterType;
  companyOrBranchName: string;
  vehicleNo: string;
  visitStartAt: Date;
  visitEndAt: Date;
  assignedSpaceCode?: string | null;
  assignedSpaceType?: SpaceType | null;
  /**
   * 주차면 배정 기능 사용 여부(시스템 설정). 기본 true.
   * false 이면 "배정 주차 위치" 행과 위치 관련 안내 문구를 모두 생략한다.
   */
  spaceAssignmentEnabled?: boolean;
  rejectionReason?: string | null;
  cancelReason?: string | null;
  /** 신청자용 예약 조회 링크(보안 토큰 포함) */
  accessUrl?: string | null;
  /** 관리자용 예약 상세 링크 */
  adminDetailUrl?: string | null;
  /** 변경 전 일정 (UPDATED 메일에서만 사용) */
  previousVisitStartAt?: Date | null;
  previousVisitEndAt?: Date | null;
  /** UPDATED 메일에서 관리자가 수정한 경우인지 (신청자 요청과 안내 문구가 다르다) */
  changedByAdmin?: boolean;
  /** 수정/취소 마감 시각 */
  changeDeadlineAt?: Date | null;
  /** 출차 알림 기준 시간(분 전). EXIT_REMINDER 메일 제목/본문에 표시한다. */
  exitReminderMinutes?: number;
  /** 입차 알림 기준 시간(분 전). ENTRY_REMINDER 메일 제목/본문에 표시한다. */
  entryReminderMinutes?: number;
  /** 당사 담당자 이름. ENTRY_REMINDER 메일 수신자(담당 직원) 호칭에 쓴다. */
  hostEmployeeName?: string;
  /**
   * 이 메일을 받는 사람이 신청자 본인인지 당사 담당자인지.
   * 미지정이면 신청자로 간주한다. 당사 담당자는 신청 경로(자가신청/대리신청)와
   * 무관하게 항상 이 값으로 렌더링한다 — 대리 신청한 직원 본인도 예외가 아니다.
   */
  recipientRole?: 'requester' | 'hostEmployee' | 'admin';
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Row = { label: string; value: string };

function baseRows(data: ReservationEmailData): Row[] {
  return [
    { label: '예약번호', value: data.reservationNo },
    { label: '신청 구분', value: REQUESTER_TYPE_LABEL[data.requesterType] },
    {
      label: data.requesterType === RequesterType.EMPLOYEE ? '사업장' : '회사명',
      value: data.companyOrBranchName,
    },
    { label: '신청자', value: data.requesterName },
    { label: '차량번호', value: data.vehicleNo },
    { label: '방문 시간', value: formatKstRange(data.visitStartAt, data.visitEndAt) },
  ];
}

function renderHtmlLayout(params: {
  title: string;
  lead: string;
  rows: Row[];
  /** rows 표 바로 아래, 유의사항 위에 끼워 넣을 추가 HTML (예: 배정 주차 위치 평면도 이미지) */
  imageHtml?: string;
  notices?: string[];
  buttonLabel?: string;
  buttonUrl?: string | null;
  footerNote?: string;
}): string {
  const rowsHtml = params.rows
    .map(
      (row) => `
            <tr>
              <th style="text-align:left;padding:8px 12px;background:#f8fafc;color:#475569;font-weight:600;font-size:13px;width:34%;border-bottom:1px solid #e2e8f0;">${escapeHtml(
                row.label,
              )}</th>
              <td style="padding:8px 12px;color:#0f172a;font-size:14px;border-bottom:1px solid #e2e8f0;">${escapeHtml(
                row.value,
              )}</td>
            </tr>`,
    )
    .join('');

  const noticesHtml =
    params.notices && params.notices.length > 0
      ? `<div style="margin-top:20px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
           <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e;">유의사항</p>
           <ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;line-height:1.7;">
             ${params.notices.map((notice) => `<li>${escapeHtml(notice)}</li>`).join('')}
           </ul>
         </div>`
      : '';

  const buttonHtml =
    params.buttonUrl && params.buttonLabel
      ? `<div style="margin-top:24px;text-align:center;">
           <a href="${escapeHtml(params.buttonUrl)}" style="display:inline-block;padding:14px 28px;background:#0052a4;color:#ffffff;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">${escapeHtml(
             params.buttonLabel,
           )}</a>
           <p style="margin:12px 0 0;font-size:12px;color:#64748b;word-break:break-all;">버튼이 동작하지 않으면 아래 주소를 복사해 접속하세요.<br />${escapeHtml(
             params.buttonUrl,
           )}</p>
         </div>`
      : '';

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:20px 24px;background:#0f172a;">
                <img src="${escapeHtml(`${getAppBaseUrl()}/synopex-logo.png`)}" alt="${escapeHtml(
                  BRAND,
                )}" width="140" height="40" style="display:block;margin-bottom:10px;" />
                <p style="margin:0;color:#e2e8f0;font-size:13px;letter-spacing:1px;">${escapeHtml(BRAND)}</p>
                <h1 style="margin:6px 0 0;color:#ffffff;font-size:19px;">${escapeHtml(params.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(
                  params.lead,
                )}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;overflow:hidden;">
                  ${rowsHtml}
                </table>
                ${params.imageHtml ?? ''}
                ${noticesHtml}
                ${buttonHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">${escapeHtml(
                  params.footerNote ??
                    '본 메일은 발신 전용입니다. 문의는 방문 관리 담당자에게 연락해 주세요.',
                )}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderTextLayout(params: {
  title: string;
  lead: string;
  rows: Row[];
  notices?: string[];
  buttonLabel?: string;
  buttonUrl?: string | null;
  footerNote?: string;
}): string {
  const lines: string[] = [
    `[${BRAND}] ${params.title}`,
    '',
    params.lead,
    '',
    '------------------------------',
    ...params.rows.map((row) => `${row.label}: ${row.value}`),
    '------------------------------',
  ];

  if (params.notices && params.notices.length > 0) {
    lines.push('', '[유의사항]', ...params.notices.map((notice) => `- ${notice}`));
  }
  if (params.buttonUrl && params.buttonLabel) {
    lines.push('', `${params.buttonLabel}: ${params.buttonUrl}`);
  }
  lines.push(
    '',
    params.footerNote ?? '본 메일은 발신 전용입니다. 문의는 방문 관리 담당자에게 연락해 주세요.',
  );

  return lines.join('\n');
}

/** 주차면 배정을 사용하는 운영인지 (미지정이면 사용하는 것으로 본다) */
function usesSpaceAssignment(data: ReservationEmailData): boolean {
  return data.spaceAssignmentEnabled !== false;
}

/** 배정 주차 위치 행. 배정을 쓰지 않으면 행 자체를 넣지 않는다. */
function spaceRows(data: ReservationEmailData): { label: string; value: string }[] {
  if (!usesSpaceAssignment(data)) return [];
  return [{ label: '배정 주차 위치', value: spaceGuideText(data) }];
}

function spaceGuideText(data: ReservationEmailData): string {
  if (!data.assignedSpaceCode) return '현장 안내에 따라 주차해 주세요.';
  if (data.assignedSpaceType === SpaceType.DOUBLE) {
    return `${data.assignedSpaceCode} (이중주차 구역)`;
  }
  return data.assignedSpaceCode;
}

/** 당사 담당자용 메일인지 (신청 경로와 무관 — 대리 신청한 직원 본인도 담당자용을 받는다) */
function isHostRecipient(data: ReservationEmailData): boolean {
  return data.recipientRole === 'hostEmployee';
}

/**
 * 담당자용 메일 제목 접두. 여러 건을 동시에 처리하는 담당자가 메일함 목록에서
 * 어느 방문객 건인지 바로 구분할 수 있도록 방문 상호(사업장명)와 성명을 넣는다.
 */
function hostSubjectPrefix(data: ReservationEmailData): string {
  return isHostRecipient(data) ? `${data.companyOrBranchName} ${data.requesterName}님 ` : '';
}

/** 담당자용 메일에 왜 이 메일을 받았는지 설명하는 안내 한 줄 */
function hostNotice(data: ReservationEmailData): string[] {
  return isHostRecipient(data)
    ? [`이 메일은 ${data.requesterName}님이 방문 신청 시 당사 담당자로 지정하여 발송되었습니다.`]
    : [];
}

/** 예약 1건에 대한 메일(반복 예약 시리즈 자체에 대한 메일은 별도 타입 참고). */
export type ReservationEmailType = Exclude<
  EmailType,
  | 'RECURRING_SCHEDULE_CREATED'
  | 'RECURRING_SCHEDULE_UPDATED'
  | 'RECURRING_OCCURRENCE_SKIPPED'
  | 'RECURRING_SCHEDULE_CANCELLED'
  // 담당자 재지정 기능 자체를 되돌리면서 더 이상 발송하지 않는다(enum 값은 DB 호환을 위해 유지).
  | 'HOST_EMPLOYEE_CHANGED'
  // 방문 예약이 아니라 법인차량 운행 신청 메일이라 별도 함수(renderCompanyVehicleTripEmail /
  // renderCompanyVehicleTripStatusEmail)로 렌더링한다.
  | 'NEW_VEHICLE_TRIP_TO_ADMIN'
  | 'VEHICLE_TRIP_REQUEST_RECEIVED'
  | 'VEHICLE_TRIP_APPROVED'
  | 'VEHICLE_TRIP_REJECTED'
  | 'VEHICLE_TRIP_CANCELLED'
>;

/**
 * 이메일 종류별 렌더링.
 */
export function renderReservationEmail(
  emailType: ReservationEmailType,
  data: ReservationEmailData,
): RenderedEmail {
  const rows = baseRows(data);

  switch (emailType) {
    case EmailType.REQUEST_RECEIVED: {
      const notices = usesSpaceAssignment(data)
        ? [
            '아직 승인 전 상태이며, 관리자 승인 후 배정 주차 위치가 안내됩니다.',
            '주차 위치는 시스템과 관리자가 배정하며 신청자가 직접 선택할 수 없습니다.',
          ]
        : [
            '아직 승인 전 상태이며, 관리자 승인 후 주차 가능 여부가 안내됩니다.',
            '주차 위치는 지정되지 않습니다. 방문 시 현장 안내에 따라 주차해 주세요.',
          ];
      if (data.changeDeadlineAt) {
        notices.push(
          `예약 수정/취소는 ${formatKstHuman(data.changeDeadlineAt)} 까지 아래 링크에서 가능합니다.`,
        );
      }
      notices.push(...hostNotice(data));
      const params = {
        title: '방문 신청이 접수되었습니다',
        lead: isHostRecipient(data)
          ? `담당하고 계신 방문객 ${data.requesterName}님의 방문 신청이 접수되었습니다. 현재 상태는 "승인 대기" 입니다.`
          : `${data.requesterName}님, 방문 신청이 정상 접수되었습니다. 현재 상태는 "승인 대기" 입니다.`,
        rows: [...rows, { label: '예약 상태', value: '승인 대기' }],
        notices,
        buttonLabel: '내 예약 조회하기',
        buttonUrl: data.accessUrl,
      };
      return {
        subject: `[시노펙스] ${hostSubjectPrefix(data)}방문 신청이 접수되었습니다`,
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.NEW_REQUEST_TO_ADMIN: {
      const params = {
        title: '신규 방문 신청이 접수되었습니다',
        lead: '승인 대기 중인 방문 신청이 있습니다. 관리자 화면에서 확인 후 승인 또는 반려해 주세요.',
        rows,
        notices: [
          '신청자 개인정보가 포함된 메일입니다. 업무 목적 외 사용이나 외부 공유를 금지합니다.',
        ],
        buttonLabel: '관리자 화면에서 확인하기',
        buttonUrl: data.adminDetailUrl,
        footerNote: '본 메일은 관리자 알림 수신자에게 발송됩니다.',
      };
      return {
        subject: `[시노펙스][승인요청] 신규 방문 신청`,
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.APPROVED: {
      /*
       * 이중주차로 배정된 경우 별도 안내 메일을 따로 보내지 않고 이 메일에 합친다.
       * 같은 시점에 같은 사람에게 두 통이 도착하면 하나를 놓치기 쉽고, 정작 중요한
       * 차량 이동 안내가 두 번째 메일에만 있으면 전달되지 않을 수 있다.
       */
      const isDoubleParking = data.assignedSpaceType === SpaceType.DOUBLE;

      /*
       * 코드만으로는 현장에서 찾기 어려우므로, 사이트에서 보는 것과 같은 평면도 이미지를
       * 메일 본문에 직접 첨부한다(cid 인라인) — 방문객이 위치를 보려고 다시 사이트에
       * 들어갈 필요가 없게 하기 위함이다. 도면에 없는 코드 등으로 이미지를 못 만들면
       * (renderParkingMapAttachment 가 null) 이미지 없이 텍스트 안내만 남긴다 — 메일
       * 발송 자체가 막히면 안 된다.
       */
      const mapAttachment =
        usesSpaceAssignment(data) && data.assignedSpaceCode
          ? renderParkingMapAttachment(data.assignedSpaceCode)
          : null;

      const notices = [
        '입차 시 차량번호와 예약 정보가 일치해야 합니다.',
        '승인 완료된 예약은 신청자가 직접 수정·취소할 수 없습니다. 변경이 필요하면 방문 관리 담당자에게 문의해 주세요.',
      ];
      if (!usesSpaceAssignment(data)) {
        notices.push('주차 위치는 지정되지 않습니다. 방문 시 현장 안내에 따라 주차해 주세요.');
      } else if (data.assignedSpaceCode) {
        notices.push(
          mapAttachment
            ? `배정된 주차 위치는 ${data.assignedSpaceCode} 입니다. 위 평면도에서 초록색으로 표시된 칸입니다.`
            : `배정된 주차 위치는 ${data.assignedSpaceCode} 입니다. 아래 [내 예약 조회하기] 에서 평면도로 위치를 확인하실 수 있습니다.`,
        );
      }
      if (isDoubleParking) {
        // 차량 이동 요청을 받게 되므로 가장 먼저 읽히도록 앞에 둔다.
        notices.unshift(
          '⚠ 이중주차 위치로 배정되었습니다. 앞 차량 출차를 위해 차량 이동 요청을 받으실 수 있습니다.',
          '차량 이동 요청은 현장 안내 방송 또는 안내 데스크를 통해 전달됩니다. 방문 중 확인이 가능하도록 해 주세요.',
          '기어는 중립(N)에 두고 주차 브레이크는 해제해 주시기 바랍니다.',
        );
      }
      notices.push(...hostNotice(data));

      const params = {
        title: isDoubleParking
          ? '방문 신청이 승인되었습니다 (이중주차 배정)'
          : '방문 신청이 승인되었습니다',
        lead: isHostRecipient(data)
          ? isDoubleParking
            ? `담당하고 계신 방문객 ${data.requesterName}님의 방문 신청이 승인되었습니다. 주차 공간 사정으로 이중주차 위치가 배정되었으니 아래 안내를 반드시 확인해 주세요.`
            : `담당하고 계신 방문객 ${data.requesterName}님의 방문 신청이 승인되었습니다.`
          : isDoubleParking
            ? `${data.requesterName}님, 신청하신 방문 예약이 승인되었습니다. 주차 공간 사정으로 이중주차 위치가 배정되었으니 아래 안내를 반드시 확인해 주세요.`
            : `${data.requesterName}님, 신청하신 방문 예약이 승인되었습니다.`,
        rows: [...rows, ...spaceRows(data), { label: '예약 상태', value: '승인 완료' }],
        imageHtml: mapAttachment
          ? `<div style="margin-top:16px;text-align:center;">
               <img src="cid:${PARKING_MAP_CID}" alt="배정 주차 위치 평면도" style="max-width:100%;border-radius:8px;border:1px solid #e2e8f0;" />
             </div>`
          : undefined,
        notices,
        buttonLabel: '내 예약 조회하기',
        buttonUrl: data.accessUrl,
      };
      return {
        subject: isDoubleParking
          ? `[시노펙스] ${hostSubjectPrefix(data)}방문 신청 승인 및 이중주차 배정 안내`
          : `[시노펙스] ${hostSubjectPrefix(data)}방문 신청이 승인되었습니다`,
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
        attachments: mapAttachment ? [mapAttachment] : undefined,
      };
    }

    case EmailType.REJECTED: {
      const params = {
        title: '방문 신청이 반려되었습니다',
        lead: isHostRecipient(data)
          ? `담당하고 계신 방문객 ${data.requesterName}님의 방문 신청이 반려되었습니다.`
          : `${data.requesterName}님, 신청하신 방문 예약이 반려되었습니다.`,
        rows: [
          ...rows,
          { label: '반려 사유', value: data.rejectionReason ?? '사유 미기재' },
          { label: '예약 상태', value: '반려' },
        ],
        notices: [
          '방문 일정 조정이 필요하시면 새로 방문 신청을 등록해 주세요.',
          '자세한 사항은 방문 담당자 또는 방문 관리 담당자에게 문의해 주세요.',
          ...hostNotice(data),
        ],
      };
      return {
        subject: `[시노펙스] ${hostSubjectPrefix(data)}방문 신청이 반려되었습니다`,
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.UPDATED: {
      const changeRows: Row[] = [];
      if (data.previousVisitStartAt && data.previousVisitEndAt) {
        changeRows.push({
          label: '변경 전 방문 시간',
          value: formatKstRange(data.previousVisitStartAt, data.previousVisitEndAt),
        });
      }
      const byAdmin = data.changedByAdmin === true;
      const params = {
        title: '예약 내용이 변경되었습니다',
        lead: byAdmin
          ? '방문 관리 담당자가 예약 내용을 변경했습니다. 아래 내용을 확인해 주세요.'
          : isHostRecipient(data)
            ? `담당하고 계신 방문객 ${data.requesterName}님이 예약 내용을 변경했습니다. 아직 승인 대기 중인 예약입니다.`
            : '신청자 요청으로 예약 내용이 변경되었습니다. 아직 승인 대기 중인 예약입니다.',
        rows: [
          ...changeRows,
          ...rows.map((row) =>
            row.label === '방문 시간' ? { label: '변경 후 방문 시간', value: row.value } : row,
          ),
          ...(byAdmin ? [] : [{ label: '예약 상태', value: '승인 대기' }]),
        ],
        notices: [
          ...(byAdmin
            ? ['변경 내용이 맞지 않으면 방문 관리 담당자에게 문의해 주세요.']
            : usesSpaceAssignment(data)
              ? ['관리자 승인 후 배정 주차 위치가 안내됩니다.']
              : ['관리자 승인 후 주차 가능 상태가 됩니다.']),
          ...hostNotice(data),
        ],
        buttonLabel: '내 예약 조회하기',
        buttonUrl: data.accessUrl,
      };
      return {
        subject: `[시노펙스] ${hostSubjectPrefix(data)}예약 내용이 변경되었습니다`,
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.CANCELLED: {
      const isAdminRecipient = data.recipientRole === 'admin';
      const params = {
        title: '예약이 취소되었습니다',
        lead: isAdminRecipient
          ? `${data.companyOrBranchName} ${data.requesterName}님의 방문 예약이 취소되었습니다. 관리자 화면에서 확인해 주세요.`
          : isHostRecipient(data)
            ? `담당하고 계신 방문객 ${data.requesterName}님의 방문 예약이 취소되었습니다.`
            : '요청하신 방문 예약이 취소 처리되었습니다.',
        rows: [
          ...rows,
          { label: '취소 사유', value: data.cancelReason ?? '사유 미기재' },
          { label: '예약 상태', value: '취소' },
        ],
        notices: [
          ...(usesSpaceAssignment(data)
            ? ['배정되어 있던 주차 위치는 해제되었습니다.']
            : ['예약이 취소되어 주차가 불가합니다.']),
          ...(isAdminRecipient
            ? ['신청자 개인정보가 포함된 메일입니다. 업무 목적 외 사용이나 외부 공유를 금지합니다.']
            : hostNotice(data)),
        ],
        ...(isAdminRecipient
          ? { buttonLabel: '관리자 화면에서 확인하기', buttonUrl: data.adminDetailUrl }
          : {}),
      };
      return {
        subject: isAdminRecipient
          ? `[시노펙스][취소] 방문 예약이 취소되었습니다`
          : `[시노펙스] ${hostSubjectPrefix(data)}예약이 취소되었습니다`,
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.EXIT_REMINDER: {
      /* 관리자가 정한 기준 시간(분 전)에 발송되므로 남은 시간을 그대로 안내한다. */
      const minutes = data.exitReminderMinutes ?? 10;
      const params = {
        title: `출차 예정 시간까지 ${minutes}분 남았습니다`,
        lead: isHostRecipient(data)
          ? `담당하고 계신 방문객 ${data.requesterName}님의 출차 예정 시간까지 ${minutes}분 남았습니다.`
          : `${data.requesterName}님, 등록하신 출차 예정 시간까지 ${minutes}분 남았습니다. 시간에 맞추어 출차해 주세요.`,
        rows: [
          ...rows,
          { label: '출차 예정 시각', value: formatKstHuman(data.visitEndAt) },
          ...spaceRows(data),
        ],
        notices: [
          '출차가 지연될 경우 뒤이은 방문 차량의 주차가 어려울 수 있습니다.',
          '부득이하게 시간이 초과되는 경우 방문 관리 담당자에게 연락해 주세요.',
          ...hostNotice(data),
        ],
      };
      return {
        subject: `[시노펙스] ${hostSubjectPrefix(data)}출차 예정 시간 ${minutes}분 전 안내`,
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.ENTRY_REMINDER: {
      /* 방문객이 곧 도착함을 당사 담당자에게 안내한다. 신청자(방문객)가 아니라 담당 직원 수신용. */
      const minutes = data.entryReminderMinutes ?? 10;
      const greeting = data.hostEmployeeName ? `${data.hostEmployeeName}님, ` : '';
      const params = {
        title: `방문객 입차 예정 안내 (${minutes}분 전)`,
        lead: `${greeting}담당하신 방문객이 입차 예정 시각 ${minutes}분 전입니다. 방문객 응대를 준비해 주세요.`,
        rows: [...rows, { label: '입차 예정 시각', value: formatKstHuman(data.visitStartAt) }],
        notices: ['방문객 도착 시 안내 및 응대를 부탁드립니다.'],
      };
      return {
        subject: `[시노펙스] ${data.companyOrBranchName} ${data.requesterName}님 입차 예정 안내 (${minutes}분 전)`,
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    default: {
      const exhaustiveCheck: never = emailType;
      throw new Error(`지원하지 않는 이메일 종류입니다: ${String(exhaustiveCheck)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 법인차량 운행 신청 메일 (방문 예약과 데이터 형태가 달라 별도 렌더링)
// ---------------------------------------------------------------------------

export type CompanyVehicleTripEmailData = {
  tripNo: string;
  employeeName: string;
  departmentName: string;
  destination: string;
  reason: string;
  requestStartAt: Date;
  requestEndAt: Date;
  adminDetailUrl: string;
};

/** 신청 직원 본인이 받는 법인차량 상태 변경 메일 4종. */
export type VehicleTripEmailType = Extract<
  EmailType,
  | 'VEHICLE_TRIP_REQUEST_RECEIVED'
  | 'VEHICLE_TRIP_APPROVED'
  | 'VEHICLE_TRIP_REJECTED'
  | 'VEHICLE_TRIP_CANCELLED'
>;

export type VehicleTripStatusEmailData = {
  tripId: number;
  tripNo: string;
  employeeName: string;
  employeeEmail: string;
  departmentName: string;
  destination: string;
  reason: string;
  requestStartAt: Date;
  requestEndAt: Date;
  rejectionReason?: string | null;
  cancelReason?: string | null;
  employeeDetailUrl: string;
};

function vehicleTripBaseRows(data: VehicleTripStatusEmailData): Row[] {
  return [
    { label: '신청번호', value: data.tripNo },
    { label: '신청 직원', value: `${data.employeeName} (${data.departmentName})` },
    { label: '행선지', value: data.destination },
    { label: '운행 목적', value: data.reason },
    { label: '운행 요청 시간', value: formatKstRange(data.requestStartAt, data.requestEndAt) },
  ];
}

/** 법인차량 운행 신청 상태 변경 메일 (신청 직원 본인 전용) */
export function renderCompanyVehicleTripStatusEmail(
  emailType: VehicleTripEmailType,
  data: VehicleTripStatusEmailData,
): RenderedEmail {
  const rows = vehicleTripBaseRows(data);

  switch (emailType) {
    case EmailType.VEHICLE_TRIP_REQUEST_RECEIVED: {
      const params = {
        title: '법인차량 운행 신청이 접수되었습니다',
        lead: `${data.employeeName}님, 법인차량 운행 신청이 정상 접수되었습니다. 현재 상태는 "승인 대기" 입니다.`,
        rows: [...rows, { label: '신청 상태', value: '승인 대기' }],
        notices: ['아직 승인 전 상태이며, 관리자 승인 후 배정 차량이 안내됩니다.'],
        buttonLabel: '내 신청 조회하기',
        buttonUrl: data.employeeDetailUrl,
      };
      return {
        subject: '[시노펙스] 법인차량 운행 신청이 접수되었습니다',
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.VEHICLE_TRIP_APPROVED: {
      const params = {
        title: '법인차량 운행 신청이 승인되었습니다',
        lead: `${data.employeeName}님, 신청하신 법인차량 운행이 승인되었습니다.`,
        rows: [...rows, { label: '신청 상태', value: '승인 완료' }],
        notices: [
          '운행 시 배정된 차량과 운행 정보가 일치해야 합니다.',
          '승인 완료된 신청은 직접 수정·취소할 수 없습니다. 변경이 필요하면 차량 관리 담당자에게 문의해 주세요.',
        ],
        buttonLabel: '내 신청 조회하기',
        buttonUrl: data.employeeDetailUrl,
      };
      return {
        subject: '[시노펙스] 법인차량 운행 신청이 승인되었습니다',
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.VEHICLE_TRIP_REJECTED: {
      const params = {
        title: '법인차량 운행 신청이 반려되었습니다',
        lead: `${data.employeeName}님, 신청하신 법인차량 운행이 반려되었습니다.`,
        rows: [
          ...rows,
          { label: '반려 사유', value: data.rejectionReason ?? '사유 미기재' },
          { label: '신청 상태', value: '반려' },
        ],
        notices: [
          '운행 일정 조정이 필요하시면 새로 운행 신청을 등록해 주세요.',
          '자세한 사항은 차량 관리 담당자에게 문의해 주세요.',
        ],
      };
      return {
        subject: '[시노펙스] 법인차량 운행 신청이 반려되었습니다',
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    case EmailType.VEHICLE_TRIP_CANCELLED: {
      const params = {
        title: '법인차량 운행 신청이 취소되었습니다',
        lead: `${data.employeeName}님, 신청하신 법인차량 운행이 취소 처리되었습니다.`,
        rows: [
          ...rows,
          { label: '취소 사유', value: data.cancelReason ?? '사유 미기재' },
          { label: '신청 상태', value: '취소' },
        ],
        notices: ['다시 운행이 필요하시면 새로 운행 신청을 등록해 주세요.'],
      };
      return {
        subject: '[시노펙스] 법인차량 운행 신청이 취소되었습니다',
        html: renderHtmlLayout(params),
        text: renderTextLayout(params),
      };
    }

    default: {
      const exhaustive: never = emailType;
      throw new Error(`알 수 없는 법인차량 메일 종류: ${exhaustive}`);
    }
  }
}

/** 신규 법인차량 운행 신청 알림 (관리자 전용, NEW_REQUEST_TO_ADMIN과 같은 톤) */
export function renderCompanyVehicleTripEmail(data: CompanyVehicleTripEmailData): RenderedEmail {
  const params = {
    title: '신규 법인차량 운행 신청이 접수되었습니다',
    lead: '승인 대기 중인 법인차량 운행 신청이 있습니다. 관리자 화면에서 확인 후 승인 또는 반려해 주세요.',
    rows: [
      { label: '신청번호', value: data.tripNo },
      { label: '신청 직원', value: `${data.employeeName} (${data.departmentName})` },
      { label: '행선지', value: data.destination },
      { label: '운행 목적', value: data.reason },
      { label: '운행 요청 시간', value: formatKstRange(data.requestStartAt, data.requestEndAt) },
    ],
    notices: [
      '신청자 개인정보가 포함된 메일입니다. 업무 목적 외 사용이나 외부 공유를 금지합니다.',
    ],
    buttonLabel: '관리자 화면에서 확인하기',
    buttonUrl: data.adminDetailUrl,
    footerNote: '본 메일은 관리자 알림 수신자에게 발송됩니다.',
  };
  return {
    subject: `[시노펙스][승인요청] 신규 법인차량 운행 신청`,
    html: renderHtmlLayout(params),
    text: renderTextLayout(params),
  };
}
