import sql from 'mssql';

import { getNumberEnv, getOptionalEnv, getRequiredEnv } from '@/lib/env';

/**
 * 그룹웨어(유니포탈) DB 조회 전용 연결.
 *
 * 사내 그룹웨어의 SQL Server 를 **읽기만** 한다. 이 파일에서 INSERT/UPDATE/DELETE 를
 * 절대 만들지 않는다 — 사번은 결재·근태 등 그룹웨어 전반이 쓰는 값이라, 주차 시스템이
 * 원본을 고치면 어디서 틀어졌는지 아무도 추적할 수 없게 된다.
 *
 * 접속 정보가 하나라도 비어 있으면 동기화 기능 자체를 "미설정" 으로 처리한다(예외를
 * 던지지 않는다). 그룹웨어가 없는 개발/테스트 환경에서도 앱이 정상 기동해야 하기 때문이다.
 *
 * 조회 대상 (partner.synosystem.com 의 기존 연동과 동일한 구조):
 *   tim_user_basic   사용자 기본 — EMPLOYEE_ID(사번), SYSMAIL(메일), DEPT_ID(부서코드)
 *   tco_resource     다국어 리소스 — 이름/부서명이 여기에 들어 있다 (LANG_TYPE='ko')
 *   tim_organization 조직 — DEPT_ID 로 부서명 리소스 ID 를 찾는다
 *
 * TODO: 그룹웨어 tim_user_basic 테이블의 실제 휴대전화 컬럼명을 서버 담당자에게 확인 후
 * EmployeeUser.phone 필드를 채우는 쿼리를 여기에 추가해야 한다(당사 담당자 이름+전화번호
 * 검증 기능이 그룹웨어 실시간 동기화 대상 직원에게도 동작하려면 필요하다).
 */

export type UniportalEmployee = {
  /** SYSMAIL. 소문자로 정규화한다. 주차 시스템과 맞추는 유일한 기준값이다. */
  email: string;
  /** 한국어 이름. 리소스 조회가 실패하면 빈 문자열이 올 수 있다. */
  name: string;
  /** EMPLOYEE_ID(사번). 비어 있는 재직자가 실제로 존재한다. */
  employeeCode: string;
  /** DEPT_ID */
  departmentCode: string;
  /** 한국어 부서명 */
  departmentName: string;
};

/** 접속 정보가 모두 설정되어 있는지. 화면에서 버튼 노출 여부를 정할 때 쓴다. */
export function isUniportalConfigured(): boolean {
  return Boolean(
    getOptionalEnv('UNIPORTAL_DB_HOST') &&
      getOptionalEnv('UNIPORTAL_DB_NAME') &&
      getOptionalEnv('UNIPORTAL_DB_USER') &&
      getOptionalEnv('UNIPORTAL_DB_PASSWORD'),
  );
}

function buildConfig(): sql.config {
  return {
    server: getRequiredEnv('UNIPORTAL_DB_HOST'),
    port: getNumberEnv('UNIPORTAL_DB_PORT', 1433),
    database: getRequiredEnv('UNIPORTAL_DB_NAME'),
    user: getRequiredEnv('UNIPORTAL_DB_USER'),
    password: getRequiredEnv('UNIPORTAL_DB_PASSWORD'),
    connectionTimeout: getNumberEnv('UNIPORTAL_DB_TIMEOUT_MS', 15000),
    requestTimeout: getNumberEnv('UNIPORTAL_DB_TIMEOUT_MS', 15000),
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
    options: {
      // 사내망 전용 구형 서버라 기본은 비암호화다. 기존 ASP 연동(SQLOLEDB)과 동일한 조건.
      // 서버가 TLS 를 갖추면 UNIPORTAL_DB_ENCRYPT="true" 로 켠다.
      encrypt: (getOptionalEnv('UNIPORTAL_DB_ENCRYPT') ?? 'false').toLowerCase() === 'true',
      trustServerCertificate:
        (getOptionalEnv('UNIPORTAL_DB_TRUST_CERT') ?? 'true').toLowerCase() !== 'false',
      enableArithAbort: true,
    },
  };
}

/**
 * 재직자 명부를 통째로 가져온다.
 *
 * IS_DELETED = 0 (재직) 이고 SYSMAIL 이 있는 사람만 대상으로 한다.
 * 메일이 없으면 주차 시스템과 맞출 방법이 없어 어차피 처리할 수 없다.
 *
 * WITH (nolock) 은 기존 그룹웨어 연동이 쓰던 방식을 그대로 따른 것이다. 명부 조회가
 * 그룹웨어 운영 트랜잭션을 붙잡지 않게 하려는 목적이다.
 */
export async function fetchUniportalEmployees(): Promise<UniportalEmployee[]> {
  const pool = new sql.ConnectionPool(buildConfig());
  try {
    await pool.connect();
    const result = await pool.request().query<{
      EMAIL: string | null;
      NAME: string | null;
      EMPLOYEE_CODE: string | null;
      DEPT_CODE: string | null;
      DEPT_NAME: string | null;
    }>(`
      SELECT
        A.SYSMAIL      AS EMAIL,
        A.EMPLOYEE_ID  AS EMPLOYEE_CODE,
        A.DEPT_ID      AS DEPT_CODE,
        (SELECT RESOURCE_NAME FROM tco_resource WITH (nolock)
          WHERE LANG_TYPE = 'ko' AND RESOURCE_TYPE = 'user.name'
            AND RESOURCE_ID = A.USER_NAME_ID) AS NAME,
        (SELECT RESOURCE_NAME FROM tco_resource WITH (nolock)
          WHERE LANG_TYPE = 'ko' AND RESOURCE_TYPE = 'org.name'
            AND RESOURCE_ID = (SELECT ORG_NAME_ID FROM tim_organization WITH (nolock)
                                WHERE ORG_ID = A.DEPT_ID)) AS DEPT_NAME
      FROM tim_user_basic AS A WITH (nolock)
      WHERE A.IS_DELETED = 0
        AND A.SYSMAIL IS NOT NULL
        AND LTRIM(RTRIM(A.SYSMAIL)) <> ''
      ORDER BY A.SYSMAIL
    `);

    return result.recordset.map((row) => ({
      email: (row.EMAIL ?? '').trim().toLowerCase(),
      name: (row.NAME ?? '').trim(),
      employeeCode: (row.EMPLOYEE_CODE ?? '').trim(),
      departmentCode: (row.DEPT_CODE ?? '').trim(),
      departmentName: (row.DEPT_NAME ?? '').trim(),
    }));
  } finally {
    await pool.close().catch(() => undefined);
  }
}
