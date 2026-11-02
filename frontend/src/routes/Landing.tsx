import './landing-cards.css';
import { Link } from 'react-router-dom';

export function Landing() {
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
            <Link
              className="button primary landing-signup-cta"
              to="/signup"
              aria-label="Bắt đầu lưu giữ hành trình của bạn."
            >
              <span className="landing-signup-copy" aria-hidden="true">
                <span className="landing-signup-label landing-signup-label-default">
                  Bắt đầu lưu giữ hành trình của bạn.
                </span>
                <span className="landing-signup-label landing-signup-label-hover">
                  Chuyển tới trang đăng ký
                </span>
              </span>
              <span className="landing-signup-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <Link className="button secondary" to="/login">
              Đã có tài khoản
            </Link>
          </div>
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
            <div className="landing-card-top">
              <span className="landing-card-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" />
                  <path d="M12 15.2s-2.6-1.6-2.6-3.3a1.5 1.5 0 0 1 2.6-1 1.5 1.5 0 0 1 2.6 1c0 1.7-2.6 3.3-2.6 3.3z" />
                </svg>
              </span>
              <span className="landing-card-number">01</span>
            </div>
            <h2>Một nơi cho mọi câu chuyện</h2>
            <p>Tạo album riêng cho những kỷ niệm, chia sẻ với những người thân thuộc.</p>
          </article>
          <article>
            <div className="landing-card-top">
              <span className="landing-card-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
              <span className="landing-card-number">02</span>
            </div>
            <h2>Ảnh đi cùng ký ức</h2>
            <p>
              Thêm ảnh, ngày tháng, địa điểm và lời kể cho từng kỷ niệm. Cùng mọi người bình luận,
              bày tỏ cảm xúc.
            </p>
          </article>
          <article>
            <div className="landing-card-top">
              <span className="landing-card-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="10.5" cy="10.5" r="6" />
                  <path d="m15 15 5 5" />
                  <path d="M10.5 8v5M8 10.5h5" />
                </svg>
              </span>
              <span className="landing-card-number">03</span>
            </div>
            <h2>Dễ tìm lại khi cần</h2>
            <p>Tìm kiếm dễ dàng theo tiêu đề, ngày, địa điểm hoặc một chi tiết trong câu chuyện.</p>
          </article>
        </section>
      </section>
    </div>
  );
}
