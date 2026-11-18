// 화면 오류 추적 (GlitchTip, 이슈 backend#22) — Next.js가 화면이 뜨기 전에 이 파일을 먼저 실행한다.
//
// NEXT_PUBLIC_SENTRY_DSN이 있을 때만 켠다 (빌드할 때 들어간다. 로컬 개발·CI는 아무것도 보내지 않는다).
// 기록하는 것: 화면에서 잡히지 않은 오류(JS 오류·처리되지 않은 Promise 실패).
// API 실패(5xx)는 백엔드 GlitchTip 프로젝트가 기록한다.
//
// 개인정보 (CLAUDE.md: 개인정보는 외부로 보내지 않는다):
//   - 요청·응답 본문, 헤더, 쿠키, IP·사용자 정보, 주소의 쿼리를 보내지 않는다
//   - console 로그는 오류 직전 흐름(breadcrumb)에 넣지 않는다 (화면 값이 찍힐 수 있다)
//   - 입력칸 글은 원래 SDK가 모으지 않는다 (클릭 기록은 버튼 위치만)
// SDK는 DSN이 있을 때만 따로 불러온다 (없으면 화면 코드가 커지지 않는다).

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production',
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        tracesSampleRate: 0, // 성능 추적은 쓰지 않는다 (오류만)
        beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
        beforeSend(event) {
          // 설정이 바뀌어도 새지 않게 한 번 더: 주소만 남긴다
          if (event.request) event.request = { url: event.request.url?.split('?')[0] };
          delete event.user;
          return event;
        },
      });
    })
    .catch(() => {
      // 오류 추적을 못 켜도 화면은 그대로 쓴다
    });
}
