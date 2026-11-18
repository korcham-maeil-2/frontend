'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
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

/** 서버·초안의 값이 이 화면이 아는 모양인지 (예전 백엔드·예전 초안이면 그리지 않는다) */
export function isSettlePlan(value: unknown): value is SettlePlan {
  const v = value as Partial<SettlePlan> | null | undefined;
  return (
    Array.isArray(v?.postings) &&
    typeof v?.start_month === 'string' &&
    v.postings.every((p) => Array.isArray(p.slots))
  );
}

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
  // 지원 정책은 한 줄 (설명·조건은 아래 '근무지별 청년 지원'에), 할 일(보증금·전입신고)만 카드
  if (item.kind === 'policy') {
    return (
      <li className="plan-row">
        <ItemTitle item={item} />
        {item.scope && (
          <span className="support-category">{item.scope === 'national' ? '전국' : '지역'}</span>
        )}
        {/* 상시는 대부분이라 표시하지 않는다: 마감·시작일이 있는 것만 눈에 띄게 */}
        {item.when && item.when !== '상시' && <span className="support-open">{item.when}</span>}
      </li>
    );
  }
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
  basis,
}: {
  savings: SavingsList;
  /** 계산에 쓸 매달 남는 돈 (연봉 비공개면 최소 연봉일 때 금액). 모르면 null */
  remaining: number | null;
  /** 그 금액이 무엇 기준인지 ('이사하면', '최소 연봉 3,963만원을 받는다면') */
  basis: string;
}) {
  // 12개월 뒤 금액은 백엔드가 계산해 보낸다 (estimates). 화면은 남는 돈 안의 금액만 고르게 한다
  const options = (savings.estimates ?? []).filter(
    (e) => remaining != null && e.monthly_krw <= remaining,
  );
  // 처음 고른 금액: 남는 돈의 30% 안에서 가장 큰 것 (없으면 가장 작은 것)
  const [deposit, setDeposit] = useState(
    () =>
      (options.filter((e) => e.monthly_krw <= (remaining ?? 0) * 0.3).at(-1) ?? options[0])
        ?.monthly_krw,
  );
  if (savings.status !== 'ok' || !savings.products.length) return null;
  const disclosed = month(savings.disclosed_month);
  const top = savings.products[0]; // 계산 기준: 기본금리 1위 (한도는 월·총액이 상품마다 달라 비교하지 않는다)
  const chosen = options.find((e) => e.monthly_krw === deposit);
  return (
    <section className="plan-section">
      <h3 className="plan-section-title">
        남는 돈 모으기 <span className="support-category">참고</span>
      </h3>
      <p className="plan-section-desc">
        은행 적금 12개월 기본금리 높은 순{disclosed && ` · ${disclosed} 공시`}
      </p>
      {remaining == null && (
        <p className="plan-section-desc">
          매달 남는 돈을 계산하면 여기서 모으는 금액을 볼 수 있어요.
        </p>
      )}
      {chosen && remaining != null && (
        <div className="savings-calc">
          <p className="savings-line">
            매달
            <span className="inline-flex flex-wrap gap-1" role="group" aria-label="매달 넣을 금액">
              {options.map(({ monthly_krw: d }) => (
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
            <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
            12개월 뒤
            <strong className="savings-total">
              약 {formatWon(Math.round(chosen.total_krw / 10_000) * 10_000)}
            </strong>
          </p>
          <p className="savings-note">
            {basis} 매달 남는 돈 약 {formatWon(Math.round(remaining / 10_000) * 10_000)} 기준 · 원금{' '}
            {formatWon(chosen.principal_krw)} + 세전 이자 약 {formatWon(chosen.interest_krw)} ·{' '}
            {top.bank} 연 {rate(top.rate)} · 실제 금리는 은행에서 확인
          </p>
        </div>
      )}
      <ul className="plan-items">
        {savings.products.map((p) => (
          <li key={`${p.bank}-${p.name}`} className="plan-row is-saving">
            <span className="plan-row-title">
              {p.name} <span className="support-category">{p.bank}</span>
            </span>
            <strong className="tabular-nums">연 {rate(p.rate)}</strong>
            {/* 우대·가입 방법·공시 최고 한도(월 한도인지 총액인지는 상품마다 달라 공시 이름 그대로) */}
            <span className="plan-row-meta">
              {[
                p.max_rate != null && p.max_rate > p.rate && `우대 최고 ${rate(p.max_rate)}`,
                p.join_way?.replaceAll(',', '·'),
                p.limit_krw != null && `공시 최고 한도 ${formatWon(p.limit_krw)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
      <p className="plan-extra-source">
        출처:{' '}
        <a href={savings.source_url} target="_blank" rel="noopener noreferrer">
          {savings.source}
          <span className="sr-only"> (새 창)</span>
        </a>{' '}
        · 가입을 권하는 게 아니에요
      </p>
    </section>
  );
}

function CourseItem({ course, jobNcs }: { course: Course; jobNcs: string | null }) {
  return (
    <li className="plan-row is-course">
      <span className="support-open">{md(course.start)} 시작</span>
      <span className="plan-row-title">
        {course.url ? (
          <a href={course.url} target="_blank" rel="noopener noreferrer" className="support-link">
            {course.title}
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only"> (새 창)</span>
          </a>
        ) : (
          <span className="plan-item-title">{course.title}</span>
        )}{' '}
        {jobNcs && course.ncs?.startsWith(jobNcs) && (
          <span className="support-category">직무 관련</span>
        )}{' '}
        {course.weekend && <span className="support-category">주말반</span>}{' '}
        {course.fee_krw === 0 && <span className="support-category">무료</span>}
      </span>
      {/* 컨소시엄은 '무료'만 보이면 누구나 들을 수 있다고 오해한다 → 대상(중소기업 재직자)도 함께.
          강의는 장소가 중요해 좁은 화면에서도 기관을 보인다 */}
      <span className="plan-row-meta">
        {[course.kind_label, course.institute].filter(Boolean).join(' · ')}
      </span>
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
  return (
    <section className="plan-section">
      <h3 className="plan-section-title">
        일하면서 배우기 <span className="support-category">참고</span>
      </h3>
      <p className="plan-section-desc">
        {training.scope === 'sido' ? `${where} 인근(시도, 시군구엔 과정이 없어요)` : where} 재직자
        강의 · 3개월 안에 시작 · {matched ? '직무 관련과 주말반 먼저' : '주말반 먼저'}
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
      <p className="plan-extra-source">
        출처: {training.source} · 수강 자격·장소는 과정 페이지에서 확인해 주세요
      </p>
    </section>
  );
}

/** 연봉 비공개 공고: 이 경우(이사·통근)에 같은 돈이 남으려면 받아야 할 최소 연봉 */
type MinSalary = { salary: number; monthly: number | null; basis: string };
type Case = 'commute' | 'move';
type Scenario = CalculationResult['postings'][number]['scenarios'][number];

const CASE_LABEL: Record<Case, string> = { commute: '지금 집에서 통근', move: '회사 근처로 이사' };
const won = (v: number) => formatWon(Math.round(v / 10_000) * 10_000);

/** 공고의 플랜들: 이사 플랜(postings)과 통근 플랜(alternates). 예전 백엔드면 하나뿐 */
function plansOf(plan: SettlePlan, posting: PostingPlan): Partial<Record<Case, PostingPlan>> {
  if (!posting.moving) return { commute: posting };
  const alt = plan.alternates?.find((a) => a.posting_id === posting.posting_id);
  return alt ? { commute: alt, move: posting } : { move: posting };
}

function scenarioOf(result: CalculationResult, id: string, c: Case): Scenario | undefined {
  const s = result.postings.find((p) => p.posting_id === id)?.scenarios.find((x) => x.case === c);
  return s?.applicable ? s : undefined;
}

function minSalaryOf(result: CalculationResult, id: string, c: Case): MinSalary | null {
  const be = result.break_even?.find((b) => b.posting_id === id);
  const x = be?.cases.find((k) => k.case === c);
  return be && x?.annual_salary_krw != null
    ? {
        salary: x.annual_salary_krw,
        monthly: x.monthly_remaining ?? null,
        basis: be.baseline.label,
      }
    : null;
}

/** 처음 보여 줄 경우: 매달 더 많이 남는 쪽, 연봉 비공개면 최소 연봉이 낮은 쪽 (같거나 모르면 통근) */
function defaultCase(result: CalculationResult, plans: Partial<Record<Case, PostingPlan>>): Case {
  if (!plans.commute) return 'move';
  if (!plans.move) return 'commute';
  const id = plans.move.posting_id;
  const [m, c] = (['move', 'commute'] as const).map(
    (k) => scenarioOf(result, id, k)?.monthly_remaining,
  );
  if (m != null && c != null) return m > c ? 'move' : 'commute';
  const [sm, sc] = (['move', 'commute'] as const).map((k) => minSalaryOf(result, id, k)?.salary);
  return sm != null && sc != null && sm < sc ? 'move' : 'commute';
}

/** 정책·할 일 목록 (정책은 한 줄, 할 일은 카드) */
function Rows({ items }: { items: PlanItem[] }) {
  return (
    <ul className="plan-items">
      {items.map((item) => (
        <Item key={`${item.kind}-${item.policy_id ?? item.title}`} item={item} />
      ))}
    </ul>
  );
}

function PostingPanel({
  plans,
  result,
  savings,
  training,
  supportFailed,
  onEditLiving,
}: {
  plans: Partial<Record<Case, PostingPlan>>;
  result: CalculationResult;
  savings: SavingsList | null;
  training: TrainingList | undefined;
  /** 청년 지원을 못 불러와 지원 일정이 빠졌는지 */
  supportFailed: boolean;
  onEditLiving: () => void;
}) {
  const cases = (['commute', 'move'] as const).filter((c) => plans[c]);
  const [chosen, setChosen] = useState<Case>(() => defaultCase(result, plans));
  const posting = plans[chosen]!;
  const id = posting.posting_id;
  const scenario = scenarioOf(result, id, chosen);
  const remaining = scenario?.monthly_remaining ?? null;
  const minSalary = remaining == null ? minSalaryOf(result, id, chosen) : null;
  const moving = chosen === 'move';
  const itemsOf = (kind: PlanSlot['kind']) =>
    posting.slots.filter((s) => s.kind === kind).flatMap((s) => s.items);
  const deadlines = itemsOf('month');
  const before = itemsOf('before');
  const moveMonth = itemsOf('move_month');
  const start = itemsOf('start');
  const anytime = itemsOf('anytime');
  const deposit = before.find((i) => i.kind === 'deposit');
  const showSavings =
    savings?.status === 'ok' &&
    savings.products.length > 0 &&
    !(remaining != null && remaining < 0);
  const showTraining = training?.status === 'ok' && training.courses.length > 0;
  // 남는 돈 칸 설명: 무엇을 빼고 남는지 (통근은 교통비, 이사는 주거비·교통비).
  // 비워 둔 교통비는 '0원'을 강조하지 않고 비워 둬서 0원으로 계산했다고 알린다
  const costs = scenario
    ? [
        moving && scenario.housing.value != null ? `주거비 ${won(scenario.housing.value)}` : '',
        (scenario.assumed_zero ?? []).includes('교통비')
          ? '교통비는 비워 둬서 0원으로 계산했어요 · 더 들 수 있어요'
          : scenario.transport.value != null
            ? `${moving ? '' : '출퇴근 '}교통비 ${won(scenario.transport.value)} 빼고`
            : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const amountOf = (c: Case) => {
    const r = scenarioOf(result, id, c)?.monthly_remaining;
    const m = minSalaryOf(result, id, c)?.salary;
    return r != null ? `약 ${won(r)}` : m != null ? `최소 ${formatWon(m)}` : '';
  };
  const steps = [
    { label: '집 구하기 전', items: before },
    { label: '이사하고 14일 안', items: moveMonth.filter((i) => i.kind === 'move_in') },
    { label: '전입한 뒤', items: moveMonth.filter((i) => i.kind === 'policy') },
  ].filter((s) => s.items.length);
  return (
    <div className="space-y-4">
      {/* 통근·이사 바꿔 보기 (둘 다 될 때). 4단계의 '비교할 경우'와 같은 모양 */}
      {cases.length > 1 && (
        <div role="group" aria-label="볼 경우" className="source-tabs mode-switch">
          {cases.map((c) => (
            <button key={c} type="button" aria-pressed={c === chosen} onClick={() => setChosen(c)}>
              {CASE_LABEL[c]}
              {/* 폰에서는 금액을 아랫줄로 (중간에서 끊기지 않게) */}
              {amountOf(c) && (
                <>
                  <span className="hidden sm:inline"> · </span>
                  <span className="block sm:inline">{amountOf(c)}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      <p className="plan-chips">
        {posting.region && <span className="support-category">{posting.region}</span>}
        {cases.length === 1 && (
          <span className="support-category">{CASE_LABEL[chosen]}하는 경우</span>
        )}
      </p>
      {/* 결론: 같은 세 칸이 경우마다 숫자만 바뀐다 (처음 드는 돈, 매달 남는 돈, 마감) */}
      <div className="plan-conclusion">
        {!moving ? (
          <div>
            <span>처음 준비할 돈</span>
            <strong>없음</strong>
            <small>이사하지 않아요</small>
          </div>
        ) : (
          deposit?.amount_krw != null && (
            <div>
              <span>처음 준비할 돈</span>
              <strong>{formatWon(deposit.amount_krw)}</strong>
              <small>원룸 보증금 시세 (추정)</small>
            </div>
          )
        )}
        {remaining != null ? (
          <div>
            <span>{moving ? '이사하면' : '통근하면'} 매달 남는 돈</span>
            <strong className={remaining >= 0 ? 'is-good' : 'is-bad'}>약 {won(remaining)}</strong>
            {remaining < 0 ? (
              <small>
                매달 모자라요 ·{' '}
                <button type="button" className="inline-link" onClick={onEditLiving}>
                  생활비 다시 보기
                </button>
              </small>
            ) : (
              costs && <small>{costs}</small>
            )}
          </div>
        ) : minSalary ? (
          <div>
            <span>연봉 비공개 · 받아야 할 최소 연봉 (추정)</span>
            <strong>최소 {formatWon(minSalary.salary)}</strong>
            <small>
              {minSalary.monthly != null &&
                `이 이상이면 매달 약 ${won(minSalary.monthly)} 남아요 · `}
              기준: {minSalary.basis}
            </small>
          </div>
        ) : (
          <div>
            <span>{moving ? '이사하면' : '통근하면'} 매달 남는 돈</span>
            <strong>아직 계산 전</strong>
            <small>
              생활비 빈칸을 채우면 계산돼요 ·{' '}
              <button type="button" className="inline-link" onClick={onEditLiving}>
                내 생활비로 가기
              </button>
            </small>
          </div>
        )}
        <div>
          <span>마감이 있는 지원</span>
          <strong>
            {supportFailed ? '모름' : deadlines.length ? `${deadlines.length}건` : '없음'}
          </strong>
          <small>
            {supportFailed
              ? '청년 지원을 불러오지 못했어요'
              : (deadlines[0]?.when ?? '지원은 모두 상시 신청이에요')}
          </small>
        </div>
      </div>
      {/* 급한 것부터: 날짜 있는 지원 → (이사) 순서 → 입사하면 → 언제든. 입사일을 몰라 순서와 날짜를 나눈다 */}
      {deadlines.length > 0 && (
        <section className="plan-section">
          <h3 className="plan-section-title">마감이 있는 지원</h3>
          <p className="plan-section-desc">날짜순{moving && ' · 지역 지원은 전입한 주소를 봐요'}</p>
          <Rows items={deadlines} />
        </section>
      )}
      {moving && steps.length > 0 && (
        <section className="plan-section">
          <h3 className="plan-section-title">이사 순서</h3>
          <p className="plan-section-desc">날짜와 상관없이 이 순서로</p>
          <ol className="plan-steps">
            {steps.map((s, i) => (
              <li key={s.label}>
                <h4 className="plan-slot-label">
                  {i + 1}. {s.label}
                </h4>
                <Rows items={s.items} />
              </li>
            ))}
          </ol>
        </section>
      )}
      {start.length > 0 && (
        <section className="plan-section">
          <h3 className="plan-section-title">입사하면 챙겨 볼 것</h3>
          <p className="plan-section-desc">
            첫 취업이면 누구나 · 어느 회사든 같아요 · 자격은 신청 페이지에서 확인해 주세요
          </p>
          {/* 모두 전국이라 칩은 빼고 */}
          <Rows items={start.map((item) => ({ ...item, scope: null }))} />
        </section>
      )}
      {anytime.length > 0 && (
        <details className="plan-fold plan-section">
          <summary>언제든 신청할 수 있는 지원 {anytime.length}개</summary>
          <Rows items={anytime} />
        </details>
      )}
      {posting.notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
      {/* 참고: 할 일이 아니라 순서 밖 섹션으로. 경우·남는 돈이 바뀌면 고른 금액도 새로 */}
      {showSavings && (
        <SavingsSlot
          key={`${chosen}-${remaining ?? minSalary?.monthly}`}
          savings={savings}
          remaining={remaining ?? minSalary?.monthly ?? null}
          basis={
            remaining == null && minSalary
              ? `최소 연봉 ${formatWon(minSalary.salary)}을 받는다면`
              : moving
                ? '이사하면'
                : '통근하면'
          }
        />
      )}
      {showTraining && <TrainingSlot training={training} jobNcs={posting.ncs ?? null} />}
    </div>
  );
}

/** 남는 돈 단계 맨 아래: 다음 단계(정착 플랜) 미리보기, 공고마다 한 줄 (처음 보여 줄 경우 기준, 최대 3개) */
export function PlanPreview({ plan, result }: { plan: SettlePlan; result: CalculationResult }) {
  // 적금·강의를 미리 불러 둔다: 정착 플랜 단계에 들어가면 서버에 담아 둔 결과가 바로 온다
  usePlanExtras(extrasKeys(plan.postings));
  const lines = plan.postings.slice(0, 3).map((p) => {
    const plans = plansOf(plan, p);
    const c = defaultCase(result, plans);
    const items = plans[c]!.slots.flatMap((s) => s.items);
    const deposit = items.find((i) => i.kind === 'deposit')?.amount_krw;
    const line = [
      p.company || p.posting_id,
      c === 'move' ? '이사' : '통근',
      result.break_even?.some((b) => b.posting_id === p.posting_id) ? '연봉 비공개' : '',
      deposit != null ? `보증금 ${formatWon(deposit)}` : '',
      `지원 ${items.filter((i) => i.kind === 'policy').length}개`,
    ]
      .filter(Boolean)
      .join(' · ');
    return { id: p.posting_id, line };
  });
  return (
    <div className="plan-preview">
      <p className="font-semibold text-foreground">다음: 1년 정착 플랜</p>
      {lines.map(({ id, line }) => (
        <p key={id}>{line}</p>
      ))}
      {plan.postings.length > 3 && <p>외 {plan.postings.length - 3}개</p>}
    </div>
  );
}

/** 플랜에 나오는 강의 열쇠들 (겹치지 않게, 순서 고정) */
function extrasKeys(postings: PostingPlan[]): string[] {
  return [...new Set(postings.map(trainingKey).filter((k): k is string => !!k))].sort();
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

export function PlanView({
  plan,
  result,
  onEditLiving,
}: {
  plan: SettlePlan;
  result: CalculationResult;
  onEditLiving: () => void;
}) {
  const postings = plan.postings;
  const { savings, training } = usePlanExtras(extrasKeys(postings));
  if (!postings.length) return null;
  const supportFailed = plan.notes.some((n) => n.includes('불러오지 못해'));
  // 처음 여는 탭: 처음 보여 줄 경우에 매달 더 많이 남는 회사 (같으면 첫 공고)
  const best = (p: PostingPlan) =>
    scenarioOf(result, p.posting_id, defaultCase(result, plansOf(plan, p)))?.monthly_remaining ??
    -Infinity;
  const first = postings.reduce((a, b) => (best(b) > best(a) ? b : a));
  const panel = (posting: PostingPlan) => (
    <PostingPanel
      plans={plansOf(plan, posting)}
      result={result}
      savings={savings}
      training={training[trainingKey(posting) ?? '']}
      supportFailed={supportFailed}
      onEditLiving={onEditLiving}
    />
  );
  return (
    <section className="space-y-4" aria-label="1년 정착 플랜">
      {postings.length === 1 ? (
        panel(postings[0])
      ) : (
        <Tabs defaultValue={first.posting_id} className="min-w-0">
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
