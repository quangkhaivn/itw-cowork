#!/usr/bin/env bash
# Sao lưu Cowork — chạy trên máy chủ, trong thư mục dự án (cron cài bởi trien-khai.sh, 02:15 mỗi đêm).
#
#   ./scripts/sao-luu.sh                 sao lưu một lần
#   GIU_NGAY=30 ./scripts/sao-luu.sh     giữ bản trên máy 30 ngày (mặc định 14)
#
# Mỗi lần chạy sinh ra, CÙNG một mốc thời gian UTC:
#   cowork-<LUC>.dump              pg_dump định dạng custom (nén sẵn, phục hồi chọn lọc được)
#   cowork-dinh-kem-<LUC>.tar.gz   thư mục tệp đính kèm ($THU_MUC_DINH_KEM, mặc định data/dinh-kem) —
#                                  LUÔN có, kể cả khi chưa có tệp nào, để bộ sao lưu nào cũng đủ phần
#   cowork-env-<LUC>.env.gpg       bản MÃ HÓA của .env (chứa APP_ENC_KEY — mất khóa này là mất mật khẩu
#                                  SMTP và 2 lớp đã lưu). Chỉ có khi đặt mật khẩu sao lưu (xem dưới)
# Quyền 600, thư mục 700 — chỉ root đọc được.
#
# Kiểm sau khi ghi: pg_restore đọc lại được mục lục và thấy dữ liệu users, audit_logs; tar liệt kê được
# gói tệp; gpg giải mã thử được bản .env. Một bản sao lưu chưa từng đọc lại được thì chưa phải bản sao lưu.
#
# Biến môi trường (đặt trong .env hoặc trước lệnh):
#   THU_MUC_SAO_LUU          nơi giữ bản sao lưu trên máy (mặc định /root/cowork-sao-luu)
#   GIU_NGAY                 số ngày giữ trên máy (mặc định 14)
#   THU_MUC_DINH_KEM         thư mục tệp đính kèm trên MÁY CHỦ (mặc định data/dinh-kem của dự án)
#   BACKUP_PASSPHRASE        mật khẩu mã hóa bản .env — hoặc để trong tệp BACKUP_PASSPHRASE_FILE
#                            (mặc định /root/.cowork-sao-luu-mat-khau, quyền 600). Không đặt = bỏ qua
#                            bản .env, kèm cảnh báo
#   RCLONE_REMOTE            đích chép ra NGOÀI máy cho rclone, ví dụ "cowork-crypt:sao-luu". Không đặt =
#                            cảnh báo to: bản sao lưu chỉ nằm trên cùng máy chủ
#   GIU_NGAY_NGOAI           số ngày giữ ở nơi ngoài máy (mặc định 30)
#   ALERT_WEBHOOK_URL / ALERT_EMAIL   kênh báo động khi hỏng (scripts/van-hanh-chung.sh)
#   SAO_LUU_KHONG_DOCKER=1   chạy pg_dump trực tiếp bằng DATABASE_URL_OWNER (máy phát triển / bài thử)
#   SAO_LUU_CHO_KHOA_GIAY    số giây chờ lần sao lưu khác đang chạy trước khi bỏ cuộc (mặc định 1800)
#   TEP_ENV                  tệp .env để nạp và sao lưu (mặc định .env)
#
# Kết quả ghi vào bảng system_heartbeats (dòng 'sao-luu') — màn hình Quản trị → Tự động hóa báo đỏ khi
# lần thành công cuối quá 26 giờ — và vào $THU_MUC_SAO_LUU/trang-thai.json. Hỏng ở bất kỳ bước nào:
# thoát mã khác 0, ghi trạng thái hỏng, gửi báo động.

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
GIU_NGAY="${GIU_NGAY:-14}"
GIU_NGAY_NGOAI="${GIU_NGAY_NGOAI:-30}"
LUC="$(date -u +%Y%m%dT%H%M%SZ)"
TEP="$THU_MUC/cowork-$LUC.dump"
TEP_DK="$THU_MUC/cowork-dinh-kem-$LUC.tar.gz"
TEP_ENV_MA="$THU_MUC/cowork-env-$LUC.env.gpg"
BUOC="chuẩn bị"
RA_NGOAI="chua-cau-hinh"
BAN_ENV="bo-qua"

