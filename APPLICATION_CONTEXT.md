# APPLICATION_CONTEXT — Our Journey

Ngày chốt: 30/10/2026. Repo: https://github.com/zaabinh/our-journey
Đọc tài liệu này trước FRONTEND_IMPLEMETATION.md (giữ đúng tên file người dùng yêu cầu).

## 1. Mục tiêu và phạm vi hiện tại
Our Journey là nơi cặp đôi, gia đình và nhóm bạn lưu giữ kỷ niệm trong album riêng tư; mời thành viên bằng liên kết hoặc mã. Chủ dự án làm một mình với Codex. Ưu tiên hiện tại: chuẩn hóa frontend, bảo toàn dữ liệu và kiểm thử từng phần. Không coi thời hạn trong ngày là lý do bỏ kiểm thử hoặc tuyên bố hoàn tất khi còn lỗi.

Đợt này triển khai React + TypeScript + Vite, cấu trúc trang/component, các luồng UI có local repository và dữ liệu giả an toàn để kiểm thử. Không triển khai backend thật, PostgreSQL, R2, đăng nhập bảo mật hay đồng bộ nhiều thiết bị trong đợt này. Các luồng tài khoản/lời mời/quyền chạy local phải được ghi rõ là demo; không tuyên bố đó là bảo mật thực tế.

Đích tích hợp: FastAPI + PostgreSQL trên Render, React trên Vercel. R2 private là phương án lưu media được đề xuất, chưa được coi là tài khoản đã thiết lập hay dịch vụ đã được người dùng cho phép trả phí. Metadata thuộc PostgreSQL; media có thể chuyển sang R2 khi triển khai backend.

## 2. Hiện trạng đã đọc, cần kiểm tra lại trước thực hiện
Snapshot đã kiểm tra: main, commit 76342554ba4213a53bafbc274169c3629ebf3a68. Đây là bằng chứng lịch sử, không phải chỉ dẫn reset về commit đó.
- HTML/CSS/JS thuần: index.html, album.html, login_page.html, signup_page.html, profile.html; script.js, auth.js, db.js.
- script.js dùng IndexedDB PhotoGallery v1 với images và metadata. db.js có một cơ chế initDB khác; kiểm tra script thực sự được nạp trước khi thay đổi.
- auth.js lưu users/session trong localStorage, mật khẩu dạng rõ. Không chuyển cơ chế này thành auth production, không xuất mật khẩu vào tài liệu/log/fixture.
- Metadata thấy trong code: id, title, date, location, note, owner, order, animations; images có thể là data URL hoặc đường dẫn. Không giả định mọi JSON có cùng schema.
- assets/img có ảnh, JSON chính khoảng 96 MB, JSON recovery khoảng 16,5 MB và ZIP khoảng 45,8 MB. Chưa xác minh nội dung đầy đủ, số lượng hoặc quan hệ trùng giữa các nguồn.
- album.html có link home.html trong khi cây repo đã đọc chỉ có index.html.
- Snapshot có một nhánh main, chưa bảo vệ; không có PR/issue; Actions chỉ có Pages deployment. Không suy ra test đã pass từ deployment thành công.

## 3. Quy tắc dữ liệu bắt buộc
Dữ liệu thật phải được giữ nguyên, sao lưu và có khả năng phục hồi; không push lại lên GitHub, không đưa vào public/, bundle, CI artifact, screenshot công khai hoặc fixture.

Dữ liệu trình duyệt gắn với origin (scheme/host/port). Đổi sang localhost/Vite/domain mới không tự nhìn thấy IndexedDB cũ. Nếu không truy cập được origin đang chứa dữ liệu, yêu cầu người dùng xuất bằng công cụ trên origin cũ; tiếp tục làm frontend bằng fixture nhưng đánh dấu migration thật đang chờ. Không kết luận đã sao lưu toàn bộ chỉ từ nội dung repo.

Tạo bản sao riêng ngoài working tree và bản phục hồi đã thử trước khi bỏ tracking bất kỳ dữ liệu nào. Dùng .private-data/ (ignored) cho bản làm việc/import nếu cần; không dùng đây làm bản backup duy nhất. Manifest riêng gồm đường dẫn, số byte, SHA-256, số record, số ảnh, nguồn, lỗi. Không đưa tên người dùng/nội dung kỷ niệm vào báo cáo công khai.

.gitignore không loại bỏ file đã tracked. Sau khi xác minh backup mới dùng git rm --cached với danh sách đường dẫn cụ thể đã phân loại; không xóa dữ liệu trên đĩa. Giữ logo, font, icon được phép chia sẻ. Không ignore tất cả JSON/ảnh làm mất cấu hình và asset giao diện. Chặn JSON chứa base64, exports, backups, ZIP dữ liệu và ảnh cá nhân trong staged diff/CI.

