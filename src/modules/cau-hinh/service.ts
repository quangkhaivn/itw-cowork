import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { DANH_MUC_CAU_HINH, luocDoGiaTri, timMuc } from "./danh-muc";

export const LuocDoCapNhatCauHinh = z.object({
  giaTri: z.record(z.string(), z.number().nullable()),
});

/**
 * Đọc giá trị hiệu lực của một khóa. Không đòi quyền: phân hệ nghiệp vụ (đăng nhập,
 * báo giá) cần đọc ngưỡng mà người dùng không cần vào được màn hình Cấu hình.
 */
export async function docCauHinh(tx: ClientTenant, khoa: string): Promise<number | null> {
  const muc = timMuc(khoa);
  if (!muc) throw new Error(`Khóa cấu hình không có trong danh mục: ${khoa}`);
  const dong = await tx.tenantSetting.findFirst({ where: { key: khoa, status: "hoat-dong" }, select: { value: true } });
  if (!dong) return muc.macDinh;
  const ketQua = luocDoGiaTri(muc).safeParse(dong.value);
  // Giá trị trong cơ sở dữ liệu sai lược đồ (sửa tay?) → quay về mặc định, không đoán.
  return ketQua.success ? ketQua.data : muc.macDinh;
}

export async function tatCaCauHinh(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "setting.view");
  const dong = await nc.tx.tenantSetting.findMany({
    where: { key: { in: DANH_MUC_CAU_HINH.map((m) => m.khoa) } },
    select: { key: true, value: true, updatedAt: true },
  });
  const bang = new Map(dong.map((d) => [d.key, d]));
  return DANH_MUC_CAU_HINH.map((m) => {
    const d = bang.get(m.khoa);
    const hopLe = d ? luocDoGiaTri(m).safeParse(d.value) : null;
    return {
      ...m,
      giaTri: hopLe?.success ? hopLe.data : null,
      daDat: Boolean(d),
      hieuLuc: hopLe?.success ? hopLe.data : m.macDinh,
      capNhatLuc: d?.updatedAt ?? null,
    };
  });
}

/** Cập nhật nhiều khóa một lần. Mỗi khóa đổi giá trị ghi một dòng kiểm toán riêng. */
export async function capNhatCauHinh(nc: NguCanh, d: z.infer<typeof LuocDoCapNhatCauHinh>) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "setting" });

  const loi: Record<string, string> = {};
  const hopLe: { khoa: string; giaTri: number | null }[] = [];
  for (const [khoa, giaTri] of Object.entries(d.giaTri)) {
    const muc = timMuc(khoa);
    if (!muc) {
      loi[khoa] = "Khóa không có trong danh mục cấu hình.";
      continue;
    }
    const kt = luocDoGiaTri(muc).safeParse(giaTri);
    if (!kt.success) loi[khoa] = kt.error.issues[0]?.message ?? "Giá trị không hợp lệ.";
    else hopLe.push({ khoa, giaTri: kt.data });
  }
  if (Object.keys(loi).length) {
    throw new LoiNghiepVu(`Giá trị chưa hợp lệ: ${Object.entries(loi).map(([k, v]) => `${timMuc(k)?.nhan ?? k} — ${v}`).join("; ")}`, 422);
  }

  let soDoi = 0;
  for (const { khoa, giaTri } of hopLe) {
    const cu = await nc.tx.tenantSetting.findFirst({ where: { key: khoa }, select: { id: true, value: true } });
    const giaTriCu = cu ? (cu.value as number | null) : null;
    if (cu && giaTriCu === giaTri) continue;
    if (!cu && giaTri === null) continue;

    if (giaTri === null) {
      // Xóa về "chưa đặt": hệ thống dùng lại mặc định (hoặc trạng thái chưa cấu hình).
      await nc.tx.tenantSetting.deleteMany({ where: { key: khoa } });
    } else {
      await nc.tx.tenantSetting.upsert({
        where: { tenantId_key: { tenantId: nc.tenantId, key: khoa } },
        update: { value: giaTri, status: "hoat-dong", updatedBy: nc.hoSo.userId },
        create: { tenantId: nc.tenantId, key: khoa, value: giaTri, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
      });
    }
    await nc.kiemToan({
      action: "sua",
      objectType: "setting",
      after: { khoa, giaTri },
      before: { khoa, giaTri: giaTriCu },
    });
    await nc.suKien({ eventType: SU_KIEN.SETTING_CHANGED, objectType: "setting", payload: { khoa, truoc: giaTriCu, sau: giaTri } });
    soDoi++;
  }
  return { soDoi };
}
