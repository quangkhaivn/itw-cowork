# Triển khai — TGTH Business Cowork

Cập nhật: 14/10/2026 (0.16.1 — vận hành bền vững: sao lưu ra ngoài máy, thử phục hồi, nhịp worker, giới hạn tốc độ ở nginx).

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

Từ 0.16.1 (QĐ-88). Script: `scripts/sao-luu.sh` (sao lưu), `scripts/thu-phuc-hoi.sh` (thử phục hồi vào CSDL tạm), hàm chung `scripts/van-hanh-chung.sh`.

### Mỗi lần sao lưu sinh ra gì

Cùng một mốc thời gian UTC `<LUC>` (ví dụ `20261015T021500Z`), trong `$THU_MUC_SAO_LUU` (mặc định `/root/cowork-sao-luu`, quyền 700, tệp 600):

| Tệp | Nội dung | Kiểm sau khi ghi |
|---|---|---|
| `cowork-<LUC>.dump` | `pg_dump --format=custom --no-owner` | `pg_restore --list` đọc hết, thấy dữ liệu `users`, `audit_logs` |
| `cowork-dinh-kem-<LUC>.tar.gz` | thư mục tệp đính kèm `$THU_MUC_DINH_KEM` (mặc định `data/dinh-kem`, chính là thư mục gắn vào container `app`). **Luôn có**, kể cả khi rỗng | `tar -tzf` liệt kê được |
| `cowork-env-<LUC>.env.gpg` | `.env` mã hóa đối xứng AES-256 bằng gpg (chứa `APP_ENC_KEY`, `AUTH_SECRET`, mật khẩu CSDL). Chỉ có khi đã đặt mật khẩu sao lưu | giải mã thử, so khớp từng byte với `.env` |

Kết quả ghi vào bảng `system_heartbeats` (dòng `sao-luu`, bằng vai chủ sở hữu — ứng dụng không ghi được dòng này) và `$THU_MUC_SAO_LUU/trang-thai.json`. Màn hình **Quản trị → Tự động hóa** hiện lần sao lưu thành công gần nhất và **báo đỏ** khi quá 26 giờ, khi lần gần nhất hỏng, khi chưa chép ra ngoài máy hoặc chưa sao lưu `.env`.

Hỏng ở bất kỳ bước nào: script thoát mã khác 0, ghi trạng thái hỏng, **gửi báo động** (xem dưới). Hai lần sao lưu không chạy chồng nhau (`flock`). Giữ trên máy `GIU_NGAY` ngày (mặc định 14), ngoài máy `GIU_NGAY_NGOAI` ngày (mặc định 30).

### Lịch chạy

`./trien-khai.sh` (chạy bằng root) tự cài `/etc/cron.d/cowork-sao-luu` — ghi lại mỗi lần triển khai, giống thì không đụng:
```
15 2 * * * root cd /root/cowork-itw && ./scripts/sao-luu.sh >> /var/log/cowork-sao-luu.log 2>&1
# chỉ khi .env có THU_PHUC_HOI_HANG_TUAN=1:
30 3 * * 0 root cd /root/cowork-itw && ./scripts/thu-phuc-hoi.sh >> /var/log/cowork-thu-phuc-hoi.log 2>&1
```
kèm `/etc/logrotate.d/cowork-sao-luu`. Muốn đổi giờ thì sửa trong `trien-khai.sh`, **không** sửa tay tệp cron (bị ghi đè). `trien-khai.sh` vẫn tự sao lưu trước khi migrate như cũ.

### Thiết lập một lần trên máy chủ thật (Giám đốc / người vận hành)

