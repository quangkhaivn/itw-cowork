#!/usr/bin/env bash
# Thử phục hồi bản sao lưu mới nhất vào một CSDL TẠM rồi xóa đi — 0.16.1 (QĐ-88).
#
#   ./scripts/thu-phuc-hoi.sh                          bộ sao lưu đầy đủ mới nhất trên máy
#   TEP_DUMP=/đường/dẫn/cowork-<LUC>.dump ./scripts/thu-phuc-hoi.sh    một bộ cụ thể
#   THU_PHUC_HOI_TU_NGOAI=1 ./scripts/thu-phuc-hoi.sh  tải bộ mới nhất từ RCLONE_REMOTE về rồi thử —
#                                                      chứng minh bản ngoài máy dùng được thật
#
# KHÔNG đụng CSDL thật: phục hồi vào `cowork_thu_phuc_hoi_<thời điểm>`, kiểm, rồi DROP (kể cả khi hỏng).
# Kiểm:
#   1. pg_restore chạy hết, không lỗi;
#   2. có doanh nghiệp và người dùng; in migration cuối và số dòng vài bảng chính (gồm nhật ký kiểm toán);
#   3. gói tệp đính kèm cùng mốc giải nén được và đủ số tệp;
#   4. bản .env mã hóa (nếu có) giải mã được bằng mật khẩu sao lưu và có APP_ENC_KEY.
# Kết quả ghi vào system_heartbeats (dòng 'thu-phuc-hoi'); hỏng thì thoát mã 1 và gửi báo động
# (ALERT_WEBHOOK_URL / ALERT_EMAIL). Biến môi trường khác: xem scripts/sao-luu.sh.
#
# Cron hằng tuần (tùy chọn, trien-khai.sh cài khi .env có THU_PHUC_HOI_HANG_TUAN=1):
#   30 3 * * 0 root cd /root/cowork-itw && ./scripts/thu-phuc-hoi.sh >> /var/log/cowork-thu-phuc-hoi.log 2>&1

set -euo pipefail
cd "$(dirname "$0")/.."

TEP_ENV="${TEP_ENV:-.env}"
set -a
# shellcheck disable=SC1090
source "$TEP_ENV"
set +a
# shellcheck source=scripts/van-hanh-chung.sh
source "scripts/van-hanh-chung.sh"

if [ "${SAO_LUU_KHONG_DOCKER:-0}" != "1" ]; then
  : "${POSTGRES_USER:?thiếu POSTGRES_USER}"
  : "${POSTGRES_DB:?thiếu POSTGRES_DB}"
fi

THU_MUC="${THU_MUC_SAO_LUU:-/root/cowork-sao-luu}"
CSDL_TAM="cowork_thu_phuc_hoi_$(date -u +%Y%m%d%H%M%S)"
BUOC="chuẩn bị"
DA_TAO_CSDL=0
TAM="$(mktemp -d)"
umask 077

