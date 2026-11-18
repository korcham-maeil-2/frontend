'use client';

import { useState, type CSSProperties } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { components } from '@/lib/api/schema';
import '../../landing.css'; // 비교표 모양(.offer-table, .compare-table)을 랜딩과 같이 쓴다
import {
  IMAGE_READ_BADGE,
  badgeFor,
  formatWon,
  hasSalary,
  placeName,
  salaryText,
  statusBadge,
  type Badge,
  type Row,
  type Status,
} from './format';
import { FEW_TRADES, rentFailed } from './profile';
import { BadgeLegend, SourceBadge, type Detail } from './source-badge';

// 결과 화면: 공고별 '매달 남는 돈'을 한 표로 비교한다 (DESIGN.md "비교표").
//   열 = 공고, 행 = 연봉 → 세후 월급 → 집 → 교통비 → 고정비 → 매달 남는 돈
//   '더 남는 쪽 / 지금 집에서 통근 / 회사 근처로 이사'를 바꿔 볼 수 있고,
//   공고마다 '계산 내역'을 펼치면 공제 항목과 각 값의 출처를 볼 수 있다.
// 숫자는 모두 백엔드가 계산한 값을 그대로 보여 준다 (화면에서 다시 계산하지 않는다).

type Result = components['schemas']['CalculationResult'];
type PostingResult = components['schemas']['PostingResult'];
type Scenario = components['schemas']['Scenario'];
type BreakEven = components['schemas']['BreakEven'];
type BreakEvenCase = components['schemas']['BreakEvenCase'];
type Item = components['schemas']['Item'];
type RentEstimate = components['schemas']['RentEstimate'];
type Case = Scenario['case'];
type Mode = 'best' | Case;

const MODES: { value: Mode; label: string }[] = [
  { value: 'best', label: '더 남는 쪽' },
  { value: 'commute', label: '지금 집에서 통근' },
  { value: 'move', label: '회사 근처로 이사' },
];

/** 숫자 옆 배지와, 배지를 누르면 보일 줄들 (계산·출처·참고) */
type Tag = { badge: Badge; details: Detail[] };

/**
 * 표 한 칸에 보여 줄 것.
 * note: 칸 아래 짧은 안내 (값의 뜻을 바꾸는 것만: '공고엔 비공개', '더 들 수 있어요').
 *       긴 출처 글은 note가 아니라 tag.details로 — 배지를 눌러야 보여서 표가 길어지지 않는다.
 * tag: 숫자인 칸에만 단다 ('해당 없음'·'모름'·'계산 못 함'에는 없음).
 * tone: 'target' = 계산한 최소 연봉(초록), 'muted' = 해당 없음·계산 못 함(숫자가 아님),
 *       'negative' = 남는 돈이 마이너스 (초록은 남는 돈에만 쓰므로 빼고 그린다 — DESIGN.md)
 */
type Shown = {
  value: string;
  note?: string;
  sub?: string; // note 아래 한 줄 더 (연봉 외 수당처럼 값의 뜻을 바꾸는 사실)
  tag?: Tag;
  tone?: 'target' | 'muted' | 'negative';
};

/** 서버가 준 값(비용 등) → 배지 + '출처' 한 줄. '공고에 없음'은 숫자가 없는 칸이라 배지를 달지 않는다. */
function tag(status: Status, source?: string | null): Tag | undefined {
  if (status === 'missing') return undefined;
  // 출처가 없는 직접 입력도 눌러서 열리게 ('배지를 누르면 출처가 보여요'가 모든 배지에 맞게)
  const text = source ?? (status === 'user_input' ? '직접 넣은 값' : null);
  return { badge: statusBadge[status], details: text ? [{ label: '출처', text }] : [] };
}

/**
 * 이 서비스가 계산한 값(세후 월급·매달 남는 돈·최소 연봉) → 늘 '추정'.
 * 세후 월급이 간이세액표로 낸 예상값이라, 그 값으로 계산한 것도 실제와 조금 다를 수 있다.
 * (백엔드 신뢰도를 그대로 쓰면 '매달 남는 돈'에 '입력'이 붙어 직접 넣은 값처럼 보인다)
 * 창에는 어떻게 계산했는지(how)와 왜 추정인지(why)를 줄로 나눠 보여 준다 — 무엇을 고치면
 * 더 정확해지는지 알 수 있게.
 */
function calculated(meaning: string, how: Detail[], why: string[]): Tag {
  return {
    badge: { ...statusBadge.estimated, meaning },
    details: [...how, { label: '이유', text: why }],
  };
}

/** 매달 남는 돈·최소 연봉이 추정인 이유: 추정이 들어간 비용 + 세후 월급 */
function remainingWhy(
  costs: { housing: Item; transport: Item; fixed: Item },
  blankTransport: boolean,
) {
  const why: string[] = [];
  if (costs.housing.status === 'estimated') why.push('주거비가 추정값이에요');
  if (blankTransport) why.push('교통비를 비워 둬서 0원으로 계산했어요');
  else if (costs.transport.status === 'estimated') why.push('교통비가 추정값이에요');
  if (costs.fixed.status === 'estimated') why.push('고정비가 추정값이에요');
  return [...why, '세후 월급이 예상값이에요'];
}

