import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatWon, salaryText, type Row } from './format';
import { CONTROL_CLASS, MoneyInput } from './money-input';
import { PostingTabs } from './posting-tabs';
import {
  costsOf,
  type MissingInput,
  type Money,
  type PostingCostsForm,
  type ProfileForm as Form,
} from './profile';

// '내 생활비' 단계: 매달 남는 돈을 계산하는 데 필요한, 공고에 없는 값을 받는다.
// 값은 page.tsx가 들고 있고(form), 바꿀 때마다 onChange로 새 값을 돌려준다.
// 칸마다 id가 있어서 '비어 있는 값' 안내(profile.ts의 missingInputs)가 그 칸으로 데려갈 수 있다.

// 자주 넣는 고정비: 누르면 이름이 채워진 줄이 생기고 금액 칸으로 바로 간다
const COMMON_FIXED = ['통신비', '학자금 상환', '보험료', '구독 서비스'];

/** 라벨·도움말이 붙은 금액 칸 */
function MoneyField({
  id,
  label,
  value,
  onChange,
  example,
  help,
}: {
  id: string;
  label: string;
  value: Money;
  onChange: (value: Money) => void;
  example: string;
  help?: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="row-field profile-field">
      <label htmlFor={id}>
        {label}
        <span className="sr-only"> (단위: 원)</span>
      </label>
      <MoneyInput
        id={id}
        value={value}
        onChange={onChange}
        example={example}
        describedBy={hintId}
      />
      <p id={hintId} className="row-field-hint">
        {value != null && <span className="text-foreground">{formatWon(value)}</span>}
        {value != null && help && ' · '}
        {help}
      </p>
    </div>
  );
}

