import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { chiTietViec, danhSachViec, LuocDoLocViec, LuocDoTaoViec, suaViec, taoViec } from "../src/modules/cong-viec/service";
import {
  dieuChinhDiem,
  duyetViec,
  lichSuGiaoViec,
  nhanViec,
  quyetDinhGiaHan,
  traLaiViec,
  tuChoiViec,
  viecCuaNhom,
  xinGiaHan,
} from "../src/modules/cong-viec/giao-viec";
import { LuocDoLapViec, LuocDoMauViec, sinhViecDinhKy, taoLapViec, taoMauViec } from "../src/modules/cong-viec/mau-lap";
import {
  bangBaoCaoNhom,
  chiTietBaoCao,
  LuocDoBaoCao,
  luuBaoCao,
  moBaoCao,
  nguoiPhaiBaoCao,
  nhanXetBaoCao,
  quetBaoCao,
  thongKeBaoCaoNgay,
  thongKeBaoCaoTuan,
} from "../src/modules/bao-cao-cong-viec/service";
import { suaNguoiDung } from "../src/modules/nguoi-dung/service";
import { banGiao } from "../src/modules/ban-giao/service";
import { baoCaoTu, docCauHinhDanhGia, dungHanTu } from "../src/modules/danh-gia/chung";
import {
  chiTietPhieu,
  chotPhieu,
  dieuChinhPhieu,
  LuocDoBoKpi,
  LuocDoKy,
  quanLyCham,
  suaKyDanhGia,
  taoBoKpi,
  taoKyDanhGia,
} from "../src/modules/danh-gia/service";
import { tinhChiSo } from "../src/modules/danh-gia/chi-so";
import {
  chamPhieuThucTap,
  chiTietPhieuThucTap,
  chotPhieuThucTap,
  LuocDoMauPhieuLuu,
  LuocDoNhatKy,
  LuocDoTaoPhieuThucTap,
  luuNhatKy,
  suaMauPhieu,
  taoMauPhieu,
  taoPhieuThucTap,
} from "../src/modules/thuc-tap/service";
import { hanBaoCao, kyDanhGia, MA_CHI_SO, MAU_PHIEU_MAC_DINH, tongDiemKpi, xepLoai, heSoDungHan, diemViec } from "../src/modules/danh-gia/tinh-toan";
import { congNgay, mocVN } from "../src/modules/cham-cong/tinh-toan";
import { homNayVN } from "../src/modules/crm/chung";
import PhieuThucTapIn from "../src/components/danh-gia/PhieuThucTapIn";
import { VAI_TRO, phamViCuaQuyen } from "../src/lib/vai-tro";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA độc lập 0.20.0 — Nhân sự giai đoạn 2. Mỗi phần tái hiện một lỗi QA tìm thấy (đã sửa) hoặc khẳng định
 * một chốt chặn đã kiểm mà không thấy lỗi. Chạy: npm run thu:qa-danh-gia (CSDL phát triển).
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-qa-danh-gia"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "zod" | "khong-500";
/** "khong-500": chấp nhận mọi lỗi người dùng (nghiệp vụ / Zod / không thấy), không chấp nhận lỗi máy (RangeError, Prisma…). */
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<void> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const laZod = (e as Error)?.name === "ZodError";
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "zod" ? laZod
      : kieu === "khong-500" ? laZod || e instanceof LoiNghiepVu || e instanceof LoiKhongTimThay || e instanceof LoiThieuQuyen
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

const viecMoi = (tieuDe: string, them: Record<string, unknown> = {}) => LuocDoTaoViec.parse({ tieuDe, ...them });

