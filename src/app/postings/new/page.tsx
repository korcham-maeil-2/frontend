'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, getHealth } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { examplePostings } from './examples';
import {
  IMAGE_READ_BADGE,
  cellsOf,
  hasMaskedQuote,
  isImageRead,
  placeName,
  statusBadge,
  type Row,
} from './format';
import { MAX_MESSAGE_CHARS, MAX_POSTING_CHARS } from './limits';
import { AgentProgress } from './agent-progress';
import { LINK_ONLY_ERROR, LinkHint, isLinkOnly } from './link-hint';
import {
  AttachmentList,
  FILE_INPUT_ID,
  FilePicker,
  fileSignature,
  usePostingFiles,
} from './posting-files';
import {
  EMPTY_PROFILE,
  isSettledRent,
  missingInputs,
  rentsFromResult,
  toUserProfile,
  type ProfileForm,
  type Rents,
  type UserProfile,
} from './profile';
import { ProfileFormView } from './profile-form';
import { PostingTabs, companyName } from './posting-tabs';
import { ResultView, bestRemainingText, isCalculationResult } from './result-view';
import { BadgeLegend } from './source-badge';
import { SupportView, isLocalSupport } from './support-view';
import { PlanPreview, PlanView, isSettlePlan } from './plan-view';
import { askQuestionsOf, type AskQuestion } from './ask-view';
import { ReportView, isReport, type Report } from './report-view';
import { RowEditor, fieldsToCheck, focusField, salaryLeftBlank } from './row-editor';

// 공고 넣기 → (백엔드가 Claude로 비교표를 만듦) → 조건 확인·수정 → 내 생활비 → 매달 남는 돈
//   1) POST /sessions                 공고 글을 보내면 비교표(table)를 돌려받는다
//      POST /sessions/uploads         파일이 있으면 파일(+ 붙여 넣은 글)을 multipart로 보낸다
//   2) 사용자가 칸을 확인·수정한다       고친 칸은 status가 user_input이 된다
//   3) 사용자가 생활비를 넣는다          (서버로 보내지 않고 화면에만 들고 있다)
//   4) POST /sessions/{id}/confirm      고친 비교표 + 생활비를 보내면 계산 결과(result)를 돌려받는다
//      POST /sessions/{id}/recalculate  결과를 본 뒤 생활비·비교표를 고치면 계산만 다시 한다 (AI 호출 없음)

type Step = 'input' | 'review' | 'living' | 'result' | 'plan';
type CalculationResult = components['schemas']['CalculationResult'];
type LocalSupport = components['schemas']['LocalSupport'];
type SettlePlan = components['schemas']['SettlePlan'];
type SessionResponse = components['schemas']['SessionResponse'];

// 화면과 서버의 세션 상태가 어긋났을 때 서버가 주는 답 (새로고침·응답 유실, 서버를 새로 띄움 등)
const ALREADY_CONFIRMED = 'SESSION_NOT_AWAITING_CONFIRMATION'; // 서버는 이미 확인을 마침 → 다시 계산으로
const SESSION_LOST = new Set(['SESSION_NOT_FOUND', 'SESSION_NOT_COMPLETED']); // → 새 세션으로
const errorCode = (error: unknown) => (error as { code?: string } | undefined)?.code ?? '';

/**
 * 내 생활비 칸에서 엔터: 계산하지 않고 다음 칸으로 간다.
 * 엔터를 '이 칸 입력 끝'으로 누르는 습관 때문에, 빈칸이 남은 채로 계산되지 않게 한다.
 * 한글을 조합하는 중의 엔터(글자 확정)는 건드리지 않는다 (keyCode 229: 조합 중을 알리는 값, Safari 대비).
 * 마지막 칸에서는 '계산하기' 버튼으로 간다 — 계산은 그 버튼을 눌러야 한다.
 */
function enterMovesToNextField(event: KeyboardEvent<HTMLFormElement>) {
  const target = event.target;
  const composing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
  if (event.key !== 'Enter' || composing || !(target instanceof HTMLInputElement)) return;
  event.preventDefault();
  const fields = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'input:not([type=hidden]):not(:disabled), select:not(:disabled)',
    ),
  ].filter((field) => !field.closest('details:not([open])')); // 접힌 선택 항목으로는 가지 않는다
  const sameGroup = (field: HTMLElement) =>
    target.type === 'radio' && field instanceof HTMLInputElement && field.name === target.name;
  let next = fields.slice(fields.indexOf(target) + 1).find((field) => !sameGroup(field));
  // 다음 칸이 라디오 묶음이면 고른 단추로 (첫 단추로 가면 화살표 한 번에 값이 바뀐다)
  if (next instanceof HTMLInputElement && next.type === 'radio') {
    next =
      event.currentTarget.querySelector<HTMLElement>(`input[name="${next.name}"]:checked`) ?? next;
  }
  (next ?? event.currentTarget.querySelector<HTMLElement>('button[type=submit]'))?.focus();
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'input', label: '공고 넣기' },
  { key: 'review', label: '조건 확인' },
  { key: 'living', label: '내 생활비' },
  { key: 'result', label: '남는 돈' },
  { key: 'plan', label: '정착 플랜' },
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

