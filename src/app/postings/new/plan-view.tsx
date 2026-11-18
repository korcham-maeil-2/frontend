'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
type CalculationResult = components['schemas']['CalculationResult'];

/** 적금 예시 금액 (매달). 남는 돈보다 많은 것은 빼고 보여 준다 */
const DEPOSITS = [100_000, 300_000, 500_000, 1_000_000];

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
function SavingsSlot({
  savings,
  remaining,
  moving,
}: {
  savings: SavingsList;
  remaining: number | null;
  moving: boolean;
}) {
  const options = remaining != null ? DEPOSITS.filter((d) => d <= remaining) : [];
  // 처음 고른 금액: 남는 돈의 30% 안에서 가장 큰 것 (없으면 가장 작은 것)
  const [deposit, setDeposit] = useState(
    () => options.filter((d) => d <= (remaining ?? 0) * 0.3).at(-1) ?? options[0],
  );
  if (savings.status !== 'ok' || !savings.products.length) return null;
  const disclosed = month(savings.disclosed_month);
  // 고른 금액이 공시 한도 안인 상품 중 금리 1위
  const top =
    savings.products.find((p) => p.limit_krw == null || p.limit_krw >= (deposit ?? 0)) ??
    savings.products[0];
  // 12개월 적금 세전 이자 (단리, 매달 같은 금액): 금액 × 연이율 × (12+11+…+1)/12 = × 6.5
  const interest = deposit ? Math.round((deposit * (top.rate / 100) * 6.5) / 1000) * 1000 : 0;
  return (
    <li className="plan-slot is-extra">
      <h4 className="plan-slot-label">
        첫 월급 받은 뒤<small>남는 돈을 모으고 싶다면 · 참고</small>
      </h4>
      <p className="plan-extra-lead">
        은행 적금 12개월 기본금리 높은 순이에요{disclosed && ` (${disclosed} 공시)`}. 가입을 권하는
        게 아니에요. 우대금리 조건과 실제 금리는 가입 전에 은행에서 확인해 주세요.
      </p>
      {deposit != null && remaining != null && (
        <div className="savings-calc">
          {/* 한 줄로: 문장 사이에 금액 버튼 (좁으면 알아서 줄바꿈) */}
          <p className="savings-line">
            {moving ? '이사하면' : '지금 집에서 통근하면'} 매달 남는 돈 약{' '}
            {formatWon(Math.round(remaining / 10_000) * 10_000)} 중
            <span className="inline-flex flex-wrap gap-1" role="group" aria-label="매달 넣을 금액">
              {options.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  className="min-h-8 px-2.5"
                  variant={d === deposit ? 'default' : 'outline'}
                  aria-pressed={d === deposit}
                  onClick={() => setDeposit(d)}
                >
                  {formatWon(d).replace(/원$/, '')}
                </Button>
              ))}
            </span>
            씩 12개월 넣으면
            <strong className="savings-total">
              약 {formatWon(Math.round((deposit * 12 + interest) / 10_000) * 10_000)}
            </strong>
          </p>
          <p className="savings-note">
            원금 {formatWon(deposit * 12)} + 세전 이자 약 {formatWon(interest)} · {top.bank} 연{' '}
            {rate(top.rate)} 기본금리 기준
          </p>
        </div>
      )}
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

function CourseItem({ course, jobNcs }: { course: Course; jobNcs: string | null }) {
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
        {jobNcs && course.ncs?.startsWith(jobNcs) && (
          <span className="support-category">직무 관련</span>
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
        {/* 강의는 장소가 중요해 좁은 화면에서도 기관을 보인다 (support-agency는 숨겨짐) */}
        {course.institute && <span>{course.institute}</span>}
      </p>
    </li>
  );
}

/** 일하면서 배우기: 근무지 근처 재직자 오프라인 강의 (고용24). 자격은 상세 페이지에서 확인. */
function TrainingSlot({
  training,
  jobNcs,
}: {
  training: TrainingList | undefined;
  jobNcs: string | null;
}) {
  if (!training || training.status !== 'ok' || !training.courses.length) return null;
  // 직무에 맞는 과정이 하나라도 있을 때만 '직무 관련 먼저'라고 알린다
  const matched = !!jobNcs && training.courses.some((c) => c.ncs?.startsWith(jobNcs));
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
        {scope} {matched ? '공고 직무와 관련된 과정과 주말반을' : '주말반을'} 먼저 보여 줘요. 수강
        자격(재직 여부, 내일배움카드 등)과 장소는 과정 상세 페이지에서 확인해 주세요.
      </p>
      <ul className="plan-items">
        {training.courses.map((course) => (
          <CourseItem
            key={`${course.title}-${course.start}-${course.institute}`}
            course={course}
            jobNcs={jobNcs}
          />
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
  remaining,
}: {
  posting: PostingPlan;
  savings: SavingsList | null;
  training: TrainingList | undefined;
  /** 이 플랜의 경우(이사·통근)에 매달 남는 돈. 모르면 null */
  remaining: number | null;
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
        {/* 남는 돈이 바뀌면(다시 계산) 고른 금액도 새로 정한다 */}
        {savings && (
          <SavingsSlot
            key={remaining}
            savings={savings}
            remaining={remaining}
            moving={posting.moving}
          />
        )}
        <TrainingSlot training={training} jobNcs={posting.ncs ?? null} />
      </ol>
      {posting.notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
    </div>
  );
}

/** 재직자 강의를 받을 열쇠: 근무지 시군구 코드와 직무 분류 ('41135:20'). 근무지를 모르면 null */
function trainingKey(posting: PostingPlan): string | null {
  return posting.lawd_cd ? `${posting.lawd_cd}:${posting.ncs ?? ''}` : null;
}

/**
 * 적금(전국 같음)과 근무지·직무별 재직자 강의를 불러온다. 정착 플랜과 따로 받는 참고 정보라,
 * 못 받거나 키가 없으면(status off·unavailable) 그 칸만 그리지 않는다.
 */
function usePlanExtras(keys: string[]) {
  const [savings, setSavings] = useState<SavingsList | null>(null);
  const [training, setTraining] = useState<Record<string, TrainingList>>({});
  const key = keys.join(',');
  // 적금은 전국이 같아 한 번만 받는다
  useEffect(() => {
    let cancelled = false;
    api
      .GET('/plan/savings')
      .then(({ data }) => !cancelled && data && setSavings(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    for (const k of key ? key.split(',') : []) {
      const [code, ncs] = k.split(':');
      api
        .GET('/plan/training/{lawd_cd}', {
          params: { path: { lawd_cd: code }, query: ncs ? { ncs } : {} },
        })
        .then(({ data }) => !cancelled && data && setTraining((t) => ({ ...t, [k]: data })))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  return { savings, training };
}

export function PlanView({ plan, result }: { plan: SettlePlan; result: CalculationResult }) {
  const postings = plan.postings.filter((p) => p.slots.length > 0);
  const keys = [...new Set(postings.map(trainingKey).filter((k): k is string => !!k))].sort();
  const { savings, training } = usePlanExtras(keys);
  const remainingFor = (posting: PostingPlan) =>
    result.postings
      .find((p) => p.posting_id === posting.posting_id)
      ?.scenarios.find((s) => s.case === (posting.moving ? 'move' : 'commute'))
      ?.monthly_remaining ?? null;
  if (!postings.length) return null;
  const panel = (posting: PostingPlan) => (
    <PostingPanel
      posting={posting}
      savings={savings}
      training={training[trainingKey(posting) ?? '']}
      remaining={remainingFor(posting)}
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
