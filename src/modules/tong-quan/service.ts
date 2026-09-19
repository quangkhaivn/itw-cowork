import type { ClientTenant } from "@/lib/db";
import type { HoSoQuyen } from "@/lib/phan-quyen";
import { coQuyen } from "@/lib/phan-quyen";
import { dauHomNayVN } from "@/lib/dinh-dang";

/**
 * Bảng điều hành — Phase 1.
 *
 * Chỉ hiện số liệu hệ thống ĐANG CÓ THẬT: người dùng, đăng nhập, từ chối quyền,
 * thay đổi gần đây. Chỉ số kinh doanh (doanh thu, pipeline, công nợ…) ở mục 6
 * master prompt cần dữ liệu của Phase 2–5 và được dựng ở Phase 7. Không hiện số 0
 * giả vờ là doanh thu.
 */
export async function tongQuanHeThong(tx: ClientTenant, hoSo: HoSoQuyen) {
  const homNay = dauHomNayVN();
  const bayNgayTruoc = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const xemQuanTri = coQuyen(hoSo, "audit_log.view");

  const [nguoiHoatDong, nguoiBiKhoa, phaiDoiMatKhau] = await Promise.all([
    tx.user.count({ where: { status: "hoat-dong", isSystem: false } }),
    tx.user.count({ where: { status: "hoat-dong", isSystem: false, lockedUntil: { gt: new Date() } } }),
    tx.user.count({ where: { status: "hoat-dong", isSystem: false, mustChangePassword: true } }),
  ]);

  if (!xemQuanTri) {
    return { xemQuanTri, nguoiHoatDong, nguoiBiKhoa, phaiDoiMatKhau, anNinh: null, ganDay: [] };
  }

  const [dangNhapHomNay, thatBaiHomNay, tuChoi7Ngay, ganDay] = await Promise.all([
    tx.auditLog.count({ where: { action: "dang-nhap", createdAt: { gte: homNay } } }),
    tx.auditLog.count({ where: { action: "dang-nhap-that-bai", createdAt: { gte: homNay } } }),
    tx.auditLog.count({ where: { action: "tu-choi-quyen", createdAt: { gte: bayNgayTruoc } } }),
    tx.auditLog.findMany({
      where: { action: { in: ["tao", "sua", "doi-quyen", "dat-lai-mat-khau", "mo-khoa-dang-nhap", "khoa-dang-nhap"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, actorEmail: true, action: true, objectType: true, objectId: true, createdAt: true },
    }),
  ]);

  return {
    xemQuanTri,
    nguoiHoatDong,
    nguoiBiKhoa,
    phaiDoiMatKhau,
    anNinh: { dangNhapHomNay, thatBaiHomNay, tuChoi7Ngay },
    ganDay,
  };
}
