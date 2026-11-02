import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coMotTrongCacQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { banDoTen } from "@/modules/cham-cong/chung";
import { congNgay, mocVN } from "@/modules/cham-cong/tinh-toan";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { taoThongBao } from "@/modules/thong-bao/service";
import { chamDuoc, locNguoiDanhGia, xemDuocDanhGiaCua } from "@/modules/danh-gia/chung";
import { soLieuViecThucTap, tomTatCong } from "@/modules/danh-gia/chi-so";
import {
  dauTuan,
  kiemTraMauPhieu,
  LuocDoMauPhieu,
  NHAN_NGUON_THONG_TIN,
  tinhPhieuThucTap,
  type MauPhieu,
  type NguonTuDong,
} from "@/modules/danh-gia/tinh-toan";

/**
 * Sinh viên thực tập (0.20.0, DG-70 → DG-76): nhật ký tuần (đã làm / học được / vướng mắc) + nhận xét của
 * người hướng dẫn; mẫu phiếu đánh giá cấu hình được theo từng trường (Nhân sự, `nhan_su.update`); phiếu
 * đánh giá chụp mẫu lúc tạo, người hướng dẫn chấm, máy tính tổng, in A4 theo bố cục mẫu.
 * Thực tập sinh chỉ thấy nhật ký / phiếu của chính mình (phạm vi `own`).
 */

async function laNguoiHuongDan(nc: NguCanh, internId: string): Promise<boolean> {
  const p = await nc.tx.internProfile.findFirst({ where: { userId: internId }, select: { mentorId: true } });
  return !!p?.mentorId && p.mentorId === nc.hoSo.userId;
}

async function batBuocLaThucTap(nc: NguCanh, userId: string) {
  const s = await nc.tx.staffProfile.findFirst({ where: { userId }, select: { staffType: true } });
  if (s?.staffType !== "thuc-tap") throw new LoiNghiepVu("Người này không phải thực tập sinh (Nhân sự → Hồ sơ: loại nhân sự Thực tập).", 422, "khong-phai-thuc-tap");
}

// ---------------------------------------------------------------------------
// Nhật ký tuần (DG-70, DG-71)
// ---------------------------------------------------------------------------

export const LuocDoNhatKy = z.object({
  ngay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  daLam: z.string().trim().max(10000).optional().default(""),
  hocDuoc: z.string().trim().max(10000).optional().default(""),
  vuongMac: z.string().trim().max(10000).optional().default(""),
  nop: z.boolean().optional().default(false),
});
export const LuocDoNhanXetNhatKy = z.object({ noiDung: z.string().trim().min(2).max(5000) });

function sangNhatKy(j: { id: string; userId: string; weekStart: Date; did: string | null; learned: string | null; blockers: string | null; status: string; submittedAt: Date | null }) {
  return { id: j.id, nguoiId: j.userId, tuan: dateVeNgay(j.weekStart), daLam: j.did ?? "", hocDuoc: j.learned ?? "", vuongMac: j.blockers ?? "", trangThai: j.status, nopLuc: j.submittedAt };
}

