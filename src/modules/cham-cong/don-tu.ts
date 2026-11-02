import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { dateVeNgay, ngayVeDate } from "@/modules/crm/chung";
import { taoThongBao } from "@/modules/thong-bao/service";
import { banDoTen, coTheDuyet, docCauHinhChamCong, kiemDuocDuyet, lichCuaNhieuNguoi, locNguoiXem, ngayLeTrongKhoang, so } from "./chung";
import type { LuocDoGiaiTrinh, LuocDoLocDon, LuocDoQuyetDinh, LuocDoTangCa } from "./luoc-do";
import { duocTinhCong, quyetDinhMoiNhat } from "./service";
import { canhBaoTangCa, congDuKien, congNgay, ganNgayCong, gioVePhut, mocVN, ngayVNCua, tinhCongNgay, tinhTangCa } from "./tinh-toan";

/**
 * Đơn từ chấm công (0.19.0): giải trình / xin chấm bù (NS-20, NS-21) và tăng ca (NS-40 → NS-43).
 * Mỗi hàm đổi trạng thái khóa dòng đơn trước khi đọc (`khoaChungTu`, QĐ-77) — hai người duyệt cùng
 * lúc thì người sau thấy đơn đã được xử lý.
 */

export const NHAN_TRANG_THAI_DON: Record<string, string> = { "cho-duyet": "Chờ duyệt", "da-duyet": "Đã duyệt", "tu-choi": "Từ chối", "da-huy": "Đã hủy" };

async function baoQuanLy(nc: NguCanh, loai: string, tieuDe: string, duongDan: string, doiTuong: string, id: string) {
  const hs = await nc.tx.staffProfile.findFirst({ where: { userId: nc.hoSo.userId }, select: { managerId: true } });
  if (!hs?.managerId || hs.managerId === nc.hoSo.userId) return;
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: hs.managerId, loai, tieuDe, duongDan, doiTuong, doiTuongId: id, khoaChongTrung: `${loai}:${id}`,
  });
}

async function baoNguoiXin(nc: NguCanh, nguoiXinId: string, loai: string, tieuDe: string, noiDung: string | null, duongDan: string, doiTuong: string, id: string, mucDo: "thong-tin" | "canh-bao" = "thong-tin") {
  if (nguoiXinId === nc.hoSo.userId) return;
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: nguoiXinId, loai, mucDo, tieuDe, noiDung, duongDan, doiTuong, doiTuongId: id, khoaChongTrung: `${loai}:${id}`,
  });
}

function locTrangThai(loc: z.infer<typeof LuocDoLocDon>) {
  return loc.trangThai ? { status: loc.trangThai } : {};
}

/** Điều kiện lọc người theo kiểu danh sách: của tôi / chờ tôi duyệt / mọi đơn tôi được xem. */
async function locNguoiDon(nc: NguCanh, loai: z.infer<typeof LuocDoLocDon>["loai"]) {
  if (loai === "cua-toi") return { userId: nc.hoSo.userId };
  const xem = await locNguoiXem(nc);
  if (loai === "tat-ca") return xem;
  return { ...xem, NOT: { userId: nc.hoSo.userId } };
}

// ---------------------------------------------------------------------------
// Giải trình / chấm bù
// ---------------------------------------------------------------------------

/** Giờ chấm bù: giờ VN của ngày công; ca qua đêm thì "sáng hôm sau" cộng 1 ngày. */
export function gioChamBu(ngay: string, gio: string, sangHomSau: boolean): Date | null {
  const p = gioVePhut(gio);
  return p === null ? null : mocVN(sangHomSau ? congNgay(ngay, 1) : ngay, p);
}

