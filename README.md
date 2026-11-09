# Video Editing Tools

Skill Claude Code dựng video review sản phẩm TikTok Shop theo style @thokunrw: cảnh bìa có tiêu đề giấy xé, phụ đề gõ chữ, cắt thẳng ~3 giây/cảnh, không nhạc (tự ghép nhạc trend khi đăng).

```text
"có source mới"  → pull source → dựng (build.sh) → AI tự kiểm tra → tự up thành phẩm lên Hub
```

- Các bước của AI: [SKILL.md](SKILL.md)
- Quy tắc dựng (đã thống nhất): [references/rules.md](references/rules.md)
- Hub, Drive, trạng thái, lệnh: [references/hub.md](references/hub.md)
- Web Video Editing Tools cho người quay up source / tải kết quả: https://hoangpham.is-a.dev/video-editing-tools/ (mã: `docs/`). File lưu ở Google Drive qua Worker `tools-hub-api`.

## Cài lần đầu

```bash
git clone git@github.com:hoangpham2263/video-editing-tools.git ~/Workspace/video-editing-tools
ln -s ~/Workspace/video-editing-tools ~/.claude/skills/video-editing-tools
cd ~/Workspace/video-editing-tools/template && npm install
```

Cần: Node 20+, ffmpeg, Python 3 (numpy, scipy nếu tạo nhạc).

## Cấu trúc

```text
products/<mã>/cuts.txt, props.json   cách dựng từng sản phẩm (commit)
scripts/build.sh <mã> [--push]       cắt → render → ảnh bìa [→ up Hub]
scripts/cut.sh, scripts/hub.mjs      cắt clip / CLI Hub (không cần mật khẩu, không cần gh)
scripts/extras/                      giọng đọc, nhạc – chỉ khi được yêu cầu
template/                            dự án Remotion
docs/                                web Hub (GitHub Pages)
work/<mã>/source|out                 file tạm (gitignore)
```

## Lệnh Hub

```bash
H="node ~/Workspace/video-editing-tools/scripts/hub.mjs"
$H list
$H pull <slug>                 # source về work/<slug>/source
zsh scripts/build.sh <slug> --push   # dựng + up thành phẩm
$H status <slug> posted
```

Video gốc và kết quả không nằm trong repo; chúng ở Google Drive `Tools Hub/Video Editing Tools/` (tối đa 5 GB/file).
