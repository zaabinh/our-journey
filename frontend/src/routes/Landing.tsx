import { Link } from 'react-router-dom';

export function Landing() {
  return <div className="landing-page"><section className="landing-hero" aria-labelledby="landing-title">
    <div className="landing-copy"><span className="landing-kicker"><img src="/brand/love.png" alt="" /> OUR JOURNEY</span>
      <h1 id="landing-title">Giữ lại những điều mình muốn nhớ.</h1>
      <p className="landing-lede">Một không gian ấm áp cho ảnh, câu chuyện và những khoảnh khắc làm nên hành trình của chúng mình.</p>
      <div className="landing-actions"><Link className="button primary landing-signup-cta" to="/signup" aria-label="Bắt đầu lưu giữ hành trình của bạn."><span className="landing-signup-copy" aria-hidden="true"><span className="landing-signup-label landing-signup-label-default">Bắt đầu lưu giữ hành trình của bạn.</span><span className="landing-signup-label landing-signup-label-hover">Chuyển tới trang đăng ký</span></span><span className="landing-signup-arrow" aria-hidden="true">→</span></Link><Link className="button secondary" to="/login">Đã có tài khoản</Link></div>
    </div>
    <div className="landing-visual" aria-hidden="true"><div className="landing-sun"/><div className="landing-orbit landing-orbit-back"/><div className="landing-orbit landing-orbit-front"/><div className="landing-photo-card landing-photo-back"><div className="landing-photo-placeholder"><span>OUR</span><span>JOURNEY</span></div><div className="landing-card-caption">Những ngày bên nhau</div></div><div className="landing-photo-card landing-photo-front"><div className="landing-brand-stamp"><img src="/brand/love.png" alt=""/></div><span className="landing-heart-mark">♡</span><p>từng khoảnh khắc<br/>đều đáng nhớ</p></div><div className="landing-sparkle sparkle-one">✦</div><div className="landing-sparkle sparkle-two">✧</div></div>
    <section className="landing-highlights" aria-label="Điểm nổi bật"><article><span className="landing-highlight-icon">01</span><h2>Một nơi cho mọi câu chuyện</h2><p>Tạo album riêng cho những kỷ niệm, chia sẻ với những người thân thuộc.</p></article><article><span className="landing-highlight-icon">02</span><h2>Ảnh đi cùng ký ức</h2><p>Thêm ảnh, ngày tháng, địa điểm và lời kể cho từng kỷ niệm. Cùng mọi người bình luận, bày tỏ cảm xúc.</p></article><article><span className="landing-highlight-icon">03</span><h2>Dễ tìm lại khi cần</h2><p>Tìm kiếm dễ dàng theo tiêu đề, ngày, địa điểm hoặc một chi tiết trong câu chuyện.</p></article></section>
  </section></div>;
}
