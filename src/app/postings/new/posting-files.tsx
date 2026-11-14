import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { FileImage, FileSpreadsheet, FileText, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, MB } from './limits';

// 받는 형식. 서버(backend/inputs/detect.py)도 파일 내용으로 다시 확인한다.
// GIF·HEIC·HWP는 서버가 읽지 못해서 받지 않는다.
const formats: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};
const accept = Object.keys(formats)
  .map((ext) => `.${ext}`)
  .join(',');

export const FILE_INPUT_ID = 'posting-file-input';

type Attachment = { file: File; url: string; mime: string };

function formatBytes(bytes: number) {
  return bytes < MB
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${Number((bytes / MB).toFixed(1))} MB`; // 10.0 MB → 10 MB
}

/** 같은 파일인지 알아보는 표시 (이름·크기·수정 시각). 새로고침 뒤 '같은 입력'을 알아볼 때 쓴다. */
export function fileSignature(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export function usePostingFiles() {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  // 화면 읽기 프로그램에 알려 줄 짧은 소식 ('파일 2개를 넣었어요' 등)
  const [notice, setNotice] = useState('');
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const active = urls.current;
    // 끌어다 놓기 칸 밖에 파일을 떨어뜨리면 브라우저가 그 파일을 열어 이 페이지를 떠난다. 그걸 막는다.
    // (글자를 끌어다 놓는 것은 막지 않는다)
    const guard = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
      active.forEach((url) => URL.revokeObjectURL(url));
      active.clear();
    };
  }, []);

  function add(incoming: FileList | File[]) {
    const additions: Attachment[] = [];
    const problems: string[] = [];
    let wrongFormat = false;
    let total = totalBytes(files);
    for (const file of Array.from(incoming)) {
      const extension = file.name.match(/\.([^.]+)$/)?.[1].toLowerCase() ?? '';
      const duplicate = [...files, ...additions].some(
        ({ file: previous }) => fileSignature(previous) === fileSignature(file),
      );
      if (duplicate) {
        // 같은 공고가 비교표에 두 번 들어가지 않게 받지 않는다 (서버도 내용이 같은 파일을 거절한다)
        problems.push(`${file.name}: 이미 넣은 파일이에요.`);
        continue;
      }
      if (!Object.hasOwn(formats, extension)) {
        problems.push(
          ['gif', 'heic', 'heif'].includes(extension)
            ? `${file.name}: 이 이미지 형식은 읽을 수 없어요. PNG나 JPG로 저장해서 넣어 주세요.`
            : extension === 'hwp'
              ? `${file.name}: 한글 파일은 PDF로 저장해서 넣어 주세요.`
              : `${file.name}: 넣을 수 없는 형식이에요.`,
        );
        wrongFormat = true;
        continue;
      }
      if (file.size === 0) {
        problems.push(`${file.name}: 빈 파일이에요.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        problems.push(
          `${file.name}: ${formatBytes(file.size)}예요. 파일 하나는 ${formatBytes(MAX_FILE_BYTES)}까지 넣을 수 있어요.`,
        );
        continue;
      }
      if (files.length + additions.length >= MAX_FILES) {
        problems.push(`${file.name}: 파일은 한 번에 ${MAX_FILES}개까지 넣을 수 있어요.`);
        continue;
      }
      if (total + file.size > MAX_TOTAL_BYTES) {
        problems.push(
          `${file.name}: 파일 크기 합계는 ${formatBytes(MAX_TOTAL_BYTES)}까지예요. 나눠서 넣어 주세요.`,
        );
        continue;
      }
      total += file.size;
      const mime = formats[extension];
      const url = URL.createObjectURL(file.slice(0, file.size, mime));
      urls.current.add(url);
      additions.push({ file, url, mime });
    }
    if (additions.length) setFiles((previous) => [...previous, ...additions]);
    setNotice(additions.length ? `파일 ${additions.length}개를 넣었어요.` : '');
    if (wrongFormat) {
      problems.push('이미지(JPG·PNG·WEBP), PDF, 엑셀(XLSX·XLS)·CSV 파일을 넣을 수 있어요.');
    }
    setError(problems.join('\n'));
  }

  function remove(url: string) {
    const removed = files.find((item) => item.url === url);
    setFiles((previous) => previous.filter((item) => item.url !== url));
    URL.revokeObjectURL(url);
    urls.current.delete(url);
    setError('');
    setNotice(removed ? `${removed.file.name} 파일을 뺐어요.` : '');
  }

  function clear() {
    files.forEach(({ url }) => {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    });
    setFiles([]);
    setError('');
    setNotice('');
  }

  return { files, error, notice, add, remove, clear };
}

function totalBytes(files: Attachment[]) {
  return files.reduce((sum, { file }) => sum + file.size, 0);
}

