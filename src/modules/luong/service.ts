import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { laLoiTrung, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { banDoTen, lichCuaNhieuNguoi, ngayLeTrongKhoang } from "@/modules/cham-cong/chung";
import { CO_NGAY, cacNgayTrongThang, congDuKien, thuTrongTuan } from "@/modules/cham-cong/tinh-toan";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { ketQuaHieuLuc } from "@/modules/danh-gia/service";
import { baoChoNguoiCoQuyen, nguoiGiuQuyen, taoThongBao } from "@/modules/thong-bao/service";
import { batBuoc2Lop, batBuocQuyenLuong, docCauHinhLuong, ghiXem, locNguoiLuong, thamSoHieuLuc, trongPhamViLuong, xemDuocNguoiKhac, type BoApDung } from "./chung";
import { hoSoApDung, soNguoiPhuThuoc } from "./ho-so";
import { LuocDoTaoKy, NHAN_LOAI_KHOAN, type LuocDoCongTayLuong, type LuocDoKhoan, type LuocDoLyDo } from "./luoc-do";
import {
  coLoi,
  khoangThang,
  laKyDaKhoa,
  nhanKy,
  NHAN_TRANG_THAI_KY,
  soKhopKetQua,
  thangLui,
  tinhLuong,
  truyThuHoaHong,
  type CanhBaoLuong,
  type DauVaoLuong,
  type KetQuaLuong,
  type PhutTangCa,
  type TrangThaiKy,
  chonBoHieuLuc,
  PHUT_TANG_CA_RONG,
  type CachTra,
  type DoanLuong,
  type LoaiHopDong,
} from "./tinh-toan";

/**
 * Kỳ lương tháng (LU-20 → LU-45): Nháp → Kế toán tính và kiểm → Gửi duyệt → Giám đốc duyệt → Khóa → Đã chi.
 *
 *  - Chỉ tính khi BẢNG CÔNG tháng đó đã khóa (0.19.0); ngày "thiếu giờ" còn chờ quyết → chặn, báo danh sách.
 *  - Mỗi lần tính: khóa dòng kỳ (QĐ-77), xóa dòng / hoa hồng của bản nháp, tính lại từ dữ liệu hiện có, lưu ẢNH CHỤP
 *    đầu vào từng dòng (LU-28). Khoản cộng / trừ nhập tay giữ nguyên.
 *  - Từ "đã khóa": bất biến (trigger `chan_sua_ky_luong_da_khoa`). Sai sót → khoản ĐIỀU CHỈNH ở kỳ sau (LU-31).
 *  - Người tính không duyệt / khóa (CHECK + máy chủ); không ai duyệt / khóa bảng lương có dòng của chính mình (LU-41).
 *  - Mọi thao tác trừ xem phiếu của mình: bắt buộc 2 lớp; mỗi lần xem lương người khác ghi nhật ký (LU-61, LU-62).
 */

const SO_TIEN_NHAN = (n: number) => `${n.toLocaleString("vi-VN")} đ`;

/** 0.22.0 (QĐ-172): nguồn công của một dòng lương — ghi vào ảnh chụp đầu vào (`inputs.nguon.nguonCong`). */
export type NguonCong = "bang-cong" | "nhap-tay" | "mac-dinh";
export const NHAN_NGUON_CONG: Record<NguonCong, string> = { "bang-cong": "Bảng công đã khóa", "nhap-tay": "Công nhập tay", "mac-dinh": "Mặc định đủ công chuẩn" };
type DongCong = {
  workDate: Date;
  workValue: number | Prisma.Decimal;
  leavePaid: boolean;
  leaveDays: number | Prisma.Decimal;
  lateMinutes: number;
  earlyMinutes: number;
  isAdjustment: boolean;
  otMinutes: number;
  otNightMinutes: number;
  dayType: string;
};

type KyLuong = NonNullable<Awaited<ReturnType<ClientTenant["payrollRun"]["findFirst"]>>>;

async function docKyKhoa(nc: NguCanh, id: string): Promise<KyLuong> {
  await khoaChungTu(nc.tx, "payroll_runs", id);
  const ky = await nc.tx.payrollRun.findFirst({ where: { id } });
  if (!ky) throw new LoiKhongTimThay("Kỳ lương");
  return ky;
}

function batBuocTrangThai(ky: KyLuong, ds: TrangThaiKy[], viec: string) {
  if (!ds.includes(ky.status as TrangThaiKy)) {
    throw new LoiNghiepVu(
      `Kỳ lương ${nhanKy(ky.year, ky.month)} đang “${NHAN_TRANG_THAI_KY[ky.status as TrangThaiKy] ?? ky.status}” — không ${viec} được. Tải lại trang để xem trạng thái mới.`,
      409,
      "sai-trang-thai",
    );
  }
}

// ---------------------------------------------------------------------------
// Danh sách / tạo kỳ
// ---------------------------------------------------------------------------

export async function danhSachKyLuong(nc: NguCanh) {
  batBuocQuyenLuong(nc, "luong.view", { objectType: "payroll_run" });
  const loc = await locNguoiLuong(nc);
  const ds = await nc.tx.payrollRun.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 36 });
  const tong = await nc.tx.payrollLine.groupBy({
    by: ["runId"],
    where: { runId: { in: ds.map((k) => k.id) }, ...loc },
    _count: { _all: true },
    _sum: { grossIncome: true, netPay: true, employerInsurance: true, personalIncomeTax: true },
  });
  const loi = await nc.tx.payrollLine.groupBy({ by: ["runId"], where: { runId: { in: ds.map((k) => k.id) }, hasError: true, ...loc }, _count: { _all: true } });
  const theoKy = new Map(tong.map((t) => [t.runId, t]));
  const loiKy = new Map(loi.map((t) => [t.runId, t._count._all]));
  await ghiXem(nc, "danh-sach-ky-luong", { objectType: "payroll_run" });
  return ds.map((k) => {
    const t = theoKy.get(k.id);
    return {
      id: k.id, nam: k.year, thang: k.month, nhan: nhanKyLuong(k), rieng: k.members.length > 0, soThanhVien: k.members.length, trangThai: k.status as TrangThaiKy,
      nhanTrangThai: NHAN_TRANG_THAI_KY[k.status as TrangThaiKy], canTinhLai: k.dirty, tinhLuc: k.calculatedAt,
      soNguoi: t?._count._all ?? 0, soLoi: loiKy.get(k.id) ?? 0,
      tongThuNhap: Number(t?._sum.grossIncome ?? 0), tongThucLinh: Number(t?._sum.netPay ?? 0),
      tongThue: Number(t?._sum.personalIncomeTax ?? 0), tongBhDn: Number(t?._sum.employerInsurance ?? 0),
    };
  });
}

/**
 * Tạo kỳ lương tháng: kỳ CHUNG (mọi người có hồ sơ lương, trừ người đã thuộc kỳ riêng cùng tháng) hoặc kỳ RIÊNG cho một
 * nhóm người — QĐ-165, dùng khi bảng lương có dòng của người duyệt (vd Giám đốc): tách dòng lãnh đạo sang kỳ riêng để
 * Quản trị / Giám đốc khác duyệt. Một người chỉ thuộc một kỳ riêng mỗi tháng; người đã có dòng ở kỳ chung không ở
 * trạng thái nháp thì không tách được.
 */
export async function taoKyLuong(nc: NguCanh, vao: z.input<typeof LuocDoTaoKy>) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_run" });
  const d = LuocDoTaoKy.parse(vao);
  // Khóa tư vấn theo (doanh nghiệp, tháng): hai lần tạo kỳ riêng cùng lúc không chen người trùng.
  await nc.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ky-luong:${nc.tenantId}:${d.nam}-${d.thang}`}))`;
  if (d.thanhVien.length) {
    const nguoi = await nc.tx.user.findMany({ where: { id: { in: d.thanhVien }, isSystem: false }, select: { id: true } });
    if (nguoi.length !== d.thanhVien.length) throw new LoiKhongTimThay("Nhân viên");
    const cungThang = await nc.tx.payrollRun.findMany({ where: { year: d.nam, month: d.thang }, select: { id: true, name: true, members: true, status: true } });
    const trung = cungThang.filter((k) => k.members.some((m) => d.thanhVien.includes(m)));
    if (trung.length) throw new LoiNghiepVu(`Có người đã thuộc kỳ lương riêng “${trung[0].name}” tháng ${nhanKy(d.nam, d.thang)}.`, 409, "trung-thanh-vien");
    const timChung = cungThang.find((k) => k.members.length === 0);
    // QA 0.21.0 v2: KHÓA DÒNG kỳ chung (QĐ-77) rồi mới đọc trạng thái — gửi duyệt kỳ chung chạy chéo (khóa dòng kỳ, không
    // lấy khóa tư vấn) từng commit giữa lúc đọc "nháp" và lúc đánh dấu tính lại → người vừa ở kỳ chung đã gửi duyệt vừa
    // ở kỳ riêng (trả lương hai lần).
    if (timChung) await khoaChungTu(nc.tx, "payroll_runs", timChung.id);
    const chung = timChung ? await nc.tx.payrollRun.findFirst({ where: { id: timChung.id }, select: { id: true, status: true } }) : null;
    if (chung) {
      const daCoDong = await nc.tx.payrollLine.count({ where: { runId: chung.id, userId: { in: d.thanhVien } } });
      if (daCoDong && chung.status !== "nhap") {
        throw new LoiNghiepVu(`Kỳ chung tháng ${nhanKy(d.nam, d.thang)} đang “${NHAN_TRANG_THAI_KY[chung.status as TrangThaiKy]}” và đã có dòng của người được chọn — trả lại kỳ chung về nháp trước rồi tách.`, 409, "da-co-dong-ky-chung");
      }
      // Kỳ chung còn nháp: phải tính lại để bỏ những người vừa tách ra.
      if (daCoDong) await nc.tx.payrollRun.update({ where: { id: chung.id }, data: { dirty: true } });
    }
  }
  try {
    const ky = await nc.tx.payrollRun.create({ data: { tenantId: nc.tenantId, year: d.nam, month: d.thang, name: d.ten, members: d.thanhVien, createdBy: nc.hoSo.userId } });
    await nc.kiemToan({ action: "tao-ky-luong", objectType: "payroll_run", objectId: ky.id, after: { ky: nhanKy(d.nam, d.thang), ten: d.ten, soNguoi: d.thanhVien.length, thanhVien: d.thanhVien } });
    return { id: ky.id };
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiNghiepVu(d.ten ? `Kỳ lương riêng “${d.ten}” tháng ${nhanKy(d.nam, d.thang)} đã có.` : `Kỳ lương chung ${nhanKy(d.nam, d.thang)} đã có.`, 409, "ky-da-co");
    throw e;
  }
}

/** Nhãn kỳ: "03/2026" hoặc "03/2026 — Lãnh đạo". */
export const nhanKyLuong = (k: { year: number; month: number; name: string | null }) => `${nhanKy(k.year, k.month)}${k.name ? ` — ${k.name}` : ""}`;

// ---------------------------------------------------------------------------
// Tính lương (LU-21 → LU-30)
// ---------------------------------------------------------------------------

interface PhanBoThu {
  allocation_id: string;
  payment_id: string;
  number: string;
  received_at: Date;
  amount: Prisma.Decimal;
  owner_id: string;
}

