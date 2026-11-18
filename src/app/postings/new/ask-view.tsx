'use client';

import { MessageCircleQuestion } from 'lucide-react';

// 되묻기 (백엔드 graph/ask.py, 이슈 #13): 계산을 막는 빈 값이 있으면 에이전트가 계산 전에 묻는다.
//   서버가 status='awaiting_answer', pending.type='ask_missing'으로 질문을 보내면, 따로 상자를 띄우지
//   않고 원래 생활비 칸 바로 위에 질문(말풍선)을 붙이고 그 칸으로 스크롤·포커스한다 (page.tsx).
//   답은 원래 칸에 넣고, 지금 폼 값을 통째로 /confirm에 다시 보낸다 → 질문 중에 고친 다른 칸·비교표도
//   함께 반영된다. '모르겠어요, 이대로 계산'은 skip_missing=true로 보낸다 (써 둔 값은 그대로).

export type AskQuestion = {
  key: 'current_housing'; // 고정비는 선택 항목이라 늘 보내서 묻지 않는다 (profile.ts toFixedExpenses)
  question: string;
  why: string;
  hint: string;
  example: number;
};

/** pending.payload.questions가 이 화면이 아는 모양인지 (예전·다른 백엔드면 묻지 않는다) */
export function askQuestionsOf(pending: unknown): AskQuestion[] | null {
  const p = pending as { type?: string; payload?: { questions?: unknown } } | null | undefined;
  const list = p?.type === 'ask_missing' ? p.payload?.questions : null;
  if (!Array.isArray(list) || !list.length) return null;
  const ok = list.every((q) => q && q.key === 'current_housing' && typeof q.question === 'string');
  return ok ? (list as AskQuestion[]) : null;
}

/** 칸 위에 붙는 에이전트 질문 (말풍선). 질문 칸의 aria-describedby로 이어 화면 읽기도 읽는다 */
export function AskBubble({ question, id }: { question: AskQuestion; id: string }) {
  return (
    <div id={id} className="ask-bubble" role="note">
      <p className="ask-bubble-title">
        <MessageCircleQuestion aria-hidden className="size-4 shrink-0" />
        {question.question}
      </p>
      <p>
        {question.why} {question.hint}
      </p>
    </div>
  );
}
