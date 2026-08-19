'use client';

import { useRef } from 'react';

import { Alert } from '@/components/ui/alert';
import {
  buildMapImageUrl,
  isAllowedMapImageType,
  MAP_IMAGE_ACCEPT,
  MAP_IMAGE_MAX_BYTES,
  mapImageSizeMessage,
  mapImageTypeMessage,
} from '@/lib/map-image';

/** 선택했지만 아직 저장하지 않은 도면 */
export type PendingMapImage = {
  file: File;
  /** 로컬 미리보기용 data URL. 파일을 고를 때(이벤트 핸들러) 만들어 둔다. */
  previewUrl: string;
};

type Props = {
  area: {
    areaId: number;
    areaName: string;
    mapImageName: string | null;
    mapImageUpdatedAt: string | Date | null;
  };
  /** 아직 저장하지 않은 선택 파일 */
  pending: PendingMapImage | null;
  /** 저장 시 도면을 지울지 여부 */
  markedForRemoval: boolean;
  onSelect: (pending: PendingMapImage | null) => void;
  onToggleRemoval: () => void;
  onError: (message: string) => void;
  error?: string | null;
  disabled?: boolean;
};

/**
 * 도면 파일 선택 + 미리보기.
 *
 * 파일을 고르면 화면에서 미리보기만 갱신하고, 실제 업로드는 상단 [저장]에서 한다.
 * 다른 항목과 동일하게 "고치고 → 확인하고 → 저장" 흐름을 맞추기 위함이다.
 */
export function MapImageUploader({
  area,
  pending,
  markedForRemoval,
  onSelect,
  onToggleRemoval,
  onError,
  error,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const savedUrl = area.mapImageName
    ? buildMapImageUrl(
        area.areaId,
        area.mapImageUpdatedAt ? new Date(area.mapImageUpdatedAt) : null,
      )
    : null;

  // 선택한 파일이 있으면 그것을, 없고 삭제 예정도 아니면 저장된 도면을 보여준다.
  const previewUrl = pending ? pending.previewUrl : markedForRemoval ? null : savedUrl;

  function clearInput() {
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleFile(file: File) {
    if (file.size > MAP_IMAGE_MAX_BYTES) {
      onError(mapImageSizeMessage());
      clearInput();
      return;
    }
    if (!isAllowedMapImageType(file.type)) {
      onError(mapImageTypeMessage());
      clearInput();
      return;
    }

    // 렌더 중 부수효과를 만들지 않도록 이벤트 핸들러에서 미리보기 URL 을 만든다.
    const reader = new FileReader();
    reader.onload = () => {
      onError('');
      onSelect({ file, previewUrl: String(reader.result) });
    };
    reader.onerror = () => onError('파일을 읽지 못했습니다. 다른 파일로 시도해 주세요.');
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <p className="label">도면 이미지</p>

      {previewUrl ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {/* 저장된 도면은 DB 에서, 선택한 파일은 data URL 로 미리 본다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`${area.areaName} 도면 미리보기`}
            className="max-h-56 w-full object-contain"
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
          {markedForRemoval ? '저장하면 도면이 삭제됩니다.' : '등록된 도면이 없습니다.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={MAP_IMAGE_ACCEPT}
          disabled={disabled || markedForRemoval}
          className="text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700"
          aria-label={`${area.areaName} 도면 파일 선택`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {pending && (
          <button
            type="button"
            className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
            disabled={disabled}
            onClick={() => {
              onSelect(null);
              onError('');
              clearInput();
            }}
          >
            선택 취소
          </button>
        )}

        {area.mapImageName && !pending && (
          <button
            type="button"
            className={`btn min-h-9 px-3 py-1.5 text-xs ${
              markedForRemoval ? 'btn-secondary' : 'btn-danger-outline'
            }`}
            disabled={disabled}
            onClick={onToggleRemoval}
          >
            {markedForRemoval ? '삭제 취소' : '도면 삭제'}
          </button>
        )}
      </div>

      <p className="field-hint">
        {pending
          ? `선택한 파일: ${pending.file.name} — 상단 [저장]을 눌러야 반영됩니다.`
          : markedForRemoval
            ? '상단 [저장]을 눌러야 삭제가 반영됩니다.'
            : area.mapImageName
              ? `현재 파일: ${area.mapImageName}`
              : 'PNG, JPEG, WebP, GIF, SVG / 2MB 이하.'}
      </p>

      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
