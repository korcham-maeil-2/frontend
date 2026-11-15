import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { MAX_KRW, parseWon } from './format';

// 금액 입력칸 하나 (비교표 확인 화면·내 생활비 화면 공통).
// '52만', '1억 2천만'처럼 한글 단위로 쳐도 원 단위로 읽는다. 1조 원이 넘는 값은 받지 않는다.
//
// [한글 입력기]
// 입력하는 동안 칸의 글자를 '520,000'처럼 바꿔 쓰면, 한글을 조합하던 중('52ㅁ')에 글자가 바뀌어
// '만'을 칠 수 없다. 그래서 칸에 커서가 있는 동안은 친 글자를 그대로 두고(값은 매번 읽어서 넘긴다),
// 칸을 떠날 때만 '520,000'처럼 정리해 보여 준다.

export const CONTROL_CLASS =
  'h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring';

const formatted = (value: number | null | undefined) =>
  value != null ? value.toLocaleString('ko-KR') : '';

export function MoneyInput({
  id,
  value,
  onChange,
  example,
  label,
  describedBy,
}: {
  id?: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  example: string;
  /** 보이는 라벨이 없을 때 화면 읽기 프로그램용 이름 */
  label?: string;
  describedBy?: string;
}) {
  // 커서가 있는 동안 친 글자. 커서가 없으면 null → 값을 정리한 모양으로 보여 준다.
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <div className="unit-input">
      <Input
        id={id}
        value={typing ?? formatted(value)}
        placeholder={`예: ${example}`}
        onFocus={() => setTyping(formatted(value))}
        onBlur={() => setTyping(null)}
        // 엔터를 '입력 끝'으로 누르는 사람이 많다 → 칸을 떠나지 않아도 '100,000'처럼 정리해 보여 준다.
        // keydown이 아니라 keyup: 한글 입력기는 엔터로 조합 중인 글자('만')를 먼저 확정하므로,
        // 확정된 글자가 값에 들어간 뒤(키에서 손을 뗄 때) 정리해야 마지막 글자가 빠지지 않는다.
        onKeyUp={(event) => {
          if (event.key === 'Enter') setTyping(null);
        }}
        onChange={(event) => {
          const text = event.target.value;
          const next = parseWon(text);
          if (next != null && next > MAX_KRW) return; // 1조 원이 넘는 값은 받지 않는다
          setTyping(text);
          onChange(next);
        }}
        className={CONTROL_CLASS}
        aria-label={label}
        aria-describedby={describedBy}
      />
      <span aria-hidden>원</span>
    </div>
  );
}
