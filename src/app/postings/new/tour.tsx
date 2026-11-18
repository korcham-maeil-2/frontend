'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Popover } from '@base-ui/react/popover';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Row } from './format';
import { EMPTY_POSTING_COSTS, type PostingCostsForm, type ProfileForm } from './profile';
import type { Step } from './steps';

// 예시로 사용법 보기: 진짜 화면 위에 말풍선(팝오버)을 하나씩 띄워 다섯 단계를 차례로 알려 준다.
//   설명 말풍선: '다음'을 누르면 다음 말풍선으로
//   할 일 말풍선(press): 가리킨 버튼을 사용자가 직접 누르면, 다음 단계 화면의 말풍선으로
// 예시 공고 + 예시 생활비라 백엔드는 미리 써 둔 공고 정리·기억해 둔 AI 리포트를 쓴다 (비용 0원).
// 말풍선이 가리키는 곳(target)은 CSS 선택자다. 따로 id가 없는 버튼·상자에는 data-tour 이름을 붙였다.

type Stop = { step: Step; target: string; title: string; body: string; press?: boolean };

const STOPS: Stop[] = [
  {
    step: 'input',
    target: '#posting-text-0',
    title: '공고를 붙여 넣는 곳이에요',
    body: "가상 회사 두 곳의 공고를 넣어 뒀어요. 실제로 쓸 때는 채용 공고 본문을 복사해 넣거나, 위 '파일 첨부'에 캡처·PDF·엑셀을 올리면 돼요.",
  },
  {
    step: 'input',
    target: '[data-tour="read"]',
    title: "'조건 확인하기'를 눌러 보세요",
    body: 'AI가 공고마다 연봉·근무지·수당을 찾아 같은 칸으로 정리해요.',
    press: true,
  },
  {
    step: 'review',
    target: '[data-tour="review-todo"]',
    title: 'AI가 읽은 값을 확인해요',
    body: '칸마다 공고 원문을 같이 보여 줘요. 공고와 맞는지 다시 볼 값은 여기에 모아 둬요. 틀린 값은 그 칸에서 바로 고치면 돼요.',
  },
  {
    step: 'review',
    target: '[data-tour="review-next"]',
    title: "'다음'을 눌러 보세요",
    body: '회사 탭을 누르면 다른 회사의 조건도 볼 수 있어요.',
    press: true,
  },
  {
    step: 'living',
    target: '#current-housing',
    title: '공고에 없는 내 생활비예요',
    body: '빈칸에 예시 값을 넣어 뒀어요. 지금 집 월세, 통근 교통비, 고정비처럼 남는 돈을 바꾸는 값이에요. 이사할 집 월세는 비워 두면 그 동네 실거래가로 계산해요.',
  },
  {
    step: 'living',
    target: '[data-tour="calculate"]',
    title: "'매달 남는 돈 계산하기'를 눌러 보세요",
    body: '세금·4대보험과 생활비를 빼고, 회사마다 매달 얼마가 남는지 계산해요.',
    press: true,
  },
  {
    step: 'result',
    target: '[data-tour="result-modes"]',
    title: '회사마다 매달 남는 돈이에요',
    body: '지금 집에서 통근할 때와 회사 근처로 이사할 때를 나눠 계산했어요. 이 버튼으로 비교할 경우를 바꿔 볼 수 있어요.',
  },
  {
    step: 'result',
    target: '[data-tour="plan-next"]',
    title: "'1년 정착 플랜 보기'를 눌러 보세요",
    body: '입사하고 1년 동안 챙길 청년 지원·적금·할 일을 모아 줘요.',
    press: true,
  },
  {
    step: 'plan',
    target: '[data-tour="title"]',
    title: '1년 동안 챙길 일이에요',
    body: '회사마다 받을 수 있는 지원과 할 일을 순서대로 모았어요. 이제 실제 공고로 비교해 보세요.',
  },
];

/**
 * 단계를 옮길 때: 앞으로 간 단계의 첫 말풍선으로 ('다음'을 건너뛰고 버튼을 바로 눌러도 따라간다).
 * 뒤로 간 단계면 그대로 둔다 (그 단계로 돌아오면 보던 말풍선이 다시 보인다).
 */
export function stopAfterStep(at: number, step: Step): number {
  if (STOPS[at]?.step === step) return at;
  const ahead = STOPS.findIndex((stop, i) => i > at && stop.step === step);
  return ahead >= 0 ? ahead : at;
}

// 예시 회사마다 비용 (회사 이름으로 찾는다: 공고 순서가 바뀌어도 맞게)
const EXAMPLE_COSTS: [company: string, costs: PostingCostsForm][] = [
  ['이음데이터랩', { ...EMPTY_POSTING_COSTS, commuteTransport: 110_000, considerMove: false }],
  ['빛가람그리드', { ...EMPTY_POSTING_COSTS, canCommute: false, moveTransport: 100_000 }],
];

/**
 * 예시 생활비: 시연용 가상 사용자 A (backend data/demo/users/user_a.json). 비어 있는 칸만 채운다
 * (예전 비교에서 넣어 둔 내 값은 그대로). 판교는 지금 집에서 통근, 나주는 이사 + 한 달에 한 번
 * 서울 왕복. 나주 이사할 집 월세는 비워서 실거래가 시세로 계산한다.
 */
