import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { laLoiTrung, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { banDoTen, lichCuaNhieuNguoi, ngayLeTrongKhoang } from "@/modules/cham-cong/chung";
import { CO_NGAY, cacNgayTrongThang, congDuKien } from "@/modules/cham-cong/tinh-toan";
import { dateVeNgay } from "@/modules/crm/chung";
import { ketQuaHieuLuc } from "@/modules/danh-gia/service";
import { baoChoNguoiCoQuyen, taoThongBao } from "@/modules/thong-bao/service";
import { batBuocQuyenLuong, docCauHinhLuong, ghiXem, locNguoiLuong, thamSoHieuLuc, trongPhamViLuong, xemDuocNguoiKhac, type BoApDung } from "./chung";
import { hoSoApDung, soNguoiPhuThuoc } from "./ho-so";
import { NHAN_LOAI_KHOAN, type LuocDoKhoan, type LuocDoLyDo, type LuocDoTaoKy } from "./luoc-do";
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
      id: k.id, nam: k.year, thang: k.month, nhan: nhanKy(k.year, k.month), trangThai: k.status as TrangThaiKy,
      nhanTrangThai: NHAN_TRANG_THAI_KY[k.status as TrangThaiKy], canTinhLai: k.dirty, tinhLuc: k.calculatedAt,
      soNguoi: t?._count._all ?? 0, soLoi: loiKy.get(k.id) ?? 0,
      tongThuNhap: Number(t?._sum.grossIncome ?? 0), tongThucLinh: Number(t?._sum.netPay ?? 0),
      tongThue: Number(t?._sum.personalIncomeTax ?? 0), tongBhDn: Number(t?._sum.employerInsurance ?? 0),
    };
  });
}

