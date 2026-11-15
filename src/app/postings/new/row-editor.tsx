import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import {
  MAX_MONTHS,
  MAX_PERCENT,
  badgeFor,
  formatWon,
  isImageRead,
  parseCount,
  salaryText,
  type Cell,
  type Row,
} from './format';
import { CONTROL_CLASS, MoneyInput } from './money-input';

// 비교표 한 행(공고 1건)을 보여 주고 고치는 부품.
// 칸마다 값 + 배지(확인/추정/입력/공고에 없음) + 공고 원문 조각을 함께 보여 준다.
// 사용자가 값을 바꾸면 그 칸은 '입력'(user_input)이 되고, 원래 값으로 되돌리면 원래 상태로 돌아온다.

type CellKey = {
  [K in keyof Row]-?: NonNullable<Row[K]> extends Cell ? K : never;
}[keyof Row];

type Field =
  | { key: CellKey; label: string; kind: 'text' }
  // example: 빈 칸에 보여 줄 입력 예시. 칸마다 금액 규모가 달라(연봉 vs 매달 수당) 꼭 따로 정한다.
  | { key: CellKey; label: string; kind: 'money'; example: string }
  | { key: CellKey; label: string; kind: 'months' }
  | { key: CellKey; label: string; kind: 'rate' }
  | { key: CellKey; label: string; kind: 'bool'; yes: string; no: string }
  | { key: CellKey; label: string; kind: 'choice'; options: [string, string][] }
  | { key: 'location'; label: string; kind: 'location' };

/** 식대·주거지원비·교통비·기타 수당처럼 매달 받는 금액 칸의 입력 예시. */
const MONTHLY_EXAMPLE = '10만';

const groups: { title: string; fields: Field[] }[] = [
  {
    title: '회사와 직무',
    fields: [
      { key: 'company', label: '회사명', kind: 'text' },
      { key: 'job_title', label: '직무', kind: 'text' },
      {
        key: 'hiring_track',
        label: '채용 구분',
        kind: 'choice',
        options: [
          ['신입', '신입'],
          ['경력', '경력'],
          ['무관', '신입·경력 무관'],
        ],
      },
      {
        key: 'employment_type',
        label: '고용형태',
        kind: 'choice',
        options: ['정규직', '계약직', '인턴', '파견', '프리랜서'].map((v) => [v, v]),
      },
      { key: 'location', label: '근무지', kind: 'location' },
    ],
  },
  {
    title: '급여',
    fields: [
      {
        key: 'salary_type',
        label: '급여 종류',
        kind: 'choice',
        options: [
          ['annual', '연봉'],
          ['monthly', '월급'],
          ['undisclosed', '공고에 금액 없음'],
          ['to_propose', '희망 연봉을 알려 달라고 함'],
        ],
      },
      { key: 'annual_salary_krw', label: '연봉 (세전)', kind: 'money', example: '3600만' },
      { key: 'monthly_salary_krw', label: '월급 (세전)', kind: 'money', example: '250만' },
      {
        key: 'meal_allowance_monthly_krw',
        label: '식대 (매달)',
        kind: 'money',
        example: MONTHLY_EXAMPLE,
      },
      {
        key: 'meal_allowance_in_salary',
        label: '식대가 연봉에',
        kind: 'bool',
        yes: '포함',
        no: '별도',
      },
      { key: 'probation_months', label: '수습 기간', kind: 'months' },
      { key: 'probation_pay_rate', label: '수습 급여', kind: 'rate' },
    ],
  },
  {
    title: '집과 통근',
    fields: [
      {
        key: 'housing_allowance_monthly_krw',
        label: '주거지원비 (매달)',
        kind: 'money',
        example: MONTHLY_EXAMPLE,
      },
      { key: 'housing_allowance_months', label: '주거지원 기간', kind: 'months' },
      { key: 'company_housing', label: '사택·기숙사', kind: 'bool', yes: '있음', no: '없음' },
      { key: 'shuttle_bus', label: '통근버스', kind: 'bool', yes: '있음', no: '없음' },
      {
        key: 'transport_allowance_monthly_krw',
        label: '교통비 (매달)',
        kind: 'money',
        example: MONTHLY_EXAMPLE,
      },
    ],
  },
  {
    title: '그 밖',
    fields: [
      { key: 'meals_provided', label: '식사 제공', kind: 'bool', yes: '있음', no: '없음' },
      { key: 'overtime', label: '연장·야간 근무', kind: 'text' },
    ],
  },
];

