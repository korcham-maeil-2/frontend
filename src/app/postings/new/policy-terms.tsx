'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, Sparkles } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// 정착 플랜의 정책 카드: AI가 정책 원문을 읽어 정리한 지원 내용·주의·신청 조건 (백엔드 support/terms.py).
//   - 서버에는 정책 번호와 근무지 지역만 보낸다. 되묻기 답은 이 화면에서만 쓴다 (AI에 보내지 않음, 대회 규정)
//   - 조건으로 정책을 빼지 않는다: 답이 안 맞으면 '안 맞을 수 있어요'만 표시 (정확도 실험의 안전장치)
//   - AI가 못 읽었거나 서버가 읽지 않으면(off) 지금처럼 정책 이름만 보인다

type SettlePlan = components['schemas']['SettlePlan'];
export type PolicyTerms = components['schemas']['PolicyTerms'];
type Kind = PolicyTerms['conditions'][number]['kind'];

/** 되묻기 질문: AI가 읽은 조건 종류 중 사용자가 바로 답할 수 있는 것 (문장은 코드가 정한다) */
const QUESTIONS = [
  { kind: 'no_house', question: '지금 내 집(주택)이 없나요?', hint: '무주택 조건이에요' },
  {
    kind: 'householder',
    question: '이사하면 세대주가 되나요?',
    hint: '혼자 전입하면 보통 세대주예요',
  },
] as const satisfies readonly { kind: Kind; question: string; hint: string }[];

type AskedKind = (typeof QUESTIONS)[number]['kind'];
/** 조건을 채우는지: true 맞아요, false 안 맞아요, 없으면 모름 */
export type Answers = Partial<Record<AskedKind, boolean>>;

type TermsState = {
  status: 'loading' | 'ok' | 'off';
  terms: Record<string, PolicyTerms>;
  answers: Answers;
};

const TermsContext = createContext<TermsState>({ status: 'off', terms: {}, answers: {} });
export const TermsProvider = TermsContext.Provider;

const asked = (kind: Kind): kind is AskedKind => QUESTIONS.some((q) => q.kind === kind);
const squash = (text: string) => text.replace(/\s+/g, '');