Dữ liệu đã nằm trong lịch sử Git vẫn tồn tại sau khi bỏ tracking. Không tự rewrite history/force-push; báo rõ giới hạn và tách xử lý lịch sử thành việc cần quyết định riêng. Không tự public/deploy dữ liệu thật.

## 4. Mô hình sản phẩm
User; Album; AlbumMember; Invite; Memory; Photo; Comment; Reaction.
- Memory thuộc một album, có nhiều Photo theo thứ tự; lưu ngày kỷ niệm dạng date-only, không tự dịch ngày theo timezone.
- Album có owner duy nhất trong bản đầu. Không cho owner rời/hạ quyền chính mình nếu chưa có luồng chuyển chủ sở hữu.
- Owner: quản lý album/thành viên/lời mời, tạo và sửa/xóa mọi kỷ niệm; xóa bình luận vi phạm nhưng không sửa lời của người khác.
- Contributor: xem, tạo kỷ niệm/bình luận/cảm xúc; sửa/xóa nội dung mình tạo.
- Viewer: chỉ xem, không bình luận/cảm xúc.
- Invite chứa vai trò contributor hoặc viewer, thời hạn, thu hồi. Tham gia lại không tạo thành viên trùng. Lời mời không được cấp owner.
- Reaction: mặc định một cảm xúc mỗi user/memory; bấm lại bỏ, chọn loại khác thay thế. Bộ cảm xúc nhỏ nhất quán.
- Bình luận văn bản thuần, không render HTML tùy ý; chỉnh sửa hiển thị trạng thái đã chỉnh sửa.
- Xóa album/kỷ niệm cần xác nhận rõ phạm vi; không báo thành công trước khi lưu thành công.

## 5. Giao diện
Giữ thương hiệu Our Journey, logo, màu, font và cảm giác ấm áp của bản hiện tại; phải inspect CSS/render hiện tại để lấy token. Không được tự thay đổi phong cách hoặc các thiết kế cốt lõi nếu chưa hỏi.

Routes dự kiến: /, /login, /signup, /albums, /albums/:albumId, /albums/:albumId/memories/:memoryId, /albums/:albumId/settings, /join/:token, /profile. Hỗ trợ trạng thái not-found/forbidden; liên kết cũ có hướng chuyển tiếp phù hợp khi triển khai.

Dùng lại AppShell, Button, Input, Textarea, Dialog/Sheet, Dropdown, Avatar, AlbumCard, MemoryCard, PhotoGrid, PhotoViewer, UploadField, EmptyState, Skeleton, Alert, ConfirmDialog, CommentList, ReactionBar.

Responsive là thay đổi bố cục theo không gian, không chỉ thu nhỏ desktop. Phone dùng form/sheet vừa màn hình; tablet tối ưu cột; desktop có giới hạn chiều rộng đọc. Không ép chiều cao khiến nội dung bị cắt, không phụ thuộc hover. Label rõ, keyboard navigation, focus hiển thị, target tối thiểu 44x44 CSS px cho thao tác chính; màu chữ đạt WCAG AA; hỗ trợ reduced motion.

## 6. Ranh giới kiến trúc
Page/component không đọc trực tiếp localStorage/IndexedDB hoặc import JSON dữ liệu thật. Gọi repository interface async; local adapter lưu IndexedDB mới có version riêng, HTTP adapter bổ sung ở giai đoạn backend. Không thay đổi hoặc clear database cũ.

Các domain type và DTO có mapping rõ. Photo lưu Blob + metadata khi chạy local; object URL chỉ tạo để hiển thị và phải revoke, không persist blob: URL. Trạng thái loading/error/empty/retry và save-pending phải có.

Mock account chỉ là identity/role selector phục vụ demo/test. Không lưu mật khẩu thật, không nhúng R2 secret trong VITE_*; biến frontend đều có thể bị đọc. Quyền UI chỉ phục vụ UX; backend tương lai phải kiểm tra độc lập.

## 7. Thành công của đợt frontend
Các luồng chạy local và giữ dữ liệu qua reload; UI nhất quán trên phone/tablet/desktop; dữ liệu cũ được bảo toàn hoặc có trạng thái blocked minh bạch; không có dữ liệu thật trong commit/build; test theo phase có bằng chứng. Backend/R2, bảo mật production và đồng bộ nhiều thiết bị là hạng mục tương lai, không ghi đã hoàn thành.
