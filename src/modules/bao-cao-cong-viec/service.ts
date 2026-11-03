import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { voiTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { dinhDangNgayGio, dinhDangTien } from "@/lib/dinh-dang";
import { banDoTen, lichCuaNhieuNguoi, nghiDaDuyet, ngayLeTrongKhoang } from "@/modules/cham-cong/chung";
import { cacNgayTrongKhoang, congDuKien, congNgay, laNgayHopLe, mocVN } from "@/modules/cham-cong/tinh-toan";
import { dateVeNgay, homNayVN, ngayVeDate, thoiDiemTuyChon, uuidTuyChon } from "@/modules/crm/chung";
import { taoThongBao } from "@/modules/thong-bao/service";
import { taoViec } from "@/modules/cong-viec/service";
import { baoCaoTu, chamDuoc, docCauHinhDanhGia, locNguoiDanhGia, nguoiXemDuocDanhGia, xemDuocDanhGiaCua } from "@/modules/danh-gia/chung";
import { napBanDoCapTren } from "@/modules/danh-gia/cap-tren";
import { tinhChiSo } from "@/modules/danh-gia/chi-so";
import {
  denLucNhac,
  hanBaoCao,
  kyBaoCao,
  laNgayPhaiBaoCaoNgay,
  LOAI_BAO_CAO,
  NHAN_LOAI_BAO_CAO,
  tinhTrangBaoCao,
  type CauHinhBaoCao,
  type LoaiBaoCao,
} from "@/modules/danh-gia/tinh-toan";

/**
 * Báo cáo ngày / tuần (0.20.0, DG-40 → DG-45). Mẫu ba phần: Đã làm · Sẽ làm · Vướng mắc. Máy điền sẵn
 * việc đã xong / đang làm / sắp tới hạn và số liệu tự tính; người viết bổ sung nhận định rồi nộp.
 * Đã nộp thì bất biến (trigger `work_reports_da_nop`); nộp trễ / thiếu ghi để đánh giá tháng, không phạt tiền.
 *
 * Ai phải nộp (DG-41, QĐ-132): mọi người đang hoạt động có hồ sơ nhân sự, không phải thực tập sinh (thực
 * tập sinh viết nhật ký tuần — DG-70), **kể cả người không có quản lý trực tiếp** (người nhận = Giám đốc).
 * Người giữ vai trò Giám đốc không phải nộp, trừ khi Cấu hình `bao_cao.giam_doc_phai_bao_cao` = 1. Báo cáo
 * tuần bắt buộc; báo cáo ngày chỉ khi phòng bật `daily_report` và chỉ vào **ngày phải làm** (QĐ-138). Ai cũng
 * tự viết thêm được (không bắt buộc).
 */

export const LuocDoBaoCao = z.object({
  loai: z.enum(LOAI_BAO_CAO),
  /** Một ngày bất kỳ trong kỳ (yyyy-mm-dd, giờ VN). Trống = hôm nay. */
  ngay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  daLam: z.string().trim().max(10000).optional().default(""),
  seLam: z.string().trim().max(10000).optional().default(""),
  vuongMac: z.string().trim().max(10000).optional().default(""),
  nop: z.boolean().optional().default(false),
});
export const LuocDoNhanXet = z.object({ noiDung: z.string().trim().min(2, "Nhận xét tối thiểu 2 ký tự.").max(5000) });
export const LuocDoChuyenViec = z.object({
  tieuDe: z.string().trim().min(3).max(255),
  moTa: z.string().trim().max(5000).optional().default(""),
  nguoiPhuTrachId: uuidTuyChon,
  han: thoiDiemTuyChon,
});

function kyCua(loai: LoaiBaoCao, ngay?: string) {
  const n = ngay ?? homNayVN();
  if (!laNgayHopLe(n)) throw new LoiNghiepVu("Ngày không hợp lệ.", 400, "ngay-sai");
  return kyBaoCao(loai, n);
}

// ---------------------------------------------------------------------------
// Ai phải nộp
// ---------------------------------------------------------------------------

export interface NguoiPhaiBaoCao {
  id: string;
  hoTen: string;
  /** Người nhận / xét báo cáo: quản lý hiệu lực (quản lý trực tiếp còn hoạt động → cấp trên → Giám đốc). */
  quanLyId: string | null;
  phaiTuan: boolean;
  phaiNgay: boolean;
  /** Ngày vào làm (yyyy-mm-dd, "" = không rõ). Kỳ kết thúc trước ngày này không bắt buộc (QA 0.20.0). */
  vaoLam: string;
}

export async function nguoiPhaiBaoCao(tx: ClientTenant, chiNguoi?: string[]): Promise<NguoiPhaiBaoCao[]> {
  const ds = await tx.staffProfile.findMany({
    where: {
      staffType: { not: "thuc-tap" },
      user: { status: "hoat-dong", isSystem: false },
      ...(chiNguoi && { userId: { in: chiNguoi } }),
    },
    select: { userId: true, hiredAt: true, user: { select: { fullName: true } }, department: { select: { dailyReport: true } } },
  });
  if (ds.length === 0) return [];
  const bd = await napBanDoCapTren(tx);
  const giamDocBaoCao = (await docCauHinhDanhGia(tx)).giamDocPhaiBaoCao === 1;
  return ds
    .filter((d) => giamDocBaoCao || !bd.laGiamDoc(d.userId))
    .map((d) => ({ id: d.userId, hoTen: d.user.fullName, quanLyId: bd.quanLyHieuLuc(d.userId), phaiTuan: true, phaiNgay: !!d.department?.dailyReport, vaoLam: dateVeNgay(d.hiredAt) }));
}

/**
 * QĐ-138: hàm (người, ngày) → ngày đó người đó có phải nộp báo cáo ngày không — đọc lịch làm việc, ngày lễ,
 * nghỉ phép đã duyệt (0.19.0) cho cả khoảng [tu, den] một lần.
 */
export async function boLocNgayPhaiBaoCao(tx: ClientTenant, userIds: string[], tu: string, den: string): Promise<(userId: string, ngay: string) => boolean> {
  if (userIds.length === 0) return () => false;
  const lich = await lichCuaNhieuNguoi(tx, userIds, den);
  const le = await ngayLeTrongKhoang(tx, tu, den);
  const nghi = await nghiDaDuyet(tx, userIds, tu, den);
  return (userId, ngay) => {
    const l = lich.get(userId)?.(ngay) ?? null;
    const cd = congDuKien(ngay, l?.ca ?? null, l?.ngay ?? null, le.has(ngay));
    return laNgayPhaiBaoCaoNgay({ coLich: cd.coLich, congDuKien: cd.giaTri, laNgayLe: le.has(ngay), nghiPhep: nghi.get(userId)?.get(ngay)?.giaTri ?? 0 });
  };
}

/** Kỳ [.., den] có bắt buộc với người này không: kỳ kết thúc trước ngày vào làm thì không (không tính "thiếu"). */
export function batBuocTrongKy(p: Pick<NguoiPhaiBaoCao, "vaoLam">, den: string): boolean {
  return !p.vaoLam || den >= p.vaoLam;
}

// ---------------------------------------------------------------------------
// Điền sẵn
// ---------------------------------------------------------------------------

function tienHayKhong(x: number | null) {
  return x === null ? "—" : dinhDangTien(x);
}

/** Việc + số liệu tự tính cho kỳ [tu, den] của một người. Chụp lại vào `auto_data` lúc nộp. */
export async function duLieuTuDong(tx: ClientTenant, userId: string, loai: LoaiBaoCao, tu: string, den: string) {
  const batDau = mocVN(tu, 0);
  const ketThuc = mocVN(congNgay(den, 1), 0);
  const sapToi = mocVN(congNgay(den, loai === "tuan" ? 8 : 2), 0);
  const chon = { id: true, title: true, dueAt: true, status: true, progress: true } as const;
  const xong = await tx.task.findMany({ where: { ownerId: userId, OR: [{ completedAt: { gte: batDau, lt: ketThuc } }, { status: "cho-duyet", submittedAt: { gte: batDau, lt: ketThuc } }] }, select: chon, orderBy: { completedAt: "asc" }, take: 50 });
  const dangLam = await tx.task.findMany({ where: { ownerId: userId, status: { in: ["mo", "dang-lam"] } }, select: chon, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 50 });
  const sapHan = dangLam.filter((v) => v.dueAt && v.dueAt < sapToi);
  const k = { batDau, ketThuc };
  const soLieu = {
    doanhThuDaThu: await tinhChiSo(tx, userId, "doanh-thu-da-thu", k),
    phieuHoTroXong: await tinhChiSo(tx, userId, "phieu-ho-tro-xong", k),
    tongDiemViec: await tinhChiSo(tx, userId, "tong-diem-viec", k),
    leadXuLy: await tinhChiSo(tx, userId, "lead-xu-ly", k),
  };
  const g = (v: { id: string; title: string; dueAt: Date | null; status: string; progress: number }) => ({ id: v.id, tieuDe: v.title, han: v.dueAt, trangThai: v.status, tienDo: v.progress });
  return { viecXong: xong.map(g), viecDangLam: dangLam.map(g), viecSapHan: sapHan.map(g), soLieu };
}

function vanBanDienSan(a: Awaited<ReturnType<typeof duLieuTuDong>>) {
  const dong = (v: { tieuDe: string; han: Date | null; tienDo: number }, tienDo = false) =>
    `- ${v.tieuDe}${tienDo && v.tienDo ? ` (${v.tienDo}%)` : ""}${v.han ? ` — hạn ${dinhDangNgayGio(v.han)}` : ""}`;
  const soLieu: string[] = [];
  if (a.soLieu.doanhThuDaThu) soLieu.push(`Doanh số đã thu: ${tienHayKhong(a.soLieu.doanhThuDaThu)}`);
  if (a.soLieu.phieuHoTroXong) soLieu.push(`Phiếu hỗ trợ xử lý xong: ${a.soLieu.phieuHoTroXong}`);
  if (a.soLieu.leadXuLy) soLieu.push(`Lead đã xử lý: ${a.soLieu.leadXuLy}`);
  if (a.soLieu.tongDiemViec) soLieu.push(`Điểm công việc được duyệt: ${a.soLieu.tongDiemViec}`);
  return {
    daLam: [...a.viecXong.map((v) => dong(v)), ...(soLieu.length ? ["", ...soLieu] : [])].join("\n"),
    seLam: a.viecDangLam.map((v) => dong(v, true)).join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Viết / nộp
// ---------------------------------------------------------------------------

function sangBaoCao(r: { id: string; userId: string; kind: string; periodStart: Date; periodEnd: Date; done: string | null; plan: string | null; blockers: string | null; autoData: unknown; status: string; deadlineAt: Date; submittedAt: Date | null; isLate: boolean; createdAt: Date }, bayGio = new Date()) {
  return {
    id: r.id,
    nguoiId: r.userId,
    loai: r.kind as LoaiBaoCao,
    tu: dateVeNgay(r.periodStart),
    den: dateVeNgay(r.periodEnd),
    daLam: r.done ?? "",
    seLam: r.plan ?? "",
    vuongMac: r.blockers ?? "",
    tuDong: r.autoData,
    trangThai: r.status,
    han: r.deadlineAt,
    nopLuc: r.submittedAt,
    tre: r.isLate,
    tinhTrang: tinhTrangBaoCao(r.deadlineAt, r.submittedAt, bayGio),
  };
}

/** Mở báo cáo kỳ hiện tại (hoặc kỳ chứa `ngay`) của chính mình: bản đã lưu, hoặc bản nháp điền sẵn (chưa ghi). */
export async function moBaoCao(nc: NguCanh, loai: LoaiBaoCao, ngay?: string) {
  batBuocQuyen(nc.hoSo, "danh_gia.create");
  const ky = kyCua(loai, ngay);
  const ch = baoCaoTu(await docCauHinhDanhGia(nc.tx));
  const r = await nc.tx.workReport.findFirst({ where: { userId: nc.hoSo.userId, kind: loai, periodStart: ngayVeDate(ky.tu) } });
  const tuDong = await duLieuTuDong(nc.tx, nc.hoSo.userId, loai, ky.tu, ky.den);
  if (r) return { ...sangBaoCao(r), tuDongMoi: tuDong, daLuu: true };
  const dien = vanBanDienSan(tuDong);
  return {
    id: null, nguoiId: nc.hoSo.userId, loai, tu: ky.tu, den: ky.den, daLam: dien.daLam, seLam: dien.seLam, vuongMac: "",
    tuDong, tuDongMoi: tuDong, trangThai: "nhap", han: hanBaoCao(loai, ky.tu, ch), nopLuc: null, tre: false,
    tinhTrang: tinhTrangBaoCao(hanBaoCao(loai, ky.tu, ch), null, new Date()), daLuu: false,
  };
}

export async function luuBaoCao(nc: NguCanh, d: z.infer<typeof LuocDoBaoCao>) {
  batBuocQuyen(nc.hoSo, "danh_gia.create", { objectType: "work_report" });
  const ky = kyCua(d.loai, d.ngay);
  if (ky.tu > homNayVN()) throw new LoiNghiepVu("Chưa tới kỳ báo cáo này.", 422, "ky-tuong-lai");
  if (d.nop && !d.daLam.trim() && !d.seLam.trim()) throw new LoiNghiepVu("Báo cáo trống: ghi ít nhất phần Đã làm hoặc Sẽ làm.", 422, "bao-cao-trong");
  const ch: CauHinhBaoCao = baoCaoTu(await docCauHinhDanhGia(nc.tx));
  const han = hanBaoCao(d.loai, ky.tu, ch);
  const bayGio = new Date();
  const khoa = { tenantId_userId_kind_periodStart: { tenantId: nc.tenantId, userId: nc.hoSo.userId, kind: d.loai, periodStart: ngayVeDate(ky.tu) } };
  const cu = await nc.tx.workReport.findUnique({ where: khoa, select: { id: true } });
  if (cu) {
    await khoaChungTu(nc.tx, "work_reports", cu.id);
    const s = await nc.tx.workReport.findUniqueOrThrow({ where: { id: cu.id }, select: { status: true } });
    if (s.status === "da-nop") throw new LoiNghiepVu("Báo cáo đã nộp, không sửa được nữa.", 409, "da-nop");
  }
  const tuDong = d.nop ? await duLieuTuDong(nc.tx, nc.hoSo.userId, d.loai, ky.tu, ky.den) : undefined;
  const duLieu = {
    done: d.daLam || null, plan: d.seLam || null, blockers: d.vuongMac || null, deadlineAt: han,
    ...(d.nop && { status: "da-nop", submittedAt: bayGio, isLate: bayGio > han, autoData: JSON.parse(JSON.stringify(tuDong)) }),
  };
  const r = cu
    ? await nc.tx.workReport.update({ where: { id: cu.id }, data: duLieu })
    : await nc.tx.workReport.create({ data: { tenantId: nc.tenantId, userId: nc.hoSo.userId, kind: d.loai, periodStart: ngayVeDate(ky.tu), periodEnd: ngayVeDate(ky.den), ...duLieu } });
  if (d.nop) {
    await nc.kiemToan({ action: "nop-bao-cao", objectType: "work_report", objectId: r.id, after: { loai: d.loai, tu: ky.tu, tre: r.isLate } });
    await nc.suKien({ eventType: SU_KIEN.WORK_REPORT_SUBMITTED, objectType: "work_report", objectId: r.id, payload: { loai: d.loai, tre: r.isLate } });
    // QĐ-132: người nhận = quản lý hiệu lực (không có quản lý / quản lý đã nghỉ → cấp trên → Giám đốc).
    const nguoiNhan = (await napBanDoCapTren(nc.tx)).quanLyHieuLuc(nc.hoSo.userId);
    if (nguoiNhan && nguoiNhan !== nc.hoSo.userId) {
      await taoThongBao(nc.tx, nc.tenantId, {
        nguoiNhanId: nguoiNhan,
        loai: "bao-cao-da-nop",
        tieuDe: `${nc.hoSo.hoTen} đã nộp ${NHAN_LOAI_BAO_CAO[d.loai].toLowerCase()} ${ky.tu === ky.den ? ky.tu.split("-").reverse().join("/") : `tuần ${ky.tu.split("-").reverse().join("/")}`}${r.isLate ? " (trễ hạn)" : ""}`,
        noiDung: d.vuongMac ? `Vướng mắc: ${d.vuongMac.slice(0, 400)}` : null,
        duongDan: `/bao-cao-cong-viec/${r.id}`,
        doiTuong: "work_report",
        doiTuongId: r.id,
        khoaChongTrung: `bao-cao-nop:${r.id}`,
      });
    }
  }
  return sangBaoCao(r);
}

// ---------------------------------------------------------------------------
// Xem, nhận xét, chuyển vướng mắc thành việc
// ---------------------------------------------------------------------------

async function docBaoCao(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "danh_gia.view", { objectType: "work_report", objectId: id });
  const r = await nc.tx.workReport.findFirst({ where: { AND: [{ id }, await locNguoiDanhGia(nc)] } });
  if (!r) throw new LoiKhongTimThay("Báo cáo");
  return r;
}

export async function chiTietBaoCao(nc: NguCanh, id: string) {
  const r = await docBaoCao(nc, id);
  const bl = await nc.tx.workReportComment.findMany({ where: { reportId: id }, orderBy: { createdAt: "asc" } });
  const ten = await banDoTen(nc.tx, [r.userId, ...bl.map((b) => b.authorId)]);
  const duocCham = await chamDuoc(nc, r.userId);
  return {
    baoCao: { ...sangBaoCao(r), nguoi: ten.get(r.userId) ?? "—" },
    nhanXet: bl.map((b) => ({ id: b.id, nguoi: ten.get(b.authorId) ?? "—", noiDung: b.body, viecId: b.createdTaskId, luc: b.createdAt })),
    quyen: { nhanXet: duocCham && r.status === "da-nop", chuyenViec: duocCham && r.status === "da-nop" && coQuyen(nc.hoSo, "task.create") && !!r.blockers },
  };
}

export async function nhanXetBaoCao(nc: NguCanh, id: string, d: z.infer<typeof LuocDoNhanXet>) {
  const r = await docBaoCao(nc, id);
  if (r.status !== "da-nop") throw new LoiNghiepVu("Báo cáo chưa nộp.", 409, "chua-nop");
  if (!(await chamDuoc(nc, r.userId))) throw new LoiNghiepVu("Chỉ quản lý trực tiếp hoặc người quản lý trong phạm vi nhận xét được.", 403, "khong-duoc-nhan-xet");
  const c = await nc.tx.workReportComment.create({ data: { tenantId: nc.tenantId, reportId: id, authorId: nc.hoSo.userId, body: d.noiDung }, select: { id: true } });
  await nc.kiemToan({ action: "nhan-xet-bao-cao", objectType: "work_report", objectId: id, after: { noiDung: d.noiDung } });
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: r.userId, loai: "bao-cao-nhan-xet", tieuDe: `${nc.hoSo.hoTen} nhận xét báo cáo của bạn`, noiDung: d.noiDung.slice(0, 400),
    duongDan: `/bao-cao-cong-viec/${id}`, doiTuong: "work_report", doiTuongId: id, khoaChongTrung: `bao-cao-nx:${c.id}`,
  });
  return { id: c.id };
}

