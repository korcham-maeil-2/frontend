# 월급지도 프론트 이미지 (Next.js standalone, 라즈베리파이 arm64 / x86 모두 동작)
#
# 3단계로 나눠 마지막 이미지에는 실행에 필요한 파일만 남긴다.
#   1) deps   : pnpm-lock.yaml 그대로 패키지 설치
#   2) build  : next build → .next/standalone (output: 'standalone', next.config.ts)
#   3) runner : standalone + 정적 파일만 복사해 node server.js로 실행

FROM node:24-bookworm-slim AS base
# package.json의 packageManager(pnpm 버전)를 corepack이 맞춰 준다
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# 1) 의존성 설치 (lock 파일이 바뀌지 않으면 캐시 재사용)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 2) 빌드
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_으로 시작하는 값은 빌드할 때 화면 코드에 박힌다 (실행 중에 바꿀 수 없음).
# 백엔드 주소를 바꾸려면 다시 빌드해야 한다 (docker-compose.yml의 build.args).
ARG NEXT_PUBLIC_API_BASE_URL=https://maeil2-backend.sunghoyaaa.com
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# 3) 실행
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# standalone 서버는 public·.next/static을 자동으로 복사하지 않아 직접 넣는다 (Next 문서)
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
