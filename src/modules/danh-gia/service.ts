import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coMotTrongCacQuyen, coQuyen } from "@/lib/phan-quyen";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { LoiThieuQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { banDoTen } from "@/modules/cham-cong/chung";
import { dateVeNgay, ngayVeDate } from "@/modules/crm/chung";
import { taoThongBao } from "@/modules/thong-bao/service";
import { thongKeBaoCaoTuan } from "@/modules/bao-cao-cong-viec/service";
import { chamDuoc, chotDuoc, docCauHinhDanhGia, locNguoiDanhGia, xepLoaiTu } from "./chung";
import { tinhChiSo, tomTatCong } from "./chi-so";
import {
  bangXepLoaiHopLe,
  CHI_SO,
  CHIEU_KPI,
  chonBoKpi,
  kyDanhGia,
  lamTron2,
  LOAI_KY,
  MA_CHI_SO,
  phanTramDat,
  tongDiemKpi,
  xepLoai,
  type ChieuKpi,
  type LoaiKy,
  type MaChiSo,
} from "./tinh-toan";

/**
 * KPI theo vị trí và đánh giá định kỳ (0.20.0, DG-50 → DG-68).
 *
 * Luồng một phiếu: Nhân sự mở kỳ → máy điền sẵn chỉ tiêu tự tính → nhân viên tự đánh giá (ghi chú,
 * tự chấm) → quản lý trực tiếp chấm chỉ tiêu tay + nhận xét → trưởng phòng / giám đốc chốt (điểm tổng →
 * xếp loại A/B/C/D + hệ số thưởng theo Cấu hình). Đã chốt thì bất biến (trigger); sai thì mở phiên điều
 * chỉnh có lý do (chỉ ghi thêm), kết quả hiệu lực = lần điều chỉnh mới nhất.
 *
 * Quyền: bộ KPI, kỳ đánh giá do `nhan_su.update` (Nhân sự) quản lý; xem theo `danh_gia.view` (+ cấp dưới
 * trực tiếp); chấm theo quản lý trực tiếp hoặc `danh_gia.update`; chốt / điều chỉnh theo `danh_gia.approve`.
 * Không ai tự chấm / tự chốt phiếu của mình. Trợ lý AI không có `danh_gia.*` (DG-80).
 */

function batBuocQuanLyNhanSu(nc: NguCanh, doiTuong: string) {
  if (!coQuyen(nc.hoSo, "nhan_su.update")) throw new LoiThieuQuyen("nhan_su.update", { objectType: doiTuong });
}

// ---------------------------------------------------------------------------
// Bộ KPI
// ---------------------------------------------------------------------------

const soTuyChon = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Mục tiêu là số không âm." });
      return z.NEVER;
    }
    // Cột numeric(18, 2): vượt thì PostgreSQL báo tràn số (lỗi máy 500) — chặn ở lược đồ (QA 0.20.0).
    if (n >= 1e15) {
      ctx.addIssue({ code: "custom", message: "Mục tiêu quá lớn." });
      return z.NEVER;
    }
    return n;
  })
  .nullable()
  .optional()
  .default(null);

export const LuocDoChiTieu = z
  .object({
    id: z.uuid().optional(),
    ten: z.string().trim().min(2).max(255),
    // Cột numeric(5, 2): trọng số < 0,01 làm tròn về 0 và vấp CHECK > 0 (lỗi máy) — chặn ở lược đồ (QA 0.20.0).
    trongSo: z.coerce.number().min(0.01, "Trọng số tối thiểu 0,01.").max(100),
    nguon: z.enum(["tu-dong", "thu-cong"]),
    chiSo: z.enum(MA_CHI_SO as [MaChiSo, ...MaChiSo[]]).nullable().optional().default(null),
    chieu: z.enum(CHIEU_KPI).optional(),
    mucTieuThang: soTuyChon,
    mucTieuQuy: soTuyChon,
  })
  .refine((c) => c.nguon === "thu-cong" || !!c.chiSo, { message: "Chỉ tiêu tự tính phải chọn chỉ số.", path: ["chiSo"] });

export const LuocDoBoKpi = z
  .object({
    ma: z.string().trim().regex(/^[a-z0-9-]{2,50}$/, "Mã: chữ thường không dấu, số, gạch ngang."),
    ten: z.string().trim().min(3).max(255),
    moTa: z.string().trim().max(2000).optional().default(""),
    chucDanh: z.string().trim().max(255).optional().default(""),
    maVaiTro: z.string().trim().max(50).optional().default(""),
    trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional().default("hoat-dong"),
    chiTieu: z.array(LuocDoChiTieu).min(1, "Bộ KPI cần ít nhất một chỉ tiêu.").max(20),
  })
  .refine((b) => Math.abs(b.chiTieu.reduce((s, c) => s + c.trongSo, 0) - 100) < 0.01, { message: "Tổng trọng số các chỉ tiêu phải bằng 100.", path: ["chiTieu"] });
export type DuLieuBoKpi = z.infer<typeof LuocDoBoKpi>;

