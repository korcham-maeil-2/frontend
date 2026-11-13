'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardPaste,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import Image from 'next/image';
import noticeArt from '@public/posting-notice.webp';
import reviewArt from '@public/posting-review.webp';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, getHealth } from '@/lib/api/client';
import { examplePostings } from './examples';
import { hasSalary, salaryText, type Row } from './format';
import { AttachmentList, FilePicker, usePostingFiles } from './posting-files';
import { RowEditor, fieldId, focusField } from './row-editor';

// 공고 넣기 → (백엔드가 Claude로 비교표를 만듦) → 조건 확인·수정 → 확인 완료
//   1) POST /sessions                 공고 글을 보내면 비교표(table)를 돌려받는다
//   2) 사용자가 칸을 확인·수정한다       고친 칸은 status가 user_input이 된다
//   3) POST /sessions/{id}/confirm    고친 비교표를 보내면 다음 단계(계산)로 넘어간다

type Step = 'input' | 'review' | 'done';

// 공고 여러 개를 한 메시지로 보낼 때 사이에 넣는 구분선
const POSTING_SEPARATOR = '\n\n---\n\n';
const NETWORK_ERROR = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
// 새로고침해도 작성·수정 중인 내용이 남도록 이 탭 안에만 저장한다 (sessionStorage).
const DRAFT_KEY = 'wolgeup.posting-draft';

type Draft = {
  step: Step;
  texts: string[];
  sessionId: string;
  submittedMessage: string;
  rows: Row[];
  originalRows: Row[];
  completed: boolean;
};

