'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { formatWon, placeName, statusBadge, type Row } from './format';
import { livesInCompanyHousing } from './profile';
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

/** 근무지 지역 지원에만 '지역' 칩 (대부분 전국이라 '전국' 칩은 달지 않는다) */
function LocalChip({ item }: { item: PlanItem }) {
  return item.scope && item.scope !== 'national' ? (
    <span className="support-category">지역</span>
  ) : null;
}

function Item({ item }: { item: PlanItem }) {
  // 지원 정책은 한 줄 (설명·조건은 아래 '근무지별 청년 지원'에), 할 일(보증금·전입신고)만 카드.
  // 원문 요약(detail)은 잘린 원문이라 어색해서 줄에 넣지 않는다
  if (item.kind === 'policy') {
    return (
      <li className="plan-row">
        {/* 날짜가 있으면 줄 앞에 (날짜순 목록을 세로로 훑을 수 있게). 상시는 대부분이라 쓰지 않는다 */}
        {item.when && item.when !== '상시' && <span className="support-open">{item.when}</span>}
        {/* 제목과 칩을 한 덩어리로: 좁은 화면에서 칩만 홀로 다음 줄로 떨어지지 않게 */}
        <span>
          <ItemTitle item={item} /> <LocalChip item={item} />
        </span>
      </li>
    );
  }
  return (
    <li className="plan-item">
      <p className="plan-item-head">
        <ItemTitle item={item} />
        <LocalChip item={item} />
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

/**
 * 구역 머리: 제목 왼쪽 + 회색 칩(최대 2개) 오른쪽, 아래에 읽어야 하는 설명 한두 문장 (17px 본문색).
 * 사실을 ' · '로 이어 붙이지 않는다 — 문장은 문장으로, 짧은 사실은 칩으로 (DESIGN.md).
 */
function SectionHead({
  title,
  chips = [],
  children,
}: {
  title: string;
  chips?: (string | false | null | undefined)[];
  children?: ReactNode;
}) {
  const shown = chips.filter((c): c is string => !!c);
  return (
    <>
      <h3 className="plan-section-title">
        {title}
        {shown.length > 0 && (
          <span className="plan-section-chips">
            {shown.map((chip) => (
              <span key={chip} className="support-category">
                {chip}
              </span>
            ))}
          </span>
        )}
      </h3>
      {children && <p className="plan-section-desc">{children}</p>}
    </>
  );
}

/** 줄 끝 참고 사실들: ' · '로 잇지 않고 한 줄에 하나씩 */
function MetaLines({ lines }: { lines: (string | false | null | undefined)[] }) {
  return (
    <span className="plan-row-meta">
      {lines
        .filter((line): line is string => !!line)
        .map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
    </span>
  );
}

/** 첫 월급부터 모으기: 은행 적금 12개월 기본금리 높은 순 (금감원 공시). 가입을 권하지 않는다. */
function SavingsSlot({
  savings,
  remaining,
}: {
  savings: SavingsList;
  /** 계산에 쓸 매달 남는 돈 (연봉 비공개면 최소 연봉일 때 금액 — 위 결론 칸에 같은 기준이 있다). 모르면 null */
  remaining: number | null;
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
      <SectionHead title="남는 돈 모으기" chips={['참고', disclosed && `${disclosed} 공시`]}>
        은행 적금을 12개월 기본금리가 높은 순으로 모았어요.
      </SectionHead>
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
          {/* 금액이 어떻게 나왔는지 한 줄 (남는 돈은 위 결론 칸에, 주의는 맨 아래 출처 줄에) */}
          <p className="savings-note">
            원금 {formatWon(chosen.principal_krw)} + 세전 이자 약 {won(chosen.interest_krw)} (
            {top.bank} 연 {rate(top.rate)})
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
            <MetaLines
              lines={[
                p.max_rate != null && p.max_rate > p.rate && `우대 최고 ${rate(p.max_rate)}`,
                p.join_way?.replaceAll(',', '·'),
                p.limit_krw != null && `공시 최고 한도 ${formatWon(p.limit_krw)}`,
              ]}
            />
          </li>
        ))}
      </ul>
      <p className="plan-extra-source">
        출처:{' '}
        <a href={savings.source_url} target="_blank" rel="noopener noreferrer">
          {savings.source}
          <span className="sr-only"> (새 창)</span>
        </a>
        . 가입을 권하는 게 아니에요. 실제 금리는 은행에서 확인해 주세요.
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
      <MetaLines lines={[course.kind_label, course.institute]} />
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
      <SectionHead title="일하면서 배우기">
        {training.scope === 'sido'
          ? `${where}에는 과정이 없어 시도 전체에서 3개월 안에 시작하는 재직자 강의를 모았어요.`
          : `${where} 재직자 강의 중 3개월 안에 시작하는 것을 모았어요.`}{' '}
        {matched ? '직무 관련과 주말반을' : '주말반을'} 먼저 보여 드려요.
      </SectionHead>
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
    </section>
  );
}

