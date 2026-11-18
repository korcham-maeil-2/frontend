'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { formatWon, placeName, statusBadge } from './format';
import { SourceBadge } from './source-badge';

// 결과 화면의 '1년 정착 플랜' (백엔드 plan.py의 SettlePlan, 이슈 #18).
//   공고마다: 이사 전 → 이사한 달 → 달마다(신청 마감·시작) → 언제든
//   날짜·금액·순서는 모두 백엔드가 정한 그대로 보여 준다 (화면에서 다시 고르지 않는다).
// 자격은 판단하지 않는다 → 신청 페이지 링크와 '바뀔 수 있어요' 안내.

type SettlePlan = components['schemas']['SettlePlan'];
type PostingPlan = components['schemas']['PostingPlan'];
type PlanSlot = components['schemas']['PlanSlot'];
type PlanItem = components['schemas']['PlanItem'];
type SavingsList = components['schemas']['SavingsList'];
type TrainingList = components['schemas']['TrainingList'];
type Course = components['schemas']['Course'];

/** 서버·초안의 값이 이 화면이 아는 모양인지 (예전 백엔드·예전 초안이면 그리지 않는다) */
export function isSettlePlan(value: unknown): value is SettlePlan {
  const v = value as Partial<SettlePlan> | null | undefined;
  return (
    Array.isArray(v?.postings) &&
    typeof v?.start_month === 'string' &&
    v.postings.every((p) => Array.isArray(p.slots))
  );
}

/** 칸 이름 옆 짧은 설명 */
const SLOT_HINT: Partial<Record<PlanSlot['kind'], string>> = {
  before: '집을 구하기 전에',
  move_month: '이사하고 바로',
  anytime: '기간 제한 없이',
};

function ItemTitle({ item }: { item: PlanItem }) {
  if (!item.url) return <span className="plan-item-title">{item.title}</span>;
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="support-link">
      {item.title}
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}

function Item({ item }: { item: PlanItem }) {
  return (
    <li className="plan-item">
      <p className="plan-item-head">
        <ItemTitle item={item} />
        {item.scope && (
          <span className="support-category">{item.scope === 'national' ? '전국' : '지역'}</span>
        )}
      </p>
      {item.amount_krw != null && (
        <p className="plan-amount">
          <span className="tabular-nums">{formatWon(item.amount_krw)}</span>
          {item.status === 'estimated' && (
            <SourceBadge
              badge={statusBadge.estimated}
              subject={item.title}
              className="result-badge"
              details={item.source ? [{ label: '출처', text: item.source }] : []}
            />
          )}
        </p>
      )}
      {item.detail && <p className="support-text">{item.detail}</p>}
      {(item.when || (item.source && item.amount_krw == null)) && (
        <p className="support-meta">
          {item.when && <span className="support-open">{item.when}</span>}
          {item.source && item.amount_krw == null && (
            <span className="support-agency">{item.source}</span>
          )}
        </p>
      )}
    </li>
  );
}

