'use client';

import { ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { components } from '@/lib/api/schema';
import { placeName, type Row } from './format';

// 결과 화면의 '근무지별 청년 지원' (백엔드 support/policies.py의 LocalSupport).
//   근무지(시군구)마다: 신청할 수 있거나 곧 열리는 지역 정책 (끝난 정책은 보여 주지 않는다 —
//   다시 열릴지, 조건이 같을지 장담할 수 없어서. 대신 '바뀔 수 있으니 신청 전에 확인' 안내)
//   전국 정책은 어느 회사든 같아서 맨 아래에 한 번만, 접어서 보여 준다.
// 돈 계산에는 넣지 않는다 (받을 수 있는지는 소득·자격 조건에 따라 다르다 → 신청 페이지에서 확인).

type LocalSupport = components['schemas']['LocalSupport'];
type RegionSupport = components['schemas']['RegionSupport'];
type Policy = components['schemas']['SupportPolicy'];

/**
 * 서버·초안의 값이 이 화면이 아는 모양인지 (예전 백엔드·예전 초안이면 그리지 않는다).
 */
export function isLocalSupport(value: unknown): value is LocalSupport {
  const v = value as Partial<LocalSupport> | null | undefined;
  return (
    Array.isArray(v?.regions) &&
    Array.isArray(v?.national) &&
    typeof v?.checked_on === 'string' &&
    v.regions.every((r) => Array.isArray(r.policies))
  );
}

/** '2026-11-30' → '11월 30일' (조회한 해와 다르면 '2027년 1월 1일') */
function day(iso: string, thisYear: string): string {
  const [year, month, date] = iso.split('-');
  const md = `${Number(month)}월 ${Number(date)}일`;
  return year === thisYear ? md : `${year}년 ${md}`;
}

/** 신청 상태 한 줄: '11월 30일까지 신청' / '상시 신청' / '1월 1일부터 신청' / '10월 30일 마감' */
function applyText(policy: Policy, thisYear: string): string {
  const [start, end] = (policy.apply_period ?? '').split(' ~ ');
  switch (policy.apply_status) {
    case 'open':
      return end ? `${day(end, thisYear)}까지 신청` : '신청 중';
    case 'always':
      return '상시 신청';
    case 'upcoming':
      return start ? `${day(start, thisYear)}부터 신청` : '곧 신청 시작';
    default:
      return '신청 기간은 안내 페이지에서 확인';
  }
}

function PolicyItem({ policy, thisYear }: { policy: Policy; thisYear: string }) {
  const name = policy.url ? (
    <a href={policy.url} target="_blank" rel="noopener noreferrer" className="support-link">
      {policy.name}
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only"> (새 창)</span>
    </a>
  ) : (
    <span className="support-name">{policy.name}</span>
  );
  return (
    <li className="support-item">
      <p className="support-title">
        <span className="support-category">{policy.category}</span>
        {/* 자립준비청년·대학생·신혼처럼 대상이 정해진 정책 (아래로 내려 보여 준다) */}
        {policy.fit === 'targeted' && <span className="support-category">특정 대상</span>}
        {name}
      </p>
      {policy.support && <p className="support-text">{policy.support}</p>}
      {/* 좁은 화면에서도 한눈에: 신청 상태·나이 한 줄, 소득은 한 줄로 줄임, 기관은 넓은 화면에서만 */}
      <p className="support-meta">
        <span className={policy.apply_status === 'open' ? 'support-open' : undefined}>
          {applyText(policy, thisYear)}
        </span>
        <span>{policy.age_range === '나이 제한 없음' ? '나이 무관' : policy.age_range}</span>
        {policy.income === '소득 무관' && <span>소득 무관</span>}
        {policy.agency && <span className="support-agency">{policy.agency}</span>}
      </p>
      {policy.income !== '소득 무관' && (
        <p className="support-income" title={policy.income}>
          소득: {policy.income}
        </p>
      )}
    </li>
  );
}

function PolicyList({ policies, thisYear }: { policies: Policy[]; thisYear: string }) {
  return (
    <ul className="support-list">
      {policies.map((policy) => (
        <PolicyItem key={policy.id} policy={policy} thisYear={thisYear} />
      ))}
    </ul>
  );
}

/** 보여 준 것보다 더 있으면: '18개 더 있어요 — 온통청년에서 보기' */
function More({ shown, total, url }: { shown: number; total: number; url: string }) {
  if (total <= shown) return null;
  return (
    <p className="support-more">
      {total - shown}개 더 있어요 ·{' '}
      <a href={url} target="_blank" rel="noopener noreferrer">
        온통청년에서 더 찾아보기<span className="sr-only"> (새 창)</span>
      </a>
    </p>
  );
}

function RegionPanel({
  region,
  rows,
  support,
  thisYear,
}: {
  region: RegionSupport;
  rows: Row[];
  support: LocalSupport;
  thisYear: string;
}) {
  if (region.error) {
    return (
      <p role="status" className="salary-notice">
        {region.error}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="support-region">
        {companiesOf(region, rows)} 근무지 · {region.region}
      </p>
      {region.policies.length > 0 ? (
        <>
          <p className="support-heading">신청할 수 있거나 곧 열리는 정책 {region.matched}개</p>
          <PolicyList policies={region.policies} thisYear={thisYear} />
          <More shown={region.policies.length} total={region.matched} url={support.source_url} />
        </>
      ) : (
        <p className="support-empty">
          지금 신청할 수 있는 {region.region} 정책을 찾지 못했어요. 아래 전국 정책을 확인해 보세요.
        </p>
      )}
    </div>
  );
}

/** 이 지역에 근무지가 있는 회사들 ('(가상) 빛가람그리드(주)') */
function companiesOf(region: RegionSupport, rows: Row[]): string {
  return region.posting_ids
    .map((id) => rows.find((row) => row.id === id)?.company?.value?.trim() || id)
    .join(', ');
}

export function SupportView({
  support,
  rows,
  stale = false,
}: {
  support: LocalSupport;
  rows: Row[];
  /** 오늘 기준으로 다시 고르지 못함 (연결 실패·서버 오류): 계산한 날 기준 목록이라고 알린다 */
  stale?: boolean;
}) {
  const thisYear = support.checked_on.slice(0, 4);
  const { regions, national } = support;
  // 근무지 코드를 정하지 못해 목록이 없어도, 그 이유(notes)는 보여 준다
  if (!regions.length && !national.length && !support.notes.length) return null;

  return (
    <section className="support-section space-y-4" aria-labelledby="support-title">
      <div>
        <h3 id="support-title" className="font-semibold text-foreground">
          근무지별 청년 지원
        </h3>
        <p className="text-sm text-muted-foreground">
          남는 돈 계산에는 넣지 않았어요. 조건·일정은 신청 페이지에서 확인해 주세요.
        </p>
        {/* 다시 고르기는 화면이 뜬 뒤에 실패한다 → 줄을 늘 두고 글만 넣어야 화면 읽기가 읽어 준다 */}
        <p role="status" className="text-sm text-muted-foreground">
          {stale &&
            `오늘 기준으로 다시 확인하지 못했어요. ${day(support.checked_on, thisYear)} 기준 목록이라 그사이 끝난 정책이 있을 수 있어요.`}
        </p>
        {support.notes.map((note) => (
          <p key={note} className="text-sm text-muted-foreground">
            {note}
          </p>
        ))}
      </div>

      {regions.length === 1 ? (
        <RegionPanel region={regions[0]} rows={rows} support={support} thisYear={thisYear} />
      ) : (
        regions.length > 1 && (
          <Tabs defaultValue={regions[0].lawd_cd} className="min-w-0">
            {/* 탭 줄이 화면보다 넓으면 줄 안에서 가로로 밀어 본다 (페이지가 넓어지지 않게) */}
            <TabsList aria-label="볼 근무지" className="posting-tabs">
              {regions.map((region) => (
                // 탭은 짧게 시군구만 (회사 이름은 탭 안 첫 줄에)
                <TabsTrigger key={region.lawd_cd} value={region.lawd_cd}>
                  {placeName(region.region)}
                </TabsTrigger>
              ))}
            </TabsList>
            {regions.map((region) => (
              <TabsContent key={region.lawd_cd} value={region.lawd_cd} className="pt-3">
                <RegionPanel region={region} rows={rows} support={support} thisYear={thisYear} />
              </TabsContent>
            ))}
          </Tabs>
        )
      )}

      {national.length > 0 && (
        <details className="result-details">
          <summary>전국 정책 {support.national_matched}개 · 어느 회사를 골라도 같아요</summary>
          <PolicyList policies={national} thisYear={thisYear} />
          <More shown={national.length} total={support.national_matched} url={support.source_url} />
        </details>
      )}

      <p className="text-sm text-muted-foreground">
        출처: {support.source} · {day(support.checked_on, thisYear)} 기준
      </p>
    </section>
  );
}
