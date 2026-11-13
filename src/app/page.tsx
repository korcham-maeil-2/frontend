import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import heroArt from '@public/salary-map.webp';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { AgentStory } from './agent-story';
import { CompareView } from './compare-view';
import './landing.css';

export const metadata: Metadata = {
  title: '월급지도 | 매달 남는 돈으로 일자리 비교',
  description:
    'AI가 공고를 읽고, 근무지 월세·교통비와 지역 지원금까지 반영해 일자리를 매달 남는 돈으로 비교해요. 연봉이 비공개인 공고는 최소 얼마를 받아야 하는지 계산해요.',
};

function StartLink() {
  return (
    <Link
      href="/postings/new"
      className={buttonVariants({ className: 'main-action start-posting' })}
    >
      공고 넣어 보기 <ArrowRight aria-hidden />
    </Link>
  );
}

export default function Home() {
  return (
    <div className="landing">
      <div className="map-field">
        <section className="map-hero site-shell" aria-labelledby="map-title">
          <div className="map-intro">
            <h1 id="map-title">
              <span className="hero-line">어느 길로 출근해야</span>{' '}
              <span className="hero-line">
                통장에 <em className="money-left">더 남을까요?</em>
              </span>
            </h1>
            <p className="hero-lead">
              <span className="stat-line">서울 연봉 3,800만원만큼 남으려면</span>{' '}
              <span className="stat-line">대구에선 얼마를 받아야 할지 AI가 계산해요.</span>
            </p>
            <StartLink />
            <p className="hero-stat">
              <strong>
                청년 <mark>절반 이상</mark>은
              </strong>
              <span>
                <span className="stat-line">임금·복지·직무가 맞으면</span>{' '}
                <span className="stat-line">비수도권 중소기업 취업도 고려해요.</span>
              </span>
              <small>중소기업중앙회 청년 1,000명 조사(55.3%), 2026.10</small>
            </p>
          </div>
          <figure className="map-art">
            <Image
              src={heroArt}
              alt="접힌 종이 지도 위 집에서 회사까지 통근 열차가 달리고, 지도 끝은 급여명세서와 동전으로 이어져요."
              sizes="(max-width: 639px) 100vw, (max-width: 1150px) 69vw, 751px"
              preload
            />
          </figure>
        </section>
      </div>
      <section className="story-section site-shell" aria-labelledby="story-title">
        <h2 id="story-title">윤하늘 씨와 월급지도 AI의 일주일</h2>
        <AgentStory />
      </section>
      <section className="compare-section site-shell" aria-labelledby="compare-title">
        <div className="compare-intro">
          <h2 id="compare-title">
            하늘 씨는 대구에서{' '}
            <span className="whitespace-nowrap">
              <em className="money-left">약 2,700만원</em>만
            </span>{' '}
            받아도 서울만큼 남아요
          </h2>
          <p className="section-lead">
            본가에서 출퇴근하고, 통근버스가 무료이고, 청년 지원금을 받는다고 가정했어요.
          </p>
        </div>
        <div className="compare-body">
          <CompareView />
          <StartLink />
        </div>
      </section>
    </div>
  );
}