/** DG-44: một nút — vướng mắc thành việc mới (mặc định giao cho chính người quản lý), ghi lại trên báo cáo. */
export async function chuyenVuongMacThanhViec(nc: NguCanh, id: string, d: z.infer<typeof LuocDoChuyenViec>) {
  const r = await docBaoCao(nc, id);
  if (r.status !== "da-nop" || !r.blockers) throw new LoiNghiepVu("Báo cáo chưa nộp hoặc không có vướng mắc.", 409, "khong-co-vuong-mac");
  if (!(await chamDuoc(nc, r.userId))) throw new LoiNghiepVu("Chỉ quản lý trực tiếp hoặc người quản lý trong phạm vi xử lý được vướng mắc.", 403, "khong-duoc-nhan-xet");
  const ten = (await banDoTen(nc.tx, [r.userId])).get(r.userId) ?? "";
  const viec = await taoViec(
    nc,
    {
      tieuDe: d.tieuDe,
      moTa: `${d.moTa ? `${d.moTa}\n\n` : ""}Từ vướng mắc trong ${NHAN_LOAI_BAO_CAO[r.kind as LoaiBaoCao].toLowerCase()} của ${ten} (${dateVeNgay(r.periodStart).split("-").reverse().join("/")}):\n${r.blockers.slice(0, 3000)}`,
      nguoiPhuTrachId: d.nguoiPhuTrachId ?? nc.hoSo.userId,
      uuTien: "cao",
      han: d.han ?? null,
      khachHangId: null,
      leadId: null,
      coHoiId: null,
    },
    { baoCaoId: id },
  );
  await nc.tx.workReportComment.create({
    data: { tenantId: nc.tenantId, reportId: id, authorId: nc.hoSo.userId, body: `Đã chuyển vướng mắc thành việc: ${viec.tieuDe}`, createdTaskId: viec.id },
  });
  await nc.kiemToan({ action: "chuyen-vuong-mac", objectType: "work_report", objectId: id, after: { viecId: viec.id } });
  if (r.userId !== nc.hoSo.userId) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: r.userId, loai: "bao-cao-vuong-mac", tieuDe: `Vướng mắc của bạn đã thành việc: ${viec.tieuDe}`.slice(0, 300),
      duongDan: `/cong-viec/${viec.id}`, doiTuong: "task", doiTuongId: viec.id, khoaChongTrung: `bao-cao-vm:${id}:${viec.id}`,
    });
  }
  return viec;
}

