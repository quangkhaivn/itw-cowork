import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  batBuocKhongCoTruongCam, coChuCam, giaHopLe, sanPhamChoAI, tinhTrangHang, TRUONG_DUOC_GUI_AI, type NguonSanPham, type SanPhamChoAI,
} from "../../src/modules/mang-xa-hoi/ai/du-lieu-san-pham";
import { loiNhacHeThong, loiNhacNguoiDung } from "../../src/modules/mang-xa-hoi/ai/loi-nhac";
import { HO_SO_TRONG } from "../../src/modules/mang-xa-hoi/thuong-hieu-thuan";

/**
 * 0.25.0 (QĐ-237) — DANH SÁCH TRẮNG dữ liệu sản phẩm gửi AI. Bài thử này PHẢI HỎNG nếu một trường giá vốn / nhà cung cấp /
 * lợi nhuận lọt vào dữ liệu hoặc lời nhắc gửi nhà cung cấp AI.
 */

const GIA_VON = 9_876_543;
const GIA_NHAP_NCC = 8_765_432;

/** Bản ghi sản phẩm "đầy đủ" như một lập trình viên lỡ tay truyền nguyên vào — có mọi trường cấm. */
function banGhiDayDu(): NguonSanPham {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sku: "LAP-DEMO-01",
    name: "Laptop DEMO 14 inch",
    model: "D14",
    description: "Máy nhẹ 1,2 kg, pin 12 giờ.\nGiá vốn nội bộ: 9.876.543 đ (không công khai)\nBảo hành tận nơi.\nNhà cung cấp: Công ty ABC",
    specifications: { CPU: "Core i5", RAM: "16 GB", "Giá nhập": "8.765.432", "Nhà cung cấp": "ABC", Margin: "12%", "Biên lợi nhuận": "12%", cost: "1" },
    unit: "cái",
    sellingPrice: { toString: () => "15990000.00" },
    vatRate: { toString: () => "10.0000" },
    warrantyMonths: 24,
    category: { name: "Laptop" },
    brand: { name: "DEMO" },
    quanLyTon: true,
    minStock: { toString: () => "3.000" },
    conBanDuoc: 7,
    // ---- Trường CẤM ----
    costPrice: { toString: () => String(GIA_VON) },
    giaVon: String(GIA_VON),
    defaultSupplier: { id: "x", code: "NCC01", name: "Công ty ABC" },
    defaultSupplierId: "22222222-2222-4222-8222-222222222222",
    supplierPrices: [{ price: GIA_NHAP_NCC, supplier: { name: "ABC" } }],
    bienLoiNhuan: "37.5",
    nhaCungCapMacDinh: { name: "ABC" },
  };
}

const KHOA_CAM = ["costPrice", "giaVon", "cost", "defaultSupplier", "defaultSupplierId", "supplierPrices", "supplier", "bienLoiNhuan", "margin", "nhaCungCap", "nhaCungCapMacDinh", "purchasePrice", "giaNhap"];

function tatCaKhoa(x: unknown, ds: string[] = []): string[] {
  if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { ds.push(k); tatCaKhoa(v, ds); }
  return ds;
}

