# Our Journey frontend

Chạy riêng frontend mới, dùng dữ liệu tổng hợp. Bản HTML cũ và dữ liệu thật được giữ nguyên tại root, không được copy vào public hay build.

Yêu cầu Node >=22.12 (đã kiểm tra bằng Node 24.11.0), npm; dùng duy nhất package-lock.json này.

```sh
cd frontend
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test -- --run
npm run test:e2e
npm run build
npm run preview
```

Playwright chạy Chromium, WebKit và Firefox; máy mới có thể cài bằng `npx playwright install chromium webkit firefox`. WebKit dùng profile persistent riêng vì WebKit private/ephemeral không hỗ trợ lưu Blob vào IndexedDB; đây là giới hạn engine được ghi trong báo cáo. Không tự mở public/deploy. `.qa/` chứa bằng chứng fixture local, không upload thành artifact.

Giao diện giữ palette/font hiện tại. Chuyển trang và mở dialog có fade/slide ngắn; hover nâng card/nút rất nhẹ. Mọi hiệu ứng bị tắt theo `prefers-reduced-motion: reduce`; không có thông tin hoặc thao tác chỉ truy cập được bằng hover.

Trạng thái migration: chưa có export IndexedDB từ browser/origin cũ, nên dữ liệu chỉ còn trong browser đó vẫn đang chờ. JSON chính có sẵn trong repo đã được nhập thử vào backup riêng, chỉ gồm 30 record và 57 ảnh; recovery được giữ để đối chiếu, không nhập lặp 14 ID. Backup nằm trong `.private-data/branch-import-20261031/our-journey-legacy-main.compact.backup.json` và có thể phục hồi tại Hồ sơ → Sao lưu và phục hồi dữ liệu local. Đây là dữ liệu local ignored, không thuộc source/build/Git. Ngày dạng văn bản được giữ nguyên, không tự suy luận. Không đổi/clear PhotoGallery v1 và không lấy password/session từ localStorage. Xem `../docs/FRONTEND_PROGRESS.md` để biết gate và giới hạn.

`npm run check:private` kiểm tra staged files + source/public. `node ../scripts/check-private.mjs --tracked` là gate release riêng, hiện cố ý FAIL vì 109 file legacy riêng tư vẫn tracked. Bỏ tracking đang chờ browser export; không xóa bản gốc và không rewrite history. Build chỉ có bốn asset thương hiệu được allowlist. Scanner chỉ là một lớp kiểm tra, vẫn phải review diff.

React/Vite/Vitest được pin và kiểm tra tương thích với runtime hiện tại, theo [Vite guide](https://vite.dev/guide/) và [Vitest guide](https://vitest.dev/guide/). Không dùng tag latest.