/** 연봉 비공개 공고: 이 경우(이사·통근)에 같은 돈이 남으려면 받아야 할 최소 연봉 */
/** floor: 최저임금으로 올린 답 (4단계 카드처럼 '이상' 없이 '최저임금 수준') */
type MinSalary = { salary: number; monthly: number | null; floor: boolean };
type Case = 'commute' | 'move';
type Scenario = CalculationResult['postings'][number]['scenarios'][number];

const CASE_LABEL: Record<Case, string> = { commute: '지금 집에서 통근', move: '회사 근처로 이사' };
/** 만 원 단위로 반올림. 마이너스는 부호를 앞에 ('−31만원': formatWon은 음수를 받지 않는다) */
const won = (v: number) =>
  (v < 0 ? '−' : '') + formatWon(Math.round(Math.abs(v) / 10_000) * 10_000);
/** 받아야 할 최소 연봉: 4단계 카드와 같은 말 ('… 이상', 최저임금으로 올린 답은 '이상' 없이) */
const minSalaryText = (m: MinSalary) => `${formatWon(m.salary)}${m.floor ? '' : ' 이상'}`;

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
        floor: x.floor === 'minimum_wage',
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

/** 정책·할 일 목록 (정책은 한 줄, 할 일은 카드). twoColumns: 넓은 화면에서 짧은 목록을 두 칸으로 */
function Rows({ items, twoColumns = false }: { items: PlanItem[]; twoColumns?: boolean }) {
  return (
    <ul className={twoColumns ? 'plan-items is-two' : 'plan-items'}>
      {items.map((item) => (
        <Item key={`${item.kind}-${item.policy_id ?? item.title}`} item={item} />
      ))}
    </ul>
  );
}

/** 이사 단계 한 칸: 할 일(카드)과 알아볼 지원(줄)을 나눈다. 지원은 자격을 판단하지 않아 '알아볼' */
function StepItems({ items }: { items: PlanItem[] }) {
  const tasks = items.filter((item) => item.kind !== 'policy');
  const policies = items.filter((item) => item.kind === 'policy');
  return (
    <>
      {tasks.length > 0 && <Rows items={tasks} />}
      {policies.length > 0 && (
        <>
          <p className="plan-step-sub">알아볼 지원 {policies.length}개</p>
          <Rows items={policies} />
        </>
      )}
    </>
  );
}

