/**
 * Nhập dữ liệu khách hàng từ ITW CRM (SQLite) sang Cowork — BUSINESS_RULES.md mục 21. QĐ-55.
 *
 *   npx tsx --env-file=.env scripts/nhap-tu-itw-crm.ts <đường-dẫn/itwcrm.db> [--ghi] [--tenant itw] [--email admin@...]
 *
 * MẶC ĐỊNH CHẠY THỬ: mọi thao tác chạy thật trong một giao dịch rồi CUỘN NGƯỢC ở cuối — báo cáo
 * chạy thử trùng khít với lúc ghi, mà không để lại gì. Thêm `--ghi` mới ghi.
 *
 * Nhập gì: trạng thái hành trình (theo tên), nhóm khách (theo tên), khách hàng, người liên hệ
 * (kèm ngày sinh), tương tác (ghi chú cuộc gọi / gặp…), trạng thái hành trình hiện tại của khách.
 * ITW CRM không có bảng lead riêng — lead của ITW là khách ở trạng thái "Lead mới", nên vào Cowork
 * thành khách hàng mang đúng trạng thái hành trình đó.
 *
 * Dò trùng: theo MST (KH-02) rồi theo điện thoại; trùng thì KHÔNG tạo khách mới, chỉ bổ sung nhóm.
 * Khách đã nhập lần trước nhận ra bằng dấu "ITW CRM <mã>" trong ghi chú — chạy lại không nhân đôi.
 * Gắn nhãn nguồn: mọi khách đi qua script nằm trong nhóm "ITW CRM" và mang dấu trong ghi chú.
 *
 * Chạy bằng vai `cowork_app` (DATABASE_URL) trong ngữ cảnh tenant: RLS vẫn áp, và mọi ghi đi qua
 * đúng service (kiểm trùng, nhật ký, sự kiện) với tư cách tài khoản `--email`.
 * Đọc SQLite bằng `node:sqlite` có sẵn trong Node 22 — không thêm thư viện.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import type { ClientTenant } from "../src/lib/db";
import { layHoSoQuyen } from "../src/lib/phan-quyen";
import { boDau, chuanHoaDienThoai, chuanHoaMaSoThue } from "../src/modules/crm/chuan-hoa";
import { taoKhachHang, taoLienHe } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { ghiDoiHanhTrinh, taoTrangThaiHanhTrinh, suaTrangThaiHanhTrinh } from "../src/modules/hanh-trinh/service";
import { ganKhachVaoNhom, taoNhomKhach } from "../src/modules/nhom-khach/service";
import { tinhLaiDiemKhach } from "../src/modules/cham-diem/service";

const doi = process.argv.slice(2);
const tepDb = doi.find((a) => !a.startsWith("--"));
const ghi = doi.includes("--ghi");
const giaTriCo = (ten: string, macDinh: string) => {
  const i = doi.indexOf(ten);
  return i >= 0 && doi[i + 1] ? doi[i + 1] : macDinh;
};
const MA_TENANT = giaTriCo("--tenant", "itw");
const EMAIL = giaTriCo("--email", process.env.SEED_ADMIN_EMAIL ?? "");

if (!tepDb) {
  console.error("Cách dùng: npx tsx --env-file=.env scripts/nhap-tu-itw-crm.ts <itwcrm.db> [--ghi] [--tenant itw] [--email admin@...]");
  process.exit(2);
}

class CuonNguoc extends Error {}

/** Phần nhỏ của `node:sqlite` script dùng. @types/node 20 chưa khai kiểu cho mô-đun này (Node 22 có sẵn). */
interface DatabaseSync {
  prepare(sql: string): { all(): unknown[] };
  close(): void;
}
async function moSqlite(duongDan: string): Promise<DatabaseSync> {
  const ten = "node:sqlite";
  const m = (await import(ten)) as { DatabaseSync: new (p: string, o: { readOnly: boolean }) => DatabaseSync };
  return new m.DatabaseSync(duongDan, { readOnly: true });
}

