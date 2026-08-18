/**
 * 감사 로그에 남길 요청 컨텍스트(IP, User-Agent) 추출.
 */

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export function getRequestContext(headers: Headers): RequestContext {
  const forwardedFor = headers.get('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || null;

  return {
    ipAddress: ipAddress ? ipAddress.slice(0, 64) : null,
    userAgent: headers.get('user-agent')?.slice(0, 500) ?? null,
  };
}
