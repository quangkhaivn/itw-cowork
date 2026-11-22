import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  bonKyTuCuoi, chuanHoaDiaChiSite, duocChuyenBai, duocChuyenKenh, gianCachThuLai, khoaDoiSoat, phanLoaiHttp, quyetDinhSauLoi,
  slugHoa, tongHopTrangThaiBai, vanBanSangHtml,
} from "../../src/modules/mang-xa-hoi/tinh-toan";
import { laDiaChiNoiBo, laTenMayBiChan } from "../../src/modules/mang-xa-hoi/mang/dia-chi-ip";
import { aadKenh, docKhoaChu, trangThaiKhoaChu } from "../../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { niemPhong } from "../../src/modules/mang-xa-hoi/bao-mat/niem-phong";
import { moNiemPhong } from "../../worker/mang-xa-hoi/giai-ma";
import { kiemMaMedia, kyMaMedia } from "../../src/modules/mang-xa-hoi/media-ky";
import { kiemDinhDang, urlCanDan } from "../../src/modules/mang-xa-hoi/nen-tang-app";
import { wordpress } from "../../src/modules/mang-xa-hoi/connectors/wordpress";
import { VAI_TRO, kiemTraGioiHanAI } from "../../src/lib/vai-tro";
import { timMuc } from "../../src/modules/cau-hinh/danh-muc";

/** 0.23.0 — Mạng xã hội (BUSINESS_RULES mục 34): phần thuần. */

const T = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";

describe("Máy trạng thái bài / kênh", () => {
  it("bài: nháp → chờ duyệt / hẹn giờ / đăng; đã đăng là cuối", () => {
    assert.ok(duocChuyenBai("DRAFT", "PENDING_APPROVAL"));
    assert.ok(duocChuyenBai("PENDING_APPROVAL", "APPROVED"));
    assert.ok(duocChuyenBai("SCHEDULED", "CANCELED"));
    assert.ok(!duocChuyenBai("PUBLISHED", "DRAFT"));
    assert.ok(!duocChuyenBai("PUBLISHING", "CANCELED"));
    assert.ok(!duocChuyenBai("DRAFT", "PUBLISHED"));
  });
  it("kênh: PUBLISHED không đi đâu được; VERIFYING → PUBLISHED / QUEUED / FAILED", () => {
    assert.ok(!duocChuyenKenh("PUBLISHED", "FAILED"));
    assert.ok(duocChuyenKenh("VERIFYING", "PUBLISHED"));
    assert.ok(duocChuyenKenh("FAILED", "QUEUED"));
    assert.ok(!duocChuyenKenh("QUEUED", "PUBLISHED"));
  });
  it("tổng hợp trạng thái bài từ các kênh", () => {
    assert.equal(tongHopTrangThaiBai("PUBLISHING", ["PUBLISHED", "PUBLISHED"]), "PUBLISHED");
    assert.equal(tongHopTrangThaiBai("PUBLISHING", ["PUBLISHED", "FAILED"]), "PARTIALLY_FAILED");
    assert.equal(tongHopTrangThaiBai("PUBLISHING", ["FAILED", "CANCELED"]), "FAILED");
    assert.equal(tongHopTrangThaiBai("PUBLISHING", ["PUBLISHED", "VERIFYING"]), "PUBLISHING");
    assert.equal(tongHopTrangThaiBai("SCHEDULED", ["QUEUED", "QUEUED"]), "SCHEDULED");
    assert.equal(tongHopTrangThaiBai("SCHEDULED", ["QUEUED", "PUBLISHING"]), "PUBLISHING");
    assert.equal(tongHopTrangThaiBai("SCHEDULED", ["CANCELED"]), "CANCELED");
  });
});