const UNITS: Partial<Record<Field['kind'], string>> = { money: '원', months: '개월', rate: '%' };

/** 급여 종류에 맞는 금액 칸만 보여 준다 (월급 공고에 연봉 칸을 띄우지 않는다). */
function hidden(row: Row, key: string) {
  const type = row.salary_type?.value;
  if (key === 'annual_salary_krw') return type === 'monthly';
  if (key === 'monthly_salary_krw') return type !== 'monthly';
  return false;
}

/** 월급 공고면 '식대가 연봉에' 대신 '식대가 월급에' */
function labelOf(row: Row, field: Field) {
  if (field.key === 'meal_allowance_in_salary' && row.salary_type?.value === 'monthly') {
    return '식대가 월급에';
  }
  return field.label;
}

function cellOf(row: Row, key: CellKey | 'location'): Cell {
  return (row[key] as Cell | undefined) ?? { status: 'missing' };
}

/** 값을 바꾼 새 칸. 원래 값으로 되돌리면 원래 칸(확인·추정 등)을 그대로 쓴다. */
function changed(original: Cell, value: unknown): Cell {
  const same = JSON.stringify(value ?? null) === JSON.stringify(original.value ?? null);
  return same ? original : { ...original, value, status: 'user_input', from_image: false };
}

/** 사용자가 '이 값이 맞아요'를 누른 칸: 값은 그대로, 사용자가 확인했으니 '입력'으로 */
function confirmed(cell: Cell): Cell {
  return { ...cell, status: 'user_input', from_image: false };
}

/** 다시 봐야 하는 칸: 추정·이미지에서 읽음. 고치거나 '맞아요'를 누르면 '입력'이 되어 빠진다. */
function needsCheck(cell: Cell) {
  return cell.status === 'estimated' || isImageRead(cell);
}

/** 화면에 보이는 칸 전부 (화면 순서): 숨은 칸(연봉 공고의 월급 칸 등)은 빼고, 기타 수당은 급여 뒤에 */
function visibleCells(row: Row): { id: string; key: CellKey | 'location' | null; cell: Cell }[] {
  const cells: { id: string; key: CellKey | 'location' | null; cell: Cell }[] = [];
  for (const group of groups) {
    for (const field of group.fields) {
      if (!hidden(row, field.key)) {
        cells.push({ id: fieldId(row, field.key), key: field.key, cell: cellOf(row, field.key) });
      }
    }
    if (group.title === '급여') {
      row.other_allowances?.forEach((allowance, i) => {
        cells.push({ id: fieldId(row, `other-${i}`), key: null, cell: allowance.monthly_krw });
      });
    }
  }
  return cells;
}

/** 금액을 받아야 하는 급여인지: 연봉 비공개·희망 연봉 질문만 빼고 (급여 종류를 못 읽은 경우도 받아야 한다) */
function expectsAmount(row: Row) {
  const type = row.salary_type?.value;
  return type !== 'undisclosed' && type !== 'to_propose';
}

/**
 * 이 공고에서 다시 볼 칸의 id (화면 순서). 회사 탭의 'n개 남음'과 '첫 칸으로 이동'에 쓴다.
 * 서버가 준 질문 목록이 아니라 지금 칸 상태로 센다 → 고치면 바로 줄어든다.
 *   - 추정·이미지에서 읽은 칸 (고치거나 '맞아요'를 누르면 빠진다)
 *   - 금액을 받아야 하는데 비어 있는 급여 칸 (계산에 꼭 필요. 연봉 비공개는 빼고)
 */
