import { useState } from 'react';
import type { MemberRole } from '../../domain/types';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { Alert, Button, Dropdown, Input, Toast } from '../../components/ui';
function localTime(time: number) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function InviteSettings({ albumId }: { albumId: string }) {
  const { state, dispatch } = useJourney(),
    action = useAction(),
    [role, setRole] = useState<MemberRole>('viewer'),
    [initialExpiry] = useState(() => localTime(Date.now() + 7 * 86400000)),
    [expiry, setExpiry] = useState(initialExpiry),
    [saved, setSaved] = useState(false),
    [notice, setNotice] = useState('');
  useUnsavedChanges(!saved && (role !== 'viewer' || expiry !== initialExpiry));
  const invites = state!.invites.filter((i) => i.albumId === albumId);
  return (
    <section>
      <h2>Lời mời demo</h2>
      <p>
        Chỉ hoạt động trong cùng datastore trình duyệt này. Liên kết/mã sẽ không hoạt động trên
        thiết bị khác cho tới khi có backend.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await dispatch({
              type: 'createInvite',
              albumId,
              role,
              expiresAt: new Date(expiry).getTime(),
            });
            setNotice('Đã tạo lời mời demo local.');
            setSaved(true);
          });
        }}
      >
        <Dropdown
          label="Quyền trong lời mời"
          value={role}
          onChange={(v) => {
            setRole(v as MemberRole);
            setSaved(false);
          }}
          disabled={action.pending}
          options={[
            { value: 'viewer', label: 'Chỉ xem' },
            { value: 'contributor', label: 'Đóng góp' },
          ]}
        />
        <Input
          label="Hết hạn (giờ thiết bị)"
          type="datetime-local"
          value={expiry}
          onChange={(e) => {
            setExpiry(e.target.value);
            setSaved(false);
          }}
          required
          disabled={action.pending}
        />
        <Button type="submit" disabled={action.pending}>
          Tạo lời mời demo
        </Button>
      </form>
      {action.error && <Alert>{action.error}</Alert>}
      <Toast>{notice}</Toast>
      <ul className="invites">
        {invites.map((invite) => {
          const url = `${window.location.origin}/join/${invite.token}`,
            status = invite.revoked
              ? 'Đã thu hồi'
              : invite.expiresAt <= Date.now()
                ? 'Đã hết hạn'
                : 'Đang hoạt động';
          return (
            <li key={invite.id}>
              <p>
                {invite.role === 'viewer' ? 'Chỉ xem' : 'Đóng góp'} · {status} ·{' '}
                {new Date(invite.expiresAt).toLocaleString('vi-VN')}
              </p>
              <Input label="Mã mời demo" value={invite.token} readOnly />
              <Input label="Liên kết demo" value={url} readOnly />
              <div className="actions">
                <Button
                  variant="secondary"
                  disabled={action.pending}
                  onClick={() =>
                    void action.run(async () => {
                      await navigator.clipboard.writeText(url);
                      setNotice('Đã sao chép liên kết demo. Chỉ dùng được trên datastore này.');
                    })
                  }
                >
                  Sao chép liên kết
                </Button>
                <Button
                  variant="danger"
                  disabled={invite.revoked || action.pending}
                  onClick={() =>
                    void action.run(() => dispatch({ type: 'revokeInvite', inviteId: invite.id }))
                  }
                >
                  Thu hồi lời mời
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
