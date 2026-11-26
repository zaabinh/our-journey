import { useEffect, useRef, useState } from 'react';
import type { Memory } from '../../domain/types';
import { errorMessage, useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { preparePhoto } from '../../data/codec';
import { Alert, Button, Dialog, Input, Textarea } from '../../components/ui';
import { BlobImage } from './Photo';
type PhotoItem =
  | { kind: 'saved'; id: string; key: string }
  | { kind: 'new'; blob: Blob; key: string };
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
  const { state, dispatch, repo } = useJourney(),
    action = useAction();
  const [title, setTitle] = useState(memory?.title ?? ''),
    [date, setDate] = useState(memory ? memory.date : today()),
    [location, setLocation] = useState(memory?.location ?? ''),
    [note, setNote] = useState(memory?.note ?? ''),
    [heart, setHeart] = useState(!!memory?.animations.heart),
    [gift, setGift] = useState(!!memory?.animations.gift);
  const previewCache = useRef(new WeakMap<Blob, Blob>());
  const storyRef = useRef<HTMLTextAreaElement>(null);
  const initialPhotoItems = () =>
    (memory?.photoIds ?? []).flatMap((id): PhotoItem[] => {
      const photo = state?.photos.find((p) => p.id === id);
      if (!photo) return [];
      return [
        photo.src ? { kind: 'saved', id, key: id } : { kind: 'new', blob: photo.blob, key: id },
      ];
    });
  const [initialItems, setInitialItems] = useState<PhotoItem[]>(initialPhotoItems),
    [items, setItems] = useState<PhotoItem[]>(initialItems),
    [dropActive, setDropActive] = useState(false),
    [uploadError, setUploadError] = useState(''),
    [dragKey, setDragKey] = useState(''),
    [overKey, setOverKey] = useState('');
  useEffect(() => {
    if (open) {
      setUploadError('');
      setDropActive(false);
      setTitle(memory?.title ?? '');
      setDate(memory ? memory.date : today());
      setLocation(memory?.location ?? '');
      setNote(memory?.note ?? '');
      setHeart(!!memory?.animations.heart);
      setGift(!!memory?.animations.gift);
      const next = initialPhotoItems();
      for (const item of next) {
        if (item.kind !== 'new') continue;
        const photo = state?.photos.find((p) => p.id === item.key);
        previewCache.current.set(item.blob, photo?.thumbnail ?? item.blob);
      }
      setInitialItems(next);
      setItems(next);
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
    date !== (memory ? memory.date : today()) ||
    location !== (memory?.location ?? '') ||
    note !== (memory?.note ?? '') ||
    heart !== !!memory?.animations.heart ||
    gift !== !!memory?.animations.gift ||
    items.length !== initialItems.length ||
    items.some((item, i) => item.key !== initialItems[i].key);
  useUnsavedChanges(open && dirty);
  function move(index: number, step: number) {
    setItems((current) => {
      const next = [...current];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  }
  async function addFiles(files: File[]) {
    if (!files.length) return;
    setUploadError('');
    await action.run(async () => {
      try {
        if (items.length + files.length > 10 || files.some((file) => file.size > 15 * 1024 * 1024))
          throw Error('Tối đa 10 ảnh và 15 MB mỗi ảnh.');
        const prepared = await Promise.all(files.map(preparePhoto));
        prepared.forEach((p, i) => previewCache.current.set(files[i], p.thumbnail ?? p.blob));
        setItems((current) => [
          ...current,
          ...files.map((blob): PhotoItem => ({ kind: 'new', blob, key: crypto.randomUUID() })),
        ]);
      } catch (e) {
        setUploadError(errorMessage(e));
        throw e;
      }
    });
  }
  function dropPhoto(source: string, target: string) {
    if (!source || source === target) return;
    setItems((current) => {
      const next = [...current],
        from = next.findIndex((item) => item.key === source),
        to = next.findIndex((item) => item.key === target);
      if (from < 0 || to < 0) return current;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
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
          setUploadError('');
          void action.run(async () => {
            const newItems = items.filter(
              (item): item is Extract<PhotoItem, { kind: 'new' }> => item.kind === 'new',
            );
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
              blobs: newItems.map((item) => item.blob),
              preservePhotoIds: items
                .filter(
                  (item): item is Extract<PhotoItem, { kind: 'saved' }> => item.kind === 'saved',
                )
                .map((item) => item.id),
              photoOrder: items.map((item) =>
                item.kind === 'saved'
                  ? { kind: 'saved' as const, id: item.id }
                  : {
                      kind: 'new' as const,
                      index: newItems.findIndex((entry) => entry.key === item.key),
                    },
              ),
            });
            onClose();
          });
        }}
      >
        <div
          className={`field memory-drop-zone${dropActive ? ' is-active' : ''}`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault();
              setDropActive(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDropActive(false);
            void addFiles([...event.dataTransfer.files]);
          }}
        >
          <label htmlFor="memory-upload">Ảnh JPEG/PNG/WebP (tối đa 10 ảnh, 15 MB/ảnh)</label>
          <p>Kéo ảnh vào đây hoặc chọn từ thiết bị</p>
          <input
            id="memory-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={action.pending}
            onChange={(e) => {
              const input = e.currentTarget,
                files = [...(input.files ?? [])];
              void addFiles(files);
              input.value = '';
            }}
          />
          {uploadError && <span role="alert">{uploadError}</span>}
        </div>
        <div className="upload-previews">
          {items.map((item, i) => (
            <div
              className={`upload-preview${overKey === item.key ? ' is-drop-target' : ''}`}
              key={item.key}
              onDragOver={(event) => {
                if (dragKey || event.dataTransfer.types.includes('Files')) {
                  event.preventDefault();
                  setOverKey(item.key);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (event.dataTransfer.files.length) void addFiles([...event.dataTransfer.files]);
                else dropPhoto(event.dataTransfer.getData('text/plain') || dragKey, item.key);
                setDragKey('');
                setOverKey('');
              }}
              onDragLeave={() => setOverKey('')}
            >
              {item.kind === 'saved' ? (
                <BlobImage
                  photo={state?.photos.find((photo) => photo.id === item.id)}
                  alt={`Ảnh ${i + 1}`}
                />
              ) : (
                <BlobImage
                  blob={previewCache.current.get(item.blob) ?? item.blob}
                  alt={`Ảnh ${i + 1}`}
                />
              )}
              <div className="actions">
                <button
                  type="button"
                  className="photo-drag-handle"
                  draggable={!action.pending}
                  disabled={action.pending || items.length < 2}
                  aria-label={`Chuyển ảnh ${i + 1} sang vị trí kế tiếp`}
                  aria-keyshortcuts="ArrowLeft ArrowRight"
                  onClick={() => move(i, i === items.length - 1 ? -1 : 1)}
                  onDragStart={(event) => {
                    setDragKey(item.key);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.key);
                  }}
                  onDragEnd={() => {
                    setDragKey('');
                    setOverKey('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft' && i > 0) {
                      event.preventDefault();
                      move(i, -1);
                    }
                    if (event.key === 'ArrowRight' && i < items.length - 1) {
                      event.preventDefault();
                      move(i, 1);
                    }
                  }}
                >
                  ⋮⋮
                </button>
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
                  disabled={i === items.length - 1 || action.pending}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`Xóa ảnh ${i + 1}`}
                  disabled={action.pending}
                  onClick={() =>
                    setItems((current) => current.filter((entry) => entry.key !== item.key))
                  }
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
          error={action.fieldErrors.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={repo.mode === 'remote' ? 200 : 160}
        />
        <Input
          disabled={action.pending}
          label="Ngày kỷ niệm"
          error={action.fieldErrors.date}
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
          error={action.fieldErrors.location}
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
          error={action.fieldErrors.note}
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
        {action.error && !uploadError && <Alert>{action.error}</Alert>}
        <Button type="submit" disabled={action.pending}>
          {action.pending ? 'Đang lưu…' : 'Lưu kỷ niệm'}
        </Button>
      </form>
    </Dialog>
  );
}
