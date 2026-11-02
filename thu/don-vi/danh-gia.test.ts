/**
 * Kiểm thử đơn vị phần thuần của 0.20.0 — giao việc, báo cáo, duyệt, đánh giá, KPI, thực tập.
 * Luật: BUSINESS_RULES.md mục 31 (DG). Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bangXepLoaiHopLe,
  BANG_XEP_LOAI_MAC_DINH,
  cacNgayLap,
  cacThangCuaKy,
  chonBoKpi,
  dauTuan,
  denLucNhac,
  diemRaChu,
  diemViec,
  dungChuoiDuyet,
  giaTriTuDongRaDiem,
  hanBaoCao,
  hanCuoiCung,
  heSoDungHan,
  kiemTraMauPhieu,
  kyBaoCao,
  kyDanhGia,
  laNgayLap,
  LuocDoMauPhieu,
  MAU_PHIEU_MAC_DINH,
  phanTramDat,
  tinhPhieuThucTap,
  tinhTrangBaoCao,
  tongDiemKpi,
  tyLe,
  xepLoai,
  type LichLap,
} from "../../src/modules/danh-gia/tinh-toan";

const GIO = 3_600_000;

describe("DG-30 điểm việc và hệ số đúng hạn", () => {
  const han = new Date("2026-11-10T10:00:00.000Z");
  it("xong đúng hoặc trước hạn → hệ số 1", () => {
    assert.deepEqual(heSoDungHan(han, han), { heSo: 1, loai: "dung-han", treGio: 0 });
    assert.equal(heSoDungHan(han, new Date(han.getTime() - GIO)).loai, "dung-han");
  });
  it("trễ trong ngưỡng → trễ nhẹ; vượt ngưỡng → trễ nặng", () => {
    const nhe = heSoDungHan(han, new Date(han.getTime() + 5 * GIO));
    assert.equal(nhe.loai, "tre-nhe");
    assert.equal(nhe.heSo, 0.8);
    assert.equal(nhe.treGio, 5);
    assert.equal(heSoDungHan(han, new Date(han.getTime() + 24 * GIO)).loai, "tre-nhe");
    const nang = heSoDungHan(han, new Date(han.getTime() + 24 * GIO + 1000));
    assert.equal(nang.loai, "tre-nang");
    assert.equal(nang.heSo, 0.5);
  });
  it("không có hạn → hệ số không hạn", () => {
    assert.equal(heSoDungHan(null, new Date()).loai, "khong-han");
    assert.equal(heSoDungHan(null, new Date(), { heSoDungHan: 1, heSoTreNhe: 0.8, heSoTreNang: 0.5, heSoKhongHan: 0.9, treNheToiDaGio: 24 }).heSo, 0.9);
  });
  it("cấu hình riêng được đọc", () => {
    const ch = { heSoDungHan: 1.1, heSoTreNhe: 0.7, heSoTreNang: 0.3, heSoKhongHan: 1, treNheToiDaGio: 2 };
    assert.equal(heSoDungHan(han, han, ch).heSo, 1.1);
    assert.equal(heSoDungHan(han, new Date(han.getTime() + 3 * GIO), ch).heSo, 0.3);
  });
  it("điểm = độ khó × chất lượng × hệ số, làm tròn 2 chữ số", () => {
    assert.equal(diemViec(3, 4, 1), 12);
    assert.equal(diemViec(5, 5, 0.8), 20);
    assert.equal(diemViec(3, 3, 0.33), 2.97);
    assert.throws(() => diemViec(0, 3, 1), RangeError);
    assert.throws(() => diemViec(3, 6, 1), RangeError);
    assert.throws(() => diemViec(2.5, 3, 1), RangeError);
  });
});

describe("DG-05 hạn cuối cùng sau gia hạn", () => {
  const goc = new Date("2026-11-10T10:00:00.000Z");
  it("chỉ gia hạn đã duyệt mới đổi hạn; lấy lần duyệt muộn nhất", () => {
    const g = [
      { trangThai: "da-duyet", hanMoi: new Date("2026-11-12T10:00:00.000Z"), quyetDinhLuc: new Date("2026-11-09T00:00:00.000Z") },
      { trangThai: "tu-choi", hanMoi: new Date("2026-11-20T10:00:00.000Z"), quyetDinhLuc: new Date("2026-11-11T00:00:00.000Z") },
      { trangThai: "cho-duyet", hanMoi: new Date("2026-11-25T10:00:00.000Z"), quyetDinhLuc: null },
      { trangThai: "da-duyet", hanMoi: new Date("2026-11-15T10:00:00.000Z"), quyetDinhLuc: new Date("2026-11-11T05:00:00.000Z") },
    ];
    assert.equal(hanCuoiCung(goc, g)?.toISOString(), "2026-11-15T10:00:00.000Z");
    assert.equal(hanCuoiCung(goc, g.slice(1, 3))?.toISOString(), goc.toISOString());
  });
  it("xong sau hạn gốc nhưng trước hạn gia hạn → đúng hạn", () => {
    const g = [{ trangThai: "da-duyet", hanMoi: new Date("2026-11-12T10:00:00.000Z"), quyetDinhLuc: new Date("2026-11-09T00:00:00.000Z") }];
    const xong = new Date("2026-11-11T12:00:00.000Z");
    assert.equal(heSoDungHan(goc, xong).loai, "tre-nang");
    assert.equal(heSoDungHan(hanCuoiCung(goc, g), xong).loai, "dung-han");
  });
});

describe("DG-22 dựng chuỗi duyệt", () => {
  const ctx = { nguoiLamId: "lam", nguoiGiaoId: "giao", quanLyTrucTiepId: "ql" };
  it("theo thứ tự, bỏ trùng, bỏ chính người làm", () => {
    assert.deepEqual(
      dungChuoiDuyet([{ loai: "nguoi-giao" }, { loai: "quan-ly-truc-tiep" }, { loai: "nguoi-cu-the", nguoiId: "giao" }, { loai: "nguoi-cu-the", nguoiId: "lam" }], ctx),
      ["giao", "ql"],
    );
  });
  it("không có quản lý trực tiếp thì bỏ cấp đó; chuỗi rỗng → người giao", () => {
    assert.deepEqual(dungChuoiDuyet([{ loai: "quan-ly-truc-tiep" }], { ...ctx, quanLyTrucTiepId: null }), ["giao"]);
    assert.deepEqual(dungChuoiDuyet([], ctx), ["giao"]);
  });
  it("tự giao cho mình, không ai khác → rỗng (không ai được tự duyệt)", () => {
    assert.deepEqual(dungChuoiDuyet([{ loai: "nguoi-giao" }], { nguoiLamId: "a", nguoiGiaoId: "a", quanLyTrucTiepId: null }), []);
    assert.deepEqual(dungChuoiDuyet([{ loai: "quan-ly-truc-tiep" }], { nguoiLamId: "a", nguoiGiaoId: "a", quanLyTrucTiepId: "q" }), ["q"]);
  });
});

describe("DG-07 lịch việc định kỳ", () => {
  const ngay: LichLap = { tanSuat: "ngay", thu: [], ngayThang: null, tuNgay: "2026-11-02", denNgay: "2026-11-05" };
  it("hằng ngày trong khoảng", () => {
    assert.deepEqual(cacNgayLap(ngay, "2026-11-01", "2026-11-10"), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
  });
  it("hằng tuần theo thứ (02/11/2026 là thứ Hai)", () => {
    const t: LichLap = { tanSuat: "tuan", thu: [1, 5], ngayThang: null, tuNgay: "2026-11-01", denNgay: null };
    assert.deepEqual(cacNgayLap(t, "2026-11-01", "2026-11-14"), ["2026-11-02", "2026-11-06", "2026-11-09", "2026-11-13"]);
    assert.equal(laNgayLap(t, "2026-11-08"), false);
  });
  it("hằng tháng ngày 31 → tháng ngắn lấy ngày cuối tháng (kể cả năm nhuận)", () => {
    const m: LichLap = { tanSuat: "thang", thu: [], ngayThang: 31, tuNgay: "2027-01-01", denNgay: null };
    assert.deepEqual(cacNgayLap(m, "2027-01-01", "2027-04-30"), ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
    assert.equal(laNgayLap({ ...m, tuNgay: "2028-01-01" }, "2028-02-29"), true);
  });
  it("trước ngày bắt đầu hoặc ngày hỏng → không lặp", () => {
    assert.equal(laNgayLap(ngay, "2026-11-01"), false);
    assert.equal(laNgayLap(ngay, "2026-02-30"), false);
  });
});

describe("DG-40 hạn báo cáo", () => {
  it("đầu tuần là thứ Hai", () => {
    assert.equal(dauTuan("2026-11-08"), "2026-11-02");
    assert.equal(dauTuan("2026-11-02"), "2026-11-02");
    assert.deepEqual(kyBaoCao("tuan", "2026-11-05"), { tu: "2026-11-02", den: "2026-11-08" });
    assert.deepEqual(kyBaoCao("ngay", "2026-11-05"), { tu: "2026-11-05", den: "2026-11-05" });
  });
  it("tuần: thứ Sáu 17:00 giờ VN = 10:00 UTC; ngày: 20:00 VN", () => {
    assert.equal(hanBaoCao("tuan", "2026-11-04").toISOString(), "2026-11-06T10:00:00.000Z");
    assert.equal(hanBaoCao("tuan", "2026-11-02", { hanTuanThu: 1, hanTuanGio: 9, hanNgayGio: 20, nhacTruocGio: 2 }).toISOString(), "2026-11-02T02:00:00.000Z");
    assert.equal(hanBaoCao("ngay", "2026-11-04").toISOString(), "2026-11-04T13:00:00.000Z");
  });
  it("nhắc trước hạn và tình trạng nộp", () => {
    const han = new Date("2026-11-06T10:00:00.000Z");
    assert.equal(denLucNhac(han, new Date(han.getTime() - 3 * GIO), 2), false);
    assert.equal(denLucNhac(han, new Date(han.getTime() - GIO), 2), true);
    assert.equal(denLucNhac(han, new Date(han.getTime() + 1), 2), false);
    assert.equal(tinhTrangBaoCao(han, han, new Date()), "dung-han");
    assert.equal(tinhTrangBaoCao(han, new Date(han.getTime() + 1), new Date()), "tre");
    assert.equal(tinhTrangBaoCao(han, null, new Date(han.getTime() - 1)), "chua-nop");
    assert.equal(tinhTrangBaoCao(han, null, new Date(han.getTime() + 1)), "thieu");
  });
});

describe("DG-60 kỳ đánh giá theo giờ VN", () => {
  it("tháng 2/2028 (nhuận)", () => {
    const k = kyDanhGia("thang", 2028, 2);
    assert.equal(k.tu, "2028-02-01");
    assert.equal(k.den, "2028-02-29");
    assert.equal(k.batDau.toISOString(), "2028-01-31T17:00:00.000Z");
    assert.equal(k.ketThuc.toISOString(), "2028-02-29T17:00:00.000Z");
  });
  it("quý 4/2026", () => {
    const k = kyDanhGia("quy", 2026, 4);
    assert.equal(k.tu, "2026-10-01");
    assert.equal(k.den, "2026-12-31");
    assert.equal(k.ketThuc.toISOString(), "2026-12-31T17:00:00.000Z");
    assert.equal(k.nhan, "Quý 4/2026");
    assert.deepEqual(cacThangCuaKy("quy", 2026, 4).map((x) => x.thang), [10, 11, 12]);
  });
  it("số kỳ sai bị chặn", () => {
    assert.throws(() => kyDanhGia("thang", 2026, 13), RangeError);
    assert.throws(() => kyDanhGia("quy", 2026, 5), RangeError);
  });
});

describe("DG-53 KPI: % đạt, điểm tổng, xếp loại", () => {
  it("cao là tốt, chặn trần", () => {
    assert.equal(phanTramDat(80, 100, "cao-tot"), 80);
    assert.equal(phanTramDat(200, 100, "cao-tot"), 120);
    assert.equal(phanTramDat(200, 100, "cao-tot", 150), 150);
    assert.equal(phanTramDat(5, 0, "cao-tot"), null);
    assert.equal(phanTramDat(null, 100, "cao-tot"), null);
    assert.equal(phanTramDat(10, null, "cao-tot"), null);
  });
  it("thấp là tốt", () => {
    assert.equal(phanTramDat(0, 10, "thap-tot"), 100);
    assert.equal(phanTramDat(10, 10, "thap-tot"), 100);
    assert.equal(phanTramDat(20, 10, "thap-tot"), 50);
    assert.equal(phanTramDat(3, 0, "thap-tot"), 0);
    assert.equal(phanTramDat(0, 0, "thap-tot"), 100);
  });
  it("tỷ lệ với mẫu 0 → null", () => {
    assert.equal(tyLe(1, 3), 33.33);
    assert.equal(tyLe(0, 0), null);
  });
  it("điểm tổng có trọng số; thiếu điểm thì không tính", () => {
    assert.deepEqual(tongDiemKpi([{ trongSo: 60, diem: 100 }, { trongSo: 40, diem: 50 }]), { tong: 80, thieu: 0 });
    assert.deepEqual(tongDiemKpi([{ trongSo: 1, diem: 90 }, { trongSo: 2, diem: 60 }]), { tong: 70, thieu: 0 });
    assert.deepEqual(tongDiemKpi([{ trongSo: 50, diem: 100 }, { trongSo: 50, diem: null }]), { tong: null, thieu: 1 });
    assert.deepEqual(tongDiemKpi([]), { tong: null, thieu: 0 });
  });
  it("xếp loại và hệ số thưởng theo bảng", () => {
    assert.deepEqual(xepLoai(95), { loai: "A", heSoThuong: 1.2 });
    assert.deepEqual(xepLoai(90), { loai: "A", heSoThuong: 1.2 });
    assert.deepEqual(xepLoai(89.99), { loai: "B", heSoThuong: 1 });
    assert.deepEqual(xepLoai(60), { loai: "C", heSoThuong: 0.8 });
    assert.deepEqual(xepLoai(59.9), { loai: "D", heSoThuong: 0 });
    assert.deepEqual(xepLoai(70, { ...BANG_XEP_LOAI_MAC_DINH, nguongB: 70, heSoB: 1.05 }), { loai: "B", heSoThuong: 1.05 });
    assert.equal(bangXepLoaiHopLe(BANG_XEP_LOAI_MAC_DINH), true);
    assert.equal(bangXepLoaiHopLe({ ...BANG_XEP_LOAI_MAC_DINH, nguongB: 95 }), false);
  });
  it("chọn bộ KPI: chức danh → vai trò → mặc định", () => {
    const bo = [
      { id: "md", chucDanh: null, maVaiTro: null },
      { id: "vt", chucDanh: null, maVaiTro: "sales" },
      { id: "cd", chucDanh: "Kỹ thuật viên", maVaiTro: null },
    ];
    assert.equal(chonBoKpi(bo, { chucDanh: " kỹ thuật viên ", maVaiTro: ["sales"] })?.id, "cd");
    assert.equal(chonBoKpi(bo, { chucDanh: "Kế toán", maVaiTro: ["sales"] })?.id, "vt");
    assert.equal(chonBoKpi(bo, { chucDanh: null, maVaiTro: ["kho"] })?.id, "md");
    assert.equal(chonBoKpi(bo.slice(1), { chucDanh: null, maVaiTro: ["kho"] }), null);
  });
});

describe("DG-73 chấm phiếu thực tập theo mẫu", () => {
  it("mẫu mặc định hợp lệ", () => {
    assert.deepEqual(kiemTraMauPhieu(MAU_PHIEU_MAC_DINH), []);
  });
  it("thang 10: trung bình có trọng số + quy ra chữ", () => {
    const kq = tinhPhieuThucTap(MAU_PHIEU_MAC_DINH, { "ky-luat": 9, "thai-do": 8, "chuyen-mon": 7, "ky-nang-mem": 8, "ket-qua": 9 }, {});
    // (9×20 + 8×15 + 7×20 + 8×15 + 9×30) / 100 = 8.3
    assert.equal(kq.tong, 8.3);
    assert.equal(kq.chu, "B");
    assert.deepEqual(kq.thieu, []);
  });
  it("tiêu chí có nguồn tự động lấy giá trị máy khi để trống; thiếu thì báo", () => {
    const kq = tinhPhieuThucTap(MAU_PHIEU_MAC_DINH, { "thai-do": 8, "chuyen-mon": 7, "ky-nang-mem": 8 }, { "chuyen-can": 95, "ty-le-viec-dat": 80 });
    assert.equal(kq.chiTiet.find((c) => c.ma === "ky-luat")?.diem10, 9.5);
    assert.equal(kq.chiTiet.find((c) => c.ma === "ky-luat")?.tuDong, true);
    assert.equal(kq.chiTiet.find((c) => c.ma === "ket-qua")?.diem10, 8);
    const thieu = tinhPhieuThucTap(MAU_PHIEU_MAC_DINH, { "thai-do": 8 }, {});
    assert.equal(thieu.tong, null);
    assert.equal(thieu.thieu.length, 4);
  });
  it("thang chữ: chữ → điểm quy đổi; tổng → chữ; chữ lạ bị chặn", () => {
    const mau = LuocDoMauPhieu.parse({
      tieuDe: "Phiếu chữ",
      phan: [{ ten: "A", tieuChi: [
        { ma: "a", ten: "Tiêu chí A", trongSo: 1, thang: "chu" },
        { ma: "b", ten: "Tiêu chí B", trongSo: 1, thang: "chu", nguon: "chat-luong-viec" },
      ] }],
    });
    const kq = tinhPhieuThucTap(mau, { a: "A", b: "C" }, {});
    assert.equal(kq.tong, 7.75);
    assert.equal(kq.chu, "B");
    // Tự động: chất lượng 4/5 → 8 điểm → chữ B → điểm quy đổi 7.5.
    const td = tinhPhieuThucTap(mau, { a: "A" }, { "chat-luong-viec": 4 });
    assert.equal(td.chiTiet[1].diem10, 7.5);
    assert.throws(() => tinhPhieuThucTap(mau, { a: "Z", b: "A" }, {}), RangeError);
    assert.throws(() => tinhPhieuThucTap(MAU_PHIEU_MAC_DINH, { "ky-luat": 11 }, {}), RangeError);
  });
  it("đổi điểm / giá trị tự động", () => {
    assert.equal(diemRaChu(8.5, MAU_PHIEU_MAC_DINH.thangChu), "A");
    assert.equal(diemRaChu(0, MAU_PHIEU_MAC_DINH.thangChu), "F");
    assert.equal(giaTriTuDongRaDiem("chuyen-can", 120), 10);
    assert.equal(giaTriTuDongRaDiem("chat-luong-viec", 3.5), 7);
    assert.equal(giaTriTuDongRaDiem("ty-le-viec-dat", null), null);
  });
  it("mẫu hỏng: mã trùng, thang chữ không giảm dần", () => {
    const m = LuocDoMauPhieu.parse({
      tieuDe: "Hỏng",
      phan: [{ ten: "A", tieuChi: [{ ma: "x", ten: "Một", trongSo: 1, thang: "10" }, { ma: "x", ten: "Hai", trongSo: 1, thang: "10" }] }],
      thangChu: [{ chu: "A", diem: 9, tu: 5 }, { chu: "B", diem: 7, tu: 6 }],
    });
    const loi = kiemTraMauPhieu(m);
    assert.ok(loi.some((l) => l.includes("trùng")));
    assert.ok(loi.some((l) => l.includes("giảm dần")));
    assert.equal(LuocDoMauPhieu.safeParse({ tieuDe: "Thiếu phần", phan: [] }).success, false);
  });
});
