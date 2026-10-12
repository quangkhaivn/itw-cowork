import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, KHOA_BAT_BUOC_2_LOP } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { coKhoaMaHoa, giaiMa, hmac, maHoa } from "@/lib/ma-hoa";
import { kiemTraMatKhau } from "@/lib/xac-thuc";
import { chuanHoaMaKhoiPhuc, kiemMaTotp, nhomKhoa, sinhKhoaTotp, sinhMaKhoiPhuc, uriOtpauth } from "@/lib/totp";

/**
 * Xác thực 2 lớp (TOTP) — BUSINESS_RULES.md mục 22 (XT). Kiến trúc: ARCHITECTURE.md mục 7p.
 *
 *  - Người dùng **tự bật** cho mình: nhận khóa → nhập mã 6 số để xác nhận → nhận 10 mã khôi phục.
 *  - Khóa bí mật mã hóa bằng APP_ENC_KEY (ngữ cảnh `totp:<userId>`); mã khôi phục chỉ lưu băm.
 *  - Bật / tắt / đặt lại đều **thu hồi mọi phiên khác** (`users.security_changed_at`), như đổi mật khẩu.
 *  - Quản trị: chọn vai trò bắt buộc 2 lớp (`setting.update`), đặt lại 2 lớp cho người mất máy
 *    (`user.update`, ghi kiểm toán, không tự đặt lại cho chính mình).
 */

const nguCanhKhoa = (userId: string) => `totp:${userId}`;
const NHA_PHAT_HANH = "TGTH Cowork";

export const LuocDoMa = z.object({ ma: z.string().trim().min(6).max(20) });
export const LuocDoTat2Lop = z.object({ matKhau: z.string().min(1).max(200), ma: z.string().trim().min(6).max(20) });
export const LuocDoChinhSach2Lop = z.object({ vaiTro: z.array(z.string().trim().min(1).max(50)).max(50) });
export const LuocDoDatLai2Lop = z.object({ lyDo: z.string().trim().min(2, "Ghi lý do đặt lại (ví dụ: mất điện thoại).").max(500) });

function batBuocKhoa() {
  if (!coKhoaMaHoa()) {
    throw new LoiNghiepVu("Máy chủ chưa đặt khóa mã hóa APP_ENC_KEY nên chưa bật được xác thực 2 lớp. Báo quản trị máy chủ.", 503, "chua-co-khoa-ma-hoa");
  }
}

export function bamMaKhoiPhuc(userId: string, ma: string): string {
  return hmac("ma-khoi-phuc", `${userId}:${chuanHoaMaKhoiPhuc(ma)}`).toString("hex");
}

async function sinhVaLuuMaKhoiPhuc(tx: ClientTenant, tenantId: string, userId: string): Promise<string[]> {
  const ds = sinhMaKhoiPhuc(10);
  await tx.userRecoveryCode.deleteMany({ where: { userId } });
  await tx.userRecoveryCode.createMany({ data: ds.map((m) => ({ tenantId, userId, codeHash: bamMaKhoiPhuc(userId, m) })) });
  return ds;
}

export async function docChinhSach2Lop(tx: ClientTenant): Promise<string[]> {
  const d = await tx.tenantSetting.findFirst({ where: { key: KHOA_BAT_BUOC_2_LOP, status: "hoat-dong" }, select: { value: true } });
  return Array.isArray(d?.value) ? (d.value as unknown[]).filter((x): x is string => typeof x === "string") : [];
}

// ---------------------------------------------------------------------------
// Của chính mình
// ---------------------------------------------------------------------------

export async function trangThai2LopCuaToi(nc: NguCanh) {
  const u = await nc.tx.user.findFirst({ where: { id: nc.hoSo.userId }, select: { totpEnabledAt: true, totpPendingEnc: true } });
  const conMa = await nc.tx.userRecoveryCode.count({ where: { userId: nc.hoSo.userId, usedAt: null } });
  return {
    daBat: Boolean(u?.totpEnabledAt),
    batLuc: u?.totpEnabledAt ?? null,
    dangCho: Boolean(u?.totpPendingEnc),
    soMaKhoiPhucCon: conMa,
    batBuoc: nc.hoSo.phaiBat2Lop || (await docChinhSach2Lop(nc.tx)).some((v) => nc.hoSo.vaiTro.some((x) => x.code === v)),
    coKhoaMaHoa: coKhoaMaHoa(),
  };
}

