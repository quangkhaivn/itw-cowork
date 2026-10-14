import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  cacCanhBaoVanHanh,
  cauLoiGon,
  danhGiaNhipWorker,
  danhGiaSaoLuu,
  demHongLienTiep,
  phutChoThuLai,
  quyetDinhThuLai,
  SO_LAN_THU_TOI_DA,
} from "../../src/modules/van-hanh/tinh-toan";
import { demVaKiem, KhoDemBoNho } from "../../src/lib/gioi-han-toc-do";
import { thanhBuoc } from "../../src/lib/api-nhieu-buoc";
import type { NguCanh } from "../../src/lib/api";

const GOC = new Date("2026-10-14T02:00:00Z");
const sau = (phut: number) => new Date(GOC.getTime() + phut * 60_000);

describe("Nhịp worker (QĐ-87)", () => {
  it("chưa từng có nhịp → chua-co; ≤ 5 phút → ok; > 5 phút → tre", () => {
    assert.equal(danhGiaNhipWorker(null, GOC), "chua-co");
    assert.equal(danhGiaNhipWorker(GOC, sau(5)), "ok");
    assert.equal(danhGiaNhipWorker(GOC, sau(5.1)), "tre");
    assert.equal(danhGiaNhipWorker(GOC, sau(9), 10), "ok");
  });
});

describe("Sao lưu (QĐ-88)", () => {
  it("chưa thành công lần nào → chua-co; quá 26 giờ → tre; lần cuối hỏng nhưng còn hạn → hong", () => {
    assert.equal(danhGiaSaoLuu(null, GOC), "chua-co");
    assert.equal(danhGiaSaoLuu({ lanCuoi: GOC, ok: false, lanThanhCongCuoi: null }, GOC), "chua-co");
    assert.equal(danhGiaSaoLuu({ lanCuoi: GOC, ok: true, lanThanhCongCuoi: GOC }, sau(26 * 60)), "ok");
    assert.equal(danhGiaSaoLuu({ lanCuoi: GOC, ok: true, lanThanhCongCuoi: GOC }, sau(26 * 60 + 1)), "tre");
    assert.equal(danhGiaSaoLuu({ lanCuoi: sau(60), ok: false, lanThanhCongCuoi: GOC }, sau(120)), "hong");
    // Quá hạn thì báo "trễ" dù lần cuối hỏng — mốc thành công mới là điều quan trọng.
    assert.equal(danhGiaSaoLuu({ lanCuoi: sau(27 * 60), ok: false, lanThanhCongCuoi: GOC }, sau(27 * 60)), "tre");
  });
});

describe("Thử lại bản quét có giãn cách (QĐ-86)", () => {
  it("giãn cách 15 → 30 → 60 → 120, trần 120 phút", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(phutChoThuLai), [0, 15, 30, 60, 120, 120, 120]);
  });
  it("chưa hỏng thì chạy; vừa hỏng thì chờ; qua giãn cách thì chạy; đủ 5 lần thì ngừng", () => {
    assert.equal(quyetDinhThuLai(0, null, GOC).chay, true);
    const cho = quyetDinhThuLai(1, GOC, sau(10));
    assert.equal(cho.chay, false);
    assert.match(cho.lyDo, /chờ thêm 5 phút/);
    assert.equal(quyetDinhThuLai(1, GOC, sau(15)).chay, true);
    assert.equal(quyetDinhThuLai(3, GOC, sau(59)).chay, false);
    assert.equal(quyetDinhThuLai(3, GOC, sau(60)).chay, true);
    const het = quyetDinhThuLai(SO_LAN_THU_TOI_DA, GOC, sau(10_000));
    assert.equal(het.chay, false);
    assert.equal(het.hetLuot, true);
  });
  it("đếm hỏng liên tiếp từ lần mới nhất, dừng ở lần thành công đầu tiên", () => {
    assert.equal(demHongLienTiep([]), 0);
    assert.equal(demHongLienTiep(["xong", "hong"]), 0);
    assert.equal(demHongLienTiep(["hong", "hong", "xong", "hong"]), 2);
  });
  it("câu lỗi gọn: cắt độ dài, che chuỗi kết nối CSDL", () => {
    assert.equal(cauLoiGon(new Error("x".repeat(900))).length, 500);
    assert.equal(cauLoiGon(new Error("hỏng postgresql://u:matkhau@db:5432/cowork")), "hỏng postgresql://…");
    assert.equal(cauLoiGon(""), "Lỗi không rõ.");
  });
});

