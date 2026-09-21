/**
 * Kiểm thử đơn vị phần thuần của Chuyển kho nội bộ.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  chuyenKhoDaDong,
  chuyenKhoSuaDuoc,
  huyDuoc,
  kiemDongNhan,
  LOP_TRANG_THAI_CHUYEN_KHO,
  NHAN_TRANG_THAI_CHUYEN_KHO,
  nhanDuoc,
  soNhanToiDa,
  tongKetChuyen,
  TRANG_THAI_CHUYEN_KHO,
  xuatDuoc,
} from "../../src/modules/chuyen-kho/tinh-toan";
import { dinhDangSoChungTu, KIEU_SO } from "../../src/lib/so-chung-tu";

describe("Danh mục chuyển kho", () => {
  it("mọi trạng thái có nhãn tiếng Việt và lớp hiển thị", () => {
    for (const t of TRANG_THAI_CHUYEN_KHO) {
      assert.ok(NHAN_TRANG_THAI_CHUYEN_KHO[t], t);
      assert.ok(t in LOP_TRANG_THAI_CHUYEN_KHO, t);
    }
  });
  it("số phiếu chuyển kho theo năm", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.chuyenKho, 1, "2026"), "CK-2026-0001");
    assert.equal(dinhDangSoChungTu(KIEU_SO.chuyenKho, 137, "2026"), "CK-2026-0137");
  });
});

describe("Vòng đời phiếu chuyển kho", () => {
  it("chỉ sửa, xuất và hủy được khi còn nháp", () => {
    assert.equal(chuyenKhoSuaDuoc("DRAFT"), true);
    assert.equal(xuatDuoc("DRAFT"), true);
    assert.equal(huyDuoc("DRAFT"), true);
    for (const t of ["IN_TRANSIT", "RECEIVED", "CANCELLED"]) {
      assert.equal(chuyenKhoSuaDuoc(t), false, t);
      assert.equal(xuatDuoc(t), false, t);
      assert.equal(huyDuoc(t), false, t);
    }
  });
  it("chỉ nhận được hàng đang trên đường", () => {
    assert.equal(nhanDuoc("IN_TRANSIT"), true);
    assert.equal(nhanDuoc("DRAFT"), false);
    assert.equal(nhanDuoc("RECEIVED"), false);
  });
  it("đã nhận hoặc đã hủy là đã đóng", () => {
    assert.equal(chuyenKhoDaDong("RECEIVED"), true);
    assert.equal(chuyenKhoDaDong("CANCELLED"), true);
    assert.equal(chuyenKhoDaDong("IN_TRANSIT"), false);
  });
});

describe("Tổng kết một phiếu chuyển", () => {
  it("nhận đủ thì không thiếu gì", () => {
    const kq = tongKetChuyen([
      { soLuong: 10, daNhan: 10 },
      { soLuong: 5, daNhan: 5 },
    ]);
    assert.equal(kq.tongXuat, 15);
    assert.equal(kq.tongNhan, 15);
    assert.equal(kq.thieu, 0);
    assert.equal(kq.coThieu, false);
    assert.equal(kq.phanTram, 100);
  });
  it("nhận thiếu thì nêu đúng phần thiếu", () => {
    const kq = tongKetChuyen([{ soLuong: "10", daNhan: "8" }]);
    assert.equal(kq.thieu, 2);
    assert.equal(kq.coThieu, true);
    assert.equal(kq.phanTram, 80);
  });
  it("chưa nhận gì thì tiến độ 0", () => {
    const kq = tongKetChuyen([{ soLuong: 3, daNhan: 0 }]);
    assert.equal(kq.tongNhan, 0);
    assert.equal(kq.phanTram, 0);
  });
  it("dữ liệu lỗi (nhận nhiều hơn xuất) không làm tiến độ vượt 100%", () => {
    const kq = tongKetChuyen([{ soLuong: 3, daNhan: 9 }]);
    assert.equal(kq.tongNhan, 3);
    assert.equal(kq.phanTram, 100);
  });
  it("phiếu rỗng không chia cho 0", () => {
    assert.equal(tongKetChuyen([]).phanTram, 0);
  });
  it("giữ 3 số lẻ cho hàng bán theo mét", () => {
    assert.equal(tongKetChuyen([{ soLuong: "1.5", daNhan: "1.25" }]).thieu, 0.25);
  });
});

describe("Kiểm một dòng nhận (CK-04)", () => {
  it("nhận đủ thì hợp lệ, không cần lý do", () => {
    assert.equal(kiemDongNhan(10, 10, null).hopLe, true);
  });
  it("nhận nhiều hơn số đã xuất thì chặn", () => {
    const kq = kiemDongNhan(10, 11, "gì đó");
    assert.equal(kq.hopLe, false);
    assert.ok(kq.lyDo?.includes("không nhận được"));
  });
  it("nhận thiếu mà không ghi lý do thì chặn", () => {
    const kq = kiemDongNhan(10, 8, null);
    assert.equal(kq.hopLe, false);
    assert.ok(kq.lyDo?.includes("thiếu 2"));
  });
  it("nhận thiếu có ghi lý do thì đi qua", () => {
    assert.equal(kiemDongNhan(10, 8, "Thùng rách dọc đường").hopLe, true);
  });
  it("lý do chỉ có một ký tự không tính là lý do", () => {
    assert.equal(kiemDongNhan(10, 8, "x").hopLe, false);
    assert.equal(kiemDongNhan(10, 8, "   ").hopLe, false);
  });
  it("nhận 0 cũng phải có lý do", () => {
    assert.equal(kiemDongNhan(10, 0, null).hopLe, false);
    assert.equal(kiemDongNhan(10, 0, "Xe mất hàng, đã báo công an").hopLe, true);
  });
  it("số âm bị chặn", () => {
    assert.equal(kiemDongNhan(10, -1, "gì đó").hopLe, false);
  });
  it("sai số làm tròn không làm 'nhận đủ' thành 'nhận thiếu'", () => {
    assert.equal(kiemDongNhan("1.000", "1", null).hopLe, true);
  });
});

describe("Số nhận tối đa", () => {
  it("bằng đúng số đã xuất", () => {
    assert.equal(soNhanToiDa(7), 7);
    assert.equal(soNhanToiDa("2.5"), 2.5);
  });
  it("dữ liệu rác trả 0", () => {
    assert.equal(soNhanToiDa("abc"), 0);
    assert.equal(soNhanToiDa(-3), 0);
  });
});