export async function taoGiaiTrinh(nc: NguCanh, d: z.infer<typeof LuocDoGiaiTrinh>, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.create", { objectType: "attendance_correction" });
  const luc = gioChamBu(d.ngay, d.gio, d.sangHomSau);
  if (!luc) throw new LoiDinhDang("gio", "Giờ dạng HH:MM.");
  if (luc > bayGio) throw new LoiDinhDang("gio", "Không xin chấm bù cho thời điểm chưa tới.");
  const trung = await nc.tx.attendanceCorrection.findFirst({
    where: { userId: nc.hoSo.userId, workDate: ngayVeDate(d.ngay), direction: d.huong, status: "cho-duyet" },
    select: { id: true },
  });
  if (trung) throw new LoiNghiepVu("Đã có đơn giải trình cùng ngày, cùng chiều đang chờ duyệt.", 409, "trung-don");
  // Kiểm trên chỉ là để báo lỗi dễ hiểu; hai lần gửi cùng lúc do chỉ mục duy nhất riêng phần chặn (QA 0.19.0).
  const gt = await nc.tx.attendanceCorrection
    .create({ data: { tenantId: nc.tenantId, userId: nc.hoSo.userId, workDate: ngayVeDate(d.ngay), punchAt: luc, direction: d.huong, reason: d.lyDo } })
    .catch((e: unknown) => {
      if (laLoiTrung(e)) throw new LoiNghiepVu("Đã có đơn giải trình cùng ngày, cùng chiều đang chờ duyệt.", 409, "trung-don");
      throw e;
    });
  await nc.kiemToan({ action: "tao", objectType: "attendance_correction", objectId: gt.id, after: { ...d } });
  await nc.suKien({ eventType: SU_KIEN.ATTENDANCE_CORRECTION_REQUESTED, objectType: "attendance_correction", objectId: gt.id, payload: { ngay: d.ngay, huong: d.huong } });
  await baoQuanLy(nc, "giai-trinh-cho-duyet", `${nc.hoSo.hoTen} xin chấm bù giờ ${d.huong === "vao" ? "vào" : "ra"} ngày ${d.ngay.split("-").reverse().join("/")}`, "/cham-cong/don-tu", "attendance_correction", gt.id);
  return { id: gt.id };
}

export async function danhSachGiaiTrinh(nc: NguCanh, loc: z.infer<typeof LuocDoLocDon>) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const ds = await nc.tx.attendanceCorrection.findMany({
    where: { AND: [await locNguoiDon(nc, loc.loai), locTrangThai(loc), loc.loai === "cho-toi-duyet" ? { status: "cho-duyet" } : {}] },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, userId: true, workDate: true, punchAt: true, direction: true, reason: true, status: true, decidedBy: true, decidedAt: true, decisionNote: true, createdAt: true, user: { select: { fullName: true } } },
  });
  const ten = await banDoTen(nc.tx, ds.map((x) => x.decidedBy));
  const kq = [];
  for (const g of ds) {
    kq.push({
      id: g.id, nguoi: { id: g.userId, hoTen: g.user.fullName }, ngay: dateVeNgay(g.workDate), luc: g.punchAt, huong: g.direction, lyDo: g.reason,
      trangThai: g.status, nguoiDuyet: g.decidedBy ? ten.get(g.decidedBy) ?? "—" : null, duyetLuc: g.decidedAt, ghiChu: g.decisionNote, taoLuc: g.createdAt,
      duocDuyet: g.status === "cho-duyet" && (await coTheDuyet(nc, g.userId)),
      duocHuy: g.status === "cho-duyet" && g.userId === nc.hoSo.userId,
    });
  }
  return kq;
}

/**
 * Duyệt → sinh MỘT lần chấm nguồn `bo-sung` gắn đơn (chỉ mục duy nhất `attendance_punches_giai_trinh_key`);
 * lần chấm máy / GPS cũ không bị sửa (NS-10, NS-20). Từ chối phải ghi lý do. Người xin tự hủy khi còn chờ.
 */
