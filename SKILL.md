---
name: review-video
description: Dựng video review sản phẩm TikTok Shop theo style @thokunrw (Remotion + ffmpeg) từ source quay thật, lấy source và đẩy kết quả qua Review Hub. Dùng khi người dùng nói "dựng video", "làm video review", "edit video sản phẩm", "lấy source", "có source mới", "đẩy video lên hub", hoặc gửi file .MOV/.MP4 sản phẩm.
---

# Review Video

Dựng video review sản phẩm dọc 9:16 giống mẫu @thokunrw: cảnh bìa có tiêu đề giấy xé, phụ đề gõ chữ, cắt thẳng ~3s/cảnh, không nhạc.

**Đọc trước khi làm:** [references/rules.md](references/rules.md) (quy tắc bắt buộc). Chi tiết phân tích mẫu: [references/style-spec.md](references/style-spec.md).

## Thư mục

```text
SKILL.md
references/rules.md        quy tắc dựng, giọng phụ đề, ví dụ đã duyệt
references/style-spec.md   số đo từ video mẫu
scripts/hub.mjs            lấy source / đẩy kết quả với Review Hub
scripts/cut.sh             cắt + chỉnh màu + giữ khung gốc
scripts/voice-adam.sh      giọng Adam (ElevenLabs) – chỉ khi được yêu cầu
scripts/make_music*.py     nhạc tự tạo – chỉ khi được yêu cầu
template/                  dự án Remotion (Review composition)
```

Thư mục làm việc cho từng sản phẩm: `work/<slug>/` trong skill (đã gitignore), gồm `source/`, `out/`.

## Quy trình

1. **Lấy source**
   - Từ Review Hub: `node scripts/hub.mjs list` rồi `node scripts/hub.mjs pull <slug>` → tải về `work/<slug>/source/`.
   - Hoặc người dùng gửi đường dẫn file: chép vào `work/<slug>/source/`.
2. **Xem source**: làm dải khung hình mỗi clip (ffmpeg `fps=4,scale=110:-2,tile=12x2`), ghi lại clip nào là bìa, mở hàng, chi tiết, có người, mốc giây của từng hành động. Kiểm tra màu và tên thương hiệu trên khung gốc.
3. **Chọn cảnh** theo `rules.md`, viết `template/edits/<slug>.cuts.txt`:
   ```text
   # file  bắt-đầu  độ-dài  tên-xuất  [zoom]
   IMG_3805.MOV 0.5 3.4 01_bia
   ```
4. **Cắt**: `zsh scripts/cut.sh work/<slug>/source template/public/clips/<slug> template/edits/<slug>.cuts.txt`
5. **Viết props** `template/edits/<slug>.json` (mẫu: `edits/dep.khongnhac.json`): `title` 2 dòng, `shots[]` gồm `file`, `duration`, `caption` (cảnh đầu không có caption), `music: null`, `sfx: true`.
6. **Render** (trong `template/`, lần đầu chạy `npm install`):
   ```bash
   npx remotion render src/index.ts Review ../work/<slug>/out/<slug>.mp4 --props=edits/<slug>.json --codec=h264 --crf=18
   npx remotion still src/index.ts Review ../work/<slug>/out/<slug>_cover.png --props=edits/<slug>.json --frame=80
   ```
7. **Tự kiểm tra**: xuất vài still ở giữa từng cảnh (`--frame`), đối chiếu phụ đề với hình, màu, chính tả, tên thương hiệu in hoa, không cắt gần, không khựng ở đầu cảnh.
8. **Giao**: mở thư mục `work/<slug>/out/` cho người dùng xem. Khi người dùng duyệt thì `node scripts/hub.mjs push <slug> work/<slug>/out/*.mp4 work/<slug>/out/*_cover.png` (tự chuyển "Đã edit"). Một sản phẩm có thể có nhiều video kết quả.

9. **Lưu cách dựng**: giữ `template/edits/<slug>.cuts.txt` và `template/edits/<slug>.json` trong repo skill (commit khi người dùng yêu cầu) để lần sau sửa/dựng lại.

Người dùng sửa gì thì sửa `cuts.txt`/`json`, cắt lại đúng clip đó và render lại. Quy tắc mới người dùng đưa ra thì thêm vào `references/rules.md`.

## Review Hub

Web: https://hoangpham.is-a.dev/review-video/ (mã nguồn `docs/`, không cần mật khẩu). Dữ liệu ở **Google Drive** qua Worker `tools-hub-api` (repo `tools-hub`, file `worker/review.js`):

- Drive: `Tools Hub/Review Video/<mã>/Source/` và `.../Kết quả/`. Danh sách sản phẩm lưu trong KV của Worker.
- Up file: Worker mở phiên upload, trình duyệt/CLI gửi thẳng lên Google, giữ nguyên chất lượng, tối đa 5 GB/file.
- Trạng thái (3): `new | done | posted` = Chờ edit / Đã edit / Đã đăng. Đẩy kết quả lên tự chuyển sang Đã edit.
- Web chỉ hiện video và ảnh bìa kết quả mới nhất.
- **Video mẫu** (phân tích style) lưu riêng: Drive `Tools Hub/Review Video/Video mẫu/<mã>/`, web tab "Video mẫu". `hub.mjs samples` liệt kê, `pull <mã>` tải về. Mẫu @thokunrw: `video-mau-thokunrw-phan-tich-style-o3e6`.

`scripts/hub.mjs`: `list`, `show <mã>`, `create "<tên>" ["ghi chú"]`, `pull <mã> [thư-mục]`, `push <mã> <file...>` (kết quả), `push-source <mã> <file...>`, `status <mã> <trạng-thái>`.
