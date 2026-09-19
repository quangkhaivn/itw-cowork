# Triển khai — TGTH Business Cowork

Cập nhật: 19/09/2026.

## Môi trường

| Môi trường | Nơi | Ghi chú |
|---|---|---|
| Thật (production) | VPS 123HOST, AlmaLinux 9.3, 2 CPU / 4 GB RAM / 60 GB; `https://thegioitinhoc.io.vn` | Mã ở `/root/cowork-itw`. SSH cổng **2018** (cổng 22 bị chặn) |
| Thử (staging) | **Chưa có.** | Máy hiện tại chạy cả website thử `itw-web`; thêm một bộ Cowork thứ hai sẽ thiếu RAM. Đề xuất: tách máy khi có dữ liệu kinh doanh thật (Phase 2 trở đi) |
| Phát triển | Máy trạm | PostgreSQL cục bộ, xem mục cuối |

## Kiến trúc triển khai

```
Internet ─▶ nginx máy chủ (:443, Let's Encrypt, /etc/nginx/conf.d/cowork.conf)
             └─▶ 127.0.0.1:8080 ─▶ nginx (Docker) ─▶ app:3000 (Next.js)
                                                  worker (cùng ảnh, khác lệnh)
                                                  db (PostgreSQL 16, ./data/postgres)
                                                  redis (./data/redis)
```

## Triển khai một phiên bản mới

1. Trên máy trạm: `npm run kiem-tra` (typecheck + lint + kiểm thử đơn vị + build) và `npm run thu:tich-hop` trên CSDL phát triển. Commit.
2. Đưa mã lên máy chủ — chỉ các tệp đã commit, **không** đè `.env` và `data/`:
   ```bash
   # Gỡ mã cũ (giữ .env, data/, prisma/migrations đã áp) rồi giải nén bản mới
   ssh -p 2018 root@<máy chủ> 'cd /root/cowork-itw && rm -rf src thu worker scripts prisma/seed'
   git archive --format=tar HEAD | ssh -p 2018 root@<máy chủ> 'tar -x -C /root/cowork-itw'
   ```
   Phải gỡ thư mục mã cũ trước: tệp đã xóa hoặc đổi chỗ trong bản mới (ví dụ `src/middleware.ts` → `src/proxy.ts`) mà còn sót lại sẽ làm bản dựng hỏng.
3. Trên máy chủ: `cd /root/cowork-itw && ./trien-khai.sh`. Bảy bước:
   1. dựng ảnh `cowork-itw:latest`
   2. bật db + redis, chờ sẵn sàng
   3. tạo/cập nhật vai `cowork_app` · **sao lưu CSDL** (có dữ liệu thì bắt buộc, đọc lại được mới đi tiếp)
   4. `prisma migrate deploy` bằng vai chủ sở hữu
   5. `prisma/rls.sql` — bật RLS cho mọi bảng có `tenant_id`, tự kiểm không sót bảng
   6. seed nền móng (không đè chỉnh sửa của người dùng)
   7. khởi động toàn bộ
4. Kiểm: `curl -s http://127.0.0.1:8080/khoe` → `{"ok":true,...}`; mở trang đăng nhập qua HTTPS; xem `docker compose logs app --tail 50`.

Script chạy lại nhiều lần được. Hỏng ở bước nào thì sửa nguyên nhân rồi chạy lại từ đầu.

## Sao lưu và phục hồi

**Sao lưu:** `./scripts/sao-luu.sh` → `/root/cowork-sao-luu/cowork-<UTC>.dump` (pg_dump định dạng custom, quyền 600, giữ 14 ngày). Script đọc lại mục lục tệp sau khi ghi; đọc không được thì báo hỏng.

Chạy hằng ngày bằng cron:
```
# /etc/cron.d/cowork-sao-luu
15 2 * * * root cd /root/cowork-itw && ./scripts/sao-luu.sh >> /var/log/cowork-sao-luu.log 2>&1
```