/**
 * Trang tổng hợp của quản lý (DG-45): mọi người trong phạm vi xem (kể cả người không bắt buộc nhưng đã
 * viết), tình trạng kỳ `ngay`: đúng hạn / trễ / chưa nộp / thiếu.
 */
export async function bangBaoCaoNhom(nc: NguCanh, loai: LoaiBaoCao, ngay?: string) {
  batBuocQuyen(nc.hoSo, "danh_gia.view");
  const ky = kyCua(loai, ngay);
  const ch = baoCaoTu(await docCauHinhDanhGia(nc.tx));
  const han = hanBaoCao(loai, ky.tu, ch);
  const pv = await nguoiXemDuocDanhGia(nc);
  const phai = await nguoiPhaiBaoCao(nc.tx, pv === "tat-ca" ? undefined : pv);
  const ds = await nc.tx.workReport.findMany({ where: { kind: loai, periodStart: ngayVeDate(ky.tu), ...(pv !== "tat-ca" && { userId: { in: pv } }) } });
  const soNx = await nc.tx.workReportComment.groupBy({ by: ["reportId"], where: { reportId: { in: ds.map((r) => r.id) } }, _count: { _all: true } });
  const ten = await banDoTen(nc.tx, ds.map((r) => r.userId));
  const bayGio = new Date();
  const theoNguoi = new Map(ds.map((r) => [r.userId, r]));
  const ngayLam = loai === "ngay" ? await boLocNgayPhaiBaoCao(nc.tx, phai.filter((p) => p.phaiNgay).map((p) => p.id), ky.tu, ky.den) : null;
  const dong: { nguoiId: string; hoTen: string; batBuoc: boolean; baoCao: ReturnType<typeof sangBaoCao> | null; tinhTrang: string; soNhanXet: number }[] = [];
  for (const p of phai) {
    // QĐ-138: báo cáo ngày không bắt buộc vào ngày không phải làm (nghỉ tuần theo lịch, lễ, nghỉ phép cả ngày).
    const batBuoc = (loai === "tuan" ? p.phaiTuan : p.phaiNgay && !!ngayLam?.(p.id, ky.tu)) && batBuocTrongKy(p, ky.den);
    const r = theoNguoi.get(p.id);
    if (!batBuoc && !r) continue;
    dong.push({ nguoiId: p.id, hoTen: p.hoTen, batBuoc, baoCao: r ? sangBaoCao(r, bayGio) : null, tinhTrang: tinhTrangBaoCao(r?.deadlineAt ?? han, r?.submittedAt ?? null, bayGio), soNhanXet: soNx.find((x) => x.reportId === r?.id)?._count._all ?? 0 });
  }
  for (const r of ds) {
    if (dong.some((x) => x.nguoiId === r.userId)) continue;
    dong.push({ nguoiId: r.userId, hoTen: ten.get(r.userId) ?? "—", batBuoc: false, baoCao: sangBaoCao(r, bayGio), tinhTrang: tinhTrangBaoCao(r.deadlineAt, r.submittedAt, bayGio), soNhanXet: soNx.find((x) => x.reportId === r.id)?._count._all ?? 0 });
  }
  dong.sort((a, b) => a.hoTen.localeCompare(b.hoTen, "vi"));
  return { loai, tu: ky.tu, den: ky.den, han, dong };
}