export function FilePicker({
  add,
  error,
  notice,
  compact = false,
}: Pick<ReturnType<typeof usePostingFiles>, 'add' | 'error' | 'notice'> & {
  /** 파일이 이미 있을 때 한 줄짜리 '추가' 상자로 줄인다. */
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div>
      <label
        className={compact ? 'file-drop is-compact' : 'file-drop'}
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(event.dataTransfer.files);
        }}
      >
        <input
          id={FILE_INPUT_ID}
          type="file"
          multiple
          accept={accept}
          aria-label="공고 파일 선택"
          aria-describedby="accepted-formats file-error source-error"
          aria-invalid={error ? true : undefined}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(event) => {
            if (event.target.files) add(event.target.files);
            event.target.value = '';
          }}
        />
        <span className="file-stack" aria-hidden="true">
          <FileText />
          <FileImage />
          <FileSpreadsheet />
        </span>
        <span className="file-choice">
          <Upload size={15} aria-hidden /> {compact ? '파일 추가' : '파일 선택'}
        </span>
        {!compact && (
          <span className="hidden text-sm text-body sm:block">
            또는 여기에 공고 파일을 끌어다 놓으세요.
          </span>
        )}
        <span id="accepted-formats" className="text-xs leading-relaxed text-muted-foreground">
          <span className="whitespace-nowrap">JPG, PNG, WEBP</span> ·{' '}
          <span className="whitespace-nowrap">PDF</span> ·{' '}
          <span className="whitespace-nowrap">엑셀(XLSX, XLS, CSV)</span> ·{' '}
          <span className="whitespace-nowrap">
            {MAX_FILES}개, 하나에 {formatBytes(MAX_FILE_BYTES)}까지
          </span>
        </span>
      </label>
      <p role="status" className="sr-only">
        {notice}
      </p>
      <p
        id="file-error"
        role="alert"
        className="mt-2 text-sm whitespace-pre-line wrap-anywhere text-destructive empty:hidden"
      >
        {error}
      </p>
    </div>
  );
}

export function AttachmentList({
  files,
  remove,
  showTotal = false,
}: {
  files: Attachment[];
  remove?: (url: string) => void;
  /** 파일 수·크기 합계 줄을 보여 준다 (첨부 화면에서만) */
  showTotal?: boolean;
}) {
  if (!files.length) return null;
  // 누른 삭제 버튼이 사라지면 키보드 위치를 잃는다 → 다음 파일의 삭제 버튼(없으면 파일 선택)으로 옮긴다.
  const removeAndFocus = (index: number) => {
    remove?.(files[index].url);
    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('[data-attachment-remove]');
      const next = buttons[Math.min(index, buttons.length - 1)];
      (next ?? document.getElementById(FILE_INPUT_ID))?.focus();
    });
  };
  return (
    <div>
      <ul aria-label="첨부한 공고 파일" className="divide-y rounded-md border px-3">
        {files.map((attachment, index) => (
          <AttachmentItem
            key={attachment.url}
            attachment={attachment}
            remove={remove ? () => removeAndFocus(index) : undefined}
          />
        ))}
      </ul>
      {showTotal && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {files.length}/{MAX_FILES}개 · 합계 {formatBytes(totalBytes(files))} /{' '}
          {formatBytes(MAX_TOTAL_BYTES)}
        </p>
      )}
    </div>
  );
}

// 파일 하나 = 한 줄. 미리보기는 같은 줄의 버튼으로 열고, 열었을 때만 아래로 늘어난다.
function AttachmentItem({
  attachment: { file, url, mime },
  remove,
}: {
  attachment: Attachment;
  remove?: () => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const isImage = mime.startsWith('image/');
  // CSV도 표 파일로 다룬다: 인코딩(EUC-KR 등)이 제각각이라 화면 미리보기 대신 원본 저장만 둔다
  const isSheet = mime === formats.xls || mime === formats.xlsx || mime === formats.csv;
  const previewId = `preview-${url.slice(-12)}`;
  return (
    <li className="min-w-0 py-1.5">
      <div className="flex min-h-11 flex-wrap items-center gap-x-3">
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary text-muted-foreground">
          {isImage ? (
            <Image
              unoptimized
              width={36}
              height={36}
              src={url}
              alt=""
              className="size-full object-cover"
            />
          ) : isSheet ? (
            <FileSpreadsheet size={18} aria-hidden />
          ) : (
            <FileText size={18} aria-hidden />
          )}
        </div>
        <p className="min-w-0 flex-1 basis-40 text-sm">
          <span className="font-semibold wrap-anywhere">{file.name}</span>
          <span className="ms-2 text-xs whitespace-nowrap text-muted-foreground">
            {formatBytes(file.size)}
          </span>
        </p>
        {remove ? (
          <Button
            type="button"
            variant="ghost"
            className="size-11"
            data-attachment-remove
            aria-label={file.name + ' 빼기'}
            onClick={remove}
          >
            <X aria-hidden />
          </Button>
        ) : (
          <div className="ms-auto flex shrink-0 items-center gap-1">
            {!isSheet && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 px-2.5 text-sm"
                aria-expanded={previewing}
                aria-controls={previewing ? previewId : undefined}
                onClick={() => setPreviewing((open) => !open)}
              >
                {previewing ? '미리보기 닫기' : '미리보기'}
              </Button>
            )}
            <a
              className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-link underline"
              href={url}
              target={isSheet ? undefined : '_blank'}
              rel="noopener noreferrer"
              download={isSheet ? file.name : undefined}
              aria-label={(isSheet ? '원본 저장: ' : '원본 열기 (새 탭): ') + file.name}
            >
              {isSheet ? '원본 저장' : '원본 열기'}
            </a>
          </div>
        )}
      </div>
      {previewing && (
        <div id={previewId} className="pt-2 pb-1">
          {isImage ? (
            <Image
              unoptimized
              src={url}
              width={720}
              height={480}
              alt={file.name}
              className="h-auto max-h-96 w-full object-contain"
            />
          ) : (
            <object
              data={url}
              type="application/pdf"
              aria-label={file.name}
              className="h-80 w-full"
            >
              <p>‘원본 열기’에서 PDF를 확인하세요.</p>
            </object>
          )}
        </div>
      )}
    </li>
  );
}
