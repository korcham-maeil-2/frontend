<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 월급지도 화면 작업

- UI를 만들거나 고치기 전에 `DESIGN.md`를 읽고 그 색·글꼴·부품 규칙을 따른다.
- 백엔드 API를 부를 때는 `src/lib/api/client.ts`를 쓰고, 타입은 `pnpm gen:api`로 만든 `src/lib/api/schema.d.ts`를 쓴다.
