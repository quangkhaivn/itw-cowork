/**
 * Kiểm thử đơn vị phần thuần của Phase 4 — báo giá.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { canDuyet, chuaGui, daChot, docTienBangChu, hetHieuLuc, NHAN_TRANG_THAI_BAO_GIA, tinhBaoGia, TRANG_THAI_BAO_GIA } from "../../src/modules/bao-gia/tinh-toan";
import { soPhienBan } from "../../src/modules/bao-gia/service";
import { dinhDangSoChungTu, KIEU_SO } from "../../src/lib/so-chung-tu";
import { dinhDangNhapTien } from "../../src/lib/dinh-dang";
import { LuocDoDongBaoGia } from "../../src/modules/bao-gia/luoc-do";

describe("Tính tiền báo giá (mục 12)", () => {
  const dong = [
    { soLuong: 20, donGia: 12_000_000, chietKhau: 0, vat: 10, giaVon: 10_000_000 },
    { soLuong: 2, donGia: 3_500_000, chietKhau: 10, vat: 10, giaVon: 2_800_000 },
  ];
  it("tính từng dòng rồi cộng, không làm tròn ở tổng", () => {
    const kq = tinhBaoGia(dong);
    assert.equal(kq.dong[0].thanhTien, 240_000_000);
    assert.equal(kq.dong[1].thanhTienGoc, 7_000_000);
    assert.equal(kq.dong[1].tienChietKhau, 700_000);
    assert.equal(kq.dong[1].thanhTien, 6_300_000);
    assert.equal(kq.tamTinh, 247_000_000);
    assert.equal(kq.tongChietKhau, 700_000);
    assert.equal(kq.tongVat, 24_630_000);
    assert.equal(kq.tongCong, 270_930_000);
  });
  it("biên lợi nhuận tính trên doanh thu trước thuế", () => {
    const kq = tinhBaoGia(dong);
    assert.equal(kq.tongGiaVon, 205_600_000);
    assert.equal(kq.loiNhuanGop, 40_700_000);
    assert.equal(kq.bienLoiNhuan, 16.52); // 40.700.000 / 246.300.000
  });
  it("doanh thu bằng 0 thì biên là null, KHÔNG phải 0%", () => {
    assert.equal(tinhBaoGia([{ soLuong: 1, donGia: 0, giaVon: 0 }]).bienLoiNhuan, null);
    assert.equal(tinhBaoGia([]).bienLoiNhuan, null);
    assert.equal(tinhBaoGia([]).tongCong, 0);
  });
  it("bán dưới giá vốn cho biên âm, không kẹp về 0", () => {
    const kq = tinhBaoGia([{ soLuong: 1, donGia: 1_000_000, giaVon: 1_200_000, vat: 0 }]);
    assert.equal(kq.loiNhuanGop, -200_000);
    assert.equal(kq.bienLoiNhuan, -20);
  });
  it("nhận số dạng chuỗi và số lẻ của số lượng", () => {
    const kq = tinhBaoGia([{ soLuong: "2.5", donGia: "1000000", vat: "8", giaVon: "800000" }]);
    assert.equal(kq.dong[0].thanhTien, 2_500_000);
    assert.equal(kq.dong[0].tienVat, 200_000);
    assert.equal(kq.tongGiaVon, 2_000_000);
  });
  it("chiết khấu và VAT bị kẹp trong 0–100", () => {
    const kq = tinhBaoGia([{ soLuong: 1, donGia: 1000, chietKhau: 150, vat: -5 }]);
    assert.equal(kq.dong[0].thanhTien, 0);
    assert.equal(kq.dong[0].tienVat, 0);
  });
});

describe("Luật duyệt báo giá (mục 12)", () => {
  it("ngưỡng CHƯA đặt thì mọi báo giá phải duyệt", () => {
    assert.deepEqual(canDuyet(50, null), { can: true, lyDo: "threshold_not_set" });
  });
  it("biên dưới ngưỡng thì phải duyệt, đạt ngưỡng thì không", () => {
    assert.equal(canDuyet(9.9, 10).can, true);
    assert.equal(canDuyet(10, 10).can, false);
    assert.equal(canDuyet(25, 10).can, false);
  });
  it("chưa tính được biên thì phải duyệt", () => {
    assert.equal(canDuyet(null, 10).can, true);
  });
});

describe("Trạng thái báo giá", () => {
  it("mọi trạng thái đều có nhãn tiếng Việt", () => {
    for (const t of TRANG_THAI_BAO_GIA) assert.ok(NHAN_TRANG_THAI_BAO_GIA[t], t);
  });
  it("phân nhóm chưa gửi / đã chốt", () => {
    assert.equal(chuaGui("DRAFT"), true);
    assert.equal(chuaGui("APPROVED"), true);
    assert.equal(chuaGui("SENT"), false);
    assert.equal(daChot("ACCEPTED"), true);
    assert.equal(daChot("SENT"), false);
  });
  it("hết hiệu lực so theo ngày", () => {
    assert.equal(hetHieuLuc("2026-09-19", "2026-09-20"), true);
    assert.equal(hetHieuLuc("2026-09-20", "2026-09-20"), false);
    assert.equal(hetHieuLuc(null, "2026-09-20"), false);
  });
  it("số báo giá và số phiên bản", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.baoGia, 1, "2026"), "QT-2026-0001");
    assert.equal(soPhienBan("QT-2026-0001", 2), "QT-2026-0001-V2");
  });
});

describe("Đọc tiền bằng chữ (bản in)", () => {
  it("các mốc thường gặp", () => {
    assert.equal(docTienBangChu(0), "Không đồng");
    assert.equal(docTienBangChu(1000), "Một nghìn đồng");
    assert.equal(docTienBangChu(15_000), "Mười lăm nghìn đồng");
    assert.equal(docTienBangChu(21_000), "Hai mươi mốt nghìn đồng");
    assert.equal(docTienBangChu(105_000), "Một trăm lẻ năm nghìn đồng");
    assert.equal(docTienBangChu(270_930_000), "Hai trăm bảy mươi triệu chín trăm ba mươi nghìn đồng");
    assert.equal(docTienBangChu(1_000_000_000), "Một tỷ đồng");
  });
});

describe("Lược đồ dòng hàng", () => {
  it("từ chối số lượng 0 hoặc âm", () => {
    const goc = { ten: "Laptop Dell", donGia: "15000000" };
    assert.equal(LuocDoDongBaoGia.safeParse({ ...goc, soLuong: "0" }).success, false);
    assert.equal(LuocDoDongBaoGia.safeParse({ ...goc, soLuong: "-1" }).success, false);
    assert.equal(LuocDoDongBaoGia.safeParse({ ...goc, soLuong: "2" }).success, true);
  });
  it("nhận số lượng lẻ và giá viết kiểu Việt Nam", () => {
    const kq = LuocDoDongBaoGia.parse({ ten: "Dây mạng", soLuong: "12,5", donGia: "15.000" });
    assert.equal(kq.soLuong, "12.5");
    assert.equal(kq.donGia, "15000");
  });
  it("chiết khấu trên 100% bị từ chối", () => {
    assert.equal(LuocDoDongBaoGia.safeParse({ ten: "X", soLuong: "1", donGia: "1", chietKhau: 120 }).success, false);
  });
});

describe("Ô nhập tiền", () => {
  it("chấm ngăn nghìn, bỏ ký tự lạ và số 0 thừa", () => {
    assert.equal(dinhDangNhapTien("12000000"), "12.000.000");
    assert.equal(dinhDangNhapTien("12.000.000"), "12.000.000");
    assert.equal(dinhDangNhapTien("0012000"), "12.000");
    assert.equal(dinhDangNhapTien("12a3"), "123");
    assert.equal(dinhDangNhapTien(""), "");
  });
});
