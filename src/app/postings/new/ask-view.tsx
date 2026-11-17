'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { components } from '@/lib/api/schema';
import { formatWon } from './format';
import { MoneyInput } from './money-input';

// 되묻기 (백엔드 graph/ask.py, 이슈 #13): 계산을 막는 빈 값이 있으면 에이전트가 계산 전에 묻는다.
//   서버가 status='awaiting_answer', pending.type='ask_missing'으로 질문을 보내면 이 대화 상자를 띄우고,
//   답하면 POST /sessions/{id}/answers로 계산을 이어 간다. 모르면 건너뛰어도 계산은 된다
//   (그 경우는 결과 표에 '계산 못 함'과 필요한 값으로 보인다).

export type AskQuestion = {
  key: 'current_housing' | 'fixed_expenses';
  question: string;
  why: string;
  hint: string;
  example: number;
};
export type AskAnswers = NonNullable<components['schemas']['Answers']['answers']>;

/** pending.payload.questions가 이 화면이 아는 모양인지 (예전·다른 백엔드면 묻지 않는다) */
export function askQuestionsOf(pending: unknown): AskQuestion[] | null {
  const p = pending as { type?: string; payload?: { questions?: unknown } } | null | undefined;
  const list = p?.type === 'ask_missing' ? p.payload?.questions : null;
  if (!Array.isArray(list) || !list.length) return null;
  const ok = list.every(
    (q) =>
      q &&
      (q.key === 'current_housing' || q.key === 'fixed_expenses') &&
      typeof q.question === 'string',
  );
  return ok ? (list as AskQuestion[]) : null;
}

/** 예시 금액 → '30만' (MoneyInput 예시 글자) */
function exampleText(won: number): string {
  return formatWon(won).replace(/원$/, '');
}

export function AskView({
  questions,
  busy,
  onAnswer,
}: {
  questions: AskQuestion[];
  busy: boolean;
  /** 답 (모르면 null) → 계산 이어 가기 */
  onAnswer: (answers: AskAnswers) => void;
}) {
  const [values, setValues] = useState<Record<string, number | null>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  // 질문이 뜨면 상자로 포커스를 옮겨 화면 읽기·키보드 사용자도 바로 알 수 있게
  useEffect(() => heading.current?.focus(), []);
  const answers = Object.fromEntries(
    questions.map((q) => [q.key, values[q.key] ?? null]),
  ) as AskAnswers;
  const answered = questions.every((q) => values[q.key] != null);

  return (
    <section className="ask-box" aria-labelledby="ask-title">
      <h3 id="ask-title" ref={heading} tabIndex={-1} className="ask-title">
        <MessageCircleQuestion aria-hidden className="size-5 shrink-0" />
        계산하기 전에 {questions.length === 1 ? '하나만' : `${questions.length}가지만`} 물어볼게요
      </h3>
      <ol className="ask-list">
        {questions.map((q) => (
          <li key={q.key} className="ask-item">
            {/* 에이전트가 하는 말 (말풍선) */}
            <div className="ask-bubble">
              <p className="font-semibold text-foreground">{q.question}</p>
              <p>{q.why}</p>
            </div>
            <div className="ask-answer">
              <label htmlFor={`ask-${q.key}`} className="sr-only">
                {q.question} (단위: 원)
              </label>
              <MoneyInput
                id={`ask-${q.key}`}
                value={values[q.key] ?? null}
                onChange={(value) => setValues((v) => ({ ...v, [q.key]: value }))}
                example={exampleText(q.example)}
                describedBy={`ask-${q.key}-hint`}
              />
              <p id={`ask-${q.key}-hint`} className="row-field-hint">
                {values[q.key] != null && (
                  <span className="text-foreground">{formatWon(values[q.key]!)} · </span>
                )}
                {q.hint}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="ask-actions">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={busy}
          onClick={() => onAnswer(Object.fromEntries(questions.map((q) => [q.key, null])))}
        >
          모르겠어요, 이대로 계산
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={busy || !answered}
          onClick={() => onAnswer(answers)}
        >
          {busy ? '계산하는 중…' : '답하고 계산 이어 가기'}
        </Button>
      </div>
      {!answered && (
        <p className="text-xs text-muted-foreground">
          모르면 건너뛰어도 돼요. 그 값이 필요한 경우만 &lsquo;계산 못 함&rsquo;으로 보여요.
        </p>
      )}
    </section>
  );
}
