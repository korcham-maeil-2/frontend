import type { components } from '@/lib/api/schema';
import type { Row } from './format';

// '내 생활비' 단계에서 사용자가 넣는 값. 화면 입력 상태를 그대로 담고,
// 서버로 보낼 때 toUserProfile()로 백엔드 모양(UserProfile)으로 바꾼다.

export type UserProfile = components['schemas']['UserProfile'];
/** 근무지(시군구)의 원룸급 월세 시세 (백엔드 GET /rent/{lawd_cd}, 국토부 실거래가) */
export type RentEstimate = components['schemas']['RentEstimate'];
/** 시군구 코드 → 월세 시세. 확정된 결과(시세를 구함 'estimated' / 거래 없음 'missing')만 담는다.
 *  불러오지 못한 것('unavailable')은 담지 않고 다음에 다시 묻는다. */
export type Rents = Record<string, RentEstimate>;

/** 시세를 낸 거래가 이보다 적으면 '참고만' */
export const FEW_TRADES = 5;

/** 저장해 둘 만한(확정된) 시세인지 */
export function isSettledRent(rent: RentEstimate | null | undefined): rent is RentEstimate {
  return !!rent && (rent.status === 'estimated' || rent.status === 'missing');
}

/** 계산 결과에 실려 온 시세 → Rents (결과 화면에서 새로고침해도 빈칸 경고가 맞게) */
export function rentsFromResult(estimates: readonly RentEstimate[] | undefined): Rents {
  return Object.fromEntries(
    (estimates ?? []).filter(isSettledRent).map((rent) => [rent.lawd_cd, rent]),
  );
}

/** 이 공고 근무지의 시세를 아직 불러오는 중인지 (불러오지 못한 지역은 아니다) */
export function rentPending(row: Row, rents: Rents, failed: readonly string[]): boolean {
  const code = row.location?.value?.lawd_cd;
  return !!code && !(code in rents) && !failed.includes(code);
}

/**
 * 이 공고의 '이사할 집 주거비'를 비워 두면 서버가 쓰는 시세 (없으면 null).
 * 서버(calc/summary.py)와 같은 조건: 시세를 구했고, 회사가 사택·기숙사를 주지 않을 때.
 */
export function rentFor(row: Row, rents: Rents): RentEstimate | null {
  const code = row.location?.value?.lawd_cd;
  const rent = code ? rents[code] : undefined;
  if (!rent || rent.status !== 'estimated' || rent.monthly_rent_krw == null) return null;
  return row.company_housing?.value === true ? null : rent;
}

/** 금액 입력 한 칸. 비어 있으면 null (0원과 다르다: 0원은 '없다고 답함') */
export type Money = number | null;

/** 공고(회사 위치)마다 다른 비용 */
export type PostingCostsForm = {
  canCommute: boolean; // 지금 집에서 다닐 수 있는지
  commuteTransport: Money; // 지금 집 → 회사 월 교통비
  considerMove: boolean; // 회사 근처로 이사를 생각하는지
  moveHousing: Money; // 이사할 집 월세 + 관리비
  moveTransport: Money; // 이사한 뒤 월 교통비 (본가 왕복 포함)
};

export type FixedExpenseForm = { name: string; amount: Money };

export type ProfileForm = {
  family: number; // 소득세용 가족 수 (본인 포함)
  currentHousing: Money; // 지금 집 월 주거비 (본가면 생활비로 드리는 돈)
  fixedExpenses: FixedExpenseForm[];
  postings: Record<string, PostingCostsForm>; // 공고 ID → 비용
  hasCurrentJob: boolean; // 지금 다니는 회사가 있는지 ('지금처럼 살려면' 기준)
  currentSalary: Money; // 지금 세전 고정연봉
  currentMeal: Money; // 그중 비과세 식대 (월)
  currentTransport: Money; // 지금 회사까지 월 교통비
  target: Money; // 매달 이만큼은 남아야 한다 (선택)
  age: number | null; // 만 나이 (선택). 청년 지원 정책을 나이 조건으로 거르는 데만 쓴다
};

/** 나이로 받는 범위 (백엔드 UserProfile.age와 같다). 벗어나면 보내지 않는다 (422가 나지 않게) */
export const AGE_RANGE = { min: 15, max: 99 } as const;

/** 범위 안의 나이만. 비었거나 벗어나면 null → 서버가 나이로 거르지 않는다 */
export function validAge(age: number | null | undefined): number | null {
  return age != null && age >= AGE_RANGE.min && age <= AGE_RANGE.max ? age : null;
}

export const EMPTY_POSTING_COSTS: PostingCostsForm = {
  canCommute: true,
  commuteTransport: null,
  considerMove: true,
  moveHousing: null,
  moveTransport: null,
};

export const EMPTY_PROFILE: ProfileForm = {
  family: 1,
  currentHousing: null,
  fixedExpenses: [],
  postings: {},
  hasCurrentJob: false,
  currentSalary: null,
  currentMeal: null,
  currentTransport: null,
  target: null,
  age: null,
};

