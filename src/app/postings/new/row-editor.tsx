import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import {
  MAX_KRW,
  MAX_MONTHS,
  MAX_PERCENT,
  badgeFor,
  formatWon,
  parseCount,
  parseWon,
  salaryText,
  type Row,
  type Status,
} from './format';

// 비교표 한 행(공고 1건)을 보여 주고 고치는 부품.
// 칸마다 값 + 배지(확인/추정/입력/공고에 없음) + 공고 원문 조각을 함께 보여 준다.
// 사용자가 값을 바꾸면 그 칸은 '입력'(user_input)이 되고, 원래 값으로 되돌리면 원래 상태로 돌아온다.

type Cell = { value?: unknown; status: Status; source_text?: string | null };
type CellKey = {
  [K in keyof Row]-?: NonNullable<Row[K]> extends Cell ? K : never;
}[keyof Row];

type Field =
  | { key: CellKey; label: string; kind: 'text' }
  | { key: CellKey; label: string; kind: 'money' }
  | { key: CellKey; label: string; kind: 'months' }
  | { key: CellKey; label: string; kind: 'rate' }
  | { key: CellKey; label: string; kind: 'bool'; yes: string; no: string }
  | { key: CellKey; label: string; kind: 'choice'; options: [string, string][] }
  | { key: 'location'; label: string; kind: 'location' };

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
      { key: 'annual_salary_krw', label: '연봉 (세전)', kind: 'money' },
      { key: 'monthly_salary_krw', label: '월급 (세전)', kind: 'money' },
      { key: 'meal_allowance_monthly_krw', label: '식대 (매달)', kind: 'money' },
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
      { key: 'housing_allowance_monthly_krw', label: '주거지원비 (매달)', kind: 'money' },
      { key: 'housing_allowance_months', label: '주거지원 기간', kind: 'months' },
      { key: 'company_housing', label: '사택·기숙사', kind: 'bool', yes: '있음', no: '없음' },
      { key: 'shuttle_bus', label: '통근버스', kind: 'bool', yes: '있음', no: '없음' },
      { key: 'transport_allowance_monthly_krw', label: '교통비 (매달)', kind: 'money' },
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

/** '확인이 필요한 것' 문장 → 고칠 칸. 칸이 없는 질문(예: 연장근로 시간)은 null */
function questionTarget(row: Row, question: string): CellKey | 'location' | null {
  if (question.startsWith('제시받은 연봉') || question.startsWith('연봉 금액')) {
    return row.salary_type?.value === 'monthly' ? 'monthly_salary_krw' : 'annual_salary_krw';
  }
  if (question.startsWith('월급 금액')) return 'monthly_salary_krw';
  if (question.startsWith('수습 기간 급여')) return 'probation_pay_rate';
  if (question.startsWith('식대가')) return 'meal_allowance_in_salary';
  if (question.startsWith('주거지원비 지원 기간')) return 'housing_allowance_months';
  if (question.startsWith('근무지')) return 'location';
  return null;
}

function cellOf(row: Row, key: CellKey | 'location'): Cell {
  return (row[key] as Cell | undefined) ?? { status: 'missing' };
}

/** 값을 바꾼 새 칸. 원래 값으로 되돌리면 원래 칸(확인·추정 등)을 그대로 쓴다. */
function changed(original: Cell, value: unknown): Cell {
  const same = JSON.stringify(value ?? null) === JSON.stringify(original.value ?? null);
  return same ? original : { ...original, value, status: 'user_input' };
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
        {(row.questions_to_ask?.length ?? 0) > 0 && (
          <div className="row-questions">
            <p className="font-semibold">확인이 필요한 것</p>
            <ul>
              {row.questions_to_ask?.map((question) => {
                const target = questionTarget(row, question);
                return (
                  <li key={question}>
                    {target ? (
                      <button
                        type="button"
                        className="question-link"
                        onClick={() => focusField(fieldId(row, target))}
                      >
                        {question}
                      </button>
                    ) : (
                      question
                    )}
                  </li>
                );
              })}
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
                />
              ))}
            {group.title === '급여' &&
              row.other_allowances?.map((allowance, i) => (
                <FieldRow
                  key={`other-${allowance.name}`}
                  id={fieldId(row, `other-${i}`)}
                  field={{ key: 'company', label: `${allowance.name} (매달)`, kind: 'money' }}
                  cell={allowance.monthly_krw}
                  onChange={(value) =>
                    onChange({
                      ...row,
                      other_allowances: row.other_allowances?.map((item, j) =>
                        j === i
                          ? {
                              ...item,
                              monthly_krw: changed(
                                original.other_allowances?.[j]?.monthly_krw ?? {
                                  status: 'missing',
                                },
                                value,
                              ) as typeof item.monthly_krw,
                            }
                          : item,
                      ),
                    })
                  }
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
}: {
  id: string;
  field: Field;
  cell: Cell;
  onChange: (value: unknown) => void;
}) {
  const badge = badgeFor(cell);
  const hintId = `${id}-hint`;
  const unit = UNITS[field.kind];
  const control =
    'h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring';
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
        <div className="unit-input">
          <Input
            id={id}
            inputMode="numeric"
            value={value != null ? value.toLocaleString('ko-KR') : ''}
            placeholder="예: 3600만"
            onChange={(event) => {
              const next = parseWon(event.target.value);
              if (next != null && next > MAX_KRW) return; // 1조 원이 넘는 값은 받지 않는다
              onChange(next);
            }}
            className={control}
            aria-describedby={hintId}
          />
          <span aria-hidden>원</span>
        </div>
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
        {hint && <span className="text-foreground">{hint}</span>}
        {cell.source_text && (
          <span>
            {hint ? ' · ' : ''}공고: “{cell.source_text}”
          </span>
        )}
      </p>
    </div>
  );
}
