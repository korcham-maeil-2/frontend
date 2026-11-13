import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { FileImage, FileSpreadsheet, FileText, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const formats: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};
const accept = Object.keys(formats)
  .map((ext) => `.${ext}`)
  .join(',');

type Attachment = { file: File; url: string; mime: string };

export function usePostingFiles() {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const active = urls.current;
    return () => {
      active.forEach((url) => URL.revokeObjectURL(url));
      active.clear();
    };
  }, []);

  function add(incoming: FileList) {
    const additions: Attachment[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(incoming)) {
      const extension = file.name.match(/\.([^.]+)$/)?.[1].toLowerCase() ?? '';
      if (!Object.hasOwn(formats, extension)) {
        rejected.push(file.name);
        continue;
      }
      const duplicate = [...files, ...additions].some(
        ({ file: previous }) =>
          previous.name === file.name &&
          previous.size === file.size &&
          previous.lastModified === file.lastModified,
      );
      if (duplicate) continue;
      const mime = formats[extension];
      const url = URL.createObjectURL(file.slice(0, file.size, mime));
      urls.current.add(url);
      additions.push({ file, url, mime });
    }
    if (additions.length) setFiles((previous) => [...previous, ...additions]);
    setError(
      rejected.length
        ? `${rejected.join(', ')}: 넣을 수 없는 형식이에요. 이미지(JPG·PNG·WEBP·GIF), PDF, 엑셀·CSV 파일로 다시 넣어 주세요.`
        : '',
    );
  }

  function remove(url: string) {
    setFiles((previous) => previous.filter((item) => item.url !== url));
    URL.revokeObjectURL(url);
    urls.current.delete(url);
    setError('');
  }

  return { files, error, add, remove };
}

export function FilePicker({
  add,
  error,
  compact = false,
}: Pick<ReturnType<typeof usePostingFiles>, 'add' | 'error'> & {
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
          type='file'
          multiple
          accept={accept}
          aria-label='공고 파일 선택'
          aria-describedby='accepted-formats'
          className='absolute inset-0 size-full cursor-pointer opacity-0'
          onChange={(event) => {
            if (event.target.files) add(event.target.files);
            event.target.value = '';
          }}
        />
        <span className='file-stack' aria-hidden='true'>
          <FileText />
          <FileImage />
          <FileSpreadsheet />
        </span>
        <span className='file-choice'>
          <Upload size={15} aria-hidden /> {compact ? '파일 추가' : '파일 선택'}
        </span>
        {!compact && (
          <span className='hidden text-sm text-body sm:block'>
            또는 여기에 공고 파일을 끌어다 놓으세요.
          </span>
        )}
        <span id='accepted-formats' className='text-xs leading-relaxed text-muted-foreground'>
          <span className='whitespace-nowrap'>JPG, PNG, WEBP, GIF</span> ·{' '}
          <span className='whitespace-nowrap'>PDF</span> ·{' '}
          <span className='whitespace-nowrap'>엑셀(XLS, XLSX, CSV)</span>
        </span>
      </label>
      {error && (
        <p role='alert' className='mt-2 text-sm wrap-anywhere text-destructive'>
          {error}
        </p>
      )}
    </div>
  );
}

export function AttachmentList({
  files,
  remove,
}: {
  files: Attachment[];
  remove?: (url: string) => void;
}) {
  if (!files.length) return null;
  return (
    <ul aria-label='첨부한 공고 파일' className='divide-y rounded-md border px-3'>
      {files.map((attachment) => (
        <AttachmentItem key={attachment.url} attachment={attachment} remove={remove} />
      ))}
    </ul>
  );
}

// 파일 하나 = 한 줄. 미리보기는 같은 줄의 버튼으로 열고, 열었을 때만 아래로 늘어난다.
function AttachmentItem({
  attachment: { file, url, mime },
  remove,
}: {
  attachment: Attachment;
  remove?: (url: string) => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const isImage = mime.startsWith('image/');
  // CSV도 표 파일로 다룬다: 인코딩(EUC-KR 등)이 제각각이라 화면 미리보기 대신 원본 저장만 둔다
  const isSheet = mime === formats.xls || mime === formats.xlsx || mime === formats.csv;
  const previewId = `preview-${url.slice(-12)}`;
  return (
    <li className='min-w-0 py-1.5'>
      <div className='flex min-h-11 flex-wrap items-center gap-x-3'>
        <div className='flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary text-muted-foreground'>
          {isImage ? (
            <Image
              unoptimized
              width={36}
              height={36}
              src={url}
              alt=''
              className='size-full object-cover'
            />
          ) : isSheet ? (
            <FileSpreadsheet size={18} aria-hidden />
          ) : (
            <FileText size={18} aria-hidden />
          )}
        </div>
        <p className='min-w-0 flex-1 basis-40 text-sm'>
          <span className='font-semibold wrap-anywhere'>{file.name}</span>
          <span className='ms-2 text-xs whitespace-nowrap text-muted-foreground'>
            {file.size < 1024 * 1024
              ? `${Math.ceil(file.size / 1024)} KB`
              : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
          </span>
        </p>
        {remove ? (
          <Button
            type='button'
            variant='ghost'
            className='size-11'
            aria-label={file.name + ' 삭제'}
            onClick={() => remove(url)}
          >
            <X aria-hidden />
          </Button>
        ) : (
          <div className='ms-auto flex shrink-0 items-center gap-1'>
            {!isSheet && (
              <Button
                type='button'
                variant='ghost'
                className='min-h-11 px-2.5 text-sm'
                aria-expanded={previewing}
                aria-controls={previewing ? previewId : undefined}
                onClick={() => setPreviewing((open) => !open)}
              >
                {previewing ? '미리보기 닫기' : '미리보기'}
              </Button>
            )}
            <a
              className='inline-flex min-h-11 items-center px-1 text-sm font-semibold text-link underline'
              href={url}
              target={isSheet ? undefined : '_blank'}
              rel='noopener noreferrer'
              download={isSheet ? file.name : undefined}
              aria-label={(isSheet ? '원본 저장: ' : '원본 열기 (새 탭): ') + file.name}
            >
              {isSheet ? '원본 저장' : '원본 열기'}
            </a>
          </div>
        )}
      </div>
      {previewing && (
        <div id={previewId} className='pt-2 pb-1'>
          {isImage ? (
            <Image
              unoptimized
              src={url}
              width={720}
              height={480}
              alt={file.name}
              className='h-auto max-h-96 w-full object-contain'
            />
          ) : (
            <object
              data={url}
              type='application/pdf'
              aria-label={file.name}
              className='h-80 w-full'
            >
              <p>‘원본 열기’에서 PDF를 확인하세요.</p>
            </object>
          )}
        </div>
      )}
    </li>
  );
}
