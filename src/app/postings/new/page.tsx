'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardPaste, FileText, Paperclip } from 'lucide-react';
import Image from 'next/image';
import noticeArt from '@public/posting-notice.webp';
import reviewArt from '@public/posting-review.webp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentList, FilePicker, usePostingFiles } from './posting-files';

const fields = [
  { name: '회사명', labels: ['회사명', '기업명'] },
  { name: '근무지', labels: ['근무지', '근무 지역', '근무지역'] },
  { name: '연봉', labels: ['연봉'] },
  { name: '수당', labels: ['수당'] },
];

const example = [
  '가상 공고 · 모래빛스튜디오 콘텐츠 운영 담당자',
  '',
  '회사명: 모래빛스튜디오',
  '근무지: 대전광역시 유성구',
  '연봉: 3,600만원 (세전)',
  '수당: 식대 월 15만원 별도',
].join('\n');

function readConditions(text: string) {
  return fields.map(({ labels }) => {
    const pattern = new RegExp(`^[ \\t]*(?:${labels.join('|')})[ \\t]*[:：][ \\t]*(.+)$`, 'm');
    return text.match(pattern)?.[1].trim() ?? '';
  });
}

export default function NewPosting() {
  const [previous, setPrevious] = useState<string[][]>([]);
  return (
    <PostingForm
      key={previous.length}
      previous={previous}
      addPosting={(values) => setPrevious((items) => [...items, values])}
    />
  );
}

function ConditionSummary({ values }: { values: string[] }) {
  return (
    <dl className='condition-summary'>
      {fields.map(({ name }, index) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{values[index].trim() || '미입력'}</dd>
        </div>
      ))}
    </dl>
  );
}

