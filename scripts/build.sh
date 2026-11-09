#!/bin/zsh
# Dựng 1 sản phẩm từ đầu đến cuối: cắt clip → render video → xuất ảnh bìa [→ up lên Hub].
# Dùng: scripts/build.sh <mã> [--push]
#   Cần: work/<mã>/source/ (hub.mjs pull), products/<mã>/cuts.txt, products/<mã>/props.json
#   Ra:  work/<mã>/out/<mã>.mp4, work/<mã>/out/<mã>_cover.png
#   --push: up 2 file trên vào "Kết quả" của sản phẩm (trạng thái tự thành "Đã edit")
set -e
ROOT=${0:A:h:h}
SLUG=$1; [[ -z "$SLUG" ]] && { echo "Dùng: scripts/build.sh <mã> [--push]"; exit 1; }
P=$ROOT/products/$SLUG; W=$ROOT/work/$SLUG
for f in $P/cuts.txt $P/props.json; do [[ -f $f ]] || { echo "Thiếu $f"; exit 1; }; done
[[ -d $W/source ]] || { echo "Thiếu $W/source (chạy: node scripts/hub.mjs pull $SLUG)"; exit 1; }
mkdir -p $W/out
[[ -d $ROOT/template/node_modules ]] || (cd $ROOT/template && npm install --silent)

echo "1/3 Cắt clip"
zsh $ROOT/scripts/cut.sh $W/source $ROOT/template/public/clips/$SLUG $P/cuts.txt

cd $ROOT/template
echo "2/3 Render video"
npx remotion render src/index.ts Review $W/out/$SLUG.mp4 --props=$P/props.json --codec=h264 --crf=18 --log=error
echo "3/3 Ảnh bìa"
npx remotion still src/index.ts Review $W/out/${SLUG}_cover.png --props=$P/props.json --frame=80 --log=error

echo "Xong: $W/out"
if [[ "$2" == "--push" ]]; then
  node $ROOT/scripts/hub.mjs push $SLUG $W/out/$SLUG.mp4 $W/out/${SLUG}_cover.png
fi
