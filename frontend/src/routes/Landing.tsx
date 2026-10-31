import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

const messages = [
  'Những điều nhỏ bé làm nên một hành trình.',
  'Cùng lưu lại câu chuyện của chúng mình.',
  'Một album cho những người bạn yêu thương.',
];

export function Landing() {
  const [count, setCount] = useState(0);
  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <span className="landing-kicker">
            <img src="/brand/love.png" alt="" /> OUR JOURNEY
          </span>
          <h1 id="landing-title">Giữ lại những điều mình muốn nhớ.</h1>
          <p className="landing-lede">
            Một không gian ấm áp cho ảnh, câu chuyện và những khoảnh khắc làm nên hành trình của
            chúng mình.
          </p>
          <div className="landing-actions">
            <Link className="button primary" to="/albums">
              Mở album <span aria-hidden="true">→</span>
            </Link>
            <Link className="button secondary" to="/signup">
              Tạo danh tính demo
            </Link>
          </div>
          <div className="landing-note" aria-live="polite">
            {count > 0 && <p>{messages[count - 1]}</p>}
            {count < messages.length && (
              <Button variant="secondary" onClick={() => setCount((value) => value + 1)}>
                {count === 0 ? 'Một lời nhắn nhỏ' : 'Đọc tiếp'}
              </Button>
            )}
          </div>
          <p className="landing-local-note">
            Demo local · Nội dung lưu trên trình duyệt này, chưa đồng bộ giữa các thiết bị.
          </p>
        </div>
        <div className="landing-visual" aria-hidden="true">
          <div className="landing-sun" />
          <div className="landing-orbit landing-orbit-back" />
          <div className="landing-orbit landing-orbit-front" />
          <div className="landing-photo-card landing-photo-back">
            <div className="landing-photo-placeholder">
              <span>OUR</span>
              <span>JOURNEY</span>
            </div>
            <div className="landing-card-caption">Những ngày bên nhau</div>
          </div>
          <div className="landing-photo-card landing-photo-front">
            <div className="landing-brand-stamp">
              <img src="/brand/love.png" alt="" />
            </div>
            <span className="landing-heart-mark">♡</span>
            <p>
              từng khoảnh khắc
              <br />
              đều đáng nhớ
            </p>
          </div>
          <div className="landing-sparkle sparkle-one">✦</div>
          <div className="landing-sparkle sparkle-two">✧</div>
        </div>
        <section className="landing-highlights" aria-label="Điểm nổi bật">
          <article>
            <span className="landing-highlight-icon">01</span>
            <h2>Một nơi cho mỗi câu chuyện</h2>
            <p>Tạo album riêng cho những dịp, chuyến đi và người bạn muốn nhớ.</p>
          </article>
          <article>
            <span className="landing-highlight-icon">02</span>
            <h2>Ảnh đi cùng ký ức</h2>
            <p>Thêm nhiều ảnh, ngày tháng, địa điểm và lời kể cho từng kỷ niệm.</p>
          </article>
          <article>
            <span className="landing-highlight-icon">03</span>
            <h2>Dễ tìm lại khi cần</h2>
            <p>Tìm theo tiêu đề, ngày, địa điểm hoặc một chi tiết trong câu chuyện.</p>
          </article>
        </section>
      </section>
    </div>
  );
}
