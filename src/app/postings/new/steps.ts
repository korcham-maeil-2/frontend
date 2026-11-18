// 공고 비교의 다섯 단계 (page.tsx 단계 표시, tour.tsx 둘러보기가 같이 쓴다)

export type Step = 'input' | 'review' | 'living' | 'result' | 'plan';

export const STEPS: { key: Step; label: string }[] = [
  { key: 'input', label: '공고 넣기' },
  { key: 'review', label: '조건 확인' },
  { key: 'living', label: '내 생활비' },
  { key: 'result', label: '남는 돈' },
  { key: 'plan', label: '정착 플랜' },
];
