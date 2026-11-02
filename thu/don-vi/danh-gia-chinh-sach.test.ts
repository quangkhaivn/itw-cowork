import { test } from "node:test";
import assert from "node:assert/strict";
import { chuoiCapTrenThuan, quanLyHieuLucThuan, type DuLieuCapTren } from "../../src/modules/danh-gia/cap-tren";
import { diChuyen, dienMaTrong, kiemMauSoan, maTuTen, tongTrongSo } from "../../src/modules/danh-gia/soan-mau";
import { laNgayPhaiBaoCaoNgay, LuocDoMauPhieu, MAU_PHIEU_MAC_DINH, tinhPhieuThucTap, type MauPhieu } from "../../src/modules/danh-gia/tinh-toan";

/** 0.20.0 — 10 quyết định chính sách (QĐ-131 → QĐ-140): phần thuần. */

const du = (o: Omit<Partial<DuLieuCapTren>, "quanLy"> & { quanLy: [string, string | null][] }): DuLieuCapTren => ({
  quanLy: new Map(o.quanLy),
  hoatDong: o.hoatDong ?? new Set(o.quanLy.map(([u]) => u)),
  giamDoc: o.giamDoc ?? [],
  quanTri: o.quanTri ?? [],
});

test("QĐ-132: quản lý hiệu lực — quản lý trực tiếp còn hoạt động", () => {
  const d = du({ quanLy: [["nv", "tp"], ["tp", "gd"], ["gd", null]], giamDoc: ["gd"] });
  assert.equal(quanLyHieuLucThuan("nv", d), "tp");
  assert.equal(quanLyHieuLucThuan("tp", d), "gd");
});

test("QĐ-132: không có quản lý → Giám đốc đầu tiên; Giám đốc không có quản lý hiệu lực", () => {
  const d = du({ quanLy: [["kt", null], ["gd1", null], ["gd2", null]], giamDoc: ["gd1", "gd2"] });
  assert.equal(quanLyHieuLucThuan("kt", d), "gd1");
  assert.equal(quanLyHieuLucThuan("gd1", d), null);
  assert.equal(quanLyHieuLucThuan("gd2", d), null);
});

test("QĐ-135: quản lý đã nghỉ → đi lên cấp trên còn hoạt động; hết chuỗi → Giám đốc", () => {
  const d = du({ quanLy: [["nv", "tp"], ["tp", "pgd"], ["pgd", null], ["gd", null]], hoatDong: new Set(["nv", "gd"]), giamDoc: ["gd"] });
  assert.equal(quanLyHieuLucThuan("nv", d), "gd");
  const d2 = du({ quanLy: [["nv", "tp"], ["tp", "pgd"], ["pgd", null]], hoatDong: new Set(["nv", "pgd"]), giamDoc: [] });
  assert.equal(quanLyHieuLucThuan("nv", d2), "pgd");
});

test("QĐ-135: chuỗi cấp trên — quản lý → … → Giám đốc → Quản trị, không trùng, không gồm chính mình; chặn vòng", () => {
  const d = du({ quanLy: [["tp", "pgd"], ["pgd", "gd"], ["gd", null], ["qt", null]], giamDoc: ["gd", "gd2"], quanTri: ["qt"], hoatDong: new Set(["tp", "pgd", "gd", "gd2", "qt"]) });
  assert.deepEqual(chuoiCapTrenThuan("tp", d), ["pgd", "gd", "gd2", "qt"]);
  assert.deepEqual(chuoiCapTrenThuan("gd", d), ["gd2", "qt"]);
  const vong = du({ quanLy: [["a", "b"], ["b", "a"]], giamDoc: ["gd"], hoatDong: new Set(["a", "b", "gd"]) });
  assert.deepEqual(chuoiCapTrenThuan("a", vong), ["b", "gd"]);
});

test("QĐ-138: ngày phải nộp báo cáo ngày", () => {
  assert.equal(laNgayPhaiBaoCaoNgay({ coLich: true, congDuKien: 1, laNgayLe: false, nghiPhep: 0 }), true);
  assert.equal(laNgayPhaiBaoCaoNgay({ coLich: true, congDuKien: 0, laNgayLe: false, nghiPhep: 0 }), false, "nghỉ hằng tuần");
  assert.equal(laNgayPhaiBaoCaoNgay({ coLich: true, congDuKien: 0.5, laNgayLe: false, nghiPhep: 0 }), true, "ca nửa ngày");
  assert.equal(laNgayPhaiBaoCaoNgay({ coLich: true, congDuKien: 0, laNgayLe: true, nghiPhep: 0 }), false, "ngày lễ");
  assert.equal(laNgayPhaiBaoCaoNgay({ coLich: true, congDuKien: 1, laNgayLe: false, nghiPhep: 1 }), false, "nghỉ phép cả ngày");
  assert.equal(laNgayPhaiBaoCaoNgay({ coLich: true, congDuKien: 1, laNgayLe: false, nghiPhep: 0.5 }), true, "nghỉ nửa ngày vẫn báo cáo");
  assert.equal(laNgayPhaiBaoCaoNgay({ coLich: false, congDuKien: 0, laNgayLe: false, nghiPhep: 0 }), true, "chưa gán lịch: coi là ngày làm");
  assert.equal(laNgayPhaiBaoCaoNgay({ coLich: false, congDuKien: 0, laNgayLe: true, nghiPhep: 0 }), false);
});

