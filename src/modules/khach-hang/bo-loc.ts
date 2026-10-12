import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { LuocDoLocKhachHang } from "./luoc-do";
import { chuanHoaThamSoLuu, COT_KHACH, locCot, type MaCot } from "./danh-muc-loc";

/**
 * Bộ lọc đã lưu + tùy chọn cột của danh sách khách hàng (BUSINESS_RULES.md mục 21, KHN-07).
 *
 *   - Bộ lọc cá nhân: ai có `customer.view` cũng lưu được cho mình.
 *   - Bộ lọc dùng chung: cần `customer.approve`. Áp vào ai thì vẫn đi qua phạm vi `customer.view`
 *     của NGƯỜI XEM — một bộ lọc dùng chung không mở thêm khách nào cho sale.
 *   - Tham số lưu trong CSDL KHÔNG được tin: đọc ra luôn lọc theo danh mục khóa và kiểm lại
 *     bằng `LuocDoLocKhachHang` (giá trị lọc nhanh / sắp xếp phải nằm trong danh mục thật).
 */

const MAN_HINH = "khach-hang";

export const LuocDoLuuBoLoc = z.object({
  ten: z.string().trim().min(1, "Đặt tên cho bộ lọc.").max(100),
  thamSo: z.record(z.string(), z.string()),
  dungChung: z.boolean().optional().default(false),
});

export const LuocDoTuyChonDanhSach = z.object({
  cot: z.array(z.string()).max(30).optional(),
  /** id bộ lọc mặc định; null = bỏ mặc định. */
  boLocMacDinhId: z.union([z.uuid(), z.null()]).optional(),
});

/** Kiểm tham số bộ lọc: chỉ khóa đã biết + giá trị qua được lược đồ lọc thật. Trả bản sạch. */
export function kiemTraThamSoBoLoc(x: unknown): Record<string, string> {
  const t = chuanHoaThamSoLuu(x);
  const sach: Record<string, string> = {};
  // Kiểm TỪNG khóa: một giá trị hỏng (mã lọc nhanh đã bỏ, id lạ) chỉ rơi khóa đó, không rơi cả bộ.
  for (const [k, v] of Object.entries(t)) {
    const kq = LuocDoLocKhachHang.safeParse({ [k]: v });
    const gt = kq.success ? (kq.data as Record<string, unknown>)[k] : undefined;
    if (typeof gt === "string" && gt) sach[k] = gt;
  }
  return sach;
}

function boLocRa(v: { id: string; name: string; isShared: boolean; ownerId: string; filters: Prisma.JsonValue; owner: { fullName: string } }, toiId: string) {
  return {
    id: v.id,
    ten: v.name,
    dungChung: v.isShared,
    cuaToi: v.ownerId === toiId,
    nguoiTao: v.owner.fullName,
    thamSo: kiemTraThamSoBoLoc(v.filters),
  };
}
export type BoLocDaLuu = ReturnType<typeof boLocRa>;

/** Bộ lọc của mình + bộ lọc dùng chung đang hoạt động. */
export async function danhSachBoLoc(nc: NguCanh): Promise<BoLocDaLuu[]> {
  batBuocQuyen(nc.hoSo, "customer.view");
  const ds = await nc.tx.savedView.findMany({
    where: { screen: MAN_HINH, status: "hoat-dong", OR: [{ ownerId: nc.hoSo.userId }, { isShared: true }] },
    select: { id: true, name: true, isShared: true, ownerId: true, filters: true, owner: { select: { fullName: true } } },
    orderBy: [{ isShared: "desc" }, { name: "asc" }],
  });
  return ds.map((v) => boLocRa(v, nc.hoSo.userId));
}

export async function luuBoLoc(nc: NguCanh, d: z.infer<typeof LuocDoLuuBoLoc>) {
  batBuocQuyen(nc.hoSo, "customer.view");
  if (d.dungChung) batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "saved_view" });
  const thamSo = kiemTraThamSoBoLoc(d.thamSo);
  const v = await nc.tx.savedView.create({
    data: {
      tenantId: nc.tenantId,
      ownerId: nc.hoSo.userId,
      screen: MAN_HINH,
      name: d.ten,
      isShared: d.dungChung,
      filters: thamSo,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, name: true, isShared: true, ownerId: true, filters: true, owner: { select: { fullName: true } } },
  });
  await nc.kiemToan({ action: "tao", objectType: "saved_view", objectId: v.id, after: { ten: d.ten, dungChung: d.dungChung, thamSo } });
  await nc.suKien({ eventType: SU_KIEN.SAVED_VIEW_CHANGED, objectType: "saved_view", objectId: v.id, payload: { viec: "tao", dungChung: d.dungChung } });
  return boLocRa(v, nc.hoSo.userId);
}