export function fieldsToCheck(row: Row): string[] {
  const amountKeys = new Set(['annual_salary_krw', 'monthly_salary_krw']);
  return visibleCells(row)
    .filter(({ key, cell }) => {
      const emptyAmount = key !== null && amountKeys.has(key) && cell.value == null;
      return needsCheck(cell) || (emptyAmount && expectsAmount(row));
    })
    .map(({ id }) => id);
}

type Question = { text: string; fields: string[] };

/** 서버의 칸 이름 → 이 화면의 칸 (기타 수당은 'other_allowances.0' → id 'other-0') */
function questionField(row: Row, field: string): { id: string; cell: Cell } {
  const allowance = /^other_allowances\.(\d+)$/.exec(field);
  if (allowance) {
    const i = Number(allowance[1]);
    return {
      id: fieldId(row, `other-${i}`),
      cell: row.other_allowances?.[i]?.monthly_krw ?? { status: 'missing' },
    };
  }
  return { id: fieldId(row, field), cell: cellOf(row, field as CellKey) };
}

/**
 * 아직 남은 '확인이 필요한 것'. 서버 목록은 처음 읽을 때 만든 그대로라, 질문이 가리키는 칸
 * (서버가 질문마다 fields로 알려 준다)의 문제가 풀리면 뺀다 → 탭의 '확인 끝'과 어긋나지 않는다.
 *   - 근무지: 시·군·구 코드(lawd_cd)를 정해야 풀린다 (글자만 있으면 아직)
 *   - 그 밖: 가리키는 칸 중 하나라도 비었거나 다시 볼 칸(추정·이미지에서 읽음)이면 남는다
 *   - 칸이 없는 질문(예: 연장근로 시간)은 계속 보여 준다
 * 누르면 갈 칸(target)은 아직 문제가 있는 첫 칸.
 */
type OpenQuestion = Question & { target: string | null };

function openQuestions(row: Row): OpenQuestion[] {
  // 예전 백엔드는 문장만 준다 → 칸 없는 질문으로 다룬다
  const questions: Question[] =
    row.questions?.map((q) => ({ text: q.text, fields: q.fields ?? [] })) ??
    (row.questions_to_ask ?? []).map((text) => ({ text, fields: [] }));
  return questions.flatMap<OpenQuestion>((question) => {
    if (!question.fields.length) return [{ ...question, target: null }];
    if (question.fields.includes('location')) {
      return row.location?.value?.lawd_cd
        ? []
        : [{ ...question, target: fieldId(row, 'location') }];
    }
    const open = question.fields
      .map((field) => questionField(row, field))
      .find(({ cell }) => cell.value == null || needsCheck(cell));
    return open ? [{ ...question, target: open.id }] : [];
  });
}

/** 칸으로 이동해 커서를 둔다 ('확인이 필요한 것', 연봉 빈칸 안내에서 쓴다) */
export function focusField(id: string) {
  const element = document.getElementById(id);
  element?.scrollIntoView({ block: 'center' });
  element?.focus({ preventScroll: true });
}

export function fieldId(row: Row, key: string) {
  return `${row.id}-${key}`;
}

