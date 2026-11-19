'use client';

import type { ReactNode } from 'react';
import type { components } from '@/lib/api/schema';
import { postingNames, type Row } from './format';
import { pickCase, won } from './result-view';

// 결과 화면 맨 위: 한 줄 결론 + 왜 그런지 한 줄 + 돈이 어디로 가는지 막대 + 찾아본 공공데이터.
//   - 숫자는 모두 표('더 남는 쪽' 보기)와 같은 값을 그대로 쓴다. 다시 계산하지 않는다 (AI도 쓰지 않는다)
//   - 초록은 남는 돈에만, 빨강은 모자라는 돈에만 (DESIGN.md)

type Result = components['schemas']['CalculationResult'];
type PostingResult = components['schemas']['PostingResult'];
type Scenario = components['schemas']['Scenario'];
type Case = Scenario['case'];
type LocalSupport = components['schemas']['LocalSupport'];

/** 막대 하나 = 공고 하나의 한 경우 */
type Compared = {
  key: string;
  name: string;
  posting: PostingResult;
  scenario: Scenario;
  remaining: number;
  /** 공고 연봉 (월급이면 12배). 모르면 null → '연봉은 낮지만'을 쓰지 않는다 */
  annual: number | null;
};

const CASE_IF: Record<Case, string> = {
  commute: '지금 집에서 다니면',
  move: '회사 근처로 이사하면',
};
const CASE_THAN: Record<Case, string> = {
  commute: '지금 집에서 다닐 때보다',
  move: '이사할 때보다',
};

/** 숫자를 읽었을 때 받침이 있는 것 (영·일·삼·육·칠·팔) */
const DIGIT_FINAL = '013678';

/** 받침에 맞는 조사. 끝 괄호·기호는 건너뛴다 ('빛가람그리드(주)' → '가', '공고 1' → '이'). 영문 끝은 '이(가)' */
function josa(name: string, withFinal: string, without: string): string {
  const last = name.replace(/[^0-9A-Za-z가-힣]+$/, '').slice(-1);
  if (last >= '가' && last <= '힣') return (last.charCodeAt(0) - 0xac00) % 28 ? withFinal : without;
  if (/\d/.test(last)) return DIGIT_FINAL.includes(last) ? withFinal : without;
  return `${withFinal}(${without})`;
}
const subject = (name: string) => name + josa(name, '이', '가');
const topic = (name: string) => name + josa(name, '은', '는');

/** 이보다 차이가 작으면 '거의 같아요'. 시세 추정이 들어가면 추정의 오차만큼 넓게 본다 */
function sameBelow(cs: Compared[]): number {
  return cs.some((c) => c.scenario.housing.status === 'estimated') ? 50_000 : 10_000;
}

function annualOf(row: Row | undefined): number | null {
  if (!row) return null;
  if (row.salary_type?.value === 'monthly') {
    const monthly = row.monthly_salary_krw?.value;
    return monthly != null ? monthly * 12 : null;
  }
  return row.annual_salary_krw?.value ?? null;
}

function entry(posting: PostingResult, name: string, scenario: Scenario, row?: Row): Compared {
  return {
    key: `${posting.posting_id}-${scenario.case}`,
    name,
    posting,
    scenario,
    remaining: scenario.monthly_remaining!,
    annual: annualOf(row),
  };
}

