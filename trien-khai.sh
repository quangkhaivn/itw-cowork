#!/usr/bin/env bash
# Triển khai Cowork Business OS — ITW
#
# Chạy trên máy chủ, trong thư mục dự án:
#   ./trien-khai.sh
#
# Các bước: dựng ảnh → chờ database → tạo vai ứng dụng → SAO LƯU → migrate → bật RLS → seed → khởi động.
# Chạy lại nhiều lần được: mọi bước đều idempotent.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "❌ Thiếu tệp .env. Chép từ .env.example rồi điền giá trị thật."
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${POSTGRES_USER:?thiếu POSTGRES_USER}"
: "${POSTGRES_DB:?thiếu POSTGRES_DB}"
: "${APP_DB_PASSWORD:?thiếu APP_DB_PASSWORD}"

echo "=== 1/7 Dựng ảnh ==="
docker compose build app

echo "=== 2/7 Khởi động database và redis ==="
docker compose up -d db redis

echo "--- chờ database sẵn sàng ---"
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    echo "database sẵn sàng sau ${i}s"; break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then echo "❌ database không lên sau 60s"; exit 1; fi
done

echo "=== 3/7 Tạo vai ứng dụng cowork_app (không phải chủ sở hữu — để RLS có hiệu lực) ==="
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v mk="$APP_DB_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cowork_app') THEN
    CREATE ROLE cowork_app LOGIN;
  END IF;
END $$;
SQL
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "ALTER ROLE cowork_app WITH PASSWORD '$APP_DB_PASSWORD'"
echo "vai cowork_app sẵn sàng"

echo "--- sao lưu trước khi migrate (nếu đã có dữ liệu) ---"
# Không bao giờ chạy migration lên dữ liệu thật mà không có bản sao lưu vừa đọc lại được.
# Lần triển khai đầu (chưa có bảng) thì bỏ qua.
if docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
     "SELECT to_regclass('public.users') IS NOT NULL" | grep -q t; then
  ./scripts/sao-luu.sh
else
  echo "chưa có bảng nào — bỏ qua sao lưu"
fi

