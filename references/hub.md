# Review Hub

Nơi chung giữa **người quay** và **người dựng** video review sản phẩm.

```text
Người quay:  tạo sản phẩm (tên + ghi chú) → tải source lên
Người dựng:  lấy source → dựng (skill review-video) → tải video kết quả lên (nhiều video được)
Người quay:  xem, tải video kết quả về đăng → đổi trạng thái "Đã đăng"
```

Trạng thái: **Chờ dựng → Đang dựng → Có kết quả → Đã đăng**.

- Web: https://hoangpham.is-a.dev/review-video/ (GitHub Pages, thư mục `docs/`). Dùng được trên điện thoại.
- Máy chủ: Cloudflare Worker (`worker/`) + R2 lưu file. File giữ nguyên từng byte, không bị nén lại.
- File lớn (video 4K vài trăm MB) được chia phần 50 MB khi tải lên.
- Link tải/xem có chữ ký, hết hạn sau 6 giờ.

## Dùng

Mở web → **Cài đặt** → nhập địa chỉ máy chủ và mã truy cập (người dựng gửi riêng). Mã chỉ lưu trong trình duyệt đó.

## Cài máy chủ (làm 1 lần)

1. Bật R2 trong Cloudflare Dashboard (R2 Object Storage). Gói miễn phí 10 GB, không tính phí tải về.
2. Trong `worker/`:
   ```bash
   npm install
   npx wrangler r2 bucket create review-hub
   npx wrangler secret put HUB_KEY      # dán mã truy cập
   npx wrangler deploy
   ```
3. Ghi địa chỉ Worker vào `docs/config.js` (`HUB_DEFAULT_URL`) để người dùng chỉ cần nhập mã.

Chạy thử trên máy: `worker/.dev.vars` chứa `HUB_KEY=...`, rồi `npx wrangler dev` và mở `docs/index.html` qua một server tĩnh.

## API

Header `Authorization: Bearer <HUB_KEY>`.

| Lệnh | Đường dẫn |
|---|---|
| Danh sách / tạo | `GET` / `POST /api/products` `{name, note}` |
| Chi tiết / sửa / xoá | `GET` / `PATCH` / `DELETE /api/products/<slug>` |
| Xoá file | `DELETE /api/products/<slug>/<source\|result>/<tên>` |
| Link tải | `POST /api/sign` `{slug, kind, name}` → `{url}` |
| Tải lên | `POST /api/upload/<slug>/<kind>/<tên>?action=create` → `PUT ...?action=part&uploadId=&part=N` → `POST ...?action=complete` `{uploadId, parts}` |

Dữ liệu trong R2: `p/<slug>/meta.json`, `p/<slug>/source/*`, `p/<slug>/result/*`.

Khi đã đăng xong, xoá sản phẩm để giải phóng dung lượng.