const khoa = (s: string | null | undefined) => boDau(s ?? "").replace(/[^a-z0-9]+/g, " ").trim();
const MAU = /^#[0-9A-Fa-f]{6}$/;
const LOAI: Record<string, string> = { open: "mo", won: "thanh-cong", lost: "that-bai" };

interface BaoCao {
  trangThaiMoi: number;
  trangThaiCo: number;
  nhomMoi: number;
  khachMoi: number;
  khachTrung: { ma: string; ten: string; lyDo: string; vao: string }[];
  khachDaNhap: number;
  khachLoi: { ma: string; ten: string; loi: string }[];
  lienHe: number;
  tuongTac: number;
  hanhTrinh: number;
  nguoiThay: Record<string, number>;
  nguonKhongKhop: Record<string, number>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Dong = Record<string, any>;

async function nhap(nc: NguCanh, tx: ClientTenant, db: DatabaseSync): Promise<BaoCao> {
  const bc: BaoCao = { trangThaiMoi: 0, trangThaiCo: 0, nhomMoi: 0, khachMoi: 0, khachTrung: [], khachDaNhap: 0, khachLoi: [], lienHe: 0, tuongTac: 0, hanhTrinh: 0, nguoiThay: {}, nguonKhongKhop: {} };
  const doc = (sql: string) => db.prepare(sql).all() as Dong[];

  // 1. Trạng thái hành trình — theo tên; giữ loại và số ngày đứng lâu Giám đốc đã đặt bên ITW.
  const daCoTT = await tx.customerJourneyStage.findMany({ select: { id: true, name: true } });
  const ttTheoTen = new Map(daCoTT.map((t) => [khoa(t.name), t.id]));
  const ttItw = new Map<number, string>();
  for (const s of doc("SELECT s.*, j.sort AS buoc FROM customer_statuses s LEFT JOIN journey_steps j ON j.id = s.step_id ORDER BY COALESCE(j.sort, 999), s.sort, s.id")) {
    let id = ttTheoTen.get(khoa(s.name));
    if (id) bc.trangThaiCo++;
    else {
      const loai = LOAI[s.kind] ?? "mo";
      const moi = await taoTrangThaiHanhTrinh(nc, {
        ten: String(s.name).slice(0, 100),
        mau: MAU.test(s.color ?? "") ? s.color : "#64748B",
        loai: loai as "mo",
        soNgayDungLau: loai !== "that-bai" && Number.isInteger(s.stale_days) && s.stale_days >= 1 && s.stale_days <= 365 ? s.stale_days : null,
        mocTuDong: null,
      });
      id = moi!.id;
      ttTheoTen.set(khoa(s.name), id);
      bc.trangThaiMoi++;
    }
    ttItw.set(Number(s.id), id);
  }

  // 2. Nhóm — theo tên; thêm nhóm nhãn "ITW CRM".
  const daCoNhom = await tx.customerGroup.findMany({ select: { id: true, name: true } });
  const nhomTheoTen = new Map(daCoNhom.map((g) => [khoa(g.name), g.id]));
  const layNhom = async (ten: string, mau: string) => {
    const k = khoa(ten);
    if (!nhomTheoTen.has(k)) {
      const g = await taoNhomKhach(nc, { ten, mau, moTa: ten === "ITW CRM" ? "Khách nhập từ ITW CRM bằng scripts/nhap-tu-itw-crm.ts" : null });
      nhomTheoTen.set(k, g!.id);
      bc.nhomMoi++;
    }
    return nhomTheoTen.get(k)!;
  };
  const nhomNhan = await layNhom("ITW CRM", "#7C3AED");
  const nhomItw = new Map<number, string>();
  for (const g of doc("SELECT * FROM customer_groups ORDER BY sort, id")) nhomItw.set(Number(g.id), await layNhom(String(g.name).slice(0, 100), MAU.test(g.color ?? "") ? g.color : "#2563EB"));
  const thanhVien = new Map<number, number[]>();
  for (const m of doc("SELECT customer_id, group_id FROM customer_group_members")) {
    thanhVien.set(Number(m.customer_id), [...(thanhVien.get(Number(m.customer_id)) ?? []), Number(m.group_id)]);
  }

  // 3. Người phụ trách: theo email, rồi theo tên đăng nhập = phần trước @ của email Cowork; không khớp → người chạy script.
  const nguoiCowork = await tx.user.findMany({ where: { status: "hoat-dong", isSystem: false }, select: { id: true, email: true } });
  const nguoiItw = new Map<number, string>();
  for (const u of doc("SELECT id, username, email FROM users")) {
    const theoEmail = u.email ? nguoiCowork.find((c) => c.email.toLowerCase() === String(u.email).toLowerCase()) : undefined;
    const theoTen = nguoiCowork.find((c) => c.email.toLowerCase().split("@")[0] === String(u.username).toLowerCase());
    const id = (theoEmail ?? theoTen)?.id;
    if (id) nguoiItw.set(Number(u.id), id);
  }
  const nguoiCua = (itwId: number | null) => {
    const id = itwId ? nguoiItw.get(itwId) : undefined;
    if (!id) {
      const k = itwId ? `ITW #${itwId}` : "(không có)";
      bc.nguoiThay[k] = (bc.nguoiThay[k] ?? 0) + 1;
    }
    return id ?? nc.hoSo.userId;
  };

  // 4. Dữ liệu gốc: loại khách, nguồn — so theo mã hoặc tên.
  const dlg = await tx.masterDataItem.findMany({ where: { type: { in: ["loai_khach_hang", "nguon_lead"] }, status: "hoat-dong" }, select: { type: true, code: true, name: true } });
  const maDlg = (loai: string, gt: string | null) => {
    if (!gt) return null;
    const k = khoa(gt);
    return dlg.find((m) => m.type === loai && (khoa(m.code) === k || khoa(m.name) === k))?.code ?? null;
  };

  // 5. Khách hàng.
  const lienHeItw = new Map<number, Dong[]>();
  for (const c of doc("SELECT * FROM contacts ORDER BY is_primary DESC, id")) lienHeItw.set(Number(c.customer_id), [...(lienHeItw.get(Number(c.customer_id)) ?? []), c]);
  const tuongTacItw = new Map<number, Dong[]>();
  for (const a of doc("SELECT * FROM activities WHERE type <> 'system' ORDER BY created_at")) tuongTacItw.set(Number(a.customer_id), [...(tuongTacItw.get(Number(a.customer_id)) ?? []), a]);

  for (const k of doc("SELECT * FROM customers WHERE deleted_at IS NULL AND merged_into IS NULL ORDER BY id")) {
    const dau = `ITW CRM ${k.code}`;
    await tx.$executeRawUnsafe("SAVEPOINT itw_khach");
    try {
      // Đã nhập lần trước?
      const cu = await tx.customer.findFirst({ where: { note: { contains: dau } }, select: { id: true } });
      if (cu) {
        bc.khachDaNhap++;
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT itw_khach");
        continue;
      }
      let mst: string | null = null;
      try {
        mst = chuanHoaMaSoThue(k.tax_code);
      } catch {
        mst = null;
      }
      let dt: string | null = null;
      try {
        dt = chuanHoaDienThoai(k.phone);
      } catch {
        dt = null;
      }
      const chonTrung = { id: true, code: true, status: true, mergedInto: { select: { id: true, code: true } } } as const;
      const timThay =
        (mst && (await tx.customer.findFirst({ where: { taxCodeNormalized: mst }, select: chonTrung }))) ||
        (dt && (await tx.customer.findFirst({ where: { OR: [{ phoneNormalized: dt }, { contacts: { some: { phoneNormalized: dt } } }] }, select: chonTrung, orderBy: { status: "asc" } })));
      // Khách trùng mà đã gộp → đi theo khách giữ lại (merged_into_id luôn trỏ thẳng, không chuỗi — KHN-12).
      const trung = timThay ? (timThay.status === "da-gop" && timThay.mergedInto ? timThay.mergedInto : timThay) : null;
      const nhomCua = [nhomNhan, ...(thanhVien.get(Number(k.id)) ?? []).map((g) => nhomItw.get(g)).filter((g): g is string => Boolean(g))];
      if (trung) {
        bc.khachTrung.push({ ma: k.code, ten: k.name, lyDo: mst && trung ? "Trùng MST hoặc điện thoại" : "Trùng điện thoại", vao: trung.code });
        for (const g of nhomCua) await ganKhachVaoNhom(nc, g, [trung.id]);
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT itw_khach");
        continue;
      }
      const nguon = maDlg("nguon_lead", k.source);
      if (k.source && !nguon) bc.nguonKhongKhop[k.source] = (bc.nguonKhongKhop[k.source] ?? 0) + 1;
      const ghiChu = [k.notes, `[${dau}]${k.source && !nguon ? ` Nguồn bên ITW: ${k.source}.` : ""}`].filter(Boolean).join("\n");
      const moi = await taoKhachHang(
        nc,
        LuocDoTaoKhachHang.parse({
          ten: String(k.name).slice(0, 255),
          maSoThue: mst ? k.tax_code : "",
          loaiKhach: maDlg("loai_khach_hang", String(k.type ?? "").replace(/_/g, "-")),
          nguon,
          dienThoai: dt ? k.phone : "",
          email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email ?? "") ? k.email : "",
          diaChi: k.address ?? "",
          nguoiPhuTrachId: nguoiCua(k.owner_id ? Number(k.owner_id) : null),
          ghiChu,
          xacNhanKhongTrung: true,
        }),
      );
      bc.khachMoi++;
      for (const c of lienHeItw.get(Number(k.id)) ?? []) {
        let dtLh: string | null = null;
        try {
          dtLh = chuanHoaDienThoai(c.phone);
        } catch {
          dtLh = null;
        }
        await taoLienHe(nc, moi.id, {
          hoTen: String(c.name ?? "Liên hệ").slice(0, 255),
          chucDanh: c.position ?? null,
          dienThoai: dtLh ? c.phone : null,
          email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email ?? "") ? c.email : null,
          ngaySinh: /^\d{4}-\d{2}-\d{2}$/.test(c.birthday ?? "") ? c.birthday : null,
          laChinh: Boolean(c.is_primary),
          ghiChu: c.notes ?? null,
        });
        bc.lienHe++;
      }
      // Tương tác: giữ đúng thời điểm và người làm bên ITW (ghi thẳng, kèm một dòng kiểm toán cho cả lô).
      const ds = tuongTacItw.get(Number(k.id)) ?? [];
      for (const a of ds) {
        const loai = ["call", "email", "zalo", "meeting", "visit", "note"].includes(a.type) ? a.type : "note";
        const noiDung = String(a.content ?? "").trim();
        await tx.interaction.create({
          data: {
            tenantId: nc.tenantId,
            type: loai,
            subject: (noiDung.split("\n")[0] || "Ghi chú từ ITW CRM").slice(0, 200),
            content: noiDung || null,
            occurredAt: new Date(a.created_at),
            customerId: moi.id,
            ownerId: nguoiCua(a.user_id ? Number(a.user_id) : null),
            createdBy: nc.hoSo.userId,
            updatedBy: nc.hoSo.userId,
          },
        });
        bc.tuongTac++;
      }
      if (ds.length) await nc.kiemToan({ action: "tao", objectType: "interaction", after: { nhapTuItwCrm: k.code, khachHangId: moi.id, soTuongTac: ds.length } });
      for (const g of nhomCua) await ganKhachVaoNhom(nc, g, [moi.id]);
      const tt = k.status_id ? ttItw.get(Number(k.status_id)) : undefined;
      if (tt) {
        const hien = await tx.customer.findUniqueOrThrow({ where: { id: moi.id }, select: { journeyStageId: true } });
        if (await ghiDoiHanhTrinh(nc, { id: moi.id, journeyStageId: hien.journeyStageId }, tt, { ghiChu: `Trạng thái bên ITW CRM (${k.code})` })) bc.hanhTrinh++;
      }
      await tinhLaiDiemKhach(tx, moi.id);
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT itw_khach");
    } catch (e) {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT itw_khach");
      bc.khachLoi.push({ ma: k.code, ten: k.name, loi: e instanceof Error ? e.message : String(e) });
    }
  }
  void suaTrangThaiHanhTrinh;
  return bc;
}