/** Phân bổ phiếu thu CÒN HIỆU LỰC tính hoa hồng cho kỳ (LU-23, QĐ-146). */
async function phanBoTinhHoaHong(tx: ClientTenant, kyId: string, nguoi: string[], nam: number, thang: number, luiThang: number): Promise<PhanBoThu[]> {
  if (nguoi.length === 0) return [];
  const { tu, den } = khoangThang(nam, thang);
  const lui = thangLui(nam, thang, luiThang);
  const tuLui = khoangThang(lui.nam, lui.thang).tu;
  return tx.$queryRaw<PhanBoThu[]>`
    SELECT pa.id::text AS allocation_id, p.id::text AS payment_id, p.number, p.received_at, pa.amount,
           COALESCE(so.owner_id, i.owner_id)::text AS owner_id
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    JOIN invoices i ON i.id = pa.invoice_id
    LEFT JOIN sales_orders so ON so.id = i.sales_order_id
    WHERE p.status = 'hoat-dong'
      AND COALESCE(so.owner_id, i.owner_id) = ANY(${nguoi}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM payroll_commission_items c WHERE c.allocation_id = pa.id AND c.kind = 'thu' AND c.run_id <> ${kyId}::uuid)
      AND (
        p.received_at BETWEEN ${tu}::date AND ${den}::date
        OR (p.received_at >= ${tuLui}::date AND p.received_at < ${tu}::date AND EXISTS (
              SELECT 1 FROM payroll_runs r
              WHERE r.year = EXTRACT(YEAR FROM p.received_at)::int AND r.month = EXTRACT(MONTH FROM p.received_at)::int
                AND r.status <> 'nhap' AND r.calculated_at < p.created_at))
      )
    ORDER BY p.received_at, p.number, pa.id`;
}

/** Hoa hồng đã trả ở kỳ ĐÃ KHÓA mà phiếu thu nay đã hủy, chưa truy thu (LU-24). */
async function canTruyThu(tx: ClientTenant, nam: number, thang: number) {
  return tx.$queryRaw<{ allocation_id: string; payment_id: string; payment_no: string; received_at: Date; amount: bigint; rate_bp: number; user_id: string; run_id: string }[]>`
    SELECT c.allocation_id::text AS allocation_id, c.payment_id::text AS payment_id, c.payment_no, c.received_at, c.amount, c.rate_bp,
           c.user_id::text AS user_id, c.run_id::text AS run_id
    FROM payroll_commission_items c
    JOIN payroll_runs r ON r.id = c.run_id
    JOIN payments p ON p.id = c.payment_id
    WHERE c.kind = 'thu' AND r.status IN ('da-khoa', 'da-chi') AND p.status = 'huy' AND c.commission > 0
      AND (r.year * 12 + r.month) < ${nam * 12 + thang}
      AND NOT EXISTS (SELECT 1 FROM payroll_commission_items t WHERE t.allocation_id = c.allocation_id AND t.kind = 'truy-thu')
    ORDER BY c.received_at, c.payment_no`;
}

/** Ngày thiếu giờ CÒN CHỜ QUYẾT trong bảng công đã khóa (LU-22): cờ chờ xét và chưa có quyết định nào. */
async function ngayThieuGioCho(tx: ClientTenant, timesheetId: string) {
  const dong = await tx.timesheetRow.findMany({
    where: { timesheetId, isAdjustment: false, flags: { array_contains: [CO_NGAY.thieuGioChoXet] } },
    select: { userId: true, workDate: true },
  });
  if (dong.length === 0) return { cho: [], quyetSau: [] };
  const qd = await tx.attendanceDayReview.findMany({
    where: { OR: dong.map((d) => ({ userId: d.userId, workDate: d.workDate })) },
    select: { userId: true, workDate: true },
  });
  const coQd = new Set(qd.map((q) => `${q.userId}|${dateVeNgay(q.workDate)}`));
  const cho = dong.filter((d) => !coQd.has(`${d.userId}|${dateVeNgay(d.workDate)}`));
  const quyetSau = dong.filter((d) => coQd.has(`${d.userId}|${dateVeNgay(d.workDate)}`));
  return { cho, quyetSau };
}

