import { useEffect, useState } from 'react';
import type { Album } from '../../domain/types';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { Alert, Button, Dialog, Input, Textarea } from '../../components/ui';
export function AlbumForm({
  album,
  open,
  onClose,
  trigger,
}: {
  album?: Album;
  open: boolean;
  onClose: () => void;
  trigger?: React.ReactNode;
}) {
  const { dispatch } = useJourney(),
    action = useAction();
  const [title, setTitle] = useState(album?.title ?? ''),
    [description, setDescription] = useState(album?.description ?? '');
  useEffect(() => {
    if (open) {
      setTitle(album?.title ?? '');
      setDescription(album?.description ?? '');
    }
  }, [open]);
  const dirty = title !== (album?.title ?? '') || description !== (album?.description ?? '');
  useUnsavedChanges(open && dirty);
  return (
    <Dialog
      title={album ? 'Sửa album' : 'Album mới'}
      description={album ? 'Cập nhật tên và phần giới thiệu cho album.' : 'Tạo một không gian riêng để lưu lại những câu chuyện của bạn.'}
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
            await dispatch(
              album
                ? {
                    type: 'updateAlbum',
                    albumId: album.id,
                    title,
                    description,
                    coverPhotoId: album.coverPhotoId,
                  }
                : { type: 'createAlbum', title, description },
            );
            onClose();
          });
        }}
      >
        <Input
          disabled={action.pending}
          label="Tên album"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
        />
        <Textarea
          disabled={action.pending}
          label="Lời giới thiệu"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={4}
        />
        {action.error && <Alert>{action.error}</Alert>}
        <Button type="submit" disabled={action.pending}>
          {action.pending ? 'Đang lưu…' : 'Lưu album'}
        </Button>
      </form>
    </Dialog>
  );
}
