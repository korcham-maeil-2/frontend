'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { ChevronDown, CircleAlert, CircleCheck, Sparkles } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// 정착 플랜의 정책 줄: AI가 정책 원문을 읽어 정리한 지원 내용·주의·신청 조건 (백엔드 support/terms.py).
//   - 읽을 정책은 서버가 세션 플랜에서 고른다. 되묻기 답은 이 브라우저에서만 쓴다 (AI에 보내지 않음, 대회 규정)
//   - 조건으로 정책을 빼지 않는다: 답이 안 맞으면 '안 맞을 수 있어요'만 표시 (정확도 실험의 안전장치)
//   - 화면이 길어지지 않게: 정책마다 설명 한 줄 + '조건 n개'(누르면 펼침), 주의만 따로 한 줄
//   - AI가 못 읽었거나 서버가 읽지 않으면(off) 지금처럼 정책 이름만 보인다

type SettlePlan = components['schemas']['SettlePlan'];
export type PolicyTerms = components['schemas']['PolicyTerms'];
type Kind = PolicyTerms['conditions'][number]['kind'];

/** 되묻기 질문: AI가 읽은 조건 종류 중 사용자가 바로 답할 수 있는 것 (문장은 코드가 정한다) */
const QUESTIONS = [
  { kind: 'no_house', question: '지금 내 집(주택)이 없나요?', yes: '무주택', no: '집 있음' },
  {
    kind: 'householder',
    question: '지원을 신청할 때 세대주인가요?',
    // 통근·이사 어느 경우에도 맞게 (답은 경우마다가 아니라 한 번만 저장한다)
    hint: '혼자 살며 전입신고를 하면 세대주예요. 부모님 집에 살면 보통 아니에요.',
    yes: '세대주',
    no: '세대주 아님',
  },
] as const satisfies readonly {
  kind: Kind;
  question: string;
  hint?: string;
  yes: string;
  no: string;
}[];

type AskedKind = (typeof QUESTIONS)[number]['kind'];
/** 조건을 채우는지: true 맞아요, false 안 맞아요, 없으면 모름 */
export type Answers = Partial<Record<AskedKind, boolean>>;
type Status = 'loading' | 'ok' | 'off';
type TermsState = {
  status: Status;
  terms: Record<string, PolicyTerms>;
  answers: Answers;
  /** 3단계에서 넣은 만 나이 (선택). 나이 조건 옆 표시에만 쓴다 */
  age?: number | null;
  /** 이 공고 급여 한 줄 (소득 조건 아래 참고로). 소득을 판단하지는 않는다 */
  salary?: string | null;
  /** 사용자가 직접 확인했다고 체크한 조건 ('정책번호:원문') */
  checked?: Record<string, boolean>;
  onCheck?: (key: string, value: boolean) => void;
};

const TermsContext = createContext<TermsState>({ status: 'off', terms: {}, answers: {} });
export const TermsProvider = TermsContext.Provider;

const asked = (kind: Kind): kind is AskedKind => QUESTIONS.some((q) => q.kind === kind);
const squash = (text: string) => text.replace(/\s+/g, '');

/** 플랜을 떠났다 와도 남게 이 탭에만 저장한다 (서버로 보내지 않는다) */
function useStored<T extends object>(key: string) {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? '{}') as T;
    } catch {
      return {} as T;
    }
  });
  const save = (next: T) => {
    setValue(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      // 저장소를 못 쓰면 이 화면에서만 기억한다
    }
  };
  return [value, save] as const;
}
/** 되묻기 답 */
export const useAnswers = () => useStored<Answers>('wolgeup.plan-answers');
/** 직접 확인했다고 체크한 조건 */
export const useChecked = () => useStored<Record<string, boolean>>('wolgeup.plan-checked');

/**
 * 나이 조건 원문에서 'N~M세'·'N세 이상 M세 이하'·'N세 이하·미만·이상'만 읽는다.
 * 그 밖('2009년생부터' 등)은 읽지 않아 표시도 하지 않는다 (틀린 '맞아요'를 막는다).
 */
export function ageRange(quote: string): [number, number] | null {
  const s = quote.replace(/\s+/g, '').replace(/만(?=\d)/g, ''); // '만 19세'의 만만 (미만은 둔다)
  // 신청자가 아닌 사람의 나이('자녀가 만 6세 이하')는 읽지 않는다
  if (/자녀|부모|배우자|가구원|아동/.test(s)) return null;
  // '19~34세', '19세 이상 ~ 34세 이하', '18세 이상 39세 미만', '18세 이상부터 39세 이하까지'
  const both =
    s.match(/(\d{1,3})세?(?:이상|부터)*[~∼～-](\d{1,3})세(이하|미만)?/) ??
    s.match(/(\d{1,3})세(?:이상|부터)+(\d{1,3})세(이하|미만)?/);
  if (both) return [Number(both[1]), Number(both[2]) - (both[3] === '미만' ? 1 : 0)];
  const one = s.match(/(\d{1,3})세(미만|이하|이상)/);
  if (!one) return null;
  const n = Number(one[1]);
  return one[2] === '이상' ? [n, Infinity] : [0, one[2] === '미만' ? n - 1 : n];
}

