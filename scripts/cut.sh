#!/bin/zsh
# Cắt các đoạn từ source thành clip 1080x1920, 30fps, H.264, chỉnh màu ám lavender nhẹ.
# Dùng: scripts/cut.sh <thư mục source> <thư mục xuất> <file danh sách>
# Mỗi dòng: <file nguồn> <giây bắt đầu> <độ dài> <tên xuất> [zoom] [cx]
#   zoom: (video dọc) tỉ lệ khung chính so với 1080x1920, mặc định 1 = giữ nguyên khung như lúc quay.
#   cx:   (video ngang) tâm chủ thể theo chiều ngang 0..1 (mặc định 0.5).
# Video ngang: nền mờ trên/dưới, giữa 2 bản cạnh nhau (trái/phải 50%), mỗi bản cắt đều 2 bên.
set -e
SRC=$1; OUT=$2; LIST=$3
mkdir -p $OUT
GRADE="eq=brightness=0.03:contrast=0.93:saturation=0.92,colorbalance=rs=-0.03:gs=-0.01:bs=0.05:rm=-0.02:bm=0.04:rh=-0.01:bh=0.02"
while read -r file start dur name zoom cx; do
  [[ -z "$file" || "$file" == \#* ]] && continue
  zoom=${zoom:-1}; cx=${cx:-0.5}
  # kích thước sau xoay
  read w h <<< $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height:stream_side_data=rotation -of csv=p=0 "$SRC/$file" | tr ',\n' '  ' | awk '{r=$3; if (r==90||r==-90||r==270||r==-270) print $2, $1; else print $1, $2}')
  if (( w > h )); then
    # Video ngang: nền mờ trên/dưới, giữa là 2 bản đặt cạnh nhau (trái 50% / phải 50%),
    # mỗi bản cắt đều 2 bên quanh tâm khung (cx, mặc định 0.5) – cao 608px như khung ngang gốc
    # Video ngang: 2 bản giống nhau xếp trên/dưới, mỗi bản 1080x960 cắt đều 2 bên, không nền mờ
    VF="[0:v]crop=min(iw\\,ih*9/8):ih:max(0\\,min(iw-ow\\,iw*$cx-ow/2)):0,scale=1080:960,setsar=1,split[t][b];[t][b]vstack,fps=30,$GRADE,format=yuv420p[v]"
  else
    FG="scale=trunc(1080*$zoom/2)*2:-2"
    VF="[0:v]split[a][b];[a]scale=540:960:force_original_aspect_ratio=increase,crop=540:960,boxblur=20:2,scale=1080:1920,eq=brightness=0.02[bg];[b]${FG}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,$GRADE,format=yuv420p[v]"
  fi
  ffmpeg -hide_banner -loglevel error -y -ss $start -t $dur -i "$SRC/$file" \
    -filter_complex "$VF" \
    -map "[v]" -map "0:a?" \
    -af "highpass=f=80,afftdn=nf=-45,volume=14dB,alimiter=limit=0.8" \
    -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 160k -ar 48000 -ac 2 "$OUT/$name.mp4" </dev/null &
done < $LIST
wait
echo "Xong: $(ls $OUT | wc -l | tr -d ' ') clip"
