import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { laCaQuaDem, phutVeGio } from "@/modules/cham-cong/tinh-toan";
import { banDoTen, laLichNgay, lichCuaNhieuNguoi } from "@/modules/cham-cong/chung";
import { apDungPinChuaKhop } from "@/modules/cham-cong/may-cham-cong";
import {
  LuocDoCa,
  LuocDoDiaDiem,
  LuocDoDieuChinhPhep,
  LuocDoGanLich,
  LuocDoHopDong,
  LuocDoHoSoNhanSu,
  LuocDoLich,
  LuocDoLoaiNghi,
  LuocDoNgayLe,
  LuocDoSuaHopDong,
} from "./luoc-do";

/**
 * Nhân sự (0.19.0) — thiết lập dùng cho chấm công: địa điểm, ca, lịch tuần, gán lịch, ngày lễ, loại
 * nghỉ, điều chỉnh quỹ phép; hồ sơ nhân sự mở rộng (loại nhân sự, mã chấm công, thực tập, hợp đồng).
 * Quyền `nhan_su.*`. Luật: BUSINESS_RULES.md mục 30 (NS-01 → NS-08).
 *
 * Không xóa gì: địa điểm, ca, lịch, ngày lễ, loại nghỉ chỉ đổi trạng thái (mục 1 luật chung).
 */

async function suKien(nc: NguCanh, doiTuong: string, id: string, hanhDong: string, them: Record<string, unknown> = {}) {
  await nc.suKien({ eventType: SU_KIEN.HR_SETUP_CHANGED, objectType: doiTuong, objectId: id, payload: { hanhDong, ...them } });
}

// ---------------------------------------------------------------------------
// Địa điểm làm việc
// ---------------------------------------------------------------------------

/** Danh sách địa điểm — người có `cham_cong.view` cũng đọc được (lọc bảng trực tiếp). */
export async function danhSachDiaDiem(nc: NguCanh, chiHoatDong = false) {
  if (!coQuyen(nc.hoSo, "nhan_su.view") && !coQuyen(nc.hoSo, "cham_cong.view")) batBuocQuyen(nc.hoSo, "nhan_su.view");
  const ds = await nc.tx.workLocation.findMany({
    where: chiHoatDong ? { status: "hoat-dong" } : {},
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: { id: true, name: true, address: true, latitude: true, longitude: true, radiusM: true, status: true, _count: { select: { devices: true } } },
  });
  return ds.map((d) => ({
    id: d.id, ten: d.name, diaChi: d.address, viDo: d.latitude, kinhDo: d.longitude, banKinhM: d.radiusM, trangThai: d.status, soMay: d._count.devices,
  }));
}

export async function taoDiaDiem(nc: NguCanh, d: z.infer<typeof LuocDoDiaDiem>) {
  batBuocQuyen(nc.hoSo, "nhan_su.create", { objectType: "work_location" });
  try {
    const dd = await nc.tx.workLocation.create({
      data: {
        tenantId: nc.tenantId, name: d.ten, address: d.diaChi ?? null, latitude: d.viDo, longitude: d.kinhDo,
        radiusM: d.banKinhM ?? null, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId,
      },
    });
    await nc.kiemToan({ action: "tao", objectType: "work_location", objectId: dd.id, after: { ...d } });
    await suKien(nc, "work_location", dd.id, "tao");
    return { id: dd.id };
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ten", "Đã có địa điểm cùng tên.");
    throw e;
  }
}

export async function suaDiaDiem(nc: NguCanh, id: string, d: z.infer<typeof LuocDoDiaDiem>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "work_location", objectId: id });
  const cu = await nc.tx.workLocation.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Địa điểm");
  if (d.trangThai === "ngung-hoat-dong" && cu.status === "hoat-dong") {
    const may = await nc.tx.attendanceDevice.count({ where: { locationId: id, status: "hoat-dong" } });
    if (may > 0) throw new LoiNghiepVu(`Địa điểm còn ${may} máy chấm công đang hoạt động — chuyển máy sang địa điểm khác trước.`, 422, "con-may");
  }
  try {
    await nc.tx.workLocation.update({
      where: { id },
      data: {
        name: d.ten, address: d.diaChi ?? null, latitude: d.viDo, longitude: d.kinhDo, radiusM: d.banKinhM ?? null,
        ...(d.trangThai && { status: d.trangThai }), updatedBy: nc.hoSo.userId,
      },
    });
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ten", "Đã có địa điểm cùng tên.");
    throw e;
  }
  await nc.kiemToan({
    action: "sua", objectType: "work_location", objectId: id,
    before: { ten: cu.name, viDo: cu.latitude, kinhDo: cu.longitude, banKinhM: cu.radiusM, trangThai: cu.status },
    after: { ...d },
  });
  await suKien(nc, "work_location", id, "sua");
  return { id };
}

