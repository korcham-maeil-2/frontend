'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 스크롤 등장 애니메이션 상태.
 * - 'idle': 아직 스크립트 준비 전(서버 HTML 그대로). 아무것도 숨기지 않는다.
 * - 'static': 준비됐을 때 이미 화면 안에 있었다. 보이던 걸 다시 숨기면 깜빡이니 등장 효과 없이 둔다.
 * - 'armed': 화면 밖에 있다. 안 보이는 동안만 숨겨 두었다가
 * - 'shown': 화면 아래쪽 15% 선을 넘어 들어오면 등장 효과를 재생한다(한 번만).
 * 스크립트가 늦거나 실패하면 'idle'에 머물러 내용이 그대로 보인다.
 */
export type Reveal = 'idle' | 'static' | 'armed' | 'shown';

/** target: 등장 여부를 판정할 안쪽 요소(없으면 ref 요소 자신). 제목만 살짝 보이는 상태를 '이미 보임'으로 치지 않으려고 쓴다. */
export function useReveal<T extends Element>(target?: string) {
  const ref = useRef<T>(null);
  const [reveal, setReveal] = useState<Reveal>('idle');

  useEffect(() => {
    const element = (target && ref.current?.querySelector(target)) || ref.current;
    if (!element) return;
    let first = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (first) {
          first = false;
          // 첫 판정: 조금이라도 화면에 걸쳐 있으면 숨기지 않는다(첫 화면 아래가 비어 보이지 않게, 아래에 내용이 더 있다는 신호로 남긴다)
          const onScreen =
            entry.boundingClientRect.top < window.innerHeight &&
            entry.boundingClientRect.bottom > 0;
          setReveal(onScreen ? 'static' : 'armed');
          if (onScreen) observer.disconnect();
          return;
        }
        if (entry.isIntersecting) {
          setReveal('shown');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return [ref, reveal] as const;
}
