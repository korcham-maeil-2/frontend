# 월급지도 frontend

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
