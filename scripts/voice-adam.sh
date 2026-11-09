#!/bin/zsh
# Tạo giọng đọc Adam (ElevenLabs) cho từng câu.
# Dùng: scripts/voice-adam.sh <file câu thoại, mỗi dòng 1 câu> <thư mục xuất>
# Cần biến môi trường ELEVENLABS_API_KEY (đặt trong ~/.zshrc, không dán vào chat).
# Tuỳ chọn: VOICE_ID (mặc định Adam), MODEL (mặc định eleven_turbo_v2_5, có tiếng Việt).
set -e
LINES=$1; OUT=$2
VOICE_ID=${VOICE_ID:-pNInz6obpgDQGcFmaJgB}
MODEL=${MODEL:-eleven_turbo_v2_5}
[[ -z "$ELEVENLABS_API_KEY" ]] && { echo "Thiếu ELEVENLABS_API_KEY"; exit 1; }
mkdir -p $OUT
i=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  i=$((i+1)); n=$(printf "%02d" $i)
  body=$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "model_id": sys.argv[2], "language_code": "vi", "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.2, "speed": 1.08}}))' "$line" "$MODEL")
  code=$(curl -s -o "$OUT/$n.mp3" -w "%{http_code}" \
    -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID?output_format=mp3_44100_128" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" -d "$body")
  if [[ "$code" != "200" ]]; then echo "$n LỖI $code: $(head -c 300 $OUT/$n.mp3)"; rm -f "$OUT/$n.mp3"; exit 1; fi
  printf "%s %ss | %s\n" $n $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$n.mp3") "$line"
done < $LINES
