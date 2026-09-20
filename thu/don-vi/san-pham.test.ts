/**
 * Kiểm thử đơn vị phần logic thuần của Phase 3 — sản phẩm, bảng giá, CSV.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { bienLoiNhuan, chonNguonTot, chuanHoaMaDanhMuc, chuanHoaSku, chuanHoaTenSanPham } from "../../src/modules/san-pham/chuan-hoa";
import { LoiDinhDang } from "../../src/lib/loi";
import { docBangCsv, docCsv, docSoTienCsv, doanDauPhanCach, taoCsv } from "../../src/lib/csv";
import { dinhDangSoChungTu, KIEU_SO } from "../../src/lib/so-chung-tu";
import { mauCsv } from "../../src/modules/san-pham/nhap-xuat";

describe("Chuẩn hóa SKU (SP-01)", () => {
  it("viết hoa và gộp khoảng trắng — cùng một sản phẩm", () => {
    assert.equal(chuanHoaSku("lap-dell-3420"), "LAP-DELL-3420");
    assert.equal(chuanHoaSku("  lap  dell  3420 "), "LAP DELL 3420");
  });
  it("cho phép chữ, số và - _ . / +", () => {
    assert.equal(chuanHoaSku("sp.01/a+b_c"), "SP.01/A+B_C");
  });
  it("từ chối SKU rỗng, quá dài, hoặc có ký tự lạ", () => {
    assert.throws(() => chuanHoaSku("   "), LoiDinhDang);
    assert.throws(() => chuanHoaSku("A".repeat(65)), LoiDinhDang);
    assert.throws(() => chuanHoaSku("sp@01"), (e: unknown) => e instanceof LoiDinhDang && e.truong === "sku");
    assert.throws(() => chuanHoaSku("-sp01"), LoiDinhDang);
  });
  it("mã nhóm / thương hiệu về chữ thường không dấu, gạch ngang", () => {
    assert.equal(chuanHoaMaDanhMuc("Thiết bị Văn phòng"), "thiet-bi-van-phong");
    assert.equal(chuanHoaMaDanhMuc("NetCAM"), "netcam");
    assert.throws(() => chuanHoaMaDanhMuc("###"), LoiDinhDang);
  });
  it("tên sản phẩm bỏ dấu để tìm kiếm", () => {
    assert.equal(chuanHoaTenSanPham("Máy in Canon LBP-2900"), "may in canon lbp 2900");
  });
});

describe("Chọn nguồn mua (SP-07)", () => {
  const nguon = [
    { supplierId: "a", purchasePrice: "10000", availability: "het-hang", leadTimeDays: 1 },
    { supplierId: "b", purchasePrice: "12000", availability: "con-hang", leadTimeDays: 5 },
    { supplierId: "c", purchasePrice: "12000", availability: "con-hang", leadTimeDays: 2 },
    { supplierId: "d", purchasePrice: "11000", availability: "dat-truoc", leadTimeDays: 1 },
  ];
  it("ưu tiên còn hàng, rồi giá thấp, rồi giao nhanh", () => {
    assert.equal(chonNguonTot(nguon)?.supplierId, "c");
  });
  it("chỉ còn hàng hết thì vẫn trả nguồn rẻ nhất", () => {
    assert.equal(chonNguonTot([nguon[0]])?.supplierId, "a");
  });
  it("bỏ qua dòng giá đã gỡ", () => {
    assert.equal(chonNguonTot([{ ...nguon[2], status: "ngung-hoat-dong" }, nguon[1]])?.supplierId, "b");
  });
  it("chưa có nguồn nào thì trả null, không đoán", () => assert.equal(chonNguonTot([]), null));
});

describe("Biên lợi nhuận sản phẩm", () => {
  it("tính theo giá bán", () => {
    assert.equal(bienLoiNhuan("17900000", "15200000"), 15.1);
    assert.equal(bienLoiNhuan(100, 100), 0);
  });
  it("thiếu giá thì null, KHÔNG phải 0%", () => {
    assert.equal(bienLoiNhuan(null, 100), null);
    assert.equal(bienLoiNhuan(100, null), null);
    assert.equal(bienLoiNhuan(0, 0), null);
  });
});

describe("Đọc CSV", () => {
  it("đoán dấu phân cách ; của Excel tiếng Việt", () => {
    assert.equal(doanDauPhanCach("SKU;Tên;Giá"), ";");
    assert.equal(doanDauPhanCach("SKU,Tên,Giá"), ",");
    assert.equal(doanDauPhanCach("SKU\tTên"), "\t");
  });
  it("bỏ BOM, hiểu CRLF và ô có dấu nháy kép", () => {
    const csv = '﻿SKU,Tên\r\nA1,"Laptop Dell, 14 inch"\r\nA2,"Có ""nháy"" bên trong"\r\n';
    assert.deepEqual(docCsv(csv), [
      ["SKU", "Tên"],
      ["A1", "Laptop Dell, 14 inch"],
      ["A2", 'Có "nháy" bên trong'],
    ]);
  });
  it("bỏ qua dòng trống, giữ số dòng đúng để báo lỗi", () => {
    const kq = docBangCsv("SKU,Tên\nA1,Máy in\n\nA2,Máy chiếu\n", [
      { truong: "sku", ten: ["sku"], batBuoc: true },
      { truong: "ten", ten: ["ten"], batBuoc: true },
    ]);
    assert.deepEqual(kq.dong.map((d) => [d.soDong, d.duLieu.sku]), [[2, "A1"], [3, "A2"]]);
  });
  it("nhận tiêu đề cột viết có dấu, khác hoa thường; báo cột thiếu và cột lạ", () => {
    const kq = docBangCsv("Mã sản phẩm;GIÁ BÁN;Cột lạ\nA1;1.000.000;x", [
      { truong: "sku", ten: ["sku", "ma san pham"], batBuoc: true },
      { truong: "giaBan", ten: ["gia ban"], batBuoc: true },
      { truong: "ten", ten: ["ten"], batBuoc: true },
    ]);
    assert.deepEqual(kq.thieuCot, ["ten"]);
    assert.deepEqual(kq.cotLa, ["Cột lạ"]);
    assert.equal(kq.dong[0].duLieu.giaBan, "1.000.000");
  });
});

describe("Đọc số tiền trong CSV", () => {
  it("hiểu cách viết Việt Nam và quốc tế", () => {
    assert.equal(docSoTienCsv("15.200.000"), "15200000");
    assert.equal(docSoTienCsv("15,200,000"), "15200000");
    assert.equal(docSoTienCsv("15200000"), "15200000");
    assert.equal(docSoTienCsv("1.500.000 ₫"), "1500000");
    assert.equal(docSoTienCsv("12,5"), "12.5");
    assert.equal(docSoTienCsv("12.50"), "12.5");
  });
  it("ô trống hoặc ô ghi chữ ('liên hệ') = chưa có giá, không phải lỗi", () => {
    assert.equal(docSoTienCsv(""), null);
    assert.equal(docSoTienCsv("   "), null);
    assert.equal(docSoTienCsv("liên hệ"), null);
    assert.equal(docSoTienCsv("Liên Hệ"), null);
    assert.equal(docSoTienCsv("—"), null);
    assert.equal(docSoTienCsv("N/A"), null);
  });
  it("số âm, số viết sai, chữ lạ trong ô giá đều là lỗi (không âm thầm bỏ qua)", () => {
    assert.throws(() => docSoTienCsv("-5000"));
    assert.throws(() => docSoTienCsv("1.2.3"));
    assert.throws(() => docSoTienCsv("abc.def.ghi"));
    assert.throws(() => docSoTienCsv("mười lăm triệu"));
  });
});

describe("Ghi CSV", () => {
  it("có BOM, CRLF và bọc nháy khi ô chứa dấu phẩy", () => {
    const csv = taoCsv(["SKU", "Tên"], [["A1", "Laptop, 14 inch"]]);
    assert.ok(csv.startsWith("﻿"));
    assert.ok(csv.includes('"Laptop, 14 inch"'));
    assert.ok(csv.includes("\r\n"));
  });
  it("tệp mẫu đọc lại được và có đủ cột bắt buộc", () => {
    const kq = docBangCsv(mauCsv("gia-nha-cung-cap"), [
      { truong: "sku", ten: ["sku"], batBuoc: true },
      { truong: "giaMua", ten: ["gia mua"], batBuoc: true },
    ]);
    assert.deepEqual(kq.thieuCot, []);
    assert.equal(kq.dong.length, 1);
    assert.equal(docSoTienCsv(kq.dong[0].duLieu.giaMua), "15200000");
  });
});

describe("Số chứng từ nhà cung cấp", () => {
  it("NCC-0001", () => assert.equal(dinhDangSoChungTu(KIEU_SO.nhaCungCap, 1, "2026"), "NCC-0001"));
});
