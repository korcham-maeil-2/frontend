'use client'; // 오류 경계는 클라이언트 컴포넌트여야 한다

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { NoticePage } from '@/components/layout/notice-page';
import { reportError } from '@/lib/report-error';

// 화면을 그리다 예상하지 못한 오류가 났을 때 (머리글·바닥글은 그대로 두고 본문만 바꾼다).
// 오류 내용은 화면에 보이지 않고 오류 추적(GlitchTip)으로만 보낸다.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => reportError(error), [error]);

  return (
    <NoticePage
      label="오류"
      title="화면을 보여 주지 못했어요"
      actions={
        <>
          <Button className="min-h-11 px-4" onClick={() => retry()}>
            다시 시도
          </Button>
          <Link
            href="/"
            className={buttonVariants({ variant: 'outline', className: 'min-h-11 px-4' })}
          >
            서비스 소개로
          </Link>
        </>
      }
    >
      <p>잠깐 문제가 생겼어요. 다시 시도하면 대부분 바로 돌아와요.</p>
      <p>입력하던 공고와 생활비는 이 창에 남아 있어 처음부터 다시 넣지 않아도 돼요.</p>
    </NoticePage>
  );
}
