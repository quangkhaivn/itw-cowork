/**
 * Kiểm thử đơn vị phần thuần của Phase 5 — đơn hàng và kho.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { conPhaiGiao, daDong, dangChay, duocSuaDong, LOP_TRANG_THAI_DON, NHAN_TRANG_THAI_DON, TRANG_THAI_DON, tienDoGiao } from "../../src/modules/don-hang/tinh-toan";
import { conBanDuoc, mucTon, NHAN_LOAI_GIAO_DICH, LOAI_GIAO_DICH, soDuSau, tacDong } from "../../src/modules/kho/tinh-toan";
import { dinhDangSoChungTu, KIEU_SO } from "../../src/lib/so-chung-tu";

describe("Trạng thái đơn hàng", () => {
  it("mọi trạng thái đều có nhãn tiếng Việt và lớp hiển thị", () => {
    for (const t of TRANG_THAI_DON) {
      assert.ok(NHAN_TRANG_THAI_DON[t], t);
      assert.ok(t in LOP_TRANG_THAI_DON, t);
    }
  });
  it("chỉ đơn nháp mới sửa được dòng hàng", () => {
    assert.equal(duocSuaDong("DRAFT"), true);
    assert.equal(duocSuaDong("CONFIRMED"), false);
    assert.equal(duocSuaDong("PARTIALLY_DELIVERED"), false);
  });
  it("phân nhóm đang chạy / đã đóng", () => {
    assert.equal(dangChay("CONFIRMED"), true);
    assert.equal(dangChay("PARTIALLY_DELIVERED"), true);
    assert.equal(dangChay("DRAFT"), false);
    assert.equal(daDong("DELIVERED"), true);
    assert.equal(daDong("CANCELLED"), true);
    assert.equal(daDong("CONFIRMED"), false);
  });
  it("số đơn theo năm: DH-2026-0001", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.donHang, 1, "2026"), "DH-2026-0001");
    assert.equal(dinhDangSoChungTu(KIEU_SO.phieuXuat, 12, "2026"), "XK-2026-0012");
  });
});

describe("Tiến độ giao hàng", () => {
  it("chưa giao gì thì đơn vẫn là Đã xác nhận", () => {
    const kq = tienDoGiao([{ soLuong: 10, daGiao: 0 }, { soLuong: 2, daGiao: 0 }]);
    assert.equal(kq.trangThaiMoi, "CONFIRMED");
    assert.equal(kq.conLai, 12);
    assert.equal(kq.phanTram, 0);
  });
  it("giao một phần thì đơn sang Giao một phần", () => {
    const kq = tienDoGiao([{ soLuong: 10, daGiao: 4 }, { soLuong: 2, daGiao: 0 }]);
    assert.equal(kq.trangThaiMoi, "PARTIALLY_DELIVERED");
    assert.equal(kq.tongDaGiao, 4);
    assert.equal(kq.conLai, 8);
  });
  it("giao đủ mọi dòng thì đơn sang Đã giao đủ", () => {
    const kq = tienDoGiao([{ soLuong: "10", daGiao: "10" }, { soLuong: "2.5", daGiao: "2.5" }]);
    assert.equal(kq.trangThaiMoi, "DELIVERED");
    assert.equal(kq.xongHet, true);
    assert.equal(kq.phanTram, 100);
  });
  it("giao dư trên dữ liệu hỏng vẫn không cho quá 100%", () => {
    const kq = tienDoGiao([{ soLuong: 5, daGiao: 8 }]);
    assert.equal(kq.tongDaGiao, 5);
    assert.equal(kq.conLai, 0);
  });
  it("đơn rỗng không tự coi là đã giao xong", () => {
    const kq = tienDoGiao([]);
    assert.equal(kq.xongHet, false);
    assert.equal(kq.trangThaiMoi, "CONFIRMED");
  });
  it("số còn phải giao không âm", () => {
    assert.equal(conPhaiGiao(10, 3), 7);
    assert.equal(conPhaiGiao(10, 12), 0);
    assert.equal(conPhaiGiao("2.5", "0.5"), 2);
  });
});

describe("Tác động của giao dịch kho", () => {
  it("mọi loại giao dịch đều có nhãn tiếng Việt", () => {
    for (const l of LOAI_GIAO_DICH) assert.ok(NHAN_LOAI_GIAO_DICH[l], l);
  });
  it("nhập tăng tồn, không đụng giữ chỗ", () => {
    assert.deepEqual(tacDong("nhap", 5), { onHandDelta: 5, reservedDelta: 0 });
  });
  it("xuất giảm tồn và nhả đúng phần đang giữ chỗ", () => {
    assert.deepEqual(tacDong("xuat", 5, { nhaGiuCho: 5 }), { onHandDelta: -5, reservedDelta: -5 });
    assert.deepEqual(tacDong("xuat", 5, { nhaGiuCho: 2 }), { onHandDelta: -5, reservedDelta: -2 });
    // Bán hàng không giữ chỗ trước: chỉ trừ tồn.
    assert.deepEqual(tacDong("xuat", 5), { onHandDelta: -5, reservedDelta: 0 });
    // Không nhả nhiều hơn số xuất.
    assert.deepEqual(tacDong("xuat", 3, { nhaGiuCho: 9 }), { onHandDelta: -3, reservedDelta: -3 });
  });
  it("giữ chỗ và nhả giữ chỗ không đổi tồn kho", () => {
    assert.deepEqual(tacDong("giu-cho", 4), { onHandDelta: 0, reservedDelta: 4 });
    assert.deepEqual(tacDong("nha-giu-cho", 4), { onHandDelta: 0, reservedDelta: -4 });
  });
  it("điều chỉnh đi theo chiều được chọn", () => {
    assert.deepEqual(tacDong("dieu-chinh", 2, { chieu: 1 }), { onHandDelta: 2, reservedDelta: 0 });
    assert.deepEqual(tacDong("dieu-chinh", 2, { chieu: -1 }), { onHandDelta: -2, reservedDelta: 0 });
  });
});

describe("Chặn số dư âm", () => {
  it("xuất quá tồn bị chặn", () => {
    const kq = soDuSau({ onHand: 3, reserved: 0 }, tacDong("xuat", 5));
    assert.equal(kq.hopLe, false);
    assert.match(kq.lyDo ?? "", /không đủ/i);
  });
  it("nhả giữ chỗ nhiều hơn đang giữ bị chặn", () => {
    assert.equal(soDuSau({ onHand: 10, reserved: 1 }, tacDong("nha-giu-cho", 3)).hopLe, false);
  });
  it("không giữ chỗ nhiều hơn hàng đang có", () => {
    assert.equal(soDuSau({ onHand: 5, reserved: 3 }, tacDong("giu-cho", 3)).hopLe, false);
    assert.equal(soDuSau({ onHand: 5, reserved: 3 }, tacDong("giu-cho", 2)).hopLe, true);
  });
  it("xuất hàng đang giữ chỗ cho chính đơn đó thì hợp lệ", () => {
    const kq = soDuSau({ onHand: 5, reserved: 5 }, tacDong("xuat", 5, { nhaGiuCho: 5 }));
    assert.equal(kq.hopLe, true);
    assert.deepEqual(kq.sau, { onHand: 0, reserved: 0 });
  });
  it("làm tròn về 3 số lẻ, không sinh số lẻ rác", () => {
    const kq = soDuSau({ onHand: 0.1, reserved: 0 }, tacDong("nhap", 0.2));
    assert.equal(kq.sau.onHand, 0.3);
  });
});

describe("Hàng còn bán được và mức cảnh báo", () => {
  it("còn bán được = tồn − giữ chỗ, không âm", () => {
    assert.equal(conBanDuoc({ onHand: 10, reserved: 4 }), 6);
    assert.equal(conBanDuoc({ onHand: 2, reserved: 5 }), 0);
  });
  it("hết hàng, sắp hết, đủ", () => {
    assert.equal(mucTon(0, 5), "het");
    assert.equal(mucTon(3, 5), "sap-het");
    assert.equal(mucTon(7, 5), "du");
    // Chưa đặt mức tối thiểu thì chỉ cảnh báo khi hết sạch.
    assert.equal(mucTon(1, null), "du");
    assert.equal(mucTon(0, null), "het");
  });
});
