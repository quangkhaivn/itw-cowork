import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { banDoTen, lichCuaNhieuNguoi, ngayLeTrongKhoang } from "./chung";
import type { LuocDoDatCongTay } from "./luoc-do";
import { cacNgayTrongKhoang, congDuKien } from "./tinh-toan";

/**
 * 0.22.0 (QĐ-174) — BẢNG CÔNG NHẬP TAY: Nhân sự (`cham_cong.update`) đặt công từng ngày cho người không có máy vân tay
 * hoặc GPS, khi bảng công tháng đó CHƯA KHÓA. Bắt buộc lý do, ghi kiểm toán. Chỉ ghi thêm (bản ghi sau thắng); bảng
 * công (sinh / sinh lại) đọc giá trị đặt tay thay cho công tính từ lần chấm (`apCongTay`).
 *
 * Đã có từ 0.19.0 và vẫn dùng song song: giải trình / chấm bù (nhân viên xin, quản lý duyệt → lần chấm `bo-sung`), nhập
 * CSV lần chấm theo PIN. Phần THIẾU trước đây: người không có máy / GPS / PIN không có đường nào để có công.
 * Không ai tự đặt công cho chính mình (toàn vẹn). Kỳ đã khóa → sửa bằng dòng điều chỉnh kỳ sau (NS-53), không đặt tay.
 */
export async function datCongTay(nc: NguCanh, d: z.infer<typeof LuocDoDatCongTay>, homNay = homNayVN()) {
  batBuocQuyen(nc.hoSo, "cham_cong.update", { objectType: "attendance_manual_day" });
  if (d.nguoiId === nc.hoSo.userId) throw new LoiNghiepVu("Không tự đặt công cho chính mình — nhờ Nhân sự khác hoặc quản lý.", 403, "khong-tu-dat-cong");
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "cham_cong.update");
  if (pv !== "tat-ca" && !pv.includes(d.nguoiId)) throw new LoiKhongTimThay("Nhân viên");
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true, fullName: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  const den = d.denNgay ?? d.ngay;
  if (den > homNay) throw new LoiNghiepVu("Không đặt công cho ngày chưa tới.", 422, "ngay-tuong-lai");
  const ds = cacNgayTrongKhoang(d.ngay, den);
  if (ds.length > 62) throw new LoiNghiepVu("Mỗi lần đặt tối đa 62 ngày.", 422, "qua-dai");
  // Kỳ đã khóa → không đặt tay (trigger CSDL cũng chặn). Báo đúng tháng bị khóa.
  const thang = [...new Set(ds.map((x) => x.slice(0, 7)))];
  const khoa = await nc.tx.timesheet.findMany({
    where: { status: "da-khoa", OR: thang.map((t) => ({ year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) })) },
    select: { year: true, month: true },
  });
  if (khoa.length) {
    throw new LoiNghiepVu(
      `Bảng công tháng ${khoa.map((k) => `${String(k.month).padStart(2, "0")}/${k.year}`).join(", ")} đã khóa — không đặt công tay được. Sửa sai sót bằng chấm bù có duyệt: bảng công tháng sau tự sinh dòng điều chỉnh (NS-53).`,
      409,
      "da-khoa",
    );
  }
  // Khoảng nhiều ngày: chỉ những ngày phải làm theo lịch (ngày nghỉ tuần / lễ bỏ qua). Một ngày: luôn đặt.
  let ngayDat = ds;
  if (ds.length > 1) {
    const lich = (await lichCuaNhieuNguoi(nc.tx, [d.nguoiId], den)).get(d.nguoiId)!;
    const le = await ngayLeTrongKhoang(nc.tx, d.ngay, den);
    ngayDat = ds.filter((x) => {
      const l = lich(x);
      return congDuKien(x, l?.ca ?? null, l?.ngay ?? null, le.has(x)).giaTri > 0;
    });
    if (ngayDat.length === 0) throw new LoiNghiepVu("Khoảng ngày không có ngày phải làm theo lịch — đặt từng ngày nếu cần.", 422, "khong-co-ngay");
  }
  await nc.tx.attendanceManualDay.createMany({
    data: ngayDat.map((x) => ({ tenantId: nc.tenantId, userId: d.nguoiId, workDate: ngayVeDate(x), workValue: d.cong, reason: d.lyDo, createdBy: nc.hoSo.userId })),
  });
  await nc.kiemToan({ action: "dat-cong-tay", objectType: "user", objectId: d.nguoiId, after: { tu: d.ngay, den, soNgay: ngayDat.length, cong: d.cong, lyDo: d.lyDo } });
  await nc.suKien({ eventType: SU_KIEN.HR_SETUP_CHANGED, objectType: "attendance_manual_day", objectId: d.nguoiId, payload: { hanhDong: "dat-cong-tay", soNgay: ngayDat.length } });
  const nhap = await nc.tx.timesheet.findMany({ where: { status: "nhap", OR: thang.map((t) => ({ year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) })) }, select: { id: true } });
  return { soNgay: ngayDat.length, ngay: ngayDat, canSinhLai: nhap.map((x) => x.id) };
}

/** Công đặt tay trong một tháng (mới nhất mỗi ngày + lịch sử) — Nhân sự xem để đối chiếu. */
export async function danhSachCongTay(nc: NguCanh, nam: number, thang: number) {
  batBuocQuyen(nc.hoSo, "cham_cong.update", { objectType: "attendance_manual_day" });
  const tu = `${nam}-${String(thang).padStart(2, "0")}-01`;
  const den = dateVeNgay(new Date(Date.UTC(nam, thang, 0)));
  const ds = await nc.tx.attendanceManualDay.findMany({
    where: { workDate: { gte: ngayVeDate(tu), lte: ngayVeDate(den) } },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });
  const ten = await banDoTen(nc.tx, ds.flatMap((x) => [x.userId, x.createdBy]));
  return ds.map((x) => ({
    id: x.id, nguoiId: x.userId, hoTen: ten.get(x.userId) ?? "—", ngay: dateVeNgay(x.workDate), cong: Number(x.workValue), lyDo: x.reason,
    nguoiDat: ten.get(x.createdBy) ?? "—", luc: x.createdAt,
  }));
}
