---
name: video-editing-tools
description: Dựng video ngắn dọc 9:16 cho TikTok, Reels, Shorts (Remotion + ffmpeg) từ source quay thật, theo cách dựng của một hoặc nhiều video mẫu (mặc định style review sản phẩm @thokunrw). Dữ liệu dự án lưu local trong workspace/projects/. Dùng khi người dùng nói "dựng video", "làm video review", "edit video", "tạo bản tương tự", "phân tích video mẫu", hoặc gửi file .MOV/.MP4.
---

# Video Editing Tools

Dựng video dọc 9:16 **tương tự video mẫu**: chỉ lấy CÁCH dựng (nhịp cắt, kiểu bìa, kiểu chữ và phụ đề, chuyển cảnh), không chép nội dung, logo hay nhạc của mẫu. Hiện bản dựng dùng kiểu @thokunrw (style.json mới dùng để ghi nhận cách dựng của mẫu, template chưa đổi theo): bìa giấy xé hồng, chữ gõ, phụ đề serif vàng viền nâu, cắt thẳng ~3s/cảnh, không nhạc.

**Bắt buộc đọc trước:** [references/rules.md](references/rules.md) (ưu tiên cao nhất). Schema style: [references/style-schema.md](references/style-schema.md). Số đo mẫu @thokunrw: [references/style-spec.md](references/style-spec.md).

## Thư mục

```text
references/rules.md          quy tắc dựng, giọng phụ đề, ví dụ đã duyệt
references/style-schema.md   schema style.json (bảng cách dựng của 1 video mẫu)
scripts/analyze.mjs          đo video mẫu → analysis/ + style.json khung; --set để điền nốt
scripts/build.mjs            cắt clip (giữ khung gốc) → render "Review" → ảnh bìa → out/<run>/
scripts/check.mjs            still từng cảnh để tự kiểm; --pass / --fail
scripts/vlib.mjs, style.mjs  hàm dùng chung, schema + preset mặc định
scripts/extras/              giọng đọc, nhạc tự tạo – chỉ khi được yêu cầu
template/                    Remotion, composition "Review" (style @thokunrw)
products/<mã>/               ví dụ cuts.txt + props.json đã duyệt
workspace/projects/<id>/     dữ liệu dự án (không lên git):
  project.json, source/                 clip dùng chung cả dự án
  samples/<sid>/                        mỗi video mẫu: file video, sample.json, analysis/, style.json, cuts.txt, props.json
  out/<run>/                            video.mp4, cover.png, props.json, review.json, stills/
```

## Quy trình (chạy trong thư mục repo)

1. **Phân tích mẫu**: `node scripts/analyze.mjs <id> <sid>` (dự án chỉ có 1 mẫu thì bỏ `<sid>`). Ra `samples/<sid>/analysis/{measure.json, scene-NN.jpg, contact.jpg}` và `style.json` khung (độ dài cảnh, khổ, fps, âm thanh đã đo; các trường cần nhìn để `null`, lựa chọn ở `_choices`).
2. **Điền style**: xem contact sheet + ảnh từng cảnh, rồi `node scripts/analyze.mjs <id> <sid> --set '{"sequence":[...],"cover":{"kind":"bar",...},"caption":{...},"transition":"cut"}'`. Lệnh trộn và kiểm schema; báo `pending` còn thiếu. `music` chỉ ghi nhận mẫu có nhạc – KHÔNG BAO GIỜ chép nhạc của mẫu.
3. **Xem source** (`source/`): dải khung hình mỗi clip (`ffmpeg -i X -vf fps=4,scale=110:-2,tile=12x2 -frames:v 1 X.png`), ghi clip nào là bìa / mở hàng / chi tiết / có người, mốc giây từng hành động; đọc màu, chất liệu, **tên thương hiệu**.
4. **Viết `samples/<sid>/cuts.txt`** theo `rules.md` và nhịp `shot_seconds`, trình tự `sequence` của mẫu:
   ```text
   # file  bắt-đầu  độ-dài  tên-xuất  [zoom] [cx]
   IMG_3805.MOV 0.5 3.4 01_bia
   ```
5. **Viết `samples/<sid>/props.json`**: `title` (số dòng = `cover.title_lines`), `shots[]` gồm `file: "<tên-xuất>"` (build tự trỏ về clip đã cắt), `duration`, `caption` (cảnh đầu không có caption).
6. **Dựng**: `node scripts/build.mjs <id> [--sample <sid>]` (cuts.txt/props.json tìm ở `samples/<sid>/` → thư mục dự án → `products/<id>/`) → `out/<run>/video.mp4` + `cover.png`, `review.json` = `{status:"checking", sample}`. Cùng source có thể dựng nhiều bản theo các mẫu khác nhau.
7. **Tự kiểm tra** (bắt buộc): `node scripts/check.mjs <id> <run>` → xem ảnh bìa và `stills/shot-NN.jpg`. Đạt khi:
   - phụ đề khớp hình, đúng màu/chất liệu, không sai chính tả, tên thương hiệu IN HOA;
   - không cắt gần/phóng to, cảnh hành động không khựng ở đầu, không cảnh chỉ có chân (trừ khi người dùng chỉ định);
   - có 1–2 cảnh người thật nếu source có; giọng phụ đề tiết chế đúng `rules.md`;
   - cách dựng giống mẫu (bìa, phụ đề, nhịp, chuyển cảnh) nhưng không có nội dung/logo/nhạc của mẫu.
   Đạt: `node scripts/check.mjs <id> <run> --pass` (vào To review). Chưa đạt: `--fail "<lý do>"`, sửa `cuts.txt`/`props.json`/`style.json` rồi dựng lại.

Người dùng góp ý: sửa file của mẫu, dựng lại. Quy tắc mới người dùng đưa ra thì thêm vào `references/rules.md`.

## Không làm

- Không chép nhạc, logo, nội dung của video mẫu.
- Không thêm nhạc, giọng đọc, emoji, sticker nếu không được yêu cầu.
- Không commit `workspace/`, video, clip cắt.