mkdir -p "$THU_MUC"
chmod 700 "$THU_MUC"
umask 077

TAM="$(mktemp -d)"
ket_thuc() {
  local ma=$?
  rm -rf "$TAM"
  # Chỉ xóa tệp dở dang CỦA LẦN CHẠY NÀY. Không dùng "$THU_MUC"/*.dang-ghi: một lần chạy chờ khóa
  # quá hạn (hoặc máy không có flock) sẽ xóa mất tệp đang ghi của lần chạy kia (QA 0.16.1).
  rm -f "$TEP.dang-ghi" "$TEP_DK.dang-ghi" "$TEP_ENV_MA.dang-ghi" 2>/dev/null || true
  if [ "$ma" -ne 0 ]; then
    local loi="Sao lưu hỏng ở bước: $BUOC (mã $ma)"
    printf '{"luc":"%s","ok":false,"loi":%s}\n' "$LUC" "$(json_chuoi "$loi")" > "$THU_MUC/trang-thai.json" 2>/dev/null || true
    ghi_nhip "sao-luu" false "{\"luc\":\"$LUC\",\"loi\":$(json_chuoi "$loi")}" || true
    bao_dong "SAO LƯU HỎNG" "$loi. Xem /var/log/cowork-sao-luu.log trên máy chủ."
  fi
  exit "$ma"
}
trap ket_thuc EXIT
# Bị ngắt (Ctrl-C, kill, mất phiên SSH): bash chạy trap EXIT với $? = 0 nếu không bắt tín hiệu —
# lần sao lưu dở dang sẽ không bị ghi "hỏng" và không báo động (QA 0.16.1). Đổi tín hiệu thành mã lỗi.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Không cho hai lần sao lưu chồng nhau (cron 02:15 trùng lúc trien-khai.sh tự sao lưu).
BUOC="giữ khóa chạy một mình"
exec 9>"$THU_MUC/.khoa"
if command -v flock >/dev/null 2>&1; then
  CHO_KHOA="${SAO_LUU_CHO_KHOA_GIAY:-1800}"
  flock -w "$CHO_KHOA" 9 || { echo "❌ Một lần sao lưu khác đang chạy quá $CHO_KHOA giây"; exit 1; }
else
  echo "⚠ máy chủ không có lệnh flock — không chặn được hai lần sao lưu chạy chồng nhau (dnf install util-linux)"
fi

# ---------------------------------------------------------------------------
# 1. Cơ sở dữ liệu
# ---------------------------------------------------------------------------
BUOC="pg_dump"
echo "--- sao lưu CSDL → $TEP ---"
chay_pg pg_dump --format=custom --no-owner > "$TEP.dang-ghi"
mv "$TEP.dang-ghi" "$TEP"
chmod 600 "$TEP"

# Đọc lại mục lục: pg_restore phải đọc hết tệp không lỗi, và phải thấy dữ liệu của users và audit_logs.
# Ghi mục lục ra tệp trước rồi mới grep. KHÔNG dùng `pg_restore | grep -q`: grep -q thoát ngay khi
# khớp, pg_restore nhận SIGPIPE, và với `set -o pipefail` cả đường ống bị coi là hỏng — báo sai
# "không đọc lại được" một cách ngẫu nhiên (đã xảy ra trên máy thật 19/09).
BUOC="đọc lại tệp CSDL"
MUC_LUC="$TAM/muc-luc.txt"
if ! chay_pg_khong_ket_noi pg_restore --list < "$TEP" > "$MUC_LUC"; then
  echo "❌ pg_restore không đọc được tệp sao lưu: $TEP"
  exit 1
fi
for bang in users audit_logs; do
  if ! grep "TABLE DATA public $bang " "$MUC_LUC" > /dev/null; then
    echo "❌ Tệp sao lưu thiếu dữ liệu bảng $bang: $TEP"
    exit 1
  fi
done
echo "✓ CSDL đọc lại được: $(du -h "$TEP" | cut -f1), $(grep -c 'TABLE DATA' "$MUC_LUC") bảng có dữ liệu"