// ---------------------------------------------------------------------------
// Ca làm và lịch tuần
// ---------------------------------------------------------------------------

export async function danhSachCa(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "nhan_su.view");
  const ds = await nc.tx.workShift.findMany({ orderBy: [{ status: "asc" }, { code: "asc" }] });
  return ds.map((c) => ({
    id: c.id, ma: c.code, ten: c.name, gioVao: phutVeGio(c.startMinute), gioRa: phutVeGio(c.endMinute),
    gioNghi: c.breakStartMinute === null ? null : phutVeGio(c.breakStartMinute), phutNghi: c.breakMinutes, quaDem: c.overnight,
    choPhepMuonPhut: c.lateGraceMinutes, choPhepSomPhut: c.earlyGraceMinutes, trangThai: c.status,
  }));
}

function duLieuCa(d: z.infer<typeof LuocDoCa>) {
  if (d.gioVao === d.gioRa) throw new LoiDinhDang("gioRa", "Giờ ra phải khác giờ vào.");
  const quaDem = laCaQuaDem({ batDauPhut: d.gioVao, ketThucPhut: d.gioRa });
  const dai = (quaDem ? d.gioRa + 1440 : d.gioRa) - d.gioVao;
  if (d.phutNghi >= dai) throw new LoiDinhDang("phutNghi", "Thời gian nghỉ phải ngắn hơn cả ca.");
  return {
    code: d.ma, name: d.ten, startMinute: d.gioVao, endMinute: d.gioRa, breakStartMinute: d.gioNghi, breakMinutes: d.phutNghi,
    overnight: quaDem, lateGraceMinutes: d.choPhepMuonPhut ?? null, earlyGraceMinutes: d.choPhepSomPhut ?? null,
  };
}

export async function taoCa(nc: NguCanh, d: z.infer<typeof LuocDoCa>) {
  batBuocQuyen(nc.hoSo, "nhan_su.create", { objectType: "work_shift" });
  try {
    const c = await nc.tx.workShift.create({ data: { tenantId: nc.tenantId, ...duLieuCa(d), createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId } });
    await nc.kiemToan({ action: "tao", objectType: "work_shift", objectId: c.id, after: { ...d } });
    await suKien(nc, "work_shift", c.id, "tao");
    return { id: c.id };
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ma", "Mã ca đã có.");
    throw e;
  }
}

export async function suaCa(nc: NguCanh, id: string, d: z.infer<typeof LuocDoCa>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "work_shift", objectId: id });
  const cu = await nc.tx.workShift.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Ca làm");
  try {
    await nc.tx.workShift.update({ where: { id }, data: { ...duLieuCa(d), ...(d.trangThai && { status: d.trangThai }), updatedBy: nc.hoSo.userId } });
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ma", "Mã ca đã có.");
    throw e;
  }
  await nc.kiemToan({
    action: "sua", objectType: "work_shift", objectId: id,
    before: { ma: cu.code, vao: cu.startMinute, ra: cu.endMinute, nghi: cu.breakMinutes, trangThai: cu.status }, after: { ...d },
  });
  await suKien(nc, "work_shift", id, "sua");
  return { id };
}

export async function danhSachLich(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "nhan_su.view");
  const ds = await nc.tx.workSchedule.findMany({
    orderBy: [{ status: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, days: true, status: true, isDefault: true, shift: { select: { id: true, name: true, code: true } }, _count: { select: { assignments: true } } },
  });
  return ds.map((l) => ({ id: l.id, ma: l.code, ten: l.name, ngay: laLichNgay(l.days) ? l.days : [], trangThai: l.status, macDinh: l.isDefault, ca: l.shift, soLanGan: l._count.assignments }));
}

/**
 * 0.22.0 (QĐ-171): chọn lịch MẶC ĐỊNH của doanh nghiệp — áp cho mọi người chưa được gán lịch (bảng trực tiếp ghi "theo
 * lịch mặc định"). Một lịch mặc định mỗi doanh nghiệp (chỉ mục duy nhất riêng phần). Khóa tư vấn theo doanh nghiệp để hai
 * lần chọn cùng lúc không đụng chỉ mục.
 */
