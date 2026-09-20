/**
 * Kiểm thử đơn vị phần thuần của Phase 7 — tài chính.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bienLoiNhuanKy, congNo, dong, hanThanhToanGoiY, NHAN_PHUONG_THUC_THU, NHAN_TINH_TRANG_THU,
  NHAN_TRANG_THAI_HOA_DON, nhomTuoiNo, PHUONG_THUC_THU, soNgayQuaHan, tongHopTuoiNo, TRANG_THAI_HOA_DON,
} from "../../src/modules/tai-chinh/tinh-toan";
import { dinhDangSoChungTu, KIEU_SO } from "../../src/lib/so-chung-tu";

describe("Danh mục tài chính", () => {
  it("mọi trạng thái hóa đơn và phương thức thu đều có nhãn tiếng Việt", () => {
    for (const t of TRANG_THAI_HOA_DON) assert.ok(NHAN_TRANG_THAI_HOA_DON[t], t);
    for (const p of PHUONG_THUC_THU) assert.ok(NHAN_PHUONG_THUC_THU[p], p);
    for (const t of ["chua-thu", "thu-mot-phan", "da-thu-du", "khong-tinh"] as const) assert.ok(NHAN_TINH_TRANG_THU[t].nhan, t);
  });
  it("số hóa đơn và phiếu thu theo năm", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.hoaDon, 1, "2026"), "HD-2026-0001");
    assert.equal(dinhDangSoChungTu(KIEU_SO.phieuThu, 25, "2026"), "PT-2026-0025");
  });
});

describe("Công nợ của một hóa đơn", () => {
  it("chưa thu, thu một phần, thu đủ", () => {
    assert.deepEqual(congNo("ISSUED", 10_000_000, 0), { tong: 10_000_000, daThu: 0, conNo: 10_000_000, tinhTrang: "chua-thu" });
    assert.equal(congNo("ISSUED", 10_000_000, 4_000_000).tinhTrang, "thu-mot-phan");
    assert.equal(congNo("ISSUED", 10_000_000, 10_000_000).tinhTrang, "da-thu-du");
  });
  it("hóa đơn nháp hoặc đã hủy KHÔNG tính vào công nợ", () => {
    assert.equal(congNo("DRAFT", 10_000_000, 0).conNo, 0);
    assert.equal(congNo("DRAFT", 10_000_000, 0).tinhTrang, "khong-tinh");
    assert.equal(congNo("CANCELLED", 10_000_000, 0).conNo, 0);
  });
  it("thu dư (do làm tròn hay ghi nhầm) không làm công nợ âm", () => {
    assert.equal(congNo("ISSUED", 10_000_000, 10_000_500).conNo, 0);
  });
  it("làm tròn về đồng trước khi so — không để lẻ 0,4 đồng làm hóa đơn không bao giờ đủ", () => {
    assert.equal(congNo("ISSUED", "10000000.4", "10000000").tinhTrang, "da-thu-du");
    assert.equal(dong("1234.6"), 1235);
  });
});

describe("Tuổi nợ", () => {
  it("số ngày quá hạn: âm khi chưa tới hạn", () => {
    assert.equal(soNgayQuaHan("2026-09-30", "2026-09-20"), -10);
    assert.equal(soNgayQuaHan("2026-09-20", "2026-09-20"), 0);
    assert.equal(soNgayQuaHan("2026-09-10", "2026-09-20"), 10);
  });
  it("không có hạn thì không coi là quá hạn", () => {
    assert.equal(soNgayQuaHan(null, "2026-09-20"), 0);
  });
  it("chia nhóm theo cách kế toán hay dùng", () => {
    assert.equal(nhomTuoiNo(0), "trong-han");
    assert.equal(nhomTuoiNo(-5), "trong-han");
    assert.equal(nhomTuoiNo(1), "1-30");
    assert.equal(nhomTuoiNo(30), "1-30");
    assert.equal(nhomTuoiNo(31), "31-60");
    assert.equal(nhomTuoiNo(61), "61-90");
    assert.equal(nhomTuoiNo(91), "tren-90");
  });
  it("cộng công nợ theo nhóm, bỏ qua hóa đơn đã thu đủ", () => {
    const kq = tongHopTuoiNo([
      { conNo: 5_000_000, soNgayQuaHan: -3 },
      { conNo: 2_000_000, soNgayQuaHan: 10 },
      { conNo: 1_000_000, soNgayQuaHan: 100 },
      { conNo: 0, soNgayQuaHan: 200 },
    ]);
    assert.equal(kq.tongConNo, 8_000_000);
    assert.equal(kq.tongQuaHan, 3_000_000);
    assert.equal(kq.soHoaDonQuaHan, 2);
    assert.equal(kq.theoNhom["trong-han"], 5_000_000);
    assert.equal(kq.theoNhom["1-30"], 2_000_000);
    assert.equal(kq.theoNhom["tren-90"], 1_000_000);
  });
});

describe("Hạn thanh toán và biên lợi nhuận kỳ", () => {
  it("hạn = ngày phát hành + số ngày công nợ", () => {
    assert.equal(hanThanhToanGoiY("2026-09-20", 30), "2026-10-20");
    assert.equal(hanThanhToanGoiY("2026-12-25", 10), "2027-01-04");
    assert.equal(hanThanhToanGoiY("2026-09-20", 0), "2026-09-20");
  });
  it("chưa đặt số ngày công nợ thì KHÔNG bịa hạn", () => {
    assert.equal(hanThanhToanGoiY("2026-09-20", null), null);
  });
  it("biên lợi nhuận kỳ; doanh thu 0 trả null chứ không phải 0%", () => {
    assert.equal(bienLoiNhuanKy(100_000_000, 80_000_000), 20);
    assert.equal(bienLoiNhuanKy(0, 0), null);
    assert.equal(bienLoiNhuanKy(100, 130), -30);
  });
});
