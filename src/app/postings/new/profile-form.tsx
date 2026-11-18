import { Fragment, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatWon, placeName, salaryText, statusBadge, type Row } from './format';
import { SourceBadge } from './source-badge';
import { AskBubble, type AskQuestion } from './ask-view';
import { CONTROL_CLASS, MoneyInput } from './money-input';
import { PostingTabs } from './posting-tabs';
import { focusField, salaryLeftBlank } from './row-editor';
import {
  AGE_RANGE,
  costsOf,
  rentFailed,
  rentFor,
  rentPending,
  validAge,
  type MissingInput,
  FEW_TRADES,
  type RentEstimate,
  type Rents,
  type Money,
  type PostingCostsForm,
  type ProfileForm as Form,
} from './profile';

// '내 생활비' 단계: 매달 남는 돈을 계산하는 데 필요한, 공고에 없는 값을 받는다.
// 값은 page.tsx가 들고 있고(form), 바꿀 때마다 onChange로 새 값을 돌려준다.
// 칸마다 id가 있어서 '비어 있는 값' 안내(profile.ts의 missingInputs)가 그 칸으로 데려갈 수 있다.

// 자주 넣는 고정비: 누르면 이름이 채워진 줄이 생기고 금액 칸으로 바로 간다
const COMMON_FIXED = ['통신비', '학자금 상환', '보험료', '구독 서비스'];

/** 나이 칸 (선택). 비워도 계산되고, 넣으면 그 나이로 신청할 수 있는 청년 지원만 골라 준다 */
function AgeField({
  age,
  onChange,
}: {
  age: number | null;
  onChange: (age: number | null) => void;
}) {
  // 범위 안내는 칸을 떠난 뒤에만 보여 준다 ('27'을 치다가 '2'에서 오류가 뜨지 않게)
  const [editing, setEditing] = useState(false);
  const outOfRange = !editing && age != null && validAge(age) == null;
  return (
    <div className="row-field profile-field">
      <div className="field-label-line">
        <label htmlFor="age">나이 (선택)</label>
        <span id="age-help" className="field-help">
          만 나이, 청년 지원을 고를 때만 써요
        </span>
      </div>
      <div className="unit-input">
        <Input
          id="age"
          inputMode="numeric"
          value={age?.toString() ?? ''}
          placeholder="예: 27"
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(event) => {
            // 첫 숫자만 읽는다 ('27세(1999년생)'를 붙여 넣어도 27)
            const first = /\d+/.exec(event.target.value);
            const next = first ? Number(first[0]) : null;
            if (next != null && next > AGE_RANGE.max) return; // 세 자리는 받지 않는다
            onChange(next);
          }}
          className={CONTROL_CLASS}
          aria-describedby="age-help age-hint"
          aria-invalid={outOfRange || undefined}
        />
        <span aria-hidden>세</span>
      </div>
      <p id="age-hint" className="row-field-hint" aria-live="polite">
        {outOfRange && `${AGE_RANGE.min}~${AGE_RANGE.max}세로 넣어 주세요. 이 값은 쓰지 않아요`}
      </p>
    </div>
  );
}

