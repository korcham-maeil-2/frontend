'use client';

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { postingNames, type Row } from './format';

// 회사 탭: 조건 확인·내 생활비에서 공고(회사)를 하나씩 골라 본다.
//   - '방식 고르기'(본문/파일, 더 남는 쪽/통근/이사)는 회색 둥근 스위치(.source-tabs),
//     '회사 고르기'는 아래 내용과 붙은 폴더 탭(.posting-tabs) — 생김새로 구분한다.
//   - 탭마다 남은 일을 글자로 쓴다: 'n개 남음' / '열어 봄' / '아직 안 봄' (색만으로 구분하지 않는다)
//   - 공고가 하나뿐이면 탭을 그리지 않는다.
//   - 키보드: ←/→ 로 탭 이동, Home/End 로 처음·끝 (WAI-ARIA 탭 패턴)

/** remaining: 남은 일 수, seen: 열어 봤는지, todoLabel: 남은 일을 다르게 부를 때 (예: '골라 주세요') */
export type TabStatus = { remaining: number; seen: boolean; todoLabel?: string };

const tabId = (row: Row) => `posting-tab-${row.id}`;
const panelId = (row: Row) => `posting-panel-${row.id}`;

export function companyName(rows: Row[], index: number) {
  return postingNames(rows.map((row) => row.company?.value))[index];
}

function tabState({ remaining, seen }: TabStatus): 'todo' | 'done' | 'unseen' {
  if (remaining > 0) return 'todo';
  return seen ? 'done' : 'unseen';
}

export function PostingTabs({
  rows,
  activeId,
  onSelect,
  status,
  label,
  doneLabel = '열어 봄',
  children,
}: {
  rows: Row[];
  activeId: string;
  onSelect: (id: string) => void;
  status: (row: Row) => TabStatus;
  label: string;
  /** 남은 일이 없을 때 탭에 쓸 말 (조건 확인: '열어 봄', 내 생활비: '채울 칸 없음') */
  doneLabel?: string;
  /** 고른 공고의 내용. 공고가 하나면 탭 없이 이것만 그린다. */
  children: ReactNode;
}) {
  // 탭이 많아 가로로 넘칠 때, 고른 탭이 보이도록 탭 줄만 가로로 민다.
  // (scrollIntoView는 페이지까지 위아래로 움직여, 단계를 바꾸며 맨 위로 올린 화면이 내려간다)
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const right = tab.offsetLeft + tab.offsetWidth;
    if (tab.offsetLeft < list.scrollLeft) list.scrollLeft = tab.offsetLeft;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
  }, [activeId]);

  if (rows.length < 2) return <>{children}</>;
  const index = Math.max(
    0,
    rows.findIndex((row) => row.id === activeId),
  );
  const active = rows[index];
  const next = rows[index + 1];

  function select(i: number) {
    const row = rows[(i + rows.length) % rows.length];
    onSelect(row.id);
    // 탭을 바꾸면 키보드 포커스도 따라간다 (화살표로 옮겨 다닐 때)
    requestAnimationFrame(() => document.getElementById(tabId(row))?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: rows.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(moves[event.key]);
  }

  return (
    <div className="posting-tabs-wrap">
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="posting-tabs"
        onKeyDown={onKeyDown}
      >
        {rows.map((row, i) => {
          const selected = row.id === active.id;
          const s = status(row);
          const state = tabState(s);
          return (
            <button
              key={row.id}
              id={tabId(row)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(row)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(row.id)}
            >
              <span className="posting-tab-name">{companyName(rows, i)}</span>
              <span className="posting-tab-status" data-state={state}>
                {state === 'todo'
                  ? (s.todoLabel ?? `${s.remaining}개 남음`)
                  : state === 'done'
                    ? doneLabel
                    : '아직 안 봄'}
              </span>
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={panelId(active)}
        aria-labelledby={tabId(active)}
        className="posting-panel"
      >
        {children}
        {next ? (
          <div className="posting-next">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => select(index + 1)}
            >
              다음 공고: {companyName(rows, index + 1)} <ArrowRight aria-hidden />
            </Button>
          </div>
        ) : (
          // 마지막 공고: '다음 공고' 자리에서 다음 행동을 알려 준다 (주 버튼은 아래 하나만)
          <p className="posting-last">마지막 공고예요. 다 봤으면 아래 버튼으로 넘어가세요.</p>
        )}
      </div>
    </div>
  );
}