# ---------------------------------------------------------------------------
# 2. Tệp đính kèm — nằm trên đĩa, pg_dump không kéo theo. Thiếu gói này thì phục hồi xong sẽ có
#    bản ghi trỏ tới tệp không còn tồn tại.
# ---------------------------------------------------------------------------
BUOC="đóng gói tệp đính kèm"
DK="${THU_MUC_DINH_KEM:-data/dinh-kem}"
if [ -n "${THU_MUC_DINH_KEM:-}" ] && [ ! -d "$DK" ]; then
  # Đã khai báo rõ mà không thấy: thà hỏng to còn hơn lặng lẽ sao lưu một gói rỗng.
  echo "❌ THU_MUC_DINH_KEM=$DK không phải thư mục trên máy này"
  exit 1
fi
echo "--- đóng gói tệp đính kèm ($DK) → $TEP_DK ---"
if [ -d "$DK" ]; then
  # Gói theo tên thư mục cuối (thường là "dinh-kem/…"), không mang đường dẫn tuyệt đối của máy cũ.
  tar -C "$(dirname "$DK")" -czf "$TEP_DK.dang-ghi" "$(basename "$DK")"
else
  echo "⚠ chưa có thư mục $DK — gói rỗng để bộ sao lưu vẫn đủ phần"
  mkdir -p "$TAM/rong/dinh-kem"
  tar -C "$TAM/rong" -czf "$TEP_DK.dang-ghi" dinh-kem
fi
mv "$TEP_DK.dang-ghi" "$TEP_DK"
chmod 600 "$TEP_DK"
BUOC="đọc lại gói tệp đính kèm"
tar -tzf "$TEP_DK" > "$TAM/dk.txt"
echo "✓ tệp đính kèm đọc lại được: $(du -h "$TEP_DK" | cut -f1), $(grep -c '[^/]$' "$TAM/dk.txt" || true) tệp"

# ---------------------------------------------------------------------------
# 3. Bản mã hóa của .env (APP_ENC_KEY, AUTH_SECRET, mật khẩu CSDL)
# ---------------------------------------------------------------------------
BUOC="mã hóa .env"
MAT_KHAU="$(doc_mat_khau_sao_luu)"
if [ -z "$MAT_KHAU" ]; then
  echo "⚠ CHƯA ĐẶT MẬT KHẨU SAO LƯU (BACKUP_PASSPHRASE hoặc /root/.cowork-sao-luu-mat-khau) — KHÔNG sao lưu .env."
  echo "⚠ Mất máy chủ mà không có .env thì mất APP_ENC_KEY: mật khẩu SMTP và 2 lớp đã lưu không giải mã được."
elif ! command -v gpg >/dev/null 2>&1; then
  echo "❌ Đã đặt mật khẩu sao lưu nhưng máy chủ không có gpg (dnf install gnupg2)"
  exit 1
else
  # GNUPGHOME tạm: không đụng khóa của root, và gpg-agent không nhớ mật khẩu giữa hai bước dưới.
  mkdir -m 700 "$TAM/gnupg"
  GNUPGHOME="$TAM/gnupg" gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
      --symmetric --cipher-algo AES256 -o "$TEP_ENV_MA.dang-ghi" "$TEP_ENV" 3<<<"$MAT_KHAU"
  mv "$TEP_ENV_MA.dang-ghi" "$TEP_ENV_MA"
  chmod 600 "$TEP_ENV_MA"
  BUOC="giải mã thử .env"
  mkdir -m 700 "$TAM/gnupg2"
  GNUPGHOME="$TAM/gnupg2" gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 \
      --decrypt "$TEP_ENV_MA" 3<<<"$MAT_KHAU" 2>/dev/null | cmp -s - "$TEP_ENV" \
    || { echo "❌ Bản .env mã hóa không giải mã lại khớp tệp gốc"; exit 1; }
  BAN_ENV="da-ma-hoa"
  echo "✓ .env đã mã hóa và giải mã thử khớp: $TEP_ENV_MA"
fi
unset MAT_KHAU