describe("Phân loại lỗi, thử lại", () => {
  it("401/403 → NEEDS_REAUTH; 429/5xx → RETRYABLE; 4xx khác → PERMANENT", () => {
    assert.equal(phanLoaiHttp(401).loai, "NEEDS_REAUTH");
    assert.equal(phanLoaiHttp(403).loai, "NEEDS_REAUTH");
    assert.equal(phanLoaiHttp(429).loai, "RETRYABLE");
    assert.equal(phanLoaiHttp(503).loai, "RETRYABLE");
    assert.equal(phanLoaiHttp(400).loai, "PERMANENT");
    assert.equal(phanLoaiHttp(413).loai, "PERMANENT");
  });
  it("giãn cách 30 giây × 2^(n−1), trần 30 phút", () => {
    assert.deepEqual([1, 2, 3, 4].map(gianCachThuLai), [30_000, 60_000, 120_000, 240_000]);
    assert.equal(gianCachThuLai(20), 30 * 60_000);
  });
  it("UNKNOWN → đối soát (không đăng lại mù); RETRYABLE hết lượt → thất bại", () => {
    assert.deepEqual(quyetDinhSauLoi("UNKNOWN", 1, 5, 120_000), { loai: "doi-soat", sauMs: 120_000 });
    assert.deepEqual(quyetDinhSauLoi("RETRYABLE", 2, 5, 0), { loai: "thu-lai", sauMs: 60_000 });
    assert.deepEqual(quyetDinhSauLoi("RETRYABLE", 5, 5, 0), { loai: "that-bai", canNhapLai: false });
    assert.deepEqual(quyetDinhSauLoi("NEEDS_REAUTH", 1, 5, 0), { loai: "that-bai", canNhapLai: true });
    assert.deepEqual(quyetDinhSauLoi("PERMANENT", 1, 5, 0), { loai: "that-bai", canNhapLai: false });
  });
});

describe("Nội dung, địa chỉ", () => {
  it("chữ thường → HTML đã thoát, đoạn, xuống dòng, liên kết", () => {
    const h = vanBanSangHtml("Xin <script>chào</script>\ndòng 2\n\nXem https://vi-du.vn/a?b=1&c=2");
    assert.ok(h.includes("&lt;script&gt;"));
    assert.ok(!h.includes("<script>"));
    assert.ok(h.includes("<br>"));
    assert.equal((h.match(/<p>/g) ?? []).length, 2);
    assert.ok(h.includes('<a href="https://vi-du.vn/a?b=1&amp;c=2" rel="noopener">'));
  });
  it("slug bỏ dấu; khóa đối soát duy nhất theo kênh-bài", () => {
    assert.equal(slugHoa("Khai trương Đà Nẵng!"), "khai-truong-da-nang");
    const k = khoaDoiSoat("Tiêu đề", "abcdef01-2345-4678-9abc-def012345678");
    assert.equal(k, "tieu-de-cwabcdef0123");
    assert.equal(khoaDoiSoat(null, "abcdef01-2345-4678-9abc-def012345678"), "bai-cwabcdef0123");
  });
  it("địa chỉ site: chỉ HTTPS, bỏ /wp-admin, không tài khoản trong URL", () => {
    assert.equal(chuanHoaDiaChiSite("vi-du.vn/").url, "https://vi-du.vn");
    assert.equal(chuanHoaDiaChiSite("https://vi-du.vn/blog/wp-admin/").url, "https://vi-du.vn/blog");
    assert.equal(chuanHoaDiaChiSite("http://vi-du.vn").hopLe, false);
    assert.equal(chuanHoaDiaChiSite("http://localhost:8080").hopLe, false);
    assert.equal(chuanHoaDiaChiSite("http://localhost:8080", true).hopLe, true);
    assert.equal(chuanHoaDiaChiSite("https://u:p@vi-du.vn").hopLe, false);
    assert.equal(chuanHoaDiaChiSite("https://vi-du.vn/?x=1").hopLe, false);
  });
  it("chỉ hiện 4 ký tự cuối của bí mật", () => assert.equal(bonKyTuCuoi("abcd efgh ijkl"), "ijkl"));
  it("WordPress cần tiêu đề và nội dung", () => {
    assert.equal(wordpress.validate({ tieuDe: "", noiDung: "x", soAnh: 0 }).length, 1);
    assert.equal(wordpress.validate({ tieuDe: "A", noiDung: "x", soAnh: 3 }).length, 0);
  });
});

describe("Chống SSRF — dải địa chỉ", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.5", "192.168.1.1", "100.100.100.200", "0.0.0.0", "::1", "fd00:ec2::254", "fe80::1", "::ffff:10.0.0.1", "::ffff:a00:1", "224.0.0.1"]) {
    it(`chặn ${ip}`, () => assert.ok(laDiaChiNoiBo(ip)));
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) it(`cho ${ip}`, () => assert.ok(!laDiaChiNoiBo(ip)));
  it("chuỗi không phải IP → chặn (mặc định an toàn)", () => assert.ok(laDiaChiNoiBo("abc")));
  it("tên máy metadata / .internal → chặn", () => {
    assert.ok(laTenMayBiChan("metadata.google.internal"));
    assert.ok(laTenMayBiChan("foo.local"));
    assert.ok(!laTenMayBiChan("vi-du.vn"));
  });
});

