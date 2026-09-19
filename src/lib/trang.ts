import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { voiTenant, type ClientTenant } from "./db";
import { layPhienHienTai, phienConHieuLuc, type PhienDaGiaiMa } from "./xac-thuc";
import { coQuyen, ghiTuChoiQuyen, layHoSoQuyen, LoiThieuQuyen, type HoSoQuyen } from "./phan-quyen";
import { layIpKhach } from "./yeu-cau";

/**
 * Tiện ích cho trang (Server Component) — tương đương `xuLyApi` nhưng cho giao diện.
 *
 * Kiểm quyền ở trang chỉ để không hiện màn hình người ta không được dùng. Chốt chặn
 * thật vẫn là API và RLS: ẩn nút ở giao diện KHÔNG phải là phân quyền (mục 34).
 */

export interface NguoiDungHienTai {
  phien: PhienDaGiaiMa;
  hoSo: HoSoQuyen;
  tenant: { name: string; code: string };
}

/** Đọc một lần mỗi yêu cầu, dùng chung cho layout và page nhờ `cache()`. */
export const layNguoiDungHienTai = cache(async (): Promise<NguoiDungHienTai | null> => {
  const phien = await layPhienHienTai();
  if (!phien) return null;
  return voiTenant(phien.tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, phien.userId);
    if (!hoSo || !phienConHieuLuc(phien.kyLucMs, hoSo.doiMatKhauLuc)) return null;
    const tenant = await tx.tenant.findFirst({ where: { id: phien.tenantId }, select: { name: true, code: true } });
    return { phien, hoSo, tenant: tenant ?? { name: "—", code: "—" } };
  });
});

/** Bắt đăng nhập; đang bị bắt đổi mật khẩu thì đưa sang trang đổi mật khẩu. */
export async function yeuCauDangNhap(): Promise<NguoiDungHienTai> {
  const nd = await layNguoiDungHienTai();
  if (!nd) redirect("/dang-nhap");
  if (nd.hoSo.phaiDoiMatKhau) redirect("/doi-mat-khau");
  return nd;
}

/** Bắt có quyền; thiếu thì ghi vết rồi đưa sang trang báo không có quyền. */
export async function yeuCauQuyen(maQuyen: string): Promise<NguoiDungHienTai> {
  const nd = await yeuCauDangNhap();
  if (!coQuyen(nd.hoSo, maQuyen)) {
    const h = await headers();
    await voiTenant(nd.phien.tenantId, (tx) =>
      ghiTuChoiQuyen(
        tx,
        { userId: nd.hoSo.userId, email: nd.hoSo.email, vaiTro: nd.hoSo.vaiTro.map((v) => v.code) },
        new LoiThieuQuyen(maQuyen, { objectType: "trang" }),
        { ipAddress: layIpKhach(h), userAgent: h.get("user-agent") },
      ),
    ).catch(() => {});
    redirect(`/khong-co-quyen?quyen=${encodeURIComponent(maQuyen)}`);
  }
  return nd;
}

/** Đọc dữ liệu cho trang trong ngữ cảnh tenant của người đang đăng nhập. */
export function docDuLieu<T>(nd: NguoiDungHienTai, congViec: (tx: ClientTenant) => Promise<T>): Promise<T> {
  return voiTenant(nd.phien.tenantId, congViec);
}

/** Đọc tham số tìm kiếm của trang (Next 16 truyền dạng Promise). */
export type ThamSoTrang = Promise<Record<string, string | string[] | undefined>>;

export function layMot(gt: string | string[] | undefined): string {
  return (Array.isArray(gt) ? gt[0] : gt)?.trim() ?? "";
}

export function laySoTrang(gt: string | string[] | undefined): number {
  const n = Number.parseInt(layMot(gt), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}
