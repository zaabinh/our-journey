import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { canEdit, canWrite, roleOf } from '../../domain/policy';
import { MemoryDetailSkeleton } from '../../components/ui/skeletons';
import { DataBoundary } from '../../components/DataBoundary';
import { Alert, Button, ConfirmDialog } from '../../components/ui';
import { BlobImage, PhotoViewer, coverSizes } from './Photo';
import { CommentsPanel } from '../comments/CommentsPanel';
import { ReactionBar } from '../comments/ReactionBar';
import { Story } from './Story';
import { MemoryForm } from './MemoryForm';
import { memoryDate } from '../../domain/date';
export function MemoryPage() {
  const { albumId = '', memoryId = '' } = useParams(),
    { state, actor, dispatch } = useJourney(),
    action = useAction(),
    reactionAction = useAction(),
    navigate = useNavigate();
  const memory = state?.memories.find((m) => m.id === memoryId && m.albumId === albumId),
    role = roleOf(state?.members ?? [], albumId, actor);
  const [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false),
    [index, setIndex] = useState<number | null>(null),
    [effect, setEffect] = useState('');
  const photos =
    memory?.photoIds.map((id) => state!.photos.find((p) => p.id === id)!).filter(Boolean) ?? [];
  return (
    <DataBoundary fallback={<MemoryDetailSkeleton />}>
      {!memory ? (
        <section className="memory-not-found">
          <h1>Không thể mở kỷ niệm</h1>
          <Alert>Kỷ niệm không tồn tại hoặc bạn chưa có quyền xem.</Alert>
        </section>
      ) : (
        <article className="memory-detail">
          <header className="memory-detail-hero">
            <div className="memory-detail-topline">
              <Link className="album-back-link" to={`/albums/${albumId}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m14 5-7 7 7 7M7 12h14" />
                </svg>
                <span>Về album</span>
              </Link>
              <div className="memory-detail-tools">
                {canEdit(role, memory.authorId, actor) && (
                  <div className="memory-detail-actions">
                    {memory.published === false && (
                      <Button
                        disabled={action.pending || photos.length === 0}
                        onClick={() =>
                          void action.run(() => dispatch({ type: 'publishMemory', memoryId }))
                        }
                      >
                        {action.pending ? 'Đang xuất bản…' : 'Xuất bản kỷ niệm'}
                      </Button>
                    )}
                    <MemoryForm
                      key={memory.id}
                      albumId={albumId}
                      memory={memory}
                      open={edit}
                      onClose={() => setEdit(false)}
                      trigger={<Button onClick={() => setEdit(true)}>Sửa kỷ niệm</Button>}
                    />
                    <Button variant="danger" onClick={() => setRemove(true)}>
                      Xóa kỷ niệm
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="memory-detail-heading">
              <span className="album-kicker">MỘT KỶ NIỆM ĐÁNG NHỚ</span>
              {memory.published === false && (
                <p role="status">Bản nháp · thêm ít nhất một ảnh để xuất bản.</p>
              )}
              <h1>{memory.title}</h1>
              <div className="memory-detail-meta" aria-label="Thông tin kỷ niệm">
                <time dateTime={memory.dateLabel?.trim() ? undefined : memory.date || undefined}>
                  {memoryDate(memory)}
                </time>
                {memory.location && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{memory.location}</span>
                  </>
                )}
              </div>
            </div>
          </header>

          <div className="memory-detail-content">
            <div className="memory-detail-left">
              <section className="memory-media-section" aria-label="Ảnh và cảm xúc của kỷ niệm">
                {photos.length > 0 && (
                  <>
                    <div className="memory-section-heading">
                      <span className="album-kicker">NHỮNG KHOẢNH KHẮC</span>
                      <span className="memory-photo-count">{photos.length} ảnh</span>
                    </div>
                    <div
                      className={`grid photo-grid memory-detail-photo-grid${photos.length === 1 ? ' single-photo' : ''}`}
                    >
                      {photos.map((p, i) => (
                        <button
                          className="photo-button"
                          key={`${p.id}-${i}`}
                          onClick={(event) => {
                            event.currentTarget.focus();
                            setIndex(i);
                          }}
                          aria-label={`Xem ảnh ${i + 1}`}
                        >
                          <BlobImage
                            photo={p}
                            alt={`Ảnh ${i + 1} của ${memory.title}`}
                            sizes={
                              photos.length === 1
                                ? coverSizes(p, 4 / 3, [
                                    ['(max-width: 900px)', '92vw'],
                                    ['', 'min(52vw, 700px)'],
                                  ])
                                : coverSizes(p, 1, [
                                    ['(max-width: 480px)', '92vw'],
                                    ['(max-width: 900px)', '46vw'],
                                    ['', 'min(26vw, 350px)'],
                                  ])
                            }
                          />
                          <span className="memory-photo-number">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <ReactionBar
                  reactions={state!.reactions.filter((reaction) => reaction.memoryId === memoryId)}
                  actor={actor}
                  canReact={canWrite(role)}
                  pending={reactionAction.pending}
                  onSelect={(emoji) =>
                    void reactionAction.run(() => dispatch({ type: 'react', memoryId, emoji }))
                  }
                />
                {reactionAction.error && <Alert>{reactionAction.error}</Alert>}
              </section>
              <section className="memory-story-panel">
                <span className="album-kicker">CÂU CHUYỆN CỦA CHÚNG MÌNH</span>
                <Story text={memory.note || 'Kỷ niệm này chưa có lời nhắn.'} />
                {(!!memory.animations.heart || !!memory.animations.gift) && (
                  <div className="memory-effects actions">
                    {!!memory.animations.heart && (
                      <Button variant="secondary" onClick={() => setEffect('❤️')}>
                        Xem hiệu ứng trái tim
                      </Button>
                    )}
                    {!!memory.animations.gift && (
                      <Button variant="secondary" onClick={() => setEffect('🎁')}>
                        Xem hiệu ứng quà tặng
                      </Button>
                    )}
                  </div>
                )}
                <div
                  key={effect}
                  className="effect"
                  role="status"
                  onAnimationEnd={() => setEffect('')}
                >
                  {effect}
                </div>
              </section>
            </div>
            <CommentsPanel key={actor} albumId={albumId} memoryId={memoryId} />
          </div>
          <ConfirmDialog
            open={remove}
            title="Xóa kỷ niệm này?"
            description="Kỷ niệm, quan hệ ảnh, bình luận và cảm xúc của nó sẽ bị xóa khỏi dữ liệu local. Ảnh còn dùng ở kỷ niệm khác được giữ lại."
            pending={action.pending}
            error={action.error}
            onCancel={() => setRemove(false)}
            onConfirm={() =>
              void action.run(async () => {
                await dispatch({ type: 'deleteMemory', memoryId });
                setRemove(false);
                navigate(`/albums/${albumId}`);
              })
            }
          />
          <PhotoViewer
            photos={photos}
            index={index}
            onIndex={setIndex}
            onClose={() => setIndex(null)}
          />
        </article>
      )}
    </DataBoundary>
  );
}
