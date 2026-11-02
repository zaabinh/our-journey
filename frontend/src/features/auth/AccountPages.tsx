import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { Alert, Button, Card, Input } from '../../components/ui';

function PasswordPolicy({ password }: { password: string }) {
  const checks = useMemo(
    () => [
      { label: 'Ít nhất 10 ký tự', valid: password.length >= 10 },
      { label: 'Tối đa 128 ký tự', valid: password.length > 0 && password.length <= 128 },
    ],
    [password],
  );
  const recommendations = [
    { label: 'Chữ hoa + thường', valid: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'Có số', valid: /\d/.test(password) },
    { label: 'Có ký hiệu', valid: /[^A-Za-z0-9]/.test(password) },
  ];
  const score =
    checks.filter((check) => check.valid).length +
    recommendations.filter((check) => check.valid).length;
  const strength =
    password.length === 0 ? 'Chưa nhập' : score >= 4 ? 'Mạnh' : score >= 2 ? 'Khá' : 'Yếu';
  const percent = password.length === 0 ? 0 : Math.round((score / 5) * 100);
  return (
    <section className="password-policy" aria-label="Kiểm tra mật khẩu">
      <div className="password-policy-heading">
        <strong>Độ an toàn</strong>
        <span>{strength}</span>
      </div>
      <div
        className="password-strength-track"
        role="meter"
        aria-label="Độ an toàn mật khẩu"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span
          className={`password-strength-fill strength-${score}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="password-policy-label">Điều kiện tài khoản</p>
      <ul className="password-policy-checks">
        {checks.map((check) => (
          <li key={check.label} data-valid={check.valid}>
            <span aria-hidden="true">{check.valid ? '✓' : '○'}</span>
            {check.label}
          </li>
        ))}
      </ul>
      <p className="password-policy-label">Gợi ý để mật khẩu khó đoán hơn</p>
      <ul className="password-policy-checks password-policy-tips">
        {recommendations.map((check) => (
          <li key={check.label} data-valid={check.valid}>
            <span aria-hidden="true">{check.valid ? '✓' : '○'}</span>
            {check.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LoginPage() {
  const { state, login } = useJourney(),
    action = useAction(),
    navigate = useNavigate(),
    location = useLocation();
  const [identifier, setIdentifier] = useState(''),
    [password, setPassword] = useState(''),
    [params] = useSearchParams();
  const requested =
    (location.state as { from?: string } | null)?.from ?? params.get('next') ?? '/albums';
  const destination =
    requested.startsWith('/') && !requested.startsWith('//') ? requested : '/albums';
  if (state) return <Navigate replace to={destination} />;
  return (
    <section className="auth-page" aria-labelledby="auth-title">
      <Card className="auth-card">
        <header className="auth-heading">
          <img src="/brand/love.png" alt="" />
          <div>
            <span>OUR JOURNEY</span>
            <h1 id="auth-title">Chào mừng bạn trở lại</h1>
            <p>Đăng nhập để tiếp tục hành trình lưu giữ kỷ niệm.</p>
          </div>
        </header>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await login(identifier.trim(), password);
              navigate(destination);
            });
          }}
        >
          <Input
            label="Email hoặc tên đăng nhập"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
            maxLength={254}
          />
          <Input
            label="Mật khẩu"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            maxLength={128}
          />
          {action.error && (
            <div role="alert">
              <Alert>{action.error}</Alert>
            </div>
          )}
          <Button type="submit" disabled={action.pending}>
            {action.pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </form>
        {params.get('registered') === '1' && (
          <Alert>Đã tạo tài khoản. Hãy mở email để xác minh trước khi đăng nhập.</Alert>
        )}
        <p className="auth-switch">
          <Link to="/forgot-password">Quên mật khẩu?</Link>
        </p>
        <p className="auth-switch">
          <Link to="/login?verify=1">Gửi lại email xác minh</Link>
        </p>
        {params.get('verify') === '1' && <ResendVerification />}
        <p className="auth-switch">
          Chưa có tài khoản?{' '}
          <Link to="/signup" state={{ from: destination }}>
            Đăng ký
          </Link>
        </p>
      </Card>
    </section>
  );
}

export function SignupPage() {
  const { state, register } = useJourney(),
    action = useAction(),
    navigate = useNavigate(),
    location = useLocation();
  const requested = (location.state as { from?: string } | null)?.from ?? '/albums';
  const destination =
    requested.startsWith('/') && !requested.startsWith('//') ? requested : '/albums';
  const [name, setName] = useState(''),
    [username, setUsername] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  useUnsavedChanges(!action.pending && !!(name || username || email || password));
  if (state) return <Navigate replace to="/albums" />;
  return (
    <section className="auth-page auth-page-signup" aria-labelledby="auth-title">
      <Card className="auth-card">
        <header className="auth-heading">
          <img src="/brand/love.png" alt="" />
          <div>
            <span>BẮT ĐẦU HÀNH TRÌNH</span>
            <h1 id="auth-title">Tạo tài khoản</h1>
            <p>Our journey start here! Hãy để chúng tôi giúp bạn lưu giữ kỷ niệm.</p>
          </div>
        </header>
        <form
          className="auth-form auth-form-signup"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await register({
                display_name: name.trim(),
                username: username.trim(),
                email: email.trim(),
                password,
              });
              navigate(`/login?registered=1&next=${encodeURIComponent(destination)}`);
            });
          }}
        >
          <div className="auth-field-grid">
            <Input
              label="Tên hiển thị"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
            />
            <Input
              label="Tên đăng nhập"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={64}
              pattern="[-a-zA-Z0-9_.]+"
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
            />
            <Input
              label="Mật khẩu"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={10}
              maxLength={128}
            />
            <div className="auth-field-wide">
              <PasswordPolicy password={password} />
            </div>
          </div>
          {action.error && (
            <div role="alert">
              <Alert>{action.error}</Alert>
            </div>
          )}
          <Button type="submit" disabled={action.pending}>
            {action.pending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
          </Button>
        </form>
        <p className="auth-switch">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </Card>
    </section>
  );
}

function ResendVerification() {
  const { repo } = useJourney(),
    action = useAction();
  const [email, setEmail] = useState(''),
    [sent, setSent] = useState(false);
  const accounts = repo as typeof repo & {
    resendVerification?: (email: string) => Promise<unknown>;
  };
  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          if (!accounts.resendVerification) throw Error('Không khả dụng.');
          await accounts.resendVerification(email);
          setSent(true);
        });
      }}
    >
      <Input
        label="Gửi lại email xác minh"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <Button variant="secondary" type="submit" disabled={action.pending}>
        Gửi lại liên kết
      </Button>
      {sent && <p role="status">Nếu tài khoản cần xác minh, email sẽ được gửi.</p>}
      {action.error && <Alert>{action.error}</Alert>}
    </form>
  );
}

export function AccountLinkPage({ mode }: { mode: 'verify' | 'forgot' | 'reset' }) {
  const { repo } = useJourney(),
    action = useAction(),
    [params] = useSearchParams();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [done, setDone] = useState(false);
  const accounts = repo as typeof repo & {
    verifyEmail?: (token: string) => Promise<unknown>;
    requestPasswordReset?: (email: string) => Promise<unknown>;
    resetPassword?: (token: string, password: string) => Promise<unknown>;
  };
  const title =
    mode === 'verify'
      ? 'Xác minh email'
      : mode === 'forgot'
        ? 'Khôi phục mật khẩu'
        : 'Đặt mật khẩu mới';
  const submit = async () => {
    if (mode === 'verify') {
      if (!accounts.verifyEmail || !params.get('token'))
        throw Error('Liên kết xác minh không hợp lệ.');
      await accounts.verifyEmail(params.get('token')!);
    } else if (mode === 'forgot') {
      if (!accounts.requestPasswordReset) throw Error('Không khả dụng.');
      await accounts.requestPasswordReset(email.trim());
    } else {
      if (!accounts.resetPassword || !params.get('token'))
        throw Error('Liên kết đặt lại không hợp lệ.');
      await accounts.resetPassword(params.get('token')!, password);
    }
    setDone(true);
  };
  return (
    <section className="auth-page">
      <Card className="auth-card">
        <header className="auth-heading">
          <img src="/brand/love.png" alt="" />
          <div>
            <span>OUR JOURNEY</span>
            <h1>{title}</h1>
            <p>
              {mode === 'forgot'
                ? 'Nhập email tài khoản để nhận liên kết bảo mật.'
                : 'Liên kết chỉ sử dụng một lần và sẽ hết hạn.'}
            </p>
          </div>
        </header>
        {!done && (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(submit);
            }}
          >
            {mode === 'forgot' && (
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
            {mode === 'reset' && (
              <>
                <Input
                  label="Mật khẩu mới"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <PasswordPolicy password={password} />
              </>
            )}
            {action.error && <Alert>{action.error}</Alert>}
            <Button type="submit" disabled={action.pending}>
              {action.pending ? 'Đang xử lý…' : title}
            </Button>
          </form>
        )}
        {done && (
          <p role="status">
            {mode === 'forgot'
              ? 'Nếu email khớp với tài khoản, liên kết khôi phục sẽ được gửi.'
              : mode === 'verify'
                ? 'Email đã được xác minh.'
                : 'Mật khẩu đã được cập nhật. Hãy đăng nhập lại.'}
          </p>
        )}
        <p className="auth-switch">
          <Link to="/login">Quay lại đăng nhập</Link>
        </p>
      </Card>
    </section>
  );
}
