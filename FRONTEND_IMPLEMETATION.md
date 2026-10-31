# FRONTEND_IMPLEMETATION — Kế hoạch thực thi cho Codex

Đọc APPLICATION_CONTEXT.md trước. Tên file giữ đúng yêu cầu. Mục tiêu: thực hiện chuẩn hóa frontend, không chỉ đề xuất lại kế hoạch. Làm tuần tự theo phase, mỗi phase có implementation, kiểm thử, sửa lỗi và báo cáo trước khi tiếp tục.

## 0. Hợp đồng làm việc
- Đọc AGENTS.md và trạng thái Git trước khi sửa. Không reset/stash/xóa thay đổi của người dùng; dùng branch riêng feat/frontend-standardization khi phù hợp.
- Kiểm tra HEAD thực tế, dependency/lockfile và script hiện có. Chọn version tương thích lúc thực hiện; không tùy tiện dùng latest hoặc trộn package manager. Một lockfile được commit.
- Không cần hỏi lại những quyết định đã chốt. Chỉ hỏi khi thiếu nguồn dữ liệu thật, mapping owner mơ hồ hoặc thao tác không thể phục hồi.
- Không tự push, merge, deploy, mua dịch vụ, rewrite history. Có thể chuẩn bị commit theo phase nếu được giao quyền commit; luôn kiểm tra staged diff trước.
- Không skip test để đạt thời hạn. Khi thiếu browser/runtime, ghi NOT RUN và lý do; không thay bằng nhận xét “có vẻ ổn”.
- Cập nhật docs/FRONTEND_PROGRESS.md bằng dữ liệu không nhạy cảm: phase, changed files, lệnh chạy, kết quả, lỗi còn lại, bước tiếp theo. Ảnh QA dùng fixture giả, báo cáo migration thật ở ngoài Git.

## Phase 0 — Audit và đóng băng nguồn dữ liệu
Đầu vào: repo hiện tại và quyền đọc dữ liệu local có sẵn.
1. Kiểm tra git status, branch/HEAD, cây file, HTML/CSS/JS và các điểm lưu/đọc dữ liệu. Lập danh sách chức năng hiện có để tránh làm mất chức năng.
2. Chạy bản cũ local, ghi nhận visual ở phone/tablet/desktop bằng fixture; trích token màu/font/spacing từ CSS thực tế.
3. Kiểm kê assets, JSON chính, recovery, ZIP. Không giả định recovery mới hơn hoặc đầy đủ hơn. Kiểm tra archive an toàn, tránh path traversal khi giải nén.
4. Sao chép dữ liệu thật ra ngoài repo; tạo manifest SHA-256, thử đọc/giải mã và phục hồi từ bản sao.
5. Xác định dữ liệu chỉ còn ở IndexedDB/localStorage của origin cũ. Hướng dẫn export trên origin đó nếu không tự truy cập được. Chỉ xuất profile không nhạy cảm; loại mật khẩu/session.
Kiểm thử/gate: hash bản sao khớp nguồn; nguồn không bị thay đổi; báo cáo số file/record/ảnh đọc được và nguồn còn thiếu. Nếu thiếu browser export, chặn xóa/di chuyển dữ liệu gốc, vẫn có thể tiếp tục các phase giao diện với fixture.

## Phase 1 — Tách dữ liệu khỏi Git và nền tảng React
1. Sau gate backup, thêm ignore chính xác cho đường dẫn dữ liệu thật đã kiểm kê, .private-data/, exports/backups, .env (ngoại trừ .env.example không có secret), output QA riêng và build output.
2. Bỏ tracking bằng git rm --cached chỉ trên danh sách dữ liệu đã sao lưu; giữ bản local. Không ignore toàn bộ assets hoặc *.json. Kiểm tra cả file ảnh, ZIP và JSON recovery.
3. Khởi tạo frontend/ React + TypeScript strict + Vite; React Router, CSS tokens, Vitest + Testing Library, Playwright. Dùng thư viện accessible dialog nếu phù hợp; không viết framework UI riêng.
4. Tổ chức src/app, src/routes, src/components/ui, src/features/{auth,albums,memories,members,comments,profile}, src/domain, src/data/{local,http}, src/styles; scripts/ dành cho kiểm tra/import.
5. Cài lint, typecheck, unit test, build; cấu hình CI chỉ dùng fixture tổng hợp. Public chỉ chứa asset giao diện an toàn, không có alias/copy toàn bộ assets cũ.
Kiểm thử/gate: cài từ lockfile trên checkout sạch chạy được lint/typecheck/test/build; kiểm tra git ls-files, staged diff và dist không chứa dữ liệu thật. Thêm kiểm tra tự động chặn các đường dẫn private và data:image/...; allowlist asset giao diện có chủ ý. Không coi scanner là bằng chứng tuyệt đối: vẫn xem diff.

