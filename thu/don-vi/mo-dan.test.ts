import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apCongTay, CO_CONG_TAY, type CongNgay } from "../../src/modules/cham-cong/tinh-toan";
import { phanTichCsvAnhXaPin } from "../../src/modules/cham-cong/nhap-csv";
import { butToanLuong, type DongTongHopButToan, type TaiKhoanLuong } from "../../src/modules/luong/tinh-toan";
import { docLoaiHopDong, docSoTien, phanTichCsvHoSoLuong } from "../../src/modules/luong/nhap-csv";
import { phamViCuaQuyen, VAI_TRO, kiemTraGioiHanAI } from "../../src/lib/vai-tro";
import { timMuc } from "../../src/modules/cau-hinh/danh-muc";

/** 0.22.0 — "Mở dần — bổ sung sau" (BUSINESS_RULES mục 33): phần thuần. */

describe("Mở dần — đặt công tay (QĐ-174)", () => {
  const vang: CongNgay = { vaoDau: null, raCuoi: null, giaTriCong: 0, phutMuon: 0, phutSom: 0, nghiNgay: 0, co: ["vang-mat"] };
  it("không có giá trị đặt tay → giữ nguyên", () => {
    assert.equal(apCongTay(vang, undefined), vang);
  });
  it("đặt 1 công → công = 1, bỏ cờ vắng, gắn cờ công nhập tay", () => {
    const k = apCongTay({ ...vang, phutMuon: 30 }, 1);
    assert.equal(k.giaTriCong, 1);
    assert.deepEqual(k.co, [CO_CONG_TAY]);
    assert.equal(k.phutMuon, 0);
  });
  it("đặt 0,5 giữ phần nghỉ phép", () => {
    const k = apCongTay({ ...vang, nghiNgay: 0.5 }, 0.5);
    assert.equal(k.giaTriCong, 0.5);
    assert.equal(k.nghiNgay, 0.5);
  });
});

describe("Mở dần — bút toán chi lương tách trả tay (QĐ-173)", () => {
  const tk: TaiKhoanLuong = { chiPhi: 6421, phaiTra: 334, bhxh: 3383, bhyt: 3384, bhtn: 3386, kpcd: 3382, thue: 3335, tamUng: 141, khauTruKhac: 1388, tien: 1121, tienMat: 1111 };
  const dong = (thucLinh: number, traTay: boolean): DongTongHopButToan => ({
    tongThuNhap: thucLinh, bhNld: { bhxh: 0, bhyt: 0, bhtn: 0 }, bhDn: { bhxh: 0, bhyt: 0, bhtn: 0, kpcd: 0 }, thue: 0, tamUng: 0, truKhac: 0, thucLinh, traTay,
  });
  it("đã chi: phần chuyển khoản Có 1121, phần trả tay Có 1111, tổng = thực lĩnh", () => {
    const bt = butToanLuong([dong(10_000_000, false), dong(3_000_000, true)], tk, true);
    assert.equal(bt.find((b) => b.co === 1121)?.soTien, 10_000_000);
    assert.equal(bt.find((b) => b.co === 1111)?.soTien, 3_000_000);
    assert.equal(bt.filter((b) => b.no === 334 && (b.co === 1121 || b.co === 1111)).reduce((a, b) => a + b.soTien, 0), 13_000_000);
  });
  it("không trả tay → không có dòng 1111; chưa khai tài khoản tiền mặt → dùng tài khoản tiền", () => {
    assert.ok(!butToanLuong([dong(5, false)], tk, true).some((b) => b.co === 1111));
    const { tienMat: _bo, ...tk2 } = tk;
    void _bo;
    assert.equal(butToanLuong([dong(7, true)], tk2, true).find((b) => b.dienGiai.includes("tiền mặt"))?.co, 1121);
  });
  it("chưa chi → không có bút toán trả lương", () => {
    assert.ok(!butToanLuong([dong(5, true)], tk, false).some((b) => b.co === 1111 || b.co === 1121));
  });
});

describe("Mở dần — CSV ánh xạ PIN ↔ email (QĐ-179)", () => {
  it("đọc đúng, email về chữ thường", () => {
    const r = phanTichCsvAnhXaPin("Mã chấm công,Email\n101,An@CTY.vn\n");
    assert.deepEqual(r.thieuCot, []);
    assert.deepEqual(r.dong, [{ soDong: 2, pin: "101", email: "an@cty.vn" }]);
  });
  it("thiếu cột → báo", () => {
    assert.ok(phanTichCsvAnhXaPin("PIN\n1\n").thieuCot.includes("Email"));
  });
  it("chống chèn công thức + PIN / email sai → lỗi theo dòng, dòng tốt vẫn nhận", () => {
    const r = phanTichCsvAnhXaPin("PIN,Email\n=1+1,a@b.vn\n12,@x.vn\n1 2,a@b.vn\n7,khongphaiemail\n8,c@d.vn\n");
    assert.equal(r.dong.length, 1);
    assert.equal(r.dong[0].pin, "8");
    assert.deepEqual(r.loi.map((l) => l.soDong), [2, 3, 4, 5]);
    assert.match(r.loi[0].lyDo, /công thức/);
  });
});