type Verdict = 'ok' | 'off' | 'check' | undefined;
type Condition = PolicyTerms['conditions'][number];

/** 조건 하나를 코드로 판단: 되묻기 답, 나이(원문 범위). 모르면 undefined (아무 표시 없음) */
function verdict(c: Condition, answers: Answers, age: number | null): Verdict {
  if (asked(c.kind)) {
    const answer = answers[c.kind];
    return answer === undefined ? undefined : answer ? 'ok' : 'off';
  }
  if (c.kind !== 'age' || age == null) return undefined;
  const range = ageRange(c.quote);
  if (!range) return undefined;
  if (age < range[0] || age > range[1]) return 'off';
  // 상한 나이면 만 나이 기준일에 따라 넘을 수 있다
  return age === range[1] ? 'check' : 'ok';
}

/** 이 세션 플랜의 정책 조건을 받아 온다. 플랜이 바뀌면(다시 계산) 다시 받는다 */
export function usePolicyTerms(sessionId: string, plan: SettlePlan) {
  const ids = [...plan.postings, ...plan.alternates].flatMap((p) =>
    p.slots.flatMap((s) => s.items.flatMap((i) => (i.policy_id ? [i.policy_id] : []))),
  );
  const key = ids.length && sessionId ? `${sessionId}|${ids.join(',')}` : '';
  const [state, setState] = useState<{ key: string; status: Status; terms: TermsState['terms'] }>({
    key: '',
    status: 'off',
    terms: {},
  });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api
      .GET('/sessions/{session_id}/policy-terms', {
        params: { path: { session_id: key.split('|')[0] } },
      })
      .then(({ data }) => {
        if (!cancelled) setState({ key, status: data?.status ?? 'off', terms: data?.terms ?? {} });
      })
      .catch(() => !cancelled && setState({ key, status: 'off', terms: {} }));
    return () => {
      cancelled = true;
    };
  }, [key]);
  if (!key) return { status: 'off' as const, terms: {} };
  // 이 플랜의 답이 아직 안 왔으면 읽는 중 (예전 플랜의 답은 쓰지 않는다)
  return state.key === key ? state : { status: 'loading' as const, terms: {} };
}

/**
 * 플랜 맨 위 한 칸: AI가 읽는 중이면 그 사실만, 다 읽으면 무주택·세대주 두 가지만 묻는다.
 * 둘 다 답하면 한 줄(답 칩 + 바꾸기)로 접는다. 답은 이 브라우저에서만 쓴다.
 */
