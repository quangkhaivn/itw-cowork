import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { docThongSoAnh, docThongSoVideo } from "../../src/modules/mang-xa-hoi/media/doc-media";
import { kiemTheoNenTang, docTuyChon, type MediaKiem } from "../../src/modules/mang-xa-hoi/luat-nen-tang";
import {
  appsecretProof, bamState, batDauNgayQuotaSau, chuanHoaDoiSoat, docKhuonSignedRequest, dungMultipart, kiemSignedRequest, kySignedRequest,
  maPhien, ngayQuota, phanLoaiLoiGoogle, phanLoaiLoiGraph, QUYEN_XIN, sinhMaXacNhan, sinhState, urlDangNhapGoogle, urlDangNhapMeta,
} from "../../src/modules/mang-xa-hoi/oauth-thuan";
import { nhanDangTep } from "../../src/modules/dinh-kem/tinh-toan";
import { kiemMaMedia, kyMaMedia } from "../../src/modules/mang-xa-hoi/media-ky";
import { taoMp4 } from "../mxh-mp4";

/** 0.24.0 — phần thuần của kết nối Facebook / Instagram / YouTube / Drive. Không CSDL, không mạng, không đồng hồ. */

const KHOA = Buffer.alloc(32, 7);
const mt = { appUrlHttps: true, coDoiJpeg: true };
const anh = (o: Partial<MediaKiem> = {}): MediaKiem => ({ attachmentId: "a", tenTep: "a.jpg", mime: "image/jpeg", dungLuong: 100_000, rong: 1080, cao: 1080, thoiLuongGiay: null, ...o });
const video = (o: Partial<MediaKiem> = {}): MediaKiem => ({ attachmentId: "v", tenTep: "v.mp4", mime: "video/mp4", dungLuong: 5_000_000, rong: 1080, cao: 1920, thoiLuongGiay: 30, maHoa: "avc1", ...o });
const nd = (media: MediaKiem[], o: Partial<{ tieuDe: string | null; noiDung: string; tuyChon: object }> = {}) => ({ tieuDe: "Tiêu đề", noiDung: "Nội dung", media, tuyChon: {}, ...o });

describe("Đọc thông số ảnh", () => {
  it("PNG: IHDR", () => {
    const b = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.write("IHDR", 12, "latin1");
    b.writeUInt32BE(1080, 16);
    b.writeUInt32BE(1350, 20);
    assert.deepEqual(docThongSoAnh("image/png", b), { rong: 1080, cao: 1350 });
  });
  it("JPEG: đọc SOF0 sau APP0", () => {
    const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(docThongSoAnh("image/jpeg", b), { rong: 1920, cao: 1080 });
  });
  it("GIF / WebP VP8X", () => {
    const g = Buffer.from("GIF89a\x40\x01\xf0\x00", "latin1");
    assert.deepEqual(docThongSoAnh("image/gif", g), { rong: 320, cao: 240 });
    const w = Buffer.alloc(30);
    w.write("RIFF", 0, "latin1"); w.write("WEBP", 8, "latin1"); w.write("VP8X", 12, "latin1");
    w.writeUIntLE(799, 24, 3); w.writeUIntLE(599, 27, 3);
    assert.deepEqual(docThongSoAnh("image/webp", w), { rong: 800, cao: 600 });
  });
  it("Tệp hỏng → null, không ném", () => assert.deepEqual(docThongSoAnh("image/png", Buffer.from("rac")), { rong: null, cao: null }));
});

describe("Đọc thông số video MP4 / MOV", () => {
  it("thời lượng, kích thước, mã hóa", () => {
    const v = docThongSoVideo(taoMp4({ rong: 1080, cao: 1920, giay: 42.5 }));
    assert.equal(v.rong, 1080); assert.equal(v.cao, 1920); assert.equal(v.thoiLuongGiay, 42.5); assert.equal(v.maHoa, "avc1");
  });
  it("video quay dọc lưu ngang + ma trận xoay 90° → hiện dọc", () => {
    const v = docThongSoVideo(taoMp4({ rong: 1080, cao: 1920, giay: 10, xoay: true }));
    assert.deepEqual([v.rong, v.cao], [1080, 1920]);
  });
  it("không có moov → null", () => assert.equal(docThongSoVideo(Buffer.from("00000008ftypabcd", "latin1")).thoiLuongGiay, null));
  it("đính kèm: MP4 chỉ nhận cho bài mạng xã hội", () => {
    const b = taoMp4({ rong: 10, cao: 10, giay: 1 }).subarray(0, 16);
    assert.equal(nhanDangTep("a.mp4", b).hopLe, false);
    assert.equal(nhanDangTep("a.mp4", b, true).mime, "video/mp4");
    assert.equal(nhanDangTep("a.mp4", Buffer.from("PK\x03\x04xxxxxxxxxxxx", "latin1"), true).hopLe, false);
  });
});

