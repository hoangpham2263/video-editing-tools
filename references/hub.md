# Cutly

Web: https://hoangpham.is-a.dev/review-video/ (mã nguồn `docs/`, không cần mật khẩu). Người quay tạo sản phẩm và up source trên web; AI lấy source về dựng rồi up thành phẩm; người đăng tải về đăng.

## Lưu trữ

Google Drive qua Worker `tools-hub-api` (repo `hoangpham2263/tools-hub`, file `worker/review.js`):

```text
Tools Hub/Review Video/
├── Sản phẩm/<mã>/Source/      video quay
├── Sản phẩm/<mã>/Kết quả/     video thành phẩm + ảnh bìa
└── Video mẫu/<mã>/            video tham khảo để phân tích style
```

- Danh sách sản phẩm nằm trong 1 khoá KV của Worker; file ở Drive, giữ nguyên chất lượng, tối đa 5 GB/file.
- Up: Worker mở phiên upload, CLI/trình duyệt gửi thẳng lên Google.
- Xoá chỉ đưa vào thùng rác Drive (khôi phục trong 30 ngày).

## Trạng thái

| Mã | Hiện | Ai đổi |
|---|---|---|
| `new` | Chờ edit | mặc định khi tạo |
| `done` | Đã edit | tự đổi khi `push` thành phẩm |
| `posted` | Đã đăng | người đăng |

## Lệnh `node scripts/hub.mjs`

| Lệnh | Việc |
|---|---|
| `list` | danh sách sản phẩm (mã, trạng thái, số file) |
| `show <mã>` | ghi chú + file source/kết quả |
| `create "<tên>" ["ghi chú"]` | tạo sản phẩm, in ra mã |
| `pull <mã> [thư-mục]` | tải source về `work/<mã>/source/` + `note.txt` |
| `push <mã> <file...>` | up thành phẩm (→ Đã edit) |
| `push-source <mã> <file...>` | up source từ máy |
| `status <mã> <new\|done\|posted>` | đổi trạng thái |
| `samples` | danh sách video mẫu |
| `create-sample "<tên>"` | tạo mục video mẫu |
| `type <mã> <product\|sample>` | đổi loại (tự chuyển thư mục Drive) |

Video mẫu @thokunrw: `video-mau-thokunrw-phan-tich-style-o3e6` (`pull` về để phân tích style khi cần).