export async function quyetDinhGiaiTrinh(nc: NguCanh, id: string, d: z.infer<typeof LuocDoQuyetDinh>) {
  await khoaChungTu(nc.tx, "attendance_corrections", id);
  const g = await nc.tx.attendanceCorrection.findFirst({ where: { id } });
  if (!g) throw new LoiKhongTimThay("Đơn giải trình");
  if (d.hanhDong === "huy") {
    if (g.userId !== nc.hoSo.userId) throw new LoiKhongTimThay("Đơn giải trình");
  } else {
    await kiemDuocDuyet(nc, g.userId, { objectType: "attendance_correction", objectId: id });
  }
  if (g.status !== "cho-duyet") throw new LoiNghiepVu(`Đơn đã ở trạng thái "${NHAN_TRANG_THAI_DON[g.status] ?? g.status}".`, 409, "da-xu-ly");
  if (d.hanhDong === "tu-choi" && !d.ghiChu) throw new LoiNghiepVu("Từ chối thì ghi lý do để người xin biết.", 422, "thieu-ly-do");

  let punchId: string | null = null;
  if (d.hanhDong === "duyet") {
    const p = await nc.tx.attendancePunch.create({
      data: { tenantId: nc.tenantId, userId: g.userId, punchedAt: g.punchAt, source: "bo-sung", direction: g.direction, correctionId: g.id, createdBy: nc.hoSo.userId },
    });
    punchId = p.id;
  }
  const trangThai = d.hanhDong === "duyet" ? "da-duyet" : d.hanhDong === "tu-choi" ? "tu-choi" : "da-huy";
  await nc.tx.attendanceCorrection.update({
    where: { id },
    data: {
      status: trangThai, decisionNote: d.ghiChu ?? null, punchId,
      ...(d.hanhDong !== "huy" && { decidedBy: nc.hoSo.userId, decidedAt: new Date() }),
    },
  });
  await nc.kiemToan({ action: d.hanhDong === "duyet" ? "duyet" : d.hanhDong === "tu-choi" ? "tu-choi-duyet" : "huy", objectType: "attendance_correction", objectId: id, before: { trangThai: g.status }, after: { trangThai, ghiChu: d.ghiChu, punchId } });
  await nc.suKien({ eventType: SU_KIEN.ATTENDANCE_CORRECTION_DECIDED, objectType: "attendance_correction", objectId: id, payload: { trangThai, punchId } });
  if (d.hanhDong !== "huy") {
    await baoNguoiXin(nc, g.userId, "giai-trinh-da-xu-ly", d.hanhDong === "duyet" ? "Đơn chấm bù của bạn đã được duyệt" : "Đơn chấm bù của bạn bị từ chối", d.ghiChu ?? null, "/cham-cong/don-tu", "attendance_correction", id, d.hanhDong === "duyet" ? "thong-tin" : "canh-bao");
  }
  return { id, trangThai, punchId };
}

// ---------------------------------------------------------------------------
// Tăng ca
// ---------------------------------------------------------------------------

/** Tổng phút tăng ca ĐÃ DUYỆT của người trong tháng / năm của `ngay` (theo số giờ duyệt), trừ đơn `boQua`. */
async function phutTangCaDaDuyet(nc: NguCanh, userId: string, ngay: string, boQua?: string) {
  const [nam, thang] = ngay.split("-").map(Number);
  const ds = await nc.tx.overtimeRequest.findMany({
    where: { userId, status: "da-duyet", workDate: { gte: ngayVeDate(`${nam}-01-01`), lte: ngayVeDate(`${nam}-12-31`) }, ...(boQua && { NOT: { id: boQua } }) },
    select: { workDate: true, approvedHours: true },
  });
  let thangPhut = 0;
  let namPhut = 0;
  for (const r of ds) {
    const p = Math.round(Number(r.approvedHours ?? 0) * 60);
    namPhut += p;
    if (r.workDate.getUTCMonth() + 1 === thang) thangPhut += p;
  }
  return { thangPhut, namPhut };
}

async function canhBaoTran(nc: NguCanh, userId: string, ngay: string, gio: number, boQua?: string) {
  const ch = await docCauHinhChamCong(nc.tx);
  const da = await phutTangCaDaDuyet(nc, userId, ngay, boQua);
  const phanTram = so(ch.tangCaCanhBaoPhanTram, 80);
  const thang = canhBaoTangCa(da.thangPhut, Math.round(gio * 60), ch.tangCaToiDaThang, phanTram);
  const nam = canhBaoTangCa(da.namPhut, Math.round(gio * 60), ch.tangCaToiDaNam, phanTram);
  const canhBao: string[] = [];
  if (thang.muc) canhBao.push(`${thang.muc === "vuot" ? "Vượt" : "Sắp chạm"} trần tăng ca tháng: ${thang.gioSau.toLocaleString("vi-VN")} / ${thang.tranGio} giờ.`);
  if (nam.muc) canhBao.push(`${nam.muc === "vuot" ? "Vượt" : "Sắp chạm"} trần tăng ca năm: ${nam.gioSau.toLocaleString("vi-VN")} / ${nam.tranGio} giờ.`);
  return { canhBao, chuaDatTran: ch.tangCaToiDaThang === null && ch.tangCaToiDaNam === null };
}

