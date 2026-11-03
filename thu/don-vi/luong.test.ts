/**
 * Kiểm thử đơn vị phần thuần của 0.21.0 — tính lương. Luật: BUSINESS_RULES.md mục 32 (LU).
 * Không dùng giờ thật: mọi ngày / tháng là hằng số. Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bieuThueHopLe,
  boDau,
  butToanLuong,
  chiaLamTron,
  chonBoHieuLuc,
  coLoi,
  dienNoiDung,
  hoaHongTheoPhanBo,
  khoangThang,
  nhanChia,
  phanVan,
  soKhopKetQua,
  thangLui,
  THAM_SO_MAC_DINH,
  thueLuyTien,
  tinhLuong,
  truTangCaAm,
  truyThuHoaHong,
  tyLeHoaHong,
  type BoThamSo,
  type DauVaoLuong,
  type DoanLuong,
  type LoaiThamSo,
  type ThamSoBieuThue,
} from "../../src/modules/luong/tinh-toan";
import { dungThuPhieuLuong, xml } from "../../src/modules/luong/thu-phieu";

/** Bộ tham số nạp sẵn hiệu lực ngày `ngay`. */
function thamSo(ngay = "2026-10-31"): BoThamSo & { soGioNgay: number } {
  const kq = {} as Record<LoaiThamSo, unknown>;
  for (const loai of new Set(THAM_SO_MAC_DINH.map((t) => t.loai))) {
    const b = chonBoHieuLuc(THAM_SO_MAC_DINH.filter((t) => t.loai === loai).map((t) => ({ ...t, taoLuc: "2026-01-01T00:00:00Z" })), ngay);
    if (b) kq[loai] = b.giaTri;
  }
  return { ...(kq as unknown as BoThamSo), soGioNgay: 8 };
}

type GhiDe = Omit<Partial<DauVaoLuong>, "hoSo" | "cong"> & { hoSo?: Partial<DauVaoLuong["hoSo"]>; cong?: Partial<DauVaoLuong["cong"]> };
function dv(o: GhiDe = {}): DauVaoLuong {
  const goc: DauVaoLuong = {
    ky: { nam: 2026, thang: 10 },
    hoSo: { id: null, hieuLucTu: "2026-01-01", loaiHopDong: "chinh-thuc", tyLeThuViec: null, cachTra: "thang", luongCoBan: 20_000_000, luongDongBH: 20_000_000, thuongKpi: 0, huongHoaHong: false, phuongPhapThue: "luy-tien" },
    phuCap: [],
    cong: { chuan: 26, thucTe: 26, nghiCoLuong: 0, nghiKhongLuong: 0, le: 0, tangCaPhut: { thuong: 0, thuongDem: 0, nghiTuan: 0, nghiTuanDem: 0, le: 0, leDem: 0 }, phutMuon: 0, phutSom: 0, soDongDieuChinh: 0 },
    soNguoiPhuThuoc: 0,
    kpi: { trangThai: "khong-co", heSo: null, xepLoai: null, danhGiaId: null },
    hoaHong: { phanBo: [], truyThu: [] },
    khoan: [],
    thamSo: thamSo(),
  };
  return { ...goc, ...o, hoSo: { ...goc.hoSo, ...o.hoSo }, cong: { ...goc.cong, ...o.cong } } as DauVaoLuong;
}

describe("Làm tròn tiền một chỗ (QĐ-142)", () => {
  it("nửa đơn vị làm tròn ra xa số 0", () => {
    assert.equal(chiaLamTron(5n, 2n), 3n);
    assert.equal(chiaLamTron(-5n, 2n), -3n);
    assert.equal(chiaLamTron(7n, 3n), 2n);
    assert.equal(chiaLamTron(8n, 3n), 3n);
    assert.equal(nhanChia([13n, 100n], [26n, 100n]), 1n, "0,5 đ → 1 đ");
    assert.throws(() => chiaLamTron(1n, 0n));
  });
  it("tỷ lệ phần trăm → phần vạn chính xác (không lỗi số thực)", () => {
    assert.equal(phanVan(17.5), 1750n);
    assert.equal(phanVan(1.5), 150n);
    assert.equal(phanVan(0.29), 29n);
  });
  it("lương theo công lẻ đồng: 10.000.000 × 25 / 26 = 9.615.384,6 → 9.615.385", () => {
    const k = tinhLuong(dv({ hoSo: { luongCoBan: 10_000_000, luongDongBH: 0 }, cong: { thucTe: 25 } }));
    assert.equal(k.luongTheoCong, 9_615_385);
  });
});

