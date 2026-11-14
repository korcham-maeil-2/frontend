import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker 배포용: 실행에 필요한 파일만 .next/standalone에 모은다 (Dockerfile 참고)
  output: 'standalone',
  reactCompiler: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
