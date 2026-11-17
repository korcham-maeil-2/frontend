import type { components } from '@/lib/api/schema';

// 백엔드 비교표 한 행 (공고 1건). 모양은 `pnpm gen:api`로 만든 타입을 그대로 쓴다.
export type Row = components['schemas']['ComparisonRow'];
export type Status = components['schemas']['TextCell']['status'];

// 입력 상한 (백엔드 스키마와 같다. 넘는 값은 서버가 422로 막는다)
export const MAX_KRW = 1_000_000_000_000; // 1조 원
export const MAX_MONTHS = 1200;
export const MAX_PERCENT = 100;

/** 배지 하나: 글자, 색, 짧은 뜻 (뜻은 결과 표 범례와 출처 창 맨 위에 쓴다 — source-badge.tsx) */
export type Badge = { label: string; className: string; meaning: string };

/** 셀 상태 → 배지 (DESIGN.md "신뢰도 표시") */
export const statusBadge: Record<Status, Badge> = {
  confirmed: {
    label: '확인',
    className: 'bg-card text-confirmed badge-confirmed',
    meaning: '공고·공공데이터에서 읽은 값',
  },
  estimated: {
    label: '추정',
    className: 'bg-estimated-bg text-estimated',
    meaning: '실제와 다를 수 있는 값',
  },
  user_input: {
    label: '입력',
    className: 'bg-user-input-bg text-user-input',
    meaning: '직접 넣거나 고친 값',
  },
  missing: {
    label: '공고에 없음',
    className: 'text-muted-foreground',
    meaning: '공고에 적혀 있지 않은 값',
  },
};

/** 이미지에서 읽은 값: 원본과 다시 비교해야 해서 추정 색을 쓴다 */
export const IMAGE_READ_BADGE: Badge = {
  ...statusBadge.estimated,
  label: '이미지에서 읽음',
  meaning: 'AI가 이미지에서 옮겨 적은 값',
};

/** 비교표 한 칸 ({value, status, source_text, from_image}) */
export type Cell = {
  value?: unknown;
  status: Status;
  source_text?: string | null;
  from_image?: boolean;
};

/** 행의 모든 칸 (기타 수당 칸 포함) */
export function cellsOf(row: Row): Cell[] {
  const cells = (Object.values(row) as unknown[]).filter(
    (v): v is Cell => typeof v === 'object' && v !== null && 'status' in v,
  );
  return [...cells, ...(row.other_allowances ?? []).map((a) => a.monthly_krw)];
}

/**
 * 개인정보를 가린 표시 (백엔드 privacy.py가 AI로 보내기 전에 바꾼 글자: [이메일]·[번지] 등).
 * 공고 인용에 이 표시가 보이면 왜 가렸는지 한 줄 알린다 (page.tsx).
 */
const MASK_MARK = /\[(이메일|전화번호|주민번호|생년월일|이름|번지|상세주소|식별번호|아이디)\]/;

/** 공고 인용(원문 조각)에 가린 표시가 있는 칸이 하나라도 있는지 */
export function hasMaskedQuote(rows: Row[]) {
  return rows.some((row) => cellsOf(row).some((cell) => MASK_MARK.test(cell.source_text ?? '')));
}

/** 이미지에서 읽은 값: AI가 옮겨 적은 글과만 맞춰 봤으니 원본과 다시 비교해야 한다. */
export function isImageRead(cell: Cell) {
  return cell.status === 'confirmed' && Boolean(cell.from_image);
}

/** 칸의 배지. 사용자가 값을 지운 칸은 '입력' 대신 '비움', 이미지에서 읽은 값은 '이미지에서 읽음'. */
export function badgeFor(cell: Cell): Badge {
  if (cell.status === 'user_input' && cell.value == null) {
    return { ...statusBadge.user_input, label: '비움', meaning: '직접 비워 둔 칸' };
  }
  if (isImageRead(cell)) return IMAGE_READ_BADGE;
  return statusBadge[cell.status];
}

/** 시군구 이름만: '전남광주통합특별시 나주시' → '나주시' (세종처럼 한 단어면 그대로) */
export function placeName(region: string): string {
  return region.split(' ').slice(1).join(' ') || region;
}

