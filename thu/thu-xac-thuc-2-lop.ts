import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiNghiepVu } from "../src/lib/loi";
import { bamMatKhau, phienConHieuLuc } from "../src/lib/xac-thuc";
import { base32Giai, totp } from "../src/lib/totp";
import {
  batDau2Lop,
  datLai2Lop,
  kiemMaDangNhap,
  luuChinhSach2Lop,
  taoLaiMaKhoiPhuc,
  tat2Lop,
  trangThai2LopCuaToi,
  xacNhan2Lop,
  xemQuanTri2Lop,
} from "../src/modules/xac-thuc-2-lop/service";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng xác thực 2 lớp (BUSINESS_RULES mục 24 — XT) trên CSDL thật, qua đúng service mà
 * API gọi. Phần HTTP (đăng nhập 2 bước, khóa sau N lần sai) kiểm bằng `thu:http`/chạy thật.
 * CHỈ chạy trên cơ sở dữ liệu phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}
if (!process.env.APP_ENC_KEY) {
  console.error("Thiếu APP_ENC_KEY trong .env (openssl rand -base64 32).");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const MAT_KHAU = "MatKhauThu2026";

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-2-lop"));
  });
}

async function nemLoi(ten: string, kieu: "nghiep-vu" | "quyen", khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu = kieu === "quyen" ? e instanceof LoiThieuQuyen : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

/** Mã TOTP tại thời điểm `ms` cho khóa base32. */
const ma = (khoa: string, ms = Date.now()) => totp(base32Giai(khoa), ms);

async function main() {
  console.log("=== Thử xác thực 2 lớp (XT) ===\n");
  const tenant = await seedNenMong(chu, `thu-2lop-${DAU}`, "Doanh nghiệp thử 2 lớp");
  const T = tenant.id;
  const tenantB = await seedNenMong(chu, `thu-2lop-b-${DAU}`, "Doanh nghiệp thử 2 lớp B");
  const hash = await bamMatKhau(MAT_KHAU);
  async function nguoi(tid: string, ten: string, vai: string) {
    const role = await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tid, code: vai } } });
    return (
      await chu.user.create({
        data: {
          tenantId: tid,
          email: `${ten}.${DAU}@thu.test`,
          passwordHash: hash,
          fullName: ten,
          userRoles: { create: { tenantId: tid, roleId: role.id } },
          staffProfile: { create: { tenantId: tid } },
        },
      })
    ).id;
  }
  const gd = await nguoi(T, "giam-doc", "ceo");
  const nv = await nguoi(T, "nhan-vien", "sales");
  const nv2 = await nguoi(T, "nhan-vien-2", "sales");
  const kt = await nguoi(T, "ke-toan", "finance");
  const gdB = await nguoi(tenantB.id, "giam-doc-b", "ceo");
  console.log("");

  // ------------------------------------------------------------------
  console.log("— Tự bật 2 lớp (XT-01 → XT-03) —");
  dat("Ban đầu chưa bật", !(await voi(T, nv, (nc) => trangThai2LopCuaToi(nc))).daBat);
  const bd = await voi(T, nv, (nc) => batDau2Lop(nc));
  dat("Khóa mới 32 ký tự base32 + URI otpauth", /^[A-Z2-7]{32}$/.test(bd.khoa) && bd.uri.startsWith("otpauth://totp/"));
  const u0 = await chu.user.findUniqueOrThrow({ where: { id: nv } });
  dat("XT-02: khóa chờ lưu dạng mã hóa, không chứa khóa thuần", u0.totpPendingEnc?.startsWith("v1:") === true && !u0.totpPendingEnc.includes(bd.khoa));
  dat("Chưa xác nhận thì chưa bật", u0.totpEnabledAt === null && u0.totpSecretEnc === null);
  await nemLoi("XT-01: mã sai không bật được", "nghiep-vu", () => voi(T, nv, (nc) => xacNhan2Lop(nc, "000000")), "sai-ma");
  const phienCu = Date.now() - 1000;
  const xn = await voi(T, nv, (nc) => xacNhan2Lop(nc, ma(bd.khoa)));
  dat("Xác nhận bằng mã đúng → bật, trả 10 mã khôi phục", xn.maKhoiPhuc.length === 10);
  const u1 = await chu.user.findUniqueOrThrow({ where: { id: nv } });
  dat("XT-02: khóa bí mật mã hóa trong CSDL", u1.totpSecretEnc?.startsWith("v1:") === true && !u1.totpSecretEnc.includes(bd.khoa) && u1.totpPendingEnc === null);
  const dongMa = await chu.userRecoveryCode.findMany({ where: { userId: nv } });
  dat("XT-03: 10 mã khôi phục chỉ lưu băm", dongMa.length === 10 && dongMa.every((d) => /^[0-9a-f]{64}$/.test(d.codeHash)) && !JSON.stringify(dongMa).includes(xn.maKhoiPhuc[0].replace("-", "")));
  const hs1 = await voiTenant(T, (tx) => layHoSoQuyen(tx, nv));
  dat("XT-07: bật 2 lớp thu hồi phiên ký trước đó", !phienConHieuLuc(phienCu, hs1!.doiMatKhauLuc) && phienConHieuLuc(Date.now() + 1, hs1!.doiMatKhauLuc));
  const nk = await chu.auditLog.findMany({ where: { tenantId: T, objectId: nv } });
  dat("Nhật ký có 'bat-2-lop' và không chứa khóa hay mã khôi phục", nk.some((n) => n.action === "bat-2-lop") && !JSON.stringify(nk).includes(bd.khoa) && !xn.maKhoiPhuc.some((m) => JSON.stringify(nk).includes(m)));
  await nemLoi("Đang bật thì không bắt đầu lại", "nghiep-vu", () => voi(T, nv, (nc) => batDau2Lop(nc)), "da-bat-2-lop");

  // ------------------------------------------------------------------
  console.log("\n— Kiểm mã lúc đăng nhập (XT-04, XT-05) —");
  const kiem = (m: string) => voiTenant(T, (tx) => kiemMaDangNhap(tx, nv, m));
  dat("Mã vừa dùng để bật không dùng lại được (chống phát lại)", (await kiem(ma(bd.khoa))) === null);
  dat("Mã của bước kế tiếp (đồng hồ lệch +30 giây) được nhận", (await kiem(ma(bd.khoa, Date.now() + 30_000))) === "totp");
  dat("Cùng mã đó dùng lần hai bị từ chối", (await kiem(ma(bd.khoa, Date.now() + 30_000))) === null);
  dat("Mã sai bị từ chối", (await kiem("123456")) === null || (await kiem("654321")) === null);
  dat("Mã khôi phục dùng được (gõ chữ thường, không gạch)", (await kiem(xn.maKhoiPhuc[0].toLowerCase().replace("-", ""))) === "khoi-phuc");
  dat("XT-03: mã khôi phục chỉ dùng một lần", (await kiem(xn.maKhoiPhuc[0])) === null);
  dat("Mã khôi phục của người này không dùng cho người khác", (await voiTenant(T, (tx) => kiemMaDangNhap(tx, nv2, xn.maKhoiPhuc[1]))) === null);
  await nemLoi("Sinh lại mã khôi phục cần mã đúng", "nghiep-vu", () => voi(T, nv, (nc) => taoLaiMaKhoiPhuc(nc, "000000")), "sai-ma");
  const moi = await voi(T, nv, (nc) => taoLaiMaKhoiPhuc(nc, xn.maKhoiPhuc[2]));
  dat("Sinh lại 10 mã mới; mã cũ hết hiệu lực", moi.maKhoiPhuc.length === 10 && (await kiem(xn.maKhoiPhuc[3])) === null && (await kiem(moi.maKhoiPhuc[0])) === "khoi-phuc");

  // ------------------------------------------------------------------
  console.log("\n— Bắt buộc theo vai trò (XT-06) —");
  await nemLoi("Nhân viên không đặt được chính sách (setting.update)", "quyen", () => voi(T, nv, (nc) => luuChinhSach2Lop(nc, ["sales"])));
  await nemLoi("Mã vai trò không tồn tại bị từ chối", "nghiep-vu", () => voi(T, gd, (nc) => luuChinhSach2Lop(nc, ["khong-co"])), "vai-tro-khong-ton-tai");
  dat("Chưa đặt chính sách → không ai bị bắt", !(await voiTenant(T, (tx) => layHoSoQuyen(tx, nv2)))!.phaiBat2Lop);
  await voi(T, gd, (nc) => luuChinhSach2Lop(nc, ["sales"]));
  dat("Vai trò bị bắt mà chưa bật → phaiBat2Lop", (await voiTenant(T, (tx) => layHoSoQuyen(tx, nv2)))!.phaiBat2Lop);
  dat("Đã bật thì không bị chặn", !(await voiTenant(T, (tx) => layHoSoQuyen(tx, nv)))!.phaiBat2Lop);
  dat("Vai trò khác không bị bắt", !(await voiTenant(T, (tx) => layHoSoQuyen(tx, kt)))!.phaiBat2Lop);
  const qt = await voi(T, gd, (nc) => xemQuanTri2Lop(nc));
  dat("Màn hình quản trị liệt kê ai đã bật / bị bắt", qt.nguoi.some((n) => n.id === nv && n.daBat && n.batBuoc) && qt.nguoi.some((n) => n.id === nv2 && !n.daBat && n.batBuoc));
  await nemLoi("Vai trò bắt buộc thì không tự tắt được", "nghiep-vu", () => voi(T, nv, (nc) => tat2Lop(nc, MAT_KHAU, moi.maKhoiPhuc[1])), "bat-buoc-2-lop");
  dat("Sự kiện đổi chính sách được ghi", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "TWO_FACTOR_POLICY_CHANGED" } })) === 1);
  await voi(T, gd, (nc) => luuChinhSach2Lop(nc, []));
  dat("Xóa chính sách → về 'không bắt buộc'", (await chu.tenantSetting.count({ where: { tenantId: T, key: "bao_mat.vai_tro_bat_buoc_2_lop" } })) === 0);

  // ------------------------------------------------------------------
  console.log("\n— Tắt và đặt lại (XT-07, XT-08) —");
  await nemLoi("Tắt cần đúng mật khẩu", "nghiep-vu", () => voi(T, nv, (nc) => tat2Lop(nc, "SaiMatKhau1", moi.maKhoiPhuc[1])), "sai-ma");
  await nemLoi("Tắt cần đúng mã", "nghiep-vu", () => voi(T, nv, (nc) => tat2Lop(nc, MAT_KHAU, "000000")), "sai-ma");
  await voi(T, nv, (nc) => tat2Lop(nc, MAT_KHAU, moi.maKhoiPhuc[1]));
  const u2 = await chu.user.findUniqueOrThrow({ where: { id: nv } });
  dat("Tắt: xóa khóa và mã khôi phục", u2.totpSecretEnc === null && u2.totpEnabledAt === null && (await chu.userRecoveryCode.count({ where: { userId: nv } })) === 0);

  const bd2 = await voi(T, nv, (nc) => batDau2Lop(nc));
  await voi(T, nv, (nc) => xacNhan2Lop(nc, ma(bd2.khoa)));
  await nemLoi("Nhân viên không đặt lại 2 lớp cho người khác (user.update)", "quyen", () => voi(T, nv2, (nc) => datLai2Lop(nc, nv, "mất máy")));
  await nemLoi("Không tự đặt lại cho chính mình", "nghiep-vu", () => voi(T, gd, (nc) => datLai2Lop(nc, gd, "thử")), "khong-tu-dat-lai");
  const truocDatLai = Date.now() - 1;
  await voi(T, gd, (nc) => datLai2Lop(nc, nv, "Mất điện thoại"));
  const u3 = await chu.user.findUniqueOrThrow({ where: { id: nv } });
  dat("XT-08: quản trị đặt lại → người đó hết 2 lớp", u3.totpEnabledAt === null && u3.totpSecretEnc === null);
  dat("XT-08: đặt lại thu hồi mọi phiên của người đó", !phienConHieuLuc(truocDatLai, (await voiTenant(T, (tx) => layHoSoQuyen(tx, nv)))!.doiMatKhauLuc));
  dat("XT-08: ghi kiểm toán 'dat-lai-2-lop' kèm lý do, người làm", (await chu.auditLog.count({ where: { tenantId: T, action: "dat-lai-2-lop", objectId: nv, actorId: gd } })) === 1);
  await nemLoi("Đặt lại người chưa bật → báo rõ", "nghiep-vu", () => voi(T, gd, (nc) => datLai2Lop(nc, nv, "lần hai")), "chua-bat-2-lop");

  // ------------------------------------------------------------------
  console.log("\n— Ràng buộc CSDL và cách ly —");
  let chan1 = false;
  try {
    await chu.user.update({ where: { id: nv2 }, data: { totpSecretEnc: "JBSWY3DPEHPK3PXP", totpEnabledAt: new Date() } });
  } catch {
    chan1 = true;
  }
  dat("[CSDL] CHECK chặn lưu khóa TOTP dạng thuần", chan1);
  let chan2 = false;
  try {
    await chu.user.update({ where: { id: nv2 }, data: { totpEnabledAt: new Date() } });
  } catch {
    chan2 = true;
  }
  dat("[CSDL] CHECK: đã bật thì phải có khóa", chan2);
  const bd3 = await voi(T, kt, (nc) => batDau2Lop(nc));
  await voi(T, kt, (nc) => xacNhan2Lop(nc, ma(bd3.khoa)));
  const demB = await voiTenant(tenantB.id, (tx) => tx.userRecoveryCode.count());
  dat("RLS: doanh nghiệp B không đọc được mã khôi phục của A", demB === 0 && (await chu.userRecoveryCode.count({ where: { tenantId: T } })) > 0);
  await nemLoi("Giám đốc B không đặt lại 2 lớp người của A", "nghiep-vu", () => voi(tenantB.id, gdB, (nc) => datLai2Lop(nc, kt, "thử")));

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử xác thực 2 lớp");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
