import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { boDau } from "@/modules/crm/chuan-hoa";
import { homNayVN, locTheoPhamVi } from "@/modules/crm/chung";
import { congNgay } from "@/modules/nhac-viec/tinh-toan";
import { dauNgayVN } from "@/lib/dinh-dang";
import { NHAN_MOC, type MaMoc } from "./moc";
import { coTuChuyen, tinhPheu } from "./tinh-toan";
import type { DuLieuDoiHanhTrinh, DuLieuSuaTrangThaiHanhTrinh, DuLieuTrangThaiHanhTrinh } from "./luoc-do";

/**
 * Hành trình khách hàng — BUSINESS_RULES.md mục 21 (KHN-01 → KHN-06).
 *
 * Trạng thái hành trình là danh mục riêng của doanh nghiệp, KHÁC `customers.status`
 * (đang/ngừng giao dịch). Mọi lần đổi — tay hay tự động — đi qua đúng một hàm
 * `ghiDoiHanhTrinh()`, hàm này ghi lịch sử chỉ-ghi-thêm, Audit Log và Business Event.
 *
 * Quyền: xem theo `customer.view`; đổi trạng thái của một khách theo `customer.update` (trong
 * phạm vi); sắp xếp danh mục trạng thái cần `customer.approve` (quản lý).
 */

const CHON_TRANG_THAI = {
  id: true,
  code: true,
  name: true,
  color: true,
  sortOrder: true,
  kind: true,
  staleDays: true,
  autoMilestone: true,
  status: true,
} as const;

function trangThaiRa(t: {
  id: string;
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  kind: string;
  staleDays: number | null;
  autoMilestone: string | null;
  status: string;
}) {
  return {
    id: t.id,
    ma: t.code,
    ten: t.name,
    mau: t.color,
    thuTu: t.sortOrder,
    loai: t.kind,
    soNgayDungLau: t.staleDays,
    mocTuDong: t.autoMilestone,
    nhanMoc: t.autoMilestone ? (NHAN_MOC[t.autoMilestone] ?? t.autoMilestone) : null,
    trangThai: t.status,
  };
}
export type TrangThaiHanhTrinh = ReturnType<typeof trangThaiRa>;

/** Danh mục trạng thái (kể cả đã ngừng) — dùng nội bộ, không kiểm quyền. */
export async function docDanhMucTrangThai(tx: ClientTenant) {
  const ds = await tx.customerJourneyStage.findMany({ select: CHON_TRANG_THAI, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return ds.map(trangThaiRa);
}

export async function danhSachTrangThaiHanhTrinh(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "customer.view");
  return docDanhMucTrangThai(nc.tx);
}

// ---------------------------------------------------------------------------
// Danh mục trạng thái — quản lý (customer.approve)
// ---------------------------------------------------------------------------

function taoMa(ten: string): string {
  const m = boDau(ten)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return m || "trang-thai";
}

async function maChuaDung(tx: ClientTenant, goc: string): Promise<string> {
  const daCo = new Set((await tx.customerJourneyStage.findMany({ where: { code: { startsWith: goc } }, select: { code: true } })).map((x) => x.code));
  if (!daCo.has(goc)) return goc;
  for (let i = 2; i < 1000; i++) if (!daCo.has(`${goc}-${i}`)) return `${goc}-${i}`;
  return `${goc}-${Date.now().toString(36)}`;
}

function loiMoc(loi: unknown): never {
  if (laLoiTrung(loi)) throw new LoiNghiepVu("Mốc tự chuyển này đã gắn cho một trạng thái khác — mỗi mốc chỉ gắn một trạng thái.", 409, "trung-moc");
  throw loi;
}

function kiemTraLoaiVaMoc(loai: string, moc: string | null, soNgay: number | null) {
  if (loai === "that-bai" && moc) throw new LoiNghiepVu("Trạng thái thất bại không nhận mốc tự chuyển (KHN-03).", 422, "moc-that-bai");
  if (loai === "that-bai" && soNgay !== null) throw new LoiNghiepVu("Trạng thái thất bại không nhắc đứng lâu (KHN-14).", 422, "dung-lau-that-bai");
}

export async function taoTrangThaiHanhTrinh(nc: NguCanh, d: DuLieuTrangThaiHanhTrinh) {
  batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "journey_stage" });
  kiemTraLoaiVaMoc(d.loai, d.mocTuDong, d.soNgayDungLau);
  const cuoi = await nc.tx.customerJourneyStage.aggregate({ _max: { sortOrder: true } });
  try {
    const t = await nc.tx.customerJourneyStage.create({
      data: {
        tenantId: nc.tenantId,
        code: await maChuaDung(nc.tx, taoMa(d.ten)),
        name: d.ten,
        color: d.mau,
        kind: d.loai,
        staleDays: d.soNgayDungLau,
        autoMilestone: d.mocTuDong,
        sortOrder: (cuoi._max.sortOrder ?? 0) + 1,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: CHON_TRANG_THAI,
    });
    const kq = trangThaiRa(t);
    await nc.kiemToan({ action: "tao", objectType: "journey_stage", objectId: t.id, after: kq });
    await nc.suKien({ eventType: SU_KIEN.JOURNEY_STAGE_CHANGED, objectType: "journey_stage", objectId: t.id, payload: { viec: "tao" } });
    return kq;
  } catch (loi) {
    loiMoc(loi);
  }
}