ket_thuc() {
  local ma=$?
  if [ "$DA_TAO_CSDL" = "1" ]; then
    chay_pg psql -X -q -c "DROP DATABASE IF EXISTS \"$CSDL_TAM\" WITH (FORCE)" >/dev/null 2>&1 \
      || echo "⚠ không xóa được CSDL tạm $CSDL_TAM — xóa tay: DROP DATABASE $CSDL_TAM" >&2
  fi
  rm -rf "$TAM"
  if [ "$ma" -ne 0 ]; then
    local loi="Thử phục hồi hỏng ở bước: $BUOC (mã $ma)"
    ghi_nhip "thu-phuc-hoi" false "{\"loi\":$(json_chuoi "$loi")}" || true
    bao_dong "THỬ PHỤC HỒI HỎNG" "$loi. Bản sao lưu có thể không dùng được — xem /var/log/cowork-thu-phuc-hoi.log."
  fi
  exit "$ma"
}
trap ket_thuc EXIT
# Bị ngắt thì vẫn phải xóa CSDL tạm VÀ ghi "hỏng" + báo động: không bắt tín hiệu thì trap EXIT
# chạy với $? = 0 và lần thử dở dang bị coi như không có gì (QA 0.16.1).
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------------------------------------------------------------------------
# 0. Chọn bộ sao lưu: dump + gói đính kèm CÙNG mốc (bỏ qua dump của lần sao lưu hỏng giữa chừng)
# ---------------------------------------------------------------------------
BUOC="chọn bộ sao lưu"
NGUON="$THU_MUC"
if [ "${THU_PHUC_HOI_TU_NGOAI:-0}" = "1" ]; then
  : "${RCLONE_REMOTE:?THU_PHUC_HOI_TU_NGOAI=1 cần RCLONE_REMOTE}"
  BUOC="tải bộ sao lưu từ ngoài máy"
  rclone lsf --files-only --include 'cowork-*.dump' "$RCLONE_REMOTE" | sort > "$TAM/ds-ngoai.txt"
  MOI_NHAT="$(tail -n1 "$TAM/ds-ngoai.txt")"
  [ -n "$MOI_NHAT" ] || { echo "❌ Không có tệp cowork-*.dump nào ở $RCLONE_REMOTE"; exit 1; }
  LUC_NGOAI="${MOI_NHAT#cowork-}"; LUC_NGOAI="${LUC_NGOAI%.dump}"
  mkdir -p "$TAM/ngoai"
  rclone copy --include "cowork-$LUC_NGOAI.dump" --include "cowork-dinh-kem-$LUC_NGOAI.tar.gz" \
    --include "cowork-env-$LUC_NGOAI.env.gpg" "$RCLONE_REMOTE" "$TAM/ngoai"
  NGUON="$TAM/ngoai"
  echo "✓ đã tải bộ $LUC_NGOAI từ $RCLONE_REMOTE"
fi

if [ -n "${TEP_DUMP:-}" ]; then
  DUMP="$TEP_DUMP"
else
  DUMP=""
  # Tên chứa mốc UTC dạng YYYYmmddTHHMMSSZ nên sắp theo tên là sắp theo thời gian.
  while IFS= read -r t; do
    l="${t##*/cowork-}"; l="${l%.dump}"
    if [ -f "$(dirname "$t")/cowork-dinh-kem-$l.tar.gz" ]; then DUMP="$t"; fi
  done < <(find "$NGUON" -maxdepth 1 -type f -name 'cowork-*.dump' | sort)
fi
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "❌ Không tìm thấy bộ sao lưu đầy đủ (dump + gói đính kèm) trong $NGUON"; exit 1; }
LUC="${DUMP##*/cowork-}"; LUC="${LUC%.dump}"
TEP_DK="$(dirname "$DUMP")/cowork-dinh-kem-$LUC.tar.gz"
TEP_ENV_MA="$(dirname "$DUMP")/cowork-env-$LUC.env.gpg"
echo "=== Thử phục hồi bộ $LUC ($(du -h "$DUMP" | cut -f1)) vào CSDL tạm $CSDL_TAM ==="

# ---------------------------------------------------------------------------
# 1. Phục hồi vào CSDL tạm
# ---------------------------------------------------------------------------
BUOC="tạo CSDL tạm"
# Đặt cờ TRƯỚC khi tạo: bị ngắt đúng lúc CREATE DATABASE vừa xong thì trap vẫn xóa (DROP … IF EXISTS).
DA_TAO_CSDL=1
chay_pg psql -X -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$CSDL_TAM\""

BUOC="pg_restore"
if ! chay_pg_csdl "$CSDL_TAM" pg_restore --no-owner --no-privileges < "$DUMP" 2> "$TAM/loi-phuc-hoi.txt"; then
  echo "❌ pg_restore báo lỗi:"
  head -20 "$TAM/loi-phuc-hoi.txt"
  exit 1
fi
echo "✓ pg_restore chạy hết, không lỗi"

