import type { ReactNode } from 'react';

// 선택지가 짧은 칸은 펼침 목록 대신 동그란 라디오를 한 줄로 늘어놓는다 (가족 수, 있음/없음/모름 등).
// 한 번에 다 보이고 한 번 눌러 고른다. 진짜 라디오라 화살표로 옮기고 화면 읽기 프로그램이 '3개 중 1번째'로 읽는다.
//   - id는 묶음에 붙인다: focusField(id)가 고른 칸(없으면 첫 칸)으로 커서를 옮긴다 (row-editor.tsx)
//   - name은 칸마다 달라야 한다 (공고가 여럿이면 같은 칸이 여러 번 그려진다)

export type ChoiceOption<T> = { value: T; label: string; muted?: boolean };

export function ChoiceRow<T extends string | number | boolean | null>({
  id,
  name,
  labelledBy,
  describedBy,
  value,
  options,
  onChange,
  children,
}: {
  id?: string;
  name: string;
  labelledBy: string;
  describedBy?: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  /** 줄 끝에 붙일 것 (예: '6명 이상'을 고르면 나오는 숫자 칸) */
  children?: ReactNode;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="choice-row"
    >
      {options.map((option) => (
        <label key={String(option.value)} className={option.muted ? 'choice is-muted' : 'choice'}>
          <input
            type="radio"
            name={name}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
      {children}
    </div>
  );
}