describe("Một tháng đủ công — số kiểm tay", () => {
  const k = tinhLuong(dv());
  it("lương, bảo hiểm NLĐ / DN, thuế, thực lĩnh", () => {
    assert.equal(k.congTinhLuong, 26);
    assert.equal(k.luongTheoCong, 20_000_000);
    assert.deepEqual(k.baoHiem.nld, { bhxh: 1_600_000, bhyt: 300_000, bhtn: 200_000, tong: 2_100_000 });
    assert.deepEqual(k.baoHiem.dn, { bhxh: 3_500_000, bhyt: 600_000, bhtn: 200_000, kpcd: 400_000, tong: 4_700_000 });
    assert.equal(k.thuNhapTinhThue, 2_400_000);
    assert.equal(k.thue.tien, 120_000);
    assert.equal(k.thucLinh, 17_780_000);
    assert.equal(k.chiPhiDoanhNghiep, 24_700_000);
    assert.equal(coLoi(k.canhBao), false);
  });
  it("đi muộn / về sớm KHÔNG trừ tiền (LU-21)", () => {
    const m = tinhLuong(dv({ cong: { phutMuon: 300, phutSom: 120 } }));
    assert.equal(m.thucLinh, k.thucLinh);
  });
  it("tính lại từ cùng ảnh chụp ra đúng số (LU-28)", () => {
    const vao = dv({ phuCap: [{ ma: "an-trua", ten: "Ăn trưa", soTien: 30_000, chiuThue: false, tinhBH: false, theo: "ngay-cong" }] });
    const a = tinhLuong(JSON.parse(JSON.stringify(vao)));
    const b = tinhLuong(vao);
    assert.deepEqual(soKhopKetQua(a, b), []);
    assert.deepEqual(soKhopKetQua(a, { ...b, thucLinh: b.thucLinh + 1 }), ["thucLinh"]);
  });
});

describe("Bảo hiểm có trần (LU-33)", () => {
  it("BHXH / BHYT chặn ở 20 × lương cơ sở; BHTN theo 20 × lương tối thiểu vùng", () => {
    const k = tinhLuong(dv({ hoSo: { luongCoBan: 60_000_000, luongDongBH: 60_000_000 } }));
    assert.equal(k.baoHiem.mucDongXH, 46_800_000);
    assert.equal(k.baoHiem.mucDongTN, 60_000_000);
    assert.deepEqual(k.baoHiem.nld, { bhxh: 3_744_000, bhyt: 702_000, bhtn: 600_000, tong: 5_046_000 });
    const k2 = tinhLuong(dv({ hoSo: { luongCoBan: 150_000_000, luongDongBH: 150_000_000 } }));
    assert.equal(k2.baoHiem.mucDongTN, 106_200_000);
    assert.equal(k2.baoHiem.nld.bhtn, 1_062_000);
  });
  it("lương đóng BH = 0 → không tham gia; dưới lương tối thiểu vùng → cảnh báo", () => {
    const k = tinhLuong(dv({ hoSo: { luongDongBH: 0 } }));
    assert.equal(k.baoHiem.thamGia, false);
    assert.equal(k.baoHiem.nld.tong, 0);
    const k2 = tinhLuong(dv({ hoSo: { luongDongBH: 4_000_000 } }));
    assert.ok(k2.canhBao.some((c) => c.ma === "luong-bh-duoi-toi-thieu"));
  });
  it("nghỉ không lương ≥ 14 ngày → không đóng BH tháng đó", () => {
    const k = tinhLuong(dv({ cong: { thucTe: 12, nghiKhongLuong: 14 } }));
    assert.equal(k.baoHiem.thamGia, false);
    assert.ok(k.canhBao.some((c) => c.ma === "nghi-khong-dong-bh"));
    const k2 = tinhLuong(dv({ cong: { thucTe: 13, nghiKhongLuong: 13 } }));
    assert.equal(k2.baoHiem.thamGia, true);
  });
});

