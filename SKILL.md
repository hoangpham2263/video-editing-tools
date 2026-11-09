---
name: review-video
description: Dựng video review sản phẩm TikTok Shop theo style @thokunrw (Remotion + ffmpeg) từ source quay thật, lấy source và đẩy video thành phẩm qua Video Editing Tools (Google Drive). Dùng khi người dùng nói "dựng video", "làm video review", "edit video sản phẩm", "lấy source", "có source mới", "đẩy video lên hub", hoặc gửi file .MOV/.MP4 sản phẩm.
---

# Review Video

Dựng video review dọc 9:16 giống mẫu @thokunrw: cảnh bìa có tiêu đề giấy xé, phụ đề gõ chữ, cắt thẳng ~3s/cảnh, không nhạc. Dựng xong, tự kiểm tra đạt thì **tự up thành phẩm lên Hub**, không cần chờ người dùng duyệt.

**Bắt buộc đọc trước:** [references/rules.md](references/rules.md). Hub và lệnh: [references/hub.md](references/hub.md). Số đo mẫu: [references/style-spec.md](references/style-spec.md).

## Thư mục

```text
SKILL.md
references/rules.md        quy tắc dựng (ưu tiên cao nhất), giọng phụ đề, ví dụ đã duyệt
references/hub.md          Video Editing Tools: Drive, trạng thái, lệnh hub.mjs
references/style-spec.md   số đo từ video mẫu
products/<mã>/cuts.txt     cảnh đã chọn của từng sản phẩm (commit vào repo)
products/<mã>/props.json   tiêu đề + danh sách cảnh + phụ đề (commit vào repo)
scripts/hub.mjs            lấy source / up thành phẩm (không cần mật khẩu)
scripts/build.sh           1 lệnh: cắt → render → ảnh bìa [→ up]
scripts/cut.sh             cắt + chỉnh màu + giữ khung gốc (build.sh gọi)
scripts/extras/            giọng đọc, nhạc tự tạo – chỉ khi được yêu cầu
template/                  dự án Remotion (composition "Review")
docs/                      web Video Editing Tools (GitHub Pages)
work/<mã>/source|out       file tạm của từng sản phẩm (gitignore, không commit)
```

`<mã>` luôn là mã sản phẩm trên Hub (vd `dep-suc-phoi-mau-zutaniq-z4pn`), dùng chung cho `products/`, `work/`, `template/public/clips/`.

## Quy trình (chạy trong thư mục skill)

1. **Lấy source**: `node scripts/hub.mjs list` → `node scripts/hub.mjs pull <mã>` (về `work/<mã>/source/`, kèm `work/<mã>/note.txt`).
   Người dùng gửi file trực tiếp: tạo sản phẩm `create "<tên>"`, chép file vào `work/<mã>/source/` và `push-source <mã> <file...>` để Hub có bản lưu.
2. **Xem source**: dải khung hình mỗi clip (`ffmpeg -i X -vf fps=4,scale=110:-2,tile=12x2 -frames:v 1 X.png`), ghi clip nào là bìa / mở hàng / chi tiết / có người, mốc giây từng hành động. Đọc màu, chất liệu, **tên thương hiệu** trên khung gốc, đối chiếu `note.txt`.
3. **Viết `products/<mã>/cuts.txt`** theo `rules.md`:
   ```text
   # file  bắt-đầu  độ-dài  tên-xuất  [zoom] [cx]
   IMG_3805.MOV 0.5 3.4 01_bia
   ```
4. **Viết `products/<mã>/props.json`** (mẫu: `products/dep-suc-phoi-mau-zutaniq-z4pn/props.json`): `title` 2 dòng, `shots[]` gồm `file: "clips/<mã>/<tên-xuất>.mp4"`, `duration`, `caption` (cảnh đầu không có caption), `music: null`, `sfx: true`.
5. **Dựng**: `zsh scripts/build.sh <mã>` → `work/<mã>/out/<mã>.mp4` và `<mã>_cover.png`.
6. **Tự kiểm tra** (bắt buộc trước khi up): xuất still giữa từng cảnh (`cd template && npx remotion still src/index.ts Review /tmp/f.png --props=../products/<mã>/props.json --frame=<n>`) và xem ảnh bìa. Đạt khi:
   - phụ đề khớp hình, đúng màu/chất liệu, không sai chính tả, tên thương hiệu IN HOA;
   - không cắt gần/phóng to, cảnh hành động không khựng ở đầu, không cảnh chỉ có chân (trừ khi người dùng chỉ định);
   - có 1–2 cảnh người thật nếu source có; giọng phụ đề tiết chế đúng `rules.md`.
   Chưa đạt thì sửa `cuts.txt`/`props.json` và chạy lại bước 5.
7. **Up thành phẩm**: `node scripts/hub.mjs push <mã> work/<mã>/out/<mã>.mp4 work/<mã>/out/<mã>_cover.png` (hoặc bước 5 với `--push`). Hub tự chuyển trạng thái "Đã edit"; web chỉ hiện video + ảnh bìa mới nhất nên up lại bản sửa là đủ.
8. **Báo người dùng**: link web sản phẩm `https://hoangpham.is-a.dev/review-video/#/p/<mã>`, tóm tắt cảnh và phụ đề đã dùng, mở `work/<mã>/out/`.
9. **Lưu cách dựng**: `products/<mã>/` là dữ liệu của repo – commit và push khi người dùng yêu cầu commit.

Người dùng góp ý: sửa `cuts.txt`/`props.json`, chạy lại `build.sh <mã> --push`. Quy tắc mới người dùng đưa ra thì thêm vào `references/rules.md`.

## Không làm

- Không thêm nhạc, giọng đọc, emoji, sticker nếu không được yêu cầu.
- Không commit `work/`, video, clip cắt (đã gitignore).
- Không đổi trạng thái "Đã đăng" – việc của người đăng.