export async function datLichMacDinh(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "work_schedule", objectId: id });
  await nc.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lich-mac-dinh:${nc.tenantId}`}))`;
  const l = await nc.tx.workSchedule.findFirst({ where: { id }, select: { id: true, name: true, status: true, isDefault: true } });
  if (!l) throw new LoiKhongTimThay("Lịch làm");
  if (l.status !== "hoat-dong") throw new LoiNghiepVu("Lịch đã ngừng — bật lại trước khi chọn làm mặc định.", 422, "lich-ngung");
  const cu = await nc.tx.workSchedule.findFirst({ where: { isDefault: true }, select: { id: true } });
  if (cu?.id === id) return { id, macDinh: true };
  if (cu) await nc.tx.workSchedule.update({ where: { id: cu.id }, data: { isDefault: false, updatedBy: nc.hoSo.userId } });
  await nc.tx.workSchedule.update({ where: { id }, data: { isDefault: true, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "dat-lich-mac-dinh", objectType: "work_schedule", objectId: id, before: { lichMacDinh: cu?.id ?? null }, after: { lichMacDinh: id, ten: l.name } });
  await suKien(nc, "work_schedule", id, "dat-mac-dinh");
  return { id, macDinh: true };
}

async function kiemCa(nc: NguCanh, caId: string) {
  const ca = await nc.tx.workShift.findFirst({ where: { id: caId, status: "hoat-dong" }, select: { id: true } });
  if (!ca) throw new LoiDinhDang("caId", "Ca không tồn tại hoặc đã ngừng.");
}

export async function taoLich(nc: NguCanh, d: z.infer<typeof LuocDoLich>) {
  batBuocQuyen(nc.hoSo, "nhan_su.create", { objectType: "work_schedule" });
  await kiemCa(nc, d.caId);
  try {
    const l = await nc.tx.workSchedule.create({
      data: { tenantId: nc.tenantId, code: d.ma, name: d.ten, shiftId: d.caId, days: d.ngay, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
    });
    await nc.kiemToan({ action: "tao", objectType: "work_schedule", objectId: l.id, after: { ...d } });
    await suKien(nc, "work_schedule", l.id, "tao");
    return { id: l.id };
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ma", "Mã lịch đã có.");
    throw e;
  }
}

/**
 * Sửa lịch tuần áp NGAY cho mọi người đang dùng lịch đó, kể cả ngày đã qua của kỳ chưa khóa — bảng
 * công đã khóa không đổi (NS-52). Muốn đổi từ một ngày thì tạo lịch mới và gán từ ngày đó.
 */
export async function suaLich(nc: NguCanh, id: string, d: z.infer<typeof LuocDoLich>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "work_schedule", objectId: id });
  const cu = await nc.tx.workSchedule.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Lịch làm");
  if (d.caId !== cu.shiftId) await kiemCa(nc, d.caId);
  try {
    await nc.tx.workSchedule.update({
      where: { id },
      data: { code: d.ma, name: d.ten, shiftId: d.caId, days: d.ngay, ...(d.trangThai && { status: d.trangThai }), updatedBy: nc.hoSo.userId },
    });
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ma", "Mã lịch đã có.");
    throw e;
  }
  await nc.kiemToan({ action: "sua", objectType: "work_schedule", objectId: id, before: { ma: cu.code, ngay: cu.days, caId: cu.shiftId }, after: { ...d } });
  await suKien(nc, "work_schedule", id, "sua");
  return { id };
}

