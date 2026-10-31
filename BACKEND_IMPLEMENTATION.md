# BACKEND_IMPLEMENTATION — Our Journey

Ngày: 31/10/2026. Đọc APPLICATION_CONTEXT.md và FRONTEND_IMPLEMETATION.md trước. Tài liệu này mở giai đoạn backend; quy định “chưa triển khai backend” trong hai tài liệu trước chỉ áp dụng cho giai đoạn frontend. Giữ các quyết định sản phẩm và quy tắc bảo toàn dữ liệu.

## 1. Bằng chứng và giả định
GitHub zaabinh/our-journey kiểm tra ngày lập tài liệu: chỉ main ở 76342554ba4213a53bafbc274169c3629ebf3a68, vẫn HTML/CSS/JS và media/JSON trong assets. Chưa có bằng chứng React frontend đã hoàn tất; thay đổi local có thể chưa push. Không reset repo về snapshot này.

Kiểm tra working tree thực tế, AGENTS.md, frontend domain types/repository interfaces và docs/FRONTEND_PROGRESS.md nếu có. Backend có thể phát triển với contract tests trước khi frontend xong; chỉ xác nhận tích hợp khi có UI thực để chạy.

Stack đã chọn: React/Vercel, FastAPI/Render, PostgreSQL. Media: đề xuất R2 private, chưa xác minh tài khoản/bucket/credential hoặc chấp thuận chi phí. Phát triển local qua Storage interface với local adapter ngoài Git và fake adapter cho test; production cần object storage đã cấu hình. Không fallback sang ổ đĩa tạm khi R2 lỗi.

Mục tiêu: tài khoản thật, album riêng tư, lời mời, phân quyền, kỷ niệm nhiều ảnh, bình luận, cảm xúc, migration dữ liệu cũ và HTTP adapter frontend. Không thêm microservices, realtime, AI, video hoặc thanh toán. Không hứa hoàn tất trong một ngày nếu chưa biết trạng thái local và hạ tầng.

## 2. Kiến trúc vừa đủ
backend/app/{api,core,models,schemas,services,storage}; backend/alembic; backend/tests; backend/scripts. Router nhận request/response; service xử lý nghiệp vụ/transaction/policy; SQLAlchemy truy vấn PostgreSQL; Pydantic validate; Alembic quản lý schema. Dùng một FastAPI service và một PostgreSQL, một package manager Python có lockfile. Không tạo lớp generic repository nếu không giúp kiểm thử hoặc giảm lặp thực tế.

API /api/v1; JSON snake_case, UUID opaque, timestamp UTC có timezone; ngày kỷ niệm là PostgreSQL DATE và chuỗi YYYY-MM-DD, không đổi timezone. Có mapper DTO ↔ domain frontend. Lỗi thống nhất {error:{code,message,fields?,request_id}}, không có stack trace/secret. 401 chưa xác thực, 403 sai quyền trong album mình thấy, 404 tài nguyên không tồn tại hoặc ngoài phạm vi nhằm hạn chế lộ thông tin; 409 conflict, 422 validation, 429 rate limit, 503 storage/service unavailable.

List endpoints có cursor và limit tối đa, mặc định 20, tối đa 100; sort ổn định có ID tie-break. Search title/location/note và date được parse rõ, không concat SQL. OpenAPI là contract xuất ra; chỉ snapshot schema, không commit response dữ liệu thật.

## 3. Schema và các ràng buộc
| Bảng | Trường/ràng buộc chủ yếu |
|---|---|
| users | id, normalized email/username unique, display_name, password_hash, avatar_photo_id, status, created_at |
| sessions | id, user_id, token_hash unique, expires_at, revoked_at; không lưu token nguyên văn |
| albums | id, owner_id, title, description, cover_photo_id, version, deleted_at |
| album_members | album_id + user_id unique, role contributor/viewer, joined_at; owner lấy từ albums.owner_id |
| album_invites | album_id, token_hash/code_hash, role, expires_at, revoked_at, max_uses, used_count |
| invite_redemptions | invite_id + user_id unique để tham gia lại không tiêu hao lượt |
| memories | album_id, author_id, title, date, location, note, animations JSON, position, version, deleted_at |
| photos | memory_id hoặc avatar owner, uploader_id, object_key unique, thumbnail_key, mime, bytes, dimensions, checksum, position, status |
| comments | memory_id, author_id, body, edited_at, version, deleted_at |
| reactions | memory_id + user_id unique, kind; PUT cùng kind không nhân đôi |
| migration_items | source_namespace + legacy_id unique, input_hash, target_id, state; checkpoint import |
| storage_jobs | object key, action, attempts, next_attempt_at, state; retry cleanup qua command/worker |

