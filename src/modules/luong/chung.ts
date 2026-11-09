import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi, LoiThieuQuyen } from "@/lib/phan-quyen";
import { luocDoGiaTri, timMuc } from "@/modules/cau-hinh/danh-muc";
import { dateVeNgay } from "@/modules/crm/chung";
import {
  chonBoHieuLuc,
  LOAI_THAM_SO,
  XUAT_NGAN_HANG_MAC_DINH,
  type BoThamSo,
  type CotNganHang,
  type LoaiThamSo,
  type TaiKhoanLuong,
} from "./tinh-toan";
import { LuocDoXuatNganHang } from "./luoc-do";

/**
 * Phần dùng chung của phân hệ lương (BUSINESS_RULES mục 32): Cấu hình, tham số hiệu lực, 2 lớp bắt buộc, phạm vi xem,
 * nhật ký xem.
 */

// ---------------------------------------------------------------------------
// Bảo mật (LU-60 → LU-63)
// ---------------------------------------------------------------------------

export const MA_LOI_2_LOP = "luong-can-2-lop";

/**
 * LU-61: mọi thao tác lương TRỪ xem phiếu của chính mình bắt buộc người gọi đã bật xác thực 2 lớp — lỗi rõ ràng, giao
 * diện hướng dẫn bật ở "Tài khoản của tôi". Kiểm ở MÁY CHỦ, không phụ thuộc danh sách vai trò bắt buộc của Cấu hình.
 */
export function batBuoc2Lop(nc: NguCanh): void {
  // 0.22.0 (QĐ-177): Cấu hình `luong.bat_buoc_2_lop` = 0 tạm bỏ bắt buộc (mặc định 1 — giữ bắt buộc).
  if (!nc.hoSo.da2Lop && !nc.hoSo.luongKhongBatBuoc2Lop) {
    throw new LoiNghiepVu(
      "Xem hoặc tính lương của người khác bắt buộc bật xác thực 2 lớp. Vào “Tài khoản của tôi” → Xác thực 2 lớp để bật, rồi đăng nhập lại.",
      403,
      MA_LOI_2_LOP,
    );
  }
}

/** Có quyền xem lương NGƯỜI KHÁC không (luong.view phạm vi rộng hơn "của tôi"). */
export function xemDuocNguoiKhac(nc: NguCanh): boolean {
  const pv = nc.hoSo.phamVi.get("luong.view");
  return Boolean(pv && pv !== "own");
}

/** Bắt buộc quyền + 2 lớp cho thao tác chạm tới dữ liệu lương người khác. */
export function batBuocQuyenLuong(nc: NguCanh, ma: string, doiTuong: { objectType: string; objectId?: string | null } = { objectType: "payroll_run" }): void {
  batBuocQuyen(nc.hoSo, ma, doiTuong);
  if (ma === "luong.view" && !xemDuocNguoiKhac(nc)) throw new LoiThieuQuyen("luong.view", doiTuong);
  batBuoc2Lop(nc);
}

/** Người trong phạm vi xem lương (cho danh sách). */
export async function locNguoiLuong(nc: NguCanh): Promise<{ userId?: { in: string[] } }> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "luong.view");
  return pv === "tat-ca" ? {} : { userId: { in: pv } };
}

export async function trongPhamViLuong(nc: NguCanh, userId: string): Promise<boolean> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "luong.view");
  return pv === "tat-ca" || pv.includes(userId);
}

/**
 * LU-62: ghi nhật ký MỖI lần xem dữ liệu lương của người khác (ai, lúc nào — tự điền; xem gì — `xem`, đối tượng,
 * người được xem). KHÔNG ghi số tiền (QĐ-148).
 */
export async function ghiXem(nc: NguCanh, xem: string, doiTuong: { objectType: string; objectId?: string | null }, nguoiDuocXem: string[] = []): Promise<void> {
  const khac = [...new Set(nguoiDuocXem)].filter((u) => u !== nc.hoSo.userId);
  await nc.kiemToan({
    action: "xem-luong",
    objectType: doiTuong.objectType,
    objectId: doiTuong.objectId ?? null,
    after: { xem, soNguoi: khac.length, nguoiDuocXem: khac.slice(0, 200) },
  });
}

export const coQuyenLuong = (nc: NguCanh, hd: "view" | "create" | "update" | "approve" | "export") => coQuyen(nc.hoSo, `luong.${hd}`);

// ---------------------------------------------------------------------------
// Cấu hình (nhóm "Tính lương")
// ---------------------------------------------------------------------------