const NET_MEANING = '국세청 간이세액표로 계산한 예상값';
const NET_WHY = ['실제 급여명세서와 조금 다를 수 있어요'];
const REMAINING_MEANING = '세후 월급에서 비용을 뺀 예상값';
const REMAINING_HOW: Detail = { label: '계산', text: '세후 월급 − 주거비 − 교통비 − 고정비' };

/** 공고 한 열 */
type Column = {
  posting: PostingResult;
  row: Row | undefined;
  scenario: Scenario | undefined; // 고른 경우 (해당 없으면 undefined)
  breakEven: BreakEvenCase | undefined; // 연봉 비공개 공고의 손익분기 연봉 (고른 경우)
  solved: boolean; // 손익분기 연봉을 구했는지 (AI가 계산해 채운 열 → 연한 배경)
  // 이 열에 쓴 주거비·교통비. 손익분기 연봉이면 그 답에 쓴 값(주거지원비가 끝난 뒤 기준)
  housing: Item | undefined;
  transport: Item | undefined;
  cells: Record<RowKey, Shown>;
};

type RowKey = 'salary' | 'net' | 'housing' | 'transport' | 'fixed' | 'remaining';
const ROWS: { key: RowKey; label: string }[] = [
  { key: 'salary', label: '연봉' },
  { key: 'net', label: '세후 월급' },
  { key: 'housing', label: '주거비' },
  { key: 'transport', label: '교통비' },
  { key: 'fixed', label: '고정비' },
  { key: 'remaining', label: '매달 남는 돈' },
];

/**
 * 서버가 보낸 결과가 이 화면이 아는 모양인지. 백엔드가 아직 예전 버전이거나(배포 순서),
 * 예전에 저장한 초안이면 모양이 달라서 그대로 그리면 화면이 깨진다 → 결과 없음으로 다룬다.
 */
export function isCalculationResult(value: unknown): value is Result {
  const r = value as Partial<Result> | null | undefined;
  return Array.isArray(r?.postings) && Array.isArray(r?.break_even) && Array.isArray(r?.errors);
}

/** 계산한 금액: 만 원 단위로 떨어지면 그대로, 아니면 '약 287만원'처럼 만 원 단위로 반올림한다. */
function won(value: number): string {
  const abs = Math.abs(value);
  const rounded = Math.round(abs / 10_000) * 10_000;
  if (rounded === 0) return abs === 0 ? '0원' : '약 0원';
  const minus = value < 0 ? '−' : '';
  // '약'은 부호 앞에: '약 −31만원'
  return abs === rounded ? `${minus}${formatWon(abs)}` : `약 ${minus}${formatWon(rounded)}`;
}

/** 정확한 금액: −137,880 → '−13만 7,880원'. 사용자가 넣은 값, 계산 내역처럼 한 원까지 볼 곳에 쓴다. */
function exact(value: number): string {
  return value < 0 ? `−${formatWon(-value)}` : formatWon(value);
}

const NOT_APPLICABLE: Shown = { value: '해당 없음', tone: 'muted' };
const UNKNOWN: Shown = { value: '모름', tone: 'muted' };

/**
 * 연봉·월급과 따로 매달 받는 돈(별도 식대·수당) 안내. 세후 월급에 이미 들어 있어서, 연봉만 보고
 * 비교하면 '연봉은 더 적은데 세후 월급은 더 많다'가 이상해 보인다 → 연봉 칸 아래에 짧게 알리고
 * 배지 창에 내역을 보인다. 금액·내역은 백엔드가 계산한 그대로 (식대가 연봉에 포함인지 다시 판단하지 않는다).
 * 예전 백엔드·저장된 초안에는 pay_on_top이 없다 (배포 순서).
 */
function payOnTop(posting: PostingResult): { sub?: string; detail?: Detail } {
  const item = posting.pay_on_top;
  if (!item?.value) return {};
  // label은 백엔드가 계산에 쓴 급여 칸으로 정한 '연봉 외' / '월급 외'
  return {
    sub: `${item.label} 매달 ${formatWon(item.value)} 따로`,
    detail: { label: '따로', text: `${item.source} (세후 월급에 넣어 계산)` },
  };
}

/** 표의 '연봉' 줄: 연봉은 금액만, 월급 공고는 '월급 250만원'처럼 종류를 붙인다.
 *  금액이 있으면 공고 원문과 함께 배지를 단다 (조건 확인 화면과 같은 배지). */
function salaryCell(row: Row | undefined, posting: PostingResult): Shown {
  if (!row) return { value: '—' };
  const value = salaryText(row).replace(/^연봉 /, '');
  const cell =
    row.salary_type?.value === 'monthly' ? row.monthly_salary_krw : row.annual_salary_krw;
  if (!cell || cell.value == null) return { value };
  // 세후 월급을 못 구했으면 '세후 월급에 넣어 계산'이 사실이 아니라 보이지 않는다
  const extra = posting.net_income.value != null ? payOnTop(posting) : {};
  const details: Detail[] = [
    ...(cell.source_text
      ? [{ label: cell.from_image ? '이미지' : '공고', text: `“${cell.source_text}”` }]
      : []),
    ...(extra.detail ? [extra.detail] : []),
  ];
  return { value, sub: extra.sub, tag: { badge: badgeFor(cell), details } };
}