**1. Mật khẩu sao lưu** (mã hóa bản `.env`):
```bash
openssl rand -base64 32 > /root/.cowork-sao-luu-mat-khau
chmod 600 /root/.cowork-sao-luu-mat-khau
cat /root/.cowork-sao-luu-mat-khau   # chép vào trình quản lý mật khẩu của công ty NGAY BÂY GIỜ
```
Script đọc `BACKUP_PASSPHRASE` (nếu đặt) hoặc tệp `BACKUP_PASSPHRASE_FILE` (mặc định `/root/.cowork-sao-luu-mat-khau`). **Không** đặt mật khẩu này trong `.env`: bản `.env` mã hóa bằng chính mật khẩu nằm trong nó thì mất máy chủ là không mở được. Lưu ít nhất hai nơi ngoài máy chủ (trình quản lý mật khẩu + giấy niêm phong trong két). Mất mật khẩu = các bản `.env.gpg` vô dụng (bản CSDL và tệp đính kèm vẫn dùng được). Máy chủ cần `gpg` (`dnf install gnupg2`, AlmaLinux có sẵn).

**2. Chép ra ngoài máy bằng rclone** — bắt buộc trên thực tế: không có bước này, mất máy chủ là mất cả bản sao lưu.
```bash
dnf install -y rclone            # hoặc: curl https://rclone.org/install.sh | bash
rclone config                    # tạo remote, ví dụ "gdrive" (Google Drive của công ty) hoặc "b2" (Backblaze B2)
```
- **Google Drive**: chọn `drive`, phạm vi `drive.file`; máy chủ không có trình duyệt thì chạy `rclone authorize "drive"` trên máy trạm rồi dán mã vào. Nên dùng một tài khoản Google riêng của công ty cho sao lưu, không dùng tài khoản cá nhân.
- **Backblaze B2 / S3**: tạo application key **chỉ có quyền trên một bucket**; bật Object Lock / lifecycle nếu muốn chống xóa.
- **Bắt buộc bọc thêm một remote `crypt`** trên remote vừa tạo (`rclone config` → `crypt`, trỏ tới `gdrive:cowork-sao-luu`), mật khẩu crypt lưu cùng chỗ mật khẩu sao lưu ở bước 1. Bản CSDL chứa dữ liệu khách hàng (Nghị định 13/2023) — không đưa lên dịch vụ ngoài ở dạng đọc được.
- Thêm vào `.env`: `RCLONE_REMOTE=cowork-crypt:` (tên remote crypt), tùy chọn `GIU_NGAY_NGOAI=60`.
- Thử ngay: `./scripts/sao-luu.sh` phải in `✓ đã chép ra ngoài máy và kiểm kích thước`; rồi `THU_PHUC_HOI_TU_NGOAI=1 ./scripts/thu-phuc-hoi.sh` (tải bộ mới nhất từ ngoài về và phục hồi thử).
- **Giữ bản sao `~/.config/rclone/rclone.conf`** cùng chỗ mật khẩu: máy chủ mới cần nó (hoặc cấu hình lại) để tải bản sao lưu về.
- Đã đặt `RCLONE_REMOTE` mà máy chủ không có `rclone` → sao lưu báo **hỏng** (có chủ đích). Biến cũ `CHEP_RA_NGOAI` không còn dùng.

**3. Kênh báo động** — thêm vào `.env` ít nhất một:
- `ALERT_WEBHOOK_URL=https://…` — script POST JSON `{"text": "...", "content": "..."}`: hợp với Slack / Google Chat / Discord incoming webhook (Telegram cần một dịch vụ chuyển tiếp).
- `ALERT_EMAIL=giamdoc@…` — gửi qua `sendmail` của máy chủ (cần cài `postfix` hoặc `msmtp-mta` có cấu hình gửi ra ngoài).

Thử: `ALERT_WEBHOOK_URL=… THU_MUC_DINH_KEM=/khong/co ./scripts/sao-luu.sh` → phải nhận được tin "SAO LƯU HỎNG" (sau đó chạy lại bình thường để trạng thái về xanh).

