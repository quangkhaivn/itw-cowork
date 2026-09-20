import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { chiTietBaoGia } from "../src/modules/bao-gia/service";
import {
  chiTietHoiThoai,
  danhSachHoiThoai,
  dongHoiThoai,
  hoiDap,
  trangThaiTroLy,
} from "../src/modules/tro-ly/service";
import { duyetDeXuat, tuChoiDeXuat } from "../src/modules/tro-ly/de-xuat";
import { datNhaCungCapThu, type DauVaoGoi, type NhaCungCapAI, type PhanHoiAI } from "../src/modules/tro-ly/nha-cung-cap";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng Trợ lý ITA (Phase 9) trên CSDL THẬT.
 * Luật: BUSINESS_RULES.md mục 15 (AI).
 *
 * Mô hình được thay bằng **nhà cung cấp kịch bản**: nó trả về đúng chuỗi khối đã dựng
 * sẵn. Nhờ vậy bài thử kiểm được toàn bộ vòng lặp, kiểm quyền, ghi nhật ký và luồng
 * duyệt một cách tất định, không phụ thuộc mạng và không tốn tiền gọi mô hình.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-tro-ly"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "dinh-dang" ? e instanceof LoiDinhDang
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

/** Nhà cung cấp kịch bản: trả lần lượt các phản hồi đã dựng sẵn. */
function taoNhaCungCapKichBan(kichBan: PhanHoiAI[]): NhaCungCapAI & { daGoi: DauVaoGoi[] } {
  const daGoi: DauVaoGoi[] = [];
  let i = 0;
  return {
    ten: "kich-ban",
    model: "kich-ban-thu",
    daGoi,
    async goi(dauVao) {
      daGoi.push(dauVao);
      const ph = kichBan[Math.min(i, kichBan.length - 1)];
      i += 1;
      return ph;
    },
  };
}

const vanBan = (s: string): PhanHoiAI => ({
  khoi: [{ loai: "van-ban", noiDung: s }],
  doiCongCu: false,
  tokensIn: 100,
  tokensOut: 50,
  model: "kich-ban-thu",
});

const goiCongCu = (ten: string, thamSo: Record<string, unknown>, id = `goi-${ten}`): PhanHoiAI => ({
  khoi: [{ loai: "goi-cong-cu", id, ten, thamSo }],
  doiCongCu: true,
  tokensIn: 100,
  tokensOut: 30,
  model: "kich-ban-thu",
});