/** 이 공고의 비용 입력. 아직 없으면 빈 값 (공고가 늘거나 새 표를 만들었을 때). */
export function costsOf(form: ProfileForm, row: Row): PostingCostsForm {
  return form.postings[row.id] ?? EMPTY_POSTING_COSTS;
}

const userInput = (value: Money) =>
  value == null ? null : { value, status: 'user_input' as const };

/**
 * 고정비 목록 → 서버 모양. 이 화면에서 고정비를 물었으므로 하나도 안 넣었으면 '없음'([])이다.
 * 금액만 넣고 이름을 비우면 '고정비 n'으로 이름을 붙인다.
 * 이름만 넣고 금액을 비운 줄이 있으면 '모름'(null)으로 보낸다 — 0원으로 치면 남는 돈이 부풀려진다.
 */
function toFixedExpenses(items: FixedExpenseForm[]) {
  const used = items.filter((item) => item.name.trim() || item.amount != null);
  if (used.some((item) => item.amount == null)) return null;
  return used.map((item, i) => ({
    name: item.name.trim() || `고정비 ${i + 1}`,
    monthly_krw: item.amount as number,
  }));
}

/** 화면 입력 → 백엔드 UserProfile. 빈 칸은 null로 보내 서버가 '모름'으로 계산한다 (0원으로 채우지 않는다). */
export function toUserProfile(form: ProfileForm, rows: Row[]): UserProfile {
  const age = validAge(form.age);
  return {
    family: form.family,
    children_8_to_20: 0, // 화면에서 묻지 않는다 (사회초년생 기준). 필요해지면 입력칸을 더한다
    current_housing: userInput(form.currentHousing),
    fixed_expenses: toFixedExpenses(form.fixedExpenses),
    postings: Object.fromEntries(
      rows.map((row) => {
        const c = costsOf(form, row);
        return [
          row.id,
          {
            commute_possible: c.canCommute,
            commute_transport: c.canCommute ? userInput(c.commuteTransport) : null,
            move_possible: c.considerMove,
            move_housing: c.considerMove ? userInput(c.moveHousing) : null,
            move_transport: c.considerMove ? userInput(c.moveTransport) : null,
          },
        ];
      }),
    ),
    current_job:
      form.hasCurrentJob && form.currentSalary != null
        ? {
            annual_salary_krw: form.currentSalary,
            meal_nontaxable_monthly_krw: form.currentMeal ?? 0,
            transport: userInput(form.currentTransport),
            status: 'user_input',
          }
        : null,
    target_monthly_remaining: form.target,
    // 비었으면 칸을 아예 보내지 않는다: age를 모르는 예전 백엔드도 받을 수 있게 (모르는 칸은 422).
    // 나이 칸이 생기기 전에 저장한 화면 값에는 age가 없다 (undefined) → validAge가 null로
    ...(age != null && { age }),
  };
}

/** 비어 있는 칸: 화면에 보여 줄 이름과, 누르면 데려갈 입력칸의 id (profile-form.tsx) */
export type MissingInput = { label: string; fieldId: string; rowId?: string };

/**
 * 계산 전에 알려 줄 빈 칸 (막지는 않는다: 빈 경우는 결과에 '계산할 수 없음'으로 나온다).
 * 화면 위에서 아래 순서로 돌려준다.
 */
export function missingInputs(
  form: ProfileForm,
  rows: Row[],
  rents: Rents = {},
  failedRents: readonly string[] = [],
): MissingInput[] {
  const missing: MissingInput[] = [];
  // rowId: 공고별 칸이면 그 공고 (회사 탭 개수와 '그 탭으로 이동'에 쓴다)
  const add = (label: string, fieldId: string, rowId?: string) =>
    missing.push({ label, fieldId, rowId });
  const anyCommute = rows.some((row) => costsOf(form, row).canCommute);
  if (anyCommute && form.currentHousing == null) add('지금 집 주거비', 'current-housing');
  form.fixedExpenses.forEach((item, i) => {
    if (item.name.trim() && item.amount == null) {
      add(`고정비 ${i + 1}(${item.name.trim()}) 금액`, `fixed-${i}-amount`);
    }
  });
  rows.forEach((row, i) => {
    const c = costsOf(form, row);
    const name = row.company?.value || `공고 ${i + 1}`;
    if (!c.canCommute && !c.considerMove) {
      add(`${name}: 통근·이사 중 하나는 골라 주세요`, `${row.id}-can-commute`, row.id);
    }
    // 공고별 교통비는 비워 두면 서버가 0원(추정)으로 계산하고 '더 들 수 있어요'라고 알리므로 빈칸이 아니다
    // 비워 두면 근무지 월세 시세로 계산하므로 빈칸이 아니다 (불러오는 중에도 경고를 띄우지 않는다)
    if (
      c.considerMove &&
      c.moveHousing == null &&
      !rentFor(row, rents) &&
      !rentPending(row, rents, failedRents)
    ) {
      add(`${name} 이사할 집 주거비`, `${row.id}-move-housing`, row.id);
    }
  });
  if (form.hasCurrentJob && form.currentSalary == null) add('지금 연봉', 'current-salary');
  if (form.hasCurrentJob && form.currentTransport == null) {
    add('지금 회사 교통비', 'current-transport');
  }
  return missing;
}
