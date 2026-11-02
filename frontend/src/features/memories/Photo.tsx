import { useEffect, useState } from 'react';
import type { Photo } from '../../domain/types';
import { Button, Dialog } from '../../components/ui';
export function BlobImage({
  blob: provided,
  photo,
  alt,
  full = false,
  sizes,
}: {
  blob?: Blob;
  photo?: Photo;
  alt: string;
  full?: boolean;
  /** Displayed slot width (CSS `sizes`); enables picking the original when the thumbnail is too small. */
  sizes?: string;
}) {
  // Local photos have no dimensions; use the original blob when a slot size is requested.
  const wantFull = full || (!!sizes && !photo?.src);
  const blob = photo ? (wantFull ? photo.blob : (photo.thumbnail ?? photo.blob)) : provided;
  const remoteSrc = photo ? (full ? photo.src : (photo.thumbnailSrc ?? photo.src)) : undefined;
  const srcSet =
    sizes && photo?.src && photo.thumbnailSrc && photo.width && photo.height
      ? `${photo.thumbnailSrc} ${thumbnailWidth(photo.width, photo.height)}w, ${photo.src} ${photo.width}w`
      : undefined;
  const [url, setUrl] = useState(''),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!blob || remoteSrc) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    setFailed(false);
    return () => URL.revokeObjectURL(next);
  }, [blob, remoteSrc]);
  if (!remoteSrc && (!blob || !blob.size))
    return (
      <div className="photo-placeholder" role="img" aria-label={alt}>
        Chưa có ảnh
      </div>
    );
  if (failed)
    return (
      <div className="photo-placeholder" role="img" aria-label={`${alt} — không tải được ảnh`}>
        Không tải được ảnh
      </div>
    );
  return remoteSrc || url ? (
    <img
      key={url}
      className={full ? 'photo-full' : 'photo-thumb'}
      src={remoteSrc ?? url}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={photo?.width ?? 640}
      height={photo?.height ?? 480}
      loading={full ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="photo-placeholder" aria-label="Đang tải ảnh" />
  );
}
// Server thumbnails fit inside 640×640 (Pillow `thumbnail`), keeping the aspect ratio.
export const thumbnailWidth = (width: number, height: number) =>
  Math.round(width * Math.min(1, 640 / Math.max(width, height)));

/**
 * CSS `sizes` for a photo cover-cropped into a frame: a photo wider than the frame
 * renders wider than its slot, so it needs proportionally more pixels.
 */
export function coverSizes(photo: Photo, frameAspect: number, slots: [string, string][]) {
  const scale =
    photo.width && photo.height ? Math.max(1, photo.width / photo.height / frameAspect) : 1;
  return slots
    .map(([media, width]) => `${media} calc(${width} * ${scale.toFixed(3)})`.trim())
    .join(', ');
}
export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: Photo[];
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const current = index ?? 0;
  return (
    <Dialog
      title="Xem ảnh"
      description={`Ảnh ${current + 1} / ${photos.length}`}
      open={index !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onIndex((current + 1) % photos.length);
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onIndex((current - 1 + photos.length) % photos.length);
        }
      }}
    >
      <BlobImage photo={photos[current]} alt={`Ảnh ${current + 1}`} full />
      <div className="actions">
        <Button
          variant="secondary"
          onClick={() => onIndex((current - 1 + photos.length) % photos.length)}
          disabled={photos.length < 2}
        >
          Ảnh trước
        </Button>
        <Button onClick={() => onIndex((current + 1) % photos.length)} disabled={photos.length < 2}>
          Ảnh tiếp
        </Button>
      </div>
    </Dialog>
  );
}
