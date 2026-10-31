import { useEffect, useState } from 'react';
import type { Photo } from '../../domain/types';
import { Button, Dialog } from '../../components/ui';
export function BlobImage({
  blob: provided,
  photo,
  alt,
  full = false,
}: {
  blob?: Blob;
  photo?: Photo;
  alt: string;
  full?: boolean;
}) {
  const blob = photo ? (full ? photo.blob : (photo.thumbnail ?? photo.blob)) : provided;
  const remoteSrc = photo ? (full ? photo.src : (photo.thumbnailSrc ?? photo.src)) : undefined;
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
      alt={alt}
      width="640"
      height="480"
      loading={full ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="photo-placeholder" aria-label="Đang tải ảnh" />
  );
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
