/**
 * Kiểm thử đơn vị TOTP (RFC 6238) và mã hóa bí mật (AES-256-GCM).
 * Vector chuẩn lấy nguyên văn từ RFC 4226 phụ lục D và RFC 6238 phụ lục B.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  base32Giai,
  base32Ma,
  buocThoiGian,
  chuanHoaMaKhoiPhuc,
  hotp,
  kiemMaTotp,
  nhomKhoa,
  sinhKhoaTotp,
  sinhMaKhoiPhuc,
  totp,
  uriOtpauth,
} from "../../src/lib/totp";
import { bangNhau, docKhoa, giaiMa, hmac, khoaCon, maHoa } from "../../src/lib/ma-hoa";

const SEED_SHA1 = Buffer.from("12345678901234567890", "ascii");
const SEED_SHA256 = Buffer.from("12345678901234567890123456789012", "ascii");
const SEED_SHA512 = Buffer.from("1234567890123456789012345678901234567890123456789012345678901234", "ascii");

describe("HOTP — RFC 4226 phụ lục D", () => {
  const mongDoi = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  mongDoi.forEach((ma, dem) => {
    it(`bộ đếm ${dem} → ${ma}`, () => assert.equal(hotp(SEED_SHA1, dem), ma));
  });
});

describe("TOTP — RFC 6238 phụ lục B (8 chữ số)", () => {
  const bang: [number, string, string, string][] = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];
  for (const [t, sha1, sha256, sha512] of bang) {
    it(`T=${t}`, () => {
      assert.equal(totp(SEED_SHA1, t * 1000, 8, "sha1"), sha1);
      assert.equal(totp(SEED_SHA256, t * 1000, 8, "sha256"), sha256);
      assert.equal(totp(SEED_SHA512, t * 1000, 8, "sha512"), sha512);
    });
  }
});

describe("Base32 (RFC 4648)", () => {
  it("mã hóa đúng vector chuẩn", () => {
    assert.equal(base32Ma(Buffer.from("foobar")), "MZXW6YTBOI");
    assert.equal(base32Ma(Buffer.from("f")), "MY");
  });
  it("giải mã ngược lại, bỏ qua khoảng trắng / chữ thường / dấu =", () => {
    assert.equal(base32Giai("mzxw 6ytb oi==").toString(), "foobar");
  });
  it("khóa 20 byte bất kỳ đi về nguyên vẹn", () => {
    for (let i = 0; i < 20; i++) {
      const b = randomBytes(20);
      assert.ok(base32Giai(base32Ma(b)).equals(b));
    }
  });
  it("ký tự lạ bị từ chối", () => assert.throws(() => base32Giai("ABC1")));
});

describe("Kiểm mã 6 số", () => {
  const khoa = base32Ma(SEED_SHA1);
  const luc = 1_700_000_000_000;
  const ma = totp(SEED_SHA1, luc);
  it("mã đúng trả về bước khớp", () => assert.equal(kiemMaTotp(khoa, ma, { bayGio: luc }), buocThoiGian(luc)));
  it("chấp nhận lệch ±30 giây", () => {
    assert.notEqual(kiemMaTotp(khoa, ma, { bayGio: luc + 30_000 }), null);
    assert.notEqual(kiemMaTotp(khoa, ma, { bayGio: luc - 30_000 }), null);
  });
  it("lệch quá 1 bước thì từ chối", () => assert.equal(kiemMaTotp(khoa, ma, { bayGio: luc + 90_000 }), null));
  it("mã đã dùng (bước ≤ bước đã dùng) bị từ chối — chống phát lại", () => {
    assert.equal(kiemMaTotp(khoa, ma, { bayGio: luc, buocDaDung: buocThoiGian(luc) }), null);
  });
  it("sai dạng bị từ chối", () => {
    assert.equal(kiemMaTotp(khoa, "12345", { bayGio: luc }), null);
    assert.equal(kiemMaTotp(khoa, "abcdef", { bayGio: luc }), null);
  });
  it("chấp nhận khoảng trắng giữa mã", () => assert.notEqual(kiemMaTotp(khoa, `${ma.slice(0, 3)} ${ma.slice(3)}`, { bayGio: luc }), null));
});

describe("Khóa, URI, mã khôi phục", () => {
  it("khóa mới 160 bit = 32 ký tự base32, không lặp", () => {
    const a = sinhKhoaTotp();
    assert.match(a, /^[A-Z2-7]{32}$/);
    assert.notEqual(a, sinhKhoaTotp());
  });
  it("URI otpauth đúng dạng Google Authenticator", () => {
    const u = uriOtpauth("JBSWY3DPEHPK3PXP", "a@b.vn", "TGTH Cowork");
    assert.equal(u, "otpauth://totp/TGTH%20Cowork:a%40b.vn?secret=JBSWY3DPEHPK3PXP&issuer=TGTH%20Cowork&algorithm=SHA1&digits=6&period=30");
  });
  it("nhóm khóa 4 ký tự", () => assert.equal(nhomKhoa("ABCDEFGHIJ"), "ABCD EFGH IJ"));
  it("10 mã khôi phục dạng XXXXX-XXXXX, không trùng", () => {
    const ds = sinhMaKhoiPhuc();
    assert.equal(ds.length, 10);
    assert.equal(new Set(ds).size, 10);
    for (const m of ds) assert.match(m, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });
  it("chuẩn hóa mã khôi phục người gõ", () => assert.equal(chuanHoaMaKhoiPhuc(" abcde-fghij "), "ABCDEFGHIJ"));
});

describe("Mã hóa bí mật (APP_ENC_KEY)", () => {
  const khoa = randomBytes(32);
  it("mã hóa rồi giải mã đúng, chuỗi lưu có tiền tố v1 và không chứa bản rõ", () => {
    const ma = maHoa("mat-khau-smtp-123", "smtp:t1", khoa);
    assert.match(ma, /^v1:/);
    assert.ok(!ma.includes("mat-khau"));
    assert.equal(giaiMa(ma, "smtp:t1", khoa), "mat-khau-smtp-123");
  });
  it("mỗi lần mã hóa ra chuỗi khác (IV ngẫu nhiên)", () => assert.notEqual(maHoa("x", "c", khoa), maHoa("x", "c", khoa)));
  it("sai ngữ cảnh (chép sang dòng khác) → giải mã hỏng", () => assert.throws(() => giaiMa(maHoa("x", "totp:a", khoa), "totp:b", khoa)));
  it("sai khóa → giải mã hỏng", () => assert.throws(() => giaiMa(maHoa("x", "c", khoa), "c", randomBytes(32))));
  it("sửa một ký tự bản mã → hỏng (GCM kiểm toàn vẹn)", () => {
    const ma = maHoa("bi-mat", "c", khoa);
    const sua = ma.slice(0, -2) + (ma.at(-2) === "A" ? "B" : "A") + ma.at(-1);
    assert.throws(() => giaiMa(sua, "c", khoa));
  });
  it("khóa thiếu hoặc sai độ dài bị từ chối rõ ràng", () => {
    assert.throws(() => docKhoa(""), /APP_ENC_KEY/);
    assert.throws(() => docKhoa(Buffer.alloc(16).toString("base64")), /32 byte/);
    assert.equal(docKhoa(khoa.toString("base64")).length, 32);
  });
  it("khóa con theo mục đích khác nhau", () => assert.ok(!khoaCon("a", khoa).equals(khoaCon("b", khoa))));
  it("HMAC và so sánh thời gian hằng", () => {
    const a = hmac("x", "du-lieu", khoa);
    assert.ok(bangNhau(a, hmac("x", "du-lieu", khoa)));
    assert.ok(!bangNhau(a, hmac("y", "du-lieu", khoa)));
    assert.ok(!bangNhau(a, a.subarray(0, 10)));
  });
});
