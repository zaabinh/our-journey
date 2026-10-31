import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { DataBoundary } from '../../components/DataBoundary';
import { Alert, Button, Card, Dropdown, Input } from '../../components/ui';
export function LoginPage() {
  const { state, actor, select } = useJourney(),
    action = useAction(),
    navigate = useNavigate();
  const [chosen, setChosen] = useState('');
  return (
    <DataBoundary>
      <h1>Đăng nhập demo</h1>
      <Card>
        <p>Chọn danh tính trên thiết bị này. Không có mật khẩu hay xác thực bảo mật.</p>
        <Dropdown
          label="Danh tính"
          value={chosen || actor}
          onChange={setChosen}
          options={(state?.users ?? []).map((u) => ({ value: u.id, label: u.name }))}
        />
        {action.error && <Alert>{action.error}</Alert>}
        <Button
          disabled={action.pending}
          onClick={() =>
            void action.run(async () => {
              await select(chosen || actor);
              navigate('/albums');
            })
          }
        >
          {action.pending ? 'Đang chọn…' : 'Dùng danh tính này'}
        </Button>
        <p>
          <Link to="/signup">Tạo danh tính demo mới</Link>
        </p>
      </Card>
    </DataBoundary>
  );
}
export function SignupPage() {
  const { create } = useJourney(),
    action = useAction(),
    navigate = useNavigate();
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [saved, setSaved] = useState(false);
  useUnsavedChanges(!saved && (!!name || !!email));
  return (
    <DataBoundary>
      <h1>Tạo danh tính demo</h1>
      <Card>
        <p>
          Dùng tên/email giả để khám phá. Danh tính này chỉ có trên trình duyệt hiện tại; không có
          mật khẩu.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await create(name.trim(), email.trim());
              setSaved(true);
            });
          }}
        >
          <Input
            disabled={action.pending || saved}
            label="Tên hiển thị"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
          <Input
            disabled={action.pending || saved}
            label="Email demo"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={200}
          />
          {action.error && <Alert>{action.error}</Alert>}
          <Button type="submit" disabled={action.pending || saved}>
            {action.pending ? 'Đang tạo…' : saved ? 'Đã tạo' : 'Tạo danh tính'}
          </Button>
        </form>
        {saved && (
          <p>
            <Button onClick={() => navigate('/albums')}>Đến album</Button>
          </p>
        )}
      </Card>
    </DataBoundary>
  );
}