export async function tinhKyLuong(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_run", objectId: id });
  const ky = await docKyKhoa(nc, id);
  batBuocTrangThai(ky, ["nhap"], "tính lại");
  const { tu, den } = khoangThang(ky.year, ky.month);
  const tx = nc.tx;

  // 0.22.0 (QĐ-172): KHÔNG bắt buộc bảng công đã khóa. Nguồn công từng người: (a) bảng công ĐÃ KHÓA nếu có dòng của
  // người đó; (b) công nhập tay của kế toán / nhân sự trên dòng nháp; (c) mặc định ĐỦ CÔNG CHUẨN + cảnh báo vàng. Bảng
  // công khóa sau → "Lấy lại công từ bảng công" (kỳ còn nháp). Bảng công nháp không được dùng (chưa qua phản hồi).
  const bangTim = await tx.timesheet.findFirst({ where: { year: ky.year, month: ky.month } });
  const bang = bangTim?.status === "da-khoa" ? bangTim : null;
  const ch = await docCauHinhLuong(tx);
  const canhBaoKy: CanhBaoLuong[] = [];
  if (!bang) {
    canhBaoKy.push({
      ma: "bang-cong-chua-khoa",
      muc: "canh-bao",
      noiDung: `Bảng công tháng ${nhanKy(ky.year, ky.month)} ${bangTim ? "chưa khóa" : "chưa sinh"} — công lấy từ công nhập tay, người chưa có công nhập tay tạm tính đủ công chuẩn. Khi Nhân sự khóa bảng công, bấm “Lấy lại công từ bảng công”.`,
    });
  }
  // 0.22.0 (QĐ-172): ngày "thiếu giờ" còn chờ quyết KHÔNG chặn — tính theo giá trị hiện tại (đã khóa) và cảnh báo; quyết
  // sau thì phần chênh vào dòng điều chỉnh bảng công tháng sau (NS-53).
  const tg = bang ? await ngayThieuGioCho(tx, bang.id) : { cho: [], quyetSau: [] };
  const choTheoNguoi = new Map<string, string[]>();
  for (const d of tg.cho) choTheoNguoi.set(d.userId, [...(choTheoNguoi.get(d.userId) ?? []), dateVeNgay(d.workDate)]);
  if (tg.cho.length) {
    const ten = await banDoTen(tx, tg.cho.map((d) => d.userId));
    canhBaoKy.push({
      ma: "con-ngay-thieu-gio",
      muc: "canh-bao",
      noiDung: `Còn ${tg.cho.length} ngày công “thiếu giờ” chờ quản lý quyết (${tg.cho.slice(0, 5).map((x) => `${ten.get(x.userId) ?? "—"} ${dateVeNgay(x.workDate).split("-").reverse().join("/")}`).join("; ")}${tg.cho.length > 5 ? "…" : ""}) — lương tính theo số công hiện tại; quyết sau thì phần chênh vào dòng điều chỉnh bảng công tháng sau.`,
    });
  }

  const ts = await thamSoHieuLuc(tx, den);
  const chuaXacNhan = ts.bo.filter((b) => !b.daXacNhan);
  if (chuaXacNhan.length) {
    // 0.22.0 (QĐ-170): mặc định chỉ cảnh báo; Cấu hình `luong.chan_khi_tham_so_chua_xac_nhan` = 1 → lỗi cấp kỳ (chặn gửi duyệt).
    const chan = ch.chanThamSoChuaXacNhan === 1;
    canhBaoKy.push({
      ma: "tham-so-chua-xac-nhan",
      muc: chan ? "loi" : "canh-bao",
      noiDung: `Tham số chưa được kế toán xác nhận: ${chuaXacNhan.map((b) => `${b.loai} (từ ${b.hieuLucTu})`).join(", ")}. ${chan ? "Xác nhận ở Tính lương → Tham số rồi tính lại." : "Vẫn gửi duyệt / duyệt được (kiểm toán ghi lại); nên xác nhận ở Tính lương → Tham số."}`,
    });
  }
  if (tg.quyetSau.length) {
    canhBaoKy.push({ ma: "thieu-gio-quyet-sau-khoa", muc: "canh-bao", noiDung: `${tg.quyetSau.length} ngày thiếu giờ được quyết SAU khi khóa bảng công — lương kỳ này theo số đã khóa, chênh lệch vào dòng điều chỉnh bảng công tháng sau.` });
  }

  // Ai vào bảng lương: có hồ sơ hiệu lực trong tháng (phiên bản ≤ ngày cuối tháng), đang hoạt động hoặc có dòng công
  // tháng này. Lương theo công chia đoạn theo từng phiên bản (QĐ-156).
  const dong = bang ? await tx.timesheetRow.findMany({ where: { timesheetId: bang.id } }) : [];
  const coCong = new Set(dong.map((r) => r.userId));
  const congTay = new Map((await tx.payrollManualInput.findMany({ where: { runId: id } })).map((x) => [x.userId, x]));
  // QA 0.22.0: bảng công NHÁP không dùng để tính (chưa qua phản hồi / khóa) nhưng dùng để CẢNH BÁO — người đang tạm tính
  // "mặc định đủ công" mà bảng công nháp ghi ít công hơn (vắng, nghỉ không lương) → nêu rõ chênh lệch, tránh trả thừa lặng lẽ.
  const congNhap = new Map<string, number>();
  if (bangTim && !bang) {
    for (const r of await tx.timesheetRow.findMany({ where: { timesheetId: bangTim.id, isAdjustment: false, dayType: { not: "le" } }, select: { userId: true, workValue: true, leaveDays: true, leavePaid: true } })) {
      congNhap.set(r.userId, (congNhap.get(r.userId) ?? 0) + Number(r.workValue) + (r.leavePaid ? Number(r.leaveDays) : 0));
    }
  }
  const hoSo = await hoSoApDung(tx, null, den);
  const users = await tx.user.findMany({
    where: { id: { in: [...hoSo.keys()] }, isSystem: false },
    select: { id: true, fullName: true, status: true, staffProfile: { select: { hiredAt: true } } },
  });
  // QĐ-165: kỳ RIÊNG chỉ gồm người trong danh sách; kỳ CHUNG bỏ người đã thuộc một kỳ riêng cùng tháng.
  const thanhVien = new Set(ky.members);
  const oKyRieng = new Set(
    ky.members.length ? [] : (await tx.payrollRun.findMany({ where: { year: ky.year, month: ky.month, id: { not: id } }, select: { members: true } })).flatMap((r) => r.members),
  );
  const thuocKy = (u: string) => (ky.members.length ? thanhVien.has(u) : !oKyRieng.has(u));
  const nguoi = users
    .filter((u) => (u.status === "hoat-dong" || coCong.has(u.id)) && thuocKy(u.id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
  const ids = nguoi.map((u) => u.id);
  if (ky.members.length) {
    const thieuHs = ky.members.filter((m) => !ids.includes(m));
    if (thieuHs.length) {
      const ten = await banDoTen(tx, thieuHs);
      canhBaoKy.push({ ma: "thanh-vien-khong-co-ho-so", muc: "canh-bao", noiDung: `Người trong kỳ riêng chưa có hồ sơ lương hiệu lực tháng này: ${thieuHs.map((m) => ten.get(m) ?? "—").join(", ")}.` });
    }
  }
  // QĐ-156: mọi phiên bản hồ sơ có hiệu lực trong tháng (chia đoạn theo ngày).
  const phienBan = await tx.salaryProfile.findMany({ where: { userId: { in: ids }, effectiveFrom: { lte: ngayVeDate(den) } }, orderBy: { createdAt: "asc" } });
  // QĐ-166 + QA v2 (QĐ-169): phút tăng ca còn âm lấy từ kỳ ĐÃ KHÓA GẦN NHẤT (trước tháng này) có dòng của người đó —
  // không chỉ tháng liền trước (người nghỉ / kỳ riêng). Tháng trước còn kỳ chưa khóa → cảnh báo (khóa rồi tính lại).
  const truoc = thangLui(ky.year, ky.month, 1);
  const dongDaKhoa = await tx.payrollLine.findMany({
    where: { userId: { in: ids }, run: { status: { in: ["da-khoa", "da-chi"] }, OR: [{ year: { lt: ky.year } }, { year: ky.year, month: { lt: ky.month } }] } },
    select: { userId: true, result: true, run: { select: { year: true, month: true } } },
  });
  const ganNhat = new Map<string, (typeof dongDaKhoa)[number]>();
  for (const d of dongDaKhoa) {
    const cu = ganNhat.get(d.userId);
    if (!cu || d.run.year * 12 + d.run.month > cu.run.year * 12 + cu.run.month) ganNhat.set(d.userId, d);
  }
  const noTruoc = new Map(
    [...ganNhat.values()]
      .map((d) => [d.userId, (d.result as unknown as KetQuaLuong).tangCaNoChuyenKySau ?? null] as const)
      .filter((x): x is readonly [string, PhutTangCa] => x[1] !== null),
  );
  const kyTruocChuaKhoa = await tx.payrollRun.findMany({ where: { year: truoc.nam, month: truoc.thang, status: { notIn: ["da-khoa", "da-chi"] } }, select: { name: true } });
  if (kyTruocChuaKhoa.length) {
    canhBaoKy.push({
      ma: "ky-truoc-chua-khoa",
      muc: "canh-bao",
      noiDung: `Kỳ lương tháng ${nhanKy(truoc.nam, truoc.thang)}${kyTruocChuaKhoa.some((k) => k.name) ? ` (${kyTruocChuaKhoa.map((k) => k.name ?? "kỳ chung").join(", ")})` : ""} chưa khóa — nợ tăng ca âm (nếu có) đang lấy từ kỳ đã khóa gần nhất. Khóa kỳ tháng trước rồi tính lại kỳ này để không trừ trùng / sót.`,
    });
  }

  // Lịch + lễ → công chuẩn, ngày lễ được trả (QĐ-145).
  const cacNgay = cacNgayTrongThang(ky.year, ky.month);
  const lich = await lichCuaNhieuNguoi(tx, ids, den);
  const le = await ngayLeTrongKhoang(tx, tu, den);
  const npt = await soNguoiPhuThuoc(tx, ids, tu);

  // Thưởng KPI (QĐ-152): kỳ đánh giá tháng; không có thì kỳ quý khi tháng này là tháng cuối quý.
  let kyDg = await tx.evaluationPeriod.findFirst({ where: { kind: "thang", year: ky.year, number: ky.month } });
  if (!kyDg && ky.month % 3 === 0) kyDg = await tx.evaluationPeriod.findFirst({ where: { kind: "quy", year: ky.year, number: ky.month / 3 } });
  const phieu = kyDg
    ? await tx.evaluation.findMany({ where: { periodId: kyDg.id, userId: { in: ids } }, include: { adjustments: { orderBy: { createdAt: "asc" } } } })
    : [];
  const phieuTheoNguoi = new Map(phieu.map((p) => [p.userId, p]));

  // Phụ cấp: cờ đọc từ danh mục lúc tính, chụp vào dòng.
  const loaiPc = new Map((await tx.salaryAllowanceType.findMany()).map((x) => [x.id, x]));

  // Bản nháp: xóa dòng + hoa hồng cũ, giữ khoản nhập tay.
  await tx.payrollCommissionItem.deleteMany({ where: { runId: id } });
  await tx.payrollLine.deleteMany({ where: { runId: id } });

  const huongHH = ids.filter((u) => hoSo.get(u)!.commissionEnabled);
  const phanBo = await phanBoTinhHoaHong(tx, id, huongHH, ky.year, ky.month, ch.luiThang);
  const truyThu = await canTruyThu(tx, ky.year, ky.month);
  const coDong = new Set(ids);
  // Chỉ xét truy thu của người thuộc kỳ này (kỳ riêng / kỳ chung — QĐ-165); người thuộc kỳ khác do kỳ đó truy thu.
  const truyThuMoCoi = truyThu.filter((t) => !coDong.has(t.user_id) && thuocKy(t.user_id));
  if (truyThuMoCoi.length) {
    const ten = await banDoTen(tx, truyThuMoCoi.map((t) => t.user_id));
    canhBaoKy.push({ ma: "truy-thu-khong-co-dong", muc: "canh-bao", noiDung: `Có hoa hồng cần truy thu nhưng người nhận không có dòng lương kỳ này: ${truyThuMoCoi.map((t) => `${ten.get(t.user_id) ?? "—"} (phiếu ${t.payment_no})`).join("; ")}. Thu hồi ngoài bảng lương hoặc ở kỳ có dòng.` });
  }

  const khoan = await tx.payrollItem.findMany({ where: { runId: id }, orderBy: { createdAt: "asc" } });
  const khoanMoCoi = khoan.filter((k) => !coDong.has(k.userId));
  if (khoanMoCoi.length) canhBaoKy.push({ ma: "khoan-khong-co-dong", muc: "loi", noiDung: `${khoanMoCoi.length} khoản cộng / trừ của người không có dòng lương kỳ này — xóa khoản hoặc bổ sung hồ sơ lương.` });

  const thamSo = { ...ts.giaTri, soGioNgay: ch.soGioNgay };
  let soLoi = 0;
  const demNguon: Record<NguonCong, number> = { "bang-cong": 0, "nhap-tay": 0, "mac-dinh": 0 };
  for (const u of nguoi) {
    const h = hoSo.get(u.id)!;
    const l = lich.get(u.id)!;
    const ngayVao = u.staffProfile?.hiredAt ? dateVeNgay(u.staffProfile.hiredAt) : null;
    // Công chuẩn tính CẢ THÁNG (LU-21). QA 0.21.0: người vào làm giữa tháng thường được gán lịch từ ngày vào — ngày
    // trước lần gán lịch đầu tiên trong tháng dùng lịch đầu tiên đó; nếu bỏ qua những ngày này, công chuẩn chỉ còn
    // phần cuối tháng và người làm đủ nửa tháng nhận đủ lương tháng. Ngày lễ chỉ trả khi ngày đó thật sự có lịch.
    const lichDau = cacNgay.map((d) => l(d)).find((x) => x !== null) ?? null;
    let chuan = 0;
    const leNgay = new Map<string, number>();
    for (const d of cacNgay) {
      const that = l(d);
      const ap = that ?? lichDau;
      chuan += congDuKien(d, ap?.ca ?? null, ap?.ngay ?? null, false).giaTri;
      if (that && le.has(d) && (!ngayVao || d >= ngayVao)) leNgay.set(d, congDuKien(d, that.ca, that.ngay, false).giaTri);
    }
    // 0.22.0 (QĐ-171): không có lịch nào (chưa gán, chưa chọn lịch mặc định) → công chuẩn TẠM TÍNH theo T2–T6 + cảnh báo,
    // thay vì lỗi "thiếu lịch" chặn cả bảng lương.
    const lichTamTinh = chuan === 0 && !lichDau;
    if (lichTamTinh) chuan = cacNgay.filter((d) => thuTrongTuan(d) < 5).length;
    const r2 = (x: number) => Math.round(x * 100) / 100;

    // QĐ-156: chia tháng thành các đoạn theo phiên bản hồ sơ hiệu lực từng ngày.
    const pbCuaNguoi = phienBan.filter((x) => x.userId === u.id).map((x) => ({ ...x, hieuLucTu: dateVeNgay(x.effectiveFrom), taoLuc: x.createdAt }));
    // QA 0.21.0 v2: chỉ tách đoạn khi phiên bản đổi trường ẢNH HƯỞNG TIỀN theo công (loại HĐ, % thử việc, cách trả,
    // lương, phụ cấp). Đổi tài khoản / mã số thuế / ghi chú giữa tháng không tách đoạn — tách thừa làm mỗi đoạn làm tròn
    // riêng, người đủ công lệch 1 đ so với lương tháng.
    const khoaTien = (pb: (typeof pbCuaNguoi)[number] | null) =>
      pb ? JSON.stringify([pb.contractType, pb.probationPercent === null ? null : Number(pb.probationPercent), pb.payBasis, String(pb.baseSalary), pb.allowances]) : null;
    const doanNgay: { pb: (typeof pbCuaNguoi)[number] | null; tu: string; den: string }[] = [];
    for (const d of cacNgay) {
      const pb = chonBoHieuLuc(pbCuaNguoi, d);
      const cuoi = doanNgay[doanNgay.length - 1];
      if (cuoi && khoaTien(cuoi.pb) === khoaTien(pb)) cuoi.den = d;
      else doanNgay.push({ pb, tu: d, den: d });
    }
    const viTriDoan = (ngay: string) => doanNgay.findIndex((x) => x.tu <= ngay && ngay <= x.den);
    const congDoan = doanNgay.map(() => ({ thucTe: 0, nghiCoLuong: 0, le: 0, tangCaPhut: { ...PHUT_TANG_CA_RONG } as PhutTangCa }));
    // 0.22.0 (QĐ-172): nguồn công của dòng — (a) bảng công đã khóa, (b) công nhập tay, (c) mặc định đủ công chuẩn.
    const tay = congTay.get(u.id) ?? null;
    const cuaBang: DongCong[] = dong.filter((r) => r.userId === u.id);
    const nguonCong: NguonCong = cuaBang.length ? "bang-cong" : tay ? "nhap-tay" : "mac-dinh";
    const canhBaoCong: CanhBaoLuong[] = [];
    let cua: DongCong[] = cuaBang;
    if (nguonCong !== "bang-cong") {
      // Dòng công "ảo" theo lịch (kể cả lịch mặc định / tạm tính T2–T6), từ ngày vào làm; ngày lễ đã trả riêng.
      const duKien = cacNgay
        .filter((d) => (!ngayVao || d >= ngayVao) && !leNgay.has(d))
        .map((d) => {
          const that = l(d);
          const e = that ? congDuKien(d, that.ca, that.ngay, le.has(d)).giaTri : lichTamTinh ? (thuTrongTuan(d) < 5 ? 1 : 0) : 0;
          return { d, e };
        })
        .filter((x) => x.e > 0);
      const tongDk = duKien.reduce((a, x) => a + x.e, 0);
      const nghiKhong = tay ? Number(tay.unpaidLeaveDays) : 0;
      const muc = tay?.workDays !== null && tay?.workDays !== undefined ? Number(tay.workDays) : Math.max(0, tongDk - nghiKhong);
      const ao = (ngay: string, giaTri: number, them: Partial<DongCong> = {}): DongCong => ({
        workDate: ngayVeDate(ngay), workValue: giaTri, leavePaid: false, leaveDays: 0, lateMinutes: 0, earlyMinutes: 0, isAdjustment: false, otMinutes: 0, otNightMinutes: 0, dayType: "thuong", ...them,
      });
      cua = [];
      if (tongDk > 0) {
        let daChia = 0;
        duKien.forEach((x, i) => {
          const v = i === duKien.length - 1 ? r2(muc - daChia) : r2((x.e * muc) / tongDk);
          daChia = r2(daChia + v);
          cua.push(ao(x.d, v));
        });
      } else if (muc > 0) cua.push(ao(den, muc));
      if (nghiKhong > 0) cua.push(ao(den, 0, { leaveDays: nghiKhong }));
      if (tay && tay.otMinutes > 0) cua.push(ao(den, 0, { otMinutes: tay.otMinutes }));
      if (nguonCong === "mac-dinh") {
        canhBaoCong.push({
          ma: "cong-mac-dinh",
          muc: "canh-bao",
          noiDung: `Chưa có công của người này (bảng công đã khóa hoặc công nhập tay) — tạm tính ĐỦ công chuẩn: ${r2(muc)} công${ngayVao && ngayVao > tu ? ` (từ ngày vào làm ${ngayVao.split("-").reverse().join("/")})` : ""}. Nhập công tay trên dòng này, hoặc “Lấy lại công từ bảng công” khi bảng công khóa.`,
        });
        const nhap = congNhap.get(u.id);
        if (nhap !== undefined && nhap + 0.01 < muc) {
          canhBaoCong.push({
            ma: "cong-mac-dinh-lech-bang-nhap",
            muc: "canh-bao",
            noiDung: `Bảng công NHÁP tháng này ghi ${r2(nhap)} công (gồm nghỉ có lương), ít hơn ${r2(muc)} công đang tạm tính — có thể TRẢ THỪA. Kiểm lại vắng / nghỉ không lương: nhập công tay trên dòng này, hoặc chờ Nhân sự khóa bảng công rồi “Lấy lại công từ bảng công”.`,
          });
        }
      } else {
        canhBaoCong.push({
          ma: "cong-nhap-tay",
          muc: "canh-bao",
          noiDung: `Công nhập tay: ${r2(muc)} công${tay!.workDays === null ? " (đủ công chuẩn)" : ""}${nghiKhong ? `, nghỉ không lương ${nghiKhong} ngày` : ""}${tay!.otMinutes ? `, tăng ca ${r2(tay!.otMinutes / 60)} giờ (ngày thường)` : ""} — lý do: ${tay!.reason}`,
        });
        if (tay!.workDays !== null && muc > tongDk + 0.01) {
          canhBaoCong.push({
            ma: "cong-tay-vuot-chuan",
            muc: "canh-bao",
            noiDung: `Công nhập tay ${r2(muc)} công VƯỢT số ngày phải làm theo lịch (${r2(tongDk)} công) — lương theo công sẽ cao hơn lương tháng. Kiểm lại; ngày làm thêm nên nhập là giờ tăng ca.`,
          });
        }
      }
    } else if (tay) {
      canhBaoCong.push({ ma: "cong-tay-bo-qua", muc: "canh-bao", noiDung: "Đã có bảng công khóa của người này — công nhập tay trên dòng bị bỏ qua (bấm “Lấy lại công từ bảng công” để xóa công nhập tay)." });
    }
    const choQuyet = choTheoNguoi.get(u.id);
    if (choQuyet?.length) {
      canhBaoCong.push({ ma: "thieu-gio-cho-quyet", muc: "canh-bao", noiDung: `Ngày “thiếu giờ” còn chờ quản lý quyết: ${choQuyet.map((x) => x.split("-").reverse().join("/")).join(", ")} — tính theo công hiện tại; quyết sau thì chênh lệch vào dòng điều chỉnh tháng sau.` });
    }
    if (lichTamTinh) {
      canhBaoCong.push({ ma: "lich-tam-tinh", muc: "canh-bao", noiDung: `Chưa có lịch làm việc (chưa gán, chưa chọn lịch mặc định) — công chuẩn tạm tính theo T2–T6: ${chuan} công. Chọn lịch mặc định ở Thiết lập chấm công rồi tính lại.` });
    }
    if (h.taxMethod === "luy-tien" && !h.taxCode) {
      canhBaoCong.push({ ma: "thieu-ma-so-thue", muc: "canh-bao", noiDung: "Chưa có mã số thuế cá nhân — vẫn khấu trừ thuế bình thường; bổ sung ở Hồ sơ lương để quyết toán." });
    }
    const tc: PhutTangCa = { ...PHUT_TANG_CA_RONG };
    let thucTe = 0, nghiCo = 0, nghiKhong = 0, muon = 0, som = 0, soDc = 0, congNgoaiHoSo = 0;
    for (const r of cua) {
      // Dòng điều chỉnh (ngày của kỳ trước) tính vào đoạn cuối tháng — cùng mức với phiên bản cuối kỳ.
      const i = r.isAdjustment ? doanNgay.length - 1 : viTriDoan(dateVeNgay(r.workDate));
      const cd = congDoan[i];
      thucTe += Number(r.workValue);
      cd.thucTe += Number(r.workValue);
      if (r.leavePaid) {
        nghiCo += Number(r.leaveDays);
        cd.nghiCoLuong += Number(r.leaveDays);
      } else nghiKhong += Number(r.leaveDays);
      if (!doanNgay[i].pb && Number(r.workValue) > 0) congNgoaiHoSo += Number(r.workValue);
      muon += r.lateMinutes;
      som += r.earlyMinutes;
      if (r.isAdjustment) soDc++;
      const ngay = r.otMinutes - r.otNightMinutes;
      const loai: [keyof PhutTangCa, keyof PhutTangCa] = r.dayType === "le" ? ["le", "leDem"] : r.dayType === "nghi-tuan" ? ["nghiTuan", "nghiTuanDem"] : ["thuong", "thuongDem"];
      tc[loai[0]] += ngay;
      tc[loai[1]] += r.otNightMinutes;
      cd.tangCaPhut[loai[0]] += ngay;
      cd.tangCaPhut[loai[1]] += r.otNightMinutes;
    }
    let ngayLe = 0;
    for (const [d, v] of leNgay) {
      const i = viTriDoan(d);
      if (!doanNgay[i]?.pb) continue;
      congDoan[i].le += v;
      ngayLe += v;
    }
    const phuCapCua = (pb: { allowances: unknown }) =>
      (Array.isArray(pb.allowances) ? (pb.allowances as { loaiId: string; soTien: number }[]) : []).filter((x) => loaiPc.has(x.loaiId)).map((x) => {
        const lp = loaiPc.get(x.loaiId)!;
        return { ma: lp.code, ten: lp.name, soTien: Number(x.soTien), chiuThue: lp.taxable, tinhBH: lp.insurable, theo: lp.basis as "thang" | "ngay-cong", traDu: lp.fullMonth };
      });
    const doan: DoanLuong[] = doanNgay.flatMap((x, i) =>
      x.pb
        ? [{
            hoSoId: x.pb.id, tu: x.tu, den: x.den, loaiHopDong: x.pb.contractType as LoaiHopDong, tyLeThuViec: x.pb.probationPercent === null ? null : Number(x.pb.probationPercent),
            cachTra: x.pb.payBasis as CachTra, luongCoBan: Number(x.pb.baseSalary), phuCap: phuCapCua(x.pb),
            cong: { thucTe: r2(congDoan[i].thucTe), nghiCoLuong: r2(congDoan[i].nghiCoLuong), le: r2(congDoan[i].le), tangCaPhut: congDoan[i].tangCaPhut },
          }]
        : [],
    );
    // Phần dòng điều chỉnh rơi vào đoạn cuối không có hồ sơ (đã nghỉ việc) — dồn vào đoạn có hồ sơ cuối cùng.
    if (!doanNgay[doanNgay.length - 1].pb && doan.length) {
      const cuoi = congDoan[doanNgay.length - 1];
      const d = doan[doan.length - 1];
      d.cong.nghiCoLuong = r2(d.cong.nghiCoLuong + cuoi.nghiCoLuong);
      for (const k of Object.keys(cuoi.tangCaPhut) as (keyof PhutTangCa)[]) d.cong.tangCaPhut[k] += cuoi.tangCaPhut[k];
    }
    const p = phieuTheoNguoi.get(u.id);
    const kq = p ? ketQuaHieuLuc({ ...p, adjustments: p.adjustments }) : null;
    const pbCua = phanBo.filter((x) => x.owner_id === u.id);
    const ttCua = truyThu.filter((x) => x.user_id === u.id);
    const khoanCua = khoan.filter((k) => k.userId === u.id);

    const dv: DauVaoLuong = {
      ky: { nam: ky.year, thang: ky.month },
      hoSo: {
        id: h.id, hieuLucTu: dateVeNgay(h.effectiveFrom), loaiHopDong: h.contractType as DauVaoLuong["hoSo"]["loaiHopDong"],
        tyLeThuViec: h.probationPercent === null ? null : Number(h.probationPercent), cachTra: h.payBasis as DauVaoLuong["hoSo"]["cachTra"],
        luongCoBan: Number(h.baseSalary), luongDongBH: Number(h.insuranceSalary), thuongKpi: Number(h.kpiBonus), huongHoaHong: h.commissionEnabled,
        phuongPhapThue: h.taxMethod as DauVaoLuong["hoSo"]["phuongPhapThue"],
      },
      phuCap: phuCapCua(h),
      doan,
      cong: {
        chuan: r2(chuan), thucTe: r2(thucTe), nghiCoLuong: r2(nghiCo), nghiKhongLuong: r2(nghiKhong), le: r2(ngayLe), tangCaPhut: tc,
        ...(noTruoc.has(u.id) && { tangCaNoKyTruoc: noTruoc.get(u.id)! }),
        phutMuon: muon, phutSom: som, soDongDieuChinh: soDc,
      },
      soNguoiPhuThuoc: npt.get(u.id) ?? 0,
      kpi: kq
        ? { trangThai: "da-chot", heSo: kq.heSoThuong, xepLoai: kq.xepLoai, danhGiaId: p!.id }
        : { trangThai: p ? "chua-chot" : "khong-co", heSo: null, xepLoai: null, danhGiaId: p?.id ?? null },
      hoaHong: {
        phanBo: pbCua.map((x) => ({ id: x.allocation_id, so: x.number, soTien: Math.round(Number(x.amount)) })),
        truyThu: ttCua.map((x) => ({ id: x.allocation_id, so: x.payment_no, soTien: Number(x.amount), tyLeBp: x.rate_bp })),
      },
      khoan: khoanCua.map((k) => ({
        chieu: k.direction as "cong" | "tru", loai: k.category, soTien: Number(k.amount), chiuThue: k.taxable, lyDo: k.reason,
        ...(k.taxStage && { tinhThue: k.taxStage as "truoc-thue" | "sau-thue", tinhBH: k.insurable }),
      })),
      thamSo,
    };
    const kqL = tinhLuong(dv);
    kqL.canhBao.push(...canhBaoCong);
    if (congNgoaiHoSo > 0) {
      kqL.canhBao.push({ ma: "cong-ngoai-ho-so", muc: "canh-bao", noiDung: `Có ${r2(congNgoaiHoSo)} công trong những ngày chưa có hồ sơ lương hiệu lực — không được trả. Lập hồ sơ lương có hiệu lực từ ngày vào làm nếu cần trả.` });
    }
    const ngayLichDau = lichDau ? cacNgay.find((d) => l(d) !== null) : undefined;
    if (ngayLichDau && ngayLichDau !== tu) {
      kqL.canhBao.push({ ma: "lich-tu-giua-thang", muc: "canh-bao", noiDung: `Lịch làm việc bắt đầu từ ${ngayLichDau.split("-").reverse().join("/")} — công chuẩn vẫn tính cả tháng theo lịch đó, lương theo số công thực có. Nếu người này đã làm từ trước ngày đó, gán lịch từ ngày vào làm rồi sinh lại bảng công.` });
    }
    if (coLoi(kqL.canhBao)) soLoi++;
    demNguon[nguonCong]++;
    const nguon = {
      bangCongId: nguonCong === "bang-cong" ? bang!.id : null, bangCongKhoaLuc: nguonCong === "bang-cong" ? bang!.lockedAt : null, thamSo: ts.bo, kyDanhGiaId: kyDg?.id ?? null,
      nguonCong,
      ...(nguonCong === "nhap-tay" && tay && {
        congTay: { soNgayCong: tay.workDays === null ? null : Number(tay.workDays), phutTangCa: tay.otMinutes, nghiKhongLuong: Number(tay.unpaidLeaveDays), lyDo: tay.reason, nguoiNhap: tay.createdBy, luc: tay.updatedAt },
      }),
    };
    await tx.payrollLine.create({
      data: {
        tenantId: nc.tenantId, runId: id, userId: u.id, fullName: u.fullName, profileId: h.id,
        grossIncome: BigInt(kqL.tongThuNhap), taxableIncome: BigInt(kqL.thuNhapChiuThue), employeeInsurance: BigInt(kqL.baoHiem.nld.tong),
        personalIncomeTax: BigInt(kqL.thue.tien), otherDeductions: BigInt(kqL.khoanTru), netPay: BigInt(kqL.thucLinh),
        employerInsurance: BigInt(kqL.baoHiem.dn.tong), inputs: { ...dv, nguon } as object, result: kqL as object,
        warnings: kqL.canhBao as object, hasError: coLoi(kqL.canhBao),
      },
    });
    if (pbCua.length && dv.hoSo.huongHoaHong) {
      await tx.payrollCommissionItem.createMany({
        data: pbCua.map((x, i) => ({
          tenantId: nc.tenantId, runId: id, userId: u.id, kind: "thu", paymentId: x.payment_id, allocationId: x.allocation_id, paymentNo: x.number,
          receivedAt: x.received_at, amount: BigInt(Math.round(Number(x.amount))), rateBp: kqL.hoaHong.tyLeBp, commission: BigInt(kqL.hoaHong.tungKhoan[i] ?? 0),
        })),
      });
    }
    if (ttCua.length) {
      await tx.payrollCommissionItem.createMany({
        data: ttCua.map((x) => ({
          tenantId: nc.tenantId, runId: id, userId: u.id, kind: "truy-thu", paymentId: x.payment_id, allocationId: x.allocation_id, paymentNo: x.payment_no,
          receivedAt: x.received_at, amount: BigInt(x.amount), rateBp: x.rate_bp, commission: truyThuHoaHong(BigInt(x.amount), BigInt(x.rate_bp)), sourceRunId: x.run_id,
        })),
      });
    }
  }

  await tx.payrollRun.update({
    where: { id },
    data: { timesheetId: bang?.id ?? null, dirty: false, warnings: canhBaoKy as object, calculatedAt: new Date(), calculatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "tinh-luong", objectType: "payroll_run", objectId: id, after: { ky: nhanKy(ky.year, ky.month), soDong: nguoi.length, soDongLoi: soLoi, bangCong: bang?.id ?? null, nguonCong: demNguon } });
  await nc.suKien({ eventType: SU_KIEN.PAYROLL_CALCULATED, objectType: "payroll_run", objectId: id, payload: { soDong: nguoi.length, soDongLoi: soLoi } });
  return { id, soDong: nguoi.length, soDongLoi: soLoi, canhBao: canhBaoKy, nguonCong: demNguon };
}

// ---------------------------------------------------------------------------
// Chi tiết kỳ, phiếu lương
// ---------------------------------------------------------------------------

export async function chiTietKyLuong(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.view", { objectType: "payroll_run", objectId: id });
  const ky = await nc.tx.payrollRun.findFirst({ where: { id } });
  if (!ky) throw new LoiKhongTimThay("Kỳ lương");
  const loc = await locNguoiLuong(nc);
  const dong = await nc.tx.payrollLine.findMany({ where: { runId: id, ...loc }, orderBy: { fullName: "asc" } });
  const khoan = await nc.tx.payrollItem.findMany({ where: { runId: id, ...loc }, orderBy: { createdAt: "asc" } });
  const hh = await nc.tx.payrollCommissionItem.findMany({ where: { runId: id, ...loc }, orderBy: [{ receivedAt: "asc" }, { paymentNo: "asc" }] });
  const kyGoc = await nc.tx.payrollRun.findMany({ where: { id: { in: khoan.map((k) => k.adjustsRunId).filter((x): x is string => Boolean(x)) } }, select: { id: true, year: true, month: true } });
  const ten = await banDoTen(nc.tx, [ky.calculatedBy, ky.submittedBy, ky.approvedBy, ky.lockedBy, ky.paidBy, ...khoan.flatMap((k) => [k.userId, k.createdBy, k.approvedBy])]);
  const kyDaKhoa = await nc.tx.payrollRun.findMany({ where: { status: { in: ["da-khoa", "da-chi"] }, id: { not: id } }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 12, select: { id: true, year: true, month: true } });
  await ghiXem(nc, "bang-luong", { objectType: "payroll_run", objectId: id }, dong.map((d) => d.userId));
  // QĐ-161: tài khoản ngân hàng đổi trong 30 ngày gần đây → cảnh báo trên màn hình duyệt (rủi ro đổi tài khoản để rút lương).
  const tkHien = await taiKhoanHienHanh(nc.tx, dong.map((d) => d.userId));
  const moc30 = Date.now() - 30 * 86_400_000;
  const conNguoiDuyet = (await nguoiDuyetDuoc(nc.tx, ky)).length > 0;
  const coDongCuaToi = (await nc.tx.payrollLine.count({ where: { runId: id, userId: nc.hoSo.userId } })) > 0;
  const tong = (f: (d: (typeof dong)[number]) => bigint) => Number(dong.reduce((a, d) => a + f(d), 0n));
  // 0.22.0 (QĐ-173): trả tay — kỳ đã khóa theo hình thức đã chụp; kỳ chưa khóa dự kiến theo hồ sơ hiện hành.
  const daKhoa = laKyDaKhoa(ky.status);
  const laTraTay = (d: (typeof dong)[number]) =>
    daKhoa ? (d.payMethod ? d.payMethod === "tien-mat" : !d.bankAccount) : !tkHien.get(d.userId)?.bankAccount || tkHien.get(d.userId)?.paymentMethod === "tien-mat";
  const traTay = dong.filter((d) => d.netPay > 0n && laTraTay(d));
  // 0.22.0 (QĐ-172): công nhập tay của kỳ + bảng công tháng.
  const congTay = await nc.tx.payrollManualInput.findMany({ where: { runId: id, ...loc }, orderBy: { createdAt: "asc" } });
  const bangCong = await nc.tx.timesheet.findFirst({ where: { year: ky.year, month: ky.month }, select: { id: true, status: true } });
  // 0.22.0 (A5): người đang hoạt động CHƯA có hồ sơ lương hiệu lực trong tháng — liệt kê riêng, kèm nút tạo hồ sơ.
  const { den: cuoiThang } = khoangThang(ky.year, ky.month);
  const coHoSo = new Set((await nc.tx.salaryProfile.findMany({ where: { effectiveFrom: { lte: ngayVeDate(cuoiThang) } }, select: { userId: true }, distinct: ["userId"] })).map((x) => x.userId));
  const chuaCoHoSo = (await nc.tx.user.findMany({
    where: { status: "hoat-dong", isSystem: false, ...(loc.userId ? { id: { in: loc.userId.in } } : {}), ...(ky.members.length ? { id: { in: ky.members.filter((m) => !loc.userId || loc.userId.in.includes(m)) } } : {}) },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  })).filter((u) => !coHoSo.has(u.id));
  const tenCongTay = await banDoTen(nc.tx, congTay.flatMap((c) => [c.userId, c.createdBy]));
  return {
    id: ky.id, nam: ky.year, thang: ky.month, nhan: nhanKyLuong(ky), ten: ky.name, rieng: ky.members.length > 0, trangThai: ky.status as TrangThaiKy,
    conNguoiDuyet,
    nhanTrangThai: NHAN_TRANG_THAI_KY[ky.status as TrangThaiKy], canTinhLai: ky.dirty, canhBao: (ky.warnings ?? []) as unknown as CanhBaoLuong[],
    lyDoTraLai: ky.returnReason,
    buoc: {
      tinh: ky.calculatedAt ? { luc: ky.calculatedAt, nguoi: ten.get(ky.calculatedBy ?? "") ?? "—" } : null,
      guiDuyet: ky.submittedAt ? { luc: ky.submittedAt, nguoi: ten.get(ky.submittedBy ?? "") ?? "—" } : null,
      duyet: ky.approvedAt ? { luc: ky.approvedAt, nguoi: ten.get(ky.approvedBy ?? "") ?? "—" } : null,
      khoa: ky.lockedAt ? { luc: ky.lockedAt, nguoi: ten.get(ky.lockedBy ?? "") ?? "—" } : null,
      chi: ky.paidAt ? { luc: ky.paidAt, nguoi: ten.get(ky.paidBy ?? "") ?? "—" } : null,
    },
    bangCong: bangCong ? { id: bangCong.id, trangThai: bangCong.status } : null,
    congTay: congTay.map((c) => ({
      nguoiId: c.userId, hoTen: tenCongTay.get(c.userId) ?? "—", soNgayCong: c.workDays === null ? null : Number(c.workDays), gioTangCa: Math.round((c.otMinutes / 60) * 100) / 100,
      nghiKhongLuong: Number(c.unpaidLeaveDays), lyDo: c.reason, nguoiNhap: tenCongTay.get(c.createdBy) ?? "—", luc: c.updatedAt,
    })),
    chuaCoHoSo: chuaCoHoSo.map((u) => ({ id: u.id, hoTen: u.fullName })),
    traTay: { daKhoa, soNguoi: traTay.length, tong: Number(traTay.reduce((a, d) => a + d.netPay, 0n)), ds: traTay.map((d) => ({ userId: d.userId, hoTen: d.fullName, thucLinh: Number(d.netPay) })) },
    quyen: {
      nhapCong: (coQuyen(nc.hoSo, "luong.create") || coQuyen(nc.hoSo, "luong.update")) && ky.status === "nhap",
      tinh: coQuyen(nc.hoSo, "luong.create"),
      duyet: coQuyen(nc.hoSo, "luong.approve") && ky.calculatedBy !== nc.hoSo.userId && !coDongCuaToi,
      xuat: coQuyen(nc.hoSo, "luong.export"),
      laNguoiTinh: ky.calculatedBy === nc.hoSo.userId,
      coDongCuaToi,
    },
    tong: {
      soNguoi: dong.length, tongThuNhap: tong((d) => d.grossIncome), bhNld: tong((d) => d.employeeInsurance), thue: tong((d) => d.personalIncomeTax),
      khoanTru: tong((d) => d.otherDeductions), thucLinh: tong((d) => d.netPay), bhDn: tong((d) => d.employerInsurance),
      chiPhiDn: tong((d) => d.grossIncome + d.employerInsurance),
    },
    dong: dong.map((d) => {
      const kq = d.result as unknown as KetQuaLuong;
      return {
        id: d.id, userId: d.userId, hoTen: d.fullName, congTinhLuong: kq.congTinhLuong, luongTheoCong: kq.luongTheoCong, phuCap: kq.tongPhuCap,
        tangCa: kq.tangCa.tien, thuongKpi: kq.thuongKpi, hoaHong: kq.hoaHong.tien + kq.hoaHong.truyThu, khoanCong: kq.khoanCong,
        tongThuNhap: Number(d.grossIncome), bhNld: Number(d.employeeInsurance), thue: Number(d.personalIncomeTax), khoanTru: Number(d.otherDeductions),
        thucLinh: Number(d.netPay), bhDn: Number(d.employerInsurance), canhBao: (d.warnings ?? []) as unknown as CanhBaoLuong[], coLoi: d.hasError,
        taiKhoanChup: d.bankCapturedAt ? { soDuoi: d.bankAccount ? d.bankAccount.slice(-4) : null, nganHang: d.bankName } : null,
        nguonCong: ((d.inputs as { nguon?: { nguonCong?: NguonCong } } | null)?.nguon?.nguonCong ?? "bang-cong") as NguonCong,
        traTay: d.netPay > 0n && laTraTay(d),
        taiKhoanDoiLuc: (() => {
          const t = tkHien.get(d.userId)?.doiLuc;
          return t && t.getTime() >= moc30 ? t : null;
        })(),
      };
    }),
    khoan: khoan.map((k) => {
      const g = kyGoc.find((x) => x.id === k.adjustsRunId);
      return {
        id: k.id, nguoiId: k.userId, hoTen: ten.get(k.userId) ?? "—", chieu: k.direction, loai: k.category, nhanLoai: NHAN_LOAI_KHOAN[k.category as keyof typeof NHAN_LOAI_KHOAN] ?? k.category,
        soTien: Number(k.amount), chiuThue: k.taxable, lyDo: k.reason, kyGoc: g ? nhanKy(g.year, g.month) : null,
        nguoiNhap: ten.get(k.createdBy) ?? "—", nguoiDuyet: k.approvedBy ? (ten.get(k.approvedBy) ?? "—") : null, luc: k.createdAt,
      };
    }),
    hoaHong: hh.map((c) => ({ id: c.id, userId: c.userId, loai: c.kind, soPhieu: c.paymentNo, ngayThu: dateVeNgay(c.receivedAt), soTien: Number(c.amount), tyLe: c.rateBp / 100, hoaHong: Number(c.commission) })),
    kyDaKhoa: kyDaKhoa.map((k) => ({ id: k.id, nhan: nhanKy(k.year, k.month) })),
  };
}

async function moTaDong(nc: NguCanh, d: { id: string; userId: string; fullName: string; inputs: Prisma.JsonValue; result: Prisma.JsonValue; warnings: Prisma.JsonValue; netPay: bigint }, ky: KyLuong) {
  const u = await nc.tx.user.findFirst({ where: { id: d.userId }, select: { email: true, staffProfile: { select: { employeeCode: true, jobTitle: true, department: { select: { name: true } } } } } });
  const hh = await nc.tx.payrollCommissionItem.findMany({ where: { runId: ky.id, userId: d.userId }, orderBy: [{ receivedAt: "asc" }, { paymentNo: "asc" }] });
  return {
    id: d.id, ky: { id: ky.id, nam: ky.year, thang: ky.month, nhan: nhanKy(ky.year, ky.month), trangThai: ky.status as TrangThaiKy, nhanTrangThai: NHAN_TRANG_THAI_KY[ky.status as TrangThaiKy], khoaLuc: ky.lockedAt },
    nguoi: { id: d.userId, hoTen: d.fullName, email: u?.email ?? null, maNv: u?.staffProfile?.employeeCode ?? null, chucDanh: u?.staffProfile?.jobTitle ?? null, phongBan: u?.staffProfile?.department?.name ?? null },
    dauVao: d.inputs as unknown as DauVaoLuong,
    ketQua: d.result as unknown as KetQuaLuong,
    hoaHong: hh.map((c) => ({ loai: c.kind, soPhieu: c.paymentNo, ngayThu: dateVeNgay(c.receivedAt), soTien: Number(c.amount), tyLe: c.rateBp / 100, hoaHong: Number(c.commission) })),
  };
}

/**
 * Một phiếu lương. Của CHÍNH MÌNH: chỉ khi kỳ đã khóa (LU-42), không cần 2 lớp. Của người khác: `luong.view` phạm vi
 * rộng + trong phạm vi + 2 lớp + ghi nhật ký xem (LU-62). Ngoài phạm vi / chưa khóa → 404 (không lộ tồn tại).
 */
export async function chiTietPhieuLuong(nc: NguCanh, dongId: string) {
  batBuocQuyen(nc.hoSo, "luong.view", { objectType: "payroll_line", objectId: dongId });
  const d = await nc.tx.payrollLine.findFirst({ where: { id: dongId } });
  if (!d) throw new LoiKhongTimThay("Phiếu lương");
  const ky = await nc.tx.payrollRun.findFirstOrThrow({ where: { id: d.runId } });
  if (d.userId === nc.hoSo.userId && !xemDuocNguoiKhac(nc)) {
    if (!laKyDaKhoa(ky.status)) throw new LoiKhongTimThay("Phiếu lương");
    return moTaDong(nc, d, ky);
  }
  if (d.userId === nc.hoSo.userId && laKyDaKhoa(ky.status) && !nc.hoSo.da2Lop) return moTaDong(nc, d, ky);
  batBuocQuyenLuong(nc, "luong.view", { objectType: "payroll_line", objectId: dongId });
  if (!(await trongPhamViLuong(nc, d.userId))) throw new LoiKhongTimThay("Phiếu lương");
  await ghiXem(nc, "phieu-luong", { objectType: "payroll_line", objectId: dongId }, [d.userId]);
  return moTaDong(nc, d, ky);
}

/** Phiếu lương của chính mình — chỉ các kỳ đã khóa / đã chi (LU-42). Không cần 2 lớp. */
export async function phieuLuongCuaToi(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "luong.view", { objectType: "payroll_line" });
  const ds = await nc.tx.payrollLine.findMany({
    where: { userId: nc.hoSo.userId, run: { status: { in: ["da-khoa", "da-chi"] } } },
    include: { run: { select: { year: true, month: true, status: true, lockedAt: true } } },
    orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }],
    take: 36,
  });
  return ds.map((d) => ({ id: d.id, nhan: nhanKy(d.run.year, d.run.month), trangThai: d.run.status as TrangThaiKy, nhanTrangThai: NHAN_TRANG_THAI_KY[d.run.status as TrangThaiKy], tongThuNhap: Number(d.grossIncome), thucLinh: Number(d.netPay), khoaLuc: d.run.lockedAt }));
}

