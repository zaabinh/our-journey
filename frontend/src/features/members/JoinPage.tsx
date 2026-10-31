import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { JourneyRepository } from '../../domain/types';
import { errorMessage, useAction, useJourney } from '../../app/JourneyProvider';
import { DataBoundary } from '../../components/DataBoundary';
import { Alert, Button, Skeleton } from '../../components/ui';
export function JoinPage() {
  const { token = '' } = useParams(),
    { repo, state, actor, dispatch } = useJourney(),
    action = useAction(),
    navigate = useNavigate();
  const [info, setInfo] = useState<Awaited<ReturnType<JourneyRepository['previewInvite']>>>(),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setInfo(undefined);
    setError('');
    void repo
      .previewInvite(token)
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [repo, token, actor, retry]);
  const member = state?.members.some((m) => m.albumId === info?.albumId && m.userId === actor);
  return (
    <DataBoundary>
      <h1>Tham gia album demo</h1>
      <p>
        Lời mời chỉ tồn tại trong cùng datastore trình duyệt này. Thiết bị hoặc browser profile khác
        chưa có mã; cần backend để mời nhiều thiết bị.
      </p>
      {error ? (
        <Alert>
          {error}
          <Button onClick={() => setRetry((n) => n + 1)}>Thử lại</Button>
        </Alert>
      ) : !info ? (
        <Skeleton />
      ) : info.status !== 'active' ? (
        <Alert>
          {info.status === 'invalid'
            ? 'Mã mời không tồn tại trên thiết bị này.'
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
                  const id = await dispatch({ type: 'join', token });
                  navigate(`/albums/${id}`);
                })
              }
            >
              {action.pending ? 'Đang tham gia…' : 'Tham gia trên thiết bị này'}
            </Button>
          )}
        </>
      )}
      {action.error && <Alert>{action.error}</Alert>}
    </DataBoundary>
  );
}
