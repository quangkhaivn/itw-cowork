/**
 * Kiểm thử đơn vị phần thuần của email gửi số lượng lớn (BUSINESS_RULES mục 29 — EG, 0.18.0):
 * đường khởi động, nhãn [QC], cửa sổ 24 giờ, trạng thái sổ đồng ý, chuỗi ký SNS + kiểm URL chứng chỉ,
 * gộp theo tên miền, ngưỡng tỷ lệ, DNS tên miền gửi, tiêu đề SES.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  danhGiaTyLe,
  docMaThuSes,
  docNgayYmd,
  docThoiDiem,
  dungThu,
  ganNhanQuangCao,
  gopTheoTenMien,
  mayChuSmtpSes,
  NHAN_QUANG_CAO_MAC_DINH,
  nhomTenMien,
  soNgayTuNgay,
  tieuDeSes,
  trangThaiDongY,
  tranKhoiDong,
  tranNgayHieuLuc,
  vungCuaTopic,
  xetGioiHanDiaChi,
  chuanHoaNhanQuangCao,
} from "../../src/modules/email/tinh-toan";
import { chuoiKySns, docSuKienSes, laUrlChungChiSns, laUrlDangKySns, LuocDoThongDiepSns, xacMinhChuKySns, type ThongDiepSns } from "../../src/modules/email/sns";
import { banGhiCanCo, danhGiaBanGhi } from "../../src/modules/email/dns";
import { bamMaWebhookSes, khopMaWebhookSes, sinhMaWebhookSes, tenantCuaMaWebhook } from "../../src/modules/email/ma-webhook-ses";
import { laNgayYmd } from "../../src/modules/cau-hinh/danh-muc";
import { dungThuXacNhanTuChoi } from "../../src/modules/email/tinh-toan";
import { kyThongDiep, taoChungChiTuKy, URL_CHUNG_CHI } from "../sns-gia";

// 12:00 giờ Việt Nam ngày 10/11/2026.
const TRUA_10_11 = new Date("2026-11-10T05:00:00Z");

describe("EG-10 — đường khởi động (warm-up)", () => {
  it("ngày đầu = mức đầu, tăng theo hệ số mỗi ngày lịch giờ VN", () => {
    assert.equal(tranKhoiDong(20261110, 200, 1.3, TRUA_10_11), 200);
    assert.equal(tranKhoiDong(20261109, 200, 1.3, TRUA_10_11), 260);
    assert.equal(tranKhoiDong(20261108, 200, 1.3, TRUA_10_11), 338);
    // ~2 tuần lên quanh 5.000 (ngày 13: 200 × 1,3^12 ≈ 3.329; ngày 14: ≈ 4.327; ngày 15: ≈ 5.625)
    assert.ok(tranKhoiDong(20261027, 200, 1.3, TRUA_10_11)! > 5000);
  });
  it("đổi ngày theo giờ Việt Nam, không theo UTC", () => {
    // 23:30 ngày 09/11 UTC = 06:30 ngày 10/11 VN → đã là ngày thứ 2.
    assert.equal(soNgayTuNgay(20261109, new Date("2026-11-09T23:30:00Z")), 1);
    assert.equal(soNgayTuNgay(20261109, new Date("2026-11-09T16:59:00Z")), 0);
  });
  it("chưa tới ngày bắt đầu → mức đầu; chưa đặt / ngày sai → null", () => {
    assert.equal(tranKhoiDong(20261201, 200, 1.3, TRUA_10_11), 200);
    assert.equal(tranKhoiDong(null, 200, 1.3, TRUA_10_11), null);
    assert.equal(tranKhoiDong(20260231, 200, 1.3, TRUA_10_11), null);
    assert.equal(tranKhoiDong(20261110, 200, 0.5, TRUA_10_11), null);
  });
  it("không ra Infinity với số ngày lớn", () => {
    assert.equal(tranKhoiDong(20000101, 200, 3, TRUA_10_11), 10_000_000);
  });
  it("trần hiệu lực = min(trần đặt, đường khởi động); cả hai trống = null", () => {
    assert.equal(tranNgayHieuLuc(5000, 338), 338);
    assert.equal(tranNgayHieuLuc(100, 338), 100);
    assert.equal(tranNgayHieuLuc(null, 338), 338);
    assert.equal(tranNgayHieuLuc(5000, null), 5000);
    assert.equal(tranNgayHieuLuc(null, null), null);
  });
  it("ngày YYYYMMDD: kiểm ngày có thật", () => {
    assert.deepEqual(docNgayYmd(20240229), { nam: 2024, thang: 2, ngay: 29 });
    assert.equal(docNgayYmd(20250229), null);
    assert.equal(laNgayYmd(20261101), true);
    assert.equal(laNgayYmd(20261131), false);
    assert.equal(laNgayYmd(20261301), false);
  });
});

describe("EG-06 — nhãn quảng cáo đầu tiêu đề", () => {
  it("gắn ở vị trí đầu", () => assert.equal(ganNhanQuangCao("Ưu đãi tháng 11", "[QC]"), "[QC] Ưu đãi tháng 11"));
  it("không gắn hai lần (kể cả khác hoa thường / khoảng trắng)", () => {
    assert.equal(ganNhanQuangCao("[QC] Ưu đãi", "[QC]"), "[QC] Ưu đãi");
    assert.equal(ganNhanQuangCao("[qc]   Ưu đãi", "[QC]"), "[QC] Ưu đãi");
  });
  it("nhãn nằm giữa tiêu đề không tính — vẫn gắn lên đầu", () => assert.equal(ganNhanQuangCao("Ưu đãi [QC]", "[QC]"), "[QC] Ưu đãi [QC]"));
  it("nhãn trống / sai → dùng mặc định, người soạn không bỏ được nhãn", () => {
    assert.equal(chuanHoaNhanQuangCao(""), NHAN_QUANG_CAO_MAC_DINH);
    assert.equal(chuanHoaNhanQuangCao("x\ny"), NHAN_QUANG_CAO_MAC_DINH);
    assert.equal(ganNhanQuangCao("Ưu đãi", ""), "[QC] Ưu đãi");
    assert.equal(ganNhanQuangCao("Ưu đãi", "[Quảng cáo]"), "[Quảng cáo] Ưu đãi");
  });
  it("dungThu gắn nhãn SAU khi thay biến — tên khách không đẩy được nhãn khỏi đầu", () => {
    const t = dungThu("{{ten}} ơi, ưu đãi", [{ loai: "doan-van", noiDung: "x" }], { ten: "[QC] Giả", cong_ty: "", email: "", cong_ty_gui: "" }, { tenCongTy: "A", diaChi: "B", lienKetHuy: "#" }, undefined, "[QC]");
    assert.ok(t.tieuDe.startsWith("[QC] "));
    const khong = dungThu("Chào", [{ loai: "doan-van", noiDung: "x" }], { ten: "", cong_ty: "", email: "", cong_ty_gui: "" }, { tenCongTy: "A", diaChi: "B", lienKetHuy: "#" });
    assert.equal(khong.tieuDe, "Chào");
  });
});

describe("EG-07 — tối đa N thư / địa chỉ / 24 giờ (cửa sổ trượt)", () => {
  const gio = (h: number) => new Date(TRUA_10_11.getTime() - h * 3_600_000);
  it("dưới N → nhận; đủ N → hoãn tới lúc thư cũ nhất cần thiết ra khỏi cửa sổ", () => {
    const daGui = new Map([["a@x.vn", [gio(20), gio(10), gio(1)]], ["b@x.vn", [gio(5)]]]);
    const kq = xetGioiHanDiaChi([{ id: "1", email: "a@x.vn" }, { id: "2", email: "b@x.vn" }], daGui, 3, TRUA_10_11);
    assert.deepEqual(kq.nhan, ["2"]);
    assert.equal(kq.hoan.length, 1);
    assert.equal(kq.hoan[0].den.getTime(), gio(20).getTime() + 24 * 3_600_000);
  });
  it("thư ngoài 24 giờ không tính", () => {
    const kq = xetGioiHanDiaChi([{ id: "1", email: "a@x.vn" }], new Map([["a@x.vn", [gio(25), gio(30), gio(48)]]]), 3, TRUA_10_11);
    assert.deepEqual(kq.nhan, ["1"]);
  });
  it("cộng dồn trong chính lô: 4 thư cùng địa chỉ trong một lô → 3 nhận, 1 hoãn", () => {
    const uv = [1, 2, 3, 4].map((i) => ({ id: String(i), email: "c@x.vn" }));
    const kq = xetGioiHanDiaChi(uv, new Map(), 3, TRUA_10_11);
    assert.deepEqual(kq.nhan, ["1", "2", "3"]);
    assert.equal(kq.hoan[0].id, "4");
    assert.ok(kq.hoan[0].den.getTime() >= TRUA_10_11.getTime() + 24 * 3_600_000 - 1);
  });
  it("N = 1", () => {
    const kq = xetGioiHanDiaChi([{ id: "1", email: "d@x.vn" }], new Map([["d@x.vn", [gio(2)]]]), 1, TRUA_10_11);
    assert.equal(kq.nhan.length, 0);
    assert.equal(kq.hoan[0].den.getTime(), gio(2).getTime() + 24 * 3_600_000);
  });
});

describe("EG-08 — trạng thái sổ đồng ý", () => {
  const d = (s: string) => new Date(s);
  it("không có dòng → null", () => assert.equal(trangThaiDongY([]), null));
  it("dòng mới nhất theo thời điểm xảy ra thắng", () => {
    assert.equal(trangThaiDongY([{ hanhDong: "dong-y", luc: d("2026-01-01") }, { hanhDong: "rut", luc: d("2026-02-01") }]), "rut");
    assert.equal(trangThaiDongY([{ hanhDong: "rut", luc: d("2026-02-01") }, { hanhDong: "dong-y", luc: d("2026-01-01") }]), "rut");
    assert.equal(trangThaiDongY([{ hanhDong: "rut", luc: d("2026-02-01") }, { hanhDong: "dong-y", luc: d("2026-03-01") }]), "dong-y");
  });
  it("cùng thời điểm → dòng ghi sổ sau thắng", () => {
    const l = d("2026-02-01");
    assert.equal(trangThaiDongY([{ hanhDong: "dong-y", luc: l, ghiLuc: d("2026-02-02") }, { hanhDong: "phan-doi", luc: l, ghiLuc: d("2026-02-03") }]), "phan-doi");
  });
  it("hành động lạ bị bỏ qua", () => assert.equal(trangThaiDongY([{ hanhDong: "xoa", luc: d("2027-01-01") }, { hanhDong: "dong-y", luc: d("2026-01-01") }]), "dong-y"));
  it("thời điểm CSV: dd/mm/yyyy [hh:mm] giờ VN, yyyy-mm-dd, ISO; ngày không có thật → null", () => {
    assert.equal(docThoiDiem("05/11/2026 08:30")?.toISOString(), "2026-11-05T01:30:00.000Z");
    assert.equal(docThoiDiem("2026-11-05")?.toISOString(), "2026-11-04T17:00:00.000Z");
    assert.equal(docThoiDiem("2026-11-05T08:30:00Z")?.toISOString(), "2026-11-05T08:30:00.000Z");
    assert.equal(docThoiDiem("31/02/2026"), null);
    assert.equal(docThoiDiem("hôm qua"), null);
  });
});

describe("EG-11 — gộp theo tên miền nhận", () => {
  it("nhóm tên miền", () => {
    assert.equal(nhomTenMien("a@gmail.com"), "gmail.com");
    assert.equal(nhomTenMien("a@GoogleMail.com"), "gmail.com");
    assert.equal(nhomTenMien("a@hotmail.com"), "outlook.com");
    assert.equal(nhomTenMien("a@yahoo.com.vn"), "yahoo.com");
    assert.equal(nhomTenMien("a@itwonline.com"), "khac");
  });
  it("luôn đủ 4 nhóm theo thứ tự, cộng dồn đúng", () => {
    const kq = gopTheoTenMien([
      { tenMien: "gmail.com", daGui: 10, denHop: 9, hong: 1, baoRac: 0, mo: 4 },
      { tenMien: "googlemail.com", daGui: 2, denHop: 2, hong: 0, baoRac: 1, mo: 1 },
      { tenMien: "abc.vn", daGui: 3, denHop: 3, hong: 0, baoRac: 0, mo: 0 },
    ]);
    assert.deepEqual(kq.map((k) => k.nhom), ["gmail.com", "outlook.com", "yahoo.com", "khac"]);
    assert.deepEqual(kq[0], { nhom: "gmail.com", daGui: 12, denHop: 11, hong: 1, baoRac: 1, mo: 5 });
    assert.equal(kq[1].daGui, 0);
    assert.equal(kq[3].daGui, 3);
  });
});

describe("EG-05 — ngưỡng tỷ lệ tự tạm dừng", () => {
  const nguong = { hongPhanTram: 5, baoRacPhanNghin: 1, mauToiThieu: 200 };
  const khong = { mau: 0, hong: 0, baoRac: 0 };
  it("chưa đủ mẫu → không kết luận", () => assert.equal(danhGiaTyLe({ mau: 199, hong: 100, baoRac: 50 }, khong, nguong).tamDung, false));
  it("vượt 5% hỏng → dừng; bằng ngưỡng thì chưa", () => {
    assert.equal(danhGiaTyLe({ mau: 200, hong: 10, baoRac: 0 }, khong, nguong).tamDung, false);
    const kq = danhGiaTyLe({ mau: 200, hong: 11, baoRac: 0 }, khong, nguong);
    assert.ok(kq.tamDung && kq.ma === "ty-le-hong");
  });
  it("vượt 1‰ báo rác → dừng (ưu tiên báo rác)", () => {
    const kq = danhGiaTyLe({ mau: 1000, hong: 60, baoRac: 2 }, khong, nguong);
    assert.ok(kq.tamDung && kq.ma === "ty-le-bao-rac");
  });
  it("chỉ xét phần sau mốc tiếp tục", () => {
    assert.equal(danhGiaTyLe({ mau: 400, hong: 22, baoRac: 0 }, { mau: 200, hong: 11, baoRac: 0 }, nguong).tamDung, true);
    assert.equal(danhGiaTyLe({ mau: 400, hong: 15, baoRac: 0 }, { mau: 200, hong: 11, baoRac: 0 }, nguong).tamDung, false);
    assert.equal(danhGiaTyLe({ mau: 300, hong: 30, baoRac: 0 }, { mau: 200, hong: 11, baoRac: 0 }, nguong).tamDung, false, "100 thư sau mốc < mẫu 200");
  });
});

describe("EG-01 — Amazon SES qua SMTP", () => {
  it("máy chủ theo vùng, cổng 587 STARTTLS", () => {
    assert.deepEqual(mayChuSmtpSes("ap-southeast-1"), { host: "email-smtp.ap-southeast-1.amazonaws.com", port: 587, baoMat: "starttls" });
    assert.throws(() => mayChuSmtpSes("evil.com/"));
  });
  it("tiêu đề SES: configuration set + thẻ; giá trị sai khuôn bị bỏ", () => {
    const t = tieuDeSes("cowork-tin", { cowork_tenant: "8f1c-ab", cowork_recipient: "x y" });
    assert.equal(t["X-SES-CONFIGURATION-SET"], "cowork-tin");
    assert.equal(t["X-SES-MESSAGE-TAGS"], "cowork_tenant=8f1c-ab");
    assert.deepEqual(tieuDeSes("co\r\nX-Evil: 1", {}), {});
  });
  it("mã thư SES từ câu trả lời 250 Ok", () => {
    assert.equal(docMaThuSes("250 Ok 0101019a2b3c4d5e-11112222-3333-4444-5555-666677778888-000000"), "0101019a2b3c4d5e-11112222-3333-4444-5555-666677778888-000000");
    assert.equal(docMaThuSes("250 Ok <0101019a2b3c4d5e-000000>"), "0101019a2b3c4d5e-000000");
    assert.equal(docMaThuSes("250 2.0.0 OK queued"), null);
    assert.equal(docMaThuSes(undefined), null);
  });
  it("vùng của TopicArn", () => {
    assert.equal(vungCuaTopic("arn:aws:sns:ap-southeast-1:123456789012:ses-su-kien"), "ap-southeast-1");
    assert.equal(vungCuaTopic("arn:aws:sns:ap-southeast-1:123:x"), null);
  });
});

describe("EG-03 — SNS: chuỗi ký và URL chứng chỉ", () => {
  const goc = {
    Type: "Notification" as const,
    MessageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
    TopicArn: "arn:aws:sns:ap-southeast-1:123456789012:ses",
    Message: '{"a":1}',
    Timestamp: "2026-11-10T05:00:00.000Z",
    SignatureVersion: "2" as const,
    Signature: "AAAAAAAAAAAAAAAA",
    SigningCertURL: URL_CHUNG_CHI,
  };
  it("Notification không Subject: bỏ cả cặp Subject, đúng thứ tự khóa", () => {
    assert.equal(chuoiKySns(goc), `Message\n{"a":1}\nMessageId\n${goc.MessageId}\nTimestamp\n${goc.Timestamp}\nTopicArn\n${goc.TopicArn}\nType\nNotification\n`);
  });
  it("Notification có Subject", () => {
    assert.ok(chuoiKySns({ ...goc, Subject: "S" }).includes(`MessageId\n${goc.MessageId}\nSubject\nS\nTimestamp\n`));
  });
  it("SubscriptionConfirmation: có SubscribeURL và Token, thiếu thì ném lỗi", () => {
    const xn = { ...goc, Type: "SubscriptionConfirmation" as const, SubscribeURL: "https://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription", Token: "tk" };
    assert.equal(chuoiKySns(xn), `Message\n{"a":1}\nMessageId\n${goc.MessageId}\nSubscribeURL\n${xn.SubscribeURL}\nTimestamp\n${goc.Timestamp}\nToken\ntk\nTopicArn\n${goc.TopicArn}\nType\nSubscriptionConfirmation\n`);
    assert.throws(() => chuoiKySns({ ...xn, Token: undefined }));
  });
  it("URL chứng chỉ: chỉ https://sns.<vùng>.amazonaws.com/…pem, đúng vùng", () => {
    assert.equal(laUrlChungChiSns(URL_CHUNG_CHI, "ap-southeast-1"), true);
    for (const sai of [
      "http://sns.ap-southeast-1.amazonaws.com/a.pem",
      "https://sns.ap-southeast-1.amazonaws.com.evil.com/a.pem",
      "https://evil.com/sns.ap-southeast-1.amazonaws.com/a.pem",
      "https://sns.ap-southeast-1.amazonaws.com:8443/a.pem",
      "https://user@sns.ap-southeast-1.amazonaws.com/a.pem",
      "https://sns.ap-southeast-1.amazonaws.com/a.txt",
      "https://sns.ap-southeast-1.amazonaws.com/a.pem?x=1",
      "https://s3.amazonaws.com/a.pem",
      "https://sns.amazonaws.com/a.pem",
    ]) {
      assert.equal(laUrlChungChiSns(sai, "ap-southeast-1"), false, sai);
    }
    assert.equal(laUrlChungChiSns("https://sns.us-east-1.amazonaws.com/a.pem", "ap-southeast-1"), false, "khác vùng chủ đề");
  });
  it("SubscribeURL: chỉ host sns.<vùng>.amazonaws.com", () => {
    assert.equal(laUrlDangKySns("https://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription&Token=x", "ap-southeast-1"), true);
    assert.equal(laUrlDangKySns("https://169.254.169.254/latest/meta-data", "ap-southeast-1"), false);
    assert.equal(laUrlDangKySns("https://sns.ap-southeast-1.amazonaws.com.evil.com/", "ap-southeast-1"), false);
  });
  it("chữ ký thật bằng chứng chỉ tự ký: phiên bản 1 và 2 đúng; sửa nội dung / khóa khác → sai", () => {
    const cc = taoChungChiTuKy();
    const khac = taoChungChiTuKy();
    for (const v of ["1", "2"] as const) {
      const m = kyThongDiep({ ...goc, SignatureVersion: v }, cc.khoaRieng);
      assert.equal(xacMinhChuKySns(m, cc.pem), true, `v${v}`);
      assert.equal(xacMinhChuKySns({ ...m, Message: '{"a":2}' }, cc.pem), false);
      assert.equal(xacMinhChuKySns(m, khac.pem), false);
    }
    const m1 = kyThongDiep({ ...goc, SignatureVersion: "1" }, cc.khoaRieng);
    assert.equal(xacMinhChuKySns({ ...m1, SignatureVersion: "2" } as ThongDiepSns, cc.pem), false, "đổi phiên bản chữ ký");
    assert.equal(xacMinhChuKySns(m1, "không phải pem"), false);
    assert.equal(xacMinhChuKySns(m1, cc.pem, new Date("2000-01-01")), false, "chứng chỉ chưa hiệu lực");
  });
  it("lược đồ thông điệp: Type lạ / thiếu chữ ký → hỏng", () => {
    assert.equal(LuocDoThongDiepSns.safeParse({ ...goc, Type: "Hack" }).success, false);
    assert.equal(LuocDoThongDiepSns.safeParse({ ...goc, Signature: undefined }).success, false);
  });
  it("đọc sự kiện SES: Bounce / Complaint / Delivery / Rendering Failure; thẻ sai khuôn bị bỏ", () => {
    const mail = { messageId: "ses-1", timestamp: "2026-11-10T05:00:00Z", tags: { cowork_tenant: ["t-1"], cowork_recipient: ["r 1"] } };
    const b = docSuKienSes(JSON.stringify({ eventType: "Bounce", mail, bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: "A@X.vn", diagnosticCode: "550 5.1.1" }] } }))!;
    assert.equal(b.loai, "bounce");
    assert.equal(b.loaiTraLai, "Permanent");
    assert.deepEqual(b.diaChi, ["a@x.vn"]);
    assert.equal(b.theTenant, "t-1");
    assert.equal(b.theNguoiNhan, null);
    assert.equal(docSuKienSes(JSON.stringify({ notificationType: "Complaint", mail, complaint: { complainedRecipients: [{ emailAddress: "a@x.vn" }] } }))!.loai, "complaint");
    assert.equal(docSuKienSes(JSON.stringify({ eventType: "Rendering Failure", mail, failure: { errorMessage: "x" } }))!.loai, "rendering-failure");
    assert.equal(docSuKienSes(JSON.stringify({ eventType: "DeliveryDelay", mail, deliveryDelay: { delayType: "MailboxFull" } }))!.loai, "delivery-delay");
    assert.equal(docSuKienSes(JSON.stringify({ eventType: "Open", mail }))!.loai, "khac");
    assert.equal(docSuKienSes("không phải json"), null);
    assert.equal(docSuKienSes(JSON.stringify({ eventType: "Bounce", mail })), null, "Bounce thiếu khối bounce");
  });
});

describe("EG-02 — mã webhook SES", () => {
  const T = "0b7f5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  it("mang doanh nghiệp, so băm thời gian hằng, sai khuôn → null", () => {
    const ma = sinhMaWebhookSes(T);
    assert.match(ma, /^ses_[A-Za-z0-9_-]{54}$/);
    assert.equal(tenantCuaMaWebhook(ma), T);
    assert.equal(khopMaWebhookSes(ma, bamMaWebhookSes(ma)), true);
    assert.equal(khopMaWebhookSes(sinhMaWebhookSes(T), bamMaWebhookSes(ma)), false);
    assert.equal(khopMaWebhookSes(ma, null), false);
    assert.equal(tenantCuaMaWebhook("ses_../../etc"), null);
    assert.notEqual(sinhMaWebhookSes(T), ma, "ngẫu nhiên mỗi lần");
  });
});

describe("EG-12 — DNS tên miền gửi", () => {
  const c = { tenMienGui: "tin.itwonline.com", mailFrom: null, vung: "ap-southeast-1", dkim: ["abcdefghijklmnop1234"], dmarcRua: "dmarc@itwonline.com" };
  const ds = banGhiCanCo(c);
  const tim = (ma: string) => ds.find((b) => b.ma === ma)!;
  it("đủ 6 bản ghi, chia hai phần; DKIM chưa dán mã → chưa khai", () => {
    assert.equal(ds.length, 6);
    assert.deepEqual(ds.filter((b) => b.phan === "lam-ngay").map((b) => b.ma), ["dmarc"]);
    assert.equal(tim("dmarc").ten, "_dmarc.tin.itwonline.com");
    assert.ok(tim("dmarc").giaTri.startsWith("v=DMARC1; p=none; rua=mailto:dmarc@itwonline.com"));
    assert.equal(tim("dkim-1").ten, "abcdefghijklmnop1234._domainkey.tin.itwonline.com");
    assert.equal(tim("dkim-2").traDuoc, false);
    assert.equal(danhGiaBanGhi(tim("dkim-2"), {}).trangThai, "chua-khai");
    assert.equal(tim("mail-from-mx").ten, "bounce.tin.itwonline.com");
    assert.equal(tim("mail-from-mx").giaTri, "10 feedback-smtp.ap-southeast-1.amazonses.com");
  });
  it("chấm DMARC", () => {
    assert.equal(danhGiaBanGhi(tim("dmarc"), { txt: [["v=DMARC1; p=none; rua=mailto:d@itwonline.com"]] }).trangThai, "dat");
    assert.equal(danhGiaBanGhi(tim("dmarc"), { txt: [["v=DMARC1; rua=mailto:d@x"]] }).trangThai, "sai");
    assert.equal(danhGiaBanGhi(tim("dmarc"), { txt: [["v=DMARC1; p=none"], ["v=DMARC1; p=reject"]] }).trangThai, "sai");
    assert.equal(danhGiaBanGhi(tim("dmarc"), { loi: "ENOTFOUND" }).trangThai, "thieu");
    assert.equal(danhGiaBanGhi(tim("dmarc"), { loi: "ETIMEOUT" }).trangThai, "loi");
    assert.ok(danhGiaBanGhi(tim("dmarc"), { txt: [["v=DMARC1; p=none"]] }).ghiChu.includes("rua"));
  });
  it("chấm SPF (TXT chia nhiều chuỗi), MX, CNAME", () => {
    assert.equal(danhGiaBanGhi(tim("mail-from-spf"), { txt: [["v=spf1 include:amazon", "ses.com ~all"]] }).trangThai, "dat");
    assert.equal(danhGiaBanGhi(tim("mail-from-spf"), { txt: [["v=spf1 -all"]] }).trangThai, "sai");
    assert.equal(danhGiaBanGhi(tim("mail-from-mx"), { mx: [{ exchange: "feedback-smtp.ap-southeast-1.amazonses.com.", priority: 10 }] }).trangThai, "dat");
    assert.equal(danhGiaBanGhi(tim("mail-from-mx"), { mx: [{ exchange: "mx.other.vn", priority: 10 }] }).trangThai, "sai");
    assert.equal(danhGiaBanGhi(tim("dkim-1"), { cname: ["ABCDEFGHIJKLMNOP1234.dkim.amazonses.com"] }).trangThai, "dat");
    assert.equal(danhGiaBanGhi(tim("dkim-1"), { cname: ["x.dkim.amazonses.com"] }).trangThai, "sai");
  });
});

describe("EG-13 — thư xác nhận từ chối", () => {
  it("nêu lúc nhận yêu cầu và lúc ngừng gửi; không nhãn [QC]; HTML đã thoát", () => {
    const t = dungThuXacNhanTuChoi("Công ty <ITW>", new Date("2026-11-10T05:00:00Z"), new Date("2026-11-10T05:00:00Z"));
    assert.ok(!t.tieuDe.includes("[QC]"));
    assert.ok(t.text.includes("10/11/2026 12:00"));
    assert.ok(t.text.includes("ngừng gửi"));
    assert.ok(t.html.includes("&lt;ITW&gt;") && !t.html.includes("<ITW>"));
    assert.ok(!t.html.includes("huy-nhan-tin") && !t.html.includes("/email/mo/"));
  });
});
