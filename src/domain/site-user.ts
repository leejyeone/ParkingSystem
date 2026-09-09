/**
 * 관리자가 회원(SiteUser) 비밀번호를 재설정할 때 항상 초기화되는 고정 비밀번호.
 * 서버(site-user-service.ts)와 클라이언트(site-user-panel.tsx) 양쪽에서 같은 값을
 * 보여줘야 해서 별도 모듈로 둔다 — 서버 전용 모듈(prisma 등)에 의존하지 않아야
 * 클라이언트 컴포넌트에서 안전하게 import 할 수 있다.
 */
export const SITE_USER_RESET_PASSWORD = 'synovisit123!';