describe("Dữ liệu sản phẩm gửi AI — danh sách trắng (QĐ-237)", () => {
  const sp = sanPhamChoAI(banGhiDayDu(), true);
  const json = JSON.stringify(sp);

  it("chỉ có khóa trong danh sách trắng", () => {
    for (const k of Object.keys(sp)) assert.ok((TRUONG_DUOC_GUI_AI as readonly string[]).includes(k), `khóa ngoài danh sách trắng: ${k}`);
  });
  it("KHÔNG có trường giá vốn / nhà cung cấp / lợi nhuận ở bất kỳ tầng nào", () => {
    const khoa = tatCaKhoa(sp).map((k) => k.toLowerCase());
    for (const c of KHOA_CAM) assert.ok(!khoa.includes(c.toLowerCase()), `lọt trường cấm: ${c}`);
  });
  it("KHÔNG có con số giá vốn / giá nhập, tên nhà cung cấp, biên lợi nhuận trong chuỗi gửi đi", () => {
    for (const s of [String(GIA_VON), "9.876.543", String(GIA_NHAP_NCC), "8.765.432", "ABC", "NCC01", "37.5", "12%"]) assert.ok(!json.includes(s), `lọt giá trị cấm: ${s}`);
    assert.ok(!/gi[aá] v[oố]n|nh[aà] cung c[aấ]p|gi[aá] nh[aậ]p|margin|l[oợ]i nhu[aậ]n/i.test(json), "lọt chữ liên quan giá vốn / nhà cung cấp");
  });
  it("giữ đúng giá bán thật (số nguyên VND), VAT, giá gồm VAT, tồn hiện tại", () => {
    assert.equal(sp.giaBan, 15_990_000);
    assert.equal(sp.vatPhanTram, 10);
    assert.equal(sp.giaGomVat, 17_589_000);
    assert.equal(sp.tinhTrangHang, "con-hang");
    assert.equal(sp.soLuongConBan, 7);
    assert.deepEqual(sp.thongSo, { CPU: "Core i5", RAM: "16 GB" });
    assert.equal(sp.moTa, "Máy nhẹ 1,2 kg, pin 12 giờ.\nBảo hành tận nơi.");
  });
  it("không có quyền xem tồn → chỉ tình trạng, không có con số", () => {
    const k = sanPhamChoAI(banGhiDayDu(), false);
    assert.equal(k.soLuongConBan, undefined);
    assert.ok(!("soLuongConBan" in k));
    assert.equal(k.tinhTrangHang, "con-hang");
  });
  it("lời nhắc gửi AI (hệ thống + người dùng) không chứa giá vốn / nhà cung cấp", () => {
    const nhac = loiNhacHeThong() + loiNhacNguoiDung({ sanPham: [sp], nenTang: ["FACEBOOK_PAGE", "INSTAGRAM"], hoSo: HO_SO_TRONG, yeuCau: null });
    for (const s of [String(GIA_VON), "9.876.543", String(GIA_NHAP_NCC), "ABC", "costPrice", "supplier", "bienLoiNhuan"]) assert.ok(!nhac.includes(s), `lời nhắc lọt: ${s}`);
    assert.ok(nhac.includes("15990000"), "lời nhắc phải có giá bán thật");
  });
  it("kiểm lần cuối ném lỗi khi có trường cấm (kể cả lồng sâu)", () => {
    assert.throws(() => batBuocKhongCoTruongCam([{ ...sp, costPrice: 1 } as unknown as SanPhamChoAI]), /trường cấm|ngoài danh sách trắng/);
    assert.throws(() => batBuocKhongCoTruongCam([{ ...sp, thongSo: { giaVon: "1" } } as unknown as SanPhamChoAI]), /trường cấm/);
    assert.throws(() => batBuocKhongCoTruongCam([{ ...sp, nhaCungCap: "ABC" } as unknown as SanPhamChoAI]), /trường cấm|ngoài danh sách trắng/);
    assert.doesNotThrow(() => batBuocKhongCoTruongCam([sp]));
  });
  it("chữ cấm nhận cả có dấu / không dấu", () => {
    for (const s of ["Giá vốn", "gia von", "GIÁ NHẬP", "Nhà cung cấp", "nha cung cap", "Lợi nhuận", "biên lợi nhuận", "COST", "Supplier", "giá đại lý"]) assert.ok(coChuCam(s), s);
    for (const s of ["Màn hình", "Pin 12 giờ", "Bảo hành 24 tháng", "Giá bán"]) assert.ok(!coChuCam(s), s);
  });
  it("tình trạng tồn: hết / sắp hết / không theo dõi; chưa có giá → null (AI không tự đặt)", () => {
    assert.equal(tinhTrangHang({ quanLyTon: true, conBanDuoc: 0, minStock: null }), "het-hang");
    assert.equal(tinhTrangHang({ quanLyTon: true, conBanDuoc: 2, minStock: 3 }), "sap-het");
    assert.equal(tinhTrangHang({ quanLyTon: false, conBanDuoc: 0, minStock: null }), "khong-theo-doi");
    const k = sanPhamChoAI({ sku: "X", name: "Dịch vụ", sellingPrice: null, quanLyTon: false }, true);
    assert.equal(k.giaBan, null);
    assert.equal(k.giaGomVat, null);
    assert.equal(k.soLuongConBan, undefined);
    assert.deepEqual([...giaHopLe([sp, k])].sort(), [15_990_000, 17_589_000]);
  });
});
