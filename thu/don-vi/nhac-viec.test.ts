import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  cauTomTatHangNgay,
  congNgay,
  congThang,
  daToiGioChay,
  demQuyTacSanSang,
  kiemTraDieuKien,
  kyBaoTriKeTiep,
  mocQuaHan,
  sapXepViec,
  soNgayGiua,
  tinhTrangBaoTri,
  tomTatViec,
} from "../../src/modules/nhac-viec/tinh-toan";
import { QUY_TAC, timQuyTac } from "../../src/modules/nhac-viec/quy-tac";

describe("Ngày tháng của nhắc việc", () => {
  it("soNgayGiua đếm đúng chiều", () => {
    assert.equal(soNgayGiua("2026-09-01", "2026-09-21"), 20);
    assert.equal(soNgayGiua("2026-09-21", "2026-09-01"), -20);
    assert.equal(soNgayGiua("2026-09-21", "2026-09-21"), 0);
  });

  it("soNgayGiua qua mốc cuối tháng và cuối năm", () => {
    assert.equal(soNgayGiua("2026-01-31", "2026-02-01"), 1);
    assert.equal(soNgayGiua("2025-12-31", "2026-01-01"), 1);
  });

  it("congNgay cộng và trừ", () => {
    assert.equal(congNgay("2026-09-21", 10), "2026-10-01");
    assert.equal(congNgay("2026-03-01", -1), "2026-02-28");
  });

  it("congThang kẹp về ngày cuối tháng khi tháng đích ngắn hơn", () => {
    assert.equal(congThang("2026-01-31", 1), "2026-02-28");
    assert.equal(congThang("2026-01-31", 3), "2026-04-30");
    assert.equal(congThang("2026-03-15", 3), "2026-06-15");
  });

  it("congThang lùi tháng, qua năm", () => {
    assert.equal(congThang("2026-01-15", -1), "2025-12-15");
    assert.equal(congThang("2026-01-15", -13), "2024-12-15");
  });

  it("mocQuaHan lùi đúng số ngày", () => {
    assert.equal(mocQuaHan("2026-09-21", 7), "2026-09-14");
  });
});

describe("Kỳ bảo trì định kỳ", () => {
  it("chưa bảo trì lần nào thì kỳ đầu là ngày bắt đầu hợp đồng", () => {
    assert.equal(kyBaoTriKeTiep("2026-01-01", "2026-12-31", 3, null), "2026-01-01");
  });

  it("đã bảo trì thì kỳ sau cộng theo chu kỳ", () => {
    assert.equal(kyBaoTriKeTiep("2026-01-01", "2026-12-31", 3, "2026-01-05"), "2026-04-05");
  });

  it("vượt ngày kết thúc thì KHÔNG còn kỳ nào", () => {
    assert.equal(kyBaoTriKeTiep("2026-01-01", "2026-06-30", 3, "2026-05-01"), null);
  });

  it("kỳ rơi đúng ngày kết thúc thì vẫn tính là còn", () => {
    assert.equal(kyBaoTriKeTiep("2026-01-01", "2026-04-01", 3, "2026-01-01"), "2026-04-01");
  });

  it("chu kỳ 0 hoặc âm thì không sinh kỳ", () => {
    assert.equal(kyBaoTriKeTiep("2026-01-01", "2026-12-31", 0, null), null);
  });
});

describe("Tình trạng hợp đồng bảo trì", () => {
  it("hợp đồng không hiệu lực thì không theo dõi", () => {
    assert.equal(tinhTrangBaoTri("tam-dung", "2026-09-21", "2026-09-21"), "khong-theo-doi");
    assert.equal(tinhTrangBaoTri("huy", "2026-09-21", "2026-09-21"), "khong-theo-doi");
  });

  it("không còn kỳ nào thì là hết hạn", () => {
    assert.equal(tinhTrangBaoTri("hieu-luc", null, "2026-09-21"), "het-han");
  });

  it("đúng ngày là tới kỳ, qua ngày là trễ kỳ", () => {
    assert.equal(tinhTrangBaoTri("hieu-luc", "2026-09-21", "2026-09-21"), "den-ky");
    assert.equal(tinhTrangBaoTri("hieu-luc", "2026-09-20", "2026-09-21"), "tre-ky");
  });

  it("chưa tới ngày và chưa đặt ngưỡng nhắc sớm thì vẫn đúng lịch", () => {
    assert.equal(tinhTrangBaoTri("hieu-luc", "2026-09-30", "2026-09-21"), "cho-ky-sau");
  });

  it("có ngưỡng nhắc sớm thì vào tầm ngưỡng đã là tới kỳ", () => {
    assert.equal(tinhTrangBaoTri("hieu-luc", "2026-09-30", "2026-09-21", 14), "den-ky");
    assert.equal(tinhTrangBaoTri("hieu-luc", "2026-10-30", "2026-09-21", 14), "cho-ky-sau");
  });
});