export async function taoKyLuong(nc: NguCanh, d: z.infer<typeof LuocDoTaoKy>) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_run" });
  try {
    const ky = await nc.tx.payrollRun.create({ data: { tenantId: nc.tenantId, year: d.nam, month: d.thang, createdBy: nc.hoSo.userId } });
    await nc.kiemToan({ action: "tao-ky-luong", objectType: "payroll_run", objectId: ky.id, after: { ky: nhanKy(d.nam, d.thang) } });
    return { id: ky.id };
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiNghiepVu(`Kỳ lương ${nhanKy(d.nam, d.thang)} đã có.`, 409, "ky-da-co");
    throw e;
  }
}

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

  // LU-21: bảng công phải đã khóa.
  const bang = await tx.timesheet.findFirst({ where: { year: ky.year, month: ky.month } });
  if (!bang || bang.status !== "da-khoa") {
    throw new LoiNghiepVu(`Bảng công tháng ${nhanKy(ky.year, ky.month)} ${bang ? "chưa khóa" : "chưa sinh"} — Nhân sự khóa bảng công trước rồi mới tính lương.`, 422, "bang-cong-chua-khoa");
  }
  // LU-22: ngày thiếu giờ còn chờ quyết → chặn, báo danh sách.
  const tg = await ngayThieuGioCho(tx, bang.id);
  if (tg.cho.length) {
    const ten = await banDoTen(tx, tg.cho.map((d) => d.userId));
    const ds = tg.cho.map((d) => ({ nguoiId: d.userId, hoTen: ten.get(d.userId) ?? "—", ngay: dateVeNgay(d.workDate) }));
    throw new LoiNghiepVu(
      `Còn ${ds.length} ngày công “thiếu giờ” chờ quản lý quyết: ${ds.slice(0, 10).map((x) => `${x.hoTen} ${x.ngay.split("-").reverse().join("/")}`).join("; ")}${ds.length > 10 ? "…" : ""}. Quyết ở Chấm công → Ngày công thiếu giờ rồi tính lại.`,
      422,
      "con-ngay-thieu-gio",
      ds,
    );
  }

  const ch = await docCauHinhLuong(tx);
  const ts = await thamSoHieuLuc(tx, den);
  const canhBaoKy: CanhBaoLuong[] = [];
  const chuaXacNhan = ts.bo.filter((b) => !b.daXacNhan);
  if (chuaXacNhan.length) {
    canhBaoKy.push({ ma: "tham-so-chua-xac-nhan", muc: "loi", noiDung: `Tham số chưa được kế toán xác nhận: ${chuaXacNhan.map((b) => `${b.loai} (từ ${b.hieuLucTu})`).join(", ")}. Xác nhận ở Tính lương → Tham số rồi tính lại.` });
  }
  if (tg.quyetSau.length) {
    canhBaoKy.push({ ma: "thieu-gio-quyet-sau-khoa", muc: "canh-bao", noiDung: `${tg.quyetSau.length} ngày thiếu giờ được quyết SAU khi khóa bảng công — lương kỳ này theo số đã khóa, chênh lệch vào dòng điều chỉnh bảng công tháng sau.` });
  }

  // Ai vào bảng lương: có hồ sơ hiệu lực ngày cuối tháng, đang hoạt động hoặc có dòng công tháng này.
  const dong = await tx.timesheetRow.findMany({ where: { timesheetId: bang.id } });
  const coCong = new Set(dong.map((r) => r.userId));
  const hoSo = await hoSoApDung(tx, null, den);
  const users = await tx.user.findMany({
    where: { id: { in: [...hoSo.keys()] }, isSystem: false },
    select: { id: true, fullName: true, status: true, staffProfile: { select: { hiredAt: true } } },
  });
  const nguoi = users.filter((u) => u.status === "hoat-dong" || coCong.has(u.id)).sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
  const ids = nguoi.map((u) => u.id);

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
  const truyThuMoCoi = truyThu.filter((t) => !coDong.has(t.user_id));
  if (truyThuMoCoi.length) {
    const ten = await banDoTen(tx, truyThuMoCoi.map((t) => t.user_id));
    canhBaoKy.push({ ma: "truy-thu-khong-co-dong", muc: "canh-bao", noiDung: `Có hoa hồng cần truy thu nhưng người nhận không có dòng lương kỳ này: ${truyThuMoCoi.map((t) => `${ten.get(t.user_id) ?? "—"} (phiếu ${t.payment_no})`).join("; ")}. Thu hồi ngoài bảng lương hoặc ở kỳ có dòng.` });
  }

  const khoan = await tx.payrollItem.findMany({ where: { runId: id }, orderBy: { createdAt: "asc" } });
  const khoanMoCoi = khoan.filter((k) => !coDong.has(k.userId));
  if (khoanMoCoi.length) canhBaoKy.push({ ma: "khoan-khong-co-dong", muc: "loi", noiDung: `${khoanMoCoi.length} khoản cộng / trừ của người không có dòng lương kỳ này — xóa khoản hoặc bổ sung hồ sơ lương.` });

  const thamSo = { ...ts.giaTri, soGioNgay: ch.soGioNgay };
  let soLoi = 0;
  for (const u of nguoi) {
    const h = hoSo.get(u.id)!;
    const l = lich.get(u.id)!;
    const ngayVao = u.staffProfile?.hiredAt ? dateVeNgay(u.staffProfile.hiredAt) : null;
    // Công chuẩn tính CẢ THÁNG (LU-21). QA 0.21.0: người vào làm giữa tháng thường được gán lịch từ ngày vào — ngày
    // trước lần gán lịch đầu tiên trong tháng dùng lịch đầu tiên đó; nếu bỏ qua những ngày này, công chuẩn chỉ còn
    // phần cuối tháng và người làm đủ nửa tháng nhận đủ lương tháng. Ngày lễ chỉ trả khi ngày đó thật sự có lịch.
    const lichDau = cacNgay.map((d) => l(d)).find((x) => x !== null) ?? null;
    let chuan = 0;
    let ngayLe = 0;
    for (const d of cacNgay) {
      const that = l(d);
      const ap = that ?? lichDau;
      chuan += congDuKien(d, ap?.ca ?? null, ap?.ngay ?? null, false).giaTri;
      if (that && le.has(d) && (!ngayVao || d >= ngayVao)) ngayLe += congDuKien(d, that.ca, that.ngay, false).giaTri;
    }
    const cua = dong.filter((r) => r.userId === u.id);
    const tc: PhutTangCa = { thuong: 0, thuongDem: 0, nghiTuan: 0, nghiTuanDem: 0, le: 0, leDem: 0 };
    let thucTe = 0, nghiCo = 0, nghiKhong = 0, muon = 0, som = 0, soDc = 0;
    for (const r of cua) {
      thucTe += Number(r.workValue);
      if (r.leavePaid) nghiCo += Number(r.leaveDays);
      else nghiKhong += Number(r.leaveDays);
      muon += r.lateMinutes;
      som += r.earlyMinutes;
      if (r.isAdjustment) soDc++;
      const ngay = r.otMinutes - r.otNightMinutes;
      if (r.dayType === "le") { tc.le += ngay; tc.leDem += r.otNightMinutes; }
      else if (r.dayType === "nghi-tuan") { tc.nghiTuan += ngay; tc.nghiTuanDem += r.otNightMinutes; }
      else { tc.thuong += ngay; tc.thuongDem += r.otNightMinutes; }
    }
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const p = phieuTheoNguoi.get(u.id);
    const kq = p ? ketQuaHieuLuc({ ...p, adjustments: p.adjustments }) : null;
    const pbCua = phanBo.filter((x) => x.owner_id === u.id);
    const ttCua = truyThu.filter((x) => x.user_id === u.id);
    const pcHoSo = Array.isArray(h.allowances) ? (h.allowances as { loaiId: string; soTien: number }[]) : [];
    const khoanCua = khoan.filter((k) => k.userId === u.id);

    const dv: DauVaoLuong = {
      ky: { nam: ky.year, thang: ky.month },
      hoSo: {
        id: h.id, hieuLucTu: dateVeNgay(h.effectiveFrom), loaiHopDong: h.contractType as DauVaoLuong["hoSo"]["loaiHopDong"],
        tyLeThuViec: h.probationPercent === null ? null : Number(h.probationPercent), cachTra: h.payBasis as DauVaoLuong["hoSo"]["cachTra"],
        luongCoBan: Number(h.baseSalary), luongDongBH: Number(h.insuranceSalary), thuongKpi: Number(h.kpiBonus), huongHoaHong: h.commissionEnabled,
        phuongPhapThue: h.taxMethod as DauVaoLuong["hoSo"]["phuongPhapThue"],
      },
      phuCap: pcHoSo.filter((x) => loaiPc.has(x.loaiId)).map((x) => {
        const lp = loaiPc.get(x.loaiId)!;
        return { ma: lp.code, ten: lp.name, soTien: Number(x.soTien), chiuThue: lp.taxable, tinhBH: lp.insurable, theo: lp.basis as "thang" | "ngay-cong" };
      }),
      cong: { chuan: r2(chuan), thucTe: r2(thucTe), nghiCoLuong: r2(nghiCo), nghiKhongLuong: r2(nghiKhong), le: r2(ngayLe), tangCaPhut: tc, phutMuon: muon, phutSom: som, soDongDieuChinh: soDc },
      soNguoiPhuThuoc: npt.get(u.id) ?? 0,
      kpi: kq
        ? { trangThai: "da-chot", heSo: kq.heSoThuong, xepLoai: kq.xepLoai, danhGiaId: p!.id }
        : { trangThai: p ? "chua-chot" : "khong-co", heSo: null, xepLoai: null, danhGiaId: p?.id ?? null },
      hoaHong: {
        phanBo: pbCua.map((x) => ({ id: x.allocation_id, so: x.number, soTien: Math.round(Number(x.amount)) })),
        truyThu: ttCua.map((x) => ({ id: x.allocation_id, so: x.payment_no, soTien: Number(x.amount), tyLeBp: x.rate_bp })),
      },
      khoan: khoanCua.map((k) => ({ chieu: k.direction as "cong" | "tru", loai: k.category, soTien: Number(k.amount), chiuThue: k.taxable, lyDo: k.reason })),
      thamSo,
    };
    const kqL = tinhLuong(dv);
    if (coLoi(kqL.canhBao)) soLoi++;
    const nguon = { bangCongId: bang.id, bangCongKhoaLuc: bang.lockedAt, thamSo: ts.bo, kyDanhGiaId: kyDg?.id ?? null };
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
    data: { timesheetId: bang.id, dirty: false, warnings: canhBaoKy as object, calculatedAt: new Date(), calculatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "tinh-luong", objectType: "payroll_run", objectId: id, after: { ky: nhanKy(ky.year, ky.month), soDong: nguoi.length, soDongLoi: soLoi, bangCong: bang.id } });
  await nc.suKien({ eventType: SU_KIEN.PAYROLL_CALCULATED, objectType: "payroll_run", objectId: id, payload: { soDong: nguoi.length, soDongLoi: soLoi } });
  return { id, soDong: nguoi.length, soDongLoi: soLoi, canhBao: canhBaoKy };
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
  const coDongCuaToi = (await nc.tx.payrollLine.count({ where: { runId: id, userId: nc.hoSo.userId } })) > 0;
  const tong = (f: (d: (typeof dong)[number]) => bigint) => Number(dong.reduce((a, d) => a + f(d), 0n));
  return {
    id: ky.id, nam: ky.year, thang: ky.month, nhan: nhanKy(ky.year, ky.month), trangThai: ky.status as TrangThaiKy,
    nhanTrangThai: NHAN_TRANG_THAI_KY[ky.status as TrangThaiKy], canTinhLai: ky.dirty, canhBao: (ky.warnings ?? []) as unknown as CanhBaoLuong[],
    lyDoTraLai: ky.returnReason,
    buoc: {
      tinh: ky.calculatedAt ? { luc: ky.calculatedAt, nguoi: ten.get(ky.calculatedBy ?? "") ?? "—" } : null,
      guiDuyet: ky.submittedAt ? { luc: ky.submittedAt, nguoi: ten.get(ky.submittedBy ?? "") ?? "—" } : null,
      duyet: ky.approvedAt ? { luc: ky.approvedAt, nguoi: ten.get(ky.approvedBy ?? "") ?? "—" } : null,
      khoa: ky.lockedAt ? { luc: ky.lockedAt, nguoi: ten.get(ky.lockedBy ?? "") ?? "—" } : null,
      chi: ky.paidAt ? { luc: ky.paidAt, nguoi: ten.get(ky.paidBy ?? "") ?? "—" } : null,
    },
    quyen: {
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
      taxable: d.chieu === "cong" ? d.chiuThue : false, reason: d.lyDo, adjustsRunId: d.kyGocId ?? null, createdBy: nc.hoSo.userId,
    },
  });
  await nc.tx.payrollRun.update({ where: { id: kyId }, data: { dirty: true } });
  await nc.kiemToan({ action: "them-khoan-luong", objectType: "payroll_item", objectId: k.id, after: { ky: nhanKy(ky.year, ky.month), nguoi: d.nguoiId, chieu: d.chieu, loai: d.loai, lyDo: d.lyDo, kyGoc: d.kyGocId ?? null } });
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

