import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { PHAM_VI, type PhamVi } from "@/lib/pham-vi";
import { SU_KIEN } from "@/lib/su-kien";
import { damBaoConQuanTri } from "@/modules/nguoi-dung/service";

/**
 * Phân hệ Vai trò & Quyền.
 *
 * Bất biến:
 *   1. Vai trò Giám đốc và Quản trị hệ thống luôn giữ toàn quyền — không sửa quyền,
 *      không ngừng. Đây là lối thoát cuối cùng khi ai đó cấu hình sai.
 *   2. Trợ lý AI không bao giờ có quyền duyệt hay xóa (mục 21 master prompt: AI cần
 *      người duyệt). Chặn ở đây, ở seed, và ở bài thử.
 *   3. Không cấp cho vai trò khác quyền mà chính mình không có — chống leo thang quyền.
 */

const VAI_TRO_KHOA = ["ceo", "admin"];
const MA_AI = "ai-assistant";

export const LuocDoTaoVaiTro = z.object({
  ma: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,49}$/, "Mã chỉ gồm chữ thường không dấu, số và gạch ngang."),
  ten: z.string().trim().min(2, "Tên tối thiểu 2 ký tự.").max(255),
  moTa: z.string().trim().max(1000).optional().default(""),
  saoChepTuId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .transform((s) => (s ? s : null))
    .optional(),
});

export const LuocDoSuaVaiTro = z.object({
  ten: z.string().trim().min(2).max(255).optional(),
  moTa: z.string().trim().max(1000).optional(),
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional(),
  quyen: z
    .array(z.object({ ma: z.string().max(100), phamVi: z.enum(PHAM_VI) }))
    .max(1000)
    .optional(),
});

export async function danhSachVaiTro(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "role.view");
  const ds = await nc.tx.role.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isBuiltIn: true,
      status: true,
      _count: {
        select: {
          rolePermissions: { where: { status: "hoat-dong" } },
          userRoles: { where: { status: "hoat-dong", user: { status: "hoat-dong" } } },
        },
      },
    },
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
  });
  return ds.map((v) => ({
    id: v.id,
    ma: v.code,
    ten: v.name,
    moTa: v.description,
    dungSan: v.isBuiltIn,
    trangThai: v.status,
    soQuyen: v._count.rolePermissions,
    soNguoi: v._count.userRoles,
    biKhoa: VAI_TRO_KHOA.includes(v.code),
  }));
}

export async function chiTietVaiTro(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "role.view", { objectType: "role", objectId: id });
  const v = await nc.tx.role.findFirst({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isBuiltIn: true,
      status: true,
      rolePermissions: {
        where: { status: "hoat-dong" },
        select: { dataScope: true, permission: { select: { code: true } } },
      },
      userRoles: {
        where: { status: "hoat-dong" },
        select: { user: { select: { id: true, fullName: true, email: true, status: true } } },
      },
    },
  });
  if (!v) throw new LoiKhongTimThay("Vai trò");
  const danhMuc = await nc.tx.permission.findMany({
    where: { status: "hoat-dong" },
    select: { code: true, module: true, action: true },
    orderBy: [{ module: "asc" }, { action: "asc" }],
  });
  return {
    id: v.id,
    ma: v.code,
    ten: v.name,
    moTa: v.description,
    dungSan: v.isBuiltIn,
    trangThai: v.status,
    biKhoa: VAI_TRO_KHOA.includes(v.code),
    laVaiTroAI: v.code === MA_AI,
    quyen: v.rolePermissions.map((rp) => ({ ma: rp.permission.code, phamVi: rp.dataScope as PhamVi })),
    nguoi: v.userRoles.map((ur) => ({
      id: ur.user.id,
      hoTen: ur.user.fullName,
      email: ur.user.email,
      trangThai: ur.user.status,
    })),
    danhMuc,
  };
}
export type VaiTroChiTiet = Awaited<ReturnType<typeof chiTietVaiTro>>;

export async function taoVaiTro(nc: NguCanh, d: z.infer<typeof LuocDoTaoVaiTro>) {
  batBuocQuyen(nc.hoSo, "role.create", { objectType: "role" });
  let quyenSaoChep: { permissionId: string; dataScope: string; code: string }[] = [];
  if (d.saoChepTuId) {
    const nguon = await nc.tx.rolePermission.findMany({
      where: { roleId: d.saoChepTuId, status: "hoat-dong" },
      select: { permissionId: true, dataScope: true, permission: { select: { code: true } } },
    });
    quyenSaoChep = nguon
      .map((q) => ({ permissionId: q.permissionId, dataScope: q.dataScope, code: q.permission.code }))
      // Bất biến 3: chỉ sao chép những quyền chính mình đang có.
      .filter((q) => coQuyen(nc.hoSo, q.code));
  }
  try {
    const v = await nc.tx.role.create({
      data: {
        tenantId: nc.tenantId,
        code: d.ma,
        name: d.ten,
        description: d.moTa || null,
        isBuiltIn: false,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
        rolePermissions: {
          create: quyenSaoChep.map((q) => ({
            tenantId: nc.tenantId,
            permissionId: q.permissionId,
            dataScope: q.dataScope,
            createdBy: nc.hoSo.userId,
          })),
        },
      },
      select: { id: true, code: true, name: true },
    });
    await nc.kiemToan({
      action: "tao",
      objectType: "role",
      objectId: v.id,
      after: { ...v, quyen: quyenSaoChep.map((q) => `${q.code}:${q.dataScope}`).sort() },
    });
    await nc.suKien({ eventType: SU_KIEN.ROLE_CREATED, objectType: "role", objectId: v.id });
    return v;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu(`Mã vai trò "${d.ma}" đã tồn tại.`, 409, "trung");
    throw loi;
  }
}

