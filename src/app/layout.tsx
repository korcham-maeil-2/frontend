import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import './globals.css';

const suit = localFont({
  src: './fonts/SUIT-Variable.woff2',
  weight: '100 900',
  variable: '--font-suit',
  display: 'swap',
  fallback: ['Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
});

const scoreDream = localFont({
  src: './fonts/SCDreamBold.otf',
  weight: '600',
  variable: '--font-score-dream',
  display: 'swap',
  fallback: ['Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
});

export const metadata: Metadata = {
  title: '월급지도',
  description: '이 회사로 옮기면 한 달에 얼마가 남는지, 공고를 넣으면 비교해 드려요.',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`${suit.variable} ${scoreDream.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-body">
        <SiteHeader />
        <main id="main-content" className="site-shell flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
