import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { createHash } from "node:crypto";
import { SU_KIEN } from "@/lib/su-kien";
import { LoiNghiepVu } from "@/lib/loi";
import { nhanDangTep } from "@/modules/dinh-kem/tinh-toan";

/**
 * Hồ sơ công ty — phần in lên đầu báo giá (mục 13 prompt): tên, địa chỉ, mã số thuế,
 * liên hệ, tài khoản ngân hàng, người ký.
 *
 * Vì sao tách khỏi màn hình Cấu hình: Cấu hình chỉ nhận **số** (ngưỡng nghiệp vụ), còn
 * đây là chữ. Lưu cùng bảng `tenant_settings` nhưng khóa riêng `cong_ty.*`, nên hai bên
 * không đụng nhau (QĐ-22).
 *
 * KHÔNG điền sẵn dữ liệu gì: thông tin pháp nhân phải do Giám đốc nhập, không được đoán.
 * Chỗ nào trống thì bản in để trống và ghi rõ là chưa khai.
 */

export interface MucHoSo {
  khoa: string;
  nhan: string;
  moTa?: string;
  nhieuDong?: boolean;
  toiDa: number;
}

export const DANH_MUC_HO_SO: MucHoSo[] = [
  { khoa: "cong_ty.ten", nhan: "Tên công ty (in trên báo giá)", moTa: "Để trống thì dùng tên doanh nghiệp trong hệ thống.", toiDa: 255 },
  { khoa: "cong_ty.dia_chi", nhan: "Địa chỉ", nhieuDong: true, toiDa: 500 },
  { khoa: "cong_ty.ma_so_thue", nhan: "Mã số thuế", toiDa: 30 },
  { khoa: "cong_ty.dien_thoai", nhan: "Điện thoại", toiDa: 100 },
  { khoa: "cong_ty.email", nhan: "Email", toiDa: 255 },
  { khoa: "cong_ty.website", nhan: "Website", toiDa: 255 },
  { khoa: "cong_ty.ngan_hang", nhan: "Ngân hàng", moTa: "Tên ngân hàng và chi nhánh.", toiDa: 255 },
  { khoa: "cong_ty.so_tai_khoan", nhan: "Số tài khoản", toiDa: 50 },
  { khoa: "cong_ty.chu_tai_khoan", nhan: "Chủ tài khoản", toiDa: 255 },
  { khoa: "cong_ty.nguoi_ky", nhan: "Người ký báo giá", toiDa: 255 },
  { khoa: "cong_ty.chuc_vu_nguoi_ky", nhan: "Chức vụ người ký", toiDa: 255 },
  { khoa: "cong_ty.dieu_khoan_mac_dinh", nhan: "Điều khoản in cuối báo giá", moTa: "Ví dụ: điều kiện thanh toán, giao hàng, bảo hành chung.", nhieuDong: true, toiDa: 3000 },
];

export const LuocDoHoSoCongTy = z.object({
  giaTri: z.record(z.string().max(60), z.string().max(3000)),
});

export type HoSoCongTy = Record<string, string> & { tenHienThi: string };

/**
 * Đọc hồ sơ công ty. Không đòi quyền: bản in báo giá cần dùng.
 *
 * Bắt buộc truyền `tenantId`: bảng `tenants` là sổ đăng ký dùng chung lúc đăng nhập nên
 * RLS cho đọc mọi dòng đang hoạt động (prisma/rls.sql mục 4). Hỏi không kèm điều kiện thì
 * Postgres trả về doanh nghiệp bất kỳ — bản in sẽ mang tên công ty của người khác.
 */
export async function docHoSoCongTy(tx: ClientTenant, tenantId: string): Promise<HoSoCongTy> {
  const [dong, tenant] = await Promise.all([
    tx.tenantSetting.findMany({ where: { key: { in: DANH_MUC_HO_SO.map((m) => m.khoa) }, status: "hoat-dong" }, select: { key: true, value: true } }),
    tx.tenant.findFirst({ where: { id: tenantId }, select: { name: true, taxCode: true } }),
  ]);
  const kq: Record<string, string> = {};
  for (const m of DANH_MUC_HO_SO) kq[m.khoa] = "";
  for (const d of dong) if (typeof d.value === "string") kq[d.key] = d.value;
  return {
    ...kq,
    "cong_ty.ma_so_thue": kq["cong_ty.ma_so_thue"] || (tenant?.taxCode ?? ""),
    tenHienThi: kq["cong_ty.ten"] || (tenant?.name ?? ""),
  } as HoSoCongTy;
}

export async function xemHoSoCongTy(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "setting.view");
  const giaTri = await docHoSoCongTy(nc.tx, nc.tenantId);
  const logo = await docLogoCongTy(nc.tx);
  return {
    muc: DANH_MUC_HO_SO,
    giaTri,
    thieu: DANH_MUC_HO_SO.filter((m) => !giaTri[m.khoa]).map((m) => m.nhan),
    logo: logo && { mime: logo.mime, duLieu: logo.duLieu, kichThuoc: logo.kichThuoc },
  };
}

