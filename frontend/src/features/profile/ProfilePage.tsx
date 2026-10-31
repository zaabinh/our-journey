import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { DataTools } from './DataTools';
import { DataBoundary } from '../../components/DataBoundary';
import { Alert, Avatar, Button, Card, Input, Toast } from '../../components/ui';
function ProfileForm() {
  const { state, actor, dispatch } = useJourney(),
    user = state!.users.find((u) => u.id === actor)!;
  const [name, setName] = useState(user.name),
    [email, setEmail] = useState(user.email),
    [notice, setNotice] = useState(''),
    action = useAction();
  useUnsavedChanges(name !== user.name || email !== user.email);
  return (
    <Card>
      <Avatar name={user.name} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await dispatch({ type: 'updateProfile', name, email });
            setNotice('Đã lưu hồ sơ demo.');
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
        <Input
          disabled={action.pending}
          label="Email demo"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={200}
        />
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
  const { actor } = useJourney();
  return (
    <DataBoundary>
      <h1>Hồ sơ demo</h1>
      <p>Thông tin chỉ được lưu trên trình duyệt này.</p>
      <ProfileForm key={actor} />
      <DataTools />
      <p>
        <Link to="/login">Chọn danh tính</Link> · <Link to="/signup">Tạo danh tính demo</Link>
      </p>
    </DataBoundary>
  );
}
