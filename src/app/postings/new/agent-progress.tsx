'use client';

import { useEffect, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';

// AI가 일하는 동안 보여 주는 진행 카드: 지금 하는 일, 지난 시간, 기다리는 동안 볼 한 줄 팁.
// 서버는 진행 상황을 따로 알려 주지 않는다 → 단계는 '보통 걸리는 시간'으로 넘긴다.
// 그래서 마지막 단계는 응답이 올 때까지 끝났다고 표시하지 않고, 카드에도 '예상 순서'라고 적는다.

export type ProgressKind = 'reading' | 'reading-files' | 'calculating' | 'calculating-demo';

type Plan = { steps: string[]; seconds: number; title: string };

const PLANS: Record<ProgressKind, Plan> = {
  reading: {
    title: 'AI가 공고를 읽고 있어요',
    seconds: 15,
    steps: ['공고 글 나누기', '근무 조건 뽑기', '비교표로 정리하기'],
  },
  'reading-files': {
    title: 'AI가 공고 파일을 읽고 있어요',
    seconds: 45,
    steps: ['파일 열기', '이미지·PDF 글자 읽기', '근무 조건 뽑기', '비교표로 정리하기'],
  },
  calculating: {
    title: '매달 남는 돈을 계산하고 있어요',
    seconds: 20,
    steps: [
      '세금·4대보험 계산',
      '근무지 월세 시세·청년 지원 찾기',
      '경우별로 남는 돈 계산',
      'AI가 설명 쓰기',
      '설명 속 금액 검증',
    ],
  },
  'calculating-demo': {
    title: '매달 남는 돈을 계산하고 있어요',
    seconds: 4,
    steps: ['세금·4대보험 계산', '근무지 월세 시세·청년 지원 찾기', '경우별로 남는 돈 계산'],
  },
};

const TIPS = [
  '금액은 AI가 아니라 프로그램이 계산해요. AI는 공고를 읽고 설명만 써요.',
  '세후 월급은 국세청 간이세액표와 4대보험 요율로 계산해요.',
  '월세 시세는 국토부 실거래가에서 근무지 원룸 거래의 중앙값을 써요.',
  '연봉이 비공개인 공고는 "최소 얼마를 받아야 같은 돈이 남는지"를 알려 드려요.',
  '교통비처럼 비워 둔 값은 0원으로 계산하고, 더 들 수 있다고 따로 알려 드려요.',
];
const TIP_SECONDS = 6;

/** 지난 시간(초)으로 지금 단계를 고른다. 마지막 단계는 응답이 올 때까지 머문다. */
export function currentStep(kind: ProgressKind, elapsed: number): number {
  const { steps, seconds } = PLANS[kind];
  return Math.min(Math.floor((elapsed / seconds) * steps.length), steps.length - 1);
}

export function AgentProgress({ kind }: { kind: ProgressKind }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(timer);
  }, [kind]);

  const plan = PLANS[kind];
  const active = currentStep(kind, elapsed);
  // 진행 막대는 예상 시간까지 90%를 채우고, 그 뒤로는 천천히 다가가기만 한다 (100%는 응답이 왔을 때)
  const ratio = elapsed / plan.seconds;
  const percent = ratio < 1 ? ratio * 90 : 90 + 9 * (1 - 1 / (1 + (ratio - 1)));
  const late = elapsed > plan.seconds * 1.5;
  const tip = TIPS[Math.floor(elapsed / TIP_SECONDS) % TIPS.length];

  return (
    <div className="agent-progress">
      <div className="agent-progress-head">
        <LoaderCircle aria-hidden className="agent-spinner" />
        <p className="font-semibold text-foreground">{plan.title}</p>
        <span className="agent-elapsed tabular-nums" aria-hidden>
          {Math.floor(elapsed)}초
        </span>
      </div>
      <div className="agent-bar" aria-hidden>
        <span style={{ width: `${percent}%` }} />
      </div>
      {/* 화면 읽기 프로그램에는 단계가 바뀔 때만 알린다 (초 단위 숫자는 읽지 않는다) */}
      <ol className="agent-steps" aria-live="polite">
        {plan.steps.map((step, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'waiting';
          return (
            <li
              key={step}
              className={`is-${state}`}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className="agent-step-mark" aria-hidden>
                {state === 'done' ? <Check /> : i + 1}
              </span>
              {step}
              {state === 'active' && <span className="sr-only"> (진행 중)</span>}
            </li>
          );
        })}
      </ol>
      <p className="agent-tip">
        {late ? '평소보다 오래 걸리고 있어요. 창을 닫지 말고 조금만 더 기다려 주세요.' : tip}
      </p>
      <p className="agent-note">보통 걸리는 시간으로 보여 주는 예상 순서예요.</p>
    </div>
  );
}
