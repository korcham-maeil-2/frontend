// 공고 넣기 상한 — 백엔드 backend/inputs/limits.py와 같은 값. 화면에서 먼저 막고, 넘으면 서버도 422로 막는다.
// 한쪽을 바꾸면 다른 쪽도 함께 바꾼다.
export const MB = 1024 * 1024;
export const MAX_FILES = 5; // 한 번에 올리는 파일 수
export const MAX_FILE_BYTES = 10 * MB; // 파일 하나
export const MAX_TOTAL_BYTES = 20 * MB; // 한 번에 올리는 파일 합계
// 글자 수는 공고 하나마다 센다 (이슈 backend#52). 공고 여러 개를 비교하는데 합계로 막으면 2~3개만 넣어도 넘는다
export const MAX_POSTING_CHARS = 30_000; // 붙여 넣은 공고 하나 (파일 하나도 서버가 같은 값으로 센다)
export const MAX_MESSAGE_CHARS = MAX_POSTING_CHARS * MAX_FILES; // 한 번에 보내는 글 전체

/**
 * 붙여 넣은 공고 글의 공백 정리 — 백엔드 inputs/pdf.py tidy_page와 같은 규칙 (이슈 backend#52).
 * 웹 공고를 복사하면 표 칸 사이·줄 끝 공백과 빈 줄이 많이 따라와서, 그대로 세면 실제 글보다 훨씬
 * 많은 글자로 세어 상한에 걸린다. 이어진 공백은 한 칸으로(칸 구분은 남는다), 줄 끝 공백과 빈 줄은 뺀다.
 * 글자 수는 이 정리한 글로 세고, 서버에도 정리한 글을 보낸다 (입력 칸의 글은 그대로 둔다).
 */
export function tidyPostingText(text: string): string {
  return text
    .replace(/[ \t\u00a0\u3000]{2,}/g, ' ')
    .replace(/[^\S\n]+$/gm, '') // 줄 끝 공백 (줄바꿈은 남긴다)
    .replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n')
    .trim();
}
