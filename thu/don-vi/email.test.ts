/**
 * Kiểm thử đơn vị phần thuần của email marketing (BUSINESS_RULES mục 21 — EM).
 * Trọng tâm: khối an toàn không để lọt HTML/script, biến danh sách trắng, lọc người nhận,
 * mã ký liên kết không giả được, phân loại lỗi SMTP.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import {
  bienKhongHopLe,
  chuyenHopLe,
  cheEmail,
  danhSachLienKet,
  dungThu,
  laEmailHopLe,
  locNguoiNhan,
  LuocDoDanhSachKhoi,
  LuocDoTieuDeThu,
  phanLoaiLoiGui,
  thayBien,
  thieuChanThu,
  thoatHtml,
  urlHttps,
  type Khoi,
  type UngVien,
} from "../../src/modules/email/tinh-toan";
import { docMaLienKet, kyMaLienKet } from "../../src/modules/email/ma-lien-ket";

const BIEN = { ten: "An", cong_ty: "Cty A", email: "an@a.vn", cong_ty_gui: "TGTH" };
const CHAN = { tenCongTy: "Công ty CP Thế Giới Tin Học", diaChi: "1 Lê Lợi, Q1", lienKetHuy: "https://app.vn/huy-nhan-tin/abc" };

describe("Khối an toàn (EM-03)", () => {
  it("chuỗi người soạn có thẻ HTML bị thoát, không thành thẻ", () => {
    const khoi = LuocDoDanhSachKhoi.parse([{ loai: "doan-van", noiDung: '<script>alert(1)</script><img src=x onerror="a()">' }]);
    const { html } = dungThu("Chào", khoi, BIEN, CHAN);
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  });
  it("giá trị biến (tên khách do người ngoài nhập) cũng bị thoát", () => {
    const khoi = LuocDoDanhSachKhoi.parse([{ loai: "tieu-de", noiDung: "Chào {{ten}}" }]);
    const { html } = dungThu("Chào {{ten}}", khoi, { ...BIEN, ten: '<b onclick="x">Hack</b>' }, CHAN);
    assert.ok(!html.includes("<b onclick"));
    assert.ok(html.includes("&lt;b onclick=&quot;x&quot;&gt;Hack&lt;/b&gt;"));
  });
  it("loại khối lạ (html tự do) bị lược đồ từ chối", () => {
    assert.equal(LuocDoDanhSachKhoi.safeParse([{ loai: "html", noiDung: "<div>x</div>" }]).success, false);
  });
  it("nút và ảnh chỉ nhận https", () => {
    assert.equal(LuocDoDanhSachKhoi.safeParse([{ loai: "nut", nhan: "Xem", url: "javascript:alert(1)" }]).success, false);
    assert.equal(LuocDoDanhSachKhoi.safeParse([{ loai: "nut", nhan: "Xem", url: "http://a.vn" }]).success, false);
    assert.equal(LuocDoDanhSachKhoi.safeParse([{ loai: "anh", url: "data:image/png;base64,AAAA" }]).success, false);
    assert.equal(LuocDoDanhSachKhoi.safeParse([{ loai: "nut", nhan: "Xem", url: "https://a.vn/x?y=1" }]).success, true);
  });
  it("URL không được chứa biến hay tài khoản", () => {
    assert.equal(urlHttps("https://a.vn/{{email}}"), null);
    assert.equal(urlHttps("https://user:pass@a.vn"), null);
    assert.equal(urlHttps(" https://a.vn "), "https://a.vn/");
  });
  it("thư phải có ít nhất một khối, tối đa 60", () => {
    assert.equal(LuocDoDanhSachKhoi.safeParse([]).success, false);
    assert.equal(LuocDoDanhSachKhoi.safeParse(Array(61).fill({ loai: "ngan-cach" })).success, false);
  });
  it("tiêu đề thư không được xuống dòng (chống chèn tiêu đề SMTP)", () => {
    assert.equal(LuocDoTieuDeThu.safeParse("Chào\r\nBcc: x@y.vn").success, false);
    assert.equal(LuocDoTieuDeThu.safeParse("Ưu đãi tháng 10 cho {{cong_ty}}").success, true);
  });
});

describe("Biến cá nhân hóa (EM-04)", () => {
  it("thay biến danh sách trắng, chấp nhận khoảng trắng trong ngoặc", () => {
    assert.equal(thayBien("Chào {{ ten }} ở {{cong_ty}}", BIEN), "Chào An ở Cty A");
  });
  it("phát hiện biến ngoài danh sách", () => {
    assert.deepEqual(bienKhongHopLe("{{ten}} {{mat_khau}} {{so_du}}"), ["mat_khau", "so_du"]);
    assert.equal(LuocDoDanhSachKhoi.safeParse([{ loai: "doan-van", noiDung: "{{mat_khau}}" }]).success, false);
  });
});

describe("Dựng thư", () => {
  const khoi: Khoi[] = LuocDoDanhSachKhoi.parse([
    { loai: "tieu-de", noiDung: "Ưu đãi" },
    { loai: "doan-van", noiDung: "Dòng 1\nDòng 2" },
    { loai: "nut", nhan: "Xem ngay", url: "https://a.vn/km" },
    { loai: "anh", url: "https://a.vn/a.png", moTa: "Ảnh", lienKet: "https://a.vn/sp" },
    { loai: "danh-sach", muc: ["Một", "Hai"] },
    { loai: "ngan-cach" },
  ]);
  it("chân thư có tên, địa chỉ, liên kết huỷ (EM-09)", () => {
    const { html, text } = dungThu("Chào", khoi, BIEN, CHAN);
    assert.ok(html.includes("Công ty CP Thế Giới Tin Học"));
    assert.ok(html.includes("1 Lê Lợi, Q1"));
    assert.ok(html.includes('href="https://app.vn/huy-nhan-tin/abc"'));
    assert.ok(text.includes("Huỷ nhận tin: https://app.vn/huy-nhan-tin/abc"));
    assert.ok(html.includes("Dòng 1<br>Dòng 2"));
  });
  it("thiếu tên / địa chỉ công ty được báo", () => {
    assert.deepEqual(thieuChanThu({ tenCongTy: "X", diaChi: " " }), ["địa chỉ"]);
    assert.deepEqual(thieuChanThu({ tenCongTy: "X", diaChi: "Y" }), []);
  });
  it("liên kết theo thứ tự xuất hiện", () => assert.deepEqual(danhSachLienKet(khoi), ["https://a.vn/km", "https://a.vn/sp"]));
  it("bật theo dõi: liên kết đổi thành đường chuyển hướng theo chỉ số, có điểm ảnh mở", () => {
    const { html } = dungThu("Chào", khoi, BIEN, CHAN, { anhMo: "https://app.vn/mo/M", lienKetBam: (i) => `https://app.vn/bam/${i}` });
    assert.ok(html.includes('href="https://app.vn/bam/0"'));
    assert.ok(html.includes('href="https://app.vn/bam/1"'));
    assert.ok(!html.includes('href="https://a.vn/km"'));
    assert.ok(html.includes('src="https://app.vn/mo/M"'));
    // Liên kết huỷ nhận tin không đi qua chuyển hướng.
    assert.ok(html.includes('href="https://app.vn/huy-nhan-tin/abc"'));
  });
  it("thoát đủ 5 ký tự", () => assert.equal(thoatHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;"));
});

describe("Lọc người nhận (EM-07)", () => {
  const u = (email: string | null, extra: Partial<UngVien> = {}): UngVien => ({ email, ten: "T", congTy: null, loai: "lead", id: randomUUID(), ...extra });
  it("loại không email, sai dạng, đã từ chối, email hỏng, trùng (không phân biệt hoa thường)", () => {
    const chan = new Map([["huy@a.vn", "huy-nhan-tin"], ["hong@a.vn", "email-hong"]]);
    const { hopLe, biLoai } = locNguoiNhan(
      [u("A@a.vn"), u("a@a.vn"), u(null), u("khong-phai-email"), u("huy@a.vn"), u("hong@a.vn"), u("co@a.vn", { tuChoiLuc: new Date() }), u("b@a.vn")],
      chan,
    );
    assert.deepEqual(hopLe.map((h) => h.email), ["a@a.vn", "b@a.vn"]);
    assert.deepEqual(biLoai.map((b) => b.lyDo).sort(), ["da-tu-choi", "da-tu-choi", "email-hong", "email-khong-hop-le", "khong-co-email", "trung-email"].sort());
  });
  it("định dạng email", () => {
    assert.ok(laEmailHopLe("nguyen.van-a+km@cong-ty.com.vn"));
    assert.ok(!laEmailHopLe("a@b"));
    assert.ok(!laEmailHopLe("a b@c.vn"));
    assert.ok(!laEmailHopLe('"a"@c.vn'));
  });
  it("che email cho người không có quyền xem", () => assert.equal(cheEmail("nguyen@abc.vn"), "ng•••@abc.vn"));
});

describe("Vòng đời chiến dịch (EM-05)", () => {
  it("chuyển hợp lệ", () => {
    assert.ok(chuyenHopLe("DRAFT", "PENDING_APPROVAL"));
    assert.ok(chuyenHopLe("PENDING_APPROVAL", "SENDING"));
    assert.ok(chuyenHopLe("SENDING", "PAUSED"));
    assert.ok(chuyenHopLe("PAUSED", "SENDING"));
  });
  it("không nhảy cóc qua duyệt, không mở lại chiến dịch đã xong/huỷ", () => {
    assert.ok(!chuyenHopLe("DRAFT", "SENDING"));
    assert.ok(!chuyenHopLe("COMPLETED", "SENDING"));
    assert.ok(!chuyenHopLe("CANCELLED", "DRAFT"));
  });
});

describe("Mã ký liên kết công khai (EM-10, EM-11)", () => {
  const khoa = randomBytes(32);
  const t = randomUUID();
  const r = randomUUID();
  it("ký rồi đọc lại đúng tenant, người nhận, chỉ số", () => {
    const ma = kyMaLienKet("bam", t, r, 3, khoa);
    assert.deepEqual(docMaLienKet(ma, "bam", khoa), { tenantId: t, nguoiNhanId: r, chiSo: 3 });
  });
  it("không chứa email hay id dạng chữ đọc được", () => {
    const ma = kyMaLienKet("huy", t, r, 0, khoa);
    assert.ok(!ma.includes(r.replace(/-/g, "")));
    assert.match(ma, /^[A-Za-z0-9_-]+$/);
  });
  it("mã điểm ảnh mở không dùng làm mã huỷ được", () => assert.equal(docMaLienKet(kyMaLienKet("mo", t, r, 0, khoa), "huy", khoa), null));
  it("sửa chỉ số liên kết → chữ ký hỏng", () => {
    const b = Buffer.from(kyMaLienKet("bam", t, r, 0, khoa), "base64url");
    b.writeUInt16BE(1, 33);
    assert.equal(docMaLienKet(b.toString("base64url"), "bam", khoa), null);
  });
  it("khóa khác → từ chối; rác → từ chối", () => {
    assert.equal(docMaLienKet(kyMaLienKet("huy", t, r, 0, khoa), "huy", randomBytes(32)), null);
    assert.equal(docMaLienKet("abc", "huy", khoa), null);
    assert.equal(docMaLienKet("../../etc/passwd", "huy", khoa), null);
  });
});

describe("Phân loại lỗi SMTP (EM-13)", () => {
  it("sai mật khẩu / mất kết nối / 4xx → lỗi kết nối (trả về hàng chờ, tự tạm dừng)", () => {
    assert.equal(phanLoaiLoiGui({ code: "EAUTH", responseCode: 535 }), "ket-noi");
    assert.equal(phanLoaiLoiGui({ code: "ECONNECTION" }), "ket-noi");
    assert.equal(phanLoaiLoiGui({ code: "EMESSAGE", responseCode: 421, command: "DATA" }), "ket-noi");
  });
  it("4xx ở bước RCPT (greylisting) → lỗi riêng người nhận, không dừng chiến dịch", () =>
    assert.equal(phanLoaiLoiGui({ code: "EENVELOPE", responseCode: 451, command: "RCPT TO" }), "nguoi-nhan"));
  it("550 ở bước RCPT → email hỏng", () => assert.equal(phanLoaiLoiGui({ code: "EENVELOPE", responseCode: 550, command: "RCPT TO" }), "nguoi-nhan-hong"));
  it("lỗi khác ở bước DATA → lỗi riêng thư", () => assert.equal(phanLoaiLoiGui({ code: "EMESSAGE", responseCode: 554, command: "DATA" }), "khac"));
});
