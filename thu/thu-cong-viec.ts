import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Tệp đính kèm vào thư mục tạm TRƯỚC khi nạp module kho tệp (như thu-dinh-kem).
process.env.THU_MUC_DINH_KEM = mkdtempSync(path.join(tmpdir(), "cowork-cong-viec-"));

import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { khach360, suaKhachHang, taoKhachHang, taoLienHe } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import {
  chiTietViec,
  danhSachViec,
  goMucKiemTra,
  kiemTraViec,
  LuocDoLocViec,
  suaViec,
  taoViec,
  themMucKiemTra,
  tichMucKiemTra,
} from "../src/modules/cong-viec/service";
import type { KetQuaKiemTra } from "../src/modules/cong-viec/kiem-tra";
import { danhSachDinhKem, dinhKemTep } from "../src/modules/dinh-kem/service";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng 0.17.0 — Công việc thông suốt — trên CSDL THẬT, qua đúng service mà API gọi.
 * Luật: BUSINESS_RULES.md mục 27 (CV-04 → CV-11) và mục 28 (HS-01 → HS-04).
 * Chạy: npm run thu:cong-viec (CSDL phát triển).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const MST = `05${String(Date.now()).slice(-8)}`;
const KET_QUA = "Đã gọi anh Minh, khách đồng ý khảo sát văn phòng thứ Năm tuần này.";

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-cong-viec"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<LoiNghiepVu | null> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
    return null;
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "dinh-dang" ? e instanceof LoiDinhDang
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
    return e instanceof LoiNghiepVu ? e : null;
  }
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25]);