/** Bước 1: sinh khóa mới, lưu dạng chờ. Chưa có hiệu lực cho tới khi xác nhận bằng mã đúng. */
export async function batDau2Lop(nc: NguCanh) {
  batBuocKhoa();
  const u = await nc.tx.user.findFirst({ where: { id: nc.hoSo.userId }, select: { totpEnabledAt: true, email: true } });
  if (!u) throw new LoiKhongTimThay("Tài khoản");
  if (u.totpEnabledAt) throw new LoiNghiepVu("Xác thực 2 lớp đang bật. Muốn đổi điện thoại thì tắt rồi bật lại.", 409, "da-bat-2-lop");
  const khoa = sinhKhoaTotp();
  await nc.tx.user.update({ where: { id: nc.hoSo.userId }, data: { totpPendingEnc: maHoa(khoa, nguCanhKhoa(nc.hoSo.userId)) } });
  // Trả khóa đúng MỘT lần cho chính chủ để nhập vào ứng dụng xác thực; không ghi vào nhật ký.
  return { khoa, khoaNhom: nhomKhoa(khoa), uri: uriOtpauth(khoa, u.email, NHA_PHAT_HANH) };
}

/** Bước 2: nhập mã đúng → bật. Trả 10 mã khôi phục (hiện một lần). Route ký lại phiên hiện tại. */
export async function xacNhan2Lop(nc: NguCanh, ma: string) {
  batBuocKhoa();
  const u = await nc.tx.user.findFirst({ where: { id: nc.hoSo.userId }, select: { totpPendingEnc: true, totpEnabledAt: true } });
  if (!u?.totpPendingEnc) throw new LoiNghiepVu("Chưa bắt đầu bật 2 lớp hoặc đã bật xong. Bấm Bật lại từ đầu.", 409, "chua-bat-dau");
  if (u.totpEnabledAt) throw new LoiNghiepVu("Xác thực 2 lớp đang bật.", 409, "da-bat-2-lop");
  const khoa = giaiMa(u.totpPendingEnc, nguCanhKhoa(nc.hoSo.userId));
  const buoc = kiemMaTotp(khoa, ma);
  if (buoc === null) throw new LoiNghiepVu("Mã không đúng. Kiểm giờ trên điện thoại và nhập mã đang hiện.", 422, "sai-ma");
  const luc = new Date();
  await nc.tx.user.update({
    where: { id: nc.hoSo.userId },
    data: { totpSecretEnc: u.totpPendingEnc, totpPendingEnc: null, totpEnabledAt: luc, totpLastStep: BigInt(buoc), securityChangedAt: luc, updatedBy: nc.hoSo.userId },
  });
  const maKhoiPhuc = await sinhVaLuuMaKhoiPhuc(nc.tx, nc.tenantId, nc.hoSo.userId);
  await nc.kiemToan({ action: "bat-2-lop", objectType: "user", objectId: nc.hoSo.userId, after: { soMaKhoiPhuc: maKhoiPhuc.length } });
  await nc.suKien({ eventType: SU_KIEN.TWO_FACTOR_ENABLED, objectType: "user", objectId: nc.hoSo.userId });
  return { maKhoiPhuc };
}

/** Kiểm một mã của chính người đang đăng nhập (TOTP hoặc mã khôi phục). Dùng cho tắt / sinh lại mã. */
async function kiemMaCuaToi(nc: NguCanh, ma: string): Promise<boolean> {
  const kq = await kiemMaDangNhap(nc.tx, nc.hoSo.userId, ma);
  return kq !== null;
}

