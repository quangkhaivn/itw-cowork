import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { voiTenant } from "../src/lib/db";
import { LoiChuaDangNhap, taoNguCanh, type NguCanh } from "../src/lib/api";
import { buocTuPhien, laLoiPhien } from "../src/lib/api-nhieu-buoc";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { demVaKiem, KhoDemBoNho, type KhoDem } from "../src/lib/gioi-han-toc-do";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { quetBenVung, quetTheoLich } from "../src/modules/nhac-viec/service";
import { homNayVN } from "../src/modules/crm/chung";
import { hoiDap } from "../src/modules/tro-ly/service";
import { datNhaCungCapThu, type NhaCungCapAI } from "../src/modules/tro-ly/nha-cung-cap";
import { luuKetNoi } from "../src/modules/email/ket-noi";
import { guiThuThu } from "../src/modules/email/service";
import { LuocDoKetNoiEmail, LuocDoMau } from "../src/modules/email/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA độc lập gói "0.16.1 – Vận hành bền vững" — tấn công các khẳng định của gói:
 *  1. RLS system_heartbeats: vai ứng dụng có giả được nhịp 'sao-luu' / 'thu-phuc-hoi' không (mọi đường:
 *     INSERT, ON CONFLICT DO UPDATE, đổi tên, UPDATE, DELETE); /api/khoe có lộ gì không.
 *  2. api-nhieu-buoc: mỗi bước đặt đúng tenant, đọc lại quyền; phiên bị thu hồi giữa luồng thì DỪNG;
 *     trợ lý AI không gọi mô hình thêm vòng nào sau khi phiên hết hiệu lực.
 *  3. Bản quét: hai worker chạy cùng lúc không quét đôi; giãn cách 15 → 30 phút chính xác.
 *  4. Giới hạn tốc độ khi Redis hỏng: không chờ, kho bộ nhớ có trần (không phình theo khóa lạ).
 *  5. guiThuThu (gửi thử chiến dịch): SMTP chậm nằm NGOÀI giao dịch.
 *  6. Script: sao-luu.sh / thu-phuc-hoi.sh trong thư mục tạm (CSDL QA, rclone ra thư mục cục bộ):
 *     hỏng → mã ≠ 0 + trạng thái hỏng + báo động; khóa flock; bị kill vẫn ghi hỏng; CSDL tạm luôn bị xóa.
 *     trien-khai.sh cài cron idempotent (trong hộp cát); nginx -t + realip/limit_req (nếu có nginx).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const ungDung = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DAU = Date.now().toString(36);
const ngu = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GOC = path.resolve(__dirname, "..");

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-qa-van-hanh"));
  });
}

