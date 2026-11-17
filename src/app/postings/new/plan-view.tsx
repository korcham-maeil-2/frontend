'use client';

import { ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { components } from '@/lib/api/schema';
import { formatWon, statusBadge } from './format';
import { SourceBadge } from './source-badge';

// 결과 화면의 '1년 정착 플랜' (백엔드 plan.py의 SettlePlan, 이슈 #18).
//   공고마다: 이사 전 → 이사한 달 → 달마다(신청 마감·시작) → 언제든
//   날짜·금액·순서는 모두 백엔드가 정한 그대로 보여 준다 (화면에서 다시 고르지 않는다).
// 자격은 판단하지 않는다 → 신청 페이지 링크와 '바뀔 수 있어요' 안내.

type SettlePlan = components['schemas']['SettlePlan'];
type PostingPlan = components['schemas']['PostingPlan'];
type PlanSlot = components['schemas']['PlanSlot'];
type PlanItem = components['schemas']['PlanItem'];

/** 서버·초안의 값이 이 화면이 아는 모양인지 (예전 백엔드·예전 초안이면 그리지 않는다) */
export function isSettlePlan(value: unknown): value is SettlePlan {
  const v = value as Partial<SettlePlan> | null | undefined;
  return (
    Array.isArray(v?.postings) &&
    typeof v?.start_month === 'string' &&
    v.postings.every((p) => Array.isArray(p.slots))
  );
}

/** 칸 이름 옆 짧은 설명 */
const SLOT_HINT: Partial<Record<PlanSlot['kind'], string>> = {
  before: '집을 구하기 전에',
  move_month: '이사하고 바로',
  anytime: '기간 제한 없이',
};

function ItemTitle({ item }: { item: PlanItem }) {
  if (!item.url) return <span className="plan-item-title">{item.title}</span>;
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="support-link">
      {item.title}
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}

function Item({ item }: { item: PlanItem }) {
  return (
    <li className="plan-item">
      <p className="plan-item-head">
        <ItemTitle item={item} />
        {item.scope && (
          <span className="support-category">{item.scope === 'national' ? '전국' : '지역'}</span>
        )}
      </p>
      {item.amount_krw != null && (
        <p className="plan-amount">
          <span className="tabular-nums">{formatWon(item.amount_krw)}</span>
          {item.status === 'estimated' && (
            <SourceBadge
              badge={statusBadge.estimated}
              subject={item.title}
              className="result-badge"
              details={item.source ? [{ label: '출처', text: item.source }] : []}
            />
          )}
        </p>
      )}
      {item.detail && <p className="support-text">{item.detail}</p>}
      {(item.when || (item.source && item.amount_krw == null)) && (
        <p className="support-meta">
          {item.when && <span className="support-open">{item.when}</span>}
          {item.source && item.amount_krw == null && (
            <span className="support-agency">{item.source}</span>
          )}
        </p>
      )}
    </li>
  );
}

function PostingPanel({ posting }: { posting: PostingPlan }) {
  if (!posting.slots.length) {
    return <p className="support-empty">지금 넣을 할 일을 찾지 못했어요.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="support-region">
        {posting.company || posting.posting_id}
        {posting.region && ` · ${posting.region}`}
        {posting.moving ? ' · 회사 근처로 이사하는 경우' : ' · 지금 집에서 통근하는 경우'}
      </p>
      <ol className="plan-timeline">
        {posting.slots.map((slot) => (
          <li key={`${slot.kind}-${slot.month ?? ''}`} className={`plan-slot is-${slot.kind}`}>
            <h4 className="plan-slot-label">
              {slot.label}
              {SLOT_HINT[slot.kind] && <small>{SLOT_HINT[slot.kind]}</small>}
            </h4>
            <ul className="plan-items">
              {slot.items.map((item) => (
                <Item key={`${item.kind}-${item.policy_id ?? item.title}`} item={item} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {posting.notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
    </div>
  );
}

export function PlanView({ plan }: { plan: SettlePlan }) {
  const postings = plan.postings.filter((p) => p.slots.length > 0);
  if (!postings.length) return null;
  return (
    <section className="support-section space-y-4" aria-labelledby="plan-title">
      <div>
        <h3 id="plan-title" className="font-semibold text-foreground">
          1년 정착 플랜
        </h3>
        <p className="text-sm text-muted-foreground">
          이 회사를 고르면 언제 무엇을 하면 되는지 순서대로 모았어요.
        </p>
      </div>
      {postings.length === 1 ? (
        <PostingPanel posting={postings[0]} />
      ) : (
        <Tabs defaultValue={postings[0].posting_id} className="min-w-0">
          <TabsList aria-label="볼 회사" className="posting-tabs max-w-full justify-start">
            {postings.map((posting) => (
              <TabsTrigger key={posting.posting_id} value={posting.posting_id}>
                <span className="posting-tab-name">{posting.company || posting.posting_id}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {postings.map((posting) => (
            <TabsContent key={posting.posting_id} value={posting.posting_id} className="pt-3">
              <PostingPanel posting={posting} />
            </TabsContent>
          ))}
        </Tabs>
      )}
      {plan.notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}
