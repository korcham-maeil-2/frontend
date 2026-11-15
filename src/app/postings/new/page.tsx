'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
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
import type { components } from '@/lib/api/schema';
import { examplePostings } from './examples';
import { cellsOf, hasSalary, isImageRead, type Row } from './format';
import { MAX_MESSAGE_CHARS } from './limits';
import {
  AttachmentList,
  FILE_INPUT_ID,
  FilePicker,
  fileSignature,
  usePostingFiles,
} from './posting-files';
import {
  EMPTY_PROFILE,
  missingInputs,
  toUserProfile,
  type ProfileForm,
  type UserProfile,
} from './profile';
import { ProfileFormView } from './profile-form';
import { ResultView, isCalculationResult } from './result-view';
import { RowEditor, fieldId, focusField } from './row-editor';

// 공고 넣기 → (백엔드가 Claude로 비교표를 만듦) → 조건 확인·수정 → 내 생활비 → 매달 남는 돈
//   1) POST /sessions                 공고 글을 보내면 비교표(table)를 돌려받는다
//      POST /sessions/uploads         파일이 있으면 파일(+ 붙여 넣은 글)을 multipart로 보낸다
//   2) 사용자가 칸을 확인·수정한다       고친 칸은 status가 user_input이 된다
//   3) 사용자가 생활비를 넣는다          (서버로 보내지 않고 화면에만 들고 있다)
//   4) POST /sessions/{id}/confirm      고친 비교표 + 생활비를 보내면 계산 결과(result)를 돌려받는다
//      POST /sessions/{id}/recalculate  결과를 본 뒤 생활비·비교표를 고치면 계산만 다시 한다 (AI 호출 없음)

type Step = 'input' | 'review' | 'living' | 'result';
type CalculationResult = components['schemas']['CalculationResult'];
type SessionResponse = components['schemas']['SessionResponse'];

// 화면과 서버의 세션 상태가 어긋났을 때 서버가 주는 답 (새로고침·응답 유실, 서버를 새로 띄움 등)
const ALREADY_CONFIRMED = 'SESSION_NOT_AWAITING_CONFIRMATION'; // 서버는 이미 확인을 마침 → 다시 계산으로
const SESSION_LOST = new Set(['SESSION_NOT_FOUND', 'SESSION_NOT_COMPLETED']); // → 새 세션으로
const errorCode = (error: unknown) => (error as { code?: string } | undefined)?.code ?? '';

const STEPS: { key: Step; label: string }[] = [
  { key: 'input', label: '공고 넣기' },
  { key: 'review', label: '조건 확인' },
  { key: 'living', label: '내 생활비' },
  { key: 'result', label: '남는 돈' },
];
type SourceTab = 'text' | 'files';

// 마지막으로 보낸 입력. 같은 입력으로 다시 '조건 확인하기'를 누르면 새로 읽지 않고 고치던 표로 간다.
type Submitted = {
  message: string; // 붙여 넣은 글
  files: string[]; // 파일 표시 (이름·크기·수정 시각). 파일 자체는 브라우저가 저장할 수 없다.
  inputs: components['schemas']['InputSummary'][]; // 서버가 파일을 어떻게 읽었는지
  inputText: string; // 비교표를 만든 글 전체 (확인을 마친 뒤 다시 고칠 때 새 세션에 쓴다)
};
const NOTHING_SUBMITTED: Submitted = { message: '', files: [], inputs: [], inputText: '' };

// 공고 여러 개를 한 메시지로 보낼 때 사이에 넣는 구분선
const POSTING_SEPARATOR = '\n\n---\n\n';
const NETWORK_ERROR = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
const RESULT_ERROR = '계산 결과를 읽지 못했어요. 잠시 후 다시 계산해 주세요.';
// 새로고침해도 작성·수정 중인 내용이 남도록 이 탭 안에만 저장한다 (sessionStorage).
const DRAFT_KEY = 'wolgeup.posting-draft';

type Draft = {
  step: Step | 'done'; // 'done'은 생활비 단계 전에 저장한 초안 (읽기만 한다)
  texts: string[];
  sessionId: string;
  submitted?: Submitted;
  submittedMessage?: string; // 파일 기능 전에 저장한 초안 (읽기만 한다)
  rows: Row[];
  originalRows: Row[];
  completed: boolean;
  profile?: ProfileForm;
  result?: CalculationResult | null;
  resultKey?: string;
};