async function soGiaoDichDangMo(): Promise<number> {
  const r = await ungDung.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pg_stat_activity
    WHERE usename = current_user AND datname = current_database() AND state LIKE 'idle in transaction%'`;
  return Number(r[0]?.n ?? 0);
}

async function loiCua(khoi: () => Promise<unknown>): Promise<unknown> {
  try {
    await khoi();
    return null;
  } catch (e) {
    return e;
  }
}

async function main() {
  console.log("=== QA độc lập: Vận hành bền vững (0.16.1) ===\n");
  const tenant = await seedNenMong(chu, `qa-vh-${DAU}`, "Doanh nghiệp QA vận hành");
  const tenantB = await seedNenMong(chu, `qa-vh-b-${DAU}`, "Doanh nghiệp QA vận hành B");
  const T = tenant.id;
  const vaiTro = async (tid: string, code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tid, code } } })).id;
  const nguoi = async (tid: string, ten: string, vai: string) =>
    (
      await chu.user.create({
        data: {
          tenantId: tid,
          email: `${ten}.${DAU}@qa.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: tid, roleId: await vaiTro(tid, vai) } },
          staffProfile: { create: { tenantId: tid } },
        },
      })
    ).id;
  const gd = await nguoi(T, "giam-doc", "ceo");
  const nv = await nguoi(T, "nhan-vien", "sales");
  const ns = await nguoi(T, "nhan-vien-2", "sales");
  const gdB = await nguoi(tenantB.id, "giam-doc-b", "ceo");

  // ==================================================================
  console.log("— 1. RLS system_heartbeats: vai ứng dụng không giả được nhịp sao lưu —");
  await chu.$executeRaw`
    INSERT INTO system_heartbeats (name, last_at, ok, last_ok_at, info)
    VALUES ('sao-luu', now(), false, now() - interval '3 days', '{"loi":"qa"}'::jsonb)
    ON CONFLICT (name) DO UPDATE SET ok = false, last_ok_at = now() - interval '3 days', info = '{"loi":"qa"}'::jsonb`;
  const goc = await chu.systemHeartbeat.findUniqueOrThrow({ where: { name: "sao-luu" } });
  const thuGia: [string, () => Promise<unknown>][] = [
    ["INSERT … ON CONFLICT DO UPDATE dòng 'sao-luu'", () =>
      ungDung.$executeRaw`INSERT INTO system_heartbeats (name, ok, last_ok_at) VALUES ('sao-luu', true, now())
        ON CONFLICT (name) DO UPDATE SET ok = true, last_ok_at = now()`],
    ["INSERT dòng 'thu-phuc-hoi'", () => ungDung.$executeRaw`INSERT INTO system_heartbeats (name, ok, last_ok_at) VALUES ('thu-phuc-hoi', true, now())`],
    ["đổi tên dòng 'worker' thành 'sao-luu-2'", () => ungDung.$executeRaw`UPDATE system_heartbeats SET name = 'sao-luu-2' WHERE name = 'worker'`],
    ["DELETE dòng 'sao-luu' (để màn hình về 'chưa có')", () => ungDung.$executeRaw`DELETE FROM system_heartbeats WHERE name = 'sao-luu'`],
    ["TRUNCATE bảng nhịp", () => ungDung.$executeRaw`TRUNCATE system_heartbeats`],
  ];
  // Cần một dòng 'worker' để thử đổi tên.
  await ungDung.$executeRaw`INSERT INTO system_heartbeats (name, ok, last_ok_at) VALUES ('worker', true, now())
    ON CONFLICT (name) DO UPDATE SET last_at = now()`;
  for (const [ten, khoi] of thuGia) {
    const loi = await loiCua(khoi);
    dat(`Vai ứng dụng bị chặn: ${ten}`, loi !== null, "không ném lỗi");
  }
  const soDong = await ungDung.$executeRaw`UPDATE system_heartbeats SET ok = true, last_ok_at = now() WHERE name = 'sao-luu'`;
  dat("UPDATE thẳng dòng 'sao-luu' không chạm dòng nào (RLS lọc)", soDong === 0, String(soDong));
  const sau = await chu.systemHeartbeat.findUniqueOrThrow({ where: { name: "sao-luu" } });
  dat("Dòng 'sao-luu' giữ nguyên trạng thái hỏng sau mọi lần thử giả", !sau.ok && sau.lastOkAt?.getTime() === goc.lastOkAt?.getTime());
  dat("Vai ứng dụng vẫn ĐỌC được dòng 'sao-luu' (màn hình cần)", (await ungDung.systemHeartbeat.findUnique({ where: { name: "sao-luu" } }))?.ok === false);

  const { GET: khoe } = await import("../src/app/api/khoe/route");
  const phanHoi = await khoe();
  const than = await phanHoi.text();
  dat("/api/khoe không lộ trạng thái / lỗi sao lưu", !/sao|luu|qa|loi/i.test(than.replace(/"luc":"[^"]*"/, "")), than);
  dat("/api/khoe chỉ có 4 khóa", Object.keys(JSON.parse(than)).sort().join(",") === "db,luc,ok,worker", than);

  // ==================================================================
  console.log("\n— 2. api-nhieu-buoc: tenant mỗi bước, quyền đọc lại, phiên thu hồi giữa luồng —");
  const phien = (userId: string, tenantId = T) => ({ userId, tenantId, email: "x@qa.test", kyLucMs: Date.now() - 1_000 });
  const nbGd = buocTuPhien(phien(gd), { quyen: "setting.view" }, "10.0.0.9", "qa");
  const r1 = await nbGd.giaoDich(async (nc) => {
    const [{ t }] = await nc.tx.$queryRaw<{ t: string }[]>`SELECT current_setting('app.tenant_id') AS t`;
    const userB = await nc.tx.user.findUnique({ where: { id: gdB }, select: { id: true } });
    return { t, userB };
  });
  dat("Mỗi bước đặt app.tenant_id của phiên", r1.t === T, r1.t);
  dat("Trong bước, không đọc được người dùng của doanh nghiệp khác (RLS)", r1.userB === null);
  const r2 = await nbGd.giaoDich(async (nc) => (await nc.tx.$queryRaw<{ t: string }[]>`SELECT current_setting('app.tenant_id', true) AS t`)[0].t);
  dat("Bước thứ hai cũng đặt lại tenant (không dựa vào kết nối cũ)", r2 === T);
  const ngoai = (await ungDung.$queryRaw<{ t: string | null }[]>`SELECT current_setting('app.tenant_id', true) AS t`)[0].t;
  dat("Ngoài bước, kết nối không còn mang tenant (set_config cục bộ giao dịch)", !ngoai, String(ngoai));
  const loiGia = await loiCua(() => buocTuPhien(phien(gdB, T), {}, null, null).giaoDich(async () => 1));
  dat("Phiên ghép userId của doanh nghiệp B với tenant A → chưa đăng nhập", loiGia instanceof LoiChuaDangNhap, String(loiGia));
  const loiQuyen = await loiCua(() => buocTuPhien(phien(nv), { quyen: "setting.view" }, null, null).giaoDich(async () => 1));
  dat("Quyền của route kiểm ở mỗi bước (nhân viên thiếu setting.view)", loiQuyen instanceof LoiThieuQuyen, String(loiQuyen));
  dat("Sau bước hỏng không còn giao dịch nào mở", (await soGiaoDichDangMo()) === 0);

  // Thu hồi giữa luồng: bước 1 đạt, quản trị đặt lại mật khẩu, bước 2 phải bị chặn.
  const nbNs = buocTuPhien(phien(ns), {}, null, null);
  await nbNs.giaoDich(async () => 1);
  await chu.user.update({ where: { id: ns }, data: { passwordChangedAt: new Date() } });
  const loiThuHoi = await loiCua(() => nbNs.giaoDich(async () => 1));
  dat("Đổi mật khẩu giữa luồng → bước sau ném LoiChuaDangNhap", loiThuHoi instanceof LoiChuaDangNhap && laLoiPhien(loiThuHoi), String(loiThuHoi));

  // Trợ lý AI: phiên bị thu hồi trong lúc mô hình đang nghĩ → dừng, không gọi thêm vòng nào.
  const nai = await nguoi(T, "nguoi-hoi", "sales");
  let soLanGoi = 0;
  const kichBanThuHoi: NhaCungCapAI = {
    ten: "kich-ban",
    model: "kich-ban",
    async goi() {
      soLanGoi += 1;
      if (soLanGoi === 1) {
        await chu.user.update({ where: { id: nai }, data: { passwordChangedAt: new Date() } });
        return { khoi: [{ loai: "goi-cong-cu", id: "g1", ten: "tim_khach_hang", thamSo: { tuKhoa: "x" } }], doiCongCu: true, tokensIn: 1, tokensOut: 1, model: "kich-ban" };
      }
      return { khoi: [{ loai: "van-ban", noiDung: "Trả lời sau khi phiên đã hết." }], doiCongCu: false, tokensIn: 1, tokensOut: 1, model: "kich-ban" };
    },
  };
  datNhaCungCapThu(kichBanThuHoi);
  const cauHoiThuHoi = `Câu hỏi phiên bị thu hồi ${DAU}`;
  const loiAi = await loiCua(() => hoiDap(buocTuPhien(phien(nai), {}, null, null), { cauHoi: cauHoiThuHoi }));
  datNhaCungCapThu(null);
  dat("AI: phiên thu hồi giữa lượt → hoiDap ném LoiChuaDangNhap (route trả 401)", loiAi instanceof LoiChuaDangNhap, String(loiAi));
  dat("AI: không gọi mô hình thêm vòng nào sau khi phiên hết hiệu lực", soLanGoi === 1, String(soLanGoi));
  dat("AI: câu hỏi (bước 1) vẫn còn trong CSDL", (await chu.aiMessage.count({ where: { tenantId: T, role: "nguoi-dung", content: cauHoiThuHoi } })) === 1);

  // Mất quyền giữa lượt (bỏ vai trò): công cụ bị chặn bằng hồ sơ đọc lại, lượt vẫn kết thúc gọn.
  const nmq = await nguoi(T, "mat-quyen", "sales");
  let lan2 = 0;
  datNhaCungCapThu({
    ten: "kich-ban",
    model: "kich-ban",
    async goi() {
      lan2 += 1;
      if (lan2 === 1) {
        await chu.userRole.deleteMany({ where: { userId: nmq } });
        return { khoi: [{ loai: "goi-cong-cu", id: "g1", ten: "tim_khach_hang", thamSo: { tuKhoa: "x" } }], doiCongCu: true, tokensIn: 1, tokensOut: 1, model: "kich-ban" };
      }
      return { khoi: [{ loai: "van-ban", noiDung: "Không xem được." }], doiCongCu: false, tokensIn: 1, tokensOut: 1, model: "kich-ban" };
    },
  });
  const kqMq = await hoiDap(buocTuPhien(phien(nmq), {}, null, null), { cauHoi: "Tìm khách" });
  datNhaCungCapThu(null);
  dat("AI: mất quyền customer.view giữa lượt → công cụ 'thieu-quyen'", kqMq.congCuDaGoi[0]?.ketCuc === "thieu-quyen", JSON.stringify(kqMq.congCuDaGoi));

  // ==================================================================
  console.log("\n— 3. Bản quét: chạy đồng thời, giãn cách chính xác, chỉ mục —");
  const homNay = homNayVN();
  const D1 = congNgay(homNay, -70);
  const [a, b] = await Promise.allSettled([quetBenVung(T, { ngay: D1, trigger: "lich" }), quetBenVung(T, { ngay: D1, trigger: "lich" })]);
  const xong = [a, b].filter((x) => x.status === "fulfilled").length;
  const trung = [a, b].filter((x) => x.status === "rejected" && (x.reason as Error).name === "LoiQuetDaCoLanKhac").length;
  dat("Hai worker quét cùng lúc: đúng MỘT lần xong, lần kia bị CSDL chặn (không phải 'hỏng')", xong === 1 && trung === 1, JSON.stringify([a.status, b.status, (a as PromiseRejectedResult).reason?.name, (b as PromiseRejectedResult).reason?.name]));
  const dongD1 = await chu.jobRun.findMany({ where: { tenantId: T, forDate: new Date(`${D1}T00:00:00Z`) }, select: { status: true } });
  dat("…job_runs của ngày đó có đúng 1 dòng 'xong', không dòng 'hong'", dongD1.length === 1 && dongD1[0].status === "xong", JSON.stringify(dongD1));

  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "tu_dong.gio_quet_hang_ngay": 7 } }));
  const D2 = congNgay(homNay, -71);
  const kqDoi = await Promise.all([quetTheoLich(T, 23, { ngay: D2 }), quetTheoLich(T, 23, { ngay: D2 })]);
  const tt = kqDoi.map((k) => k.trangThai).sort().join(",");
  dat("Hai nhịp quetTheoLich đồng thời: một 'xong', một 'da-quet'", tt === "da-quet,xong", tt);

  const D3 = congNgay(homNay, -72);
  await quetBenVung(T, { ngay: D3, trigger: "lich", hanGiaoDichMs: 1 }).catch(() => {});
  const h1 = await chu.jobRun.findFirstOrThrow({ where: { tenantId: T, forDate: new Date(`${D3}T00:00:00Z`), status: "hong" } });
  const moc1 = h1.finishedAt!.getTime();
  const c14 = await quetTheoLich(T, 23, { ngay: D3, bayGio: new Date(moc1 + 14 * 60_000), hanGiaoDichMs: 1 });
  dat("Hỏng 1 lần: 14 phút sau vẫn chờ", c14.trangThai === "cho-thu-lai", JSON.stringify(c14));
  const c16 = await quetTheoLich(T, 23, { ngay: D3, bayGio: new Date(moc1 + 16 * 60_000), hanGiaoDichMs: 1 });
  dat("Hỏng 1 lần: 16 phút sau thử lại (giãn cách 15 phút)", c16.trangThai === "hong", JSON.stringify(c16));
  const h2 = await chu.jobRun.findFirstOrThrow({ where: { tenantId: T, forDate: new Date(`${D3}T00:00:00Z`), status: "hong" }, orderBy: { startedAt: "desc" } });
  const moc2 = h2.finishedAt!.getTime();
  dat("Hỏng 2 lần: 29 phút sau lần 2 vẫn chờ", (await quetTheoLich(T, 23, { ngay: D3, bayGio: new Date(moc2 + 29 * 60_000), hanGiaoDichMs: 1 })).trangThai === "cho-thu-lai");
  const c31 = await quetTheoLich(T, 23, { ngay: D3, bayGio: new Date(moc2 + 31 * 60_000) });
  dat("Hỏng 2 lần: 31 phút sau thử lại và thành công", c31.trangThai === "xong", JSON.stringify(c31));
  dat("Thành công xong thì ngày đó coi là đã quét", (await quetTheoLich(T, 23, { ngay: D3 })).trangThai === "da-quet");
  const chiMuc = await chu.$queryRaw<{ d: string }[]>`SELECT indexdef AS d FROM pg_indexes WHERE indexname = 'job_runs_lich_moi_ngay'`;
  dat("Chỉ mục job_runs_lich_moi_ngay là UNIQUE và loại trừ 'hong'", /UNIQUE/.test(chiMuc[0]?.d ?? "") && /'hong'/.test(chiMuc[0]?.d ?? ""), chiMuc[0]?.d);

  // ==================================================================
  console.log("\n— 4. Giới hạn tốc độ khi Redis hỏng —");
  const khoHong: KhoDem = { tang: async () => { throw new Error("Redis đứt"); }, xoa: async () => {} };
  const duPhong = new KhoDemBoNho();
  const ketQua: boolean[] = [];
  for (let i = 0; i < 5; i++) ketQua.push((await demVaKiem(`dang-nhap:1.2.3.4:${DAU}`, 3, 60, khoHong, duPhong)).choPhep);
  dat("Kho chính hỏng → vẫn đếm bằng bộ nhớ, lần 4 bị chặn", ketQua.join(",") === "true,true,true,false,false", ketQua.join(","));
  const coTran = new KhoDemBoNho(Date.now, 1_000);
  const bd = Date.now();
  for (let i = 0; i < 50_000; i++) await coTran.tang(`dang-nhap:1.2.3.4:email-la-${i}@x`, 900);
  dat("Kho bộ nhớ có trần: 50.000 khóa lạ chưa hết hạn → giữ ≤ 1.000 khóa", coTran.kichThuoc <= 1_000, String(coTran.kichThuoc));
  dat("…và không tốn O(n) mỗi lần đếm (50.000 lần < 2 giây)", Date.now() - bd < 2_000, `${Date.now() - bd} ms`);
  await coTran.tang("ip-that", 900);
  await coTran.tang("ip-that", 900);
  dat("Khóa mới nhất vẫn đếm đúng sau khi dọn", (await coTran.tang("ip-that", 900)).soLan === 3);
  const g = globalThis as unknown as { khoDemGioiHan?: KhoDem };
  const khoCu = g.khoDemGioiHan;
  const urlCu = process.env.REDIS_URL;
  g.khoDemGioiHan = undefined;
  process.env.REDIS_URL = "redis://127.0.0.1:1";
  const loiGoc = console.error;
  console.error = () => {};
  const bd2 = Date.now();
  const kqRedis: boolean[] = [];
  for (let i = 0; i < 6; i++) kqRedis.push((await demVaKiem(`qa-redis-hong:${DAU}`, 3, 60)).choPhep);
  const thoiGian = Date.now() - bd2;
  console.error = loiGoc;
  g.khoDemGioiHan = khoCu;
  if (urlCu === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = urlCu;
  dat("Redis sai địa chỉ: 6 lần đếm không chờ kết nối lại (< 500 ms tổng)", thoiGian < 500, `${thoiGian} ms`);
  dat("Redis sai địa chỉ: vẫn chặn từ lần 4", kqRedis.join(",") === "true,true,true,false,false,false", kqRedis.join(","));

  // ==================================================================
  console.log("\n— 5. guiThuThu (gửi thử chiến dịch): SMTP ngoài giao dịch —");
  if (!process.env.APP_ENC_KEY) {
    console.log("  (bỏ qua — thiếu APP_ENC_KEY)");
  } else {
    const smtp = await mayChuSmtpCham(6_000);
    await voi(T, gd, (nc) =>
      luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", xoaMatKhau: true, tenNguoiGui: "TGTH", emailNguoiGui: "noreply@tgth.test" })),
    );
    let moTrongLucCho = -1;
    smtp.khiChao = async () => {
      moTrongLucCho = await soGiaoDichDangMo();
    };
    const khoi = LuocDoMau.parse({ ten: "Mẫu", tieuDe: "Ưu đãi", khoi: [{ loai: "doan-van", noiDung: "Chào {{ten}}" }] }).khoi;
    const kq = await guiThuThu(buocTuPhien(phien(gd), { quyen: "marketing.create" }, null, null), { tieuDe: "Ưu đãi {{ten}}", khoi });
    dat("SMTP chậm 6 giây (> hạn 5 giây): gửi thử chiến dịch vẫn thành công", kq.ok === true, JSON.stringify(kq));
    dat("Trong lúc chờ SMTP: không giao dịch nào của ứng dụng đang mở", moTrongLucCho === 0, String(moTrongLucCho));
    dat("Nhật ký kiểm toán 'gui-thu' ghi ở bước sau", (await chu.auditLog.count({ where: { tenantId: T, objectType: "email_template", action: "gui-thu" } })) === 1);
    dat("Thư thử tới đúng hộp thư người bấm", smtp.thu.some((t) => /^RCPT/i.test(t) && t.includes(`giam-doc.${DAU}@qa.test`)), smtp.thu.join(" | ").slice(0, 300));
    const loiNv = await loiCua(() => guiThuThu(buocTuPhien(phien(nv), { quyen: "marketing.create" }, null, null), { tieuDe: "x", khoi }));
    dat("Nhân viên kinh doanh (thiếu marketing.create) bị chặn trước khi gửi", loiNv instanceof LoiThieuQuyen, String(loiNv));
    smtp.dong();
  }

  // ==================================================================
  console.log("\n— 6. Script sao lưu / thử phục hồi (thư mục tạm, CSDL QA) —");
  await thuScript();

  console.log("\n— 7. trien-khai.sh: cài cron idempotent (hộp cát) —");
  thuCron();

  console.log("\n— 8. nginx —");
  await thuNginx();

  await ungDung.$disconnect();
  await chu.$disconnect();
  ketLuan("QA Vận hành bền vững");
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

function coLenh(ten: string): string | null {
  const r = spawnSync("bash", ["-c", `command -v ${ten}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function chay(lenh: string, thamSo: string[], env: Record<string, string | undefined>, sauMs?: { ms: number; tinHieu: NodeJS.Signals }): Promise<{ ma: number | null; tinHieu: string | null; ra: string }> {
  return new Promise((ok) => {
    const c: ChildProcess = spawn(lenh, thamSo, { cwd: GOC, env: env as NodeJS.ProcessEnv });
    let ra = "";
    c.stdout?.on("data", (b) => (ra += b));
    c.stderr?.on("data", (b) => (ra += b));
    if (sauMs) setTimeout(() => c.kill(sauMs.tinHieu), sauMs.ms);
    c.on("close", (ma, tinHieu) => ok({ ma, tinHieu, ra }));
  });
}

async function thuScript() {
  const thieu = ["pg_dump", "pg_restore", "psql", "gpg", "flock", "tar"].filter((l) => !coLenh(l));
  if (thieu.length || !process.env.DATABASE_URL_OWNER) {
    console.log(`  (bỏ qua — thiếu ${thieu.join(", ") || "DATABASE_URL_OWNER"})`);
    return;
  }
  const rclone = coLenh("rclone");
  const tam = mkdtempSync(path.join(os.tmpdir(), "qa-sao-luu-"));
  const thuMuc = path.join(tam, "sao-luu");
  const dk = path.join(tam, "dinh-kem");
  const ngoai = path.join(tam, "ngoai");
  mkdirSync(path.join(dk, "con"), { recursive: true });
  mkdirSync(ngoai);
  writeFileSync(path.join(dk, "a.txt"), "tệp đính kèm");
  writeFileSync(path.join(dk, "con", "b.bin"), "b");

  // Máy nhận báo động (ALERT_WEBHOOK_URL).
  const baoDong: string[] = [];
  const may = http.createServer((q, r) => {
    let b = "";
    q.on("data", (d) => (b += d));
    q.on("end", () => {
      baoDong.push(b);
      r.end("ok");
    });
  });
  await new Promise<void>((ok) => may.listen(0, "127.0.0.1", ok));
  const urlBao = `http://127.0.0.1:${(may.address() as net.AddressInfo).port}/bao`;

  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const taoEnv = (ten: string, them: Record<string, string> = {}) => {
    const bien: Record<string, string> = {
      DATABASE_URL_OWNER: process.env.DATABASE_URL_OWNER!,
      APP_ENC_KEY: process.env.APP_ENC_KEY ?? "khoa-qa",
      SAO_LUU_KHONG_DOCKER: "1",
      THU_MUC_SAO_LUU: thuMuc,
      THU_MUC_DINH_KEM: dk,
      RCLONE_REMOTE: rclone ? ngoai : "",
      BACKUP_PASSPHRASE: "mat-khau-qa",
      BACKUP_PASSPHRASE_FILE: path.join(tam, "khong-co"),
      ALERT_WEBHOOK_URL: urlBao,
      ...them,
    };
    const p = path.join(tam, ten);
    writeFileSync(p, Object.entries(bien).map(([k, v]) => `${k}=${q(v)}`).join("\n") + "\n");
    return p;
  };
  // Không để .env của máy phát triển (REDIS, AUTH…) lẫn vào: chỉ truyền PATH/HOME.
  const envChay = (tepEnv: string, them: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({ PATH: process.env.PATH, HOME: process.env.HOME, TEP_ENV: tepEnv, ...them });
  const trangThai = () => JSON.parse(readFileSync(path.join(thuMuc, "trang-thai.json"), "utf8")) as Record<string, unknown>;
  const dsCsdlTam = async () => (await chu.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_database WHERE datname LIKE 'cowork_thu_phuc_hoi_%'`)[0].n;
  const truocCsdlTam = await dsCsdlTam();

  // 6a. Đường thành công
  const ok = await chay("./scripts/sao-luu.sh", [], envChay(taoEnv("env-ok")));
  const tep = readdirSync(thuMuc).filter((t) => t.startsWith("cowork-"));
  const luc = tep.find((t) => /^cowork-\d{8}T\d{6}Z\.dump$/.test(t))?.slice(7, 23) ?? "";
  dat("sao-luu.sh: thành công, mã 0", ok.ma === 0, ok.ra.slice(-800));
  dat(
    "…dump + gói đính kèm + .env.gpg CÙNG một mốc thời gian",
    Boolean(luc) && [`cowork-${luc}.dump`, `cowork-dinh-kem-${luc}.tar.gz`, `cowork-env-${luc}.env.gpg`].every((t) => tep.includes(t)),
    tep.join(" "),
  );
  if (rclone) dat("…đã chép đủ 3 tệp ra nơi ngoài máy (rclone, thư mục cục bộ)", readdirSync(ngoai).filter((t) => t.includes(luc)).length === 3, readdirSync(ngoai).join(" "));
  dat("…trang-thai.json ok", trangThai().ok === true, JSON.stringify(trangThai()));
  const hbOk = await chu.systemHeartbeat.findUniqueOrThrow({ where: { name: "sao-luu" } });
  dat("…nhịp 'sao-luu' ok, ghi .env đã mã hóa", hbOk.ok && (hbOk.info as Record<string, string>).env === "da-ma-hoa", JSON.stringify(hbOk.info));
  dat("…không để lại tệp .dang-ghi", !readdirSync(thuMuc).some((t) => t.endsWith(".dang-ghi")));

  // 6b. Thiếu mật khẩu sao lưu: vẫn sao lưu CSDL, bỏ .env, cảnh báo.
  await ngu(1_100); // mốc theo giây
  const kmk = await chay("./scripts/sao-luu.sh", [], envChay(taoEnv("env-kmk", { BACKUP_PASSPHRASE: "" })));
  const hbKmk = await chu.systemHeartbeat.findUniqueOrThrow({ where: { name: "sao-luu" } });
  dat("Thiếu mật khẩu: mã 0, cảnh báo to, nhịp ghi env='bo-qua'", kmk.ma === 0 && /CHƯA ĐẶT MẬT KHẨU/.test(kmk.ra) && (hbKmk.info as Record<string, string>).env === "bo-qua", kmk.ra.slice(-500));

  // 6c. pg_dump hỏng (sai cổng) → mã ≠ 0, trạng thái hỏng, báo động.
  baoDong.length = 0;
  const saiUrl = process.env.DATABASE_URL_OWNER!.replace(/@([^/:]+):\d+\//, "@$1:5999/");
  const hong = await chay("./scripts/sao-luu.sh", [], envChay(taoEnv("env-hong", { DATABASE_URL_OWNER: saiUrl })));
  dat("pg_dump hỏng: mã ≠ 0", hong.ma !== 0 && hong.ma !== null, String(hong.ma));
  dat("…trang-thai.json ok=false, nêu bước pg_dump", trangThai().ok === false && /pg_dump/.test(String(trangThai().loi)), JSON.stringify(trangThai()));
  dat("…đã gửi báo động 'SAO LƯU HỎNG' tới webhook", baoDong.some((b) => /SAO LƯU HỎNG/.test(b)), baoDong.join("|"));
  dat("…không để lại tệp .dang-ghi", !readdirSync(thuMuc).some((t) => t.endsWith(".dang-ghi")));

  // 6d. rclone hỏng → nhịp 'sao-luu' hỏng nhưng giữ mốc thành công cũ.
  if (rclone) {
    await ngu(1_100);
    const truoc = (await chu.systemHeartbeat.findUniqueOrThrow({ where: { name: "sao-luu" } })).lastOkAt;
    const rc = await chay("./scripts/sao-luu.sh", [], envChay(taoEnv("env-rc", { RCLONE_REMOTE: "khong-co-remote-qa:x", RCLONE_CONFIG: path.join(tam, "rclone.conf") })));
    const hbRc = await chu.systemHeartbeat.findUniqueOrThrow({ where: { name: "sao-luu" } });
    dat("rclone hỏng: mã ≠ 0, nhịp ok=false, mốc thành công cũ giữ nguyên", rc.ma !== 0 && !hbRc.ok && hbRc.lastOkAt?.getTime() === truoc?.getTime(), JSON.stringify(hbRc));
  }

  // 6e. Khóa flock: lần chạy chờ khóa quá hạn phải bỏ cuộc, và KHÔNG xóa tệp đang ghi của lần kia.
  const tepDo = path.join(thuMuc, "cowork-20000101T000000Z.dump.dang-ghi");
  writeFileSync(tepDo, "lần chạy kia đang ghi");
  const giu = spawn("flock", [path.join(thuMuc, ".khoa"), "sleep", "6"]);
  await ngu(300);
  const bd = Date.now();
  const khoa = await chay("./scripts/sao-luu.sh", [], envChay(taoEnv("env-khoa"), { SAO_LUU_CHO_KHOA_GIAY: "1" }));
  dat("Đang có lần sao lưu khác giữ khóa → bỏ cuộc sau hạn chờ, mã ≠ 0", khoa.ma !== 0 && Date.now() - bd < 5_000 && /đang chạy quá/.test(khoa.ra), khoa.ra.slice(-300));
  dat("…KHÔNG xóa tệp .dang-ghi của lần chạy đang giữ khóa (lỗi cũ: rm *.dang-ghi)", existsSync(tepDo));
  giu.kill();
  rmSync(tepDo, { force: true });

  // 6f. Bị kill giữa chừng (TERM) → vẫn ghi hỏng + báo động (lỗi cũ: trap EXIT thấy $? = 0).
  const binCham = path.join(tam, "bin");
  mkdirSync(binCham);
  for (const l of ["pg_dump", "pg_restore"]) {
    writeFileSync(path.join(binCham, l), `#!/bin/bash\nsleep 2\nexec ${coLenh(l)} "$@"\n`);
    chmodSync(path.join(binCham, l), 0o755);
  }
  baoDong.length = 0;
  await ngu(1_100);
  const bi = await chay("./scripts/sao-luu.sh", [], envChay(taoEnv("env-kill"), { PATH: `${binCham}:${process.env.PATH}` }), { ms: 800, tinHieu: "SIGTERM" });
  dat("sao-luu.sh bị TERM: thoát mã 143", bi.ma === 143, `${bi.ma}/${bi.tinHieu} ${bi.ra.slice(-300)}`);
  dat("…ghi trạng thái hỏng (mã 143)", trangThai().ok === false && /143/.test(String(trangThai().loi)), JSON.stringify(trangThai()));
  dat("…gửi báo động", baoDong.some((b) => /SAO LƯU HỎNG/.test(b)));
  dat("…không để lại tệp .dang-ghi", !readdirSync(thuMuc).some((t) => t.endsWith(".dang-ghi")));

  // 6g. Thử phục hồi: thành công, CSDL tạm bị xóa.
  const ph = await chay("./scripts/thu-phuc-hoi.sh", [], envChay(taoEnv("env-ph")));
  const hbPh = await chu.systemHeartbeat.findUnique({ where: { name: "thu-phuc-hoi" } });
  dat("thu-phuc-hoi.sh: đạt, mã 0, giải mã được .env", ph.ma === 0 && /giải mã được/.test(ph.ra), ph.ra.slice(-600));
  dat("…nhịp 'thu-phuc-hoi' ok", hbPh?.ok === true, JSON.stringify(hbPh));
  dat("…CSDL tạm đã xóa", (await dsCsdlTam()) === truocCsdlTam);

  // 6h. Bản dump hỏng → mã 1, CSDL tạm vẫn bị xóa, ghi hỏng.
  const hongDir = path.join(tam, "dump-hong");
  mkdirSync(hongDir);
  const L = "20990101T000000Z";
  writeFileSync(path.join(hongDir, `cowork-${L}.dump`), readFileSync(path.join(thuMuc, `cowork-${luc}.dump`)).subarray(0, 20_000));
  writeFileSync(path.join(hongDir, `cowork-dinh-kem-${L}.tar.gz`), readFileSync(path.join(thuMuc, `cowork-dinh-kem-${luc}.tar.gz`)));
  baoDong.length = 0;
  const phHong = await chay("./scripts/thu-phuc-hoi.sh", [], envChay(taoEnv("env-ph-hong"), { TEP_DUMP: path.join(hongDir, `cowork-${L}.dump`) }));
  dat("Dump cắt cụt: thu-phuc-hoi.sh mã ≠ 0 ở bước pg_restore", phHong.ma !== 0 && /pg_restore/.test(phHong.ra), phHong.ra.slice(-400));
  dat("…CSDL tạm vẫn bị xóa (trap)", (await dsCsdlTam()) === truocCsdlTam);
  dat("…nhịp 'thu-phuc-hoi' ok=false + báo động", (await chu.systemHeartbeat.findUnique({ where: { name: "thu-phuc-hoi" } }))?.ok === false && baoDong.some((b) => /THỬ PHỤC HỒI HỎNG/.test(b)));

  // 6i. Bị kill khi đang pg_restore → CSDL tạm bị xóa VÀ ghi hỏng (lỗi cũ: im lặng như thành công).
  await chu.$executeRaw`UPDATE system_heartbeats SET ok = true, last_ok_at = now() WHERE name = 'thu-phuc-hoi'`;
  baoDong.length = 0;
  const phKill = await chay("./scripts/thu-phuc-hoi.sh", [], envChay(taoEnv("env-ph-kill"), { PATH: `${binCham}:${process.env.PATH}` }), { ms: 1_200, tinHieu: "SIGTERM" });
  dat("thu-phuc-hoi.sh bị TERM: mã 143", phKill.ma === 143, `${phKill.ma}/${phKill.tinHieu}`);
  dat("…CSDL tạm đã xóa", (await dsCsdlTam()) === truocCsdlTam);
  dat("…ghi hỏng + báo động", (await chu.systemHeartbeat.findUnique({ where: { name: "thu-phuc-hoi" } }))?.ok === false && baoDong.some((b) => /THỬ PHỤC HỒI HỎNG/.test(b)));

  // Trả nhịp sao lưu về trạng thái "ok" cho các bài khác của chuỗi.
  await chu.$executeRaw`UPDATE system_heartbeats SET ok = true, last_ok_at = now(), info = '{}'::jsonb WHERE name IN ('sao-luu', 'thu-phuc-hoi')`;
  may.close();
  rmSync(tam, { recursive: true, force: true });
}

function thuCron() {
  if (process.getuid?.() !== 0) {
    console.log("  (bỏ qua — cần chạy bằng root như trien-khai.sh)");
    return;
  }
  const tam = mkdtempSync(path.join(os.tmpdir(), "qa-cron-"));
  mkdirSync(path.join(tam, "etc/cron.d"), { recursive: true });
  mkdirSync(path.join(tam, "etc/logrotate.d"), { recursive: true });
  const tk = readFileSync(path.join(GOC, "trien-khai.sh"), "utf8");
  const dau = tk.indexOf('echo "=== Lịch sao lưu');
  const cuoi = tk.indexOf('echo "=== Kiểm tra: ==="');
  if (dau < 0 || cuoi < 0) {
    dat("trien-khai.sh có khối cài lịch sao lưu", false);
    return;
  }
  const khoi = tk.slice(dau, cuoi).replaceAll("/etc/cron.d", `${tam}/etc/cron.d`).replaceAll("/etc/logrotate.d", `${tam}/etc/logrotate.d`);
  writeFileSync(path.join(tam, "khoi.sh"), `set -euo pipefail\ncd ${JSON.stringify(GOC)}\n${khoi}`);
  const env = { PATH: process.env.PATH, HOME: process.env.HOME } as unknown as NodeJS.ProcessEnv;
  const l1 = spawnSync("bash", [path.join(tam, "khoi.sh")], { encoding: "utf8", env });
  const tep = path.join(tam, "etc/cron.d/cowork-sao-luu");
  const nd1 = existsSync(tep) ? readFileSync(tep, "utf8") : "";
  dat("Lần 1: cài /etc/cron.d/cowork-sao-luu, chạy 02:15 bằng root", l1.status === 0 && /^15 2 \* \* \* root cd .* && \.\/scripts\/sao-luu\.sh/m.test(nd1), l1.stdout + l1.stderr);
  const l2 = spawnSync("bash", [path.join(tam, "khoi.sh")], { encoding: "utf8", env });
  dat("Lần 2: không đổi gì ('đã đúng'), nội dung giữ nguyên", l2.status === 0 && /đã đúng/.test(l2.stdout) && readFileSync(tep, "utf8") === nd1, l2.stdout);
  const l3 = spawnSync("bash", [path.join(tam, "khoi.sh")], { encoding: "utf8", env: { ...env, THU_PHUC_HOI_HANG_TUAN: "1" } as NodeJS.ProcessEnv });
  dat("THU_PHUC_HOI_HANG_TUAN=1: thêm dòng thử phục hồi Chủ nhật", l3.status === 0 && /^30 3 \* \* 0 root .*thu-phuc-hoi\.sh/m.test(readFileSync(tep, "utf8")));
  dat("Cài logrotate cho nhật ký sao lưu", existsSync(path.join(tam, "etc/logrotate.d/cowork-sao-luu")));
  rmSync(tam, { recursive: true, force: true });
}

async function thuNginx() {
  const conf = readFileSync(path.join(GOC, "nginx/cowork.conf"), "utf8");
  const tin = [...conf.matchAll(/^\s*set_real_ip_from\s+([^;]+);/gm)].map((m) => m[1].trim());
  dat("realip chỉ tin dải nội bộ (không 0.0.0.0/0, không ::/0)", tin.length > 0 && tin.every((d) => /^(127\.|10\.|172\.16\.|192\.168\.)/.test(d)), tin.join(" "));
  const nginx = coLenh("nginx");
  if (!nginx) {
    console.log("  (bỏ qua nginx -t — máy không có nginx)");
    return;
  }
  const tam = mkdtempSync(path.join(os.tmpdir(), "qa-nginx-"));
  mkdirSync(path.join(tam, "conf.d"));
  mkdirSync(path.join(tam, "logs"));
  // Máy "app" giả: trả lại các tiêu đề IP nhận được.
  const app = http.createServer((q, r) => r.end(JSON.stringify({ xri: q.headers["x-real-ip"], xff: q.headers["x-forwarded-for"] })));
  await new Promise<void>((ok) => app.listen(0, "127.0.0.1", ok));
  const congApp = (app.address() as net.AddressInfo).port;
  const congNginx = await congTrong();
  writeFileSync(
    path.join(tam, "conf.d/cowork.conf"),
    conf
      .replaceAll("/etc/nginx/conf.d/", `${tam}/conf.d/`)
      .replace(/listen 80;/, `listen 127.0.0.1:${congNginx};`)
      .replace(/set \$cowork_app app:3000;/, `set $cowork_app 127.0.0.1:${congApp};`),
  );
  writeFileSync(path.join(tam, "conf.d/cowork-proxy.inc"), readFileSync(path.join(GOC, "nginx/cowork-proxy.inc")));
  writeFileSync(
    path.join(tam, "nginx.conf"),
    `pid ${tam}/nginx.pid;\nerror_log ${tam}/logs/error.log;\nevents {}\nhttp { access_log off; client_body_temp_path ${tam}/logs; proxy_temp_path ${tam}/logs; include ${tam}/conf.d/*.conf; }\n`,
  );
  const t = spawnSync(nginx, ["-t", "-p", tam, "-c", path.join(tam, "nginx.conf")], { encoding: "utf8" });
  dat("nginx -t: cấu hình hợp lệ", t.status === 0, t.stderr);
  if (t.status !== 0) return;
  spawnSync(nginx, ["-p", tam, "-c", path.join(tam, "nginx.conf")]);
  await ngu(300);
  const goi = async (duong: string, tieuDe: Record<string, string>, phuongThuc = "GET") => {
    const r = await fetch(`http://127.0.0.1:${congNginx}${duong}`, { method: phuongThuc, headers: tieuDe });
    return { status: r.status, than: r.status === 200 ? ((await r.json()) as { xri?: string; xff?: string }) : null };
  };
  try {
    const gia = await goi("/api/v1/x", { "X-Forwarded-For": "9.9.9.9" });
    dat("Khách tự gửi X-Forwarded-For: ứng dụng KHÔNG thấy IP giả", gia.than?.xff !== "9.9.9.9" && !gia.than?.xff?.includes("9.9.9.9"), JSON.stringify(gia.than));
    const that = await goi("/api/v1/x", { "X-Real-IP": "1.2.3.4", "X-Forwarded-For": "9.9.9.9" });
    dat("nginx máy chủ đặt X-Real-IP: ứng dụng nhận đúng IP thật ở cả hai tiêu đề", that.than?.xri === "1.2.3.4" && that.than?.xff === "1.2.3.4", JSON.stringify(that.than));
    const ma: number[] = [];
    for (let i = 0; i < 14; i++) ma.push((await goi("/api/dang-nhap", { "X-Real-IP": "5.5.5.5" }, "POST")).status);
    dat("limit_req đăng nhập: dồn dập từ một IP → 429", ma.includes(429) && ma[0] === 200, ma.join(","));
    dat("…IP khác không bị ảnh hưởng", (await goi("/api/dang-nhap", { "X-Real-IP": "6.6.6.6" }, "POST")).status === 200);
  } finally {
    spawnSync(nginx, ["-p", tam, "-c", path.join(tam, "nginx.conf"), "-s", "stop"]);
    app.close();
    rmSync(tam, { recursive: true, force: true });
  }
}

function congTrong(): Promise<number> {
  return new Promise((ok) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const c = (s.address() as net.AddressInfo).port;
      s.close(() => ok(c));
    });
  });
}

/** Máy chủ SMTP giả: chờ `treMs` rồi mới chào, sau đó nhận thư và giữ nội dung. */
function mayChuSmtpCham(treMs: number): Promise<{ cong: number; dong: () => void; khiChao: (() => Promise<void>) | null; thu: string[] }> {
  return new Promise((ok) => {
    const ra = { cong: 0, dong: () => {}, khiChao: null as (() => Promise<void>) | null, thu: [] as string[] };
    const s = net.createServer((sock) => {
      const gui = (x: string) => sock.write(`${x}\r\n`);
      let dem = "";
      let trongData = false;
      sock.on("error", () => {});
      setTimeout(async () => {
        await ra.khiChao?.();
        gui("220 may-gia-cham ESMTP");
      }, treMs);
      sock.on("data", (b) => {
        dem += b.toString("utf8");
        for (;;) {
          if (trongData) {
            const ket = dem.indexOf("\r\n.\r\n");
            if (ket < 0) return;
            ra.thu.push(dem.slice(0, ket));
            dem = dem.slice(ket + 5);
            trongData = false;
            gui("250 OK");
            continue;
          }
          const xd = dem.indexOf("\r\n");
          if (xd < 0) return;
          const dong = dem.slice(0, xd);
          const lenh = dong.slice(0, 4).toUpperCase();
          dem = dem.slice(xd + 2);
          if (lenh === "EHLO") gui("250-may-gia\r\n250 8BITMIME");
          else if (lenh === "RCPT") {
            ra.thu.push(dong);
            gui("250 OK");
          } else if (lenh === "DATA") {
            trongData = true;
            gui("354 tiep");
          } else if (lenh === "QUIT") {
            gui("221 bye");
            sock.end();
          } else gui("250 OK");
        }
      });
    });
    s.listen(0, "127.0.0.1", () => {
      ra.cong = (s.address() as net.AddressInfo).port;
      ra.dong = () => s.close();
      ok(ra);
    });
  });
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