export async function suaTrangThaiHanhTrinh(nc: NguCanh, id: string, d: DuLieuSuaTrangThaiHanhTrinh) {
  batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "journey_stage", objectId: id });
  const goc = await nc.tx.customerJourneyStage.findFirst({ where: { id }, select: CHON_TRANG_THAI });
  if (!goc) throw new LoiKhongTimThay("Trạng thái hành trình");
  const truoc = trangThaiRa(goc);
  const loai = d.loai ?? truoc.loai;
  const moc = d.mocTuDong !== undefined ? d.mocTuDong : truoc.mocTuDong;
  const soNgay = d.soNgayDungLau !== undefined ? d.soNgayDungLau : truoc.soNgayDungLau;
  kiemTraLoaiVaMoc(loai, moc, soNgay);
  if (d.trangThai === "ngung-hoat-dong" && truoc.trangThai !== "ngung-hoat-dong") {
    const con = await nc.tx.customer.count({ where: { journeyStageId: id, status: { not: "da-gop" } } });
    if (con > 0) {
      throw new LoiNghiepVu(
        `Còn ${con} khách đang ở trạng thái "${truoc.ten}". Chuyển họ sang trạng thái khác trước (lọc theo trạng thái rồi đổi hàng loạt).`,
        409,
        "con-khach",
        { soKhach: con },
      );
    }
  }
  try {
    const t = await nc.tx.customerJourneyStage.update({
      where: { id },
      data: {
        ...(d.ten !== undefined && { name: d.ten }),
        ...(d.mau !== undefined && { color: d.mau }),
        kind: loai,
        staleDays: soNgay,
        // Ngừng dùng thì gỡ mốc: trạng thái đã tắt không được nhận khách tự động.
        autoMilestone: d.trangThai === "ngung-hoat-dong" ? null : moc,
        ...(d.trangThai !== undefined && { status: d.trangThai }),
        updatedBy: nc.hoSo.userId,
      },
      select: CHON_TRANG_THAI,
    });
    const sau = trangThaiRa(t);
    await nc.kiemToan({ action: "sua", objectType: "journey_stage", objectId: id, before: truoc, after: sau });
    await nc.suKien({ eventType: SU_KIEN.JOURNEY_STAGE_CHANGED, objectType: "journey_stage", objectId: id, payload: { viec: "sua" } });
    return sau;
  } catch (loi) {
    loiMoc(loi);
  }
}

/** Kéo thả / lên xuống: lưu thứ tự mới của TOÀN BỘ danh mục (danh sách phải đủ, không thừa). */
export async function xepThuTuTrangThai(nc: NguCanh, ids: string[]) {
  batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "journey_stage" });
  const hienCo = await nc.tx.customerJourneyStage.findMany({ select: { id: true, sortOrder: true } });
  const tap = new Set(hienCo.map((t) => t.id));
  if (new Set(ids).size !== ids.length || ids.length !== tap.size || ids.some((i) => !tap.has(i))) {
    throw new LoiNghiepVu("Danh sách sắp xếp phải gồm đủ mọi trạng thái, mỗi trạng thái một lần. Tải lại trang rồi thử lại.", 409, "lech-danh-sach");
  }
  for (const [i, id] of ids.entries()) {
    await nc.tx.customerJourneyStage.update({ where: { id }, data: { sortOrder: i + 1, updatedBy: nc.hoSo.userId } });
  }
  await nc.kiemToan({
    action: "sua",
    objectType: "journey_stage",
    before: { thuTu: [...hienCo].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => t.id) },
    after: { thuTu: ids },
  });
  await nc.suKien({ eventType: SU_KIEN.JOURNEY_STAGE_CHANGED, objectType: "journey_stage", payload: { viec: "xep-thu-tu" } });
  return docDanhMucTrangThai(nc.tx);
}

// ---------------------------------------------------------------------------
// Đổi trạng thái của một khách
// ---------------------------------------------------------------------------