describe("Thuế lũy tiến ở từng biên bậc (LU-34)", () => {
  const bac5 = (thamSo("2026-10-31")["bieu-thue"] as ThamSoBieuThue).bac;
  const bac7 = (thamSo("2025-10-31")["bieu-thue"] as ThamSoBieuThue).bac;
  it("biểu 5 bậc (nạp sẵn từ 2026)", () => {
    assert.equal(thueLuyTien(0n, bac5), 0n);
    assert.equal(thueLuyTien(-1n, bac5), 0n);
    assert.equal(thueLuyTien(10_000_000n, bac5), 500_000n);
    assert.equal(thueLuyTien(10_000_010n, bac5), 500_001n);
    assert.equal(thueLuyTien(30_000_000n, bac5), 2_500_000n);
    assert.equal(thueLuyTien(50_000_000n, bac5), 6_500_000n);
    assert.equal(thueLuyTien(100_000_000n, bac5), 21_500_000n);
    assert.equal(thueLuyTien(120_000_000n, bac5), 28_500_000n);
  });
  it("biểu 7 bậc (trước 2026)", () => {
    assert.equal(thueLuyTien(5_000_000n, bac7), 250_000n);
    assert.equal(thueLuyTien(10_000_000n, bac7), 750_000n);
    assert.equal(thueLuyTien(18_000_000n, bac7), 1_950_000n);
    assert.equal(thueLuyTien(32_000_000n, bac7), 4_750_000n);
    assert.equal(thueLuyTien(52_000_000n, bac7), 9_750_000n);
    assert.equal(thueLuyTien(80_000_000n, bac7), 18_150_000n);
    assert.equal(thueLuyTien(100_000_000n, bac7), 25_150_000n);
  });
  it("biểu thuế phải hợp lệ", () => {
    assert.equal(bieuThueHopLe(bac5), null);
    assert.match(bieuThueHopLe([]) ?? "", /ít nhất/);
    assert.match(bieuThueHopLe([{ den: 10, tyLe: 5 }, { den: 5, tyLe: 10 }, { den: null, tyLe: 20 }]) ?? "", /lớn hơn/);
    assert.match(bieuThueHopLe([{ den: 10, tyLe: 5 }]) ?? "", /cuối/);
  });
});

describe("Khấu trừ 10% ở ngưỡng 2.000.000 (LU-35)", () => {
  const thoiVu = (luong: number) => tinhLuong(dv({ hoSo: { loaiHopDong: "thoi-vu", phuongPhapThue: "khau-tru-10", luongCoBan: luong, luongDongBH: 0 } }));
  it("dưới ngưỡng không khấu trừ, đúng ngưỡng khấu trừ 10%", () => {
    assert.equal(thoiVu(1_999_999).thue.tien, 0);
    assert.equal(thoiVu(2_000_000).thue.tien, 200_000);
    assert.equal(thoiVu(2_000_005).thue.tien, 200_001);
    assert.equal(thoiVu(2_000_000).giamTru.tong, 0, "khấu trừ 10% không áp giảm trừ gia cảnh");
  });
  it("không khấu trừ (cam kết 08) → 0", () => {
    assert.equal(tinhLuong(dv({ hoSo: { phuongPhapThue: "khong", luongCoBan: 50_000_000 } })).thue.tien, 0);
  });
});

describe("Thử việc (LU-32)", () => {
  it("85% lương, tính cả vào lương giờ tăng ca", () => {
    const k = tinhLuong(dv({ hoSo: { loaiHopDong: "thu-viec", tyLeThuViec: 85, luongCoBan: 20_800_000 }, cong: { tangCaPhut: { thuong: 60, thuongDem: 0, nghiTuan: 0, nghiTuanDem: 0, le: 0, leDem: 0 } } }));
    assert.equal(k.luongTheoCong, 17_680_000);
    assert.equal(k.tangCa.tien, 127_500, "100.000 đ/giờ × 85% × 150%");
    assert.equal(coLoi(k.canhBao), false);
  });
  it("dưới mức tối thiểu trong tham số → lỗi chặn gửi duyệt", () => {
    const k = tinhLuong(dv({ hoSo: { loaiHopDong: "thu-viec", tyLeThuViec: 80 } }));
    assert.ok(k.canhBao.some((c) => c.ma === "thu-viec-duoi-muc" && c.muc === "loi"));
  });
});

describe("Người phụ thuộc (LU-04)", () => {
  it("mỗi người giảm 6.200.000 / tháng", () => {
    const k = tinhLuong(dv({ hoSo: { luongCoBan: 40_000_000, luongDongBH: 40_000_000 }, soNguoiPhuThuoc: 2 }));
    assert.equal(k.giamTru.tong, 15_500_000 + 12_400_000);
    assert.equal(k.baoHiem.nld.tong, 4_200_000);
    assert.equal(k.thuNhapTinhThue, 7_900_000);
    assert.equal(k.thue.tien, 395_000);
    assert.equal(tinhLuong(dv({ soNguoiPhuThuoc: 2 })).thue.tien, 0, "giảm trừ lớn hơn thu nhập → không thuế");
  });
});

