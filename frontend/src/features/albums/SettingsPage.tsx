import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { canManage, roleOf } from '../../domain/policy';
import { DataBoundary } from '../../components/DataBoundary';
import { Alert, Button, ConfirmDialog, Dropdown } from '../../components/ui';
import { MemberSettings } from '../members/MemberSettings';
import { InviteSettings } from '../members/InviteSettings';
import { LegacyImport } from './LegacyImport';
import { AlbumForm } from './AlbumForm';
export function SettingsPage() {
  const { albumId = '' } = useParams(),
    { state, actor, dispatch, repo } = useJourney(),
    action = useAction(),
    navigate = useNavigate();
  const [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false),
    album = state?.albums.find((a) => a.id === albumId),
    role = roleOf(state?.members ?? [], albumId, actor);
  const photos =
    state?.memories.filter((m) => m.albumId === albumId).flatMap((m) => m.photoIds) ?? [];
  return (
    <DataBoundary>
      {!album || !canManage(role) ? (
        <>
          <h1>Không có quyền quản lý album</h1>
          <Alert>Chỉ owner được mở cài đặt album.</Alert>
        </>
      ) : (
        <div className="settings-page">
          <section className="settings-hero" aria-labelledby="settings-title">
            <div className="settings-hero-top">
              <Link className="album-back-link" to={`/albums/${albumId}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m14 5-7 7 7 7M7 12h14" />
                </svg>
                <span>Về album</span>
              </Link>
              <AlbumForm
                key={album.id}
                album={album}
                open={edit}
                onClose={() => setEdit(false)}
                trigger={
                  <Button variant="secondary" onClick={() => setEdit(true)}>
                    Sửa thông tin
                  </Button>
                }
              />
            </div>
            <span className="album-kicker">QUẢN LÝ KHÔNG GIAN</span>
            <h1 id="settings-title">Cài đặt album</h1>
            <p>{album.title}</p>
          </section>

          <div className="settings-content">
            <section className="settings-card settings-cover-card" aria-labelledby="cover-title">
              <div className="settings-card-heading">
                <span className="settings-step">01</span>
                <div>
                  <h2 id="cover-title">Ảnh bìa</h2>
                  <p>Chọn hình ảnh đại diện cho album.</p>
                </div>
              </div>
              <Dropdown
                disabled={action.pending}
                label="Ảnh bìa"
                value={album.coverPhotoId ?? ''}
                options={[
                  { value: '', label: 'Không chọn ảnh bìa' },
                  ...[...new Set(photos)].map((id, i) => ({ value: id, label: `Ảnh ${i + 1}` })),
                ]}
                onChange={(id) =>
                  void action.run(() =>
                    dispatch({
                      type: 'updateAlbum',
                      albumId,
                      title: album.title,
                      description: album.description,
                      coverPhotoId: id || undefined,
                    }),
                  )
                }
              />
              {action.error && <Alert>{action.error}</Alert>}
            </section>

            <section className="settings-card settings-members-card" aria-label="Thành viên">
              <div className="settings-card-heading">
                <span className="settings-step">02</span>
                <div>
                  <p className="settings-overline">CÙNG GÓP CHUYỆN</p>
                </div>
              </div>
              <MemberSettings albumId={albumId} />
            </section>

            {repo.mode !== 'remote' && <section className="settings-card settings-invites-card" aria-label="Lời mời">
              <div className="settings-card-heading">
                <span className="settings-step">03</span>
                <div>
                  <p className="settings-overline">MỞ RỘNG HÀNH TRÌNH</p>
                </div>
              </div>
              <InviteSettings albumId={albumId} />
            </section>}

            {repo.mode !== 'remote' && <section className="settings-card settings-import-card" aria-label="Nhập dữ liệu">
              <div className="settings-card-heading">
                <span className="settings-step">04</span>
                <div>
                  <p className="settings-overline">CHUYỂN KỶ NIỆM</p>
                </div>
              </div>
              <LegacyImport albumId={albumId} />
            </section>}

            <section className="settings-danger-zone" aria-labelledby="delete-album-title">
              <div>
                <h2 id="delete-album-title">Xóa album</h2>
                <p>Album, kỷ niệm và nội dung liên quan sẽ bị xóa khỏi dữ liệu local.</p>
              </div>
              <Button variant="danger" onClick={() => setRemove(true)}>
                Xóa album
              </Button>
            </section>
          </div>
          <ConfirmDialog
            open={remove}
            title="Xóa toàn bộ album?"
            description="Album, thành viên, lời mời, toàn bộ kỷ niệm, bình luận và cảm xúc sẽ bị xóa khỏi dữ liệu local. Hãy xuất bản sao trước khi xóa."
            pending={action.pending}
            error={action.error}
            onCancel={() => setRemove(false)}
            onConfirm={() =>
              void action.run(async () => {
                await dispatch({ type: 'deleteAlbum', albumId });
                setRemove(false);
                navigate('/albums');
              })
            }
          />
        </div>
      )}
    </DataBoundary>
  );
}