## Phase 2 — Design system và AppShell
1. Chốt token có nguồn từ bản cũ; chuẩn hóa button/input/textarea/card/dialog/menu/toast/skeleton/empty-state/avatar/confirm-dialog.
2. AppShell có navigation active, mobile navigation, vùng nội dung, trang 404. Chuẩn hóa typography, spacing, radius và trạng thái hover/focus/disabled/error.
3. Dialog trap focus, Escape đóng khi an toàn, trả focus về trigger; khóa scroll đúng; thông báo live region vừa đủ. Form bẩn có cảnh báo khi bỏ thay đổi.
Kiểm thử/gate: component tests theo hành vi, bàn phím/tab/Enter/Escape, label/accessible name, validation; inspect screenshot 390/768/1440px, không overflow ngang. UI giữ được nhận diện bản cũ.

## Phase 3 — Domain và local repository bảo toàn dữ liệu
1. Khai báo entity/ID ổn định, role policy và repository async cho album/member/invite/memory/photo/comment/reaction/profile. Tách logic quyền dùng lại, không phân tán điều kiện string khắp JSX.
2. Local adapter dùng IndexedDB database mới, schema version mới; fixture tổng hợp có owner/contributor/viewer/outsider. Không đọc hoặc ghi đè DB PhotoGallery v1 trong luồng khởi tạo.
3. Viết import dry-run cho dữ liệu legacy: nhận JSON/data URL/file mapping do người dùng chọn; validate kiểu/giới hạn, giữ date-only, order, note, animations và legacy ID. Trường không hỗ trợ vẫn giữ trong migration payload, không âm thầm bỏ.
4. Xử lý ảnh bằng Blob, checksum nội dung; báo file thiếu/path không an toàn/base64 lỗi. Không tự truy cập URL bất kỳ từ JSON. Trùng ảnh có thể tái dùng blob nhưng giữ mọi quan hệ và kỷ niệm.
5. Import theo batch có transaction/checkpoint; không clear dữ liệu đích. Chạy lại idempotent theo nguồn + legacy ID; conflict cùng ID khác nội dung phải báo, không tự ghi đè. Mapping owner cần xác nhận khi mơ hồ.
6. Có export/restore của schema mới kèm version và manifest. Không hứa trình duyệt là backup bền vững; báo lỗi quota và giữ dữ liệu cũ khi lưu thất bại.
Kiểm thử/gate: test legacy fixture: nhiều ảnh, thiếu owner, ngày không hợp lệ, trùng ID/ảnh, thiếu file, JSON lỗi, quota/write failure, import lần hai. Restore sang DB trống khớp record/ảnh/checksum/thứ tự; reload còn dữ liệu. Fixture toàn bộ là giả.

## Phase 4 — Trang và luồng cốt lõi
1. Landing giữ phong cách; login/signup/profile có form validation và trạng thái chờ/lỗi. Adapter demo không lưu password; UI hiển thị rõ môi trường local/demo.
2. Danh sách album: tạo/sửa, cover, empty state; chi tiết album có tìm kiếm title/date/location/note, sort và pagination hoặc load-more có giới hạn.
3. Form kỷ niệm: nhiều ảnh, preview/reorder/remove, title/date/location/story, giữ hiệu ứng cũ nếu có. Validate trước lưu; chặn submit lặp; giữ input khi lỗi.
4. Photo viewer: next/previous, bàn phím, close, ảnh lỗi; thumbnail lazy-load, kích thước/aspect-ratio ổn định; không decode toàn bộ ảnh gốc lúc mở grid.
5. Sửa/xóa theo quyền; xác nhận trước xóa. Reorder khi đang search chỉ thay đổi thứ tự các item mục tiêu, không loại mất item bị filter.
Kiểm thử/gate: E2E tạo album → thêm kỷ niệm nhiều ảnh → reload → tìm kiếm → sửa → đổi thứ tự → xóa có cancel/confirm. Kiểm tra dữ liệu không mất khi filter/reorder, form lỗi và reload trang deep link.

