# TGTH Business Cowork

Hệ điều hành vận hành doanh nghiệp (Business Operating System) nội bộ của **Công ty Cổ phần Thế Giới Tin Học (TGTH / ITW)**: CRM, bán hàng, báo giá, đơn hàng, kho, dự án kỹ thuật, chăm sóc khách hàng, tài chính quản trị, tự động hóa và trợ lý AI — trên **một** nguồn dữ liệu.

- Máy chủ thật: <https://thegioitinhoc.io.vn>
- Trạng thái: **Phase 1 — Nền móng** chạy thật từ 19/09/2026. **Phase 2 → 6** (CRM; sản phẩm và bảng giá; báo giá; đơn hàng và kho; dự án, bảo hành, bàn dịch vụ) xong trên máy phát triển 20/09/2026 (bản 0.7.0), chờ triển khai. Điểm vào cho phiên làm việc mới: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). Luật nghiệp vụ: [`BUSINESS_RULES.md`](BUSINESS_RULES.md).

> Giao diện, chú thích mã và tài liệu viết bằng tiếng Việt. Tên bảng và cột cơ sở dữ liệu viết bằng tiếng Anh, `snake_case` (quyết định QĐ-02 trong [`docs/quyet-dinh-kien-truc.md`](docs/quyet-dinh-kien-truc.md)).

## Tổng quan kiến trúc

```
Trình duyệt ──HTTPS──▶ nginx máy chủ (TLS) ──▶ nginx (Docker) ──▶ app: Next.js 16
                                                                    │  giao diện + API /api/v1
                                                                    │  proxy.ts: CSRF + chặn chưa đăng nhập
                                                                    │  xuLyApi: phiên → tenant → quyền → service → nhật ký
                                                                    ▼
                                                   PostgreSQL 16 (RLS theo tenant) ◀── worker (tác vụ nền)
                                                   Redis (giới hạn tốc độ, hàng đợi)
```

Chi tiết: [`ARCHITECTURE.md`](ARCHITECTURE.md). Cơ sở dữ liệu: [`DATABASE.md`](DATABASE.md). AI: [`AI_ARCHITECTURE.md`](AI_ARCHITECTURE.md).

| Thành phần | Công nghệ |
|---|---|
| Ứng dụng | Next.js 16 (App Router) + React 19 + TypeScript |
| Cơ sở dữ liệu | PostgreSQL 16, Prisma 7 (adapter `pg`), Row Level Security |
| Kiểm tra dữ liệu vào | Zod 4 |
| Xác thực | Cookie `httpOnly` ký JWT (jose), mật khẩu băm bcrypt |
| Giao diện | CSS thuần với biến màu (không thư viện UI) — xem QĐ-05 |
| Kiểm thử | `node:test` qua `tsx` + bài thử tích hợp trên CSDL thật + bài thử HTTP đầu-cuối |
| Triển khai | Docker Compose: app, worker, db, redis, nginx |

## Cài đặt trên máy phát triển

Yêu cầu: Node 20+ (đã dùng 24), PostgreSQL 16 (Docker hoặc bản cài; máy trạm không có Docker thì xem mục "Không có Docker" trong [`DEPLOYMENT.md`](DEPLOYMENT.md)).

```bash
npm install
cp .env.example .env        # rồi sửa giá trị — xem bảng biến môi trường bên dưới
npx prisma generate
```

Tạo cơ sở dữ liệu và hai vai (chủ sở hữu + `cowork_app`), áp migration, bật RLS, seed:

```bash
DATABASE_URL="$DATABASE_URL_OWNER" npx prisma migrate deploy
psql "$DATABASE_URL_OWNER" -f prisma/rls.sql
npm run db:seed
DEMO_MAT_KHAU='<mật khẩu chung cho tài khoản mẫu>' npm run db:seed:mau   # tùy chọn: tenant "demo"
```

Chạy:

```bash
npm run dev            # http://localhost:3000
npm run worker         # tác vụ nền (cần REDIS_URL)
```

