/**
 * Kiểm thử đơn vị phần thuần của Trả hàng và đổi máy.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  chotTienDuoc,
  conGiamTruDuoc,
  huyDuoc,
  kiemPhanBoGiamTru,
  LOAI_TRA_HANG,
  LOP_TRANG_THAI_TRA_HANG,
  NHAN_LOAI_TRA_HANG,
  NHAN_TINH_TRANG_HANG,
  NHAN_TRANG_THAI_TRA_BAN,
  NHAN_TRANG_THAI_TRA_MUA,
  soLuongTraToiDa,
  traHangDaDong,
  traHangSuaDuoc,
  TINH_TRANG_HANG,
  TRANG_THAI_TRA_HANG,
  xacNhanDuoc,
} from "../../src/modules/tra-hang/tinh-toan";
import { dinhDangSoChungTu, KIEU_SO } from "../../src/lib/so-chung-tu";

describe("Danh mục trả hàng", () => {
  it("mọi trạng thái có nhãn tiếng Việt cho cả hai chiều", () => {
    for (const t of TRANG_THAI_TRA_HANG) {
      assert.ok(NHAN_TRANG_THAI_TRA_BAN[t], `bán: ${t}`);
      assert.ok(NHAN_TRANG_THAI_TRA_MUA[t], `mua: ${t}`);
      assert.ok(t in LOP_TRANG_THAI_TRA_HANG, `lớp: ${t}`);
    }
  });
  it("cùng một trạng thái nhưng nói khác nhau theo chiều — hàng vào hay hàng ra", () => {
    assert.notEqual(NHAN_TRANG_THAI_TRA_BAN.CONFIRMED, NHAN_TRANG_THAI_TRA_MUA.CONFIRMED);
  });
  it("loại phiếu và tình trạng hàng đều có nhãn", () => {
    for (const l of LOAI_TRA_HANG) assert.ok(NHAN_LOAI_TRA_HANG[l], l);
    for (const t of TINH_TRANG_HANG) assert.ok(NHAN_TINH_TRANG_HANG[t].nhan, t);
  });
  it("số phiếu trả hàng theo năm, hai chiều hai tiền tố", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.traHangBan, 1, "2026"), "TH-2026-0001");
    assert.equal(dinhDangSoChungTu(KIEU_SO.traHangMua, 12, "2026"), "TM-2026-0012");
  });
});

describe("Vòng đời phiếu trả hàng", () => {
  it("chỉ sửa, xác nhận và hủy được khi còn nháp", () => {
    assert.equal(traHangSuaDuoc("DRAFT"), true);
    assert.equal(xacNhanDuoc("DRAFT"), true);
    assert.equal(huyDuoc("DRAFT"), true);
    for (const t of ["CONFIRMED", "SETTLED", "CANCELLED"]) {
      assert.equal(traHangSuaDuoc(t), false, t);
      assert.equal(xacNhanDuoc(t), false, t);
      assert.equal(huyDuoc(t), false, t);
    }
  });
  it("chỉ chốt tiền khi hàng đã qua kho và phiếu có giá trị", () => {
    assert.equal(chotTienDuoc("CONFIRMED", 1_000_000), true);
    assert.equal(chotTienDuoc("DRAFT", 1_000_000), false);
    assert.equal(chotTienDuoc("SETTLED", 1_000_000), false);
  });
  it("phiếu đổi máy giá trị 0 không đi qua bước chốt tiền (TH-08)", () => {
    assert.equal(chotTienDuoc("CONFIRMED", 0), false);
  });
  it("phiếu đã chốt hoặc đã hủy là đã đóng", () => {
    assert.equal(traHangDaDong("SETTLED"), true);
    assert.equal(traHangDaDong("CANCELLED"), true);
    assert.equal(traHangDaDong("CONFIRMED"), false);
  });
});

describe("Số lượng trả tối đa (TH-03)", () => {
  it("trả được phần đã giao trừ phần đã trả", () => {
    assert.equal(soLuongTraToiDa(5, 2), 3);
    assert.equal(soLuongTraToiDa("5", "5"), 0);
  });
  it("chưa giao gì thì không trả được gì", () => {
    assert.equal(soLuongTraToiDa(0, 0), 0);
  });
  it("trả vượt (do dữ liệu cũ) vẫn trả 0, không trả số âm", () => {
    assert.equal(soLuongTraToiDa(2, 5), 0);
  });
  it("giữ được 3 số lẻ cho hàng bán theo mét hay theo giờ", () => {
    assert.equal(soLuongTraToiDa("1.5", "0.25"), 1.25);
  });
});

describe("Phần giảm trừ còn lại", () => {
  it("chưa phân bổ thì còn nguyên", () => {
    assert.equal(conGiamTruDuoc(6_600_000, 0), 6_600_000);
  });
  it("phân bổ hết thì còn 0", () => {
    assert.equal(conGiamTruDuoc("6600000", "6600000"), 0);
  });
  it("phân bổ vượt (không nên xảy ra) vẫn trả 0", () => {
    assert.equal(conGiamTruDuoc(1_000_000, 2_000_000), 0);
  });
});

describe("Kiểm phân bổ giảm trừ (TH-07)", () => {
  it("phân bổ vừa đủ và không vượt nợ từng hóa đơn thì hợp lệ", () => {
    const kq = kiemPhanBoGiamTru(6_600_000, 0, [
      { soTien: 4_000_000, conNo: 10_000_000 },
      { soTien: 2_600_000, conNo: 3_000_000 },
    ]);
    assert.equal(kq.hopLe, true);
    assert.equal(kq.tongPhanBo, 6_600_000);
  });
  it("tổng giảm trừ vượt giá trị phiếu thì chặn", () => {
    const kq = kiemPhanBoGiamTru(1_000_000, 0, [{ soTien: 2_000_000, conNo: 10_000_000 }]);
    assert.equal(kq.hopLe, false);
    assert.ok(kq.lyDo?.includes("vượt phần còn lại"));
  });
  it("một hóa đơn không nhận quá phần nó còn nợ", () => {
    const kq = kiemPhanBoGiamTru(5_000_000, 0, [{ soTien: 3_000_000, conNo: 1_000_000 }]);
    assert.equal(kq.hopLe, false);
    assert.ok(kq.lyDo?.includes("chỉ còn nợ"));
  });
  it("phân bổ 0 hoặc âm bị chặn", () => {
    assert.equal(kiemPhanBoGiamTru(1_000_000, 0, [{ soTien: 0, conNo: 1_000_000 }]).hopLe, false);
    assert.equal(kiemPhanBoGiamTru(1_000_000, 0, []).hopLe, false);
  });
  it("phần đã phân bổ trước đó được trừ ra khỏi hạn mức", () => {
    const kq = kiemPhanBoGiamTru(1_000_000, 800_000, [{ soTien: 300_000, conNo: 5_000_000 }]);
    assert.equal(kq.hopLe, false);
  });
});
