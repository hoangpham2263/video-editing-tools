# style.json – bảng cách dựng của một video mẫu

Mỗi video mẫu có một bảng riêng: `workspace/projects/<id>/samples/<sid>/style.json`. Chỉ ghi **cách dựng**, không ghi nội dung, logo hay nhạc của mẫu. Kiểm bằng `scripts/style.mjs` (lệnh `analyze.mjs --set` và `build.mjs` đều kiểm). Trường thiếu khi dựng lấy theo preset @thokunrw.

| Trường | Kiểu / lựa chọn | Ai điền |
|---|---|---|
| `aspect` | `"9:16"` … | đo |
| `fps` | số | đo |
| `shot_seconds` | `{avg, min, max}` giây | đo |
| `sequence[]` | vai từng cảnh: `cover`, `unbox`, `detail`, `use`, `people`, `result`, `deal`, `other` | agent xem ảnh |
| `cover.kind` | `torn-paper` (giấy xé) \| `bar` (dải nền bo góc) \| `plain` (chữ viền trắng) \| `none` | agent |
| `cover.title_lines` | 0..4 | agent |
| `cover.title_color`, `cover.paper_color` | `#rrggbb` | agent |
| `cover.decor` | true/false (sticker hoa, tim) | agent |
| `title_anim` | `typewriter` \| `fade` \| `none` | agent |
| `caption.style` | `serif-outline` (chữ chân viền) \| `box` (nền hộp, màu = `outline`) \| `plain` (bóng mờ) | agent |
| `caption.position` | `bottom` \| `middle` | agent |
| `caption.color` | `#rrggbb` | agent |
| `caption.outline` | `#rrggbb` hoặc `null` | agent |
| `caption.anim` | `typewriter` \| `fade` \| `none` | agent |
| `caption.decor` | true/false (sao lấp lánh) | agent |
| `transition` | `cut` \| `fade` | agent |
| `music` | true/false – chỉ ghi nhận mẫu có nhạc; KHÔNG BAO GIỜ chép nhạc của mẫu (đo: im lặng thì tự điền `false`) | đo/agent |
| `sfx` | true/false (một tiếng "ting" lúc hiện tiêu đề) | agent |

Sau `analyze.mjs`, trường cần nhìn để `null`; `_pending` liệt kê chúng, `_choices` ghi lựa chọn. `--set` hết `null` thì hai khoá này tự bỏ.

## Lệnh

```sh
node scripts/analyze.mjs <id> <sid>                       # đo, ảnh cảnh, contact sheet, style.json khung
node scripts/analyze.mjs <id> <sid> --set '{"transition":"fade","caption":{"position":"bottom"}}'
node scripts/build.mjs <id> --sample <sid>                # dựng theo style.json + cuts.txt + props.json của mẫu
```

## Ví dụ (preset @thokunrw)

```json
{
  "aspect": "9:16",
  "fps": 30,
  "shot_seconds": {"avg": 3, "min": 2.5, "max": 3.5},
  "sequence": ["cover", "unbox", "detail", "detail", "use", "use", "result"],
  "cover": {"kind": "torn-paper", "title_lines": 2, "title_color": "#e8478c", "paper_color": "#fbf2e4", "decor": true},
  "title_anim": "typewriter",
  "caption": {"style": "serif-outline", "position": "middle", "color": "#fff5b0", "outline": "#4b3527", "anim": "typewriter", "decor": true},
  "transition": "cut",
  "music": false,
  "sfx": false
}
```

Ghi chú: template hiện chỉ có composition `Review` (preset trên); bản dựng chưa đổi theo style.json.