describe("Phụ cấp (LU-03)", () => {
  it("phụ cấp không chịu thuế không vào thu nhập chịu thuế; theo ngày công nhân công thực tế", () => {
    const k = tinhLuong(dv({
      cong: { thucTe: 24, nghiCoLuong: 2 },
      phuCap: [
        { ma: "an-trua", ten: "Ăn trưa", soTien: 30_000, chiuThue: false, tinhBH: false, theo: "ngay-cong" },
        { ma: "dien-thoai", ten: "Điện thoại", soTien: 500_000, chiuThue: false, tinhBH: false, theo: "thang" },
        { ma: "xang-xe", ten: "Xăng xe", soTien: 1_000_000, chiuThue: true, tinhBH: false, theo: "thang" },
      ],
    }));
    assert.equal(k.phuCap[0].soTien, 720_000, "ăn trưa theo ngày công thực tế, không tính ngày nghỉ phép");
    assert.equal(k.tongPhuCap, 2_220_000);
    assert.equal(k.phuCapKhongChiuThue, 1_220_000);
    assert.equal(k.tongThuNhap, 22_220_000);
    assert.equal(k.thuNhapChiuThue, 21_000_000);
    assert.equal(k.thue.tien, 170_000);
  });
  it("phụ cấp tính bảo hiểm cộng vào lương đóng", () => {
    const k = tinhLuong(dv({ phuCap: [{ ma: "trach-nhiem", ten: "Trách nhiệm", soTien: 2_000_000, chiuThue: true, tinhBH: true, theo: "thang" }] }));
    assert.equal(k.baoHiem.luongDong, 22_000_000);
  });
});

describe("Tháng có lễ, tháng 28 – 31 ngày (LU-21)", () => {
  it("số ngày của tháng", () => {
    assert.deepEqual(khoangThang(2026, 2), { tu: "2026-02-01", den: "2026-02-28", soNgay: 28 });
    assert.equal(khoangThang(2028, 2).soNgay, 29);
    assert.equal(khoangThang(2026, 4).soNgay, 30);
    assert.equal(khoangThang(2026, 12).den, "2026-12-31");
    assert.deepEqual(thangLui(2026, 1, 1), { nam: 2025, thang: 12 });
    assert.deepEqual(thangLui(2026, 3, 3), { nam: 2025, thang: 12 });
  });
  it("ngày lễ được trả lương: 25 công + 1 lễ = đủ lương", () => {
    const k = tinhLuong(dv({ cong: { thucTe: 25, le: 1 } }));
    assert.equal(k.congTinhLuong, 26);
    assert.equal(k.luongTheoCong, 20_000_000);
  });
  it("tháng 2 công chuẩn 24 — đủ công vẫn đủ lương; nghỉ ốm / không lương không trả", () => {
    assert.equal(tinhLuong(dv({ cong: { chuan: 24, thucTe: 24 } })).luongTheoCong, 20_000_000);
    const k = tinhLuong(dv({ cong: { chuan: 24, thucTe: 22, nghiKhongLuong: 2 } }));
    assert.equal(k.luongTheoCong, 18_333_333);
  });
  it("chưa có lịch (công chuẩn 0) với lương tháng → lỗi", () => {
    const k = tinhLuong(dv({ cong: { chuan: 0, thucTe: 0 } }));
    assert.ok(k.canhBao.some((c) => c.ma === "thieu-lich" && c.muc === "loi"));
  });
  it("lương ngày / giờ", () => {
    assert.equal(tinhLuong(dv({ hoSo: { cachTra: "ngay", luongCoBan: 400_000, luongDongBH: 0 }, cong: { thucTe: 20.5 } })).luongTheoCong, 8_200_000);
    assert.equal(tinhLuong(dv({ hoSo: { cachTra: "gio", luongCoBan: 50_000, luongDongBH: 0 }, cong: { thucTe: 10 } })).luongTheoCong, 4_000_000);
  });
});

