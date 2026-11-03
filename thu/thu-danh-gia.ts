import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Tệp đính kèm vào thư mục tạm TRƯỚC khi nạp module kho tệp (như thu-dinh-kem).
process.env.THU_MUC_DINH_KEM = mkdtempSync(path.join(tmpdir(), "cowork-danh-gia-"));

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { chiTietViec, danhSachViec, LuocDoLocViec, LuocDoTaoViec, suaViec, taoViec } from "../src/modules/cong-viec/service";
import {
  capNhatTienDo,
  dieuChinhDiem,
  duyetViec,
  giaoNhieuNguoi,
  lichSuGiaoViec,
  LuocDoTuChoi,
  nhanViec,
  quyetDinhGiaHan,
  traLaiViec,
  tuChoiViec,
  xinGiaHan,
} from "../src/modules/cong-viec/giao-viec";
import { LuocDoLapViec, LuocDoMauViec, sinhViecDinhKy, taoLapViec, taoMauViec } from "../src/modules/cong-viec/mau-lap";
import { quetCongViec } from "../src/modules/cong-viec/nhac-viec";
import { bangBaoCaoNhom, chiTietBaoCao, chuyenVuongMacThanhViec, LuocDoBaoCao, luuBaoCao, moBaoCao, nhanXetBaoCao, quetBaoCao, thongKeBaoCaoTuan } from "../src/modules/bao-cao-cong-viec/service";
import { chiTietPhieu, chotPhieu, danhSachPhieu, dieuChinhPhieu, LuocDoBoKpi, quanLyCham, taoBoKpi, taoKyDanhGia, tuDanhGia } from "../src/modules/danh-gia/service";
import {
  chamPhieuThucTap,
  chiTietPhieuThucTap,
  chotPhieuThucTap,
  danhSachNhatKy,
  danhSachMauPhieu,
  LuocDoMauPhieuLuu,
  luuNhatKy,
  nhanXetNhatKy,
  suaMauPhieu,
  taoMauPhieu,
  taoPhieuThucTap,
} from "../src/modules/thuc-tap/service";
import { dinhKemTep, danhSachDinhKem } from "../src/modules/dinh-kem/service";
import { hanBaoCao, kyBaoCao, MAU_PHIEU_MAC_DINH } from "../src/modules/danh-gia/tinh-toan";
import { congNgay } from "../src/modules/cham-cong/tinh-toan";
import { homNayVN } from "../src/modules/crm/chung";
import PhieuThucTapIn from "../src/components/danh-gia/PhieuThucTapIn";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng 0.20.0 — Nhân sự giai đoạn 2 (giao việc, báo cáo, duyệt, đánh giá, KPI, thực tập) trên CSDL
 * THẬT, qua đúng service mà API gọi. Luật: BUSINESS_RULES.md mục 31 (DG-01 → DG-82).
 * Chạy: npm run thu:danh-gia (CSDL phát triển).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const KQ = "Đã làm xong phần việc được giao, gửi kèm biên bản.";
const GIO = 3_600_000;

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-danh-gia"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "zod";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<void> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "zod" ? (e as Error)?.name === "ZodError"
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}
async function csdlChan(ten: string, khoi: () => Promise<unknown>) {
  try {
    await khoi();
    dat(ten, false, "CSDL không chặn");
  } catch {
    dat(ten, true);
  }
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25]);
const viecMoi = (tieuDe: string, them: Record<string, unknown> = {}) =>
  LuocDoTaoViec.parse({ tieuDe, ...them });