interface TuyChonGhi {
  tuDong?: boolean;
  moc?: MaMoc | null;
  ghiChu?: string | null;
}

/**
 * Cửa DUY NHẤT ghi đổi trạng thái hành trình (KHN-02). Ghi `customers`, một dòng lịch sử
 * chỉ-ghi-thêm, Audit Log và Business Event. Không kiểm quyền — người gọi đã kiểm.
 */
export async function ghiDoiHanhTrinh(
  nc: NguCanh,
  khach: { id: string; journeyStageId: string | null },
  sangId: string,
  tc: TuyChonGhi = {},
): Promise<boolean> {
  if (khach.journeyStageId === sangId) return false;
  const luc = new Date();
  await nc.tx.customer.update({
    where: { id: khach.id },
    data: { journeyStageId: sangId, journeyStageChangedAt: luc, updatedBy: nc.hoSo.userId },
  });
  await nc.tx.customerJourneyHistory.create({
    data: {
      tenantId: nc.tenantId,
      customerId: khach.id,
      fromStageId: khach.journeyStageId,
      toStageId: sangId,
      isAuto: Boolean(tc.tuDong),
      milestone: tc.moc ?? null,
      note: tc.ghiChu ?? null,
      changedBy: nc.hoSo.userId,
      createdAt: luc,
    },
  });
  await nc.kiemToan({
    action: tc.tuDong ? "tu-chuyen-hanh-trinh" : "doi-hanh-trinh",
    objectType: "customer",
    objectId: khach.id,
    before: { trangThaiHanhTrinhId: khach.journeyStageId },
    after: { trangThaiHanhTrinhId: sangId, ...(tc.moc && { moc: tc.moc }), ...(tc.ghiChu && { ghiChu: tc.ghiChu }) },
  });
  await nc.suKien({
    eventType: SU_KIEN.CUSTOMER_JOURNEY_CHANGED,
    objectType: "customer",
    objectId: khach.id,
    payload: { tu: khach.journeyStageId, sang: sangId, tuDong: Boolean(tc.tuDong), moc: tc.moc ?? null },
  });
  return true;
}

/** Người dùng đổi trạng thái hành trình của một khách — `customer.update` trong phạm vi. */
export async function doiHanhTrinh(nc: NguCanh, khachId: string, d: DuLieuDoiHanhTrinh, tc: { ghiChuMacDinh?: string } = {}) {
  batBuocQuyen(nc.hoSo, "customer.update", { objectType: "customer", objectId: khachId });
  const k = await nc.tx.customer.findFirst({
    where: { id: khachId, ...(await locTheoPhamVi(nc, "customer.update")) },
    select: { id: true, journeyStageId: true, status: true, code: true },
  });
  if (!k) throw new LoiKhongTimThay("Khách hàng");
  if (k.status === "da-gop") throw new LoiNghiepVu(`Khách ${k.code} đã được gộp vào khách khác — không đổi được nữa (KHN-13).`, 409, "da-gop");
  const t = await nc.tx.customerJourneyStage.findFirst({ where: { id: d.trangThaiId }, select: { id: true, status: true } });
  if (!t) throw new LoiKhongTimThay("Trạng thái hành trình");
  if (t.status !== "hoat-dong" && t.id !== k.journeyStageId) throw new LoiNghiepVu("Trạng thái này đã ngừng dùng.", 422, "trang-thai-ngung");
  const doi = await ghiDoiHanhTrinh(nc, k, t.id, { ghiChu: d.ghiChu ?? tc.ghiChuMacDinh ?? null });
  return { id: k.id, trangThaiHanhTrinhId: t.id, daDoi: doi };
}

/**
 * Tự chuyển bước theo mốc nghiệp vụ (KHN-04) — gọi từ service của cơ hội, báo giá, đơn hàng,
 * khách hàng ngay trong giao dịch của thao tác gây ra mốc. Không kiểm quyền riêng: đó là hệ
 * quả của một thao tác người dùng đã được phép làm. Mốc chưa gắn trạng thái nào → bỏ qua.
 */
export async function tuChuyenHanhTrinh(nc: NguCanh, khachId: string, moc: MaMoc): Promise<boolean> {
  const dich = await nc.tx.customerJourneyStage.findFirst({
    where: { autoMilestone: moc, status: "hoat-dong" },
    select: { id: true, sortOrder: true, kind: true },
  });
  if (!dich) return false;
  const k = await nc.tx.customer.findFirst({
    where: { id: khachId },
    select: { id: true, status: true, journeyStageId: true, journeyStage: { select: { id: true, sortOrder: true, kind: true } } },
  });
  if (!k || k.status === "da-gop") return false;
  if (!coTuChuyen(k.journeyStage, dich, moc)) return false;
  return ghiDoiHanhTrinh(nc, k, dich.id, { tuDong: true, moc });
}