describe("Tăng ca (LU-27)", () => {
  it("hệ số theo loại ngày / đêm; phần vượt không chịu thuế", () => {
    const k = tinhLuong(dv({ hoSo: { luongCoBan: 20_800_000 }, cong: { tangCaPhut: { thuong: 120, thuongDem: 60, nghiTuan: 0, nghiTuanDem: 0, le: 60, leDem: 0 } } }));
    assert.equal(k.tangCa.tien, 300_000 + 210_000 + 300_000);
    assert.equal(k.tangCa.mienThue, 100_000 + 110_000 + 200_000);
    assert.equal(k.thuNhapChiuThue, k.tongThuNhap - 410_000);
  });
});

describe("Thưởng KPI (LU-26)", () => {
  it("mức thưởng × hệ số phiếu đã chốt; chưa chốt → 0 + cảnh báo", () => {
    const k = tinhLuong(dv({ hoSo: { thuongKpi: 2_000_000 }, kpi: { trangThai: "da-chot", heSo: 1.2, xepLoai: "A", danhGiaId: null } }));
    assert.equal(k.thuongKpi, 2_400_000);
    const k2 = tinhLuong(dv({ hoSo: { thuongKpi: 2_000_000 }, kpi: { trangThai: "chua-chot", heSo: null, xepLoai: null, danhGiaId: null } }));
    assert.equal(k2.thuongKpi, 0);
    assert.ok(k2.canhBao.some((c) => c.ma === "kpi-chua-chot" && c.muc === "canh-bao"));
  });
});

describe("Hoa hồng (LU-23, LU-24)", () => {
  const bac = { kieu: "bac-thang" as const, tyLe: 0, bac: [{ tu: 0, tyLe: 1 }, { tu: 100_000_000, tyLe: 2 }] };
  it("bậc thang theo doanh số thu: đạt bậc nào áp tỷ lệ bậc đó cho toàn bộ", () => {
    assert.equal(tyLeHoaHong(99_999_999n, bac), 1);
    assert.equal(tyLeHoaHong(100_000_000n, bac), 2);
    const h = hoaHongTheoPhanBo([60_000_000n, 50_000_000n], bac);
    assert.equal(h.tyLeBp, 200n);
    assert.deepEqual(h.tungKhoan, [1_200_000n, 1_000_000n]);
    assert.equal(tyLeHoaHong(1n, { kieu: "phang", tyLe: 3, bac: [] }), 3);
  });
  it("truy thu đúng số đã trả cho phiếu bị hủy", () => {
    assert.equal(truyThuHoaHong(50_000_000n, 200n), -1_000_000n);
    const ts = { ...thamSo(), "hoa-hong": bac };
    const k = tinhLuong(dv({ thamSo: ts, hoSo: { huongHoaHong: true }, hoaHong: { phanBo: [{ id: "a", so: "PT1", soTien: 60_000_000 }, { id: "b", so: "PT2", soTien: 50_000_000 }], truyThu: [{ id: "c", so: "PT0", soTien: 10_000_000, tyLeBp: 100 }] } }));
    assert.equal(k.hoaHong.tien, 2_200_000);
    assert.equal(k.hoaHong.truyThu, -100_000);
    assert.equal(k.tongThuNhap, 20_000_000 + 2_100_000);
  });
  it("hồ sơ không hưởng hoa hồng → 0", () => {
    const k = tinhLuong(dv({ hoaHong: { phanBo: [{ id: "a", so: "PT1", soTien: 60_000_000 }], truyThu: [] } }));
    assert.equal(k.hoaHong.tien, 0);
  });
});

describe("Lương âm sau khấu trừ (LU-36)", () => {
  it("thực lĩnh âm → lỗi chặn gửi duyệt", () => {
    const k = tinhLuong(dv({ khoan: [{ chieu: "tru", loai: "tam-ung", soTien: 30_000_000, chiuThue: false, lyDo: "Tạm ứng mua xe" }] }));
    assert.ok(k.thucLinh < 0);
    assert.equal(coLoi(k.canhBao), true);
    assert.ok(k.canhBao.some((c) => c.ma === "thuc-linh-am"));
  });
  it("khoản trừ không giảm thu nhập chịu thuế; thưởng đột xuất chịu thuế", () => {
    const goc = tinhLuong(dv());
    const k = tinhLuong(dv({ khoan: [{ chieu: "tru", loai: "phat", soTien: 500_000, chiuThue: false, lyDo: "Đi trễ nhiều" }, { chieu: "cong", loai: "thuong", soTien: 1_000_000, chiuThue: true, lyDo: "Thưởng dự án" }] }));
    assert.equal(k.thuNhapChiuThue, goc.thuNhapChiuThue + 1_000_000);
    assert.equal(k.thucLinh, goc.thucLinh + 1_000_000 - 50_000 - 500_000);
  });
});

