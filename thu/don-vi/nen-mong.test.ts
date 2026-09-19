/**
 * Kiểm thử đơn vị cho phần logic thuần của Phase 1 — không cần cơ sở dữ liệu.
 * Chạy: npm run thu:don-vi   (node:test qua tsx, không thêm thư viện kiểm thử)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { cuoiNgayVN, dauHomNayVN, dauNgayVN, dinhDangNgay, dinhDangNgayGio, dinhDangPhanTram, dinhDangSo, dinhDangTien } from "../../src/lib/dinh-dang";
import { gopPhamVi, rongHon } from "../../src/lib/pham-vi";
import { kiemTraMatKhauManh, sinhMatKhauTam } from "../../src/lib/mat-khau";
import { HANH_DONG, PHAN_HE, VAI_TRO, kiemTraGioiHanAI, toanBoQuyen } from "../../src/lib/vai-tro";
import { viPhamGioiHanAI } from "../../src/modules/vai-tro/service";
import { DANH_MUC_CAU_HINH, luocDoGiaTri, timMuc } from "../../src/modules/cau-hinh/danh-muc";
import { LOAI_DU_LIEU_GOC } from "../../src/modules/du-lieu-goc/loai";
import { cungNguonGoc, layIpKhach } from "../../src/lib/yeu-cau";
import { KhoDemBoNho, demVaKiem } from "../../src/lib/gioi-han-toc-do";
import { phienConHieuLuc } from "../../src/lib/xac-thuc";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("Định dạng Việt Nam (mục 32)", () => {
  it("tiền VND có dấu chấm ngăn nghìn và ký hiệu ₫", () => {
    assert.equal(dinhDangTien(1234567), "1.234.567 ₫");
    assert.equal(dinhDangTien(0), "0 ₫");
    assert.equal(dinhDangTien("2500000.6"), "2.500.001 ₫");
    assert.equal(dinhDangTien(null), "—");
  });
  it("số và phần trăm dùng dấu phẩy thập phân", () => {
    assert.equal(dinhDangSo(1234.5), "1.234,5");
    assert.equal(dinhDangPhanTram(12.5), "12,5%");
  });
  it("ngày hiển thị theo giờ Việt Nam, dạng dd/MM/yyyy", () => {
    // 20:30 UTC ngày 18 = 03:30 sáng ngày 19 ở Việt Nam.
    assert.equal(dinhDangNgay(new Date("2026-09-18T20:30:00Z")), "19/09/2026");
    assert.equal(dinhDangNgayGio(new Date("2026-09-18T20:30:00Z")), "19/09/2026 03:30");
    assert.equal(dinhDangNgay("khong-phai-ngay"), "—");
  });
  it("khoảng ngày lọc tính theo đầu/cuối ngày giờ Việt Nam", () => {
    assert.equal(dauNgayVN("2026-09-19")?.toISOString(), "2026-09-18T17:00:00.000Z");
    assert.equal(cuoiNgayVN("2026-09-19")?.toISOString(), "2026-09-19T16:59:59.999Z");
    assert.equal(dauNgayVN("19/09/2026"), null);
    assert.equal(dauHomNayVN(new Date("2026-09-18T20:30:00Z")).toISOString(), "2026-09-18T17:00:00.000Z");
  });
});

describe("Phạm vi dữ liệu (mục 19)", () => {
  it("nhiều vai trò cùng một quyền thì lấy phạm vi rộng nhất", () => {
    const pv = gopPhamVi([
      { ma: "customer.view", phamVi: "own" },
      { ma: "customer.view", phamVi: "department" },
      { ma: "customer.view", phamVi: "team" },
      { ma: "order.view", phamVi: "team" },
    ]);
    assert.equal(pv.get("customer.view"), "department");
    assert.equal(pv.get("order.view"), "team");
  });
  it("giá trị lạ trong cơ sở dữ liệu bị coi là hẹp nhất, không mở rộng quyền", () => {
    assert.equal(gopPhamVi([{ ma: "x.view", phamVi: "toan-vu-tru" }]).get("x.view"), "own");
  });
  it("thứ hạng: all > department > team > own", () => {
    assert.equal(rongHon("own", "all"), "all");
    assert.equal(rongHon("department", "team"), "department");
  });
});

describe("Chính sách mật khẩu", () => {
  it("chặn mật khẩu ngắn, thiếu số, thiếu chữ, chứa tên đăng nhập", () => {
    assert.ok(kiemTraMatKhauManh("abc123").length > 0);
    assert.ok(kiemTraMatKhauManh("chilachucaidai").length > 0);
    assert.ok(kiemTraMatKhauManh("12345678901").length > 0);
    assert.ok(kiemTraMatKhauManh("nguyenvana2026", "nguyenvana@itw.vn").length > 0);
    assert.deepEqual(kiemTraMatKhauManh("Bao-gia-2026-Q4", "sales@itw.vn"), []);
  });
  it("mật khẩu tạm sinh ra luôn qua chính sách", () => {
    for (let i = 0; i < 300; i++) assert.deepEqual(kiemTraMatKhauManh(sinhMatKhauTam()), []);
  });
});

describe("Vai trò và bất biến của trợ lý AI (mục 19, 21)", () => {
  it("danh mục quyền = số phân hệ × số hành động, không trùng mã", () => {
    const ds = toanBoQuyen().map((q) => q.code);
    assert.equal(ds.length, PHAN_HE.length * HANH_DONG.length);
    assert.equal(new Set(ds).size, ds.length);
  });
  it("mọi mã quyền khai trong vai trò đều có trong danh mục", () => {
    const danhMuc = new Set(toanBoQuyen().map((q) => q.code));
    for (const v of VAI_TRO) {
      if (v.quyen === "*") continue;
      for (const q of v.quyen) assert.ok(danhMuc.has(q), `${v.code} khai quyền lạ ${q}`);
    }
  });
  it("vai trò AI không cầm quyền duyệt hay xóa", () => {
    assert.equal(kiemTraGioiHanAI().dat, true);
  });
  it("hàm kiểm vi phạm AI bắt đúng .approve và .delete", () => {
    assert.deepEqual(viPhamGioiHanAI(["quotation.view", "quotation.approve", "customer.delete"]), [
      "quotation.approve",
      "customer.delete",
    ]);
  });
  it("đủ 10 vai trò ban đầu của master prompt", () => {
    const ma = new Set(VAI_TRO.map((v) => v.code));
    for (const m of ["admin", "ceo", "sales-manager", "sales", "marketing", "technical-manager", "technical", "customer-service", "finance", "warehouse"]) {
      assert.ok(ma.has(m), `thiếu vai trò ${m}`);
    }
  });
  it("nhân viên kinh doanh mặc định chỉ thấy dữ liệu của mình", () => {
    assert.equal(VAI_TRO.find((v) => v.code === "sales")?.phamVi, "own");
    assert.equal(VAI_TRO.find((v) => v.code === "sales-manager")?.phamVi, "team");
    assert.equal(VAI_TRO.find((v) => v.code === "ceo")?.phamVi, "all");
  });
});

describe("Cấu hình — ngưỡng không viết cứng (mục 12)", () => {
  it("ngưỡng biên lợi nhuận chưa có mặc định: phải do Giám đốc đặt", () => {
    assert.equal(timMuc("bao_gia.nguong_bien_loi_nhuan")?.macDinh, null);
  });
  it("lược đồ giá trị chặn ngoài khoảng và số lẻ ở mục số nguyên", () => {
    const bien = luocDoGiaTri(timMuc("bao_gia.nguong_bien_loi_nhuan")!);
    assert.equal(bien.safeParse(12.5).success, true);
    assert.equal(bien.safeParse(101).success, false);
    assert.equal(bien.safeParse(null).success, true);
    const khoa = luocDoGiaTri(timMuc("bao_mat.so_lan_sai_toi_da")!);
    assert.equal(khoa.safeParse(5).success, true);
    assert.equal(khoa.safeParse(5.5).success, false);
    assert.equal(khoa.safeParse(1).success, false);
  });
  it("mọi mục có mặc định nằm trong khoảng cho phép, khóa không trùng", () => {
    assert.equal(new Set(DANH_MUC_CAU_HINH.map((m) => m.khoa)).size, DANH_MUC_CAU_HINH.length);
    for (const m of DANH_MUC_CAU_HINH) {
      if (m.macDinh !== null) assert.equal(luocDoGiaTri(m).safeParse(m.macDinh).success, true, m.khoa);
    }
  });
});

describe("Dữ liệu gốc", () => {
  it("mã hợp lệ và không trùng trong từng loại", () => {
    for (const l of LOAI_DU_LIEU_GOC) {
      const ma = l.khoiTao.map((m) => m.ma);
      assert.equal(new Set(ma).size, ma.length, l.ma);
      for (const m of ma) assert.match(m, /^[a-z0-9][a-z0-9-]{0,49}$/);
    }
  });
  it("dữ liệu riêng của doanh nghiệp để trống, không đoán", () => {
    for (const ma of ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "doi_thu"]) {
      assert.equal(LOAI_DU_LIEU_GOC.find((l) => l.ma === ma)?.khoiTao.length, 0);
    }
  });
});

describe("Chống CSRF và đọc IP", () => {
  it("GET luôn qua; POST phải cùng nguồn", () => {
    assert.equal(cungNguonGoc("GET", h({}), ["cowork.test"]), true);
    assert.equal(cungNguonGoc("POST", h({ origin: "https://cowork.test" }), ["cowork.test"]), true);
    assert.equal(cungNguonGoc("POST", h({ origin: "https://ke-gian.test" }), ["cowork.test"]), false);
    assert.equal(cungNguonGoc("PATCH", h({}), ["cowork.test"]), false);
    assert.equal(cungNguonGoc("POST", h({ referer: "https://cowork.test/quan-tri" }), ["cowork.test"]), true);
    assert.equal(cungNguonGoc("POST", h({ origin: "null" }), ["cowork.test"]), false);
  });
  it("IP: tin X-Real-IP; nếu không có thì lấy phần tử CUỐI của X-Forwarded-For", () => {
    assert.equal(layIpKhach(h({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
    assert.equal(layIpKhach(h({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" })), "5.5.5.5");
    assert.equal(layIpKhach(h({})), null);
  });
});

describe("Giới hạn tốc độ đăng nhập", () => {
  it("vượt ngưỡng trong cửa sổ thì chặn, hết cửa sổ thì mở", async () => {
    let t = 1_000_000;
    const kho = new KhoDemBoNho(() => t);
    for (let i = 1; i <= 5; i++) assert.equal((await demVaKiem("k", 5, 60, kho)).choPhep, true);
    const lan6 = await demVaKiem("k", 5, 60, kho);
    assert.equal(lan6.choPhep, false);
    assert.ok(lan6.conLaiGiay > 0 && lan6.conLaiGiay <= 60);
    t += 61_000;
    assert.equal((await demVaKiem("k", 5, 60, kho)).choPhep, true);
  });
  it("kho đếm lỗi thì cho qua (lớp khóa tài khoản trong CSDL vẫn chặn)", async () => {
    const hong = { tang: async () => { throw new Error("redis mất"); }, xoa: async () => {} };
    assert.equal((await demVaKiem("k", 1, 60, hong)).choPhep, true);
  });
});

describe("Phiên đăng nhập hết hiệu lực khi đổi mật khẩu", () => {
  it("phiên ký trước mốc đổi mật khẩu bị từ chối, sau mốc thì nhận — chính xác tới mili-giây", () => {
    const doi = new Date("2026-09-19T03:00:10.500Z");
    const ms = doi.getTime();
    assert.equal(phienConHieuLuc(ms - 3_600_000, doi), false);
    assert.equal(phienConHieuLuc(ms - 200, doi), false, "cùng giây nhưng trước mốc vẫn phải bị từ chối");
    assert.equal(phienConHieuLuc(ms, doi), true);
    assert.equal(phienConHieuLuc(ms + 5, doi), true);
    assert.equal(phienConHieuLuc(123, null), true);
  });
});