/** Gán lịch cho nhiều người từ một ngày (NS-07). Cùng người + cùng ngày bắt đầu thì thay lịch của dòng đó. */
export async function ganLich(nc: NguCanh, d: z.infer<typeof LuocDoGanLich>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "schedule_assignment" });
  const lich = await nc.tx.workSchedule.findFirst({ where: { id: d.lichId, status: "hoat-dong" }, select: { id: true } });
  if (!lich) throw new LoiDinhDang("lichId", "Lịch không tồn tại hoặc đã ngừng.");
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "nhan_su.update");
  const nguoi = await nc.tx.user.findMany({
    where: { id: { in: d.nguoiIds }, isSystem: false, ...(pv !== "tat-ca" && { id: { in: d.nguoiIds.filter((x) => pv.includes(x)) } }) },
    select: { id: true },
  });
  if (nguoi.length !== new Set(d.nguoiIds).size) throw new LoiNghiepVu("Có người không tồn tại hoặc ngoài phạm vi quản lý của bạn.", 422, "nguoi-khong-hop-le");
  const tu = ngayVeDate(d.tuNgay);
  for (const n of nguoi) {
    await nc.tx.scheduleAssignment.upsert({
      where: { tenantId_userId_effectiveFrom: { tenantId: nc.tenantId, userId: n.id, effectiveFrom: tu } },
      update: { scheduleId: d.lichId, note: d.ghiChu ?? null },
      create: { tenantId: nc.tenantId, userId: n.id, scheduleId: d.lichId, effectiveFrom: tu, note: d.ghiChu ?? null, createdBy: nc.hoSo.userId },
    });
  }
  await nc.kiemToan({ action: "sua", objectType: "schedule_assignment", after: { lichId: d.lichId, tuNgay: d.tuNgay, soNguoi: nguoi.length } });
  await suKien(nc, "schedule_assignment", d.lichId, "gan-lich", { tuNgay: d.tuNgay, nguoiIds: d.nguoiIds });
  return { soNguoi: nguoi.length };
}

// ---------------------------------------------------------------------------
// Ngày lễ
// ---------------------------------------------------------------------------

export async function danhSachNgayLe(nc: NguCanh, nam: number) {
  batBuocQuyen(nc.hoSo, "nhan_su.view");
  const ds = await nc.tx.holiday.findMany({
    where: { date: { gte: ngayVeDate(`${nam}-01-01`), lte: ngayVeDate(`${nam}-12-31`) } },
    orderBy: { date: "asc" },
  });
  return ds.map((h) => ({ id: h.id, ngay: dateVeNgay(h.date), ten: h.name, trangThai: h.status }));
}

export async function taoNgayLe(nc: NguCanh, d: z.infer<typeof LuocDoNgayLe>) {
  batBuocQuyen(nc.hoSo, "nhan_su.create", { objectType: "holiday" });
  const cu = await nc.tx.holiday.findFirst({ where: { date: ngayVeDate(d.ngay) } });
  if (cu && cu.status === "hoat-dong") throw new LoiDinhDang("ngay", `Ngày này đã là ngày lễ: ${cu.name}.`);
  const h = cu
    ? await nc.tx.holiday.update({ where: { id: cu.id }, data: { name: d.ten, status: "hoat-dong", updatedBy: nc.hoSo.userId } })
    : await nc.tx.holiday.create({ data: { tenantId: nc.tenantId, date: ngayVeDate(d.ngay), name: d.ten, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "tao", objectType: "holiday", objectId: h.id, after: { ...d } });
  await suKien(nc, "holiday", h.id, "tao", { ngay: d.ngay });
  return { id: h.id };
}

export async function doiTrangThaiNgayLe(nc: NguCanh, id: string, trangThai: "hoat-dong" | "ngung-hoat-dong") {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "holiday", objectId: id });
  const cu = await nc.tx.holiday.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Ngày lễ");
  await nc.tx.holiday.update({ where: { id }, data: { status: trangThai, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "holiday", objectId: id, before: { trangThai: cu.status }, after: { trangThai } });
  await suKien(nc, "holiday", id, trangThai);
  return { id };
}

// ---------------------------------------------------------------------------
// Loại nghỉ, điều chỉnh quỹ phép
// ---------------------------------------------------------------------------