export async function taoDonTangCa(nc: NguCanh, d: z.infer<typeof LuocDoTangCa>) {
  batBuocQuyen(nc.hoSo, "cham_cong.create", { objectType: "overtime_request" });
  const trung = await nc.tx.overtimeRequest.findFirst({
    where: { userId: nc.hoSo.userId, workDate: ngayVeDate(d.ngay), status: { in: ["cho-duyet", "da-duyet"] } },
    select: { id: true },
  });
  if (trung) throw new LoiNghiepVu("Ngày này đã có đơn tăng ca đang chờ hoặc đã duyệt.", 409, "trung-don");
  // Hai lần gửi cùng lúc: chỉ mục duy nhất riêng phần `overtime_requests_mot_don_moi_ngay_key` chặn (QA 0.19.0).
  const r = await nc.tx.overtimeRequest
    .create({ data: { tenantId: nc.tenantId, userId: nc.hoSo.userId, workDate: ngayVeDate(d.ngay), expectedHours: d.soGio, reason: d.lyDo } })
    .catch((e: unknown) => {
      if (laLoiTrung(e)) throw new LoiNghiepVu("Ngày này đã có đơn tăng ca đang chờ hoặc đã duyệt.", 409, "trung-don");
      throw e;
    });
  const cb = await canhBaoTran(nc, nc.hoSo.userId, d.ngay, d.soGio);
  await nc.kiemToan({ action: "tao", objectType: "overtime_request", objectId: r.id, after: { ...d, canhBao: cb.canhBao } });
  await nc.suKien({ eventType: SU_KIEN.OVERTIME_REQUESTED, objectType: "overtime_request", objectId: r.id, payload: { ngay: d.ngay, soGio: d.soGio } });
  await baoQuanLy(nc, "tang-ca-cho-duyet", `${nc.hoSo.hoTen} xin tăng ca ${d.soGio} giờ ngày ${d.ngay.split("-").reverse().join("/")}`, "/cham-cong/don-tu", "overtime_request", r.id);
  return { id: r.id, canhBao: cb.canhBao };
}

export async function quyetDinhTangCa(nc: NguCanh, id: string, d: z.infer<typeof LuocDoQuyetDinh>) {
  await khoaChungTu(nc.tx, "overtime_requests", id);
  const r = await nc.tx.overtimeRequest.findFirst({ where: { id } });
  if (!r) throw new LoiKhongTimThay("Đơn tăng ca");
  if (d.hanhDong === "huy") {
    if (r.userId !== nc.hoSo.userId) throw new LoiKhongTimThay("Đơn tăng ca");
  } else {
    await kiemDuocDuyet(nc, r.userId, { objectType: "overtime_request", objectId: id });
  }
  if (r.status !== "cho-duyet") throw new LoiNghiepVu(`Đơn đã ở trạng thái "${NHAN_TRANG_THAI_DON[r.status] ?? r.status}".`, 409, "da-xu-ly");
  if (d.hanhDong === "tu-choi" && !d.ghiChu) throw new LoiNghiepVu("Từ chối thì ghi lý do để người xin biết.", 422, "thieu-ly-do");
  const xin = Number(r.expectedHours);
  const gioDuyet = d.hanhDong === "duyet" ? d.gioDuyet ?? xin : null;
  if (gioDuyet !== null && gioDuyet > xin) throw new LoiDinhDang("gioDuyet", "Không duyệt nhiều hơn số giờ xin.");
  const ngay = dateVeNgay(r.workDate);
  const cb = gioDuyet !== null ? await canhBaoTran(nc, r.userId, ngay, gioDuyet, id) : { canhBao: [] as string[] };
  const trangThai = d.hanhDong === "duyet" ? "da-duyet" : d.hanhDong === "tu-choi" ? "tu-choi" : "da-huy";
  await nc.tx.overtimeRequest.update({
    where: { id },
    data: {
      status: trangThai, approvedHours: gioDuyet, decisionNote: d.ghiChu ?? null,
      ...(d.hanhDong !== "huy" && { decidedBy: nc.hoSo.userId, decidedAt: new Date() }),
    },
  });
  await nc.kiemToan({ action: d.hanhDong === "duyet" ? "duyet" : d.hanhDong === "tu-choi" ? "tu-choi-duyet" : "huy", objectType: "overtime_request", objectId: id, before: { trangThai: r.status }, after: { trangThai, gioDuyet, canhBao: cb.canhBao } });
  await nc.suKien({ eventType: SU_KIEN.OVERTIME_DECIDED, objectType: "overtime_request", objectId: id, payload: { trangThai, gioDuyet } });
  if (d.hanhDong !== "huy") {
    await baoNguoiXin(nc, r.userId, "tang-ca-da-xu-ly", d.hanhDong === "duyet" ? `Đơn tăng ca ngày ${ngay.split("-").reverse().join("/")} đã được duyệt (${gioDuyet} giờ)` : "Đơn tăng ca của bạn bị từ chối", d.ghiChu ?? null, "/cham-cong/don-tu", "overtime_request", id, d.hanhDong === "duyet" ? "thong-tin" : "canh-bao");
  }
  return { id, trangThai, gioDuyet, canhBao: cb.canhBao };
}

