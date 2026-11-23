#!/usr/bin/env bash
# 0.23.0 (QĐ-201) — Tự sinh SOCIAL_MASTER_KEY (khóa chủ mã hóa bí mật mạng xã hội) vào tệp .env NẾU CHƯA CÓ.
# Không bao giờ đè khóa đã có: đổi khóa là mất mọi mật khẩu ứng dụng / App Secret đã lưu (muốn xoay khóa thì làm theo
# DEPLOYMENT.md → "Xoay SOCIAL_MASTER_KEY"). Không in khóa ra màn hình.
# Dùng: scripts/sinh-social-master-key.sh [đường dẫn .env]   (mặc định ./.env)
set -euo pipefail
TEP="${1:-.env}"
if [ ! -f "$TEP" ]; then
  echo "❌ Không thấy $TEP" >&2
  exit 1
fi
# QA 0.23.0: chỉ coi là "đã có" khi có giá trị thật — `SOCIAL_MASTER_KEY=""` / chỉ dấu cách là CHƯA có (app báo thiếu khóa).
if grep -qE '^SOCIAL_MASTER_KEY=["'"'"']?[A-Za-z0-9+/]' "$TEP"; then
  echo "✓ $TEP đã có SOCIAL_MASTER_KEY — giữ nguyên."
  exit 0
fi
KHOA="$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)"
# Bỏ dòng rỗng "SOCIAL_MASTER_KEY=" (nếu có) rồi thêm dòng mới; đảm bảo tệp kết thúc bằng xuống dòng trước khi nối.
TAM="$(mktemp)"
grep -vE '^SOCIAL_MASTER_KEY=\s*(""|'"''"')?\s*$' "$TEP" > "$TAM" || true
[ -s "$TAM" ] && [ -n "$(tail -c1 "$TAM")" ] && echo >> "$TAM"
{
  echo "# 0.23.0 — khóa chủ mã hóa bí mật mạng xã hội (tự sinh). SAO LƯU cùng .env; mất khóa = phải nhập lại mật khẩu ứng dụng / App Secret."
  echo "SOCIAL_MASTER_KEY=$KHOA"
} >> "$TAM"
cat "$TAM" > "$TEP"
rm -f "$TAM"
echo "✓ Đã sinh SOCIAL_MASTER_KEY vào $TEP (nhớ sao lưu .env)."