export async function luuNhatKy(nc: NguCanh, d: z.infer<typeof LuocDoNhatKy>) {
  batBuocQuyen(nc.hoSo, "danh_gia.create", { objectType: "intern_journal" });
  await batBuocLaThucTap(nc, nc.hoSo.userId);
  const tuan = dauTuan(d.ngay ?? homNayVN());
  if (tuan > homNayVN()) throw new LoiNghiepVu("Chưa tới tuần này.", 422, "ky-tuong-lai");
  if (d.nop && !d.daLam) throw new LoiNghiepVu("Ghi ít nhất phần Đã làm trước khi nộp.", 422, "nhat-ky-trong");
  const cu = await nc.tx.internJournal.findFirst({ where: { userId: nc.hoSo.userId, weekStart: ngayVeDate(tuan) }, select: { id: true } });
  if (cu) {
    await khoaChungTu(nc.tx, "intern_journals", cu.id);
    const s = await nc.tx.internJournal.findUniqueOrThrow({ where: { id: cu.id }, select: { status: true } });
    if (s.status === "da-nop") throw new LoiNghiepVu("Nhật ký tuần này đã nộp.", 409, "da-nop");
  }
  const bayGio = new Date();
  const data = { did: d.daLam || null, learned: d.hocDuoc || null, blockers: d.vuongMac || null, ...(d.nop && { status: "da-nop", submittedAt: bayGio }) };
  const j = cu
    ? await nc.tx.internJournal.update({ where: { id: cu.id }, data })
    : await nc.tx.internJournal.create({ data: { tenantId: nc.tenantId, userId: nc.hoSo.userId, weekStart: ngayVeDate(tuan), ...data } });
  if (d.nop) {
    await nc.kiemToan({ action: "nop-nhat-ky", objectType: "intern_journal", objectId: j.id, after: { tuan } });
    const p = await nc.tx.internProfile.findFirst({ where: { userId: nc.hoSo.userId }, select: { mentorId: true } });
    if (p?.mentorId) {
      await taoThongBao(nc.tx, nc.tenantId, {
        nguoiNhanId: p.mentorId, loai: "nhat-ky-thuc-tap", tieuDe: `${nc.hoSo.hoTen} đã nộp nhật ký tuần ${tuan.split("-").reverse().join("/")}`,
        noiDung: d.vuongMac ? `Vướng mắc: ${d.vuongMac.slice(0, 300)}` : null, duongDan: `/thuc-tap?nguoi=${nc.hoSo.userId}`,
        doiTuong: "intern_journal", doiTuongId: j.id, khoaChongTrung: `nhat-ky:${j.id}`,
      });
    }
  }
  return sangNhatKy(j);
}

/** Nhật ký của một thực tập sinh (mặc định: của mình) + nhận xét. */
export async function danhSachNhatKy(nc: NguCanh, nguoiId?: string) {
  batBuocQuyen(nc.hoSo, "danh_gia.view");
  const ai = nguoiId ?? nc.hoSo.userId;
  const ds = await nc.tx.internJournal.findMany({ where: { AND: [{ userId: ai }, await locNguoiDanhGia(nc)] }, orderBy: { weekStart: "desc" }, take: 60, include: { comments: { orderBy: { createdAt: "asc" } } } });
  if (ai !== nc.hoSo.userId && !(await xemDuocDanhGiaCua(nc, ai))) throw new LoiKhongTimThay("Thực tập sinh");
  const ten = await banDoTen(nc.tx, ds.flatMap((j) => j.comments.map((c) => c.authorId)));
  const duocNhanXet = ai !== nc.hoSo.userId && ((await laNguoiHuongDan(nc, ai)) || (await chamDuoc(nc, ai)));
  return {
    duocNhanXet,
    nhatKy: ds.map((j) => ({ ...sangNhatKy(j), nhanXet: j.comments.map((c) => ({ id: c.id, nguoi: ten.get(c.authorId) ?? "—", noiDung: c.body, luc: c.createdAt })) })),
  };
}

