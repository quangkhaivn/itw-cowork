import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  CAU_VUOT_TRAN,
  TOI_DA_KY_TU_KET_QUA,
  TOI_DA_VONG,
  catGon,
  cauBaoLoiCongCu,
  datTenHoiThoai,
  gopVanBan,
  ketQuaSangVanBan,
  loiNhacHeThong,
  tomTatLuot,
} from "../../src/modules/tro-ly/tinh-toan";
import { LOAI_HANH_DONG, timLoaiHanhDong } from "../../src/modules/tro-ly/de-xuat";
import { SO_CONG_CU, congCuChoNguoi, timCongCu } from "../../src/modules/tro-ly/cong-cu";
import { tinhTrangAI } from "../../src/modules/tro-ly/nha-cung-cap";

describe("Cắt gọn kết quả công cụ", () => {
  it("ngắn thì giữ nguyên", () => {
    assert.equal(catGon("abc", 10), "abc");
  });

  it("dài thì cắt và NÓI RÕ đã cắt bao nhiêu", () => {
    const kq = catGon("x".repeat(50), 10);
    assert.ok(kq.startsWith("x".repeat(10)));
    assert.match(kq, /đã cắt bớt 40 ký tự/);
  });

  it("trần mặc định đủ lớn để không cắt một danh sách bình thường", () => {
    assert.ok(TOI_DA_KY_TU_KET_QUA >= 4000);
  });

  it("kết quả không chuyển được sang JSON thì báo rõ, không ném lỗi", () => {
    const vong: Record<string, unknown> = {};
    vong.tu = vong;
    assert.match(ketQuaSangVanBan(vong), /không chuyển được/);
  });

  it("null vẫn ra chuỗi hợp lệ", () => {
    assert.equal(ketQuaSangVanBan(null), "null");
  });
});

describe("Câu báo lỗi công cụ gửi cho mô hình", () => {
  it("thiếu quyền thì dặn mô hình ĐỪNG đoán số liệu", () => {
    const c = cauBaoLoiCongCu("thieu-quyen", "customer.view");
    assert.match(c, /KHÔNG CÓ QUYỀN/);
    assert.match(c, /đừng đoán số liệu/i);
  });

  it("tham số sai thì mời gọi lại cho đúng", () => {
    assert.match(cauBaoLoiCongCu("tham-so-sai", "thiếu tuKhoa"), /gọi lại|hỏi lại/i);
  });

  it("lỗi chung cũng dặn không đoán", () => {
    assert.match(cauBaoLoiCongCu("loi", "mất kết nối"), /đừng đoán/i);
  });
});

describe("Lời nhắc hệ thống", () => {
  const nhac = loiNhacHeThong({ hoTen: "Nguyễn Văn An", vaiTro: ["Nhân viên Kinh doanh"] }, "2026-09-21");

  it("nêu tên và vai trò người đang hỏi", () => {
    assert.match(nhac, /Nguyễn Văn An/);
    assert.match(nhac, /Nhân viên Kinh doanh/);
  });

  it("cấm bịa số liệu", () => {
    assert.match(nhac, /không nhớ ra, không suy ra/i);
  });

  it("cấm tự thay đổi dữ liệu", () => {
    assert.match(nhac, /KHÔNG tự thay đổi dữ liệu/);
  });

  it("dặn nói rõ khi kết quả rỗng có thể do thiếu quyền", () => {
    assert.match(nhac, /không được xem/);
  });

  it("không có vai trò nào thì vẫn ra câu hợp lệ", () => {
    const n = loiNhacHeThong({ hoTen: "Ai Đó", vaiTro: [] }, "2026-09-21");
    assert.match(n, /Ai Đó/);
    assert.doesNotMatch(n, /\(\)/);
  });
});

describe("Đặt tên hội thoại", () => {
  it("câu ngắn thì giữ nguyên", () => {
    assert.equal(datTenHoiThoai("Khách nào nợ nhiều nhất?"), "Khách nào nợ nhiều nhất?");
  });

  it("câu dài thì cắt kèm dấu ba chấm", () => {
    const t = datTenHoiThoai("a".repeat(200));
    assert.equal(t.length, 80);
    assert.ok(t.endsWith("…"));
  });

  it("gộp khoảng trắng và xuống dòng", () => {
    assert.equal(datTenHoiThoai("  hỏi\n\n  gì   đó  "), "hỏi gì đó");
  });

  it("rỗng thì có tên mặc định", () => {
    assert.equal(datTenHoiThoai("   "), "Hội thoại mới");
  });
});

describe("Gộp văn bản trả lời", () => {
  it("chỉ lấy khối văn bản, bỏ khối gọi công cụ", () => {
    const s = gopVanBan([
      { loai: "van-ban", noiDung: "Câu một." },
      { loai: "goi-cong-cu" },
      { loai: "van-ban", noiDung: "Câu hai." },
    ]);
    assert.equal(s, "Câu một.\n\nCâu hai.");
  });

  it("không có khối văn bản nào thì trả chuỗi rỗng", () => {
    assert.equal(gopVanBan([{ loai: "goi-cong-cu" }]), "");
  });
});