Các FK/index phải theo đường truy vấn album/member/memory. Role/kind/status có CHECK hoặc enum được migration quản lý. Không lưu signed URL có hạn làm đường dẫn lâu dài.

Owner duy nhất lấy từ owner_id, không nhân đôi owner role trong membership. Chủ album không tự rời/đổi chủ trong bản đầu. Cover phải là photo ready trong chính album; kiểm tra khi đặt cover và khi xóa ảnh. Người bị loại khỏi album mất quyền ngay ở DB dù token đăng nhập vẫn còn hạn.

## 4. Auth và triển khai trình duyệt
Đề xuất session opaque ngẫu nhiên, hash trong DB, cookie HttpOnly + Secure ở production, thời hạn hữu hạn, rotate sau login; logout thu hồi session phía server. Hash mật khẩu Argon2id qua thư viện được duy trì; không viết crypto riêng, không import mật khẩu rõ/session mock.

Chốt đường truyền trước khi viết auth: ưu tiên browser gọi /api qua same-origin proxy đã kiểm thử trên Vercel → Render. Kiểm tra forward Cookie/Set-Cookie, host/domain cookie và routing deep-link; không giả định rewrite tự giải quyết mọi thứ. Cookie host-only, path=/; SameSite phù hợp same-origin. POST/PATCH/PUT/DELETE có CSRF token gắn session + kiểm tra Origin. Login cũng kiểm tra Origin; cấu hình local dev qua Vite proxy.

Nếu phải gọi Vercel → onrender.com trực tiếp: đó là cross-site, cần credentials, CORS allowlist chính xác, cookie SameSite=None; Secure và kiểm thử trên Safari/iOS vì chính sách third-party cookie có thể chặn. Nếu phương án này không chạy tin cậy, sửa topology bằng proxy/custom same-site domains; không đổi sang lưu token dài hạn trong localStorage cho xong.

Rate limit login/register/invite redemption theo IP + định danh đã chuẩn hóa; không khóa tài khoản vĩnh viễn. Bản nhỏ có thể dùng bucket có thời hạn trong PostgreSQL với atomic update; test 429 và Retry-After, xóa record hết hạn. In-memory limiter không đủ khi nhiều process/restart. Log che token/cookie/email nhạy cảm, không log URL mời đầy đủ.

## Phase B0 — Audit và API contract
- Kiểm tra local changes; ghi frontend đang ở phase nào. Bảo toàn dữ liệu như tài liệu frontend.
- Lập endpoint/DTO mapping từ UI/repository có thật; nếu chưa có, dùng các entity đã chốt và ghi adapter còn chờ.
- Chốt auth topology ở mục 4, role matrix, photo lifecycle, giới hạn file và chính sách xóa.
- Đề xuất giới hạn khởi đầu: 10 ảnh/kỷ niệm, 15 MiB/ảnh, JPEG/PNG/WebP; decoder kiểm tra định dạng thật và pixel limit. HEIC/AVIF có thông báo không hỗ trợ nếu chưa có decoder/test; bắt buộc thử upload trên iPhone.
- Định nghĩa API_ERRORS.md/API_CONTRACT.md và acceptance tests trước code các service.
Gate: contract có request/response/error và quyền cho mọi luồng; xác định rõ local/frontend và R2 blockers, không đoán đã deploy.

## Phase B1 — FastAPI, PostgreSQL và CI
- Tạo app/settings/env.example không secret; /health/live và /health/ready kiểm tra DB, timeout hữu hạn.
- Local PostgreSQL bằng Compose; SQLAlchemy transaction theo request/service, Alembic revision đầu.
- Pytest chạy PostgreSQL thật trong CI, không chỉ SQLite; lint/typecheck, test và OpenAPI compatibility.
Gate: tạo DB trống → migrate head → chạy test; migrate từ version trước trên fixture; transaction rollback khi lỗi; health không lộ config. Không dùng create_all thay Alembic ở production.

