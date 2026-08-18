import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '본사 주차 예약 시스템',
    template: '%s | 본사 주차 예약 시스템',
  },
  description: '본사 방문객 및 타 지사 직원을 위한 주차 예약 관리 시스템입니다.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
