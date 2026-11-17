'use client';

import { Popover } from '@base-ui/react/popover';
import type { Badge } from './format';

/** 출처 창의 한 항목: 이름표(계산·출처·기준·이유) + 짧은 설명. 줄글 한 덩어리 대신 줄로 나눠 읽기 쉽게 한다.
 *  설명이 여럿이면(이유 두 가지 등) 배열로 주고, 한 줄에 하나씩 보인다. */
export type Detail = { label: string; text: string | string[] };

/**
 * 신뢰도 배지 (확인 / 추정 / 입력). 보여 줄 출처(details)가 있으면 누르거나 마우스를 올려 여는 창이 되고,
 * 없으면 그냥 글자 배지다 — 열어도 뜻 한 줄뿐인 창으로 Tab 멈출 곳만 늘리지 않게.
 * 표 칸에는 숫자와 배지만 두고 긴 출처 글은 창으로 옮겨, 숫자가 많아도 표가 길어지지 않게 한다.
 * 휴대폰은 누르기, 키보드는 Tab으로 가서 Enter로 연다 (Base UI Popover).
 * subject: 화면 읽기 프로그램이 어느 값의 배지인지 알 수 있게 ('세후 월급 추정, 출처 보기').
 */
export function SourceBadge({
  badge,
  details = [],
  subject,
  className = '',
}: {
  badge: Badge;
  details?: Detail[];
  subject?: string;
  className?: string;
}) {
  const classes = `status-badge ${badge.className} ${className}`;
  if (details.length === 0) return <span className={classes}>{badge.label}</span>;
  return (
    <Popover.Root>
      {/* 배지가 세로로 줄지어 있어, 마우스를 지나가기만 해도 창이 연달아 뜨지 않게 조금 기다린다 */}
      <Popover.Trigger openOnHover delay={300} className={`${classes} source-badge`}>
        {subject && <span className="sr-only">{subject} </span>}
        {badge.label}
        <span className="sr-only">, 출처 보기</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={16} className="source-positioner">
          <Popover.Popup className="source-popup">
            {/* 창의 이름 (화면 읽기 프로그램이 "추정, 실제와 다를 수 있는 값" 창으로 읽는다). 제목 글꼴이 붙지 않게 p로 */}
            <Popover.Title className="source-head" render={<p />}>
              <span className={`status-badge ${badge.className}`}>{badge.label}</span>
              {badge.meaning}
            </Popover.Title>
            <dl className="source-details">
              {details.map((detail, i) => (
                // 같은 이름표가 두 번 와도 키가 겹치지 않게 순서로 (목록은 다시 정렬되지 않는다)
                <div key={i}>
                  <dt>{detail.label}</dt>
                  <dd>
                    {[detail.text].flat().map((line, j) => (
                      <span key={j} className="block">
                        {line}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
            {/* 화면 읽기 프로그램용 닫기 (눈으로는 Esc나 바깥 누르기로 닫는다) */}
            <Popover.Close className="sr-only">닫기</Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** 배지 범례: 긴 설명 문장 대신 배지와 짧은 뜻을 나란히 (결과 표 아래, 조건 확인 화면 위) */
export function BadgeLegend({
  badges,
  hint,
  className = '',
}: {
  badges: Badge[];
  hint?: string;
  className?: string;
}) {
  return (
    <p className={`badge-legend ${className}`}>
      {badges.map((badge) => (
        <span key={badge.label}>
          <span className={`status-badge ${badge.className}`}>{badge.label}</span>
          {badge.meaning}
        </span>
      ))}
      {hint && <span>{hint}</span>}
    </p>
  );
}