export async function tat2Lop(nc: NguCanh, matKhau: string, ma: string) {
  const u = await nc.tx.user.findFirst({ where: { id: nc.hoSo.userId }, select: { totpEnabledAt: true, passwordHash: true } });
  if (!u?.totpEnabledAt) throw new LoiNghiepVu("Xác thực 2 lớp chưa bật.", 409, "chua-bat-2-lop");
  const chinhSach = await docChinhSach2Lop(nc.tx);
  if (nc.hoSo.vaiTro.some((v) => chinhSach.includes(v.code))) {
    throw new LoiNghiepVu("Vai trò của bạn bắt buộc xác thực 2 lớp nên không tắt được. Đổi điện thoại thì nhờ quản trị đặt lại.", 403, "bat-buoc-2-lop");
  }
  // Cả mật khẩu lẫn mã: người cầm máy đang mở sẵn không tự gỡ được lớp bảo vệ.
  const dungMk = await kiemTraMatKhau(matKhau, u.passwordHash);
  const dungMa = dungMk && (await kiemMaCuaToi(nc, ma));
  if (!dungMk || !dungMa) throw new LoiNghiepVu("Mật khẩu hoặc mã xác thực không đúng.", 422, "sai-ma");
  await nc.tx.user.update({
    where: { id: nc.hoSo.userId },
    data: { totpSecretEnc: null, totpPendingEnc: null, totpEnabledAt: null, totpLastStep: null, securityChangedAt: new Date(), updatedBy: nc.hoSo.userId },
  });
  await nc.tx.userRecoveryCode.deleteMany({ where: { userId: nc.hoSo.userId } });
  await nc.kiemToan({ action: "tat-2-lop", objectType: "user", objectId: nc.hoSo.userId });
  await nc.suKien({ eventType: SU_KIEN.TWO_FACTOR_DISABLED, objectType: "user", objectId: nc.hoSo.userId });
  return { ok: true };
}

export async function taoLaiMaKhoiPhuc(nc: NguCanh, ma: string) {
  const u = await nc.tx.user.findFirst({ where: { id: nc.hoSo.userId }, select: { totpEnabledAt: true } });
  if (!u?.totpEnabledAt) throw new LoiNghiepVu("Xác thực 2 lớp chưa bật.", 409, "chua-bat-2-lop");
  if (!(await kiemMaCuaToi(nc, ma))) throw new LoiNghiepVu("Mã xác thực không đúng.", 422, "sai-ma");
  const maKhoiPhuc = await sinhVaLuuMaKhoiPhuc(nc.tx, nc.tenantId, nc.hoSo.userId);
  await nc.kiemToan({ action: "sua", objectType: "user", objectId: nc.hoSo.userId, after: { taoLaiMaKhoiPhuc: maKhoiPhuc.length } });
  return { maKhoiPhuc };
}

// ---------------------------------------------------------------------------
// Đăng nhập bước 2
// ---------------------------------------------------------------------------

/**
 * Kiểm mã lúc đăng nhập: 6 chữ số → TOTP (chặn dùng lại mã cùng bước); còn lại → mã khôi phục
 * (đánh dấu đã dùng). Trả loại mã khớp, hoặc null. Không ghi nhật ký — người gọi lo.
 */
export async function kiemMaDangNhap(tx: ClientTenant, userId: string, ma: string): Promise<"totp" | "khoi-phuc" | null> {
  const u = await tx.user.findFirst({ where: { id: userId }, select: { totpSecretEnc: true, totpLastStep: true } });
  if (!u?.totpSecretEnc) return null;
  const sach = ma.replace(/\s/g, "");
  if (/^\d{6}$/.test(sach)) {
    const khoa = giaiMa(u.totpSecretEnc, nguCanhKhoa(userId));
    const buoc = kiemMaTotp(khoa, sach, { buocDaDung: u.totpLastStep === null ? null : Number(u.totpLastStep) });
    if (buoc === null) return null;
    // Cập nhật có điều kiện: hai yêu cầu song song cùng mã thì chỉ một cái thắng.
    const n = await tx.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(buoc) } }] },
      data: { totpLastStep: BigInt(buoc) },
    });
    return n.count === 1 ? "totp" : null;
  }
  const n = await tx.userRecoveryCode.updateMany({ where: { userId, codeHash: bamMaKhoiPhuc(userId, sach), usedAt: null }, data: { usedAt: new Date() } });
  return n.count === 1 ? "khoi-phuc" : null;
}

// ---------------------------------------------------------------------------
// Quản trị
// ---------------------------------------------------------------------------