/** 플랜에 보이는 정책들의 조건을 한 번에 받아 온다 (처음 보는 정책만 서버가 AI로 읽는다) */
export function usePolicyTerms(plan: SettlePlan) {
  const [state, setState] = useState<Omit<TermsState, 'answers'>>({ status: 'loading', terms: {} });
  const ids = [...plan.postings, ...plan.alternates].flatMap((p) =>
    p.slots.flatMap((s) => s.items.flatMap((i) => (i.policy_id ? [i.policy_id] : []))),
  );
  const codes = plan.postings.flatMap((p) => (p.lawd_cd ? [p.lawd_cd] : []));
  // 같은 정책이 여러 칸·회사에 나와도 한 번만, 순서가 달라도 같은 요청 (서버 상한 20개·지역 5개)
  const unique = (list: string[], max: number) => [...new Set(list)].sort().slice(0, max);
  const key = JSON.stringify([unique(codes, 5), unique(ids, 20)]);
  const none = ids.length === 0;
  useEffect(() => {
    const [lawd_cds, policyIds] = JSON.parse(key) as [string[], string[]];
    if (!policyIds.length) return;
    let cancelled = false;
    api
      .POST('/plan/policy-terms', { body: { lawd_cds, ids: policyIds } })
      .then(({ data }) => {
        if (cancelled) return;
        setState(data ? { status: data.status, terms: data.terms } : { status: 'off', terms: {} });
      })
      .catch(() => !cancelled && setState({ status: 'off', terms: {} }));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return none ? { status: 'off' as const, terms: {} } : state;
}

/**
 * 되묻기: AI가 읽은 조건에 무주택·세대주가 있으면 두 가지만 묻는다. 답은 이 화면에서만 쓴다.
 * 고른 답을 다시 누르면 '모름'으로 돌아간다.
 */
export function AskBack({
  terms,
  answers,
  onAnswer,
}: {
  terms: Record<string, PolicyTerms>;
  answers: Answers;
  onAnswer: (next: Answers) => void;
}) {
  const kinds = new Set(Object.values(terms).flatMap((t) => t.conditions.map((c) => c.kind)));
  const questions = QUESTIONS.filter((q) => kinds.has(q.kind));
  if (!questions.length) return null;
  const read = Object.keys(terms).length;
  const pick = (kind: AskedKind, value: boolean) =>
    onAnswer({ ...answers, [kind]: answers[kind] === value ? undefined : value });
  return (
    <section className="ask-back" aria-labelledby="ask-back-title">
      <p id="ask-back-title" className="ask-back-title">
        <Sparkles aria-hidden />
        AI가 지원 {read}개의 신청 조건을 읽었어요
      </p>
      <p className="ask-back-lead">
        두 가지만 알려 주면 조건마다 <strong>맞는지</strong> 표시해 드려요. 답은 이 화면에서만 써요.
      </p>
      <ul className="ask-back-list">
        {questions.map((q) => (
          <li key={q.kind}>
            <span className="ask-back-question">
              {q.question}
              <small>{q.hint}</small>
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

/** 조건 하나 옆 표시: 답한 조건만 (모르면 아무것도 붙이지 않는다) */
function Mark({ kind, answers }: { kind: Kind; answers: Answers }) {
  const answer = asked(kind) ? answers[kind] : undefined;
  if (answer === undefined) return null;
  return answer ? (
    <span className="policy-mark is-ok">
      <CircleCheck aria-hidden /> 맞아요
    </span>
  ) : (
    <span className="policy-mark is-off">
      <CircleAlert aria-hidden /> 안 맞을 수 있어요
    </span>
  );
}

/** 정책 줄 아래: AI가 읽은 지원 내용·금액·주의·신청 조건 (못 읽었으면 그리지 않는다) */
export function PolicyDetail({ id }: { id: string | null | undefined }) {
  const { status, terms, answers } = useContext(TermsContext);
  const found = id ? terms[id] : undefined;
  const mismatch = useMemo(
    () => !!found?.conditions.some((c) => asked(c.kind) && answers[c.kind] === false),
    [found, answers],
  );
  if (!id) return null;
  if (status === 'loading') {
    return (
      <p className="policy-reading" role="status">
        <Sparkles aria-hidden /> AI가 신청 조건을 읽는 중…
      </p>
    );
  }
  if (!found) return null;
  return (
    <div className="policy-terms">
      <p className="policy-summary">
        {found.summary}
        {found.amount && (
          <>
            {' '}
            <strong>{found.amount}</strong>
          </>
        )}
      </p>
      {found.caution && (
        <p className="policy-caution">
          <CircleAlert aria-hidden /> {found.caution}
        </p>
      )}
      {mismatch && <p className="policy-mismatch">알려 준 답으로는 조건이 안 맞을 수 있어요</p>}
      {found.conditions.length > 0 && (
        <details className="policy-conditions">
          <summary>신청 조건 {found.conditions.length}개</summary>
          <ul>
            {found.conditions.map((c) => (
              <li key={`${c.kind}-${c.quote}`}>
                <span className="policy-condition">
                  {c.text} <Mark kind={c.kind} answers={answers} />
                </span>
                {/* 원문이 조건 문장과 같으면 되풀이하지 않는다 (다를 때만 근거로 보여 준다) */}
                {squash(c.quote) !== squash(c.text) && <q className="policy-quote">{c.quote}</q>}
              </li>
            ))}
          </ul>
          <p className="policy-note">
            AI가 원문에서 읽은 조건이에요. 빠진 조건이 있을 수 있어 신청 전 공고문을 확인해 주세요.
          </p>
        </details>
      )}
    </div>
  );
}