/** 비교할 공고(표의 '더 남는 쪽' 경우)와 뺀 공고(이유). 많이 남는 순 */
function compare(result: Result, rows: Row[]) {
  const done: Compared[] = [];
  const left: { name: string; why: string }[] = [];
  // 같은 회사 공고가 둘이면 '카카오 (공고 2)' (탭·표와 같은 이름, 결론 문장이 '카카오보다 카카오가'가 되지 않게)
  const names = postingNames(result.postings.map((p) => p.company));
  result.postings.forEach((posting, i) => {
    const name = names[i];
    const be = result.break_even.find((b) => b.posting_id === posting.posting_id);
    const chosen = pickCase(posting, be, 'best');
    const scenario = posting.scenarios.find((s) => s.case === chosen && s.applicable);
    if (scenario?.monthly_remaining == null) {
      // 빈 값이 이유면 무엇을 넣으면 되는지 (표의 '매달 남는 돈' 칸과 같은 이름)
      const missing = posting.scenarios.find((s) => s.case === chosen)?.missing ?? [];
      const why =
        posting.net_income.value != null
          ? missing.length
            ? `${missing.join(', ')} 칸이 비어 계산하지 못했어요. 생활비에서 넣으면 같이 비교해요.`
            : '계산에 필요한 값이 없어 비교에서 뺐어요.'
          : be
            ? "연봉이 공고에 없어 비교에서 뺐어요. 아래 '면접에서 확인할 연봉'을 보세요."
            : '연봉이 없어 비교에서 뺐어요. 조건 확인에서 연봉을 넣으면 같이 비교해요.';
      left.push({ name, why });
      return;
    }
    done.push(
      entry(
        posting,
        name,
        scenario,
        rows.find((r) => r.id === posting.posting_id),
      ),
    );
  });
  return { done: done.sort((a, b) => b.remaining - a.remaining), left };
}

/** 공고가 하나면 계산된 경우(통근·이사)를 모두 견준다 */
function casesOf(only: Compared): Compared[] {
  return only.posting.scenarios
    .filter((s) => s.applicable && s.monthly_remaining != null)
    .map((s) => entry(only.posting, only.name, s))
    .sort((a, b) => b.remaining - a.remaining);
}

const PARTS = [
  { key: 'housing', label: '주거비' },
  { key: 'transport', label: '교통비' },
  { key: 'fixed', label: '고정비' },
  { key: 'remaining', label: '남는 돈' },
] as const;
type Part = (typeof PARTS)[number]['key'];

function partsOf(c: Compared): Record<Part, number> {
  return {
    housing: c.scenario.housing.value ?? 0,
    transport: c.scenario.transport.value ?? 0,
    fixed: c.posting.fixed_expenses.value ?? 0,
    remaining: Math.max(c.remaining, 0),
  };
}

/** 두 막대 사이의 차이 하나. value > 0이면 이기는 쪽에 좋은 차이 (세후 월급이 많거나 비용이 덜 듦) */
type Diff = { label: string; value: number; pay: boolean };

/** '주거비가 38만원 덜 들어요' / 이어 쓰면 '…덜 들고', 대조면 '교통비는 …' */
function clause(d: Diff, last: boolean, contrast: boolean): string {
  const who = contrast ? topic(d.label) : subject(d.label);
  const good = d.value > 0;
  const [link, end] = d.pay
    ? good
      ? ['더 많고', '더 많아요']
      : ['적고', '적어요']
    : good
      ? ['덜 들고', '덜 들어요']
      : ['더 들고', '더 들어요'];
  return `${who} ${won(Math.abs(d.value))} ${last ? end : link}`;
}

/**
 * 왜 더 남는지 한 줄: 가장 크게 앞선 것 하나 (+ 반대로 더 드는 것 하나).
 * 연봉이 더 낮은데 이겼으면 '연봉은 … 낮지만'으로 시작한다 (연봉만 보면 놓치는 답).
 */