describe("Tham số hiệu lực theo ngày (LU-12)", () => {
  it("chọn bộ hiệu lực lớn nhất ≤ ngày; cùng ngày → bộ tạo sau", () => {
    const ds = [
      { id: "a", hieuLucTu: "2024-07-01", taoLuc: "2024-06-01T00:00:00Z" },
      { id: "b", hieuLucTu: "2026-01-01", taoLuc: "2025-12-01T00:00:00Z" },
      { id: "c", hieuLucTu: "2026-01-01", taoLuc: "2026-02-01T00:00:00Z" },
      { id: "d", hieuLucTu: "2027-01-01", taoLuc: "2026-02-01T00:00:00Z" },
    ];
    assert.equal(chonBoHieuLuc(ds, "2025-12-31")?.id, "a");
    assert.equal(chonBoHieuLuc(ds, "2026-01-01")?.id, "c");
    assert.equal(chonBoHieuLuc(ds, "2023-01-01"), null);
  });
  it("giảm trừ 15.500.000 / 6.200.000 từ 2026; vùng I 2026", () => {
    assert.deepEqual(thamSo("2026-01-31")["giam-tru"], { banThan: 15_500_000, nguoiPhuThuoc: 6_200_000 });
    assert.deepEqual(thamSo("2025-12-31")["giam-tru"], { banThan: 11_000_000, nguoiPhuThuoc: 4_400_000 });
  });
});

describe("Xuất file và thư phiếu lương (LU-51 → LU-54)", () => {
  it("nội dung chuyển khoản bỏ dấu, điền mẫu", () => {
    assert.equal(boDau("Lương tháng Đặng Văn Ước"), "Luong thang Dang Van Uoc");
    assert.equal(dienNoiDung("Luong {thang}/{nam} {ho_ten} {ma_nv}", { hoTen: "A", thang: 3, nam: 2026, maNv: "NV1" }), "Luong 03/2026 A NV1");
  });
  it("bút toán tổng hợp theo tài khoản, bỏ dòng 0 đ, có bút toán chi khi đã chi", () => {
    const tk = { chiPhi: 6421, phaiTra: 334, bhxh: 3383, bhyt: 3384, bhtn: 3386, kpcd: 3382, thue: 3335, tamUng: 141, khauTruKhac: 1388, tien: 1121 };
    const k = tinhLuong(dv());
    const d = { tongThuNhap: k.tongThuNhap, bhNld: k.baoHiem.nld, bhDn: k.baoHiem.dn, thue: k.thue.tien, tamUng: 0, truKhac: 0, thucLinh: k.thucLinh };
    const bt = butToanLuong([d, d], tk, false);
    assert.equal(bt.find((b) => b.no === 6421 && b.co === 334)?.soTien, 40_000_000);
    assert.equal(bt.find((b) => b.no === 334 && b.co === 3335)?.soTien, 240_000);
    assert.ok(!bt.some((b) => b.co === 141), "không có tạm ứng → không có dòng");
    assert.ok(!bt.some((b) => b.co === 1121));
    assert.equal(butToanLuong([d], tk, true).find((b) => b.co === 1121)?.soTien, k.thucLinh);
  });
  it("thư phiếu lương thoát HTML tên người", () => {
    const t = dungThuPhieuLuong("Công ty <A>", { hoTen: "<script>x</script>", nam: 2026, thang: 3, ketQua: tinhLuong(dv()), duongDan: null });
    assert.ok(!t.html.includes("<script>"));
    assert.match(t.tieuDe, /03\/2026/);
    assert.match(t.text, /17\.780\.000/);
    assert.equal(xml('a"<&'), "a&quot;&lt;&amp;");
  });
});

// ---------------------------------------------------------------------------
// Chính sách Giám đốc sau QA (QĐ-156 → QĐ-166)
// ---------------------------------------------------------------------------

const TC0 = { thuong: 0, thuongDem: 0, nghiTuan: 0, nghiTuanDem: 0, le: 0, leDem: 0 };
function doan(o: Partial<DoanLuong> & { cong?: Partial<DoanLuong["cong"]> }): DoanLuong {
  return {
    hoSoId: null, tu: "2026-10-01", den: "2026-10-31", loaiHopDong: "chinh-thuc", tyLeThuViec: null, cachTra: "thang", luongCoBan: 20_000_000, phuCap: [],
    ...o,
    cong: { thucTe: 0, nghiCoLuong: 0, le: 0, tangCaPhut: TC0, ...o.cong },
  };
}

