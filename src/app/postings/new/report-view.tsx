'use client';

import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import type { components } from '@/lib/api/schema';

// 결과 화면 맨 위의 'AI 리포트' (백엔드 report/agent.py).
//   AI(Claude)는 금액을 숫자로 쓰지 않고 자리표시만 쓰고, 프로그램이 계산 결과의 금액을 채운다.
//   검토를 통과하지 못하면 다시 쓰게 하고, 끝까지 못 고치면 리포트를 보여 주지 않는다
//   → 여기서는 그 상태를 그대로 그린다.

export type ReportCheck = components['schemas']['ReportCheck'];
export type Report = { text: string | null; check: ReportCheck | null };

const STATUSES = ['verified', 'unverified', 'unavailable', 'skipped'];

/** 저장해 둔 초안의 리포트가 지금 모양인지 (예전 모양이면 버린다) */
export function isReport(value: unknown): value is Report {
  if (!value || typeof value !== 'object') return false;
  const { text, check } = value as Record<string, unknown>;
  if (text !== null && typeof text !== 'string') return false;
  if (check === null) return true;
  if (!check || typeof check !== 'object') return false;
  const c = check as Record<string, unknown>;
  return (
    typeof c.status === 'string' &&
    STATUSES.includes(c.status) &&
    typeof c.attempts === 'number' &&
    typeof c.problem_count === 'number'
  );
}

/** 리포트 한 칸: 회사(또는 '참고') 이름표 + 문장. 이름표가 없는 줄은 문장만 */
type Item = { label: string | null; text: string };

const LIST_ITEM = /^\s*(?:[-•*]|\d+[.)])\s+/;
// '- (주)한결푸드텍: 매달 …' → 이름표와 문장 (백엔드 report/agent.py 형식 규칙 10)
const LABELED = /^([^:：]{1,40})[:：]\s+(.+)$/;

/**
 * 리포트 글 → 칸 목록. 목록 줄('- ', '1. ')은 줄마다 한 칸, 그 밖의 줄은 빈 줄까지 이어 한 칸.
 * AI가 규칙을 어기고 마크다운 굵게(**)를 쓰면 기호만 지운다.
 */
function items(text: string): Item[] {
  const out: Item[] = [];
  let paragraph: string[] = [];
  // 이름표는 목록 줄에서만 뗀다 (예전 리포트의 문단 속 ': '를 이름표로 오해하지 않게)
  const push = (line: string, labeled: boolean) => {
    const m = labeled ? LABELED.exec(line) : null;
    out.push(m ? { label: m[1].trim(), text: m[2].trim() } : { label: null, text: line });
  };
  const flush = () => {
    if (paragraph.length) push(paragraph.join(' '), false);
    paragraph = [];
  };
  for (const raw of text.replace(/\*\*/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) flush();
    else if (LIST_ITEM.test(line)) {
      flush();
      push(line.replace(LIST_ITEM, ''), true);
    } else paragraph.push(line);
  }
  flush();
  return out;
}

// 금액 글자 ('약 224만원', '3,798만원', '1억 2,000만원', '7,770원', '−31만원'): 굵게 해서 숫자만 훑어도 읽히게
const MONEY = /((?:약 )?−?\d[\d,]*(?:억(?: [\d,]+만)?원?|만 [\d,]+원|만원|원))/;

function withMoney(text: string) {
  return text.split(MONEY).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

export function ReportView({ report }: { report: Report | null }) {
  const [open, setOpen] = useState(false);
  const check = report?.check;
  if (!check || check.status === 'skipped') return null; // 리포트 기능이 꺼진 서버 (시연 모드 등)

  if (check.status !== 'verified' || !report?.text) {
    // 쓰지 못했거나 검증을 통과하지 못함: 계산 결과는 그대로 아래에 있다.
    // 백엔드 사유는 이미 '계산 결과는 그대로 볼 수 있어요'로 끝나므로 그대로 쓴다.
    const why =
      check.status === 'unverified'
        ? 'AI가 쓴 설명이 검증을 통과하지 못해 보여 주지 않아요. 아래 계산 결과는 그대로 볼 수 있어요.'
        : (check.reason ?? 'AI 설명을 쓰지 못했어요. 아래 계산 결과는 그대로 볼 수 있어요.');
    return <p className="salary-notice report-notice">{why}</p>;
  }

  const all = items(report.text);

  // 결론은 위 '한 줄 결론'(verdict.tsx)이 말한다 → AI 설명은 한 줄로 접어 두고, 누르면 펼친다
  return (
    <section
      className={open ? 'report-section is-open' : 'report-section'}
      aria-labelledby="report-title"
    >
      <button
        type="button"
        className="report-head"
        aria-expanded={open}
        aria-controls="report-body"
        onClick={() => setOpen((v) => !v)}
      >
        {/* 제목·배지는 좁으면 줄을 바꾸고, 화살표는 늘 오른쪽 끝에 (혼자 다음 줄로 떨어지지 않게) */}
        <span className="report-head-text">
          <span id="report-title" className="font-semibold text-foreground">
            AI가 쓴 자세한 설명
          </span>
          <span className="report-badge">
            <ShieldCheck aria-hidden className="size-4 shrink-0" />
            금액 검증 통과
          </span>
        </span>
        <ChevronDown aria-hidden className={`report-chevron size-5 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <ul className="report-body" id="report-body">
            {all.map((item, i) => (
              <li key={i}>
                {item.label && <p className="report-item-label">{item.label}</p>}
                <p>{withMoney(item.text)}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            AI가 계산 결과를 보고 쓴 설명이에요. 금액은 AI가 쓴 게 아니라 계산 결과를 그대로
            옮겼어요
            {check.attempts > 1 ? ` (검토에서 고칠 곳이 나와 ${check.attempts}번째에 통과)` : ''}.
          </p>
        </>
      )}
    </section>
  );
}