> **Giới hạn hiện tại:** bản sao lưu nằm trên cùng máy chủ. Mất máy chủ (hỏng ổ, nhà cung cấp sự cố, bị xâm nhập) là mất cả dữ liệu lẫn bản sao lưu. Cần Giám đốc chọn nơi cất ngoài máy (Google Drive của công ty, một VPS khác, hoặc kho đối tượng S3) rồi đặt biến `CHEP_RA_NGOAI` — việc `VD-068`.

**Phục hồi** (thử định kỳ, ít nhất mỗi quý, trên một CSDL tạm — không phục hồi đè lên CSDL thật khi chưa chắc):
```bash
cd /root/cowork-itw && set -a && . ./.env && set +a
# 1. Phục hồi thử vào CSDL tạm để kiểm tra
docker compose exec -T db createdb -U "$POSTGRES_USER" cowork_khoi_phuc_thu
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d cowork_khoi_phuc_thu --no-owner < /root/cowork-sao-luu/<tệp>.dump
docker compose exec -T db psql -U "$POSTGRES_USER" -d cowork_khoi_phuc_thu -c "select count(*) from users; select max(created_at) from audit_logs;"
docker compose exec -T db dropdb -U "$POSTGRES_USER" cowork_khoi_phuc_thu

# 2. Phục hồi thật (sự cố): dừng app + worker, phục hồi, chạy lại rls.sql, khởi động
docker compose stop app worker
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $POSTGRES_DB WITH (FORCE)"
docker compose exec -T db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner < /root/cowork-sao-luu/<tệp>.dump
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < prisma/rls.sql
docker compose up -d
```
`--no-owner` làm mọi bảng thuộc vai đang phục hồi (chủ sở hữu) — đúng mô hình, vì ứng dụng dùng `cowork_app`. Chạy lại `rls.sql` để cấp lại quyền cho `cowork_app`.

## Chiến lược migration

- Mỗi thay đổi schema là một migration có tên, sinh bằng `prisma migrate dev --create-only` trên máy trạm, **đọc lại SQL trước khi commit**.
- Ưu tiên thay đổi bổ sung (thêm bảng, thêm cột có mặc định, thêm chỉ mục). Đổi tên / xóa cột: làm hai bước qua hai lần triển khai (thêm cột mới + ghi cả hai → chuyển đọc → gỡ cột cũ).
- Dữ liệu chuyển đổi một lần viết thẳng trong migration (như bản 19/09 gán phạm vi dữ liệu cho quyền cũ).
- Trước khi triển khai migration có sửa dữ liệu: **diễn tập nâng cấp** — dựng CSDL giống hệt bản đang chạy (migration cũ + seed cũ), áp migration mới + seed mới, kiểm kết quả. Bản 19/09 đã diễn tập đúng như vậy.
- Không bao giờ chạy `prisma db push` hay `migrate dev` trên máy thật.

## Nhật ký, lỗi, sức khỏe

- `docker compose logs -f app` / `worker`. Lỗi ngoài dự kiến của API ghi dòng `[api] lỗi ngoài dự kiến`; trang lỗi hiện mã `digest` để tra log.
- Sức khỏe: `GET /khoe` (qua nginx) hoặc `/api/khoe` — kiểm kết nối CSDL, không lộ chi tiết lỗi.
- Nhật ký nghiệp vụ và an ninh: màn hình **Quản trị → Nhật ký kiểm toán**.

## Bẫy đã gặp trên máy chủ này

- nginx máy chủ là **1.20.1**: viết `listen 443 ssl http2;`, không dùng `http2 on;`.
- Chứng chỉ Let's Encrypt từng hết hạn vì `certbot-renew.timer` bật nhưng chưa được start. Kiểm `systemctl list-timers certbot*`.
- `prisma migrate deploy` trong container phải gắn `-v "$(pwd)/prisma:/app/prisma"` (script đã làm).
- Mạng từ Việt Nam ra npm hay đứt: Dockerfile đã nới thời gian chờ và thử lại 3 vòng.

## Không có Docker (máy trạm Windows)

Dùng bản nhị phân PostgreSQL (ví dụ gói `embedded-postgres`), khởi tạo cụm với `-E UTF8 --locale=C` (mặc định WIN1252 làm hỏng tiếng Việt), tạo hai vai `cowork_owner` và `cowork_app`, rồi làm theo README.