test("QĐ-131: mã tự sinh từ tên tiếng Việt, không trùng", () => {
  assert.equal(maTuTen("Ý thức kỷ luật, chấp hành nội quy", new Set()), "y-thuc-ky-luat-chap-hanh-n");
  assert.equal(maTuTen("Đề tài", new Set(["de-tai"])), "de-tai-2");
  assert.equal(maTuTen("Đề tài", new Set(["de-tai", "de-tai-2"])), "de-tai-3");
  assert.equal(maTuTen("!!!", new Set(), "tieu-chi"), "tieu-chi");
  assert.match(maTuTen("x".repeat(80), new Set()), /^[a-z0-9-]{1,30}$/);
});

test("QĐ-131: sắp xếp lên / xuống, ngoài biên giữ nguyên", () => {
  assert.deepEqual(diChuyen(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(diChuyen(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  assert.deepEqual(diChuyen(["a", "b"], 0, -1), ["a", "b"]);
  assert.deepEqual(diChuyen(["a", "b"], 1, 1), ["a", "b"]);
});

test("QĐ-131: mẫu soạn bằng biểu mẫu (mã trống) lưu đúng lược đồ, giữ mã cũ", () => {
  const m: MauPhieu = {
    ...MAU_PHIEU_MAC_DINH,
    thongTin: [...MAU_PHIEU_MAC_DINH.thongTin, { ma: "", nhan: "Lớp", nguon: "tu-nhap" }],
    phan: [...MAU_PHIEU_MAC_DINH.phan, { ten: "IV. Khác", tieuChi: [{ ma: "", ten: "Đi làm đúng giờ", trongSo: 10, thang: "co-khong", nguon: "chuyen-can", moTa: "" }, { ma: "", ten: "Đi làm đúng giờ", trongSo: 5, thang: "chu", nguon: null, moTa: "" }] }],
    oNhanXet: [{ ma: "", nhan: "Ưu điểm" }],
    oKy: [{ ma: "", nhan: "NGƯỜI HƯỚNG DẪN", ghiChu: "" }],
  };
  const k = kiemMauSoan(m);
  assert.deepEqual(k.loi, []);
  assert.ok(k.mau);
  assert.ok(LuocDoMauPhieu.safeParse(k.mau).success);
  const tc = k.mau!.phan[3].tieuChi;
  assert.deepEqual(tc.map((t) => t.ma), ["di-lam-dung-gio", "di-lam-dung-gio-2"]);
  assert.equal(k.mau!.phan[0].tieuChi[0].ma, "ky-luat", "mã cũ giữ nguyên");
  assert.equal(k.mau!.thongTin.at(-1)!.ma, "lop");
  assert.equal(tongTrongSo(k.mau!), 115);
  assert.equal(dienMaTrong(k.mau!).phan[3].tieuChi[0].ma, "di-lam-dung-gio");
});

test("QĐ-131: lỗi mẫu soạn nói vị trí bằng tiếng Việt", () => {
  const m: MauPhieu = { ...MAU_PHIEU_MAC_DINH, tieuDe: "", phan: [{ ten: "A", tieuChi: [{ ma: "a", ten: "Tiêu chí A", trongSo: Number.NaN, thang: "10", nguon: null, moTa: "" }] }] };
  const k = kiemMauSoan(m);
  assert.equal(k.mau, null);
  assert.ok(k.loi.some((l) => l.startsWith("Tiêu đề phiếu")), k.loi.join(" | "));
  assert.ok(k.loi.some((l) => l.startsWith("Phần thứ 1 Tiêu chí thứ 1 trọng số")), k.loi.join(" | "));
  const tc = kiemMauSoan({ ...MAU_PHIEU_MAC_DINH, thangChu: [{ chu: "A", diem: 9, tu: 5 }, { chu: "B", diem: 7, tu: 8 }] });
  assert.ok(tc.loi.some((l) => l.includes("giảm dần")));
});

test("QĐ-131: thang Có / Không — Đạt 10, Không đạt 0, nguồn tự động ≥ 5 là Đạt; mẫu cũ (thang 10 / chữ) vẫn hợp lệ", () => {
  const m = LuocDoMauPhieu.parse({ tieuDe: "Phiếu", phan: [{ ten: "A", tieuChi: [
    { ma: "a", ten: "Có mặt đủ", trongSo: 1, thang: "co-khong" },
    { ma: "b", ten: "Chuyên cần", trongSo: 1, thang: "co-khong", nguon: "chuyen-can" },
  ] }] });
  assert.equal(tinhPhieuThucTap(m, { a: "co" }, { "chuyen-can": 40 }).tong, 5);
  assert.equal(tinhPhieuThucTap(m, { a: "khong" }, { "chuyen-can": 90 }).tong, 5);
  assert.throws(() => tinhPhieuThucTap(m, { a: "8" }, {}), RangeError);
  assert.ok(LuocDoMauPhieu.safeParse(MAU_PHIEU_MAC_DINH).success);
});