/** Lịch sử hành trình của một khách — người gọi đã kiểm khách nằm trong phạm vi xem. */
export async function lichSuHanhTrinh(nc: NguCanh, khachId: string) {
  const ds = await nc.tx.customerJourneyHistory.findMany({
    where: { customerId: khachId },
    select: {
      id: true, isAuto: true, milestone: true, note: true, createdAt: true, changedBy: true,
      fromStage: { select: { name: true, color: true } },
      toStage: { select: { name: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const nguoi = await nc.tx.user.findMany({
    where: { id: { in: [...new Set(ds.map((d) => d.changedBy).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, fullName: true },
  });
  const ten = new Map(nguoi.map((u) => [u.id, u.fullName]));
  return ds.map((d) => ({
    id: d.id,
    tu: d.fromStage ? { ten: d.fromStage.name, mau: d.fromStage.color } : null,
    sang: d.toStage ? { ten: d.toStage.name, mau: d.toStage.color } : null,
    tuDong: d.isAuto,
    moc: d.milestone ? (NHAN_MOC[d.milestone] ?? d.milestone) : null,
    ghiChu: d.note,
    luc: d.createdAt,
    nguoi: d.changedBy ? (ten.get(d.changedBy) ?? "—") : "Hệ thống",
  }));
}

// ---------------------------------------------------------------------------
// Tổng quan hành trình + phễu chuyển đổi (KHN-06)
// ---------------------------------------------------------------------------

export async function tongQuanHanhTrinh(nc: NguCanh, d: { tu?: string; den?: string; nguoiPhuTrach?: string }) {
  batBuocQuyen(nc.hoSo, "customer.view");
  const den = d.den ?? homNayVN();
  const tu = d.tu ?? congNgay(den, -89);
  if (tu > den) throw new LoiNghiepVu("Khoảng ngày không hợp lệ: ngày bắt đầu sau ngày kết thúc.", 400, "khoang-ngay");
  const phamVi = await locTheoPhamVi(nc, "customer.view");
  const loc = { ...phamVi, status: { not: "da-gop" }, ...(d.nguoiPhuTrach && { AND: [{ ownerId: d.nguoiPhuTrach }] }) };

  const [danhMuc, demNhom] = await Promise.all([
    docDanhMucTrangThai(nc.tx),
    nc.tx.customer.groupBy({ by: ["journeyStageId"], where: loc, _count: { _all: true } }),
  ]);
  const dem = new Map(demNhom.map((g) => [g.journeyStageId ?? "", g._count._all]));
  const tong = [...dem.values()].reduce((s, n) => s + n, 0);

  // Nhịp di chuyển 30 ngày: số khách được chuyển VÀO từng trạng thái.
  const moc30 = new Date(Date.now() - 30 * 86_400_000);
  const vao = await nc.tx.customerJourneyHistory.groupBy({
    by: ["toStageId"],
    where: { createdAt: { gte: moc30 }, customer: loc },
    _count: { _all: true },
  });
  const demVao = new Map(vao.map((v) => [v.toStageId ?? "", v._count._all]));

  // Phễu: khách TẠO trong kỳ, đi theo lịch sử của họ.
  const tuLuc = dauNgayVN(tu)!;
  const denLuc = dauNgayVN(congNgay(den, 1))!;
  const cohort = await nc.tx.customer.findMany({
    where: { ...loc, createdAt: { gte: tuLuc, lt: denLuc } },
    select: {
      id: true, createdAt: true, journeyStageId: true,
      journeyHistory: { select: { toStageId: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
    take: 20_000,
  });
  const pheu = tinhPheu(
    danhMuc.map((t) => ({ id: t.id, ten: t.ten, sortOrder: t.thuTu, kind: t.loai })),
    cohort.map((c) => ({
      id: c.id,
      taoLuc: c.createdAt,
      hienTaiId: c.journeyStageId,
      lichSu: c.journeyHistory.map((h) => ({ sangId: h.toStageId, luc: h.createdAt })),
    })),
  );

  return {
    tu,
    den,
    tong,
    chuaCo: dem.get("") ?? 0,
    trangThai: danhMuc.map((t) => ({ ...t, soKhach: dem.get(t.id) ?? 0, vao30Ngay: demVao.get(t.id) ?? 0 })),
    pheu,
    quyen: { quanLy: coQuyen(nc.hoSo, "customer.approve") },
  };
}