**4.** Chạy lại `./trien-khai.sh` (hoặc chỉ `./scripts/sao-luu.sh`) và mở *Quản trị → Tự động hóa*: thẻ "Sao lưu thành công gần nhất" có giờ, không còn băng đỏ. Tùy chọn: `THU_PHUC_HOI_HANG_TUAN=1` trong `.env` rồi chạy lại `trien-khai.sh` để cài lịch thử phục hồi hằng tuần.

### Thử phục hồi (định kỳ — hằng tuần qua cron, hoặc ít nhất mỗi tháng chạy tay)

```bash
cd /root/cowork-itw && ./scripts/thu-phuc-hoi.sh                    # bộ mới nhất trên máy
THU_PHUC_HOI_TU_NGOAI=1 ./scripts/thu-phuc-hoi.sh                    # bộ mới nhất ở nơi ngoài máy
TEP_DUMP=/root/cowork-sao-luu/cowork-<LUC>.dump ./scripts/thu-phuc-hoi.sh   # một bộ cụ thể
```
Script phục hồi vào CSDL tạm `cowork_thu_phuc_hoi_<thời điểm>`, kiểm số dòng (doanh nghiệp, người dùng, nhật ký kiểm toán…), migration cuối, giải nén gói đính kèm và đếm tệp, giải mã bản `.env` (có `APP_ENC_KEY`), rồi **xóa CSDL tạm kể cả khi hỏng**. Kết quả ghi dòng `thu-phuc-hoi` trong `system_heartbeats` (hiện trên thẻ sao lưu ở màn hình Tự động hóa); hỏng thì báo động. Không đụng CSDL thật.

### Phục hồi thật (sự cố)

Trên máy chủ cũ còn dùng được thì lấy bộ trong `/root/cowork-sao-luu`; máy chủ mới thì cài Docker + rclone, chép `rclone.conf` về, rồi:
```bash
mkdir -p /root/khoi-phuc && cd /root/khoi-phuc
rclone copy --include 'cowork-<LUC>*' --include 'cowork-dinh-kem-<LUC>*' --include 'cowork-env-<LUC>*' cowork-crypt: .
```

1. **`.env`** (máy chủ mới; máy cũ còn `.env` thì bỏ bước này):
   ```bash
   gpg --decrypt cowork-env-<LUC>.env.gpg > /root/cowork-itw/.env   # nhập mật khẩu sao lưu
   chmod 600 /root/cowork-itw/.env
   ```
   `APP_ENC_KEY` **phải** là giá trị cũ — khóa khác thì mật khẩu SMTP và 2 lớp đã lưu không giải mã được.
2. **CSDL**:
   ```bash
   cd /root/cowork-itw && set -a && . ./.env && set +a
   docker compose stop app worker
   docker compose up -d db
   docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB WITH (FORCE)"
   docker compose exec -T db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
   docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner < /root/khoi-phuc/cowork-<LUC>.dump
   ```
3. **Tệp đính kèm** (gói chứa thư mục `dinh-kem/…`):
   ```bash
   mv data/dinh-kem "data/dinh-kem.cu-$(date +%s)" 2>/dev/null || true
   tar -xzf /root/khoi-phuc/cowork-dinh-kem-<LUC>.tar.gz -C data/
   ```
4. `./trien-khai.sh` — dựng lại vai `cowork_app`, chạy migration còn thiếu, `rls.sql` (cấp lại quyền cho `cowork_app`), khởi động. `--no-owner` làm mọi bảng thuộc vai chủ sở hữu — đúng mô hình.
5. Kiểm: đăng nhập, mở một chứng từ có tệp đính kèm, *Quản trị → Kết nối email → Gửi thư thử* (chứng minh `APP_ENC_KEY` đúng), *Quản trị → Tự động hóa* không còn băng đỏ sau 1–2 phút.