/** Tính lại một dòng từ ẢNH CHỤP đầu vào và so với số đã lưu (LU-28) — kiểm toán. */
export async function kiemLaiPhieuLuong(nc: NguCanh, dongId: string) {
  batBuocQuyenLuong(nc, "luong.view", { objectType: "payroll_line", objectId: dongId });
  const d = await nc.tx.payrollLine.findFirst({ where: { id: dongId } });
  if (!d || !(await trongPhamViLuong(nc, d.userId))) throw new LoiKhongTimThay("Phiếu lương");
  const tinhLai = tinhLuong(d.inputs as unknown as DauVaoLuong);
  const lech = soKhopKetQua(tinhLai, d.result as unknown as KetQuaLuong);
  const cot = Number(d.netPay) !== tinhLai.thucLinh || Number(d.grossIncome) !== tinhLai.tongThuNhap || Number(d.personalIncomeTax) !== tinhLai.thue.tien;
  await ghiXem(nc, "kiem-lai-phieu-luong", { objectType: "payroll_line", objectId: dongId }, [d.userId]);
  return { khop: lech.length === 0 && !cot, lech: cot ? [...lech, "cột tổng"] : lech, thucLinh: tinhLai.thucLinh };
}

// ---------------------------------------------------------------------------
// Khoản cộng / trừ, điều chỉnh (LU-25, LU-31)
// ---------------------------------------------------------------------------