export async function xemQuanTri2Lop(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "user.view");
  const [chinhSach, vaiTro, nguoi] = await Promise.all([
    docChinhSach2Lop(nc.tx),
    nc.tx.role.findMany({ where: { status: "hoat-dong", code: { not: "ai-assistant" } }, select: { code: true, name: true }, orderBy: { name: "asc" } }),
    nc.tx.user.findMany({
      where: { status: "hoat-dong", isSystem: false },
      select: {
        id: true,
        fullName: true,
        email: true,
        totpEnabledAt: true,
        userRoles: { where: { status: "hoat-dong" }, select: { role: { select: { code: true, name: true } } } },
        _count: { select: { recoveryCodes: { where: { usedAt: null } } } },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return {
    chinhSach,
    coKhoaMaHoa: coKhoaMaHoa(),
    vaiTro: vaiTro.map((v) => ({ ma: v.code, ten: v.name })),
    nguoi: nguoi.map((u) => {
      const vt = u.userRoles.map((r) => r.role);
      return {
        id: u.id,
        hoTen: u.fullName,
        email: u.email,
        daBat: Boolean(u.totpEnabledAt),
        batLuc: u.totpEnabledAt,
        maKhoiPhucCon: u._count.recoveryCodes,
        vaiTro: vt.map((v) => v.name),
        batBuoc: vt.some((v) => chinhSach.includes(v.code)),
      };
    }),
  };
}

/** Chọn vai trò bắt buộc 2 lớp. Mảng rỗng = không bắt buộc ai (giá trị khi chưa đặt). */
export async function luuChinhSach2Lop(nc: NguCanh, vaiTro: string[]) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "setting" });
  const ds = [...new Set(vaiTro)].sort();
  const coThat = await nc.tx.role.findMany({ where: { code: { in: ds }, status: "hoat-dong" }, select: { code: true } });
  if (coThat.length !== ds.length) throw new LoiNghiepVu("Có mã vai trò không tồn tại.", 422, "vai-tro-khong-ton-tai");
  const truoc = await docChinhSach2Lop(nc.tx);
  if (ds.length === 0) await nc.tx.tenantSetting.deleteMany({ where: { key: KHOA_BAT_BUOC_2_LOP } });
  else {
    await nc.tx.tenantSetting.upsert({
      where: { tenantId_key: { tenantId: nc.tenantId, key: KHOA_BAT_BUOC_2_LOP } },
      update: { value: ds, status: "hoat-dong", updatedBy: nc.hoSo.userId },
      create: { tenantId: nc.tenantId, key: KHOA_BAT_BUOC_2_LOP, value: ds, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
    });
  }
  await nc.kiemToan({ action: "sua", objectType: "setting", before: { khoa: KHOA_BAT_BUOC_2_LOP, giaTri: truoc }, after: { khoa: KHOA_BAT_BUOC_2_LOP, giaTri: ds } });
  await nc.suKien({ eventType: SU_KIEN.TWO_FACTOR_POLICY_CHANGED, objectType: "setting", payload: { truoc, sau: ds } });
  return { vaiTro: ds };
}

/** Đặt lại 2 lớp cho người khác (mất điện thoại). Thu hồi mọi phiên của họ. */
export async function datLai2Lop(nc: NguCanh, userId: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "user.update", { objectType: "user", objectId: userId });
  if (userId === nc.hoSo.userId) throw new LoiNghiepVu("Không tự đặt lại 2 lớp cho chính mình — nhờ một quản trị khác.", 409, "khong-tu-dat-lai");
  const u = await nc.tx.user.findFirst({ where: { id: userId, isSystem: false }, select: { id: true, totpEnabledAt: true, totpPendingEnc: true } });
  if (!u) throw new LoiKhongTimThay("Người dùng");
  if (!u.totpEnabledAt && !u.totpPendingEnc) throw new LoiNghiepVu("Người này chưa bật xác thực 2 lớp.", 409, "chua-bat-2-lop");
  await nc.tx.user.update({
    where: { id: userId },
    data: { totpSecretEnc: null, totpPendingEnc: null, totpEnabledAt: null, totpLastStep: null, securityChangedAt: new Date(), updatedBy: nc.hoSo.userId },
  });
  await nc.tx.userRecoveryCode.deleteMany({ where: { userId } });
  await nc.kiemToan({ action: "dat-lai-2-lop", objectType: "user", objectId: userId, after: { lyDo } });
  await nc.suKien({ eventType: SU_KIEN.TWO_FACTOR_RESET, objectType: "user", objectId: userId, payload: { lyDo } });
  return { ok: true };
}