describe("Điều kiện chạy quy tắc — chưa đặt ngưỡng thì KHÔNG quét", () => {
  const coNguong = timQuyTac("bao-gia-cho-phan-hoi")!;
  const khongNguong = timQuyTac("viec-qua-han")!;

  it("quy tắc đang tắt thì không chạy", () => {
    const kq = kiemTraDieuKien(coNguong, false, 7);
    assert.equal(kq.chay, false);
    assert.match(kq.lyDoBoQua, /tắt/);
  });

  it("quy tắc cần ngưỡng mà chưa đặt thì không chạy, và nói rõ thiếu gì", () => {
    const kq = kiemTraDieuKien(coNguong, true, null);
    assert.equal(kq.chay, false);
    assert.equal(kq.nguong, null);
    assert.equal(kq.lyDoBoQua, coNguong.thieuNguong);
  });

  it("ngưỡng bằng 0 cũng không quét — không tự đoán thành một con số khác", () => {
    const kq = kiemTraDieuKien(coNguong, true, 0);
    assert.equal(kq.chay, false);
    assert.match(kq.lyDoBoQua, /0/);
  });

  it("đủ ngưỡng thì chạy", () => {
    const kq = kiemTraDieuKien(coNguong, true, 7);
    assert.equal(kq.chay, true);
    assert.equal(kq.nguong, 7);
  });

  it("quy tắc không cần ngưỡng thì bật là chạy", () => {
    assert.equal(kiemTraDieuKien(khongNguong, true, null).chay, true);
  });

  it("demQuyTacSanSang đếm đúng số quy tắc đang canh", () => {
    const khong = demQuyTacSanSang(QUY_TAC.map((q) => ({ ma: q.ma, bat: true, nguong: null })));
    const soKhongCanNguong = QUY_TAC.filter((q) => q.khoaNguong === null).length;
    assert.equal(khong.sanSang, soKhongCanNguong);
    assert.equal(khong.tong, QUY_TAC.length);

    const du = demQuyTacSanSang(QUY_TAC.map((q) => ({ ma: q.ma, bat: true, nguong: 7 })));
    assert.equal(du.sanSang, QUY_TAC.length);
  });
});

describe("Tóm tắt và sắp xếp việc hôm nay", () => {
  const ds = [
    { mucDo: "thong-tin", trangThai: "mo", maQuyTac: "khach-lau-chua-mua-lai", tieuDe: "B" },
    { mucDo: "khan", trangThai: "mo", maQuyTac: "viec-qua-han", tieuDe: "A" },
    { mucDo: "canh-bao", trangThai: "mo", maQuyTac: "co-hoi-khong-hoat-dong", tieuDe: "C" },
    { mucDo: "khan", trangThai: "xong", maQuyTac: "cong-no-qua-han", tieuDe: "D" },
    { mucDo: "canh-bao", trangThai: "bo-qua", maQuyTac: "bao-gia-cho-phan-hoi", tieuDe: "E" },
  ];

  it("chỉ đếm mức độ cho việc CÒN MỞ", () => {
    const t = tomTatViec(ds);
    assert.equal(t.tong, 5);
    assert.equal(t.mo, 3);
    assert.equal(t.xong, 1);
    assert.equal(t.boQua, 1);
    assert.equal(t.khan, 1);
    assert.equal(t.canhBao, 1);
    assert.equal(t.thongTin, 1);
  });

  it("việc gấp xếp lên trước", () => {
    const xep = sapXepViec(ds);
    assert.equal(xep[0].mucDo, "khan");
    assert.equal(xep.at(-1)!.mucDo, "thong-tin");
  });

  it("sapXepViec không sửa mảng gốc", () => {
    const truoc = ds.map((v) => v.tieuDe).join("");
    sapXepViec(ds);
    assert.equal(ds.map((v) => v.tieuDe).join(""), truoc);
  });
});

describe("Câu tóm tắt cho chuông", () => {
  it("không có việc nào đang mở thì KHÔNG rung chuông", () => {
    assert.equal(cauTomTatHangNgay(tomTatViec([])), "");
    assert.equal(cauTomTatHangNgay(tomTatViec([{ mucDo: "khan", trangThai: "xong" }])), "");
  });

  it("chỉ nêu những mức độ thật sự có", () => {
    const cau = cauTomTatHangNgay(tomTatViec([{ mucDo: "khan", trangThai: "mo" }]));
    assert.match(cau, /1 việc gấp/);
    assert.doesNotMatch(cau, /cần để ý/);
  });

  it("nêu đủ ba mức khi có cả ba", () => {
    const cau = cauTomTatHangNgay(
      tomTatViec([
        { mucDo: "khan", trangThai: "mo" },
        { mucDo: "canh-bao", trangThai: "mo" },
        { mucDo: "thong-tin", trangThai: "mo" },
      ]),
    );
    assert.match(cau, /1 việc gấp/);
    assert.match(cau, /1 việc cần để ý/);
    assert.match(cau, /1 việc chăm sóc/);
  });
});

describe("Giờ chạy bản quét", () => {
  it("chưa tới giờ thì chưa chạy", () => {
    assert.equal(daToiGioChay(6, 7), false);
  });

  it("đúng giờ và sau giờ thì chạy", () => {
    assert.equal(daToiGioChay(7, 7), true);
    assert.equal(daToiGioChay(23, 7), true);
  });
});

describe("Danh mục quy tắc", () => {
  it("mã quy tắc không trùng nhau", () => {
    assert.equal(new Set(QUY_TAC.map((q) => q.ma)).size, QUY_TAC.length);
  });

  it("quy tắc cần ngưỡng thì phải có câu giải thích khi thiếu", () => {
    for (const q of QUY_TAC) {
      if (q.khoaNguong !== null) assert.ok(q.thieuNguong.length > 10, `${q.ma} thiếu câu giải thích`);
    }
  });

  it("mọi quy tắc đều có mức độ hợp lệ", () => {
    for (const q of QUY_TAC) {
      assert.ok(["thong-tin", "canh-bao", "khan"].includes(q.mucDo), `${q.ma} sai mức độ`);
    }
  });
});