export async function nhanXetNhatKy(nc: NguCanh, id: string, d: z.infer<typeof LuocDoNhanXetNhatKy>) {
  batBuocQuyen(nc.hoSo, "danh_gia.view", { objectType: "intern_journal", objectId: id });
  const j = await nc.tx.internJournal.findFirst({ where: { AND: [{ id }, await locNguoiDanhGia(nc)] } });
  if (!j) throw new LoiKhongTimThay("Nhật ký");
  if (j.status !== "da-nop") throw new LoiNghiepVu("Nhật ký chưa nộp.", 409, "chua-nop");
  if (!((await laNguoiHuongDan(nc, j.userId)) || (await chamDuoc(nc, j.userId)))) throw new LoiNghiepVu("Chỉ người hướng dẫn hoặc quản lý nhận xét được.", 403, "khong-duoc-nhan-xet");
  const c = await nc.tx.internJournalComment.create({ data: { tenantId: nc.tenantId, journalId: id, authorId: nc.hoSo.userId, body: d.noiDung }, select: { id: true } });
  await nc.kiemToan({ action: "nhan-xet-nhat-ky", objectType: "intern_journal", objectId: id, after: { noiDung: d.noiDung } });
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: j.userId, loai: "nhat-ky-nhan-xet", tieuDe: `${nc.hoSo.hoTen} nhận xét nhật ký tuần ${dateVeNgay(j.weekStart).split("-").reverse().join("/")}`,
    noiDung: d.noiDung.slice(0, 400), duongDan: "/thuc-tap", doiTuong: "intern_journal", doiTuongId: id, khoaChongTrung: `nhat-ky-nx:${c.id}`,
  });
  return { id: c.id };
}

/** Thực tập sinh người đang xem được (mình hướng dẫn, trong phạm vi, hoặc toàn công ty). */
export async function danhSachThucTapSinh(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "danh_gia.view");
  const ds = await nc.tx.staffProfile.findMany({
    where: { staffType: "thuc-tap", user: { status: "hoat-dong" }, ...(await locNguoiDanhGia(nc)) },
    select: { userId: true, user: { select: { fullName: true, internProfile: { select: { school: true, mentorId: true, startDate: true, endDate: true } } } } },
  });
  const ten = await banDoTen(nc.tx, ds.map((x) => x.user.internProfile?.mentorId));
  return ds
    .map((x) => ({
      id: x.userId, hoTen: x.user.fullName, truong: x.user.internProfile?.school ?? "", nguoiHuongDan: x.user.internProfile?.mentorId ? (ten.get(x.user.internProfile.mentorId) ?? "—") : "",
      tuNgay: dateVeNgay(x.user.internProfile?.startDate), denNgay: dateVeNgay(x.user.internProfile?.endDate),
    }))
    .sort((a, b) => a.hoTen.localeCompare(b.hoTen, "vi"));
}

// ---------------------------------------------------------------------------
// Mẫu phiếu (DG-72)
// ---------------------------------------------------------------------------

export const LuocDoMauPhieuLuu = z.object({
  ma: z.string().trim().regex(/^[a-z0-9-]{2,50}$/, "Mã: chữ thường không dấu, số, gạch ngang."),
  ten: z.string().trim().min(3).max(255),
  truong: z.string().trim().max(255).optional().default(""),
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional().default("hoat-dong"),
  boCuc: LuocDoMauPhieu,
});

function kiemMau(m: MauPhieu) {
  const loi = kiemTraMauPhieu(m);
  if (loi.length) throw new LoiNghiepVu(`Mẫu phiếu chưa hợp lệ: ${loi.join(" ")}`, 422, "mau-sai", { loi });
}

export async function danhSachMauPhieu(nc: NguCanh) {
  if (!coMotTrongCacQuyen(nc.hoSo, ["danh_gia.view", "nhan_su.view"])) throw new LoiThieuQuyen("danh_gia.view", { objectType: "intern_eval_template" });
  const ds = await nc.tx.internEvalTemplate.findMany({ orderBy: { name: "asc" } });
  return ds.map((m) => ({ id: m.id, ma: m.code, ten: m.name, truong: m.school ?? "", phienBan: m.version, trangThai: m.status, boCuc: LuocDoMauPhieu.parse(m.layout) }));
}

export async function taoMauPhieu(nc: NguCanh, d: z.infer<typeof LuocDoMauPhieuLuu>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "intern_eval_template" });
  kiemMau(d.boCuc);
  try {
    const m = await nc.tx.internEvalTemplate.create({ data: { tenantId: nc.tenantId, code: d.ma, name: d.ten, school: d.truong || null, layout: d.boCuc, status: d.trangThai, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId } });
    await nc.kiemToan({ action: "tao", objectType: "intern_eval_template", objectId: m.id, after: { ma: d.ma, ten: d.ten } });
    return { id: m.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new LoiNghiepVu("Mã mẫu phiếu đã có.", 409, "trung-ma");
    throw e;
  }
}

