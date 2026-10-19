/**
 * Kiểm thử đơn vị phần thuần của 0.17.0 — Công việc thông suốt.
 * Luật: BUSINESS_RULES.md mục 27 (CV-04 → CV-11) và mục 28 (HS-01 → HS-04).
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DO_DAI_KET_QUA_TOI_THIEU, kiemTraTruocKhiXong, type DauVaoKiemTra } from "../../src/modules/cong-viec/kiem-tra";
import { danhGiaHoSoKhach, type DauVaoHoSo } from "../../src/modules/khach-hang/ho-so";
import { DANH_GIA_KET_QUA, NHAN_DANH_GIA_KET_QUA } from "../../src/modules/crm/hang-so";
import { LuocDoSuaViec, LuocDoTaoViec, TOI_DA_MUC_KIEM_TRA } from "../../src/modules/cong-viec/service";

const DU: DauVaoKiemTra = {
  trangThai: "dang-lam",
  ketQua: "Đã gọi khách, khách đồng ý hẹn khảo sát thứ Năm.",
  danhGia: "dat",
  mucKiemTra: [],
  coViecTiepTheo: false,
  hoSoKhach: null,
};
const ma = (kq: ReturnType<typeof kiemTraTruocKhiXong>) => kq.loi.map((l) => l.ma);

describe("CV-06: kiểm tra trước khi xong", () => {
  it("đủ kết quả + đánh giá + không có mục kiểm tra thì cho xong", () => {
    const kq = kiemTraTruocKhiXong(DU);
    assert.equal(kq.duocXong, true);
    assert.deepEqual(kq.loi, []);
  });

  it("thiếu kết quả bị chặn; kết quả toàn khoảng trắng cũng là thiếu", () => {
    assert.deepEqual(ma(kiemTraTruocKhiXong({ ...DU, ketQua: null })), ["thieu-ket-qua"]);
    assert.deepEqual(ma(kiemTraTruocKhiXong({ ...DU, ketQua: "            " })), ["thieu-ket-qua"]);
  });

  it(`kết quả ngắn hơn ${DO_DAI_KET_QUA_TOI_THIEU} ký tự bị chặn, đúng ${DO_DAI_KET_QUA_TOI_THIEU} ký tự thì qua`, () => {
    assert.deepEqual(ma(kiemTraTruocKhiXong({ ...DU, ketQua: "x".repeat(DO_DAI_KET_QUA_TOI_THIEU - 1) })), ["thieu-ket-qua"]);
    assert.equal(kiemTraTruocKhiXong({ ...DU, ketQua: "x".repeat(DO_DAI_KET_QUA_TOI_THIEU) }).duocXong, true);
    // Khoảng trắng hai đầu không được tính vào độ dài.
    assert.equal(kiemTraTruocKhiXong({ ...DU, ketQua: `   ${"x".repeat(DO_DAI_KET_QUA_TOI_THIEU - 1)}   ` }).duocXong, false);
  });

  it("thiếu đánh giá bị chặn", () => {
    assert.deepEqual(ma(kiemTraTruocKhiXong({ ...DU, danhGia: null })), ["thieu-danh-gia"]);
  });

  it("mục kiểm tra bắt buộc chưa tích thì chặn và nêu đúng tên mục", () => {
    const kq = kiemTraTruocKhiXong({
      ...DU,
      mucKiemTra: [
        { nhan: "Chụp ảnh tủ rack", batBuoc: true, daTich: false },
        { nhan: "Khách ký biên bản", batBuoc: true, daTich: true },
        { nhan: "Dán tem bảo hành", batBuoc: true, daTich: false },
      ],
    });
    assert.deepEqual(ma(kq), ["muc-kiem-tra-chua-xong"]);
    assert.match(kq.loi[0].thongBao, /Còn 2 mục/);
    assert.match(kq.loi[0].thongBao, /Chụp ảnh tủ rack/);
    assert.match(kq.loi[0].thongBao, /Dán tem bảo hành/);
    assert.doesNotMatch(kq.loi[0].thongBao, /Khách ký biên bản/);
  });

  it("mục không bắt buộc chưa tích chỉ cảnh báo, không chặn", () => {
    const kq = kiemTraTruocKhiXong({ ...DU, mucKiemTra: [{ nhan: "Gửi ảnh vào nhóm Zalo", batBuoc: false, daTich: false }] });
    assert.equal(kq.duocXong, true);
    assert.deepEqual(kq.canhBao.map((c) => c.ma), ["muc-tuy-chon-chua-tich"]);
  });

  it("CV-09: 'Cần làm tiếp' mà không hẹn việc tiếp theo thì chặn; có hẹn thì qua", () => {
    assert.deepEqual(ma(kiemTraTruocKhiXong({ ...DU, danhGia: "can-theo-doi" })), ["thieu-viec-tiep-theo"]);
    assert.equal(kiemTraTruocKhiXong({ ...DU, danhGia: "can-theo-doi", coViecTiepTheo: true }).duocXong, true);
    // Đánh giá khác không đòi việc tiếp theo.
    for (const dg of ["dat", "mot-phan", "khong-dat"]) assert.equal(kiemTraTruocKhiXong({ ...DU, danhGia: dg }).duocXong, true);
  });

  it("việc đã hủy không đánh dấu xong thẳng được", () => {
    assert.ok(ma(kiemTraTruocKhiXong({ ...DU, trangThai: "huy" })).includes("viec-da-huy"));
  });

  it("HS-04: hồ sơ khách thiếu chỉ cảnh báo, không chặn", () => {
    const kq = kiemTraTruocKhiXong({ ...DU, hoSoKhach: { tenKhach: "Công ty A", thieuBatBuoc: ["mã số thuế", "người liên hệ"] } });
    assert.equal(kq.duocXong, true);
    assert.equal(kq.canhBao.length, 1);
    assert.match(kq.canhBao[0].thongBao, /mã số thuế, người liên hệ/);
    // Hồ sơ đủ thì không có cảnh báo.
    assert.deepEqual(kiemTraTruocKhiXong({ ...DU, hoSoKhach: { tenKhach: "Công ty A", thieuBatBuoc: [] } }).canhBao, []);
  });

  it("gom MỌI lỗi một lần — người làm sửa một lượt, không phải bấm lại nhiều lần", () => {
    const kq = kiemTraTruocKhiXong({
      trangThai: "mo",
      ketQua: "",
      danhGia: null,
      mucKiemTra: [{ nhan: "Test camera", batBuoc: true, daTich: false }],
      coViecTiepTheo: false,
    });
    assert.deepEqual(ma(kq).sort(), ["muc-kiem-tra-chua-xong", "thieu-danh-gia", "thieu-ket-qua"]);
  });
});

describe("CV-04: đánh giá kết quả", () => {
  it("mọi đánh giá đều có nhãn tiếng Việt", () => {
    for (const d of DANH_GIA_KET_QUA) assert.ok(NHAN_DANH_GIA_KET_QUA[d], d);
  });
  it("lược đồ sửa việc từ chối đánh giá lạ", () => {
    assert.throws(() => LuocDoSuaViec.parse({ danhGia: "tuyet-voi" }));
    assert.equal(LuocDoSuaViec.parse({ danhGia: "dat", ketQua: "  " }).ketQua, null);
  });
  it(`lược đồ tạo việc nhận tối đa ${TOI_DA_MUC_KIEM_TRA} mục kiểm tra, mặc định bắt buộc`, () => {
    const kq = LuocDoTaoViec.parse({ tieuDe: "Lắp camera", mucKiemTra: [{ nhan: "Test góc quay" }] });
    assert.equal(kq.mucKiemTra[0].batBuoc, true);
    assert.throws(() => LuocDoTaoViec.parse({ tieuDe: "Lắp camera", mucKiemTra: Array.from({ length: TOI_DA_MUC_KIEM_TRA + 1 }, (_, i) => ({ nhan: `Mục ${i}` })) }));
    assert.throws(() => LuocDoTaoViec.parse({ tieuDe: "Lắp camera", mucKiemTra: [{ nhan: " a " }] }));
    // Không gửi mục nào thì là mảng rỗng, không phải undefined.
    assert.deepEqual(LuocDoTaoViec.parse({ tieuDe: "Gọi khách" }).mucKiemTra, []);
  });
});

const DOANH_NGHIEP_DU: DauVaoHoSo = {
  loaiKhach: "doanh-nghiep",
  maSoThue: "0305547654",
  dienThoai: "0918764466",
  email: "ketoan@abc.vn",
  diaChi: "748 Lạc Long Quân",
  tinhThanh: "TP. Hồ Chí Minh",
  nganh: "thuong-mai",
  nguon: "gioi-thieu",
  soLienHe: 1,
};

describe("HS-01 → HS-03: độ đầy đủ hồ sơ khách", () => {
  it("doanh nghiệp đủ mọi trường: 100 điểm, Đầy đủ", () => {
    const kq = danhGiaHoSoKhach(DOANH_NGHIEP_DU);
    assert.equal(kq.diem, 100);
    assert.equal(kq.mucDo, "day-du");
    assert.deepEqual(kq.thieuBatBuoc, []);
  });

  it("doanh nghiệp thiếu mã số thuế và người liên hệ: thiếu bắt buộc", () => {
    const kq = danhGiaHoSoKhach({ ...DOANH_NGHIEP_DU, maSoThue: null, soLienHe: 0 });
    assert.equal(kq.mucDo, "thieu-bat-buoc");
    assert.deepEqual(kq.thieuBatBuoc, ["mã số thuế", "người liên hệ"]);
    assert.ok(kq.diem < 100);
  });

  it("khách cá nhân KHÔNG bị trừ điểm vì thiếu mã số thuế / người liên hệ / ngành", () => {
    const kq = danhGiaHoSoKhach({ ...DOANH_NGHIEP_DU, loaiKhach: "ca-nhan", maSoThue: null, soLienHe: 0, nganh: null });
    assert.equal(kq.diem, 100);
    assert.equal(kq.mucDo, "day-du");
    assert.ok(!kq.truong.some((t) => t.ma === "ma-so-thue"));
  });

  it("chưa chọn loại khách: bắt buộc chọn, và đòi như pháp nhân (an toàn hơn bỏ sót mã số thuế)", () => {
    const kq = danhGiaHoSoKhach({ ...DOANH_NGHIEP_DU, loaiKhach: null, maSoThue: null });
    assert.deepEqual(kq.thieuBatBuoc, ["loại khách", "mã số thuế"]);
  });

  it("có điện thoại HOẶC email là liên lạc được; thiếu cả hai là thiếu bắt buộc", () => {
    assert.ok(!danhGiaHoSoKhach({ ...DOANH_NGHIEP_DU, email: null }).thieuBatBuoc.length);
    assert.ok(!danhGiaHoSoKhach({ ...DOANH_NGHIEP_DU, dienThoai: null }).thieuBatBuoc.length);
    assert.deepEqual(danhGiaHoSoKhach({ ...DOANH_NGHIEP_DU, dienThoai: " ", email: "" }).thieuBatBuoc, ["điện thoại hoặc email"]);
  });

  it("thiếu trường nên có thì 'Nên bổ sung', không phải thiếu bắt buộc", () => {
    const kq = danhGiaHoSoKhach({ ...DOANH_NGHIEP_DU, diaChi: null, nguon: null });
    assert.equal(kq.mucDo, "can-bo-sung");
    assert.deepEqual(kq.thieuNenCo, ["địa chỉ", "nguồn khách"]);
  });

  it("hồ sơ trống hoàn toàn: 0 điểm", () => {
    const kq = danhGiaHoSoKhach({ loaiKhach: null, maSoThue: null, dienThoai: null, email: null, diaChi: null, tinhThanh: null, nganh: null, nguon: null, soLienHe: 0 });
    assert.equal(kq.diem, 0);
    assert.equal(kq.mucDo, "thieu-bat-buoc");
  });

  it("điểm luôn nằm trong 0–100 và mỗi trường thiếu có gợi ý chỗ bổ sung", () => {
    const kq = danhGiaHoSoKhach({ ...DOANH_NGHIEP_DU, email: null, nganh: null });
    assert.ok(kq.diem >= 0 && kq.diem <= 100);
    for (const t of kq.truong) assert.ok(t.goiY.length > 0, t.ma);
  });
});