## Phase B2 — Auth và profile
API: POST /auth/register, /auth/login, /auth/logout; GET /auth/session, /auth/csrf; GET/PATCH /users/me. Avatar dùng cùng storage lifecycle nhưng kiểm tra user ownership.
- Chuẩn hóa email/username; password giữ nguyên không trim âm thầm, giới hạn độ dài; lỗi đăng nhập chung cho sai user/password.
- Session expiry/revoke, cookie flags, CSRF, input validation, rate limit. Không tin role/author_id từ request.
- Không public đăng ký rộng khi chưa có kế hoạch abuse/quota; bản đầu cho nhóm dùng thử kiểm soát. Password reset/email verification là backlog rõ ràng trước mở rộng công khai.
Gate: duplicate khác hoa/thường, request đồng thời, password biên, cookie thiếu/sai/hết hạn, logout replay, CSRF/Origin, 429 và DB restart. Frontend login/session/logout thực chạy trên topology đã chọn.

## Phase B3 — Album, thành viên và lời mời
API: GET/POST /albums; GET/PATCH/DELETE /albums/{id}; GET /albums/{id}/members; PATCH/DELETE /albums/{id}/members/{user_id}; POST /albums/{id}/leave; POST/GET /albums/{id}/invites; DELETE /albums/{id}/invites/{invite_id}; POST /invites/redeem (token hoặc code trong body).
- Create album transaction gán owner từ session. Contributor chỉ quản lý nội dung mình, viewer chỉ đọc; owner quản lý album/member/invite, không cấp owner qua invite.
- Token link entropy cao; code nhập tay đủ entropy + rate limit. Lưu hash, trả secret lúc tạo, không log; token trong trang join được bỏ khỏi address bar sau khi lấy, Referrer-Policy:no-referrer, không analytics bên thứ ba ở join.
- Redeem atomic khóa invite/check usage, expires/revoked; unique membership/redemption. Không tự nâng role thành viên cũ khi redeem lại; chủ album đổi quyền bằng endpoint riêng.
Gate: owner/contributor/viewer/outsider gọi API trực tiếp; tráo ID giữa hai album; invite hết hạn/thu hồi, redeem đồng thời gần max_uses; không loại/hạ quyền owner. Token hợp lệ không cho đọc ảnh trước khi join thành công.

## Phase B4 — Kỷ niệm và thứ tự
API: GET/POST /albums/{id}/memories; GET/PATCH/DELETE /memories/{id}; PUT /albums/{id}/memory-order; GET /memories/{id}/photos.
- Backend resolve resource → album → membership; không chỉ kiểm tra URL parent. Owner sửa/xóa mọi kỷ niệm; contributor chỉ nội dung mình. Giữ attribution author_id khi owner chỉnh sửa.
- Version/If-Match hoặc expected_version chặn silent overwrite; stale write trả 409. Reorder transactional, không drop bản ghi ngoài filter; API yêu cầu danh sách ID hợp lệ và version album.
- Tách draft khi upload ảnh; chỉ publish khi có ít nhất một ảnh ready, không hiển thị draft rỗng như kỷ niệm hoàn chỉnh.
Gate: CRUD, date-only, escaped text, invalid dates, pagination ổn định, filter/reorder không mất item, optimistic concurrency, tráo author_id/memory_id, draft failure.

