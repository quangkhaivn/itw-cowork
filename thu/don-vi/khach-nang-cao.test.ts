/**
 * Kiểm thử đơn vị phần logic thuần của gói Khách hàng nâng cao (0.16.0). Không cần CSDL.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { coTuChuyen, laDungLau, soNgayDung, tinhPheu, tyLe } from "../../src/modules/hanh-trinh/tinh-toan";
import { MA_MOC, MOC_KEO_LAI, TRANG_THAI_KHOI_TAO } from "../../src/modules/hanh-trinh/moc";
import { chamDiem, chuanHoaDiemNguon, hangDiem, type CauHinhDiem, type DuKienDiem } from "../../src/modules/cham-diem/tinh-toan";
import { chuanHoaThamSoLuu, chuoiTruyVan, COT_MAC_DINH, locCot, MA_LOC_NHANH, MA_SAP_XEP } from "../../src/modules/khach-hang/danh-muc-loc";
import { LuocDoLocKhachHang, LuocDoLienHe } from "../../src/modules/khach-hang/luoc-do";
import { docNgayCsv } from "../../src/modules/khach-hang/tinh-toan";
import { trungNgaySinh } from "../../src/modules/nhac-viec/tinh-toan";
import { QUY_TAC } from "../../src/modules/nhac-viec/quy-tac";
import { DANH_MUC_CAU_HINH } from "../../src/modules/cau-hinh/danh-muc";
import { VAI_TRO } from "../../src/lib/vai-tro";
import { docCsv, taoCsv, voHieuCongThuc } from "../../src/lib/csv";

const T = (id: string, sortOrder: number, kind = "mo") => ({ id, sortOrder, kind });

describe("Tự chuyển bước hành trình (KHN-04)", () => {
  it("khách chưa có trạng thái nhận ngay", () => {
    assert.equal(coTuChuyen(null, T("a", 1), "tao-khach"), true);
  });
  it("chỉ tiến, không lùi, không đứng yên", () => {
    assert.equal(coTuChuyen(T("b", 2), T("c", 3), "bao-gia-da-gui"), true);
    assert.equal(coTuChuyen(T("c", 3), T("b", 2), "co-hoi-mo"), false);
    assert.equal(coTuChuyen(T("b", 2), T("b", 2), "co-hoi-mo"), false);
  });
  it("khách thất bại chỉ được mốc mạnh kéo lại", () => {
    const thatBai = T("x", 9, "that-bai");
    assert.equal(coTuChuyen(thatBai, T("b", 2), "co-hoi-mo"), false);
    assert.equal(coTuChuyen(thatBai, T("c", 3), "bao-gia-da-gui"), true);
    assert.equal(coTuChuyen(thatBai, T("d", 4, "thanh-cong"), "don-xac-nhan"), true);
  });
  it("không bao giờ tự chuyển VÀO trạng thái thất bại", () => {
    assert.equal(coTuChuyen(null, T("x", 9, "that-bai"), "tao-khach"), false);
  });
  it("mốc kéo lại là tập con của danh mục mốc; khởi tạo chỉ dùng mốc có thật", () => {
    assert.ok(MOC_KEO_LAI.every((m) => MA_MOC.includes(m)));
    assert.ok(TRANG_THAI_KHOI_TAO.every((t) => t.moc === null || MA_MOC.includes(t.moc)));
    assert.ok(TRANG_THAI_KHOI_TAO.every((t) => t.loai !== "that-bai" || t.moc === null));
  });
});

describe("Phễu chuyển đổi (KHN-06)", () => {
  const buoc = [
    { id: "moi", ten: "Mới", sortOrder: 1, kind: "mo" },
    { id: "tv", ten: "Tư vấn", sortOrder: 2, kind: "mo" },
    { id: "bg", ten: "Báo giá", sortOrder: 3, kind: "mo" },
    { id: "chot", ten: "Chốt", sortOrder: 4, kind: "thanh-cong" },
    { id: "bo", ten: "Bỏ", sortOrder: 5, kind: "that-bai" },
  ];
  const ngay = (n: number) => new Date(Date.UTC(2026, 9, 1 + n));
  it("tính bước xa nhất từng chạm theo lịch sử — khách bỏ sau báo giá vẫn tính tới báo giá", () => {
    const kq = tinhPheu(buoc, [
      { id: "1", taoLuc: ngay(0), hienTaiId: "chot", lichSu: [{ sangId: "moi", luc: ngay(0) }, { sangId: "tv", luc: ngay(2) }, { sangId: "chot", luc: ngay(4) }] },
      { id: "2", taoLuc: ngay(0), hienTaiId: "bo", lichSu: [{ sangId: "moi", luc: ngay(0) }, { sangId: "bg", luc: ngay(6) }, { sangId: "bo", luc: ngay(8) }] },
      { id: "3", taoLuc: ngay(0), hienTaiId: "moi", lichSu: [{ sangId: "moi", luc: ngay(0) }] },
      { id: "4", taoLuc: ngay(0), hienTaiId: null, lichSu: [] },
    ]);
    assert.equal(kq.tong, 4);
    assert.deepEqual(kq.buoc.map((b) => b.soDat), [3, 2, 2, 1]);
    assert.equal(kq.buoc[0].tyLeTrenTong, 75);
    assert.equal(kq.buoc[1].tyLeTuBuocTruoc, 66.7);
    assert.equal(kq.soThanhCong, 1);
    assert.equal(kq.soThatBai, 1);
    assert.deepEqual(kq.theoThatBai, [{ id: "bo", ten: "Bỏ", so: 1 }]);
    assert.ok(!kq.buoc.some((b) => b.id === "bo"), "trạng thái thất bại không là bước phễu");
  });
  it("số ngày trung bình tới bước tính từ lúc tạo khách", () => {
    const kq = tinhPheu(buoc, [
      { id: "1", taoLuc: ngay(0), hienTaiId: "tv", lichSu: [{ sangId: "tv", luc: ngay(2) }] },
      { id: "2", taoLuc: ngay(0), hienTaiId: "tv", lichSu: [{ sangId: "tv", luc: ngay(4) }] },
    ]);
    assert.equal(kq.buoc[1].soNgayTrungBinh, 3);
  });
  it("kỳ rỗng → tỷ lệ null, không phải 0%", () => {
    const kq = tinhPheu(buoc, []);
    assert.equal(kq.tong, 0);
    assert.equal(kq.buoc[0].tyLeTrenTong, null);
    assert.equal(kq.tyLeThanhCong, null);
    assert.equal(tyLe(1, 0), null);
  });
});

describe("Đứng lâu (KHN-14)", () => {
  it("đếm ngày và so ngưỡng; ngưỡng null = không nhắc", () => {
    assert.equal(soNgayDung("2026-10-01", "2026-10-05"), 4);
    assert.equal(laDungLau(4, 3), true);
    assert.equal(laDungLau(2, 3), false);
    assert.equal(laDungLau(400, null), false);
  });
});

const CFG: CauHinhDiem = {
  soNgayTuongTac: 30, diemMoiTuongTac: 5, tuongTacToiDa: 25, diemMoiLanGap: 5, gapToiDa: 10,
  soNgayImLang: 60, diemTruImLang: 15, diemCoHoiMo: 15, diemBaoGia: 15, soNgayBaoGia: 90,
  diemDaMua: 10, diemDuLienHe: 10, nguongNong: null, nguongAm: null, diemNguon: { website: 20 },
};
const BAY_GIO = new Date("2026-10-12T03:00:00Z");
const F = (x: Partial<DuKienDiem> = {}): DuKienDiem => ({
  bayGio: BAY_GIO, taoLuc: new Date("2026-10-01T00:00:00Z"), trangThai: "tiem-nang", loaiHanhTrinh: null, tenHanhTrinh: null,
  nguon: null, tenNguon: null, soTuongTac: 0, soGap: 0, tuongTacGanNhat: null, soCoHoiMo: 0, soBaoGiaGanDay: 0, daMua: false, duLienHe: false, ...x,
});

describe("Chấm điểm khách (KHN-08)", () => {
  it("khách trống trơn = 0 điểm", () => {
    assert.equal(chamDiem(F(), CFG).diem, 0);
  });
  it("cộng đúng từng tín hiệu và có diễn giải", () => {
    const kq = chamDiem(F({ nguon: "website", tenNguon: "Website", soTuongTac: 3, soGap: 1, tuongTacGanNhat: BAY_GIO, soCoHoiMo: 1, soBaoGiaGanDay: 1, daMua: true, duLienHe: true }), CFG);
    assert.equal(kq.diem, 20 + 15 + 5 + 15 + 15 + 10 + 10);
    assert.ok(kq.phan.some((p) => p.nhan.includes("Nguồn: Website") && p.diem === 20));
  });
  it("trần tương tác và trần gặp mặt", () => {
    const kq = chamDiem(F({ soTuongTac: 100, soGap: 100, tuongTacGanNhat: BAY_GIO }), CFG);
    assert.equal(kq.diem, 25 + 10);
  });
  it("im lặng lâu bị trừ, nhưng điểm không âm", () => {
    const kq = chamDiem(F({ taoLuc: new Date("2026-01-01T00:00:00Z") }), CFG);
    assert.equal(kq.diem, 0);
    assert.ok(kq.phan.some((p) => p.diem === -15));
  });
  it("điểm tối đa 100", () => {
    const kq = chamDiem(F({ nguon: "website", soTuongTac: 9, soGap: 9, tuongTacGanNhat: BAY_GIO, soCoHoiMo: 1, soBaoGiaGanDay: 1, daMua: true, duLienHe: true }), { ...CFG, diemDaMua: 100 });
    assert.equal(kq.diem, 100);
  });
  it("nguồn chưa đặt điểm được nói rõ, cộng 0", () => {
    const kq = chamDiem(F({ nguon: "zalo", tenNguon: "Zalo" }), CFG);
    assert.ok(kq.phan.some((p) => p.nhan.includes("chưa đặt điểm") && p.diem === 0));
  });
  it("khách ngừng giao dịch / đã gộp không chấm; trạng thái thất bại = 0", () => {
    assert.equal(chamDiem(F({ trangThai: "ngung-giao-dich", daMua: true }), CFG).diem, null);
    assert.equal(chamDiem(F({ trangThai: "da-gop" }), CFG).diem, null);
    assert.equal(chamDiem(F({ loaiHanhTrinh: "that-bai", tenHanhTrinh: "Bỏ", daMua: true }), CFG).diem, 0);
  });
  it("hạng chỉ có khi đủ hai ngưỡng hợp lệ — không tự chọn ngưỡng", () => {
    assert.equal(hangDiem(90, null, null), null);
    assert.equal(hangDiem(90, 70, null), null);
    assert.equal(hangDiem(90, 70, 70), null);
    assert.equal(hangDiem(70, 70, 40), "nong");
    assert.equal(hangDiem(40, 70, 40), "am");
    assert.equal(hangDiem(39, 70, 40), "lanh");
    assert.equal(hangDiem(null, 70, 40), null);
  });
  it("bảng điểm nguồn đọc từ CSDL bị lọc mục sai", () => {
    assert.deepEqual(chuanHoaDiemNguon({ website: 20, zalo: 101, "a b": 5, gt: 2.5, ok: 0 }), { website: 20, ok: 0 });
    assert.deepEqual(chuanHoaDiemNguon([1, 2]), {});
    assert.deepEqual(chuanHoaDiemNguon(null), {});
  });
  it("trọng số chấm điểm có mặc định ghi rõ; ngưỡng Nóng/Ấm chưa đặt", () => {
    const muc = DANH_MUC_CAU_HINH.filter((m) => m.khoa.startsWith("diem_khach."));
    assert.ok(muc.length >= 14);
    for (const m of muc) {
      if (m.khoa.endsWith("nguong_nong") || m.khoa.endsWith("nguong_am")) assert.equal(m.macDinh, null, m.khoa);
      else assert.ok(m.macDinh !== null && m.moTa.includes("MẶC ĐỊNH"), m.khoa);
    }
  });
});

describe("Danh mục lọc / sắp xếp / cột (KHN-07)", () => {
  it("chỉ giữ khóa đã biết", () => {
    assert.deepEqual(chuanHoaThamSoLuu({ q: " abc ", x: "1", nhanh: 5, sapXep: "diem" }), { q: "abc", sapXep: "diem" });
    assert.deepEqual(chuanHoaThamSoLuu("abc"), {});
  });
  it("lược đồ lọc từ chối mã lạ", () => {
    for (const m of MA_LOC_NHANH) assert.ok(LuocDoLocKhachHang.safeParse({ nhanh: m }).success);
    for (const m of MA_SAP_XEP) assert.ok(LuocDoLocKhachHang.safeParse({ sapXep: m }).success);
    assert.ok(!LuocDoLocKhachHang.safeParse({ nhanh: "tat-ca-du-lieu" }).success);
    assert.ok(!LuocDoLocKhachHang.safeParse({ hanhTrinh: "abc" }).success);
    assert.ok(LuocDoLocKhachHang.safeParse({ hanhTrinh: "chua-co" }).success);
  });
  it("cột lưu sai → bộ mặc định; cột trùng bị gộp", () => {
    assert.deepEqual(locCot(["mat-khau"]), COT_MAC_DINH);
    assert.deepEqual(locCot(null), COT_MAC_DINH);
    assert.deepEqual(locCot(["diem", "diem", "nhom", 3]), ["diem", "nhom"]);
  });
  it("chuỗi truy vấn bỏ ô rỗng", () => {
    assert.equal(chuoiTruyVan({ q: "a b", nhom: "", nhanh: undefined }), "?q=a+b");
    assert.equal(chuoiTruyVan({}), "");
  });
});

describe("Ngày sinh và CSV (KHN-15, KHN-16)", () => {
  it("đọc dd/mm/yyyy và yyyy-mm-dd", () => {
    assert.equal(docNgayCsv("05/06/1980"), "1980-06-05");
    assert.equal(docNgayCsv("1980-6-5"), "1980-06-05");
    assert.equal(docNgayCsv(" "), null);
  });
  it("ngày không có thật hoặc ở tương lai → lỗi", () => {
    assert.throws(() => docNgayCsv("31/02/1990"));
    assert.throws(() => docNgayCsv("12/1990"));
    assert.throws(() => docNgayCsv("01/01/2999"));
  });
  it("trùng ngày sinh bỏ qua năm; 29/02 nhắc vào 28/02 năm không nhuận", () => {
    assert.equal(trungNgaySinh("1990-10-12", "2026-10-12"), true);
    assert.equal(trungNgaySinh("1990-10-12", "2026-10-13"), false);
    assert.equal(trungNgaySinh("1992-02-29", "2026-02-28"), true);
    assert.equal(trungNgaySinh("1992-02-29", "2028-02-28"), false);
    assert.equal(trungNgaySinh("1992-02-29", "2028-02-29"), true);
  });
  it("lược đồ liên hệ nhận ngày sinh", () => {
    assert.equal(LuocDoLienHe.parse({ hoTen: "An", ngaySinh: "1990-01-02" }).ngaySinh, "1990-01-02");
    assert.ok(!LuocDoLienHe.safeParse({ hoTen: "An", ngaySinh: "02/01/1990" }).success);
  });
});

describe("Quy tắc nhắc việc và quyền mới", () => {
  it("có hai quy tắc mới, không cần ngưỡng chung", () => {
    for (const ma of ["khach-dung-lau", "sinh-nhat-lien-he"]) {
      const q = QUY_TAC.find((x) => x.ma === ma);
      assert.ok(q, ma);
      assert.equal(q!.khoaNguong, null);
    }
  });
  it("Trưởng phòng Kinh doanh có customer.approve; Nhân viên KD và trợ lý AI thì không", () => {
    const quyen = (code: string) => {
      const v = VAI_TRO.find((x) => x.code === code)!;
      return v.quyen === "*" ? null : v.quyen;
    };
    assert.ok(quyen("sales-manager")!.includes("customer.approve"));
    assert.ok(!quyen("sales")!.includes("customer.approve"));
    assert.ok(!quyen("ai-assistant")!.some((q) => q.endsWith(".approve")));
  });
});

describe("Xuất CSV chống chèn công thức (CSV-01)", () => {
  it("ô chuỗi bắt đầu bằng = + - @ tab CR được thêm dấu '", () => {
    for (const s of ["=cmd|' /C calc'!A0", "+SUM(1)", "-2+3", "@SUM(1)", "\tx", "\rx"]) assert.equal(voHieuCongThuc(s), `'${s}`);
    assert.equal(voHieuCongThuc("Công ty A"), "Công ty A");
    assert.equal(voHieuCongThuc(""), "");
  });
  it("taoCsv vô hiệu ô nguy hiểm nhưng giữ nguyên ô SỐ (kể cả số âm)", () => {
    const csv = taoCsv(["A", "B", "C"], [["=HYPERLINK(\"x\")", -5, "+84 909"]]);
    const dong = csv.replace(/^﻿/, "").split("\r\n")[1];
    assert.equal(dong, `"'=HYPERLINK(""x"")",-5,'+84 909`);
  });
  it("đọc lại tệp đã xuất: điện thoại có dấu ' vẫn chuẩn hóa được", () => {
    const bang = docCsv(taoCsv(["Điện thoại"], [["+84 909 123 456"]]));
    assert.equal(bang[1][0], "'+84 909 123 456");
  });
});
