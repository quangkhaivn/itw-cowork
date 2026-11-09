import { voiTenant } from "@/lib/db";
import { baoChoNguoiCoQuyen, taoThongBao } from "@/modules/thong-bao/service";
import { docCauHinhChamCong, lichCuaNhieuNguoi, ngayLeTrongKhoang, nghiDaDuyet, so } from "./chung";
import { congDuKien, ngayVNCua, phutVeGio, phutTrongNgayVN } from "./tinh-toan";

/**
 * Bản quét chấm công chạy MỖI PHÚT trong worker (NS-61, NS-62):
 *  1. Quá giờ vào ca `cham_cong.nhac_chua_cham_sau_phut` phút mà chưa có lần chấm nào → báo nhân viên
 *     và quản lý trực tiếp, mỗi người một lần mỗi ngày (khóa chống trùng). Chỉ trong giờ làm của ca;
 *     không nhắc ngày lễ, ngày không có ca, ngày nghỉ phép đã duyệt (nghỉ nửa ngày sáng thì tính từ giờ
 *     vào nửa chiều).
 *  2. Máy chấm công im lặng quá `cham_cong.may_mat_ket_noi_phut` phút → báo người có `nhan_su.update`,
 *     một lần cho mỗi đợt im lặng (`offline_alerted_at`; máy gọi lại thì xóa mốc).
 * Mỗi doanh nghiệp một giao dịch riêng (worker gọi trong `try` riêng).
 */
export async function quetChamCong(tenantId: string, bayGio = new Date()) {
  return voiTenant(tenantId, async (tx) => {
    const ch = await docCauHinhChamCong(tx);
    const ngay = ngayVNCua(bayGio);
    const ketQua = { soNhacNhanVien: 0, soNhacQuanLy: 0, soMayMatKetNoi: 0, laNgayLe: false };

    // ---- 2. Máy mất kết nối ----
    const nguongMay = new Date(bayGio.getTime() - so(ch.mayMatKetNoiPhut, 10) * 60_000);
    const may = await tx.attendanceDevice.findMany({
      where: {
        status: "hoat-dong",
        offlineAlertedAt: null,
        OR: [{ lastSeenAt: { lt: nguongMay } }, { lastSeenAt: null, createdAt: { lt: nguongMay } }],
      },
      select: { id: true, name: true, lastSeenAt: true, location: { select: { name: true } } },
    });
    for (const m of may) {
      const dem = await baoChoNguoiCoQuyen(tx, tenantId, "nhan_su.update", {
        loai: "may-cham-cong-mat-ket-noi",
        mucDo: "canh-bao",
        tieuDe: `Máy chấm công "${m.name}" (${m.location?.name ?? "chưa chọn địa điểm"}) mất kết nối`,
        noiDung: m.lastSeenAt
          ? `Lần cuối máy gọi về lúc ${m.lastSeenAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })}. Kiểm tra nguồn điện, mạng và địa chỉ máy chủ trên máy.`
          : "Máy đã đăng ký nhưng chưa từng gọi về. Kiểm tra địa chỉ máy chủ / cổng khai trên máy (docs/HUONG-DAN-CHAM-CONG.md).",
        duongDan: "/nhan-su/may-cham-cong",
        doiTuong: "attendance_device",
        doiTuongId: m.id,
        khoaChongTrung: `may-mat-ket-noi:${m.id}:${m.lastSeenAt?.toISOString() ?? "chua-goi"}`,
      });
      await tx.attendanceDevice.update({ where: { id: m.id }, data: { offlineAlertedAt: bayGio } });
      if (dem > 0) ketQua.soMayMatKetNoi += 1;
    }

    // ---- 1. Chưa chấm công ----
    if ((await ngayLeTrongKhoang(tx, ngay, ngay)).has(ngay)) {
      ketQua.laNgayLe = true;
      return ketQua;
    }
    const nguoi = await tx.user.findMany({
      where: { status: "hoat-dong", isSystem: false, scheduleAssignments: { some: { effectiveFrom: { lte: new Date(`${ngay}T00:00:00.000Z`) } } } },
      select: { id: true, fullName: true, staffProfile: { select: { managerId: true } } },
    });
    if (nguoi.length === 0) return ketQua;
    const ids = nguoi.map((n) => n.id);
    const lich = await lichCuaNhieuNguoi(tx, ids, ngay);
    const nghi = await nghiDaDuyet(tx, ids, ngay, ngay);
    const sauPhut = so(ch.nhacChuaChamSauPhut, 15);
    const truocPhut = so(ch.cuaSoTruocPhut, 240);

    const canXet: { id: string; hoTen: string; managerId: string | null; batDau: Date }[] = [];
    for (const n of nguoi) {
      const l = lich.get(n.id)!(ngay);
      const dk = congDuKien(ngay, l?.ca ?? null, l?.ngay ?? null, false);
      if (dk.giaTri === 0 || !dk.khoang) continue;
      const ng = nghi.get(n.id)?.get(ngay);
      let batDau = dk.khoang.batDau;
      if (ng) {
        if (ng.giaTri >= dk.giaTri) continue;
        if (ng.phan === "sang" && dk.nuaChieu) batDau = dk.nuaChieu.batDau;
      }
      if (bayGio.getTime() < batDau.getTime() + sauPhut * 60_000 || bayGio >= dk.khoang.ketThuc) continue;
      canXet.push({ id: n.id, hoTen: n.fullName, managerId: n.staffProfile?.managerId ?? null, batDau });
    }
    if (canXet.length === 0) return ketQua;

    const daCham = await tx.attendancePunch.findMany({
      where: {
        userId: { in: canXet.map((c) => c.id) },
        punchedAt: { gte: new Date(Math.min(...canXet.map((c) => c.batDau.getTime())) - truocPhut * 60_000), lte: bayGio },
      },
      select: { userId: true, punchedAt: true },
    });
    for (const c of canXet) {
      const co = daCham.some((p) => p.userId === c.id && p.punchedAt.getTime() >= c.batDau.getTime() - truocPhut * 60_000);
      if (co) continue;
      const gio = phutVeGio(phutTrongNgayVN(c.batDau));
      if (
        await taoThongBao(tx, tenantId, {
          nguoiNhanId: c.id,
          loai: "cham-cong-chua-vao",
          mucDo: "canh-bao",
          tieuDe: `Bạn chưa chấm công vào ca (ca bắt đầu ${gio})`,
          noiDung: "Chấm công bằng máy vân tay hoặc nút Vào ca trên Cowork. Quên chấm thì gửi giải trình để quản lý duyệt chấm bù.",
          duongDan: "/cham-cong",
          khoaChongTrung: `cham-cong-chua-vao:${ngay}`,
        })
      ) ketQua.soNhacNhanVien += 1;
      if (c.managerId && c.managerId !== c.id) {
        if (
          await taoThongBao(tx, tenantId, {
            nguoiNhanId: c.managerId,
            loai: "cham-cong-nhan-vien-chua-vao",
            tieuDe: `${c.hoTen} chưa chấm công vào ca (ca bắt đầu ${gio})`,
            duongDan: "/cham-cong/truc-tiep",
            doiTuong: "user",
            doiTuongId: c.id,
            khoaChongTrung: `cham-cong-chua-vao:${c.id}:${ngay}`,
          })
        ) ketQua.soNhacQuanLy += 1;
      }
    }
    return ketQua;
  });
}