async function main() {
  console.log("=== Thử Công việc thông suốt (0.17.0) ===\n");
  const tenant = await seedNenMong(chu, `thu-cv-${DAU}`, "Doanh nghiệp thử công việc");
  const T = tenant.id;

  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  async function nguoi(ten: string, vai: string, quanLyId?: string) {
    const u = await chu.user.create({
      data: {
        tenantId: T,
        email: `${ten}.${DAU}@thu.test`,
        passwordHash: "x",
        fullName: ten,
        userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
        staffProfile: { create: { tenantId: T, managerId: quanLyId ?? null } },
      },
    });
    return u.id;
  }
  const tp = await nguoi("truong-phong", "sales-manager");
  const nvA = await nguoi("nhan-vien-a", "sales", tp);
  const nvB = await nguoi("nhan-vien-b", "sales", tp);

  const thongBao = (userId: string, loai: string, taskId?: string) =>
    chu.notification.findMany({ where: { tenantId: T, userId, type: loai, ...(taskId && { objectId: taskId }) }, orderBy: { createdAt: "asc" } });

  // Khách của A: doanh nghiệp, thiếu mã số thuế và người liên hệ.
  const khach = await voi(T, nvA, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Bình Minh ${DAU}`, dienThoai: "0909 123 456", loaiKhach: "doanh-nghiep" })),
  );

  // ------------------------------------------------------------------
  console.log("— CV-08: giao việc phải báo người nhận —");
  const viec = await voi(T, tp, (nc) =>
    taoViec(nc, {
      tieuDe: "Khảo sát lắp camera văn phòng",
      moTa: null,
      nguoiPhuTrachId: nvA,
      uuTien: "cao",
      han: new Date(Date.now() + 2 * 86400000),
      khachHangId: khach.id,
      leadId: null,
      coHoiId: null,
      mucKiemTra: [
        { nhan: "Chụp ảnh vị trí lắp", batBuoc: true },
        { nhan: "Đo khoảng cách đi dây", batBuoc: true },
        { nhan: "Gửi ảnh vào nhóm Zalo", batBuoc: false },
      ],
    }),
  );
  dat("Việc ghi người giao = Trưởng phòng", viec.nguoiGiao?.id === tp);
  dat("Việc có 3 mục kiểm tra, 2 bắt buộc chưa tích", viec.kiemTra.tong === 3 && viec.kiemTra.batBuocConThieu === 2);
  const tbA = await thongBao(nvA, "viec-duoc-giao", viec.id);
  dat("NV A nhận đúng 1 thông báo được giao việc", tbA.length === 1, `có ${tbA.length}`);
  dat("Thông báo dẫn thẳng tới trang việc", tbA[0]?.link === `/cong-viec/${viec.id}`);
  dat("Việc ưu tiên Cao thì thông báo mức cảnh báo", tbA[0]?.severity === "canh-bao");
  dat("Người giao không tự nhận thông báo của mình", (await thongBao(tp, "viec-duoc-giao")).length === 0);

  const tuGiao = await voi(T, nvA, (nc) =>
    taoViec(nc, { tieuDe: "Tự nhắc gọi lại", moTa: null, nguoiPhuTrachId: null, uuTien: "trung-binh", han: null, khachHangId: null, leadId: null, coHoiId: null }),
  );
  dat("Tự tạo việc cho mình thì không có thông báo", (await thongBao(nvA, "viec-duoc-giao", tuGiao.id)).length === 0);

  const toiGiao = await voi(T, tp, (nc) => danhSachViec(nc, LuocDoLocViec.parse({ cheDo: "toi-giao" })));
  dat("Chế độ 'Tôi giao' của Trưởng phòng thấy việc giao cho A", toiGiao.dong.some((v) => v.id === viec.id));
  const toiGiaoA = await voi(T, nvA, (nc) => danhSachViec(nc, LuocDoLocViec.parse({ cheDo: "toi-giao" })));
  dat("'Tôi giao' không gồm việc tự giao cho chính mình", !toiGiaoA.dong.some((v) => v.id === tuGiao.id));

  // ------------------------------------------------------------------
  console.log("\n— CV-05, CV-06: chưa đủ điều kiện thì không cho xong —");
  const loiXong = await nemLoi("Bấm Xong khi chưa ghi gì bị chặn", "nghiep-vu", () =>
    voi(T, nvA, (nc) => suaViec(nc, viec.id, { trangThai: "xong" })),
  "chua-du-dieu-kien-xong");
  const ctLoi = (loiXong?.chiTiet ?? { loi: [] }) as KetQuaKiemTra;
  const maLoi = ctLoi.loi.map((l) => l.ma).sort();
  dat("Lỗi nêu đủ 3 vấn đề một lần", JSON.stringify(maLoi) === JSON.stringify(["muc-kiem-tra-chua-xong", "thieu-danh-gia", "thieu-ket-qua"]), maLoi.join(","));
  const sauLoi = await chu.task.findUniqueOrThrow({ where: { id: viec.id } });
  dat("Bị chặn thì trạng thái không đổi (giao dịch cuộn lại)", sauLoi.status === "mo" && sauLoi.completedAt === null);

  const xemTruoc = await voi(T, nvA, (nc) => kiemTraViec(nc, viec.id, { ketQua: KET_QUA, danhGia: "dat" }));
  dat("Xem trước: còn đúng lỗi mục kiểm tra", xemTruoc.loi.map((l) => l.ma).join() === "muc-kiem-tra-chua-xong");
  dat("Xem trước: cảnh báo hồ sơ khách thiếu mã số thuế + người liên hệ", xemTruoc.canhBao.some((c) => c.ma === "ho-so-khach-thieu" && /mã số thuế/.test(c.thongBao) && /người liên hệ/.test(c.thongBao)));

  await nemLoi("Ghi kết quả mà không chọn đánh giá bị chặn", "dinh-dang", () =>
    voi(T, nvA, (nc) => suaViec(nc, viec.id, { ketQua: KET_QUA })),
  );
  await nemLoi("Kết quả quá ngắn bị chặn", "nghiep-vu", () => voi(T, nvA, (nc) => suaViec(nc, viec.id, { ketQua: "ok", danhGia: "dat" })), "thieu-ket-qua");

  // ------------------------------------------------------------------
  console.log("\n— CV-07: danh sách kiểm tra —");
  const ct = await voi(T, nvA, (nc) => chiTietViec(nc, viec.id));
  dat("Chi tiết việc trả 3 mục theo đúng thứ tự lập", ct.mucKiemTra.map((m) => m.nhan).join("|") === "Chụp ảnh vị trí lắp|Đo khoảng cách đi dây|Gửi ảnh vào nhóm Zalo");
  dat("Chi tiết việc báo chưa xong được", ct.kiemTra.duocXong === false);
  const [m1, m2] = ct.mucKiemTra;
  await nemLoi("NV B (ngoài phạm vi) không tích được mục của việc A", "khong-thay", () => voi(T, nvB, (nc) => tichMucKiemTra(nc, m1.id, { daTich: true })));
  await voi(T, nvA, (nc) => tichMucKiemTra(nc, m1.id, { daTich: true }));
  await voi(T, nvA, (nc) => tichMucKiemTra(nc, m2.id, { daTich: true }));
  const m1Db = await chu.taskChecklistItem.findUniqueOrThrow({ where: { id: m1.id } });
  dat("Tích mục ghi người tích và lúc tích", m1Db.doneBy === nvA && m1Db.doneAt !== null);
  await voi(T, nvA, (nc) => tichMucKiemTra(nc, m2.id, { daTich: false }));
  dat("Bỏ tích xóa cả người tích", (await chu.taskChecklistItem.findUniqueOrThrow({ where: { id: m2.id } })).doneBy === null);
  await voi(T, nvA, (nc) => tichMucKiemTra(nc, m2.id, { daTich: true }));
  const mThem = await voi(T, nvA, (nc) => themMucKiemTra(nc, viec.id, { nhan: "Ghi chú độ cao trần", batBuoc: true }));
  await voi(T, nvA, (nc) => goMucKiemTra(nc, mThem.id));
  const mGo = await chu.taskChecklistItem.findUniqueOrThrow({ where: { id: mThem.id } });
  dat("Gỡ mục là xóa mềm, còn dòng trong CSDL", mGo.removedAt !== null && mGo.removedBy === nvA);
  await nemLoi("Mục đã gỡ không tích được nữa", "khong-thay", () => voi(T, nvA, (nc) => tichMucKiemTra(nc, mThem.id, { daTich: true })));

  // ------------------------------------------------------------------
  console.log("\n— CV-04: lưu kết quả, báo người giao —");
  const xong = await voi(T, nvA, (nc) => suaViec(nc, viec.id, { trangThai: "xong", ketQua: KET_QUA, danhGia: "dat" }));
  dat("Xong khi đủ điều kiện", xong.trangThai === "xong" && xong.xongLuc !== null);
  dat("Kết quả, đánh giá, người ghi được lưu", xong.ketQua === KET_QUA && xong.danhGia === "dat" && xong.nguoiGhiKetQua?.id === nvA && xong.ketQuaLuc !== null);
  const tbXong = await thongBao(tp, "viec-da-xong", viec.id);
  dat("Người giao (Trưởng phòng) nhận thông báo việc đã xong", tbXong.length === 1, `có ${tbXong.length}`);
  dat("Thông báo xong chứa kết quả", (tbXong[0]?.body ?? "").includes("khảo sát văn phòng"));
  dat("Người làm không tự nhận thông báo xong", (await thongBao(nvA, "viec-da-xong")).length === 0);

  const k360 = await voi(T, nvA, (nc) => khach360(nc, khach.id));
  const dongXong = k360.dongThoiGian.find((d) => d.loai === "viec-xong");
  dat("Dòng thời gian khách hiện kết quả công việc", !!dongXong && dongXong.moTa === KET_QUA && /\(Đạt\)/.test(dongXong.tieuDe));
  dat("Danh sách việc trên hồ sơ khách mang kết quả", k360.viec.some((v) => v.id === viec.id && v.ketQua === KET_QUA));

  await nemLoi("Việc đã xong thì danh sách kiểm tra khóa", "nghiep-vu", () => voi(T, nvA, (nc) => themMucKiemTra(nc, viec.id, { nhan: "Thêm sau", batBuoc: true })), "viec-da-khoa");
  await nemLoi("Việc đã xong thì không tích/bỏ tích được", "nghiep-vu", () => voi(T, nvA, (nc) => tichMucKiemTra(nc, m1.id, { daTich: false })), "viec-da-khoa");

  // Sửa kết quả sau khi xong vẫn được (ghi nhật ký), nhưng không xóa trắng.
  await voi(T, nvA, (nc) => suaViec(nc, viec.id, { ketQua: `${KET_QUA} Đã gửi báo giá sơ bộ.`, danhGia: "dat" }));
  const nk = await chu.auditLog.findFirst({ where: { tenantId: T, objectType: "task", objectId: viec.id, action: "sua" }, orderBy: { createdAt: "desc" } });
  dat("Sửa kết quả ghi nhật ký có bản trước", JSON.stringify(nk?.before ?? {}).includes("khảo sát văn phòng"));
  await nemLoi("Xóa trắng kết quả của việc đã xong bị chặn", "dinh-dang", () => voi(T, nvA, (nc) => suaViec(nc, viec.id, { ketQua: null })));

  // Mở lại rồi xong lại: thông báo xong mới (lần hoàn thành khác).
  await voi(T, nvA, (nc) => suaViec(nc, viec.id, { trangThai: "dang-lam" }));
  const moLai = await chu.task.findUniqueOrThrow({ where: { id: viec.id } });
  dat("Mở lại giữ kết quả cũ, xóa mốc xong", moLai.completedAt === null && moLai.result !== null);
  await voi(T, nvA, (nc) => suaViec(nc, viec.id, { trangThai: "xong" }));
  dat("Xong lại bằng kết quả đã có", (await chu.task.findUniqueOrThrow({ where: { id: viec.id } })).status === "xong");
  dat("Lần hoàn thành thứ hai báo thêm một lần", (await thongBao(tp, "viec-da-xong", viec.id)).length === 2);

  // ------------------------------------------------------------------
  console.log("\n— CV-09: 'Cần làm tiếp' phải hẹn việc tiếp theo —");
  const viec2 = await voi(T, tp, (nc) =>
    taoViec(nc, { tieuDe: "Gửi báo giá camera", moTa: null, nguoiPhuTrachId: nvA, uuTien: "trung-binh", han: null, khachHangId: khach.id, leadId: null, coHoiId: null }),
  );
  await nemLoi("'Cần làm tiếp' mà không hẹn việc tiếp theo bị chặn", "nghiep-vu", () =>
    voi(T, nvA, (nc) => suaViec(nc, viec2.id, { trangThai: "xong", ketQua: "Khách cần thêm thời gian so sánh giá.", danhGia: "can-theo-doi" })),
  "chua-du-dieu-kien-xong");
  const hanTiep = new Date(Date.now() + 3 * 86400000);
  const xong2 = await voi(T, nvA, (nc) =>
    suaViec(nc, viec2.id, {
      trangThai: "xong",
      ketQua: "Khách cần thêm thời gian so sánh giá.",
      danhGia: "can-theo-doi",
      viecTiepTheo: { tieuDe: "Gọi lại chốt báo giá camera", han: hanTiep },
    }),
  );
  const tiep = xong2.viecTiepTheo;
  dat("Việc tiếp theo được tạo cùng lúc", !!tiep && tiep.tieuDe === "Gọi lại chốt báo giá camera");
  dat("Việc tiếp theo cùng người làm và cùng khách", tiep?.nguoiPhuTrach.id === nvA && tiep?.khachHang?.id === khach.id);
  dat("Việc tiếp theo đúng hạn hẹn", tiep?.han?.getTime() === hanTiep.getTime());
  dat("Việc tiếp theo mang kết quả lần trước trong ghi chú", (tiep?.moTa ?? "").includes("so sánh giá"));
  await nemLoi("Hẹn việc tiếp theo ngoài lúc đánh dấu xong bị chặn", "nghiep-vu", () =>
    voi(T, nvA, (nc) => suaViec(nc, tuGiao.id, { viecTiepTheo: { tieuDe: "Không hợp lệ", han: null } })),
  "viec-tiep-theo-sai-luc");

  // ------------------------------------------------------------------
  console.log("\n— CV-08: chuyển người phụ trách —");
  const viec3 = await voi(T, tp, (nc) =>
    taoViec(nc, { tieuDe: "Bảo trì máy in định kỳ", moTa: null, nguoiPhuTrachId: nvA, uuTien: "khan", han: null, khachHangId: null, leadId: null, coHoiId: null }),
  );
  dat("Việc Khẩn thì thông báo mức khẩn", (await thongBao(nvA, "viec-duoc-giao", viec3.id))[0]?.severity === "khan");
  await nemLoi("NV A (phạm vi của mình) không tự chuyển việc sang B", "nghiep-vu", () => voi(T, nvA, (nc) => suaViec(nc, viec3.id, { nguoiPhuTrachId: nvB })), "ngoai-pham-vi");
  const chuyen = await voi(T, tp, (nc) => suaViec(nc, viec3.id, { nguoiPhuTrachId: nvB }));
  dat("Chuyển việc ghi người giao mới", chuyen.nguoiPhuTrach.id === nvB && chuyen.nguoiGiao?.id === tp);
  const tbB = await thongBao(nvB, "viec-duoc-giao", viec3.id);
  dat("NV B nhận thông báo 'Được chuyển việc'", tbB.length === 1 && tbB[0].title.startsWith("Được chuyển việc"));
  dat("NV A nhận thông báo việc đã chuyển đi", (await thongBao(nvA, "viec-chuyen-di", viec3.id)).length === 1);
  await voi(T, tp, (nc) => suaViec(nc, viec3.id, { nguoiPhuTrachId: nvA }));
  await voi(T, tp, (nc) => suaViec(nc, viec3.id, { nguoiPhuTrachId: nvB }));
  dat("Giao lại cho cùng người ở lần sau vẫn báo (không bị chống trùng nhầm)", (await thongBao(nvB, "viec-duoc-giao", viec3.id)).length === 2);
  const sk = await chu.businessEvent.count({ where: { tenantId: T, eventType: "TASK_ASSIGNED", objectId: viec3.id } });
  dat("Mỗi lần giao/chuyển ghi sự kiện TASK_ASSIGNED", sk === 4, `có ${sk}`);

  // ------------------------------------------------------------------
  console.log("\n— Việc cũ (trước 0.17) đã xong mà chưa có kết quả —");
  const cu = await voi(T, nvA, (nc) =>
    taoViec(nc, { tieuDe: "Việc cũ đã xong", moTa: null, nguoiPhuTrachId: null, uuTien: "thap", han: null, khachHangId: khach.id, leadId: null, coHoiId: null }),
  );
  await chu.task.update({ where: { id: cu.id }, data: { status: "xong", completedAt: new Date() } });
  await nemLoi("Sửa thứ khác trên việc cũ chưa có kết quả bị chặn", "nghiep-vu", () => voi(T, nvA, (nc) => suaViec(nc, cu.id, { tieuDe: "Đổi tên" })), "thieu-ket-qua");
  await voi(T, nvA, (nc) => suaViec(nc, cu.id, { ketQua: "Bổ sung kết quả cho việc cũ đã làm.", danhGia: "mot-phan" }));
  dat("Ghi bổ sung kết quả cho việc cũ được", (await chu.task.findUniqueOrThrow({ where: { id: cu.id } })).outcome === "mot-phan");
  const cu2 = await voi(T, nvA, (nc) =>
    taoViec(nc, { tieuDe: "Việc cũ thứ hai", moTa: null, nguoiPhuTrachId: null, uuTien: "thap", han: null, khachHangId: null, leadId: null, coHoiId: null }),
  );
  await chu.task.update({ where: { id: cu2.id }, data: { status: "xong", completedAt: new Date() } });
  await voi(T, nvA, (nc) => suaViec(nc, cu2.id, { trangThai: "mo" }));
  dat("Mở lại việc cũ chưa có kết quả được", (await chu.task.findUniqueOrThrow({ where: { id: cu2.id } })).status === "mo");
  // Đổi khách hàng loạt (như chuyển đổi lead / gộp khách) trên việc cũ không bị CSDL chặn (QĐ-91).
  const capNhat = await chu.task.updateMany({ where: { id: { in: [cu.id] } }, data: { updatedAt: new Date() } });
  dat("Cập nhật hàng loạt việc đã xong vẫn chạy ở tầng CSDL", capNhat.count === 1);

  // ------------------------------------------------------------------
  console.log("\n— CV-10: đính kèm vào công việc —");
  const tep = await voi(T, nvA, (nc) => dinhKemTep(nc, { loai: "task", doiTuongId: viec2.id, tenTep: "bien-ban-khao-sat.pdf", noiDung: PDF, ghiChu: null }));
  dat("Người làm đính kèm được vào việc của mình", !!tep);
  const dsTep = await voi(T, tp, (nc) => danhSachDinhKem(nc, "task", viec2.id));
  dat("Trưởng phòng (phạm vi nhóm) thấy tệp", dsTep.tep.length === 1);
  await nemLoi("NV B không thấy tệp của việc A", "khong-thay", () => voi(T, nvB, (nc) => danhSachDinhKem(nc, "task", viec2.id)));

  // ------------------------------------------------------------------
  console.log("\n— HS-01 → HS-03: hồ sơ khách đầy đủ —");
  const hs1 = (await voi(T, nvA, (nc) => khach360(nc, khach.id))).hoSo;
  dat("Hồ sơ mới: thiếu bắt buộc mã số thuế + người liên hệ", hs1.mucDo === "thieu-bat-buoc" && hs1.thieuBatBuoc.join() === "mã số thuế,người liên hệ", hs1.thieuBatBuoc.join());
  await voi(T, nvA, (nc) => suaKhachHang(nc, khach.id, { maSoThue: MST, xacNhanKhongTrung: false }));
  await voi(T, nvA, (nc) => taoLienHe(nc, khach.id, { hoTen: "Anh Minh", email: "minh@binhminh.vn", laChinh: true, chucDanh: null, phongBan: null, dienThoai: null, zalo: null, ngaySinh: null, ghiChu: null }));
  const hs2 = (await voi(T, nvA, (nc) => khach360(nc, khach.id))).hoSo;
  dat("Bổ sung xong thì hết thiếu bắt buộc, điểm tăng", hs2.thieuBatBuoc.length === 0 && hs2.diem > hs1.diem, `${hs1.diem} → ${hs2.diem}`);
  const kt2 = await voi(T, nvA, (nc) => kiemTraViec(nc, tuGiao.id, { ketQua: KET_QUA, danhGia: "dat" }));
  dat("Việc không gắn khách thì không có cảnh báo hồ sơ", !kt2.canhBao.some((c) => c.ma === "ho-so-khach-thieu"));

  // ------------------------------------------------------------------
  console.log("\n— Ràng buộc CSDL —");
  const thuLoi = async (ten: string, khoi: () => Promise<unknown>) => {
    try {
      await khoi();
      dat(ten, false, "CSDL không chặn");
    } catch {
      dat(ten, true);
    }
  };
  await thuLoi("CHECK: đánh giá lạ bị CSDL chặn", () => chu.task.update({ where: { id: tuGiao.id }, data: { result: "Kết quả đủ dài.", outcome: "tuyet-voi", resultAt: new Date() } }));
  await thuLoi("CHECK: có kết quả mà không có đánh giá bị CSDL chặn", () => chu.task.update({ where: { id: tuGiao.id }, data: { result: "Kết quả đủ dài.", resultAt: new Date() } }));
  await thuLoi("CHECK: tích mục mà không ghi người tích bị CSDL chặn", () => chu.taskChecklistItem.update({ where: { id: m1.id }, data: { doneBy: null } }));
  await thuLoi("CHECK: đính kèm vào loại đối tượng lạ vẫn bị chặn", () =>
    chu.attachment.create({ data: { tenantId: T, objectType: "bang_luong", objectId: viec.id, fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: "0".repeat(64), storedPath: `x-${DAU}`, uploadedBy: nvA } as never }),
  );
  const rls = await chu.$queryRawUnsafe<{ relrowsecurity: boolean }[]>(`SELECT relrowsecurity FROM pg_class WHERE relname = 'task_checklist_items'`);
  dat("RLS bật cho task_checklist_items", rls[0]?.relrowsecurity === true);

  // Cách ly doanh nghiệp: doanh nghiệp khác không thấy mục kiểm tra.
  const tenant2 = await seedNenMong(chu, `thu-cv2-${DAU}`, "Doanh nghiệp thử công việc 2");
  const dem2 = await voiTenant(tenant2.id, (tx) => tx.taskChecklistItem.count({ where: { taskId: viec.id } }));
  dat("Doanh nghiệp khác không đọc được mục kiểm tra", dem2 === 0);

  await chu.$disconnect();
  ketLuan("Công việc thông suốt");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