describe("Mở dần — CSV hồ sơ lương (QĐ-179)", () => {
  it("loại hợp đồng tiếng Việt / mã / trống", () => {
    assert.equal(docLoaiHopDong("Chính thức"), "chinh-thuc");
    assert.equal(docLoaiHopDong("thu-viec"), "thu-viec");
    assert.equal(docLoaiHopDong("Thời vụ"), "thoi-vu");
    assert.equal(docLoaiHopDong("Thực tập"), "thuc-tap");
    assert.equal(docLoaiHopDong(""), null);
    assert.equal(docLoaiHopDong("Bán thời gian xyz"), undefined);
  });
  it("số tiền dạng 12.500.000", () => {
    assert.equal(docSoTien("12.500.000"), 12_500_000);
    assert.equal(docSoTien("12,500,000 đ"), 12_500_000);
    assert.equal(docSoTien(""), null);
    assert.equal(docSoTien("-5"), undefined);
    assert.equal(docSoTien("abc"), undefined);
  });
  it("dòng hợp lệ + lỗi theo dòng + chống chèn công thức", () => {
    const csv = [
      "Email,Loại hợp đồng,Lương cơ bản,Lương đóng BH,Số tài khoản,Ngân hàng,Mã số thuế,Số người phụ thuộc",
      "a@cty.vn,Chính thức,15.000.000,5.310.000,0123456789,Vietcombank,0101234567,2",
      "b@cty.vn,,9000000,,,,,",
      "c@cty.vn,Chính thức,abc,,,,,",
      "d@cty.vn,Chính thức,1000,,,=HYPERLINK(\"x\"),,",
      "e@cty.vn,Chính thức,1000,,,,123,",
    ].join("\n");
    const r = phanTichCsvHoSoLuong(csv);
    assert.equal(r.dong.length, 2);
    assert.deepEqual({ ...r.dong[0] }, {
      soDong: 2, email: "a@cty.vn", loaiHopDong: "chinh-thuc", tyLeThuViec: null, luongCoBan: 15_000_000, luongDongBH: 5_310_000,
      soTaiKhoan: "0123456789", nganHang: "Vietcombank", maSoThue: "0101234567", soNguoiPhuThuoc: 2, hinhThucTra: null,
    });
    assert.equal(r.dong[1].loaiHopDong, null);
    assert.equal(r.dong[1].soTaiKhoan, null);
    assert.deepEqual(r.loi.map((l) => l.soDong), [4, 5, 6]);
    assert.match(r.loi[1].lyDo, /công thức/);
    assert.match(r.loi[2].lyDo, /mã số thuế/);
  });
  it("thiếu cột bắt buộc", () => {
    assert.ok(phanTichCsvHoSoLuong("Email\na@b.vn\n").thieuCot.includes("Lương cơ bản"));
  });
});

describe("Mở dần — quyền máy chấm công + Cấu hình (QĐ-176, QĐ-170, QĐ-177)", () => {
  it("Kỹ thuật, Trưởng kỹ thuật, Nhân sự có may_cham_cong.view/create/update phạm vi all; không có quyền lương / hồ sơ mới", () => {
    for (const code of ["technical", "technical-manager", "nhan-su-hr"]) {
      const dn = VAI_TRO.find((v) => v.code === code)!;
      assert.ok(dn.quyen !== "*");
      for (const hd of ["view", "create", "update"]) {
        assert.ok(dn.quyen.includes(`may_cham_cong.${hd}`), `${code} ${hd}`);
        assert.equal(phamViCuaQuyen(dn, `may_cham_cong.${hd}`), "all");
      }
    }
    const kt = VAI_TRO.find((v) => v.code === "technical")!;
    assert.ok(kt.quyen !== "*" && !kt.quyen.includes("nhan_su.view") && !kt.quyen.some((q) => q.startsWith("luong.") && q !== "luong.view"));
    const ai = VAI_TRO.find((v) => v.code === "ai-assistant")!;
    assert.ok(ai.quyen !== "*" && !ai.quyen.some((q) => q.startsWith("may_cham_cong.")));
    assert.ok(kiemTraGioiHanAI().dat);
  });
  it("migration 20261109090002 cấp đúng các vai trò như vai-tro.ts", () => {
    const sql = readFileSync("prisma/migrations/20261109090002_may_cham_cong_cap_quyen/migration.sql", "utf8");
    const vaiTro = /r\."code" IN \(('technical-manager'[^)]*)\)/.exec(sql)?.[1].match(/'([a-z-]+)'/g)?.map((x) => x.slice(1, -1)).sort();
    const coQuyen = VAI_TRO.filter((v) => v.quyen !== "*" && v.quyen.includes("may_cham_cong.view")).map((v) => v.code).sort();
    assert.deepEqual(vaiTro, coQuyen);
    assert.match(sql, /p\."code" IN \('may_cham_cong\.view', 'may_cham_cong\.create', 'may_cham_cong\.update'\)/);
  });
  it("khóa Cấu hình mới có mặc định đúng", () => {
    assert.equal(timMuc("luong.chan_khi_tham_so_chua_xac_nhan")?.macDinh, 0);
    assert.equal(timMuc("luong.bat_buoc_2_lop")?.macDinh, 1);
    assert.equal(timMuc("luong.tk_tien_mat")?.macDinh, 1111);
  });
});