/** 금액을 한글 단위로: 36000000 → '3,600만원', 200000 → '20만원', 150000000 → '1억 5,000만원' */
export function formatWon(value: number): string {
  if (value === 0) return '0원';
  const eok = Math.floor(value / 100_000_000);
  const man = Math.floor((value % 100_000_000) / 10_000);
  const won = value % 10_000;
  const parts = [];
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  if (won) parts.push(won.toLocaleString('ko-KR'));
  return `${parts.join(' ')}원`;
}

/** 급여 금액이 있는지 (급여 종류에 맞는 칸 기준) */
export function hasSalary(row: Row): boolean {
  const amount =
    row.salary_type?.value === 'monthly'
      ? row.monthly_salary_krw?.value
      : row.annual_salary_krw?.value;
  return amount != null;
}

/** 행의 급여를 한 줄로: '연봉 3,600만원', '월급 250만원', '공고에 금액 없음', '연봉 미입력' */
export function salaryText(row: Row): string {
  const type = row.salary_type?.value;
  const amount = type === 'monthly' ? row.monthly_salary_krw?.value : row.annual_salary_krw?.value;
  if (amount != null) return `${type === 'monthly' ? '월급' : '연봉'} ${formatWon(amount)}`;
  if (type === 'monthly') return '월급 미입력';
  if (type === 'annual') return '연봉 미입력';
  if (type === 'to_propose') return '희망 연봉 회신';
  if (type === 'undisclosed') return '공고에 금액 없음';
  return '급여 미입력';
}

const SMALL_UNITS: Record<string, number> = { 천: 1_000, 백: 100, 십: 10 };
const BIG_UNITS: Record<string, number> = { 만: 10_000, 억: 100_000_000 };
// 한글로 쓴 숫자 ('이천오백만'의 이·오)
const HANGUL_DIGITS: Record<string, number> = {
  일: 1,
  이: 2,
  삼: 3,
  사: 4,
  오: 5,
  육: 6,
  칠: 7,
  팔: 8,
  구: 9,
};

/**
 * 금액 입력을 원 단위로 읽는다. 한글 단위와 한글 숫자도 알아듣는다.
 * '36,000,000' → 36000000, '3600만' → 36000000, '1억 2천만원' → 120000000, '20만원' → 200000,
 * '이천오백만' → 25000000, '삼천육백만원' → 36000000, '천만' → 10000000, '만원' → 10000
 * 숫자도 한글 숫자·단위도 없으면 null.
 */
export function parseWon(text: string): number | null {
  const s = text.replace(/[\s,]/g, '');
  if (!/[\d일이삼사오육칠팔구십백천만억]/.test(s)) return null;
  let total = 0; // 만·억 단위로 끝난 부분
  let section = 0; // 아직 만·억을 만나지 않은 부분 (천·백·십·맨숫자)
  let digits = '';
  for (const ch of s) {
    if (/[\d.]/.test(ch)) {
      digits += ch;
      continue;
    }
    if (ch in HANGUL_DIGITS) {
      // 한글 숫자는 한 자리씩 온다 ('이천' → 2 × 천). 바로 뒤의 천·백·십·만·억이 곱한다.
      digits = String(HANGUL_DIGITS[ch]);
      continue;
    }
    const hadNumber = digits !== '';
    const x = hadNumber ? Number(digits) : 0;
    digits = '';
    if (ch in SMALL_UNITS) section += (hadNumber ? x : 1) * SMALL_UNITS[ch];
    else if (ch in BIG_UNITS) {
      // 앞에 아무 수도 없으면 1로 읽는다 ('만원' = 1만 원). '0만'은 0이다.
      const amount = section + x || (hadNumber || section ? 0 : 1);
      total += amount * BIG_UNITS[ch];
      section = 0;
    } else section += x; // '원' 등 단위가 아닌 글자
  }
  total += section + (digits ? Number(digits) : 0);
  return Number.isFinite(total) ? Math.round(total) : null;
}

/** 개월·퍼센트 입력에서 숫자만 꺼낸다. 비어 있으면 null. */
export function parseCount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}