function PostingForm({
  previous,
  addPosting,
}: {
  previous: string[][];
  addPosting: (values: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [sourceTab, setSourceTab] = useState('files');
  const attachments = usePostingFiles();
  const hasSource = Boolean(text.trim() || attachments.files.length);
  const [originalValues, setOriginalValues] = useState<string[]>([]);
  const [values, setValues] = useState<string[]>([]);
  const [step, setStep] = useState<'input' | 'review' | 'summary'>('input');
  const reviewing = step !== 'input';
  const [lastReviewed, setLastReviewed] = useState('');
  // 버튼을 막지 않고, 누른 뒤에 무엇이 빠졌는지 알려 준다.
  const [missingSource, setMissingSource] = useState(false);
  const [missingCondition, setMissingCondition] = useState(false);
  const showSourceHint = missingSource && !hasSource;
  const showConditionHint = missingCondition && !values.some((value) => value.trim());
  const heading = useRef<HTMLHeadingElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (previous.length) heading.current?.focus();
  }, [previous.length]);

  function changeStep(next: typeof step) {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  return (
    <div className='desk-spread'>
      <div className='desk-intro'>
        <div className='desk-intro-inner'>
          <ol className='step-track' aria-label='공고 넣기 진행 단계'>
            <li aria-current={step === 'input' ? 'step' : undefined}>
              {reviewing ? (
                <button
                  type='button'
                  onClick={() => changeStep('input')}
                  aria-label='공고 넣기 완료, 공고 넣기로 돌아가기'
                >
                  <span className='step-number'>
                    <Check aria-hidden />
                  </span>
                  공고 넣기
                </button>
              ) : (
                <>
                  <span className='step-number'>1</span>공고 넣기
                </>
              )}
            </li>
            <li aria-current={step === 'review' ? 'step' : undefined}>
              {step === 'summary' ? (
                <button
                  type='button'
                  onClick={() => changeStep('review')}
                  aria-label='조건 확인 완료, 조건 수정하기'
                >
                  <span className='step-number'>
                    <Check aria-hidden />
                  </span>
                  조건 확인
                </button>
              ) : (
                <>
                  <span className='step-number'>2</span>조건 확인
                </>
              )}
            </li>
          </ol>
          <h1 ref={heading} tabIndex={-1} className='desk-title outline-none'>
            {step === 'summary' ? (
              '확인한 근무 조건'
            ) : reviewing ? (
              '근무 조건 확인'
            ) : (
              <>
                비교할 공고를 <br />
                넣어 주세요
              </>
            )}
          </h1>
          <p className='intro-copy'>
            {step === 'summary'
              ? '다른 공고를 추가해도 이 공고의 조건은 이 화면에 남아요.'
              : step === 'input'
                ? '캡처·PDF·엑셀 파일이나 복사한 본문을 넣어 주세요.'
                : originalValues.some(Boolean)
                  ? '본문에서 채운 값이 맞는지 확인하세요. 빠진 조건은 직접 입력할 수 있어요.'
                  : attachments.files.length
                    ? '첨부한 공고를 보며 근무 조건을 입력하세요. 공고에 없는 항목은 비워 두세요.'
                    : '공고 원문을 보며 근무 조건을 입력하세요. 공고에 없는 항목은 비워 두세요.'}
          </p>
          <div className='desk-illustration' aria-hidden='true'>
            <Image
              src={reviewing ? reviewArt : noticeArt}
              alt=''
              fill
              sizes='(max-width: 767px) 32vw, (max-width: 1150px) 40vw, 460px'
            />
          </div>
        </div>
      </div>
      {step === 'summary' ? (
        <section className='desk-sheet' aria-label='근무 조건 요약'>
          <h2 className='sheet-heading'>공고 요약</h2>
          <ConditionSummary values={values} />
          <div className='sheet-actions'>
            <Button variant='outline' className='min-h-11' onClick={() => changeStep('review')}>
              <ArrowLeft aria-hidden />
              조건 수정
            </Button>
            <Button className='main-action' onClick={() => addPosting(values)}>
              다른 공고 추가 <ArrowRight aria-hidden />
            </Button>
          </div>
        </section>
      ) : reviewing ? (
        <section className='desk-sheet sheet-enter' aria-label='공고 조건 확인'>
          <h2 className='sheet-heading'>회사와 처우</h2>
          {attachments.files.length > 0 && (
            <div className='mb-5'>
              <h3 className='mb-2 text-base'>첨부한 원본</h3>
              <AttachmentList files={attachments.files} />
            </div>
          )}
          {lastReviewed.trim() && (
            <details className='mb-5 rounded-md bg-muted px-4'>
              <summary className='cursor-pointer py-3 text-sm font-semibold'>
                <span className='when-closed'>원문 펼치기</span>
                <span className='when-open'>원문 접기</span>
              </summary>
              <p className='pb-4 text-sm whitespace-pre-wrap wrap-anywhere'>{lastReviewed}</p>
            </details>
          )}
          {fields.map(({ name }, index) => (
            <div key={name} className='condition-field'>
              <label htmlFor={name} className='font-semibold'>
                {name}
              </label>
              <Input
                id={name}
                aria-describedby={index === 0 ? 'condition-hint' : undefined}
                value={values[index]}
                placeholder='직접 입력'
                onChange={(event) =>
                  setValues(values.map((value, i) => (i === index ? event.target.value : value)))
                }
                className='h-11 min-w-0 flex-1 rounded-md border border-input px-3 focus-visible:outline-2 focus-visible:outline-ring'
              />
              {values[index].trim() ? (
                <span
                  className={
                    values[index] === originalValues[index]
                      ? 'rounded-sm bg-secondary px-2 py-1 text-xs text-confirmed'
                      : 'rounded-sm bg-user-input-bg px-2 py-1 text-xs text-user-input'
                  }
                >
                  {values[index] === originalValues[index] ? '본문 추출' : '직접 입력'}
                </span>
              ) : (
                <span className='text-xs text-muted-foreground'>미입력</span>
              )}
            </div>
          ))}
          <p id='condition-hint' role='status' className='form-hint'>
            {showConditionHint &&
              '조건을 하나 이상 입력해 주세요. 공고에 없는 항목은 비워 둬도 돼요.'}
          </p>
          <div className='sheet-actions'>
            <Button variant='ghost' className='min-h-11' onClick={() => changeStep('input')}>
              <ArrowLeft aria-hidden /> 공고 넣기로
            </Button>
            <Button
              className='main-action'
              onClick={() => {
                if (!values.some((value) => value.trim())) {
                  setMissingCondition(true);
                  document.getElementById(fields[0].name)?.focus();
                  return;
                }
                changeStep('summary');
              }}
            >
              조건 확인 완료 <Check aria-hidden />
            </Button>
          </div>
        </section>
      ) : (
        <form
          className='desk-sheet'
          onSubmit={(event) => {
            event.preventDefault();
            if (!hasSource) {
              setMissingSource(true);
              if (sourceTab === 'text') textarea.current?.focus();
              return;
            }
            if (text !== lastReviewed || !values.length) {
              const conditions = readConditions(text);
              setValues(
                conditions.map((condition, i) =>
                  values.length && originalValues[i] === condition ? values[i] : condition,
                ),
              );
              setOriginalValues(conditions);
              setLastReviewed(text);
            }
            changeStep('review');
          }}
        >
          <h2 className='sheet-heading mb-4'>넣는 방법</h2>
          <Tabs value={sourceTab} onValueChange={setSourceTab}>
            <TabsList aria-label='공고 넣는 방법' className='source-tabs'>
              <TabsTrigger value='files'>
                <Paperclip size={16} aria-hidden />
                파일 첨부{attachments.files.length > 0 && ` (${attachments.files.length})`}
              </TabsTrigger>
              <TabsTrigger value='text'>
                <ClipboardPaste size={16} aria-hidden />
                본문 붙여넣기
              </TabsTrigger>
            </TabsList>
            <TabsContent value='files' className='source-panel space-y-3'>
              <FilePicker
                add={attachments.add}
                error={attachments.error}
                compact={attachments.files.length > 0}
              />
              <AttachmentList files={attachments.files} remove={attachments.remove} />
            </TabsContent>
            <TabsContent value='text' className='source-panel'>
              <label htmlFor='posting-text' className='mb-2 block text-sm font-semibold'>
                채용 공고 본문
              </label>
              <Textarea
                ref={textarea}
                id='posting-text'
                aria-describedby='source-hint'
                aria-invalid={showSourceHint || undefined}
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={5}
                placeholder='회사명, 근무지, 연봉이 적힌 부분을 복사해 넣으세요.'
                className='min-h-36 resize-y rounded-md border border-input p-3 text-base leading-relaxed focus-visible:outline-2 focus-visible:outline-ring'
              />
            </TabsContent>
          </Tabs>
          <p id='source-hint' role='status' className='form-hint'>
            {showSourceHint &&
              '공고 파일을 넣거나 본문을 붙여넣어 주세요. 예시 공고로 먼저 해 봐도 돼요.'}
          </p>
          <div className='sheet-actions'>
            {!text.trim() && (
              <Button
                type='button'
                variant='ghost'
                className='min-h-11 text-foreground'
                onClick={() => {
                  setText(example);
                  setSourceTab('text');
                  requestAnimationFrame(() => textarea.current?.focus());
                }}
              >
                <FileText aria-hidden /> 예시 공고 넣기
              </Button>
            )}
            <Button type='submit' className='main-action'>
              조건 확인하기 <ArrowRight aria-hidden />
            </Button>
          </div>
        </form>
      )}
      {previous.length > 0 && (
        <section className='previous-postings' aria-label='앞서 확인한 공고'>
          <h2 className='font-semibold'>앞서 확인한 공고</h2>
          {previous.map((item, index) => (
            <details key={index}>
              <summary>
                {item[0].trim() || `공고 ${index + 1}`}
                {item[1].trim() && <small> · {item[1]}</small>}
              </summary>
              <ConditionSummary values={item} />
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
