import { useState, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { MAX_KRW, parseWon } from './format';

// 금액 입력칸 하나 (비교표 확인 화면·내 생활비 화면 공통).
// 숫자로 치면 되고('520000'), '52만', '1억 2천만'처럼 한글 단위로 쳐도 원 단위로 읽는다. 1조 원이 넘는 값은 받지 않는다.
//
// [쉼표와 한글 입력기]
// 숫자만 치는 동안은 바로 '520,000'처럼 쉼표를 넣어 보여 준다 (커서 위치는 그대로).
// 한글이 섞이면('52ㅁ', '52만') 친 글자를 그대로 둔다. 조합 중인 글자를 바꿔 쓰면 '만'을 칠 수 없어서다.
// 그때는 칸을 떠나거나 엔터를 누를 때 '520,000'처럼 정리한다.

export const CONTROL_CLASS =
  'h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring';

const formatted = (value: number | null | undefined) =>
  value != null ? value.toLocaleString('ko-KR') : '';

/** 숫자와 쉼표만 있는 글자인지 (한글 단위가 없어서 바로 쉼표를 넣어도 되는지) */
const DIGITS_ONLY = /^[\d,]*$/;

/**
 * 숫자만 친 글자에 쉼표를 넣고, 커서를 같은 숫자 뒤에 다시 둔다.
 * 예: '5900|00'(| = 커서) → '590,0|00'. 쉼표 개수가 바뀌어도 커서가 엉뚱한 곳으로 가지 않게 한다.
 */
function withCommas(event: ChangeEvent<HTMLInputElement>): string {
  const input = event.target;
  const text = input.value;
  const digitsBeforeCaret = text
    .slice(0, input.selectionStart ?? text.length)
    .replace(/,/g, '').length;
  const digits = text.replace(/,/g, '').replace(/^0+(?=\d)/, '');
  const shown = digits ? Number(digits).toLocaleString('ko-KR') : '';
  let caret = shown.length;
  for (let i = 0, seen = 0; i < shown.length; i++) {
    if (seen === digitsBeforeCaret) {
      caret = i;
      break;
    }
    if (shown[i] !== ',') seen++;
  }
  // 화면에 새 글자가 그려진 뒤 커서를 옮긴다
  requestAnimationFrame(() => input.setSelectionRange(caret, caret));
  return shown;
}

/**
 * 빈 칸에 보여 줄 예시. 예시는 '52만'처럼 한글 단위로 정해 두지만, 칸에는 숫자로 보여 준다
 * ('예: 520,000'). 대부분 숫자로 치기 때문이다. 친 금액은 칸 아래 작은 글씨로 '52만원'처럼 보인다.
 */
function placeholderOf(example: string) {
  const amount = parseWon(example);
  return `예: ${amount != null ? amount.toLocaleString('ko-KR') : example}`;
}

export function MoneyInput({
  id,
  value,
  onChange,
  example,
  label,
  describedBy,
  placeholder,
}: {
  id?: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  example: string;
  /** 보이는 라벨이 없을 때 화면 읽기 프로그램용 이름 */
  label?: string;
  describedBy?: string;
  /** 예시 대신 칸 안에 보일 글 (예: '비우면 0원' — 비울 때 어떻게 되는지) */
  placeholder?: string;
}) {
  // 커서가 있는 동안 친 글자. 커서가 없으면 null → 값을 정리한 모양으로 보여 준다.
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <div className="unit-input">
      <Input
        id={id}
        value={typing ?? formatted(value)}
        placeholder={placeholder ?? placeholderOf(example)}
        onFocus={() => setTyping(formatted(value))}
        onBlur={() => setTyping(null)}
        // 엔터를 '입력 끝'으로 누르는 사람이 많다 → 칸을 떠나지 않아도 '100,000'처럼 정리해 보여 준다.
        // keydown이 아니라 keyup: 한글 입력기는 엔터로 조합 중인 글자('만')를 먼저 확정하므로,
        // 확정된 글자가 값에 들어간 뒤(키에서 손을 뗄 때) 정리해야 마지막 글자가 빠지지 않는다.
        // 쉼표 바로 뒤에서 백스페이스(앞에서 Delete)를 누르면 쉼표만 지워졌다가 다시 붙어서
        // 커서만 움직이고 숫자는 그대로였다 → 커서를 쉼표 너머로 옮겨 숫자가 지워지게 한다.
        onKeyDown={(event) => {
          const input = event.currentTarget;
          const at = input.selectionStart;
          if (at == null || at !== input.selectionEnd) return;
          if (event.key === 'Backspace' && input.value[at - 1] === ',') {
            input.setSelectionRange(at - 1, at - 1);
          } else if (event.key === 'Delete' && input.value[at] === ',') {
            input.setSelectionRange(at + 1, at + 1);
          }
        }}
        onKeyUp={(event) => {
          if (event.key === 'Enter') setTyping(null);
        }}
        onChange={(event) => {
          const text = event.target.value;
          const next = parseWon(text);
          if (next != null && next > MAX_KRW) return; // 1조 원이 넘는 값은 받지 않는다
          setTyping(DIGITS_ONLY.test(text) ? withCommas(event) : text);
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