Đăng nhập tại `/dang-nhap`, mã doanh nghiệp `itw`, tài khoản `SEED_ADMIN_EMAIL`. Lần đầu hệ thống bắt đổi mật khẩu.

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | có | Kết nối bằng vai **`cowork_app`** — vai bị RLS ràng buộc. **Không** dùng vai chủ sở hữu, nếu không RLS mất hiệu lực. |
| `DATABASE_URL_OWNER` | có | Vai chủ sở hữu, chỉ dùng cho migration, seed, script khẩn cấp. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Docker | Khởi tạo container PostgreSQL. |
| `APP_DB_PASSWORD` | Docker | Mật khẩu vai `cowork_app`; phải khớp với `DATABASE_URL`. |
| `AUTH_SECRET` | có | ≥ 32 ký tự, ký cookie phiên. `openssl rand -base64 48`. Đổi giá trị = đăng xuất mọi người. |
| `APP_URL` | có | URL công khai, dùng cho kiểm tra nguồn gốc (CSRF). |
| `REDIS_URL`, `REDIS_PASSWORD` | máy thật | Giới hạn tốc độ đăng nhập dùng chung giữa tiến trình. Thiếu thì dùng bộ nhớ tiến trình. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | lần seed đầu | Tài khoản quản trị đầu tiên. Seed không bao giờ ghi đè mật khẩu tài khoản đã có. |

Không có bí mật nào trong mã nguồn. `.env` nằm trong `.gitignore`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` / `build` / `start` | Phát triển / dựng / chạy bản dựng |
| `npm run typecheck` | Kiểm kiểu TypeScript |
| `npm run lint` | ESLint (luật của Next.js) |
| `npm run thu:don-vi` | Kiểm thử đơn vị — không cần CSDL (73 bài) |
| `npm run thu:tich-hop` | Kiểm thử tích hợp trên CSDL thật: cách ly tenant, phân quyền, nhật ký, bất biến quản trị, CRM, sản phẩm (212 kiểm chứng). **Chỉ chạy trên CSDL phát triển** |
| `npm run thu:http` | Kiểm thử đầu-cuối qua HTTP trên máy chủ đang chạy (112 kiểm chứng, thêm 4 nếu quản trị đang bị bắt đổi mật khẩu). Cần `THU_URL`, `THU_EMAIL`, `THU_MAT_KHAU` |
| `npm run kiem-tra` | typecheck + lint + đơn vị + build — chạy trước mỗi lần commit |
| `npm run db:migrate` / `db:seed` / `db:seed:mau` | Migration / seed nền móng / dữ liệu mẫu |

## Cơ sở dữ liệu và migration

- Sửa `prisma/schema.prisma` → sinh migration: `DATABASE_URL="$DATABASE_URL_OWNER" npx prisma migrate dev --create-only --name <ten>` → **đọc lại SQL**, thêm ràng buộc CHECK / dữ liệu chuyển đổi bằng tay nếu cần → commit.
- Máy thật chỉ chạy `prisma migrate deploy` (không bao giờ `migrate dev` hay `db push`).
- `prisma/rls.sql` chạy sau mọi migration; nó **tự bật RLS cho mọi bảng có cột `tenant_id`** và dừng triển khai nếu còn bảng nào sót.

## Triển khai

```bash
ssh -p 2018 root@<máy chủ>
cd /root/cowork-itw && ./trien-khai.sh
```

Script tự sao lưu CSDL trước khi migrate. Chi tiết, phục hồi và xử lý sự cố: [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Cấu trúc thư mục

```
prisma/            schema, migrations, rls.sql, seed/ (nền móng + dữ liệu mẫu)
src/app/           trang (App Router) và API
  (he-thong)/      mọi màn hình sau đăng nhập — dùng chung khung ứng dụng
  api/v1/          API nghiệp vụ — mỏng, chỉ gọi service
src/modules/<phân hệ>/   NGHIỆP VỤ: lược đồ Zod + service (kiểm quyền, bất biến, nhật ký)
src/lib/           hạ tầng dùng chung: db, api, phân quyền, phạm vi, nhật ký, định dạng
src/components/    khung ứng dụng và thành phần giao diện
worker/            tiến trình nền
thu/               kiểm thử: don-vi/ (đơn vị), thu-*.ts (tích hợp, HTTP)
scripts/           sao lưu
docs/              khảo sát Phase 0, quyết định kiến trúc
```

Luật vàng: **nghiệp vụ nằm trong `src/modules`, không nằm trong component React hay route**. Route chỉ đọc dữ liệu vào và gọi service; service tự kiểm quyền — nên AI gọi service qua tool calling cũng bị kiểm quyền y hệt.