/** 라벨·도움말이 붙은 금액 칸 */
function MoneyField({
  id,
  label,
  value,
  onChange,
  example,
  help,
  note,
  ask,
  askOrder,
  need = false,
  blank,
}: {
  id: string;
  label: string;
  value: Money;
  onChange: (value: Money) => void;
  example: string;
  help?: string;
  /**
   * 안내 아래 따로 한 줄 (예: 월세 시세). 이 칸을 넘기면(null이어도) 줄을 늘 두고
   * 바뀔 때 화면 읽기가 읽어 준다 (불러오는 중 → 시세·실패)
   */
  note?: ReactNode;
  /** 되묻기: 에이전트가 이 칸의 값을 물었으면 칸 위에 질문을 붙인다 */
  ask?: AskQuestion;
  /** 질문이 여럿일 때 몇 번째인지 ('1/2') */
  askOrder?: string;
  /** 계산에 꼭 필요한데 비어 있음 (파란 테두리) */
  need?: boolean;
  /** 비우면 어떻게 계산하는지 ('비우면 0원'). 칸 안 글로 보이고, 화면 읽기용으로도 남긴다 */
  blank?: string;
}) {
  const hintId = `${id}-hint`;
  const noteId = `${id}-note`;
  const askId = `${id}-ask`;
  const helpId = `${id}-help`;
  const hasNote = note !== undefined;
  const describedBy = [ask && askId, help && helpId, hintId, hasNote && noteId]
    .filter(Boolean)
    .join(' ');
  const field = (
    <div className={need ? 'row-field profile-field is-need' : 'row-field profile-field'}>
      {/* 칸 이름 줄: 이름 옆에 뜻 한 토막 (칸 아래 줄을 줄여 한눈에). 라벨 밖에 두어 이름이 길어지지 않게 */}
      <div className="field-label-line">
        <label htmlFor={id}>
          {label}
          <span className="sr-only"> (단위: 원)</span>
        </label>
        {help && (
          <span id={helpId} className="field-help">
            {help}
          </span>
        )}
      </div>
      <MoneyInput
        id={id}
        value={value}
        onChange={onChange}
        example={example}
        placeholder={blank}
        describedBy={describedBy}
      />
      {/* 칸 아래는 넣은 값 확인('52만원')만. 비울 때 결과는 칸 안 글과 같은 말을 화면 읽기용으로 */}
      <p id={hintId} className="row-field-hint">
        {value != null && <span className="text-foreground">{formatWon(value)}</span>}
        {blank && <span className="sr-only">{blank}</span>}
      </p>
      {hasNote && (
        <p id={noteId} className="row-field-hint rent-note" aria-live="polite">
          {note}
        </p>
      )}
    </div>
  );
  // 질문이 없으면 칸만 그대로 둔다. 감싸면(display: contents여도) 'legend 바로 다음 칸'(clear: both)·
  // ':last-child' 같은 묶음 규칙이 감싸개에 걸려, 떠 있는 묶음 제목 옆으로 칸이 밀려 폭이 0이 됐다.
  if (!ask) return field;
  // 되묻기: 질문을 칸 바로 위에 두고 둘을 함께 강조한다 (칸 안은 자리를 정해 둔 격자라 밖에 둔다)
  return (
    <div className="ask-wrap">
      <AskBubble question={ask} id={askId} order={askOrder} />
      {field}
    </div>
  );
}

