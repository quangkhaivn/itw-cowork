import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { bamMatKhau, kiemTraMatKhau } from "@/lib/xac-thuc";
import { kiemTraMatKhauManh } from "@/lib/mat-khau";
import { xoaDem } from "@/lib/gioi-han-toc-do";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import type { BoLocNguoiDung, DuLieuSuaNguoiDung, DuLieuTaoNguoiDung } from "./luoc-do";

/**
 * Phân hệ Người dùng — nghiệp vụ.
 *
 * Bất biến bảo vệ ở đây (không chỉ ở giao diện):
 *   1. Luôn còn ít nhất một người thật đang hoạt động giữ vai trò Giám đốc hoặc Quản trị.
 *      Thiếu luật này, một cú bấm nhầm là cả công ty bị khóa ngoài hệ thống.
 *   2. Không tự khóa tài khoản của chính mình.
 *   3. Vai trò trợ lý AI chỉ gắn cho tài khoản máy; tài khoản máy không sửa qua giao diện.
 *   4. Chuỗi quản lý không được vòng (A quản lý B, B quản lý A).
 *   5. Đổi vai trò cần thêm quyền `role.update` — người chỉ có `user.update` không tự
 *      nâng quyền cho người khác được.
 */

const VAI_TRO_QUAN_TRI = ["ceo", "admin"];

const CHON_NGUOI_DUNG = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isSystem: true,
  status: true,
  lastLoginAt: true,
  mustChangePassword: true,
  failedLoginCount: true,
  lockedUntil: true,
  createdAt: true,
  staffProfile: {
    select: {
      employeeCode: true,
      jobTitle: true,
      departmentId: true,
      managerId: true,
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, fullName: true } },
    },
  },
  userRoles: {
    where: { status: "hoat-dong" },
    select: { role: { select: { id: true, code: true, name: true } } },
  },
} satisfies Prisma.UserSelect;

type BanGhiNguoiDung = Prisma.UserGetPayload<{ select: typeof CHON_NGUOI_DUNG }>;

function chuyenDoi(u: BanGhiNguoiDung) {
  return {
    id: u.id,
    email: u.email,
    hoTen: u.fullName,
    dienThoai: u.phone,
    laTaiKhoanMay: u.isSystem,
    trangThai: u.status,
    dangNhapCuoi: u.lastLoginAt,
    phaiDoiMatKhau: u.mustChangePassword,
    soLanSai: u.failedLoginCount,
    khoaDen: u.lockedUntil,
    taoLuc: u.createdAt,
    maNhanVien: u.staffProfile?.employeeCode ?? null,
    chucDanh: u.staffProfile?.jobTitle ?? null,
    phongBan: u.staffProfile?.department ?? null,
    quanLy: u.staffProfile?.manager ? { id: u.staffProfile.manager.id, hoTen: u.staffProfile.manager.fullName } : null,
    vaiTro: u.userRoles.map((ur) => ur.role),
  };
}
export type NguoiDungChiTiet = ReturnType<typeof chuyenDoi>;