/** 금리 자릿수를 맞춘다: 3 → '3.00%', 3.85 → '3.85%' */
function rate(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** '2026-12-01' → '12월 1일' */
function md(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

/** 공시 기준월 '202610' → '2026년 10월' */
function month(yyyymm: string | null | undefined): string | null {
  return yyyymm && yyyymm.length === 6
    ? `${yyyymm.slice(0, 4)}년 ${Number(yyyymm.slice(4))}월`
    : null;
}

/** 첫 월급부터 모으기: 은행 적금 12개월 기본금리 높은 순 (금감원 공시). 가입을 권하지 않는다. */
function SavingsSlot({ savings }: { savings: SavingsList }) {
  if (savings.status !== 'ok' || !savings.products.length) return null;
  const disclosed = month(savings.disclosed_month);
  return (
    <li className="plan-slot is-extra">
      <h4 className="plan-slot-label">
        첫 월급 받은 뒤<small>남는 돈을 모으고 싶다면 · 참고</small>
      </h4>
      <p className="plan-extra-lead">
        은행 적금 12개월 기본금리 높은 순이에요{disclosed && ` (${disclosed} 공시)`}. 가입을 권하는
        게 아니에요. 우대금리 조건과 실제 금리는 가입 전에 은행에서 확인해 주세요.
      </p>
      <ul className="plan-items">
        {savings.products.map((p) => (
          <li key={`${p.bank}-${p.name}`} className="plan-item">
            <p className="plan-item-head">
              <span className="plan-item-title">{p.name}</span>
              <span className="support-category">{p.bank}</span>
            </p>
            <p className="plan-amount">
              연 {rate(p.rate)}
              {p.max_rate != null && p.max_rate > p.rate && (
                <small className="plan-amount-note"> 우대 최고 연 {rate(p.max_rate)}</small>
              )}
            </p>
            <p className="support-meta">
              <span>{p.saving_type}</span>
              {p.join_way && <span>가입: {p.join_way.replaceAll(',', '·')}</span>}
              {/* 금감원 공시의 '최고 한도'(max_limit). 월 한도인지 총액인지는 상품마다 달라 공시 이름 그대로 */}
              {p.limit_krw != null && <span>공시 최고 한도 {formatWon(p.limit_krw)}</span>}
            </p>
          </li>
        ))}
      </ul>
      <p className="plan-extra-source">
        출처:{' '}
        <a href={savings.source_url} target="_blank" rel="noopener noreferrer">
          {savings.source}
          <span className="sr-only"> (새 창)</span>
        </a>
      </p>
    </li>
  );
}

function CourseItem({ course }: { course: Course }) {
  return (
    <li className="plan-item">
      <p className="plan-item-head">
        {course.url ? (
          <a href={course.url} target="_blank" rel="noopener noreferrer" className="support-link">
            {course.title}
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only"> (새 창)</span>
          </a>
        ) : (
          <span className="plan-item-title">{course.title}</span>
        )}
        {course.weekend && <span className="support-category">주말반</span>}
      </p>
      <p className="support-meta">
        <span className="support-open">
          {md(course.start)} 시작{course.end && ` ~ ${md(course.end)}`}
        </span>
        {/* 컨소시엄은 '무료'만 보이면 누구나 들을 수 있다고 오해한다 → 대상(중소기업 재직자)도 함께 */}
        <span>{course.kind_label}</span>
        {course.fee_krw === 0 && <span>무료</span>}
        {course.institute && <span className="support-agency">{course.institute}</span>}
      </p>
    </li>
  );
}

/** 일하면서 배우기: 근무지 근처 재직자 오프라인 강의 (고용24). 자격은 상세 페이지에서 확인. */
function TrainingSlot({ training }: { training: TrainingList | undefined }) {
  if (!training || training.status !== 'ok' || !training.courses.length) return null;
  const where = training.region ? placeName(training.region) : '근무지';
  const scope =
    training.scope === 'sido'
      ? `${where}에는 3개월 안에 시작하는 과정이 없어 근무지 인근(시도) 과정이에요.`
      : `${where}에서 3개월 안에 시작하는 과정이에요.`;
  return (
    <li className="plan-slot is-extra">
      <h4 className="plan-slot-label">
        일하면서 배우기<small>근무지 근처 재직자 강의</small>
      </h4>
      <p className="plan-extra-lead">
        {scope} 주말반을 먼저 보여 줘요. 수강 자격(재직 여부, 내일배움카드 등)과 장소는 과정 상세
        페이지에서 확인해 주세요.
      </p>
      <ul className="plan-items">
        {training.courses.map((course) => (
          <CourseItem key={`${course.title}-${course.start}-${course.institute}`} course={course} />
        ))}
      </ul>
      <p className="plan-extra-source">출처: {training.source}</p>
    </li>
  );
}

function PostingPanel({
  posting,
  savings,
  training,
}: {
  posting: PostingPlan;
  savings: SavingsList | null;
  training: TrainingList | undefined;
}) {
  if (!posting.slots.length) {
    return <p className="support-empty">지금 넣을 할 일을 찾지 못했어요.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="support-region">
        {posting.company || posting.posting_id}
        {posting.region && ` · ${posting.region}`}
        {posting.moving ? ' · 회사 근처로 이사하는 경우' : ' · 지금 집에서 통근하는 경우'}
      </p>
      <ol className="plan-timeline">
        {posting.slots.map((slot) => (
          <li key={`${slot.kind}-${slot.month ?? ''}`} className={`plan-slot is-${slot.kind}`}>
            <h4 className="plan-slot-label">
              {slot.label}
              {SLOT_HINT[slot.kind] && <small>{SLOT_HINT[slot.kind]}</small>}
            </h4>
            <ul className="plan-items">
              {slot.items.map((item) => (
                <Item key={`${item.kind}-${item.policy_id ?? item.title}`} item={item} />
              ))}
            </ul>
          </li>
        ))}
        {savings && <SavingsSlot savings={savings} />}
        <TrainingSlot training={training} />
      </ol>
      {posting.notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
    </div>
  );
}

/**
 * 적금(전국 같음)과 근무지별 재직자 강의를 불러온다. 정착 플랜과 따로 받는 참고 정보라,
 * 못 받거나 키가 없으면(status off·unavailable) 그 칸만 그리지 않는다.
 */
function usePlanExtras(codes: string[]) {
  const [savings, setSavings] = useState<SavingsList | null>(null);
  const [training, setTraining] = useState<Record<string, TrainingList>>({});
  const key = codes.join(',');
  useEffect(() => {
    let cancelled = false;
    api
      .GET('/plan/savings')
      .then(({ data }) => !cancelled && data && setSavings(data))
      .catch(() => {});
    for (const code of key ? key.split(',') : []) {
      api
        .GET('/plan/training/{lawd_cd}', { params: { path: { lawd_cd: code } } })
        .then(({ data }) => !cancelled && data && setTraining((t) => ({ ...t, [code]: data })))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  return { savings, training };
}

export function PlanView({ plan }: { plan: SettlePlan }) {
  const postings = plan.postings.filter((p) => p.slots.length > 0);
  const codes = [...new Set(postings.map((p) => p.lawd_cd).filter((c): c is string => !!c))].sort();
  const { savings, training } = usePlanExtras(codes);
  if (!postings.length) return null;
  const panel = (posting: PostingPlan) => (
    <PostingPanel
      posting={posting}
      savings={savings}
      training={posting.lawd_cd ? training[posting.lawd_cd] : undefined}
    />
  );
  return (
    <section className="support-section space-y-4" aria-labelledby="plan-title">
      <div>
        <h3 id="plan-title" className="font-semibold text-foreground">
          1년 정착 플랜
        </h3>
        <p className="text-sm text-muted-foreground">
          이 회사를 고르면 언제 무엇을 하면 되는지 순서대로 모았어요.
        </p>
      </div>
      {postings.length === 1 ? (
        panel(postings[0])
      ) : (
        <Tabs defaultValue={postings[0].posting_id} className="min-w-0">
          <TabsList aria-label="볼 회사" className="posting-tabs max-w-full justify-start">
            {postings.map((posting) => (
              <TabsTrigger key={posting.posting_id} value={posting.posting_id}>
                <span className="posting-tab-name">{posting.company || posting.posting_id}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {postings.map((posting) => (
            <TabsContent key={posting.posting_id} value={posting.posting_id} className="pt-3">
              {panel(posting)}
            </TabsContent>
          ))}
        </Tabs>
      )}
      {plan.notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}
