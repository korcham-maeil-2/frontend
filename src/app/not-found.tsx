import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { NoticePage } from '@/components/layout/notice-page';

export const metadata: Metadata = {
  title: '페이지를 찾을 수 없어요 | 월급지도',
};

// 없는 주소로 들어왔을 때 (루트 레이아웃 안에서 보여 주므로 머리글·바닥글은 그대로 보인다)
export default function NotFound() {
  return (
    <NoticePage
      label="404"
      title="페이지를 찾을 수 없어요"
      actions={
        <>
          <Link href="/postings/new" className={buttonVariants({ className: 'min-h-11 px-4' })}>
            공고 넣기
          </Link>
          <Link
            href="/"
            className={buttonVariants({ variant: 'outline', className: 'min-h-11 px-4' })}
          >
            서비스 소개
          </Link>
        </>
      }
    >
      <p>주소가 바뀌었거나 잘못 입력된 것 같아요.</p>
      <p>같은 창에서 비교하던 공고는 그대로 남아 있어요. 공고 넣기에서 이어서 할 수 있어요.</p>
    </NoticePage>
  );
}