/** Sửa mẫu tăng phiên bản; phiếu đã tạo giữ bản chụp mẫu cũ, không đổi theo. */
export async function suaMauPhieu(nc: NguCanh, id: string, d: z.infer<typeof LuocDoMauPhieuLuu>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "intern_eval_template", objectId: id });
  kiemMau(d.boCuc);
  const goc = await nc.tx.internEvalTemplate.findFirst({ where: { id } });
  if (!goc) throw new LoiKhongTimThay("Mẫu phiếu");
  await nc.tx.internEvalTemplate.update({ where: { id }, data: { code: d.ma, name: d.ten, school: d.truong || null, layout: d.boCuc, status: d.trangThai, version: { increment: 1 }, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "intern_eval_template", objectId: id, before: { phienBan: goc.version }, after: { ma: d.ma, ten: d.ten } });
  return { id };
}

// ---------------------------------------------------------------------------
// Phiếu đánh giá thực tập (DG-73 → DG-76)
// ---------------------------------------------------------------------------

export const LuocDoTaoPhieuThucTap = z.object({
  nguoiId: z.uuid(),
  mauId: z.uuid(),
  tuNgay: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  denNgay: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
});
export const LuocDoChamThucTap = z.object({
  thongTin: z.record(z.string(), z.string().max(500)).optional().default({}),
  diem: z.record(z.string(), z.union([z.number(), z.string().max(10), z.null()])).optional().default({}),
  nhanXet: z.record(z.string(), z.string().max(5000)).optional().default({}),
});

async function giaTriTuDong(nc: NguCanh, nguoiId: string, tu: string, den: string): Promise<Partial<Record<NguonTuDong, number | null>>> {
  const k = { batDau: mocVN(tu, 0), ketThuc: mocVN(congNgay(den, 1), 0) };
  const cong = await tomTatCong(nc.tx, nguoiId, tu, den);
  const viec = await soLieuViecThucTap(nc.tx, nguoiId, k);
  return { "chuyen-can": cong?.tyLeChuyenCan ?? null, "ty-le-viec-dat": viec.tyLeDat, "chat-luong-viec": viec.chatLuongTb };
}

async function thongTinTuDong(nc: NguCanh, nguoiId: string, mau: MauPhieu, tu: string, den: string): Promise<Record<string, string>> {
  const u = await nc.tx.user.findUniqueOrThrow({
    where: { id: nguoiId },
    select: { fullName: true, staffProfile: { select: { jobTitle: true, department: { select: { name: true } } } }, internProfile: { select: { school: true, faculty: true, studentCode: true, academicSupervisor: true, mentorId: true } } },
  });
  const ten = await banDoTen(nc.tx, [u.internProfile?.mentorId]);
  const vn = (s: string) => (s ? s.split("-").reverse().join("/") : "");
  const kq: Record<string, string> = {};
  for (const t of mau.thongTin) {
    const ip = u.internProfile;
    kq[t.ma] = {
      "ho-ten": u.fullName, mssv: ip?.studentCode ?? "", truong: ip?.school ?? "", khoa: ip?.faculty ?? "", "giang-vien": ip?.academicSupervisor ?? "",
      "nguoi-huong-dan": ip?.mentorId ? (ten.get(ip.mentorId) ?? "") : "", "tu-ngay": vn(tu), "den-ngay": vn(den),
      "phong-ban": u.staffProfile?.department?.name ?? "", "chuc-danh": u.staffProfile?.jobTitle ?? "", "tu-nhap": "",
    }[t.nguon] ?? "";
  }
  return kq;
}

