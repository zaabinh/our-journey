import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { Button, ConfirmDialog } from '../../components/ui';
export function LeaveAlbum({ albumId }: { albumId: string }) {
  const { actor, dispatch } = useJourney(),
    [open, setOpen] = useState(false),
    action = useAction(),
    navigate = useNavigate();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Rời album
      </Button>
      <ConfirmDialog
        confirmLabel="Xác nhận rời album"
        title="Rời album này?"
        description="Bạn sẽ không còn xem được album. Nội dung bạn đã tạo vẫn nằm trong album; owner không thay đổi."
        open={open}
        pending={action.pending}
        error={action.error}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          void action.run(async () => {
            await dispatch({ type: 'removeMember', albumId, userId: actor });
            setOpen(false);
            navigate('/albums');
          })
        }
      />
    </>
  );
}