/**
 * 이사 주거비에서 주거지원비를 뺐다는 짧은 안내 (지원이 끝나면 주거비가 오른다는 걸 숨기지 않게).
 * 백엔드 출처 문장이 아니라 공고 값으로 판단한다 — 규칙은 백엔드 calc/remaining.py housing_aid와 같다
 * (금액이 있고 기간이 0개월이 아니면 지원).
 */
function aidNote(row: Row | undefined): string | undefined {
  const aid = row?.housing_allowance_monthly_krw?.value;
  const months = row?.housing_allowance_months?.value;
  if (!aid || months === 0) return undefined;
  return months ? `주거지원비 뺌 · ${months}개월간` : '주거지원비 뺌 · 기간 모름';
}

/** 세후 월급을 못 구한 이유. 연봉을 넣었는데 거절된 경우(단위 실수 등) 서버가 이유를 준다. */
function netMissingNote(posting: PostingResult, row: Row | undefined): string | undefined {
  return row && hasSalary(row) ? (posting.net_income.source ?? undefined) : undefined;
}

/**
 * 이 공고에서 보여 줄 경우. '더 남는 쪽'이면
 *   - 연봉 비공개 공고: 더 적게 받아도 되는 경우 (같으면 더 많이 남는 쪽)
 *   - 연봉 공개 공고: 더 많이 남는 경우
 */
function pickCase(posting: PostingResult, breakEven: BreakEven | undefined, mode: Mode): Case {
  if (mode !== 'best') return mode;
  const found = breakEven?.cases.filter((c) => c.annual_salary_krw != null) ?? [];
  if (found.length) {
    return found.reduce((a, b) => {
      if (b.annual_salary_krw! !== a.annual_salary_krw!) {
        return b.annual_salary_krw! < a.annual_salary_krw! ? b : a;
      }
      return (b.monthly_remaining ?? 0) > (a.monthly_remaining ?? 0) ? b : a;
    }).case;
  }
  const usable = posting.scenarios.filter((s) => s.applicable);
  const known = usable.filter((s) => s.monthly_remaining != null);
  const best = known.length
    ? known.reduce((a, b) => (b.monthly_remaining! > a.monthly_remaining! ? b : a))
    : usable[0];
  return best?.case ?? 'commute';
}

/** 단계 표시에 쓸 결과 한 줄: 매달 가장 많이 남는 공고 (연봉 공개 공고, 고른 경우 중 큰 쪽) */
export function bestRemainingText(result: Result): string {
  const candidates = result.postings.flatMap((posting, i) =>
    posting.scenarios
      .filter((s) => s.applicable && s.monthly_remaining != null)
      .map((s) => ({
        company: posting.company || `공고 ${i + 1}`,
        value: s.monthly_remaining!,
        when: s.case === 'move' ? '이사 시' : '통근 시',
      })),
  );
  if (!candidates.length) return `공고 ${result.postings.length}개 계산`;
  const best = candidates.reduce((a, b) => (b.value > a.value ? b : a));
  // 단계 표시에서 좁으면 뒤가 잘린다: 숫자를 앞에 (회사 이름이 잘리게)
  return `${best.when} 매달 ${won(best.value)} · ${best.company}`;
}

function remainingCell(value: number, extra: Omit<Shown, 'value'> = {}): Shown {
  return { value: won(value), tone: value < 0 ? 'negative' : undefined, ...extra };
}

