/**
 * Kiểm thử đơn vị phần thuần của Marketing và thu lead (0.16.0). Không cần cơ sở dữ liệu.
 * Luật: BUSINESS_RULES.md mục 21 (MK). Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canDuyetNganSach,
  cheDienThoai,
  cheEmail,
  chonTheoVongTron,
  chuanHoaUtmCampaign,
  chuyenTrangThaiHopLe,
  congChiSo,
  docUtm,
  hanGoiLai,
  khoaNhanDien,
  kiemTraDuLieuForm,
  laSlugHopLe,
  taoSlug,
  tinhChiSoChienDich,
  tyLePhanTram,
} from "../../src/modules/marketing/tinh-toan";
import { docKhoi, khoiMoi, LuocDoDanhSachKhoi, LuocDoKhoi, MAU_KHOI_MAC_DINH, NHAN_KHOI } from "../../src/modules/marketing/khoi-landing";
import { LuocDoForm, LuocDoPhanKhuc, LuocDoThanWebhook, LuocDoTaoChienDich } from "../../src/modules/marketing/luoc-do";
import { bamKhoa, khopBam, sinhKhoa } from "../../src/modules/marketing/webhook";
import { LA_MA_DOANH_NGHIEP } from "../../src/modules/marketing/cong-khai";
import { dinhDangSoChungTu, KIEU_SO } from "../../src/lib/so-chung-tu";
import { VAI_TRO } from "../../src/lib/vai-tro";
import { DANH_MUC_CAU_HINH } from "../../src/modules/cau-hinh/danh-muc";

describe("Chỉ số chiến dịch (MK-05)", () => {
  it("CPL = chi phí / lead, ROAS = doanh thu / chi phí", () => {
    const c = tinhChiSoChienDich({ chiPhi: 4_000_000, soLead: 3, soDuDieuKien: 2, soChuyenDoi: 1, doanhThu: 22_000_000 });
    assert.equal(c.cpl, 1_333_333);
    assert.equal(c.roas, 5.5);
    assert.equal(c.tyLeDuDieuKien, 66.7);
    assert.equal(c.tyLeChuyenDoi, 33.3);
  });
  it("mẫu số 0 → null, không phải 0", () => {
    const c = tinhChiSoChienDich({ chiPhi: 0, soLead: 0, soDuDieuKien: 0, soChuyenDoi: 0, doanhThu: 0 });
    assert.equal(c.cpl, null);
    assert.equal(c.roas, null);
    assert.equal(c.tyLeChuyenDoi, null);
    assert.equal(tyLePhanTram(5, 0), null);
  });
  it("có lead mà chưa chi đồng nào → CPL 0 (con số thật), ROAS null", () => {
    const c = tinhChiSoChienDich({ chiPhi: 0, soLead: 4, soDuDieuKien: 0, soChuyenDoi: 0, doanhThu: 1_000_000 });
    assert.equal(c.cpl, 0);
    assert.equal(c.roas, null);
  });
  it("dòng tổng cộng đầu vào rồi tính lại, không cộng tỷ lệ", () => {
    const t = congChiSo([
      { chiPhi: 1_000_000, soLead: 1, soDuDieuKien: 0, soChuyenDoi: 0, doanhThu: 0 },
      { chiPhi: 3_000_000, soLead: 3, soDuDieuKien: 1, soChuyenDoi: 1, doanhThu: 8_000_000 },
    ]);
    assert.equal(t.cpl, 1_000_000);
    assert.equal(t.roas, 2);
    assert.equal(t.tyLeChuyenDoi, 25);
  });
});

describe("Duyệt ngân sách và vòng đời chiến dịch (MK-03)", () => {
  it("ngân sách 0 không cần duyệt; > 0 mà chưa duyệt / vượt mức đã duyệt thì cần", () => {
    assert.equal(canDuyetNganSach(0, null), false);
    assert.equal(canDuyetNganSach(10, null), true);
    assert.equal(canDuyetNganSach(10, 10), false);
    assert.equal(canDuyetNganSach(10, 15), false);
    assert.equal(canDuyetNganSach(16, 15), true);
  });
  it("bước chuyển hợp lệ", () => {
    assert.ok(chuyenTrangThaiHopLe("ke-hoach", "cho-duyet"));
    assert.ok(chuyenTrangThaiHopLe("dang-chay", "tam-dung"));
    assert.ok(chuyenTrangThaiHopLe("tam-dung", "dang-chay"));
    assert.ok(!chuyenTrangThaiHopLe("dang-chay", "huy"));
    assert.ok(!chuyenTrangThaiHopLe("ket-thuc", "dang-chay"));
    assert.ok(!chuyenTrangThaiHopLe("huy", "ke-hoach"));
    assert.ok(!chuyenTrangThaiHopLe("cho-duyet", "dang-chay"), "phải qua bước duyệt riêng");
  });
  it("mã chiến dịch CD-<năm>-0001", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.chienDich, 7, "2026"), "CD-2026-0007");
  });
  it("lược đồ: ngày kết thúc phải sau ngày bắt đầu, ngân sách không âm", () => {
    assert.ok(!LuocDoTaoChienDich.safeParse({ ten: "Abc", kenh: "zalo", ngayBatDau: "2026-10-10", ngayKetThuc: "2026-10-01" }).success);
    assert.ok(!LuocDoTaoChienDich.safeParse({ ten: "Abc", kenh: "zalo", nganSach: "-5" }).success);
    assert.ok(!LuocDoTaoChienDich.safeParse({ ten: "Abc", kenh: "radio" }).success);
    assert.equal(LuocDoTaoChienDich.parse({ ten: "Abc", kenh: "zalo", nganSach: "12.500.000" }).nganSach, "12500000");
  });
});

describe("Chia lead và hạn gọi lại (MK-08, MK-09)", () => {
  it("vòng tròn theo số đếm 1, 2, 3…", () => {
    const ds = ["a", "b", "c"];
    assert.deepEqual([1, 2, 3, 4, 5].map((n) => chonTheoVongTron(ds, n)), ["a", "b", "c", "a", "b"]);
    assert.equal(chonTheoVongTron([], 1), null);
    assert.equal(chonTheoVongTron(["x"], 0), "x");
  });
  it("hạn gọi lại = lúc nhận + số phút; chưa đặt → null", () => {
    const luc = new Date("2026-10-12T02:00:00Z");
    assert.equal(hanGoiLai(luc, 30)?.toISOString(), "2026-10-12T02:30:00.000Z");
    assert.equal(hanGoiLai(luc, null), null);
    assert.equal(hanGoiLai(luc, 0), null);
  });
  it("ngưỡng gọi lại khai trong Cấu hình, mặc định chưa đặt (NM-07)", () => {
    const m = DANH_MUC_CAU_HINH.find((x) => x.khoa === "marketing.phut_goi_lai_lead");
    assert.ok(m);
    assert.equal(m.macDinh, null);
  });
});

describe("Che liên lạc (MK-15)", () => {
  it("che điện thoại và email", () => {
    assert.equal(cheDienThoai("0909123456"), "0909***456");
    assert.equal(cheDienThoai("+84 909 123 456"), "8490***456");
    assert.equal(cheDienThoai("12"), "***");
    assert.equal(cheDienThoai(null), null);
    assert.equal(cheEmail("nguyen.van.a@abc.vn"), "n***@abc.vn");
    assert.equal(cheEmail("khong-co-a-cong"), "***");
  });
  it("Thực tập sinh Marketing không có crm.view / customer.view → luôn bị che", () => {
    const tts = VAI_TRO.find((v) => v.code === "marketing-intern")!;
    assert.ok(Array.isArray(tts.quyen));
    assert.ok(!(tts.quyen as string[]).includes("crm.view"));
    assert.ok(!(tts.quyen as string[]).includes("customer.view"));
  });
});

describe("Đường dẫn công khai, UTM (MK-10, MK-11)", () => {
  it("slug bỏ dấu, gạch nối", () => {
    assert.equal(taoSlug("Khuyến mãi Camera Tết 2027!"), "khuyen-mai-camera-tet-2027");
    assert.equal(taoSlug("  Đăng ký  "), "dang-ky");
    assert.ok(laSlugHopLe("camera-tet"));
    assert.ok(!laSlugHopLe("-camera"));
    assert.ok(!laSlugHopLe("Camera"));
    assert.ok(!laSlugHopLe("../etc"));
  });
  it("utm_campaign so khớp không phân biệt hoa thường, bỏ dấu", () => {
    assert.equal(chuanHoaUtmCampaign("Camera-Tết-2027"), "camera-tet-2027");
    assert.equal(chuanHoaUtmCampaign("  "), null);
    assert.equal(chuanHoaUtmCampaign("fb_ads_10"), "fb_ads_10");
  });
  it("đọc 5 khóa UTM, cắt 120 ký tự, bỏ khóa lạ", () => {
    const u = docUtm({ utm_source: " facebook ", utm_campaign: "x".repeat(200), khac: "y" });
    assert.equal(u.utm_source, "facebook");
    assert.equal(u.utm_campaign?.length, 120);
    assert.equal(u.utm_medium, null);
    assert.ok(!("khac" in u));
  });
  it("mã doanh nghiệp trên URL chỉ nhận ký tự an toàn", () => {
    assert.ok(LA_MA_DOANH_NGHIEP.test("itw"));
    assert.ok(!LA_MA_DOANH_NGHIEP.test("ITW"));
    assert.ok(!LA_MA_DOANH_NGHIEP.test("itw;drop"));
    assert.ok(!LA_MA_DOANH_NGHIEP.test(""));
  });
});

describe("Kiểm dữ liệu form công khai (MK-11, LD-02)", () => {
  const truong = [
    { khoa: "hoTen" as const, nhan: "Họ tên", batBuoc: true },
    { khoa: "dienThoai" as const, nhan: "Số điện thoại", batBuoc: false },
    { khoa: "email" as const, nhan: "Email", batBuoc: false },
  ];
  it("nhận đúng trường đã khai, bỏ trường lạ", () => {
    const { duLieu, loi } = kiemTraDuLieuForm(truong, { hoTen: " An ", dienThoai: "0909 111 222", nguoiPhuTrachId: "x", giaiDoan: "CONVERTED" });
    assert.deepEqual(loi, {});
    assert.deepEqual(duLieu, { hoTen: "An", dienThoai: "0909 111 222" });
  });
  it("thiếu bắt buộc, SĐT sai, email sai, quá dài", () => {
    assert.ok(kiemTraDuLieuForm(truong, { dienThoai: "0909111222" }).loi.hoTen);
    assert.ok(kiemTraDuLieuForm(truong, { hoTen: "An", dienThoai: "12" }).loi.dienThoai);
    assert.ok(kiemTraDuLieuForm(truong, { hoTen: "An", email: "abc" }).loi.email);
    assert.ok(kiemTraDuLieuForm(truong, { hoTen: "x".repeat(256), email: "a@b.vn" }).loi.hoTen);
  });
  it("phải có SĐT hoặc email", () => {
    assert.ok(kiemTraDuLieuForm(truong, { hoTen: "An" }).loi.dienThoai);
    assert.deepEqual(kiemTraDuLieuForm(truong, { hoTen: "An", email: "a@b.vn" }).loi, {});
  });
  it("giá trị không phải chuỗi bị coi như trống", () => {
    assert.ok(kiemTraDuLieuForm(truong, { hoTen: { $gt: "" }, email: "a@b.vn" }).loi.hoTen);
  });
  it("khóa nhận diện chuẩn hóa, giá trị hỏng thành null", () => {
    assert.deepEqual(khoaNhanDien({ dienThoai: "+84 909 111 222", email: " A@B.VN ", maSoThue: "123" }), { dienThoai: "0909111222", email: "a@b.vn", maSoThue: null });
  });
  it("lược đồ form: trường ngoài danh mục, trùng trường, thiếu liên lạc bị chặn; nhãn mặc định", () => {
    assert.ok(!LuocDoForm.safeParse({ ten: "Form", tieuDe: "Form", truong: [{ khoa: "ownerId" }, { khoa: "hoTen" }, { khoa: "email" }] }).success);
    assert.ok(!LuocDoForm.safeParse({ ten: "Form", tieuDe: "Form", truong: [{ khoa: "hoTen" }, { khoa: "email" }, { khoa: "email" }] }).success);
    assert.ok(!LuocDoForm.safeParse({ ten: "Form", tieuDe: "Form", truong: [{ khoa: "hoTen" }] }).success);
    const ok = LuocDoForm.parse({ ten: "Form", tieuDe: "Form", truong: [{ khoa: "hoTen" }, { khoa: "dienThoai", nhan: "SĐT Zalo" }] });
    assert.equal(ok.truong[0].nhan, "Họ tên");
    assert.equal(ok.truong[1].nhan, "SĐT Zalo");
  });
});

describe("Webhook (MK-12)", () => {
  it("khóa ngẫu nhiên, băm SHA-256 hex, so khớp thời gian hằng", () => {
    const a = sinhKhoa();
    const b = sinhKhoa();
    assert.notEqual(a, b);
    assert.ok(a.startsWith("cwk_") && a.length > 30);
    assert.match(bamKhoa(a), /^[0-9a-f]{64}$/);
    assert.ok(khopBam(bamKhoa(a), bamKhoa(a)));
    assert.ok(!khopBam(bamKhoa(a), bamKhoa(b)));
    assert.ok(!khopBam(bamKhoa(a), "ngan"));
  });
  it("thân webhook nhận tên trường kiểu Zapier, bỏ trường lạ", () => {
    const d = LuocDoThanWebhook.parse({ full_name: "An", phone_number: "0909", company_name: "ITW", la: 1 });
    assert.equal(d.hoTen, "An");
    assert.equal(d.dienThoai, "0909");
    assert.equal(d.congTy, "ITW");
    assert.equal(d.dongYNhanTin, false);
    assert.ok(!LuocDoThanWebhook.safeParse({ hoTen: "x".repeat(300) }).success);
  });
});

describe("Phân khúc (MK-14)", () => {
  it("chỉ nhận trường trong danh mục", () => {
    assert.ok(LuocDoPhanKhuc.safeParse({ doiTuong: "lead", dieuKien: { nguon: ["facebook"], dongYNhanTin: "co" } }).success);
    assert.ok(!LuocDoPhanKhuc.safeParse({ doiTuong: "lead", dieuKien: { where: "1=1" } }).success);
    assert.ok(!LuocDoPhanKhuc.safeParse({ doiTuong: "lead", dieuKien: { phanKhuc: ["x"] } }).success, "phân khúc khách không áp cho lead");
    assert.ok(LuocDoPhanKhuc.safeParse({ doiTuong: "lien-he", dieuKien: { phanKhuc: ["nha-may"], tinhThanh: ["Hồ Chí Minh"] } }).success);
    assert.ok(!LuocDoPhanKhuc.safeParse({ doiTuong: "khach", dieuKien: {} }).success);
  });
});

describe("Khối landing page (MK-16)", () => {
  it("mọi loại khối có nhãn và khối mặc định hợp lệ (trừ ảnh cần URL thật)", () => {
    for (const loai of Object.keys(NHAN_KHOI) as (keyof typeof NHAN_KHOI)[]) {
      const k = khoiMoi(loai);
      assert.equal(k.loai, loai);
      if (loai !== "anh") assert.ok(LuocDoKhoi.safeParse(k).success, loai);
    }
    assert.ok(LuocDoDanhSachKhoi.safeParse(MAU_KHOI_MAC_DINH).success);
  });
  it("chặn URL không phải https, thuộc tính lạ, quá nhiều khối", () => {
    assert.ok(!LuocDoKhoi.safeParse({ loai: "anh", url: "javascript:alert(1)", moTa: "x" }).success);
    assert.ok(!LuocDoKhoi.safeParse({ loai: "anh", url: "http://a.vn/x.png", moTa: "x" }).success);
    assert.ok(!LuocDoKhoi.safeParse({ loai: "anh", url: "data:image/png;base64,AAA", moTa: "x" }).success);
    assert.ok(LuocDoKhoi.safeParse({ loai: "anh", url: "https://a.vn/x.png", moTa: "Ảnh camera" }).success);
    assert.ok(!LuocDoKhoi.safeParse({ loai: "doan-van", noiDung: "x", html: "<script>" }).success);
    assert.ok(!LuocDoKhoi.safeParse({ loai: "script", noiDung: "x" }).success);
    assert.ok(!LuocDoKhoi.safeParse({ loai: "nut-goi", nhan: "Gọi", kieu: "lien-ket", giaTri: "javascript:alert(1)" }).success);
    assert.ok(!LuocDoKhoi.safeParse({ loai: "nut-goi", nhan: "Gọi", kieu: "dien-thoai", giaTri: "abc" }).success);
    assert.ok(!LuocDoDanhSachKhoi.safeParse(Array.from({ length: 31 }, () => ({ loai: "form" }))).success);
  });
  it("đọc khối hỏng → null", () => {
    assert.equal(docKhoi([{ loai: "la" }]), null);
    assert.equal(docKhoi("abc"), null);
    assert.equal(docKhoi([{ loai: "form", tieuDe: "" }])?.length, 1);
  });
});
