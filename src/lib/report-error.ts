/**
 * 오류 경계(error.tsx·global-error.tsx)가 잡은 오류를 오류 추적(GlitchTip)으로 보낸다.
 * 오류 경계가 잡은 오류는 브라우저의 '처리되지 않은 오류'가 아니라서 SDK가 저절로 보내지 않는다.
 * DSN이 없으면(로컬·CI) 콘솔에만 남긴다. 보내는 내용의 개인정보 처리는 instrumentation-client.ts와 같다.
 */
export function reportError(error: unknown) {
  console.error(error);
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  import('@sentry/browser')
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {
      // 오류 추적을 못 보내도 화면은 그대로
    });
}