function PostingPanel({
  plans,
  result,
  row,
  savings,
  training,
  supportFailed,
  onEditLiving,
}: {
  plans: Partial<Record<Case, PostingPlan>>;
  result: CalculationResult;
  /** 이 공고의 조건 (사택·기숙사가 있는지) */
  row: Row | undefined;
  savings: SavingsList | null;
  training: TrainingList | undefined;
  /** 청년 지원을 못 불러와 지원 일정이 빠졌는지 */
  supportFailed: boolean;
  onEditLiving: () => void;
}) {
  const cases = (['commute', 'move'] as const).filter((c) => plans[c]);
  const [picked, setPicked] = useState<Case>(() => defaultCase(result, plans));
  // 플랜이 새로 와서 고른 경우가 없어졌으면 남은 쪽으로
  const chosen = plans[picked] ? picked : cases[0];
  const posting = plans[chosen]!;
  const id = posting.posting_id;
  const scenario = scenarioOf(result, id, chosen);
  const remaining = scenario?.monthly_remaining ?? null;
  const minSalary = remaining == null ? minSalaryOf(result, id, chosen) : null;
  const salaryHidden = !!scenario?.missing.includes('세후 월급');
  const moving = chosen === 'move';
  const itemsOf = (kind: PlanSlot['kind']) =>
    posting.slots.filter((s) => s.kind === kind).flatMap((s) => s.items);
  const deadlines = itemsOf('month');
  const before = itemsOf('before');
  const moveMonth = itemsOf('move_month');
  const start = itemsOf('start');
  const anytime = itemsOf('anytime');
  // 사택·기숙사에 들어가면(이사할 집 주거비 0원) 백엔드가 보증금 할 일을 빼서 보낸다 (plan.py).
  // '처음 준비할 돈' 칸이 '모름'이 아니라 '없음'이라고 말하려면 이유를 알아야 해서 여기서도 본다
  const dorm = livesInCompanyHousing(row, scenarioOf(result, id, 'move')?.housing.value);
  const deposit = before.find((i) => i.kind === 'deposit');
  const showSavings =
    savings?.status === 'ok' &&
    savings.products.length > 0 &&
    !(remaining != null && remaining < 0);
  const showTraining = training?.status === 'ok' && training.courses.length > 0;
  // 남는 돈 칸 아래 한 줄: 뺀 돈만 짧게 (통근은 교통비, 이사는 주거비·교통비). 문장으로 늘이지 않는다
  const costs = scenario
    ? [
        moving && scenario.housing.value != null ? `주거비 ${won(scenario.housing.value)}` : '',
        (scenario.assumed_zero ?? []).includes('교통비')
          ? '교통비 0원(비워 둠)'
          : scenario.transport.value != null
            ? `교통비 ${won(scenario.transport.value)}`
            : '',
      ].filter(Boolean)
    : [];
  const amountOf = (c: Case) => {
    const r = scenarioOf(result, id, c)?.monthly_remaining;
    const m = minSalaryOf(result, id, c);
    return r != null ? `약 ${won(r)}` : m ? minSalaryText(m) : '';
  };
  const steps = [
    // 단계 이름에 '14일'을 되풀이하지 않는다 (전입신고 설명 문장에 한 번)
    { label: '집을 구하기 전에', items: before },
    { label: '이사한 다음', items: moveMonth.filter((i) => i.kind === 'move_in') },
    { label: '전입신고를 마친 다음', items: moveMonth.filter((i) => i.kind === 'policy') },
  ].filter((s) => s.items.length);
  return (
    <div className="space-y-4">
      {/* 통근·이사 바꿔 보기 (둘 다 될 때). 4단계의 '비교할 경우'와 같은 모양 */}
      {cases.length > 1 && (
        <div role="group" aria-label="볼 경우" className="source-tabs mode-switch">
          {cases.map((c) => (
            <button key={c} type="button" aria-pressed={c === chosen} onClick={() => setPicked(c)}>
              {CASE_LABEL[c]}
              {/* 금액은 보통 굵기로 띄워 붙인다 (' · '로 잇지 않는다). 폰에서는 아랫줄로 */}
              {/* 앞 공백은 화면 읽기용 (눈에는 margin으로 띄운다) */}
              {amountOf(c) && (
                <>
                  {' '}
                  <span className="block font-normal sm:ml-1 sm:inline">{amountOf(c)}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      {posting.region && (
        <p className="plan-chips">
          <span className="support-category">{posting.region}</span>
        </p>
      )}
      {/* 경우가 하나뿐이면 왜인지 알린다: 해당 없는 경우는 ③에서 사용자가 끈 것뿐이다 (calc/remaining.py) */}
      {cases.length === 1 && (
        <p className="plan-one-case">
          {chosen === 'move'
            ? "'지금 집에서 다닐 수 있어요'를 꺼서 이사하는 경우만 보여요."
            : "'이사도 생각하고 있어요'를 꺼서 지금 집에서 다니는 경우만 보여요."}{' '}
          <button type="button" className="inline-link" onClick={onEditLiving}>
            생활비에서 바꾸기
          </button>
        </p>
      )}
      {/* 결론: 같은 세 칸이 경우마다 숫자만 바뀐다 (처음 드는 돈, 매달 남는 돈, 마감) */}
      <div className="plan-conclusion">
        {!moving ? (
          <div>
            <span>처음 준비할 돈</span>
            <strong>없음</strong>
            <small>이사하지 않아요</small>
          </div>
        ) : (
          <div>
            <span>처음 준비할 돈</span>
            <strong>
              {dorm ? '없음' : deposit?.amount_krw != null ? formatWon(deposit.amount_krw) : '모름'}
            </strong>
            <small>
              {dorm
                ? '사택·기숙사에 들어가요'
                : deposit?.amount_krw != null
                  ? '원룸 보증금 시세 (추정)'
                  : '보증금 시세 없음'}
            </small>
          </div>
        )}
        {remaining != null ? (
          <div>
            <span>{moving ? '이사하면' : '통근하면'} 매달 남는 돈</span>
            <strong className={remaining >= 0 ? 'is-good' : 'is-bad'}>약 {won(remaining)}</strong>
            {remaining < 0 ? (
              <small>
                매달 모자라요.{' '}
                <button type="button" className="inline-link" onClick={onEditLiving}>
                  생활비 다시 보기
                </button>
              </small>
            ) : (
              costs.length > 0 && (
                // 줄이 바뀌면 항목 사이에서만 (항목 중간에서 끊기지 않게)
                <small>
                  {costs.map((c, i) => (
                    <Fragment key={c}>
                      {i > 0 && ' · '}
                      <span className="whitespace-nowrap">{c}</span>
                    </Fragment>
                  ))}
                </small>
              )
            )}
          </div>
        ) : minSalary ? (
          // 연봉 비공개: 4단계 '면접에서 확인할 연봉' 카드와 같은 말 ('… 이상', 그만큼 받으면 매달 얼마)
          <div>
            <span>받아야 할 최소 연봉 (추정)</span>
            {/* 이름표가 '최소 연봉'이라 숫자만 크게 ('… 이상'을 붙이면 좁은 칸에서 '이상'만 떨어진다) */}
            <strong>{formatWon(minSalary.salary)}</strong>
            <small>
              {minSalary.floor
                ? '최저임금 수준만 받아도 기준보다 많이 남아요'
                : minSalary.monthly != null
                  ? minSalary.monthly < 0
                    ? `그만큼 받아도 매달 약 ${won(-minSalary.monthly)}이 모자라요`
                    : `그만큼 받으면 매달 약 ${won(minSalary.monthly)}이 남아요`
                  : '공고에 연봉이 없어 계산했어요'}
            </small>
          </div>
        ) : salaryHidden ? (
          // 연봉 비공개인데 비교할 기준(다른 공고·목표 금액)이 없으면 생활비를 채워도 계산되지 않는다
          <div>
            <span>{moving ? '이사하면' : '통근하면'} 매달 남는 돈</span>
            <strong>계산할 수 없어요</strong>
            <small>공고에 연봉이 없고 비교할 기준도 없어요</small>
          </div>
        ) : (
          <div>
            <span>{moving ? '이사하면' : '통근하면'} 매달 남는 돈</span>
            <strong>아직 계산 전</strong>
            <small>
              생활비에 빈칸이 있어요.{' '}
              <button type="button" className="inline-link" onClick={onEditLiving}>
                채우러 가기
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
              ? '청년 지원 불러오기 실패'
              : (deadlines[0]?.when ??
                (start.length + anytime.length ? '모두 상시 신청' : '넣을 지원 없음'))}
          </small>
        </div>
      </div>
      {/* 급한 것부터: 날짜 있는 지원 → (이사) 순서 → 입사하면 → 언제든. 입사일을 몰라 순서와 날짜를 나눈다 */}
      {deadlines.length > 0 && (
        <section className="plan-section">
          {/* 날짜가 줄 앞에 있어 '날짜순'은 따로 쓰지 않는다 */}
          <SectionHead title="마감이 있는 지원">
            {moving && '지역 지원은 전입한 주소를 기준으로 봐요.'}
          </SectionHead>
          <Rows items={deadlines} />
        </section>
      )}
      {moving && steps.length > 0 && (
        <section className="plan-section">
          {/* 할 일이 한 칸뿐이면(사택·기숙사 등) 순서(번호·세로 선) 없이 '이사하면 할 일' 한 칸으로 */}
          {steps.length === 1 ? (
            <SectionHead title="이사하면 할 일">
              {dorm &&
                '사택·기숙사에 들어가는 것으로 보고 보증금과 집 구하기 지원은 뺐어요. 주소를 옮기는 일은 같아요.'}
            </SectionHead>
          ) : (
            <SectionHead title="이사 순서">
              입사일이 정해지지 않아도 이 순서대로 하면 돼요.
            </SectionHead>
          )}
          {steps.length === 1 ? (
            <StepItems items={steps[0].items} />
          ) : (
            // 번호 + 세로 선은 순서가 있는 이곳에만 (날짜 목록은 날짜를 앞에, 번호 없음)
            <ol className="plan-steps">
              {steps.map((s, i) => (
                <li key={s.label}>
                  <span aria-hidden className="plan-step-number">
                    {i + 1}
                  </span>
                  <h4 className="plan-slot-label">{s.label}</h4>
                  <StepItems items={s.items} />
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      {start.length > 0 && (
        <section className="plan-section">
          <SectionHead title="입사하면 챙겨 볼 것">
            첫 취업 때 많이 챙기는 전국 지원이에요.
          </SectionHead>
          <Rows items={start} twoColumns />
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
    // 회사 이름 + 사실 칩 (' · '로 잇지 않는다)
    const facts = [
      c === 'move' ? '이사' : '통근',
      result.break_even?.some((b) => b.posting_id === p.posting_id) ? '연봉 비공개' : '',
      deposit != null ? `보증금 ${formatWon(deposit)}` : '',
      `지원 ${items.filter((i) => i.kind === 'policy').length}개`,
    ].filter(Boolean);
    return { id: p.posting_id, name: p.company || p.posting_id, facts };
  });
  return (
    <div className="plan-preview">
      <p className="font-semibold text-foreground">다음: 1년 정착 플랜</p>
      {lines.map(({ id, name, facts }) => (
        <p key={id} className="plan-preview-line">
          <span className="text-foreground">{name}</span>
          {facts.map((fact) => (
            <span key={fact} className="support-category">
              {fact}
            </span>
          ))}
        </p>
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
  rows,
  supportFailed,
  onEditLiving,
}: {
  plan: SettlePlan;
  result: CalculationResult;
  /** 조건 확인 표 (사택·기숙사 여부를 본다) */
  rows: Row[];
  /** 청년 지원을 못 불러왔는지 (세션의 local_support가 없음) */
  supportFailed: boolean;
  onEditLiving: () => void;
}) {
  const postings = plan.postings;
  const { savings, training } = usePlanExtras(extrasKeys(postings));
  if (!postings.length) return null;
  // 처음 여는 탭: 처음 보여 줄 경우에 매달 더 많이 남는 회사 (같으면 첫 공고)
  const best = (p: PostingPlan) =>
    scenarioOf(result, p.posting_id, defaultCase(result, plansOf(plan, p)))?.monthly_remaining ??
    -Infinity;
  const first = postings.reduce((a, b) => (best(b) > best(a) ? b : a));
  const panel = (posting: PostingPlan) => (
    <PostingPanel
      plans={plansOf(plan, posting)}
      result={result}
      row={rows.find((r) => r.id === posting.posting_id)}
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
          <TabsList aria-label="볼 회사" className="posting-tabs">
            {postings.map((posting, i) => (
              <TabsTrigger key={posting.posting_id} value={posting.posting_id}>
                <span className="posting-tab-name">{posting.company || `공고 ${i + 1}`}</span>
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
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}