## Phase 5 — Lời mời, thành viên, bình luận và cảm xúc
1. UI tạo lời mời contributor/viewer, copy link/mã, expiry/revoke, join, already-member, invalid/expired/revoked và forbidden.
2. Demo chỉ mô phỏng trong cùng local datastore; cross-device invitation chưa hoạt động cho tới backend. Không làm link trông production-ready rồi im lặng lỗi ở thiết bị khác.
3. Quản lý thành viên, đổi quyền, remove/leave với bảo vệ owner duy nhất. Chuyển identity demo phải cập nhật quyền và nội dung ngay.
4. Bình luận: thêm/sửa/xóa của mình, owner được xóa; hiển thị nội dung dài, unicode và plain text an toàn. Cảm xúc toggle/replace, không tăng count khi bấm lặp.
Kiểm thử/gate: role matrix đủ owner/contributor/viewer/outsider với cả deep link. Test invite expiry/revoke/rejoin, role downgrade, remove member, comment ownership và reaction uniqueness. Ghi rõ các test này kiểm tra logic local/UX, chưa chứng minh bảo mật server.

## Phase 6 — Responsive, accessibility và hồi quy
Viewport tối thiểu: 360x800, 390x844, 412x915, 768x1024, 1024x768, 1440x900; thêm zoom 200% và giảm chuyển động.
- Kiểm tra tất cả routes chính: không tràn ngang, chữ/nút không cắt, form/dialog cuộn được, thanh điều hướng không che thao tác, bàn phím ảo không làm mất nút submit.
- Kiểm tra nội dung dài, album rỗng, nhiều ảnh, ảnh portrait/landscape, lỗi tải, loading, forbidden, thao tác lưu thất bại.
- Kiểm thử keyboard và automated accessibility bằng axe; không còn lỗi serious/critical trên routes kiểm tra. Automated scan không thay kiểm tra bàn phím.
- Playwright Chromium + WebKit, Firefox nếu môi trường hỗ trợ; ghi rõ browser thực chạy. Screenshot chỉ fixture, kiểm tra trực quan trước khi nhận baseline; không blind update snapshots.
- Dùng fixture 200 kỷ niệm để kiểm tra grid bounded/pagination, không tải tất cả originals; revoke object URL khi thay ảnh/unmount. Không tuyên bố số đo performance nếu chưa đo.
Gate: lỗi chặn luồng, mất dữ liệu, quyền sai, overflow hoặc focus không dùng được phải được sửa; các hạn chế khác có danh sách rõ.

## Phase 7 — Bàn giao và kiểm tra sạch
1. Chạy toàn bộ lint, typecheck, unit/integration, E2E, production build từ clean install. Script tên thống nhất: npm run lint; npm run typecheck; npm run test -- --run; npm run test:e2e; npm run build. Nếu dùng package manager khác, cập nhật hướng dẫn tương ứng.
2. Kiểm tra preview production và routing fallback cho Vercel; chuẩn bị config nhưng không deploy khi chưa được giao. Môi trường preview chỉ dùng dữ liệu tổng hợp.
3. Kiểm tra staged files, tracked files, dist, source map và CI upload paths không chứa media/JSON thật hoặc secrets. Assets cũ không được vô tình copy từ repo root vào build.
4. README hướng dẫn chạy, local/demo mode, nhập dữ liệu qua file picker, backup/restore, hạn chế auth/sync và điểm nối HTTP adapter.
5. Tổng kết phase và bằng chứng test. Ghi rõ backup browser thực đã có hay chưa; việc bỏ tracking không xóa lịch sử Git. Không tuyên bố dữ liệu thật đã được bảo toàn nếu chỉ test fixture.
Gate cuối: clean checkout chỉ cần source + fixture để chạy; mọi phase PASS hoặc nêu BLOCKED cụ thể; không có production claim cho mock; dữ liệu thật có backup/restore được kiểm chứng trước khi bỏ bản gốc.

## Mẫu báo cáo mỗi phase
- Phase / commit SHA nếu có:
- Đã thực hiện / file thay đổi:
- Kiểm thử: lệnh, kết quả, số test, browser/viewport đã chạy:
- Dữ liệu: nguồn đã backup/đối chiếu (chỉ số tổng hợp):
- Lỗi hoặc giới hạn còn lại:
- Kết luận PASS / FAIL / BLOCKED và bước tiếp:

## Prompt bắt đầu
Đọc APPLICATION_CONTEXT.md và FRONTEND_IMPLEMETATION.md. Kiểm tra AGENTS.md, repo và dữ liệu thực tế; thực hiện Phase 0 trước. Tiếp tục tuần tự các phase có đủ điều kiện, kiểm thử và sửa lỗi trước khi chuyển phase. Nếu thiếu export trình duyệt, giữ dữ liệu gốc, ghi blocker và tiếp tục phần frontend độc lập bằng fixture. Không push dữ liệu thật, không tự rewrite history hoặc deploy. Báo tiến độ ngắn theo mẫu và bàn giao bằng chứng kiểm thử.