/** Những mã quyền vi phạm giới hạn của trợ lý AI. Thuần — kiểm thử đơn vị được. */
export function viPhamGioiHanAI(maQuyen: string[]): string[] {
  return maQuyen.filter((m) => m.endsWith(".approve") || m.endsWith(".delete"));
}

export async function suaVaiTro(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaVaiTro>) {
  batBuocQuyen(nc.hoSo, "role.update", { objectType: "role", objectId: id });
  const truoc = await chiTietVaiTro(nc, id);

  if (truoc.biKhoa && (d.quyen || d.trangThai === "ngung-hoat-dong")) {
    throw new LoiNghiepVu(
      `Vai trò "${truoc.ten}" luôn giữ toàn quyền để hệ thống không bị khóa ngoài. Không sửa quyền được.`,
      409,
    );
  }
  if (d.trangThai === "ngung-hoat-dong" && truoc.nguoi.some((n) => n.trangThai === "hoat-dong")) {
    throw new LoiNghiepVu("Còn người đang giữ vai trò này. Gỡ vai trò khỏi họ trước khi ngừng.", 409);
  }

  let thayDoi: { them: string[]; bot: string[]; doiPhamVi: string[] } | null = null;
  if (d.quyen) {
    const hopLe = new Set(truoc.danhMuc.map((p) => p.code));
    const khongCo = d.quyen.filter((q) => !hopLe.has(q.ma)).map((q) => q.ma);
    if (khongCo.length) throw new LoiNghiepVu(`Mã quyền không tồn tại: ${khongCo.slice(0, 5).join(", ")}`, 422);

    if (truoc.laVaiTroAI) {
      const viPham = viPhamGioiHanAI(d.quyen.map((q) => q.ma));
      if (viPham.length) {
        throw new LoiNghiepVu(
          `Trợ lý AI không được cầm quyền duyệt hoặc xóa (${viPham.slice(0, 3).join(", ")}). Mọi thao tác đó cần người duyệt.`,
          422,
          "vi-pham-gioi-han-ai",
        );
      }
    }

    const cu = new Map(truoc.quyen.map((q) => [q.ma, q.phamVi]));
    const moi = new Map(d.quyen.map((q) => [q.ma, q.phamVi]));
    const them = [...moi.keys()].filter((m) => !cu.has(m));
    const bot = [...cu.keys()].filter((m) => !moi.has(m));
    const doiPhamVi = [...moi.keys()].filter((m) => cu.has(m) && cu.get(m) !== moi.get(m));

    // Bất biến 3: cấp thêm quyền (hoặc đổi phạm vi) thì chính mình phải có quyền đó.
    const vuotQuyen = [...them, ...doiPhamVi].filter((m) => !coQuyen(nc.hoSo, m));
    if (vuotQuyen.length) {
      throw new LoiNghiepVu(`Không thể cấp quyền mà chính bạn không có: ${vuotQuyen.slice(0, 5).join(", ")}`, 403);
    }

    if (them.length || bot.length || doiPhamVi.length) {
      thayDoi = { them, bot, doiPhamVi };
      const idTheoMa = new Map(
        (
          await nc.tx.permission.findMany({
            where: { code: { in: [...moi.keys()] } },
            select: { id: true, code: true },
          })
        ).map((p) => [p.code, p.id]),
      );
      if (bot.length) {
        await nc.tx.rolePermission.deleteMany({ where: { roleId: id, permission: { code: { in: bot } } } });
      }
      for (const [ma, phamVi] of moi) {
        if (cu.get(ma) === phamVi) continue;
        const permissionId = idTheoMa.get(ma);
        if (!permissionId) continue;
        await nc.tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: id, permissionId } },
          update: { dataScope: phamVi, status: "hoat-dong", updatedBy: nc.hoSo.userId },
          create: { tenantId: nc.tenantId, roleId: id, permissionId, dataScope: phamVi, createdBy: nc.hoSo.userId },
        });
      }
    }
  }

  await nc.tx.role.update({
    where: { id },
    data: {
      ...(d.ten !== undefined && { name: d.ten }),
      ...(d.moTa !== undefined && { description: d.moTa || null }),
      ...(d.trangThai !== undefined && { status: d.trangThai }),
      updatedBy: nc.hoSo.userId,
    },
  });
  if (d.trangThai === "ngung-hoat-dong") await damBaoConQuanTri(nc.tx);

  const sau = await chiTietVaiTro(nc, id);
  const tomTat = (v: VaiTroChiTiet) => ({
    ten: v.ten,
    moTa: v.moTa,
    trangThai: v.trangThai,
    quyen: v.quyen.map((q) => `${q.ma}:${q.phamVi}`).sort(),
  });
  await nc.kiemToan({
    action: thayDoi ? "doi-quyen" : "sua",
    objectType: "role",
    objectId: id,
    before: tomTat(truoc),
    after: tomTat(sau),
  });
  if (thayDoi) {
    await nc.suKien({
      eventType: SU_KIEN.ROLE_PERMISSIONS_CHANGED,
      objectType: "role",
      objectId: id,
      payload: thayDoi,
    });
  }
  return sau;
}
