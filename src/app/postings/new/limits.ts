// 공고 넣기 상한 — 백엔드 backend/inputs/limits.py와 같은 값. 화면에서 먼저 막고, 넘으면 서버도 422로 막는다.
// 한쪽을 바꾸면 다른 쪽도 함께 바꾼다.
export const MB = 1024 * 1024;
export const MAX_FILES = 5; // 한 번에 올리는 파일 수
export const MAX_FILE_BYTES = 10 * MB; // 파일 하나
export const MAX_TOTAL_BYTES = 20 * MB; // 한 번에 올리는 파일 합계
// 글자 수는 공고 하나마다 센다 (이슈 backend#52). 공고 여러 개를 비교하는데 합계로 막으면 2~3개만 넣어도 넘는다
export const MAX_POSTING_CHARS = 30_000; // 붙여 넣은 공고 하나 (파일 하나도 서버가 같은 값으로 센다)
export const MAX_MESSAGE_CHARS = MAX_POSTING_CHARS * MAX_FILES; // 한 번에 보내는 글 전체