function loadDraft(): Draft | null {
  try {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    return saved ? (JSON.parse(saved) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 저장만 건너뛴다.
  }
}

export default function NewPosting() {
  const [step, setStep] = useState<Step>('input');
  const [texts, setTexts] = useState<string[]>(['']);
  const [sourceTab, setSourceTab] = useState('text');
  const attachments = usePostingFiles();
  const [sessionId, setSessionId] = useState('');
  // 마지막으로 보낸 공고 글. 같은 글로 다시 '조건 확인하기'를 누르면 고치던 표로 돌아간다.
  const [submittedMessage, setSubmittedMessage] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [originalRows, setOriginalRows] = useState<Row[]>([]);
  // 확인을 한 번 마친 세션은 다시 확인할 수 없어서(409), 다시 고칠 때는 새 세션을 만든다.
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState<'reading' | 'confirming' | null>(null);
  const [error, setError] = useState('');
  const [salaryWarned, setSalaryWarned] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [restored, setRestored] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstTextarea = useRef<HTMLTextAreaElement>(null);

  // 처음 열 때: 이 탭에 저장해 둔 작성 내용을 되살리고, 백엔드가 시연 모드인지 묻는다.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장소는 브라우저에만 있어서 화면이 뜬 뒤에 읽는다
      setStep(draft.step);
      setTexts(draft.texts.length ? draft.texts : ['']);
      setSessionId(draft.sessionId);
      setSubmittedMessage(draft.submittedMessage);
      setRows(draft.rows);
      setOriginalRows(draft.originalRows);
      setCompleted(draft.completed);
    }
    setRestored(true);
    getHealth()
      .then((health) => setDemoMode(health?.normalize_mode === 'fixture'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (restored) {
      saveDraft({ step, texts, sessionId, submittedMessage, rows, originalRows, completed });
    }
  }, [restored, step, texts, sessionId, submittedMessage, rows, originalRows, completed]);

  function changeStep(next: Step) {
    setError('');
    setSalaryWarned(false);
    setStep(next);
    // 넓은 화면에서는 왼쪽 제목이 따라다녀서(sticky) 포커스만으로는 위로 안 올라간다.
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  const message = texts
    .map((text) => text.trim())
    .filter(Boolean)
    .join(POSTING_SEPARATOR);
  const edited = rows.some((row, i) => JSON.stringify(row) !== JSON.stringify(originalRows[i]));

  async function readPostings() {
    if (!message) {
      setError(
        attachments.files.length
          ? '파일에서 공고를 읽는 기능은 준비 중이에요. 공고 본문을 붙여 넣어 주세요.'
          : '공고 본문을 붙여 넣어 주세요. 예시 공고로 먼저 해 봐도 돼요.',
      );
      setSourceTab('text');
      requestAnimationFrame(() => firstTextarea.current?.focus());
      return;
    }
    // 글을 그대로 두고 돌아왔다면, 새로 읽지 않고 고치던 표로 돌아간다.
    if (message === submittedMessage && rows.length) {
      changeStep('review');
      return;
    }
    if (
      edited &&
      !window.confirm(
        '공고 글이 바뀌어서 비교표를 새로 만들어요. 고친 내용은 사라져요. 계속할까요?',
      )
    ) {
      return;
    }
    setBusy('reading');
    setError('');
    try {
      const { data, error } = await api.POST('/sessions', { body: { message } });
      if (error || !data) {
        setError(error?.message ?? NETWORK_ERROR);
        return;
      }
      const table = data.table ?? [];
      if (!table.length) {
        setError(
          demoMode
            ? '시연 모드에서는 "예시 공고 넣기"로 넣은 공고만 읽을 수 있어요.'
            : '공고에서 근무 조건을 찾지 못했어요. 회사명·근무지·급여가 적힌 부분을 붙여 넣어 주세요.',
        );
        return;
      }
      setSessionId(data.session_id);
      setSubmittedMessage(message);
      setCompleted(false);
      setRows(table);
      setOriginalRows(table);
      changeStep('review');
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  const missingSalary = rows
    .map((row, i) => ({ row, number: i + 1 }))
    .filter(({ row }) => !hasSalary(row));

  async function confirmTable() {
    // 연봉이 빈 공고가 있으면 한 번 알려 준다. 막지는 않는다 (연봉을 몰라도 계산 단계로 갈 수 있다).
    if (missingSalary.length && !salaryWarned) {
      setSalaryWarned(true);
      return;
    }
    setBusy('confirming');
    setError('');
    try {
      let id = sessionId;
      if (completed) {
        // 이미 확인을 마친 세션은 다시 확인할 수 없어서, 같은 공고로 새 세션을 만든 뒤 고친 표를 보낸다.
        const started = await api.POST('/sessions', { body: { message: submittedMessage } });
        if (started.error || !started.data) {
          setError(started.error?.message ?? NETWORK_ERROR);
          return;
        }
        id = started.data.session_id;
        setSessionId(id);
      }
      const { data, error } = await api.POST('/sessions/{session_id}/confirm', {
        params: { path: { session_id: id } },
        body: { approved: true, table: rows },
      });
      if (error || !data) {
        setError(error?.message ?? NETWORK_ERROR);
        return;
      }
      setRows(data.table ?? rows);
      setCompleted(true);
      changeStep('done');
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    setTexts(['']);
    setRows([]);
    setOriginalRows([]);
    setSessionId('');
    setSubmittedMessage('');
    setCompleted(false);
    changeStep('input');
  }

  const reviewing = step !== 'input';
  const demoNotice = demoMode && (
    <p className="demo-notice">
      시연 모드예요. 실제 AI 대신 미리 준비한 답을 써서 &ldquo;예시 공고 넣기&rdquo;의 공고만 읽을
      수 있어요.
    </p>
  );

  return (
    <div className="desk-spread">
      <div className="desk-intro">
        <div className="desk-intro-inner">
          <ol className="step-track" aria-label="공고 넣기 진행 단계">
            <li aria-current={step === 'input' ? 'step' : undefined}>
              {reviewing ? (
                <button
                  type="button"
                  onClick={() => changeStep('input')}
                  aria-label="공고 넣기 완료, 공고 넣기로 돌아가기"
                >
                  <span className="step-number">
                    <Check aria-hidden />
                  </span>
                  공고 넣기
                </button>
              ) : (
                <>
                  <span className="step-number">1</span>공고 넣기
                </>
              )}
            </li>
            <li aria-current={step === 'review' ? 'step' : undefined}>
              {step === 'done' ? (
                <button
                  type="button"
                  onClick={() => changeStep('review')}
                  aria-label="조건 확인 완료, 조건 다시 고치기"
                >
                  <span className="step-number">
                    <Check aria-hidden />
                  </span>
                  조건 확인
                </button>
              ) : (
                <>
                  <span className="step-number">2</span>조건 확인
                </>
              )}
            </li>
          </ol>
          <h1 ref={heading} tabIndex={-1} className="desk-title outline-none">
            {step === 'done' ? (
              '조건 확인 완료'
            ) : reviewing ? (
              '근무 조건 확인'
            ) : (
              <>
                비교할 공고를 <br />
                넣어 주세요
              </>
            )}
          </h1>
          <p className="intro-copy">
            {step === 'done'
              ? '확인한 조건은 저장했어요. 다음 단계에서 매달 남는 돈을 계산해요.'
              : reviewing
                ? '공고에서 읽은 값이 맞는지 확인하세요. 틀린 값은 고치고, 빠진 값은 직접 입력할 수 있어요.'
                : '비교할 공고의 본문을 붙여 넣어 주세요. 공고는 여러 개 넣을 수 있어요.'}
          </p>
          <div className="desk-illustration" aria-hidden="true">
            <Image
              src={reviewing ? reviewArt : noticeArt}
              alt=""
              fill
              sizes="(max-width: 767px) 32vw, (max-width: 1150px) 40vw, 460px"
            />
          </div>
        </div>
      </div>

      {step === 'done' ? (
        <section className="desk-sheet" aria-label="확인한 공고">
          <h2 className="sheet-heading">확인한 공고 {rows.length}개</h2>
          <dl className="condition-summary">
            {rows.map((row, i) => (
              <div key={row.id}>
                <dt>
                  {i + 1}. {row.company?.value || `공고 ${i + 1}`}
                </dt>
                <dd>{salaryText(row)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 rounded-lg bg-muted p-4 text-sm text-body">
            매달 남는 돈을 계산하는 화면은 준비 중이에요.
          </p>
          <div className="sheet-actions">
            <Button variant="outline" className="min-h-11" onClick={() => changeStep('review')}>
              <Pencil aria-hidden /> 조건 다시 고치기
            </Button>
            <Button className="main-action" onClick={startOver}>
              새로 비교하기 <ArrowRight aria-hidden />
            </Button>
          </div>
        </section>
      ) : reviewing ? (
        <section className="desk-sheet sheet-enter" aria-label="공고 조건 확인">
          {demoNotice}
          <h2 className="sheet-heading">공고 {rows.length}개의 근무 조건</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            확인 = 공고에서 읽은 값 · 추정 = 공고와 맞는지 다시 봐야 하는 값 · 입력 = 직접 고친 값 ·
            공고에 없음 = 공고에 적혀 있지 않은 값
          </p>
          <div className="space-y-8">
            {rows.map((row, i) => (
              <RowEditor
                key={row.id}
                index={i}
                row={row}
                original={originalRows[i]}
                onChange={(next) => {
                  setSalaryWarned(false);
                  setRows(rows.map((item, j) => (j === i ? next : item)));
                }}
              />
            ))}
          </div>
          {salaryWarned && missingSalary.length > 0 && (
            <div role="alert" className="salary-notice">
              <p className="font-semibold">연봉이 비어 있는 공고가 있어요</p>
              <p>제시받은 연봉을 알면 넣어 주세요. 모르면 그대로 확인해도 돼요.</p>
              <ul>
                {missingSalary.map(({ row, number }) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="question-link"
                      onClick={() =>
                        focusField(
                          fieldId(
                            row,
                            row.salary_type?.value === 'monthly'
                              ? 'monthly_salary_krw'
                              : 'annual_salary_krw',
                          ),
                        )
                      }
                    >
                      공고 {number} {row.company?.value ?? ''} 연봉 넣기
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p role="alert" className="form-hint">
            {error}
          </p>
          <div className="sheet-actions">
            <Button variant="ghost" className="min-h-11" onClick={() => changeStep('input')}>
              <ArrowLeft aria-hidden /> 공고 넣기로
            </Button>
            <Button className="main-action" disabled={busy !== null} onClick={confirmTable}>
              {busy === 'confirming'
                ? '확인하는 중…'
                : salaryWarned && missingSalary.length
                  ? '연봉 없이 확인 완료'
                  : edited
                    ? '고친 내용으로 확인 완료'
                    : '이대로 확인 완료'}{' '}
              <Check aria-hidden />
            </Button>
          </div>
        </section>
      ) : (
        <form
          className="desk-sheet"
          aria-busy={busy === 'reading'}
          onSubmit={(event) => {
            event.preventDefault();
            readPostings();
          }}
        >
          {demoNotice}
          <h2 className="sheet-heading mb-4">넣는 방법</h2>
          <Tabs value={sourceTab} onValueChange={setSourceTab}>
            <TabsList aria-label="공고 넣는 방법" className="source-tabs">
              <TabsTrigger value="text">
                <ClipboardPaste size={16} aria-hidden />
                본문 붙여넣기
              </TabsTrigger>
              <TabsTrigger value="files">
                <Paperclip size={16} aria-hidden />
                파일 첨부{attachments.files.length > 0 && ` (${attachments.files.length})`}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="source-panel space-y-4">
              {texts.map((text, i) => (
                <div key={i}>
                  <div className="mb-2 flex min-h-11 items-center justify-between">
                    <label htmlFor={`posting-text-${i}`} className="text-sm font-semibold">
                      공고 {i + 1}
                    </label>
                    {texts.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        aria-label={`공고 ${i + 1} 지우기`}
                        onClick={() => setTexts(texts.filter((_, j) => j !== i))}
                      >
                        <X aria-hidden /> 지우기
                      </Button>
                    )}
                  </div>
                  <Textarea
                    ref={i === 0 ? firstTextarea : undefined}
                    id={`posting-text-${i}`}
                    aria-describedby="source-error"
                    value={text}
                    onChange={(event) => {
                      setError('');
                      setTexts(texts.map((item, j) => (j === i ? event.target.value : item)));
                    }}
                    rows={5}
                    placeholder="회사명, 근무지, 급여가 적힌 부분을 복사해 넣으세요."
                    className="min-h-36 resize-y rounded-md border border-input p-3 text-base leading-relaxed focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                onClick={() => {
                  setTexts([...texts, '']);
                  requestAnimationFrame(() =>
                    document.getElementById(`posting-text-${texts.length}`)?.focus(),
                  );
                }}
              >
                <Plus aria-hidden /> 공고 하나 더 넣기
              </Button>
            </TabsContent>
            <TabsContent value="files" className="source-panel space-y-3">
              <p className="text-sm text-muted-foreground">
                파일에서 공고를 읽는 기능은 준비 중이에요. 지금은 본문을 붙여 넣어 주세요.
              </p>
              <FilePicker
                add={attachments.add}
                error={attachments.error}
                compact={attachments.files.length > 0}
              />
              <AttachmentList files={attachments.files} remove={attachments.remove} />
            </TabsContent>
          </Tabs>
          <p role="status" className="form-hint">
            {busy === 'reading' && (
              <span className="text-body">공고를 읽고 있어요. 10~20초쯤 걸려요.</span>
            )}
          </p>
          <p id="source-error" role="alert" className="form-hint">
            {error}
          </p>
          <div className="sheet-actions">
            {texts.every((text) => !text.trim()) ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 text-foreground"
                onClick={() => {
                  setError('');
                  setTexts(examplePostings);
                  setSourceTab('text');
                  requestAnimationFrame(() => firstTextarea.current?.focus());
                }}
              >
                <FileText aria-hidden /> 예시 공고 넣기
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" className="main-action" disabled={busy !== null}>
              {busy === 'reading'
                ? '읽는 중…'
                : message && message === submittedMessage && rows.length
                  ? '고치던 표로 돌아가기'
                  : '조건 확인하기'}{' '}
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
