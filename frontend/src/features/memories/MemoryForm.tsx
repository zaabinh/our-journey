import { useEffect, useRef, useState } from 'react';
import type { Memory } from '../../domain/types';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { preparePhoto } from '../../data/codec';
import { Alert, Button, Dialog, Input, Textarea } from '../../components/ui';
import { BlobImage } from './Photo';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function MemoryForm({
  albumId,
  memory,
  open,
  onClose,
  trigger,
}: {
  albumId: string;
  memory?: Memory;
  open: boolean;
  onClose: () => void;
  trigger?: React.ReactNode;
}) {
  const { state, dispatch } = useJourney(),
    action = useAction();
  const [title, setTitle] = useState(memory?.title ?? ''),
    [date, setDate] = useState(memory?.date ?? today()),
    [location, setLocation] = useState(memory?.location ?? ''),
    [note, setNote] = useState(memory?.note ?? ''),
    [heart, setHeart] = useState(!!memory?.animations.heart),
    [gift, setGift] = useState(!!memory?.animations.gift);
  const previewCache = useRef(new WeakMap<Blob, Blob>());
  const storyRef = useRef<HTMLTextAreaElement>(null);
  const [initial, setInitial] = useState(
      () =>
        memory?.photoIds
          .map((id) => state!.photos.find((p) => p.id === id)!)
          .filter((p) => !p.src)
          .map((p) => p.blob) ?? [],
    ),
    [blobs, setBlobs] = useState<Blob[]>(initial),
    [preservedPhotoIds, setPreservedPhotoIds] = useState<string[]>(
      () =>
        memory?.photoIds.filter((id) => !!state!.photos.find((p) => p.id === id)?.src) ?? [],
    ),
    [initialPreservedPhotoIds, setInitialPreservedPhotoIds] = useState(preservedPhotoIds);
  useEffect(() => {
    if (open) {
      setTitle(memory?.title ?? '');
      setDate(memory?.date ?? today());
      setLocation(memory?.location ?? '');
      setNote(memory?.note ?? '');
      setHeart(!!memory?.animations.heart);
      setGift(!!memory?.animations.gift);
      const photos = memory?.photoIds.map((id) => state!.photos.find((p) => p.id === id)!) ?? [],
        current = photos.filter((p) => !p.src).map((p) => p.blob),
        remoteIds = photos.filter((p) => p.src).map((p) => p.id);
      for (const p of photos.filter((photo) => !photo.src)) {
        previewCache.current.set(p.blob, p.thumbnail ?? p.blob);
      }
      setInitial(current);
      setBlobs(current);
      setPreservedPhotoIds(remoteIds);
      setInitialPreservedPhotoIds(remoteIds);
    }
  }, [open]);
  function format(marker: string) {
    const field = storyRef.current;
    if (!field) return;
    const start = field.selectionStart,
      end = field.selectionEnd;
    setNote(note.slice(0, start) + marker + note.slice(start, end) + marker + note.slice(end));
    queueMicrotask(() => {
      field.focus();
      field.setSelectionRange(start + marker.length, end + marker.length);
    });
  }
  const dirty =
    title !== (memory?.title ?? '') ||
    date !== (memory?.date ?? today()) ||
    location !== (memory?.location ?? '') ||
    note !== (memory?.note ?? '') ||
    heart !== !!memory?.animations.heart ||
    gift !== !!memory?.animations.gift ||
    blobs.length !== initial.length ||
    blobs.some((b, i) => b !== initial[i]) ||
    preservedPhotoIds.length !== initialPreservedPhotoIds.length ||
    preservedPhotoIds.some((id, i) => id !== initialPreservedPhotoIds[i]);
  useUnsavedChanges(open && dirty);
  function move(index: number, step: number) {
    const next = [...blobs];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    setBlobs(next);
  }
  return (
    <Dialog
      title={memory ? 'Sửa kỷ niệm' : 'Kỷ niệm mới'}
      description="Thêm ảnh, ngày tháng, địa điểm và câu chuyện vào kỷ niệm."
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      trigger={trigger}
      dirty={dirty}
      pending={action.pending}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await dispatch({
              type: 'saveMemory',
              albumId,
              memoryId: memory?.id,
              draft: {
                title,
                date,
                dateLabel: date ? undefined : memory?.dateLabel,
                location,
                note,
                animations: { ...memory?.animations, heart, gift },
              },
              blobs,
              preservePhotoIds: preservedPhotoIds,
            });
            onClose();
          });
        }}
      >
        <div className="field">
          <label htmlFor="memory-upload">
            Ảnh JPEG/PNG/WebP (1–50 ảnh, 20 MB/ảnh, 100 MB tổng)
          </label>
          <input
            id="memory-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={action.pending}
            onChange={(e) => {
              const input = e.currentTarget,
                files = [...(input.files ?? [])];
              void action.run(async () => {
                if (
                  blobs.length + files.length > 50 ||
                  [...blobs, ...files].reduce((n, b) => n + b.size, 0) > 100 * 1024 * 1024
                )
                  throw Error('Vượt giới hạn 50 ảnh hoặc 100 MB.');
                const prepared = await Promise.all(files.map(preparePhoto));
                prepared.forEach((p, i) =>
                  previewCache.current.set(files[i], p.thumbnail ?? p.blob),
                );
                setBlobs((current) => [...current, ...files]);
                input.value = '';
              });
            }}
          />
        </div>
        <div className="upload-previews">
          {preservedPhotoIds.map((id, i) => {
            const photo = state!.photos.find((candidate) => candidate.id === id);
            if (!photo) return null;
            return (
              <div className="upload-preview" key={id}>
                <BlobImage photo={photo} alt={`Ảnh hiện có ${i + 1}`} />
                <div className="actions">
                  <Button
                    variant="secondary"
                    aria-label={`Xóa ảnh hiện có ${i + 1}`}
                    disabled={action.pending}
                    onClick={() => setPreservedPhotoIds((current) => current.filter((x) => x !== id))}
                  >
                    ×
                  </Button>
                </div>
              </div>
            );
          })}
          {blobs.map((blob, i) => (
            <div className="upload-preview" key={i}>
              <BlobImage
                blob={previewCache.current.get(blob) ?? blob}
                alt={`Ảnh đã chọn ${i + 1}`}
              />
              <div className="actions">
                <Button
                  variant="secondary"
                  aria-label={`Ảnh ${i + 1} lên trước`}
                  disabled={i === 0 || action.pending}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`Ảnh ${i + 1} xuống sau`}
                  disabled={i === blobs.length - 1 || action.pending}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`Xóa ảnh ${i + 1}`}
                  disabled={action.pending}
                  onClick={() => setBlobs((current) => current.filter((_, n) => n !== i))}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Input
          disabled={action.pending}
          label="Tiêu đề"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={160}
        />
        <Input
          disabled={action.pending}
          label="Ngày kỷ niệm"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required={!memory?.dateLabel}
        />
        {memory?.dateLabel !== undefined && (
          <p>
            Ngày gốc được giữ nguyên: {memory.dateLabel.trim() || 'chưa ghi rõ'}. Chọn ngày chuẩn ở
            trên nếu muốn chuẩn hóa.
          </p>
        )}
        <Input
          disabled={action.pending}
          label="Địa điểm"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={300}
        />
        <div className="actions" aria-label="Định dạng câu chuyện">
          <Button variant="secondary" onClick={() => format('**')} disabled={action.pending}>
            Đậm
          </Button>
          <Button variant="secondary" onClick={() => format('_')} disabled={action.pending}>
            Nghiêng
          </Button>
          <Button variant="secondary" onClick={() => format('__')} disabled={action.pending}>
            Gạch chân
          </Button>
        </div>
        <Textarea
          inputRef={storyRef}
          disabled={action.pending}
          label="Câu chuyện"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          maxLength={20000}
        />
        <fieldset>
          <legend>Hiệu ứng</legend>
          <label className="check">
            <input
              type="checkbox"
              disabled={action.pending}
              checked={heart}
              onChange={(e) => setHeart(e.target.checked)}
            />
            Trái tim
          </label>
          <label className="check">
            <input
              type="checkbox"
              disabled={action.pending}
              checked={gift}
              onChange={(e) => setGift(e.target.checked)}
            />
            Quà tặng
          </label>
        </fieldset>
        {action.error && <Alert>{action.error}</Alert>}
        <Button type="submit" disabled={action.pending}>
          {action.pending ? 'Đang lưu…' : 'Lưu kỷ niệm'}
        </Button>
      </form>
    </Dialog>
  );
}