function buildColumn(
  posting: PostingResult,
  row: Row | undefined,
  breakEven: BreakEven | undefined,
  mode: Mode,
): Column {
  const chosen = pickCase(posting, breakEven, mode);
  const scenario = posting.scenarios.find((s) => s.case === chosen && s.applicable);
  const be = breakEven?.cases.find((c) => c.case === chosen);
  // 세후 월급은 간이세액표로 계산한 예상값이라 실제 급여명세서와 조금 다를 수 있다 → 늘 '추정'
  const knownNet: Shown =
    posting.net_income.value != null
      ? {
          value: won(posting.net_income.value),
          tag: calculated(
            NET_MEANING,
            posting.net_income.source ? [{ label: '계산', text: posting.net_income.source }] : [],
            NET_WHY,
          ),
        }
      : NOT_APPLICABLE;
  if (!scenario) {
    // 이 경우는 해당 없음 (예: 서울 → 나주 통근). 공고 자체 값(연봉·세후 월급)은 그대로 보여 준다.
    return {
      posting,
      row,
      scenario,
      breakEven: undefined,
      solved: false,
      housing: undefined,
      transport: undefined,
      cells: {
        salary: salaryCell(row, posting),
        net: knownNet,
        housing: NOT_APPLICABLE,
        transport: NOT_APPLICABLE,
        fixed: NOT_APPLICABLE,
        remaining: NOT_APPLICABLE,
      },
    };
  }

  // 손익분기 연봉을 구했으면 그 답에 쓴 주거비·교통비를 그대로 쓴다 (한 열 안에서 기준이 섞이지 않게)
  const solved = be?.annual_salary_krw != null && be.monthly_remaining != null;
  const housing = (solved && be?.housing) || scenario.housing;
  const transport = (solved && be?.transport) || scenario.transport;
  const fixed = posting.fixed_expenses;
  // 비용은 사용자가 넣은 금액 그대로 보여 준다 (반올림은 계산한 값 — 세후 월급·남는 돈에만)
  const cost = (item: Item, note?: string): Shown =>
    item.value == null
      ? UNKNOWN
      : { value: exact(-item.value), note, tag: tag(item.status, item.source) };

  // 교통비가 비어서 0원으로 놓고 계산했는지. 예전 백엔드·저장된 초안에는 이 필드가 없다 (배포 순서)
  const assumedTransport = (scenario.assumed_zero ?? []).includes('교통비');
  const lessIfTransport = assumedTransport ? '교통비가 들면 줄어요' : undefined;
  const why = remainingWhy({ housing, transport, fixed }, assumedTransport);
  let salary: Shown;
  let net: Shown;
  let remaining: Shown;
  if (posting.net_income.value != null) {
    salary = salaryCell(row, posting);
    net = knownNet;
    remaining =
      scenario.monthly_remaining != null
        ? remainingCell(scenario.monthly_remaining, {
            tag: calculated(REMAINING_MEANING, [REMAINING_HOW], why),
            note: lessIfTransport,
          })
        : {
            value: '계산 못 함',
            note: `필요한 값: ${scenario.missing.join(', ')}`,
            tone: 'muted',
          };
  } else if (solved && be && breakEven) {
    // 연봉 비공개: 기준만큼 남는 최소 연봉과, 그 연봉일 때의 세후 월급·남는 돈 (모두 서버가 계산한 값)
    // 최소 연봉에는 따로 받는 식대·수당이 빠져 있다 (그 돈은 연봉과 별개로 더 받는다)
    const extra = payOnTop(posting);
    salary = {
      value: `최소 ${won(be.annual_salary_krw!)}`,
      note: '공고엔 비공개',
      sub: extra.sub,
      tone: 'target',
      tag: calculated(
        '기준과 같은 금액이 매달 남는 최소 연봉',
        [
          { label: '기준', text: breakEven.baseline.label },
          ...(extra.detail ? [extra.detail] : []),
        ],
        why,
      ),
    };
    net =
      be.net_income_krw != null
        ? {
            value: won(be.net_income_krw),
            note: '그 연봉일 때',
            tag: calculated(
              NET_MEANING,
              [
                {
                  label: '계산',
                  // 백엔드가 그 연봉일 때 계산한 문장 (별도 식대·수당 포함). 예전 백엔드엔 없다.
                  text:
                    be.net_income_source ??
                    `연봉 ${won(be.annual_salary_krw!)} ÷ 12 → 4대보험·소득세를 뺀 값`,
                },
              ],
              NET_WHY,
            ),
          }
        : UNKNOWN;
    remaining = remainingCell(be.monthly_remaining!, {
      // 최저임금으로 올린 경우는 기준보다 많이 남는다
      note: be.floor === 'minimum_wage' ? '기준보다 많이' : '기준과 같은 금액',
      tag: calculated(REMAINING_MEANING, [REMAINING_HOW], why),
    });
  } else {
    salary = { ...salaryCell(row, posting), note: be?.reason ?? undefined };
    net = { ...UNKNOWN, note: netMissingNote(posting, row) };
    // 연봉 말고도 빈 값이 있으면 그것부터 알려 준다 (그 값이 있어야 최소 연봉도 계산된다)
    const others = be?.missing.length
      ? be.missing
      : scenario.missing.filter((label) => label !== '세후 월급');
    remaining = {
      value: '계산 못 함',
      note: others.length
        ? `필요한 값: ${others.join(', ')}`
        : row && hasSalary(row)
          ? '연봉 금액을 확인해 주세요'
          : '연봉을 알면 계산돼요',
      tone: 'muted',
    };
  }

  return {
    posting,
    row,
    scenario,
    breakEven: be,
    solved,
    housing,
    transport,
    cells: {
      salary,
      net,
      housing:
        solved && be?.support_excluded
          ? cost(housing, '주거지원비가 끝난 뒤')
          : cost(housing, chosen === 'move' ? aidNote(row) : undefined),
      // 비워 둬서 0원으로 계산한 교통비: 긴 출처 대신 짧게 (출처 전문은 계산 내역에)
      transport: assumedTransport ? cost(transport, '비워 둠 · 더 들 수 있어요') : cost(transport),
      fixed: cost(fixed),
      remaining,
    },
  };
}

const TONE_CLASS = { target: 'is-target', muted: 'is-muted', negative: 'is-negative' } as const;