# ---------------------------------------------------------------------------
# 2. Kiểm số liệu
# ---------------------------------------------------------------------------
BUOC="kiểm số liệu"
chay_pg_csdl "$CSDL_TAM" psql -X -A -t -F '|' -v ON_ERROR_STOP=1 > "$TAM/dem.txt" <<'SQL'
SELECT 'tenants', count(*) FROM tenants
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'invoices', count(*) FROM invoices
UNION ALL SELECT 'attachments', count(*) FROM attachments;
SQL
cat "$TAM/dem.txt" | sed 's/^/  /'
for bang in tenants users; do
  so="$(awk -F'|' -v b="$bang" '$1 == b { print $2 }' "$TAM/dem.txt")"
  if [ -z "$so" ] || [ "$so" -eq 0 ]; then
    echo "❌ Bảng $bang rỗng sau khi phục hồi"
    exit 1
  fi
done
MIG_CUOI="$(chay_pg_csdl "$CSDL_TAM" psql -X -A -t -c "SELECT max(migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
MIG_MA="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | tail -n1)"
echo "  migration cuối trong bản sao lưu: $MIG_CUOI"
[ "$MIG_CUOI" = "$MIG_MA" ] || echo "  ⚠ mã nguồn đang ở migration $MIG_MA — phục hồi thật xong phải chạy prisma migrate deploy"
SO_DINH_KEM_CSDL="$(awk -F'|' '$1 == "attachments" { print $2 }' "$TAM/dem.txt")"

# ---------------------------------------------------------------------------
# 3. Gói tệp đính kèm
# ---------------------------------------------------------------------------
BUOC="giải nén gói tệp đính kèm"
mkdir -p "$TAM/dk"
tar -xzf "$TEP_DK" -C "$TAM/dk"
SO_TEP="$(find "$TAM/dk" -type f | wc -l)"
SO_TEP_MUC_LUC="$(tar -tzf "$TEP_DK" | grep -c '[^/]$' || true)"
if [ "$SO_TEP" -ne "$SO_TEP_MUC_LUC" ]; then
  echo "❌ Gói đính kèm liệt kê $SO_TEP_MUC_LUC tệp nhưng giải nén ra $SO_TEP"
  exit 1
fi
echo "✓ gói đính kèm giải nén được: $SO_TEP tệp (CSDL ghi $SO_DINH_KEM_CSDL tệp đính kèm)"
if [ "${SO_DINH_KEM_CSDL:-0}" -gt 0 ] && [ "$SO_TEP" -eq 0 ]; then
  echo "❌ CSDL có $SO_DINH_KEM_CSDL tệp đính kèm nhưng gói tệp rỗng — THU_MUC_DINH_KEM của sao-luu.sh sai?"
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Bản .env mã hóa
# ---------------------------------------------------------------------------
BUOC="giải mã bản .env"
ENV_KQ="khong-co"
if [ -f "$TEP_ENV_MA" ]; then
  MAT_KHAU="$(doc_mat_khau_sao_luu)"
  if [ -z "$MAT_KHAU" ]; then
    echo "⚠ có bản .env mã hóa nhưng không có mật khẩu sao lưu trên máy này để thử giải mã"
    ENV_KQ="chua-thu"
  else
    mkdir -m 700 "$TAM/gnupg"
    GNUPGHOME="$TAM/gnupg" gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 \
      --decrypt "$TEP_ENV_MA" 3<<<"$MAT_KHAU" > "$TAM/env" 2>/dev/null \
      || { echo "❌ Không giải mã được $TEP_ENV_MA bằng mật khẩu sao lưu hiện tại"; exit 1; }
    grep -q '^APP_ENC_KEY=' "$TAM/env" || { echo "❌ Bản .env giải mã ra không có dòng APP_ENC_KEY="; exit 1; }
    ENV_KQ="giai-ma-duoc"
    echo "✓ bản .env giải mã được và có APP_ENC_KEY"
  fi
  unset MAT_KHAU
else
  echo "⚠ bộ $LUC không có bản .env mã hóa (chưa đặt mật khẩu sao lưu lúc sao lưu)"
fi

BUOC="ghi trạng thái"
ghi_nhip "thu-phuc-hoi" true "{\"bo\":\"$LUC\",\"migration\":\"$MIG_CUOI\",\"soTepDinhKem\":$SO_TEP,\"env\":\"$ENV_KQ\"}" || true
echo "✓ Thử phục hồi bộ $LUC đạt. CSDL tạm $CSDL_TAM sẽ được xóa."
