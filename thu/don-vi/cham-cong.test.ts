/**
 * Kiểm thử đơn vị phần thuần của 0.19.0 — Nhân sự: chấm công, nghỉ phép, tăng ca, bảng công, ADMS.
 * Luật: BUSINESS_RULES.md mục 30 (NS). Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canhBaoTangCa,
  chenhLechCong,
  chiaNuaCa,
  congDuKien,
  congSoLieu,
  danhGiaViTri,
  duongDanBanDo,
  ganNgayCong,
  gioVePhut,
  khoangCachMet,
  laBamTrung,
  laCaQuaDem,
  mocVN,
  ngayVNCua,
  phutDiMuon,
  phutGiaoDem,
  phutLamCuaCa,
  phutVeGio,
  phutVeSom,
  thuTrongTuan,
  tinhCongNgay,
  tinhTangCa,
  tocDoToiThieuKmh,
  tongHopThang,
  trangThaiHomNay,
  apXetThieuGio,
  canChapNhanMoiTinh,
  chonPhieuHienTruong,
  danhGiaGioMay,
  type CaLam,
  type DongCongThang,
  type PhanNgay,
} from "../../src/modules/cham-cong/tinh-toan";
import {
  BO_DOC_ZKTECO,
  demDongKhongRong,
  diemCuoiTuDuongDan,
  gioMayVeUtc,
  laSoSeriHopLe,
  phanHoiBatTay,
  phanHoiOk,
  phanTichAttlog,
  phanTichInfo,
  phanTichYeuCau,
} from "../../src/modules/cham-cong/adms";
import { chuanHoaThoiGian, phanTichCsvChamCong } from "../../src/modules/cham-cong/nhap-csv";
import {
  donChongNhau,
  phepChuyenSang,
  phepDaTichLuy,
  quyPhepNam,
  soDuPhep,
  soNamThamNien,
  soNgayCuaDon,
  type CauHinhPhep,
} from "../../src/modules/nghi-phep/tinh-toan";
import { gioChamBu } from "../../src/modules/cham-cong/don-tu";
import { duocTinhCong } from "../../src/modules/cham-cong/service";
import { VAI_TRO, phamViCuaQuyen, toanBoQuyen } from "../../src/lib/vai-tro";
import { DANH_MUC_CAU_HINH } from "../../src/modules/cau-hinh/danh-muc";

const HC: CaLam = { batDauPhut: 8 * 60, ketThucPhut: 17 * 60, nghiBatDauPhut: 12 * 60, nghiPhut: 60, choPhepMuonPhut: null, choPhepSomPhut: null };
const DEM: CaLam = { batDauPhut: 22 * 60, ketThucPhut: 6 * 60, nghiBatDauPhut: 2 * 60, nghiPhut: 30, choPhepMuonPhut: 10, choPhepSomPhut: null };
const T2_T6_SANG_T7: PhanNgay[] = ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"];
const MAC_DINH = { choPhepMuonPhut: 5, choPhepSomPhut: 5 };
const KHUNG_DEM = { batDauGio: 22, ketThucGio: 6 };
const vn = (s: string) => new Date(`${s}+07:00`);

describe("Giờ Việt Nam (+07:00 cố định)", () => {
  it("mocVN / ngayVNCua / thứ trong tuần", () => {
    assert.equal(mocVN("2026-11-02", 8 * 60).toISOString(), "2026-11-02T01:00:00.000Z");
    assert.equal(mocVN("2026-11-02", 1440 + 6 * 60).toISOString(), "2026-11-02T23:00:00.000Z");
    assert.equal(ngayVNCua(new Date("2026-11-02T17:30:00Z")), "2026-11-03");
    assert.equal(thuTrongTuan("2026-11-02"), 0); // thứ Hai
    assert.equal(thuTrongTuan("2026-11-08"), 6); // Chủ nhật
  });
  it("giờ ↔ phút", () => {
    assert.equal(gioVePhut("08:30"), 510);
    assert.equal(gioVePhut("24:00"), null);
    assert.equal(gioVePhut("8h"), null);
    assert.equal(phutVeGio(1440 + 75), "01:15");
  });
});

describe("NS-11: khoảng cách haversine và bán kính", () => {
  const VP = { lat: 10.7769, lng: 106.7009 };
  it("khoảng cách 0 tại chỗ, ~111 km mỗi độ vĩ", () => {
    assert.equal(khoangCachMet(VP, VP), 0);
    const d = khoangCachMet({ lat: 10, lng: 106 }, { lat: 11, lng: 106 });
    assert.ok(Math.abs(d - 111_195) < 50, `${d}`);
  });
  it("Hà Nội – TP.HCM khoảng 1.140 km", () => {
    const d = khoangCachMet({ lat: 21.0285, lng: 105.8542 }, { lat: 10.8231, lng: 106.6297 });
    assert.ok(d > 1_130_000 && d < 1_150_000, `${d}`);
  });
  const dd = [{ id: "a", ten: "Văn phòng", ...VP, banKinhM: null }, { id: "b", ten: "Kho", lat: 10.8, lng: 106.7, banKinhM: 300 }];
  const ch = { banKinhMacDinhM: 150, doChinhXacToiDaM: 100 };
  it("trong bán kính mặc định → trong vùng, chọn địa điểm gần nhất", () => {
    const kq = danhGiaViTri({ lat: 10.7770, lng: 106.7010, doChinhXacM: 20 }, dd, ch);
    assert.equal(kq.trongVung, true);
    assert.equal(kq.diaDiem?.id, "a");
    assert.deepEqual(kq.co, []);
  });
  it("biên bán kính: 149 m trong, 151 m ngoài", () => {
    const lat149 = VP.lat + 149 / 111_195;
    const lat151 = VP.lat + 151 / 111_195;
    assert.equal(danhGiaViTri({ lat: lat149, lng: VP.lng, doChinhXacM: 5 }, dd.slice(0, 1), ch).trongVung, true);
    assert.equal(danhGiaViTri({ lat: lat151, lng: VP.lng, doChinhXacM: 5 }, dd.slice(0, 1), ch).trongVung, false);
  });
  it("bán kính riêng của địa điểm đè mặc định", () => {
    const p = { lat: 10.8 + 250 / 111_195, lng: 106.7, doChinhXacM: 10 };
    assert.equal(danhGiaViTri(p, dd, ch).diaDiem?.id, "b");
    assert.equal(danhGiaViTri(p, dd, ch).trongVung, true);
  });
  it("độ chính xác kém hơn ngưỡng → gắn cờ; không có vị trí → ngoài vùng + cờ thiếu quyền", () => {
    assert.deepEqual(danhGiaViTri({ ...VP, doChinhXacM: 250 }, dd, ch).co, ["do-chinh-xac-thap"]);
    assert.deepEqual(danhGiaViTri({ ...VP, doChinhXacM: null }, dd, ch).co, ["do-chinh-xac-thap"]);
    const k = danhGiaViTri(null, dd, ch);
    assert.equal(k.trongVung, false);
    assert.deepEqual(k.co, ["thieu-quyen-vi-tri"]);
  });
  it("tốc độ tối thiểu trừ sai số; liên kết bản đồ Google", () => {
    const a = { lat: 10.7769, lng: 106.7009, luc: new Date("2026-11-02T01:00:00Z"), doChinhXacM: 10 };
    const b = { lat: 21.0285, lng: 105.8542, luc: new Date("2026-11-02T01:10:00Z"), doChinhXacM: 10 };
    assert.ok(tocDoToiThieuKmh(a, b) > 5000);
    assert.equal(tocDoToiThieuKmh(a, { ...a, lat: a.lat + 15 / 111_195, luc: new Date(a.luc.getTime() + 1000) }), 0);
    assert.equal(duongDanBanDo(10.7769, 106.7009), "https://www.google.com/maps/search/?api=1&query=10.776900,106.700900");
  });
  it("NS-13: bấm trùng trong N giây", () => {
    const t = new Date("2026-11-02T01:00:00Z");
    assert.equal(laBamTrung(t, new Date(t.getTime() + 59_000), 60), true);
    assert.equal(laBamTrung(t, new Date(t.getTime() + 60_000), 60), false);
    assert.equal(laBamTrung(null, t, 60), false);
  });
});

describe("NS-06 → NS-09: ca, nửa ca, ca qua đêm, công dự kiến", () => {
  it("ca hành chính: 8 giờ làm, nửa sáng 08–12, nửa chiều 13–17", () => {
    assert.equal(laCaQuaDem(HC), false);
    assert.equal(phutLamCuaCa(HC), 480);
    const n = chiaNuaCa(HC);
    assert.deepEqual(n.sang, { batDau: 480, ketThuc: 720 });
    assert.deepEqual(n.chieu, { batDau: 780, ketThuc: 1020 });
  });
  it("ca không khai giờ nghỉ: chia đôi phần làm", () => {
    const n = chiaNuaCa({ ...HC, nghiBatDauPhut: null, nghiPhut: 0 });
    assert.deepEqual(n.sang, { batDau: 480, ketThuc: 750 });
  });
  it("ca qua đêm 22:00 → 06:00: kết thúc sáng hôm sau, nghỉ 02:00 rơi vào ngày sau", () => {
    assert.equal(laCaQuaDem(DEM), true);
    assert.equal(phutLamCuaCa(DEM), 450);
    const dk = congDuKien("2026-11-02", DEM, ["ca", "ca", "ca", "ca", "ca", "ca", "ca"], false);
    assert.equal(dk.khoang?.batDau.toISOString(), vn("2026-11-02T22:00:00").toISOString());
    assert.equal(dk.khoang?.ketThuc.toISOString(), vn("2026-11-03T06:00:00").toISOString());
    assert.equal(dk.nuaSang?.ketThuc.toISOString(), vn("2026-11-03T02:00:00").toISOString());
  });
  it("lịch tuần: thứ Bảy nửa ngày sáng = 0,5 công; Chủ nhật nghỉ tuần; ngày lễ = 0", () => {
    const t7 = congDuKien("2026-11-07", HC, T2_T6_SANG_T7, false);
    assert.equal(t7.giaTri, 0.5);
    assert.equal(t7.khoang?.ketThuc.toISOString(), vn("2026-11-07T12:00:00").toISOString());
    const cn = congDuKien("2026-11-08", HC, T2_T6_SANG_T7, false);
    assert.equal(cn.giaTri, 0);
    assert.equal(cn.loaiNgay, "nghi-tuan");
    const le = congDuKien("2026-11-02", HC, T2_T6_SANG_T7, true);
    assert.equal(le.giaTri, 0);
    assert.equal(le.loaiNgay, "le");
    const chuaLich = congDuKien("2026-11-02", null, null, false);
    assert.equal(chuaLich.coLich, false);
    assert.equal(chuaLich.giaTri, 0);
  });
  it("ghép lần chấm ca đêm: ra ca 06:05 sáng hôm sau thuộc ngày bắt đầu ca", () => {
    const tuan: PhanNgay[] = ["ca", "ca", "ca", "ca", "ca", "ca", "ca"];
    const ngays = ["2026-11-02", "2026-11-03"].map((n) => congDuKien(n, DEM, tuan, false));
    const g = ganNgayCong([vn("2026-11-02T21:55:00"), vn("2026-11-03T06:05:00"), vn("2026-11-03T21:58:00")], ngays, 240, 480);
    assert.equal(g.get("2026-11-02")?.length, 2);
    assert.equal(g.get("2026-11-03")?.length, 1);
  });
  it("lần chấm ngày nghỉ (không có khung ca) thuộc ngày lịch của nó", () => {
    const g = ganNgayCong([vn("2026-11-08T09:00:00")], [congDuKien("2026-11-08", HC, T2_T6_SANG_T7, false)], 240, 480);
    assert.deepEqual([...g.keys()], ["2026-11-08"]);
  });
});

describe("NS-08: đi muộn / về sớm / giá trị công", () => {
  const ngay = congDuKien("2026-11-02", HC, T2_T6_SANG_T7, false);
  it("trong khoảng cho phép → 0; vượt → tính đủ số phút", () => {
    assert.equal(phutDiMuon(vn("2026-11-02T08:05:00"), ngay.khoang!.batDau, 5), 0);
    assert.equal(phutDiMuon(vn("2026-11-02T08:06:00"), ngay.khoang!.batDau, 5), 6);
    assert.equal(phutDiMuon(vn("2026-11-02T07:50:00"), ngay.khoang!.batDau, 5), 0);
    assert.equal(phutVeSom(vn("2026-11-02T16:40:00"), ngay.khoang!.ketThuc, 5), 20);
    assert.equal(phutVeSom(null, ngay.khoang!.ketThuc, 5), 0);
  });
  it("đủ vào + ra → 1 công, ghi phút muộn", () => {
    const c = tinhCongNgay(ngay, [vn("2026-11-02T17:02:00"), vn("2026-11-02T08:20:00")], null, MAC_DINH);
    assert.equal(c.giaTriCong, 1);
    assert.equal(c.phutMuon, 20);
    assert.deepEqual(c.co, ["di-muon"]);
  });
  it("ca có mức cho phép riêng đè mặc định", () => {
    const dk = congDuKien("2026-11-02", { ...HC, choPhepMuonPhut: 30 }, T2_T6_SANG_T7, false);
    assert.equal(tinhCongNgay(dk, [vn("2026-11-02T08:20:00"), vn("2026-11-02T17:00:00")], null, MAC_DINH).phutMuon, 0);
  });
  it("một lần chấm → 0 công + cờ thiếu; không chấm → vắng mặt", () => {
    assert.deepEqual(tinhCongNgay(ngay, [vn("2026-11-02T08:00:00")], null, MAC_DINH).co, ["thieu-cham-ra"]);
    assert.deepEqual(tinhCongNgay(ngay, [vn("2026-11-02T17:10:00")], null, MAC_DINH).co, ["thieu-cham-vao"]);
    const v = tinhCongNgay(ngay, [], null, MAC_DINH);
    assert.equal(v.giaTriCong, 0);
    assert.deepEqual(v.co, ["vang-mat"]);
  });
  it("hai lần chấm cùng một phút không tính là có giờ ra", () => {
    assert.equal(tinhCongNgay(ngay, [vn("2026-11-02T08:00:00"), vn("2026-11-02T08:00:30")], null, MAC_DINH).raCuoi, null);
  });
  it("nghỉ phép nửa ngày sáng: làm nửa chiều = 0,5 công, muộn tính theo 13:00", () => {
    const c = tinhCongNgay(ngay, [vn("2026-11-02T13:10:00"), vn("2026-11-02T17:00:00")], { giaTri: 0.5, phan: "sang", maLoai: "phep-nam", coLuong: true }, MAC_DINH);
    assert.equal(c.giaTriCong, 0.5);
    assert.equal(c.nghiNgay, 0.5);
    assert.equal(c.phutMuon, 10);
  });
  it("nghỉ cả ngày → 0 công, nghỉ 1; thứ Bảy nửa ngày nghỉ phép chỉ tính 0,5", () => {
    const c = tinhCongNgay(ngay, [], { giaTri: 1, phan: "ca-ngay", maLoai: "phep-nam", coLuong: true }, MAC_DINH);
    assert.equal(c.giaTriCong, 0);
    assert.equal(c.nghiNgay, 1);
    const t7 = congDuKien("2026-11-07", HC, T2_T6_SANG_T7, false);
    assert.equal(tinhCongNgay(t7, [], { giaTri: 1, phan: "ca-ngay", maLoai: "x", coLuong: true }, MAC_DINH).nghiNgay, 0.5);
  });
  it("trạng thái trực tiếp", () => {
    const tt = (ds: { luc: Date; huong: "vao" | "ra" | null; ketQuaGps: string | null }[], bay: string, nghi = false) =>
      trangThaiHomNay(ngay, ds, nghi, vn(bay), 5);
    assert.equal(tt([], "2026-11-02T07:30:00"), "chua-toi-gio");
    assert.equal(tt([], "2026-11-02T09:00:00"), "chua-den");
    assert.equal(tt([], "2026-11-02T09:00:00", true), "nghi-phep");
    assert.equal(tt([{ luc: vn("2026-11-02T07:58:00"), huong: "vao", ketQuaGps: "hop-le" }], "2026-11-02T09:00:00"), "da-vao-ca");
    assert.equal(tt([{ luc: vn("2026-11-02T08:30:00"), huong: null, ketQuaGps: null }], "2026-11-02T09:00:00"), "di-muon");
    assert.equal(tt([{ luc: vn("2026-11-02T08:00:00"), huong: "vao", ketQuaGps: "hien-truong" }], "2026-11-02T09:00:00"), "hien-truong");
    assert.equal(tt([{ luc: vn("2026-11-02T08:00:00"), huong: "vao", ketQuaGps: null }, { luc: vn("2026-11-02T17:01:00"), huong: "ra", ketQuaGps: null }], "2026-11-02T17:05:00"), "da-ra-ca");
    assert.equal(trangThaiHomNay(congDuKien("2026-11-08", HC, T2_T6_SANG_T7, false), [], false, vn("2026-11-08T09:00:00"), 5), "khong-co-ca");
  });
});

describe("NS-41 → NS-43: tăng ca", () => {
  const ngay = congDuKien("2026-11-02", HC, T2_T6_SANG_T7, false);
  it("ngày thường: chỉ phần sau giờ ra ca, cắt theo giờ duyệt", () => {
    const tc = tinhTangCa(ngay, vn("2026-11-02T07:30:00"), vn("2026-11-02T20:30:00"), 2, KHUNG_DEM);
    assert.equal(tc.loaiNgay, "thuong");
    assert.equal(tc.phutThucTe, 210);
    assert.equal(tc.phut, 120);
    assert.equal(tc.phutDem, 0);
  });
  it("chưa duyệt → không tính dù có làm thêm", () => {
    const tc = tinhTangCa(ngay, vn("2026-11-02T08:00:00"), vn("2026-11-02T19:00:00"), null, KHUNG_DEM);
    assert.equal(tc.phutThucTe, 120);
    assert.equal(tc.phut, 0);
  });
  it("làm tới 23:30 ngày thường: tách 90 phút giờ đêm", () => {
    const tc = tinhTangCa(ngay, vn("2026-11-02T08:00:00"), vn("2026-11-02T23:30:00"), 8, KHUNG_DEM);
    assert.equal(tc.phut, 390);
    assert.equal(tc.phutDem, 90);
  });
  it("Chủ nhật: cả khoảng vào → ra, trừ giờ nghỉ của ca; ngày lễ phân loại le", () => {
    const cn = congDuKien("2026-11-08", HC, T2_T6_SANG_T7, false);
    const tc = tinhTangCa(cn, vn("2026-11-08T08:00:00"), vn("2026-11-08T17:00:00"), 10, KHUNG_DEM);
    assert.equal(tc.loaiNgay, "nghi-tuan");
    assert.equal(tc.phut, 480);
    const le = congDuKien("2026-09-02", HC, T2_T6_SANG_T7, true);
    assert.equal(tinhTangCa(le, vn("2026-09-02T09:00:00"), vn("2026-09-02T11:00:00"), 4, KHUNG_DEM).loaiNgay, "le");
  });
  it("phút giao giờ đêm qua nửa đêm", () => {
    assert.equal(phutGiaoDem(vn("2026-11-02T21:00:00"), vn("2026-11-03T07:00:00"), "2026-11-02", KHUNG_DEM), 480);
  });
  it("cảnh báo trần: chưa đặt → không; đạt % → gần; vượt → vượt", () => {
    assert.equal(canhBaoTangCa(600, 120, null, 80).muc, null);
    assert.equal(canhBaoTangCa(1800, 60, 40, 80).muc, null);
    assert.equal(canhBaoTangCa(1800, 180, 40, 80).muc, "gan");
    assert.equal(canhBaoTangCa(2400, 60, 40, 80).muc, "vuot");
  });
});

describe("NS-31 → NS-33: quỹ phép", () => {
  const ch: CauHinhPhep = { soNgayNam: 12, thamNienSoNam: 5, thamNienCongNgay: 1, congDonTheoThang: true, chuyenNamSauToiDa: 3 };
  it("thâm niên tròn năm", () => {
    assert.equal(soNamThamNien("2020-03-15", "2026-01-01"), 5);
    assert.equal(soNamThamNien("2021-01-02", "2026-01-01"), 4);
    assert.equal(soNamThamNien(null, "2026-01-01"), 0);
  });
  it("quỹ năm: cơ bản + thâm niên; vào giữa năm chia theo tháng; vào sau năm = 0", () => {
    assert.equal(quyPhepNam("2015-01-01", 2026, ch), 14);
    assert.equal(quyPhepNam("2026-07-10", 2026, ch), 6);
    assert.equal(quyPhepNam("2027-01-01", 2026, ch), 0);
    assert.equal(quyPhepNam(null, 2026, { ...ch, thamNienSoNam: null }), 12);
  });
  it("cộng dồn theo tháng, làm tròn xuống 0,5", () => {
    assert.equal(phepDaTichLuy("2010-01-01", 2026, "2026-03-20", { ...ch, thamNienSoNam: null }), 3);
    assert.equal(phepDaTichLuy("2010-01-01", 2026, "2026-03-20", ch), 3.5);
    assert.equal(phepDaTichLuy("2026-07-10", 2026, "2026-08-01", ch), 2);
    assert.equal(phepDaTichLuy("2010-01-01", 2026, "2026-03-20", { ...ch, congDonTheoThang: false }), 15);
    assert.equal(phepDaTichLuy("2010-01-01", 2026, "2027-02-01", ch), 15);
  });
  it("chuyển năm sau không quá trần; số dư", () => {
    assert.equal(phepChuyenSang(5.7, ch), 3);
    assert.equal(phepChuyenSang(-2, ch), 0);
    const sd = soDuPhep({ quyNam: 12, daTichLuy: 6, chuyenSang: 2, dieuChinh: 1, daDung: 3, dangCho: 1 });
    assert.equal(sd.duocDung, 6);
    assert.equal(sd.conLaiCaNam, 12);
  });
  it("số ngày của đơn bỏ ngày nghỉ tuần / lễ; nửa ngày = 0,5", () => {
    assert.equal(soNgayCuaDon([{ ngay: "a", giaTriDuKien: 1 }, { ngay: "b", giaTriDuKien: 0.5 }, { ngay: "c", giaTriDuKien: 0 }], "ca-ngay"), 1.5);
    assert.equal(soNgayCuaDon([{ ngay: "a", giaTriDuKien: 1 }], "sang"), 0.5);
    assert.equal(soNgayCuaDon([{ ngay: "a", giaTriDuKien: 0 }], "chieu"), 0);
    // QA 0.19.0: lịch chỉ làm sáng (thứ Bảy) → xin nghỉ chiều không trừ phép; xin nghỉ sáng = 0,5.
    assert.equal(soNgayCuaDon([{ ngay: "a", giaTriDuKien: 0.5, phanDuKien: "sang" }], "chieu"), 0);
    assert.equal(soNgayCuaDon([{ ngay: "a", giaTriDuKien: 0.5, phanDuKien: "sang" }], "sang"), 0.5);
    assert.equal(soNgayCuaDon([{ ngay: "a", giaTriDuKien: 0.5, phanDuKien: "chieu" }], "sang"), 0);
    assert.equal(soNgayCuaDon([{ ngay: "a", giaTriDuKien: 1, phanDuKien: "ca" }], "chieu"), 0.5);
  });
  it("đơn chồng nhau: nửa sáng + nửa chiều cùng ngày thì không", () => {
    assert.equal(donChongNhau({ tu: "2026-11-02", den: "2026-11-02", phan: "sang" }, { tu: "2026-11-02", den: "2026-11-02", phan: "chieu" }), false);
    assert.equal(donChongNhau({ tu: "2026-11-02", den: "2026-11-04", phan: "ca-ngay" }, { tu: "2026-11-04", den: "2026-11-04", phan: "chieu" }), true);
    assert.equal(donChongNhau({ tu: "2026-11-02", den: "2026-11-03", phan: "ca-ngay" }, { tu: "2026-11-04", den: "2026-11-05", phan: "ca-ngay" }), false);
  });
});

describe("NS-50 → NS-53: bảng công tháng", () => {
  const dong = (p: Partial<DongCongThang>): DongCongThang => ({
    userId: "u1", ngay: "2026-11-02", laDieuChinh: false, loaiNgay: "thuong", congDuKien: 1, congThucTe: 1, phutMuon: 0, phutSom: 0,
    nghiNgay: 0, nghiCoLuong: false, phutTangCa: 0, phutTangCaDem: 0, co: [], ...p,
  });
  it("tổng hợp theo người, tách tăng ca theo loại ngày, nghỉ có / không lương", () => {
    const t = tongHopThang([
      dong({ phutMuon: 12, co: ["di-muon"] }),
      dong({ ngay: "2026-11-03", congThucTe: 0, nghiNgay: 1, nghiCoLuong: true }),
      dong({ ngay: "2026-11-04", congThucTe: 0.5, nghiNgay: 0.5, nghiCoLuong: false }),
      dong({ ngay: "2026-11-08", loaiNgay: "nghi-tuan", congDuKien: 0, congThucTe: 0, phutTangCa: 240, phutTangCaDem: 30 }),
      dong({ ngay: "2026-09-02", loaiNgay: "le", congDuKien: 0, congThucTe: 0, phutTangCa: 60 }),
      dong({ userId: "u2" }),
    ]);
    const u1 = t.find((x) => x.userId === "u1")!;
    assert.equal(u1.congDuKien, 3);
    assert.equal(u1.congThucTe, 1.5);
    assert.equal(u1.nghiCoLuong, 1);
    assert.equal(u1.nghiKhongLuong, 0.5);
    assert.equal(u1.soLanMuon, 1);
    assert.equal(u1.tangCaNghiTuanPhut, 240);
    assert.equal(u1.tangCaLePhut, 60);
    assert.equal(u1.tangCaDemPhut, 30);
    assert.equal(u1.soNgayCo, 1);
    assert.equal(t.length, 2);
  });
  it("dòng điều chỉnh = chênh lệch, cộng thẳng vào tổng", () => {
    const daKhoa = { congDuKien: 1, congThucTe: 0, phutMuon: 0, phutSom: 0, nghiNgay: 0, phutTangCa: 0, phutTangCaDem: 0 };
    const moi = { ...daKhoa, congThucTe: 1, phutMuon: 7 };
    assert.deepEqual(chenhLechCong(moi, daKhoa), { ...daKhoa, congDuKien: 0, congThucTe: 1, phutMuon: 7 });
    assert.equal(chenhLechCong(daKhoa, daKhoa), null);
    assert.deepEqual(congSoLieu(daKhoa, { ...daKhoa, congDuKien: 0, congThucTe: 1 }).congThucTe, 1);
    const t = tongHopThang([dong({ laDieuChinh: true, congDuKien: 0, congThucTe: 1, phutMuon: 7 })]);
    assert.equal(t[0].congThucTe, 1);
    assert.equal(t[0].soLanMuon, 0);
    assert.equal(t[0].soDongDieuChinh, 1);
  });
  it("NS-12: lần chấm được tính công", () => {
    assert.equal(duocTinhCong({ gpsResult: "hop-le" }, undefined), true);
    assert.equal(duocTinhCong({ gpsResult: "hien-truong" }, undefined), true);
    assert.equal(duocTinhCong({ gpsResult: "hien-truong" }, "tu-choi"), false);
    assert.equal(duocTinhCong({ gpsResult: "ngoai-vung" }, undefined), false);
    assert.equal(duocTinhCong({ gpsResult: "ngoai-vung" }, "chap-nhan"), true);
    assert.equal(duocTinhCong({ gpsResult: null }, undefined), true);
  });
  it("giờ chấm bù: ca đêm 'sáng hôm sau' cộng một ngày", () => {
    assert.equal(gioChamBu("2026-11-02", "06:00", true)?.toISOString(), vn("2026-11-03T06:00:00").toISOString());
    assert.equal(gioChamBu("2026-11-02", "08:00", false)?.toISOString(), vn("2026-11-02T08:00:00").toISOString());
    assert.equal(gioChamBu("2026-11-02", "8h", false), null);
  });
});

describe("NS-14: giao thức ZKTeco ADMS / PUSH", () => {
  it("đọc yêu cầu bắt tay, điểm cuối có / không đuôi .aspx, SN không phân biệt hoa thường", () => {
    const y = phanTichYeuCau("GET", "cdata", new URLSearchParams("SN=CQZ7224460123&options=all&pushver=2.4.1&language=69"));
    assert.equal(y.diemCuoi, "cdata");
    assert.equal(y.sn, "CQZ7224460123");
    assert.equal(y.batTay, true);
    assert.equal(diemCuoiTuDuongDan("getrequest.aspx"), "getrequest");
    assert.equal(diemCuoiTuDuongDan("CDATA"), "cdata");
    assert.equal(diemCuoiTuDuongDan("upload"), "khac");
    assert.equal(phanTichYeuCau("GET", "cdata", new URLSearchParams("sn=ABCD1234")).sn, "ABCD1234");
    const p = phanTichYeuCau("POST", "cdata", new URLSearchParams("SN=ABCD1234&table=ATTLOG&Stamp=9999"));
    assert.equal(p.bang, "ATTLOG");
    assert.equal(p.stamp, "9999");
    assert.equal(p.batTay, false);
  });
  it("SN hợp lệ", () => {
    assert.equal(laSoSeriHopLe("CQZ7224460123"), true);
    assert.equal(laSoSeriHopLe("abc"), false);
    assert.equal(laSoSeriHopLe("A B C D"), false);
    assert.equal(laSoSeriHopLe("x'; DROP TABLE"), false);
    assert.equal(laSoSeriHopLe(null), false);
  });
  it("câu trả lời bắt tay theo PUSH SDK", () => {
    const s = phanHoiBatTay("CQZ7224460123", { attlogStamp: null, operlogStamp: "9999" });
    const dong = s.trim().split("\n");
    assert.equal(dong[0], "GET OPTION FROM: CQZ7224460123");
    for (const k of ["ATTLOGStamp=None", "OPERLOGStamp=9999", "ErrorDelay=30", "Delay=10", "TransInterval=1", "Realtime=1", "Encrypt=None", "TimeZone=7"]) {
      assert.ok(dong.includes(k), `thiếu dòng ${k}`);
    }
    assert.ok(dong.some((d) => d.startsWith("TransFlag=") && d.includes("AttLog")));
    assert.ok(dong.some((d) => d.startsWith("TransTimes=")));
    assert.equal(phanHoiOk(3), "OK: 3");
    assert.equal(phanHoiOk(), "OK");
  });
  it("giờ máy (giờ VN) → UTC; ngày không có thật bị từ chối", () => {
    assert.equal(gioMayVeUtc("2026-11-02 08:01:22")?.toISOString(), "2026-11-02T01:01:22.000Z");
    assert.equal(gioMayVeUtc("2026-11-02 00:30:00")?.toISOString(), "2026-11-01T17:30:00.000Z");
    assert.equal(gioMayVeUtc("2026-02-30 08:00:00"), null);
    assert.equal(gioMayVeUtc("2026-11-02 24:00:00"), null);
    assert.equal(gioMayVeUtc("hôm nay"), null);
  });
  it("ATTLOG nhiều dòng, CRLF, dòng hỏng không làm hỏng cả lô", () => {
    const than = [
      "1\t2026-11-02 07:58:03\t0\t1\t0\t0\t0",
      "25\t2026-11-02 08:12:44\t0\t1\t\t0\t0",
      "",
      "\t2026-11-02 08:15:00\t0\t1",
      "7\t2026-13-01 08:00:00\t0\t1",
      "1\t2026-11-02 17:31:10\t1\t15\t5\t0\t0",
      "9  2026-11-02 08:20:00  0  1",
    ].join("\r\n");
    const { dong, loi } = phanTichAttlog(than);
    assert.equal(dong.length, 4);
    assert.equal(loi.length, 2);
    assert.equal(dong[0].pin, "1");
    assert.equal(dong[0].luc.toISOString(), "2026-11-02T00:58:03.000Z");
    assert.equal(dong[0].trangThai, 0);
    assert.equal(dong[0].xacThuc, 1);
    assert.equal(dong[2].trangThai, 1);
    assert.equal(dong[2].xacThuc, 15);
    assert.equal(dong[2].maCongViec, "5");
    assert.equal(dong[3].pin, "9");
    assert.equal(dong[3].gioMay, "2026-11-02 08:20:00");
    assert.match(loi[0].lyDo, /PIN/);
    assert.match(loi[1].lyDo, /Thời gian/);
    assert.equal(demDongKhongRong(than), 6);
  });
  it("thân rỗng / BOM / ký tự NUL", () => {
    assert.deepEqual(phanTichAttlog(""), { dong: [], loi: [] });
    assert.equal(phanTichAttlog("﻿3\t2026-11-02 08:00:00\t0\t1\0").dong[0]?.pin, "3");
  });
  it("INFO của máy; bộ đọc mặc định", () => {
    assert.deepEqual(phanTichInfo("Ver 6.60 Oct 29 2019,12,10,3456,192.168.1.201"), { phienBan: "Ver 6.60 Oct 29 2019", soNguoi: "12", soVanTay: "10", soBanGhi: "3456", ip: "192.168.1.201" });
    assert.equal(phanTichInfo(null), null);
    assert.equal(BO_DOC_ZKTECO.phanHoiOk(1), "OK: 1");
  });
});

describe("NS-16: CSV dự phòng", () => {
  it("cột Thời gian một cột, dd/mm/yyyy và ISO", () => {
    const kq = phanTichCsvChamCong("Mã chấm công;Thời gian\n1;03/11/2026 08:01\n2;2026-11-03 17:30:05\n;03/11/2026 08:00\n3;hôm qua\n");
    assert.equal(kq.dong.length, 2);
    assert.equal(kq.dong[0].luc.toISOString(), "2026-11-03T01:01:00.000Z");
    assert.equal(kq.loi.length, 2);
  });
  it("hai cột Ngày + Giờ; thiếu cột thời gian → báo thiếu", () => {
    assert.equal(phanTichCsvChamCong("PIN,Ngày,Giờ\n5,03/11/2026,07:59:30\n").dong[0].luc.toISOString(), "2026-11-03T00:59:30.000Z");
    assert.ok(phanTichCsvChamCong("PIN,Ghi chú\n5,abc\n").thieuCot.length > 0);
    assert.equal(chuanHoaThoiGian("3/1/2026 7:05"), "2026-01-03 07:05:00");
  });
});

describe("NS-70: quyền và vai trò chấm công", () => {
  it("mọi vai trò người thật (trừ AI) có cham_cong.view + create; nhân viên chỉ phạm vi của mình", () => {
    for (const v of VAI_TRO) {
      if (v.quyen === "*" || v.code === "ai-assistant") continue;
      assert.ok(v.quyen.includes("cham_cong.view") && v.quyen.includes("cham_cong.create"), `${v.code} thiếu quyền chấm công`);
    }
    for (const ma of ["marketing", "purchasing", "warehouse", "finance", "customer-service", "sales", "technical", "sinh-vien-thuc-tap"]) {
      const v = VAI_TRO.find((x) => x.code === ma)!;
      assert.equal(phamViCuaQuyen(v, "cham_cong.view"), "own", ma);
    }
  });
  it("trưởng phòng duyệt theo nhóm / phòng; Nhân sự toàn công ty; AI không có chấm công", () => {
    const pv = (ma: string, q: string) => phamViCuaQuyen(VAI_TRO.find((x) => x.code === ma)!, q);
    assert.equal(pv("sales-manager", "cham_cong.approve"), "team");
    assert.equal(pv("marketing-manager", "cham_cong.approve"), "team");
    assert.equal(pv("technical-manager", "cham_cong.approve"), "department");
    assert.equal(pv("nhan-su-hr", "cham_cong.approve"), "all");
    assert.equal(pv("nhan-su-hr", "task.view"), "own");
    const ai = VAI_TRO.find((x) => x.code === "ai-assistant")!;
    assert.ok(ai.quyen !== "*" && !ai.quyen.some((q) => q.startsWith("cham_cong.") || q.startsWith("nhan_su.")));
  });
  it("Thực tập sinh không thấy khách hàng, giá, đơn hàng", () => {
    const tts = VAI_TRO.find((x) => x.code === "sinh-vien-thuc-tap")!;
    assert.ok(tts.quyen !== "*");
    assert.ok(!tts.quyen.some((q) => /^(customer|crm|sales|quotation|order|product|finance|supplier)\./.test(q)));
  });
  it("danh mục quyền có phân hệ cham_cong, nhan_su; ngưỡng ở Cấu hình có mặc định đúng đặc tả", () => {
    const ds = new Set(toanBoQuyen().map((q) => q.code));
    assert.ok(ds.has("cham_cong.approve") && ds.has("nhan_su.update"));
    const md = (k: string) => DANH_MUC_CAU_HINH.find((m) => m.khoa === k)?.macDinh;
    assert.equal(md("cham_cong.ban_kinh_mac_dinh_m"), 150);
    assert.equal(md("cham_cong.do_chinh_xac_toi_da_m"), 100);
    assert.equal(md("cham_cong.nhac_chua_cham_sau_phut"), 15);
    assert.equal(md("cham_cong.may_mat_ket_noi_phut"), 10);
    assert.equal(md("cham_cong.han_phan_hoi_ngay"), 3);
    assert.equal(md("cham_cong.tang_ca_toi_da_thang"), null);
    assert.equal(md("nghi_phep.so_ngay_nam"), 12);
  });
});

describe("QA 0.19.0 — quyết định chính sách (QĐ-113 → QĐ-118)", () => {
  const NG = { lechToiDaPhut: 60, namToiThieu: 2020 };
  const bay = new Date("2026-10-10T02:00:00Z"); // 09:00 giờ VN
  it("QĐ-113: giờ máy đi trước > ngưỡng → lệch; > 1 ngày hoặc năm < 2020 → vô lý; trong ngưỡng / quá khứ gần → không cờ", () => {
    assert.deepEqual(danhGiaGioMay(new Date(bay.getTime() + 30 * 60_000), bay, NG), []);
    assert.deepEqual(danhGiaGioMay(new Date(bay.getTime() + 61 * 60_000), bay, NG), ["gio-may-lech"]);
    assert.deepEqual(danhGiaGioMay(new Date(bay.getTime() + 25 * 3_600_000), bay, NG), ["gio-may-lech", "gio-may-vo-ly"]);
    assert.deepEqual(danhGiaGioMay(new Date("2000-01-01T00:00:00+07:00"), bay, NG), ["gio-may-vo-ly"]);
    assert.deepEqual(danhGiaGioMay(new Date("2019-12-31T23:59:00+07:00"), bay, NG), ["gio-may-vo-ly"]);
    assert.deepEqual(danhGiaGioMay(new Date("2020-01-01T00:00:00+07:00"), bay, NG), []);
    assert.deepEqual(danhGiaGioMay(new Date("2026-01-05T08:00:00+07:00"), bay, NG), [], "lần đồng bộ đầu gửi lại dữ liệu cũ hợp lệ — không cờ");
    // Ngưỡng lấy từ Cấu hình, không cố định.
    assert.deepEqual(danhGiaGioMay(new Date(bay.getTime() + 30 * 60_000), bay, { lechToiDaPhut: 10, namToiThieu: 2020 }), ["gio-may-lech"]);
  });
  it("QĐ-113 / QĐ-115: lần chấm mang cờ chờ chấp nhận không tính công tới khi được chấp nhận", () => {
    for (const co of ["gio-may-lech", "gio-may-vo-ly", "phieu-hien-truong-cu", "phieu-da-xong"]) {
      assert.equal(canChapNhanMoiTinh({ gpsResult: null, flags: [co] }), true, co);
      assert.equal(duocTinhCong({ gpsResult: null, flags: [co] }, undefined), false, co);
      assert.equal(duocTinhCong({ gpsResult: "hien-truong", flags: [co] }, "chap-nhan"), true, co);
      assert.equal(duocTinhCong({ gpsResult: null, flags: [co] }, "tu-choi"), false, co);
    }
    // Cờ chỉ để xem lại (độ chính xác, tốc độ) vẫn tính ngay như trước.
    assert.equal(duocTinhCong({ gpsResult: "hop-le", flags: ["do-chinh-xac-thap", "toc-do-bat-thuong"] }, undefined), true);
    assert.equal(canChapNhanMoiTinh({ gpsResult: "hop-le", flags: "rac" }), false);
  });
  it("QĐ-115: chọn phiếu hiện trường — còn mở + hoạt động trong N ngày tính ngay; phiếu cũ / đã xong chờ chấp nhận", () => {
    const luc = new Date("2026-10-20T01:00:00Z");
    const ngayTruoc = (n: number) => new Date(luc.getTime() - n * 86_400_000);
    const p = (id: string, conMo: boolean, xongHomNay: boolean, n: number) => ({ id, conMo, xongHomNay, hoatDongCuoi: ngayTruoc(n) });
    assert.equal(chonPhieuHienTruong([], luc, 14), null);
    assert.deepEqual(chonPhieuHienTruong([p("cu", true, false, 20), p("moi", true, false, 3)], luc, 14), { phieu: p("moi", true, false, 3), co: null });
    assert.equal(chonPhieuHienTruong([p("bien", true, false, 14)], luc, 14)?.co, null, "đúng N ngày vẫn còn hiệu lực");
    assert.equal(chonPhieuHienTruong([p("cu", true, false, 15)], luc, 14)?.co, "phieu-hien-truong-cu");
    assert.equal(chonPhieuHienTruong([p("cu", true, false, 15)], luc, 30)?.co, null, "N lấy từ Cấu hình");
    assert.deepEqual(chonPhieuHienTruong([p("cu", true, false, 40), p("xong", false, true, 0)], luc, 14), { phieu: p("xong", false, true, 0), co: "phieu-da-xong" });
    assert.equal(chonPhieuHienTruong([p("xong", false, true, 0), p("moi", true, false, 1)], luc, 14)?.phieu.id, "moi", "phiếu mở gần đây được ưu tiên");
    assert.equal(chonPhieuHienTruong([p("dong", false, false, 0)], luc, 14), null, "phiếu đã đóng từ trước → không phải hiện trường");
  });
  it("QĐ-116: vào / ra sát nhau → cờ thiếu giờ (trừ giờ nghỉ giữa ca), không tự trừ; quản lý quyết đủ / nửa / không", () => {
    const dk = congDuKien("2026-11-02", HC, T2_T6_SANG_T7, false); // thứ Hai, cả ca 08:00 → 17:00, nghỉ 12:00 → 13:00
    const nguong = { ...MAC_DINH, coMatToiThieuPhanTram: 50 };
    const c1 = tinhCongNgay(dk, [vn("2026-11-02T08:00:00"), vn("2026-11-02T11:00:00")], null, nguong);
    assert.equal(c1.phutCoMat, 180);
    assert.equal(c1.phutPhaiCoMat, 480);
    assert.ok(c1.co.includes("thieu-gio") && c1.co.includes("thieu-gio-cho-xem-xet"));
    assert.equal(c1.giaTriCong, 1, "không tự trừ khi chưa có quyết định");
    // 08:00 → 13:30: 330 phút trừ 60 phút nghỉ trưa = 270 ≥ 240 → không cờ.
    const c2 = tinhCongNgay(dk, [vn("2026-11-02T08:00:00"), vn("2026-11-02T13:30:00")], null, nguong);
    assert.equal(c2.phutCoMat, 270);
    assert.ok(!c2.co.includes("thieu-gio"));
    // Ngưỡng 0 = không kiểm; không truyền ngưỡng (mã cũ) = không kiểm.
    assert.ok(!tinhCongNgay(dk, [vn("2026-11-02T08:00:00"), vn("2026-11-02T08:30:00")], null, { ...MAC_DINH, coMatToiThieuPhanTram: 0 }).co.includes("thieu-gio"));
    assert.ok(!tinhCongNgay(dk, [vn("2026-11-02T08:00:00"), vn("2026-11-02T08:30:00")], null, MAC_DINH).co.includes("thieu-gio"));
    // Nghỉ phép sáng: phải có mặt nửa chiều 13:00 → 17:00 = 240 phút; có mặt 90 < 120 → thiếu giờ.
    const c3 = tinhCongNgay(dk, [vn("2026-11-02T13:00:00"), vn("2026-11-02T14:30:00")], { giaTri: 0.5, phan: "sang", maLoai: "phep-nam", coLuong: true }, nguong);
    assert.equal(c3.phutPhaiCoMat, 240);
    assert.ok(c3.co.includes("thieu-gio") && c3.giaTriCong === 0.5);
    // Quyết định của quản lý.
    assert.equal(apXetThieuGio(c1, undefined), c1);
    assert.equal(apXetThieuGio(c1, "du").giaTriCong, 1);
    assert.equal(apXetThieuGio(c1, "nua").giaTriCong, 0.5);
    assert.equal(apXetThieuGio(c1, "khong").giaTriCong, 0);
    assert.deepEqual(apXetThieuGio(c1, "nua").co.filter((c) => c.startsWith("thieu-gio")), ["thieu-gio", "thieu-gio-tinh-nua"]);
    assert.equal(apXetThieuGio(c2, "khong"), c2, "ngày không còn thiếu giờ (vd đã chấm bù) → quyết định cũ không áp");
  });
});