echo "=== 4/7 Chạy migration (bằng vai chủ sở hữu) ==="
# Dọn thư mục migration rỗng do lần chạy hỏng trước để lại. Nếu để nguyên,
# Prisma sẽ coi là "đã có migration", áp dụng một tệp rỗng rồi báo thành công
# trong khi không có bảng nào được tạo — lỗi này đã xảy ra thật.
for thu_muc in prisma/migrations/*/; do
  [ -d "$thu_muc" ] || continue
  if [ ! -s "${thu_muc}migration.sql" ]; then
    echo "--- gỡ migration rỗng: $thu_muc ---"
    rm -rf "$thu_muc"
  fi
done

# Lần đầu chưa có migration nào: sinh migration nền thẳng từ schema.prisma, để
# tệp SQL luôn khớp schema thay vì viết tay rồi lệch nhau.
if [ ! -d prisma/migrations ] || [ -z "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "--- chưa có migration, sinh migration nền từ schema ---"
  THU_MUC="prisma/migrations/$(date -u +%Y%m%d%H%M%S)_nen_mong"
  mkdir -p "$THU_MUC"
  # Lọc bỏ dòng thông báo của Prisma CLI để tệp SQL chỉ còn SQL.
  docker compose run --rm -T app \
    npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script 2>/dev/null \
    | grep -v '^Loaded Prisma config' \
    > "$THU_MUC/migration.sql"
  # Phải có CREATE TABLE thật, không chỉ cần khác rỗng.
  if ! grep -q "CREATE TABLE" "$THU_MUC/migration.sql"; then
    echo "❌ Migration nền sinh ra không có CREATE TABLE nào. Nội dung:"
    head -20 "$THU_MUC/migration.sql"
    rm -rf "$THU_MUC"
    exit 1
  fi
  printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml
  echo "đã sinh $THU_MUC/migration.sql ($(wc -l < "$THU_MUC/migration.sql") dòng)"
fi

# Gắn thư mục prisma của máy chủ vào container. Bắt buộc: migration vừa sinh nằm
# trên máy chủ, còn ảnh Docker đã nướng sẵn mã từ lúc build nên không thấy tệp mới.
# Thiếu dòng -v này, Prisma báo "No migration found" rồi kết thúc êm ru mà không tạo bảng nào.
docker compose run --rm \
  -v "$(pwd)/prisma:/app/prisma" \
  -e DATABASE_URL="$DATABASE_URL_OWNER" \
  app npx prisma migrate deploy

echo "=== 5/7 Bật Row Level Security và cấp quyền ==="
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < prisma/rls.sql
echo "RLS đã bật"

echo "=== 6/7 Seed nền móng ==="
# Seed chạy bằng vai chủ sở hữu (bỏ qua RLS) và cần thông tin tài khoản quản trị.
# Truyền bằng -e chứ không đưa vào `environment:` của dịch vụ app, để mật khẩu
# seed không nằm thường trực trong container đang chạy.
docker compose run --rm \
  -e DATABASE_URL_OWNER="$DATABASE_URL_OWNER" \
  -e SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" \
  -e SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
  app npm run db:seed

echo "=== 7/7 Khởi động toàn bộ ==="
docker compose up -d
# Nạp lại cấu hình nginx trong Docker: `up -d` không tạo lại nginx khi chỉ tệp gắn ngoài
# nginx/cowork.conf thay đổi. Kiểm cú pháp trước, sai thì dừng chứ không nạp cấu hình hỏng.
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

echo "--- chờ ứng dụng trả lời qua nginx ---"
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1:8080/khoe; then echo "ứng dụng sẵn sàng sau ${i}s"; break; fi
  sleep 1
  if [ "$i" -eq 60 ]; then echo "❌ /khoe không trả 200 sau 60s — xem: docker compose logs app nginx"; exit 1; fi
done

PHIEN_BAN=$(node -p "require('./package.json').version" 2>/dev/null || echo "khong ro")
MA_BAN_DUNG=$(docker compose exec -T app cat .next/BUILD_ID 2>/dev/null || echo "khong doc duoc")

echo ""
echo "=== Xong. Đang chạy bản $PHIEN_BAN (mã bản dựng $MA_BAN_DUNG) ==="
echo "Xem lại bất cứ lúc nào: Quản trị → Cấu hình, hoặc GET /api/v1/phien-ban sau khi đăng nhập."
echo ""
echo "=== Lịch sao lưu (0.16.1) ==="
# Cài /etc/cron.d/cowork-sao-luu — CHỈ khi chạy bằng root trên máy chủ có cron. Ghi lại mỗi lần triển
# khai (idempotent): nội dung giống thì không đụng, khác thì thay và in rõ. Sửa lịch ở ĐÂY, đừng sửa
# tay tệp trong /etc/cron.d (lần triển khai sau sẽ ghi đè).
THU_MUC_DU_AN="$(pwd)"
if [ "$(id -u)" -eq 0 ] && [ -d /etc/cron.d ]; then
  TEP_CRON=/etc/cron.d/cowork-sao-luu
  CRON_MOI="$(mktemp)"
  {
    echo "# Cài bởi $THU_MUC_DU_AN/trien-khai.sh — sửa ở đó, không sửa tay (bị ghi đè lần triển khai sau)."
    echo "SHELL=/bin/bash"
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    echo "# Sao lưu CSDL + tệp đính kèm + .env mã hóa, chép ra ngoài máy (rclone) — 02:15 mỗi đêm."
    echo "15 2 * * * root cd $THU_MUC_DU_AN && ./scripts/sao-luu.sh >> /var/log/cowork-sao-luu.log 2>&1"
    if [ "${THU_PHUC_HOI_HANG_TUAN:-0}" = "1" ]; then
      echo "# Thử phục hồi bản mới nhất vào CSDL tạm — 03:30 Chủ nhật (THU_PHUC_HOI_HANG_TUAN=1 trong .env)."
      echo "30 3 * * 0 root cd $THU_MUC_DU_AN && ./scripts/thu-phuc-hoi.sh >> /var/log/cowork-thu-phuc-hoi.log 2>&1"
    else
      echo "# Thử phục hồi hằng tuần: đặt THU_PHUC_HOI_HANG_TUAN=1 trong .env rồi chạy lại trien-khai.sh."
    fi
  } > "$CRON_MOI"
  if [ -f "$TEP_CRON" ] && cmp -s "$CRON_MOI" "$TEP_CRON"; then
    echo "lịch sao lưu đã đúng: $TEP_CRON"
    rm -f "$CRON_MOI"
  else
    install -m 644 -o root -g root "$CRON_MOI" "$TEP_CRON"
    rm -f "$CRON_MOI"
    echo "✓ đã cài/cập nhật lịch sao lưu: $TEP_CRON"
    sed 's/^/    /' "$TEP_CRON"
  fi
  # Xoay vòng nhật ký để /var/log không đầy dần.
  if [ -d /etc/logrotate.d ]; then
    TEP_XOAY=/etc/logrotate.d/cowork-sao-luu
    XOAY_MOI="$(mktemp)"
    printf '%s\n' "/var/log/cowork-sao-luu.log /var/log/cowork-thu-phuc-hoi.log {" "    monthly" "    rotate 12" "    compress" "    missingok" "    notifempty" "}" > "$XOAY_MOI"
    if [ -f "$TEP_XOAY" ] && cmp -s "$XOAY_MOI" "$TEP_XOAY"; then rm -f "$XOAY_MOI"; else install -m 644 "$XOAY_MOI" "$TEP_XOAY"; rm -f "$XOAY_MOI"; echo "✓ đã cài xoay vòng nhật ký: $TEP_XOAY"; fi
  fi
  [ -n "${RCLONE_REMOTE:-}" ] || echo "⚠⚠ RCLONE_REMOTE chưa đặt — bản sao lưu chỉ nằm trên máy chủ này. Xem DEPLOYMENT.md mục Sao lưu."
  [ -n "${ALERT_WEBHOOK_URL:-}${ALERT_EMAIL:-}" ] || echo "⚠⚠ ALERT_WEBHOOK_URL / ALERT_EMAIL chưa đặt — sao lưu hỏng sẽ không báo cho ai."
else
  echo "không chạy bằng root (hoặc không có /etc/cron.d) — bỏ qua cài lịch sao lưu. Trên máy chủ thật hãy chạy bằng root."
fi

echo ""
echo "=== Kiểm tra: ==="
docker compose ps
echo ""
echo "Sức khỏe: curl -s http://127.0.0.1:8080/khoe   (\"worker\":\"ok\" sau khoảng 1 phút)"
