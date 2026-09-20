/**
 * Kiểm thử đơn vị phần thuần của Phase 6 — bảo hành, bàn dịch vụ, dự án.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mucBaoHanh, ngayHetHan, NHAN_MUC_BAO_HANH, NHAN_TRANG_THAI_BAO_HANH, soNgayConLai, TRANG_THAI_BAO_HANH } from "../../src/modules/bao-hanh/tinh-toan";
import {
  chuyenDuoc, dangMo, daDongPhieu, hanSla, LOAI_PHIEU, LOP_TRANG_THAI_PHIEU, mucSla,
  NHAN_LOAI_PHIEU, NHAN_TRANG_THAI_PHIEU, NHAN_UU_TIEN_PHIEU, TRANG_THAI_PHIEU, UU_TIEN_PHIEU,
} from "../../src/modules/ho-tro/tinh-toan";
import {
  chuyenDuocDuAn, dangChayDuAn, daDongDuAn, LOP_TRANG_THAI_DU_AN, NHAN_TRANG_THAI_DU_AN,
  quaHanDuAn, tienDoDuAn, TRANG_THAI_DU_AN,
} from "../../src/modules/du-an/tinh-toan";
import { dinhDangSoChungTu, KIEU_SO } from "../../src/lib/so-chung-tu";

describe("Thời hạn bảo hành", () => {
  it("12 tháng từ 20/09/2026 hết ngày 19/09/2027", () => {
    assert.equal(ngayHetHan("2026-09-20", 12), "2027-09-19");
  });
  it("24 tháng và 36 tháng", () => {
    assert.equal(ngayHetHan("2026-09-20", 24), "2028-09-19");
    assert.equal(ngayHetHan("2026-01-01", 36), "2028-12-31");
  });
  it("ngày 31 cộng sang tháng chỉ có 30 ngày thì lùi về ngày cuối tháng", () => {
    assert.equal(ngayHetHan("2026-01-31", 1), "2026-02-27");
    assert.equal(ngayHetHan("2026-03-31", 1), "2026-04-29");
  });
  it("0 tháng = không có bảo hành, hết ngay ngày giao", () => {
    assert.equal(ngayHetHan("2026-09-20", 0), "2026-09-20");
  });
  it("số ngày còn lại tính theo ngày, âm khi đã hết", () => {
    assert.equal(soNgayConLai("2026-09-25", "2026-09-20"), 5);
    assert.equal(soNgayConLai("2026-09-20", "2026-09-20"), 0);
    assert.equal(soNgayConLai("2026-09-15", "2026-09-20"), -5);
  });
});

describe("Tình trạng bảo hành", () => {
  it("mọi trạng thái đều có nhãn tiếng Việt", () => {
    for (const t of TRANG_THAI_BAO_HANH) assert.ok(NHAN_TRANG_THAI_BAO_HANH[t], t);
  });
  it("còn hạn, sắp hết theo ngưỡng, hết hạn", () => {
    assert.equal(mucBaoHanh("hieu-luc", "2026-12-31", "2026-09-20", 30), "con-han");
    assert.equal(mucBaoHanh("hieu-luc", "2026-10-10", "2026-09-20", 30), "sap-het");
    assert.equal(mucBaoHanh("hieu-luc", "2026-09-19", "2026-09-20", 30), "het-han");
  });
  it("chưa đặt ngưỡng thì KHÔNG tự bịa mức sắp hết", () => {
    assert.equal(mucBaoHanh("hieu-luc", "2026-09-21", "2026-09-20", null), "con-han");
  });
  it("bảo hành đã hủy giữ nguyên trạng thái hủy", () => {
    assert.equal(mucBaoHanh("huy", "2026-12-31", "2026-09-20", 30), "huy");
  });
  it("mọi mức đều có nhãn hiển thị", () => {
    for (const m of ["con-han", "sap-het", "het-han", "huy"] as const) assert.ok(NHAN_MUC_BAO_HANH[m].nhan, m);
  });
});

describe("Phiếu hỗ trợ — danh mục và trạng thái", () => {
  it("loại, mức ưu tiên, trạng thái đều có nhãn tiếng Việt", () => {
    for (const l of LOAI_PHIEU) assert.ok(NHAN_LOAI_PHIEU[l], l);
    for (const u of UU_TIEN_PHIEU) assert.ok(NHAN_UU_TIEN_PHIEU[u], u);
    for (const t of TRANG_THAI_PHIEU) {
      assert.ok(NHAN_TRANG_THAI_PHIEU[t], t);
      assert.ok(t in LOP_TRANG_THAI_PHIEU, t);
    }
  });
  it("phân nhóm đang mở / đã đóng", () => {
    assert.equal(dangMo("MOI"), true);
    assert.equal(dangMo("CHO_KHACH"), true);
    assert.equal(dangMo("HOAN_THANH"), false);
    assert.equal(daDongPhieu("DONG"), true);
    assert.equal(daDongPhieu("HUY"), true);
  });
  it("chuyển trạng thái đúng luồng", () => {
    assert.equal(chuyenDuoc("MOI", "DANG_XU_LY"), true);
    assert.equal(chuyenDuoc("HOAN_THANH", "DONG"), true);
    // Mở lại phiếu đã xử lý xong thì được, nhưng phiếu đã đóng thì không.
    assert.equal(chuyenDuoc("HOAN_THANH", "DANG_XU_LY"), true);
    assert.equal(chuyenDuoc("DONG", "DANG_XU_LY"), false);
    assert.equal(chuyenDuoc("MOI", "DONG"), false);
    assert.equal(chuyenDuoc("HUY", "DANG_XU_LY"), false);
  });
  it("số phiếu theo năm: HT-2026-0001", () => {
    assert.equal(dinhDangSoChungTu(KIEU_SO.phieuHoTro, 1, "2026"), "HT-2026-0001");
    assert.equal(dinhDangSoChungTu(KIEU_SO.duAn, 7, "2026"), "DA-2026-0007");
  });
});

describe("Hạn cam kết (SLA)", () => {
  const moLuc = new Date("2026-09-20T08:00:00.000Z");
  it("phiếu khẩn dùng ngưỡng khẩn, phiếu thường dùng ngưỡng thường", () => {
    const nguong = { gioPhanHoiKhan: 1, gioPhanHoiThuong: 8, gioXuLyKhan: 4, gioXuLyThuong: 48 };
    const khan = hanSla("khan", moLuc, nguong);
    assert.equal(khan.hanPhanHoi?.toISOString(), "2026-09-20T09:00:00.000Z");
    assert.equal(khan.hanXuLy?.toISOString(), "2026-09-20T12:00:00.000Z");
    const thuong = hanSla("trung-binh", moLuc, nguong);
    assert.equal(thuong.hanPhanHoi?.toISOString(), "2026-09-20T16:00:00.000Z");
    assert.equal(thuong.hanXuLy?.toISOString(), "2026-09-22T08:00:00.000Z");
  });
  it("ngưỡng chưa đặt thì KHÔNG bịa hạn", () => {
    const kq = hanSla("khan", moLuc, { gioPhanHoiKhan: null, gioPhanHoiThuong: null, gioXuLyKhan: null, gioXuLyThuong: null });
    assert.equal(kq.hanPhanHoi, null);
    assert.equal(kq.hanXuLy, null);
  });
  it("không có hạn thì không bao giờ báo trễ", () => {
    assert.equal(mucSla(null, null, new Date("2030-01-01T00:00:00Z")), "khong-co-han");
  });
  it("làm xong trước hạn là trong hạn, sau hạn là trễ", () => {
    const han = new Date("2026-09-20T12:00:00Z");
    assert.equal(mucSla(han, new Date("2026-09-20T11:00:00Z")), "con-han");
    assert.equal(mucSla(han, new Date("2026-09-20T13:00:00Z")), "tre-han");
  });
  it("chưa làm mà quá hạn là trễ; còn dưới 20% thời gian là sắp hết", () => {
    const mo = new Date("2026-09-20T08:00:00Z");
    const han = new Date("2026-09-20T18:00:00Z");
    assert.equal(mucSla(han, null, new Date("2026-09-20T19:00:00Z"), mo), "tre-han");
    assert.equal(mucSla(han, null, new Date("2026-09-20T17:00:00Z"), mo), "sap-het");
    assert.equal(mucSla(han, null, new Date("2026-09-20T10:00:00Z"), mo), "con-han");
  });
});

describe("Dự án triển khai", () => {
  it("mọi trạng thái có nhãn và lớp hiển thị", () => {
    for (const t of TRANG_THAI_DU_AN) {
      assert.ok(NHAN_TRANG_THAI_DU_AN[t], t);
      assert.ok(t in LOP_TRANG_THAI_DU_AN, t);
    }
  });
  it("phân nhóm đang chạy / đã đóng", () => {
    assert.equal(dangChayDuAn("IN_PROGRESS"), true);
    assert.equal(dangChayDuAn("ON_HOLD"), true);
    assert.equal(daDongDuAn("ACCEPTED"), true);
    assert.equal(daDongDuAn("CANCELLED"), true);
  });
  it("nghiệm thu và hủy là điểm dừng", () => {
    assert.equal(chuyenDuocDuAn("IN_PROGRESS", "ACCEPTED"), true);
    assert.equal(chuyenDuocDuAn("PLANNING", "ACCEPTED"), false);
    assert.equal(chuyenDuocDuAn("ACCEPTED", "IN_PROGRESS"), false);
    assert.equal(chuyenDuocDuAn("CANCELLED", "IN_PROGRESS"), false);
  });
  it("tiến độ theo hạng mục", () => {
    const kq = tienDoDuAn([{ trangThai: "xong" }, { trangThai: "dang-lam" }, { trangThai: "chua-lam" }, { trangThai: "xong" }]);
    assert.equal(kq.tong, 4);
    assert.equal(kq.xong, 2);
    assert.equal(kq.phanTram, 50);
    assert.equal(kq.conDangDo, true);
  });
  it("dự án chưa có hạng mục thì không coi là xong", () => {
    const kq = tienDoDuAn([]);
    assert.equal(kq.phanTram, 0);
    assert.equal(kq.conDangDo, false);
  });
  it("quá hạn chỉ tính cho dự án đang chạy", () => {
    assert.equal(quaHanDuAn("2026-09-19", "IN_PROGRESS", "2026-09-20"), true);
    assert.equal(quaHanDuAn("2026-09-19", "ACCEPTED", "2026-09-20"), false);
    assert.equal(quaHanDuAn(null, "IN_PROGRESS", "2026-09-20"), false);
  });
});