/** Gỡ bộ lọc (xóa mềm): của mình thì tự gỡ; dùng chung của người khác cần `customer.approve`. */
export async function goBoLoc(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "customer.view");
  const v = await nc.tx.savedView.findFirst({
    where: { id, screen: MAN_HINH, status: "hoat-dong", OR: [{ ownerId: nc.hoSo.userId }, { isShared: true }] },
    select: { id: true, ownerId: true, isShared: true, name: true },
  });
  if (!v) throw new LoiKhongTimThay("Bộ lọc");
  if (v.ownerId !== nc.hoSo.userId) batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "saved_view", objectId: id });
  await nc.tx.savedView.update({ where: { id }, data: { status: "ngung-hoat-dong", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "saved_view", objectId: id, before: { trangThai: "hoat-dong" }, after: { trangThai: "ngung-hoat-dong", ten: v.name } });
  await nc.suKien({ eventType: SU_KIEN.SAVED_VIEW_CHANGED, objectType: "saved_view", objectId: id, payload: { viec: "go" } });
  return { id, daGo: true };
}

/** Cột đang chọn + bộ lọc mặc định của người dùng. Bộ lọc mặc định đã gỡ thì coi như không có. */
export async function tuyChonDanhSach(nc: NguCanh): Promise<{ cot: MaCot[]; macDinh: BoLocDaLuu | null }> {
  batBuocQuyen(nc.hoSo, "customer.view");
  const p = await nc.tx.userListPreference.findFirst({ where: { userId: nc.hoSo.userId, screen: MAN_HINH }, select: { columns: true, defaultViewId: true } });
  let macDinh: BoLocDaLuu | null = null;
  if (p?.defaultViewId) {
    const v = await nc.tx.savedView.findFirst({
      where: { id: p.defaultViewId, screen: MAN_HINH, status: "hoat-dong", OR: [{ ownerId: nc.hoSo.userId }, { isShared: true }] },
      select: { id: true, name: true, isShared: true, ownerId: true, filters: true, owner: { select: { fullName: true } } },
    });
    if (v) macDinh = boLocRa(v, nc.hoSo.userId);
  }
  return { cot: locCot(p?.columns), macDinh };
}

export async function luuTuyChonDanhSach(nc: NguCanh, d: z.infer<typeof LuocDoTuyChonDanhSach>) {
  batBuocQuyen(nc.hoSo, "customer.view");
  if (d.boLocMacDinhId) {
    const v = await nc.tx.savedView.findFirst({
      where: { id: d.boLocMacDinhId, screen: MAN_HINH, status: "hoat-dong", OR: [{ ownerId: nc.hoSo.userId }, { isShared: true }] },
      select: { id: true },
    });
    if (!v) throw new LoiKhongTimThay("Bộ lọc");
  }
  const hopLe = new Set<string>(COT_KHACH.map((c) => c.ma));
  if (d.cot && d.cot.some((c) => !hopLe.has(c))) throw new LoiNghiepVu("Có cột không nằm trong danh mục cột.", 400, "cot-la");
  const data = {
    ...(d.cot !== undefined && { columns: locCot(d.cot) }),
    ...(d.boLocMacDinhId !== undefined && { defaultViewId: d.boLocMacDinhId }),
  };
  await nc.tx.userListPreference.upsert({
    where: { userId_screen: { userId: nc.hoSo.userId, screen: MAN_HINH } },
    update: { ...data, updatedBy: nc.hoSo.userId },
    create: { tenantId: nc.tenantId, userId: nc.hoSo.userId, screen: MAN_HINH, ...data, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
  });
  return tuyChonDanhSach(nc);
}

export function quyenBoLoc(nc: NguCanh) {
  return { dungChung: coQuyen(nc.hoSo, "customer.approve") };
}