export function AskBack({
  status,
  terms,
  answers,
  onAnswer,
}: TermsState & { onAnswer: (next: Answers) => void }) {
  const [editing, setEditing] = useState(false);
  if (status === 'off') return null;
  if (status === 'loading') {
    return (
      <p className="ask-back ask-back-title" role="status">
        <Sparkles aria-hidden /> 월급지도가 지원 정책의 신청 조건을 읽는 중…
      </p>
    );
  }
  const read = Object.keys(terms).length;
  const kinds = new Set(Object.values(terms).flatMap((t) => t.conditions.map((c) => c.kind)));
  const questions = QUESTIONS.filter((q) => kinds.has(q.kind));
  if (!read) return null;
  const done = questions.every((q) => answers[q.kind] !== undefined);
  const title = (
    <span className="ask-back-title">
      <Sparkles aria-hidden /> 월급지도가 지원 {read}개의 신청 조건을 읽었어요
    </span>
  );
  if (!questions.length || (done && !editing)) {
    return (
      <p className="ask-back is-done">
        {title}
        {questions.map((q) => (
          <span key={q.kind} className="support-category">
            {answers[q.kind] ? q.yes : q.no}
          </span>
        ))}
        {questions.length > 0 && (
          <button type="button" className="inline-link" onClick={() => setEditing(true)}>
            바꾸기
          </button>
        )}
      </p>
    );
  }
  const pick = (kind: AskedKind, value: boolean) => {
    const next = { ...answers, [kind]: value };
    onAnswer(next);
    if (questions.every((q) => next[q.kind] !== undefined)) setEditing(false);
  };
  return (
    <section className="ask-back" aria-label="신청 조건 확인">
      {title}
      <p className="ask-back-lead">답하면 조건마다 맞는지 표시해요. 답은 이 화면에서만 써요.</p>
      <ul className="ask-back-list">
        {questions.map((q) => (
          <li key={q.kind}>
            <span className="ask-back-question">
              {q.question}
              {'hint' in q && <span className="ask-back-hint">{q.hint}</span>}
            </span>
            <span role="group" aria-label={q.question} className="ask-back-choices">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={answers[q.kind] === value}
                  onClick={() => pick(q.kind, value)}
                >
                  {value ? '네' : '아니요'}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** AI가 읽은 정책 조건 전체 (정책 번호 → 조건). 접힌 칸의 '조건 확인 n개' 칩에 쓴다 */
export function useReadTerms() {
  return useContext(TermsContext).terms;
}

/** 조건 하나 옆 표시 (코드가 판단한 조건만) */
function Mark({ verdict }: { verdict: Exclude<Verdict, undefined> }) {
  if (verdict === 'ok')
    return (
      <span className="policy-mark is-ok">
        <CircleCheck aria-hidden /> 맞아요
      </span>
    );
  return verdict === 'off' ? (
    <span className="policy-mark is-off">
      <CircleAlert aria-hidden /> 안 맞을 수 있어요
    </span>
  ) : (
    <span className="policy-mark is-check">
      <CircleAlert aria-hidden /> 나이 기준일 확인
    </span>
  );
}

/** 정책 줄 아래 한 줄: 지원 내용 + 금액 + '조건 n개'(누르면 펼침). 주의가 있으면 빨간 한 줄 더 */
export function PolicyDetail({ id }: { id: string | null | undefined }) {
  const { terms, answers, age = null, salary, checked = {}, onCheck } = useContext(TermsContext);
  const [open, setOpen] = useState(false);
  const found = id ? terms[id] : undefined;
  if (!found) return null;
  const verdicts = found.conditions.map((c) => verdict(c, answers, age));
  const mismatch = verdicts.includes('off');
  // 확인한 조건: 코드가 '맞아요'라고 본 것 + 사용자가 직접 체크한 것
  // 체크는 '정책번호:원문'으로 기억한다 (다시 읽어 조건 순서가 바뀌어도 엉뚱한 줄에 붙지 않게)
  // 같은 원문을 인용한 조건이 둘일 수 있어 조건 글도 붙인다
  const keyOf = (i: number) =>
    `${id}:${squash(found.conditions[i].quote)}|${squash(found.conditions[i].text)}`;
  const done = verdicts.filter((v, i) => v === 'ok' || (!v && checked[keyOf(i)])).length;
  const listId = `policy-conditions-${id}`;
  return (
    <div className="policy-terms">
      <p className="policy-summary">
        {found.summary}
        {found.amount && <strong> {found.amount}</strong>}
        {found.conditions.length > 0 && (
          <button
            type="button"
            className="policy-toggle"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen(!open)}
          >
            조건 {found.conditions.length}개{done > 0 && ` 중 ${done}개 확인`}
            <ChevronDown aria-hidden className={open ? 'rotate-180' : undefined} />
          </button>
        )}
        {/* 펼치면 조건마다 표시가 있으니 요약 줄에는 접혔을 때만 */}
        {mismatch && !open && <span className="policy-mark is-off">안 맞을 수 있어요</span>}
      </p>
      {found.caution && (
        <p className="policy-caution">
          <CircleAlert aria-hidden /> {found.caution}
        </p>
      )}
      {open && (
        <div id={listId} className="policy-conditions">
          <ul>
            {found.conditions.map((c, i) => {
              const v = verdicts[i];
              const key = keyOf(i);
              return (
                <li key={keyOf(i)}>
                  {/* 코드가 판단 못 한 조건은 직접 확인하고 체크한다 (이 탭에만 저장).
                      되묻기로 물을 조건은 위 질문에 답하면 표시가 붙으니 체크 칸을 두지 않는다 */}
                  {v ? (
                    <>
                      {c.text} <Mark verdict={v} />
                    </>
                  ) : asked(c.kind) ? (
                    c.text
                  ) : (
                    <label className="policy-check">
                      <input
                        type="checkbox"
                        checked={!!checked[key]}
                        onChange={(e) => onCheck?.(key, e.target.checked)}
                      />
                      {c.text}
                    </label>
                  )}
                  {/* 원문이 조건 문장과 다를 때만 근거로 보여 준다 */}
                  {squash(c.quote) !== squash(c.text) && <q className="policy-quote">{c.quote}</q>}
                </li>
              );
            })}
          </ul>
          {salary && found.conditions.some((c) => c.kind === 'income') && (
            <p className="policy-salary">참고: 이 공고 {salary}</p>
          )}
          {/* 대회 규정 제7조(서비스 안 AI 표시 권장): 제목·칩은 '월급지도', AI로 읽었다는 사실은 여기에 */}
          <p className="policy-note">
            AI로 원문에서 읽은 조건이에요. 신청 전 공고문을 꼭 확인해 주세요.
          </p>
        </div>
      )}
    </div>
  );
}