/** Loại nghỉ — ai gửi đơn nghỉ cũng cần đọc (chỉ loại đang dùng). */
export async function danhSachLoaiNghi(nc: NguCanh, chiHoatDong = true) {
  if (!chiHoatDong) batBuocQuyen(nc.hoSo, "nhan_su.view");
  const ds = await nc.tx.leaveType.findMany({
    where: chiHoatDong ? { status: "hoat-dong" } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return ds.map((l) => ({ id: l.id, ma: l.code, ten: l.name, coLuong: l.paid, truPhepNam: l.usesBalance, thuTu: l.sortOrder, trangThai: l.status }));
}

export async function taoLoaiNghi(nc: NguCanh, d: z.infer<typeof LuocDoLoaiNghi>) {
  batBuocQuyen(nc.hoSo, "nhan_su.create", { objectType: "leave_type" });
  try {
    const l = await nc.tx.leaveType.create({
      data: {
        tenantId: nc.tenantId, code: d.ma, name: d.ten, paid: d.coLuong, usesBalance: d.truPhepNam, sortOrder: d.thuTu,
        createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId,
      },
    });
    await nc.kiemToan({ action: "tao", objectType: "leave_type", objectId: l.id, after: { ...d } });
    await suKien(nc, "leave_type", l.id, "tao");
    return { id: l.id };
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ma", "Mã loại nghỉ đã có.");
    throw e;
  }
}

/**
 * Sửa loại nghỉ. Đổi "trừ phép năm" / "có lương" áp cho đơn duyệt SAU lần sửa và cho bảng công chưa
 * khóa; quỹ phép tính lúc đọc nên đơn cũ của loại này cũng được tính lại — vì thế chặn đổi "trừ phép
 * năm" khi loại đã có đơn đã duyệt (tránh quỹ phép của mọi người nhảy số).
 */
export async function suaLoaiNghi(nc: NguCanh, id: string, d: z.infer<typeof LuocDoLoaiNghi>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "leave_type", objectId: id });
  const cu = await nc.tx.leaveType.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Loại nghỉ");
  if (cu.usesBalance !== d.truPhepNam && (await nc.tx.leaveRequest.count({ where: { leaveTypeId: id, status: "da-duyet" } })) > 0) {
    throw new LoiNghiepVu("Loại nghỉ đã có đơn được duyệt — không đổi được \"trừ phép năm\". Tạo loại nghỉ mới thay thế.", 422, "loai-nghi-da-dung");
  }
  try {
    await nc.tx.leaveType.update({
      where: { id },
      data: { code: d.ma, name: d.ten, paid: d.coLuong, usesBalance: d.truPhepNam, sortOrder: d.thuTu, ...(d.trangThai && { status: d.trangThai }), updatedBy: nc.hoSo.userId },
    });
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ma", "Mã loại nghỉ đã có.");
    throw e;
  }
  await nc.kiemToan({
    action: "sua", objectType: "leave_type", objectId: id,
    before: { ma: cu.code, ten: cu.name, coLuong: cu.paid, truPhepNam: cu.usesBalance, trangThai: cu.status }, after: { ...d },
  });
  await suKien(nc, "leave_type", id, "sua");
  return { id };
}

/** Điều chỉnh tay quỹ phép (số dư đầu kỳ, thưởng, trừ) — chỉ ghi thêm, bắt buộc lý do (NS-32). */
export async function dieuChinhPhep(nc: NguCanh, d: z.infer<typeof LuocDoDieuChinhPhep>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "leave_adjustment" });
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "nhan_su.update");
  if (pv !== "tat-ca" && !pv.includes(d.nguoiId)) throw new LoiKhongTimThay("Nhân viên");
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  const dc = await nc.tx.leaveAdjustment.create({
    data: { tenantId: nc.tenantId, userId: d.nguoiId, year: d.nam, days: d.soNgay, reason: d.lyDo, createdBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "tao", objectType: "leave_adjustment", objectId: dc.id, after: { ...d } });
  await suKien(nc, "leave_adjustment", dc.id, "dieu-chinh", { nguoiId: d.nguoiId, nam: d.nam, soNgay: d.soNgay });
  return { id: dc.id };
}

// ---------------------------------------------------------------------------
// Hồ sơ nhân sự mở rộng
// ---------------------------------------------------------------------------

async function locHoSo(nc: NguCanh, ma: "nhan_su.view" | "nhan_su.update") {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, ma);
  return pv === "tat-ca" ? {} : { id: { in: pv } };
}

