# Triển khai — TGTH Business Cowork

Cập nhật: 27/09/2026.

## Môi trường

| Môi trường | Nơi | Ghi chú |
|---|---|---|
| Kho mã nguồn | [github.com/quangkhaivn/itw-cowork](https://github.com/quangkhaivn/itw-cowork) | Nhánh `master`. Từ 27/09/2026 là nơi máy chủ **kéo mã về**, thay vì nhận trực tiếp từ máy trạm |
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

## Thiết lập một lần — chuyển máy chủ sang kéo mã từ GitHub (27/09/2026)

Trước 27/09/2026, mã được đưa lên máy chủ trực tiếp từ máy trạm bằng `git archive | ssh` (xem mục "Cách cũ" bên dưới). Từ nay mã nguồn có ở GitHub (`quangkhaivn/itw-cowork`, riêng tư), nên máy chủ tự kéo về bằng `git pull` thay vì nhận từ máy trạm. Việc chuyển đổi này làm **một lần duy nhất**, chạy tay trên máy chủ (không tự động qua GitHub Actions — mọi lần triển khai vẫn cần người chạy tay `./trien-khai.sh`, đúng nguyên tắc "chỉ triển khai khi có người duyệt phạm vi cụ thể" ở PHẦN E của đặc tả):

```bash
ssh -p 2018 root@<máy chủ>
cd /root/cowork-itw

# Sao lưu thư mục hiện tại trước khi đổi cách quản lý mã — phòng khi git có vấn đề
cp -a /root/cowork-itw "/root/cowork-itw.sao-luu-truoc-git-$(date -u +%Y%m%d%H%M%S)"

git init
git remote add origin https://github.com/quangkhaivn/itw-cowork.git
git fetch origin
git checkout -B master origin/master

# Bắt buộc kiểm lại: .env, data/, .pgdata/ phải KHÔNG bị git đụng tới
# (đều nằm trong .gitignore) — status chỉ nên báo "nothing to commit" hoặc
# liệt kê đúng các tệp/thư mục đó dưới "Untracked", không phải "Changes".
git status
ls -la .env data/ 2>/dev/null
```

Nếu `git status` báo có thay đổi bất thường ở tệp mã nguồn (không phải `.env`/`data/`), dừng lại — nghĩa là bản đang chạy trên máy chủ đã bị sửa tay lệch khỏi commit đang có trên GitHub, cần đối chiếu trước khi tiếp tục, không âm thầm ghi đè.

Xác thực với GitHub: repo riêng tư nên `git fetch`/`git pull` cần thông tin đăng nhập. Dùng một trong hai cách, không đặt token dạng chữ thường trong `.git/config` nếu tránh được:
- **Personal access token phạm vi tối thiểu** (chỉ quyền đọc repo này) làm mật khẩu khi git hỏi, được credential helper của git lưu lại sau lần đầu.
- Hoặc SSH deploy key: tạo cặp khóa mới trên máy chủ (`ssh-keygen -t ed25519 -f ~/.ssh/itw_cowork_deploy -N ""`), thêm khóa công khai vào GitHub → repo → Settings → Deploy keys (chỉ quyền đọc), rồi đổi remote sang `git@github.com:quangkhaivn/itw-cowork.git` và cấu hình `~/.ssh/config` dùng đúng khóa đó.

## Triển khai một phiên bản mới

1. Trên máy trạm: `npm run kiem-tra` (typecheck + lint + kiểm thử đơn vị + build) và `npm run thu:tich-hop` trên CSDL phát triển. Commit và `git push origin master` lên GitHub.
2. Trên máy chủ, kéo đúng mã vừa push về — không đụng `.env`, `data/`, `.pgdata/`:
   ```bash
   ssh -p 2018 root@<máy chủ>
   cd /root/cowork-itw
   git fetch origin
   git log HEAD..origin/master --oneline   # xem trước sắp lên những commit nào
   git pull --ff-only origin master
   ```
   `--ff-only` để lệnh dừng và báo lỗi rõ ràng nếu nhánh trên máy chủ lệch khỏi GitHub (bị sửa tay, hoặc máy chủ đứng sau một nhánh khác), thay vì âm thầm merge hoặc tạo commit lạ trên máy chủ.

   **Cách cũ (trước 27/09/2026), giữ lại làm phương án dự phòng nếu GitHub không truy cập được từ máy chủ:**
   ```bash
   ssh -p 2018 root@<máy chủ> 'cd /root/cowork-itw && rm -rf src thu worker scripts prisma/seed'
   git archive --format=tar HEAD | ssh -p 2018 root@<máy chủ> 'tar -x -C /root/cowork-itw'
   ```
   Phải gỡ thư mục mã cũ trước: tệp đã xóa hoặc đổi chỗ trong bản mới (ví dụ `src/middleware.ts` → `src/proxy.ts`) mà còn sót lại sẽ làm bản dựng hỏng. Cách này không cần máy chủ có mạng ra GitHub, nhưng lại cần máy trạm SSH thẳng vào máy chủ.
3. Trên máy chủ: `cd /root/cowork-itw && ./trien-khai.sh`. Bảy bước:
   1. dựng ảnh `cowork-itw:latest`
   2. bật db + redis, chờ sẵn sàng
   3. tạo/cập nhật vai `cowork_app` · **sao lưu CSDL** (có dữ liệu thì bắt buộc, đọc lại được mới đi tiếp)
   4. `prisma migrate deploy` bằng vai chủ sở hữu
   5. `prisma/rls.sql` — bật RLS cho mọi bảng có `tenant_id`, tự kiểm không sót bảng
   6. seed nền móng (không đè chỉnh sửa của người dùng)
   7. khởi động toàn bộ
4. Kiểm: `curl -s http://127.0.0.1:8080/khoe` → `{"ok":true,...}`; mở trang đăng nhập qua HTTPS; xem `docker compose logs app --tail 50`.
5. **Xác nhận đúng bản vừa gửi lên**: dòng cuối của `trien-khai.sh` in số phiên bản và **mã bản dựng**. Xem lại bất cứ lúc nào ở *Quản trị → Cấu hình*, hoặc `GET /api/v1/phien-ban` sau khi đăng nhập. Mã bản dựng đổi mỗi lần dựng, nên nó — chứ không phải số phiên bản — mới nói được mã đang chạy có đúng là mã vừa gửi không.

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

### Nâng cấp lên 0.3.0 (Phase 2 — CRM)

- Migration `20260919171944_phase2_crm`: chỉ thêm 7 bảng, không sửa dữ liệu cũ, trừ một câu `INSERT … ON CONFLICT DO NOTHING` cấp `sales.approve` cho vai trò dựng sẵn `sales-manager`.
- Cần extension `pg_trgm`: có sẵn trong ảnh `postgres:16` chính thức; migration tự `CREATE EXTENSION IF NOT EXISTS` bằng vai chủ sở hữu (là superuser của container). Phục hồi từ bản sao lưu cũng tự tạo lại extension.
- Đã diễn tập 20/09 trên máy trạm: CSDL ở trạng thái Phase 1 có dữ liệu (2 tenant, 14 người dùng, 1.186 dòng quyền) → áp migration → `rls.sql` → seed mới. Người dùng giữ nguyên; cả hai tenant nhận `sales.approve`; RLS bật trên cả 7 bảng mới.
- Sau khi lên máy thật: đăng nhập, mở lần lượt Khách hàng, Lead, Pipeline, Cơ hội, Công việc. **Không tạo khách thử trong tenant `itw`** — mã KH đã cấp không lấy lại được, và dữ liệu thử sẽ lẫn vào báo cáo. Bản ghi đầu tiên nên là khách thật.

## Nhật ký, lỗi, sức khỏe

- `docker compose logs -f app` / `worker`. Lỗi ngoài dự kiến của API ghi dòng `[api] lỗi ngoài dự kiến`; trang lỗi hiện mã `digest` để tra log.
- Sức khỏe: `GET /khoe` (qua nginx) hoặc `/api/khoe` — kiểm kết nối CSDL, không lộ chi tiết lỗi.
- Nhật ký nghiệp vụ và an ninh: màn hình **Quản trị → Nhật ký kiểm toán**.

## Bẫy đã gặp trên máy chủ này

- nginx máy chủ là **1.20.1**: viết `listen 443 ssl http2;`, không dùng `http2 on;`.
- Chứng chỉ Let's Encrypt từng hết hạn vì `certbot-renew.timer` bật nhưng chưa được start. Kiểm `systemctl list-timers certbot*`.
- `prisma migrate deploy` trong container phải gắn `-v "$(pwd)/prisma:/app/prisma"` (script đã làm).
- Mạng từ Việt Nam ra npm hay đứt: Dockerfile đã nới thời gian chờ và thử lại 3 vòng.
- **502 sau khi triển khai (19/09):** container `app` tạo lại đổi IP, `worker` lấy mất IP cũ, nginx vẫn gửi vào IP cũ. Đã sửa: nginx phân giải lại tên `app` qua DNS Docker mỗi 10 giây (`resolver 127.0.0.11` + biến trong `proxy_pass`); `trien-khai.sh` kiểm cú pháp, nạp lại nginx và chờ `/khoe` trả 200 mới báo xong.
- **Gắn một tệp cấu hình vào container giữ inode cũ** — thay tệp bằng `tar`/`scp` thì container không thấy. `docker-compose.yml` nay gắn cả thư mục `nginx/`.
- **`./trien-khai.sh: Permission denied` (21/09):** Git trên Windows không theo dõi bit thực thi, nên tệp được commit ở chế độ 644; `git archive` giữ nguyên chế độ đó và `tar` giải nén ra tệp không chạy được. Đã sửa bằng `git update-index --chmod=+x trien-khai.sh`. **Thêm tệp `.sh` mới thì kiểm `git ls-files -s -- '*.sh'` phải thấy `100755`.**
- **Đưa lệnh cho máy trạm Windows:** người dùng chạy PowerShell 5.1 — không có `&&` (dùng `;`), và **`git archive | ssh` qua đường ống PowerShell làm hỏng tệp tar** vì byte bị chuyển thành văn bản. Dùng `git archive -o <tệp>` rồi `scp` (`scp` dùng `-P` hoa, `ssh` dùng `-p` thường).
- **Không dò được máy thật đang chạy bản nào từ bên ngoài:** proxy đẩy mọi đường dẫn chưa đăng nhập về `/dang-nhap`, kể cả đường không tồn tại, nên mã 307 không chứng minh route có thật; `/api/khoe` cố ý không trả phiên bản. **Từ bản 0.14.1** có `GET /api/v1/phien-ban` (phải đăng nhập) và khối phiên bản ở *Quản trị → Cấu hình*.
- **Kiểm tệp sao lưu:** không dùng `pg_restore --list | grep -q` dưới `set -o pipefail` — grep thoát sớm làm pg_restore nhận SIGPIPE, báo hỏng ngẫu nhiên. Ghi mục lục ra tệp rồi mới tìm.

## Không có Docker (máy trạm Windows)

Dùng bản nhị phân PostgreSQL (ví dụ gói `embedded-postgres`), khởi tạo cụm với `-E UTF8 --locale=C` (mặc định WIN1252 làm hỏng tiếng Việt), tạo hai vai `cowork_owner` và `cowork_app`, rồi làm theo README.
