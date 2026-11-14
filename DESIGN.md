---
name: 월급지도 디자인 기준
description: 공고와 생활비를 흰 표에서 비교한다. 회사명과 금액은 잉크 블루, 다음 행동과 현재 선택은 코발트로 표시한다.

colors:
  primary: '#003a9b'
  on-primary: '#ffffff'
  canvas: '#ffffff'
  canvas-soft: '#f7f8fa'
  secondary: '#f1f3f7'
  heading: '#00123c'
  body: '#344052'
  muted: '#596273'
  border: '#dce0e7'
  border-strong: '#929aa8'
  destructive: '#d92d20'
  accent: '#eaf0fa'
  positive: '#0b8457'
  estimated: '#8a5a00'
  estimated-bg: '#fff4d6'

typography:
  fontFamily: SUIT (본문), 에스코어 드림 (강조)
  weights: [400, 600, 700]
  display: { fontSize: 'clamp(3rem, 5.6vw, 4.5rem)', fontWeight: 600, lineHeight: 1.2 }
  heading-1: { fontSize: 24px, fontWeight: 700, lineHeight: 1.3 }
  heading-2: { fontSize: 18px, fontWeight: 700, lineHeight: 1.4 }
  stat-value: { fontSize: 28px, fontWeight: 700, lineHeight: 1.2 }
  body: { fontSize: 16px, fontWeight: 400, lineHeight: 1.6 }
  body-sm: { fontSize: 14px, fontWeight: 400, lineHeight: 1.6 }
  label: { fontSize: 14px, fontWeight: 600, lineHeight: 1.3 }
  caption: { fontSize: 12px, fontWeight: 400, lineHeight: 1.4 }

rounded:
  control: 6px
  card: 8px
  panel: 16px
  full: 9999px

spacing:
  base: 4px
  control-padding: 12px 20px
  card-padding: 20px
  section-gap: 32px
  container: 1088px
---

# 월급지도 디자인 기준

화면을 새로 만들거나 고칠 때 이 문서를 먼저 읽는다. 색과 글꼴은 `src/app/globals.css`와 `src/app/layout.tsx`에 이미 들어 있으니, 값을 새로 만들지 말고 아래 Tailwind 클래스로 쓴다.