export async function danhSachBoKpi(nc: NguCanh) {
  if (!coMotTrongCacQuyen(nc.hoSo, ["danh_gia.view", "nhan_su.view"])) throw new LoiThieuQuyen("danh_gia.view", { objectType: "kpi_set" });
  const ds = await nc.tx.kpiSet.findMany({ orderBy: { name: "asc" }, include: { items: { where: { status: "hoat-dong" }, orderBy: { position: "asc" } } } });
  return ds.map((b) => ({
    id: b.id, ma: b.code, ten: b.name, moTa: b.description ?? "", chucDanh: b.jobTitle ?? "", maVaiTro: b.roleCode ?? "", trangThai: b.status,
    chiTieu: b.items.map((c) => ({
      id: c.id, ten: c.name, trongSo: Number(c.weight), nguon: c.source as "tu-dong" | "thu-cong", chiSo: c.metric as MaChiSo | null,
      chieu: c.direction as ChieuKpi, mucTieuThang: c.targetMonth === null ? null : Number(c.targetMonth), mucTieuQuy: c.targetQuarter === null ? null : Number(c.targetQuarter),
    })),
  }));
}

async function ghiChiTieu(nc: NguCanh, boId: string, ds: DuLieuBoKpi["chiTieu"]) {
  const giu = ds.filter((c) => c.id).map((c) => c.id!) as string[];
  await nc.tx.kpiItem.deleteMany({ where: { kpiSetId: boId, id: { notIn: giu } } });
  for (const [i, c] of ds.entries()) {
    const data = {
      name: c.ten, weight: c.trongSo, source: c.nguon, metric: c.nguon === "tu-dong" ? c.chiSo : null,
      direction: c.chieu ?? (c.nguon === "tu-dong" && c.chiSo ? CHI_SO[c.chiSo].chieu : "cao-tot"),
      targetMonth: c.mucTieuThang, targetQuarter: c.mucTieuQuy, position: i, status: "hoat-dong",
    };
    if (c.id) {
      const n = await nc.tx.kpiItem.updateMany({ where: { id: c.id, kpiSetId: boId }, data });
      if (n.count === 0) throw new LoiKhongTimThay("Chỉ tiêu");
    } else {
      await nc.tx.kpiItem.create({ data: { tenantId: nc.tenantId, kpiSetId: boId, ...data } });
    }
  }
}

