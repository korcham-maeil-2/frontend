# 월급지도 frontend

**시연** https://maeil2-frontend.sunghoyaaa.com (로그인 없음) · **API 문서** https://maeil2-backend.sunghoyaaa.com/docs

저장소: [backend](https://github.com/korcham-maeil-2/backend) · **frontend** (여기) · [docs](https://github.com/korcham-maeil-2/docs)

---

취업·이주를 고민하는 청년이 공고를 넣으면, 일자리마다 **매달 실제로 남는 돈**을 비교하고 1년 정착 플랜까지 만들어 주는 AI 에이전트의 화면입니다. 2026 대한민국 청년 CAREER FAIR AI 해커톤 출품작(첫월급연구소).

**화면 흐름** (`src/app/postings/new`)

1. **공고 넣기**: 공고 글 붙여넣기 또는 PDF·엑셀·CSV·이미지 파일 (여러 개). '예시로 사용법 보기'는 예시 공고로 비용 없이 체험
2. **조건 확인**: AI가 정리한 비교표를 확인·수정. 값마다 확인 / 추정 / 입력 배지와 원문 출처
3. **내 생활비**: 지금 집 주거비, 통근·이사 여부와 비용. 계산을 막는 빈 값은 에이전트가 그 칸 위에서 되물음
4. **남는 돈**: 회사·경우별 매달 남는 돈, 연봉 비공개 공고의 최소 연봉, AI 요약
5. **정착 플랜**: 통근/이사별 1년 할 일, 청년 지원 신청 조건, 적금·재직자 강의 참고

Next.js 16 + Tailwind CSS 4 + shadcn/ui (Base UI). 패키지 관리는 pnpm.

## 실행

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000)에서 확인한다.

## 백엔드 API 타입 만들기

프론트 앱과 타입 생성기는 `NEXT_PUBLIC_API_BASE_URL`을 사용한다. 공유 서버를 쓰려면 `.env.local`에 아래와 같이 설정한다. 주소가 바뀌면 이 값을 변경하고 개발 서버를 재시작한다. 배포 환경에서는 빌드 전에 설정한다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://maeil2-backend.sunghoyaaa.com
```

아래 명령은 해당 서버의 `/openapi.json`을 읽어 `src/lib/api/schema.d.ts`를 다시 만든다. 내려받은 명세 파일을 사용하려면 `pnpm gen:api ./openapi.json`처럼 경로를 넘긴다.

```bash
pnpm gen:api
```

- 백엔드 API가 바뀌면 다시 실행하고, 바뀐 `schema.d.ts`를 같이 커밋한다 (CI에는 백엔드가 없어서 이 파일로 빌드한다).
- API 호출은 `src/lib/api/client.ts`의 `api`(openapi-fetch)로 한다. 경로와 응답 타입이 자동으로 맞춰진다.
- 백엔드 주소는 기본 `http://localhost:8000`, 바꾸려면 `NEXT_PUBLIC_API_BASE_URL`을 설정한다.

## 디자인

- 화면을 만들기 전에 [DESIGN.md](DESIGN.md)를 읽는다. 색은 `src/app/globals.css`의 토큰을 Tailwind 클래스로 쓴다.
- 글꼴은 SUIT(본문, SIL OFL 1.1)와 에스코어 드림 Bold(제목). 파일은 `src/app/fonts/`, 라이선스는 `src/app/fonts/SUIT-OFL.txt`와 `src/app/fonts/S-CoreDream-LICENSE.txt`에 있다. 에스코어 드림은 라이선스상 파일을 바꿀 수 없어 OTF 원본 그대로 쓴다.
- shadcn 컴포넌트 추가: `pnpm dlx shadcn@latest add <이름>` → `src/components/ui/`에 생긴다.

## 커밋 전

```bash
pnpm format
pnpm lint
pnpm build
```
