import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useJourney } from '../../app/JourneyProvider';
import { DataBoundary } from '../../components/DataBoundary';
import { Button, Card, EmptyState } from '../../components/ui';
import { BlobImage } from '../memories/Photo';
import { AlbumForm } from './AlbumForm';

export function AlbumsPage() {
  const { state, repo } = useJourney(),
    [open, setOpen] = useState(false),
    [formKey, setFormKey] = useState(0);
  const albumCount = state?.albums.length ?? 0,
    memoryCount = state?.memories.length ?? 0;

  return (
    <DataBoundary>
      <div className="album-index-page">
        <section className="album-index-hero" aria-labelledby="album-index-title">
          <div className="album-index-copy">
            <span className="album-kicker">KHÔNG GIAN CỦA CHÚNG MÌNH</span>
            <h1 id="album-index-title">Những câu chuyện được giữ lại</h1>
            <p>Mỗi album là một góc nhỏ để lưu ảnh, câu chuyện và những ngày mình muốn nhớ.</p>
            <AlbumForm
              key={formKey}
              open={open}
              onClose={() => setOpen(false)}
              trigger={
                <Button
                  aria-label="Tạo album"
                  onClick={() => {
                    setFormKey((key) => key + 1);
                    setOpen(true);
                  }}
                >
                  <span aria-hidden="true">＋</span> Tạo album mới
                </Button>
              }
            />
          </div>
          <div className="album-index-art" aria-hidden="true">
            <span className="album-art-orbit orbit-one" />
            <span className="album-art-orbit orbit-two" />
            <span className="album-art-card art-back" />
            <span className="album-art-card art-front">
              <img src="/brand/love.png" alt="" />
              <i>♡</i>
            </span>
          </div>
          <div className="album-index-stats" aria-label="Tổng quan album">
            <span>
              <strong>{albumCount}</strong> album
            </span>
            <span>
              <strong>{memoryCount}</strong> kỷ niệm
            </span>
          </div>
        </section>

        <section className="album-index-list" aria-labelledby="album-list-title">
          <div className="album-index-list-heading">
            <div>
              <span className="album-kicker">BỘ SƯU TẬP</span>
              <h2 id="album-list-title">Album của bạn</h2>
            </div>
            <span className="album-index-count">{albumCount} album</span>
          </div>
          {state?.albums.length ? (
            <div className="grid album-index-grid">
              {state.albums.map((album) => {
                const memories = state.memories.filter((memory) => memory.albumId === album.id),
                  cover = state.photos.find((photo) => photo.id === album.coverPhotoId);
                return (
                  <Card className="album-index-card" key={album.id}>
                    <Link
                      className="album-index-link"
                      aria-label={album.title}
                      to={`/albums/${album.id}`}
                    >
                      <div className="album-index-cover">
                        <BlobImage photo={cover} alt={`Bìa ${album.title}`} />
                        <span className="album-index-cover-label">OUR JOURNEY</span>
                      </div>
                      <div className="album-index-card-body">
                        <h3>{album.title}</h3>
                        <p>
                          {album.description ||
                            'Một nơi nhỏ để lưu lại những khoảnh khắc đáng nhớ.'}
                        </p>
                        <div className="album-index-card-footer">
                          <span>{memories.length} kỷ niệm</span>
                          <span className="album-open-icon" aria-hidden="true">
                            →
                          </span>
                        </div>
                      </div>
                    </Link>
                  </Card>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Chưa có album">
              <p>Tạo album đầu tiên để bắt đầu lưu câu chuyện của bạn.</p>
              <Button
                onClick={() => {
                  setFormKey((key) => key + 1);
                  setOpen(true);
                }}
              >
                Tạo album đầu tiên
              </Button>
            </EmptyState>
          )}
        </section>
        {repo.mode !== 'remote' && <p className="album-index-footnote">Dữ liệu fixture đang được lưu cục bộ trên trình duyệt.</p>}
      </div>
    </DataBoundary>
  );
}