생활비 비교표의 구성은 NerdWallet을, 흰색·코발트·잉크 블루의 조합은 [Indeed 색상 가이드](https://indeed.design/brand/color/)를 참고했다.

## 원칙

- **숫자 표가 주인공이다.** 연봉, 월세, 남는 돈이 한눈에 비교돼야 한다. 장식은 줄이고 표와 숫자를 크게 둔다.
- **현재 선택과 다음 행동.** 주 버튼은 흰 글자와 코발트 배경, 선택된 공고나 현재 단계는 흰 바탕에 코발트 선으로 표시한다.
- **그림자 대신 선과 면.** 카드는 `border border-border`, 구역은 옅은 회색 배경으로 나눈다. 그림자는 팝업 같은 떠 있는 요소에만.
- **실제 값에는 출처가 붙는다.** 공고에서 읽은 실제 값은 확인 / 추정 / 사용자 입력을 색과 글로 함께 표시한다 (아래 "신뢰도 표시"). 랜딩의 가상 예시는 배지 대신 "예시"라는 캡션 한 줄로 알린다.
- **쉬운 말.** "실수령액" 대신 "손에 남는 돈"처럼 사회초년생이 바로 알아듣는 말을 쓴다.

## 색 (Tailwind 클래스)

| 용도                       | 클래스                               | 색               |
| -------------------------- | ------------------------------------ | ---------------- |
| 주 버튼·현재 선택          | `bg-primary`, `text-primary`         | #003a9b          |
| 제목·회사명·금액           | `text-foreground`                    | #00123c          |
| 페이지·명세지              | `bg-background`, `bg-card`           | #ffffff          |
| 안내·구분 영역             | `bg-muted`, `bg-secondary`           | #f7f8fa, #f1f3f7 |
| 본문·설명                  | `text-body`, `text-muted-foreground` | #344052, #596273 |
| 구분선·입력 테두리         | `border-border`, `border-input`      | #dce0e7, #929aa8 |
| 오류·삭제                  | `text-destructive`                   | #d92d20          |
| 계산 결과·남는 돈          | `var(--positive)`                    | #0b8457          |
| AI가 계산한 칸·히어로 배경 | `bg-accent`                          | #eaf0fa          |

따뜻한 색(주황·빨강)은 오류와 "추정" 표시 말고는 쓰지 않는다. 초록은 **남는 돈과 그것을 계산해서 나온 답**(매달 남는 돈, 서울만큼 남으려면 필요한 최소 연봉)에만 쓴다. 히어로 제목의 "더 남을까요?"도 같은 뜻(남는 돈)이라 초록으로 쓴다. 지역마다 색을 따로 주지 않는다.

## 글꼴

- **에스코어 드림 Bold**는 페이지·구역 제목(`h1`, `h2`), 워드마크, 한 달에 남는 금액에 쓴다. 본문·입력·표와 작은 소제목(`h3`)은 **SUIT**를 쓴다. 큰 제목은 600, 자간은 `-0.02em`, 본문은 400에 기본 자간을 쓴다.
- 표의 금액은 SUIT의 고정폭 숫자(`tabular-nums`)로 오른쪽 정렬한다. 금액은 "4,000만원", "52만원"처럼 한글 단위로 쓴다.
- 본문은 16px(`text-base`), 표 안은 14px(`text-sm`)을 기본으로 한다. 12px보다 작게 쓰지 않는다.
- 글자 크기는 12 / 14 / 16 / 18 / 20 / 24 / 36 / 54px 여덟 단계만 쓴다(구역 제목과 히어로 제목은 `clamp`로 36·54px 근처). 사이 값(13, 15, 17px 등)을 새로 만들지 않는다.
- 한국어 줄바꿈은 `word-break: keep-all`로 단어 중간에서 끊지 않는다. 뜻 단위로 끊어야 하는 짧은 문장(히어로 통계)만 구절을 `inline-block`으로 묶는다. 말풍선처럼 긴 문장은 줄을 채워 흐르게 두고 `text-wrap: pretty`만 쓴다.

## 모양과 간격

- 버튼·입력: `rounded-md` (약 6px). 카드: `rounded-lg` (8px). 큰 구역 패널: `rounded-2xl` (16px).
- 내용 폭은 최대 1088px. 공통 `.site-shell`이 모바일 20px, 넓은 화면 최소 24px의 좌우 여백을 잡는다.
- 구역 사이는 넓게(`gap-8`), 표 행 사이는 좁게. 행은 가로선 하나로만 나누고 세로선은 쓰지 않는다.
- 터치 대상은 높이 44px 이상(`h-11`).

## 주요 부품

- **버튼:** shadcn `Button`. 주 행동 하나만 `default`(코발트), 나머지는 `secondary`나 `outline`.
- **비교표 (`src/app/compare-view.tsx`):** 열 = 공고(회사), 행 = 항목(연봉, 세후 월급, 집, 교통비, 생활비, 지역 지원금, 매달 남는 돈). 머리 행은 배경을 채우지 않고 아래에 잉크 블루 2px 선 하나만 긋는다. 행은 1px 가는 선으로만 나누고 줄무늬는 쓰지 않는다. 첫 열 글자는 위 제목과 같은 왼쪽 선에 맞추고, 표는 구역 폭을 다 쓴다(가운데로 좁히지 않는다). 금액은 오른쪽 정렬. 공고에 연봉이 없으면 계산한 최소 연봉을 초록으로 쓰고 "공고엔 비공개" 배지를 붙인다. AI가 계산해 채운 열은 `bg-accent`로 열 전체를 연하게 칠한다. 마지막 "매달 남는 돈" 행은 위아래 2px 선 + 초록 에스코어 드림. 넓은 화면에서는 마우스를 올린 줄을 연하게 칠한다. 좁은 화면(40rem 미만)에서는 회사를 고르는 탭(기본은 계산한 쪽) + 한 열짜리 명세로 바꾸고, 결과 줄 아래에 상대 지역 값을 붙인다.
- **상담 장면 (`src/app/agent-story.tsx`):** 진행 막대(번호 원 + 단계 이름 + 시각, 마지막은 "일주일 뒤") 아래에 장면마다 그림 하나와 말풍선 둘. 사용자는 오른쪽 코발트 말풍선(반말), AI는 왼쪽 `bg-accent` 말풍선(존댓말). 넓은 화면에서는 장면 높이를 같게 고정해 탭을 바꿔도 아래가 움직이지 않게 한다. 사람·회사는 모두 가상이고 "(가상)"을 붙인다. 숫자는 비교표와 같은 값을 쓴다.
- **그림:** 히어로(`public/salary-map.webp`)와 같은 입체 미니어처(흰 종이 + 코발트) 한 가지 그림체만 쓴다. 투명 배경 PNG를 WebP로 바꿔 쓰고, 그림마다 원래 비율 그대로 둔다(고정 비율 칸에 넣지 않는다). 같은 그림을 두 곳에 다시 쓰지 않는다.
- **안내 패널:** `bg-muted rounded-2xl`. 설명이나 다음 단계 안내.

## 움직임

- 이징은 `landing.css`의 `--motion` 하나만 쓴다. `opacity`와 `transform`만 움직이고, 금액 숫자는 움직이지 않는다.
- 히어로는 첫 방문에 한 번(제목 → 사례 한 줄 → 버튼 → 통계 순서), 상담 장면과 비교표는 화면에 처음 들어올 때 한 번, 탭을 바꿀 때는 짧게만 재생한다. 헤더 메뉴·표 줄 강조처럼 자주 쓰는 동작은 0.15초 색 변화만.
- 스크롤 등장은 `src/app/use-reveal.ts`로 한다. 처음 열 때 화면에 조금이라도 보이는 내용은 숨기지 않고, 완전히 화면 밖에 있는 내용만 숨겨 둔다. 스크립트가 늦거나 꺼져 있어도 내용은 보인다.
- `prefers-reduced-motion: reduce`면 위치 이동 없이 흐려졌다 나타나기만 한다.

## 신뢰도 표시

공고 조건 확인 화면(`src/app/postings/new`)처럼 실제 공고에서 읽은 값 옆에는 작은 배지를 붙인다. 색만으로 구분하지 않고 글자도 함께 쓴다. 랜딩의 비교표는 가상 회사로 만든 예시라 배지를 붙이지 않고, 표 아래 캡션 "가상 회사 두 곳으로 계산한 예시예요."로 대신한다.

| 상태        | 뜻                                 | 배지                                      |
| ----------- | ---------------------------------- | ----------------------------------------- |
| 확인        | 공고·공공데이터에서 그대로 읽은 값 | `bg-secondary text-confirmed` "확인"      |
| 추정        | 실거래가 중앙값 등으로 계산한 값   | `bg-estimated-bg text-estimated` "추정"   |
| 사용자 입력 | 사용자가 직접 넣거나 고친 값       | `bg-user-input-bg text-user-input` "입력" |

공고에 없는 값은 지어내지 않고 "공고에 없음"으로 비워 두고, 사용자에게 물어본다.

## 하지 말 것

- 카드에 그림자 넣기, 버튼을 알약 모양(`rounded-full`)으로 만들기.
- 코발트를 명세지 배경이나 금액 글자에 쓰기.
- 새 색을 `#hex`로 직접 쓰기. 필요하면 `globals.css`에 토큰을 추가하고 이 문서도 고친다.
- 용도 없이 새 글꼴을 추가하기.
