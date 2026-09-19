import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { cuoiNgayVN, dauNgayVN } from "@/lib/dinh-dang";

/** Tra cứu Nhật ký kiểm toán. Chỉ đọc — bảng này không sửa, không xóa được ở tầng cơ sở dữ liệu. */

export const NHAN_HANH_DONG: Record<string, string> = {
  tao: "Tạo",
  sua: "Sửa",
  xoa: "Xóa",
  "dang-nhap": "Đăng nhập",
  "dang-xuat": "Đăng xuất",
  "dang-nhap-that-bai": "Đăng nhập thất bại",
  "tu-choi-quyen": "Bị từ chối quyền",
  "doi-mat-khau": "Đổi mật khẩu",
  "dat-lai-mat-khau": "Đặt lại mật khẩu",
  "doi-quyen": "Đổi quyền",
  "khoa-dang-nhap": "Khóa đăng nhập",
  "mo-khoa-dang-nhap": "Mở khóa đăng nhập",
};

export const NHAN_DOI_TUONG: Record<string, string> = {
  user: "Người dùng",
  role: "Vai trò",
  department: "Phòng ban",
  master_data: "Dữ liệu gốc",
  setting: "Cấu hình",
  trang: "Trang",
  "he-thong": "Hệ thống",
};

export const LuocDoLocKiemToan = z.object({
  hanhDong: z.string().trim().max(50).optional().default(""),
  doiTuong: z.string().trim().max(50).optional().default(""),
  nguoi: z.string().trim().max(255).optional().default(""),
  doiTuongId: z.union([z.uuid(), z.literal("")]).optional().default(""),
  tuNgay: z.string().trim().max(10).optional().default(""),
  denNgay: z.string().trim().max(10).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(200).optional().default(50),
});
export type BoLocKiemToan = z.infer<typeof LuocDoLocKiemToan>;

export async function traCuuKiemToan(nc: NguCanh, boLoc: BoLocKiemToan) {
  batBuocQuyen(nc.hoSo, "audit_log.view");

  const dk: Prisma.AuditLogWhereInput[] = [];
  if (boLoc.hanhDong) dk.push({ action: boLoc.hanhDong });
  if (boLoc.doiTuong) dk.push({ objectType: boLoc.doiTuong });
  if (boLoc.doiTuongId) dk.push({ objectId: boLoc.doiTuongId });
  if (boLoc.nguoi) dk.push({ actorEmail: { contains: boLoc.nguoi, mode: "insensitive" } });
  const tu = boLoc.tuNgay ? dauNgayVN(boLoc.tuNgay) : null;
  const den = boLoc.denNgay ? cuoiNgayVN(boLoc.denNgay) : null;
  if (tu) dk.push({ createdAt: { gte: tu } });
  if (den) dk.push({ createdAt: { lte: den } });

  const where: Prisma.AuditLogWhereInput = { AND: dk };
  const [tong, dong] = await Promise.all([
    nc.tx.auditLog.count({ where }),
    nc.tx.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
      select: {
        id: true,
        actorId: true,
        actorEmail: true,
        action: true,
        objectType: true,
        objectId: true,
        before: true,
        after: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
  ]);
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong };
}