export async function danhSachHoSoNhanSu(nc: NguCanh, loc: { q?: string; loai?: string; phongBanId?: string } = {}) {
  batBuocQuyen(nc.hoSo, "nhan_su.view");
  const ds = await nc.tx.user.findMany({
    where: {
      AND: [
        await locHoSo(nc, "nhan_su.view"),
        { isSystem: false, status: "hoat-dong" },
        loc.q ? { OR: [{ fullName: { contains: loc.q, mode: "insensitive" } }, { email: { contains: loc.q, mode: "insensitive" } }, { staffProfile: { attendancePin: loc.q } }] } : {},
        loc.loai ? { staffProfile: { staffType: loc.loai } } : {},
        loc.phongBanId ? { staffProfile: { departmentId: loc.phongBanId } } : {},
      ],
    },
    orderBy: { fullName: "asc" },
    take: 500,
    select: {
      id: true, fullName: true, email: true,
      staffProfile: {
        select: {
          staffType: true, attendancePin: true, employeeCode: true, jobTitle: true, hiredAt: true,
          department: { select: { id: true, name: true } }, manager: { select: { id: true, fullName: true } },
          defaultLocation: { select: { id: true, name: true } },
        },
      },
      _count: { select: { employmentContracts: true } },
    },
  });
  const homNay = homNayVN();
  const lich = await lichCuaNhieuNguoi(nc.tx, ds.map((u) => u.id), homNay);
  return ds.map((u) => {
    const l = lich.get(u.id)?.(homNay) ?? null;
    return {
      id: u.id, hoTen: u.fullName, email: u.email,
      loaiNhanSu: u.staffProfile?.staffType ?? "chinh-thuc",
      maChamCong: u.staffProfile?.attendancePin ?? null,
      maNhanVien: u.staffProfile?.employeeCode ?? null,
      chucDanh: u.staffProfile?.jobTitle ?? null,
      ngayVaoLam: u.staffProfile?.hiredAt ? dateVeNgay(u.staffProfile.hiredAt) : null,
      phongBan: u.staffProfile?.department ?? null,
      quanLy: u.staffProfile?.manager ? { id: u.staffProfile.manager.id, hoTen: u.staffProfile.manager.fullName } : null,
      diaDiem: u.staffProfile?.defaultLocation ? { id: u.staffProfile.defaultLocation.id, ten: u.staffProfile.defaultLocation.name } : null,
      lichHienTai: l ? `${l.tenLich} (${l.tenCa})` : null,
      soHopDong: u._count.employmentContracts,
    };
  });
}

export async function chiTietHoSoNhanSu(nc: NguCanh, userId: string) {
  batBuocQuyen(nc.hoSo, "nhan_su.view");
  const u = await nc.tx.user.findFirst({
    where: { AND: [{ id: userId, isSystem: false }, await locHoSo(nc, "nhan_su.view")] },
    select: {
      id: true, fullName: true, email: true, status: true,
      staffProfile: {
        select: {
          staffType: true, attendancePin: true, employeeCode: true, jobTitle: true, hiredAt: true, defaultLocationId: true,
          department: { select: { name: true } }, manager: { select: { id: true, fullName: true } },
        },
      },
      internProfile: true,
      employmentContracts: { orderBy: { startDate: "desc" } },
      scheduleAssignments: { orderBy: { effectiveFrom: "desc" }, take: 10, select: { id: true, effectiveFrom: true, note: true, schedule: { select: { name: true, shift: { select: { name: true } } } } } },
    },
  });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  const ten = await banDoTen(nc.tx, [u.internProfile?.mentorId]);
  const tp = u.internProfile;
  return {
    id: u.id, hoTen: u.fullName, email: u.email, trangThai: u.status,
    loaiNhanSu: u.staffProfile?.staffType ?? "chinh-thuc",
    maChamCong: u.staffProfile?.attendancePin ?? null,
    maNhanVien: u.staffProfile?.employeeCode ?? null,
    chucDanh: u.staffProfile?.jobTitle ?? null,
    ngayVaoLam: u.staffProfile?.hiredAt ? dateVeNgay(u.staffProfile.hiredAt) : null,
    diaDiemMacDinhId: u.staffProfile?.defaultLocationId ?? null,
    phongBan: u.staffProfile?.department?.name ?? null,
    quanLy: u.staffProfile?.manager ? { id: u.staffProfile.manager.id, hoTen: u.staffProfile.manager.fullName } : null,
    thucTap: tp
      ? {
          truong: tp.school, khoa: tp.faculty, mssv: tp.studentCode, giangVienHuongDan: tp.academicSupervisor,
          nguoiHuongDan: tp.mentorId ? { id: tp.mentorId, hoTen: ten.get(tp.mentorId) ?? "—" } : null,
          tuNgay: tp.startDate ? dateVeNgay(tp.startDate) : null, denNgay: tp.endDate ? dateVeNgay(tp.endDate) : null, ghiChu: tp.note,
        }
      : null,
    hopDong: u.employmentContracts.map((h) => ({
      id: h.id, loai: h.contractType, tuNgay: dateVeNgay(h.startDate), denNgay: h.endDate ? dateVeNgay(h.endDate) : null, ghiChu: h.note, trangThai: h.status,
    })),
    lich: u.scheduleAssignments.map((g) => ({ id: g.id, tuNgay: dateVeNgay(g.effectiveFrom), ten: `${g.schedule.name} (${g.schedule.shift.name})`, ghiChu: g.note })),
  };
}