async function main() {
  console.log("=== QA 0.20.0 — Nhân sự giai đoạn 2 ===\n");
  const tenant = await seedNenMong(chu, `qa-dg-${DAU}`, "Doanh nghiệp QA đánh giá");
  const T = tenant.id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const phong = async (code: string) => (await chu.department.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const pbKD = await phong("kinh-doanh");
  const pbKT = await phong("ky-thuat");
  async function nguoi(ten: string, vai: string, o: { quanLy?: string; phong?: string; loai?: string } = {}) {
    const u = await chu.user.create({
      data: {
        tenantId: T, email: `${ten.replace(/\s+/g, "-")}.${DAU}@qa.test`, passwordHash: "x", fullName: ten,
        userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
        staffProfile: { create: { tenantId: T, managerId: o.quanLy ?? null, departmentId: o.phong ?? null, staffType: o.loai ?? "chinh-thuc" } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("Giám đốc QA", "ceo");
  const qt = await nguoi("Quản trị QA", "admin");
  const tp = await nguoi("TP Kinh doanh QA", "sales-manager", { quanLy: gd, phong: pbKD });
  const nvA = await nguoi("NV A QA", "sales", { quanLy: tp, phong: pbKD });
  const nvB = await nguoi("NV B QA", "sales", { quanLy: tp, phong: pbKD });
  const tp2 = await nguoi("TP Kỹ thuật QA", "technical-manager", { quanLy: gd, phong: pbKT });
  const nvC = await nguoi("KTV C QA", "technical", { quanLy: tp2, phong: pbKT });
  const mk = await nguoi("NV Marketing QA", "marketing", { quanLy: gd });
  const hr = await nguoi("Nhân sự QA", "nhan-su-hr", { quanLy: gd });
  const tt = await nguoi("Thực tập QA", "sinh-vien-thuc-tap", { quanLy: tp, phong: pbKD, loai: "thuc-tap" });
  const ai = await nguoi("Trợ lý QA", "ai-assistant");
  // QĐ-133: chốt phiếu mặc định chỉ Giám đốc — Giám đốc thứ hai (tạo sau) chốt phiếu của Giám đốc thứ nhất.
  const gdPho = await nguoi("Giám đốc 2 QA", "ceo");
  await chu.internProfile.create({ data: { tenantId: T, userId: tt, school: "ĐH QA", studentCode: "QA01", mentorId: nvA } });

  /** Việc tp giao cho nvA, nvA làm xong, tp duyệt → đã chấm điểm. */
  async function viecDaDuyet(tieuDe: string, doKho = 3, chatLuong = 4) {
    const v = await voi(T, tp, (nc) => taoViec(nc, viecMoi(tieuDe, { nguoiPhuTrachId: nvA, doKho, han: new Date(Date.now() + 48 * GIO).toISOString() })));
    await voi(T, nvA, (nc) => suaViec(nc, v.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
    await voi(T, tp, (nc) => duyetViec(nc, v.id, { chatLuong, nhanXet: "" }));
    return v.id;
  }

  // ==================================================================
  console.log("— Lỗi 1: việc đã duyệt + chấm điểm vẫn đổi được người làm / độ khó / chuỗi duyệt / hạn —");
  const vd = await viecDaDuyet("QA việc đã duyệt", 3, 4);
  const truoc = await chu.task.findUniqueOrThrow({ where: { id: vd } });
  dat("Chuẩn bị: việc đã duyệt, điểm 3 × 4 × 1 = 12", truoc.status === "xong" && Number(truoc.taskScore) === 12);
  await nemLoi("DG-31: không chuyển việc đã chấm điểm sang người khác (điểm sẽ chạy sang KPI người khác)", "nghiep-vu",
    () => voi(T, tp, (nc) => suaViec(nc, vd, { nguoiPhuTrachId: nvB })), "viec-da-duyet");
  await nemLoi("DG-31: không đổi độ khó việc đã chấm điểm", "nghiep-vu", () => voi(T, tp, (nc) => suaViec(nc, vd, { doKho: 5 })), "viec-da-duyet");
  await nemLoi("DG-31: không đổi chuỗi người duyệt việc đã chấm điểm", "nghiep-vu", () => voi(T, mk, (nc) => suaViec(nc, vd, { nguoiDuyetIds: [mk] })), "viec-da-duyet");
  await nemLoi("DG-31: không tắt cờ cần duyệt việc đã chấm điểm", "nghiep-vu", () => voi(T, tp, (nc) => suaViec(nc, vd, { canDuyet: false })), "viec-da-duyet");
  await nemLoi("DG-31: không đổi hạn việc đã chấm điểm (tỷ lệ đúng hạn KPI)", "nghiep-vu", () => voi(T, tp, (nc) => suaViec(nc, vd, { han: new Date(Date.now() - 96 * GIO) })), "viec-da-duyet");
  await nemLoi("DG-32: nhân viên Marketing (task.update toàn công ty, không có danh_gia.approve) không điều chỉnh điểm việc người khác", "nghiep-vu",
    () => voi(T, mk, (nc) => dieuChinhDiem(nc, vd, { chatLuong: 1, lyDo: "Hạ điểm đồng nghiệp cho vui" })), "khong-duoc-dieu-chinh");
  const sau = await chu.task.findUniqueOrThrow({ where: { id: vd } });
  dat("Việc đã duyệt giữ nguyên người làm, độ khó, điểm, hạn", sau.ownerId === nvA && sau.difficulty === 3 && Number(sau.taskScore) === 12 && sau.dueAt?.getTime() === truoc.dueAt?.getTime());
  const sua = await voi(T, tp, (nc) => suaViec(nc, vd, { tieuDe: "QA việc đã duyệt (đổi tên)", uuTien: "cao" }));
  dat("Việc đã duyệt vẫn đổi được tiêu đề / ưu tiên (không ảnh hưởng điểm)", sua.tieuDe === "QA việc đã duyệt (đổi tên)");

  // ==================================================================
  console.log("\n— Lỗi 2: duyệt gia hạn sau khi việc đã xong / đã chấm điểm —");
  const vg = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QA gia hạn lúc đang duyệt", { nguoiPhuTrachId: nvA, doKho: 2, han: new Date(Date.now() + 2 * GIO).toISOString() })));
  const gh = await voi(T, nvA, (nc) => xinGiaHan(nc, vg.id, { hanMoi: new Date(Date.now() + 72 * GIO), lyDo: "Chờ khách xác nhận" }));
  await voi(T, nvA, (nc) => suaViec(nc, vg.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  // Gia hạn và duyệt cùng lúc: khóa dòng việc → tuần tự, không lỗi máy.
  const [r1, r2] = await Promise.allSettled([
    voi(T, tp, (nc) => duyetViec(nc, vg.id, { chatLuong: 5, nhanXet: "" })),
    voi(T, tp, (nc) => quyetDinhGiaHan(nc, gh.id, { dongY: true, ghiChu: "" })),
  ]);
  const vgSau = await chu.task.findUniqueOrThrow({ where: { id: vg.id } });
  const ghSau = await chu.taskExtension.findUniqueOrThrow({ where: { id: gh.id } });
  dat("Duyệt việc và duyệt gia hạn cùng lúc: duyệt việc thành công", r1.status === "fulfilled", r1.status === "rejected" ? String(r1.reason) : "");
  if (r2.status === "fulfilled") {
    // Gia hạn chạy trước duyệt: điểm phải tính theo hạn mới.
    dat("…gia hạn chạy trước: hạn mới có hiệu lực và điểm tính theo hạn mới", ghSau.status === "da-duyet" && vgSau.dueAt?.getTime() === ghSau.newDueAt.getTime() && Number(vgSau.onTimeFactor) === 1);
  } else {
    dat("…gia hạn chạy sau duyệt: bị chặn 409, hạn của việc đã chấm điểm không đổi", r2.reason instanceof LoiNghiepVu && r2.reason.status === 409 && ghSau.status === "cho-duyet" && vgSau.dueAt?.getTime() === vg.han?.getTime(),
      String(r2.reason));
  }
  // Tái hiện chắc chắn: đề nghị còn chờ khi việc đã chấm điểm.
  const vg2 = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QA gia hạn sau khi chấm", { nguoiPhuTrachId: nvA, han: new Date(Date.now() + 2 * GIO).toISOString() })));
  const gh2 = await voi(T, nvA, (nc) => xinGiaHan(nc, vg2.id, { hanMoi: new Date(Date.now() + 72 * GIO), lyDo: "Chờ khách xác nhận" }));
  await voi(T, nvA, (nc) => suaViec(nc, vg2.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  await voi(T, tp, (nc) => duyetViec(nc, vg2.id, { chatLuong: 3, nhanXet: "" }));
  await nemLoi("DG-31: không duyệt gia hạn cho việc đã chấm điểm (hạn của việc đã khép lại không đổi)", "nghiep-vu",
    () => voi(T, tp, (nc) => quyetDinhGiaHan(nc, gh2.id, { dongY: true, ghiChu: "" })), "viec-da-khoa");
  const tc2 = await voi(T, tp, (nc) => quyetDinhGiaHan(nc, gh2.id, { dongY: false, ghiChu: "Việc đã xong, không cần" }));
  dat("…nhưng vẫn từ chối được để khép đề nghị", tc2.dongY === false && (await chu.task.findUniqueOrThrow({ where: { id: vg2.id } })).dueAt?.getTime() === vg2.han?.getTime());
  const vg3 = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QA gia hạn việc không cần duyệt", { nguoiPhuTrachId: nvA, canDuyet: false, han: new Date(Date.now() + 2 * GIO).toISOString() })));
  const gh3 = await voi(T, nvA, (nc) => xinGiaHan(nc, vg3.id, { hanMoi: new Date(Date.now() + 72 * GIO), lyDo: "Chờ khách xác nhận" }));
  await voi(T, nvA, (nc) => suaViec(nc, vg3.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  await nemLoi("Không duyệt gia hạn cho việc đã xong (không cần duyệt)", "nghiep-vu", () => voi(T, tp, (nc) => quyetDinhGiaHan(nc, gh3.id, { dongY: true, ghiChu: "" })), "viec-da-khoa");

  // ==================================================================
  console.log("\n— Không ai tự duyệt / tự chấm, kể cả Giám đốc / Quản trị —");
  const vGd = await voi(T, qt, (nc) => taoViec(nc, viecMoi("Việc của giám đốc", { nguoiPhuTrachId: gd, nguoiDuyetIds: [qt] })));
  await nemLoi("Giám đốc không đổi chuỗi duyệt của việc người khác giao cho mình", "nghiep-vu", () => voi(T, gd, (nc) => suaViec(nc, vGd.id, { nguoiDuyetIds: [gd] })), "chi-nguoi-giao");
  await nemLoi("Giám đốc tự tạo việc không tự đặt mình làm người duyệt", "nghiep-vu", () => voi(T, gd, (nc) => taoViec(nc, viecMoi("Giám đốc tự duyệt", { canDuyet: true, nguoiDuyetIds: [gd] }))), "tu-duyet");
  const vGdTu = await voi(T, gd, (nc) => taoViec(nc, viecMoi("Việc giám đốc tự tạo")));
  await nemLoi("Giám đốc không bật duyệt rồi tự đứng duyệt việc tự tạo", "nghiep-vu", () => voi(T, gd, (nc) => suaViec(nc, vGdTu.id, { canDuyet: true, nguoiDuyetIds: [gd] })), "tu-duyet");
  await voi(T, gd, (nc) => suaViec(nc, vGd.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  await nemLoi("Giám đốc không tự duyệt việc của mình", "nghiep-vu", () => voi(T, gd, (nc) => duyetViec(nc, vGd.id, { chatLuong: 5, nhanXet: "" })), "tu-duyet");
  await voi(T, qt, (nc) => duyetViec(nc, vGd.id, { chatLuong: 3, nhanXet: "" }));
  await nemLoi("Giám đốc không tự điều chỉnh điểm việc của mình", "nghiep-vu", () => voi(T, gd, (nc) => dieuChinhDiem(nc, vGd.id, { chatLuong: 5, lyDo: "Tôi là giám đốc mà" })), "tu-duyet");
  await nemLoi("Quản trị không là người duyệt việc của chính mình (giao từ giám đốc)", "nghiep-vu", () => voi(T, gd, (nc) => taoViec(nc, viecMoi("Việc của quản trị", { nguoiPhuTrachId: qt, nguoiDuyetIds: [qt] }))), "tu-duyet");
  const vQt = await voi(T, gd, (nc) => taoViec(nc, viecMoi("Việc của quản trị 2", { nguoiPhuTrachId: qt, nguoiDuyetIds: [tp] })));
  await nemLoi("Không chuyển việc cho người đang đứng trong chuỗi duyệt của nó", "nghiep-vu", () => voi(T, gd, (nc) => suaViec(nc, vQt.id, { nguoiPhuTrachId: tp })), "tu-duyet");
  const kyGd = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: 2025, so: 1, nguoiIds: [gd, qt, tp] }));
  const pGd = await chu.evaluation.findFirstOrThrow({ where: { periodId: kyGd.id, userId: gd }, include: { items: true } });
  const pTp = await chu.evaluation.findFirstOrThrow({ where: { periodId: kyGd.id, userId: tp }, include: { items: true } });
  await nemLoi("Giám đốc không tự chấm phiếu của mình", "nghiep-vu", () => voi(T, gd, (nc) => quanLyCham(nc, pGd.id, { nhanXet: "", chiTieu: [{ id: pGd.items[0].id, diem: 100, ghiChu: "" }], nop: true })), "khong-duoc-cham");
  await voi(T, qt, (nc) => quanLyCham(nc, pGd.id, { nhanXet: "", chiTieu: [{ id: pGd.items[0].id, diem: 70, ghiChu: "" }], nop: true }));
  await nemLoi("Giám đốc không tự chốt phiếu của mình", "nghiep-vu", () => voi(T, gd, (nc) => chotPhieu(nc, pGd.id, { ghiChu: "" })), "khong-duoc-chot");
  await nemLoi("QĐ-133: Quản trị không chốt phiếu đánh giá (mặc định chỉ Giám đốc)", "nghiep-vu", () => voi(T, qt, (nc) => chotPhieu(nc, pGd.id, { ghiChu: "" })), "khong-duoc-chot");
  await voi(T, gdPho, (nc) => chotPhieu(nc, pGd.id, { ghiChu: "" }));
  await nemLoi("Giám đốc không tự điều chỉnh phiếu đã chốt của mình", "nghiep-vu", () => voi(T, gd, (nc) => dieuChinhPhieu(nc, pGd.id, { lyDo: "Tự nâng điểm của tôi lên", chiTieu: [{ id: pGd.items[0].id, diem: 100 }] })), "khong-duoc-chot");
  await nemLoi("Nhân sự không chốt phiếu", "nghiep-vu", () => voi(T, hr, (nc) => chotPhieu(nc, pTp.id, { ghiChu: "" })), "khong-duoc-chot");
  await nemLoi("Nhân sự không điều chỉnh phiếu đã chốt", "nghiep-vu", () => voi(T, hr, (nc) => dieuChinhPhieu(nc, pGd.id, { lyDo: "Nhân sự sửa kết quả", chiTieu: [{ id: pGd.items[0].id, diem: 90 }] })), "khong-duoc-chot");
  await nemLoi("Nhân sự không chấm phiếu người ngoài cấp dưới", "nghiep-vu", () => voi(T, hr, (nc) => quanLyCham(nc, pTp.id, { nhanXet: "", chiTieu: [], nop: false })), "khong-duoc-cham");
  await nemLoi("Nhân sự không điều chỉnh điểm việc", "khong-500", () => voi(T, hr, (nc) => dieuChinhDiem(nc, vd, { chatLuong: 5, lyDo: "Nhân sự sửa điểm việc" })));

  // ==================================================================
  console.log("\n— Cách ly giữa phòng ban, giữa doanh nghiệp; thực tập sinh; trợ lý AI —");
  const nop = await voi(T, nvA, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "tuan", ngay: congNgay(homNayVN(), -7), daLam: "QA tuần trước", vuongMac: "Thiếu xe", nop: true })));
  await nemLoi("TP Kỹ thuật không nhận xét báo cáo nhân viên Kinh doanh", "khong-thay", () => voi(T, tp2, (nc) => nhanXetBaoCao(nc, nop.id, { noiDung: "Chen ngang" })));
  await nemLoi("Kỹ thuật viên không xem báo cáo nhân viên Kinh doanh", "khong-thay", () => voi(T, nvC, (nc) => chiTietBaoCao(nc, nop.id)));
  await nemLoi("Thực tập sinh không đọc phiếu của trưởng phòng", "khong-thay", () => voi(T, tt, (nc) => chiTietPhieu(nc, pTp.id)));
  const t2 = await seedNenMong(chu, `qa-dg2-${DAU}`, "Doanh nghiệp QA đánh giá 2");
  const vt2 = await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t2.id, code: "ceo" } } });
  const gd2 = (await chu.user.create({ data: { tenantId: t2.id, email: `gd2.${DAU}@qa.test`, passwordHash: "x", fullName: "GĐ DN2", userRoles: { create: { tenantId: t2.id, roleId: vt2.id } } } })).id;
  await nemLoi("IDOR doanh nghiệp: giám đốc DN khác không đọc phiếu", "khong-thay", () => voi(t2.id, gd2, (nc) => chiTietPhieu(nc, pTp.id)));
  await nemLoi("IDOR doanh nghiệp: không chốt phiếu DN khác", "khong-thay", () => voi(t2.id, gd2, (nc) => chotPhieu(nc, pTp.id, { ghiChu: "" })));
  await nemLoi("IDOR doanh nghiệp: không duyệt việc DN khác", "khong-thay", () => voi(t2.id, gd2, (nc) => duyetViec(nc, vd, { chatLuong: 5, nhanXet: "" })));
  await nemLoi("IDOR doanh nghiệp: không điều chỉnh điểm việc DN khác", "khong-thay", () => voi(t2.id, gd2, (nc) => dieuChinhDiem(nc, vd, { chatLuong: 5, lyDo: "Từ doanh nghiệp khác" })));
  await nemLoi("IDOR doanh nghiệp: không duyệt gia hạn DN khác", "khong-thay", () => voi(t2.id, gd2, (nc) => quyetDinhGiaHan(nc, gh2.id, { dongY: false, ghiChu: "Từ doanh nghiệp khác" })));
  await nemLoi("IDOR doanh nghiệp: không nhận xét báo cáo DN khác", "khong-thay", () => voi(t2.id, gd2, (nc) => nhanXetBaoCao(nc, nop.id, { noiDung: "Từ DN khác" })));
  await nemLoi("IDOR doanh nghiệp: không đặt người DN khác làm người duyệt", "nghiep-vu", () => voi(t2.id, gd2, (nc) => taoViec(nc, viecMoi("Việc DN2", { canDuyet: true, nguoiDuyetIds: [tp] }))), "nguoi-duyet");
  // RLS 19 bảng qua vai ứng dụng: phiên của DN2 không thấy dòng nào của DN1.
  const bang19 = ["task_approvers", "task_approval_logs", "task_score_adjustments", "task_extensions", "task_progress_logs", "task_templates", "task_recurrences", "work_reports", "work_report_comments", "kpi_sets", "kpi_items", "evaluation_periods", "evaluations", "evaluation_items", "evaluation_adjustments", "intern_journals", "intern_journal_comments", "intern_eval_templates", "intern_evaluations"];
  const lo: string[] = [];
  for (const b of bang19) {
    const n = await voiTenant(t2.id, (tx) => tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${b} WHERE tenant_id = '${T}'::uuid`));
    if (Number(n[0].n) !== 0) lo.push(b);
  }
  dat("RLS 19 bảng mới: vai ứng dụng của DN khác không thấy dòng nào", lo.length === 0, lo.join(", "));
  const rlsBat = await chu.$queryRawUnsafe<{ relname: string }[]>(`SELECT relname FROM pg_class WHERE relname = ANY($1::text[]) AND relrowsecurity`, bang19);
  dat("RLS bật đủ 19 bảng", rlsBat.length === 19, `${rlsBat.length}/19`);
  const chenLan = await voiTenant(t2.id, async (tx) => {
    try {
      await tx.$executeRawUnsafe(`INSERT INTO task_approval_logs (id, tenant_id, task_id, round, action, actor_id, created_at) VALUES (gen_random_uuid(), '${T}'::uuid, '${vd}'::uuid, 1, 'gui-duyet', '${gd2}'::uuid, now())`);
      return "lot";
    } catch {
      return "chan";
    }
  });
  dat("RLS: không ghi chéo sang doanh nghiệp khác (WITH CHECK)", chenLan === "chan");
  // Trợ lý AI
  const aiNhom = await voi(T, ai, (nc) => viecCuaNhom(nc));
  dat("DG-80: trợ lý AI không thấy điểm việc trong 'Việc của nhóm'", aiNhom.length > 0 && aiNhom.every((x) => x.diemThang === null));
  const aiLs = await voi(T, ai, (nc) => lichSuGiaoViec(nc, vd));
  dat("DG-80: trợ lý AI không thấy điểm / chất lượng trong lịch sử duyệt", !aiLs.xemDiem && aiLs.nhatKyDuyet.every((x) => x.diem === null && x.chatLuong === null));
  const aiCt = await voi(T, ai, (nc) => chiTietViec(nc, vd));
  dat("DG-80: trợ lý AI không thấy điểm trong chi tiết việc", aiCt.viec.diemViec === null && aiCt.viec.chatLuong === null);
  await nemLoi("DG-80: trợ lý AI không đọc báo cáo", "quyen", () => voi(T, ai, (nc) => chiTietBaoCao(nc, nop.id)));
  // Thực tập sinh chỉ thấy của mình
  const viecTt = await voi(T, tp, (nc) => taoViec(nc, viecMoi("Việc thực tập QA", { nguoiPhuTrachId: tt })));
  const dsTt = await voi(T, tt, (nc) => danhSachViec(nc, LuocDoLocViec.parse({ cheDo: "tat-ca", trangThai: "tat-ca" })));
  dat("Thực tập sinh chỉ thấy việc của mình", dsTt.dong.length >= 1 && dsTt.dong.every((v) => v.nguoiPhuTrach.id === tt) && dsTt.dong.some((v) => v.id === viecTt.id));
  await nemLoi("Thực tập sinh không mở việc của nhân viên", "khong-thay", () => voi(T, tt, (nc) => chiTietViec(nc, vd)));

  const vHuy = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QA việc bị hủy khi chờ nhận", { nguoiPhuTrachId: nvB })));
  await voi(T, tp, (nc) => suaViec(nc, vHuy.id, { trangThai: "huy" }));
  await nemLoi("DG-03: không nhận việc người giao đã hủy", "nghiep-vu", () => voi(T, nvB, (nc) => nhanViec(nc, vHuy.id)), "viec-da-khoa");
  await nemLoi("DG-03: không từ chối việc người giao đã hủy (không báo rác cho người giao)", "nghiep-vu", () => voi(T, nvB, (nc) => tuChoiViec(nc, vHuy.id, { lyDo: "Không làm nữa" })), "viec-da-khoa");

  // ==================================================================
  console.log("\n— Đồng thời —");
  const vn = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QA nhận / từ chối cùng lúc", { nguoiPhuTrachId: nvB })));
  const [n1, n2] = await Promise.allSettled([voi(T, nvB, (nc) => nhanViec(nc, vn.id)), voi(T, nvB, (nc) => tuChoiViec(nc, vn.id, { lyDo: "Bận việc khác cả tuần" }))]);
  const vnSau = await chu.task.findUniqueOrThrow({ where: { id: vn.id } });
  dat("Nhận và từ chối cùng lúc → đúng một thành công, trạng thái khớp", [n1, n2].filter((r) => r.status === "fulfilled").length === 1 &&
    (n1.status === "fulfilled" ? vnSau.acceptStatus === "da-nhan" : vnSau.acceptStatus === "tu-choi"));
  const vt = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QA duyệt và trả lại cùng lúc", { nguoiPhuTrachId: nvA })));
  await voi(T, nvA, (nc) => suaViec(nc, vt.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  const [d1, d2] = await Promise.allSettled([voi(T, tp, (nc) => duyetViec(nc, vt.id, { chatLuong: 4, nhanXet: "" })), voi(T, tp, (nc) => traLaiViec(nc, vt.id, { lyDo: "Thiếu biên bản nghiệm thu" }))]);
  const vtSau = await chu.task.findUniqueOrThrow({ where: { id: vt.id } });
  const logVt = await chu.taskApprovalLog.count({ where: { taskId: vt.id, action: { in: ["duyet", "tra-lai"] } } });
  dat("Duyệt và trả lại cùng lúc → đúng một thành công, một dòng lịch sử", [d1, d2].filter((r) => r.status === "fulfilled").length === 1 && logVt === 1 &&
    (d1.status === "fulfilled" ? vtSau.status === "xong" : vtSau.status === "dang-lam"));
  // Điều chỉnh phiếu hai lần cùng lúc: tuần tự, lần sau tính tiếp từ lần trước.
  const [e1, e2] = await Promise.allSettled([
    voi(T, gdPho, (nc) => dieuChinhPhieu(nc, pGd.id, { lyDo: "Điều chỉnh lần một theo phản hồi", chiTieu: [{ id: pGd.items[0].id, diem: 80 }] })),
    voi(T, gdPho, (nc) => dieuChinhPhieu(nc, pGd.id, { lyDo: "Điều chỉnh lần hai theo phản hồi", chiTieu: [{ id: pGd.items[0].id, diem: 85 }] })),
  ]);
  const dcs = await chu.evaluationAdjustment.findMany({ where: { evaluationId: pGd.id }, orderBy: { createdAt: "asc" } });
  dat("Hai phiên điều chỉnh cùng lúc → nối tiếp nhau (tổng cũ của lần sau = tổng mới của lần trước)",
    e1.status === "fulfilled" && e2.status === "fulfilled" && dcs.length === 2 && Number(dcs[1].oldTotal) === Number(dcs[0].newTotal));

  // ==================================================================
  console.log("\n— Bất biến qua vai ứng dụng (cowork_app) —");
  const lichSu = ["task_approval_logs", "task_score_adjustments", "task_progress_logs", "work_report_comments", "evaluation_adjustments", "intern_journal_comments"];
  const sua6: string[] = [];
  for (const b of lichSu) {
    for (const lenh of [`UPDATE ${b} SET created_at = created_at`, `DELETE FROM ${b}`]) {
      const kq = await voiTenant(T, async (tx) => {
        try {
          await tx.$executeRawUnsafe(lenh);
          return "lot";
        } catch {
          return "chan";
        }
      });
      if (kq !== "chan") sua6.push(lenh);
    }
  }
  dat("DG-81: 6 bảng lịch sử — vai ứng dụng không UPDATE / DELETE được", sua6.length === 0, sua6.join("; "));
  const appSua = async (sql: string) =>
    voiTenant(T, async (tx) => {
      try {
        await tx.$executeRawUnsafe(sql);
        return "lot";
      } catch {
        return "chan";
      }
    });
  dat("DG-66: vai ứng dụng không sửa phiếu đã chốt", (await appSua(`UPDATE evaluations SET manager_comment = 'sửa lén' WHERE id = '${pGd.id}'`)) === "chan");
  dat("DG-66: vai ứng dụng không thêm chỉ tiêu vào phiếu đã chốt",
    (await appSua(`INSERT INTO evaluation_items (id, tenant_id, evaluation_id, position, name, weight, source, direction, created_at, updated_at) VALUES (gen_random_uuid(), '${T}', '${pGd.id}', 9, 'Lén', 1, 'thu-cong', 'cao-tot', now(), now())`)) === "chan");
  dat("DG-66: vai ứng dụng không xóa chỉ tiêu của phiếu đã chốt", (await appSua(`DELETE FROM evaluation_items WHERE evaluation_id = '${pGd.id}'`)) === "chan");
  dat("DG-40: vai ứng dụng không sửa / xóa báo cáo đã nộp",
    (await appSua(`UPDATE work_reports SET done = 'sửa lén' WHERE id = '${nop.id}'`)) === "chan" && (await appSua(`DELETE FROM work_reports WHERE id = '${nop.id}'`)) === "chan");

  // ==================================================================
  console.log("\n— Tính toán: biên, giờ VN, dữ liệu rỗng —");
  const h = new Date("2026-11-30T16:59:59.999Z"); // 23:59:59.999 ngày 30/11 giờ VN
  dat("Đúng hạn ở đúng mốc hạn", heSoDungHan(h, h).heSo === 1);
  dat("Trễ đúng 24 giờ → trễ nhẹ 0,8; quá 1 ms → trễ nặng 0,5", heSoDungHan(h, new Date(h.getTime() + 24 * GIO)).heSo === 0.8 && heSoDungHan(h, new Date(h.getTime() + 24 * GIO + 1)).heSo === 0.5);
  dat("Điểm biên: 5 × 5 × 1 = 25; 1 × 1 × 0,5 = 0,5; 3 × 3 × 0,8 = 7,2", diemViec(5, 5, 1) === 25 && diemViec(1, 1, 0.5) === 0.5 && diemViec(3, 3, 0.8) === 7.2);
  dat("Xếp loại đúng biên 90 / 75 / 60", xepLoai(90).loai === "A" && xepLoai(89.99).loai === "B" && xepLoai(75).loai === "B" && xepLoai(74.99).loai === "C" && xepLoai(60).loai === "C" && xepLoai(59.99).loai === "D");
  dat("Điểm tổng làm tròn rồi xếp loại (89,995 → 90 → A)", xepLoai(tongDiemKpi([{ trongSo: 50, diem: 89.99 }, { trongSo: 50, diem: 90 }]).tong ?? 0).loai === "A");
  const kyT12 = kyDanhGia("thang", 2026, 12);
  dat("Kỳ tháng 12: 00:00 01/12 VN → 00:00 01/01 năm sau VN", kyT12.batDau.toISOString() === "2026-11-30T17:00:00.000Z" && kyT12.ketThuc.toISOString() === "2026-12-31T17:00:00.000Z");
  await nemLoi("Kỳ quý số 5 → lỗi dữ liệu nhập (không phải lỗi máy)", "khong-500", async () => voi(T, hr, (nc) => taoKyDanhGia(nc, LuocDoKy.parse({ loai: "quy", nam: 2026, so: 5 }))));
  // Việc duyệt lúc 23:59 VN ngày cuối tháng thuộc tháng đó, 00:00 VN ngày đầu tháng sau thuộc tháng sau.
  const vRanh = await viecDaDuyet("QA ranh giới nửa đêm", 2, 5);
  await chu.task.update({ where: { id: vRanh }, data: { approvedAt: new Date("2025-03-31T16:59:59.000Z") } });
  const kThang3 = kyDanhGia("thang", 2025, 3);
  const kThang4 = kyDanhGia("thang", 2025, 4);
  const diem3 = await voiTenant(T, (tx) => tinhChiSo(tx, nvA, "tong-diem-viec", kThang3));
  const diem4 = await voiTenant(T, (tx) => tinhChiSo(tx, nvA, "tong-diem-viec", kThang4));
  dat("Ranh giới nửa đêm giờ VN: duyệt 23:59:59 ngày 31/3 VN tính vào tháng 3, không vào tháng 4", diem3 === 10 && diem4 === 0, `${diem3} / ${diem4}`);
  // Tỷ lệ trả lại: việc gửi duyệt tháng trước, bị trả lại tháng này + một việc gửi tháng này không bị trả lại → 0%, không phải 100%.
  const nTl = await nguoi("Người tỷ lệ trả lại QA", "sales", { quanLy: tp });
  const vX = await chu.task.create({ data: { tenantId: T, title: "QA X", ownerId: nTl, needsApproval: true } });
  const vY = await chu.task.create({ data: { tenantId: T, title: "QA Y", ownerId: nTl, needsApproval: true } });
  await chu.taskApprovalLog.createMany({ data: [
    { tenantId: T, taskId: vX.id, round: 1, action: "gui-duyet", actorId: nTl, createdAt: new Date("2025-05-31T03:00:00Z") },
    { tenantId: T, taskId: vX.id, round: 1, level: 1, action: "tra-lai", actorId: tp, reason: "Thiếu biên bản", createdAt: new Date("2025-06-02T03:00:00Z") },
    { tenantId: T, taskId: vY.id, round: 1, action: "gui-duyet", actorId: nTl, createdAt: new Date("2025-06-10T03:00:00Z") },
  ] });
  const tlThang6 = await voiTenant(T, (tx) => tinhChiSo(tx, nTl, "ty-le-tra-lai", kyDanhGia("thang", 2025, 6)));
  dat("DG-52: tỷ lệ việc bị trả lại chỉ xét việc gửi duyệt trong kỳ (0%, không phải 100%)", tlThang6 === 0, String(tlThang6));
  const tlThang5 = await voiTenant(T, (tx) => tinhChiSo(tx, nTl, "ty-le-tra-lai", kyDanhGia("thang", 2025, 5)));
  dat("…tháng gửi duyệt mà chưa bị trả lại trong tháng đó: 0%", tlThang5 === 0, String(tlThang5));
  const rong = await nguoi("Người mới QA", "sales", { quanLy: tp });
  const kRong = kyDanhGia("thang", 2026, 1);
  const soRong: Record<string, number | null> = {};
  for (const m of MA_CHI_SO) soRong[m] = await voiTenant(T, (tx) => tinhChiSo(tx, rong, m, kRong));
  const hongRong = Object.entries(soRong).filter(([m, v]) => (m.startsWith("ty-le") ? v !== null : v !== 0));
  dat("11 chỉ số KPI với dữ liệu rỗng: số đếm = 0, tỷ lệ = trống (không chia cho 0, không NaN)", MA_CHI_SO.length === 11 && hongRong.length === 0, JSON.stringify(soRong));
  await nemLoi("Trọng số KPI quá nhỏ (làm tròn về 0) → lỗi dữ liệu nhập, không phải lỗi máy", "khong-500", () =>
    voi(T, hr, async (nc) => taoBoKpi(nc, LuocDoBoKpi.parse({ ma: `nho-${DAU}`, ten: "Bộ trọng số nhỏ", chiTieu: [{ ten: "A1", trongSo: 99.999, nguon: "thu-cong" }, { ten: "B1", trongSo: 0.001, nguon: "thu-cong" }] }))));
  await nemLoi("Mục tiêu KPI vượt cột số (10^17) → lỗi dữ liệu nhập, không phải lỗi máy", "khong-500", () =>
    voi(T, hr, async (nc) => taoBoKpi(nc, LuocDoBoKpi.parse({ ma: `to-${DAU}`, ten: "Bộ mục tiêu lớn", chiTieu: [{ ten: "Doanh số", trongSo: 100, nguon: "tu-dong", chiSo: "doanh-thu-da-thu", mucTieuThang: 1e17 }] }))));

  // ==================================================================
  console.log("\n— Mẫu phiếu thực tập: JSON hỏng / độc hại / cực lớn; phiếu giữ mẫu lúc tạo —");
  const docHai = "<script>alert('x')</script><img src=x onerror=alert(1)>";
  const mauDoc = await voi(T, hr, (nc) =>
    taoMauPhieu(nc, LuocDoMauPhieuLuu.parse({
      ma: `doc-hai-${DAU}`.slice(0, 50), ten: "Mẫu thử chữ độc hại",
      boCuc: {
        tenDonVi: docHai, tieuDe: `PHIẾU ${docHai}`, thongTin: [{ ma: "ho-ten", nhan: docHai, nguon: "ho-ten" }, { ma: "ghi", nhan: "Ghi tay", nguon: "tu-nhap" }],
        phan: [{ ten: docHai, tieuChi: [{ ma: "tc1", ten: `Tiêu chí ${docHai}`, trongSo: 1, thang: "10" }] }],
        oNhanXet: [{ ma: "nx", nhan: docHai }], oKy: [{ ma: "ky", nhan: docHai }], ghiChu: docHai,
      },
    })),
  );
  const ptDoc = await voi(T, nvA, (nc) => taoPhieuThucTap(nc, LuocDoTaoPhieuThucTap.parse({ nguoiId: tt, mauId: mauDoc.id })));
  const chamDoc = await voi(T, nvA, (nc) => chamPhieuThucTap(nc, ptDoc.id, { thongTin: { ghi: docHai }, diem: { tc1: 8 }, nhanXet: { nx: docHai } }));
  const htmlDoc = renderToStaticMarkup(createElement(PhieuThucTapIn, { d: { mau: chamDoc.mau, thongTin: chamDoc.thongTin, ketQua: chamDoc.ketQua, nhanXet: chamDoc.nhanXet, ngayLap: "Ngày 01", banNhap: true } }));
  dat("DG-76: bản in thoát mọi chuỗi của mẫu / phiếu (không có <script>, <img onerror> sống)", !/<script/i.test(htmlDoc) && !/<img/i.test(htmlDoc) && htmlDoc.includes("&lt;script&gt;"));
  await nemLoi("Mẫu JSON sai lược đồ (thiếu phần tiêu chí) bị chặn", "zod", async () => LuocDoMauPhieuLuu.parse({ ma: "sai", ten: "Mẫu sai", boCuc: { tieuDe: "Phiếu", phan: [] } }));
  await nemLoi("Mã tiêu chí chứa ký tự lạ / __proto__ bị chặn", "zod", async () => LuocDoMauPhieuLuu.parse({ ma: "sai2", ten: "Mẫu sai", boCuc: { tieuDe: "Phiếu", phan: [{ ten: "A", tieuChi: [{ ma: "__proto__", ten: "Lạ", trongSo: 1, thang: "10" }] }] } }));
  const phanLon = Array.from({ length: 10 }, (_, i) => ({ ten: `Phần ${i}`, tieuChi: Array.from({ length: 40 }, (_, j) => ({ ma: `p${i}-t${j}`, ten: "x".repeat(500), trongSo: 1, thang: "10" as const, moTa: "y".repeat(500) })) }));
  await nemLoi("Mẫu vượt trần (11 phần) bị chặn", "zod", async () => LuocDoMauPhieuLuu.parse({ ma: "lon", ten: "Mẫu lớn", boCuc: { tieuDe: "Phiếu", phan: [...phanLon, phanLon[0]] } }));
  const mauLon = await voi(T, hr, (nc) => taoMauPhieu(nc, LuocDoMauPhieuLuu.parse({ ma: `lon-${DAU}`.slice(0, 50), ten: "Mẫu lớn tối đa", boCuc: { tieuDe: "Phiếu lớn", phan: phanLon } })));
  const ptLon = await voi(T, nvA, (nc) => taoPhieuThucTap(nc, LuocDoTaoPhieuThucTap.parse({ nguoiId: tt, mauId: mauLon.id })));
  dat("Mẫu lớn tối đa (400 tiêu chí) tạo phiếu được", (await voi(T, nvA, (nc) => chiTietPhieuThucTap(nc, ptLon.id))).mau.phan.length === 10);
  // Phiếu giữ đúng mẫu lúc tạo khi mẫu bị sửa (đổi / bỏ tiêu chí)
  const ptGiu = await voi(T, nvA, (nc) => taoPhieuThucTap(nc, LuocDoTaoPhieuThucTap.parse({ nguoiId: tt, mauId: mauDoc.id })));
  await voi(T, hr, (nc) => suaMauPhieu(nc, mauDoc.id, LuocDoMauPhieuLuu.parse({ ma: `doc-hai-${DAU}`.slice(0, 50), ten: "Mẫu đã sửa", boCuc: { ...MAU_PHIEU_MAC_DINH, tieuDe: "MẪU MỚI" } })));
  const chamGiu = await voi(T, nvA, (nc) => chamPhieuThucTap(nc, ptGiu.id, { thongTin: {}, diem: { tc1: 7 }, nhanXet: {} }));
  dat("Phiếu cũ chấm theo tiêu chí của mẫu lúc tạo sau khi mẫu bị sửa", chamGiu.ketQua?.tong === 7 && chamGiu.mau.tieuDe.startsWith("PHIẾU"));
  await nemLoi("Phiếu cũ không nhận tiêu chí của mẫu mới", "nghiep-vu", () => voi(T, nvA, (nc) => chamPhieuThucTap(nc, ptGiu.id, { thongTin: {}, diem: { "ky-luat": 9 }, nhanXet: {} })), "tieu-chi-la");
  const ptMoi = await voi(T, nvA, (nc) => taoPhieuThucTap(nc, LuocDoTaoPhieuThucTap.parse({ nguoiId: tt, mauId: mauDoc.id })));
  dat("Phiếu mới chụp mẫu đã sửa (phiên bản 2)", (await voi(T, nvA, (nc) => chiTietPhieuThucTap(nc, ptMoi.id))).phieu.phienBanMau === 2);
  await voi(T, nvA, (nc) => chotPhieuThucTap(nc, ptGiu.id));
  dat("DG-75: vai ứng dụng không sửa phiếu thực tập đã chốt", (await appSua(`UPDATE intern_evaluations SET total_score = 10 WHERE id = '${ptGiu.id}'`)) === "chan");

  // ==================================================================
  console.log("\n— Báo cáo: người mới vào làm không bị tính thiếu các tuần trước ngày vào làm —");
  const homNay = homNayVN();
  const moiVao = await nguoi("Người mới vào QA", "sales", { quanLy: tp, phong: pbKD });
  await chu.staffProfile.update({ where: { userId: moiVao }, data: { hiredAt: new Date(`${homNay}T00:00:00Z`) } });
  const tkMoi = await voiTenant(T, (tx) => thongKeBaoCaoTuan(tx, moiVao, congNgay(homNay, -30), homNay));
  dat("DG-43: thống kê báo cáo tuần không đếm 'thiếu' các tuần trước ngày vào làm", tkMoi.thieu === 0 && tkMoi.soTuan === 0, JSON.stringify(tkMoi));
  const bangTuanTruoc = await voi(T, tp, (nc) => bangBaoCaoNhom(nc, "tuan", congNgay(homNay, -7)));
  dat("DG-45: trang nhóm tuần trước không ghi người mới vào là thiếu", !bangTuanTruoc.dong.some((d) => d.nguoiId === moiVao), bangTuanTruoc.dong.find((d) => d.nguoiId === moiVao)?.tinhTrang ?? "");
  await quetBaoCao(T, new Date(hanBaoCao("tuan", congNgay(homNay, -7)).getTime() + GIO));
  dat("DG-42: không báo thiếu báo cáo tuần trước ngày vào làm", (await chu.notification.count({ where: { tenantId: T, userId: moiVao, type: "bao-cao-thieu" } })) === 0);
  const tkCu = await voiTenant(T, (tx) => thongKeBaoCaoTuan(tx, nvB, congNgay(homNay, -30), homNay));
  dat("…người vào làm trước vẫn bị tính thiếu như cũ", tkCu.soTuan >= 3 && tkCu.thieu === tkCu.soTuan, JSON.stringify(tkCu));

  // ==================================================================
  console.log("\n— Đầu vào: ngày sai —");
  await nemLoi("Nhật ký thực tập: ngày không có thật (13/45) → lỗi dữ liệu nhập", "khong-500", () => voi(T, tt, (nc) => luuNhatKy(nc, LuocDoNhatKy.parse({ ngay: "2026-13-45", daLam: "x" }))));
  await nemLoi("Nhật ký thực tập: 30/02 không lặng lẽ thành 02/03", "khong-500", () => voi(T, tt, (nc) => luuNhatKy(nc, LuocDoNhatKy.parse({ ngay: "2026-02-30", daLam: "x" }))));
  await nemLoi("Phiếu thực tập: từ ngày không có thật → lỗi dữ liệu nhập", "khong-500", () => voi(T, nvA, (nc) => taoPhieuThucTap(nc, LuocDoTaoPhieuThucTap.parse({ nguoiId: tt, mauId: mauDoc.id, tuNgay: "2026-13-01", denNgay: "2026-12-31" }))));
  await nemLoi("Việc định kỳ: ngày bắt đầu không có thật → lỗi dữ liệu nhập", "zod", async () => LuocDoLapViec.parse({ ten: "Lặp sai", tieuDe: "Lặp sai", tanSuat: "ngay", nguoiIds: [nvA], tuNgay: "2026-02-30" }));
  await nemLoi("Việc định kỳ: giờ hạn 25:99 → lỗi dữ liệu nhập (không lặng lẽ thành 17:00)", "zod", async () => LuocDoLapViec.parse({ ten: "Lặp sai", tieuDe: "Lặp sai", tanSuat: "ngay", nguoiIds: [nvA], tuNgay: "2026-11-02", gioHan: "25:99" }));

  // ==================================================================
  console.log("\n— Quyền dựng sẵn khớp vai-tro.ts —");
  const lech: string[] = [];
  for (const dn of VAI_TRO) {
    if (dn.quyen === "*") continue;
    const dong = await chu.rolePermission.findMany({ where: { role: { tenantId: T, code: dn.code }, permission: { module: "danh_gia" } }, select: { dataScope: true, permission: { select: { code: true } } } });
    const mong = dn.quyen.filter((q) => q.startsWith("danh_gia."));
    if (dong.length !== mong.length) lech.push(`${dn.code}: ${dong.length}/${mong.length}`);
    for (const d of dong) if (d.dataScope !== phamViCuaQuyen(dn, d.permission.code)) lech.push(`${dn.code} ${d.permission.code} ${d.dataScope}≠${phamViCuaQuyen(dn, d.permission.code)}`);
  }
  dat("Seed: quyền danh_gia.* của mọi vai trò dựng sẵn khớp vai-tro.ts (mã + phạm vi)", lech.length === 0, lech.join("; "));
  // Nâng cấp: doanh nghiệp không được seed lại (demo…) — Giám đốc / Quản trị chưa có danh_gia.*, HR create = all
  // như migration 20261103090001 để lại. Migration QA 20261103090002 phải đưa về đúng vai-tro.ts.
  const dgQuyen = await chu.permission.findMany({ where: { module: "danh_gia" }, select: { id: true } });
  await chu.rolePermission.deleteMany({ where: { role: { tenantId: t2.id, code: { in: ["ceo", "admin"] } }, permissionId: { in: dgQuyen.map((q) => q.id) } } });
  await chu.rolePermission.updateMany({ where: { role: { tenantId: t2.id, code: "nhan-su-hr" }, permission: { code: "danh_gia.create" } }, data: { dataScope: "all" } });
  const sqlQa = readFileSync(path.join(__dirname, "../prisma/migrations/20261103090002_qa_danh_gia_quyen/migration.sql"), "utf8")
    .split("\n").filter((d) => !d.startsWith("--")).join("\n").split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
  for (const cau of sqlQa) await chu.$executeRawUnsafe(cau);
  const gd2Quyen = await chu.rolePermission.count({ where: { role: { tenantId: t2.id, code: { in: ["ceo", "admin"] } }, permission: { module: "danh_gia" } } });
  const hr2 = await chu.rolePermission.findFirst({ where: { role: { tenantId: t2.id, code: "nhan-su-hr" }, permission: { code: "danh_gia.create" } }, select: { dataScope: true } });
  dat("Nâng cấp (migration QA): Giám đốc / Quản trị doanh nghiệp không seed lại có đủ 6 quyền danh_gia.*", gd2Quyen === 12, `${gd2Quyen}/12`);
  dat("Nâng cấp (migration QA): Nhân sự danh_gia.create về phạm vi của mình như vai-tro.ts", hr2?.dataScope === "own", hr2?.dataScope ?? "");

  // ==================================================================
  // 0.20.0 — 10 quyết định chính sách (QĐ-131 → QĐ-140)
  // ==================================================================
  const datCauHinh = async (khoa: string, giaTri: number | null) => {
    await chu.tenantSetting.deleteMany({ where: { tenantId: T, key: khoa } });
    if (giaTri !== null) await chu.tenantSetting.create({ data: { tenantId: T, key: khoa, value: giaTri } });
  };
  const kho = await nguoi("NV Kho QA", "warehouse", { quanLy: gd });
  const keToan = await nguoi("Kế toán QA", "finance");

  console.log("\n— QĐ-137: chỉ người giao / quản lý trực tiếp / Giám đốc / Quản trị đổi thuộc tính chấm điểm —");
  // Đường tấn công 1: nhân viên Marketing / Kho / Kế toán (task.update toàn công ty) tự đặt mình làm người duyệt việc
  // của đồng nghiệp rồi chấm điểm.
  const vTc = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QĐ-137 việc bị nhắm", { nguoiPhuTrachId: nvA, han: new Date(Date.now() + 48 * GIO).toISOString() })));
  for (const [ten, ke] of [["Marketing", mk], ["Kho", kho], ["Kế toán", keToan]] as const) {
    await nemLoi(`Tấn công 1 — NV ${ten} (task.update toàn công ty) không tự đặt mình làm người duyệt việc đồng nghiệp`, "nghiep-vu",
      () => voi(T, ke, (nc) => suaViec(nc, vTc.id, { nguoiDuyetIds: [ke] })), "chi-nguoi-giao");
    await nemLoi(`…NV ${ten} không hạ độ khó / tắt cờ duyệt / dời hạn việc đồng nghiệp`, "nghiep-vu",
      () => voi(T, ke, (nc) => suaViec(nc, vTc.id, { doKho: 1, canDuyet: false, han: new Date(Date.now() - 96 * GIO) })), "chi-nguoi-giao");
  }
  await voi(T, nvA, (nc) => suaViec(nc, vTc.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  await nemLoi("…và vì không vào được chuỗi duyệt nên NV Marketing không chấm điểm được việc đó", "nghiep-vu",
    () => voi(T, mk, (nc) => duyetViec(nc, vTc.id, { chatLuong: 1, nhanXet: "" })), "khong-phai-luot");
  const chuoiTc = await chu.taskApprover.findMany({ where: { taskId: vTc.id } });
  dat("…chuỗi duyệt giữ nguyên người giao (TP)", chuoiTc.length === 1 && chuoiTc[0].approverId === tp);
  await voi(T, tp, (nc) => duyetViec(nc, vTc.id, { chatLuong: 4, nhanXet: "" }));
  // Đường tấn công 2: chuyển việc đi rồi chuyển lại cho chính mình để thành người giao.
  const vVong = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QĐ-137 việc chuyển vòng", { nguoiPhuTrachId: nvA, canDuyet: false })));
  await nemLoi("Tấn công 2 — NV Marketing không chuyển việc của đồng nghiệp sang người khác", "nghiep-vu",
    () => voi(T, mk, (nc) => suaViec(nc, vVong.id, { nguoiPhuTrachId: nvB })), "chi-nguoi-giao");
  await nemLoi("…không chuyển việc đó về cho chính mình", "nghiep-vu", () => voi(T, mk, (nc) => suaViec(nc, vVong.id, { nguoiPhuTrachId: mk })), "chi-nguoi-giao");
  // Giám đốc (được phép đổi) chuyển đi rồi chuyển lại: người giao vẫn là TP, Giám đốc không thành người giao.
  await voi(T, gd, (nc) => suaViec(nc, vVong.id, { nguoiPhuTrachId: nvB }));
  await voi(T, gd, (nc) => suaViec(nc, vVong.id, { nguoiPhuTrachId: nvA }));
  const vVongSau = await chu.task.findUniqueOrThrow({ where: { id: vVong.id } });
  dat("Chuyển đi rồi chuyển lại không đổi người giao (ghi một lần)", vVongSau.assignedBy === tp && vVongSau.ownerId === nvA, vVongSau.assignedBy ?? "");
  dat("CSDL: vai ứng dụng không đổi được người giao việc (trigger tasks_nguoi_giao_ghi_mot_lan)",
    (await appSua(`UPDATE tasks SET assigned_by = '${mk}' WHERE id = '${vVong.id}'`)) === "chan");
  dat("CSDL: vai chủ sở hữu cũng không đổi được người giao",
    await chu.$executeRawUnsafe(`UPDATE tasks SET assigned_by = '${mk}' WHERE id = '${vVong.id}'`).then(() => false, () => true));
  const tcSua = await voi(T, mk, (nc) => suaViec(nc, vVong.id, { tieuDe: "QĐ-137 việc chuyển vòng (Marketing sửa tên)", moTa: "Thêm mô tả", uuTien: "cao" }));
  dat("Người có task.update toàn công ty vẫn sửa được tiêu đề, mô tả, ưu tiên", tcSua.tieuDe.includes("Marketing sửa tên") && tcSua.uuTien === "cao");
  await nemLoi("…nhưng không hủy / đóng việc của đồng nghiệp", "nghiep-vu", () => voi(T, mk, (nc) => suaViec(nc, vVong.id, { trangThai: "huy" })), "chi-nguoi-giao");
  const ctMk = await voi(T, mk, (nc) => chiTietViec(nc, vVong.id));
  dat("Giao diện: NV Marketing không có quyền giao lại / sửa thuộc tính chấm điểm", ctMk.quyen.sua && !ctMk.quyen.suaChamDiem && !ctMk.quyen.giaoLai);
  const vGdGiao = await voi(T, gd, (nc) => taoViec(nc, viecMoi("QĐ-137 Giám đốc giao", { nguoiPhuTrachId: nvA, canDuyet: false })));
  const ql = await voi(T, tp, (nc) => suaViec(nc, vGdGiao.id, { doKho: 5 }));
  dat("Quản lý trực tiếp của người làm (không phải người giao) đổi được độ khó", ql.doKho === 5);
  await nemLoi("Không ai tự đặt mình làm người duyệt việc của mình (kể cả quản lý trực tiếp tự nhận việc)", "nghiep-vu",
    () => voi(T, tp, (nc) => suaViec(nc, vGdGiao.id, { nguoiPhuTrachId: tp, canDuyet: true, nguoiDuyetIds: [tp] })), "tu-duyet");

  console.log("\n— QĐ-139: thông báo 'đã duyệt' chỉ kèm điểm khi người nhận xem được đánh giá —");
  const vMk = await voi(T, mk, (nc) => taoViec(nc, viecMoi("QĐ-139 việc Marketing giao", { nguoiPhuTrachId: nvA, nguoiDuyetIds: [tp] })));
  await voi(T, nvA, (nc) => suaViec(nc, vMk.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  await voi(T, tp, (nc) => duyetViec(nc, vMk.id, { chatLuong: 4, nhanXet: "" }));
  const tbMk = await chu.notification.findFirst({ where: { userId: mk, type: "viec-da-xong", objectId: vMk.id } });
  dat("Người giao không có danh_gia.view với người làm: thông báo không có điểm / chất lượng", !!tbMk && !/điểm|Chất lượng/.test(tbMk.body ?? ""), tbMk?.body ?? "không có thông báo");
  const tbA = await chu.notification.findFirst({ where: { userId: nvA, type: "viec-da-duyet", objectId: vMk.id } });
  dat("Người làm (xem được đánh giá của mình) vẫn nhận điểm", !!tbA && /điểm 12/.test(tbA.body ?? ""), tbA?.body ?? "");
  const vTp = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QĐ-139 việc TP giao", { nguoiPhuTrachId: nvA, nguoiDuyetIds: [gd] })));
  await voi(T, nvA, (nc) => suaViec(nc, vTp.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  await voi(T, gd, (nc) => duyetViec(nc, vTp.id, { chatLuong: 5, nhanXet: "" }));
  const tbTp = await chu.notification.findFirst({ where: { userId: tp, type: "viec-da-xong", objectId: vTp.id } });
  dat("Người giao có danh_gia.view phạm vi nhóm: thông báo kèm điểm", !!tbTp && /điểm 15/.test(tbTp.body ?? ""), tbTp?.body ?? "");

  console.log("\n— QĐ-133: chốt phiếu mặc định chỉ Giám đốc —");
  const ky133 = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: 2025, so: 3, nguoiIds: [nvA, tp] }));
  const pA133 = await chu.evaluation.findFirstOrThrow({ where: { periodId: ky133.id, userId: nvA }, include: { items: true } });
  const pTp133 = await chu.evaluation.findFirstOrThrow({ where: { periodId: ky133.id, userId: tp }, include: { items: true } });
  await voi(T, tp, (nc) => quanLyCham(nc, pA133.id, { nhanXet: "", chiTieu: pA133.items.map((c) => ({ id: c.id, diem: 80, ghiChu: "" })), nop: true }));
  const ctTp133 = await voi(T, tp, (nc) => chiTietPhieu(nc, pA133.id));
  dat("Trưởng phòng chấm được nhưng giao diện không cho chốt", !ctTp133.quyen.chot);
  await nemLoi("Trưởng phòng (danh_gia.approve phạm vi nhóm) không chốt phiếu khi Cấu hình tắt (mặc định)", "nghiep-vu",
    () => voi(T, tp, (nc) => chotPhieu(nc, pA133.id, { ghiChu: "" })), "khong-duoc-chot");
  dat("Thông báo phiếu chờ chốt gửi Giám đốc (không gửi trưởng phòng)", (await chu.notification.count({ where: { userId: gd, type: "danh-gia-cho-chot", objectId: pA133.id } })) === 1);
  await datCauHinh("danh_gia.truong_phong_duoc_chot", 1);
  const chotTp = await voi(T, tp, (nc) => chotPhieu(nc, pA133.id, { ghiChu: "" }));
  dat("Cấu hình danh_gia.truong_phong_duoc_chot = 1: trưởng phòng chốt được phiếu trong phạm vi", chotTp.phieu.trangThai === "da-chot");
  await voi(T, gd, (nc) => quanLyCham(nc, pTp133.id, { nhanXet: "", chiTieu: pTp133.items.map((c) => ({ id: c.id, diem: 90, ghiChu: "" })), nop: true }));
  await nemLoi("…vẫn không tự chốt phiếu của mình", "nghiep-vu", () => voi(T, tp, (nc) => chotPhieu(nc, pTp133.id, { ghiChu: "" })), "khong-duoc-chot");
  await nemLoi("…và không chốt phiếu người ngoài phạm vi (KTV phòng Kỹ thuật)", "nghiep-vu", async () => {
    const k = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: 2025, so: 4, nguoiIds: [nvC] }));
    const pc = await chu.evaluation.findFirstOrThrow({ where: { periodId: k.id, userId: nvC } });
    return voi(T, tp, (nc) => chotPhieu(nc, pc.id, { ghiChu: "" }));
  });
  await datCauHinh("danh_gia.truong_phong_duoc_chot", null);

  console.log("\n— QĐ-132: người không có quản lý trực tiếp vẫn báo cáo; Giám đốc nhận, xét, chấm —");
  const ds132 = await voiTenant(T, (tx) => nguoiPhaiBaoCao(tx));
  const ktDong = ds132.find((x) => x.id === keToan);
  dat("Kế toán không có quản lý trực tiếp vẫn phải báo cáo, người nhận = Giám đốc (người đầu theo ngày tạo)", ktDong?.quanLyId === gd, JSON.stringify(ktDong ?? null));
  dat("Giám đốc không phải báo cáo (mặc định)", !ds132.some((x) => x.id === gd || x.id === gdPho));
  await datCauHinh("bao_cao.giam_doc_phai_bao_cao", 1);
  dat("Cấu hình bao_cao.giam_doc_phai_bao_cao = 1: Giám đốc cũng phải báo cáo", (await voiTenant(T, (tx) => nguoiPhaiBaoCao(tx, [gd]))).length === 1);
  await datCauHinh("bao_cao.giam_doc_phai_bao_cao", null);
  const bcKt = await voi(T, keToan, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "tuan", ngay: congNgay(homNayVN(), -14), daLam: "Đối soát công nợ", vuongMac: "Thiếu chứng từ", nop: true })));
  dat("Nộp báo cáo → Giám đốc được báo", (await chu.notification.count({ where: { userId: gd, type: "bao-cao-da-nop", objectId: bcKt.id } })) === 1);
  const nx132 = await voi(T, gd, (nc) => nhanXetBaoCao(nc, bcKt.id, { noiDung: "Bổ sung chứng từ trong tuần" }));
  dat("Giám đốc nhận xét được báo cáo người không có quản lý", !!nx132.id);
  const ky132 = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: 2025, so: 5 }));
  const pKt = await chu.evaluation.findFirst({ where: { periodId: ky132.id, userId: keToan } });
  dat("Mở kỳ (không chọn người): có phiếu cho người không có quản lý, người chấm = Giám đốc", pKt?.managerId === gd);
  dat("…không có phiếu cho chính Giám đốc", (await chu.evaluation.count({ where: { periodId: ky132.id, userId: { in: [gd, gdPho] } } })) === 0);
  const pKtDu = await chu.evaluation.findUniqueOrThrow({ where: { id: pKt!.id }, include: { items: true } });
  const chamKt = await voi(T, gd, (nc) => quanLyCham(nc, pKtDu.id, { nhanXet: "Ổn", chiTieu: pKtDu.items.map((c) => ({ id: c.id, diem: 85, ghiChu: "" })), nop: true }));
  dat("Giám đốc chấm phiếu người không có quản lý", chamKt.phieu.trangThai === "cho-chot");

  console.log("\n— QĐ-135: người duyệt nghỉ việc / bị khóa → bước đang chờ lên cấp trên —");
  const tp3 = await nguoi("TP3 sắp nghỉ QA", "sales-manager", { quanLy: gd, phong: pbKD });
  const nv3 = await nguoi("NV3 QA", "sales", { quanLy: tp3, phong: pbKD });
  const vCho = await voi(T, tp3, (nc) => taoViec(nc, viecMoi("QĐ-135 việc chờ TP3 duyệt", { nguoiPhuTrachId: nv3 })));
  await voi(T, nv3, (nc) => suaViec(nc, vCho.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
  const vGh = await voi(T, tp3, (nc) => taoViec(nc, viecMoi("QĐ-135 việc xin gia hạn", { nguoiPhuTrachId: nv3, canDuyet: false, han: new Date(Date.now() + 2 * GIO).toISOString() })));
  const gh135 = await voi(T, nv3, (nc) => xinGiaHan(nc, vGh.id, { hanMoi: new Date(Date.now() + 72 * GIO), lyDo: "Chờ linh kiện về" }));
  // Việc của chính Giám đốc mà TP3 là người duyệt: chuyển lên quản lý của TP3 = Giám đốc = người làm → đi tiếp lên.
  const vCuaGd = await voi(T, qt, (nc) => taoViec(nc, viecMoi("QĐ-135 việc của giám đốc", { nguoiPhuTrachId: gd, nguoiDuyetIds: [tp3] })));
  const bc135 = await voi(T, nv3, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "tuan", ngay: congNgay(homNayVN(), -7), daLam: "Gặp 5 khách", nop: true })));
  const ky135 = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: 2025, so: 6, nguoiIds: [nv3] }));
  const p135 = await chu.evaluation.findFirstOrThrow({ where: { periodId: ky135.id, userId: nv3 } });
  dat("Chuẩn bị: phiếu của NV3 do TP3 chấm", p135.managerId === tp3);
  await voi(T, qt, (nc) => suaNguoiDung(nc, tp3, { trangThai: "ngung-hoat-dong" }));
  const capSau = await chu.taskApprover.findFirstOrThrow({ where: { taskId: vCho.id, level: 1 } });
  dat("Khóa TP3: bước duyệt việc đang chờ chuyển cho quản lý trực tiếp của TP3 (Giám đốc)", capSau.approverId === gd);
  dat("…Giám đốc được báo 'chờ bạn duyệt'", (await chu.notification.count({ where: { userId: gd, type: "viec-cho-duyet", objectId: vCho.id } })) >= 1);
  const ghSau135 = await chu.taskExtension.findUniqueOrThrow({ where: { id: gh135.id } });
  dat("…đề nghị gia hạn đang chờ chuyển cho Giám đốc", ghSau135.approverId === gd);
  const qd135 = await voi(T, gd, (nc) => quyetDinhGiaHan(nc, gh135.id, { dongY: true, ghiChu: "" }));
  dat("…Giám đốc quyết định được đề nghị gia hạn", qd135.dongY === true);
  dat("…người giao việc giữ nguyên (TP3) — chỉ bước duyệt đổi", (await chu.task.findUniqueOrThrow({ where: { id: vGh.id } })).assignedBy === tp3);
  const capGd = await chu.taskApprover.findFirstOrThrow({ where: { taskId: vCuaGd.id, level: 1 } });
  dat("Người nhận lại chính là người làm (Giám đốc) → đi tiếp lên cấp trên (Giám đốc khác), không tự duyệt", capGd.approverId !== gd && capGd.approverId === gdPho, capGd.approverId);
  dat("…phiếu đánh giá chờ chấm chuyển cho Giám đốc", (await chu.evaluation.findUniqueOrThrow({ where: { id: p135.id } })).managerId === gd);
  const lsChuyen = await chu.approvalTransfer.findMany({ where: { tenantId: T, fromUserId: tp3 } });
  dat("…mỗi bước chuyển ghi một dòng lịch sử (việc ×2, gia hạn, báo cáo, phiếu)", lsChuyen.length === 5 && lsChuyen.every((x) => x.reason === "ngung-hoat-dong"),
    lsChuyen.map((x) => x.objectType).join(","));
  dat("…báo cáo chờ xét của cấp dưới được ghi chuyển cho Giám đốc", lsChuyen.some((x) => x.objectType === "work_report" && x.objectId === bc135.id && x.toUserId === gd));
  dat("Lịch sử chuyển chỉ ghi thêm (vai ứng dụng không sửa / xóa)",
    (await appSua(`UPDATE approval_transfers SET note = 'x' WHERE from_user_id = '${tp3}'`)) === "chan" && (await appSua(`DELETE FROM approval_transfers WHERE from_user_id = '${tp3}'`)) === "chan");
  const lsViec = await voi(T, gd, (nc) => lichSuGiaoViec(nc, vCho.id));
  dat("Lịch sử việc hiện dòng chuyển bước", lsViec.chuyenBuoc.length === 1 && lsViec.quyen.duyet);
  await voi(T, gd, (nc) => duyetViec(nc, vCho.id, { chatLuong: 4, nhanXet: "" }));
  const nxGd = await voi(T, gd, (nc) => nhanXetBaoCao(nc, bc135.id, { noiDung: "Đã xem thay TP3" }));
  dat("Giám đốc duyệt việc và nhận xét báo cáo thay TP3", !!nxGd.id && (await chu.task.findUniqueOrThrow({ where: { id: vCho.id } })).status === "xong");
  dat("Báo cáo mới của NV3 (quản lý đã nghỉ) gửi Giám đốc", (await voiTenant(T, (tx) => nguoiPhaiBaoCao(tx, [nv3])))[0]?.quanLyId === gd);
  // Bàn giao thủ công: việc của A chuyển cho B mà B đang là người duyệt của việc đó → bước duyệt lên cấp trên của B.
  const nvA4 = await nguoi("NV A4 nghỉ QA", "sales", { quanLy: tp, phong: pbKD });
  const nvB4 = await nguoi("NV B4 nhận QA", "sales", { quanLy: tp, phong: pbKD });
  const v4 = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QĐ-135 việc bàn giao", { nguoiPhuTrachId: nvA4, nguoiDuyetIds: [nvB4] })));
  const vDuyetA4 = await voi(T, tp, (nc) => taoViec(nc, viecMoi("QĐ-135 việc A4 đang duyệt", { nguoiPhuTrachId: nvB, nguoiDuyetIds: [nvA4] })));
  const bg = await voi(T, qt, (nc) => banGiao(nc, nvA4, { nguoiNhanId: nvB4, khoaTaiKhoan: true, ghiChu: null }));
  const cap4 = await chu.taskApprover.findFirstOrThrow({ where: { taskId: v4.id, level: 1 } });
  dat("Bàn giao: người nhận đang là người duyệt của việc vừa nhận → bước đó lên quản lý của họ", cap4.approverId === tp && bg.goTuDuyet === 1, cap4.approverId);
  const capA4 = await chu.taskApprover.findFirstOrThrow({ where: { taskId: vDuyetA4.id, level: 1 } });
  dat("Bàn giao: bước A4 đang duyệt chuyển cho quản lý của A4 (không cho người nhận bàn giao)", capA4.approverId === tp && bg.buocDaChuyen.viec === 1);

  console.log("\n— QĐ-138: báo cáo ngày không bắt buộc vào ngày không phải làm —");
  const nvD = await nguoi("NV D báo cáo ngày QA", "sales", { quanLy: tp, phong: pbKD });
  const ca = await chu.workShift.create({ data: { tenantId: T, code: `hc-${DAU}`.slice(0, 30), name: "Hành chính QA", startMinute: 480, endMinute: 1020, breakStartMinute: 720, breakMinutes: 60 } });
  const lich = await chu.workSchedule.create({ data: { tenantId: T, code: `t2t6-${DAU}`.slice(0, 30), name: "T2–T6 QA", shiftId: ca.id, days: ["ca", "ca", "ca", "ca", "ca", "nghi", "nghi"] } });
  await chu.scheduleAssignment.create({ data: { tenantId: T, userId: nvD, scheduleId: lich.id, effectiveFrom: new Date("2026-09-01T00:00:00Z") } });
  await chu.holiday.create({ data: { tenantId: T, date: new Date("2026-10-07T00:00:00Z"), name: "Ngày lễ thử QA" } });
  const loaiPhep = await chu.leaveType.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code: "phep-nam" } } });
  await chu.leaveRequest.create({ data: { tenantId: T, userId: nvD, leaveTypeId: loaiPhep.id, startDate: new Date("2026-10-08T00:00:00Z"), endDate: new Date("2026-10-08T00:00:00Z"), portion: "ca-ngay", days: 1, reason: "Việc gia đình QA", status: "da-duyet", decidedBy: tp, decidedAt: new Date("2026-10-01T02:00:00Z") } });
  await chu.leaveRequest.create({ data: { tenantId: T, userId: nvD, leaveTypeId: loaiPhep.id, startDate: new Date("2026-10-09T00:00:00Z"), endDate: new Date("2026-10-09T00:00:00Z"), portion: "sang", days: 0.5, reason: "Khám bệnh QA", status: "da-duyet", decidedBy: tp, decidedAt: new Date("2026-10-01T02:00:00Z") } });
  const coTrongNhom = async (ngay: string) => (await voi(T, tp, (nc) => bangBaoCaoNhom(nc, "ngay", ngay))).dong.find((x) => x.nguoiId === nvD);
  dat("Chủ nhật (lịch T2–T6): không có trong bảng báo cáo ngày của nhóm", !(await coTrongNhom("2026-10-04")));
  dat("Thứ Hai: bắt buộc, chưa nộp → thiếu", (await coTrongNhom("2026-10-05"))?.tinhTrang === "thieu");
  dat("Ngày lễ: không bắt buộc", !(await coTrongNhom("2026-10-07")));
  dat("Nghỉ phép đã duyệt cả ngày: không bắt buộc", !(await coTrongNhom("2026-10-08")));
  dat("Nghỉ nửa ngày: vẫn bắt buộc", (await coTrongNhom("2026-10-09"))?.batBuoc === true);
  const thieuNgay = async (ngay: string) => {
    await quetBaoCao(T, mocVN(ngay, 21 * 60));
    return chu.notification.count({ where: { userId: nvD, type: "bao-cao-thieu", dedupeKey: `bao-cao-thieu:ngay:${ngay}` } });
  };
  dat("Worker: không báo thiếu báo cáo ngày Chủ nhật / ngày lễ / ngày nghỉ phép cả ngày",
    (await thieuNgay("2026-10-04")) === 0 && (await thieuNgay("2026-10-07")) === 0 && (await thieuNgay("2026-10-08")) === 0);
  dat("Worker: vẫn báo thiếu ngày thường và ngày nghỉ nửa ngày", (await thieuNgay("2026-10-06")) === 1 && (await thieuNgay("2026-10-09")) === 1);
  await voi(T, nvD, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "ngay", ngay: "2026-10-05", daLam: "Báo cáo trễ thứ Hai", nop: true })));
  const tkNgay = await voiTenant(T, (tx) => thongKeBaoCaoNgay(tx, nvD, "2026-10-04", "2026-10-10", new Date("2026-10-20T00:00:00Z")));
  dat("Thống kê trên phiếu đánh giá: tuần 04–10/10 chỉ 3 ngày phải nộp (T2, T3, T6), 1 trễ, 2 thiếu", tkNgay.soNgay === 3 && tkNgay.tre === 1 && tkNgay.thieu === 2, JSON.stringify(tkNgay));

  console.log("\n— QĐ-136: việc định kỳ mặc định không cần duyệt —");
  dat("Lược đồ việc định kỳ: không gửi cờ → không cần duyệt", LuocDoLapViec.parse({ ten: "Lặp QA", tieuDe: "Lặp QA", tanSuat: "ngay", nguoiIds: [nvA], tuNgay: "2026-10-01" }).canDuyet === false);
  const mauCanDuyet = await voi(T, tp, (nc) => taoMauViec(nc, LuocDoMauViec.parse({ ten: `Mẫu cần duyệt ${DAU}`, tieuDe: "Kiểm kho", canDuyet: true })));
  const lapKhong = await voi(T, tp, (nc) => taoLapViec(nc, LuocDoLapViec.parse({ ten: `Lặp không duyệt ${DAU}`, mauViecId: mauCanDuyet.id, tieuDe: "Kiểm kho hằng ngày", tanSuat: "ngay", nguoiIds: [nvA], tuNgay: "2026-10-01" })));
  const lapCo = await voi(T, tp, (nc) => taoLapViec(nc, LuocDoLapViec.parse({ ten: `Lặp cần duyệt ${DAU}`, tieuDe: "Báo cáo tồn kho", tanSuat: "ngay", nguoiIds: [nvA], tuNgay: "2026-10-01", canDuyet: true })));
  await sinhViecDinhKy(T, mocVN("2026-10-06", 8 * 60));
  const vLapKhong = await chu.task.findFirstOrThrow({ where: { recurrenceId: lapKhong.id } });
  const vLapCo = await chu.task.findFirstOrThrow({ where: { recurrenceId: lapCo.id } });
  dat("Việc sinh từ lịch không bật cờ: không cần duyệt (dù mẫu gắn kèm bật)", !vLapKhong.needsApproval);
  dat("Lịch bật cờ 'cần duyệt': việc sinh ra cần duyệt, người duyệt = người lập lịch", vLapCo.needsApproval && (await chu.taskApprover.findFirst({ where: { taskId: vLapCo.id } }))?.approverId === tp);

  console.log("\n— QĐ-134: mọi mặc định đánh giá / báo cáo sửa được trong Cấu hình —");
  await datCauHinh("danh_gia.he_so_tre_nhe", 0.7);
  await datCauHinh("danh_gia.tre_nhe_toi_da_gio", 12);
  await datCauHinh("danh_gia.nguong_a", 95);
  await datCauHinh("danh_gia.he_so_thuong_a", 1.5);
  await datCauHinh("bao_cao.han_ngay_gio", 18);
  const ch134 = await voiTenant(T, (tx) => docCauHinhDanhGia(tx));
  const h134 = new Date("2026-10-05T10:00:00Z");
  dat("Trễ nhẹ theo Cấu hình: trễ 12 giờ → 0,7; trễ 13 giờ → trễ nặng", heSoDungHan(h134, new Date(h134.getTime() + 12 * GIO), dungHanTu(ch134)).heSo === 0.7 && heSoDungHan(h134, new Date(h134.getTime() + 13 * GIO), dungHanTu(ch134)).heSo === 0.5);
  dat("Xếp loại theo Cấu hình: 94 là B khi ngưỡng A = 95; A có hệ số 1,5", xepLoai(94, { ...ch134 }).loai === "B" && xepLoai(95, { ...ch134 }).heSoThuong === 1.5);
  const moNgay = await voi(T, nvA, (nc) => moBaoCao(nc, "ngay", "2026-10-06"));
  dat("Hạn báo cáo ngày theo Cấu hình 18:00", moNgay.han.toISOString() === mocVN("2026-10-06", 18 * 60).toISOString() && hanBaoCao("ngay", "2026-10-06", baoCaoTu(ch134)).getTime() === moNgay.han.getTime());
  for (const k of ["danh_gia.he_so_tre_nhe", "danh_gia.tre_nhe_toi_da_gio", "danh_gia.nguong_a", "danh_gia.he_so_thuong_a", "bao_cao.han_ngay_gio"]) await datCauHinh(k, null);
  const chMd = await voiTenant(T, (tx) => docCauHinhDanhGia(tx));
  dat("Mặc định khi chưa đặt: 0,8 / 0,5 / 24 giờ; A 90 / B 75 / C 60; 1,2 / 1 / 0,8 / 0; 20:00; chốt chỉ Giám đốc; Giám đốc không báo cáo",
    chMd.heSoTreNhe === 0.8 && chMd.heSoTreNang === 0.5 && chMd.treNheToiDaGio === 24 && chMd.nguongA === 90 && chMd.nguongB === 75 && chMd.nguongC === 60
    && chMd.heSoA === 1.2 && chMd.heSoB === 1 && chMd.heSoC === 0.8 && chMd.heSoD === 0 && chMd.hanNgayGio === 20 && chMd.truongPhongDuocChot === 0 && chMd.giamDocPhaiBaoCao === 0);

  console.log("\n— QĐ-140: kỳ đã có phiếu chốt không đổi được loại kỳ / ngày —");
  await nemLoi("API: kỳ đã có phiếu chốt → 409 ky-da-chot", "nghiep-vu", () => voi(T, hr, (nc) => suaKyDanhGia(nc, kyGd.id, { loai: "thang", nam: 2025, so: 2 })), "ky-da-chot");
  dat("SQL vai cowork_app: không đổi ngày kết thúc kỳ đã có phiếu chốt", (await appSua(`UPDATE evaluation_periods SET end_date = end_date + 1 WHERE id = '${kyGd.id}'`)) === "chan");
  dat("SQL vai cowork_app: không đổi ngày bắt đầu / loại kỳ", (await appSua(`UPDATE evaluation_periods SET start_date = start_date - 1 WHERE id = '${kyGd.id}'`)) === "chan"
    && (await appSua(`UPDATE evaluation_periods SET kind = 'quy', number = 1 WHERE id = '${kyGd.id}'`)) === "chan");
  dat("SQL vai chủ sở hữu cũng bị chặn", await chu.$executeRawUnsafe(`UPDATE evaluation_periods SET end_date = end_date + 1 WHERE id = '${kyGd.id}'`).then(() => false, () => true));
  dat("…đổi trạng thái kỳ (không phải ngày) vẫn được", (await appSua(`UPDATE evaluation_periods SET status = status WHERE id = '${kyGd.id}'`)) === "lot");
  const kyMo = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: 2025, so: 7, nguoiIds: [nvB] }));
  const suaMo = await voi(T, hr, (nc) => suaKyDanhGia(nc, kyMo.id, { loai: "thang", nam: 2025, so: 8 }));
  const kyMoSau = await chu.evaluationPeriod.findUniqueOrThrow({ where: { id: kyMo.id } });
  dat("Kỳ chưa có phiếu chốt: sửa được, ngày tính lại theo giờ VN", suaMo.daDoi && kyMoSau.startDate.toISOString().slice(0, 10) === "2025-08-01" && kyMoSau.endDate.toISOString().slice(0, 10) === "2025-08-31");
  await nemLoi("Sửa trùng một kỳ đã có → 409 trung-ky", "nghiep-vu", () => voi(T, hr, (nc) => suaKyDanhGia(nc, kyMo.id, { loai: "thang", nam: 2025, so: 6 })), "trung-ky");
  await nemLoi("Trưởng phòng không sửa kỳ (cần nhan_su.update)", "quyen", () => voi(T, tp, (nc) => suaKyDanhGia(nc, kyMo.id, { loai: "thang", nam: 2025, so: 9 })));

  await chu.$disconnect();
  ketLuan("QA 0.20.0 — Nhân sự giai đoạn 2");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