Máy phát triển / bài thử: `SAO_LUU_KHONG_DOCKER=1` cho cả hai script chạy `pg_dump`/`psql` trực tiếp bằng `DATABASE_URL_OWNER` thay vì `docker compose exec db`; `THU_MUC_SAO_LUU`, `THU_MUC_DINH_KEM`, `TEP_ENV` đổi được nơi đọc/ghi.

## Chiến lược migration

- Mỗi thay đổi schema là một migration có tên, sinh bằng `prisma migrate dev --create-only` trên máy trạm, **đọc lại SQL trước khi commit**.
- Ưu tiên thay đổi bổ sung (thêm bảng, thêm cột có mặc định, thêm chỉ mục). Đổi tên / xóa cột: làm hai bước qua hai lần triển khai (thêm cột mới + ghi cả hai → chuyển đọc → gỡ cột cũ).
- Dữ liệu chuyển đổi một lần viết thẳng trong migration (như bản 19/09 gán phạm vi dữ liệu cho quyền cũ).
- Trước khi triển khai migration có sửa dữ liệu: **diễn tập nâng cấp** — dựng CSDL giống hệt bản đang chạy (migration cũ + seed cũ), áp migration mới + seed mới, kiểm kết quả. Bản 19/09 đã diễn tập đúng như vậy.
- Không bao giờ chạy `prisma db push` hay `migrate dev` trên máy thật.

### Nâng cấp lên 0.16.1 (vận hành bền vững)

- Migration `20261014090001_van_hanh_ben_vung`: thêm bảng toàn hệ thống `system_heartbeats` (nhịp worker, trạng thái sao lưu / thử phục hồi) và thay chỉ mục riêng phần `job_runs_lich_moi_ngay` (lần quét theo lịch **hỏng** không còn chiếm chỗ "một lần mỗi ngày"). Không sửa dữ liệu cũ. Chạy lại `rls.sql` như mọi lần (mục 5b cấp quyền bảng mới: ứng dụng đọc mọi dòng, chỉ ghi dòng `worker…`).
- `nginx/` thêm tệp `cowork-proxy.inc` (đuôi `.inc` để không bị nạp tự động ở cấp http). `trien-khai.sh` đã `nginx -t` + reload.
- Biến `.env` mới (đều tùy chọn nhưng **nên đặt**): `RCLONE_REMOTE`, `GIU_NGAY_NGOAI`, `ALERT_WEBHOOK_URL`, `ALERT_EMAIL`, `THU_PHUC_HOI_HANG_TUAN`, `AI_HAN_GOI_GIAY`. Mật khẩu sao lưu để ở `/root/.cowork-sao-luu-mat-khau`, **không** trong `.env`. Xem mục "Sao lưu và phục hồi".
- Chạy `./trien-khai.sh` **bằng root** để cài `/etc/cron.d/cowork-sao-luu`. Sau 1–2 phút mở *Quản trị → Tự động hóa*: băng đỏ còn lại cho biết việc nào chưa làm (rclone, mật khẩu sao lưu…).

### Nâng cấp lên 0.16.0 (khách hàng nâng cao, marketing & thu lead, email marketing, xác thực 2 lớp)