export async function themKhoanLuong(nc: NguCanh, kyId: string, d: z.infer<typeof LuocDoKhoan>) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_item" });
  const ky = await docKyKhoa(nc, kyId);
  batBuocTrangThai(ky, ["nhap"], "thêm khoản");
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true, fullName: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  if (d.kyGocId) {
    const goc = await nc.tx.payrollRun.findFirst({ where: { id: d.kyGocId } });
    if (!goc || !laKyDaKhoa(goc.status)) throw new LoiNghiepVu("Chỉ điều chỉnh được kỳ lương ĐÃ KHÓA.", 422, "ky-goc-chua-khoa");
    if (goc.year * 12 + goc.month >= ky.year * 12 + ky.month) throw new LoiNghiepVu("Khoản điều chỉnh phải nằm ở kỳ SAU kỳ được điều chỉnh.", 422, "ky-goc-sau");
  }
  const k = await nc.tx.payrollItem.create({
    data: {
      tenantId: nc.tenantId, runId: kyId, userId: d.nguoiId, direction: d.chieu, category: d.loai, amount: BigInt(d.soTien),
      // QĐ-158: điều chỉnh trước thuế giữ cờ chịu thuế cả hai chiều (thu hồi giảm đúng phần đã chịu thuế); khoản khác
      // chỉ khoản cộng mới có cờ chịu thuế (khoản trừ thường trừ sau thuế).
      taxable: d.cachTinh === "truoc-thue" || d.chieu === "cong" ? d.chiuThue : false, reason: d.lyDo, adjustsRunId: d.kyGocId ?? null, createdBy: nc.hoSo.userId,
      taxStage: d.cachTinh, insurable: d.cachTinh === "truoc-thue" ? d.tinhBH : false,
    },
  });
  await nc.tx.payrollRun.update({ where: { id: kyId }, data: { dirty: true } });
  await nc.kiemToan({ action: "them-khoan-luong", objectType: "payroll_item", objectId: k.id, after: { ky: nhanKy(ky.year, ky.month), nguoi: d.nguoiId, chieu: d.chieu, loai: d.loai, cachTinh: d.cachTinh, lyDo: d.lyDo, kyGoc: d.kyGocId ?? null } });
  return { id: k.id };
}

