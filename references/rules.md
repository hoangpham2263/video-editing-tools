# Quy tắc dựng (bắt buộc)

Đây là bản chuẩn, ưu tiên hơn `style-spec.md` (file đó là ghi chép phân tích mẫu ban đầu, có vài chi tiết đã bỏ như sticker mèo).

## Bố cục

- Tỉ lệ 1080x1920, 30fps, cắt thẳng (không hiệu ứng chuyển cảnh).
- Cảnh đầu là **ảnh bìa**: sản phẩm rõ nét + tiêu đề 2 dòng. Luôn xuất kèm `cover.png` (frame 80).
- Tiêu đề: dòng 1 là loại sản phẩm, dòng 2 là "Nhà <THƯƠNG HIỆU>". **Tên thương hiệu viết IN HOA.**
- Trình tự hợp lý: bìa → mở hàng → chi tiết → dùng thử/mang thử → kết (deal).
- Sản phẩm là set/nguyên liệu (bánh, đồ ăn, mỹ phẩm…): **ưu tiên cảnh nguyên liệu thật** (mở hộp, các gói nguyên liệu, đổ/trộn) ngay sau bìa để tạo uy tín. Source không có thì báo người dùng và gợi ý quay bổ sung.
- Mỗi cảnh khoảng 3 giây, không cắt vụn.
- Cảnh có hành động (kéo túi, rút lót, gắn charm) thì bắt đầu cảnh **ngay lúc hành động diễn ra** để chuyển cảnh mượt, không khựng.

## Khung hình

- Giữ nguyên khung như lúc quay, **không phóng to, không cắt gần**.
- Video dọc 9:16: để tràn khung như gốc.
- Video ngang: nền mờ phía trên và dưới, ở giữa 2 bản giống nhau đặt cạnh nhau (trái 50%, phải 50%), mỗi bản cắt đều 2 bên (`scripts/cut.sh` tự làm).

## Cảnh có người

- Nếu source có cảnh người thật review (cầm, mang, dùng thử) thì chọn **1–2 cảnh** đưa vào cho có cảm giác thật. Không lạm dụng, không bỏ hẳn.
- Ưu tiên cảnh lộ mặt nếu có và hợp lý.
- Người dùng chỉ định cảnh nào thì dùng đúng cảnh đó.

## Chữ

- Tiêu đề: chữ hồng `#e8478c` trên mảnh giấy kem mép xé, gõ từng ký tự (~15 ký tự/giây), kèm 1 hoa + 1 tim nhỏ.
- Phụ đề: chữ có chân vàng nhạt viền nâu, gõ từng ký tự, 2 sao hồng nhỏ hai bên, xuống dòng cân đối.
- KHÔNG thêm icon/emoji/sticker kiểu mèo meme, tay chỉ. Chỉ có hoa/tim/sao nhỏ như trên.

## Nội dung phụ đề

- Mỗi cảnh 1 câu, đúng với hình đang hiện.
- **Kiểm tra đúng màu, chất liệu, tên thương hiệu** bằng cách nhìn khung hình gốc, không đoán.
- Giọng thân thiện nhưng **tiết chế**:
  - Cả video chỉ 2–3 câu kiểu dễ thương (có nha, nè, á, luôn, xỉu, mấy bà...), các câu còn lại nói bình thường, nêu đặc điểm thật.
  - Từ khen (dễ thương, cưng, xinh, dịu mắt...) tối đa 1 lần.
  - "mấy bà" tối đa 1–2 lần, không lặp cùng từ đệm ở 2 câu liền nhau.
- Câu kết thường là: "Đang có deal, mấy bà hốt lẹ nha".

Ví dụ đã được duyệt (dép sục):

```
Hàng về được gói trong túi kỹ càng
Dép màu xanh pastel, quai phối hồng
Quai có gắn ngôi sao nhỏ, cưng xỉu nha
Kèm thêm một bộ charm để trang trí
Charm gắn thẳng vô lỗ dép, rất dễ
Gắn đủ charm là có thể lên đồ
Mang thử lên chân nè, nhìn hợp ghê
Đang có deal, mấy bà hốt lẹ nha
```

## Âm thanh

- Bản giao chính: **không nhạc, không lồng tiếng**. Chỉ tiếng gốc (âm lượng 0.6) + 1 tiếng "ting" nhẹ lúc tiêu đề hiện. Người dùng tự ghép nhạc trend trên TikTok/CapCut.
- Không lạm dụng hiệu ứng âm thanh (không tách tiếng từng chữ).
- Bản có nhạc hoặc giọng đọc (Adam/ElevenLabs, edge-tts) chỉ làm khi được yêu cầu.