- Ba migration theo thứ tự: `20261012030000_khach_hang_nang_cao` → `20261012044827_marketing_thu_lead` → `20261012090000_email_marketing_2_lop`. Migration khách hàng nâng cao có chuyển dữ liệu nhỏ (5 trạng thái hành trình khởi tạo cho doanh nghiệp đang có, cấp bù `customer.approve` cho Trưởng phòng Kinh doanh); hai migration sau chỉ thêm bảng / cột / CHECK. Cột `marketing_opt_out_at` trên `leads`/`contacts` do migration marketing thêm; migration email dùng `ADD COLUMN IF NOT EXISTS` nên không lỗi.
- **Đường công khai mới** không cần đăng nhập: `/f/…` (form đăng ký, nhúng iframe được), `/lp/…` (landing page), `/huy-nhan-tin/…` (hủy nhận tin trong thư), `/api/cong-khai/…` (form, webhook, theo dõi mở / bấm, hủy nhận tin). Giới hạn tốc độ của các đường này tính theo IP — **bắt buộc** nginx máy chủ ghi đè `X-Real-IP` (xem "Bẫy đã gặp" bên dưới), nếu không mọi khách chung một IP.
- **Biến môi trường mới `APP_ENC_KEY`** (bắt buộc từ 0.16.0, **không đổi sau khi đã dùng** — đổi là mất mật khẩu SMTP và khóa 2 lớp đã lưu) — sinh một lần `openssl rand -base64 32`, thêm vào `.env` trước khi triển khai. `docker-compose.yml` đã chuyển biến này cho cả `app` và `worker` (worker cũng nhận thêm `APP_URL` để dựng liên kết trong thư). Sao lưu giá trị này cùng chỗ với `.env`: **mất hoặc đổi khóa** = mật khẩu SMTP phải nhập lại, mọi người đã bật 2 lớp phải được quản trị đặt lại, liên kết huỷ nhận tin trong thư đã gửi hết hiệu lực.
- Migration `20261012090000_email_marketing_2_lop` chỉ thêm bảng / cột / CHECK, không sửa dữ liệu cũ; chạy lại `rls.sql` như mọi lần.
- Máy chủ cần đi ra được cổng SMTP của nhà cung cấp (465 hoặc 587). Một số nhà cung cấp VPS chặn cổng 25/465/587 mặc định — thử bằng nút **Gửi thư thử** ở Quản trị → Kết nối email trước khi lập chiến dịch.
- Tên miền gửi nên có SPF/DKIM đúng với nhà cung cấp SMTP, nếu không thư dễ vào mục Thư rác.

### Nâng cấp lên 0.3.0 (Phase 2 — CRM)

- Migration `20260919171944_phase2_crm`: chỉ thêm 7 bảng, không sửa dữ liệu cũ, trừ một câu `INSERT … ON CONFLICT DO NOTHING` cấp `sales.approve` cho vai trò dựng sẵn `sales-manager`.
- Cần extension `pg_trgm`: có sẵn trong ảnh `postgres:16` chính thức; migration tự `CREATE EXTENSION IF NOT EXISTS` bằng vai chủ sở hữu (là superuser của container). Phục hồi từ bản sao lưu cũng tự tạo lại extension.
- Đã diễn tập 20/09 trên máy trạm: CSDL ở trạng thái Phase 1 có dữ liệu (2 tenant, 14 người dùng, 1.186 dòng quyền) → áp migration → `rls.sql` → seed mới. Người dùng giữ nguyên; cả hai tenant nhận `sales.approve`; RLS bật trên cả 7 bảng mới.
- Sau khi lên máy thật: đăng nhập, mở lần lượt Khách hàng, Lead, Pipeline, Cơ hội, Công việc. **Không tạo khách thử trong tenant `itw`** — mã KH đã cấp không lấy lại được, và dữ liệu thử sẽ lẫn vào báo cáo. Bản ghi đầu tiên nên là khách thật.

## Nhật ký, lỗi, sức khỏe