export async function xoaKhoanLuong(nc: NguCanh, khoanId: string) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_item", objectId: khoanId });
  const k = await nc.tx.payrollItem.findFirst({ where: { id: khoanId } });
  if (!k) throw new LoiKhongTimThay("Khoản");
  const ky = await docKyKhoa(nc, k.runId);
  batBuocTrangThai(ky, ["nhap"], "xóa khoản");
  await nc.tx.payrollItem.delete({ where: { id: khoanId } });
  await nc.tx.payrollRun.update({ where: { id: k.runId }, data: { dirty: true } });
  await nc.kiemToan({ action: "xoa-khoan-luong", objectType: "payroll_item", objectId: khoanId, before: { nguoi: k.userId, loai: k.category, lyDo: k.reason } });
  return { id: khoanId };
}

// ---------------------------------------------------------------------------
// Chuyển trạng thái (LU-40 → LU-45)
// ---------------------------------------------------------------------------

/** Kiểm hoa hồng: phiếu thu đã tính trong kỳ mà nay đã hủy → phải tính lại (QĐ-146). */
async function phieuThuDaHuy(tx: ClientTenant, kyId: string): Promise<string[]> {
  const ds = await tx.$queryRaw<{ number: string }[]>`
    SELECT DISTINCT c.payment_no AS number FROM payroll_commission_items c JOIN payments p ON p.id = c.payment_id
    WHERE c.run_id = ${kyId}::uuid AND c.kind = 'thu' AND p.status = 'huy' ORDER BY 1`;
  return ds.map((d) => d.number);
}

/**
 * Tham số dùng lúc tính phải còn là bộ hiệu lực (QĐ-143 — toàn vẹn: đổi sau lần tính → tính lại). 0.22.0 (QĐ-170): bộ CHƯA
 * XÁC NHẬN không chặn (trừ khi Cấu hình `luong.chan_khi_tham_so_chua_xac_nhan` = 1) — trả danh sách để ghi kiểm toán.
 */
async function kiemThamSo(tx: ClientTenant, ky: KyLuong, kiemDoi = true): Promise<BoApDung[]> {
  const { den } = khoangThang(ky.year, ky.month);
  const ts = await thamSoHieuLuc(tx, den);
  const chua = ts.bo.filter((b) => !b.daXacNhan);
  if (chua.length && (await docCauHinhLuong(tx)).chanThamSoChuaXacNhan === 1) {
    throw new LoiNghiepVu(`Tham số chưa được kế toán xác nhận: ${chua.map((b) => b.loai).join(", ")}. (Cấu hình đang bật “Chặn gửi duyệt khi tham số lương chưa xác nhận”.)`, 422, "tham-so-chua-xac-nhan");
  }
  if (!kiemDoi) return chua;
  const mau = await tx.payrollLine.findFirst({ where: { runId: ky.id }, select: { inputs: true } });
  const daDung = ((mau?.inputs as { nguon?: { thamSo?: BoApDung[] } } | null)?.nguon?.thamSo ?? []).map((b) => b.id).sort().join(",");
  if (mau && daDung !== ts.bo.map((b) => b.id).sort().join(",")) {
    throw new LoiNghiepVu("Tham số lương đã đổi sau lần tính gần nhất — tính lại trước khi gửi duyệt.", 422, "tham-so-da-doi");
  }
  return chua;
}