async function main() {
  const db = await moSqlite(tepDb!);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const chu = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL! }) });
  // Tra tenant + người chạy bằng vai chủ sở hữu (chỉ ĐỌC); mọi GHI đi qua vai cowork_app + RLS.
  const tenant = await chu.tenant.findUnique({ where: { code: MA_TENANT }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Không có doanh nghiệp mã "${MA_TENANT}".`);
  const nguoi = await chu.user.findFirst({ where: { tenantId: tenant.id, email: EMAIL.toLowerCase(), status: "hoat-dong" }, select: { id: true } });
  if (!nguoi) throw new Error(`Không có người dùng đang hoạt động ${EMAIL} trong "${MA_TENANT}" (dùng --email).`);
  await chu.$disconnect();

  console.log(`Nhập từ ${tepDb} vào "${tenant.name}" với tư cách ${EMAIL} — ${ghi ? "GHI THẬT" : "CHẠY THỬ (không ghi gì)"}\n`);
  let bc: BaoCao | null = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        const hoSo = await layHoSoQuyen(tx as ClientTenant, nguoi.id);
        if (!hoSo) throw new Error("Không đọc được hồ sơ quyền.");
        for (const q of ["customer.create", "customer.update", "customer.approve"]) {
          if (!hoSo.quyen.has(q)) throw new Error(`Tài khoản chạy script thiếu quyền ${q}.`);
        }
        bc = await nhap(taoNguCanh(tx as ClientTenant, tenant.id, hoSo, null, "scripts/nhap-tu-itw-crm"), tx as ClientTenant, db);
        if (!ghi) throw new CuonNguoc();
      },
      { timeout: 30 * 60_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (!(e instanceof CuonNguoc)) throw e;
  } finally {
    await prisma.$disconnect();
    db.close();
  }
  const b = bc as BaoCao | null;
  if (!b) return;
  console.log(`Trạng thái hành trình: ${b.trangThaiMoi} mới, ${b.trangThaiCo} đã có (theo tên)`);
  console.log(`Nhóm khách mới: ${b.nhomMoi} (gồm nhóm nhãn "ITW CRM" nếu chưa có)`);
  console.log(`Khách hàng: ${b.khachMoi} mới · ${b.khachTrung.length} trùng (không tạo, chỉ gắn nhóm) · ${b.khachDaNhap} đã nhập lần trước · ${b.khachLoi.length} lỗi`);
  console.log(`Người liên hệ: ${b.lienHe} · Tương tác: ${b.tuongTac} · Đặt trạng thái hành trình: ${b.hanhTrinh}`);
  for (const t of b.khachTrung) console.log(`  ↔ ${t.ma} ${t.ten} — ${t.lyDo} với ${t.vao}`);
  for (const l of b.khachLoi) console.log(`  ✗ ${l.ma} ${l.ten} — ${l.loi}`);
  if (Object.keys(b.nguoiThay).length) console.log(`Người phụ trách không khớp (giao cho ${EMAIL}):`, b.nguoiThay);
  if (Object.keys(b.nguonKhongKhop).length) console.log("Nguồn không có trong Dữ liệu gốc (ghi vào ghi chú khách):", b.nguonKhongKhop);
  console.log(ghi ? "\n✓ Đã ghi." : "\nChạy thử xong — chưa ghi gì. Thêm --ghi để ghi thật.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