/**
 * Sửa hồ sơ nhân sự (NS-01, NS-02). Đặt / đổi mã chấm công thì các lần chấm vân tay "chưa khớp" mang
 * đúng PIN đó được gán ngay cho người này (NS-15). Mã chấm công là duy nhất trong doanh nghiệp.
 */
export async function suaHoSoNhanSu(nc: NguCanh, userId: string, d: z.infer<typeof LuocDoHoSoNhanSu>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "staff_profile", objectId: userId });
  const u = await nc.tx.user.findFirst({
    where: { AND: [{ id: userId, isSystem: false }, await locHoSo(nc, "nhan_su.update")] },
    select: { id: true, staffProfile: true, internProfile: true },
  });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  if (d.diaDiemMacDinhId) {
    const dd = await nc.tx.workLocation.findFirst({ where: { id: d.diaDiemMacDinhId, status: "hoat-dong" }, select: { id: true } });
    if (!dd) throw new LoiDinhDang("diaDiemMacDinhId", "Địa điểm không tồn tại hoặc đã ngừng.");
  }
  if (d.thucTap?.nguoiHuongDanId) {
    if (d.thucTap.nguoiHuongDanId === userId) throw new LoiDinhDang("nguoiHuongDanId", "Người hướng dẫn phải là người khác.");
    const m = await nc.tx.user.findFirst({ where: { id: d.thucTap.nguoiHuongDanId, isSystem: false, status: "hoat-dong" }, select: { id: true } });
    if (!m) throw new LoiDinhDang("nguoiHuongDanId", "Người hướng dẫn không tồn tại hoặc đã ngừng hoạt động.");
  }
  if (d.thucTap?.tuNgay && d.thucTap.denNgay && d.thucTap.denNgay < d.thucTap.tuNgay) throw new LoiDinhDang("denNgay", "Ngày kết thúc thực tập phải sau ngày bắt đầu.");

  const truoc = {
    loaiNhanSu: u.staffProfile?.staffType ?? null,
    maChamCong: u.staffProfile?.attendancePin ?? null,
    diaDiemMacDinhId: u.staffProfile?.defaultLocationId ?? null,
    ngayVaoLam: u.staffProfile?.hiredAt ? dateVeNgay(u.staffProfile.hiredAt) : null,
  };
  const duLieu = {
    ...(d.loaiNhanSu && { staffType: d.loaiNhanSu }),
    ...(d.maChamCong !== undefined && { attendancePin: d.maChamCong }),
    ...(d.diaDiemMacDinhId !== undefined && { defaultLocationId: d.diaDiemMacDinhId }),
    ...(d.ngayVaoLam !== undefined && { hiredAt: d.ngayVaoLam ? ngayVeDate(d.ngayVaoLam) : null }),
    updatedBy: nc.hoSo.userId,
  };
  try {
    await nc.tx.staffProfile.upsert({
      where: { userId },
      update: duLieu,
      create: { tenantId: nc.tenantId, userId, createdBy: nc.hoSo.userId, ...duLieu },
    });
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("maChamCong", "Mã chấm công này đã gán cho người khác.");
    throw e;
  }

  let soGanLai = 0;
  let soKyDaKhoaChuaAp = 0;
  if (d.maChamCong && d.maChamCong !== truoc.maChamCong) {
    // QĐ-118: chỉ áp lần chấm từ ngày vào làm, trong kỳ chưa khóa; kỳ đã khóa báo số lượng (áp ở màn hình
    // Máy chấm công → PIN chưa khớp, cần quyền duyệt).
    const ap = await apDungPinChuaKhop(nc, d.maChamCong, userId);
    soGanLai = ap.soLanCham;
    soKyDaKhoaChuaAp = ap.soKyDaKhoa;
  }

  const laThucTap = (d.loaiNhanSu ?? truoc.loaiNhanSu) === "thuc-tap";
  if (d.thucTap && laThucTap) {
    const t = d.thucTap;
    const dl = {
      school: t.truong ?? null, faculty: t.khoa ?? null, studentCode: t.mssv ?? null, academicSupervisor: t.giangVienHuongDan ?? null,
      mentorId: t.nguoiHuongDanId ?? null, startDate: t.tuNgay ? ngayVeDate(t.tuNgay) : null, endDate: t.denNgay ? ngayVeDate(t.denNgay) : null,
      note: t.ghiChu ?? null, updatedBy: nc.hoSo.userId,
    };
    await nc.tx.internProfile.upsert({ where: { userId }, update: dl, create: { tenantId: nc.tenantId, userId, createdBy: nc.hoSo.userId, ...dl } });
  } else if (d.thucTap && !laThucTap) {
    throw new LoiDinhDang("loaiNhanSu", "Thông tin thực tập chỉ nhập cho loại \"Sinh viên thực tập\".");
  }

  await nc.kiemToan({ action: "sua", objectType: "staff_profile", objectId: userId, before: truoc, after: { ...d } });
  if (d.maChamCong !== undefined && d.maChamCong !== truoc.maChamCong) {
    await nc.kiemToan({ action: "gan-ma-cham-cong", objectType: "staff_profile", objectId: userId, before: { maChamCong: truoc.maChamCong }, after: { maChamCong: d.maChamCong, soLanChamGanLai: soGanLai } });
  }
  await nc.suKien({ eventType: SU_KIEN.STAFF_PROFILE_UPDATED, objectType: "user", objectId: userId, payload: { truong: Object.keys(d), soLanChamGanLai: soGanLai } });
  return { id: userId, soLanChamGanLai: soGanLai, soKyDaKhoaChuaAp };
}

