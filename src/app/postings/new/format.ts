import type { components } from '@/lib/api/schema';

// 백엔드 비교표 한 행 (공고 1건). 모양은 `pnpm gen:api`로 만든 타입을 그대로 쓴다.
export type Row = components['schemas']['ComparisonRow'];
export type Status = components['schemas']['TextCell']['status'];

// 입력 상한 (백엔드 스키마와 같다. 넘는 값은 서버가 422로 막는다)
export const MAX_KRW = 1_000_000_000_000; // 1조 원
export const MAX_MONTHS = 1200;
export const MAX_PERCENT = 100;

/** 셀 상태 → 배지 글자와 색 (DESIGN.md "신뢰도 표시") */
export const statusBadge: Record<Status, { label: string; className: string }> = {
  confirmed: { label: '확인', className: 'bg-secondary text-confirmed' },
  estimated: { label: '추정', className: 'bg-estimated-bg text-estimated' },
  user_input: { label: '입력', className: 'bg-user-input-bg text-user-input' },
  missing: { label: '공고에 없음', className: 'text-muted-foreground' },
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

/** 이미지에서 읽은 값: AI가 옮겨 적은 글과만 맞춰 봤으니 원본과 다시 비교해야 한다. */
export function isImageRead(cell: Cell) {
  return cell.status === 'confirmed' && Boolean(cell.from_image);
}

/** 칸의 배지. 사용자가 값을 지운 칸은 '입력' 대신 '비움', 이미지에서 읽은 값은 '이미지에서 읽음'. */
export function badgeFor(cell: Cell) {
  if (cell.status === 'user_input' && cell.value == null) {
    return { label: '비움', className: statusBadge.user_input.className };
  }
  if (isImageRead(cell)) {
    return { label: '이미지에서 읽음', className: statusBadge.estimated.className };
  }
  return statusBadge[cell.status];
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

/**
 * 금액 입력을 원 단위로 읽는다. 한글 단위도 알아듣는다.
 * '36,000,000' → 36000000, '3600만' → 36000000, '1억 2천만원' → 120000000, '20만원' → 200000
 * 숫자가 하나도 없으면 null.
 */
export function parseWon(text: string): number | null {
  const s = text.replace(/[\s,]/g, '');
  if (!/\d/.test(s)) return null;
  let total = 0; // 만·억 단위로 끝난 부분
  let section = 0; // 아직 만·억을 만나지 않은 부분 (천·백·십·맨숫자)
  let digits = '';
  for (const ch of s) {
    if (/[\d.]/.test(ch)) {
      digits += ch;
      continue;
    }
    const x = digits ? Number(digits) : 0;
    digits = '';
    if (ch in SMALL_UNITS) section += (x || 1) * SMALL_UNITS[ch];
    else if (ch in BIG_UNITS) {
      total += (section + x) * BIG_UNITS[ch];
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