describe("QĐ-156: đổi lương / hết thử việc giữa tháng — chia theo công của từng phiên bản", () => {
  it("hết thử việc giữa tháng: 85% cho đoạn thử việc, 100% cho đoạn chính thức", () => {
    const k = tinhLuong(dv({ cong: { chuan: 24, thucTe: 24 }, doan: [
      doan({ tu: "2026-10-01", den: "2026-10-15", loaiHopDong: "thu-viec", tyLeThuViec: 85, cong: { thucTe: 12 } }),
      doan({ tu: "2026-10-16", den: "2026-10-31", cong: { thucTe: 12 } }),
    ] }));
    assert.equal(k.luongTheoCong, 8_500_000 + 10_000_000);
    assert.equal(k.doan?.length, 2);
    assert.deepEqual(k.doan?.map((d) => d.luongTheoCong), [8_500_000, 10_000_000]);
    assert.equal(k.congTinhLuong, 24);
  });
  it("tăng lương giữa tháng: mỗi đoạn làm tròn một lần, công chuẩn cả tháng", () => {
    const k = tinhLuong(dv({ cong: { chuan: 24, thucTe: 24 }, doan: [
      doan({ luongCoBan: 20_000_000, cong: { thucTe: 10 } }),
      doan({ luongCoBan: 26_000_000, cong: { thucTe: 14 } }),
    ] }));
    assert.equal(k.luongTheoCong, 8_333_333 + 15_166_667);
  });
  it("tăng ca theo lương giờ của đoạn", () => {
    const k = tinhLuong(dv({ cong: { chuan: 24, thucTe: 24 }, doan: [
      doan({ luongCoBan: 19_200_000, cong: { thucTe: 12, tangCaPhut: { ...TC0, thuong: 60 } } }),
      doan({ luongCoBan: 24_000_000, cong: { thucTe: 12, tangCaPhut: { ...TC0, thuong: 60 } } }),
    ] }));
    assert.equal(k.tangCa.tien, 150_000 + 187_500);
  });
  it("ảnh chụp cũ (không có đoạn) tính như một đoạn", () => {
    assert.equal(tinhLuong(dv()).doan?.length, 1);
    assert.equal(tinhLuong(dv()).thucLinh, 17_780_000);
  });
});

describe("QĐ-157: phụ cấp cố định tháng chia theo công", () => {
  const dt = { ma: "dien-thoai", ten: "Điện thoại", soTien: 500_000, chiuThue: false, tinhBH: false, theo: "thang" as const };
  it("vào làm giữa tháng / nghỉ không lương: số tiền × công tính lương / công chuẩn", () => {
    assert.equal(tinhLuong(dv({ phuCap: [dt], cong: { chuan: 24, thucTe: 12, nghiKhongLuong: 12 } })).tongPhuCap, 250_000);
    assert.equal(tinhLuong(dv({ phuCap: [dt], cong: { chuan: 24, thucTe: 22, le: 2 } })).tongPhuCap, 500_000, "đủ công (gồm lễ) → đủ phụ cấp");
  });
  it("nghỉ không lương cả tháng → 0", () => {
    assert.equal(tinhLuong(dv({ phuCap: [dt], cong: { chuan: 24, thucTe: 0, nghiKhongLuong: 24 } })).tongPhuCap, 0);
  });
  it("cờ trả đủ: không chia theo công", () => {
    assert.equal(tinhLuong(dv({ phuCap: [{ ...dt, traDu: true }], cong: { chuan: 24, thucTe: 12 } })).tongPhuCap, 500_000);
  });
  it("hai phiên bản có mức phụ cấp khác nhau: cộng theo từng đoạn", () => {
    const xang = (soTien: number) => ({ ma: "xang-xe", ten: "Xăng xe", soTien, chiuThue: true, tinhBH: false, theo: "thang" as const });
    const k = tinhLuong(dv({ cong: { chuan: 24, thucTe: 24 }, doan: [doan({ phuCap: [xang(1_000_000)], cong: { thucTe: 12 } }), doan({ phuCap: [xang(2_000_000)], cong: { thucTe: 12 } })] }));
    assert.equal(k.tongPhuCap, 1_500_000);
    assert.equal(k.phuCap.length, 1);
  });
});