export async function taoBoKpi(nc: NguCanh, d: DuLieuBoKpi) {
  batBuocQuanLyNhanSu(nc, "kpi_set");
  try {
    const b = await nc.tx.kpiSet.create({
      data: { tenantId: nc.tenantId, code: d.ma, name: d.ten, description: d.moTa || null, jobTitle: d.chucDanh || null, roleCode: d.maVaiTro || null, status: d.trangThai, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
    });
    await ghiChiTieu(nc, b.id, d.chiTieu.map((c) => ({ ...c, id: undefined })));
    await nc.kiemToan({ action: "tao", objectType: "kpi_set", objectId: b.id, after: d });
    return { id: b.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new LoiNghiepVu("Mã bộ KPI đã có.", 409, "trung-ma");
    throw e;
  }
}

/** Sửa bộ KPI không ảnh hưởng phiếu đã tạo (phiếu chụp chỉ tiêu lúc mở kỳ). */
export async function suaBoKpi(nc: NguCanh, id: string, d: DuLieuBoKpi) {
  batBuocQuanLyNhanSu(nc, "kpi_set");
  const goc = await nc.tx.kpiSet.findFirst({ where: { id } });
  if (!goc) throw new LoiKhongTimThay("Bộ KPI");
  await nc.tx.kpiSet.update({
    where: { id },
    data: { code: d.ma, name: d.ten, description: d.moTa || null, jobTitle: d.chucDanh || null, roleCode: d.maVaiTro || null, status: d.trangThai, updatedBy: nc.hoSo.userId },
  });
  await ghiChiTieu(nc, id, d.chiTieu);
  await nc.kiemToan({ action: "sua", objectType: "kpi_set", objectId: id, after: d });
  return { id };
}

// ---------------------------------------------------------------------------
// Kỳ đánh giá + điền sẵn phiếu
// ---------------------------------------------------------------------------

export const LuocDoKy = z.object({
  loai: z.enum(LOAI_KY),
  nam: z.coerce.number().int().min(2020).max(2100),
  so: z.coerce.number().int().min(1).max(12),
  /** Trống = mọi người có quản lý trực tiếp (không gồm thực tập sinh). */
  nguoiIds: z.array(z.uuid()).max(1000).optional(),
}).refine((k) => k.loai === "thang" || k.so <= 4, { message: "Quý chỉ từ 1 đến 4.", path: ["so"] });

function kyCuaBanGhi(k: { kind: string; year: number; number: number }) {
  return kyDanhGia(k.kind as LoaiKy, k.year, k.number);
}

/** Số liệu chỉ tiêu tự tính + bối cảnh (báo cáo tuần, công) của một người trong một kỳ. */
async function tinhPhieu(tx: ClientTenant, userId: string, loai: LoaiKy, ky: ReturnType<typeof kyDanhGia>, chiTieu: { metric: string | null; source: string; direction: string; target: number | null }[], tran: number) {
  const k = { batDau: ky.batDau, ketThuc: ky.ketThuc };
  const kq: { actual: number | null; achievement: number | null }[] = [];
  for (const c of chiTieu) {
    if (c.source !== "tu-dong" || !c.metric) {
      kq.push({ actual: null, achievement: null });
      continue;
    }
    const actual = await tinhChiSo(tx, userId, c.metric as MaChiSo, k);
    kq.push({ actual, achievement: phanTramDat(actual, c.target, c.direction as ChieuKpi, tran) });
  }
  const ctx = {
    baoCaoTuan: await thongKeBaoCaoTuan(tx, userId, ky.tu, ky.den),
    cong: await tomTatCong(tx, userId, ky.tu, ky.den),
    viec: {
      tongDiem: await tinhChiSo(tx, userId, "tong-diem-viec", k),
      tyLeDungHan: await tinhChiSo(tx, userId, "ty-le-dung-han", k),
      tyLeTraLai: await tinhChiSo(tx, userId, "ty-le-tra-lai", k),
    },
    tinhLuc: new Date().toISOString(),
  };
  void loai;
  return { kq, ctx };
}

async function baoQuaThongBao(tx: ClientTenant, tenantId: string, nguoiNhanId: string | null, d: { loai: string; tieuDe: string; noiDung?: string; id: string; khoa: string }, tru?: string) {
  if (!nguoiNhanId || nguoiNhanId === tru) return;
  await taoThongBao(tx, tenantId, { nguoiNhanId, loai: d.loai, tieuDe: d.tieuDe.slice(0, 300), noiDung: d.noiDung ?? null, duongDan: `/danh-gia/${d.id}`, doiTuong: "evaluation", doiTuongId: d.id, khoaChongTrung: d.khoa });
}

export async function taoKyDanhGia(nc: NguCanh, d: z.infer<typeof LuocDoKy>) {
  batBuocQuanLyNhanSu(nc, "evaluation_period");
  let ky: ReturnType<typeof kyDanhGia>;
  try {
    ky = kyDanhGia(d.loai, d.nam, d.so);
  } catch (e) {
    if (e instanceof RangeError) throw new LoiNghiepVu(e.message, 422, "ky-sai");
    throw e;
  }
  const ch = await docCauHinhDanhGia(nc.tx);
  let kyMoi;
  try {
    kyMoi = await nc.tx.evaluationPeriod.create({
      data: { tenantId: nc.tenantId, kind: d.loai, year: d.nam, number: d.so, startDate: ngayVeDate(ky.tu), endDate: ngayVeDate(ky.den), createdBy: nc.hoSo.userId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new LoiNghiepVu(`Đã có kỳ ${ky.nhan}.`, 409, "trung-ky");
    throw e;
  }
  const nguoi = await nc.tx.staffProfile.findMany({
    where: { staffType: { not: "thuc-tap" }, user: { status: "hoat-dong", isSystem: false }, ...(d.nguoiIds?.length ? { userId: { in: d.nguoiIds } } : { managerId: { not: null } }) },
    select: { userId: true, managerId: true, jobTitle: true, user: { select: { fullName: true, userRoles: { where: { status: "hoat-dong" }, select: { role: { select: { code: true } } } } } } },
  });
  const boKpi = await nc.tx.kpiSet.findMany({ where: { status: "hoat-dong" }, include: { items: { where: { status: "hoat-dong" }, orderBy: { position: "asc" } } } });
  const boChon = boKpi.map((b) => ({ ...b, chucDanh: b.jobTitle, maVaiTro: b.roleCode }));
  let soPhieu = 0;
  for (const n of nguoi) {
    const bo = chonBoKpi(boChon, { chucDanh: n.jobTitle, maVaiTro: n.user.userRoles.map((r) => r.role.code) });
    const chiTieu = bo?.items.length
      ? bo.items.map((c) => ({
          kpiItemId: c.id, name: c.name, weight: Number(c.weight), source: c.source, metric: c.metric, direction: c.direction,
          target: d.loai === "thang" ? (c.targetMonth === null ? null : Number(c.targetMonth)) : (c.targetQuarter === null ? null : Number(c.targetQuarter)),
        }))
      : [{ kpiItemId: null, name: "Đánh giá chung của quản lý", weight: 100, source: "thu-cong", metric: null, direction: "cao-tot", target: null }];
    const { kq, ctx } = await tinhPhieu(nc.tx, n.userId, d.loai, ky, chiTieu, ch.tranDatPhanTram);
    const p = await nc.tx.evaluation.create({
      data: {
        tenantId: nc.tenantId, periodId: kyMoi.id, userId: n.userId, kpiSetId: bo?.id ?? null, kpiSetName: bo?.name ?? null, managerId: n.managerId,
        context: ctx, metricsAt: new Date(),
        items: {
          create: chiTieu.map((c, i) => ({
            tenantId: nc.tenantId, kpiItemId: c.kpiItemId, position: i, name: c.name, weight: c.weight, source: c.source, metric: c.metric,
            direction: c.direction, target: c.target, actual: kq[i].actual, achievement: kq[i].achievement,
          })),
        },
      },
      select: { id: true },
    });
    soPhieu += 1;
    await baoQuaThongBao(nc.tx, nc.tenantId, n.userId, { loai: "danh-gia-mo", tieuDe: `Mở đánh giá ${ky.nhan}: mời bạn tự đánh giá`, noiDung: "Máy đã điền sẵn các chỉ tiêu tự tính. Ghi tự đánh giá và giải trình rồi gửi quản lý.", id: p.id, khoa: `danh-gia-mo:${p.id}` });
  }
  await nc.kiemToan({ action: "tao-ky-danh-gia", objectType: "evaluation_period", objectId: kyMoi.id, after: { ky: ky.nhan, soPhieu } });
  await nc.suKien({ eventType: SU_KIEN.EVALUATION_STEP, objectType: "evaluation_period", objectId: kyMoi.id, payload: { buoc: "mo-ky", soPhieu } });
  return { id: kyMoi.id, nhan: ky.nhan, soPhieu };
}

export async function danhSachKy(nc: NguCanh) {
  if (!coMotTrongCacQuyen(nc.hoSo, ["danh_gia.view", "nhan_su.view"])) throw new LoiThieuQuyen("danh_gia.view", { objectType: "evaluation_period" });
  const loc = await locNguoiDanhGia(nc);
  const ds = await nc.tx.evaluationPeriod.findMany({ orderBy: [{ year: "desc" }, { startDate: "desc" }], take: 36 });
  const kq = [];
  for (const k of ds) {
    const dem = await nc.tx.evaluation.groupBy({ by: ["status"], where: { periodId: k.id, ...loc }, _count: { _all: true } });
    kq.push({ id: k.id, loai: k.kind, nam: k.year, so: k.number, nhan: kyCuaBanGhi(k).nhan, tu: dateVeNgay(k.startDate), den: dateVeNgay(k.endDate), trangThai: k.status, dem: Object.fromEntries(dem.map((x) => [x.status, x._count._all])) as Record<string, number> });
  }
  return kq;
}

/** Phiếu trong một kỳ, theo phạm vi xem. */
export async function danhSachPhieu(nc: NguCanh, kyId: string) {
  batBuocQuyen(nc.hoSo, "danh_gia.view");
  const k = await nc.tx.evaluationPeriod.findFirst({ where: { id: kyId } });
  if (!k) throw new LoiKhongTimThay("Kỳ đánh giá");
  const ds = await nc.tx.evaluation.findMany({ where: { periodId: kyId, ...(await locNguoiDanhGia(nc)) }, include: { adjustments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const ten = await banDoTen(nc.tx, ds.flatMap((p) => [p.userId, p.managerId]));
  return {
    ky: { id: k.id, nhan: kyCuaBanGhi(k).nhan, tu: dateVeNgay(k.startDate), den: dateVeNgay(k.endDate) },
    phieu: ds
      .map((p) => {
        const dc = p.adjustments[0];
        return {
          id: p.id, nguoiId: p.userId, hoTen: ten.get(p.userId) ?? "—", quanLy: p.managerId ? (ten.get(p.managerId) ?? "—") : null, boKpi: p.kpiSetName,
          trangThai: p.status, tongDiem: dc ? Number(dc.newTotal) : p.totalScore === null ? null : Number(p.totalScore),
          xepLoai: dc?.newGrade ?? p.grade, heSoThuong: dc ? Number(dc.newBonusCoef) : p.bonusCoef === null ? null : Number(p.bonusCoef), daDieuChinh: !!dc,
        };
      })
      .sort((a, b) => a.hoTen.localeCompare(b.hoTen, "vi")),
  };
}

// ---------------------------------------------------------------------------
// Một phiếu
// ---------------------------------------------------------------------------

async function docPhieu(nc: NguCanh, id: string, khoa = false) {
  batBuocQuyen(nc.hoSo, "danh_gia.view", { objectType: "evaluation", objectId: id });
  const p0 = await nc.tx.evaluation.findFirst({ where: { AND: [{ id }, await locNguoiDanhGia(nc)] }, select: { id: true } });
  if (!p0) throw new LoiKhongTimThay("Phiếu đánh giá");
  if (khoa) await khoaChungTu(nc.tx, "evaluations", id);
  return nc.tx.evaluation.findUniqueOrThrow({
    where: { id },
    include: { period: true, items: { orderBy: { position: "asc" } }, adjustments: { orderBy: { createdAt: "asc" } } },
  });
}
type Phieu = Awaited<ReturnType<typeof docPhieu>>;

const so = (x: Prisma.Decimal | null) => (x === null ? null : Number(x));

/** Điểm chỉ tiêu hiệu lực: quản lý chấm (tay, hoặc đè số tự tính) → % đạt tự tính. Chặn trần. */
function diemChiTieu(c: Phieu["items"][number], tran: number): number | null {
  const d = c.managerScore !== null ? Number(c.managerScore) : c.source === "tu-dong" ? so(c.achievement) : null;
  return d === null ? null : Math.min(d, tran);
}

export async function chiTietPhieu(nc: NguCanh, id: string) {
  const p = await docPhieu(nc, id);
  const ch = await docCauHinhDanhGia(nc.tx);
  const ten = await banDoTen(nc.tx, [p.userId, p.managerId, p.scoredBy, p.finalizedBy, ...p.adjustments.map((a) => a.createdBy)]);
  const toi = nc.hoSo.userId;
  const tamTinh = tongDiemKpi(p.items.map((c) => ({ trongSo: Number(c.weight), diem: diemChiTieu(c, ch.tranDatPhanTram) })));
  const dc = p.adjustments[p.adjustments.length - 1];
  const laQuanLy = await chamDuoc(nc, p.userId);
  const laNguoiChot = await chotDuoc(nc, p.userId);
  return {
    phieu: {
      id: p.id, nguoiId: p.userId, hoTen: ten.get(p.userId) ?? "—", quanLy: p.managerId ? (ten.get(p.managerId) ?? "—") : null,
      ky: kyCuaBanGhi(p.period).nhan, kyId: p.periodId, boKpi: p.kpiSetName, trangThai: p.status, tuNhanXet: p.selfNote ?? "", tuGuiLuc: p.selfSubmittedAt,
      nhanXetQuanLy: p.managerComment ?? "", nguoiCham: p.scoredBy ? (ten.get(p.scoredBy) ?? "—") : null, chamLuc: p.scoredAt,
      tongDiem: so(p.totalScore), xepLoai: p.grade, heSoThuong: so(p.bonusCoef), nguoiChot: p.finalizedBy ? (ten.get(p.finalizedBy) ?? "—") : null,
      chotLuc: p.finalizedAt, ghiChuChot: p.finalizeNote ?? "", boiCanh: p.context, soLieuLuc: p.metricsAt,
      hieuLuc: dc ? { tongDiem: Number(dc.newTotal), xepLoai: dc.newGrade, heSoThuong: Number(dc.newBonusCoef) } : p.status === "da-chot" ? { tongDiem: so(p.totalScore), xepLoai: p.grade, heSoThuong: so(p.bonusCoef) } : null,
      tamTinh: tamTinh.tong !== null ? { tongDiem: tamTinh.tong, ...xepLoai(tamTinh.tong, xepLoaiTu(ch)) } : null,
      thieuDiem: tamTinh.thieu,
    },
    chiTieu: p.items.map((c) => ({
      id: c.id, ten: c.name, trongSo: Number(c.weight), nguon: c.source, chiSo: c.metric, donVi: c.metric && c.metric in CHI_SO ? CHI_SO[c.metric as MaChiSo].donVi : "", chieu: c.direction,
      mucTieu: so(c.target), thucTe: so(c.actual), phanTramDat: so(c.achievement), tuCham: so(c.selfScore), tuGhiChu: c.selfNote ?? "",
      quanLyCham: so(c.managerScore), quanLyGhiChu: c.managerNote ?? "", diem: diemChiTieu(c, ch.tranDatPhanTram),
    })),
    dieuChinh: p.adjustments.map((a) => ({ id: a.id, lyDo: a.reason, tongCu: so(a.oldTotal), tongMoi: Number(a.newTotal), loaiCu: a.oldGrade, loaiMoi: a.newGrade, heSoMoi: Number(a.newBonusCoef), nguoi: ten.get(a.createdBy) ?? "—", luc: a.createdAt, chiTieu: a.items })),
    tranPhanTram: ch.tranDatPhanTram,
    quyen: {
      tuDanhGia: p.userId === toi && p.status === "nhan-vien",
      quanLyCham: laQuanLy && ["nhan-vien", "quan-ly"].includes(p.status),
      chot: laNguoiChot && p.status === "cho-chot",
      dieuChinh: laNguoiChot && p.status === "da-chot",
      lamMoi: p.status !== "da-chot" && (p.userId === toi || laQuanLy || coQuyen(nc.hoSo, "nhan_su.update")),
    },
  };
}

export async function lamMoiSoLieu(nc: NguCanh, id: string) {
  const p = await docPhieu(nc, id, true);
  if (p.status === "da-chot") throw new LoiNghiepVu("Phiếu đã chốt — số liệu đã đóng băng.", 409, "da-chot");
  if (!(p.userId === nc.hoSo.userId || (await chamDuoc(nc, p.userId)) || coQuyen(nc.hoSo, "nhan_su.update"))) throw new LoiNghiepVu("Không được làm mới phiếu này.", 403, "khong-duoc");
  const ch = await docCauHinhDanhGia(nc.tx);
  const ky = kyCuaBanGhi(p.period);
  const { kq, ctx } = await tinhPhieu(nc.tx, p.userId, p.period.kind as LoaiKy, ky, p.items.map((c) => ({ metric: c.metric, source: c.source, direction: c.direction, target: so(c.target) })), ch.tranDatPhanTram);
  for (const [i, c] of p.items.entries()) {
    if (c.source === "tu-dong") await nc.tx.evaluationItem.update({ where: { id: c.id }, data: { actual: kq[i].actual, achievement: kq[i].achievement } });
  }
  await nc.tx.evaluation.update({ where: { id }, data: { context: ctx, metricsAt: new Date() } });
  await nc.kiemToan({ action: "lam-moi-so-lieu", objectType: "evaluation", objectId: id });
  return chiTietPhieu(nc, id);
}

const diemNhap = z.union([z.coerce.number().min(0, "Điểm từ 0.").max(200, "Điểm tối đa 200."), z.literal(""), z.null()]).transform((x) => (x === "" ? null : x)).optional();
export const LuocDoTuDanhGia = z.object({
  ghiChu: z.string().trim().max(5000).optional().default(""),
  chiTieu: z.array(z.object({ id: z.uuid(), diem: diemNhap, ghiChu: z.string().trim().max(2000).optional().default("") })).max(40).optional().default([]),
  nop: z.boolean().optional().default(false),
});
export const LuocDoQuanLyCham = z.object({
  nhanXet: z.string().trim().max(5000).optional().default(""),
  chiTieu: z.array(z.object({ id: z.uuid(), diem: diemNhap, ghiChu: z.string().trim().max(2000).optional().default("") })).max(40).optional().default([]),
  nop: z.boolean().optional().default(false),
});
export const LuocDoChot = z.object({ ghiChu: z.string().trim().max(2000).optional().default("") });
export const LuocDoDieuChinh = z.object({
  lyDo: z.string().trim().min(10, "Ghi lý do điều chỉnh (tối thiểu 10 ký tự).").max(2000),
  chiTieu: z.array(z.object({ id: z.uuid(), diem: z.coerce.number().min(0).max(200) })).min(1, "Chọn ít nhất một chỉ tiêu điều chỉnh.").max(40),
});

function batBuocChiTieuCuaPhieu(p: Phieu, ids: string[]) {
  const co = new Set(p.items.map((c) => c.id));
  for (const id of ids) if (!co.has(id)) throw new LoiKhongTimThay("Chỉ tiêu");
}

/** DG-62: nhân viên tự đánh giá (ghi chú chung + tự chấm / giải trình từng chỉ tiêu), gửi quản lý. */
export async function tuDanhGia(nc: NguCanh, id: string, d: z.infer<typeof LuocDoTuDanhGia>) {
  batBuocQuyen(nc.hoSo, "danh_gia.create", { objectType: "evaluation", objectId: id });
  const p = await docPhieu(nc, id, true);
  if (p.userId !== nc.hoSo.userId) throw new LoiNghiepVu("Chỉ người được đánh giá tự đánh giá.", 403, "khong-phai-cua-ban");
  if (p.status !== "nhan-vien") throw new LoiNghiepVu("Phiếu đã qua bước tự đánh giá.", 409, "sai-buoc");
  batBuocChiTieuCuaPhieu(p, d.chiTieu.map((c) => c.id));
  for (const c of d.chiTieu) await nc.tx.evaluationItem.update({ where: { id: c.id }, data: { selfScore: c.diem ?? null, selfNote: c.ghiChu || null } });
  const bayGio = new Date();
  await nc.tx.evaluation.update({ where: { id }, data: { selfNote: d.ghiChu || null, ...(d.nop && { status: "quan-ly", selfSubmittedAt: bayGio }) } });
  await nc.kiemToan({ action: "tu-danh-gia", objectType: "evaluation", objectId: id, after: { nop: d.nop } });
  if (d.nop) {
    await nc.suKien({ eventType: SU_KIEN.EVALUATION_STEP, objectType: "evaluation", objectId: id, payload: { buoc: "tu-danh-gia" } });
    await baoQuaThongBao(nc.tx, nc.tenantId, p.managerId, { loai: "danh-gia-cho-cham", tieuDe: `${nc.hoSo.hoTen} đã tự đánh giá ${kyCuaBanGhi(p.period).nhan} — mời bạn chấm`, id, khoa: `danh-gia-cho-cham:${id}` }, nc.hoSo.userId);
  }
  return chiTietPhieu(nc, id);
}

/** Người được thông báo phiếu chờ chốt: quản lý của người chấm (trưởng phòng) nếu có `danh_gia.approve`; không thì người có `danh_gia.approve` toàn công ty. */
async function nguoiChotDuKien(tx: ClientTenant, quanLyId: string | null): Promise<string[]> {
  if (quanLyId) {
    const tren = await tx.staffProfile.findFirst({ where: { userId: quanLyId }, select: { managerId: true } });
    if (tren?.managerId) {
      const co = await tx.rolePermission.count({ where: { status: "hoat-dong", permission: { code: "danh_gia.approve" }, role: { status: "hoat-dong", userRoles: { some: { userId: tren.managerId, status: "hoat-dong" } } } } });
      if (co) return [tren.managerId];
    }
  }
  const ds = await tx.user.findMany({
    where: { status: "hoat-dong", isSystem: false, userRoles: { some: { status: "hoat-dong", role: { status: "hoat-dong", rolePermissions: { some: { status: "hoat-dong", dataScope: "all", permission: { code: "danh_gia.approve" } } } } } } },
    select: { id: true },
  });
  return ds.map((x) => x.id);
}

/** DG-63: quản lý trực tiếp (hoặc `danh_gia.update` trong phạm vi) chấm chỉ tiêu tay + nhận xét; nộp → chờ chốt. */
export async function quanLyCham(nc: NguCanh, id: string, d: z.infer<typeof LuocDoQuanLyCham>) {
  const p = await docPhieu(nc, id, true);
  if (!(await chamDuoc(nc, p.userId))) throw new LoiNghiepVu("Chỉ quản lý trực tiếp hoặc người quản lý trong phạm vi chấm được phiếu này. Không ai tự chấm mình.", 403, "khong-duoc-cham");
  if (!["nhan-vien", "quan-ly"].includes(p.status)) throw new LoiNghiepVu("Phiếu đã gửi chốt hoặc đã chốt.", 409, "sai-buoc");
  batBuocChiTieuCuaPhieu(p, d.chiTieu.map((c) => c.id));
  for (const c of d.chiTieu) await nc.tx.evaluationItem.update({ where: { id: c.id }, data: { managerScore: c.diem ?? null, managerNote: c.ghiChu || null } });
  const bayGio = new Date();
  if (d.nop) {
    const ch = await docCauHinhDanhGia(nc.tx);
    const moi = await nc.tx.evaluationItem.findMany({ where: { evaluationId: id }, orderBy: { position: "asc" } });
    const thieu = moi.filter((c) => diemChiTieu(c, ch.tranDatPhanTram) === null);
    if (thieu.length) throw new LoiNghiepVu(`Còn chỉ tiêu chưa có điểm: ${thieu.map((c) => `“${c.name}”`).join(", ")}. Chấm tay các chỉ tiêu này (chỉ tiêu tự tính thiếu mục tiêu / số liệu cũng chấm tay).`, 422, "thieu-diem");
  }
  await nc.tx.evaluation.update({
    where: { id },
    data: { managerComment: d.nhanXet || null, scoredBy: nc.hoSo.userId, scoredAt: bayGio, ...(d.nop ? { status: "cho-chot" } : { status: p.status === "nhan-vien" ? "nhan-vien" : "quan-ly" }) },
  });
  await nc.kiemToan({ action: "quan-ly-cham", objectType: "evaluation", objectId: id, after: { nop: d.nop, chiTieu: d.chiTieu } });
  if (d.nop) {
    await nc.suKien({ eventType: SU_KIEN.EVALUATION_STEP, objectType: "evaluation", objectId: id, payload: { buoc: "quan-ly-cham" } });
    for (const n of await nguoiChotDuKien(nc.tx, nc.hoSo.userId)) {
      await baoQuaThongBao(nc.tx, nc.tenantId, n, { loai: "danh-gia-cho-chot", tieuDe: `Phiếu đánh giá ${kyCuaBanGhi(p.period).nhan} chờ chốt`, noiDung: `${nc.hoSo.hoTen} đã chấm xong.`, id, khoa: `danh-gia-cho-chot:${id}` }, p.userId);
    }
    await baoQuaThongBao(nc.tx, nc.tenantId, p.userId, { loai: "danh-gia-da-cham", tieuDe: `Quản lý đã chấm phiếu đánh giá ${kyCuaBanGhi(p.period).nhan}`, id, khoa: `danh-gia-da-cham:${id}` }, nc.hoSo.userId);
  }
  return chiTietPhieu(nc, id);
}

/** DG-64, DG-65: chốt — điểm tổng, xếp loại, hệ số thưởng; sau đó bất biến. Khóa dòng phiếu: chốt hai lần → 409. */
export async function chotPhieu(nc: NguCanh, id: string, d: z.infer<typeof LuocDoChot>) {
  const p = await docPhieu(nc, id, true);
  if (!(await chotDuoc(nc, p.userId))) throw new LoiNghiepVu("Chỉ trưởng phòng / giám đốc có quyền chốt (trong phạm vi) chốt được phiếu này. Không ai tự chốt phiếu của mình.", 403, "khong-duoc-chot");
  if (p.status === "da-chot") throw new LoiNghiepVu("Phiếu đã chốt.", 409, "da-chot");
  if (p.status !== "cho-chot") throw new LoiNghiepVu("Quản lý chưa chấm xong phiếu này.", 409, "sai-buoc");
  const ch = await docCauHinhDanhGia(nc.tx);
  const bang = xepLoaiTu(ch);
  if (!bangXepLoaiHopLe(bang)) throw new LoiNghiepVu("Bảng xếp loại trong Cấu hình chưa hợp lệ (ngưỡng A > B > C).", 422, "bang-xep-loai");
  const t = tongDiemKpi(p.items.map((c) => ({ trongSo: Number(c.weight), diem: diemChiTieu(c, ch.tranDatPhanTram) })));
  if (t.tong === null) throw new LoiNghiepVu("Còn chỉ tiêu chưa có điểm.", 422, "thieu-diem");
  const xl = xepLoai(t.tong, bang);
  const bayGio = new Date();
  await nc.tx.evaluation.update({
    where: { id },
    data: { status: "da-chot", totalScore: t.tong, grade: xl.loai, bonusCoef: xl.heSoThuong, finalizedBy: nc.hoSo.userId, finalizedAt: bayGio, finalizeNote: d.ghiChu || null },
  });
  await nc.kiemToan({ action: "chot-danh-gia", objectType: "evaluation", objectId: id, after: { tongDiem: t.tong, xepLoai: xl.loai, heSoThuong: xl.heSoThuong } });
  await nc.suKien({ eventType: SU_KIEN.EVALUATION_FINALIZED, objectType: "evaluation", objectId: id, payload: { xepLoai: xl.loai } });
  const nd = `Điểm ${t.tong} — loại ${xl.loai}, hệ số thưởng ${xl.heSoThuong}.`;
  await baoQuaThongBao(nc.tx, nc.tenantId, p.userId, { loai: "danh-gia-da-chot", tieuDe: `Kết quả đánh giá ${kyCuaBanGhi(p.period).nhan} đã chốt`, noiDung: nd, id, khoa: `danh-gia-chot:${id}` }, nc.hoSo.userId);
  await baoQuaThongBao(nc.tx, nc.tenantId, p.managerId, { loai: "danh-gia-da-chot", tieuDe: `Đã chốt đánh giá ${kyCuaBanGhi(p.period).nhan}`, noiDung: nd, id, khoa: `danh-gia-chot-ql:${id}` }, nc.hoSo.userId);
  return chiTietPhieu(nc, id);
}

/**
 * DG-67: phiên điều chỉnh sau khi chốt — đổi điểm một số chỉ tiêu kèm lý do, tính lại tổng / xếp loại / hệ
 * số; ghi thêm một dòng (phiếu gốc không đổi). Lần điều chỉnh sau tính tiếp từ lần trước.
 */
export async function dieuChinhPhieu(nc: NguCanh, id: string, d: z.infer<typeof LuocDoDieuChinh>) {
  const p = await docPhieu(nc, id, true);
  if (!(await chotDuoc(nc, p.userId))) throw new LoiNghiepVu("Chỉ người có quyền chốt (trong phạm vi) điều chỉnh được.", 403, "khong-duoc-chot");
  if (p.status !== "da-chot") throw new LoiNghiepVu("Phiếu chưa chốt — sửa trực tiếp ở bước chấm.", 409, "chua-chot");
  batBuocChiTieuCuaPhieu(p, d.chiTieu.map((c) => c.id));
  const ch = await docCauHinhDanhGia(nc.tx);
  const truoc = p.adjustments[p.adjustments.length - 1];
  const diemTruoc = new Map<string, number | null>(p.items.map((c) => [c.id, diemChiTieu(c, ch.tranDatPhanTram)]));
  if (truoc && Array.isArray(truoc.items)) for (const x of truoc.items as { id: string; diem: number }[]) diemTruoc.set(x.id, x.diem);
  for (const c of d.chiTieu) diemTruoc.set(c.id, Math.min(c.diem, ch.tranDatPhanTram));
  const t = tongDiemKpi(p.items.map((c) => ({ trongSo: Number(c.weight), diem: diemTruoc.get(c.id) ?? null })));
  if (t.tong === null) throw new LoiNghiepVu("Còn chỉ tiêu chưa có điểm.", 422, "thieu-diem");
  const xl = xepLoai(t.tong, xepLoaiTu(ch));
  const oldTotal = truoc ? Number(truoc.newTotal) : so(p.totalScore);
  const oldGrade = truoc ? truoc.newGrade : p.grade;
  const items = p.items.map((c) => ({ id: c.id, ten: c.name, diem: diemTruoc.get(c.id) ?? 0 }));
  await nc.tx.evaluationAdjustment.create({
    data: { tenantId: nc.tenantId, evaluationId: id, reason: d.lyDo, items, oldTotal, newTotal: t.tong, oldGrade, newGrade: xl.loai, newBonusCoef: xl.heSoThuong, createdBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "dieu-chinh-danh-gia", objectType: "evaluation", objectId: id, before: { tongDiem: oldTotal, xepLoai: oldGrade }, after: { tongDiem: t.tong, xepLoai: xl.loai, lyDo: d.lyDo } });
  await nc.suKien({ eventType: SU_KIEN.EVALUATION_ADJUSTED, objectType: "evaluation", objectId: id });
  await baoQuaThongBao(nc.tx, nc.tenantId, p.userId, { loai: "danh-gia-dieu-chinh", tieuDe: `Kết quả đánh giá ${kyCuaBanGhi(p.period).nhan} được điều chỉnh`, noiDung: `${oldTotal ?? "—"} → ${t.tong} (loại ${xl.loai}). Lý do: ${d.lyDo.slice(0, 300)}`, id, khoa: `danh-gia-dc:${id}:${Date.now()}` }, nc.hoSo.userId);
  return chiTietPhieu(nc, id);
}

/** Kết quả hiệu lực (đã chốt, sau điều chỉnh) — cho bảng lương giai đoạn 3. */
export function ketQuaHieuLuc(p: { status: string; totalScore: Prisma.Decimal | null; grade: string | null; bonusCoef: Prisma.Decimal | null; adjustments: { newTotal: Prisma.Decimal; newGrade: string; newBonusCoef: Prisma.Decimal }[] }) {
  if (p.status !== "da-chot") return null;
  const dc = p.adjustments[p.adjustments.length - 1];
  return dc ? { tongDiem: lamTron2(Number(dc.newTotal)), xepLoai: dc.newGrade, heSoThuong: Number(dc.newBonusCoef) } : { tongDiem: so(p.totalScore), xepLoai: p.grade, heSoThuong: so(p.bonusCoef) };
}

/** Phiếu đánh giá của chính mình (mọi kỳ). */
export async function phieuCuaToi(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "danh_gia.view");
  const ds = await nc.tx.evaluation.findMany({
    where: { userId: nc.hoSo.userId },
    include: { period: true, adjustments: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  return ds.map((p) => ({ id: p.id, ky: kyCuaBanGhi(p.period).nhan, trangThai: p.status, ketQua: ketQuaHieuLuc({ ...p, adjustments: p.adjustments }) }));
}
