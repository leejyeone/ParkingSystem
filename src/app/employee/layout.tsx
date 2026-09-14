import { EmployeeTopBar } from '@/components/employee/employee-top-bar';

/**
 * 직원 화면 공통 뼈대: 고정 상단바 + 본문.
 *
 * 인증 검사는 하지 않는다 — 각 페이지가 `requireEmployeePage()`로 직접 검증한다
 * (1차 방어선은 `proxy.ts`, 실제 검증은 각 화면이라는 기존 정책을 그대로 따른다).
 */
export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EmployeeTopBar />
      {children}
    </>
  );
}