const KHOA = {
  soGioNgay: "luong.so_gio_ngay",
  luiThang: "luong.hoa_hong_lui_thang",
  chiPhi: "luong.tk_chi_phi",
  phaiTra: "luong.tk_phai_tra",
  bhxh: "luong.tk_bhxh",
  bhyt: "luong.tk_bhyt",
  bhtn: "luong.tk_bhtn",
  kpcd: "luong.tk_kpcd",
  thue: "luong.tk_thue_tncn",
  tamUng: "luong.tk_tam_ung",
  khauTruKhac: "luong.tk_khau_tru_khac",
  tien: "luong.tk_tien",
  tienMat: "luong.tk_tien_mat",
  chanThamSoChuaXacNhan: "luong.chan_khi_tham_so_chua_xac_nhan",
} as const;

export type CauHinhLuong = { -readonly [K in keyof typeof KHOA]: number };

export async function docCauHinhLuong(tx: ClientTenant): Promise<CauHinhLuong> {
  const dong = await tx.tenantSetting.findMany({ where: { key: { in: Object.values(KHOA) }, status: "hoat-dong" }, select: { key: true, value: true } });
  const bang = new Map(dong.map((d) => [d.key, d.value]));
  const kq = {} as CauHinhLuong;
  for (const [ten, khoa] of Object.entries(KHOA) as [keyof CauHinhLuong, string][]) {
    const muc = timMuc(khoa);
    if (!muc || muc.macDinh === null) throw new Error(`Khóa cấu hình thiếu mặc định: ${khoa}`);
    const gt = bang.get(khoa);
    const hop = gt === undefined ? null : luocDoGiaTri(muc).safeParse(gt);
    kq[ten] = hop?.success && hop.data !== null ? hop.data : muc.macDinh;
  }
  return kq;
}

export const taiKhoanTu = (c: CauHinhLuong): TaiKhoanLuong => ({
  chiPhi: c.chiPhi, phaiTra: c.phaiTra, bhxh: c.bhxh, bhyt: c.bhyt, bhtn: c.bhtn, kpcd: c.kpcd, thue: c.thue, tamUng: c.tamUng, khauTruKhac: c.khauTruKhac, tien: c.tien, tienMat: c.tienMat,
});

/** Khóa tenant_settings (JSON) của mẫu file chi lương ngân hàng — cột + nội dung (LU-51). */
export const KHOA_XUAT_NGAN_HANG = "luong.xuat_ngan_hang";

export async function docMauNganHang(tx: ClientTenant): Promise<{ cot: CotNganHang[]; noiDung: string; boDau: boolean }> {
  const d = await tx.tenantSetting.findFirst({ where: { key: KHOA_XUAT_NGAN_HANG, status: "hoat-dong" }, select: { value: true } });
  const hop = d ? LuocDoXuatNganHang.safeParse(d.value) : null;
  return hop?.success ? hop.data : { ...XUAT_NGAN_HANG_MAC_DINH, cot: [...XUAT_NGAN_HANG_MAC_DINH.cot] };
}

// ---------------------------------------------------------------------------
// Tham số hiệu lực theo ngày (LU-12)
// ---------------------------------------------------------------------------

export interface BoApDung {
  id: string;
  loai: LoaiThamSo;
  hieuLucTu: string;
  daXacNhan: boolean;
  nguon: string;
}

/** Bộ tham số áp cho ngày `ngay` (mỗi loại một bộ). Thiếu loại nào → lỗi nghiệp vụ liệt kê loại thiếu. */
export async function thamSoHieuLuc(tx: ClientTenant, ngay: string): Promise<{ giaTri: BoThamSo; bo: BoApDung[] }> {
  const ds = await tx.payrollParamSet.findMany({
    where: { effectiveFrom: { lte: new Date(`${ngay}T00:00:00.000Z`) } },
    select: { id: true, kind: true, effectiveFrom: true, values: true, createdAt: true, confirmedAt: true, source: true },
  });
  const giaTri = {} as Record<LoaiThamSo, unknown>;
  const bo: BoApDung[] = [];
  const thieu: string[] = [];
  for (const loai of LOAI_THAM_SO) {
    const chon = chonBoHieuLuc(
      ds.filter((d) => d.kind === loai).map((d) => ({ ...d, hieuLucTu: dateVeNgay(d.effectiveFrom), taoLuc: d.createdAt })),
      ngay,
    );
    if (!chon) {
      thieu.push(loai);
      continue;
    }
    giaTri[loai] = chon.values;
    bo.push({ id: chon.id, loai, hieuLucTu: chon.hieuLucTu, daXacNhan: Boolean(chon.confirmedAt), nguon: chon.source });
  }
  if (thieu.length) throw new LoiNghiepVu(`Chưa có tham số lương hiệu lực ngày ${ngay}: ${thieu.join(", ")}. Nhập ở Tính lương → Tham số.`, 422, "thieu-tham-so");
  return { giaTri: giaTri as unknown as BoThamSo, bo };
}
