#!/usr/bin/env bash
# Hàm dùng chung cho scripts/sao-luu.sh và scripts/thu-phuc-hoi.sh (0.16.1). KHÔNG chạy trực tiếp —
# được `source` sau khi đã `cd` về thư mục dự án và nạp .env.
#
# Biến môi trường đọc ở đây:
#   SAO_LUU_KHONG_DOCKER=1   chạy pg_dump/psql trực tiếp bằng DATABASE_URL_OWNER thay vì
#                            `docker compose exec db` (máy phát triển, bài thử, cài không Docker)
#   ALERT_WEBHOOK_URL        URL nhận báo động (POST JSON {"text": …}) — Slack, Google Chat, Discord…
#   ALERT_EMAIL              địa chỉ nhận báo động qua `sendmail` của máy chủ (nếu có cài)

# Chạy một lệnh client PostgreSQL (pg_dump, psql, createdb…) với kết nối của vai chủ sở hữu.
# Cách dùng: chay_pg <lệnh> [tham số…] — tham số kết nối tự thêm vào sau tên lệnh.
chay_pg() {
  local lenh="$1"; shift
  if [ "${SAO_LUU_KHONG_DOCKER:-0}" = "1" ]; then
    : "${DATABASE_URL_OWNER:?thiếu DATABASE_URL_OWNER}"
    # Prisma thêm ?schema=public — libpq không hiểu tham số này.
    "$lenh" -d "${DATABASE_URL_OWNER%%\?*}" "$@"
  else
    docker compose exec -T db "$lenh" -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
  fi
}

# Như chay_pg nhưng nối tới CSDL tên khác (CSDL tạm của bài thử phục hồi).
chay_pg_csdl() {
  local csdl="$1" lenh="$2"; shift 2
  if [ "${SAO_LUU_KHONG_DOCKER:-0}" = "1" ]; then
    local goc="${DATABASE_URL_OWNER%%\?*}"
    "$lenh" -d "${goc%/*}/$csdl" "$@"
  else
    docker compose exec -T db "$lenh" -U "$POSTGRES_USER" -d "$csdl" "$@"
  fi
}

# Lệnh không cần kết nối (pg_restore --list) — chạy trong container db cho khớp phiên bản PostgreSQL.
chay_pg_khong_ket_noi() {
  if [ "${SAO_LUU_KHONG_DOCKER:-0}" = "1" ]; then
    "$@"
  else
    docker compose exec -T db "$@"
  fi
}

# Thoát chuỗi cho JSON (đủ cho câu báo lỗi một dòng / nhiều dòng tiếng Việt).
json_chuoi() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  s="${s//$'\t'/ }"
  printf '"%s"' "$s"
}

# Ghi một dòng nhịp vào system_heartbeats bằng vai chủ sở hữu.
#   ghi_nhip <tên> <true|false> <json info>
# Bảng chưa có (lần triển khai đầu, trước migrate 0.16.1) thì chỉ cảnh báo — không làm hỏng việc chính.
ghi_nhip() {
  local ten="$1" ok="$2" info="$3"
  if ! chay_pg psql -X -q -v ON_ERROR_STOP=1 -v ten="$ten" -v ok="$ok" -v info="$info" >/dev/null 2>&1 <<'SQL'
INSERT INTO system_heartbeats (name, last_at, ok, last_ok_at, info)
VALUES (:'ten', now(), :ok, CASE WHEN :ok THEN now() ELSE NULL END, :'info'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  last_at = now(),
  ok = EXCLUDED.ok,
  last_ok_at = CASE WHEN EXCLUDED.ok THEN now() ELSE system_heartbeats.last_ok_at END,
  info = EXCLUDED.info;
SQL
  then
    echo "⚠ không ghi được trạng thái '$ten' vào system_heartbeats (CSDL chưa có bảng của 0.16.1, hoặc CSDL không chạy)" >&2
    return 1
  fi
}

# Gửi báo động ra ngoài. Không có kênh nào thì kêu to trong nhật ký — cron vẫn ghi lại.
#   bao_dong <tiêu đề> <nội dung>
bao_dong() {
  local tieu_de="$1" noi_dung="$2" may
  may="$(hostname 2>/dev/null || echo may-chu)"
  local cau="[TGTH Cowork @ $may] $tieu_de — $noi_dung"
  echo "🚨 $cau" >&2
  command -v logger >/dev/null 2>&1 && logger -t cowork-van-hanh -- "$cau" || true
  local da_gui=0
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    local than
    than="{\"text\":$(json_chuoi "$cau"),\"content\":$(json_chuoi "$cau")}"
    if curl -fsS -m 20 --retry 2 -H 'content-type: application/json' -d "$than" "$ALERT_WEBHOOK_URL" >/dev/null; then
      da_gui=1
    else
      echo "⚠ gửi báo động tới ALERT_WEBHOOK_URL hỏng" >&2
    fi
  fi
  if [ -n "${ALERT_EMAIL:-}" ]; then
    local sm
    sm="$(command -v sendmail || echo /usr/sbin/sendmail)"
    if [ -x "$sm" ]; then
      if printf 'To: %s\nSubject: %s\nContent-Type: text/plain; charset=UTF-8\n\n%s\n' \
           "$ALERT_EMAIL" "[Cowork] $tieu_de" "$cau" | "$sm" -t; then
        da_gui=1
      else
        echo "⚠ gửi thư báo động hỏng (sendmail)" >&2
      fi
    else
      echo "⚠ đặt ALERT_EMAIL nhưng máy chủ không có sendmail" >&2
    fi
  fi
  if [ "$da_gui" = "0" ]; then
    echo "⚠⚠ CHƯA CẤU HÌNH KÊNH BÁO ĐỘNG (ALERT_WEBHOOK_URL / ALERT_EMAIL) — lỗi này chỉ nằm trong nhật ký." >&2
  fi
}

# Đọc mật khẩu mã hóa bản sao lưu: biến BACKUP_PASSPHRASE, hoặc tệp BACKUP_PASSPHRASE_FILE
# (mặc định /root/.cowork-sao-luu-mat-khau nếu có). In ra stdout; rỗng = chưa đặt.
doc_mat_khau_sao_luu() {
  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    printf '%s' "$BACKUP_PASSPHRASE"
    return
  fi
  local tep="${BACKUP_PASSPHRASE_FILE:-/root/.cowork-sao-luu-mat-khau}"
  if [ -r "$tep" ]; then
    head -n1 "$tep" | tr -d '\r\n'
  fi
}
