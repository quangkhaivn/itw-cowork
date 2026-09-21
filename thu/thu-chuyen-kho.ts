import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { doiSoatKho, nhapKho, suaKho, taoKho, tonKho } from "../src/modules/kho/service";
import { LuocDoNhapKho, LuocDoSuaKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import {
  chiTietChuyenKho,
  danhSachChuyenKho,
  huyChuyenKho,
  nhanChuyenKho,
  taoChuyenKho,
  xuatChuyenKho,
} from "../src/modules/chuyen-kho/service";
import {
  LuocDoHuyChuyenKho,
  LuocDoNhanChuyenKho,
  LuocDoTaoChuyenKho,
  LuocDoXuatChuyenKho,
} from "../src/modules/chuyen-kho/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng chuyển kho nội bộ trên CSDL THẬT.
 * Luật: BUSINESS_RULES.md mục 19 (CK-01 → CK-06).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-chuyen-kho"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "dinh-dang" ? e instanceof LoiDinhDang
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function ton(tenantId: string, userId: string, khoId: string, sanPhamId: string): Promise<number> {
  const kq = await voi(tenantId, userId, (nc) => tonKho(nc, { q: "", kho: khoId, canhBao: "", trang: 1, coTrang: 100 }));
  return kq.dong.find((d) => d.sanPham.id === sanPhamId)?.tonKho ?? 0;
}

async function main() {
  console.log("=== Thử Chuyển kho nội bộ ===\n");
  const tenant = await seedNenMong(chu, `thu-ck-${DAU}`, "Doanh nghiệp thử chuyển kho");
  const T = tenant.id;

  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const nguoi = async (ten: string, vai: string) =>
    (
      await chu.user.create({
        data: {
          tenantId: T,
          email: `${ten}.${DAU}@thu.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
          staffProfile: { create: { tenantId: T } },
        },
      })
    ).id;

  const gd = await nguoi("giam-doc", "ceo");
  const thukho = await nguoi("thu-kho", "warehouse");
  const kinhdoanh = await nguoi("nhan-vien-kd", "sales");
  console.log("");

  // ------------------------------------------------------------------
  const khoA = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "ck-a", ten: "Kho Tân Bình", macDinh: true })));
  const khoB = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "ck-b", ten: "Kho Thủ Đức" })));
  const khoC = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "ck-c", ten: "Kho đã đóng" })));

  const spMay = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({
      sku: `CK-MAY-${DAU}`, ten: "Laptop kho", giaBan: "20000000", giaVon: "16000000",
      donViTinh: "cai", batBuocSerial: true,
    })),
  );
  const spPk = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `CK-PK-${DAU}`, ten: "Bàn phím", giaBan: "800000", giaVon: "500000", donViTinh: "cai" })),
  );

  const SR = { a: `CKA-${DAU}`, b: `CKB-${DAU}` };
  await voi(T, thukho, (nc) =>
    nhapKho(nc, LuocDoNhapKho.parse({
      khoId: khoA.id,
      lyDo: "Nhập đầu kỳ cho bài thử chuyển kho",
      dong: [
        { sanPhamId: spMay.id, soLuong: "2", giaVon: "16000000", serial: [SR.a, SR.b] },
        { sanPhamId: spPk.id, soLuong: "30", giaVon: "500000" },
      ],
    })),
  );
  dat("Nền: kho A có 2 máy + 30 bàn phím, kho B rỗng",
    (await ton(T, gd, khoA.id, spMay.id)) === 2 && (await ton(T, gd, khoA.id, spPk.id)) === 30 && (await ton(T, gd, khoB.id, spPk.id)) === 0);

  // ------------------------------------------------------------------
  console.log("\n— CK-01, CK-02: lập phiếu —");

  await nemLoi("Nhân viên kinh doanh không lập được phiếu chuyển kho", "quyen", () =>
    voi(T, kinhdoanh, (nc) =>
      taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
        khoNguonId: khoA.id, khoDichId: khoB.id, lyDo: "Thử quyền",
        dong: [{ sanPhamId: spPk.id, soLuong: "1" }],
      })),
    ),
  );

  await nemLoi("CK-01: chuyển từ kho này sang chính nó bị chặn", "dinh-dang", () =>
    voi(T, thukho, (nc) =>
      taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
        khoNguonId: khoA.id, khoDichId: khoA.id, lyDo: "Chuyển vòng",
        dong: [{ sanPhamId: spPk.id, soLuong: "1" }],
      })),
    ),
  );

  dat("CK-02: lược đồ bắt buộc lý do chuyển kho",
    LuocDoTaoChuyenKho.safeParse({ khoNguonId: khoA.id, khoDichId: khoB.id, lyDo: "", dong: [{ sanPhamId: spPk.id, soLuong: "1" }] }).success === false);

  await voi(T, gd, (nc) => suaKho(nc, khoC.id, LuocDoSuaKho.parse({ trangThai: "ngung-hoat-dong" })));
  await nemLoi("Kho đã ngừng hoạt động thì không chuyển tới được", "nghiep-vu", () =>
    voi(T, thukho, (nc) =>
      taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
        khoNguonId: khoA.id, khoDichId: khoC.id, lyDo: "Chuyển vào kho đóng",
        dong: [{ sanPhamId: spPk.id, soLuong: "1" }],
      })),
    ),
    "kho-ngung",
  );

  const p1 = await voi(T, thukho, (nc) =>
    taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
      khoNguonId: khoA.id, khoDichId: khoB.id,
      lyDo: "Chi nhánh Thủ Đức hết bàn phím, điều 10 cái sang",
      dong: [{ sanPhamId: spPk.id, soLuong: "10" }],
    })),
  );
  dat("CK-01: phiếu có mã CK-<năm>-0001", p1.so === `CK-${namVN()}-0001`, p1.so);

  const ct1 = await voi(T, thukho, (nc) => chiTietChuyenKho(nc, p1.id));
  dat("Phiếu nháp chưa đụng tồn kho hai đầu",
    (await ton(T, gd, khoA.id, spPk.id)) === 30 && (await ton(T, gd, khoB.id, spPk.id)) === 0);
  dat("Phiếu nháp: mở xuất và hủy, chưa mở nhận",
    ct1.quyen.xuat === true && ct1.quyen.huy === true && ct1.quyen.nhan === false, JSON.stringify(ct1.quyen));
  dat("Tổng kết phiếu: xuất 10, chưa nhận gì", ct1.phieu.tongKet.tongXuat === 10 && ct1.phieu.tongKet.tongNhan === 0);

  await nemLoi("Chưa xuất thì chưa nhận được", "nghiep-vu", () =>
    voi(T, thukho, (nc) => nhanChuyenKho(nc, p1.id, LuocDoNhanChuyenKho.parse({}))),
    "sai-trang-thai",
  );

  // ------------------------------------------------------------------
  console.log("\n— CK-03: xuất khỏi kho nguồn —");

  await nemLoi("Nhân viên kinh doanh không xuất được", "quyen", () =>
    voi(T, kinhdoanh, (nc) => xuatChuyenKho(nc, p1.id, LuocDoXuatChuyenKho.parse({}))),
  );

  const xuat1 = await voi(T, thukho, (nc) => xuatChuyenKho(nc, p1.id, LuocDoXuatChuyenKho.parse({ ghiChu: "Gửi xe chiều nay" })));
  dat("CK-03: xuất xong chuyển IN_TRANSIT", xuat1.trangThai === "IN_TRANSIT", xuat1.trangThai);
  dat("Kho nguồn giảm 10, kho đích CHƯA tăng — hàng đang trên đường",
    (await ton(T, gd, khoA.id, spPk.id)) === 20 && (await ton(T, gd, khoB.id, spPk.id)) === 0,
    `A=${await ton(T, gd, khoA.id, spPk.id)} B=${await ton(T, gd, khoB.id, spPk.id)}`);

  const dsDangDi = await voi(T, gd, (nc) => danhSachChuyenKho(nc, { q: "", trangThai: "", kho: "", trang: 1, coTrang: 20 }));
  dat("Danh sách nói rõ đang có bao nhiêu hàng trên đường",
    dsDangDi.tomTat.soPhieuDangDi === 1 && dsDangDi.tomTat.soLuongDangDi === 10, JSON.stringify(dsDangDi.tomTat));

  await nemLoi("Xuất lần hai bị chặn", "nghiep-vu", () =>
    voi(T, thukho, (nc) => xuatChuyenKho(nc, p1.id, LuocDoXuatChuyenKho.parse({}))),
    "sai-trang-thai",
  );
  await nemLoi("CK-06: hàng đã rời kho thì không hủy phiếu được", "nghiep-vu", () =>
    voi(T, thukho, (nc) => huyChuyenKho(nc, p1.id, "Đổi ý")),
    "sai-trang-thai",
  );

  const doiSoat1 = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Đối soát kho khi hàng đang trên đường: vẫn khớp", doiSoat1.lech.length === 0, JSON.stringify(doiSoat1.lech));

  // ------------------------------------------------------------------
  console.log("\n— CK-04: nhận vào kho đích —");

  const ct2 = await voi(T, thukho, (nc) => chiTietChuyenKho(nc, p1.id));
  const dong1 = ct2.phieu.dong[0];

  await nemLoi("Nhận nhiều hơn số đã xuất bị chặn", "nghiep-vu", () =>
    voi(T, thukho, (nc) =>
      nhanChuyenKho(nc, p1.id, LuocDoNhanChuyenKho.parse({ dong: [{ dongId: dong1.id, soLuongNhan: "12" }] })),
    ),
    "nhan-khong-hop-le",
  );
  await nemLoi("CK-04: nhận thiếu mà không ghi lý do bị chặn", "nghiep-vu", () =>
    voi(T, thukho, (nc) =>
      nhanChuyenKho(nc, p1.id, LuocDoNhanChuyenKho.parse({ dong: [{ dongId: dong1.id, soLuongNhan: "8" }] })),
    ),
    "nhan-khong-hop-le",
  );

  const nhan1 = await voi(T, thukho, (nc) => nhanChuyenKho(nc, p1.id, LuocDoNhanChuyenKho.parse({})));
  dat("Bỏ trống dòng nghĩa là nhận đủ", nhan1.trangThai === "RECEIVED" && nhan1.tongKet.tongNhan === 10, JSON.stringify(nhan1.tongKet));
  dat("Kho đích tăng đủ 10, kho nguồn giữ nguyên 20",
    (await ton(T, gd, khoB.id, spPk.id)) === 10 && (await ton(T, gd, khoA.id, spPk.id)) === 20);
  dat("Không còn hàng nào trên đường", nhan1.tongKet.thieu === 0 && nhan1.tongKet.coThieu === false);

  await nemLoi("Nhận lần hai bị chặn", "nghiep-vu", () =>
    voi(T, thukho, (nc) => nhanChuyenKho(nc, p1.id, LuocDoNhanChuyenKho.parse({}))),
    "sai-trang-thai",
  );

  // ------------------------------------------------------------------
  console.log("\n— CK-04: nhận thiếu, có ghi lý do —");

  const p2 = await voi(T, thukho, (nc) =>
    taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
      khoNguonId: khoA.id, khoDichId: khoB.id,
      lyDo: "Điều thêm 5 bàn phím cho Thủ Đức",
      dong: [{ sanPhamId: spPk.id, soLuong: "5" }],
    })),
  );
  await voi(T, thukho, (nc) => xuatChuyenKho(nc, p2.id, LuocDoXuatChuyenKho.parse({})));
  const ct3 = await voi(T, thukho, (nc) => chiTietChuyenKho(nc, p2.id));

  const nhan2 = await voi(T, thukho, (nc) =>
    nhanChuyenKho(nc, p2.id, LuocDoNhanChuyenKho.parse({
      dong: [{ dongId: ct3.phieu.dong[0].id, soLuongNhan: "4", ghiChu: "Thùng rách, thiếu 1 cái, đã lập biên bản với nhà xe" }],
    })),
  );
  dat("CK-04: nhận thiếu kèm lý do thì đi qua được", nhan2.trangThai === "RECEIVED" && nhan2.tongKet.thieu === 1, JSON.stringify(nhan2.tongKet));
  dat("Kho nguồn giảm đủ 5, kho đích chỉ tăng 4 — phần thiếu không tự biến về",
    (await ton(T, gd, khoA.id, spPk.id)) === 15 && (await ton(T, gd, khoB.id, spPk.id)) === 14,
    `A=${await ton(T, gd, khoA.id, spPk.id)} B=${await ton(T, gd, khoB.id, spPk.id)}`);

  const ct4 = await voi(T, thukho, (nc) => chiTietChuyenKho(nc, p2.id));
  dat("Phiếu ghi rõ thiếu bao nhiêu và vì sao",
    ct4.phieu.dong[0].thieu === 1 && (ct4.phieu.dong[0].ghiChu ?? "").includes("Thùng rách"), JSON.stringify(ct4.phieu.dong[0]));

  const doiSoat2 = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Đối soát kho sau khi nhận thiếu: sổ cái vẫn khớp số dư", doiSoat2.lech.length === 0, JSON.stringify(doiSoat2.lech));

  // ------------------------------------------------------------------
  console.log("\n— CK-05: hàng theo sê-ri —");

  const p3 = await voi(T, thukho, (nc) =>
    taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
      khoNguonId: khoA.id, khoDichId: khoB.id,
      lyDo: "Điều một máy sang Thủ Đức cho khách xem",
      dong: [{ sanPhamId: spMay.id, soLuong: "1" }],
    })),
  );
  await nemLoi("CK-05: hàng theo sê-ri mà không khai sê-ri thì không xuất được", "nghiep-vu", () =>
    voi(T, thukho, (nc) => xuatChuyenKho(nc, p3.id, LuocDoXuatChuyenKho.parse({}))),
    "thieu-serial",
  );

  const p4 = await voi(T, thukho, (nc) =>
    taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
      khoNguonId: khoB.id, khoDichId: khoA.id,
      lyDo: "Thử sê-ri không nằm ở kho nguồn",
      dong: [{ sanPhamId: spMay.id, soLuong: "1", serial: [SR.a] }],
    })),
  );
  await nemLoi("Sê-ri nằm ở kho khác thì không chuyển từ kho này được", "nghiep-vu", () =>
    voi(T, thukho, (nc) => xuatChuyenKho(nc, p4.id, LuocDoXuatChuyenKho.parse({}))),
    "serial-khac-kho",
  );

  const p5 = await voi(T, thukho, (nc) =>
    taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
      khoNguonId: khoA.id, khoDichId: khoB.id,
      lyDo: "Điều máy CKA sang Thủ Đức",
      dong: [{ sanPhamId: spMay.id, soLuong: "1", serial: [SR.a] }],
    })),
  );
  await voi(T, thukho, (nc) => xuatChuyenKho(nc, p5.id, LuocDoXuatChuyenKho.parse({})));

  const snDangDi = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: SR.a }, select: { status: true, warehouseId: true } });
  dat("CK-05: sê-ri đang trên đường thì không thuộc kho nào",
    snDangDi.status === "dang-chuyen" && snDangDi.warehouseId === null, JSON.stringify(snDangDi));

  await voi(T, thukho, (nc) => nhanChuyenKho(nc, p5.id, LuocDoNhanChuyenKho.parse({})));
  const snDaVe = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: SR.a }, select: { status: true, warehouseId: true } });
  dat("CK-05: nhận xong thì sê-ri về đúng kho đích",
    snDaVe.status === "trong-kho" && snDaVe.warehouseId === khoB.id, JSON.stringify(snDaVe));
  dat("Tồn máy chuyển đúng: kho A còn 1, kho B có 1",
    (await ton(T, gd, khoA.id, spMay.id)) === 1 && (await ton(T, gd, khoB.id, spMay.id)) === 1);

  // ------------------------------------------------------------------
  console.log("\n— CK-06: hủy phiếu nháp, và xuất quá tồn —");

  dat("Lược đồ bắt buộc lý do hủy", LuocDoHuyChuyenKho.safeParse({ lyDo: "" }).success === false);
  const huy = await voi(T, thukho, (nc) => huyChuyenKho(nc, p3.id, "Khách không xem nữa"));
  dat("CK-06: hủy được phiếu còn nháp", huy.trangThai === "CANCELLED");

  const p6 = await voi(T, thukho, (nc) =>
    taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({
      khoNguonId: khoB.id, khoDichId: khoA.id,
      lyDo: "Thử xuất quá tồn",
      dong: [{ sanPhamId: spPk.id, soLuong: "999" }],
    })),
  );
  await nemLoi("Xuất quá tồn bị chặn ở hàm ghi sổ kho dùng chung", "nghiep-vu", () =>
    voi(T, thukho, (nc) => xuatChuyenKho(nc, p6.id, LuocDoXuatChuyenKho.parse({}))),
    "ton-khong-du",
  );

  const dsTatCa = await voi(T, gd, (nc) => danhSachChuyenKho(nc, { q: "", trangThai: "tat-ca", kho: "", trang: 1, coTrang: 20 }));
  dat("Lọc 'tất cả' thấy đủ phiếu đã lập", dsTatCa.tong === 6, String(dsTatCa.tong));
  const dsMo = await voi(T, gd, (nc) => danhSachChuyenKho(nc, { q: "", trangThai: "", kho: "", trang: 1, coTrang: 20 }));
  dat("Mặc định chỉ hiện phiếu đang mở", dsMo.dong.every((x) => x.trangThai === "DRAFT" || x.trangThai === "IN_TRANSIT"), dsMo.dong.map((x) => x.trangThai).join(","));
  const dsKho = await voi(T, gd, (nc) => danhSachChuyenKho(nc, { q: "", trangThai: "tat-ca", kho: khoB.id, trang: 1, coTrang: 20 }));
  dat("Lọc theo kho lấy cả phiếu đi và phiếu đến", dsKho.tong === 6, String(dsKho.tong));

  await nemLoi("Phiếu không có thật trả 404", "khong-thay", () =>
    voi(T, gd, (nc) => chiTietChuyenKho(nc, "00000000-0000-4000-8000-000000000000")),
  );

  const doiSoatCuoi = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Đối soát kho cuối bài: không lệch", doiSoatCuoi.lech.length === 0, JSON.stringify(doiSoatCuoi.lech));

  await ketLuan("Thử Chuyển kho nội bộ");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => chu.$disconnect());
