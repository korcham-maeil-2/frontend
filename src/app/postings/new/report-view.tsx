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

type Block = { list: boolean; lines: string[] };

const LIST_ITEM = /^\s*(?:[-•*]|\d+[.)])\s+/;

/** 리포트 글 → 문단·목록. 줄 단위로 본다: 목록 줄('- ', '1. ')이 이어지면 목록, 나머지는 문단.
 *  AI가 규칙을 어기고 마크다운 굵게(**)를 쓰면 기호만 지운다. */
function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\*\*/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      out.push({ list: false, lines: [] }); // 빈 줄 = 문단 나눔
      continue;
    }
    const list = LIST_ITEM.test(line);
    const last = out.at(-1);
    const content = list ? line.replace(LIST_ITEM, '') : line;
    if (last && last.list === list && last.lines.length > 0) last.lines.push(content);
    else out.push({ list, lines: [content] });
  }
  return out.filter((block) => block.lines.length > 0);
}

const PREVIEW_BLOCKS = 2; // 처음에는 두 묶음만 보여 주고 '더 보기' (휴대폰에서 숫자 표가 밀리지 않게)

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

  const all = blocks(report.text);
  const shown = open ? all : all.slice(0, PREVIEW_BLOCKS);
  const more = all.length > PREVIEW_BLOCKS;

  return (
    <section className="report-section" aria-labelledby="report-title">
      <div className="report-head">
        <h3 id="report-title" className="font-semibold text-foreground">
          한눈에 보기
        </h3>
        <p className="report-badge">
          <ShieldCheck aria-hidden className="size-4 shrink-0" />
          금액 검증 통과
        </p>
      </div>
      <div className="report-body" id="report-body">
        {shown.map((block, i) =>
          block.list ? (
            <ul key={i}>
              {block.lines.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{block.lines.join(' ')}</p>
          ),
        )}
      </div>
      {more && (
        <button
          type="button"
          className="question-link report-more"
          aria-expanded={open}
          aria-controls="report-body"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '설명 접기' : '설명 더 보기'}
          <ChevronDown aria-hidden className={`size-4 ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      <p className="text-sm text-muted-foreground">
        AI가 계산 결과를 보고 쓴 설명이에요. 설명 속 금액은 AI가 아니라 프로그램이 계산 결과에서
        그대로 넣었어요
        {check.attempts > 1 ? ` (검토에서 고칠 곳이 나와 ${check.attempts}번째에 통과)` : ''}.
      </p>
    </section>
  );
}
