import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  LOP_TRANG_THAI_DON_MUA,
  NHAN_TRANG_THAI_DE_NGHI,
  NHAN_TRANG_THAI_DON_MUA,
  TRANG_THAI_DE_NGHI,
  TRANG_THAI_DON_MUA,
  deNghiSuaDuoc,
  donMuaDaDong,
  donMuaSuaDuoc,
  nhanDuocHang,
  soLuongCanMua,
  tienDoNhan,
  tinhDonMua,
} from "../../src/modules/mua-hang/tinh-toan";

describe("Vòng đời chứng từ mua hàng", () => {
  it("chỉ sửa được đề nghị khi còn nháp", () => {
    assert.equal(deNghiSuaDuoc("DRAFT"), true);
    for (const t of ["PENDING_APPROVAL", "APPROVED", "ORDERED", "REJECTED", "CANCELLED"]) {
      assert.equal(deNghiSuaDuoc(t), false, t);
    }
  });

  it("chỉ sửa được đơn mua khi còn nháp — gửi nhà cung cấp rồi thì khóa", () => {
    assert.equal(donMuaSuaDuoc("DRAFT"), true);
    for (const t of ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]) {
      assert.equal(donMuaSuaDuoc(t), false, t);
    }
  });

  it("nhận hàng được ở ba trạng thái giữa chừng", () => {
    for (const t of ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"]) assert.equal(nhanDuocHang(t), true, t);
    for (const t of ["DRAFT", "RECEIVED", "CANCELLED"]) assert.equal(nhanDuocHang(t), false, t);
  });

  it("đơn đã đóng là nhận đủ hoặc đã hủy", () => {
    assert.equal(donMuaDaDong("RECEIVED"), true);
    assert.equal(donMuaDaDong("CANCELLED"), true);
    assert.equal(donMuaDaDong("PARTIALLY_RECEIVED"), false);
  });

  it("mọi mã trạng thái đều có nhãn tiếng Việt", () => {
    for (const t of TRANG_THAI_DE_NGHI) assert.ok(NHAN_TRANG_THAI_DE_NGHI[t], t);
    for (const t of TRANG_THAI_DON_MUA) {
      assert.ok(NHAN_TRANG_THAI_DON_MUA[t], t);
      assert.ok(LOP_TRANG_THAI_DON_MUA[t] !== undefined, t);
    }
  });
});

describe("Tiến độ nhận hàng", () => {
  it("chưa nhận gì thì trạng thái quay về Nhà cung cấp đã nhận", () => {
    const t = tienDoNhan([{ soLuong: "10", daNhan: "0" }]);
    assert.equal(t.chuaNhanGi, true);
    assert.equal(t.trangThaiMoi, "CONFIRMED");
    assert.equal(t.phanTram, 0);
  });

  it("nhận một phần", () => {
    const t = tienDoNhan([
      { soLuong: "10", daNhan: "4" },
      { soLuong: "10", daNhan: "0" },
    ]);
    assert.equal(t.tongDat, 20);
    assert.equal(t.tongDaNhan, 4);
    assert.equal(t.conLai, 16);
    assert.equal(t.phanTram, 20);
    assert.equal(t.trangThaiMoi, "PARTIALLY_RECEIVED");
  });

  it("nhận đủ thì xong hết", () => {
    const t = tienDoNhan([
      { soLuong: "3", daNhan: "3" },
      { soLuong: "2", daNhan: "2" },
    ]);
    assert.equal(t.xongHet, true);
    assert.equal(t.conLai, 0);
    assert.equal(t.phanTram, 100);
    assert.equal(t.trangThaiMoi, "RECEIVED");
  });

  it("nhận thừa cũng chỉ tính tới số đã đặt — không ra quá 100%", () => {
    const t = tienDoNhan([{ soLuong: "5", daNhan: "9" }]);
    assert.equal(t.tongDaNhan, 5);
    assert.equal(t.phanTram, 100);
    assert.equal(t.xongHet, true);
  });

  it("đơn rỗng thì không coi là đã xong", () => {
    const t = tienDoNhan([]);
    assert.equal(t.xongHet, false);
    assert.equal(t.phanTram, 0);
  });

  it("số lẻ làm tròn tới hai chữ số phần trăm", () => {
    assert.equal(tienDoNhan([{ soLuong: "3", daNhan: "1" }]).phanTram, 33.33);
  });
});

describe("Tính tiền đơn mua", () => {
  it("một dòng đơn giản có VAT 10%", () => {
    const t = tinhDonMua([{ soLuong: "2", donGia: "1000000", vat: 10 }]);
    assert.equal(t.tamTinh, 2_000_000);
    assert.equal(t.tongChietKhau, 0);
    assert.equal(t.tongVat, 200_000);
    assert.equal(t.tongCong, 2_200_000);
    assert.equal(t.dong[0].thanhTien, 2_200_000);
  });

  it("chiết khấu trừ trước khi tính VAT", () => {
    const t = tinhDonMua([{ soLuong: "1", donGia: "1000000", chietKhau: 10, vat: 10 }]);
    assert.equal(t.tongChietKhau, 100_000);
    assert.equal(t.tongVat, 90_000);
    assert.equal(t.tongCong, 990_000);
  });

  it("nhiều dòng cộng đúng", () => {
    const t = tinhDonMua([
      { soLuong: "2", donGia: "1000000", vat: 10 },
      { soLuong: "1", donGia: "500000", vat: 0 },
    ]);
    assert.equal(t.tamTinh, 2_500_000);
    assert.equal(t.tongVat, 200_000);
    assert.equal(t.tongCong, 2_700_000);
  });

  it("VAT 0% vẫn hợp lệ", () => {
    const t = tinhDonMua([{ soLuong: "1", donGia: "1000000", vat: 0 }]);
    assert.equal(t.tongVat, 0);
    assert.equal(t.tongCong, 1_000_000);
  });

  it("chiết khấu 100% ra 0 đồng, không ra số âm", () => {
    const t = tinhDonMua([{ soLuong: "1", donGia: "1000000", chietKhau: 100, vat: 10 }]);
    assert.equal(t.tongCong, 0);
    assert.ok(Object.is(t.tongCong, 0), "không được là -0");
  });

  it("đơn rỗng ra toàn số 0", () => {
    const t = tinhDonMua([]);
    assert.equal(t.tamTinh, 0);
    assert.equal(t.tongCong, 0);
  });

  it("tỷ lệ ngoài khoảng bị kẹp về 0–100", () => {
    const t = tinhDonMua([{ soLuong: "1", donGia: "1000000", chietKhau: -5, vat: 500 }]);
    assert.equal(t.tongChietKhau, 0);
    assert.equal(t.tongVat, 1_000_000);
  });
});

describe("Số lượng cần mua", () => {
  it("đủ hàng thì không cần mua", () => {
    assert.equal(soLuongCanMua(5, 10), 0);
    assert.equal(soLuongCanMua(5, 5), 0);
  });

  it("thiếu bao nhiêu mua bấy nhiêu", () => {
    assert.equal(soLuongCanMua(10, 3), 7);
  });

  it("tồn âm coi như không có hàng", () => {
    assert.equal(soLuongCanMua(4, -2), 4);
  });
});
