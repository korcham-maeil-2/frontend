import { ShieldCheck } from 'lucide-react';
import type { components } from '@/lib/api/schema';

// 결과 화면 맨 위의 'AI 리포트' (백엔드 report/agent.py).
//   AI(Claude)가 계산 결과를 쉬운 말로 쓰고, 리포트 속 금액은 프로그램이 계산 결과와 하나하나 대조한다.
//   틀리면 다시 쓰게 하고, 끝까지 못 고치면 리포트를 보여 주지 않는다 → 여기서는 그 상태를 그대로 그린다.

export type ReportCheck = components['schemas']['ReportCheck'];
export type Report = { text: string | null; check: ReportCheck | null };

/** 리포트 글 → 문단·목록 ('- '로 시작하는 줄은 목록). 마크다운은 쓰지 않는다 (백엔드 규칙) */
function blocks(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').filter((line) => line.trim()))
    .filter((lines) => lines.length > 0);
}

export function ReportView({ report }: { report: Report | null }) {
  const check = report?.check;
  if (!check || check.status === 'skipped') return null; // 리포트 기능이 꺼진 서버 (시연 모드 등)

  if (check.status !== 'verified' || !report?.text) {
    // 쓰지 못했거나 검증을 통과하지 못함: 계산 결과는 그대로 아래에 있다
    const why =
      check.status === 'unverified'
        ? 'AI가 쓴 설명의 숫자가 계산 결과와 맞지 않아, 설명은 보여 주지 않아요.'
        : (check.reason ?? 'AI 설명을 쓰지 못했어요.');
    return (
      <p role="status" className="salary-notice">
        {why} 아래 계산 결과는 그대로 볼 수 있어요.
      </p>
    );
  }

  return (
    <section className="report-section" aria-labelledby="report-title">
      <div className="report-head">
        <h3 id="report-title" className="font-semibold text-foreground">
          한눈에 보기
        </h3>
        <p className="report-badge">
          <ShieldCheck aria-hidden className="size-4 shrink-0" />
          숫자 검증 통과
        </p>
      </div>
      <div className="report-body">
        {blocks(report.text).map((lines, i) =>
          lines.every((line) => line.trimStart().startsWith('- ')) ? (
            <ul key={i}>
              {lines.map((line) => (
                <li key={line}>{line.trimStart().slice(2)}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{lines.join(' ')}</p>
          ),
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        AI가 계산 결과를 보고 쓴 설명이에요. 설명 속 금액은 프로그램이 계산 결과와 하나하나
        대조했어요{check.attempts > 1 ? ` (틀린 곳을 고쳐 ${check.attempts}번째에 통과)` : ''}.
      </p>
    </section>
  );
}