/** QĐ-170: ghi kiểm toán khi gửi duyệt / duyệt mà tham số chưa xác nhận (không ghi số tiền). */
async function ghiThamSoChuaXacNhan(nc: NguCanh, ky: KyLuong, chua: BoApDung[], action: "gui-duyet-khi-tham-so-chua-xac-nhan" | "duyet-khi-tham-so-chua-xac-nhan") {
  if (!chua.length) return;
  await nc.kiemToan({ action, objectType: "payroll_run", objectId: ky.id, after: { ky: nhanKy(ky.year, ky.month), thamSoChuaXacNhan: chua.map((b) => ({ loai: b.loai, hieuLucTu: b.hieuLucTu, id: b.id })) } });
}

async function kiemKhongTuDuyet(nc: NguCanh, ky: KyLuong, viec: string) {
  if (ky.calculatedBy === nc.hoSo.userId) throw new LoiNghiepVu(`Người tính bảng lương không được ${viec} — cần người khác có quyền duyệt.`, 403, "nguoi-tinh-khong-duyet");
  const coDong = await nc.tx.payrollLine.count({ where: { runId: ky.id, userId: nc.hoSo.userId } });
  if (coDong > 0) throw new LoiNghiepVu(`Bảng lương có dòng của chính bạn — không tự ${viec}. Nhờ người khác có quyền duyệt, hoặc tách dòng của bạn sang một kỳ lương riêng (Tính lương → Tạo kỳ lương riêng).`, 403, "tu-duyet");
}

/**
 * QĐ-165: người duyệt được = đang hoạt động, có `luong.approve`, không phải người tính, KHÔNG có dòng trong bảng. Không còn
 * ai → báo rõ và hướng dẫn tách dòng lãnh đạo sang một kỳ lương riêng để Quản trị / Giám đốc khác duyệt.
 */
export async function nguoiDuyetDuoc(tx: ClientTenant, ky: Pick<KyLuong, "id" | "calculatedBy">): Promise<{ id: string; hoTen: string }[]> {
  const coQuyenDuyet = await tx.user.findMany({
    where: { status: "hoat-dong", isSystem: false, id: { in: await nguoiGiuQuyen(tx, "luong.approve", true) } },
    select: { id: true, fullName: true },
  });
  const coDong = new Set((await tx.payrollLine.findMany({ where: { runId: ky.id }, select: { userId: true } })).map((d) => d.userId));
  return coQuyenDuyet.filter((u) => u.id !== ky.calculatedBy && !coDong.has(u.id)).map((u) => ({ id: u.id, hoTen: u.fullName }));
}

async function batBuocConNguoiDuyet(tx: ClientTenant, ky: KyLuong) {
  if ((await nguoiDuyetDuoc(tx, ky)).length > 0) return;
  const coDong = await tx.payrollLine.findMany({
    where: { runId: ky.id },
    select: { userId: true, fullName: true },
  });
  const giu = new Set(await nguoiGiuQuyen(tx, "luong.approve", true));
  const nguoiDuyet = coDong.filter((d) => giu.has(d.userId)).map((d) => ({ fullName: d.fullName }));
  throw new LoiNghiepVu(
    `Không còn ai duyệt được bảng lương này: mọi người có quyền duyệt hoặc là người tính, hoặc có dòng trong bảng${nguoiDuyet.length ? ` (${nguoiDuyet.map((u) => u.fullName).join(", ")})` : ""}. ` +
      "Tách dòng của lãnh đạo sang một kỳ lương riêng: Tính lương → Tạo kỳ lương riêng (chọn người, đặt tên, ví dụ “Lãnh đạo”), tính lại kỳ này rồi gửi duyệt; kỳ riêng do Quản trị hoặc Giám đốc khác duyệt. Hoặc cấp quyền duyệt lương cho một người thứ hai.",
    422,
    "khong-con-nguoi-duyet",
    { nguoiCoDongCoQuyenDuyet: nguoiDuyet.map((u) => u.fullName) },
  );
}

export async function guiDuyetKyLuong(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_run", objectId: id });
  const ky = await docKyKhoa(nc, id);
  batBuocTrangThai(ky, ["nhap"], "gửi duyệt");
  if (!ky.calculatedAt || ky.dirty) throw new LoiNghiepVu("Có thay đổi chưa tính — bấm “Tính lương” trước khi gửi duyệt.", 422, "can-tinh-lai");
  const soDong = await nc.tx.payrollLine.count({ where: { runId: id } });
  if (soDong === 0) throw new LoiNghiepVu("Kỳ lương chưa có dòng nào.", 422, "khong-co-dong");
  const soLoi = await nc.tx.payrollLine.count({ where: { runId: id, hasError: true } });
  if (soLoi) throw new LoiNghiepVu(`Còn ${soLoi} dòng lương có lỗi (thực lĩnh âm, thiếu lịch, lương thử việc dưới mức…). Sửa rồi tính lại.`, 422, "dong-co-loi");
  const loiKy = ((ky.warnings ?? []) as unknown as CanhBaoLuong[]).filter((c) => c.muc === "loi");
  if (loiKy.length) throw new LoiNghiepVu(loiKy.map((c) => c.noiDung).join(" "), 422, "ky-co-loi");
  const chuaXacNhan = await kiemThamSo(nc.tx, ky);
  const huy = await phieuThuDaHuy(nc.tx, id);
  if (huy.length) throw new LoiNghiepVu(`Phiếu thu ${huy.join(", ")} đã hủy sau khi tính hoa hồng — tính lại.`, 422, "phieu-thu-da-huy");
  await batBuocConNguoiDuyet(nc.tx, ky);
  await ghiThamSoChuaXacNhan(nc, ky, chuaXacNhan, "gui-duyet-khi-tham-so-chua-xac-nhan");
  await nc.tx.payrollRun.update({ where: { id }, data: { status: "cho-duyet", submittedAt: new Date(), submittedBy: nc.hoSo.userId, returnReason: null } });
  await ghiTrangThai(nc, ky, "gui-duyet-luong", "cho-duyet");
  await baoChoNguoiCoQuyen(nc.tx, nc.tenantId, "luong.approve", {
    loai: "luong-cho-duyet", tieuDe: `Bảng lương ${nhanKy(ky.year, ky.month)} chờ duyệt`, duongDan: `/luong/${id}`, doiTuong: "payroll_run", doiTuongId: id,
    khoaChongTrung: `luong-cho-duyet:${id}:${Date.now()}`,
  }, nc.hoSo.userId);
  return { id, trangThai: "cho-duyet" };
}

export async function duyetKyLuong(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.approve", { objectType: "payroll_run", objectId: id });
  const ky = await docKyKhoa(nc, id);
  batBuocTrangThai(ky, ["cho-duyet"], "duyệt");
  await kiemKhongTuDuyet(nc, ky, "duyệt");
  // QĐ-170: tham số chưa xác nhận không chặn duyệt (trừ khi Cấu hình bật chặn) — ghi kiểm toán "duyệt khi tham số chưa xác nhận".
  const chuaXacNhan = await kiemThamSo(nc.tx, ky, false);
  const bayGio = new Date();
  await nc.tx.payrollRun.update({ where: { id }, data: { status: "da-duyet", approvedAt: bayGio, approvedBy: nc.hoSo.userId } });
  // Khoản cộng / trừ / điều chỉnh của kỳ được duyệt cùng bảng lương — ghi người duyệt (LU-31).
  await nc.tx.payrollItem.updateMany({ where: { runId: id }, data: { approvedBy: nc.hoSo.userId, approvedAt: bayGio } });
  await ghiTrangThai(nc, ky, "duyet-luong", "da-duyet");
  await ghiThamSoChuaXacNhan(nc, ky, chuaXacNhan, "duyet-khi-tham-so-chua-xac-nhan");
  if (ky.calculatedBy) {
    await taoThongBao(nc.tx, nc.tenantId, { nguoiNhanId: ky.calculatedBy, loai: "luong-da-duyet", tieuDe: `Bảng lương ${nhanKy(ky.year, ky.month)} đã được duyệt`, duongDan: `/luong/${id}`, doiTuong: "payroll_run", doiTuongId: id, khoaChongTrung: `luong-da-duyet:${id}:${bayGio.getTime()}` });
  }
  return { id, trangThai: "da-duyet" };
}

export async function traLaiKyLuong(nc: NguCanh, id: string, d: z.infer<typeof LuocDoLyDo>) {
  batBuocQuyenLuong(nc, "luong.approve", { objectType: "payroll_run", objectId: id });
  const ky = await docKyKhoa(nc, id);
  batBuocTrangThai(ky, ["cho-duyet", "da-duyet"], "trả lại");
  await nc.tx.payrollRun.update({ where: { id }, data: { status: "nhap", returnReason: d.lyDo, submittedAt: null, submittedBy: null, approvedAt: null, approvedBy: null } });
  await nc.tx.payrollItem.updateMany({ where: { runId: id }, data: { approvedBy: null, approvedAt: null } });
  await ghiTrangThai(nc, ky, "tra-lai-luong", "nhap", { lyDo: d.lyDo });
  if (ky.calculatedBy && ky.calculatedBy !== nc.hoSo.userId) {
    await taoThongBao(nc.tx, nc.tenantId, { nguoiNhanId: ky.calculatedBy, loai: "luong-tra-lai", mucDo: "canh-bao", tieuDe: `Bảng lương ${nhanKy(ky.year, ky.month)} bị trả lại`, noiDung: d.lyDo, duongDan: `/luong/${id}`, doiTuong: "payroll_run", doiTuongId: id, khoaChongTrung: `luong-tra-lai:${id}:${Date.now()}` });
  }
  return { id, trangThai: "nhap" };
}

/** Khóa (LU-40): từ đây bất biến; nhân viên xem được phiếu của mình. */
export async function khoaKyLuong(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.approve", { objectType: "payroll_run", objectId: id });
  const ky = await docKyKhoa(nc, id);
  batBuocTrangThai(ky, ["da-duyet"], "khóa");
  await kiemKhongTuDuyet(nc, ky, "khóa");
  const huy = await phieuThuDaHuy(nc.tx, id);
  if (huy.length) throw new LoiNghiepVu(`Phiếu thu ${huy.join(", ")} đã hủy sau khi tính hoa hồng — trả lại bảng lương để tính lại.`, 422, "phieu-thu-da-huy");
  // QĐ-160: chụp tài khoản ngân hàng hiện hành vào từng dòng (TRƯỚC khi đổi trạng thái — sau khóa dòng bất biến).
  // 0.22.0 (QĐ-173): người chưa có tài khoản hoặc hồ sơ chọn "Tiền mặt / trả tay" KHÔNG chặn khóa — chụp hình thức trả
  // `tien-mat`: không vào file ngân hàng, liệt kê riêng "Trả tay" có tổng tiền; bút toán chi tách tài khoản tiền mặt.
  const bayGio = new Date();
  const dongKhoa = await nc.tx.payrollLine.findMany({ where: { runId: id }, select: { id: true, userId: true, fullName: true, netPay: true } });
  const tk = await taiKhoanHienHanh(nc.tx, dongKhoa.map((d) => d.userId));
  for (const d of dongKhoa) {
    const t = tk.get(d.userId);
    const traTay = !t?.bankAccount || t.paymentMethod === "tien-mat";
    await nc.tx.payrollLine.update({
      where: { id: d.id },
      data: {
        bankAccount: traTay ? null : t!.bankAccount, bankName: traTay ? null : (t?.bankName ?? null), accountHolder: traTay ? null : (t?.accountHolder || d.fullName),
        bankCapturedAt: bayGio, payMethod: traTay ? "tien-mat" : "chuyen-khoan",
      },
    });
  }
  await nc.tx.payrollRun.update({ where: { id }, data: { status: "da-khoa", lockedAt: bayGio, lockedBy: nc.hoSo.userId } });
  await ghiTrangThai(nc, ky, "khoa-luong", "da-khoa");
  const dong = await nc.tx.payrollLine.findMany({ where: { runId: id }, select: { id: true, userId: true } });
  for (const d of dong) {
    if (d.userId === nc.hoSo.userId) continue;
    await taoThongBao(nc.tx, nc.tenantId, { nguoiNhanId: d.userId, loai: "phieu-luong", tieuDe: `Phiếu lương tháng ${nhanKy(ky.year, ky.month)} đã có`, duongDan: `/luong/phieu-cua-toi`, doiTuong: "payroll_line", doiTuongId: d.id, khoaChongTrung: `phieu-luong:${d.id}` });
  }
  return { id, trangThai: "da-khoa" };
}

