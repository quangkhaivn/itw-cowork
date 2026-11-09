import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * 0.22.0 (QĐ-190) — QUẢN TRỊ MÁY CHỦ giải phóng một số sê-ri (SN) máy chấm công bị doanh nghiệp khác chiếm.
 *
 * Chạy bằng vai CHỦ SỞ HỮU (DATABASE_URL_OWNER), như seed. Bắt buộc:
 *   SO_SERI=<SN>  LY_DO="<căn cứ, ≥ 10 ký tự — ví dụ phiếu yêu cầu của công ty chủ máy>"
 * Tùy chọn: XAC_NHAN=1 (không có thì chỉ IN ra sẽ làm gì — chạy thử).
 *
 * Cách làm:
 *   - Máy CHỜ XÁC MINH: xóa đăng ký (log cách ly xóa theo).
 *   - Máy ĐÃ XÁC MINH (có thể đã nhận lần chấm): KHÔNG xóa (lần chấm chỉ ghi thêm) — đổi SN thành `<SN>-GP<ngày>` và chuyển
 *     "Ngừng", để công ty chủ máy đăng ký lại đúng SN. Lần chấm đã nhận nằm lại ở doanh nghiệp kia — xử lý theo căn cứ.
 *   - Xóa dòng máy lạ cùng SN (nếu có).
 *   - Ghi nhật ký kiểm toán `giai-phong-sn` trong doanh nghiệp đang giữ SN (người thực hiện: quan-tri-may-chu).
 */

const connectionString = process.env.DATABASE_URL_OWNER;
if (!connectionString) throw new Error("Thiếu DATABASE_URL_OWNER.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const sn = (process.env.SO_SERI ?? "").trim().toUpperCase();
  const lyDo = (process.env.LY_DO ?? "").trim();
  const that = process.env.XAC_NHAN === "1";
  if (!/^[A-Z0-9_-]{4,64}$/.test(sn)) throw new Error("SO_SERI không hợp lệ (4–64 chữ / số / _ -).");
  if (lyDo.length < 10) throw new Error("LY_DO bắt buộc, ít nhất 10 ký tự (căn cứ giải phóng).");
  const ds = await prisma.$queryRaw<{ id: string; tenant_id: string; code: string; verify_status: string; status: string; so_cham: number }[]>`
    SELECT d.id::text, d.tenant_id::text, t.code, d.verify_status, d.status,
           (SELECT count(*)::int FROM attendance_punches p WHERE p.device_id = d.id) AS so_cham
      FROM attendance_devices d JOIN tenants t ON t.id = d.tenant_id
     WHERE upper(d.serial_number) = ${sn}`;
  if (ds.length === 0) {
    const la = await prisma.attendanceUnknownDevice.deleteMany({ where: { serialNumber: sn } });
    console.log(`SN ${sn} chưa được doanh nghiệp nào đăng ký.${la.count ? " Đã xóa dòng máy lạ." : ""}`);
    return;
  }
  const m = ds[0];
  const ngay = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const cachLam = m.verify_status === "cho-xac-minh" ? "xoa-dang-ky-cho-xac-minh" : "doi-so-seri-va-ngung";
  console.log(`SN ${sn} đang thuộc doanh nghiệp "${m.code}" — ${m.verify_status}, ${m.status}, ${m.so_cham} lần chấm. Cách làm: ${cachLam}.`);
  if (!that) {
    console.log("Chạy thử — chưa đổi gì. Đặt XAC_NHAN=1 để thực hiện.");
    return;
  }
  await prisma.$transaction(async (tx) => {
    if (cachLam === "xoa-dang-ky-cho-xac-minh") {
      await tx.attendanceDevice.delete({ where: { id: m.id } });
    } else {
      await tx.attendanceDevice.update({ where: { id: m.id }, data: { serialNumber: `${sn}-GP${ngay}`.slice(0, 64), status: "ngung-hoat-dong" } });
    }
    await tx.attendanceUnknownDevice.deleteMany({ where: { serialNumber: sn } });
    await tx.auditLog.create({
      data: {
        tenantId: m.tenant_id, actorId: null, actorEmail: "quan-tri-may-chu", action: "giai-phong-sn", objectType: "attendance_device", objectId: m.id,
        before: { soSeri: sn, xacMinh: m.verify_status, trangThai: m.status, soLanCham: m.so_cham },
        after: { cachLam, lyDo, ...(cachLam === "doi-so-seri-va-ngung" && { soSeriMoi: `${sn}-GP${ngay}` }) },
      },
    });
  });
  console.log("✓ Đã giải phóng SN và ghi nhật ký kiểm toán (giai-phong-sn).");
}

main()
  .catch((e) => {
    console.error("HỎNG:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