async function docPhieuThucTap(nc: NguCanh, id: string, khoa = false) {
  batBuocQuyen(nc.hoSo, "danh_gia.view", { objectType: "intern_evaluation", objectId: id });
  const p0 = await nc.tx.internEvaluation.findFirst({ where: { AND: [{ id }, await locNguoiDanhGia(nc)] }, select: { id: true } });
  if (!p0) throw new LoiKhongTimThay("Phiếu đánh giá thực tập");
  if (khoa) await khoaChungTu(nc.tx, "intern_evaluations", id);
  return nc.tx.internEvaluation.findUniqueOrThrow({ where: { id } });
}

async function duocChamThucTap(nc: NguCanh, internId: string) {
  if (internId === nc.hoSo.userId) return false;
  return (await laNguoiHuongDan(nc, internId)) || coQuyen(nc.hoSo, "nhan_su.update");
}

export async function taoPhieuThucTap(nc: NguCanh, d: z.infer<typeof LuocDoTaoPhieuThucTap>) {
  batBuocQuyen(nc.hoSo, "danh_gia.view", { objectType: "intern_evaluation" });
  await batBuocLaThucTap(nc, d.nguoiId);
  if (!(await duocChamThucTap(nc, d.nguoiId))) throw new LoiNghiepVu("Chỉ người hướng dẫn hoặc Nhân sự tạo được phiếu đánh giá thực tập.", 403, "khong-duoc-cham");
  const m = await nc.tx.internEvalTemplate.findFirst({ where: { id: d.mauId, status: "hoat-dong" } });
  if (!m) throw new LoiKhongTimThay("Mẫu phiếu");
  const mau = LuocDoMauPhieu.parse(m.layout);
  const ip = await nc.tx.internProfile.findFirst({ where: { userId: d.nguoiId }, select: { startDate: true, endDate: true, mentorId: true } });
  const tu = d.tuNgay || dateVeNgay(ip?.startDate) || congNgay(homNayVN(), -60);
  const den = d.denNgay || dateVeNgay(ip?.endDate) || homNayVN();
  if (den < tu) throw new LoiNghiepVu("Đến ngày phải sau từ ngày.", 422, "khoang-sai");
  const p = await nc.tx.internEvaluation.create({
    data: {
      tenantId: nc.tenantId, userId: d.nguoiId, templateId: m.id, templateSnapshot: { ...mau, _ma: m.code, _ten: m.name, _phienBan: m.version },
      header: await thongTinTuDong(nc, d.nguoiId, mau, tu, den), autoValues: await giaTriTuDong(nc, d.nguoiId, tu, den),
      mentorId: ip?.mentorId ?? null, periodFrom: ngayVeDate(tu), periodTo: ngayVeDate(den), createdBy: nc.hoSo.userId,
    },
    select: { id: true },
  });
  await nc.kiemToan({ action: "tao", objectType: "intern_evaluation", objectId: p.id, after: { nguoiId: d.nguoiId, mau: m.code, tu, den } });
  return { id: p.id };
}

function mauCuaPhieu(p: { templateSnapshot: unknown }): MauPhieu {
  return LuocDoMauPhieu.parse(p.templateSnapshot);
}