/**
 * Giờ tăng ca THỰC TẾ của một đơn đã duyệt (NS-41): tính từ lần chấm của ngày đó, không vượt số giờ
 * duyệt; tách phần giờ đêm; phân loại ngày thường / nghỉ tuần / lễ.
 */
export async function tangCaThucTe(nc: NguCanh, id: string) {
  const r = await nc.tx.overtimeRequest.findFirst({ where: { AND: [{ id }, await locNguoiXem(nc)] } });
  if (!r) throw new LoiKhongTimThay("Đơn tăng ca");
  const ngay = dateVeNgay(r.workDate);
  const ch = await docCauHinhChamCong(nc.tx);
  const [truoc, sau] = [congNgay(ngay, -1), congNgay(ngay, 1)];
  const lich = (await lichCuaNhieuNguoi(nc.tx, [r.userId], sau)).get(r.userId)!;
  const le = await ngayLeTrongKhoang(nc.tx, truoc, sau);
  const cacNgay = [truoc, ngay, sau].map((x) => {
    const l = lich(x);
    return congDuKien(x, l?.ca ?? null, l?.ngay ?? null, le.has(x));
  });
  const lan = await nc.tx.attendancePunch.findMany({
    where: { userId: r.userId, punchedAt: { gte: mocVN(truoc, 0), lt: mocVN(congNgay(sau, 1), 0) } },
    select: { id: true, punchedAt: true, gpsResult: true, flags: true },
  });
  const qd = await quyetDinhMoiNhat(nc.tx, lan.map((p) => p.id));
  const nhom = ganNgayCong(lan.filter((p) => duocTinhCong(p, qd.get(p.id))).map((p) => p.punchedAt), cacNgay, so(ch.cuaSoTruocPhut, 240), so(ch.cuaSoSauPhut, 480)).get(ngay) ?? [];
  const cong = tinhCongNgay(cacNgay[1], nhom, null, { choPhepMuonPhut: so(ch.choPhepMuonPhut, 5), choPhepSomPhut: so(ch.choPhepSomPhut, 5) });
  const tc = tinhTangCa(cacNgay[1], cong.vaoDau, cong.raCuoi, r.status === "da-duyet" ? Number(r.approvedHours ?? 0) : null, {
    batDauGio: so(ch.gioDemBatDau, 22), ketThucGio: so(ch.gioDemKetThuc, 6),
  });
  return { id, ngay, ...tc, gioDuyet: r.approvedHours === null ? null : Number(r.approvedHours) };
}

export async function danhSachTangCa(nc: NguCanh, loc: z.infer<typeof LuocDoLocDon>) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const ds = await nc.tx.overtimeRequest.findMany({
    where: { AND: [await locNguoiDon(nc, loc.loai), locTrangThai(loc), loc.loai === "cho-toi-duyet" ? { status: "cho-duyet" } : {}] },
    orderBy: { workDate: "desc" },
    take: 200,
    select: { id: true, userId: true, workDate: true, expectedHours: true, approvedHours: true, reason: true, status: true, decidedBy: true, decidedAt: true, decisionNote: true, user: { select: { fullName: true } } },
  });
  const ten = await banDoTen(nc.tx, ds.map((x) => x.decidedBy));
  const homNay = ngayVNCua(new Date());
  const kq = [];
  for (const r of ds) {
    const ngay = dateVeNgay(r.workDate);
    kq.push({
      id: r.id, nguoi: { id: r.userId, hoTen: r.user.fullName }, ngay, soGio: Number(r.expectedHours),
      gioDuyet: r.approvedHours === null ? null : Number(r.approvedHours), lyDo: r.reason, trangThai: r.status,
      nguoiDuyet: r.decidedBy ? ten.get(r.decidedBy) ?? "—" : null, duyetLuc: r.decidedAt, ghiChu: r.decisionNote,
      thucTe: r.status === "da-duyet" && ngay <= homNay ? await tangCaThucTe(nc, r.id) : null,
      duocDuyet: r.status === "cho-duyet" && (await coTheDuyet(nc, r.userId)),
      duocHuy: r.status === "cho-duyet" && r.userId === nc.hoSo.userId,
    });
  }
  return kq;
}
