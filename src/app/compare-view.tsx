'use client';

import { useState, type CSSProperties } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useReveal } from './use-reveal';

type Cell = { value: string; note?: string };
type Row = { label: string; seoul: Cell; daegu: Cell; kind?: 'salary' | 'result' };

// 가상 사용자 윤하늘의 두 합격. 강서구 월세는 국토부 실거래가 원룸급 중앙값(2026년 5~10월 조회),
// 세후 월급은 2026년 4대보험 요율과 간이세액으로 낸 추정치, 생활비는 사용자 답변이다.
const rows: Row[] = [
  {
    label: '연봉',
    kind: 'salary',
    seoul: { value: '3,800만원' },
    daegu: { value: '최소 약 2,700만원', note: '공고엔 비공개' },
  },
  {
    label: '세후 월급',
    seoul: { value: '약 275만원' },
    daegu: { value: '약 199만원', note: '서울만큼 남는 기준' },
  },
  {
    label: '집',
    seoul: { value: '−50만원', note: '강서구 원룸 월세' },
    daegu: { value: '−30만원', note: '본가에 드리는 돈' },
  },
  {
    label: '교통비',
    seoul: { value: '−6만원' },
    daegu: { value: '0원', note: '무료 통근버스' },
  },
  {
    label: '생활비',
    seoul: { value: '−100만원' },
    daegu: { value: '−70만원' },
  },
  {
    label: '지역 지원금',
    seoul: { value: '해당 없음' },
    daegu: { value: '+20만원', note: '청년일자리도약장려금 2년 평균' },
  },
  {
    label: '매달 남는 돈',
    kind: 'result',
    seoul: { value: '약 119만원' },
    daegu: { value: '약 119만원' },
  },
];

const places = [
  { key: 'seoul', region: '서울 강서구', company: '(가상) 한빛모빌리티 · 자취' },
  { key: 'daegu', region: '대구 달서구', company: '(가상) 달구벌정밀 · 본가' },
] as const;
type Place = (typeof places)[number];

// 표 아래 캡션: 예시라는 점만 알린다.
const caption = '가상 회사 두 곳으로 계산한 예시예요.';

// 좁은 화면은 한 회사씩 보므로, 결과 줄에 상대 지역 값을 붙여 탭을 안 눌러도 비교가 보이게 한다.
function mobileCell(row: Row, key: Place['key']): Cell {
  if (row.kind !== 'result') return row[key];
  const other = places.find((place) => place.key !== key)!;
  return { ...row[key], note: `${other.region}도 ${row[other.key].value}` };
}

// 대구 열은 AI가 계산해서 채운 쪽이라 열 전체에 연한 배경을 깐다(지역 색이 아니라 '계산한 칸' 표시).
function colClass(key: Place['key']) {
  return key === 'daegu' ? 'is-computed' : undefined;
}

// 줄마다 순서를 CSS에 넘겨, 처음 보일 때 위에서부터 한 줄씩 차례로 떠오르게 한다.
function rowOrder(index: number) {
  return { '--row': index } as CSSProperties;
}

function rowClass(kind?: Row['kind']) {
  return kind === 'salary' ? 'offer-salary' : kind === 'result' ? 'compare-result' : undefined;
}

function CellContent({ cell, kind }: { cell: Cell; kind?: Row['kind'] }) {
  const undisclosed = kind === 'salary' && cell.note === '공고엔 비공개';
  return (
    <>
      <span className={undisclosed ? 'cell-value is-target' : 'cell-value'}>{cell.value}</span>
      {cell.note && (
        <small className={undisclosed ? 'offer-badge' : 'cell-note'}>{cell.note}</small>
      )}
    </>
  );
}

/**
 * 넓은 화면: 두 회사를 열로 놓은 표. 좁은 화면: 회사를 골라 한 열짜리 명세로 본다.
 * 화면 크기에 맞지 않는 쪽은 display:none으로 숨겨 화면 읽기 프로그램에도 한 번만 읽힌다.
 */
export function CompareView() {
  const [ref, reveal] = useReveal<HTMLDivElement>();
  // 모바일에서 탭을 바꾸면 그때부터는 바뀐 명세가 짧게 떠오른다
  const [tabbed, setTabbed] = useState(false);
  return (
    <div ref={ref} className="compare-view" data-reveal={reveal} data-tabbed={tabbed || undefined}>
      <table className="offer-table compare-table">
        <caption className="compare-caption">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">항목</span>
            </th>
            {places.map((place) => (
              <th key={place.key} scope="col" className={colClass(place.key)}>
                {place.region}
                <small>{place.company}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.label} className={rowClass(row.kind)} style={rowOrder(index)}>
              <th scope="row">{row.label}</th>
              {places.map((place) => (
                <td key={place.key} className={colClass(place.key)}>
                  <CellContent cell={row[place.key]} kind={row.kind} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Tabs defaultValue="daegu" className="compare-mobile" onValueChange={() => setTabbed(true)}>
        <TabsList aria-label="비교할 회사" className="source-tabs compare-switch">
          {places.map((place) => (
            <TabsTrigger key={place.key} value={place.key}>
              {place.region}
            </TabsTrigger>
          ))}
        </TabsList>
        {places.map((place) => (
          <TabsContent key={place.key} value={place.key}>
            <p className="compare-company">{place.company}</p>
            <dl className="compare-list">
              {rows.map((row, index) => (
                <div key={row.label} className={rowClass(row.kind)} style={rowOrder(index)}>
                  <dt>{row.label}</dt>
                  <dd>
                    <CellContent cell={mobileCell(row, place.key)} kind={row.kind} />
                  </dd>
                </div>
              ))}
            </dl>
          </TabsContent>
        ))}
        <p className="compare-caption">{caption}</p>
      </Tabs>
    </div>
  );
}
