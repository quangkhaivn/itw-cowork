#!/usr/bin/env bash
# Sao lưu cơ sở dữ liệu Cowork — chạy trên máy chủ, trong thư mục dự án.
#
#   ./scripts/sao-luu.sh              sao lưu một lần
#   GIU_NGAY=30 ./scripts/sao-luu.sh  giữ bản sao lưu 30 ngày (mặc định 14)
#
# Kết quả: $THU_MUC_SAO_LUU/cowork-<thời điểm UTC>.dump (định dạng custom của pg_dump,
# nén sẵn, phục hồi chọn lọc được). Quyền 600 — chỉ root đọc được.
#
# Sau khi ghi, script ĐỌC LẠI mục lục của tệp bằng pg_restore --list. Tệp không đọc lại
# được thì coi như sao lưu hỏng và thoát mã 1 — một bản sao lưu chưa từng đọc lại
# được thì chưa phải bản sao lưu.
#
# Từ bản 0.15.0, script đóng gói thêm thư mục `data/dinh-kem` (tệp đính kèm của chứng từ)
# thành một tệp .tar.gz riêng cùng hạn giữ. Phục hồi phải lấy CẢ HAI: thiếu gói tệp thì
# bản ghi trong cơ sở dữ liệu trỏ tới tệp không còn tồn tại.
#
# GIỚI HẠN — ghi rõ để không ai hiểu nhầm: bản sao lưu nằm trên CÙNG máy chủ. Mất máy
# chủ là mất luôn bản sao lưu. Cất ra ngoài máy (VD-068) cần Giám đốc chọn nơi cất.
# Biến CHEP_RA_NGOAI dưới đây là chỗ cắm lệnh chép đó khi đã có nơi cất.

set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a
: "${POSTGRES_USER:?thiếu POSTGRES_USER}"
: "${POSTGRES_DB:?thiếu POSTGRES_DB}"

THU_MUC="${THU_MUC_SAO_LUU:-/root/cowork-sao-luu}"
GIU_NGAY="${GIU_NGAY:-14}"
LUC="$(date -u +%Y%m%dT%H%M%SZ)"
TEP="$THU_MUC/cowork-$LUC.dump"

mkdir -p "$THU_MUC"
chmod 700 "$THU_MUC"

echo "--- sao lưu $POSTGRES_DB → $TEP ---"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner > "$TEP.dang-ghi"
mv "$TEP.dang-ghi" "$TEP"
chmod 600 "$TEP"

# Đọc lại mục lục: pg_restore phải đọc hết tệp không lỗi, và phải thấy dữ liệu của users và audit_logs.
# Ghi mục lục ra tệp trước rồi mới grep. KHÔNG dùng `pg_restore | grep -q`: grep -q thoát ngay khi
# khớp, pg_restore nhận SIGPIPE, và với `set -o pipefail` cả đường ống bị coi là hỏng — báo sai
# "không đọc lại được" một cách ngẫu nhiên (đã xảy ra trên máy thật 19/09).
MUC_LUC="$(mktemp)"
trap 'rm -f "$MUC_LUC"' EXIT
if ! docker compose exec -T db pg_restore --list < "$TEP" > "$MUC_LUC"; then
  echo "❌ pg_restore không đọc được tệp sao lưu: $TEP"
  exit 1
fi
for bang in users audit_logs; do
  if ! grep "TABLE DATA public $bang " "$MUC_LUC" > /dev/null; then
    echo "❌ Tệp sao lưu thiếu dữ liệu bảng $bang: $TEP"
    exit 1
  fi
done
echo "✓ sao lưu đọc lại được: $(du -h "$TEP" | cut -f1), $(grep -c 'TABLE DATA' "$MUC_LUC") bảng có dữ liệu"

# Tệp đính kèm nằm trên đĩa, không nằm trong cơ sở dữ liệu — pg_dump không kéo theo.
# Không đóng gói ở đây thì phục hồi xong sẽ có bản ghi trỏ tới tệp không còn tồn tại.
THU_MUC_TEP="data/dinh-kem"
if [ -d "$THU_MUC_TEP" ] && [ -n "$(find "$THU_MUC_TEP" -type f -print -quit 2>/dev/null)" ]; then
  TEP_DK="$THU_MUC/cowork-dinh-kem-$LUC.tar.gz"
  echo "--- đóng gói tệp đính kèm → $TEP_DK ---"
  tar -czf "$TEP_DK.dang-ghi" "$THU_MUC_TEP"
  mv "$TEP_DK.dang-ghi" "$TEP_DK"
  chmod 600 "$TEP_DK"
  # Đọc lại mục lục: gói không liệt kê được thì coi như hỏng.
  if ! tar -tzf "$TEP_DK" > /dev/null; then
    echo "❌ Gói tệp đính kèm không đọc lại được: $TEP_DK"
    exit 1
  fi
  echo "✓ tệp đính kèm đọc lại được: $(du -h "$TEP_DK" | cut -f1), $(tar -tzf "$TEP_DK" | grep -c '[^/]$') tệp"
else
  echo "chưa có tệp đính kèm nào — bỏ qua"
fi

if [ -n "${CHEP_RA_NGOAI:-}" ]; then
  echo "--- chép ra ngoài máy ---"
  eval "$CHEP_RA_NGOAI \"$TEP\""
fi

# Dọn bản cũ hơn GIU_NGAY ngày. Chỉ đụng tệp đúng mẫu tên, không đụng gì khác.
find "$THU_MUC" -maxdepth 1 -type f -name 'cowork-*.dump' -mtime "+$GIU_NGAY" -print -delete | sed 's/^/  đã dọn: /'
find "$THU_MUC" -maxdepth 1 -type f -name 'cowork-dinh-kem-*.tar.gz' -mtime "+$GIU_NGAY" -print -delete | sed 's/^/  đã dọn: /'
echo "✓ xong. Đang giữ $(find "$THU_MUC" -maxdepth 1 -name 'cowork-*.dump' | wc -l) bản."