- `docker compose logs -f app` / `worker`. Lỗi ngoài dự kiến của API ghi dòng `[api] lỗi ngoài dự kiến`; trang lỗi hiện mã `digest` để tra log.
- Sức khỏe: `GET /khoe` (qua nginx) hoặc `/api/khoe` — kiểm kết nối CSDL, không lộ chi tiết lỗi. Từ 0.16.1 có thêm `"worker": "ok" | "tre"` (nhịp cuối của worker quá 5 phút / chưa có). Chi tiết (giờ nhịp, sao lưu, thử phục hồi, bản quét hỏng) chỉ ở `GET /api/v1/tu-dong-hoa/van-hanh` (quyền `setting.view`) và màn hình *Quản trị → Tự động hóa*.
- **Worker** (0.16.1): mỗi phút ghi nhịp vào bảng `system_heartbeats`; container `worker` có healthcheck (`worker/kiem-tra-song.ts`) — `docker compose ps` hiện `unhealthy` khi quá 5 phút không có nhịp. Docker **không** tự khởi động lại container unhealthy: xem `docker compose logs worker --tail 100` rồi `docker compose restart worker`. Redis hỏng không còn làm worker bỏ nhịp.
- **Bản quét nhắc việc hỏng** (0.16.1): ghi dòng "Hỏng" kèm lỗi vào Lịch sử chạy nền; worker tự thử lại sau 15 → 30 → 60 → 120 phút, tối đa 5 lần/ngày; hỏng 2 lần liên tiếp thì chuông báo người có quyền sửa cấu hình, hết lượt thì báo mức khẩn. Sửa xong nguyên nhân thì bấm *Chạy quét ngay*.
- Nhật ký nghiệp vụ và an ninh: màn hình **Quản trị → Nhật ký kiểm toán**.

## Bẫy đã gặp trên máy chủ này

- **nginx máy chủ PHẢI ghi đè `X-Real-IP` bằng `$remote_addr`** (`proxy_set_header X-Real-IP $remote_addr;` trong `/etc/nginx/conf.d/cowork.conf`). Từ 0.16.1 nginx trong Docker (`nginx/cowork.conf`) dùng module realip: chỉ tin `X-Real-IP` khi yêu cầu đến từ dải nội bộ (127.0.0.1, 10/8, 172.16/12, 192.168/16 — tức nginx máy chủ qua cổng Docker), đặt `$remote_addr` = IP thật, rồi **ghi đè** cả `X-Real-IP` lẫn `X-Forwarded-For` gửi vào app bằng giá trị đó (chuỗi `X-Forwarded-For` khách tự gửi không lọt vào nữa). Nếu nginx máy chủ chỉ chuyển tiếp giá trị khách gửi, ai cũng lách được giới hạn bằng cách tự đặt `X-Real-IP`; nếu nginx máy chủ **không** đặt tiêu đề này thì mọi khách chung một IP (IP cổng Docker) và `limit_req` chặn nhầm cả công ty. Cổng 8080 phải chỉ mở trên `127.0.0.1` (đang vậy trong `docker-compose.yml`). Kiểm: `grep -n X-Real-IP /etc/nginx/conf.d/cowork.conf`.
- **Giới hạn tốc độ ở nginx** (0.16.1, QĐ-90): `/api/dang-nhap*` 20 lần/phút/IP (dồn tối đa 10), `/api/cong-khai/` 120 lần/phút/IP (dồn 60), theo dõi mở/bấm thư 1.200 lần/phút; vượt trả 429. Đây là lớp chặn khi Redis hỏng — trần **rộng hơn** trần của ứng dụng, luật chi tiết vẫn ở ứng dụng. Redis hỏng thì ứng dụng đếm tạm trong bộ nhớ từng tiến trình thay vì cho qua hết. Nhật ký nginx ghi `limiting requests` ở mức warn khi chặn. `/api/v1/tro-ly/hoi` có `proxy_read_timeout 300s` (một lượt hỏi có thể gọi mô hình vài vòng).
- **Trợ lý AI trên máy thật** (0.16.1): trước đây `docker-compose.yml` không chuyển `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY` vào container `app`, nên trợ lý luôn báo "chưa cấu hình" dù `.env` có khóa. Nay đã chuyển, kèm `AI_HAN_GOI_GIAY` (hạn một lần gọi mô hình, mặc định 60).
- 0.16.0: trang `/f/*` được nhúng iframe nhờ CSP `frame-ancestors` (QĐ-62) dù nginx máy chủ gửi `X-Frame-Options: SAMEORIGIN`; sau khi triển khai, thử nhúng một form vào một trang https khác một lần.
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