export async function capNhatHoSoCongTy(nc: NguCanh, d: z.infer<typeof LuocDoHoSoCongTy>) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "setting" });
  let soDoi = 0;
  for (const [khoa, giaTriMoi] of Object.entries(d.giaTri)) {
    const muc = DANH_MUC_HO_SO.find((m) => m.khoa === khoa);
    if (!muc) continue;
    const gt = giaTriMoi.trim().slice(0, muc.toiDa);
    const cu = await nc.tx.tenantSetting.findFirst({ where: { key: khoa }, select: { id: true, value: true } });
    const giaTriCu = cu && typeof cu.value === "string" ? cu.value : "";
    if (giaTriCu === gt) continue;

    if (!gt) await nc.tx.tenantSetting.deleteMany({ where: { key: khoa } });
    else {
      await nc.tx.tenantSetting.upsert({
        where: { tenantId_key: { tenantId: nc.tenantId, key: khoa } },
        update: { value: gt, status: "hoat-dong", updatedBy: nc.hoSo.userId },
        create: { tenantId: nc.tenantId, key: khoa, value: gt, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
      });
    }
    await nc.kiemToan({ action: "sua", objectType: "setting", after: { khoa, giaTri: gt }, before: { khoa, giaTri: giaTriCu } });
    await nc.suKien({ eventType: SU_KIEN.SETTING_CHANGED, objectType: "setting", payload: { khoa } });
    soDoi++;
  }
  return { soDoi };
}

// ---------------------------------------------------------------------------
// Logo công ty (0.16.0) — in trên đầu báo giá
// ---------------------------------------------------------------------------

/**
 * Logo lưu ngay trong `tenant_settings` khóa `cong_ty.logo` dạng `{ mime, duLieu (base64), sha256,
 * kichThuoc }` — ảnh nhỏ, đọc cùng hồ sơ công ty, nhúng thẳng vào bản in bằng `data:` URI nên không
 * cần thêm đường tải tệp hay quyền riêng. Kiểm **byte đầu** bằng đúng hàm của tệp đính kèm
 * (QĐ-45): chỉ nhận PNG / JPEG / WebP thật, không nhận SVG (SVG chạy được script).
 */
export const KHOA_LOGO = "cong_ty.logo";
export const LOGO_TOI_DA_BYTE = 512 * 1024;
const MIME_LOGO = ["image/png", "image/jpeg", "image/webp"];

export const LuocDoLogo = z.object({
  tenTep: z.string().trim().min(1).max(255),
  duLieuBase64: z.string().min(8).max(Math.ceil((LOGO_TOI_DA_BYTE * 4) / 3) + 8),
});

export interface LogoCongTy {
  mime: string;
  duLieu: string;
  sha256: string;
  kichThuoc: number;
}

export async function docLogoCongTy(tx: ClientTenant): Promise<LogoCongTy | null> {
  const d = await tx.tenantSetting.findFirst({ where: { key: KHOA_LOGO, status: "hoat-dong" }, select: { value: true } });
  const v = d?.value as Partial<LogoCongTy> | null | undefined;
  if (!v || typeof v.duLieu !== "string" || typeof v.mime !== "string" || !MIME_LOGO.includes(v.mime)) return null;
  return { mime: v.mime, duLieu: v.duLieu, sha256: String(v.sha256 ?? ""), kichThuoc: Number(v.kichThuoc ?? 0) };
}

export async function datLogoCongTy(nc: NguCanh, d: z.infer<typeof LuocDoLogo>) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "setting" });
  const byte = Buffer.from(d.duLieuBase64, "base64");
  if (byte.length === 0) throw new LoiNghiepVu("Tệp ảnh rỗng.", 422, "tep-rong");
  if (byte.length > LOGO_TOI_DA_BYTE) throw new LoiNghiepVu(`Logo tối đa ${LOGO_TOI_DA_BYTE / 1024} KB — thu nhỏ ảnh rồi thử lại.`, 422, "tep-qua-lon");
  const nd = nhanDangTep(d.tenTep, new Uint8Array(byte.subarray(0, 16)));
  if (!nd.hopLe || !nd.mime) throw new LoiNghiepVu(nd.lyDo ?? "Tệp không hợp lệ.", 422, "kieu-tep");
  if (!MIME_LOGO.includes(nd.mime)) throw new LoiNghiepVu("Logo chỉ nhận ảnh PNG, JPEG hoặc WebP.", 422, "kieu-tep");
  // "RIFF" đầu tệp còn là WAV/AVI — WebP thật có thêm "WEBP" ở byte 8–11.
  if (nd.mime === "image/webp" && byte.subarray(8, 12).toString("latin1") !== "WEBP") {
    throw new LoiNghiepVu("Tệp đặt tên .webp nhưng nội dung không phải ảnh WebP.", 422, "kieu-tep");
  }
  const sha256 = createHash("sha256").update(byte).digest("hex");
  const giaTri = { mime: nd.mime, duLieu: byte.toString("base64"), sha256, kichThuoc: byte.length };
  await nc.tx.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: nc.tenantId, key: KHOA_LOGO } },
    update: { value: giaTri, status: "hoat-dong", updatedBy: nc.hoSo.userId },
    create: { tenantId: nc.tenantId, key: KHOA_LOGO, value: giaTri, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
  });
  // Nhật ký ghi mã băm và kích thước, không ghi nội dung ảnh.
  await nc.kiemToan({ action: "sua", objectType: "setting", after: { khoa: KHOA_LOGO, mime: nd.mime, sha256, kichThuoc: byte.length } });
  await nc.suKien({ eventType: SU_KIEN.SETTING_CHANGED, objectType: "setting", payload: { khoa: KHOA_LOGO } });
  return { mime: nd.mime, sha256, kichThuoc: byte.length };
}

export async function xoaLogoCongTy(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "setting" });
  const xoa = await nc.tx.tenantSetting.deleteMany({ where: { key: KHOA_LOGO } });
  if (xoa.count) {
    await nc.kiemToan({ action: "sua", objectType: "setting", after: { khoa: KHOA_LOGO, giaTri: null } });
    await nc.suKien({ eventType: SU_KIEN.SETTING_CHANGED, objectType: "setting", payload: { khoa: KHOA_LOGO } });
  }
  return { ok: true };
}