/**
 * 결과를 계산한 입력의 지문: 서버로 보낸 비교표 + 사용자 정보.
 * 지금 입력과 다르면 결과가 낡은 것이다. (보낸 값 기준이라, 빈 고정비 줄을 넣었다 지우는 것처럼
 * 계산에 영향 없는 화면 변화로는 결과가 사라지지 않는다)
 */
function inputKey(rows: Row[], profile: UserProfile) {
  return JSON.stringify([rows, profile]);
}

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

/** 아직 저장하지 않은 초안이 있으면 지금 저장한다. */
function flushDraft(unsaved: { current: Draft | null }) {
  if (unsaved.current) saveDraft(unsaved.current);
  unsaved.current = null;
}

export default function NewPosting() {
  const [step, setStep] = useState<Step>('input');
  const [texts, setTexts] = useState<string[]>(['']);
  const [sourceTab, setSourceTab] = useState<SourceTab>('text');
  const attachments = usePostingFiles();
  const [sessionId, setSessionId] = useState('');
  const [submitted, setSubmitted] = useState<Submitted>(NOTHING_SUBMITTED);
  // 새로고침해서 첨부 목록이 사라졌는지 (파일은 브라우저가 저장하지 못한다). 파일을 다시 넣으면 끈다.
  const [filesLost, setFilesLost] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [originalRows, setOriginalRows] = useState<Row[]>([]);
  // 확인을 한 번 마친 세션은 다시 확인할 수 없어서(409), 다시 고칠 때는 새 세션을 만든다.
  const [completed, setCompleted] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [resultKey, setResultKey] = useState('');
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
      // 생활비 단계 전에 저장한 초안('done')은 생활비 단계로 이어서 연다.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장소는 브라우저에만 있어서 화면이 뜬 뒤에 읽는다
      setStep(draft.step === 'done' ? (draft.result ? 'result' : 'living') : draft.step);
      setTexts(draft.texts.length ? draft.texts : ['']);
      setSessionId(draft.sessionId);
      const last = draft.submitted ?? {
        ...NOTHING_SUBMITTED,
        message: draft.submittedMessage ?? '',
      };
      setSubmitted(last);
      if (last.files.length) {
        // 파일로 넣었던 공고면 '파일 첨부' 탭을 열어 '첨부가 사라졌다'는 안내가 보이게 한다.
        setFilesLost(true);
        setSourceTab('files');
      }
      setRows(draft.rows);
      setOriginalRows(draft.originalRows);
      setCompleted(draft.completed);
      setProfile(draft.profile ?? EMPTY_PROFILE);
      setResult(isCalculationResult(draft.result) ? draft.result : null);
      setResultKey(draft.resultKey ?? '');
    }
    setRestored(true);
    getHealth()
      .then((health) => setDemoMode(health?.normalize_mode === 'fixture'))
      .catch(() => {});
  }, []);

  // 글자를 칠 때마다 저장하지 않고, 입력이 0.3초 멈추면 한 번 저장한다 (긴 글을 매번 저장하면 느리다).
  // 그 0.3초 안에 새로고침하거나 다른 화면으로 가면, 떠나기 직전에 남은 저장을 마저 한다.
  const unsaved = useRef<Draft | null>(null);
  useEffect(() => {
    if (!restored) return;
    unsaved.current = {
      step,
      texts,
      sessionId,
      submitted,
      rows,
      originalRows,
      completed,
      profile,
      result,
      resultKey,
    };
    const timer = setTimeout(() => flushDraft(unsaved), 300);
    return () => clearTimeout(timer);
  }, [
    restored,
    step,
    texts,
    sessionId,
    submitted,
    rows,
    originalRows,
    completed,
    profile,
    result,
    resultKey,
  ]);
  useEffect(() => {
    const onLeave = () => flushDraft(unsaved);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      onLeave(); // 다른 화면으로 이동할 때
    };
  }, []);

  // 공고를 읽거나 계산하는 동안 탭을 닫거나 새로고침하면 결과를 잃는다 → 한 번 묻는다.
  useEffect(() => {
    if (busy === null) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

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
  const files = attachments.files.map(({ file }) => file);
  const signatures = files.map(fileSignature);
  // 새로고침으로 첨부 목록만 사라진 상태 (표는 남아 있다)
  const filesGone = filesLost && files.length === 0;
  // 지난번에 보낸 것과 같은 입력인지 (글 + 파일). 같으면 다시 읽지 않고 고치던 표로 간다.
  const sameInput =
    rows.length > 0 &&
    message === submitted.message &&
    (filesGone || signatures.join('\n') === submitted.files.join('\n'));
  // 이미지·PDF는 AI 이미지 인식을 쓸 수 있어 오래 걸린다 (PDF는 스캔본인지 서버가 알아본다)
  const mayUseVision = attachments.files.some(
    ({ mime }) => mime.startsWith('image/') || mime === 'application/pdf',
  );

  function showError(text: string, where: SourceTab) {
    setError(text);
    setSourceTab(where);
    requestAnimationFrame(() =>
      (where === 'files' ? document.getElementById(FILE_INPUT_ID) : firstTextarea.current)?.focus(),
    );
  }

  async function readPostings() {
    // 입력을 그대로 두고 돌아왔다면, 새로 읽지 않고 고치던 표로 돌아간다.
    // (새로고침으로 첨부 목록만 비었을 때도 같은 입력이다 → 빈 입력 검사보다 먼저 본다)
    if (sameInput) {
      changeStep('review');
      return;
    }
    if (!message && !files.length) {
      showError(
        filesGone
          ? '새로고침해서 첨부 파일이 목록에서 사라졌어요. 파일을 다시 넣거나 본문을 붙여 넣어 주세요.'
          : '공고 본문을 붙여 넣거나 파일을 넣어 주세요. 예시 공고로 먼저 해 봐도 돼요.',
        filesGone ? 'files' : 'text',
      );
      return;
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      showError(
        `붙여 넣은 글이 ${message.length.toLocaleString('ko-KR')}자예요. ` +
          `${MAX_MESSAGE_CHARS.toLocaleString('ko-KR')}자까지 넣을 수 있어요. 근무 조건 부분만 넣어 주세요.`,
        'text',
      );
      return;
    }
    // 새로고침으로 첨부만 사라진 상태에서 글을 바꾸면, 파일로 만든 공고는 새 표에서 빠진다 → 묻는다.
    if (
      (edited || filesGone) &&
      !window.confirm(
        filesGone
          ? '새로고침해서 첨부 파일이 사라졌어요. 지금 글로만 비교표를 새로 만들면 파일에서 읽은 공고는 빠져요. 계속할까요? (파일도 넣으려면 취소하고 파일을 다시 넣어 주세요)'
          : '넣은 공고가 바뀌어서 비교표를 새로 만들어요. 고친 내용은 사라져요. 계속할까요?',
      )
    ) {
      return;
    }
    setBusy('reading');
    setError('');
    try {
      const { data, error } = files.length
        ? await api.POST('/sessions/uploads', {
            body: { message },
            // 파일은 JSON에 담을 수 없어서 FormData(multipart)로 보낸다.
            // Content-Type은 브라우저가 경계 문자열과 함께 정한다 (직접 정하면 안 된다).
            bodySerializer: (body) => {
              const form = new FormData();
              files.forEach((file) => form.append('files', file, file.name));
              if (body?.message) form.append('message', body.message);
              return form;
            },
          })
        : await api.POST('/sessions', { body: { message } });
      // 파일을 보냈다면 오류는 파일 쪽 문제다 (글 길이는 위에서 이미 확인했다) → 파일 탭으로 간다.
      const where = files.length ? 'files' : 'text';
      if (error || !data) {
        showError(error?.message ?? NETWORK_ERROR, where);
        return;
      }
      const table = data.table ?? [];
      if (!table.length) {
        showError(
          demoMode
            ? '시연 모드에서는 "예시 공고 넣기"의 공고와 시연용 파일만 읽을 수 있어요.'
            : '공고에서 근무 조건을 찾지 못했어요. 회사명·근무지·급여가 적힌 부분을 넣어 주세요.',
          where,
        );
        return;
      }
      setSessionId(data.session_id);
      setSubmitted({
        message,
        files: signatures,
        inputs: data.inputs ?? [],
        inputText: data.input_text ?? message,
      });
      setFilesLost(false);
      setCompleted(false);
      setRows(table);
      setOriginalRows(table);
      // 새 표는 공고 ID(posting-1 …)가 다른 회사를 가리킬 수 있어 공고별 비용과 결과는 비운다.
      // 지금 집 주거비·고정비처럼 공고와 관계없는 값은 그대로 둔다.
      setProfile((form) => ({ ...form, postings: {} }));
      setResult(null);
      changeStep('review');
    } catch {
      showError(NETWORK_ERROR, files.length ? 'files' : 'text');
    } finally {
      setBusy(null);
    }
  }

  const missingSalary = rows
    .map((row, i) => ({ row, number: i + 1 }))
    .filter(({ row }) => !hasSalary(row));

  function goToLiving() {
    // 연봉이 빈 공고가 있으면 한 번 알려 준다. 막지는 않는다 (연봉을 몰라도 계산 단계로 갈 수 있다).
    if (missingSalary.length && !salaryWarned) {
      setSalaryWarned(true);
      return;
    }
    changeStep('living');
  }

  const missingProfile = missingInputs(profile, rows);
  // 지금 보이는 결과가 지금 입력(비교표 + 생활비)으로 계산한 것인지. 고쳤으면 다시 계산해야 결과를 보여 준다.
  const currentKey = useMemo(() => inputKey(rows, toUserProfile(profile, rows)), [rows, profile]);
  const freshResult = result !== null && resultKey === currentKey ? result : null;

  /**
   * 매달 남는 돈 계산.
   *   - 아직 확인 전인 세션 → POST /confirm      (비교표 + 사용자 정보)
   *   - 확인을 마친 세션   → POST /recalculate  (비교표 + 사용자 정보, 공고를 다시 읽지 않는다)
   * 화면과 서버의 상태가 어긋나 있으면 서버의 답에 맞춰 한 번 더 시도한다.
   *   - '이미 확인을 마침' → 같은 세션에 /recalculate
   *   - '세션이 없음' 등   → 같은 공고 글로 새 세션을 만들어 /confirm (공고를 다시 읽는다)
   */
  async function calculate() {
    setBusy('confirming');
    setError('');
    const sentRows = rows;
    const sentProfile = toUserProfile(profile, rows);

    const confirm = (id: string) =>
      api.POST('/sessions/{session_id}/confirm', {
        params: { path: { session_id: id } },
        body: { approved: true, table: sentRows, profile: sentProfile },
      });
    const recalculate = (id: string) =>
      api.POST('/sessions/{session_id}/recalculate', {
        params: { path: { session_id: id } },
        body: { table: sentRows, profile: sentProfile },
      });

    function finish(data: SessionResponse, id: string) {
      if (!isCalculationResult(data.result)) {
        setError(RESULT_ERROR); // 모양이 다르면(예전 백엔드 등) 그리지 않는다
        return;
      }
      const calculatedRows = data.table?.length ? data.table : sentRows;
      setSessionId(id);
      setRows(calculatedRows);
      setCompleted(true);
      setResult(data.result);
      setResultKey(inputKey(calculatedRows, sentProfile));
      changeStep('result');
    }

    try {
      if (sessionId) {
        let response = await (completed ? recalculate(sessionId) : confirm(sessionId));
        if (!response.data && errorCode(response.error) === ALREADY_CONFIRMED) {
          response = await recalculate(sessionId);
        }
        if (response.data) {
          finish(response.data, sessionId);
          return;
        }
        if (!SESSION_LOST.has(errorCode(response.error))) {
          setError(response.error?.message ?? NETWORK_ERROR);
          return;
        }
      }
      // 새 세션: 파일로 넣었으면 서버가 파일에서 읽은 글(inputText)을 쓴다 (파일을 다시 올리지 않아도 된다).
      const started = await api.POST('/sessions', {
        body: { message: submitted.inputText || submitted.message },
      });
      if (started.error || !started.data) {
        setError(started.error?.message ?? NETWORK_ERROR);
        return;
      }
      const id = started.data.session_id;
      const confirmed = await confirm(id);
      if (confirmed.error || !confirmed.data) {
        setError(confirmed.error?.message ?? NETWORK_ERROR);
        return;
      }
      finish(confirmed.data, id);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    // 결과까지 본 비교를 지우는 일이라 한 번 묻는다.
    if (
      result &&
      !window.confirm('지금 비교를 지우고 새 공고로 시작할까요? 생활비는 그대로 둬요.')
    ) {
      return;
    }
    setTexts(['']);
    setRows([]);
    setOriginalRows([]);
    setSessionId('');
    setSubmitted(NOTHING_SUBMITTED);
    setFilesLost(false);
    attachments.clear();
    setCompleted(false);
    // 지금 집 주거비·고정비는 다음 비교에도 그대로 쓴다. 공고별 비용과 결과만 비운다.
    setProfile((form) => ({ ...form, postings: {} }));
    setResult(null);
    setResultKey('');
    changeStep('input');
  }

  // 이미지에서 읽은 값이 있으면 확인 화면에서 원본과 비교하라고 알린다.
  const { inputs } = submitted;
  const visionInputs = inputs.filter((item) => (item.vision_pages ?? 0) > 0);
  const ocrInputs = inputs.filter((item) => item.method === 'ocr' || item.method === 'mixed');
  const unreadable = inputs.reduce((sum, item) => sum + (item.unreadable ?? 0), 0);
  const ignoredImages = inputs.filter((item) => (item.ignored_images ?? 0) > 0);
  const hasImageCells = rows.some((row) => cellsOf(row).some(isImageRead));
  const names = (list: typeof inputs) => list.map((item) => item.name).join(', ');

  // 화면에 보이는 단계. 결과 단계인데 결과가 지금 입력과 맞지 않으면(고쳤거나 예전 초안) 생활비 단계를 보여 준다.
  const shown: Step = step === 'result' && !freshResult ? 'living' : step;
  const reviewing = shown !== 'input';
  const demoNotice = demoMode && (
    <p className="demo-notice">
      시연 모드예요. 실제 AI 대신 미리 준비한 답을 써서 &ldquo;예시 공고 넣기&rdquo;의 공고와 시연용
      공고 파일만 읽을 수 있어요.
    </p>
  );

  return (
    <div className="desk-spread">
      <div className="desk-intro">
        <div className="desk-intro-inner">
          <ol className="step-track" aria-label="진행 단계">
            {STEPS.map(({ key, label }, i) => {
              const current = STEPS.findIndex((item) => item.key === shown);
              const done = i < current;
              // 지난 단계, 또는 계산을 마친 뒤 생활비 단계에서 결과로 돌아가기
              const reachable = done || (key === 'result' && freshResult !== null && shown !== key);
              return (
                <li key={key} aria-current={shown === key ? 'step' : undefined}>
                  {reachable ? (
                    <button
                      type="button"
                      onClick={() => changeStep(key)}
                      disabled={busy !== null}
                      aria-label={`${label}${done ? ' 완료' : ''}, ${label} 단계로 가기`}
                    >
                      <span className="step-number">{done ? <Check aria-hidden /> : i + 1}</span>
                      {label}
                    </button>
                  ) : (
                    <>
                      <span className="step-number">{i + 1}</span>
                      {label}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <h1 ref={heading} tabIndex={-1} className="desk-title outline-none">
            {shown === 'result' ? (
              '매달 남는 돈'
            ) : shown === 'living' ? (
              '내 생활비'
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
            {shown === 'result'
              ? '세금·4대보험을 빼고, 집·교통비·고정비까지 빼면 매달 이만큼 남아요.'
              : shown === 'living'
                ? '공고에는 없는 내 사정을 알려 주세요. 빈칸은 계산할 수 없다고 표시하고, 지어내지 않아요.'
                : reviewing
                  ? '공고에서 읽은 값이 맞는지 확인하세요. 틀린 값은 고치고, 빠진 값은 직접 입력할 수 있어요.'
                  : '비교할 공고의 본문을 붙여 넣거나 공고 파일을 넣어 주세요. 여러 개를 함께 넣을 수 있어요.'}
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

      {shown === 'result' && freshResult ? (
        <section className="desk-sheet sheet-enter" aria-label="매달 남는 돈">
          {demoNotice}
          <h2 className="sheet-heading">공고 {rows.length}개 비교</h2>
          <ResultView result={freshResult} rows={rows} />
          <div className="sheet-actions flex-wrap">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11" onClick={() => changeStep('living')}>
                <Calculator aria-hidden /> 생활비 바꾸기
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={() => changeStep('review')}>
                <Pencil aria-hidden /> 조건 다시 고치기
              </Button>
            </div>
            <Button className="main-action" onClick={startOver}>
              새로 비교하기 <ArrowRight aria-hidden />
            </Button>
          </div>
        </section>
      ) : shown === 'living' ? (
        <form
          className="desk-sheet sheet-enter"
          aria-label="내 생활비"
          aria-busy={busy === 'confirming'}
          onSubmit={(event) => {
            event.preventDefault();
            calculate();
          }}
        >
          {demoNotice}
          <h2 className="sheet-heading">공고 {rows.length}개에 필요한 값</h2>
          {/* 계산하는 동안은 입력을 잠근다 (계산이 끝나면 보낸 값으로 화면을 맞추므로, 그사이 고친 값이 사라진다) */}
          <fieldset disabled={busy !== null} className="min-w-0">
            <ProfileFormView form={profile} rows={rows} onChange={setProfile} />
          </fieldset>
          {missingProfile.length > 0 && (
            <div className="salary-notice mt-6">
              <p className="font-semibold">비어 있는 값은 계산할 수 없다고 표시돼요</p>
              <ul>
                {missingProfile.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <p role="alert" className="form-hint">
            {error}
          </p>
          <div className="sheet-actions">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={busy !== null}
              onClick={() => changeStep('review')}
            >
              <ArrowLeft aria-hidden /> 조건 확인으로
            </Button>
            <Button type="submit" className="main-action" disabled={busy !== null}>
              {busy === 'confirming' ? '계산하는 중…' : '매달 남는 돈 계산하기'}{' '}
              <Calculator aria-hidden />
            </Button>
          </div>
        </form>
      ) : reviewing ? (
        <section className="desk-sheet sheet-enter" aria-label="공고 조건 확인">
          {demoNotice}
          <h2 className="sheet-heading">공고 {rows.length}개의 근무 조건</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            확인 = 공고에서 읽은 값 · 추정 = 공고와 맞는지 다시 봐야 하는 값 · 입력 = 직접 고친 값 ·
            공고에 없음 = 공고에 적혀 있지 않은 값
            {hasImageCells && ' · 이미지에서 읽음 = AI가 이미지 글자를 옮겨 적은 값'}
          </p>
          {(visionInputs.length > 0 || ocrInputs.length > 0 || ignoredImages.length > 0) && (
            <div className="salary-notice mb-6">
              <p className="font-semibold">이미지에서 읽은 값은 원본과 한 번 더 비교해 주세요</p>
              {visionInputs.length > 0 && (
                <p>
                  {names(visionInputs)}: 글자를 복사할 수 없어서 AI가 이미지 속 글자를 옮겨
                  적었어요. 숫자를 잘못 읽었을 수 있어요.
                  {unreadable > 0 && ` 흐려서 읽지 못한 곳이 ${unreadable}군데 있어요.`}
                </p>
              )}
              {ocrInputs.length > 0 && (
                <p>{names(ocrInputs)}: 스캔한 PDF라, 스캐너가 기계로 읽어 넣어 둔 글자를 썼어요.</p>
              )}
              {ignoredImages.length > 0 && (
                <p>
                  {names(ignoredImages)}: 글 사이에 들어 있는 그림(표 캡처 등)은 읽지 않았어요. 그림
                  속 조건은 직접 넣어 주세요.
                </p>
              )}
            </div>
          )}
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
            <Button className="main-action" disabled={busy !== null} onClick={goToLiving}>
              {salaryWarned && missingSalary.length
                ? '연봉 없이 다음으로'
                : edited
                  ? '고친 내용으로 다음'
                  : '이대로 다음'}{' '}
              <ArrowRight aria-hidden />
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
          <Tabs value={sourceTab} onValueChange={(tab) => setSourceTab(tab as SourceTab)}>
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
                채용 공고 캡처, PDF, 엑셀을 넣으면 근무 조건을 읽어 와요. 붙여 넣은 본문과 함께
                넣어도 돼요.
              </p>
              {filesGone && (
                <p className="rounded-lg bg-muted p-3 text-sm text-body">
                  새로고침해서 첨부 파일 목록이 비었어요. 비교표는 그대로라서 &ldquo;고치던 표로
                  돌아가기&rdquo;를 누르면 돼요. 다른 파일로 다시 읽으려면 파일을 새로 넣어 주세요.
                </p>
              )}
              <FilePicker
                add={(incoming) => {
                  setError('');
                  setFilesLost(false);
                  attachments.add(incoming);
                }}
                error={attachments.error}
                notice={attachments.notice}
                compact={attachments.files.length > 0}
              />
              <AttachmentList
                files={attachments.files}
                remove={(url) => {
                  setError('');
                  attachments.remove(url);
                }}
                showTotal
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                파일 원본은 서버에 저장하지 않고, 읽은 글만 비교표를 만드는 데 써요. 글자를 복사할
                수 없는 이미지는 글자를 읽기 위해 AI(Claude)에 보내요.
              </p>
            </TabsContent>
          </Tabs>
          <p role="status" className="form-hint">
            {busy === 'reading' && (
              <span className="text-body">
                {mayUseVision
                  ? '파일을 읽고 있어요. 이미지나 스캔한 PDF가 있으면 30초~1분쯤 걸려요.'
                  : '공고를 읽고 있어요. 10~20초쯤 걸려요.'}
              </span>
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
                : sameInput && (message || submitted.files.length)
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