/** Báo cáo của chính mình gần đây (lịch sử). */
export async function baoCaoCuaToi(nc: NguCanh, gioiHan = 20) {
  batBuocQuyen(nc.hoSo, "danh_gia.create");
  const ds = await nc.tx.workReport.findMany({ where: { userId: nc.hoSo.userId }, orderBy: { periodStart: "desc" }, take: gioiHan });
  return ds.map((r) => sangBaoCao(r));
}

/**
 * Thống kê báo cáo tuần bắt buộc trong [tu, den] cho đánh giá tháng (DG-43): số tuần phải nộp (tuần có
 * hạn nằm trong khoảng và đã qua), đúng hạn, trễ, thiếu.
 */
export async function thongKeBaoCaoTuan(tx: ClientTenant, userId: string, tu: string, den: string, bayGio = new Date()) {
  const phai = (await nguoiPhaiBaoCao(tx, [userId]))[0];
  if (!phai) return { batBuoc: false, soTuan: 0, dungHan: 0, tre: 0, thieu: 0 };
  const ch = baoCaoTu(await docCauHinhDanhGia(tx));
  const ds = await tx.workReport.findMany({ where: { userId, kind: "tuan", periodStart: { gte: ngayVeDate(congNgay(tu, -6)), lte: ngayVeDate(den) } } });
  const kq = { batBuoc: true, soTuan: 0, dungHan: 0, tre: 0, thieu: 0 };
  for (let dau = kyBaoCao("tuan", tu).tu; dau <= den; dau = congNgay(dau, 7)) {
    const han = hanBaoCao("tuan", dau, ch);
    const ngayHan = new Date(han.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    if (ngayHan < tu || ngayHan > den || han > bayGio || !batBuocTrongKy(phai, congNgay(dau, 6))) continue;
    kq.soTuan += 1;
    const r = ds.find((x) => dateVeNgay(x.periodStart) === dau);
    const tt = tinhTrangBaoCao(han, r?.submittedAt ?? null, bayGio);
    if (tt === "dung-han") kq.dungHan += 1;
    else if (tt === "tre") kq.tre += 1;
    else kq.thieu += 1;
  }
  return kq;
}

/**
 * Thống kê BÁO CÁO NGÀY bắt buộc trong [tu, den] cho phiếu đánh giá (QĐ-138): chỉ đếm ngày phải làm (có ca
 * theo lịch, không lễ, không nghỉ phép cả ngày) mà hạn đã qua; người / phòng không bắt buộc báo cáo ngày → 0.
 */
export async function thongKeBaoCaoNgay(tx: ClientTenant, userId: string, tu: string, den: string, bayGio = new Date()) {
  const phai = (await nguoiPhaiBaoCao(tx, [userId]))[0];
  if (!phai?.phaiNgay) return { batBuoc: false, soNgay: 0, dungHan: 0, tre: 0, thieu: 0 };
  const ch = baoCaoTu(await docCauHinhDanhGia(tx));
  const ngayLam = await boLocNgayPhaiBaoCao(tx, [userId], tu, den);
  const ds = await tx.workReport.findMany({ where: { userId, kind: "ngay", periodStart: { gte: ngayVeDate(tu), lte: ngayVeDate(den) } }, select: { periodStart: true, submittedAt: true } });
  const nop = new Map(ds.map((r) => [dateVeNgay(r.periodStart), r.submittedAt]));
  const kq = { batBuoc: true, soNgay: 0, dungHan: 0, tre: 0, thieu: 0 };
  for (const ngay of cacNgayTrongKhoang(tu, den)) {
    const han = hanBaoCao("ngay", ngay, ch);
    if (han > bayGio || !batBuocTrongKy(phai, ngay) || !ngayLam(userId, ngay)) continue;
    kq.soNgay += 1;
    const tt = tinhTrangBaoCao(han, nop.get(ngay) ?? null, bayGio);
    if (tt === "dung-han") kq.dungHan += 1;
    else if (tt === "tre") kq.tre += 1;
    else kq.thieu += 1;
  }
  return kq;
}

export async function xemDuocBaoCaoCua(nc: NguCanh, userId: string) {
  return xemDuocDanhGiaCua(nc, userId);
}

// ---------------------------------------------------------------------------
// Worker: nhắc trước hạn, báo thiếu (DG-42)
// ---------------------------------------------------------------------------

export async function quetBaoCao(tenantId: string, bayGio = new Date()): Promise<{ soNhac: number; soThieu: number }> {
  return voiTenant(tenantId, async (tx) => {
    const ch = baoCaoTu(await docCauHinhDanhGia(tx));
    const homNay = homNayVN(bayGio);
    const kq = { soNhac: 0, soThieu: 0 };
    const nguoi = await nguoiPhaiBaoCao(tx);
    if (nguoi.length === 0) return kq;
    for (const loai of LOAI_BAO_CAO) {
      // Kỳ hiện tại (nhắc trước hạn) và kỳ trước (báo thiếu sau hạn).
      const hienTai = kyBaoCao(loai, homNay);
      const truoc = kyBaoCao(loai, congNgay(hienTai.tu, -1));
      for (const ky of [hienTai, truoc]) {
        const han = hanBaoCao(loai, ky.tu, ch);
        const nhac = denLucNhac(han, bayGio, ch.nhacTruocGio);
        const quaHan = bayGio > han;
        if (!nhac && !quaHan) continue;
        let phai = nguoi.filter((n) => (loai === "tuan" ? n.phaiTuan : n.phaiNgay) && batBuocTrongKy(n, ky.den));
        // QĐ-138: báo cáo ngày — bỏ người hôm đó không phải làm (nghỉ tuần theo lịch, lễ, nghỉ phép cả ngày).
        if (loai === "ngay" && phai.length) {
          const ngayLam = await boLocNgayPhaiBaoCao(tx, phai.map((p) => p.id), ky.tu, ky.den);
          phai = phai.filter((p) => ngayLam(p.id, ky.tu));
        }
        if (phai.length === 0) continue;
        const daNop = new Set(
          (await tx.workReport.findMany({ where: { kind: loai, periodStart: ngayVeDate(ky.tu), status: "da-nop", userId: { in: phai.map((p) => p.id) } }, select: { userId: true } })).map((r) => r.userId),
        );
        for (const p of phai) {
          if (daNop.has(p.id)) continue;
          const nhan = `${NHAN_LOAI_BAO_CAO[loai]} ${ky.tu === ky.den ? ky.tu.split("-").reverse().join("/") : `tuần từ ${ky.tu.split("-").reverse().join("/")}`}`;
          if (nhac) {
            if (await taoThongBao(tx, tenantId, {
              nguoiNhanId: p.id, loai: "bao-cao-nhac", mucDo: "canh-bao",
              tieuDe: `Sắp tới hạn nộp ${nhan.toLowerCase()} (${dinhDangNgayGio(han)})`,
              noiDung: "Máy đã điền sẵn việc đã xong, đang làm, sắp tới hạn — bổ sung nhận định rồi bấm Nộp.",
              duongDan: `/bao-cao-cong-viec?loai=${loai}`, khoaChongTrung: `bao-cao-nhac:${loai}:${ky.tu}`,
            })) kq.soNhac += 1;
          } else if (quaHan && bayGio.getTime() - han.getTime() < 7 * 86_400_000) {
            if (await taoThongBao(tx, tenantId, {
              nguoiNhanId: p.id, loai: "bao-cao-thieu", mucDo: "canh-bao",
              tieuDe: `Bạn chưa nộp ${nhan.toLowerCase()} — đã quá hạn`,
              noiDung: "Vẫn nộp được (ghi là trễ hạn). Không nộp sẽ ghi là thiếu trong đánh giá tháng.",
              duongDan: `/bao-cao-cong-viec?loai=${loai}&ngay=${ky.tu}`, khoaChongTrung: `bao-cao-thieu:${loai}:${ky.tu}`,
            })) kq.soThieu += 1;
          }
        }
      }
    }
    return kq;
  });
}