describe("Băng cảnh báo màn hình Tự động hóa", () => {
  const dd = (d: Date) => d.toISOString();
  const tot = {
    worker: { trangThai: "ok" as const, lanCuoi: GOC },
    saoLuu: { trangThai: "ok" as const, lanCuoi: GOC, lanThanhCongCuoi: GOC, info: { raNgoai: "da-chep", env: "da-ma-hoa" } },
    quet: { hongLienTiep: 0, loiCuoi: null },
  };
  it("mọi thứ ổn → không có cảnh báo", () => {
    assert.deepEqual(cacCanhBaoVanHanh(tot, dd), []);
  });
  it("worker trễ, quét hỏng, sao lưu trễ, chưa chép ra ngoài, thử phục hồi hỏng → mỗi việc một dòng", () => {
    const ra = cacCanhBaoVanHanh(
      {
        worker: { trangThai: "tre", lanCuoi: GOC },
        saoLuu: { trangThai: "tre", lanCuoi: GOC, lanThanhCongCuoi: GOC, info: { raNgoai: "chua-cau-hinh", env: "bo-qua", loi: "pg_dump hỏng" } },
        quet: { hongLienTiep: 3, loiCuoi: "Transaction already closed" },
        thuPhucHoi: { lanCuoi: GOC, ok: false, info: { loi: "pg_restore" } },
      },
      dd,
    );
    assert.equal(ra.length, 5);
    assert.match(ra[0], /không báo nhịp từ 2026-10-14T02:00/);
    assert.match(ra[1], /3 lần liên tiếp.*Transaction already closed/);
    assert.match(ra[2], /quá 26 giờ.*pg_dump hỏng/);
    assert.match(ra[3], /RCLONE_REMOTE.*APP_ENC_KEY/);
    assert.match(ra[4], /thử phục hồi.*HỎNG/);
  });
});

describe("Giới hạn tốc độ khi Redis hỏng (QĐ-90)", () => {
  const hong = { tang: async () => { throw new Error("redis mất"); }, xoa: async () => {} };
  it("kho chính hỏng → đếm bằng bộ nhớ tiến trình, vẫn chặn khi vượt ngưỡng", async () => {
    const duPhong = new KhoDemBoNho();
    assert.equal((await demVaKiem("dn:1.2.3.4", 2, 60, hong, duPhong)).choPhep, true);
    assert.equal((await demVaKiem("dn:1.2.3.4", 2, 60, hong, duPhong)).choPhep, true);
    assert.equal((await demVaKiem("dn:1.2.3.4", 2, 60, hong, duPhong)).choPhep, false);
    assert.equal((await demVaKiem("dn:5.6.7.8", 2, 60, hong, duPhong)).choPhep, true);
  });
  it("cả kho dự phòng cũng hỏng → mới cho qua (không khóa cả công ty)", async () => {
    assert.equal((await demVaKiem("k", 1, 60, hong, hong)).choPhep, true);
  });
});

describe("Bước giao dịch (QĐ-89)", () => {
  it("thanhBuoc(NguCanh) chạy mọi bước trong chính ngữ cảnh đó; BuocGiaoDich giữ nguyên", async () => {
    const nc = { tenantId: "t" } as unknown as NguCanh;
    const nb = thanhBuoc(nc);
    assert.equal(await nb.giaoDich(async (x) => x), nc);
    assert.equal(thanhBuoc(nb), nb);
  });
});