function CellContent({ cell, label }: { cell: Shown; label: string }) {
  return (
    <>
      <span className={`cell-value ${cell.tone ? TONE_CLASS[cell.tone] : ''}`}>{cell.value}</span>
      {cell.tag && (
        <SourceBadge
          badge={cell.tag.badge}
          details={cell.tag.details}
          subject={label}
          className="result-badge"
        />
      )}
      {cell.note && (
        <small className={cell.tone === 'target' ? 'offer-badge' : 'cell-note'}>{cell.note}</small>
      )}
      {cell.sub && <small className="cell-note">{cell.sub}</small>}
    </>
  );
}

function rowClass(key: RowKey) {
  return key === 'salary' ? 'offer-salary' : key === 'remaining' ? 'compare-result' : undefined;
}

function companyOf(column: Column, index: number) {
  return column.posting.company || `공고 ${index + 1}`;
}

/** 공고 하나의 계산 내역: 세전 → 공제 → 세후 → 집·교통·고정비, 값마다 출처·신뢰도 */
function Breakdown({ column, index }: { column: Column; index: number }) {
  const { posting, row, housing, transport, breakEven } = column;
  const slip = posting.payslip;
  // 월급 묶음: 세전 월급 → 세금·4대보험(접어 둠) → 세후 월급
  const onTop = posting.pay_on_top?.value ? posting.pay_on_top : null;
  const gross: Line | null = slip
    ? {
        label: '세전 월급',
        value: exact(slip.gross),
        // 세전 월급에 연봉 외 수당이 들어 있으면 무엇인지 그 줄에서 바로 보인다
        note: onTop ? `${onTop.label} ${onTop.source} 포함` : undefined,
      }
    : null;
  const missingNote = netMissingNote(posting, row);
  const net: Line | null = slip
    ? {
        label: '세후 월급',
        value: exact(posting.net_income.value ?? 0),
        note: posting.net_income.source,
        status: 'estimated', // 표와 같이: 세후 월급은 간이세액표로 낸 예상값
      }
    : column.solved && breakEven?.net_income_krw != null
      ? {
          // 연봉 비공개 공고: 공제 내역 대신, 최소 연봉일 때의 세후 월급 한 줄
          label: '세후 월급',
          value: exact(breakEven.net_income_krw),
          // 백엔드가 그 연봉일 때 계산한 문장 (별도 식대·수당 포함). 예전 백엔드엔 없다.
          note:
            breakEven.net_income_source ??
            `연봉 ${exact(breakEven.annual_salary_krw!)}일 때 (4대보험·소득세를 뺀 값)`,
          status: 'estimated',
        }
      : missingNote
        ? // 연봉을 넣었는데 계산하지 않은 이유 (단위 실수 등)
          { label: '세후 월급', value: '모름', note: missingNote }
        : null;
  // 매달 나가는 돈 묶음 (값마다 출처·신뢰도가 달라 한 줄로 합치지 않는다) + 끝의 매달 남는 돈
  const remaining = column.solved
    ? breakEven?.monthly_remaining
    : column.scenario?.monthly_remaining;
  const costs: Line[] =
    housing && transport
      ? [
          ...[housing, transport, posting.fixed_expenses].map((item) => ({
            label: item.label,
            value: item.value == null ? '모름' : exact(-item.value),
            note: item.source,
            status: item.status,
          })),
          {
            // 세후 월급에서 위 비용을 뺀 값 (표의 마지막 줄과 같은 값, 한 원까지)
            label: '매달 남는 돈',
            value: remaining == null ? '계산 못 함' : exact(remaining),
            note: column.solved ? '최소 연봉일 때' : undefined,
            total: true,
          },
        ]
      : [];
  const notes = [...posting.notes, ...(breakEven?.notes ?? [])];
  return (
    <details className="result-details">
      <summary>{companyOf(column, index)} 계산 내역</summary>
      {(gross || net) && (
        <>
          <h4 className="breakdown-group">월급</h4>
          {gross && <BreakdownLines lines={[gross]} />}
          {slip && (
            // 공제 6줄은 접어 두고 합계만 (합계는 백엔드가 계산한 payslip.deductions)
            <details className="breakdown-fold">
              <summary>
                <span>
                  세금·4대보험{' '}
                  <span className="breakdown-fold-hint">
                    <span className="when-closed">{DEDUCTIONS.length}개 항목 보기</span>
                    <span className="when-open">접기</span>
                  </span>
                </span>
                {/* 예전 응답에 합계가 없으면 금액은 비워 둔다 (화면에서 더하지 않는다) */}
                {slip.deductions != null && (
                  <span className="tabular-nums">{exact(-slip.deductions)}</span>
                )}
              </summary>
              <BreakdownLines
                lines={DEDUCTIONS.map(([key, label]) => ({
                  label,
                  value: exact(-(slip[key] ?? 0)),
                }))}
              />
            </details>
          )}
          {net && <BreakdownLines lines={[net]} />}
        </>
      )}
      {costs.length > 0 && (
        <>
          <h4 className="breakdown-group">매달 나가는 돈</h4>
          <BreakdownLines lines={costs} />
        </>
      )}
      {notes.length > 0 && (
        <ul className="result-notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** 세금·4대보험 공제 항목 (payslip 키, 이름) */
const DEDUCTIONS = [
  ['national_pension', '국민연금'],
  ['health_insurance', '건강보험'],
  ['long_term_care', '장기요양보험'],
  ['employment_insurance', '고용보험'],
  ['income_tax', '소득세'],
  ['local_income_tax', '지방소득세'],
] as const;

/** 계산 내역 한 줄 */
type Line = {
  label: string;
  value: string;
  note?: string | null;
  status?: Status;
  total?: boolean; // 마지막 '매달 남는 돈' 줄
};

function BreakdownLines({ lines }: { lines: Line[] }) {
  return (
    <dl className="breakdown">
      {lines.map((line) => (
        <div key={line.label} className={line.total ? 'breakdown-total' : undefined}>
          <dt>{line.label}</dt>
          <dd>
            <span className="tabular-nums">{line.value}</span>
            {/* 내역은 출처를 줄마다 글로 보여 주므로, 배지는 뜻만 알려 준다 */}
            {line.status && line.status !== 'confirmed' && line.status !== 'missing' && (
              <SourceBadge badge={statusBadge[line.status]} className="result-badge" />
            )}
            {line.note && <small className="cell-note">{line.note}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 기준 공고가 주거지원비를 받는 동안 매달 남는 돈. 기준은 지원이 끝난 뒤 금액이라
 * 표에 보이는 그 공고 금액과 다르다 → 둘이 다를 때만 돌려줘 카드에 함께 적는다.
 */
function baselineDuringAid(be: BreakEven, columns: Column[]): number | undefined {
  const base = columns.find((c) => c.posting.posting_id === be.baseline.posting_id);
  if (!base?.row?.housing_allowance_monthly_krw?.value) return undefined;
  const now = base.posting.scenarios.find((s) => s.case === be.baseline.case)?.monthly_remaining;
  return now != null && now !== be.baseline.monthly_remaining ? now : undefined;
}

/**
 * 연봉 비공개 공고 요약 카드: 답(최소 연봉)을 크게 먼저, 기준·지원받는 동안·따로 받는 돈은 이름표 붙은 줄로.
 * 문구 '최소 ○○ 이상이면 같은 금액이 남아요'는 이슈 backend#14 완료 조건이라 그대로 둔다.
 */
function BreakEvenSummary({
  be,
  column,
  baselineDuringAid,
}: {
  be: BreakEven;
  column: Column | undefined;
  baselineDuringAid: number | undefined;
}) {
  return (
    <li className="be-item">
      <p className="font-semibold text-foreground">{be.company || be.posting_id}</p>
      <BreakEvenAnswer be={be} column={column} baselineDuringAid={baselineDuringAid} />
    </li>
  );
}

function BreakEvenAnswer({
  be,
  column,
  baselineDuringAid,
}: {
  be: BreakEven;
  column: Column | undefined;
  baselineDuringAid: number | undefined;
}) {
  const chosen = column?.breakEven;
  if (!column?.scenario) return <p>이 경우는 해당 없어요. 다른 경우를 골라 보세요.</p>;
  if (!chosen || chosen.annual_salary_krw == null) {
    return (
      <p>이 경우는 최소 연봉을 계산하지 못했어요{chosen?.reason ? ` (${chosen.reason})` : ''}.</p>
    );
  }
  // 최소 연봉에는 따로 받는 식대·수당이 빠져 있다 → 요약에도 적는다
  const onTop = column.posting.pay_on_top?.value ? column.posting.pay_on_top : null;
  const salary = (
    <strong className="text-xl font-bold text-foreground tabular-nums">
      {won(chosen.annual_salary_krw)}
    </strong>
  );
  return (
    <>
      <p className="mt-0.5">
        {chosen.floor === 'minimum_wage' ? (
          <>최저임금 수준인 {salary}만 받아도 기준보다 많이 남아요</>
        ) : (
          <>최소 {salary} 이상이면 같은 금액이 남아요</>
        )}
      </p>
      <dl className="be-facts">
        <div>
          <dt>기준</dt>
          <dd>
            {be.baseline.label} · 매달 {won(be.baseline.monthly_remaining)}
            {baselineDuringAid != null && (
              <span className="block text-muted-foreground">
                주거지원비가 끝난 뒤 기준이에요 (받는 동안은 매달 {won(baselineDuringAid)})
              </span>
            )}
          </dd>
        </div>
        {chosen.during_support_annual_salary_krw != null && (
          <div>
            <dt>주거지원비 받는 동안</dt>
            <dd>최소 {won(chosen.during_support_annual_salary_krw)}이면 돼요</dd>
          </div>
        )}
        {onTop && (
          <div>
            {/* 최소 연봉에 안 들어 있는 돈이라는 뜻이 보이게 ('연봉 외' → '연봉과 따로 받는 돈') */}
            <dt>{onTop.label.replace(/ 외$/, '')}과 따로 받는 돈</dt>
            <dd>
              매달 {formatWon(onTop.value!)} 더 받아요 ({onTop.source})
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}

/**
 * 공공데이터(국토부 실거래가) 조회에 실패해, 이사할 집 주거비를 시세로 대신하지 못한 공고들.
 * 그 공고의 '회사 근처로 이사'는 주거비가 비어 계산되지 않는다 → 이유와 할 일을 알린다.
 */
function rentFailures(columns: Column[], estimates: RentEstimate[]) {
  const failed = estimates.filter((e) => e.status === 'unavailable');
  const codes = failed.map((e) => e.lawd_cd);
  const byRegion = new Map<string, { place: string; companies: string[] }>();
  columns.forEach((column, i) => {
    // 사택·기숙사 공고는 시세를 쓰지 않으니, 주거비가 빈 이유가 시세 실패가 아니다
    if (!column.row || !rentFailed(column.row, codes)) return;
    const rent = failed.find((e) => e.lawd_cd === column.row?.location?.value?.lawd_cd)!;
    const move = column.posting.scenarios.find((s) => s.case === 'move' && s.applicable);
    if (!move || move.housing.value != null) return;
    // 같은 지역 공고는 한 안내로 묶는다
    const entry = byRegion.get(rent.lawd_cd) ?? { place: placeName(rent.region), companies: [] };
    entry.companies.push(companyOf(column, i));
    byRegion.set(rent.lawd_cd, entry);
  });
  return [...byRegion.entries()].map(([key, entry]) => ({ key, ...entry }));
}

/**
 * 이사할 때 처음에 준비할 돈: 근무지 원룸 월세 거래의 보증금 중앙값 (국토부 실거래가, 추정).
 * 보증금은 매달 나가는 돈이 아니라 '매달 남는 돈'에는 넣지 않는다 — 따로 한 묶음으로 알려 준다.
 * 이사 경우가 해당되는 공고만, 같은 지역은 한 줄로 묶는다.
 */
function DepositSummary({ columns, estimates }: { columns: Column[]; estimates: RentEstimate[] }) {
  const byRegion = new Map<string, { rent: RentEstimate; companies: string[] }>();
  columns.forEach((column, i) => {
    const moves = column.posting.scenarios.some((s) => s.case === 'move' && s.applicable);
    const code = column.row?.location?.value?.lawd_cd;
    const rent = estimates.find((e) => e.lawd_cd === code);
    if (!moves || !code || rent?.status !== 'estimated' || rent.deposit_krw == null) return;
    const entry = byRegion.get(code) ?? { rent, companies: [] };
    entry.companies.push(companyOf(column, i));
    byRegion.set(code, entry);
  });
  if (!byRegion.size) return null;
  return (
    <div className="rounded-2xl bg-muted p-5">
      <h3 className="mb-2 font-semibold text-foreground">이사하면 처음에 준비할 돈</h3>
      <ul className="space-y-2 text-sm text-body">
        {[...byRegion.values()].map(({ rent, companies }) => {
          const place = placeName(rent.region);
          return (
            <li key={rent.lawd_cd}>
              <strong>{companies.join(', ')}</strong> 근처({place}) 원룸 보증금{' '}
              <strong className="text-foreground tabular-nums">
                {formatWon(rent.deposit_krw!)}
              </strong>{' '}
              <SourceBadge
                badge={statusBadge.estimated}
                className="result-badge"
                details={[
                  { label: '출처', text: `국토부 실거래가 (${rent.period})` },
                  {
                    label: '계산',
                    text: `원룸 월세 ${rent.sample_size.toLocaleString('ko-KR')}건의 보증금 중앙값`,
                  },
                ]}
              />
              {rent.sample_size < FEW_TRADES && (
                <small className="deposit-source">거래가 적어 참고만 하세요</small>
              )}
            </li>
          );
        })}
      </ul>
      <ul className="bullet-list mt-3 space-y-1 text-sm text-body">
        <li>집마다 보증금 차이가 커요</li>
        <li>보증금은 돌려받는 돈이라 매달 남는 돈에는 넣지 않았어요</li>
        <li>첫 달에는 중개보수와 이사비도 따로 들 수 있어요</li>
      </ul>
    </div>
  );
}

export function ResultView({ result, rows }: { result: Result; rows: Row[] }) {
  const [mode, setMode] = useState<Mode>('best');
  const columns = result.postings.map((posting) =>
    buildColumn(
      posting,
      rows.find((row) => row.id === posting.posting_id),
      result.break_even.find((b) => b.posting_id === posting.posting_id),
      mode,
    ),
  );
  const computed = (column: Column) => (column.solved ? 'is-computed' : undefined);
  // 공고가 많으면 열마다 최소 폭을 주고 표를 가로로 넘겨 본다 (글자가 겹치지 않게)
  const tableWidth = { '--result-columns': columns.length } as CSSProperties;
  // 좁은 화면은 계산한 쪽(연봉 비공개 공고)을 먼저 보여 준다 (DESIGN.md)
  const firstTab = (columns.find((c) => c.solved) ?? columns[0])?.posting.posting_id;

  return (
    <div className="space-y-6">
      {/* 보기 방식 고르기: 탭이 아니라 표 하나의 보기 방식을 바꾸는 버튼 묶음 */}
      <div role="group" aria-label="비교할 경우" className="source-tabs mode-switch">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 연봉 비공개 공고의 최소 연봉이 무엇에 맞춘 값인지 표 위에서 먼저 (이사 탭에서 옆 열 금액과 헷갈리지 않게) */}
      {[...new Set(result.break_even.map((be) => be.baseline.label))].map((label) => {
        const be = result.break_even.find((b) => b.baseline.label === label)!;
        return (
          <p key={label} className="compare-basis">
            연봉 비공개 공고의 기준: {label} · 매달 {won(be.baseline.monthly_remaining)}
          </p>
        );
      })}
      <div className="compare-view result-compare">
        <div className="result-scroll">
          <table className="offer-table compare-table result-table" style={tableWidth}>
            <caption className="sr-only">공고별 매달 남는 돈 비교</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">항목</span>
                </th>
                {columns.map((column, i) => (
                  <th key={column.posting.posting_id} scope="col" className={computed(column)}>
                    {companyOf(column, i)}
                    <small>{column.scenario ? column.scenario.label : '해당 없음'}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ key, label }) => (
                <tr key={key} className={rowClass(key)}>
                  <th scope="row">{label}</th>
                  {columns.map((column) => (
                    <td key={column.posting.posting_id} className={computed(column)}>
                      <CellContent cell={column.cells[key]} label={label} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 좁은 화면: 공고를 골라 한 열짜리 명세로 본다. 공고가 둘이면 결과 줄 아래에 상대 값을 붙인다. */}
        <Tabs defaultValue={firstTab} className="compare-mobile">
          <TabsList aria-label="볼 공고" className="posting-tabs compare-switch">
            {columns.map((column, i) => (
              <TabsTrigger key={column.posting.posting_id} value={column.posting.posting_id}>
                {companyOf(column, i)}
              </TabsTrigger>
            ))}
          </TabsList>
          {columns.map((column, i) => {
            const other = columns.length === 2 ? columns[1 - i] : undefined;
            return (
              <TabsContent key={column.posting.posting_id} value={column.posting.posting_id}>
                <p className="compare-company">
                  {column.scenario ? column.scenario.label : '이 경우는 해당 없음'}
                </p>
                <dl className="compare-list">
                  {ROWS.map(({ key, label }) => (
                    <div key={key} className={rowClass(key)}>
                      <dt>{label}</dt>
                      <dd>
                        <CellContent cell={column.cells[key]} label={label} />
                        {key === 'remaining' && other && (
                          <small className="cell-note">
                            {companyOf(other, 1 - i)}: {other.cells.remaining.value}
                          </small>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </TabsContent>
            );
          })}
        </Tabs>
        <BadgeLegend
          badges={[
            statusBadge.confirmed,
            statusBadge.user_input,
            statusBadge.estimated,
            // 연봉을 이미지에서 읽은 공고가 있으면 그 배지도 범례에
            ...(columns.some((c) => c.cells.salary.tag?.badge === IMAGE_READ_BADGE)
              ? [IMAGE_READ_BADGE]
              : []),
          ]}
          hint="배지를 누르면 출처가 보여요"
        />
      </div>

      {/* '회사 근처로 이사'를 계산하지 못한 이유 (공공데이터 조회 실패): 표 바로 아래에.
          '더 남는 쪽' 보기에서도 이사 경우를 비교하지 못한 이유라 보이고,
          '지금 집에서 통근' 보기에서는 이사 경우가 없으니 보이지 않는다 */}
      {mode !== 'commute' &&
        rentFailures(columns, result.rent_estimates).map((failure) => (
          <div key={failure.key} className="salary-notice">
            <p className="font-semibold">
              {failure.place} 월세 시세(국토부 실거래가)를 불러오지 못했어요
            </p>
            <p>
              그래서 {failure.companies.join(', ')}의 &lsquo;회사 근처로 이사&rsquo;는 계산하지
              못했어요. 이사할 집 주거비를 넣거나, 잠시 후 다시 계산하면 시세를 다시 불러와요.
            </p>
          </div>
        ))}

      {result.break_even.length > 0 && (
        // 답의 일부라 옅은 파랑 (보증금·계산 내역 같은 참고는 회색)
        <div className="rounded-2xl bg-accent p-5">
          <h3 className="mb-2 font-semibold text-foreground">연봉이 공개되지 않은 공고</h3>
          <ul className="space-y-3 text-sm text-body">
            {result.break_even.map((be) => (
              <BreakEvenSummary
                key={be.posting_id}
                be={be}
                column={columns.find((c) => c.posting.posting_id === be.posting_id)}
                baselineDuringAid={baselineDuringAid(be, columns)}
              />
            ))}
          </ul>
        </div>
      )}

      {mode !== 'commute' && <DepositSummary columns={columns} estimates={result.rent_estimates} />}

      {(result.break_even_note || result.errors.length > 0) && (
        <div role="status" className="salary-notice">
          {result.break_even_note && <p>{result.break_even_note}</p>}
          {result.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {columns.map((column, i) => (
          <Breakdown key={column.posting.posting_id} column={column} index={i} />
        ))}
      </div>
    </div>
  );
}