async function main() {
  console.log("=== Thử Trợ lý ITA (Phase 9) ===\n");
  const tenant = await seedNenMong(chu, `thu-ai-${DAU}`, "Doanh nghiệp thử trợ lý");
  const T = tenant.id;

  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const nguoi = async (ten: string, vai: string, quanLyId?: string) =>
    (
      await chu.user.create({
        data: {
          tenantId: T,
          email: `${ten}.${DAU}@thu.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
          staffProfile: { create: { tenantId: T, managerId: quanLyId ?? null } },
        },
      })
    ).id;

  const gd = await nguoi("giam-doc", "ceo");
  const tpKd = await nguoi("truong-phong-kinh-doanh", "sales-manager");
  const nvA = await nguoi("nhan-vien-a", "sales", tpKd);
  const nvB = await nguoi("nhan-vien-b", "sales", tpKd);
  const thuKho = await nguoi("thu-kho", "warehouse");
  console.log("");

  // Nền: mỗi nhân viên một khách riêng — để thử ranh giới phạm vi.
  const khachA = await voi(T, nvA, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Của A ${DAU}`, dienThoai: "0909 111 111" })),
  );
  const khachB = await voi(T, nvB, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Doanh nghiệp Phía B ${DAU}`, dienThoai: "0909 222 222", xacNhanKhongTrung: true })),
  );
  const sanPham = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `AI-${DAU}`, ten: "Laptop thử trợ lý", giaBan: "20000000", giaVon: "17000000", donViTinh: "cai" })),
  );

  // ------------------------------------------------------------------
  console.log("— AI-06: chưa cấu hình nhà cung cấp thì TỪ CHỐI, không bịa —");

  datNhaCungCapThu(null);
  const khoaCu = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const tt = await voi(T, nvA, (nc) => trangThaiTroLy(nc));
  dat("Trạng thái nói rõ chưa cấu hình và thiếu gì", tt.daCauHinh === false && /ANTHROPIC_API_KEY/.test(tt.lyDo), tt.lyDo);
  await nemLoi(
    "AI-06: hỏi khi chưa cấu hình bị chặn, không sinh câu trả lời",
    "nghiep-vu",
    () => voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: "Khách nào nợ nhiều nhất?" })),
    "ai-chua-cau-hinh",
  );
  dat("Không tạo hội thoại rỗng khi bị chặn", (await chu.aiConversation.count({ where: { tenantId: T } })) === 0);
  if (khoaCu !== undefined) process.env.ANTHROPIC_API_KEY = khoaCu;

  // ------------------------------------------------------------------
  console.log("\n— Vòng lặp: mô hình gọi công cụ rồi trả lời —");

  const kb1 = taoNhaCungCapKichBan([
    goiCongCu("tim_khach_hang", { tuKhoa: `Của A ${DAU}` }),
    vanBan("Tôi tìm thấy 1 khách khớp."),
  ]);
  datNhaCungCapThu(kb1);

  const luot1 = await voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: `Tìm giúp tôi khách Của A ${DAU}` }));
  dat("Trả lời lấy từ khối văn bản của mô hình", luot1.traLoi === "Tôi tìm thấy 1 khách khớp.", luot1.traLoi);
  dat("Chạy 2 vòng: một vòng gọi công cụ, một vòng trả lời", luot1.soVong === 2, String(luot1.soVong));
  dat("Ghi lại đúng công cụ đã gọi", luot1.congCuDaGoi.length === 1 && luot1.congCuDaGoi[0].ten === "tim_khach_hang" && luot1.congCuDaGoi[0].ketCuc === "ok", JSON.stringify(luot1.congCuDaGoi));
  dat("Không vượt trần", luot1.vuotTran === false);

  const lichSu = kb1.daGoi;
  dat("Lời nhắc hệ thống có tên người hỏi", /nhan-vien-a/.test(lichSu[0].heThong));
  dat("Lời nhắc hệ thống cấm bịa số liệu", /không nhớ ra, không suy ra/.test(lichSu[0].heThong));
  dat("Vòng hai nhận lại kết quả công cụ", lichSu[1].tinNhan.some((t) => t.vaiTro === "ket-qua-cong-cu"));
  dat(
    "Kết quả công cụ đưa cho mô hình có tên khách đúng",
    lichSu[1].tinNhan.some((t) => t.vaiTro === "ket-qua-cong-cu" && String(t.noiDung).includes(khachA.ma)),
  );

  const ct1 = await voi(T, nvA, (nc) => chiTietHoiThoai(nc, luot1.hoiThoaiId));
  dat("Hội thoại lưu đủ câu hỏi và câu trả lời", ct1.tinNhan.length === 2 && ct1.tinNhan[0].vaiTro === "nguoi-dung");
  dat("AI-05: lần gọi công cụ được ghi lại kèm kết cục", ct1.tinNhan[1].congCu.length === 1 && ct1.tinNhan[1].congCu[0].ketCuc === "ok");
  dat("Tên hội thoại lấy từ câu hỏi đầu", /Tìm giúp tôi khách/.test(ct1.hoiThoai.tieuDe), ct1.hoiThoai.tieuDe);

  const soGoi = await chu.aiToolCall.count({ where: { tenantId: T } });
  dat("Bảng ai_tool_calls có đúng một dòng", soGoi === 1, String(soGoi));

  // ------------------------------------------------------------------
  console.log("\n— AI-01: công cụ chạy bằng quyền của NGƯỜI HỎI —");

  const kb2 = taoNhaCungCapKichBan([
    goiCongCu("tim_khach_hang", { tuKhoa: `Phía B ${DAU}` }),
    vanBan("Đã tra xong."),
  ]);
  datNhaCungCapThu(kb2);
  await voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: `Khách Phía B ${DAU} thế nào?` }));
  const ketQuaB = kb2.daGoi[1].tinNhan.find((t) => t.vaiTro === "ket-qua-cong-cu");
  dat(
    "AI-01: nhân viên A hỏi về khách của B thì công cụ trả RỖNG",
    Boolean(ketQuaB) && !String(ketQuaB!.noiDung).includes(khachB.ma),
    String(ketQuaB?.noiDung).slice(0, 120),
  );

  const kb3 = taoNhaCungCapKichBan([
    goiCongCu("tim_khach_hang", { tuKhoa: `Phía B ${DAU}` }),
    vanBan("Đã tra xong."),
  ]);
  datNhaCungCapThu(kb3);
  await voi(T, gd, (nc) => hoiDap(nc, { cauHoi: `Khách Phía B ${DAU} thế nào?` }));
  const ketQuaGd = kb3.daGoi[1].tinNhan.find((t) => t.vaiTro === "ket-qua-cong-cu");
  dat("Giám đốc phạm vi toàn công ty thì thấy khách của B", String(ketQuaGd?.noiDung).includes(khachB.ma));

  // ------------------------------------------------------------------
  console.log("\n— AI-01: thiếu quyền thì báo cho mô hình, không lặng lẽ trả rỗng —");

  const kb4 = taoNhaCungCapKichBan([
    goiCongCu("cong_no_phai_thu", {}),
    vanBan("Tôi không tra được công nợ."),
  ]);
  datNhaCungCapThu(kb4);
  const luot4 = await voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: "Công nợ đang bao nhiêu?" }));
  dat("Gọi công cụ ngoài quyền bị chặn", luot4.congCuDaGoi[0]?.ketCuc === "thieu-quyen", JSON.stringify(luot4.congCuDaGoi));
  const baoThieu = kb4.daGoi[1].tinNhan.find((t) => t.vaiTro === "ket-qua-cong-cu");
  dat("Mô hình nhận câu KHÔNG CÓ QUYỀN kèm lời dặn đừng đoán", /KHÔNG CÓ QUYỀN/.test(String(baoThieu?.noiDung)) && /đừng đoán/i.test(String(baoThieu?.noiDung)));
  dat("Lần gọi hỏng vẫn được ghi kèm lỗi", (await chu.aiToolCall.count({ where: { tenantId: T, outcome: "thieu-quyen" } })) === 1);

  const soCongCuNv = (await voi(T, nvA, (nc) => trangThaiTroLy(nc))).soCongCuKhaDung;
  const soCongCuGd = (await voi(T, gd, (nc) => trangThaiTroLy(nc))).soCongCuKhaDung;
  dat("Giám đốc có nhiều công cụ hơn nhân viên", soCongCuGd > soCongCuNv, `${soCongCuGd} > ${soCongCuNv}`);
  const congCuKho = (await voi(T, thuKho, (nc) => trangThaiTroLy(nc))).congCu.map((c) => c.ten);
  dat("Thủ kho có công cụ tồn kho, không có công cụ báo giá", congCuKho.includes("ton_kho") && !congCuKho.includes("tim_bao_gia"), congCuKho.join(","));

  // ------------------------------------------------------------------
  console.log("\n— Công cụ lạ và tham số sai —");

  const kb5 = taoNhaCungCapKichBan([
    goiCongCu("cong_cu_khong_co_that", {}),
    goiCongCu("tim_khach_hang", { tuKhoa: "" }),
    vanBan("Tôi gọi nhầm công cụ."),
  ]);
  datNhaCungCapThu(kb5);
  const luot5 = await voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: "Thử công cụ lạ" }));
  dat("Công cụ không có thật bị bắt là tham số sai, không làm sập lượt", luot5.congCuDaGoi[0]?.ketCuc === "tham-so-sai");
  dat("Tham số rỗng bị lược đồ Zod chặn", luot5.congCuDaGoi[1]?.ketCuc === "tham-so-sai", JSON.stringify(luot5.congCuDaGoi));
  dat("Lượt vẫn kết thúc bằng câu trả lời", luot5.traLoi === "Tôi gọi nhầm công cụ.");

  // ------------------------------------------------------------------
  console.log("\n— AI-05: trần vòng lặp —");

  const kbVongLap = taoNhaCungCapKichBan([goiCongCu("tim_khach_hang", { tuKhoa: "a" })]);
  datNhaCungCapThu(kbVongLap);
  const luotTran = await voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: "Câu hỏi làm mô hình gọi mãi" }));
  dat("AI-05: chạm trần thì dừng", luotTran.vuotTran === true && luotTran.soVong === 6, String(luotTran.soVong));
  dat("AI-05: nói thật là đã dừng giữa chừng, không ghép câu giả vờ đã xong", /dừng ở đây thay vì đoán/.test(luotTran.traLoi));

  // ------------------------------------------------------------------
  console.log("\n— AI-02 và AI-03: trợ lý chỉ ĐỀ XUẤT, người bấm mới chạy —");

  const kbDx = taoNhaCungCapKichBan([
    goiCongCu("de_xuat_hanh_dong", {
      loai: "tao-nhap-bao-gia",
      thamSo: {
        khachHangId: khachA.id,
        dong: [{ sanPhamId: sanPham.id, ten: "Laptop thử trợ lý", soLuong: "2", donGia: "20000000", giaVon: "17000000", vat: 10 }],
      },
    }),
    vanBan("Tôi đã đặt đề xuất, bạn bấm Đồng ý nhé."),
  ]);
  datNhaCungCapThu(kbDx);
  const luotDx = await voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: "Dựng báo giá 2 laptop cho khách Của A" }));
  dat("Công cụ đề xuất chạy được", luotDx.congCuDaGoi[0]?.ketCuc === "ok", JSON.stringify(luotDx.congCuDaGoi));

  const ctDx = await voi(T, nvA, (nc) => chiTietHoiThoai(nc, luotDx.hoiThoaiId));
  dat("AI-02: sinh đúng một đề xuất ở trạng thái chờ", ctDx.deXuat.length === 1 && ctDx.deXuat[0].trangThai === "de-xuat");
  dat("Tóm tắt đề xuất đọc được", /1 dòng hàng/.test(ctDx.deXuat[0].tomTat), ctDx.deXuat[0].tomTat);
  dat("AI-03: chưa duyệt thì CHƯA có báo giá nào", (await chu.quotation.count({ where: { tenantId: T } })) === 0);
  const deXuatId = ctDx.deXuat[0].id;

  await nemLoi("Người khác không thấy đề xuất của A", "khong-thay", () => voi(T, nvB, (nc) => duyetDeXuat(nc, deXuatId)));

  const duyet = await voi(T, nvA, (nc) => duyetDeXuat(nc, deXuatId));
  dat("AI-03: bấm Đồng ý thì báo giá mới được tạo", duyet.trangThai === "da-chay" && duyet.doiTuong === "quotation", JSON.stringify(duyet));
  const bg = await voi(T, nvA, (nc) => chiTietBaoGia(nc, duyet.doiTuongId!));
  dat("Báo giá sinh ra ở trạng thái NHÁP", bg.baoGia.trangThai === "DRAFT", bg.baoGia.trangThai);
  dat("Báo giá chép đúng dòng hàng và số tiền (2 × 20tr + VAT)", bg.baoGia.phienBanHienHanh!.dong.length === 1 && bg.baoGia.phienBanHienHanh!.tongCong === "44000000", bg.baoGia.phienBanHienHanh!.tongCong);
  dat("Người phụ trách báo giá là NGƯỜI BẤM, không phải trợ lý", bg.baoGia.nguoiPhuTrach.id === nvA);

  const dongDaChay = await chu.aiAction.findFirst({ where: { id: deXuatId }, select: { approvedBy: true, approvedAt: true, status: true } });
  dat("AI-03: dòng đề xuất ghi lại ai duyệt và lúc nào", dongDaChay?.status === "da-chay" && dongDaChay.approvedBy === nvA && dongDaChay.approvedAt !== null);
  await nemLoi("Duyệt lại một đề xuất đã chạy bị chặn", "nghiep-vu", () => voi(T, nvA, (nc) => duyetDeXuat(nc, deXuatId)), "da-xu-ly");

  // Chốt chặn cuối ở tầng CSDL.
  let csdlChan = false;
  try {
    await chu.aiAction.update({ where: { id: deXuatId }, data: { status: "da-chay", approvedBy: null, approvedAt: null } });
  } catch {
    csdlChan = true;
  }
  dat("AI-03: CSDL chặn dòng 'đã chạy' mà không có người duyệt", csdlChan);

  // Từ chối một đề xuất khác.
  const kbDx2 = taoNhaCungCapKichBan([
    goiCongCu("de_xuat_hanh_dong", { loai: "tao-viec", thamSo: { tieuDe: `Gọi lại khách ${DAU}` } }),
    vanBan("Đã đặt đề xuất."),
  ]);
  datNhaCungCapThu(kbDx2);
  const luotDx2 = await voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: "Nhắc tôi gọi lại khách" }));
  const ctDx2 = await voi(T, nvA, (nc) => chiTietHoiThoai(nc, luotDx2.hoiThoaiId));
  const dx2 = ctDx2.deXuat[0].id;
  const { LuocDoTuChoiDeXuat } = await import("../src/modules/tro-ly/luoc-do");
  dat("Từ chối mà không ghi lý do bị lược đồ chặn", LuocDoTuChoiDeXuat.safeParse({ lyDo: "" }).success === false);
  await voi(T, nvA, (nc) => tuChoiDeXuat(nc, dx2, "Tôi tự nhớ được"));
  const ctDx3 = await voi(T, nvA, (nc) => chiTietHoiThoai(nc, luotDx2.hoiThoaiId));
  dat("Từ chối giữ lại lý do", ctDx3.deXuat[0].trangThai === "tu-choi" && ctDx3.deXuat[0].lyDoTuChoi === "Tôi tự nhớ được");
  dat("Từ chối rồi thì KHÔNG có việc nào được tạo", (await chu.task.count({ where: { tenantId: T, title: { contains: DAU } } })) === 0);

  // Thủ kho không có quyền tạo báo giá → không được mời công cụ đề xuất loại đó.
  const kbKho = taoNhaCungCapKichBan([vanBan("Chào anh.")]);
  datNhaCungCapThu(kbKho);
  await voi(T, thuKho, (nc) => hoiDap(nc, { cauHoi: "Chào trợ lý" }));
  const congCuKhoDaMoi = kbKho.daGoi[0].congCu;
  const dxKho = congCuKhoDaMoi.find((c) => c.ten === "de_xuat_hanh_dong");
  dat("Thủ kho có quyền tạo việc nên vẫn được mời công cụ đề xuất", Boolean(dxKho));
  dat(
    "Đề xuất chỉ mời đúng loại hành động người đó có quyền: có tạo việc, KHÔNG có tạo báo giá",
    Boolean(dxKho) && dxKho!.moTa.includes("tao-viec") && !dxKho!.moTa.includes("tao-nhap-bao-gia"),
    dxKho?.moTa ?? "",
  );
  dat("Thủ kho không được mời công cụ đọc báo giá", !congCuKhoDaMoi.some((c) => c.ten === "tim_bao_gia"));

  // ------------------------------------------------------------------
  console.log("\n— AI-04: hội thoại là của riêng người hỏi —");

  const dsA = await voi(T, nvA, (nc) => danhSachHoiThoai(nc));
  const dsB = await voi(T, nvB, (nc) => danhSachHoiThoai(nc));
  dat("Nhân viên A thấy hội thoại của mình", dsA.length >= 5, String(dsA.length));
  dat("AI-04: nhân viên B không thấy hội thoại của A", dsB.length === 0, String(dsB.length));
  await nemLoi("AI-04: B không mở được hội thoại của A", "khong-thay", () => voi(T, nvB, (nc) => chiTietHoiThoai(nc, luot1.hoiThoaiId)));
  await nemLoi("Giám đốc cũng KHÔNG đọc được hội thoại riêng của nhân viên", "khong-thay", () => voi(T, gd, (nc) => chiTietHoiThoai(nc, luot1.hoiThoaiId)));

  const dong = await voi(T, nvA, (nc) => dongHoiThoai(nc, luot1.hoiThoaiId));
  dat("Đóng được hội thoại", dong.trangThai === "da-dong");
  datNhaCungCapThu(taoNhaCungCapKichBan([vanBan("x")]));
  await nemLoi("Hội thoại đã đóng thì không hỏi thêm", "nghiep-vu", () => voi(T, nvA, (nc) => hoiDap(nc, { hoiThoaiId: luot1.hoiThoaiId, cauHoi: "Thêm câu nữa" })), "hoi-thoai-da-dong");

  // ------------------------------------------------------------------
  console.log("\n— Lịch sử hỏi đáp là bằng chứng: chỉ ghi thêm —");

  const tinDau = await chu.aiMessage.findFirst({ where: { tenantId: T }, select: { id: true } });
  let chanSua = false;
  try {
    await chu.aiMessage.update({ where: { id: tinDau!.id }, data: { content: "sửa lại cho đẹp" } });
  } catch {
    chanSua = true;
  }
  dat("Trigger chặn SỬA tin nhắn đã ghi", chanSua);

  let chanXoa = false;
  try {
    await chu.aiToolCall.deleteMany({ where: { tenantId: T } });
  } catch {
    chanXoa = true;
  }
  dat("Trigger chặn XÓA lần gọi công cụ", chanXoa);

  // ------------------------------------------------------------------
  console.log("\n— Mô hình hỏng thì nói thật, không bịa —");

  datNhaCungCapThu({
    ten: "kich-ban",
    model: "hong",
    async goi() {
      throw new Error("mất kết nối tới nhà cung cấp");
    },
  });
  const luotHong = await voi(T, nvA, (nc) => hoiDap(nc, { cauHoi: "Doanh thu tháng này bao nhiêu?" }));
  dat("Gọi mô hình hỏng thì trả lời nói rõ chưa gọi được", /chưa gọi được mô hình/.test(luotHong.traLoi), luotHong.traLoi);
  dat("Câu trả lời KHÔNG chứa con số nào", !/\d/.test(luotHong.traLoi.replace(/[^\d]/g, "")) || !/\d{3,}/.test(luotHong.traLoi));
  const tinHong = await chu.aiMessage.findFirst({ where: { tenantId: T, error: { not: null } }, select: { error: true } });
  dat("Lỗi được ghi lại trên lượt trả lời", /mất kết nối/.test(tinHong?.error ?? ""), tinHong?.error ?? "");

  // ------------------------------------------------------------------
  console.log("\n— Cách ly giữa các doanh nghiệp —");

  const soHtT = await chu.aiConversation.count({ where: { tenantId: T } });
  const tenant2 = await seedNenMong(chu, `thu-ai2-${DAU}`, "Doanh nghiệp thử trợ lý 2");
  const soHtT2 = await chu.aiConversation.count({ where: { tenantId: tenant2.id } });
  dat("Hội thoại nằm đúng doanh nghiệp của nó", soHtT > 0 && soHtT2 === 0, `${soHtT} / ${soHtT2}`);

  datNhaCungCapThu(null);
  await ketLuan("Thử Trợ lý ITA");
}

main().catch((e) => {
  console.error("Bài thử gặp lỗi ngoài dự kiến:", e);
  process.exit(1);
});
