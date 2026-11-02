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
      <h2>Lời mời thành viên</h2>
      <p>Tạo liên kết hoặc mã dùng một lần để mời người khác vào album.</p>
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
            setNotice(
              'Đã tạo lời mời. Hãy sao chép liên kết hoặc mã để chia sẻ; bí mật chỉ hiển thị ngay sau khi tạo.',
            );
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
          {action.pending ? 'Đang tạo…' : 'Tạo lời mời'}
        </Button>
      </form>
      {action.error && <Alert>{action.error}</Alert>}
      <Toast>{notice}</Toast>
      <ul className="invites">
        {invites.map((invite) => {
          const url = invite.token ? `${window.location.origin}/join/${invite.token}` : '',
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
              {invite.code && <Input label="Mã mời" value={invite.code} readOnly />}
              {url ? (
                <Input label="Liên kết mời" value={url} readOnly />
              ) : (
                <p>
                  Mã bí mật chỉ hiển thị một lần khi tạo. Lời mời này đã được lưu an toàn; hãy tạo
                  lời mời mới nếu cần chia sẻ lại.
                </p>
              )}
              <div className="actions">
                <Button
                  variant="secondary"
                  disabled={action.pending || !url}
                  onClick={() =>
                    void action.run(async () => {
                      await navigator.clipboard.writeText(url);
                      setNotice('Đã sao chép liên kết mời.');
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
