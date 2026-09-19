/**
 * Kiểm thử đơn vị phần logic thuần của Phase 2 — CRM. Không cần cơ sở dữ liệu.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { boDau, chuanHoaDienThoai, chuanHoaEmail, chuanHoaMaSoThue, chuanHoaTen } from "../../src/modules/crm/chuan-hoa";
import { LoiDinhDang } from "../../src/lib/loi";
import { dinhDangSoChungTu, KIEU_SO, namVN } from "../../src/lib/so-chung-tu";
import { CO_HOI_DANG_MO, GIAI_DOAN_CO_HOI, NHAN_GIAI_DOAN, XAC_SUAT_GOI_Y, laCoHoiDangMo, tinhPipeline, tyLeThang } from "../../src/modules/crm/hang-so";
import { dateVeNgay, homNayVN, ngayVeDate, soTien, thoiDiemTuyChon } from "../../src/modules/crm/chung";
import { LuocDoTaoCoHoi } from "../../src/modules/co-hoi/luoc-do";
import { LuocDoChuyenDoiLead } from "../../src/modules/lead/luoc-do";
import { VAI_TRO, kiemTraGioiHanAI } from "../../src/lib/vai-tro";

describe("Chuẩn hóa mã số thuế (KH-02)", () => {
  it("giữ chữ số, chấp nhận 10 và 13 số", () => {
    assert.equal(chuanHoaMaSoThue("0305.547.654"), "0305547654");
    assert.equal(chuanHoaMaSoThue(" 0305547654-001 "), "0305547654001");
  });
  it("trống → null", () => {
    assert.equal(chuanHoaMaSoThue(""), null);
    assert.equal(chuanHoaMaSoThue(null), null);
    assert.equal(chuanHoaMaSoThue("   "), null);
  });
  it("sai độ dài → LoiDinhDang gắn đúng trường", () => {
    assert.throws(() => chuanHoaMaSoThue("12345678"), (e: unknown) => e instanceof LoiDinhDang && e.truong === "maSoThue");
    assert.throws(() => chuanHoaMaSoThue("030554765400"), LoiDinhDang);
  });
});

describe("Chuẩn hóa điện thoại (KH-07)", () => {
  it("mọi cách viết cùng một số ra một khóa", () => {
    for (const s of ["0909123456", "0909 123 456", "0909.123.456", "+84 909 123 456", "84909123456", "0084909123456", "(+84) 909-123-456"]) {
      assert.equal(chuanHoaDienThoai(s), "0909123456", s);
    }
  });
  it("số cố định có mã vùng", () => {
    assert.equal(chuanHoaDienThoai("(028) 3812 3456"), "02838123456");
  });
  it("thiếu số 0 đầu thì thêm", () => {
    assert.equal(chuanHoaDienThoai("909123456"), "0909123456");
  });
  it("độ dài vô lý → lỗi", () => {
    assert.throws(() => chuanHoaDienThoai("123"), LoiDinhDang);
    assert.throws(() => chuanHoaDienThoai("0909123456789"), LoiDinhDang);
  });
  it("trống → null", () => assert.equal(chuanHoaDienThoai(""), null));
});

describe("Chuẩn hóa email và tên", () => {
  it("email chữ thường, bỏ khoảng trắng", () => {
    assert.equal(chuanHoaEmail("  Mua.Hang@AnhDuong.VN "), "mua.hang@anhduong.vn");
    assert.equal(chuanHoaEmail(""), null);
  });
  it("bỏ dấu tiếng Việt, kể cả đ/Đ", () => {
    assert.equal(boDau("Đồng Nai Điện Tử"), "dong nai dien tu");
  });
  it("tên: bỏ loại hình pháp nhân tiếng Việt và tiếng Anh", () => {
    assert.equal(chuanHoaTen("Công ty TNHH Thế Giới Tin Học"), "the gioi tin hoc");
    assert.equal(chuanHoaTen("CÔNG TY CỔ PHẦN THẾ GIỚI TIN HỌC"), "the gioi tin hoc");
    assert.equal(chuanHoaTen("Thế Giới Tin Học Co., Ltd"), "the gioi tin hoc");
    assert.equal(chuanHoaTen("Công ty TNHH MTV Ánh Dương"), "anh duong");
    assert.equal(chuanHoaTen("The Gioi Tin Hoc JSC"), "the gioi tin hoc");
  });
  it("tên: không cắt nhầm chữ 'cơ' trong tên riêng", () => {
    assert.equal(chuanHoaTen("Công ty Cơ Khí Sao Mai"), "co khi sao mai");
  });
  it("tên chỉ toàn loại hình pháp nhân vẫn không rỗng", () => {
    assert.notEqual(chuanHoaTen("Công ty TNHH"), "");
  });
});

describe("Số chứng từ (KH-01, CH-08)", () => {
  it("khách hàng 6 chữ số, không theo năm", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.khachHang, 123, "2026"), "KH-000123");
  });
  it("cơ hội theo năm, 4 chữ số", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.coHoi, 7, "2026"), "CH-2026-0007");
    assert.equal(dinhDangSoChungTu(KIEU_SO.coHoi, 12345, "2026"), "CH-2026-12345");
  });
  it("năm tính theo giờ Việt Nam: 31/12 17:30 UTC đã là năm mới", () => {
    assert.equal(namVN(new Date("2026-12-31T17:30:00Z")), "2027");
    assert.equal(namVN(new Date("2026-12-31T16:59:00Z")), "2026");
  });
});

describe("Pipeline và tỷ lệ thắng (CH-09)", () => {
  it("chỉ tính cơ hội đang mở; trọng số theo xác suất", () => {
    const kq = tinhPipeline([
      { stage: "OPPORTUNITY", estimatedValue: "100000000", probability: 20 },
      { stage: "NEGOTIATION", estimatedValue: 50_000_000, probability: 60 },
      { stage: "WON", estimatedValue: "999000000", probability: 100 },
      { stage: "LOST", estimatedValue: "1", probability: 0 },
    ]);
    assert.deepEqual(kq, { soLuong: 2, tong: 150_000_000, coTrongSo: 50_000_000 });
  });
  it("Decimal của Prisma (có toString) được chấp nhận", () => {
    const kq = tinhPipeline([{ stage: "QUOTATION", estimatedValue: { toString: () => "12500000.50" }, probability: 40 }]);
    assert.equal(kq.tong, 12_500_001);
  });
  it("tỷ lệ thắng null khi chưa có cơ hội đóng — không bịa 0%", () => {
    assert.equal(tyLeThang(0, 0), null);
    assert.equal(tyLeThang(1, 2), 33.3);
    assert.equal(tyLeThang(3, 0), 100);
  });
  it("giai đoạn và nhãn đầy đủ", () => {
    for (const gd of GIAI_DOAN_CO_HOI) assert.ok(NHAN_GIAI_DOAN[gd], gd);
    assert.deepEqual(CO_HOI_DANG_MO, ["OPPORTUNITY", "QUOTATION", "NEGOTIATION"]);
    assert.equal(laCoHoiDangMo("WON"), false);
    assert.equal(XAC_SUAT_GOI_Y.WON, 100);
    assert.equal(XAC_SUAT_GOI_Y.LOST, 0);
  });
});

describe("Lược đồ dùng chung", () => {
  it("số tiền: nhận '240.000.000', số, chuỗi thập phân; từ chối số âm và chữ", () => {
    assert.equal(soTien.parse("240.000.000"), "240000000");
    assert.equal(soTien.parse(1500000), "1500000");
    assert.equal(soTien.parse("1500000,5"), "1500000.5");
    assert.equal(soTien.parse(""), "0");
    assert.equal(soTien.safeParse("-5").success, false);
    assert.equal(soTien.safeParse("abc").success, false);
  });
  it("thời điểm từ ô datetime-local hiểu là giờ Việt Nam", () => {
    assert.equal(thoiDiemTuyChon.parse("2026-09-20T08:30")?.toISOString(), "2026-09-20T01:30:00.000Z");
    assert.equal(thoiDiemTuyChon.parse(""), null);
  });
  it("ngày kiểu date đi – về không lệch múi giờ", () => {
    assert.equal(dateVeNgay(ngayVeDate("2026-09-20")), "2026-09-20");
    assert.match(homNayVN(), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(homNayVN(new Date("2026-09-19T18:00:00Z")), "2026-09-20");
  });
  it("CH-02: tạo cơ hội bắt buộc hành động kế tiếp và ngày", () => {
    const goc = { khachHangId: "8c73c48a-9702-4dd3-9fb5-0f143e8c715c", tieuDe: "Cơ hội thử" };
    assert.equal(LuocDoTaoCoHoi.safeParse(goc).success, false);
    assert.equal(LuocDoTaoCoHoi.safeParse({ ...goc, hanhDongKeTiep: "Gọi khách", ngayHanhDong: "" }).success, false);
    assert.equal(LuocDoTaoCoHoi.safeParse({ ...goc, hanhDongKeTiep: "Gọi khách", ngayHanhDong: "2026-09-21" }).success, true);
  });
  it("LD-05: chuyển đổi phải chọn khách có sẵn hoặc nhập khách mới", () => {
    assert.equal(LuocDoChuyenDoiLead.safeParse({}).success, false);
    assert.equal(LuocDoChuyenDoiLead.safeParse({ khachMoi: { ten: "Khách mới" } }).success, true);
  });
});

describe("Vai trò sau Phase 2", () => {
  it("Trưởng phòng Kinh doanh mở lại được cơ hội (sales.approve); nhân viên thì không", () => {
    const tp = VAI_TRO.find((v) => v.code === "sales-manager")!;
    const nv = VAI_TRO.find((v) => v.code === "sales")!;
    assert.ok(Array.isArray(tp.quyen) && tp.quyen.includes("sales.approve"));
    assert.ok(Array.isArray(nv.quyen) && !nv.quyen.includes("sales.approve"));
  });
  it("vai trò AI vẫn không có quyền duyệt hay xóa", () => assert.equal(kiemTraGioiHanAI().dat, true));
});