/** 한국 날짜 'YYYY-MM-DD' (청년 지원 목록의 조회한 날과 비교한다) */
function todayInKorea(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

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
  support?: LocalSupport | null; // 근무지별 청년 지원 (계산 결과와 같이 받는다)
  plan?: SettlePlan | null; // 1년 정착 플랜 (계산 결과와 같이 받는다)
  report?: Report | null; // AI 리포트와 검증 결과 (계산 결과와 같이 받는다)
  resultKey?: string;
  activePosting?: string;
  seenPostings?: string[];
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
  const [support, setSupport] = useState<LocalSupport | null>(null);
  const [plan, setPlan] = useState<SettlePlan | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [resultKey, setResultKey] = useState('');
  const [busy, setBusy] = useState<'reading' | 'confirming' | null>(null);
  const [error, setError] = useState('');
  // 다음 단계로 가기 전 '아직 볼 것' 알림을 한 번 보여 줬는지 (막지는 않는다)
  const [checkWarned, setCheckWarned] = useState(false);
  // 회사 탭에서 고른 공고(조건 확인·내 생활비 공통)와, 조건 확인에서 한 번이라도 연 공고
  const [activePosting, setActivePosting] = useState('');
  const [seenPostings, setSeenPostings] = useState<string[]>([]);
  // 다른 회사 탭의 칸으로 갈 때, 탭이 바뀌어 그 칸이 그려진 뒤 커서를 옮길 칸
  const pendingFocus = useRef<string | null>(null);
  const reviewTodo = useRef<HTMLDivElement>(null); // 조건 확인 맨 위 '할 일' 상자
  const [demoMode, setDemoMode] = useState(false);
  // 서버가 청년 지원을 찾을 수 있는지 (온통청년 키). 아니면 나이 칸을 숨긴다 (나이는 그것에만 쓴다)
  const [supportEnabled, setSupportEnabled] = useState(false);
  // 근무지(시군구 코드)별 원룸 월세 시세. 이사할 집 주거비를 비우면 서버가 이 값으로 계산한다
  const [rents, setRents] = useState<Rents>({});
  // 시세를 불러오지 못한 지역 (빈칸 경고에 넣고, '내 생활비' 단계에 다시 들어오면 다시 묻는다)
  const [failedRents, setFailedRents] = useState<string[]>([]);
  const requestedRents = useRef(new Set<string>()); // 한 번 물은 지역 (응답 전에 또 묻지 않게)
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
      if (isCalculationResult(draft.result)) {
        setRents(rentsFromResult(draft.result.rent_estimates));
      }
      setSupport(isLocalSupport(draft.support) ? draft.support : null);
      setPlan(isSettlePlan(draft.plan) ? draft.plan : null);
      setReport(isReport(draft.report) ? draft.report : null);
      setResultKey(draft.resultKey ?? '');
      setActivePosting(draft.activePosting ?? '');
      setSeenPostings(draft.seenPostings ?? draft.rows.map((row) => row.id));
    }
    setRestored(true);
    // 서버가 막 깨어나는 중이면 첫 확인이 실패할 수 있어 한 번 더 묻는다 (나이 칸·시연 표시가 빠지지 않게)
    const applyHealth = (health: Awaited<ReturnType<typeof getHealth>>) => {
      setDemoMode(health?.normalize_mode === 'fixture');
      setSupportEnabled(health?.local_support === true);
    };
    getHealth()
      .then(applyHealth)
      .catch(() => {
        setTimeout(
          () =>
            getHealth()
              .then(applyHealth)
              .catch(() => {}),
          3000,
        );
      });
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
      support,
      plan,
      report,
      resultKey,
      activePosting,
      seenPostings,
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
    support,
    plan,
    report,
    resultKey,
    activePosting,
    seenPostings,
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

  /** 월세 시세를 불러오지 못했던 지역을 다시 묻는다 (생활비 화면 effect가 다시 요청한다) */
  function retryFailedRents() {
    if (!failedRents.length) return;
    for (const code of failedRents) requestedRents.current.delete(code);
    setFailedRents([]);
  }

  /** 단계 바꾸기. 조건 확인으로 갈 때는 지금 고른 공고를 '본 것'으로 (새 표를 읽을 때는 따로 정한다) */
  function changeStep(next: Step, { markActiveSeen = true } = {}) {
    setError('');
    setConfirmingRestart(false); // 다른 단계에 갔다 오면 '새로 시작' 확인은 닫힌 채로
    setCheckWarned(false);
    if (next === 'review' && markActiveSeen && activeId) markSeen(activeId);
    if (next === 'living') retryFailedRents(); // 불러오지 못했던 지역은 다시 묻는다
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
    // 링크만 넣은 공고는 읽을 내용이 없다 (링크는 열어 보지 않는다) → 보내지 않고 방법을 알려 준다
    const linkOnly = texts.findIndex(isLinkOnly);
    if (linkOnly >= 0) {
      setError(
        texts.length > 1
          ? `공고 ${linkOnly + 1}에는 링크만 있어요. ${LINK_ONLY_ERROR}`
          : LINK_ONLY_ERROR,
      );
      setSourceTab('text');
      requestAnimationFrame(() => document.getElementById(`posting-text-${linkOnly}`)?.focus());
      return;
    }
    // 공고 하나마다 MAX_POSTING_CHARS (전체는 서버 상한 MAX_MESSAGE_CHARS)
    const tooLong = texts.findIndex((text) => text.trim().length > MAX_POSTING_CHARS);
    if (tooLong >= 0 || message.length > MAX_MESSAGE_CHARS) {
      const which = tooLong >= 0 ? texts[tooLong].trim().length : message.length;
      showError(
        (tooLong >= 0
          ? `${texts.length > 1 ? `공고 ${tooLong + 1}` : '붙여 넣은 글'}이 ${which.toLocaleString('ko-KR')}자예요. ` +
            `공고 하나는 ${MAX_POSTING_CHARS.toLocaleString('ko-KR')}자까지 넣을 수 있어요.`
          : `붙여 넣은 글이 모두 ${which.toLocaleString('ko-KR')}자예요. ` +
            `${MAX_MESSAGE_CHARS.toLocaleString('ko-KR')}자까지 넣을 수 있어요.`) +
          ' 근무 조건 부분만 넣어 주세요.',
        'text',
      );
      if (tooLong >= 0) {
        requestAnimationFrame(() => document.getElementById(`posting-text-${tooLong}`)?.focus());
      }
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
      setSupport(null);
      setPlan(null);
      setAsking(null);
      setReport(null);
      // 새 표: 첫 공고를 고르고 그것만 '본 것'으로 (예전 표에서 연 탭 기록은 버린다)
      setActivePosting(table[0].id);
      setSeenPostings([table[0].id]);
      changeStep('review', { markActiveSeen: false });
    } catch {
      showError(NETWORK_ERROR, files.length ? 'files' : 'text');
    } finally {
      setBusy(null);
    }
  }

  // 고른 공고. 고른 적이 없거나 표가 바뀌어 없어졌으면 첫 공고
  const activeId = (rows.find((row) => row.id === activePosting) ?? rows[0])?.id ?? '';

  function markSeen(id: string) {
    setSeenPostings((seen) => (seen.includes(id) ? seen : [...seen, id]));
  }

  function selectPosting(id: string) {
    pendingFocus.current = null; // 탭을 직접 고르면, 예약해 둔 칸 이동은 버린다
    setActivePosting(id);
    if (step === 'review') markSeen(id);
  }

  /** 칸으로 이동. 다른 회사 탭의 칸이면 탭을 바꾸고, 그 탭이 그려진 뒤 커서를 옮긴다. */
  function goToField(rowId: string, id: string) {
    if (rowId === activeId || !rows.some((row) => row.id === rowId)) {
      focusField(id);
      return;
    }
    selectPosting(rowId);
    pendingFocus.current = id;
  }
  useEffect(() => {
    if (!pendingFocus.current) return;
    focusField(pendingFocus.current);
    pendingFocus.current = null;
  }, [activeId]);

  // 조건 확인의 '할 일': 공고마다 다시 볼 칸 (탭 개수·위 상자·단계 요약이 같이 쓴다. 비교표가 바뀔 때만 다시 센다).
  // 공고를 열어 보는 것 자체는 할 일로 세지 않는다 (볼 값이 없는 공고를 열라는 건 만든 숙제).
  // 연봉 비공개도 세지 않는다 — 비어 있어도 최소 연봉을 계산해 주는 게 이 서비스의 기능이다.
  const toCheck = useMemo(() => new Map(rows.map((row) => [row.id, fieldsToCheck(row)])), [rows]);
  const cellsToCheck = [...toCheck.values()].reduce((sum, ids) => sum + ids.length, 0);
  const reviewSummary = cellsToCheck ? `다시 볼 값 ${cellsToCheck}개` : '고칠 값 없음';

  function goToLiving() {
    // 다시 볼 값이 남았으면 한 번만 위 상자로 올려 보여 준다. 막지는 않는다 (모르는 값은 두고 가도 된다).
    if (cellsToCheck && !checkWarned) {
      setCheckWarned(true);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      reviewTodo.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      reviewTodo.current?.focus({ preventScroll: true });
      return;
    }
    changeStep('living');
  }

  // '비교 기준'은 연봉 금액이 없는 공고가 있을 때만 보인다 → 숨었으면 '지금 회사' 칸도 묻지 않는다
  const missingProfile = missingInputs(
    rows.some(salaryLeftBlank) ? profile : { ...profile, hasCurrentJob: false },
    rows,
    rents,
    failedRents,
  );
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
  function finishCalculation(
    data: SessionResponse,
    id: string,
    sentRows: Row[],
    sentProfile: UserProfile,
  ) {
    // 되묻기: 계산을 막는 빈 값이 있어 서버가 질문을 보냈다 → 대화 상자를 띄우고 답을 기다린다
    const questions = data.status === 'awaiting_answer' ? askQuestionsOf(data.pending) : null;
    if (questions) {
      setSessionId(id);
      setAsking({ id, questions });
      return;
    }
    setAsking(null);
    if (!isCalculationResult(data.result)) {
      setError(RESULT_ERROR); // 모양이 다르면(예전 백엔드 등) 그리지 않는다
      return;
    }
    const calculatedRows = data.table?.length ? data.table : sentRows;
    setSessionId(id);
    setRows(calculatedRows);
    setCompleted(true);
    setResult(data.result);
    setRents((known) => ({ ...known, ...rentsFromResult(data.result?.rent_estimates) }));
    // 청년 지원은 키가 없거나 예전 백엔드면 오지 않는다 → 없으면 그 영역만 안 그린다
    setSupport(isLocalSupport(data.local_support) ? data.local_support : null);
    // 정착 플랜: 예전 백엔드면 오지 않는다 → 없으면 그 영역만 안 그린다
    setPlan(isSettlePlan(data.plan) ? data.plan : null);
    // AI 리포트: 검증을 통과했을 때만 글이 온다 (report_check로 상태를 알린다)
    setReport({ text: data.report ?? null, check: data.report_check ?? null });
    setResultKey(inputKey(calculatedRows, sentProfile));
    changeStep('result');
  }

  // 되묻기 대화 (계산 전에 서버가 빈 값을 물어볼 때)
  const [asking, setAsking] = useState<{ id: string; questions: AskQuestion[] } | null>(null);
  // 질문이 뜨면 물은 원래 칸으로 스크롤하고 커서를 넣는다 (바로 답할 수 있게).
  // 계산 중에는 입력칸이 잠겨 있어(fieldset disabled) 커서가 안 들어가므로, 계산이 끝난 뒤 한 번만.
  const focusedAsk = useRef<object | null>(null);
  useEffect(() => {
    if (!asking || busy !== null || focusedAsk.current === asking) return;
    focusedAsk.current = asking;
    const field = document.getElementById('current-housing'); // 묻는 칸은 지금 집 주거비뿐
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    field?.focus({ preventScroll: true });
    // 질문이 새로 왔을 때만 (답을 치는 동안 폼이 바뀌어도 커서를 옮기지 않는다)
  }, [asking, busy]);

  /**
   * 계산하기. 되묻기 중이면 답(원래 칸에 넣은 값)을 포함한 지금 폼 값을 통째로 /confirm에 다시 보낸다
   * (질문 중에 고친 다른 칸·비교표도 함께 반영된다). skipMissing: '모르겠어요, 이대로 계산'
   */
  async function calculate({ skipMissing = false } = {}) {
    setBusy('confirming');
    setError('');
    const sentRows = rows;
    const sentProfile = toUserProfile(profile, rows);

    const confirm = (id: string) =>
      api.POST('/sessions/{session_id}/confirm', {
        params: { path: { session_id: id } },
        body: { approved: true, table: sentRows, profile: sentProfile, skip_missing: skipMissing },
      });
    const recalculate = (id: string) =>
      api.POST('/sessions/{session_id}/recalculate', {
        params: { path: { session_id: id } },
        body: { table: sentRows, profile: sentProfile },
      });

    try {
      if (sessionId) {
        let response = await (completed ? recalculate(sessionId) : confirm(sessionId));
        if (!response.data && errorCode(response.error) === ALREADY_CONFIRMED) {
          response = await recalculate(sessionId);
        }
        if (response.data) {
          finishCalculation(response.data, sessionId, sentRows, sentProfile);
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
      finishCalculation(confirmed.data, id, sentRows, sentProfile);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  // 결과까지 본 비교를 지우는 일이라 한 번 묻는다. 브라우저 확인 창(window.confirm)은 앱 안
  // 브라우저(카카오톡 등)에서 막혀 바로 '취소'가 되므로, 화면 안에서 묻는다.
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  function requestStartOver() {
    if (result) setConfirmingRestart(true);
    else startOver();
  }

  function startOver() {
    setConfirmingRestart(false);
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
    setSupport(null);
    setPlan(null);
    setAsking(null);
    setReport(null);
    setResultKey('');
    setActivePosting('');
    setSeenPostings([]);
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
  // 정착 플랜은 결과의 다음 단계: 결과가 없으면 생활비, 플랜이 없으면 결과를 보여 준다.
  const hasPlan = !!plan?.postings.length; // 칸이 없어도 결론·참고는 보여 준다
  const shown: Step =
    (step === 'result' || step === 'plan') && !freshResult
      ? 'living'
      : step === 'plan' && !hasPlan
        ? 'result'
        : step;

  // 결과 화면을 열 때, 청년 지원이 오늘 기준이 아니면(며칠 전에 계산) 오늘 날짜로 다시 고른다.
  // 저장된 목록은 계산한 날 기준이라 '신청 중'이던 정책이 그새 끝났을 수 있다. 다시 고른 것은
  // 저장된 계산 결과를 바꾸지 않는다 (GET /sessions/{id}/local-support는 보기만 한다).
  const showingResult = shown === 'plan' && sessionId !== ''; // 청년 지원은 정착 플랜 단계에서 보여 준다
  // 오늘 기준으로 다시 고르지 못한 목록의 날짜. 지금 보이는 목록이 그 날짜면 '그날 기준'이라고 알린다
  // (다시 고르는 데 성공하거나 새로 비교하면 목록 날짜가 바뀌어 저절로 사라진다)
  const [staleFor, setStaleFor] = useState<string | null>(null);
  const supportDate = support?.checked_on;
  useEffect(() => {
    if (!showingResult || !supportDate || supportDate === todayInKorea()) return;
    let cancelled = false;
    api
      .GET('/sessions/{session_id}/local-support', {
        params: { path: { session_id: sessionId } },
      })
      .then(({ data }) => {
        if (cancelled) return;
        if (data === undefined) return setStaleFor(supportDate);
        setSupport(isLocalSupport(data) ? data : null);
      })
      // 못 받아 오면 저장된 목록을 그대로 보여 주고, 계산한 날 기준이라고 알린다
      .catch(() => !cancelled && setStaleFor(supportDate));
    return () => {
      cancelled = true;
    };
  }, [showingResult, sessionId, supportDate]);
  // 내 생활비 화면에서 근무지 월세 시세를 받아 온다 (이사할 집 주거비 칸 안내, 빈칸 경고).
  // 지역마다 한 번만 묻는다 (근무지가 여러 곳이어도 응답을 버리고 다시 묻지 않는다).
  // 확정된 결과만 담고, 못 받으면 failedRents에 넣어 빈칸 경고를 띄운다 → 다음에 들어오면 다시 묻는다.
  const rentCodes = [
    ...new Set(rows.map((row) => row.location?.value?.lawd_cd).filter((c): c is string => !!c)),
  ].join(',');
  useEffect(() => {
    if (shown !== 'living' || !rentCodes) return;
    for (const code of rentCodes.split(',')) {
      if (code in rents || requestedRents.current.has(code)) continue;
      requestedRents.current.add(code);
      api
        .GET('/rent/{lawd_cd}', { params: { path: { lawd_cd: code } } })
        .then(({ data }) => {
          if (isSettledRent(data)) setRents((known) => ({ ...known, [code]: data }));
          else setFailedRents((codes) => [...codes, code]);
        })
        .catch(() => setFailedRents((codes) => [...codes, code]));
    }
    // failedRents: '다시 불러오기'로 실패 목록을 비우면 같은 화면에서도 다시 묻는다
    // (실패해서 목록에 들어갈 때는 requestedRents에 남아 있어 다시 묻지 않는다)
  }, [shown, rentCodes, rents, failedRents]);
  const reviewing = shown !== 'input';
  const shownIndex = STEPS.findIndex((item) => item.key === shown);
  // 단계마다 지금까지 넣은 것을 한 줄로 (넓은 화면의 단계 표시 아래)
  const summaries: Record<Step, string> = {
    input: rows.length ? `공고 ${rows.length}개` : '',
    review: rows.length ? reviewSummary : '',
    living:
      shownIndex < 2 && !completed
        ? ''
        : missingProfile.length
          ? `빈칸 ${missingProfile.length}개`
          : '다 넣음',
    result: freshResult ? bestRemainingText(freshResult) : '',
    plan: '',
  };
  const demoNotice = demoMode && (
    <p className="demo-notice">
      시연 모드라서 &ldquo;예시 공고 넣기&rdquo;의 공고와 시연용 공고 파일만 읽을 수 있어요.
    </p>
  );

  return (
    // 공고 넣기는 왼쪽 안내 + 오른쪽 입력 두 칸, 그다음 단계부터는 화면 한 장을 넓게 쓴다
    <div className={shown === 'input' ? 'desk-spread' : 'desk-spread is-wide'}>
      <div className="desk-intro">
        <div className="desk-intro-inner">
          <ol className="step-track" aria-label="진행 단계">
            {STEPS.map(({ key, label }, i) => {
              const done = i < shownIndex;
              // 지난 단계, 또는 계산을 마친 뒤 생활비 단계에서 결과로 돌아가기
              const reachable =
                done ||
                ((key === 'result' || (key === 'plan' && hasPlan)) &&
                  freshResult !== null &&
                  shown !== key);
              const content = (
                <>
                  <span className="step-number">{done ? <Check aria-hidden /> : i + 1}</span>
                  <span className="step-text">
                    <span className="step-label">{label}</span>
                    {summaries[key] && <span className="step-summary">{summaries[key]}</span>}
                  </span>
                </>
              );
              return (
                <li key={key} aria-current={shown === key ? 'step' : undefined}>
                  {reachable ? (
                    <button
                      type="button"
                      onClick={() => changeStep(key)}
                      disabled={busy !== null}
                      aria-label={`${label}${done ? ' 완료' : ''}${summaries[key] ? ` (${summaries[key]})` : ''}, ${label} 단계로 가기`}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ol>
          <h1 ref={heading} tabIndex={-1} className="desk-title outline-none">
            {shown === 'plan' ? (
              '1년 정착 플랜'
            ) : shown === 'result' ? (
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
            {shown === 'plan'
              ? '이 회사에 가면 1년 동안 챙길 일을 모았어요.'
              : shown === 'result'
                ? '세금과 4대보험, 주거비·교통비·고정비를 빼고 매달 남는 돈이에요.' +
                  (freshResult?.break_even.length
                    ? ' 연봉이 없는 공고는 받아야 할 최소 연봉을 계산했어요.'
                    : '')
                : shown === 'living'
                  ? '공고에 없는 내 생활비를 넣어 주세요.'
                  : reviewing
                    ? '공고에서 가져온 조건이에요. 다시 볼 값은 아래에 모았어요.'
                    : '공고 글을 붙여 넣거나 파일을 올려 주세요. 여러 곳을 한 번에 비교할 수 있어요.'}
          </p>
          {shown === 'input' && (
            <div className="desk-illustration" aria-hidden="true">
              <Image
                src={noticeArt}
                alt=""
                fill
                sizes="(max-width: 767px) 32vw, (max-width: 1150px) 40vw, 460px"
              />
            </div>
          )}
        </div>
      </div>

      {(shown === 'result' || shown === 'plan') && freshResult ? (
        <section
          key={shown} // 단계가 바뀌면 들어오는 움직임을 다시
          className="desk-sheet sheet-enter"
          aria-label={shown === 'plan' ? '1년 정착 플랜' : '매달 남는 돈'}
        >
          {shown === 'result' ? (
            <>
              <ReportView report={report} />
              <ResultView result={freshResult} rows={rows} />
            </>
          ) : (
            <>
              {plan && (
                <PlanView
                  plan={plan}
                  result={freshResult}
                  supportFailed={!support}
                  onEditLiving={() => changeStep('living')}
                />
              )}
              {support && (
                <div className="plan-section">
                  <details className="result-details">
                    <summary>
                      근무지별 청년 지원 전체 보기 (
                      {support.regions
                        .map((r) => `${placeName(r.region)} ${r.matched}개`)
                        .concat(`전국 ${support.national_matched}개`)
                        .join(' · ')}
                      )
                    </summary>
                    <SupportView
                      support={support}
                      rows={rows}
                      stale={support.checked_on === staleFor}
                    />
                  </details>
                </div>
              )}
            </>
          )}
          <div className="sheet-actions flex-wrap">
            {/* 다음 단계 미리보기는 버튼 줄과 한 덩어리로 */}
            {shown === 'result' && hasPlan && plan && (
              <PlanPreview plan={plan} result={freshResult} />
            )}
            <div className="flex flex-wrap gap-2">
              {shown === 'plan' ? (
                <Button variant="outline" className="min-h-11" onClick={() => changeStep('result')}>
                  <ArrowLeft aria-hidden /> 남는 돈 다시 보기
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => changeStep('living')}
                  >
                    <Calculator aria-hidden /> 생활비 바꾸기
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => changeStep('review')}
                  >
                    <Pencil aria-hidden /> 조건 다시 고치기
                  </Button>
                </>
              )}
            </div>
            {/* 남는 돈 단계의 다음 행동은 하나: 정착 플랜 (새로 비교하기는 정착 플랜 단계에만) */}
            {shown === 'result' && hasPlan ? (
              <Button className="main-action" onClick={() => changeStep('plan')}>
                1년 정착 플랜 보기 <ArrowRight aria-hidden />
              </Button>
            ) : confirmingRestart ? (
              <div
                role="alertdialog"
                aria-labelledby="restart-question"
                className="restart-confirm"
              >
                <p id="restart-question">
                  지금 비교를 지우고 새 공고로 시작할까요? 생활비는 그대로 둬요.
                </p>
                <div className="flex gap-2">
                  {/* 지우는 일이라 기본 포커스는 '취소' */}
                  <Button
                    variant="outline"
                    className="min-h-11"
                    autoFocus
                    onClick={() => setConfirmingRestart(false)}
                  >
                    취소
                  </Button>
                  <Button className="min-h-11" onClick={startOver}>
                    새로 시작
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant={shown === 'plan' ? 'outline' : 'default'}
                className={shown === 'plan' ? 'min-h-11' : 'main-action'}
                onClick={requestStartOver}
              >
                새로 비교하기 <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
        </section>
      ) : shown === 'living' ? (
        <form
          className="desk-sheet sheet-enter"
          aria-label="내 생활비"
          aria-busy={busy === 'confirming'}
          onKeyDown={(event) => {
            // 되묻기: 질문 칸에서 Enter는 바로 계산 (답이 없으면 그대로 — 보내면 같은 질문이 다시 온다)
            const asked = asking && (event.target as HTMLElement).id === 'current-housing';
            const composing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
            if (!asked || event.key !== 'Enter' || composing) {
              enterMovesToNextField(event);
              return;
            }
            event.preventDefault();
            if (profile.currentHousing != null) event.currentTarget.requestSubmit();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            calculate();
          }}
        >
          {/* 계산을 막는 빈칸을 맨 위에 (오류처럼 보이지 않게 '할 일' 상자로). 되묻기 중에는 질문이 칸 위에 있으니 숨긴다 */}
          {!asking && (
            <div className="review-todo">
              {/* 빈칸이 다 채워지면 제목만 바뀐다 (화면 읽기 프로그램에 한 번 알림) */}
              <p role="status" className="review-todo-title">
                {missingProfile.length
                  ? // 막지는 않는다: 비어 있으면 그 값이 필요한 경우만 '계산 못 함'이 된다 (칸마다 무엇이 빠지는지)
                    '이 칸이 비면 남는 돈 일부가 안 나와요'
                  : '필요한 칸은 다 채웠어요. 계산하면 돼요'}
              </p>
              <ul>
                {missingProfile.map((item) => (
                  <li key={item.fieldId}>
                    <button
                      type="button"
                      className="question-link"
                      onClick={() =>
                        item.rowId ? goToField(item.rowId, item.fieldId) : focusField(item.fieldId)
                      }
                    >
                      {item.label}
                    </button>{' '}
                    <span className="todo-effect">{item.effect}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* 계산하는 동안은 입력을 잠근다 (계산이 끝나면 보낸 값으로 화면을 맞추므로, 그사이 고친 값이 사라진다) */}
          <fieldset disabled={busy !== null} className="min-w-0">
            <ProfileFormView
              form={profile}
              rows={rows}
              onChange={setProfile}
              activeId={activeId}
              onSelectPosting={selectPosting}
              missing={missingProfile}
              askAge={supportEnabled}
              rents={rents}
              failedRents={failedRents}
              onRetryRents={retryFailedRents}
              asking={asking?.questions}
            />
          </fieldset>
          {/* 계산 실패: 빨간 한 줄 대신 눈에 띄는 상자로. 할 일은 오류 문구에, 넣은 값은 그대로라는 것을 함께 */}
          <div role="alert">
            {error && (
              <div className="salary-notice error-notice">
                <p className="font-semibold">{error}</p>
                <p>넣은 값은 그대로 있어요.</p>
              </div>
            )}
          </div>
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
            {asking ? (
              // 되묻기 중: 메인 버튼 자리에 두 버튼. Enter(폼 제출)는 '답하고 계산 이어 가기'
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy !== null}
                  onClick={() => calculate({ skipMissing: true })}
                >
                  모르겠어요, 이대로 계산
                </Button>
                <Button type="submit" className="main-action" disabled={busy !== null}>
                  {busy === 'confirming' ? '계산하는 중…' : '답하고 계산 이어 가기'}{' '}
                  <Calculator aria-hidden />
                </Button>
              </div>
            ) : (
              <Button type="submit" className="main-action" disabled={busy !== null}>
                {busy === 'confirming' ? '계산하는 중…' : '매달 남는 돈 계산하기'}{' '}
                <Calculator aria-hidden />
              </Button>
            )}
          </div>
          {/* AI 리포트는 쓰고 검증하는 데 시간이 걸린다 (시연 모드는 리포트를 쓰지 않는다).
              화면 읽기 프로그램 알림은 카드 안에서 단계가 바뀔 때만 (agent-progress.tsx) */}
          {busy === 'confirming' && (
            <AgentProgress kind={demoMode ? 'calculating-demo' : 'calculating'} />
          )}
        </form>
      ) : reviewing ? (
        <section className="desk-sheet sheet-enter review-sheet" aria-label="공고 조건 확인">
          {/* 처음 온 사람이 가장 먼저 볼 것: 지금 할 일 (공고마다 한 줄, 누르면 그 칸·탭으로) */}
          <div ref={reviewTodo} tabIndex={-1} className="review-todo">
            <p className="review-todo-title">
              {cellsToCheck ? `다시 볼 값 ${cellsToCheck}개` : '고칠 값이 없어요. 넘어가면 돼요'}
            </p>
            <ul>
              {rows.map((row, i) => {
                const ids = toCheck.get(row.id) ?? [];
                const name = companyName(row, i);
                const single = rows.length === 1;
                if (ids.length)
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="question-link"
                        onClick={() => goToField(row.id, ids[0])}
                      >
                        {single ? '첫 칸으로 가기' : name}
                      </button>
                      {!single && `: ${ids.length}개`}
                    </li>
                  );
                if (salaryLeftBlank(row))
                  return (
                    <li key={row.id}>
                      {single ? (
                        '연봉 금액 없음'
                      ) : (
                        <button
                          type="button"
                          className="question-link"
                          onClick={() => selectPosting(row.id)}
                        >
                          {name}
                        </button>
                      )}
                      {single ? '. 비워 둬도 돼요' : ': 연봉 금액 없음. 비워 둬도 돼요'}
                    </li>
                  );
                return null;
              })}
              {cellsToCheck > 0 &&
                (() => {
                  const rest = rows.filter(
                    (row) => !toCheck.get(row.id)?.length && !salaryLeftBlank(row),
                  ).length;
                  return rest > 0 && <li>나머지 {rest}곳은 고칠 값이 없어요</li>;
                })()}
            </ul>
          </div>
          {hasMaskedQuote(rows) && (
            <p className="mb-5 text-sm text-muted-foreground">
              [이메일]·[번지] 같은 표시는 개인정보를 가린 자리예요. 비교에는 쓰지 않아요.
            </p>
          )}
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
                <p>{names(ocrInputs)}: 스캔한 PDF라서 파일 안에 들어 있던 글자를 그대로 썼어요.</p>
              )}
              {ignoredImages.length > 0 && (
                <p>
                  {names(ignoredImages)}: 글 사이에 들어 있는 그림(표 캡처 등)은 읽지 않았어요. 그림
                  속 조건은 직접 넣어 주세요.
                </p>
              )}
            </div>
          )}
          <PostingTabs
            rows={rows}
            activeId={activeId}
            onSelect={selectPosting}
            label="확인할 공고"
            status={(row) => ({
              remaining: toCheck.get(row.id)?.length ?? 0,
              seen: seenPostings.includes(row.id),
            })}
          >
            {rows.map(
              (row, i) =>
                row.id === activeId && (
                  <RowEditor
                    key={row.id}
                    index={i}
                    row={row}
                    original={originalRows[i]}
                    onChange={(next) => {
                      setCheckWarned(false);
                      setRows(rows.map((item, j) => (j === i ? next : item)));
                    }}
                  />
                ),
            )}
          </PostingTabs>
          <BadgeLegend
            className="mt-6"
            badges={[
              statusBadge.confirmed,
              // 이 화면의 추정 = AI가 읽은 값이 공고와 맞는지 다시 볼 값
              { ...statusBadge.estimated, meaning: '공고와 맞는지 다시 볼 값' },
              statusBadge.user_input,
              statusBadge.missing,
              ...(hasImageCells ? [IMAGE_READ_BADGE] : []),
            ]}
          />
          <p role="alert" className="form-hint">
            {error}
          </p>
          <div className="sheet-actions">
            <Button variant="ghost" className="min-h-11" onClick={() => changeStep('input')}>
              <ArrowLeft aria-hidden /> 공고 넣기로
            </Button>
            <Button className="main-action" disabled={busy !== null} onClick={goToLiving}>
              {checkWarned && cellsToCheck
                ? '그대로 다음으로'
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
                    aria-describedby={
                      isLinkOnly(text) ? `source-error posting-link-${i}` : 'source-error'
                    }
                    value={text}
                    onChange={(event) => {
                      setError('');
                      setTexts(texts.map((item, j) => (j === i ? event.target.value : item)));
                    }}
                    rows={5}
                    placeholder="회사명, 근무지, 급여가 적힌 부분을 복사해 넣으세요. 링크는 열어 볼 수 없어요."
                    className="max-h-64 min-h-36 resize-y rounded-md border border-input p-3 text-base leading-relaxed focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
                  />
                  {isLinkOnly(text) && (
                    <LinkHint
                      id={`posting-link-${i}`}
                      onUseFiles={() => {
                        setError('');
                        setSourceTab('files');
                        requestAnimationFrame(() =>
                          document.getElementById(FILE_INPUT_ID)?.focus(),
                        );
                      }}
                    />
                  )}
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
              <p className="text-sm leading-relaxed text-muted-foreground">
                파일은 서버에 저장하지 않아요. 글자를 복사할 수 없는 이미지만 글자를 읽으려고
                AI(Claude)에 보내요.
              </p>
            </TabsContent>
          </Tabs>
          {busy === 'reading' && (
            <AgentProgress kind={mayUseVision ? 'reading-files' : 'reading'} />
          )}
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
