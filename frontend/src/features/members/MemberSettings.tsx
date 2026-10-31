import { useState } from 'react';
import { useAction, useJourney } from '../../app/JourneyProvider';
import type { MemberRole } from '../../domain/types';
import { Alert, Avatar, Button, ConfirmDialog, Dropdown } from '../../components/ui';
export function MemberSettings({ albumId }: { albumId: string }) {
  const { state, dispatch } = useJourney(),
    action = useAction(),
    [remove, setRemove] = useState<string>();
  const members = state!.members.filter((m) => m.albumId === albumId);
  return (
    <section>
      <h2>Thành viên</h2>
      <ul className="members">
        {members.map((member) => {
          const user = state!.users.find((u) => u.id === member.userId)!;
          return (
            <li key={member.userId}>
              <div className="member-name">
                <Avatar name={user.name} />
                <span>{user.name}</span>
              </div>
              {member.role === 'owner' ? (
                <span>Chủ album · không thể rời/hạ quyền</span>
              ) : (
                <div className="actions">
                  <Dropdown
                    label={`Quyền ${user.name}`}
                    value={member.role}
                    disabled={action.pending}
                    options={[
                      { value: 'contributor', label: 'Đóng góp' },
                      { value: 'viewer', label: 'Chỉ xem' },
                    ]}
                    onChange={(role) =>
                      void action.run(() =>
                        dispatch({
                          type: 'setRole',
                          albumId,
                          userId: member.userId,
                          role: role as MemberRole,
                        }),
                      )
                    }
                  />
                  <Button
                    variant="danger"
                    disabled={action.pending}
                    onClick={() => {
                      action.clear();
                      setRemove(member.userId);
                    }}
                    aria-label={`Xóa thành viên ${user.name}`}
                  >
                    Xóa thành viên
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {action.error && !remove && <Alert>{action.error}</Alert>}
      <ConfirmDialog
        open={!!remove}
        title="Xóa thành viên khỏi album?"
        description="Thành viên sẽ không còn xem được album bằng danh tính này. Kỷ niệm và bình luận họ đã tạo được giữ lại."
        pending={action.pending}
        error={action.error}
        onCancel={() => setRemove(undefined)}
        onConfirm={() =>
          void action.run(async () => {
            if (remove) await dispatch({ type: 'removeMember', albumId, userId: remove });
            setRemove(undefined);
          })
        }
      />
    </section>
  );
}
