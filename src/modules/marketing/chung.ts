import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { coQuyen, type HoSoQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang } from "@/lib/loi";
import { locTheoPhamVi } from "@/modules/crm/chung";
import { cheDienThoai, cheEmail } from "./tinh-toan";

/**
 * Tiện ích dùng chung trong phân hệ Marketing: phạm vi, che liên lạc, kiểm chiến dịch.
 */

/** Đối tượng marketing (chiến dịch, form, nguồn webhook, phân khúc, landing) lọc theo `owner_id` trong phạm vi `marketing.view`. */
export function locMarketing(nc: NguCanh, maQuyen = "marketing.view") {
  return locTheoPhamVi(nc, maQuyen);
}

/**
 * MK-15: SĐT/email của LEAD chỉ hiện cho người có `crm.view`; của LIÊN HỆ KHÁCH chỉ hiện
 * cho người có `customer.view`. Thực tập sinh Marketing không có hai quyền này nên luôn bị che
 * — kiểm theo quyền, không theo tên vai trò, để Giám đốc đổi quyền là đổi được hành vi.
 */
export function duocXemLienLac(hoSo: HoSoQuyen, loai: "lead" | "lien-he"): boolean {
  return coQuyen(hoSo, loai === "lead" ? "crm.view" : "customer.view");
}

export function cheLienLac<T extends { dienThoai: string | null; email: string | null }>(
  hoSo: HoSoQuyen,
  loai: "lead" | "lien-he",
  dong: T,
): T & { daChe: boolean } {
  if (duocXemLienLac(hoSo, loai)) return { ...dong, daChe: false };
  return { ...dong, dienThoai: cheDienThoai(dong.dienThoai), email: cheEmail(dong.email), daChe: true };
}

/** Chiến dịch gắn vào form / nguồn webhook / landing / lead phải tồn tại và chưa hủy. */
export async function kiemTraChienDichGanDuoc(tx: ClientTenant, id: string | null | undefined, truong = "chienDichId") {
  if (!id) return null;
  const c = await tx.marketingCampaign.findFirst({ where: { id, status: { not: "huy" } }, select: { id: true, ownerId: true } });
  if (!c) throw new LoiDinhDang(truong, "Chiến dịch không tồn tại hoặc đã hủy.");
  return c;
}

/** Mã nguồn lead (Dữ liệu gốc `nguon_lead`) phải đang dùng. */
export async function kiemTraNguonLead(tx: ClientTenant, ma: string | null | undefined, truong = "nguon") {
  if (!ma) return null;
  const m = await tx.masterDataItem.findFirst({ where: { type: "nguon_lead", code: ma, status: "hoat-dong" }, select: { code: true } });
  if (!m) throw new LoiDinhDang(truong, "Nguồn không có trong Dữ liệu gốc hoặc đã ngừng dùng.");
  return m.code;
}

/** Danh sách chọn chiến dịch cho các form (chưa hủy, chưa kết thúc trước). */
export async function luaChonChienDich(nc: NguCanh) {
  const ds = await nc.tx.marketingCampaign.findMany({
    where: { status: { notIn: ["huy"] }, ...(await locMarketing(nc)) },
    select: { id: true, code: true, name: true, status: true },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });
  return ds.map((c) => ({ id: c.id, ma: c.code, ten: c.name, trangThai: c.status }));
}