describe("QĐ-158: điều chỉnh kỳ trước — trước thuế / sau thuế", () => {
  const dc = (chieu: "cong" | "tru", tinhThue: "truoc-thue" | "sau-thue", o: { chiuThue?: boolean; tinhBH?: boolean } = {}) =>
    ({ chieu, loai: "dieu-chinh", soTien: 1_000_000, chiuThue: o.chiuThue ?? true, tinhBH: o.tinhBH ?? false, lyDo: "Trả thừa lương tháng trước", tinhThue });
  it("thu hồi TRƯỚC thuế: giảm tổng thu nhập, thu nhập chịu thuế và lương đóng BH", () => {
    const k = tinhLuong(dv({ khoan: [dc("tru", "truoc-thue", { tinhBH: true })] }));
    assert.equal(k.tongThuNhap, 19_000_000);
    assert.equal(k.thuNhapChiuThue, 19_000_000);
    assert.equal(k.baoHiem.luongDong, 19_000_000);
    assert.equal(k.baoHiem.nld.tong, 1_995_000);
    assert.equal(k.thue.tien, 75_250);
    assert.equal(k.thucLinh, 16_929_750);
    assert.equal(k.khoanTru, 0);
  });
  it("thu hồi SAU thuế: thuế / BH như không có, trừ thẳng vào thực lĩnh", () => {
    const k = tinhLuong(dv({ khoan: [dc("tru", "sau-thue")] }));
    assert.equal(k.tongThuNhap, 20_000_000);
    assert.equal(k.thue.tien, 120_000);
    assert.equal(k.thucLinh, 16_780_000);
  });
  it("bổ sung: trước thuế vào thu nhập chịu thuế; sau thuế cộng thẳng thực lĩnh", () => {
    const a = tinhLuong(dv({ khoan: [dc("cong", "truoc-thue")] }));
    assert.equal(a.tongThuNhap, 21_000_000);
    assert.equal(a.thuNhapChiuThue, 21_000_000);
    const b = tinhLuong(dv({ khoan: [dc("cong", "sau-thue")] }));
    assert.equal(b.tongThuNhap, 20_000_000);
    assert.equal(b.thucLinh, 18_780_000);
    assert.equal(tinhLuong(dv({ khoan: [dc("cong", "truoc-thue", { chiuThue: false })] })).thuNhapChiuThue, 20_000_000);
  });
  it("hai chiều nhất quán: bổ sung rồi thu hồi cùng cách tính → về đúng như không có", () => {
    for (const c of ["truoc-thue", "sau-thue"] as const) {
      const k = tinhLuong(dv({ khoan: [dc("cong", c, { tinhBH: c === "truoc-thue" }), dc("tru", c, { tinhBH: c === "truoc-thue" })] }));
      assert.equal(k.thucLinh, 17_780_000, c);
    }
  });
});

describe("QĐ-166: điều chỉnh giảm tăng ca lớn hơn tăng ca kỳ này → chuyển kỳ sau", () => {
  it("trừ phút âm từ đoạn cuối về đầu; thiếu thì trả phần còn nợ", () => {
    assert.deepEqual(truTangCaAm([120, -60]), { phut: [60, 0], no: 0 });
    assert.deepEqual(truTangCaAm([30, -100]), { phut: [0, 0], no: -70 });
    assert.deepEqual(truTangCaAm([100, -50]), { phut: [50, 0], no: 0 });
    assert.deepEqual(truTangCaAm([-50, 100]), { phut: [0, 50], no: 0 });
  });
  it("không kẹp về 0 lặng lẽ: còn nợ → cảnh báo + chuyển kỳ sau", () => {
    const k = tinhLuong(dv({ cong: { tangCaPhut: { ...TC0, thuong: -120 } } }));
    assert.equal(k.tangCa.tien, 0);
    assert.equal(k.tangCaNoChuyenKySau?.thuong, -120);
    assert.ok(k.canhBao.some((c) => c.ma === "tang-ca-am-chuyen-ky-sau"));
  });
  it("nợ kỳ trước trừ vào tăng ca kỳ này", () => {
    const k = tinhLuong(dv({ hoSo: { luongCoBan: 20_800_000 }, cong: { tangCaPhut: { ...TC0, thuong: 120 }, tangCaNoKyTruoc: { ...TC0, thuong: -60 } } }));
    assert.equal(k.tangCa.tien, 150_000);
    assert.equal(k.tangCaNoChuyenKySau, null);
  });
});