## Phase B5 — Ảnh private và R2
Storage interface: put/get metadata/read/delete/sign_read; local fake và R2 adapter. Đợt đầu upload qua FastAPI để validate/thumbnail trước khi publish, chấp nhận tải backend cho quy mô nhỏ; direct presigned upload là tối ưu sau, cần quarantine/finalize riêng.
API: POST /memories/{id}/photos (multipart), DELETE /photos/{id}, POST /photos/{id}/read-url; tương tự avatar theo user. Response read-url chứa expires_at, Cache-Control:no-store.
- Check role trước nhận file lớn; giới hạn streaming/proxy request bytes, count, decoded pixels; không chỉ tin extension/Content-Type. Reject SVG/HTML và file giả ảnh; không fetch URL do client gửi.
- Sinh object key server-side; mọi thumbnail cũng private. Strip GPS/EXIF ở bản hiển thị. Bản gốc nếu giữ để bảo toàn phải có quyền đọc tương đương và chính sách download rõ.
- Trạng thái pending/ready/failed/deleting. DB và R2 không có chung transaction: ghi intent, upload, finalize; lỗi tạo cleanup job bền vững. Chỉ cấp URL cho ready; xóa logic chặn URL mới ngay, cleanup file retry idempotent. Không ghi xóa storage thành công khi chỉ xóa DB.
- Signed GET đề xuất 120 giây; kiểm tra quyền mới mỗi lần cấp. URL đã cấp còn dùng được tới hết hạn sau khi loại thành viên; ghi giới hạn đó, nếu cần thu hồi tức thì dùng authenticated proxy. Không log URL ký.
- Không dedupe cross-album theo cách lộ sự tồn tại ảnh; nếu share blob phải có reference counting để xóa không làm hỏng album khác.
Gate: bucket không public; outsider bị từ chối, role downgrade; URL expiry; upload sai loại/quá lớn/pixel bomb, R2 timeout, DB lỗi sau upload, retry cleanup và ready state. Fake storage tests không thay smoke test R2 thật; thiếu credential ghi BLOCKED phase production.

## Phase B6 — Bình luận và cảm xúc
API: GET/POST /memories/{id}/comments; PATCH/DELETE /comments/{id}; PUT/DELETE /memories/{id}/reaction; GET /memories/{id}/reactions (aggregate).
- Contributor sửa/xóa comment của mình; owner xóa của người khác, không sửa lời họ. Viewer không ghi. Plain text, độ dài hữu hạn, phân trang.
- PUT reaction đặt trạng thái đích idempotent, DELETE bỏ; UI bấm cùng loại thì DELETE. Unique user/memory, loại cảm xúc allowlist.
Gate: role/ownership/memory cross-album, nội dung rỗng/dài, concurrent PUT không tăng count sai, member removed mất đọc/ghi.

## Phase B7 — HTTP adapter và E2E thật
- Thay local repository bằng HTTP adapter qua config explicit; không tự fallback local khi API lỗi vì sẽ tạo dữ liệu lệch. Local demo vẫn tách riêng và không gửi fixture account lên production.
- Map DTO/error fields, session startup, 401/403/409/422/429/503, retry chỉ thao tác an toàn; mutation chống double submit, giữ form khi lỗi.
- Hai browser context hoặc hai thiết bị dùng cùng backend: owner tạo → mời contributor → đăng ảnh → comment/reaction → viewer chỉ xem → hạ quyền/loại thành viên.
Gate: Playwright UI/API dùng PostgreSQL + fake/local private storage trước; môi trường staging chạy R2 thật khi có. Reload/deep link, cookie Safari/iOS, mạng lỗi và signed URL hết hạn có refresh hợp lý, không retry vô hạn. Backend integration không được làm hỏng responsive tests frontend.

## Phase B8 — Migration dữ liệu thật
- Nhận JSON/assets và browser export, backup ngoài Git có SHA-256. Không giả định dữ liệu GitHub là toàn bộ. Không đưa media vào CI/build/deploy artifact.
- CLI dry-run → report tổng hợp → mapping owner/album → apply theo batch. Không suy ra user account từ username cũ nếu chưa đối chiếu; không chuyển password/session mock.
- Parse note/order/animations/date nguyên nghĩa; preserve legacy extras có schema/version. Missing/invalid ảnh vào report, không âm thầm skip rồi báo thành công.
- source_namespace+legacy_id+input_hash, checkpoint; rerun không nhân đôi. R2 object upload có checksum, publish sau validate; lỗi giữa chừng resume/cleanup an toàn.
- Migration batch có manifest các resource đã tạo để rollback đúng batch; không xóa dữ liệu người dùng mới hoặc blob được dùng lại. Backup/restore cần cả PostgreSQL và object storage.
Gate: so số kỷ niệm/ảnh, byte/checksum, thứ tự, ngày, owner và mở thử; rerun/resume test với fixture trước. Ghi rõ migration thật PASS hay chờ nguồn; giữ nguyên dữ liệu gốc đến khi đối chiếu xong.

