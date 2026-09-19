import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";

/**
 * Phân hệ Phòng ban. Cây lồng nhau qua parent_id; phạm vi dữ liệu "department"
 * đi theo cây này (xem idNguoiTrongPhamVi).
 */

const MA = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,49}$/, "Mã chỉ gồm chữ thường không dấu, số và gạch ngang.");

export const LuocDoTaoPhongBan = z.object({
  ma: MA,
  ten: z.string().trim().min(2, "Tên tối thiểu 2 ký tự.").max(255),
  chaId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .transform((s) => (s ? s : null))
    .optional(),
});

export const LuocDoSuaPhongBan = z.object({
  ten: z.string().trim().min(2).max(255).optional(),
  chaId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .transform((s) => (s ? s : null))
    .optional(),
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional(),
});

export interface NutPhongBan {
  id: string;
  ma: string;
  ten: string;
  chaId: string | null;
  trangThai: string;
  soNguoi: number;
  cap: number;
}

/** Danh sách phẳng, đã xếp theo thứ tự cây (cha trước, con sau) kèm cấp để thụt lề. */
export async function cayPhongBan(nc: NguCanh): Promise<NutPhongBan[]> {
  batBuocQuyen(nc.hoSo, "department.view");
  const ds = await nc.tx.department.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      parentId: true,
      status: true,
      _count: { select: { staff: { where: { user: { status: "hoat-dong" } } } } },
    },
    orderBy: { name: "asc" },
  });

  const theoCha = new Map<string | null, typeof ds>();
  for (const pb of ds) {
    const k = pb.parentId && ds.some((x) => x.id === pb.parentId) ? pb.parentId : null;
    theoCha.set(k, [...(theoCha.get(k) ?? []), pb]);
  }
  const ketQua: NutPhongBan[] = [];
  const daDuyet = new Set<string>();
  const duyet = (chaId: string | null, cap: number) => {
    for (const pb of theoCha.get(chaId) ?? []) {
      if (daDuyet.has(pb.id)) continue;
      daDuyet.add(pb.id);
      ketQua.push({
        id: pb.id,
        ma: pb.code,
        ten: pb.name,
        chaId: pb.parentId,
        trangThai: pb.status,
        soNguoi: pb._count.staff,
        cap,
      });
      duyet(pb.id, cap + 1);
    }
  };
  duyet(null, 0);
  return ketQua;
}

async function kiemTraCha(nc: NguCanh, id: string | null, chaId: string | null | undefined) {
  if (!chaId) return;
  if (id && chaId === id) throw new LoiNghiepVu("Phòng ban không thể là cha của chính nó.");
  const cha = await nc.tx.department.findFirst({ where: { id: chaId, status: "hoat-dong" }, select: { id: true } });
  if (!cha) throw new LoiNghiepVu("Phòng ban cha không tồn tại hoặc đã ngừng hoạt động.");
  if (!id) return;
  let hienTai: string | null = chaId;
  for (let i = 0; hienTai && i < 50; i++) {
    if (hienTai === id) throw new LoiNghiepVu("Không thể đặt phòng ban con làm cha — cây sẽ bị vòng.");
    const pb: { parentId: string | null } | null = await nc.tx.department.findFirst({
      where: { id: hienTai },
      select: { parentId: true },
    });
    hienTai = pb?.parentId ?? null;
  }
}

export async function taoPhongBan(nc: NguCanh, d: z.infer<typeof LuocDoTaoPhongBan>) {
  batBuocQuyen(nc.hoSo, "department.create", { objectType: "department" });
  await kiemTraCha(nc, null, d.chaId);
  try {
    const pb = await nc.tx.department.create({
      data: {
        tenantId: nc.tenantId,
        code: d.ma,
        name: d.ten,
        parentId: d.chaId ?? null,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: { id: true, code: true, name: true, parentId: true },
    });
    await nc.kiemToan({ action: "tao", objectType: "department", objectId: pb.id, after: pb });
    await nc.suKien({ eventType: SU_KIEN.DEPARTMENT_CREATED, objectType: "department", objectId: pb.id });
    return pb;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu(`Mã phòng ban "${d.ma}" đã tồn tại.`, 409, "trung");
    throw loi;
  }
}

export async function suaPhongBan(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaPhongBan>) {
  batBuocQuyen(nc.hoSo, "department.update", { objectType: "department", objectId: id });
  const truoc = await nc.tx.department.findFirst({
    where: { id },
    select: { id: true, code: true, name: true, parentId: true, status: true },
  });
  if (!truoc) throw new LoiKhongTimThay("Phòng ban");
  if (d.chaId !== undefined) await kiemTraCha(nc, id, d.chaId);

  if (d.trangThai === "ngung-hoat-dong" && truoc.status !== "ngung-hoat-dong") {
    const [soCon, soNguoi] = await Promise.all([
      nc.tx.department.count({ where: { parentId: id, status: "hoat-dong" } }),
      nc.tx.staffProfile.count({ where: { departmentId: id, user: { status: "hoat-dong" } } }),
    ]);
    if (soCon || soNguoi) {
      throw new LoiNghiepVu(
        `Chưa ngừng được: còn ${soCon} phòng ban con và ${soNguoi} người đang hoạt động. Chuyển họ sang phòng khác trước.`,
        409,
      );
    }
  }

  const sau = await nc.tx.department.update({
    where: { id },
    data: {
      ...(d.ten !== undefined && { name: d.ten }),
      ...(d.chaId !== undefined && { parentId: d.chaId }),
      ...(d.trangThai !== undefined && { status: d.trangThai }),
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, code: true, name: true, parentId: true, status: true },
  });
  await nc.kiemToan({ action: "sua", objectType: "department", objectId: id, before: truoc, after: sau });
  await nc.suKien({ eventType: SU_KIEN.DEPARTMENT_UPDATED, objectType: "department", objectId: id });
  return sau;
}