describe("Luật nền tảng (dạng dữ liệu)", () => {
  it("Facebook chọn kiểu: chữ / một ảnh / nhiều ảnh / video / Reels; không trộn", () => {
    assert.equal(kiemTheoNenTang("FACEBOOK_PAGE", nd([]), mt).kieu, "fb-chu");
    assert.equal(kiemTheoNenTang("FACEBOOK_PAGE", nd([anh()]), mt).kieu, "fb-anh");
    assert.equal(kiemTheoNenTang("FACEBOOK_PAGE", nd([anh(), anh()]), mt).kieu, "fb-nhieu-anh");
    assert.equal(kiemTheoNenTang("FACEBOOK_PAGE", nd([video()]), mt).kieu, "fb-video");
    assert.equal(kiemTheoNenTang("FACEBOOK_PAGE", nd([video()], { tuyChon: { facebookReels: true } }), mt).kieu, "fb-reels");
    assert.ok(kiemTheoNenTang("FACEBOOK_PAGE", nd([anh(), video()]), mt).viPham.length > 0);
  });
  it("Reels 3–90 giây, dọc 9:16", () => {
    assert.match(kiemTheoNenTang("FACEBOOK_PAGE", nd([video({ thoiLuongGiay: 120 })], { tuyChon: { facebookReels: true } }), mt).viPham[0].thongBao, /3–90 giây/);
    assert.match(kiemTheoNenTang("FACEBOOK_PAGE", nd([video({ rong: 1920, cao: 1080 })], { tuyChon: { facebookReels: true } }), mt).viPham[0].thongBao, /9:16/);
  });
  it("Instagram: cần media, https, JPEG (đổi được hoặc từ chối kèm hướng dẫn), tỉ lệ 4:5 → 1,91:1, carousel ≤ 10", () => {
    assert.ok(kiemTheoNenTang("INSTAGRAM", nd([]), mt).viPham.length > 0);
    assert.match(kiemTheoNenTang("INSTAGRAM", nd([anh()]), { ...mt, appUrlHttps: false }).viPham[0].thongBao, /Instagram cần Cowork chạy ở địa chỉ https công khai/);
    const png = kiemTheoNenTang("INSTAGRAM", nd([anh({ mime: "image/png", tenTep: "a.png" })]), mt);
    assert.equal(png.viPham.length, 0); assert.match(png.ghiChu[0], /đổi sang JPEG/);
    assert.match(kiemTheoNenTang("INSTAGRAM", nd([anh({ mime: "image/png", tenTep: "a.png" })]), { ...mt, coDoiJpeg: false }).viPham[0].thongBao, /Lưu thành/);
    assert.match(kiemTheoNenTang("INSTAGRAM", nd([anh({ rong: 1080, cao: 1920 })]), mt).viPham[0].thongBao, /4:5/);
    assert.equal(kiemTheoNenTang("INSTAGRAM", nd(Array.from({ length: 11 }, () => anh())), mt).kieu, "ig-carousel");
    assert.ok(kiemTheoNenTang("INSTAGRAM", nd(Array.from({ length: 11 }, () => anh())), mt).viPham.some((v) => /2–10/.test(v.thongBao)));
    assert.equal(kiemTheoNenTang("INSTAGRAM", nd([video()]), mt).kieu, "ig-reels");
    assert.ok(kiemTheoNenTang("INSTAGRAM", nd([video({ maHoa: "vp09" })]), mt).viPham.some((v) => /H.264/.test(v.thongBao)));
  });
  it("YouTube: đúng một video, tiêu đề ≤ 100, ghi chú Shorts / quyền riêng tư", () => {
    assert.ok(kiemTheoNenTang("YOUTUBE", nd([anh()]), mt).viPham.length > 0);
    assert.ok(kiemTheoNenTang("YOUTUBE", nd([video()], { tieuDe: "" }), mt).viPham.some((v) => v.truong === "tieuDe"));
    const k = kiemTheoNenTang("YOUTUBE", nd([video({ thoiLuongGiay: 59 })], { tuyChon: { youtubeRiengTu: "unlisted" } }), mt);
    assert.equal(k.kieu, "yt-video"); assert.ok(k.ghiChu.some((g) => /Shorts/.test(g))); assert.ok(k.ghiChu.some((g) => /Không công khai/.test(g)));
    assert.ok(!kiemTheoNenTang("YOUTUBE", nd([video({ rong: 1920, cao: 1080, thoiLuongGiay: 59 })]), mt).ghiChu.some((g) => /Shorts/.test(g)));
  });
  it("WordPress bỏ qua video (ghi chú), vẫn cần tiêu đề", () => {
    const k = kiemTheoNenTang("WORDPRESS", nd([anh(), video()]), mt);
    assert.equal(k.viPham.length, 0); assert.ok(k.ghiChu.length > 0);
  });
  it("docTuyChon: mặc định riêng tư, bỏ giá trị lạ", () => assert.deepEqual(docTuyChon({ youtubeRiengTu: "x", facebookReels: "co" }), { facebookReels: false, lienKet: null, youtubeRiengTu: "private" }));
});