function reason(win: Compared, rival: Compared): string {
  const a = partsOf(win);
  const b = partsOf(rival);
  const pay = (win.posting.net_income.value ?? 0) - (rival.posting.net_income.value ?? 0);
  const diffs: Diff[] = [
    { label: '세후 월급', value: pay, pay: true },
    ...PARTS.filter((p) => p.key !== 'remaining').map((p) => ({
      label: p.label,
      value: b[p.key] - a[p.key],
      pay: false,
    })),
  ].filter((d) => Math.abs(d.value) >= 10_000);
  const salaryGap =
    win.annual != null && rival.annual != null && rival.annual > win.annual
      ? rival.annual - win.annual
      : null;
  const best = diffs
    .filter((d) => d.value > 0 && !(salaryGap != null && d.pay))
    .sort((x, y) => y.value - x.value)[0];
  const worst = diffs.filter((d) => d.value < 0).sort((x, y) => x.value - y.value)[0];
  if (!best) return '';
  if (salaryGap != null) return `연봉은 ${won(salaryGap)} 낮지만, ${clause(best, true, false)}.`;
  return worst
    ? `${clause(best, false, false)}, ${clause(worst, true, true)}.`
    : `${clause(best, true, false)}.`;
}

function Gap({ gap, short }: { gap: number; short: boolean }) {
  return (
    <>
      매달 <strong className={short ? 'is-short' : undefined}>{won(gap)}</strong>{' '}
      {short ? '덜 모자라요' : '더 남아요'}.
    </>
  );
}

/** 한 줄 결론 + 이유. bars는 많이 남는 순 */
function lineOf(bars: Compared[], single: boolean): { title: ReactNode; why?: string } {
  const [win, rival] = bars;
  if (!rival) {
    const short = win.remaining < 0;
    return {
      title: (
        <>
          {CASE_IF[win.scenario.case]} 매달{' '}
          <strong className={short ? 'is-short' : undefined}>{won(Math.abs(win.remaining))}</strong>{' '}
          {short ? '모자라요' : '남아요'}.
        </>
      ),
    };
  }
  const gap = win.remaining - rival.remaining;
  const short = win.remaining < 0;
  // 한쪽만 모자라면 차이가 작아도 '거의 같아요'라고 하지 않는다
  if (gap < sameBelow(bars) && win.remaining < 0 === rival.remaining < 0) {
    const what = short ? '모자라는 돈' : '남는 돈';
    return {
      title: single
        ? `지금 집에서 다니든 이사하든 매달 ${what}이 거의 같아요.`
        : `${win.name}${josa(win.name, '과', '와')} ${topic(rival.name)} 매달 ${what}이 거의 같아요.`,
      why: `차이가 ${won(gap)}뿐이에요. ${single ? '이사 비용과 통근 시간' : '통근 시간과 받을 수 있는 지원'}으로 골라 보세요.`,
    };
  }
  const why = reason(win, rival);
  if (single) {
    return {
      title: (
        <>
          {CASE_IF[win.scenario.case]} {CASE_THAN[rival.scenario.case]}{' '}
          <Gap gap={gap} short={short} />
        </>
      ),
      why,
    };
  }
  if (short) {
    return {
      title: '비교한 곳 모두 세후 월급보다 나가는 돈이 많아요.',
      why: `${subject(win.name)} ${rival.name}보다 매달 ${won(gap)} 덜 모자라요.`,
    };
  }
  // 경우가 다르면(이사 vs 통근) 조건을 문장에 넣는다
  const when = win.scenario.case !== rival.scenario.case ? `${CASE_IF[win.scenario.case]} ` : '';
  return {
    title: (
      <>
        {when}
        {subject(win.name)} <Gap gap={gap} short={false} />
      </>
    ),
    why: why && `${rival.name}보다 ${why}`,
  };
}