describe("Tóm tắt một lượt", () => {
  it("đếm đúng số gọi hỏng", () => {
    const t = tomTatLuot(2, [{ ketCuc: "ok" }, { ketCuc: "thieu-quyen" }, { ketCuc: "loi" }]);
    assert.equal(t.soGoiCongCu, 3);
    assert.equal(t.soGoiHong, 2);
    assert.equal(t.vuotTran, false);
  });

  it("chạm trần thì đánh dấu vượt trần", () => {
    assert.equal(tomTatLuot(TOI_DA_VONG, []).vuotTran, true);
  });

  it("câu vượt trần nói thật là đã dừng, không giả vờ đã xong", () => {
    assert.match(CAU_VUOT_TRAN, /dừng ở đây thay vì đoán/);
  });
});

describe("Sổ công cụ", () => {
  it("tên công cụ không trùng nhau", () => {
    assert.equal(new Set(SO_CONG_CU.map((c) => c.ten)).size, SO_CONG_CU.length);
  });

  it("mọi công cụ đều khai một quyền cụ thể", () => {
    for (const c of SO_CONG_CU) {
      assert.match(c.quyen, /^[a-z_]+\.[a-z]+$/, `${c.ten} khai quyền lạ: ${c.quyen}`);
    }
  });

  it("mọi công cụ đều có mô tả đủ dài để mô hình chọn đúng", () => {
    for (const c of SO_CONG_CU) assert.ok(c.moTa.length > 30, `${c.ten} mô tả quá ngắn`);
  });

  it("lược đồ JSON của công cụ luôn là object và cấm thuộc tính lạ", () => {
    for (const c of SO_CONG_CU) {
      assert.equal((c.luocDoJson as { type: string }).type, "object", c.ten);
      assert.equal((c.luocDoJson as { additionalProperties: boolean }).additionalProperties, false, c.ten);
    }
  });

  it("timCongCu tra đúng và trả undefined khi không có", () => {
    assert.equal(timCongCu("tim_khach_hang")?.ten, "tim_khach_hang");
    assert.equal(timCongCu("khong_co_that"), undefined);
  });

  it("người không có quyền nào thì KHÔNG nhận được công cụ nào", () => {
    assert.equal(congCuChoNguoi({ quyen: new Set<string>() }).length, 0);
  });

  it("chỉ nhận công cụ khớp đúng quyền đang có", () => {
    const ds = congCuChoNguoi({ quyen: new Set(["customer.view"]) });
    assert.ok(ds.length > 0);
    assert.ok(ds.every((c) => c.quyen === "customer.view"));
  });
});

describe("Loại hành động đề xuất", () => {
  it("mã không trùng nhau", () => {
    assert.equal(new Set(LOAI_HANH_DONG.map((l) => l.ma)).size, LOAI_HANH_DONG.length);
  });

  it("mỗi loại đều đòi một quyền TẠO, không phải quyền xem", () => {
    for (const l of LOAI_HANH_DONG) {
      assert.match(l.quyen, /\.(create|update)$/, `${l.ma} đòi quyền lạ: ${l.quyen}`);
    }
  });

  it("không loại nào đòi quyền duyệt hay xóa — trợ lý không chạm tới hai thứ đó", () => {
    for (const l of LOAI_HANH_DONG) {
      assert.doesNotMatch(l.quyen, /\.(approve|delete)$/, l.ma);
    }
  });

  it("tóm tắt đọc được thành câu tiếng Việt", () => {
    const bg = timLoaiHanhDong("tao-nhap-bao-gia")!;
    const s = bg.tomTat({ dong: [{ ten: "Laptop Dell" }, { ten: "Chuột không dây" }] });
    assert.match(s, /2 dòng hàng/);
    assert.match(s, /Laptop Dell/);
  });

  it("tóm tắt việc nêu cả hạn khi có", () => {
    const v = timLoaiHanhDong("tao-viec")!;
    assert.match(v.tomTat({ tieuDe: "Gọi khách", han: "2026-09-25T09:00:00+07:00" }), /hạn/);
    assert.doesNotMatch(v.tomTat({ tieuDe: "Gọi khách" }), /hạn/);
  });
});

describe("Tình trạng cấu hình AI", () => {
  it("không có khóa API thì KHÔNG coi là đã cấu hình, và nói rõ thiếu gì", () => {
    const cu = process.env.ANTHROPIC_API_KEY;
    const cuNcc = process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_PROVIDER;
    try {
      const tt = tinhTrangAI();
      assert.equal(tt.daCauHinh, false);
      assert.match(tt.lyDo, /ANTHROPIC_API_KEY/);
    } finally {
      if (cu !== undefined) process.env.ANTHROPIC_API_KEY = cu;
      if (cuNcc !== undefined) process.env.AI_PROVIDER = cuNcc;
    }
  });

  it("nhà cung cấp lạ thì từ chối, không âm thầm rơi về mặc định", () => {
    const cu = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = "mot-hang-nao-do";
    try {
      const tt = tinhTrangAI();
      assert.equal(tt.daCauHinh, false);
      assert.match(tt.lyDo, /Chưa hỗ trợ/);
    } finally {
      if (cu === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = cu;
    }
  });
});
