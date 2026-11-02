import { Link } from 'react-router-dom';
import { version } from '../../package.json';

// Destinations without a route yet render as text, never as dead links.
type Item = { label: string; to?: string };
const columns: { title: string; items: Item[] }[] = [
  {
    title: 'Điều hướng',
    items: [
      { label: 'Trang chủ', to: '/' },
      { label: 'Album', to: '/albums' },
      { label: 'Dòng thời gian' },
      { label: 'Tạo kỷ niệm', to: '/albums' },
    ],
  },
  {
    title: 'Hỗ trợ',
    items: [{ label: 'Hướng dẫn sử dụng' }, { label: 'Câu hỏi thường gặp' }, { label: 'Phản hồi' }],
  },
  {
    title: 'Pháp lý',
    items: [{ label: 'Chính sách bảo mật' }, { label: 'Điều khoản dịch vụ' }],
  },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <Link to="/" className="site-footer-logo">
            <img src="/brand/love.png" alt="" width="36" height="36" />
            <span>Our Journey</span>
          </Link>
          <p>Lưu giữ từng khoảnh khắc, kể trọn vẹn câu chuyện của chúng mình.</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2>{column.title}</h2>
            <ul>
              {column.items.map((item) => (
                <li key={item.label}>
                  {item.to ? (
                    <Link to={item.to}>{item.label}</Link>
                  ) : (
                    <span className="site-footer-soon">
                      {item.label} <small>Sắp ra mắt</small>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} Our Journey. All rights reserved.</span>
        <span>v{version}</span>
      </div>
    </footer>
  );
}