// ---------------------------------------------------------------------------
// Hợp đồng lao động
// ---------------------------------------------------------------------------

export async function taoHopDong(nc: NguCanh, d: z.infer<typeof LuocDoHopDong>) {
  batBuocQuyen(nc.hoSo, "nhan_su.create", { objectType: "employment_contract" });
  const u = await nc.tx.user.findFirst({ where: { AND: [{ id: d.nguoiId, isSystem: false }, await locHoSo(nc, "nhan_su.update")] }, select: { id: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  if (d.denNgay && d.denNgay < d.tuNgay) throw new LoiDinhDang("denNgay", "Ngày kết thúc phải sau ngày bắt đầu.");
  const h = await nc.tx.employmentContract.create({
    data: {
      tenantId: nc.tenantId, userId: d.nguoiId, contractType: d.loai, startDate: ngayVeDate(d.tuNgay),
      endDate: d.denNgay ? ngayVeDate(d.denNgay) : null, note: d.ghiChu ?? null, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({ action: "tao", objectType: "employment_contract", objectId: h.id, after: { ...d } });
  await suKien(nc, "employment_contract", h.id, "tao", { nguoiId: d.nguoiId });
  return { id: h.id };
}

export async function suaHopDong(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaHopDong>) {
  batBuocQuyen(nc.hoSo, "nhan_su.update", { objectType: "employment_contract", objectId: id });
  const h = await nc.tx.employmentContract.findFirst({ where: { id } });
  if (!h) throw new LoiKhongTimThay("Hợp đồng");
  const u = await nc.tx.user.findFirst({ where: { AND: [{ id: h.userId }, await locHoSo(nc, "nhan_su.update")] }, select: { id: true } });
  if (!u) throw new LoiKhongTimThay("Hợp đồng");
  const tu = d.tuNgay ?? dateVeNgay(h.startDate);
  const den = d.denNgay === undefined ? (h.endDate ? dateVeNgay(h.endDate) : null) : d.denNgay;
  if (den && den < tu) throw new LoiDinhDang("denNgay", "Ngày kết thúc phải sau ngày bắt đầu.");
  await nc.tx.employmentContract.update({
    where: { id },
    data: {
      ...(d.loai && { contractType: d.loai }), startDate: ngayVeDate(tu), endDate: den ? ngayVeDate(den) : null,
      ...(d.ghiChu !== undefined && { note: d.ghiChu }), ...(d.trangThai && { status: d.trangThai }), updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({
    action: "sua", objectType: "employment_contract", objectId: id,
    before: { loai: h.contractType, tuNgay: dateVeNgay(h.startDate), denNgay: h.endDate ? dateVeNgay(h.endDate) : null, trangThai: h.status },
    after: { ...d },
  });
  await suKien(nc, "employment_contract", id, "sua");
  return { id };
}

/** Điều kiện xem hợp đồng — cho tệp đính kèm (DK-02): xem theo phạm vi `nhan_su.view` của người có hợp đồng. */
export async function dieuKienXemHopDong(nc: NguCanh): Promise<{ userId?: { in: string[] } }> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "nhan_su.view");
  return pv === "tat-ca" ? {} : { userId: { in: pv } };
}