export function RowEditor({
  row,
  original,
  onChange,
  index,
}: {
  row: Row;
  original: Row;
  onChange: (row: Row) => void;
  index: number;
}) {
  const number = index + 1;
  const company = row.company?.value?.trim();
  const questions = openQuestions(row);
  const place = [row.location?.value?.sido, row.location?.value?.sigungu].filter(Boolean).join(' ');

  function set(key: CellKey | 'location', value: unknown) {
    const next: Row = { ...row };
    if (key === 'location') {
      // 근무지 글자를 원래대로 되돌리면 원래 칸(시·군·구, 지역 코드 포함)을 그대로 쓴다.
      const raw = (value as { raw?: string } | null)?.raw;
      next.location =
        raw === original.location?.value?.raw
          ? original.location
          : (changed(cellOf(original, key), value) as Row['location']);
    } else {
      (next as Record<string, unknown>)[key] = changed(cellOf(original, key), value);
    }
    if (key === 'salary_type') {
      if (value === original.salary_type?.value) {
        // 원래 급여 종류로 되돌리면 금액 칸도 원래대로 돌린다.
        next.annual_salary_krw = original.annual_salary_krw;
        next.monthly_salary_krw = original.monthly_salary_krw;
      } else {
        // 급여 종류를 바꾸면 화면에서 사라지는 금액 칸은 비운다 (숨은 값이 서버로 가지 않게).
        const hiddenKey = value === 'monthly' ? 'annual_salary_krw' : 'monthly_salary_krw';
        if (row[hiddenKey]?.value != null) {
          next[hiddenKey] = changed(cellOf(original, hiddenKey), null) as Row[typeof hiddenKey];
        }
      }
    }
    onChange(next);
  }

  function confirm(key: CellKey | 'location') {
    onChange({ ...row, [key]: confirmed(cellOf(row, key)) });
  }

  function setAllowance(i: number, monthly: (item: Cell, original: Cell) => Cell) {
    onChange({
      ...row,
      other_allowances: row.other_allowances?.map((item, j) =>
        j === i
          ? {
              ...item,
              monthly_krw: monthly(
                item.monthly_krw,
                original.other_allowances?.[j]?.monthly_krw ?? { status: 'missing' },
              ) as typeof item.monthly_krw,
            }
          : item,
      ),
    });
  }

  return (
    <section className="row-card" aria-labelledby={`${row.id}-title`}>
      {/* 공고마다 번호와 요약이 있는 머리띠를 둬서, 카드가 길어도 어느 공고인지 바로 보이게 한다. */}
      <header className="row-card-head">
        <span className="row-card-number" aria-hidden>
          {number}
        </span>
        <div className="min-w-0">
          <p className="row-card-index">공고 {number}</p>
          <h3 id={`${row.id}-title`} className="row-title">
            <span className="sr-only">공고 {number}: </span>
            {company || '회사명 없음'}
          </h3>
          <p className="row-card-meta">{[place, salaryText(row)].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      <div className="row-card-body">
        {questions.length > 0 && (
          <div className="row-questions">
            <p className="font-semibold">확인이 필요한 것</p>
            <ul>
              {questions.map(({ text, target }) => (
                <li key={text}>
                  {target ? (
                    <button
                      type="button"
                      className="question-link"
                      onClick={() => focusField(target)}
                    >
                      {text}
                    </button>
                  ) : (
                    text
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {groups.map((group) => (
          <fieldset key={group.title} className="row-group">
            <legend>{group.title}</legend>
            {group.fields
              .filter((field) => !hidden(row, field.key))
              .map((field) => (
                <FieldRow
                  key={field.key}
                  id={fieldId(row, field.key)}
                  field={{ ...field, label: labelOf(row, field) } as Field}
                  cell={cellOf(row, field.key)}
                  onChange={(value) => set(field.key, value)}
                  onConfirm={() => confirm(field.key)}
                />
              ))}
            {group.title === '급여' &&
              row.other_allowances?.map((allowance, i) => (
                <FieldRow
                  key={`other-${allowance.name}`}
                  id={fieldId(row, `other-${i}`)}
                  field={{
                    key: 'company',
                    label: `${allowance.name} (매달)`,
                    kind: 'money',
                    example: MONTHLY_EXAMPLE,
                  }}
                  cell={allowance.monthly_krw}
                  onChange={(value) => setAllowance(i, (_, first) => changed(first, value))}
                  onConfirm={() => setAllowance(i, (cell) => confirmed(cell))}
                />
              ))}
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function FieldRow({
  id,
  field,
  cell,
  onChange,
  onConfirm,
}: {
  id: string;
  field: Field;
  cell: Cell;
  onChange: (value: unknown) => void;
  /** 다시 볼 칸(추정·이미지에서 읽음)의 값이 맞다고 확인 */
  onConfirm: () => void;
}) {
  const badge = badgeFor(cell);
  const hintId = `${id}-hint`;
  const unit = UNITS[field.kind];
  const control = CONTROL_CLASS;
  let input: ReactNode;
  let hint: string | null = null;

  switch (field.kind) {
    case 'text':
      input = (
        <Input
          id={id}
          value={(cell.value as string | null) ?? ''}
          placeholder="직접 입력"
          onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)}
          className={control}
          aria-describedby={hintId}
        />
      );
      break;
    case 'money': {
      const value = cell.value as number | null | undefined;
      hint = value != null ? formatWon(value) : null;
      input = (
        <MoneyInput
          id={id}
          value={value}
          onChange={onChange}
          example={field.example}
          describedBy={hintId}
        />
      );
      break;
    }
    case 'months':
      input = (
        <div className="unit-input">
          <Input
            id={id}
            inputMode="numeric"
            value={(cell.value as number | null | undefined)?.toString() ?? ''}
            placeholder="직접 입력"
            onChange={(event) => {
              const next = parseCount(event.target.value);
              if (next != null && next > MAX_MONTHS) return;
              onChange(next);
            }}
            className={control}
            aria-describedby={hintId}
          />
          <span aria-hidden>개월</span>
        </div>
      );
      break;
    case 'rate': {
      const value = cell.value as number | null | undefined;
      input = (
        <div className="unit-input">
          <Input
            id={id}
            inputMode="numeric"
            value={value != null ? String(Math.round(value * 100)) : ''}
            placeholder="예: 90"
            onChange={(event) => {
              const percent = parseCount(event.target.value);
              if (percent != null && percent > MAX_PERCENT) return; // 100%까지
              onChange(percent == null ? null : percent / 100);
            }}
            className={control}
            aria-describedby={hintId}
          />
          <span aria-hidden>%</span>
        </div>
      );
      break;
    }
    case 'bool':
      input = (
        <select
          id={id}
          value={cell.value == null ? '' : String(cell.value)}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : event.target.value === 'true')
          }
          className={control}
          aria-describedby={hintId}
        >
          <option value="">모름</option>
          <option value="true">{field.yes}</option>
          <option value="false">{field.no}</option>
        </select>
      );
      break;
    case 'choice':
      input = (
        <select
          id={id}
          value={(cell.value as string | null) ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          className={control}
          aria-describedby={hintId}
        >
          <option value="">모름</option>
          {field.options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      );
      break;
    case 'location': {
      const location = cell.value as
        { raw?: string; sido?: string | null; sigungu?: string | null } | null | undefined;
      if (location?.sido) {
        hint = [location.sido, location.sigungu].filter(Boolean).join(' ');
      } else if (location?.raw) {
        hint = '시·군·구를 정하지 못했어요. 계산할 때 다시 확인해요.';
      }
      input = (
        <Input
          id={id}
          value={location?.raw ?? ''}
          placeholder="예: 경기 성남시 분당구"
          onChange={(event) =>
            // 근무지를 고치면 지역 코드는 비운다 (코드표에서 다시 찾아야 한다).
            onChange(event.target.value.trim() ? { raw: event.target.value } : null)
          }
          className={control}
          aria-describedby={hintId}
        />
      );
      break;
    }
  }

  return (
    <div className="row-field">
      <label htmlFor={id}>
        {field.label}
        {/* 화면에는 입력칸 옆에 단위가 보이고, 화면 읽기 프로그램은 라벨에서 단위를 듣는다. */}
        {unit && <span className="sr-only"> (단위: {unit})</span>}
      </label>
      {input}
      <span className={`status-badge ${badge.className}`}>{badge.label}</span>
      <p id={hintId} className="row-field-hint">
        {needsCheck(cell) && (
          <button type="button" className="confirm-link" onClick={onConfirm}>
            이 값이 맞아요
          </button>
        )}
        {hint && <span className="text-foreground">{hint}</span>}
        {cell.source_text && (
          <span>
            {hint ? ' · ' : ''}
            {cell.from_image ? '이미지에서 옮긴 글' : '공고'}: “{cell.source_text}”
          </span>
        )}
      </p>
    </div>
  );
}
