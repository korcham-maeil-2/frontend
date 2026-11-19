import type { ReactNode } from 'react';

/**
 * 404·오류처럼 '무슨 일이 생겼고, 다음에 무엇을 하면 되는지'만 보여 주는 화면.
 * 안내 패널(bg-muted rounded-2xl) 하나에 제목 → 설명 → 버튼 순서 (DESIGN.md '안내 패널').
 */
export function NoticePage({
  label,
  title,
  children,
  actions,
}: {
  /** 제목 위 작은 이름표 (예: '404') */
  label: string;
  title: string;
  /** 설명 문장 (17px 본문색) */
  children: ReactNode;
  /** 버튼들. 주 행동 하나만 코발트 */
  actions: ReactNode;
}) {
  return (
    <section className="notice-page" aria-labelledby="notice-title">
      <p className="notice-label">{label}</p>
      <h1 id="notice-title" className="notice-title">
        {title}
      </h1>
      <div className="notice-body">{children}</div>
      <div className="notice-actions">{actions}</div>
    </section>
  );
}
