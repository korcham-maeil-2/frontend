'use client'; // 오류 경계는 클라이언트 컴포넌트여야 한다

import { useEffect } from 'react';
import { NoticePage } from '@/components/layout/notice-page';
import { reportError } from '@/lib/report-error';
import './globals.css';

// 루트 레이아웃(머리글·바닥글)까지 그리지 못했을 때. 이 파일이 문서 전체를 대신하므로 html·body를 직접 둔다.
// 글꼴은 레이아웃에서 불러오므로 여기서는 시스템 글꼴로 보인다 (가장 드문 경우라 가볍게 둔다).
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => reportError(error), [error]);

  return (
    <html lang="ko">
      <body className="bg-background text-body">
        <title>오류 | 월급지도</title>
        <main className="site-shell">
          <NoticePage
            label="오류"
            title="월급지도를 불러오지 못했어요"
            actions={
              <>
                <button type="button" className="notice-button" onClick={() => retry()}>
                  다시 시도
                </button>
                {/* 레이아웃이 깨진 상태라 클라이언트 이동 대신 새로 불러온다 */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" className="notice-button is-outline">
                  서비스 소개로
                </a>
              </>
            }
          >
            <p>잠깐 문제가 생겼어요. 다시 시도하거나 잠시 후 새로고침해 주세요.</p>
          </NoticePage>
        </main>
      </body>
    </html>
  );
}
