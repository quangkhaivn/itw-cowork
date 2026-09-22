/**
 * Kiểm thử đơn vị phần thuần của Tệp đính kèm.
 * Trọng tâm là **chặn tệp xấu** — đây là chỗ duy nhất trong hệ thống nhận byte
 * do người ngoài đưa vào và cất lên đĩa máy chủ.
 * Chạy: npm run thu:don-vi
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  dinhDangDungLuong,
  DUNG_LUONG_TOI_DA,
  duoiTep,
  duongDanHopLe,
  duongDanLuu,
  KIEU_CHO_PHEP,
  lamSachTenTep,
  LOAI_DOI_TUONG,
  NHAN_LOAI_DOI_TUONG,
  nhanDangTep,
  SO_TEP_TOI_DA,
} from "../../src/modules/dinh-kem/tinh-toan";

const byte = (...b: number[]) => new Uint8Array(b);
const PDF = byte(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const PNG = byte(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = byte(0xff, 0xd8, 0xff, 0xe0);
const ZIP = byte(0x50, 0x4b, 0x03, 0x04);

describe("Danh mục tệp đính kèm", () => {
  it("mọi loại chứng từ nhận đính kèm đều có nhãn tiếng Việt", () => {
    for (const l of LOAI_DOI_TUONG) assert.ok(NHAN_LOAI_DOI_TUONG[l], l);
  });
  it("danh sách trắng KHÔNG có SVG, HTML hay zip", () => {
    const mime = KIEU_CHO_PHEP.map((k) => k.mime);
    for (const cam of ["image/svg+xml", "text/html", "application/zip", "application/x-msdownload"]) {
      assert.ok(!mime.includes(cam), cam);
    }
    const duoi = KIEU_CHO_PHEP.flatMap((k) => k.duoi);
    for (const cam of ["svg", "html", "htm", "zip", "exe", "js"]) {
      assert.ok(!duoi.includes(cam), cam);
    }
  });
  it("trần kỹ thuật là con số cụ thể, không phải vô hạn", () => {
    assert.equal(DUNG_LUONG_TOI_DA, 20 * 1024 * 1024);
    assert.ok(SO_TEP_TOI_DA > 0 && SO_TEP_TOI_DA <= 100);
  });
});

describe("Nhận dạng kiểu tệp theo nội dung", () => {
  it("tệp đúng đuôi và đúng nội dung thì nhận", () => {
    assert.equal(nhanDangTep("hoa-don.pdf", PDF).mime, "application/pdf");
    assert.equal(nhanDangTep("anh.png", PNG).mime, "image/png");
    assert.equal(nhanDangTep("anh.JPG", JPEG).mime, "image/jpeg");
  });
  it("đuôi không có trong danh sách trắng thì từ chối", () => {
    const kq = nhanDangTep("chay.exe", byte(0x4d, 0x5a));
    assert.equal(kq.hopLe, false);
    assert.ok(kq.lyDo?.includes("Không nhận tệp .exe"));
  });
  it("SVG bị từ chối — đó là mã chạy được, không phải tài liệu", () => {
    assert.equal(nhanDangTep("logo.svg", byte(0x3c, 0x73, 0x76, 0x67)).hopLe, false);
  });
  it("TỆP ĐỘI LỐT: đặt tên .pdf nhưng nội dung là thứ khác thì chặn", () => {
    const kq = nhanDangTep("that-su-la-exe.pdf", byte(0x4d, 0x5a, 0x90, 0x00));
    assert.equal(kq.hopLe, false);
    assert.ok(kq.lyDo?.includes("không phải PDF"));
  });
  it("đổi đuôi ảnh thành .png nhưng byte đầu là JPEG cũng bị chặn", () => {
    assert.equal(nhanDangTep("anh.png", JPEG).hopLe, false);
  });
  it("docx và xlsx đều là gói zip nên nhận cùng byte đầu", () => {
    assert.equal(nhanDangTep("hop-dong.docx", ZIP).mime?.includes("wordprocessingml"), true);
    assert.equal(nhanDangTep("bang-gia.xlsx", ZIP).mime?.includes("spreadsheetml"), true);
  });
  it("tệp văn bản không nhận dạng được bằng byte nên chỉ xét đuôi", () => {
    assert.equal(nhanDangTep("ghi-chu.txt", byte(0x41, 0x42)).mime, "text/plain");
    assert.equal(nhanDangTep("danh-sach.csv", byte(0xff, 0xfe)).mime, "text/csv");
  });
  it("không có đuôi thì từ chối", () => {
    assert.equal(nhanDangTep("khong-duoi", PDF).hopLe, false);
  });
  it("tệp rỗng byte đầu vẫn bị chặn nếu kiểu cần nhận dạng", () => {
    assert.equal(nhanDangTep("rong.pdf", byte()).hopLe, false);
  });
});

describe("Làm sạch tên tệp", () => {
  it("bỏ đường dẫn, chỉ giữ tên", () => {
    assert.equal(lamSachTenTep("../../etc/passwd.txt"), "passwd.txt");
    assert.equal(lamSachTenTep("C:\\Users\\Khai\\hoa-don.pdf"), "hoa-don.pdf");
  });
  it("bỏ ký tự điều khiển và dấu nháy — hai thứ bẻ được tiêu đề HTTP", () => {
    assert.equal(lamSachTenTep('hoa"don\r\n.pdf'), "hoadon.pdf");
  });
  it("tên toàn dấu chấm không thành tệp ẩn", () => {
    assert.equal(lamSachTenTep("...."), "tep-khong-ten");
    assert.equal(lamSachTenTep(".env"), "env");
  });
  it("giữ nguyên tiếng Việt có dấu", () => {
    assert.equal(lamSachTenTep("hóa đơn tháng 9.pdf"), "hóa đơn tháng 9.pdf");
  });
  it("tên rỗng vẫn ra một tên dùng được", () => {
    assert.equal(lamSachTenTep(""), "tep-khong-ten");
    assert.equal(lamSachTenTep("   "), "tep-khong-ten");
  });
  it("cắt bớt tên quá dài", () => {
    assert.ok(lamSachTenTep("a".repeat(500)).length <= 200);
  });
});

describe("Đường dẫn lưu trên đĩa", () => {
  const tenant = "11111111-1111-4111-8111-111111111111";
  const id = "22222222-2222-4222-8222-222222222222";

  it("chia theo tenant, năm và tháng", () => {
    const d = duongDanLuu(tenant, id, "hoa-don.pdf", new Date("2026-09-21T10:00:00Z"));
    assert.equal(d, `${tenant}/2026/09/${id}.pdf`);
  });
  it("tên trên đĩa là id hệ thống sinh, KHÔNG phải tên người dùng đặt", () => {
    const d = duongDanLuu(tenant, id, "../../.env", new Date("2026-01-05T00:00:00Z"));
    assert.ok(d.includes(id));
    assert.ok(!d.includes(".."));
  });
  it("đường dẫn đúng khuôn thì hợp lệ", () => {
    assert.equal(duongDanHopLe(`${tenant}/2026/09/${id}.pdf`), true);
    assert.equal(duongDanHopLe(`${tenant}/2026/09/${id}`), true);
  });
  it("mọi kiểu thoát thư mục đều bị chặn", () => {
    for (const xau of [
      "../../etc/passwd",
      `${tenant}/../../../etc/passwd`,
      `${tenant}/2026/09/../../../.env`,
      "/etc/passwd",
      `${tenant}\\2026\\09\\${id}.pdf`,
      `${tenant}/2026/09/${id}.pdf/../../x`,
    ]) {
      assert.equal(duongDanHopLe(xau), false, xau);
    }
  });
});

describe("Dung lượng cho người đọc", () => {
  it("byte, KB, MB", () => {
    assert.equal(dinhDangDungLuong(512), "512 B");
    assert.equal(dinhDangDungLuong(2048), "2 KB");
    assert.equal(dinhDangDungLuong(1468006), "1,4 MB");
  });
  it("đuôi tệp đọc được cả khi tên có nhiều dấu chấm", () => {
    assert.equal(duoiTep("bao.cao.thang.9.xlsx"), "xlsx");
    assert.equal(duoiTep("khongduoi"), "");
  });
});
