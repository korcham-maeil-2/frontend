import createClient from 'openapi-fetch';
import type { paths } from './schema';

// 백엔드 주소. 배포할 때는 NEXT_PUBLIC_API_BASE_URL로 바꾼다.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

// schema.d.ts는 `pnpm gen:api`로 백엔드 /openapi.json에서 만든다. 손으로 고치지 않는다.
export const api = createClient<paths>({ baseUrl: API_BASE_URL });

/** 백엔드가 살아 있는지 확인한다. 정상이면 { status: 'ok' }. */
export async function getHealth() {
  const { data, error } = await api.GET('/health');
  if (error) {
    throw new Error('백엔드 상태 확인 실패');
  }
  return data;
}
