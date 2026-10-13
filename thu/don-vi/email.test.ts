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
  lyDoTamDung,
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
  it("thuộc tính Object.prototype không phải biến hợp lệ", () => {
    assert.deepEqual(bienKhongHopLe("{{constructor}} {{toString}} {{__proto__}} {{hasOwnProperty}} {{valueOf}}"), ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]);
    assert.equal(thayBien("X {{constructor}}", BIEN), "X {{constructor}}");
  });
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
  const rcpt = (responseCode: number, response: string) => ({ code: "EENVELOPE", responseCode, command: "RCPT TO", response });
  it("mất kết nối / sai đăng nhập → lỗi phía gửi (trả hàng chờ, tự tạm dừng)", () => {
    assert.equal(phanLoaiLoiGui({ code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" }), "ket-noi");
    assert.equal(phanLoaiLoiGui({ code: "ECONNECTION" }), "ket-noi");
  });
  it("mọi 4xx → tạm dừng, kể cả ở RCPT (Gmail 451 4.7.1 rate limit)", () => {
    assert.equal(phanLoaiLoiGui(rcpt(451, "451 4.7.1 Rate limit exceeded, try again later")), "ket-noi");
    assert.equal(phanLoaiLoiGui({ code: "EMESSAGE", responseCode: 421, command: "DATA", response: "421 4.7.0 Try again later" }), "ket-noi");
  });
  it("lỗi ở MAIL FROM (nodemailer cũng gắn EENVELOPE) → phía gửi, không đổ cho người nhận", () => {
    assert.equal(phanLoaiLoiGui({ code: "EENVELOPE", responseCode: 550, command: "MAIL FROM", response: "550 5.4.5 Daily user sending limit exceeded" }), "ket-noi");
    assert.equal(phanLoaiLoiGui({ code: "EENVELOPE", responseCode: 550 }), "ket-noi");
  });
  it("5xx ở DATA (M365 SubmissionQuotaExceeded) → phía gửi", () => {
    assert.equal(phanLoaiLoiGui({ code: "EMESSAGE", responseCode: 554, command: "DATA", response: "554 5.2.0 STOREDRV.Submission.Exception:SubmissionQuotaExceededException" }), "ket-noi");
  });
  it("Gmail 550 5.4.5 quota ở RCPT → phía gửi, không chặn người nhận", () => assert.equal(phanLoaiLoiGui(rcpt(550, "550 5.4.5 Daily user sending quota exceeded")), "ket-noi"));
  it("M365 5.7.60 SendAsDenied và 5.7.708 IP bị chặn → phía gửi", () => {
    assert.equal(phanLoaiLoiGui(rcpt(550, "550 5.7.60 SMTP; Client does not have permissions to send as this sender")), "ket-noi");
    assert.equal(phanLoaiLoiGui(rcpt(550, "550 5.7.708 Service unavailable. Access denied, traffic not accepted from this IP")), "ket-noi");
  });
  it("550 5.7.1 relay / SPF của bên gửi → phía gửi", () => assert.equal(phanLoaiLoiGui(rcpt(550, "550 5.7.1 Sender not authorized to relay (SPF fail)")), "ket-noi"));
  it("Gmail 550 5.1.1 và M365 550 5.1.10 → email hỏng (vào danh sách chặn)", () => {
    assert.equal(phanLoaiLoiGui(rcpt(550, "550-5.1.1 The email account that you tried to reach does not exist")), "nguoi-nhan-hong");
    assert.equal(phanLoaiLoiGui(rcpt(550, "550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup")), "nguoi-nhan-hong");
  });
  it("550 không mã mở rộng: chỉ chặn khi câu trả lời nói rõ người nhận không tồn tại", () => {
    assert.equal(phanLoaiLoiGui(rcpt(550, "550 No such user here")), "nguoi-nhan-hong");
    assert.equal(phanLoaiLoiGui(rcpt(550, "550 Requested action not taken")), "nguoi-nhan");
  });
  it("552 5.2.2 hộp thư đầy (dù có chữ 'over quota') → Lỗi riêng người đó, không chặn", () => {
    assert.equal(phanLoaiLoiGui(rcpt(552, "552 5.2.2 Mailbox full")), "nguoi-nhan");
    assert.equal(phanLoaiLoiGui(rcpt(552, "552-5.2.2 The email account that you tried to reach is over quota")), "nguoi-nhan");
  });
  it("5.7.x chính sách bên nhận ở RCPT → Lỗi riêng người đó, không chặn", () =>
    assert.equal(phanLoaiLoiGui(rcpt(550, "550 5.7.1 Delivery not authorized, message refused by recipient")), "nguoi-nhan"));
  it("lỗi không phải SMTP → lỗi riêng thư", () => assert.equal(phanLoaiLoiGui({ message: "lỗi lạ" }), "khac"));
  it("lý do tạm dừng tiếng Việt nói rõ phải làm gì", () => {
    assert.match(lyDoTamDung(rcpt(550, "550 5.4.5 Daily user sending quota exceeded")), /hạn mức/);
    assert.match(lyDoTamDung({ code: "EAUTH", responseCode: 535, response: "535 5.7.8 Authentication credentials invalid" }), /đăng nhập/);
    assert.match(lyDoTamDung({ code: "ECONNECTION", message: "connect ECONNREFUSED" }), /kết nối/);
  });
});
