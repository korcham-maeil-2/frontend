import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 본문 칸에 채용공고 사이트 링크만 넣은 경우.
// 서비스는 링크를 열어 보지 않는다 (크롤링 제외, 사이트 약관·외부 데이터 이용 권한 문제).
// 링크만 보내면 AI는 주소 글자만 보고 빈 표를 만든다 → 보내기 전에 막고 PDF로 저장하는 법을 알려 준다.

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
/** 링크를 빼고 남은 글이 이보다 짧으면 공고 본문이 없는 것으로 본다 ('잡코리아 공고' 같은 메모 정도) */
const MIN_BODY_CHARS = 30;

/** 링크가 있고, 링크를 빼면 공고 본문이라 할 만한 글이 거의 없는지 */
export function isLinkOnly(text: string): boolean {
  const links = text.match(URL_PATTERN);
  if (!links) return false;
  return text.replace(URL_PATTERN, '').replace(/\s+/g, '').length < MIN_BODY_CHARS;
}

export const LINK_ONLY_ERROR =
  '링크는 열어 볼 수 없어요. 공고 페이지를 PDF로 저장해 파일로 넣거나, 본문을 복사해 붙여 넣어 주세요.';

/** 링크만 넣은 칸 아래에 띄우는 안내: 공고 페이지를 PDF로 저장해 올리는 방법 */
export function LinkHint({ id, onUseFiles }: { id: string; onUseFiles: () => void }) {
  return (
    <div id={id} role="status" className="link-hint">
      <p className="font-semibold text-foreground">링크는 열어 볼 수 없어요</p>
      <p>공고 페이지를 PDF로 저장해서 올려 주세요.</p>
      <ol>
        <li>채용공고 페이지에서 마우스 오른쪽 버튼 → 인쇄 (Ctrl+P, Mac은 ⌘+P)</li>
        <li>대상(프린터)을 &lsquo;PDF로 저장&rsquo;으로 바꾸고 저장</li>
        <li>저장한 PDF를 &lsquo;파일 첨부&rsquo;에 넣기</li>
      </ol>
      <p>휴대폰이면 공고 화면을 캡처해 올리거나, 본문을 복사해 여기에 붙여 넣어도 돼요.</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={onUseFiles}>
        <FileUp aria-hidden /> 파일 첨부로 가기
      </Button>
    </div>
  );
}
