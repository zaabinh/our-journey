import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { canEdit, canManage, canWrite, roleOf } from '../../domain/policy';
import { DataBoundary } from '../../components/DataBoundary';
import { Alert, Button, Card, Dropdown, EmptyState, Input, Toast } from '../../components/ui';
import { IdentitySelector } from '../auth/IdentitySelector';
import { LeaveAlbum } from '../members/LeaveAlbum';
import { MemoryForm } from '../memories/MemoryForm';
import { BlobImage } from '../memories/Photo';

export function AlbumPage() {
  const { albumId = '' } = useParams(),
    { state, actor, dispatch } = useJourney(),
    action = useAction();
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState('order'),
    [limit, setLimit] = useState(12),
    [open, setOpen] = useState(false),
    [formKey, setFormKey] = useState(0),
    [notice, setNotice] = useState(''),
    [draggingId, setDraggingId] = useState(''),
    [dragOverId, setDragOverId] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const memoriesRef = useRef<HTMLElement>(null);
  const dragSourceRef = useRef('');
  const dragOverRef = useRef('');
  const album = state?.albums.find((a) => a.id === albumId),
    role = roleOf(state?.members ?? [], albumId, actor),
    all = state?.memories.filter((m) => m.albumId === albumId) ?? [];
  const q = query.toLocaleLowerCase().trim(),
    filtered = all
      .filter((m) =>
        [m.title, m.date, m.dateLabel ?? '', m.location, m.note].some((v) =>
          v.toLocaleLowerCase().includes(q),
        ),
      )
      .sort((a, b) =>
        sort === 'date'
          ? (b.date || b.dateLabel || '').localeCompare(a.date || a.dateLabel || '')
          : sort === 'title'
            ? a.title.localeCompare(b.title)
            : a.order - b.order,
      );
  const visible = filtered.slice(0, limit),
    canReorder =
      sort === 'order' &&
      filtered.length > 1 &&
      filtered.every((m) => canEdit(role, m.authorId, actor)),
    visibleKey = visible.map((m) => m.id).join('|');

  useEffect(() => {
    const cards = gridRef.current?.querySelectorAll<HTMLElement>('.album-memory-card');
    if (!cards?.length) return;
    if (
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      cards.forEach((card) => card.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' },
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [visibleKey]);

  function reorder(dragId: string, targetId: string, before = true) {
    if (!canReorder || dragId === targetId) return;
    const ids = filtered.map((memory) => memory.id),
      from = ids.indexOf(dragId),
      to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to + (before || from > to ? 0 : 1), 0, moved);
    if (ids.every((id, index) => id === filtered[index].id)) return;
    action.clear();
    setNotice('');
    void action.run(async () => {
      await dispatch({ type: 'reorder', albumId, ids });
      setNotice('Đã cập nhật thứ tự kỷ niệm.');
    });
  }

  function move(index: number, step: number) {
    if (!canReorder) return;
    const ids = filtered.map((memory) => memory.id),
      next = index + step;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    action.clear();
    setNotice('');
    void action.run(async () => {
      await dispatch({ type: 'reorder', albumId, ids });
      setNotice('Đã cập nhật thứ tự kỷ niệm.');
    });
  }

  function scrollToMemories() {
    const heading = memoriesRef.current?.querySelector<HTMLElement>('#memories-title');
    if (!heading) return;
    heading.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    heading.focus({ preventScroll: true });
  }

  return (
    <DataBoundary>
      {!album ? (
        <>
          <h1>Không thể mở album</h1>
          <Alert>Album không tồn tại hoặc danh tính hiện tại chưa có quyền xem.</Alert>
          <Link to="/albums">Về album của bạn</Link>
        </>
      ) : (
        <div className="album-page">
          <section className="album-hero" aria-labelledby="album-title">
            <div className="album-hero-top">
              <Link className="album-back-link" to="/albums">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m14 5-7 7 7 7M7 12h14" />
                </svg>
                <span>Tất cả album</span>
              </Link>
              <div className="album-header-actions">
                {canWrite(role) && (
                  <MemoryForm
                    key={formKey}
                    albumId={albumId}
                    open={open}
                    onClose={() => setOpen(false)}
                    trigger={
                      <Button
                        onClick={() => {
                          setFormKey((key) => key + 1);
                          setOpen(true);
                        }}
                      >
                        <span aria-hidden="true">＋</span> Thêm kỷ niệm
                      </Button>
                    }
                  />
                )}
                {canManage(role) && (
                  <Link
                    className="button secondary"
                    aria-label="Cài đặt album"
                    to={`/albums/${albumId}/settings`}
                  >
                    Cài đặt
                  </Link>
                )}
                {role && !canManage(role) && <LeaveAlbum albumId={albumId} />}
              </div>
            </div>
            <div className="album-hero-copy">
              <span className="album-kicker">ALBUM CỦA CHÚNG MÌNH</span>
              <h1 id="album-title">{album.title}</h1>
              <p className="album-description">
                {album.description || 'Một nơi nhỏ để lưu lại những khoảnh khắc đáng nhớ.'}
              </p>
            </div>
            <div className="album-hero-footer">
              <span className="album-total">
                <strong>{all.length}</strong> kỷ niệm
              </span>
              <div className="album-hero-footer-actions">
                <IdentitySelector className="album-identity-inline" />
                <Button
                  variant="secondary"
                  className="album-scroll-cue"
                  aria-label="Cuộn đến phần Những kỷ niệm"
                  title="Đi đến những kỷ niệm"
                  onClick={scrollToMemories}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </Button>
              </div>
            </div>
          </section>

          <section className="album-memories" aria-labelledby="memories-title" ref={memoriesRef}>
            <div className="album-list-toolbar">
              <div className="album-list-heading">
                <h2 id="memories-title" tabIndex={-1}>
                  Những kỷ niệm
                </h2>
                <p role="status">
                  {filtered.length} kỷ niệm{query ? ' phù hợp' : ''}
                </p>
              </div>
              <details className="album-tools">
                <summary aria-label="Mở tìm kiếm và sắp xếp">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="10.8" cy="10.8" r="6.3" />
                    <path d="m16 16 4.4 4.4" />
                  </svg>
                  <span>Tìm &amp; sắp xếp</span>
                </summary>
                <div className="album-tools-panel">
                  <Input
                    label="Tìm kỷ niệm"
                    type="search"
                    placeholder="Tiêu đề, ngày, địa điểm, câu chuyện…"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setLimit(12);
                    }}
                  />
                  <Dropdown
                    label="Sắp xếp"
                    value={sort}
                    onChange={(value) => {
                      setSort(value);
                      setLimit(12);
                    }}
                    options={[
                      { value: 'order', label: 'Thứ tự của album' },
                      { value: 'date', label: 'Ngày mới nhất' },
                      { value: 'title', label: 'Tiêu đề' },
                    ]}
                  />
                </div>
              </details>
            </div>
            {action.error && <Alert>{action.error}</Alert>}
            {notice && !action.error && <Toast>{notice}</Toast>}
            <div className="grid album-memory-grid" ref={gridRef}>
              {visible.map((memory, index) => (
                <Card
                  key={memory.id}
                  className={`album-memory-card${draggingId === memory.id ? ' is-dragging' : ''}${dragOverId === memory.id ? ' is-drop-target' : ''}`}
                  data-memory-id={memory.id}
                  onDragOver={(event) => {
                    if (!canReorder || !dragSourceRef.current) return;
                    event.preventDefault();
                    dragOverRef.current = memory.id;
                    setDragOverId(memory.id);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDragOverId('');
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dragOverRef.current = memory.id;
                    setDragOverId(memory.id);
                  }}
                >
                  {canReorder && (
                    <Button
                      variant="secondary"
                      className="album-drag-handle"
                      aria-label={`Kéo ${memory.title} để đổi thứ tự`}
                      title="Kéo thả để sắp xếp"
                      draggable
                      disabled={action.pending}
                      onDragStart={(event) => {
                        dragSourceRef.current = memory.id;
                        dragOverRef.current = '';
                        event.dataTransfer.setData('text/plain', memory.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggingId(memory.id);
                      }}
                      onDragEnd={() => {
                        if (dragSourceRef.current && dragOverRef.current)
                          reorder(dragSourceRef.current, dragOverRef.current);
                        dragSourceRef.current = '';
                        dragOverRef.current = '';
                        setDraggingId('');
                        setDragOverId('');
                      }}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" />
                      </svg>
                    </Button>
                  )}
                  <Link
                    className="album-memory-link"
                    aria-label={memory.title}
                    to={`/albums/${albumId}/memories/${memory.id}`}
                  >
                    <BlobImage
                      photo={state!.photos.find((photo) => photo.id === memory.photoIds[0])}
                      alt={memory.title}
                    />
                    <span className="album-memory-title">{memory.title}</span>
                  </Link>
                  <div className="album-memory-body">
                    <p className="album-memory-meta">
                      <span aria-hidden="true">♡</span>{' '}
                      {memory.dateLabel?.trim() || memory.date || 'Chưa ghi rõ ngày'}
                      {memory.location && <span> · {memory.location}</span>}
                    </p>
                    {memory.note && (
                      <p className="album-memory-note">{memory.note.slice(0, 160)}</p>
                    )}
                    <div className="album-memory-footer">
                      <span>{memory.photoIds.length} ảnh</span>
                      {canReorder && (
                        <div className="album-keyboard-order" aria-label="Sắp xếp bằng bàn phím">
                          <Button
                            variant="secondary"
                            aria-label={`Đưa ${memory.title} lên trước`}
                            disabled={index === 0 || action.pending}
                            onClick={() => move(index, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="secondary"
                            aria-label={`Đưa ${memory.title} xuống sau`}
                            disabled={index === filtered.length - 1 || action.pending}
                            onClick={() => move(index, 1)}
                          >
                            ↓
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {filtered.length === 0 && (
              <EmptyState
                title={all.length ? 'Chưa tìm thấy kỷ niệm' : 'Album đang chờ câu chuyện đầu tiên'}
              >
                <p>{all.length ? 'Thử từ khóa khác.' : 'Thêm một kỷ niệm để bắt đầu.'}</p>
              </EmptyState>
            )}
            {limit < filtered.length && (
              <div className="album-load-more">
                <Button variant="secondary" onClick={() => setLimit((value) => value + 12)}>
                  Xem thêm kỷ niệm
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </DataBoundary>
  );
}