describe("OAuth thuần", () => {
  it("state ngẫu nhiên; CSDL chỉ giữ mã băm", () => {
    const a = sinhState();
    assert.notEqual(a, sinhState()); assert.equal(bamState(a).length, 64); assert.ok(!bamState(a).includes(a));
  });
  it("khóa phiên đổi khi phiên ký lại", () => assert.notEqual(maPhien("u", "t", 1), maPhien("u", "t", 2)));
  it("URL Google: offline + consent, drive.file, KHÔNG drive.readonly", () => {
    const u = new URL(urlDangNhapGoogle({ goc: "https://accounts.google.com", clientId: "1-a.apps.googleusercontent.com", redirectUri: "https://x/cb", state: "s", scopes: QUYEN_XIN.GOOGLE.map((q) => q.ma) }));
    assert.equal(u.searchParams.get("access_type"), "offline"); assert.equal(u.searchParams.get("prompt"), "consent");
    assert.ok(u.searchParams.get("scope")!.includes("drive.file")); assert.ok(!u.searchParams.get("scope")!.includes("drive.readonly"));
    assert.equal(u.searchParams.get("redirect_uri"), "https://x/cb");
  });
  it("URL Meta: scope hoặc config_id (Facebook Login for Business)", () => {
    const a = new URL(urlDangNhapMeta({ goc: "https://www.facebook.com", appId: "1", graphVersion: "v24.0", redirectUri: "https://x/cb", state: "s", scopes: ["pages_manage_posts"] }));
    assert.equal(a.pathname, "/v24.0/dialog/oauth"); assert.equal(a.searchParams.get("scope"), "pages_manage_posts");
    const b = new URL(urlDangNhapMeta({ goc: "https://www.facebook.com", appId: "1", graphVersion: "v24.0", redirectUri: "https://x/cb", state: "s", scopes: ["x"], configId: "123456" }));
    assert.equal(b.searchParams.get("config_id"), "123456"); assert.equal(b.searchParams.get("scope"), null);
  });
  it("signed_request: đúng chữ ký → đạt; sai chữ ký / sai khuôn → không", () => {
    const sr = kySignedRequest({ algorithm: "HMAC-SHA256", user_id: "123456", issued_at: 1 }, "bi-mat");
    assert.equal(kiemSignedRequest(sr, "bi-mat").ok, true);
    assert.equal(kiemSignedRequest(sr, "khac").ok, false);
    assert.equal(docKhuonSignedRequest("abc").ok, false);
    assert.equal(docKhuonSignedRequest(`${"A".repeat(43)}.${Buffer.from(JSON.stringify({ algorithm: "none", user_id: "1" })).toString("base64url")}`).ok, false);
  });
  it("mã xác nhận xóa dữ liệu: 16 ký tự chữ hoa + số", () => assert.match(sinhMaXacNhan(), /^[A-Z0-9]{16}$/));
  it("appsecret_proof = HMAC-SHA256 hệ 16", () => assert.match(appsecretProof("tok", "sec"), /^[0-9a-f]{64}$/));
  it("ngày quota theo giờ Thái Bình Dương (PST / PDT)", () => {
    assert.equal(ngayQuota(new Date("2026-12-01T07:59:00Z")), "2026-11-30");
    assert.equal(ngayQuota(new Date("2026-12-01T08:00:00Z")), "2026-12-01");
    assert.equal(batDauNgayQuotaSau(new Date("2026-12-01T02:00:00Z")).toISOString(), "2026-12-01T08:00:00.000Z");
    assert.equal(batDauNgayQuotaSau(new Date("2026-07-01T12:00:00Z")).toISOString(), "2026-07-02T07:00:00.000Z");
  });
  it("phân loại lỗi Graph", () => {
    assert.equal(phanLoaiLoiGraph(400, { error: { code: 190 } }).loai, "NEEDS_REAUTH");
    assert.equal(phanLoaiLoiGraph(400, { error: { code: 200 } }).loai, "NEEDS_REAUTH");
    assert.equal(phanLoaiLoiGraph(400, { error: { code: 4 } }).loai, "RETRYABLE");
    assert.equal(phanLoaiLoiGraph(500, { error: { code: 2 } }).loai, "RETRYABLE");
    assert.equal(phanLoaiLoiGraph(400, { error: { code: 100 } }).loai, "PERMANENT");
    assert.equal(phanLoaiLoiGraph(400, { error: { code: 9007 } }).hoanMs, 30_000);
  });
  it("phân loại lỗi Google", () => {
    assert.equal(phanLoaiLoiGoogle(400, { error: "invalid_grant" }).loai, "NEEDS_REAUTH");
    assert.equal(phanLoaiLoiGoogle(403, { error: { errors: [{ reason: "quotaExceeded" }] } }).hoanMs, -1);
    assert.equal(phanLoaiLoiGoogle(403, { error: { errors: [{ reason: "insufficientPermissions" }] } }).loai, "NEEDS_REAUTH");
    assert.equal(phanLoaiLoiGoogle(503, {}).loai, "RETRYABLE");
    assert.equal(phanLoaiLoiGoogle(400, { error: { message: "x" } }).loai, "PERMANENT");
  });
  it("multipart có ranh giới, tên tệp đã làm sạch", () => {
    const m = dungMultipart({ message: "Chào" }, { ten: "source", tenTep: "Ảnh đẹp \"x\".jpg", mime: "image/jpeg", noiDung: Buffer.from("abc") });
    const s = m.than.toString("utf8");
    assert.ok(m.contentType.startsWith("multipart/form-data; boundary=")); assert.ok(s.includes('filename="Anh-dep-x-.jpg"')); assert.ok(s.includes("Chào"));
  });
  it("chuẩn hóa nội dung để đối soát", () => assert.equal(chuanHoaDoiSoat(" a \r\n\n b "), "a b"));
});

describe("Link ký có cờ JPEG", () => {
  const n = { tenantId: "11111111-1111-4111-8111-111111111111", postId: "22222222-2222-4222-8222-222222222222", attachmentId: "33333333-3333-4333-8333-333333333333", hetHanGiay: 2_000_000_000 };
  it("cờ jpeg nằm trong phần ký", () => {
    const ma = kyMaMedia({ ...n, jpeg: true }, KHOA);
    const k = kiemMaMedia(ma, new Date(0), KHOA);
    assert.ok(k.ok && k.noiDung.jpeg === true);
    const boCo = Buffer.from(Buffer.from(ma.split(".")[0], "base64url").toString("utf8").replace(/\|jpeg$/, "")).toString("base64url");
    const s = kiemMaMedia(`${boCo}.${ma.split(".")[1]}`, new Date(0), KHOA);
    assert.ok(!s.ok && s.ly === "sai-chu-ky");
    const k4 = kiemMaMedia(kyMaMedia(n, KHOA), new Date(0), KHOA);
    assert.ok(k4.ok && !k4.noiDung.jpeg);
  });
});
