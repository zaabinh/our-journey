import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { Alert, Button, Card, Input } from '../../components/ui';

function PasswordPolicy({ password }: { password: string }) {
  const checks = useMemo(() => [
    { label: 'Ít nhất 10 ký tự', valid: password.length >= 10 },
    { label: 'Tối đa 128 ký tự', valid: password.length > 0 && password.length <= 128 },
  ], [password]);
  const recommendations = [
    { label: 'Chữ hoa + thường', valid: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'Có số', valid: /\d/.test(password) },
    { label: 'Có ký hiệu', valid: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((check) => check.valid).length + recommendations.filter((check) => check.valid).length;
  const strength = password.length === 0 ? 'Chưa nhập' : score >= 4 ? 'Mạnh' : score >= 2 ? 'Khá' : 'Yếu';
  const percent = password.length === 0 ? 0 : Math.round((score / 5) * 100);
  return (
    <section className="password-policy" aria-label="Kiểm tra mật khẩu">
      <div className="password-policy-heading"><strong>Độ an toàn</strong><span>{strength}</span></div>
      <div className="password-strength-track" role="meter" aria-label="Độ an toàn mật khẩu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span className={`password-strength-fill strength-${score}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="password-policy-label">Điều kiện tài khoản</p>
      <ul className="password-policy-checks">
        {checks.map((check) => <li key={check.label} data-valid={check.valid}><span aria-hidden="true">{check.valid ? '✓' : '○'}</span>{check.label}</li>)}
      </ul>
      <p className="password-policy-label">Gợi ý để mật khẩu khó đoán hơn</p>
      <ul className="password-policy-checks password-policy-tips">
        {recommendations.map((check) => <li key={check.label} data-valid={check.valid}><span aria-hidden="true">{check.valid ? '✓' : '○'}</span>{check.label}</li>)}
      </ul>
    </section>
  );
}

export function LoginPage() {
  const { state, login } = useJourney(), action = useAction(), navigate = useNavigate();
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState('');
  if (state) return <Navigate replace to="/albums" />;
  return (
    <section className="auth-page" aria-labelledby="auth-title">
      <Card className="auth-card">
        <header className="auth-heading"><img src="/brand/love.png" alt=""/><div><span>OUR JOURNEY</span><h1 id="auth-title">Chào mừng bạn trở lại</h1><p>Đăng nhập để tiếp tục hành trình lưu giữ kỷ niệm.</p></div></header>
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void action.run(async () => { await login(identifier.trim(), password); navigate('/albums'); }); }}>
          <Input label="Email hoặc tên đăng nhập" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required maxLength={254}/>
          <Input label="Mật khẩu" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128}/>
          {action.error && <div role="alert"><Alert>{action.error}</Alert></div>}
          <Button type="submit" disabled={action.pending}>{action.pending ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
        </form>
        <p className="auth-switch">Chưa có tài khoản? <Link to="/signup">Đăng ký</Link></p>
      </Card>
    </section>
  );
}

export function SignupPage() {
  const { state, register } = useJourney(), action = useAction(), navigate = useNavigate();
  const [name, setName] = useState(''), [username, setUsername] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  useUnsavedChanges(!action.pending && !!(name || username || email || password));
  if (state) return <Navigate replace to="/albums" />;
  return (
    <section className="auth-page auth-page-signup" aria-labelledby="auth-title">
      <Card className="auth-card">
        <header className="auth-heading"><img src="/brand/love.png" alt=""/><div><span>BẮT ĐẦU HÀNH TRÌNH</span><h1 id="auth-title">Tạo tài khoản</h1><p>Our journey start here! Hãy để chúng tôi giúp bạn lưu giữ kỷ niệm.</p></div></header>
        <form className="auth-form auth-form-signup" onSubmit={(event) => { event.preventDefault(); void action.run(async () => { await register({ display_name: name.trim(), username: username.trim(), email: email.trim(), password }); navigate('/albums'); }); }}>
          <div className="auth-field-grid">
            <Input label="Tên hiển thị" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100}/>
            <Input label="Tên đăng nhập" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={64} pattern="[-a-zA-Z0-9_.]+"/>
            <Input label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254}/>
            <Input label="Mật khẩu" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128}/>
            <div className="auth-field-wide"><PasswordPolicy password={password}/></div>
          </div>
          {action.error && <div role="alert"><Alert>{action.error}</Alert></div>}
          <Button type="submit" disabled={action.pending}>{action.pending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</Button>
        </form>
        <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
      </Card>
    </section>
  );
}