/** Ảnh chụp các trường đáng kiểm toán — dùng cho before/after. Không bao giờ có mật khẩu. */
function anhChup(u: NguoiDungChiTiet) {
  return {
    email: u.email,
    hoTen: u.hoTen,
    dienThoai: u.dienThoai,
    maNhanVien: u.maNhanVien,
    chucDanh: u.chucDanh,
    phongBanId: u.phongBan?.id ?? null,
    quanLyId: u.quanLy?.id ?? null,
    vaiTro: u.vaiTro.map((v) => v.code).sort(),
    trangThai: u.trangThai,
  };
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachNguoiDung(nc: NguCanh, boLoc: BoLocNguoiDung) {
  batBuocQuyen(nc.hoSo, "user.view");
  const phamVi = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "user.view");

  const dieuKien: Prisma.UserWhereInput[] = [{ isSystem: false }];
  if (phamVi !== "tat-ca") dieuKien.push({ id: { in: phamVi } });
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { fullName: { contains: boLoc.q, mode: "insensitive" } },
        { email: { contains: boLoc.q, mode: "insensitive" } },
        { phone: { contains: boLoc.q } },
        { staffProfile: { employeeCode: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.vaiTro) dieuKien.push({ userRoles: { some: { status: "hoat-dong", role: { code: boLoc.vaiTro } } } });
  if (boLoc.phongBan) dieuKien.push({ staffProfile: { department: { code: boLoc.phongBan } } });
  if (boLoc.trangThai) dieuKien.push({ status: boLoc.trangThai });

  const where: Prisma.UserWhereInput = { AND: dieuKien };
  const [tong, dong] = await Promise.all([
    nc.tx.user.count({ where }),
    nc.tx.user.findMany({
      where,
      select: CHON_NGUOI_DUNG,
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
  ]);

  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: dong.map(chuyenDoi) };
}

export async function chiTietNguoiDung(nc: NguCanh, id: string): Promise<NguoiDungChiTiet> {
  batBuocQuyen(nc.hoSo, "user.view", { objectType: "user", objectId: id });
  const phamVi = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "user.view");
  if (phamVi !== "tat-ca" && !phamVi.includes(id)) throw new LoiKhongTimThay("Người dùng");
  const u = await nc.tx.user.findFirst({ where: { id }, select: CHON_NGUOI_DUNG });
  if (!u) throw new LoiKhongTimThay("Người dùng");
  return chuyenDoi(u);
}

/** Danh sách chọn cho form: phòng ban, người có thể làm quản lý, vai trò được gán. */
export async function luaChonChoForm(tx: ClientTenant) {
  const [phongBan, nguoi, vaiTro] = await Promise.all([
    tx.department.findMany({ where: { status: "hoat-dong" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    tx.user.findMany({
      where: { status: "hoat-dong", isSystem: false },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
    tx.role.findMany({
      where: { status: "hoat-dong", code: { not: "ai-assistant" } },
      select: { id: true, code: true, name: true, description: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { phongBan, nguoi: nguoi.map((n) => ({ id: n.id, hoTen: n.fullName, email: n.email })), vaiTro };
}

// ---------------------------------------------------------------------------
// Kiểm tra dùng chung
// ---------------------------------------------------------------------------

async function kiemTraPhongBan(tx: ClientTenant, id: string | null | undefined) {
  if (!id) return;
  const pb = await tx.department.findFirst({ where: { id, status: "hoat-dong" }, select: { id: true } });
  if (!pb) throw new LoiNghiepVu("Phòng ban không tồn tại hoặc đã ngừng hoạt động.", 422);
}

async function kiemTraQuanLy(tx: ClientTenant, nguoiId: string | null, quanLyId: string | null | undefined) {
  if (!quanLyId) return;
  if (nguoiId && quanLyId === nguoiId) throw new LoiNghiepVu("Một người không thể tự làm quản lý của chính mình.");
  const ql = await tx.user.findFirst({
    where: { id: quanLyId, status: "hoat-dong", isSystem: false },
    select: { id: true },
  });
  if (!ql) throw new LoiNghiepVu("Người quản lý không tồn tại hoặc đã ngừng hoạt động.");
  if (!nguoiId) return;
  // Đi ngược chuỗi quản lý từ người quản lý mới; gặp lại chính người đang sửa là có vòng.
  let hienTai: string | null = quanLyId;
  for (let buoc = 0; hienTai && buoc < 50; buoc++) {
    if (hienTai === nguoiId) throw new LoiNghiepVu("Chuỗi quản lý bị vòng: người này đang là cấp trên của người được chọn.");
    const hs: { managerId: string | null } | null = await tx.staffProfile.findFirst({
      where: { userId: hienTai },
      select: { managerId: true },
    });
    hienTai = hs?.managerId ?? null;
  }
}

async function kiemTraVaiTro(tx: ClientTenant, vaiTroIds: string[]) {
  if (vaiTroIds.length === 0) return [];
  const ds = await tx.role.findMany({
    where: { id: { in: vaiTroIds }, status: "hoat-dong" },
    select: { id: true, code: true },
  });
  if (ds.length !== new Set(vaiTroIds).size) throw new LoiNghiepVu("Có vai trò không tồn tại hoặc đã ngừng hoạt động.");
  if (ds.some((v) => v.code === "ai-assistant")) {
    throw new LoiNghiepVu("Vai trò Trợ lý AI chỉ dành cho tài khoản máy, không gán cho người.");
  }
  return ds;
}

/** Bất biến 1. Gọi SAU khi ghi, trong cùng giao dịch: vi phạm thì ném lỗi và cả giao dịch cuộn ngược. */
export async function damBaoConQuanTri(tx: ClientTenant) {
  const soNguoi = await tx.user.count({
    where: {
      status: "hoat-dong",
      isSystem: false,
      userRoles: { some: { status: "hoat-dong", role: { code: { in: VAI_TRO_QUAN_TRI }, status: "hoat-dong" } } },
    },
  });
  if (soNguoi === 0) {
    throw new LoiNghiepVu(
      "Thao tác bị chặn: hệ thống phải còn ít nhất một người đang hoạt động giữ vai trò Giám đốc hoặc Quản trị hệ thống.",
      409,
      "mat-quan-tri-cuoi",
    );
  }
}

function kiemTraMatKhau_(matKhau: string, email: string) {
  const loi = kiemTraMatKhauManh(matKhau, email);
  if (loi.length) throw new LoiNghiepVu(`Mật khẩu chưa đạt: ${loi.join(" ")}`, 422, "mat-khau-yeu");
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

export async function taoNguoiDung(nc: NguCanh, d: DuLieuTaoNguoiDung): Promise<NguoiDungChiTiet> {
  batBuocQuyen(nc.hoSo, "user.create", { objectType: "user" });
  if (d.vaiTroIds.length) batBuocQuyen(nc.hoSo, "role.update", { objectType: "user" });

  kiemTraMatKhau_(d.matKhauKhoiTao, d.email);
  await kiemTraPhongBan(nc.tx, d.phongBanId);
  await kiemTraQuanLy(nc.tx, null, d.quanLyId);
  const vaiTro = await kiemTraVaiTro(nc.tx, d.vaiTroIds);

  let moi: { id: string };
  try {
    moi = await nc.tx.user.create({
      data: {
        tenantId: nc.tenantId,
        email: d.email,
        fullName: d.hoTen,
        phone: d.dienThoai ?? null,
        passwordHash: await bamMatKhau(d.matKhauKhoiTao),
        mustChangePassword: d.batDoiMatKhau,
        passwordChangedAt: new Date(),
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
        staffProfile: {
          create: {
            tenantId: nc.tenantId,
            employeeCode: d.maNhanVien ?? null,
            jobTitle: d.chucDanh ?? null,
            departmentId: d.phongBanId ?? null,
            managerId: d.quanLyId ?? null,
            createdBy: nc.hoSo.userId,
          },
        },
        userRoles: {
          create: vaiTro.map((v) => ({ tenantId: nc.tenantId, roleId: v.id, createdBy: nc.hoSo.userId })),
        },
      },
      select: { id: true },
    });
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu("Email hoặc mã nhân viên đã được dùng cho người khác.", 409, "trung");
    throw loi;
  }

  const ketQua = await chiTietNguoiDung(nc, moi.id);
  await nc.kiemToan({ action: "tao", objectType: "user", objectId: moi.id, after: anhChup(ketQua) });
  await nc.suKien({ eventType: SU_KIEN.USER_CREATED, objectType: "user", objectId: moi.id, payload: { email: d.email } });
  if (vaiTro.length) {
    await nc.suKien({
      eventType: SU_KIEN.ROLE_ASSIGNED,
      objectType: "user",
      objectId: moi.id,
      payload: { vaiTro: vaiTro.map((v) => v.code) },
    });
  }
  return ketQua;
}

export async function suaNguoiDung(nc: NguCanh, id: string, d: DuLieuSuaNguoiDung): Promise<NguoiDungChiTiet> {
  batBuocQuyen(nc.hoSo, "user.update", { objectType: "user", objectId: id });
  const truoc = await chiTietNguoiDung(nc, id);
  if (truoc.laTaiKhoanMay) throw new LoiNghiepVu("Tài khoản máy (trợ lý AI) không sửa qua giao diện.", 409);

  if (d.trangThai === "ngung-hoat-dong" && id === nc.hoSo.userId) {
    throw new LoiNghiepVu("Không thể tự khóa tài khoản của chính mình.", 409);
  }
  if (d.phongBanId !== undefined) await kiemTraPhongBan(nc.tx, d.phongBanId);
  if (d.quanLyId !== undefined) await kiemTraQuanLy(nc.tx, id, d.quanLyId);

  // Đổi vai trò: chỉ tính là đổi khi tập vai trò thật sự khác.
  let vaiTroMoi: { id: string; code: string }[] | null = null;
  if (d.vaiTroIds) {
    const cu = new Set(truoc.vaiTro.map((v) => v.id));
    const khac = cu.size !== new Set(d.vaiTroIds).size || d.vaiTroIds.some((v) => !cu.has(v));
    if (khac) {
      batBuocQuyen(nc.hoSo, "role.update", { objectType: "user", objectId: id });
      vaiTroMoi = await kiemTraVaiTro(nc.tx, d.vaiTroIds);
    }
  }

  try {
    await nc.tx.user.update({
      where: { id },
      data: {
        ...(d.hoTen !== undefined && { fullName: d.hoTen }),
        ...(d.dienThoai !== undefined && { phone: d.dienThoai }),
        ...(d.trangThai !== undefined && { status: d.trangThai }),
        ...(d.moKhoaDangNhap && { failedLoginCount: 0, lockedUntil: null }),
        updatedBy: nc.hoSo.userId,
      },
    });

    const hoSoNhanSu = {
      ...(d.maNhanVien !== undefined && { employeeCode: d.maNhanVien }),
      ...(d.chucDanh !== undefined && { jobTitle: d.chucDanh }),
      ...(d.phongBanId !== undefined && { departmentId: d.phongBanId }),
      ...(d.quanLyId !== undefined && { managerId: d.quanLyId }),
    };
    if (Object.keys(hoSoNhanSu).length) {
      await nc.tx.staffProfile.upsert({
        where: { userId: id },
        update: { ...hoSoNhanSu, updatedBy: nc.hoSo.userId },
        create: { tenantId: nc.tenantId, userId: id, ...hoSoNhanSu, createdBy: nc.hoSo.userId },
      });
    }
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu("Mã nhân viên đã được dùng cho người khác.", 409, "trung");
    throw loi;
  }

  if (vaiTroMoi) {
    await nc.tx.userRole.deleteMany({ where: { userId: id, roleId: { notIn: vaiTroMoi.map((v) => v.id) } } });
    for (const v of vaiTroMoi) {
      await nc.tx.userRole.upsert({
        where: { userId_roleId: { userId: id, roleId: v.id } },
        update: { status: "hoat-dong", updatedBy: nc.hoSo.userId },
        create: { tenantId: nc.tenantId, userId: id, roleId: v.id, createdBy: nc.hoSo.userId },
      });
    }
  }

  // Bất biến 1 — kiểm sau khi ghi, trong cùng giao dịch.
  if (vaiTroMoi || d.trangThai === "ngung-hoat-dong") await damBaoConQuanTri(nc.tx);

  const sau = await chiTietNguoiDung(nc, id);
  await nc.kiemToan({
    action: vaiTroMoi ? "doi-quyen" : "sua",
    objectType: "user",
    objectId: id,
    before: anhChup(truoc),
    after: anhChup(sau),
  });
  if (d.moKhoaDangNhap) {
    // Mở khóa cả bộ đếm giới hạn tốc độ theo tài khoản, nếu không người dùng vẫn bị
    // chặn thêm tới 15 phút dù quản trị viên đã mở khóa.
    const tenant = await nc.tx.tenant.findFirst({ where: { id: nc.tenantId }, select: { code: true } });
    if (tenant) await xoaDem(`dang-nhap:tk:${tenant.code.toLowerCase()}:${truoc.email}`);
    if (truoc.khoaDen) await nc.kiemToan({ action: "mo-khoa-dang-nhap", objectType: "user", objectId: id });
  }

  const suKien =
    d.trangThai === "ngung-hoat-dong" && truoc.trangThai !== "ngung-hoat-dong"
      ? SU_KIEN.USER_DEACTIVATED
      : d.trangThai === "hoat-dong" && truoc.trangThai !== "hoat-dong"
        ? SU_KIEN.USER_REACTIVATED
        : SU_KIEN.USER_UPDATED;
  await nc.suKien({ eventType: suKien, objectType: "user", objectId: id });
  if (vaiTroMoi) {
    await nc.suKien({
      eventType: SU_KIEN.ROLE_ASSIGNED,
      objectType: "user",
      objectId: id,
      payload: { truoc: anhChup(truoc).vaiTro, sau: vaiTroMoi.map((v) => v.code).sort() },
    });
  }
  return sau;
}

/** Quản trị đặt lại mật khẩu cho người khác. Mọi phiên cũ của người đó mất hiệu lực. */
export async function datLaiMatKhau(nc: NguCanh, id: string, matKhauMoi: string, batDoiMatKhau: boolean) {
  batBuocQuyen(nc.hoSo, "user.update", { objectType: "user", objectId: id });
  const nguoi = await chiTietNguoiDung(nc, id);
  if (nguoi.laTaiKhoanMay) throw new LoiNghiepVu("Tài khoản máy không có mật khẩu đăng nhập.", 409);
  if (id === nc.hoSo.userId) throw new LoiNghiepVu("Đổi mật khẩu của chính mình ở mục Tài khoản của tôi.", 409);
  kiemTraMatKhau_(matKhauMoi, nguoi.email);

  await nc.tx.user.update({
    where: { id },
    data: {
      passwordHash: await bamMatKhau(matKhauMoi),
      mustChangePassword: batDoiMatKhau,
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({ action: "dat-lai-mat-khau", objectType: "user", objectId: id, after: { batDoiMatKhau } });
  await nc.suKien({ eventType: SU_KIEN.PASSWORD_RESET, objectType: "user", objectId: id });
  return { ok: true };
}

/** Người dùng tự đổi mật khẩu. Không cần quyền riêng, nhưng phải biết mật khẩu hiện tại. */
export async function doiMatKhauCuaToi(nc: NguCanh, matKhauHienTai: string, matKhauMoi: string) {
  const toi = await nc.tx.user.findFirst({
    where: { id: nc.hoSo.userId, status: "hoat-dong" },
    select: { passwordHash: true, email: true },
  });
  if (!toi) throw new LoiKhongTimThay("Tài khoản");
  if (!(await kiemTraMatKhau(matKhauHienTai, toi.passwordHash))) {
    throw new LoiNghiepVu("Mật khẩu hiện tại không đúng.", 422, "sai-mat-khau-hien-tai");
  }
  kiemTraMatKhau_(matKhauMoi, toi.email);

  const luc = new Date();
  await nc.tx.user.update({
    where: { id: nc.hoSo.userId },
    data: {
      passwordHash: await bamMatKhau(matKhauMoi),
      mustChangePassword: false,
      passwordChangedAt: luc,
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({ action: "doi-mat-khau", objectType: "user", objectId: nc.hoSo.userId });
  await nc.suKien({ eventType: SU_KIEN.PASSWORD_CHANGED, objectType: "user", objectId: nc.hoSo.userId });
  return { doiLuc: luc };
}

/** Có được xem nút/thao tác nào trên màn hình người dùng. Chỉ để hiển thị — API tự kiểm lại. */
export function quyenGiaoDienNguoiDung(hoSo: NguCanh["hoSo"]) {
  return {
    tao: coQuyen(hoSo, "user.create"),
    sua: coQuyen(hoSo, "user.update"),
    doiVaiTro: coQuyen(hoSo, "role.update"),
  };
}
