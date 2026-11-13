'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import logo from '@public/logo.webp';

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className='site-head'>
      <a href='#main-content' className='skip-main'>
        본문 바로가기
      </a>
      <div className='site-shell head-row'>
        <Link href='/' className='wordmark'>
          <Image src={logo} alt='' width={57} height={60} className='h-9 w-auto shrink-0 md:h-10' />
          월급지도
        </Link>
        <nav aria-label='주 메뉴' className='head-nav'>
          <Link href='/' aria-current={pathname === '/' ? 'page' : undefined}>
            서비스 소개
          </Link>
          <Link
            href='/postings/new'
            aria-current={pathname === '/postings/new' ? 'page' : undefined}
          >
            공고 넣기
          </Link>
        </nav>
      </div>
    </header>
  );
}