# ---------------------------------------------------------------------------
# 4. Chép ra ngoài máy (rclone)
# ---------------------------------------------------------------------------
BUOC="chép ra ngoài máy"
CAC_TEP=("$TEP" "$TEP_DK")
[ -f "$TEP_ENV_MA" ] && CAC_TEP+=("$TEP_ENV_MA")
if [ -n "${CHEP_RA_NGOAI:-}" ]; then
  echo "⚠ CHEP_RA_NGOAI không còn dùng từ 0.16.1 — đặt RCLONE_REMOTE (xem DEPLOYMENT.md)."
fi
if [ -n "${RCLONE_REMOTE:-}" ] && ! command -v rclone >/dev/null 2>&1; then
  echo "❌ Đã đặt RCLONE_REMOTE=$RCLONE_REMOTE nhưng máy chủ chưa có lệnh rclone (dnf install rclone)."
  exit 1
fi
if [ -n "${RCLONE_REMOTE:-}" ]; then
  echo "--- chép ${#CAC_TEP[@]} tệp ra $RCLONE_REMOTE ---"
  for t in "${CAC_TEP[@]}"; do
    rclone copy --retries 3 --low-level-retries 10 "$t" "$RCLONE_REMOTE"
  done
  # Kiểm: mọi tệp vừa chép phải có mặt ở đích với đúng kích thước.
  BUOC="kiểm tệp ở nơi ngoài máy"
  rclone lsl --max-depth 1 "$RCLONE_REMOTE" > "$TAM/ngoai.txt"
  for t in "${CAC_TEP[@]}"; do
    kt="$(stat -c %s "$t")"
    if ! awk -v ten="$(basename "$t")" -v kt="$kt" '$NF == ten && $1 == kt { thay = 1 } END { exit !thay }' "$TAM/ngoai.txt"; then
      echo "❌ Không thấy $(basename "$t") (đúng $kt byte) ở $RCLONE_REMOTE"
      exit 1
    fi
  done
  RA_NGOAI="da-chep"
  echo "✓ đã chép ra ngoài máy và kiểm kích thước"
  BUOC="dọn bản cũ ở nơi ngoài máy"
  rclone delete --min-age "${GIU_NGAY_NGOAI}d" --include "cowork-*" "$RCLONE_REMOTE" \
    || echo "⚠ dọn bản cũ ở $RCLONE_REMOTE hỏng (không ảnh hưởng bản vừa chép)"
else
  echo ""
  echo "⚠⚠⚠ BẢN SAO LƯU CHỈ NẰM TRÊN MÁY CHỦ NÀY. Mất máy chủ (hỏng ổ, nhà cung cấp sự cố, bị xâm nhập)"
  echo "⚠⚠⚠ là mất cả dữ liệu lẫn bản sao lưu. Cài rclone và đặt RCLONE_REMOTE — DEPLOYMENT.md mục Sao lưu."
  echo ""
fi

# ---------------------------------------------------------------------------
# 5. Dọn bản cũ trên máy, ghi trạng thái
# ---------------------------------------------------------------------------
BUOC="dọn bản cũ trên máy"
for mau in 'cowork-*.dump' 'cowork-dinh-kem-*.tar.gz' 'cowork-env-*.env.gpg'; do
  find "$THU_MUC" -maxdepth 1 -type f -name "$mau" -mtime "+$GIU_NGAY" -print -delete | sed 's/^/  đã dọn: /'
done

BUOC="ghi trạng thái"
KICH_THUOC="$(stat -c %s "$TEP")"
INFO="{\"luc\":\"$LUC\",\"tep\":\"$(basename "$TEP")\",\"kichThuoc\":$KICH_THUOC,\"dinhKem\":\"$(basename "$TEP_DK")\",\"env\":\"$BAN_ENV\",\"raNgoai\":\"$RA_NGOAI\"}"
printf '%s\n' "${INFO%\}},\"ok\":true}" > "$THU_MUC/trang-thai.json"
ghi_nhip "sao-luu" true "$INFO" || true
echo "✓ xong. Đang giữ $(find "$THU_MUC" -maxdepth 1 -name 'cowork-*.dump' | wc -l) bản trên máy; ra ngoài máy: $RA_NGOAI; .env: $BAN_ENV."
