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
   - Từ Review Hub: `node scripts/hub.mjs list` rồi `node scripts/hub.mjs pull <slug>` → tải về `work/<slug>/source/`, đặt trạng thái "Đang dựng".
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
8. **Giao**: mở thư mục `work/<slug>/out/` cho người dùng xem. Khi người dùng duyệt thì `node scripts/hub.mjs push <slug> work/<slug>/out/*.mp4 work/<slug>/out/*_cover.png` (đặt trạng thái "Có kết quả"). Một sản phẩm có thể có nhiều video kết quả.

9. **Lưu dữ liệu**: chép `cuts.txt`, `props.json` (từ `edits/<slug>.json`) và `note.txt` vào `~/Workspace/review-video-sources/products/<slug>/`, cập nhật bảng trong README của repo đó, commit và push.

Người dùng sửa gì thì sửa `cuts.txt`/`json`, cắt lại đúng clip đó và render lại. Quy tắc mới người dùng đưa ra thì thêm vào `references/rules.md`.

## Review Hub

Web: https://hoangpham.is-a.dev/review-video/ (mã nguồn `docs/`). Dữ liệu nằm ở **Google Drive** qua Worker `tools-hub-api` (thư mục `Tools Hub/Review Video/<mã>/Source|Kết quả`). Đăng nhập bằng mật khẩu app Tools Hub; CLI đọc từ `REVIEW_HUB_KEY` hoặc `~/.config/review-video/key`.

- Mỗi sản phẩm = 1 Release, tag = mã sản phẩm (slug).
- File thường trong Release = **source** (người quay kéo thả vào trang sửa Release, tối đa 2 GB/file, giữ nguyên chất lượng).
- File tên `KQ_...` = **video kết quả** do skill đẩy lên.
- Trạng thái ở dòng đầu mô tả Release: `<!-- status:new|editing|done|posted -->` (Chờ dựng / Đang dựng / Có kết quả / Đã đăng).

Người quay cần tài khoản GitHub được mời vào repo dữ liệu. Web dùng mã GitHub (token classic, quyền `repo`) lưu trong trình duyệt. Xem video ngay trên web nhờ `worker/` (Worker `yooi`, chỉ đổi asset id → link phát tạm; deploy `cd worker && npx wrangler deploy`).

`scripts/hub.mjs` dùng `gh` đã đăng nhập: `list`, `show <slug>`, `create "<tên>" ["ghi chú"]`, `pull <slug> [thư-mục]`, `push <slug> <file...>`, `status <slug> <new|editing|done|posted>`.