/** Tham số dùng lúc tính phải còn là bộ hiệu lực và đã xác nhận (QĐ-143). */
async function kiemThamSo(tx: ClientTenant, ky: KyLuong) {
  const { den } = khoangThang(ky.year, ky.month);
  const ts = await thamSoHieuLuc(tx, den);
  const chua = ts.bo.filter((b) => !b.daXacNhan);
  if (chua.length) throw new LoiNghiepVu(`Tham số chưa được kế toán xác nhận: ${chua.map((b) => b.loai).join(", ")}.`, 422, "tham-so-chua-xac-nhan");
  const mau = await tx.payrollLine.findFirst({ where: { runId: ky.id }, select: { inputs: true } });
  const daDung = ((mau?.inputs as { nguon?: { thamSo?: BoApDung[] } } | null)?.nguon?.thamSo ?? []).map((b) => b.id).sort().join(",");
  if (mau && daDung !== ts.bo.map((b) => b.id).sort().join(",")) {
    throw new LoiNghiepVu("Tham số lương đã đổi sau lần tính gần nhất — tính lại trước khi gửi duyệt.", 422, "tham-so-da-doi");
  }
}

async function kiemKhongTuDuyet(nc: NguCanh, ky: KyLuong, viec: string) {
  if (ky.calculatedBy === nc.hoSo.userId) throw new LoiNghiepVu(`Người tính bảng lương không được ${viec} — cần người khác có quyền duyệt.`, 403, "nguoi-tinh-khong-duyet");
  const coDong = await nc.tx.payrollLine.count({ where: { runId: ky.id, userId: nc.hoSo.userId } });
  if (coDong > 0) throw new LoiNghiepVu(`Bảng lương có dòng của chính bạn — không tự ${viec}. Nhờ người khác có quyền duyệt.`, 403, "tu-duyet");
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
  await kiemThamSo(nc.tx, ky);
  const huy = await phieuThuDaHuy(nc.tx, id);
  if (huy.length) throw new LoiNghiepVu(`Phiếu thu ${huy.join(", ")} đã hủy sau khi tính hoa hồng — tính lại.`, 422, "phieu-thu-da-huy");
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
  const bayGio = new Date();
  await nc.tx.payrollRun.update({ where: { id }, data: { status: "da-duyet", approvedAt: bayGio, approvedBy: nc.hoSo.userId } });
  // Khoản cộng / trừ / điều chỉnh của kỳ được duyệt cùng bảng lương — ghi người duyệt (LU-31).
  await nc.tx.payrollItem.updateMany({ where: { runId: id }, data: { approvedBy: nc.hoSo.userId, approvedAt: bayGio } });
  await ghiTrangThai(nc, ky, "duyet-luong", "da-duyet");
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
  await nc.tx.payrollRun.update({ where: { id }, data: { status: "da-khoa", lockedAt: new Date(), lockedBy: nc.hoSo.userId } });
  await ghiTrangThai(nc, ky, "khoa-luong", "da-khoa");
  const dong = await nc.tx.payrollLine.findMany({ where: { runId: id }, select: { id: true, userId: true } });
  for (const d of dong) {
    if (d.userId === nc.hoSo.userId) continue;
    await taoThongBao(nc.tx, nc.tenantId, { nguoiNhanId: d.userId, loai: "phieu-luong", tieuDe: `Phiếu lương tháng ${nhanKy(ky.year, ky.month)} đã có`, duongDan: `/luong/phieu-cua-toi`, doiTuong: "payroll_line", doiTuongId: d.id, khoaChongTrung: `phieu-luong:${d.id}` });
  }
  return { id, trangThai: "da-khoa" };
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