async function main() {
  console.log("=== Thử Nhân sự – giao việc, báo cáo, duyệt, đánh giá, KPI, thực tập (0.20.0) ===\n");
  const tenant = await seedNenMong(chu, `thu-dg-${DAU}`, "Doanh nghiệp thử đánh giá");
  const T = tenant.id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const phong = async (code: string) => (await chu.department.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const pbKD = await phong("kinh-doanh");
  const pbKT = await phong("ky-thuat");
  async function nguoi(ten: string, vai: string, o: { quanLy?: string; phong?: string; loai?: string; chucDanh?: string } = {}) {
    const u = await chu.user.create({
      data: {
        tenantId: T, email: `${ten}.${DAU}@thu.test`, passwordHash: "x", fullName: ten,
        userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
        staffProfile: { create: { tenantId: T, managerId: o.quanLy ?? null, departmentId: o.phong ?? null, staffType: o.loai ?? "chinh-thuc", jobTitle: o.chucDanh ?? null } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("Giám đốc", "ceo", { phong: await phong("ban-giam-doc") });
  const tp = await nguoi("Trưởng phòng KD", "sales-manager", { quanLy: gd, phong: pbKD });
  const nvA = await nguoi("Nhân viên A", "sales", { quanLy: tp, phong: pbKD });
  const nvB = await nguoi("Nhân viên B", "sales", { quanLy: tp, phong: pbKD });
  const tp2 = await nguoi("Trưởng phòng KT", "technical-manager", { quanLy: gd, phong: pbKT });
  const nvC = await nguoi("Kỹ thuật C", "technical", { quanLy: tp2, phong: pbKT });
  const hr = await nguoi("Nhân sự H", "nhan-su-hr", { quanLy: gd });
  const tt1 = await nguoi("Thực tập 1", "sinh-vien-thuc-tap", { quanLy: tp, phong: pbKD, loai: "thuc-tap" });
  const tt2 = await nguoi("Thực tập 2", "sinh-vien-thuc-tap", { quanLy: tp, phong: pbKD, loai: "thuc-tap" });
  const ai = await nguoi("Trợ lý thử", "ai-assistant");
  await chu.internProfile.create({ data: { tenantId: T, userId: tt1, school: "Đại học Bách khoa", faculty: "CNTT", studentCode: "SV001", academicSupervisor: "TS. Lê Văn D", mentorId: tp, startDate: new Date(`${congNgay(homNayVN(), -40)}T00:00:00Z`), endDate: new Date(`${congNgay(homNayVN(), 20)}T00:00:00Z`) } });
  await chu.internProfile.create({ data: { tenantId: T, userId: tt2, school: "Đại học Kinh tế", mentorId: nvA } });

  const thongBao = (userId: string, loai: string, objectId?: string) =>
    chu.notification.findMany({ where: { tenantId: T, userId, type: loai, ...(objectId && { objectId }) }, orderBy: { createdAt: "asc" } });

  // ==================================================================
  console.log("— A. Giao việc: mặc định cần duyệt, phải nhận, phạm vi —");
  const v1 = await voi(T, tp, (nc) => taoViec(nc, viecMoi("Khảo sát mạng văn phòng khách", { nguoiPhuTrachId: nvA, doKho: 4, han: new Date(Date.now() + 48 * GIO).toISOString() })));
  dat("DG-02: giao cho người khác → mặc định cần duyệt", v1.canDuyet === true);
  dat("DG-03: việc giao cho người khác chờ người làm nhận", v1.trangThaiNhan === "cho-nhan");
  dat("Độ khó lưu đúng", v1.doKho === 4);
  const nd1 = await chu.taskApprover.findMany({ where: { taskId: v1.id } });
  dat("DG-21: người duyệt mặc định = người giao", nd1.length === 1 && nd1[0].approverId === tp && nd1[0].level === 1);
  const tbGiao = await thongBao(nvA, "viec-duoc-giao", v1.id);
  dat("Thông báo giao việc nhắc bấm Nhận / Từ chối", tbGiao.length === 1 && /Nhận/.test(tbGiao[0].body ?? ""));
  const tuTao = await voi(T, nvA, (nc) => taoViec(nc, viecMoi("Việc tự tạo của A")));
  dat("Việc tự tạo: không cần duyệt, không cần nhận", tuTao.canDuyet === false && tuTao.trangThaiNhan === null);
  // QĐ-154 (bổ sung): tự tạo + bật cần duyệt mà để trống người duyệt → quản lý trực tiếp (trước đây chặn vì thiếu người duyệt).
  const tuTaoDuyet = await voi(T, nvA, (nc) => taoViec(nc, viecMoi("Tự tạo cần duyệt", { canDuyet: true })));
  dat("Tự tạo + bật cần duyệt, để trống người duyệt → quản lý trực tiếp duyệt (QĐ-154)",
    (await chu.taskApprover.findMany({ where: { taskId: tuTaoDuyet.id } })).map((x) => x.approverId).join() === tp);
  await nemLoi("DG-21: chọn chính người làm làm người duyệt → chặn", "nghiep-vu", () => voi(T, tp, (nc) => taoViec(nc, viecMoi("Sai người duyệt", { nguoiPhuTrachId: nvA, nguoiDuyetIds: [nvA] }))), "tu-duyet");
  await nemLoi("DG-09: trưởng phòng KD không giao được cho kỹ thuật viên phòng khác", "nghiep-vu", () => voi(T, tp, (nc) => taoViec(nc, viecMoi("Ngoài phạm vi", { nguoiPhuTrachId: nvC }))), "ngoai-pham-vi");
  await nemLoi("DG-09: nhân viên (phạm vi của mình) không giao cho đồng nghiệp", "nghiep-vu", () => voi(T, nvA, (nc) => taoViec(nc, viecMoi("A giao B", { nguoiPhuTrachId: nvB }))), "ngoai-pham-vi");
  const gdGiaoC = await voi(T, gd, (nc) => taoViec(nc, viecMoi("Giám đốc giao kỹ thuật", { nguoiPhuTrachId: nvC, canDuyet: false })));
  dat("Giám đốc (toàn công ty) giao cho mọi phòng", gdGiaoC.nguoiPhuTrach.id === nvC && gdGiaoC.canDuyet === false);

  // Từ chối
  await nemLoi("DG-03: từ chối phải có lý do ≥ 5 ký tự", "zod", async () => LuocDoTuChoi.parse({ lyDo: "ko" }));
  const v2 = await voi(T, tp, (nc) => taoViec(nc, viecMoi("Gọi lại khách cũ", { nguoiPhuTrachId: nvA })));
  await nemLoi("Người khác không từ chối thay người làm", "khong-thay", () => voi(T, nvB, (nc) => tuChoiViec(nc, v2.id, { lyDo: "Không phải việc của tôi" })));
  const tc = await voi(T, nvA, (nc) => tuChoiViec(nc, v2.id, { lyDo: "Đang nghỉ phép cả tuần này" }));
  dat("Từ chối: trạng thái nhận = bị từ chối, lưu lý do", tc.trangThaiNhan === "tu-choi" && tc.lyDoTuChoi === "Đang nghỉ phép cả tuần này");
  dat("Người giao nhận thông báo bị từ chối kèm lý do", (await thongBao(tp, "viec-bi-tu-choi", v2.id)).some((t) => /nghỉ phép/.test(t.body ?? "")));
  await nemLoi("Đã từ chối thì người làm không hoàn thành được", "nghiep-vu", () => voi(T, nvA, (nc) => suaViec(nc, v2.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" })), "viec-da-tu-choi");
  const giaoLai = await voi(T, tp, (nc) => suaViec(nc, v2.id, { nguoiPhuTrachId: nvB }));
  dat("Người giao giao lại → người mới chờ nhận, xóa lý do từ chối", giaoLai.nguoiPhuTrach.id === nvB && giaoLai.trangThaiNhan === "cho-nhan" && giaoLai.lyDoTuChoi === null);
  dat("Người mới nhận thông báo được chuyển việc", (await thongBao(nvB, "viec-duoc-giao", v2.id)).length === 1);
  const nhan = await voi(T, nvB, (nc) => nhanViec(nc, v2.id));
  dat("Nhận việc: đã nhận + giờ nhận", nhan.trangThaiNhan === "da-nhan" && !!nhan.nhanLuc);
  dat("Người giao nhận thông báo đã nhận", (await thongBao(tp, "viec-da-nhan", v2.id)).length === 1);
  await nemLoi("Nhận lần hai bị chặn", "nghiep-vu", () => voi(T, nvB, (nc) => nhanViec(nc, v2.id)), "khong-cho-nhan");

  // Nhắc chưa nhận (DG-04)
  const sau25 = new Date(Date.now() + 25 * GIO);
  const n1 = await quetCongViec(T, sau25);
  dat("DG-04: quá hạn nhận → nhắc người giao", n1.soNhacNhan >= 1 && (await thongBao(tp, "viec-chua-nhan", v1.id)).length === 1);
  await quetCongViec(T, sau25);
  dat("Quét lại không nhắc trùng", (await thongBao(tp, "viec-chua-nhan", v1.id)).length === 1);
  dat("Việc đã nhận không bị nhắc", (await thongBao(tp, "viec-chua-nhan", v2.id)).length === 0);

  // Gia hạn (DG-05)
  console.log("\n— A. Gia hạn —");
  await nemLoi("DG-05: người làm không tự đổi hạn việc được giao", "nghiep-vu", () => voi(T, nvA, (nc) => suaViec(nc, v1.id, { han: new Date(Date.now() + 96 * GIO) })), "phai-xin-gia-han");
  const hanXin = new Date(Date.now() + 96 * GIO);
  const gh = await voi(T, nvA, (nc) => xinGiaHan(nc, v1.id, { hanMoi: hanXin, lyDo: "Khách dời lịch khảo sát" }));
  dat("Người giao nhận thông báo xin gia hạn", (await thongBao(tp, "viec-xin-gia-han", v1.id)).length === 1);
  await nemLoi("Một đề nghị gia hạn đang chờ thì không xin thêm", "nghiep-vu", () => voi(T, nvA, (nc) => xinGiaHan(nc, v1.id, { hanMoi: new Date(Date.now() + 120 * GIO), lyDo: "Xin thêm lần nữa" })), "dang-cho-gia-han");
  await nemLoi("Người không phải người giao không duyệt gia hạn", "nghiep-vu", () => voi(T, gd, (nc) => quyetDinhGiaHan(nc, gh.id, { dongY: true, ghiChu: "" })), "khong-phai-nguoi-giao");
  const hanGoc = (await chu.task.findUniqueOrThrow({ where: { id: v1.id } })).dueAt;
  await voi(T, tp, (nc) => quyetDinhGiaHan(nc, gh.id, { dongY: true, ghiChu: "" }));
  const sauGh = await chu.task.findUniqueOrThrow({ where: { id: v1.id } });
  dat("Duyệt gia hạn: hạn mới có hiệu lực, hạn ban đầu giữ nguyên", sauGh.dueAt?.getTime() === hanXin.getTime() && sauGh.originalDueAt?.getTime() === hanGoc?.getTime());
  dat("Người xin nhận thông báo được gia hạn", (await thongBao(nvA, "viec-gia-han-quyet-dinh", v1.id)).length === 1);
  await nemLoi("Quyết định lần hai bị chặn", "nghiep-vu", () => voi(T, tp, (nc) => quyetDinhGiaHan(nc, gh.id, { dongY: false, ghiChu: "Đổi ý rồi" })), "da-quyet-dinh");
  const gh2 = await voi(T, nvA, (nc) => xinGiaHan(nc, v1.id, { hanMoi: new Date(Date.now() + 200 * GIO), lyDo: "Thêm thời gian viết báo cáo" }));
  await nemLoi("Từ chối gia hạn phải có lý do", "nghiep-vu", () => voi(T, tp, (nc) => quyetDinhGiaHan(nc, gh2.id, { dongY: false, ghiChu: "" })), "thieu-ly-do");
  await voi(T, tp, (nc) => quyetDinhGiaHan(nc, gh2.id, { dongY: false, ghiChu: "Không cần thêm thời gian" }));
  dat("Từ chối gia hạn: hạn không đổi; lịch sử giữ 2 đề nghị", (await chu.task.findUniqueOrThrow({ where: { id: v1.id } })).dueAt?.getTime() === hanXin.getTime() && (await chu.taskExtension.count({ where: { taskId: v1.id } })) === 2);
  await csdlChan("CSDL: đề nghị gia hạn đã quyết định không sửa được", () => chu.taskExtension.update({ where: { id: gh.id }, data: { reason: "Sửa lén lý do" } }));
  await csdlChan("CSDL: đề nghị gia hạn không xóa được", () => chu.taskExtension.delete({ where: { id: gh2.id } }));

  // Mẫu việc + chuỗi nhiều cấp
  console.log("\n— A. Mẫu việc, giao nhiều người, việc định kỳ —");
  const mau = await voi(T, tp, (nc) =>
    taoMauViec(nc, LuocDoMauViec.parse({
      ten: `Lắp đặt camera ${DAU}`, tieuDe: "Lắp đặt camera tại khách", doKho: 5, canDuyet: true, soNgayHan: 3,
      mucKiemTra: [{ nhan: "Chụp ảnh nghiệm thu", batBuoc: true }],
      chuoiDuyet: [{ loai: "nguoi-giao" }, { loai: "nguoi-cu-the", nguoiId: gd }],
    })),
  );
  const v3 = await voi(T, tp, (nc) => taoViec(nc, viecMoi("Lắp camera công ty Hòa Bình", { nguoiPhuTrachId: nvA, mauViecId: mau.id })));
  const nd3 = await chu.taskApprover.findMany({ where: { taskId: v3.id }, orderBy: { level: "asc" } });
  dat("DG-06/DG-22: việc từ mẫu mang chuỗi 2 cấp (người giao → giám đốc)", nd3.map((x) => x.approverId).join() === [tp, gd].join());
  dat("Việc từ mẫu: độ khó, danh sách kiểm tra, hạn theo mẫu", v3.doKho === 5 && v3.kiemTra.tong === 1 && !!v3.han && v3.mauViecId === mau.id);

  const nhom = await voi(T, tp, (nc) => giaoNhieuNguoi(nc, viecMoi("Kiểm kê thiết bị demo", { nguoiPhuTrachIds: [nvA, nvB], canDuyet: false })));
  dat("DG-08: giao nhiều người → mỗi người một việc, chung nhóm", nhom.viec.length === 2 && nhom.viec.every((v) => v.nhomId === nhom.nhomId) && new Set(nhom.viec.map((v) => v.nguoiPhuTrach.id)).size === 2);
  await nemLoi("Một người ngoài phạm vi → cả lần giao hủy", "nghiep-vu", () => voi(T, tp, (nc) => giaoNhieuNguoi(nc, viecMoi(`Giao lẫn ${DAU}`, { nguoiPhuTrachIds: [nvA, nvC] }))), "ngoai-pham-vi");
  dat("…và không việc nào được tạo", (await chu.task.count({ where: { tenantId: T, title: `Giao lẫn ${DAU}` } })) === 0);

  // Việc định kỳ (DG-07)
  const homNay = homNayVN();
  const lap = await voi(T, tp, (nc) => taoLapViec(nc, LuocDoLapViec.parse({ ten: "Kiểm tồn sáng", tieuDe: "Kiểm tồn kho trưng bày", tanSuat: "ngay", nguoiIds: [nvA, nvB], tuNgay: homNay, gioHan: "10:00" })));
  const s1 = await sinhViecDinhKy(T);
  const s2 = await sinhViecDinhKy(T);
  const [s3, s4] = await Promise.all([sinhViecDinhKy(T), sinhViecDinhKy(T)]);
  const soLap = await chu.task.count({ where: { recurrenceId: lap.id } });
  dat("DG-07: sinh đúng 2 việc hôm nay (2 người)", s1.soViec === 2 && soLap === 2, `${s1.soViec}/${soLap}`);
  dat("Chạy lại / hai worker cùng lúc không nhân đôi", s2.soViec === 0 && s3.soViec + s4.soViec === 0 && soLap === 2);
  const viecLap = await chu.task.findFirstOrThrow({ where: { recurrenceId: lap.id, ownerId: nvA } });
  dat("Việc định kỳ: người giao = người lập lịch, hạn 10:00 giờ VN hôm nay", viecLap.assignedBy === tp && viecLap.dueAt?.toISOString() === new Date(`${homNay}T03:00:00.000Z`).toISOString());
  await voi(T, tp, (nc) => suaViec(nc, viecLap.id, { nguoiPhuTrachId: nvB }));
  await sinhViecDinhKy(T);
  dat("Chuyển việc đã sinh sang người khác không làm sinh lại", (await chu.task.count({ where: { recurrenceId: lap.id } })) === 2);
  const mai = new Date(Date.now() + 24 * GIO);
  const s5 = await sinhViecDinhKy(T, mai);
  dat("Ngày hôm sau sinh tiếp 2 việc", s5.soViec === 2 && (await chu.task.count({ where: { recurrenceId: lap.id } })) === 4);
  await csdlChan("CSDL: chỉ mục chống trùng việc định kỳ", () =>
    chu.task.create({ data: { tenantId: T, title: "Trùng", ownerId: nvA, recurrenceId: lap.id, recurrenceDate: viecLap.recurrenceDate, recurrenceAssigneeId: nvA } }),
  );

  // ==================================================================
  console.log("\n— B. Tiến độ —");
  await voi(T, nvA, (nc) => nhanViec(nc, v1.id));
  const td = await voi(T, nvA, (nc) => capNhatTienDo(nc, v1.id, { phanTram: 40, ghiChu: "Đã khảo sát tầng 1" }));
  const v1Db = await chu.task.findUniqueOrThrow({ where: { id: v1.id } });
  dat("DG-13: dòng tiến độ ghi % + ghi chú; việc chuyển Đang làm", v1Db.progress === 40 && v1Db.status === "dang-lam");
  dat("Người giao thấy ngay (thông báo tiến độ)", (await thongBao(tp, "viec-tien-do", v1.id)).length === 1);
  await nemLoi("Người khác không ghi tiến độ thay người làm", "nghiep-vu", () => voi(T, tp, (nc) => capNhatTienDo(nc, v1.id, { phanTram: 90, ghiChu: "" })), "khong-phai-nguoi-lam");
  const tep = await voi(T, nvA, (nc) => dinhKemTep(nc, { loai: "task_progress", doiTuongId: td.id, tenTep: "anh-tang-1.pdf", noiDung: PDF, ghiChu: null }));
  dat("Đính kèm ảnh / tệp vào dòng tiến độ", !!tep);
  dat("Trưởng phòng thấy tệp tiến độ", (await voi(T, tp, (nc) => danhSachDinhKem(nc, "task_progress", td.id))).tep.length === 1);
  await nemLoi("Nhân viên B không thấy tệp tiến độ của A", "khong-thay", () => voi(T, nvB, (nc) => danhSachDinhKem(nc, "task_progress", td.id)));
  await csdlChan("CSDL: nhật ký tiến độ chỉ ghi thêm", () => chu.taskProgressLog.update({ where: { id: td.id }, data: { percent: 99 } }));
  const ls1 = await voi(T, tp, (nc) => lichSuGiaoViec(nc, v1.id));
  dat("Lịch sử việc: tiến độ + tệp, gia hạn", ls1.tienDo.length === 1 && ls1.tienDo[0].tep.length === 1 && ls1.giaHan.length === 2);

  // ==================================================================
  console.log("\n— D/E. Duyệt, trả lại, chấm điểm —");
  const gui = await voi(T, nvA, (nc) => suaViec(nc, v1.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  dat("DG-20: việc cần duyệt bấm Xong → Chờ duyệt (chưa xong)", gui.trangThai === "cho-duyet" && gui.xongLuc === null && gui.capDangCho === 1);
  dat("Người duyệt nhận thông báo chờ duyệt", (await thongBao(tp, "viec-cho-duyet", v1.id)).length === 1);
  dat("Người giao chưa nhận thông báo 'đã xong' khi mới gửi duyệt", (await thongBao(tp, "viec-da-xong", v1.id)).length === 0);
  await nemLoi("Đang chờ duyệt thì người làm không sửa được", "nghiep-vu", () => voi(T, nvA, (nc) => suaViec(nc, v1.id, { tieuDe: "Đổi tên khi chờ duyệt" })), "dang-cho-duyet");
  await nemLoi("DG-21: không ai duyệt việc của chính mình", "nghiep-vu", () => voi(T, nvA, (nc) => duyetViec(nc, v1.id, { chatLuong: 5, nhanXet: "" })), "tu-duyet");
  await nemLoi("Người không trong chuỗi không duyệt được", "khong-thay", () => voi(T, nvB, (nc) => duyetViec(nc, v1.id, { chatLuong: 5, nhanXet: "" })));
  await nemLoi("Giám đốc (không trong chuỗi) không duyệt thay", "nghiep-vu", () => voi(T, gd, (nc) => duyetViec(nc, v1.id, { chatLuong: 5, nhanXet: "" })), "khong-phai-luot");
  const cho = await voi(T, tp, (nc) => danhSachViec(nc, LuocDoLocViec.parse({ cheDo: "cho-toi-duyet" })));
  dat("Chế độ 'Chờ tôi duyệt' liệt kê việc", cho.dong.some((v) => v.id === v1.id) && cho.soChoToiDuyet >= 1);
  const tl = await voi(T, tp, (nc) => traLaiViec(nc, v1.id, { lyDo: "Thiếu sơ đồ đi dây tầng 2" }));
  dat("DG-23: trả lại → Đang làm", tl.trangThai === "dang-lam" && tl.capDangCho === null);
  dat("Người làm nhận thông báo bị trả lại kèm lý do", (await thongBao(nvA, "viec-bi-tra-lai", v1.id)).some((t) => /sơ đồ/.test(t.body ?? "")));
  await voi(T, nvA, (nc) => suaViec(nc, v1.id, { trangThai: "xong" }));
  // Hai lần duyệt cùng lúc: khóa dòng → đúng một lần thành công (DG-24).
  const hai = await Promise.allSettled([
    voi(T, tp, (nc) => duyetViec(nc, v1.id, { chatLuong: 4, nhanXet: "Tốt" })),
    voi(T, tp, (nc) => duyetViec(nc, v1.id, { chatLuong: 3, nhanXet: "Lần hai" })),
  ]);
  const ok = hai.filter((r) => r.status === "fulfilled").length;
  const loi409 = hai.filter((r) => r.status === "rejected" && r.reason instanceof LoiNghiepVu && r.reason.status === 409).length;
  dat("DG-24: hai lần duyệt cùng lúc → một thành công, một 409", ok === 1 && loi409 === 1, `${ok} ok, ${loi409} × 409`);
  const v1Xong = await chu.task.findUniqueOrThrow({ where: { id: v1.id } });
  const chatLuong = v1Xong.qualityScore ?? 0;
  dat("Duyệt cấp cuối → Xong, ghi lúc duyệt", v1Xong.status === "xong" && !!v1Xong.completedAt && !!v1Xong.approvedAt);
  dat("DG-30: điểm = độ khó × chất lượng × hệ số đúng hạn (đúng hạn sau gia hạn)", Number(v1Xong.onTimeFactor) === 1 && Number(v1Xong.taskScore) === 4 * chatLuong * 1, `${v1Xong.taskScore}`);
  const nk = await chu.taskApprovalLog.findMany({ where: { taskId: v1.id }, orderBy: { createdAt: "asc" } });
  dat("Lịch sử duyệt chỉ ghi thêm: gửi, trả lại, gửi lại, duyệt", nk.map((x) => x.action).join() === "gui-duyet,tra-lai,gui-duyet,duyet" && nk[2].round === 2);
  dat("Người làm nhận thông báo đã duyệt + điểm", (await thongBao(nvA, "viec-da-duyet", v1.id)).length === 1);
  await csdlChan("CSDL: lịch sử duyệt không sửa được", () => chu.taskApprovalLog.update({ where: { id: nk[0].id }, data: { reason: "x" } }));
  await nemLoi("DG-31: việc đã duyệt không mở lại được", "nghiep-vu", () => voi(T, nvA, (nc) => suaViec(nc, v1.id, { trangThai: "dang-lam" })), "viec-da-duyet");
  await nemLoi("Việc đã duyệt không sửa kết quả được", "nghiep-vu", () => voi(T, nvA, (nc) => suaViec(nc, v1.id, { ketQua: `${KQ} Sửa thêm.`, danhGia: "dat" })), "viec-da-duyet");
  const ct1 = await voi(T, nvA, (nc) => chiTietViec(nc, v1.id));
  dat("DG-33: người làm thấy đánh giá của mình (Đạt) cạnh điểm chất lượng", ct1.viec.danhGia === "dat" && ct1.viec.chatLuong === chatLuong && ct1.viec.diemViec !== null);

  // Điều chỉnh điểm (DG-32)
  await nemLoi("Người làm không tự điều chỉnh điểm", "nghiep-vu", () => voi(T, nvA, (nc) => dieuChinhDiem(nc, v1.id, { chatLuong: 5, lyDo: "Tôi thấy mình làm tốt hơn" })), "tu-duyet");
  await nemLoi("Điều chỉnh điểm phải có lý do ≥ 10 ký tự", "zod", async () => (await import("../src/modules/cong-viec/giao-viec")).LuocDoDieuChinhDiem.parse({ chatLuong: 5, lyDo: "ngắn" }));
  const dc = await voi(T, tp, (nc) => dieuChinhDiem(nc, v1.id, { chatLuong: 5, lyDo: "Khách gửi thư khen chất lượng khảo sát" }));
  dat("Điều chỉnh: điểm mới = 4 × 5 × 1, ghi một dòng điều chỉnh", dc.diemViec === 20 && (await chu.taskScoreAdjustment.count({ where: { taskId: v1.id } })) === 1);
  await csdlChan("CSDL: dòng điều chỉnh điểm chỉ ghi thêm", () => chu.taskScoreAdjustment.deleteMany({ where: { taskId: v1.id } }));

  // Trợ lý AI không thấy điểm
  const aiDs = await voi(T, ai, (nc) => danhSachViec(nc, LuocDoLocViec.parse({ cheDo: "tat-ca", trangThai: "tat-ca", id: v1.id })));
  dat("DG-80: trợ lý AI thấy việc nhưng KHÔNG thấy điểm", aiDs.dong.length === 1 && aiDs.dong[0].diemViec === null && aiDs.dong[0].chatLuong === null);
  dat("Trưởng phòng thấy điểm việc của nhân viên", (await voi(T, tp, (nc) => chiTietViec(nc, v1.id))).viec.diemViec === 20);

  // Nhiều cấp + trễ hạn
  await voi(T, tp, (nc) => suaViec(nc, v3.id, { han: new Date(Date.now() - 48 * GIO) }));
  const mucV3 = await chu.taskChecklistItem.findFirstOrThrow({ where: { taskId: v3.id } });
  await chu.taskChecklistItem.update({ where: { id: mucV3.id }, data: { doneAt: new Date(), doneBy: nvA } });
  await voi(T, nvA, (nc) => suaViec(nc, v3.id, { trangThai: "xong", ketQua: KQ, danhGia: "mot-phan" }));
  const c1 = await voi(T, tp, (nc) => duyetViec(nc, v3.id, { chatLuong: 4, nhanXet: "" }));
  dat("Duyệt nhiều cấp: cấp 1 duyệt → chuyển cấp 2, vẫn chờ duyệt", c1.trangThai === "cho-duyet" && c1.capDangCho === 2);
  dat("Cấp 2 (giám đốc) nhận thông báo chờ duyệt", (await thongBao(gd, "viec-cho-duyet", v3.id)).length === 1);
  await nemLoi("Cấp 1 không duyệt lại khi đã tới cấp 2", "nghiep-vu", () => voi(T, tp, (nc) => duyetViec(nc, v3.id, { chatLuong: 4, nhanXet: "" })), "khong-phai-luot");
  const sau49 = new Date(Date.now() + 49 * GIO);
  await quetCongViec(T, sau49);
  await quetCongViec(T, sau49);
  dat("DG-25: chờ duyệt quá hạn → nhắc người duyệt cấp đang chờ, một lần", (await thongBao(gd, "viec-qua-han-duyet", v3.id)).length === 1);
  const c2 = await voi(T, gd, (nc) => duyetViec(nc, v3.id, { chatLuong: 3, nhanXet: "Trễ hạn" }));
  dat("Cấp cuối duyệt → Xong; trễ > 24 giờ → hệ số 0,5; điểm = 5 × 3 × 0,5", c2.trangThai === "xong" && c2.heSoDungHan === 0.5 && c2.diemViec === 7.5, `${c2.heSoDungHan} / ${c2.diemViec}`);
  dat("Người giao (khác người duyệt cuối) nhận thông báo xong", (await thongBao(tp, "viec-da-xong", v3.id)).length === 1);

  // Việc không cần duyệt vẫn chạy như 0.17
  const v4 = await voi(T, tp, (nc) => taoViec(nc, viecMoi("Gửi tài liệu cho khách", { nguoiPhuTrachId: nvB, canDuyet: false })));
  const x4 = await voi(T, nvB, (nc) => suaViec(nc, v4.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  dat("Việc tắt cần duyệt: xong ngay như 0.17, coi như đã nhận", x4.trangThai === "xong" && x4.trangThaiNhan === "da-nhan" && x4.diemViec === null);

  // ==================================================================
  console.log("\n— C. Báo cáo ngày / tuần —");
  const mo = await voi(T, nvA, (nc) => moBaoCao(nc, "tuan"));
  dat("DG-40: báo cáo tuần điền sẵn việc đã xong trong tuần", mo.daLuu === false && mo.daLam.includes("Khảo sát mạng văn phòng khách"));
  dat("Điền sẵn việc đang làm ở phần Sẽ làm", mo.seLam.includes("Lắp camera") || mo.seLam.length > 0);
  const nop = await voi(T, nvA, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "tuan", daLam: mo.daLam, seLam: mo.seLam, vuongMac: "Thiếu dây mạng Cat6 cho công trình", nop: true })));
  const hanTuan = hanBaoCao("tuan", kyBaoCao("tuan", homNay).tu);
  dat("Nộp: đã nộp, trễ ⇔ nộp sau hạn thứ Sáu 17:00", nop.trangThai === "da-nop" && nop.tre === Date.now() > hanTuan.getTime());
  dat("Quản lý trực tiếp nhận thông báo báo cáo đã nộp", (await thongBao(tp, "bao-cao-da-nop", nop.id)).length === 1);
  await nemLoi("Báo cáo đã nộp không sửa được", "nghiep-vu", () => voi(T, nvA, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "tuan", daLam: "Sửa", nop: false }))), "da-nop");
  await csdlChan("CSDL: báo cáo đã nộp bất biến (trigger)", () => chu.workReport.update({ where: { id: nop.id }, data: { done: "Sửa lén" } }));
  const tuanTruoc = congNgay(homNay, -7);
  const tre = await voi(T, nvA, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "tuan", ngay: tuanTruoc, daLam: "Báo cáo tuần trước nộp muộn", nop: true })));
  dat("DG-43: nộp báo cáo tuần trước sau hạn → ghi trễ", tre.tre === true && tre.tinhTrang === "tre");
  const ngayBc = await voi(T, nvA, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "ngay", daLam: "Gọi 5 khách", nop: false })));
  dat("Báo cáo ngày lưu nháp được (phòng Kinh doanh bật báo cáo ngày)", ngayBc.trangThai === "nhap");
  await nemLoi("Không nộp báo cáo cho kỳ tương lai", "nghiep-vu", () => voi(T, nvA, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "tuan", ngay: congNgay(homNay, 14), daLam: "x", nop: true }))), "ky-tuong-lai");

  const bang = await voi(T, tp, (nc) => bangBaoCaoNhom(nc, "tuan"));
  const dongA = bang.dong.find((d) => d.nguoiId === nvA);
  const dongB = bang.dong.find((d) => d.nguoiId === nvB);
  dat("DG-45: trang nhóm — A đã nộp, B chưa nộp / thiếu", !!dongA?.baoCao && ["chua-nop", "thieu"].includes(dongB?.tinhTrang ?? ""));
  dat("Trang nhóm của TP Kinh doanh không có người phòng Kỹ thuật", !bang.dong.some((d) => d.nguoiId === nvC));
  dat("Trang nhóm của TP Kỹ thuật (phạm vi phòng) có C, không có A", await voi(T, tp2, async (nc) => { const b = await bangBaoCaoNhom(nc, "tuan"); return b.dong.some((d) => d.nguoiId === nvC) && !b.dong.some((d) => d.nguoiId === nvA); }));
  await nemLoi("Nhân viên B không đọc được báo cáo của A", "khong-thay", () => voi(T, nvB, (nc) => chiTietBaoCao(nc, nop.id)));
  await nemLoi("TP Kỹ thuật không đọc được báo cáo của A", "khong-thay", () => voi(T, tp2, (nc) => chiTietBaoCao(nc, nop.id)));
  await voi(T, tp, (nc) => nhanXetBaoCao(nc, nop.id, { noiDung: "Ổn, tuần sau ưu tiên khách Hòa Bình." }));
  dat("Nhận xét báo cáo → người viết nhận thông báo", (await thongBao(nvA, "bao-cao-nhan-xet", nop.id)).length === 1);
  await nemLoi("Người viết không tự nhận xét / chuyển vướng mắc của mình", "nghiep-vu", () => voi(T, nvA, (nc) => nhanXetBaoCao(nc, nop.id, { noiDung: "Tự khen" })), "khong-duoc-nhan-xet");
  const vm = await voi(T, tp, (nc) => chuyenVuongMacThanhViec(nc, nop.id, { tieuDe: "Mua bổ sung dây Cat6", moTa: "", nguoiPhuTrachId: nvB, han: null }));
  const vmDb = await chu.task.findUniqueOrThrow({ where: { id: vm.id } });
  dat("DG-44: một nút — vướng mắc thành việc, gắn báo cáo nguồn", vmDb.sourceReportId === nop.id && vmDb.ownerId === nvB && (vmDb.description ?? "").includes("Cat6"));
  const ctBc = await voi(T, nvA, (nc) => chiTietBaoCao(nc, nop.id));
  dat("Báo cáo ghi lại việc đã tạo từ vướng mắc", ctBc.nhanXet.some((x) => x.viecId === vm.id));
  const tk = await thongKeBaoCaoTuan(chu as never, nvA, congNgay(homNay, -13), homNay);
  dat("Thống kê cho đánh giá: tuần trước ghi trễ", tk.batBuoc && tk.tre >= 1);
  const truocHan = new Date(hanTuan.getTime() - GIO);
  if (Date.now() < truocHan.getTime()) {
    await quetBaoCao(T, truocHan);
    await quetBaoCao(T, truocHan);
    dat("DG-42: nhắc trước hạn người chưa nộp (B), một lần; người đã nộp (A) không bị nhắc", (await thongBao(nvB, "bao-cao-nhac")).length === 1 && (await thongBao(nvA, "bao-cao-nhac")).length === 0);
  } else {
    dat("DG-42: (đã qua hạn tuần này) bỏ phần nhắc trước hạn", true);
  }
  await quetBaoCao(T, new Date(hanTuan.getTime() + GIO));
  dat("DG-42: quá hạn mà chưa nộp → báo thiếu cho B", (await thongBao(nvB, "bao-cao-thieu")).length >= 1);
  dat("Thực tập sinh không bị đòi báo cáo tuần", (await thongBao(tt1, "bao-cao-thieu")).length === 0);

  // ==================================================================
  console.log("\n— F/G. KPI và đánh giá định kỳ —");
  const boKpi = {
    ma: `kd-${DAU}`, ten: "KPI Kinh doanh", maVaiTro: "sales",
    chiTieu: [
      { ten: "Tổng điểm công việc", trongSo: 40, nguon: "tu-dong", chiSo: "tong-diem-viec", mucTieuThang: 20, mucTieuQuy: 60 },
      { ten: "Tỷ lệ việc bị trả lại", trongSo: 20, nguon: "tu-dong", chiSo: "ty-le-tra-lai", mucTieuThang: 10, mucTieuQuy: 10 },
      { ten: "Thái độ với khách", trongSo: 40, nguon: "thu-cong" },
    ],
  };
  await nemLoi("DG-50: tổng trọng số phải bằng 100", "zod", async () => LuocDoBoKpi.parse({ ...boKpi, chiTieu: boKpi.chiTieu.slice(0, 2) }));
  await nemLoi("Nhân viên không tạo bộ KPI", "quyen", () => voi(T, nvA, (nc) => taoBoKpi(nc, LuocDoBoKpi.parse(boKpi))));
  await voi(T, hr, (nc) => taoBoKpi(nc, LuocDoBoKpi.parse(boKpi)));
  await voi(T, hr, (nc) => taoBoKpi(nc, LuocDoBoKpi.parse({ ma: `mac-dinh-${DAU}`, ten: "KPI chung", chiTieu: [{ ten: "Tỷ lệ việc đúng hạn", trongSo: 100, nguon: "tu-dong", chiSo: "ty-le-dung-han", mucTieuThang: 90 }] })));
  const thangNay = Number(homNay.slice(5, 7));
  const namNay = Number(homNay.slice(0, 4));
  await nemLoi("Nhân viên không mở kỳ đánh giá", "quyen", () => voi(T, nvA, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: namNay, so: thangNay })));
  const ky = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: namNay, so: thangNay }));
  dat("DG-60: mở kỳ tháng → phiếu cho người có quản lý trực tiếp (không gồm thực tập sinh)", ky.soPhieu >= 5, `${ky.soPhieu} phiếu`);
  await nemLoi("Không mở trùng kỳ", "nghiep-vu", () => voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: namNay, so: thangNay })), "trung-ky");
  const phieuA = await chu.evaluation.findFirstOrThrow({ where: { periodId: ky.id, userId: nvA }, include: { items: { orderBy: { position: "asc" } } } });
  dat("Không có phiếu cho thực tập sinh", (await chu.evaluation.count({ where: { periodId: ky.id, userId: { in: [tt1, tt2] } } })) === 0);
  dat("DG-51: bộ KPI chọn theo vai trò (sales)", phieuA.kpiSetName === "KPI Kinh doanh" && phieuA.items.length === 3);
  const phieuC = await chu.evaluation.findFirstOrThrow({ where: { periodId: ky.id, userId: nvC }, include: { items: true } });
  dat("Không khớp chức danh / vai trò → bộ mặc định", phieuC.kpiSetName === "KPI chung");
  const diemThang = Number((await chu.task.aggregate({ where: { ownerId: nvA, approvedAt: { not: null } }, _sum: { taskScore: true } }))._sum.taskScore ?? 0);
  dat("DG-52: chỉ tiêu tự tính điền sẵn — tổng điểm việc tháng này", Number(phieuA.items[0].actual) === diemThang, `${phieuA.items[0].actual} / ${diemThang}`);
  dat("Tỷ lệ trả lại tự tính (1 trên 2 việc gửi duyệt = 50%)", Number(phieuA.items[1].actual) === 50, `${phieuA.items[1].actual}`);
  dat("Bối cảnh: thống kê báo cáo tuần trong kỳ", typeof (phieuA.context as { baoCaoTuan?: unknown }).baoCaoTuan === "object");
  dat("Nhân viên được báo mở kỳ", (await thongBao(nvA, "danh-gia-mo", phieuA.id)).length === 1);

  await nemLoi("RLS phạm vi: nhân viên B không đọc phiếu của A", "khong-thay", () => voi(T, nvB, (nc) => chiTietPhieu(nc, phieuA.id)));
  await nemLoi("RLS phạm vi: TP Kỹ thuật không đọc phiếu của A", "khong-thay", () => voi(T, tp2, (nc) => chiTietPhieu(nc, phieuA.id)));
  await nemLoi("DG-80: trợ lý AI không đọc được phiếu đánh giá", "quyen", () => voi(T, ai, (nc) => chiTietPhieu(nc, phieuA.id)));
  dat("Trưởng phòng chỉ thấy phiếu nhóm mình", await voi(T, tp, async (nc) => { const d = await danhSachPhieu(nc, ky.id); return d.phieu.some((p) => p.nguoiId === nvA) && !d.phieu.some((p) => p.nguoiId === nvC); }));
  dat("Nhân sự thấy phiếu toàn công ty", await voi(T, hr, async (nc) => (await danhSachPhieu(nc, ky.id)).phieu.length === ky.soPhieu));

  await nemLoi("Quản lý không tự đánh giá thay nhân viên", "nghiep-vu", () => voi(T, tp, (nc) => tuDanhGia(nc, phieuA.id, { ghiChu: "", chiTieu: [], nop: true })), "khong-phai-cua-ban");
  const itA = phieuA.items;
  await voi(T, nvA, (nc) => tuDanhGia(nc, phieuA.id, { ghiChu: "Tháng này tập trung khảo sát.", chiTieu: [{ id: itA[2].id, diem: 90, ghiChu: "Khách khen" }], nop: true }));
  dat("DG-62: tự đánh giá → chờ quản lý; quản lý được báo", (await chu.evaluation.findUniqueOrThrow({ where: { id: phieuA.id } })).status === "quan-ly" && (await thongBao(tp, "danh-gia-cho-cham", phieuA.id)).length === 1);
  await nemLoi("Không ai tự chấm phiếu của mình", "nghiep-vu", () => voi(T, nvA, (nc) => quanLyCham(nc, phieuA.id, { nhanXet: "", chiTieu: [], nop: true })), "khong-duoc-cham");
  await nemLoi("Nộp chấm khi còn chỉ tiêu tay chưa có điểm → chặn", "nghiep-vu", () => voi(T, tp, (nc) => quanLyCham(nc, phieuA.id, { nhanXet: "Tốt", chiTieu: [], nop: true })), "thieu-diem");
  await voi(T, tp, (nc) => quanLyCham(nc, phieuA.id, { nhanXet: "Chủ động, khách hài lòng.", chiTieu: [{ id: itA[2].id, diem: 80, ghiChu: "" }], nop: true }));
  dat("DG-63: quản lý chấm → chờ chốt; người chốt dự kiến (giám đốc) được báo", (await chu.evaluation.findUniqueOrThrow({ where: { id: phieuA.id } })).status === "cho-chot" && (await thongBao(gd, "danh-gia-cho-chot", phieuA.id)).length === 1);
  await nemLoi("Nhân sự (không có quyền chốt) không chốt được", "nghiep-vu", () => voi(T, hr, (nc) => chotPhieu(nc, phieuA.id, { ghiChu: "" })), "khong-duoc-chot");
  const hai2 = await Promise.allSettled([voi(T, gd, (nc) => chotPhieu(nc, phieuA.id, { ghiChu: "" })), voi(T, gd, (nc) => chotPhieu(nc, phieuA.id, { ghiChu: "lần 2" }))]);
  dat("Chốt hai lần cùng lúc → một thành công, một 409", hai2.filter((r) => r.status === "fulfilled").length === 1 && hai2.filter((r) => r.status === "rejected" && r.reason instanceof LoiNghiepVu && r.reason.status === 409).length === 1);
  const chot = await chu.evaluation.findUniqueOrThrow({ where: { id: phieuA.id }, include: { items: { orderBy: { position: "asc" } } } });
  const a0 = Math.min(Number(chot.items[0].achievement), 120);
  const a1 = Number(chot.items[1].achievement);
  const mong = Math.round(((40 * a0 + 20 * a1 + 40 * 80) / 100) * 100) / 100;
  dat("DG-64: điểm tổng = trung bình có trọng số", Number(chot.totalScore) === mong, `${chot.totalScore} / ${mong}`);
  const loaiMong = mong >= 90 ? "A" : mong >= 75 ? "B" : mong >= 60 ? "C" : "D";
  dat("DG-65: xếp loại + hệ số thưởng theo bảng Cấu hình", chot.grade === loaiMong && Number(chot.bonusCoef) === ({ A: 1.2, B: 1, C: 0.8, D: 0 } as Record<string, number>)[loaiMong]);
  dat("Nhân viên nhận thông báo kết quả đã chốt", (await thongBao(nvA, "danh-gia-da-chot", phieuA.id)).length === 1);
  await csdlChan("DG-66: CSDL chặn sửa phiếu đã chốt (kể cả chủ sở hữu)", () => chu.evaluation.update({ where: { id: phieuA.id }, data: { grade: "A" } }));
  await csdlChan("DG-66: CSDL chặn sửa chỉ tiêu của phiếu đã chốt", () => chu.evaluationItem.update({ where: { id: itA[2].id }, data: { managerScore: 100 } }));
  await nemLoi("Phiếu đã chốt không chấm lại được", "nghiep-vu", () => voi(T, tp, (nc) => quanLyCham(nc, phieuA.id, { nhanXet: "", chiTieu: [{ id: itA[2].id, diem: 100, ghiChu: "" }], nop: false })), "sai-buoc");
  await nemLoi("DG-67: điều chỉnh phải có lý do", "zod", async () => (await import("../src/modules/danh-gia/service")).LuocDoDieuChinh.parse({ lyDo: "ngắn", chiTieu: [{ id: itA[2].id, diem: 100 }] }));
  const dcp = await voi(T, gd, (nc) => dieuChinhPhieu(nc, phieuA.id, { lyDo: "Bổ sung phản hồi tốt của khách cuối tháng", chiTieu: [{ id: itA[2].id, diem: 100 }] }));
  const mong2 = Math.round(((40 * a0 + 20 * a1 + 40 * 100) / 100) * 100) / 100;
  dat("DG-67: điều chỉnh ghi thêm; kết quả hiệu lực theo lần điều chỉnh, phiếu gốc giữ nguyên", dcp.phieu.hieuLuc?.tongDiem === mong2 && Number((await chu.evaluation.findUniqueOrThrow({ where: { id: phieuA.id } })).totalScore) === mong);
  await csdlChan("CSDL: phiên điều chỉnh chỉ ghi thêm", () => chu.evaluationAdjustment.deleteMany({ where: { evaluationId: phieuA.id } }));
  const kyQuy = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "quy", nam: namNay, so: Math.ceil(thangNay / 3), nguoiIds: [nvA] }));
  dat("Kỳ quý: mục tiêu quý được dùng", Number((await chu.evaluationItem.findFirstOrThrow({ where: { evaluation: { periodId: kyQuy.id, userId: nvA }, name: "Tổng điểm công việc" } })).target) === 60);

  // ==================================================================
  console.log("\n— H. Sinh viên thực tập —");
  const nk1 = await voi(T, tt1, (nc) => luuNhatKy(nc, { daLam: "Cài đặt máy trạm cho phòng kế toán", hocDuoc: "Cấu hình domain", vuongMac: "Chưa có quyền quản trị", nop: true }));
  dat("DG-70: thực tập sinh nộp nhật ký tuần; người hướng dẫn được báo", nk1.trangThai === "da-nop" && (await thongBao(tp, "nhat-ky-thuc-tap", nk1.id)).length === 1);
  await nemLoi("Nhân viên chính thức không viết nhật ký thực tập", "nghiep-vu", () => voi(T, nvA, (nc) => luuNhatKy(nc, { daLam: "x", hocDuoc: "", vuongMac: "", nop: true })), "khong-phai-thuc-tap");
  await csdlChan("CSDL: nhật ký đã nộp bất biến", () => chu.internJournal.update({ where: { id: nk1.id }, data: { did: "Sửa" } }));
  await voi(T, tp, (nc) => nhanXetNhatKy(nc, nk1.id, { noiDung: "Đã cấp quyền, tuần sau làm tiếp." }));
  dat("DG-71: người hướng dẫn nhận xét; thực tập sinh thấy nhận xét", (await voi(T, tt1, (nc) => danhSachNhatKy(nc))).nhatKy[0]?.nhanXet.length === 1);
  await nemLoi("Cách ly: thực tập sinh 2 không đọc nhật ký của thực tập sinh 1", "khong-thay", () => voi(T, tt2, (nc) => danhSachNhatKy(nc, tt1)));
  await nemLoi("Cách ly: thực tập sinh không nhận xét được nhật ký người khác", "khong-thay", () => voi(T, tt2, (nc) => nhanXetNhatKy(nc, nk1.id, { noiDung: "Hay đấy" })));
  await nemLoi("Cách ly: thực tập sinh không đọc báo cáo của nhân viên", "khong-thay", () => voi(T, tt1, (nc) => chiTietBaoCao(nc, nop.id)));
  await nemLoi("Cách ly: thực tập sinh không đọc phiếu đánh giá của nhân viên", "khong-thay", () => voi(T, tt1, (nc) => chiTietPhieu(nc, phieuA.id)));
  await nemLoi("Thực tập sinh không có quyền tạo việc", "quyen", () => voi(T, tt1, (nc) => taoViec(nc, viecMoi("Thực tập tự giao"))));
  const viecTt = await voi(T, tp, (nc) => taoViec(nc, viecMoi("Cài máy in tầng 3", { nguoiPhuTrachId: tt1 })));
  const dsTt = await voi(T, tt1, (nc) => danhSachViec(nc, LuocDoLocViec.parse({ cheDo: "tat-ca" })));
  dat("Thực tập sinh chỉ thấy việc của mình", dsTt.dong.length >= 1 && dsTt.dong.every((v) => v.nguoiPhuTrach.id === tt1));
  await voi(T, tt1, (nc) => suaViec(nc, viecTt.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  await voi(T, tp, (nc) => duyetViec(nc, viecTt.id, { chatLuong: 4, nhanXet: "" }));

  // Mẫu phiếu
  const mauHong = { ...MAU_PHIEU_MAC_DINH, phan: [{ ten: "A", tieuChi: [{ ma: "x", ten: "Một", trongSo: 1, thang: "10", nguon: null, moTa: "" }, { ma: "x", ten: "Hai", trongSo: 1, thang: "10", nguon: null, moTa: "" }] }] };
  await nemLoi("DG-72: mẫu có mã tiêu chí trùng → chặn", "nghiep-vu", () => voi(T, hr, (nc) => taoMauPhieu(nc, LuocDoMauPhieuLuu.parse({ ma: "hong", ten: "Mẫu hỏng", boCuc: mauHong }))), "mau-sai");
  await nemLoi("Nhân viên không tạo mẫu phiếu", "quyen", () => voi(T, nvA, (nc) => taoMauPhieu(nc, LuocDoMauPhieuLuu.parse({ ma: "nv", ten: "Mẫu NV", boCuc: MAU_PHIEU_MAC_DINH }))));
  const mauChu = await voi(T, hr, (nc) =>
    taoMauPhieu(nc, LuocDoMauPhieuLuu.parse({
      ma: "dh-kinh-te", ten: "Mẫu ĐH Kinh tế", truong: "Đại học Kinh tế",
      boCuc: {
        tenDonVi: "Công ty thử", tieuDe: "PHIẾU ĐÁNH GIÁ THỰC TẬP", thongTin: [{ ma: "ho-ten", nhan: "Họ tên", nguon: "ho-ten" }, { ma: "truong", nhan: "Trường", nguon: "truong" }],
        phan: [{ ten: "Đánh giá", tieuChi: [{ ma: "thai-do", ten: "Thái độ", trongSo: 1, thang: "chu" }, { ma: "ket-qua", ten: "Kết quả công việc", trongSo: 1, thang: "chu", nguon: "chat-luong-viec" }] }],
        oKy: [{ ma: "gv", nhan: "XÁC NHẬN CỦA ĐƠN VỊ" }],
      },
    })),
  );
  const dsMau = await voi(T, hr, (nc) => danhSachMauPhieu(nc));
  dat("Mẫu chung dựng sẵn có trong danh sách", dsMau.some((m) => m.ma === "mau-chung") && dsMau.some((m) => m.id === mauChu.id));
  const mauChung = dsMau.find((m) => m.ma === "mau-chung")!;

  await nemLoi("Thực tập sinh không tự tạo phiếu đánh giá cho mình", "nghiep-vu", () => voi(T, tt1, (nc) => taoPhieuThucTap(nc, { nguoiId: tt1, mauId: mauChung.id })), "khong-duoc-cham");
  await nemLoi("Người hướng dẫn của SV khác không tạo phiếu cho SV này", "nghiep-vu", () => voi(T, nvA, (nc) => taoPhieuThucTap(nc, { nguoiId: tt1, mauId: mauChung.id })), "khong-duoc-cham");
  const pt = await voi(T, tp, (nc) => taoPhieuThucTap(nc, { nguoiId: tt1, mauId: mauChung.id }));
  const ct0 = await voi(T, tp, (nc) => chiTietPhieuThucTap(nc, pt.id));
  dat("DG-73: phiếu điền sẵn thông tin từ hồ sơ thực tập", ct0.thongTin["mssv"] === "SV001" && ct0.thongTin["truong"] === "Đại học Bách khoa" && ct0.thongTin["nguoi-huong-dan"] === "Trưởng phòng KD");
  dat("DG-74: nguồn tự động — tỷ lệ việc đạt lấy từ Công việc", ct0.tuDong["ty-le-viec-dat"] === 100);
  await nemLoi("Điểm ngoài thang 10 bị chặn", "nghiep-vu", () => voi(T, tp, (nc) => chamPhieuThucTap(nc, pt.id, { thongTin: {}, diem: { "thai-do": 11 }, nhanXet: {} })), "diem-sai");
  await nemLoi("Chỉ sửa được ô thông tin nhập tay", "nghiep-vu", () => voi(T, tp, (nc) => chamPhieuThucTap(nc, pt.id, { thongTin: { mssv: "SAI" }, diem: {}, nhanXet: {} })), "o-la");
  await nemLoi("Thực tập sinh không tự chấm", "nghiep-vu", () => voi(T, tt1, (nc) => chamPhieuThucTap(nc, pt.id, { thongTin: {}, diem: { "thai-do": 10 }, nhanXet: {} })), "khong-duoc-cham");
  await nemLoi("Chốt khi còn tiêu chí chưa chấm → chặn", "nghiep-vu", () => voi(T, tp, (nc) => chotPhieuThucTap(nc, pt.id)), "thieu-diem");
  const cham = await voi(T, tp, (nc) =>
    chamPhieuThucTap(nc, pt.id, { thongTin: { "de-tai": "Hệ thống mạng nội bộ" }, diem: { "ky-luat": 9, "thai-do": 8, "chuyen-mon": 7, "ky-nang-mem": 8, "ket-qua": 9 }, nhanXet: { "uu-diem": "Chăm chỉ, ham học", "de-nghi": "Đề nghị tiếp nhận làm nhân viên" } }),
  );
  dat("Máy tính điểm tổng thang 10 + chữ", cham.ketQua?.tong === 8.3 && cham.ketQua?.chu === "B", `${cham.ketQua?.tong} ${cham.ketQua?.chu}`);
  const html = renderToStaticMarkup(createElement(PhieuThucTapIn, { d: { mau: cham.mau, thongTin: cham.thongTin, ketQua: cham.ketQua, nhanXet: cham.nhanXet, ngayLap: "Ngày 01 tháng 12 năm 2026", banNhap: true } }));
  dat("DG-76: bản in dựng đúng bố cục mẫu (tiêu đề, thông tin, tiêu chí, điểm tổng, ô ký)",
    html.includes("PHIẾU NHẬN XÉT VÀ ĐÁNH GIÁ KẾT QUẢ THỰC TẬP") && html.includes("SV001") && html.includes("Hệ thống mạng nội bộ") &&
    html.includes("Ý thức kỷ luật") && html.includes("8,3") && html.includes("NGƯỜI HƯỚNG DẪN") && html.includes("ĐẠI DIỆN ĐƠN VỊ") && html.includes("Chăm chỉ, ham học"));
  dat("Bản in chưa chốt mang chữ BẢN NHÁP", html.includes("BẢN NHÁP"));
  const [ch1, ch2] = await Promise.allSettled([voi(T, tp, (nc) => chotPhieuThucTap(nc, pt.id)), voi(T, hr, (nc) => chotPhieuThucTap(nc, pt.id))]);
  dat("DG-75: chốt hai lần cùng lúc → một thành công", [ch1, ch2].filter((r) => r.status === "fulfilled").length === 1);
  dat("Thực tập sinh được báo kết quả", (await thongBao(tt1, "thuc-tap-da-chot", pt.id)).length === 1);
  await nemLoi("Phiếu đã chốt không chấm lại được", "nghiep-vu", () => voi(T, tp, (nc) => chamPhieuThucTap(nc, pt.id, { thongTin: {}, diem: { "ky-luat": 10 }, nhanXet: {} })), "da-chot");
  await csdlChan("CSDL: phiếu thực tập đã chốt bất biến", () => chu.internEvaluation.update({ where: { id: pt.id }, data: { totalScore: 10 } }));
  dat("Thực tập sinh xem được phiếu của mình", (await voi(T, tt1, (nc) => chiTietPhieuThucTap(nc, pt.id))).phieu.tongDiem === 8.3);
  await nemLoi("Thực tập sinh khác không xem được phiếu", "khong-thay", () => voi(T, tt2, (nc) => chiTietPhieuThucTap(nc, pt.id)));
  // Mẫu thang chữ (SV2, người hướng dẫn = A)
  await voi(T, hr, (nc) => suaMauPhieu(nc, mauChu.id, LuocDoMauPhieuLuu.parse({ ma: "dh-kinh-te", ten: "Mẫu ĐH Kinh tế (sửa)", truong: "Đại học Kinh tế", boCuc: (dsMau.find((m) => m.id === mauChu.id)!).boCuc })));
  const pt2 = await voi(T, nvA, (nc) => taoPhieuThucTap(nc, { nguoiId: tt2, mauId: mauChu.id }));
  const c2t = await voi(T, nvA, (nc) => chamPhieuThucTap(nc, pt2.id, { thongTin: {}, diem: { "thai-do": "A", "ket-qua": "C" }, nhanXet: {} }));
  dat("Thang chữ: A(9,5) + C(6) → 7,75 → B", c2t.ketQua?.tong === 7.75 && c2t.ketQua?.chu === "B");
  await nemLoi("Chữ không có trong thang của mẫu bị chặn", "nghiep-vu", () => voi(T, nvA, (nc) => chamPhieuThucTap(nc, pt2.id, { thongTin: {}, diem: { "thai-do": "Z" }, nhanXet: {} })), "diem-sai");
  dat("Phiếu chụp mẫu lúc tạo: tên mẫu đã sửa không đổi phiếu cũ", (await voi(T, tp, (nc) => chiTietPhieuThucTap(nc, pt.id))).phieu.tenMau === "Mẫu chung (dựng sẵn)");

  // ==================================================================
  console.log("\n— RLS và quyền dựng sẵn —");
  const t2 = await seedNenMong(chu, `thu-dg2-${DAU}`, "Doanh nghiệp thử đánh giá 2");
  const dem2 = await voiTenant(t2.id, async (tx) => ({
    phieu: await tx.evaluation.count({ where: { id: phieuA.id } }),
    bc: await tx.workReport.count({ where: { id: nop.id } }),
    nk: await tx.taskApprovalLog.count({ where: { taskId: v1.id } }),
    tt: await tx.internEvaluation.count({ where: { id: pt.id } }),
  }));
  dat("RLS: doanh nghiệp khác không thấy phiếu, báo cáo, lịch sử duyệt, phiếu thực tập", dem2.phieu + dem2.bc + dem2.nk + dem2.tt === 0);
  const bang2 = await chu.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
    `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('task_approvers','task_approval_logs','task_extensions','task_progress_logs','work_reports','evaluations','evaluation_items','evaluation_adjustments','kpi_sets','intern_journals','intern_evaluations','intern_eval_templates')`,
  );
  dat("RLS bật cho mọi bảng mới", bang2.length === 12 && bang2.every((b) => b.relrowsecurity));
  const aiQuyen = await chu.rolePermission.count({ where: { role: { tenantId: T, code: "ai-assistant" }, permission: { module: "danh_gia" } } });
  dat("Vai trò trợ lý AI không có quyền danh_gia.*", aiQuyen === 0);
  const ttQuyen = await chu.rolePermission.findMany({ where: { role: { tenantId: T, code: "sinh-vien-thuc-tap" }, permission: { module: "danh_gia" } }, select: { dataScope: true } });
  dat("Thực tập sinh: danh_gia phạm vi của mình", ttQuyen.length === 2 && ttQuyen.every((q) => q.dataScope === "own"));

  await chu.$disconnect();
  ketLuan("Nhân sự – giao việc, báo cáo, duyệt, đánh giá");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
