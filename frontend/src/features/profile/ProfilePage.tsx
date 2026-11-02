import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { DataTools } from './DataTools';
import { DataBoundary } from '../../components/DataBoundary';
import './profile.css';
import { Alert, Avatar, Button, Card, Input, Toast } from '../../components/ui';
function ProfileForm() {
  const { state, actor, dispatch, repo, perform } = useJourney(),
    user = state!.users.find((u) => u.id === actor)!;
  const [name, setName] = useState(user.name),
    [email, setEmail] = useState(user.email),
    [notice, setNotice] = useState(''),
    action = useAction(),
    fileRef = useRef<HTMLInputElement>(null);
  useUnsavedChanges(name !== user.name || email !== user.email);
  return (
    <Card className="profile-card">
      <div className="profile-avatar">
        <Avatar
          name={user.name}
          src={state!.photos.find((p) => p.id === user.avatarPhotoId)?.src}
        />
        {repo.mode === 'remote' && (
          <div className="profile-avatar-actions">
            <label htmlFor="profile-avatar" className="visually-hidden">
              Ảnh đại diện
            </label>
            <input
              ref={fileRef}
              className="visually-hidden"
              id="profile-avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={action.pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void action.run(async () => {
                  const api = repo as typeof repo & {
                    uploadAvatar?: (file: Blob) => Promise<unknown>;
                  };
                  if (!api.uploadAvatar) throw Error('Tải ảnh đại diện chưa khả dụng.');
                  await api.uploadAvatar(file);
                  await perform(async () => undefined);
                });
              }}
            />
            <Button
              variant="secondary"
              disabled={action.pending}
              onClick={() => fileRef.current?.click()}
            >
              Đổi ảnh đại diện
            </Button>
            {user.avatarPhotoId && (
              <Button
                variant="secondary"
                type="button"
                disabled={action.pending}
                onClick={() =>
                  void action.run(async () => {
                    const api = repo as typeof repo & { deleteAvatar?: () => Promise<unknown> };
                    if (!api.deleteAvatar) throw Error('Xóa ảnh đại diện chưa khả dụng.');
                    await api.deleteAvatar();
                    await perform(async () => undefined);
                  })
                }
              >
                Xóa ảnh
              </Button>
            )}
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await dispatch({ type: 'updateProfile', name, email });
            setNotice(repo.mode === 'remote' ? 'Đã lưu hồ sơ.' : 'Đã lưu hồ sơ demo.');
          });
        }}
      >
        <Input
          disabled={action.pending}
          label="Tên hiển thị"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
        <div className="profile-email">
          <Input
            disabled={action.pending}
            readOnly={repo.mode === 'remote'}
            label={
              repo.mode === 'remote' ? 'Email tài khoản (không thể đổi tại đây)' : 'Email demo'
            }
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={200}
          />
          {repo.mode === 'remote' && (
            <svg
              className="profile-lock"
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          )}
        </div>
        {action.error && <Alert>{action.error}</Alert>}
        <Button type="submit" disabled={action.pending}>
          {action.pending ? 'Đang lưu…' : 'Lưu hồ sơ'}
        </Button>
        <Toast>{notice}</Toast>
      </form>
    </Card>
  );
}
export function ProfilePage() {
  const { actor, repo } = useJourney();
  return (
    <DataBoundary>
      <h1>{repo.mode === 'remote' ? 'Hồ sơ của bạn' : 'Hồ sơ demo'}</h1>
      <p>
        {repo.mode === 'remote'
          ? 'Quản lý thông tin và ảnh đại diện tài khoản.'
          : 'Thông tin chỉ được lưu trên trình duyệt này.'}
      </p>
      <ProfileForm key={actor} />
      {repo.mode !== 'remote' && <DataTools />}
      {repo.mode !== 'remote' && (
        <p>
          <Link to="/login">Chọn danh tính</Link> · <Link to="/signup">Tạo danh tính demo</Link>
        </p>
      )}
    </DataBoundary>
  );
}