/**
 * Tài khoản ngân hàng hiện hành của mỗi người = phiên bản hồ sơ lương hiệu lực hôm nay (chưa có thì bản tạo sau cùng),
 * cùng mốc đổi tài khoản gần nhất (bản đầu tiên mang tài khoản khác bản trước) — QĐ-160, QĐ-161.
 */
export async function taiKhoanHienHanh(tx: ClientTenant, userIds: string[], homNay = homNayVN()) {
  const ds = await tx.salaryProfile.findMany({ where: { userId: { in: userIds } }, orderBy: { createdAt: "asc" }, select: { id: true, userId: true, effectiveFrom: true, createdAt: true, bankAccount: true, bankName: true, accountHolder: true, paymentMethod: true } });
  const kq = new Map<string, { bankAccount: string | null; bankName: string | null; accountHolder: string | null; paymentMethod: string; doiLuc: Date | null }>();
  for (const u of new Set(ds.map((d) => d.userId))) {
    const cua = ds.filter((d) => d.userId === u).map((d) => ({ ...d, hieuLucTu: dateVeNgay(d.effectiveFrom), taoLuc: d.createdAt }));
    const hien = chonBoHieuLuc(cua, homNay) ?? cua[cua.length - 1];
    let doiLuc: Date | null = null;
    for (let i = 1; i < cua.length; i++) {
      const a = cua[i - 1];
      const b = cua[i];
      // QA 0.22.0: đổi hình thức trả (chuyển khoản ↔ tiền mặt) tính như đổi tài khoản (QĐ-161).
      if (a.bankAccount !== b.bankAccount || a.bankName !== b.bankName || a.accountHolder !== b.accountHolder || a.paymentMethod !== b.paymentMethod) doiLuc = b.createdAt;
    }
    // QA 0.21.0 v2: cả mốc tài khoản ĐANG ÁP DỤNG bắt đầu có hiệu lực — một bản hiệu lực gần đây mang tài khoản khác bản áp
    // dụng ngay trước nó, dù bản đó TẠO đã lâu (vd hẹn trước ngày hiệu lực, rồi che bằng một bản lùi ngày mang tài khoản cũ).
    if (hien && hien.hieuLucTu <= homNay) {
      const truocNgay = new Date(Date.parse(`${hien.hieuLucTu}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      const truoc = chonBoHieuLuc(cua, truocNgay);
      if (truoc && (truoc.bankAccount !== hien.bankAccount || truoc.bankName !== hien.bankName || truoc.accountHolder !== hien.accountHolder || truoc.paymentMethod !== hien.paymentMethod)) {
        const apDung = ngayVeDate(hien.hieuLucTu);
        if (!doiLuc || apDung > doiLuc) doiLuc = apDung;
      }
    }
    kq.set(u, { bankAccount: hien.bankAccount, bankName: hien.bankName, accountHolder: hien.accountHolder, paymentMethod: hien.paymentMethod, doiLuc });
  }
  return kq;
}

/** Đánh dấu đã chi (QĐ-141: người có `luong.export` — người lập file chi ngân hàng). */
export async function daChiKyLuong(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.export", { objectType: "payroll_run", objectId: id });
  const ky = await docKyKhoa(nc, id);
  batBuocTrangThai(ky, ["da-khoa"], "đánh dấu đã chi");
  await nc.tx.payrollRun.update({ where: { id }, data: { status: "da-chi", paidAt: new Date(), paidBy: nc.hoSo.userId } });
  await ghiTrangThai(nc, ky, "chi-luong", "da-chi");
  return { id, trangThai: "da-chi" };
}

async function ghiTrangThai(nc: NguCanh, ky: KyLuong, action: "gui-duyet-luong" | "duyet-luong" | "tra-lai-luong" | "khoa-luong" | "chi-luong", sau: TrangThaiKy, them: Record<string, unknown> = {}) {
  await nc.kiemToan({ action, objectType: "payroll_run", objectId: ky.id, before: { trangThai: ky.status }, after: { trangThai: sau, ky: nhanKy(ky.year, ky.month), ...them } });
  await nc.suKien({ eventType: SU_KIEN.PAYROLL_STATUS_CHANGED, objectType: "payroll_run", objectId: ky.id, payload: { truoc: ky.status, sau } });
}

/** Tóm tắt tiền cho thông báo / email (không dùng trong nhật ký). */
export const dinhDangTien = SO_TIEN_NHAN;

// ---------------------------------------------------------------------------
// 0.22.0 — Công nhập tay trên dòng nháp, lấy lại công từ bảng công (QĐ-172)
// ---------------------------------------------------------------------------

/** Kế toán (`luong.create`) hoặc Nhân sự (`luong.update`) + 2 lớp (theo Cấu hình). */
function batBuocNhapCong(nc: NguCanh, kyId: string) {
  if (!coQuyen(nc.hoSo, "luong.create") && !coQuyen(nc.hoSo, "luong.update")) throw new LoiThieuQuyen("luong.create", { objectType: "payroll_manual_input", objectId: kyId });
  batBuoc2Lop(nc);
}

/**
 * Nhập / sửa CÔNG TAY cho một người trên kỳ lương NHÁP: số ngày công (trống = đủ công chuẩn), giờ tăng ca, nghỉ không
 * lương, lý do. Chỉ cho người CHƯA có dòng trong bảng công đã khóa của tháng (có rồi → dùng bảng công). Không ai nhập
 * công cho chính mình. Kỳ "cần tính lại" sau khi nhập.
 */
export async function nhapCongTayLuong(nc: NguCanh, kyId: string, d: z.infer<typeof LuocDoCongTayLuong>) {
  batBuocNhapCong(nc, kyId);
  const ky = await docKyKhoa(nc, kyId);
  batBuocTrangThai(ky, ["nhap"], "nhập công");
  if (d.nguoiId === nc.hoSo.userId) throw new LoiNghiepVu("Không ai tự nhập công tính lương cho chính mình — nhờ Kế toán / Nhân sự khác.", 403, "tu-nhap-cong");
  if (!(await trongPhamViLuong(nc, d.nguoiId))) throw new LoiKhongTimThay("Nhân viên");
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true, fullName: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  const bang = await nc.tx.timesheet.findFirst({ where: { year: ky.year, month: ky.month, status: "da-khoa" }, select: { id: true } });
  if (bang && (await nc.tx.timesheetRow.count({ where: { timesheetId: bang.id, userId: d.nguoiId } })) > 0) {
    throw new LoiNghiepVu(`${u.fullName} đã có công trong bảng công tháng ${nhanKy(ky.year, ky.month)} đã khóa — lương lấy từ bảng công, không nhập tay.`, 409, "da-co-bang-cong");
  }
  const giaTri = { workDays: d.soNgayCong, otMinutes: Math.round(d.gioTangCa * 60), unpaidLeaveDays: d.nghiKhongLuong, reason: d.lyDo, createdBy: nc.hoSo.userId };
  const cu = await nc.tx.payrollManualInput.findFirst({ where: { runId: kyId, userId: d.nguoiId } });
  if (cu) await nc.tx.payrollManualInput.update({ where: { id: cu.id }, data: giaTri });
  else await nc.tx.payrollManualInput.create({ data: { tenantId: nc.tenantId, runId: kyId, userId: d.nguoiId, ...giaTri } });
  await nc.tx.payrollRun.update({ where: { id: kyId }, data: { dirty: true } });
  await nc.kiemToan({
    action: "nhap-cong-luong", objectType: "payroll_run", objectId: kyId,
    before: cu ? { nguoi: d.nguoiId, soNgayCong: cu.workDays === null ? null : Number(cu.workDays), phutTangCa: cu.otMinutes, nghiKhongLuong: Number(cu.unpaidLeaveDays) } : null,
    after: { ky: nhanKy(ky.year, ky.month), nguoi: d.nguoiId, soNgayCong: d.soNgayCong, gioTangCa: d.gioTangCa, nghiKhongLuong: d.nghiKhongLuong, lyDo: d.lyDo },
  });
  return { kyId, nguoiId: d.nguoiId };
}

export async function xoaCongTayLuong(nc: NguCanh, kyId: string, nguoiId: string) {
  batBuocNhapCong(nc, kyId);
  const ky = await docKyKhoa(nc, kyId);
  batBuocTrangThai(ky, ["nhap"], "xóa công nhập tay");
  // QA 0.22.0: bỏ công nhập tay = dòng quay về "mặc định đủ công chuẩn" — cùng luật "không tự nhập công cho mình" và cùng
  // phạm vi như khi nhập (trước đây tự bỏ được công nhập tay của chính mình → được trả đủ công).
  if (nguoiId === nc.hoSo.userId) throw new LoiNghiepVu("Không ai tự bỏ công nhập tay tính lương của chính mình — nhờ Kế toán / Nhân sự khác.", 403, "tu-nhap-cong");
  if (!(await trongPhamViLuong(nc, nguoiId))) throw new LoiKhongTimThay("Công nhập tay");
  const cu =await nc.tx.payrollManualInput.findFirst({ where: { runId: kyId, userId: nguoiId } });
  if (!cu) throw new LoiKhongTimThay("Công nhập tay");
  await nc.tx.payrollManualInput.delete({ where: { id: cu.id } });
  await nc.tx.payrollRun.update({ where: { id: kyId }, data: { dirty: true } });
  await nc.kiemToan({ action: "xoa-cong-luong", objectType: "payroll_run", objectId: kyId, before: { nguoi: nguoiId, lyDo: cu.reason } });
  return { kyId, nguoiId };
}

/**
 * "Lấy lại công từ bảng công" (QĐ-172): bảng công tháng đã khóa sau khi kỳ lương tính bằng công nhập tay / mặc định.
 * Kỳ còn nháp: xóa công nhập tay của những người ĐÃ CÓ dòng trong bảng công khóa rồi tính lại — dòng của họ chuyển sang
 * nguồn "bảng công". Người không có trong bảng công giữ công nhập tay / mặc định.
 */
export async function layLaiCongTuBangCong(nc: NguCanh, kyId: string) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_run", objectId: kyId });
  const ky = await docKyKhoa(nc, kyId);
  batBuocTrangThai(ky, ["nhap"], "lấy lại công");
  const bang = await nc.tx.timesheet.findFirst({ where: { year: ky.year, month: ky.month, status: "da-khoa" }, select: { id: true } });
  if (!bang) throw new LoiNghiepVu(`Bảng công tháng ${nhanKy(ky.year, ky.month)} chưa khóa — chưa có gì để lấy lại. Lương vẫn tính được bằng công nhập tay / mặc định.`, 409, "bang-cong-chua-khoa");
  const coDong = (await nc.tx.timesheetRow.findMany({ where: { timesheetId: bang.id }, select: { userId: true }, distinct: ["userId"] })).map((x) => x.userId);
  const xoa = await nc.tx.payrollManualInput.deleteMany({ where: { runId: kyId, userId: { in: coDong } } });
  await nc.kiemToan({ action: "lay-lai-cong-bang-cong", objectType: "payroll_run", objectId: kyId, after: { ky: nhanKy(ky.year, ky.month), bangCong: bang.id, soCongTayXoa: xoa.count } });
  const kq = await tinhKyLuong(nc, kyId);
  return { ...kq, soCongTayXoa: xoa.count };
}
