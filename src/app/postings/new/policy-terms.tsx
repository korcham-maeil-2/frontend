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
  { kind: 'householder', question: '이사하면 세대주가 되나요?', yes: '세대주', no: '세대주 아님' },
] as const satisfies readonly { kind: Kind; question: string; yes: string; no: string }[];

type AskedKind = (typeof QUESTIONS)[number]['kind'];
/** 조건을 채우는지: true 맞아요, false 안 맞아요, 없으면 모름 */
export type Answers = Partial<Record<AskedKind, boolean>>;
type Status = 'loading' | 'ok' | 'off';
type TermsState = { status: Status; terms: Record<string, PolicyTerms>; answers: Answers };

const TermsContext = createContext<TermsState>({ status: 'off', terms: {}, answers: {} });
export const TermsProvider = TermsContext.Provider;

const asked = (kind: Kind): kind is AskedKind => QUESTIONS.some((q) => q.kind === kind);
const squash = (text: string) => text.replace(/\s+/g, '');
const ANSWERS_KEY = 'wolgeup.plan-answers';

/** 되묻기 답: 플랜을 떠났다 와도 남게 이 탭에만 저장한다 (서버로 보내지 않는다) */
export function useAnswers() {
  const [answers, setAnswers] = useState<Answers>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(ANSWERS_KEY) ?? '{}') as Answers;
    } catch {
      return {};
    }
  });
  const save = (next: Answers) => {
    setAnswers(next);
    try {
      sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(next));
    } catch {
      // 저장소를 못 쓰면 이 화면에서만 기억한다
    }
  };
  return [answers, save] as const;
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
        <Sparkles aria-hidden /> AI가 지원 정책의 신청 조건을 읽는 중…
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
      <Sparkles aria-hidden /> AI가 지원 {read}개의 신청 조건을 읽었어요
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
            <span className="ask-back-question">{q.question}</span>
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

/** 정책 줄 아래 한 줄: 지원 내용 + 금액 + '조건 n개'(누르면 펼침). 주의가 있으면 빨간 한 줄 더 */
export function PolicyDetail({ id }: { id: string | null | undefined }) {
  const { terms, answers } = useContext(TermsContext);
  const [open, setOpen] = useState(false);
  const found = id ? terms[id] : undefined;
  if (!found) return null;
  const mismatch = found.conditions.some((c) => asked(c.kind) && answers[c.kind] === false);
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
            조건 {found.conditions.length}개
            <ChevronDown aria-hidden className={open ? 'rotate-180' : undefined} />
          </button>
        )}
        {mismatch && <span className="policy-mark is-off">안 맞을 수 있어요</span>}
      </p>
      {found.caution && (
        <p className="policy-caution">
          <CircleAlert aria-hidden /> {found.caution}
        </p>
      )}
      {open && (
        <div id={listId} className="policy-conditions">
          <ul>
            {found.conditions.map((c) => (
              <li key={`${c.kind}-${c.quote}`}>
                {c.text} <Mark kind={c.kind} answers={answers} />
                {/* 원문이 조건 문장과 다를 때만 근거로 보여 준다 */}
                {squash(c.quote) !== squash(c.text) && <q className="policy-quote">{c.quote}</q>}
              </li>
            ))}
          </ul>
          <p className="policy-note">AI가 원문에서 읽었어요. 신청 전 공고문을 꼭 확인해 주세요.</p>
        </div>
      )}
    </div>
  );
}
