# Review Video

Skill Claude Code dựng video review sản phẩm TikTok Shop theo style @thokunrw: cảnh bìa có tiêu đề giấy xé, phụ đề gõ chữ, cắt thẳng ~3 giây/cảnh, không nhạc (tự ghép nhạc trend khi đăng).

```text
"có source mới"  → lấy source từ Review Hub → dựng → bạn xem, góp ý → đẩy kết quả lên Hub
```

- Các bước của AI: [SKILL.md](SKILL.md)
- Quy tắc dựng (đã thống nhất): [references/rules.md](references/rules.md)
- Web cho người quay up source / tải kết quả: https://hoangpham.is-a.dev/review-video/ (mã: `docs/`, máy chủ: `worker/`, hướng dẫn: [references/hub.md](references/hub.md))

## Cài lần đầu

```bash
git clone git@github.com:hoangpham2263/review-video.git ~/Workspace/review-video
ln -s ~/Workspace/review-video ~/.claude/skills/review-video
cd ~/Workspace/review-video/template && npm install
```

Cần: Node 20+, ffmpeg, Python 3 (numpy, scipy nếu tạo nhạc). Kết nối Hub: tạo `~/.config/review-hub.json`:

```json
{"url": "https://review-hub.<tài-khoản>.workers.dev", "key": "<mã truy cập>"}
```

## Lệnh Hub

```bash
H="node ~/Workspace/review-video/scripts/hub.mjs"
$H list
$H pull <slug>                 # source về work/<slug>/source
$H push <slug> work/<slug>/out/*.mp4 work/<slug>/out/*_cover.png
$H status <slug> posted
```

Video gốc không lưu trong repo (quá nặng cho GitHub), chỉ lưu trên Hub (Cloudflare R2) và thư mục `work/` trên máy.