## Phase B9 — Staging, vận hành và bàn giao
- Chuẩn bị Render/Vercel config và env matrix, migrations chạy một lần mỗi release, DB pool hữu hạn, TLS, CORS/Origin allowlist; không dùng wildcard credentials.
- Không lưu media lâu dài trên filesystem mặc định Render. Config thiếu storage thì fail readiness hoặc từ chối upload rõ ràng.
- Migration backward-compatible trước deploy app; backup trước migration thật, rollback app với schema tương thích, không coi downgrade SQL là phương án khôi phục duy nhất.
- JSON logs request_id, không secret/PII/media; lỗi storage và cleanup pending có theo dõi. Job cleanup chạy bằng cơ chế scheduled/worker có quyền thực thi đã chuẩn bị, không chỉ tạo bảng rồi để đó.
- Runbook: tạo backup DB + objects, restore diễn tập, xoay secret/session, xử lý upload pending, rollback release. CI fixtures only; kiểm tra git/staged/dist/log artifact không dữ liệu thật.
Gate: staging smoke từ thiết bị thật, restart/redeploy không mất data, backup restore sang môi trường riêng, có healthcheck và chủ dự án biết cách đọc lỗi. Chỉ deploy/push/migration production khi được giao quyền; chưa có tài khoản/secret thì hoàn tất config/tests local và nêu blocker.

## 5. Thứ tự và định nghĩa hoàn thành
B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9. Tích hợp từng lát nhỏ: auth ngay B2, album ngay B3, media ngay B5; B7 là hồi quy toàn hệ thống. Không chờ mọi endpoint xong mới nối UI. B8 có thể chuẩn bị dry-run sớm, nhưng apply sau khi storage/policy đã test.

Mỗi phase: viết các test acceptance/biên thích hợp trước → implement → test PostgreSQL thật → sửa lỗi → ghi bằng chứng → commit nếu được giao quyền. Không ép viết test phụ chỉ để tăng coverage. Không tự spawn subagent; làm tuần tự với Codex trừ khi người dùng yêu cầu khác.

docs/BACKEND_PROGRESS.md: phase, HEAD, thay đổi, test commands/results, browser thực chạy, migration state, PASS/FAIL/BLOCKED và next action. Không ghi dữ liệu riêng tư. Không báo test pass khi chưa chạy, không sửa assertions để hợp thức hóa bug.

Ưu tiên nếu thiếu thời gian: B0–B5 + tích hợp auth/album/media trước; B6 và phần còn lại tiếp theo, nhưng chưa gọi hệ thống hoàn chỉnh khi comment/reaction/migration còn thiếu. Lập ước lượng sau audit local; không tái dùng deadline “hôm nay” từ ngày trước.

## 6. Tài liệu tham chiếu chính thức
- FastAPI security/password hashing: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ (tham khảo hashing; dự án đề xuất opaque session thay vì mặc định JWT).
- Render FastAPI: https://render.com/docs/deploy-fastapi
- Render filesystem/deploy: https://render.com/docs/deploys
- R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

## Prompt bắt đầu cho Codex
Đọc APPLICATION_CONTEXT.md, FRONTEND_IMPLEMETATION.md, BACKEND_IMPLEMENTATION.md và AGENTS.md. Audit trạng thái repo/local/frontend hiện có, không reset thay đổi. Thực hiện B0 rồi lần lượt các phase đủ điều kiện; viết test hành vi và kiểm thử từng phần trước chuyển bước, tích hợp HTTP adapter sớm. Giữ dữ liệu thật ngoài Git, không tin quyền từ frontend, không dùng auth demo ở production. Hoàn tất local code/tests/config trước khi báo blocker tài khoản/R2/deploy; không tự push, mua dịch vụ hoặc chạy migration production. Cập nhật docs/BACKEND_PROGRESS.md bằng bằng chứng đã chạy.