/** 묶음 제목 오른쪽 칩: 비어 있는 필수 칸 수, 또는 '선택'. 둘 다 아니면 없음 ('다 넣음'은 선택 칸이 0원이 돼 거짓이 될 수 있다) */
function GroupChip({ count, optional = false }: { count: number; optional?: boolean }) {
  if (count > 0) return <span className="group-chip is-need">필수 {count}칸</span>;
  return optional ? <span className="group-chip">선택</span> : null;
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

/** '이사할 집 주거비' 칸 안내: 무엇을 넣는 칸인지 (시세는 rentNote로 따로 한 줄) */
function moveHousingHelp(aid: number | null | undefined, companyHousing: boolean) {
  // 사택·기숙사 공고: 시세로 대신 채우지 않으니, 본인 부담이 없으면 0을 넣어야 계산된다
  if (companyHousing) {
    return '사택·기숙사에 산다면 본인이 내는 돈(없으면 0), 따로 집을 구한다면 월세 + 관리비';
  }
  const parts = ['월세 + 관리비'];
  if (aid) parts.push(`주거지원비 ${formatWon(aid)}은 빼지 말고 넣어 주세요`);
  return parts.join('. ');
}

/**
 * 근무지 원룸 월세 시세 ('추정' 배지). 비워 두면 서버(calc/summary.py)가 이 값으로 계산한다.
 * 한 줄로: 금액과 '관리비 제외'(이름 줄의 '월세 + 관리비'와 다르니 숨기지 않는다).
 * 비울 때 이 값이 쓰인다는 건 칸 안 글('비우면 65만원')이 말한다. 출처(기간·거래 수)는 배지를 누르면 보인다.
 */
function rentNote(
  value: Money,
  rent: RentEstimate | null,
  pending: boolean,
  failed: boolean,
  onRetry: () => void,
): ReactNode {
  if (pending) return '근무지 월세 시세를 불러오는 중이에요…';
  if (failed) {
    // 공공데이터(국토부 실거래가) 조회 실패: 비워 두면 시세로 대신 계산할 수 없다는 걸 숨기지 않는다
    return (
      <>
        <span className="block">근무지 월세 시세(국토부 실거래가)를 불러오지 못했어요.</span>
        <span className="block">
          {value == null
            ? '비워 두면 이사한 경우는 계산하지 못해요. 직접 넣거나 '
            : '넣은 금액으로 계산해요. '}
          <button type="button" className="inline-link" onClick={onRetry}>
            다시 불러오기
          </button>
        </span>
      </>
    );
  }
  if (rent?.monthly_rent_krw == null) return null;
  const place = placeName(rent.region);
  const few = rent.sample_size < FEW_TRADES;
  return (
    <>
      <span className="block">
        <SourceBadge
          badge={statusBadge.estimated}
          details={[
            { label: '출처', text: `국토부 실거래가 (${rent.period})` },
            {
              label: '계산',
              text: `원룸 월세 ${rent.sample_size.toLocaleString('ko-KR')}건의 중앙값`,
            },
          ]}
        />{' '}
        {place} 원룸 월세{' '}
        <span className="text-foreground">{formatWon(rent.monthly_rent_krw)}</span> (관리비 제외)
      </span>
      {few && <span className="mt-0.5 block">거래가 적어 참고만 하세요</span>}
    </>
  );
}

function PostingCosts({
  need,
  currentHousing,
  row,
  index,
  costs,
  rent,
  rentPending,
  rentFailed,
  onRetryRent,
  onChange,
}: {
  /** 계산에 꼭 필요한데 비어 있는 칸 id */
  need: ReadonlySet<string>;
  /** 위 '나와 지금 사는 곳'에서 넣은 지금 집 주거비 (통근 쪽 주거비 줄에 보기만) */
  currentHousing: Money;
  row: Row;
  index: number;
  costs: PostingCostsForm;
  /** 근무지 월세 시세 (없으면 null) */
  rent: RentEstimate | null;
  /** 시세를 불러오는 중인지 */
  rentPending: boolean;
  /** 시세를 불러오지 못했는지 (공공데이터 조회 실패) */
  rentFailed: boolean;
  /** 불러오지 못한 시세를 다시 불러오기 */
  onRetryRent: () => void;
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
      <div className="row-card-body cost-cases">
        <div role="group" aria-labelledby={id('commute-title')} className="row-group">
          <h4 id={id('commute-title')} className="row-group-title">
            지금 집에서 다니기
            <GroupChip count={need.has(id('can-commute')) ? 1 : 0} />
          </h4>
          <Check
            id={id('can-commute')}
            checked={costs.canCommute}
            onChange={(canCommute) => set({ canCommute })}
          >
            지금 집에서 다닐 수 있어요
          </Check>
          {/* 이사 쪽 '이사할 집 주거비'와 같은 줄: 통근은 지금 집 주거비를 그대로 쓴다 (넣는 곳은 위) */}
          {costs.canCommute && (
            <div className="row-field profile-field">
              <div className="field-label-line">
                <p className="readonly-label">지금 집 주거비 (매달)</p>
                <span className="field-help">위에서 넣은 값</span>
              </div>
              <p className="readonly-value">
                {currentHousing != null ? (
                  formatWon(currentHousing)
                ) : (
                  // 비어 있으면 넣는 곳(위)으로 데려간다
                  <button
                    type="button"
                    className="inline-link"
                    onClick={() => focusField('current-housing')}
                  >
                    위에서 넣기
                  </button>
                )}
              </p>
            </div>
          )}
          {costs.canCommute && (
            <MoneyField
              id={id('commute-transport')}
              label="통근 교통비 (매달)"
              example="10만"
              value={costs.commuteTransport}
              onChange={(commuteTransport) => set({ commuteTransport })}
              help={row.shuttle_bus?.value ? '통근버스 있음' : undefined}
              blank="비우면 0원"
            />
          )}
        </div>
        <div role="group" aria-labelledby={id('move-title')} className="row-group">
          <h4 id={id('move-title')} className="row-group-title">
            회사 근처로 이사하기
            <GroupChip count={need.has(id('move-housing')) ? 1 : 0} />
          </h4>
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
                need={need.has(id('move-housing'))}
                label="이사할 집 주거비 (매달)"
                // 예시는 실제로 들어갈 시세로 (예시와 비울 때 값이 달라 헷갈리지 않게)
                example={
                  // 사택·기숙사 공고는 비워도 시세로 채우지 않으니 시세를 예시로 쓰지 않는다
                  rent?.monthly_rent_krw && !row.company_housing?.value
                    ? `${Math.round(rent.monthly_rent_krw / 10_000)}만`
                    : '50만'
                }
                value={costs.moveHousing}
                onChange={(moveHousing) => set({ moveHousing })}
                help={moveHousingHelp(aid, row.company_housing?.value === true)}
                blank={
                  rent?.monthly_rent_krw && !row.company_housing?.value
                    ? `비우면 ${formatWon(rent.monthly_rent_krw)}`
                    : undefined
                }
                note={rentNote(costs.moveHousing, rent, rentPending, rentFailed, () => {
                  // '다시 불러오기' 버튼은 불러오는 동안 사라진다 → 포커스를 금액 칸으로 옮겨
                  // 키보드·화면 읽기 사용자가 위치를 잃지 않게 한다 (결과는 안내 줄이 읽어 준다)
                  onRetryRent();
                  document.getElementById(id('move-housing'))?.focus();
                })}
              />
              <MoneyField
                id={id('move-transport')}
                label="이사한 뒤 교통비 (매달)"
                example="6만"
                value={costs.moveTransport}
                onChange={(moveTransport) => set({ moveTransport })}
                help="출퇴근·본가 오가는 비용"
                blank="비우면 0원"
              />
            </>
          )}
        </div>
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
  missing,
  askAge,
  rents,
  failedRents,
  onRetryRents,
  asking = [],
  askFixedIndex = -1,
}: {
  form: Form;
  rows: Row[];
  onChange: (form: Form) => void;
  /** 회사 탭에서 고른 공고 (조건 확인 화면과 같은 값) */
  activeId: string;
  onSelectPosting: (id: string) => void;
  /** 계산에 꼭 필요한데 비어 있는 칸 (profile.ts의 missingInputs) */
  missing: MissingInput[];
  /** 나이 칸을 보일지 (서버가 청년 지원을 찾을 수 있을 때만. 나이는 그것에만 쓴다) */
  askAge: boolean;
  /** 근무지(시군구 코드)별 월세 시세. 이사할 집 주거비를 비우면 이 값으로 계산된다 */
  rents: Rents;
  /** 시세를 불러오지 못한 시군구 코드 */
  failedRents: readonly string[];
  /** 불러오지 못한 시세를 다시 불러오기 */
  onRetryRents: () => void;
  /** 되묻기: 에이전트가 물은 값들 (원래 칸 위에 질문을 붙인다) */
  asking?: AskQuestion[];
  /** 되묻기: 고정비 질문을 붙일 줄 (질문이 온 때 정한 값. 없으면 -1) */
  askFixedIndex?: number;
}) {
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const missingFor = (row: Row) => missing.filter((item) => item.rowId === row.id);
  const need = new Set(missing.map((item) => item.fieldId));
  const needIn = (test: (id: string) => boolean) => [...need].filter(test).length;
  const askFor = (key: AskQuestion['key']) => asking.find((q) => q.key === key);
  const askOrder = (key: AskQuestion['key']) =>
    asking.length > 1
      ? `${asking.findIndex((q) => q.key === key) + 1}/${asking.length}`
      : undefined;
  const askFixed = askFor('fixed_expenses');
  const fixedAskRow = askFixed ? askFixedIndex : -1;
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
        <legend>
          나와 지금 사는 곳
          <GroupChip count={needIn((id) => id === 'current-housing')} />
        </legend>
        <MoneyField
          id="current-housing"
          label="지금 집 주거비 (매달)"
          need={need.has('current-housing')}
          example="52만"
          value={form.currentHousing}
          onChange={(currentHousing) => set({ currentHousing })}
          help="월세 + 관리비 (본가면 생활비로 드리는 돈)"
          ask={askFor('current_housing')}
          askOrder={askOrder('current_housing')}
        />
        <div className="row-field profile-field">
          <div className="field-label-line">
            <label htmlFor="family">가족 수 (본인 포함)</label>
            <span id="family-hint" className="field-help">
              세금 계산에 써요
            </span>
          </div>
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
        </div>
        {askAge && <AgeField age={form.age ?? null} onChange={(age) => set({ age })} />}
      </fieldset>

      <fieldset className="row-group">
        <legend>
          매달 나가는 고정비
          <GroupChip count={needIn((id) => id.startsWith('fixed-'))} />
        </legend>
        <p className="mb-3 text-sm text-muted-foreground">
          학자금·통신비·보험료처럼 어느 회사에 가든 똑같이 나가는 돈이에요.
        </p>
        <ul className="space-y-3">
          {form.fixedExpenses.map((item, i) => (
            <Fragment key={i}>
              {/* 되묻기: 금액이 빈 이 줄 위에 질문 (줄 안은 칸 순서로 자리를 잡아서 따로 둔다) */}
              {askFixed && i === fixedAskRow && (
                <li className="fixed-ask">
                  <AskBubble
                    // 서버는 '고정비 합계'로 묻지만, 화면은 금액이 빈 그 줄에서 답하므로 그 이름으로 묻는다
                    question={{
                      ...askFixed,
                      question: `${item.name.trim() || `고정비 ${i + 1}`} 금액은 매달 얼마인가요?`,
                    }}
                    id={`fixed-${i}-ask`}
                    order={askOrder('fixed_expenses')}
                  />
                </li>
              )}
              <li
                className={[
                  'fixed-expense',
                  i === fixedAskRow && 'is-asked',
                  need.has(`fixed-${i}-amount`) && 'is-need',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
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
                  describedBy={askFixed && i === fixedAskRow ? `fixed-${i}-ask` : undefined}
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
                {/* 친 금액을 한글 단위로 (다른 금액 칸의 안내 글씨와 같은 모양) */}
                {item.amount != null && (
                  <p className="row-field-hint fixed-expense-hint">
                    <span className="text-foreground">{formatWon(item.amount)}</span>
                  </p>
                )}
              </li>
            </Fragment>
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

      {/* 위는 모든 공고에 같은 값, 여기부터는 공고마다 다른 값: 굵은 선과 제목으로 크게 나눈다 */}
      <h3 className="profile-split">공고마다 다른 값</h3>
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
                need={need}
                currentHousing={form.currentHousing}
                key={row.id}
                row={row}
                index={i}
                costs={costsOf(form, row)}
                rent={rentFor(row, rents)}
                rentPending={rentPending(row, rents, failedRents)}
                rentFailed={rentFailed(row, failedRents)}
                onRetryRent={onRetryRents}
                onChange={(costs) => set({ postings: { ...form.postings, [row.id]: costs } })}
              />
            ),
        )}
      </PostingTabs>

      {/* 연봉 비공개 공고가 있을 때만: 최소 연봉을 무엇에 맞춰 계산할지 */}
      {rows.some(salaryLeftBlank) && (
        // 선택 항목은 접어 둔다 (값을 넣어 둔 적이 있으면 펼친 채로: 돌아왔을 때 넣은 값이 숨지 않게)
        <details
          className="optional-group"
          open={form.hasCurrentJob || form.target != null || undefined}
        >
          <summary>
            비교 기준
            <GroupChip
              count={needIn((id) => id.startsWith('current-') && id !== 'current-housing')}
              optional
            />
          </summary>
          <fieldset className="row-group">
            {/* 보이는 제목은 접기 줄(summary). 묶음 이름은 화면 읽기용으로 남긴다 */}
            <legend className="sr-only">비교 기준</legend>
            <div className="mb-3 text-sm text-muted-foreground">
              <p>연봉 비공개 공고는 이 기준만큼 남으려면 얼마를 받아야 하는지 계산해요.</p>
              <p>비우면 다른 공고 중 매달 더 많이 남는 쪽이 기준이에요.</p>
            </div>
            <Check
              id="has-current-job"
              checked={form.hasCurrentJob}
              onChange={(hasCurrentJob) => set({ hasCurrentJob })}
            >
              지금 다니는 회사가 있어요 (지금 회사와 비교하기)
            </Check>
            {form.hasCurrentJob && (
              <>
                <MoneyField
                  id="current-salary"
                  need={need.has('current-salary')}
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
                  help="급여명세서의 비과세 식대"
                  blank="비우면 0원"
                />
                <MoneyField
                  id="current-transport"
                  need={need.has('current-transport')}
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
        </details>
      )}
    </div>
  );
}