export async function chiTietPhieuThucTap(nc: NguCanh, id: string) {
  const p = await docPhieuThucTap(nc, id);
  const mau = mauCuaPhieu(p);
  const snap = p.templateSnapshot as { _ten?: string; _phienBan?: number };
  const ten = await banDoTen(nc.tx, [p.userId, p.mentorId, p.finalizedBy]);
  const tuDong = p.autoValues as Partial<Record<NguonTuDong, number | null>>;
  let ketQua: ReturnType<typeof tinhPhieuThucTap> | null = null;
  try {
    ketQua = tinhPhieuThucTap(mau, p.scores as Record<string, string | number | null>, tuDong);
  } catch {
    ketQua = null;
  }
  const duocCham = await duocChamThucTap(nc, p.userId);
  return {
    phieu: {
      id: p.id, nguoiId: p.userId, hoTen: ten.get(p.userId) ?? "—", nguoiHuongDan: p.mentorId ? (ten.get(p.mentorId) ?? "—") : null,
      tenMau: snap._ten ?? "", phienBanMau: snap._phienBan ?? 1, tuNgay: dateVeNgay(p.periodFrom), denNgay: dateVeNgay(p.periodTo),
      trangThai: p.status, tongDiem: p.totalScore === null ? null : Number(p.totalScore), tongChu: p.totalLetter,
      nguoiChot: p.finalizedBy ? (ten.get(p.finalizedBy) ?? "—") : null, chotLuc: p.finalizedAt,
    },
    mau,
    thongTin: p.header as Record<string, string>,
    diem: p.scores as Record<string, string | number | null>,
    nhanXet: p.comments as Record<string, string>,
    tuDong,
    ketQua,
    nhanNguon: NHAN_NGUON_THONG_TIN,
    quyen: { cham: duocCham && p.status === "nhap", chot: duocCham && p.status === "nhap" && !!ketQua && ketQua.tong !== null, lamMoi: duocCham && p.status === "nhap" },
  };
}

export async function chamPhieuThucTap(nc: NguCanh, id: string, d: z.infer<typeof LuocDoChamThucTap>) {
  const p = await docPhieuThucTap(nc, id, true);
  if (p.status !== "nhap") throw new LoiNghiepVu("Phiếu đã chốt.", 409, "da-chot");
  if (!(await duocChamThucTap(nc, p.userId))) throw new LoiNghiepVu("Chỉ người hướng dẫn hoặc Nhân sự chấm được phiếu này.", 403, "khong-duoc-cham");
  const mau = mauCuaPhieu(p);
  const maTc = new Set(mau.phan.flatMap((x) => x.tieuChi.map((t) => t.ma)));
  const maNx = new Set(mau.oNhanXet.map((x) => x.ma));
  const maTt = new Set(mau.thongTin.filter((t) => t.nguon === "tu-nhap").map((t) => t.ma));
  for (const k of Object.keys(d.diem)) if (!maTc.has(k)) throw new LoiNghiepVu(`Tiêu chí lạ: ${k}`, 422, "tieu-chi-la");
  for (const k of Object.keys(d.nhanXet)) if (!maNx.has(k)) throw new LoiNghiepVu(`Ô nhận xét lạ: ${k}`, 422, "o-la");
  for (const k of Object.keys(d.thongTin)) if (!maTt.has(k)) throw new LoiNghiepVu(`Chỉ sửa được ô thông tin nhập tay (${k}).`, 422, "o-la");
  const diem = { ...(p.scores as Record<string, string | number | null>), ...d.diem };
  let kq;
  try {
    kq = tinhPhieuThucTap(mau, diem, p.autoValues as Partial<Record<NguonTuDong, number | null>>);
  } catch (e) {
    if (e instanceof RangeError) throw new LoiNghiepVu(e.message, 422, "diem-sai");
    throw e;
  }
  await nc.tx.internEvaluation.update({
    where: { id },
    data: {
      scores: diem, comments: { ...(p.comments as Record<string, string>), ...d.nhanXet }, header: { ...(p.header as Record<string, string>), ...d.thongTin },
      totalScore: kq.tong, totalLetter: kq.chu,
    },
  });
  await nc.kiemToan({ action: "cham-thuc-tap", objectType: "intern_evaluation", objectId: id, after: { diem: d.diem, tong: kq.tong } });
  return chiTietPhieuThucTap(nc, id);
}

