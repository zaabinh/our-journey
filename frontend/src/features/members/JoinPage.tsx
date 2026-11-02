import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { JourneyRepository } from '../../domain/types';
import { errorMessage, useAction, useJourney } from '../../app/JourneyProvider';
import { DataBoundary } from '../../components/DataBoundary';
import { Alert, Button, Input, Skeleton } from '../../components/ui';
export function JoinPage() {
  const { token = '' } = useParams(),
    { repo, state, actor, dispatch } = useJourney(),
    action = useAction(),
    navigate = useNavigate();
  const [info, setInfo] = useState<Awaited<ReturnType<JourneyRepository['previewInvite']>>>(),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [value, setValue] = useState(token),
    [secret, setSecret] = useState(token);
  useEffect(() => {
    setValue(token);
    setSecret(token);
  }, [token]);
  useEffect(() => {
    let active = true;
    setInfo(undefined);
    setError('');
    if (!secret)
      return () => {
        active = false;
      };
    void repo
      .previewInvite(secret)
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [repo, secret, actor, retry]);
  const member = state?.members.some((m) => m.albumId === info?.albumId && m.userId === actor);
  return (
    <DataBoundary>
      <h1>Tham gia album</h1>
      <p>Xác nhận lời mời để thêm album vào không gian hành trình của bạn.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSecret(value.trim());
        }}
      >
        <Input
          label="Liên kết hoặc mã mời"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
          minLength={8}
          maxLength={200}
        />
        <Button type="submit" disabled={!value.trim()}>
          Kiểm tra lời mời
        </Button>
      </form>
      {error ? (
        <Alert>
          {error}
          <Button onClick={() => setRetry((n) => n + 1)}>Thử lại</Button>
        </Alert>
      ) : !secret ? null : !info ? (
        <Skeleton />
      ) : info.status !== 'active' ? (
        <Alert>
          {info.status === 'invalid'
            ? 'Liên kết hoặc mã mời không hợp lệ.'
            : info.status === 'expired'
              ? 'Lời mời đã hết hạn.'
              : 'Lời mời đã được thu hồi.'}
        </Alert>
      ) : (
        <>
          <h2>{info.title}</h2>
          <p>Quyền: {info.role === 'viewer' ? 'Chỉ xem' : 'Đóng góp'}</p>
          {member ? (
            <>
              <p role="status">Bạn đã là thành viên album này.</p>
              <Link className="button primary" to={`/albums/${info.albumId}`}>
                Vào album
              </Link>
            </>
          ) : (
            <Button
              disabled={action.pending}
              onClick={() =>
                void action.run(async () => {
                  const id = await dispatch({ type: 'join', token: secret });
                  navigate(`/albums/${id}`);
                })
              }
            >
              {action.pending ? 'Đang tham gia…' : 'Tham gia album'}
            </Button>
          )}
        </>
      )}
      {action.error && <Alert>{action.error}</Alert>}
    </DataBoundary>
  );
}
