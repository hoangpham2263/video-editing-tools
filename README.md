# Review Video

Skill Claude Code dựng video review sản phẩm TikTok Shop theo style @thokunrw: cảnh bìa có tiêu đề giấy xé, phụ đề gõ chữ, cắt thẳng ~3 giây/cảnh, không nhạc (tự ghép nhạc trend khi đăng).

```text
"có source mới"  → lấy source từ Review Hub → dựng → bạn xem, góp ý → đẩy kết quả lên Hub
```

- Các bước của AI: [SKILL.md](SKILL.md)
- Dữ liệu từng sản phẩm (cảnh, phụ đề, ghi chú): [review-video-sources](https://github.com/hoangpham2263/review-video-sources)
- Quy tắc dựng (đã thống nhất): [references/rules.md](references/rules.md)
- Web cho người quay xem sản phẩm / tải kết quả: https://hoangpham.is-a.dev/review-video/ (mã: `docs/`). Video lưu ở GitHub Releases của repo dữ liệu.

## Cài lần đầu

```bash
git clone git@github.com:hoangpham2263/review-video.git ~/Workspace/review-video
git clone git@github.com:hoangpham2263/review-video-sources.git ~/Workspace/review-video-sources
ln -s ~/Workspace/review-video ~/.claude/skills/review-video
cd ~/Workspace/review-video/template && npm install
```

Cần: Node 20+, ffmpeg, `gh` đã đăng nhập, Python 3 (numpy, scipy nếu tạo nhạc).

## Lệnh Hub

```bash
H="node ~/Workspace/review-video/scripts/hub.mjs"
$H list
$H pull <slug>                 # source về work/<slug>/source
$H push <slug> work/<slug>/out/*.mp4 work/<slug>/out/*_cover.png
$H status <slug> posted
```

Video gốc và kết quả không nằm trong code của repo nào; chúng là file đính kèm của Releases trong `review-video-sources` (tối đa 2 GB/file).