function Check({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="profile-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}

function PostingCosts({
  row,
  index,
  costs,
  onChange,
}: {
  row: Row;
  index: number;
  costs: PostingCostsForm;
  onChange: (costs: PostingCostsForm) => void;
}) {
  const id = (key: string) => `${row.id}-${key}`;
  const set = (patch: Partial<PostingCostsForm>) => onChange({ ...costs, ...patch });
  const place = [row.location?.value?.sido, row.location?.value?.sigungu].filter(Boolean).join(' ');
  const aid = row.housing_allowance_monthly_krw?.value;
  return (
    <section className="row-card" aria-labelledby={id('costs-title')}>
      <header className="row-card-head">
        <span className="row-card-number" aria-hidden>
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="row-card-index">공고 {index + 1}</p>
          <h3 id={id('costs-title')} className="row-title">
            {row.company?.value || '회사명 없음'}
          </h3>
          <p className="row-card-meta">{[place, salaryText(row)].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      <div className="row-card-body">
        <fieldset className="row-group">
          <legend>지금 집에서 다니기</legend>
          <Check
            id={id('can-commute')}
            checked={costs.canCommute}
            onChange={(canCommute) => set({ canCommute })}
          >
            지금 집에서 다닐 수 있어요
          </Check>
          {costs.canCommute && (
            <MoneyField
              id={id('commute-transport')}
              label="통근 교통비 (매달)"
              example="10만"
              value={costs.commuteTransport}
              onChange={(commuteTransport) => set({ commuteTransport })}
              help={row.shuttle_bus?.value ? '통근버스가 있어요. 무료면 0원' : undefined}
            />
          )}
        </fieldset>
        <fieldset className="row-group">
          <legend>회사 근처로 이사하기</legend>
          <Check
            id={id('consider-move')}
            checked={costs.considerMove}
            onChange={(considerMove) => set({ considerMove })}
          >
            이사도 생각하고 있어요
          </Check>
          {costs.considerMove && (
            <>
              <MoneyField
                id={id('move-housing')}
                label="이사할 집 주거비 (매달)"
                example="50만"
                value={costs.moveHousing}
                onChange={(moveHousing) => set({ moveHousing })}
                help={
                  aid
                    ? `월세 + 관리비. 회사 주거지원비 ${formatWon(aid)}은 빼지 말고 넣어 주세요 (계산할 때 빼요)`
                    : '월세 + 관리비'
                }
              />
              <MoneyField
                id={id('move-transport')}
                label="이사한 뒤 교통비 (매달)"
                example="6만"
                value={costs.moveTransport}
                onChange={(moveTransport) => set({ moveTransport })}
                help="출퇴근 + 본가에 다녀오는 비용"
              />
            </>
          )}
        </fieldset>
      </div>
    </section>
  );
}

export function ProfileFormView({
  form,
  rows,
  onChange,
  activeId,
  onSelectPosting,
  missingFor,
}: {
  form: Form;
  rows: Row[];
  onChange: (form: Form) => void;
  /** 회사 탭에서 고른 공고 (조건 확인 화면과 같은 값) */
  activeId: string;
  onSelectPosting: (id: string) => void;
  /** 이 공고에서 아직 비어 있는 칸 (profile.ts의 missingInputs 중 이 공고 것) */
  missingFor: (row: Row) => MissingInput[];
}) {
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const setFixed = (fixedExpenses: Form['fixedExpenses']) => set({ fixedExpenses });
  /** 고정비 줄을 하나 더하고, 이름이 있으면 금액 칸·없으면 이름 칸으로 커서를 옮긴다. */
  const addFixed = (name = '') => {
    const next = form.fixedExpenses.length;
    setFixed([...form.fixedExpenses, { name, amount: null }]);
    const target = name ? `fixed-${next}-amount` : `fixed-${next}-name`;
    requestAnimationFrame(() => document.getElementById(target)?.focus());
  };
  const used = new Set(form.fixedExpenses.map((item) => item.name.trim()));

  return (
    <div className="space-y-8">
      <fieldset className="row-group">
        <legend>지금 사는 곳</legend>
        <MoneyField
          id="current-housing"
          label="지금 집 주거비 (매달)"
          example="52만"
          value={form.currentHousing}
          onChange={(currentHousing) => set({ currentHousing })}
          help="월세 + 관리비. 본가라면 생활비로 드리는 돈"
        />
        <div className="row-field profile-field">
          <label htmlFor="family">가족 수 (본인 포함)</label>
          <select
            id="family"
            value={form.family}
            onChange={(event) => set({ family: Number(event.target.value) })}
            className={CONTROL_CLASS}
            aria-describedby="family-hint"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}명
              </option>
            ))}
          </select>
          <p id="family-hint" className="row-field-hint">
            세금 계산에 써요. 혼자 살면 1명
          </p>
        </div>
      </fieldset>

      <fieldset className="row-group">
        <legend>매달 나가는 고정비</legend>
        <p className="mb-3 text-sm text-muted-foreground">
          학자금 상환, 통신비, 보험료처럼 어디서 일하든 나가는 돈이에요. 없으면 비워 두세요.
        </p>
        <ul className="space-y-3">
          {form.fixedExpenses.map((item, i) => (
            <li key={i} className="fixed-expense">
              <Input
                id={`fixed-${i}-name`}
                aria-label={`고정비 ${i + 1} 이름`}
                value={item.name}
                placeholder="예: 통신비"
                onChange={(event) =>
                  setFixed(
                    form.fixedExpenses.map((x, j) =>
                      j === i ? { ...x, name: event.target.value } : x,
                    ),
                  )
                }
                className={CONTROL_CLASS}
              />
              <MoneyInput
                id={`fixed-${i}-amount`}
                label={`고정비 ${i + 1} 금액 (단위: 원)`}
                value={item.amount}
                example="5만"
                onChange={(amount) =>
                  setFixed(form.fixedExpenses.map((x, j) => (j === i ? { ...x, amount } : x)))
                }
              />
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                aria-label={`고정비 ${i + 1} 지우기`}
                onClick={() => {
                  setFixed(form.fixedExpenses.filter((_, j) => j !== i));
                  // 지운 줄의 버튼이 사라지므로 커서를 '고정비 넣기'로 옮긴다
                  document.getElementById('add-fixed')?.focus();
                }}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="자주 넣는 고정비">
          {COMMON_FIXED.filter((name) => !used.has(name)).map((name) => (
            <Button
              key={name}
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => addFixed(name)}
            >
              <Plus aria-hidden /> {name}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          id="add-fixed"
          variant="outline"
          className="mt-3 min-h-11 w-full"
          onClick={() => addFixed()}
        >
          <Plus aria-hidden /> 다른 고정비 넣기
        </Button>
      </fieldset>

      <PostingTabs
        rows={rows}
        activeId={activeId}
        onSelect={onSelectPosting}
        label="비용을 넣을 공고"
        doneLabel="다 넣음"
        status={(row) => {
          const missing = missingFor(row);
          // 통근·이사를 둘 다 끈 공고는 칸이 아니라 고를 일이 남았다
          const choose = missing.some((item) => item.fieldId === `${row.id}-can-commute`);
          return {
            remaining: missing.length,
            seen: true,
            todoLabel: choose ? '골라 주세요' : undefined,
          };
        }}
      >
        {rows.map(
          (row, i) =>
            row.id === activeId && (
              <PostingCosts
                key={row.id}
                row={row}
                index={i}
                costs={costsOf(form, row)}
                onChange={(costs) => set({ postings: { ...form.postings, [row.id]: costs } })}
              />
            ),
        )}
      </PostingTabs>

      <fieldset className="row-group">
        <legend>비교 기준 (선택)</legend>
        <p className="mb-3 text-sm text-muted-foreground">
          연봉이 공개되지 않은 공고는 &ldquo;최소 얼마를 받아야 기준만큼 남는지&rdquo;를 계산해요.
          목표 금액을 넣으면 그 금액이 기준이고, 아니면 연봉이 공개된 공고와 지금 회사 중 매달 더
          많이 남는 쪽이 기준이에요.
        </p>
        <Check
          id="has-current-job"
          checked={form.hasCurrentJob}
          onChange={(hasCurrentJob) => set({ hasCurrentJob })}
        >
          지금 다니는 회사가 있어요 (지금처럼 살려면 얼마가 필요한지)
        </Check>
        {form.hasCurrentJob && (
          <>
            <MoneyField
              id="current-salary"
              label="지금 연봉 (세전)"
              example="3800만"
              value={form.currentSalary}
              onChange={(currentSalary) => set({ currentSalary })}
              help="성과급·연장근로수당을 뺀 고정연봉"
            />
            <MoneyField
              id="current-meal"
              label="그중 식대 (매달)"
              example="20만"
              value={form.currentMeal}
              onChange={(currentMeal) => set({ currentMeal })}
              help="급여명세서의 비과세 식대. 없으면 비워 두세요"
            />
            <MoneyField
              id="current-transport"
              label="지금 회사 교통비 (매달)"
              example="6만"
              value={form.currentTransport}
              onChange={(currentTransport) => set({ currentTransport })}
            />
          </>
        )}
        <MoneyField
          id="target"
          label="매달 이만큼은 남았으면 (선택)"
          example="150만"
          value={form.target}
          onChange={(target) => set({ target })}
          help="넣으면 이 금액을 기준으로 계산해요"
        />
      </fieldset>
    </div>
  );
}