export async function lamMoiPhieuThucTap(nc: NguCanh, id: string) {
  const p = await docPhieuThucTap(nc, id, true);
  if (p.status !== "nhap") throw new LoiNghiepVu("Phiếu đã chốt.", 409, "da-chot");
  if (!(await duocChamThucTap(nc, p.userId))) throw new LoiNghiepVu("Chỉ người hướng dẫn hoặc Nhân sự.", 403, "khong-duoc-cham");
  const tu = dateVeNgay(p.periodFrom);
  const den = dateVeNgay(p.periodTo);
  const mau = mauCuaPhieu(p);
  const tuDong = await giaTriTuDong(nc, p.userId, tu, den);
  const tt = await thongTinTuDong(nc, p.userId, mau, tu, den);
  const giuTay = Object.fromEntries(mau.thongTin.filter((t) => t.nguon === "tu-nhap").map((t) => [t.ma, (p.header as Record<string, string>)[t.ma] ?? ""]));
  const kq = tinhPhieuThucTap(mau, p.scores as Record<string, string | number | null>, tuDong);
  await nc.tx.internEvaluation.update({ where: { id }, data: { autoValues: tuDong, header: { ...tt, ...giuTay }, totalScore: kq.tong, totalLetter: kq.chu } });
  return chiTietPhieuThucTap(nc, id);
}

/** DG-75: chốt — đủ điểm mọi tiêu chí; sau đó bất biến (trigger). Chốt hai lần → 409. */
export async function chotPhieuThucTap(nc: NguCanh, id: string) {
  const p = await docPhieuThucTap(nc, id, true);
  if (p.status !== "nhap") throw new LoiNghiepVu("Phiếu đã chốt.", 409, "da-chot");
  if (!(await duocChamThucTap(nc, p.userId))) throw new LoiNghiepVu("Chỉ người hướng dẫn hoặc Nhân sự chốt được phiếu này.", 403, "khong-duoc-cham");
  const kq = tinhPhieuThucTap(mauCuaPhieu(p), p.scores as Record<string, string | number | null>, p.autoValues as Partial<Record<NguonTuDong, number | null>>);
  if (kq.tong === null) throw new LoiNghiepVu(`Còn tiêu chí chưa chấm: ${kq.thieu.join(", ")}.`, 422, "thieu-diem");
  await nc.tx.internEvaluation.update({ where: { id }, data: { status: "da-chot", totalScore: kq.tong, totalLetter: kq.chu, finalizedBy: nc.hoSo.userId, finalizedAt: new Date() } });
  await nc.kiemToan({ action: "chot-thuc-tap", objectType: "intern_evaluation", objectId: id, after: { tong: kq.tong, chu: kq.chu } });
  await nc.suKien({ eventType: SU_KIEN.INTERN_EVALUATION_FINALIZED, objectType: "intern_evaluation", objectId: id });
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: p.userId, loai: "thuc-tap-da-chot", tieuDe: `Phiếu đánh giá thực tập đã chốt: ${kq.tong}/10${kq.chu ? ` (${kq.chu})` : ""}`,
    duongDan: `/thuc-tap/danh-gia/${id}`, doiTuong: "intern_evaluation", doiTuongId: id, khoaChongTrung: `thuc-tap-chot:${id}`,
  });
  return chiTietPhieuThucTap(nc, id);
}

export async function danhSachPhieuThucTap(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "danh_gia.view");
  const ds = await nc.tx.internEvaluation.findMany({ where: await locNguoiDanhGia(nc), orderBy: { createdAt: "desc" }, take: 200 });
  const ten = await banDoTen(nc.tx, ds.flatMap((p) => [p.userId, p.mentorId]));
  return ds.map((p) => ({
    id: p.id, nguoiId: p.userId, hoTen: ten.get(p.userId) ?? "—", nguoiHuongDan: p.mentorId ? (ten.get(p.mentorId) ?? "—") : null,
    tenMau: (p.templateSnapshot as { _ten?: string })._ten ?? "", tuNgay: dateVeNgay(p.periodFrom), denNgay: dateVeNgay(p.periodTo),
    trangThai: p.status, tongDiem: p.totalScore === null ? null : Number(p.totalScore), tongChu: p.totalLetter,
  }));
}