export function tutorialProfile(form: ProfileForm, rows: Row[]): ProfileForm {
  return {
    ...form,
    currentHousing: form.currentHousing ?? 590_000, // 월세 52만 + 관리비 7만
    fixedExpenses: form.fixedExpenses.length
      ? form.fixedExpenses
      : [
          { name: '학자금 대출 상환', amount: 150_000 },
          { name: '통신비', amount: 55_000 },
        ],
    postings: Object.fromEntries(
      rows.flatMap((row) => {
        const found = EXAMPLE_COSTS.find(([company]) => row.company?.value?.includes(company));
        return found ? [[row.id, found[1]]] : [];
      }),
    ),
    age: form.age ?? 26,
  };
}

const SCROLL_ABOVE = 96; // 가리킨 곳 위로 남길 여백(px): 위에 무엇이 있는지 조금 보이게

const targetOf = (stop: Stop | undefined) =>
  stop ? document.querySelector<HTMLElement>(stop.target) : null;

/**
 * 화면이 바뀔 때마다(요소가 생기고 사라지거나 숨겨질 때) 알린다. 사용법을 보는 동안만 지켜본다.
 * 본문(main)만 본다: body 전체를 보면 말풍선이 스크롤마다 자기 위치(style)를 바꾸는 것까지 잡힌다
 */
function subscribeToPage(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.getElementById('main-content') ?? document.body, {
    subtree: true,
    childList: true,
    attributes: true,
  });
  return () => observer.disconnect();
}

/** 사용자가 글을 쓰는 중인지 (그때는 커서·스크롤을 뺏지 않는다) */
const typing = () =>
  !!document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');

/**
 * 지금 말풍선. 그 말풍선의 단계 화면이 아니면(앞 단계로 돌아감, 읽는 중·오류) 숨겨 두고 기다린다.
 * 가리킬 곳이 화면에 없을 때도 숨긴다 ('파일 첨부' 탭으로 바꿈, 되묻기로 계산 버튼이 바뀜).
 * Esc나 '그만 보기'로 끝낸다. 말풍선 밖을 눌러도 닫지 않는다 (가리킨 버튼을 눌러야 하므로).
 */
export function Tour({
  at,
  shown,
  paused,
  onNext,
  onEnd,
}: {
  at: number;
  shown: Step;
  paused: boolean;
  onNext: () => void;
  onEnd: () => void;
}) {
  const stop = STOPS[at];
  const targetShown = useSyncExternalStore(
    subscribeToPage,
    () => (targetOf(stop)?.getClientRects().length ?? 0) > 0, // 숨겨진(display: none) 요소는 0
    () => false,
  );
  const open = !!stop && stop.step === shown && !paused && targetShown;
  const next = useRef<HTMLButtonElement>(null);

  // 가리킨 곳을 화면으로 가져와 테두리로 표시하고 커서를 둔다: 할 일 말풍선은 그 버튼(Enter로 누르게),
  // 설명 말풍선은 '다음'에
  useEffect(() => {
    const target = open ? targetOf(stop) : null;
    if (!target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.classList.add('tour-target');
    // 숨었던 말풍선이 글을 고치는 중에 다시 보이면(오류가 풀림) 테두리만: 치던 글자가 버튼으로 가지 않게
    if (typing()) return () => target.classList.remove('tour-target');
    // 가리킨 곳을 화면 위쪽(위 여백 SCROLL_ABOVE)으로. 가운데로 두면 큰 칸 아래 말풍선이 좁은 휴대폰
    // 화면 밖으로 나간다. scrollIntoView는 칸을 감싼 overflow 상자 때문에 위 여백(scroll-margin)을 무시한다
    window.scrollTo({
      top: window.scrollY + target.getBoundingClientRect().top - SCROLL_ABOVE,
      behavior: reduce ? 'auto' : 'smooth',
    });
    // 한 프레임 뒤에: 단계가 바뀌면 화면이 제목에 커서를 두는데(page.tsx changeStep), 그다음이어야 한다.
    // 스크롤 없이 옮긴다 (기본 포커스는 스크롤까지 해서 가리킨 곳이 밀려난다)
    const frame = requestAnimationFrame(() =>
      (stop.press ? target : next.current)?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(frame);
      target.classList.remove('tour-target');
    };
  }, [open, stop]);

  if (!stop) return null;
  const last = at === STOPS.length - 1;
  return (
    <Popover.Root
      key={at} // 말풍선마다 새로 연다 (처음 커서 자리를 말풍선마다 정한다)
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && details.reason === 'escape-key') onEnd();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={() => targetOf(stop)}
          sideOffset={12}
          collisionPadding={16}
          className="tour-positioner"
        >
          <Popover.Popup
            className="tour-popup"
            initialFocus={false} // 커서는 위 effect가 옮긴다
            finalFocus={false}
          >
            <Popover.Arrow className="tour-arrow" />
            <p className="tour-count">
              사용법 {at + 1} / {STOPS.length}
            </p>
            <Popover.Title className="tour-title">{stop.title}</Popover.Title>
            <Popover.Description className="tour-body">{stop.body}</Popover.Description>
            <div className="tour-actions">
              {!last && (
                <Button variant="ghost" className="min-h-11" onClick={onEnd}>
                  그만 보기
                </Button>
              )}
              {!stop.press && (
                <Button ref={next} className="min-h-11" onClick={last ? onEnd : onNext}>
                  {last ? '다 봤어요' : '다음'} {!last && <ArrowRight aria-hidden />}
                </Button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
