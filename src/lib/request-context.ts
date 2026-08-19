/**
 * 감사 로그에 남길 요청 컨텍스트(IP, User-Agent) 추출.
 */

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

/**
 * 접속지 IP 는 요청 헤더에서 읽는다. 앞쪽 헤더부터 우선한다.
 *
 * 로컬 개발 환경에서는 dev 서버가 x-forwarded-for: ::1 을 넣어 주므로 모든 기록이 '::1'
 * (IPv6 표기의 localhost)로 남는다. 같은 PC 에서 접속하니 정상이며 누락이 아니다.
 * 운영에서 실제 방문자 IP 를 남기려면 리버스 프록시가 헤더를 채워 주어야 한다.
 */
const IP_HEADERS = [
  'x-forwarded-for', // nginx / ALB / 대부분의 프록시 (쉼표 구분, 첫 번째가 원 클라이언트)
  'x-real-ip', // nginx 기본 설정
  'cf-connecting-ip', // Cloudflare
  'x-vercel-forwarded-for', // Vercel
  'x-client-ip',
] as const;

function readIpAddress(headers: Headers): string | null {
  for (const name of IP_HEADERS) {
    const value = headers.get(name)?.split(',')[0]?.trim();
    if (value) return value;
  }
  // RFC 7239 Forwarded: for=1.2.3.4;proto=https
  const forwarded = headers.get('forwarded');
  const match = forwarded?.match(/for="?\[?([^;,\]"]+)/i);
  return match?.[1]?.trim() || null;
}

export function getRequestContext(headers: Headers): RequestContext {
  const ipAddress = readIpAddress(headers);

  return {
    ipAddress: ipAddress ? ipAddress.slice(0, 64) : null,
    userAgent: headers.get('user-agent')?.slice(0, 500) ?? null,
  };
}