describe("Niêm phong envelope (SEC-05)", () => {
  const env = { SOCIAL_MASTER_KEY: randomBytes(32).toString("base64") } as unknown as NodeJS.ProcessEnv;
  it("thiếu khóa → báo SOCIAL_MASTER_KEY, không dùng APP_ENC_KEY", () => {
    const k = trangThaiKhoaChu({ APP_ENC_KEY: randomBytes(32).toString("base64") } as unknown as NodeJS.ProcessEnv);
    assert.equal(k.coKhoa, false);
    assert.match(k.loi ?? "", /SOCIAL_MASTER_KEY/);
  });
  it("niêm phong rồi mở đúng AAD; sai AAD / sửa byte → hỏng", () => {
    const bn = niemPhong("mật khẩu", aadKenh(T, P), docKhoaChu(undefined, env));
    assert.equal(moNiemPhong(bn, aadKenh(T, P), env), "mật khẩu");
    assert.throws(() => moNiemPhong(bn, aadKenh(P, P), env));
    const hong = { ...bn, ciphertext: Uint8Array.from(bn.ciphertext, (b, i) => (i === 0 ? b ^ 1 : b)) };
    assert.throws(() => moNiemPhong(hong, aadKenh(T, P), env));
  });
});

describe("Link ảnh có ký (QĐ-198)", () => {
  const khoa = randomBytes(32);
  const ma = kyMaMedia({ tenantId: T, postId: P, attachmentId: A, hetHanGiay: 2_000_000_000 }, khoa);
  it("hợp lệ trước hạn, hết hạn sau hạn", () => {
    assert.ok(kiemMaMedia(ma, new Date(1_999_999_999_000), khoa).ok);
    const k = kiemMaMedia(ma, new Date(2_000_000_000_000), khoa);
    assert.ok(!k.ok && k.ly === "het-han");
  });
  it("sai khóa / sửa chữ ký / rác → từ chối", () => {
    assert.equal((kiemMaMedia(ma, new Date(0), randomBytes(32)) as { ly: string }).ly, "sai-chu-ky");
    assert.equal((kiemMaMedia("abc", new Date(0), khoa) as { ly: string }).ly, "sai-dang");
  });
});

describe("Thông tin app nền tảng (QĐ-199)", () => {
  it("định dạng Meta / Google / Zalo", () => {
    assert.equal(kiemDinhDang("META", { appId: "123456789012" }, "a".repeat(32)), null);
    assert.ok(kiemDinhDang("META", { appId: "abc" }, null));
    assert.ok(kiemDinhDang("META", {}, "ngan"));
    assert.equal(kiemDinhDang("GOOGLE", { clientId: "123-abc.apps.googleusercontent.com" }, "GOCSPX-abcdefghijklmnopqrst"), null);
    assert.ok(kiemDinhDang("GOOGLE", { clientId: "abc.apps.googleusercontent.com" }, null));
    assert.ok(kiemDinhDang("ZALO", { appId: "12" }, null));
  });
  it("URL cần dán sang nền tảng dựng từ APP_URL", () => {
    const u = urlCanDan("https://cowork.vi-du.vn/");
    assert.equal(u.tenMien, "cowork.vi-du.vn");
    assert.equal(u.callback.META, "https://cowork.vi-du.vn/api/cong-khai/mxh/oauth/meta/callback");
  });
});

describe("Quyền và Cấu hình mạng xã hội", () => {
  const quyen = (code: string) => VAI_TRO.find((v) => v.code === code)!.quyen as string[];
  it("Trợ lý AI không có mxh.*", () => {
    assert.ok(kiemTraGioiHanAI().dat);
    assert.ok(!quyen("ai-assistant").some((q) => q.startsWith("mxh.")));
  });
  it("Thực tập sinh: chỉ view + create; Marketing không duyệt; Trưởng phòng duyệt", () => {
    assert.deepEqual(quyen("marketing-intern").filter((q) => q.startsWith("mxh.")).sort(), ["mxh.create", "mxh.view"]);
    assert.ok(!quyen("marketing").includes("mxh.approve"));
    assert.ok(quyen("marketing-manager").includes("mxh.approve"));
  });
  it("khóa Cấu hình có mặc định an toàn", () => {
    assert.equal(timMuc("mxh.ai_phai_duyet")?.macDinh, 1);
    assert.equal(timMuc("mxh.han_link_media_phut")?.macDinh, 60);
    assert.ok(timMuc("mxh.so_lan_thu_toi_da") && timMuc("mxh.han_goi_giay") && timMuc("mxh.cho_doi_soat_giay") && timMuc("mxh.phut_ket_dang"));
  });
});