/** 막대: 모두 같은 기준(가장 긴 막대 = 100%)이라 길이로 견준다. 적자면 세후 월급 자리에 금을 긋는다 */
function Bars({ bars, single }: { bars: Compared[]; single: boolean }) {
  const totals = bars.map((c) => Object.values(partsOf(c)).reduce((a, b) => a + b, 0));
  const scale = Math.max(...totals, 1);
  const shown = PARTS.filter((p) => bars.some((c) => partsOf(c)[p.key] > 0));
  const anyShort = bars.some((c) => c.remaining < 0);
  return (
    <div className="verdict-bars">
      <ul>
        {bars.map((c, i) => {
          const parts = partsOf(c);
          const short = c.remaining < 0;
          const net = c.posting.net_income.value ?? 0;
          const spoken = PARTS.filter((p) => p.key !== 'remaining')
            .map((p) => `${p.label} ${won(parts[p.key])}`)
            .join(', ');
          const end = short ? `${won(-c.remaining)} 모자라요` : `${won(c.remaining)} 남아요`;
          return (
            <li key={c.key}>
              <p className="verdict-bar-head">
                {!single && <span className="verdict-bar-name">{c.name}</span>}
                <span className="support-category">{c.scenario.label}</span>
                <span className={short ? 'verdict-bar-short' : 'verdict-bar-left'}>{end}</span>
              </p>
              <div
                role="img"
                aria-label={`세후 월급 ${won(net)} 중 ${spoken}, ${end}`}
                className="verdict-bar"
                style={{ width: `${(totals[i] / scale) * 100}%` }}
              >
                {PARTS.map(
                  (p) =>
                    parts[p.key] > 0 && (
                      <span key={p.key} data-part={p.key} style={{ flexGrow: parts[p.key] }} />
                    ),
                )}
                {short && (
                  <i className="verdict-net" style={{ left: `${(net / totals[i]) * 100}%` }} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="verdict-legend" aria-hidden>
        <span>
          {anyShort ? '막대 길이는 세후 월급, 모자라면 나가는 돈' : '막대 길이는 세후 월급'}
        </span>
        {shown.map((p) => (
          <span key={p.key} data-part={p.key}>
            {p.label}
          </span>
        ))}
        {anyShort && <span data-part="net">세후 월급 끝</span>}
      </p>
    </div>
  );
}

/** 찾아본 공공데이터: 짧게 세 칩 (기간·지역은 표의 출처 배지에 있다) */
function sourcesOf(result: Result, support: LocalSupport | null): string[] {
  const deals = result.rent_estimates
    .filter((r) => r.status === 'estimated')
    .reduce((n, r) => n + r.sample_size, 0);
  const policies = support
    ? support.regions.reduce((n, r) => n + r.matched, 0) + support.national_matched
    : 0;
  return [
    ...(deals > 0 ? [`국토부 실거래 ${deals.toLocaleString('ko-KR')}건`] : []),
    ...(policies > 0 ? [`온통청년 지원 ${policies}개`] : []),
    '국세청 간이세액표',
  ];
}

export function Verdict({
  result,
  rows,
  support,
}: {
  result: Result;
  rows: Row[];
  support: LocalSupport | null;
}) {
  const { done, left } = compare(result, rows);
  const single = done.length === 1;
  const bars = single ? casesOf(done[0]) : done;
  // 계산된 공고가 없어도 카드는 둔다: 왜 못 했는지(아래 줄)가 답이다
  const line = bars.length ? lineOf(bars, single) : null;
  return (
    <section className="verdict" aria-label="한 줄 결론">
      {/* 사용법 안내 말풍선은 결론 문장을 가리킨다 (카드 전체는 휴대폰 화면보다 길 수 있다) */}
      <div data-tour="verdict">
        {single && <p className="verdict-name">{done[0].name}</p>}
        <p className="verdict-title">
          {line ? line.title : '아직 매달 남는 돈을 계산하지 못했어요.'}
        </p>
        {line?.why && <p className="verdict-why">{line.why}</p>}
      </div>
      {bars.length > 0 && <Bars bars={bars} single={single} />}
      {left.map((l, i) => (
        // 회사 이름이 같은 공고가 있을 수 있어 순서로
        <p key={i} className="verdict-left">
          {l.name}: {l.why}
        </p>
      ))}
      <div className="verdict-sources">
        <span className="verdict-sources-label">월급지도가 찾아본 자료</span>
        {sourcesOf(result, support).map((s) => (
          <span key={s} className="support-category">
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}
