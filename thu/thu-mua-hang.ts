import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { LuocDoTaoNhaCungCap, taoNhaCungCap } from "../src/modules/nha-cung-cap/service";
import { doiSoatKho, taoKho, tonKho } from "../src/modules/kho/service";
import { LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { taoDonHang } from "../src/modules/don-hang/service";
import { LuocDoTaoDon } from "../src/modules/don-hang/luoc-do";
import {
  chiTietDeNghi,
  chiTietDonMua,
  danhSachDeNghi,
  danhSachDonMua,
  goiYMuaChoDonBan,
  guiDonMua,
  huyDeNghi,
  huyDonMua,
  nhanHang,
  quyetDuyetDeNghi,
  suaDeNghi,
  suaDonMua,
  taoDeNghi,
  taoDonMua,
  xacNhanDonMua,
  xinDuyetDeNghi,
} from "../src/modules/mua-hang/service";
import {
  LuocDoNhanHang,
  LuocDoQuyetDuyetDeNghi,
  LuocDoSuaDeNghi,
  LuocDoSuaDonMua,
  LuocDoTaoDeNghi,
  LuocDoTaoDonMua,
} from "../src/modules/mua-hang/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng Mua hàng (đề nghị → đơn mua → nhận hàng) trên CSDL THẬT.
 * Luật: BUSINESS_RULES.md mục 16 (MH).
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-mua-hang"));
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

async function main() {
  console.log("=== Thử Mua hàng (đề nghị → đơn mua → nhận hàng) ===\n");
  const tenant = await seedNenMong(chu, `thu-mh-${DAU}`, "Doanh nghiệp thử mua hàng");
  const T = tenant.id;
  const homNay = homNayVN();

  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const nguoi = async (ten: string, vai: string, quanLyId?: string) =>
    (
      await chu.user.create({
        data: {
          tenantId: T,
          email: `${ten}.${DAU}@thu.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
          staffProfile: { create: { tenantId: T, managerId: quanLyId ?? null } },
        },
      })
    ).id;

  const gd = await nguoi("giam-doc", "ceo");
  const muaHang = await nguoi("nhan-vien-mua-hang", "purchasing");
  const tpKd = await nguoi("truong-phong-kinh-doanh", "sales-manager");
  const thuKho = await nguoi("thu-kho", "warehouse");
  console.log("");

  // ------------------------------------------------------------------
  // Nền: nhà cung cấp, kho, hai sản phẩm (một theo sê-ri, một không).
  const ncc = await voi(T, muaHang, (nc) =>
    taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `Công ty Nguồn Hàng ${DAU}`, dienThoai: "0909 555 444" })),
  );
  const kho = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-mh", ten: "Kho thử mua hàng", macDinh: true })));
  const laptop = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `MH-LAP-${DAU}`, ten: "Laptop nhập mua", giaBan: "20000000", giaVon: "17000000", donViTinh: "cai", batBuocSerial: true })),
  );
  const chuot = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `MH-CHUOT-${DAU}`, ten: "Chuột không dây", giaBan: "300000", giaVon: "200000", donViTinh: "cai" })),
  );

  // ------------------------------------------------------------------
  console.log("— MH-01: đề nghị mua —");

  await nemLoi("Người không có quyền mua hàng thì không lập được đề nghị", "quyen", () =>
    voi(T, thuKho, (nc) =>
      taoDeNghi(nc, LuocDoTaoDeNghi.parse({ dong: [{ ten: "Gì đó", soLuong: "1" }] })),
    ),
  );

  const dn = await voi(T, muaHang, (nc) =>
    taoDeNghi(nc, LuocDoTaoDeNghi.parse({
      ngayCan: congNgay(homNay, 14),
      lyDo: "Bổ sung tồn kho quý sau",
      dong: [
        { sanPhamId: laptop.id, ten: "Laptop nhập mua", soLuong: "5", giaDuKien: "17.000.000", nhaCungCapId: ncc.id },
        { sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "20", giaDuKien: "200.000" },
      ],
    })),
  );
  dat("MH-01: đề nghị có mã DN-<năm>-0001", dn.so === `DN-${namVN()}-0001`, dn.so);

  const ct1 = await voi(T, muaHang, (nc) => chiTietDeNghi(nc, dn.id));
  dat("Đề nghị ở trạng thái Nháp, có 2 dòng", ct1.deNghi.trangThai === "DRAFT" && ct1.deNghi.dong.length === 2);
  dat("Tổng dự kiến tính đúng (5×17tr + 20×200k)", ct1.deNghi.tongDuKien === 89_000_000, String(ct1.deNghi.tongDuKien));
  dat("Dòng chép lại SKU và đơn vị từ danh mục", ct1.deNghi.dong[0].sku === `MH-LAP-${DAU}` && ct1.deNghi.dong[0].donViTinh === "cai");
  dat("Chưa duyệt thì chưa cho tạo đơn mua", ct1.quyen.taoDonMua === false);

  await voi(T, muaHang, (nc) =>
    suaDeNghi(
      nc,
      dn.id,
      LuocDoSuaDeNghi.parse({
        dong: [
          { sanPhamId: laptop.id, ten: "Laptop nhập mua", soLuong: "4", giaDuKien: "17.000.000", nhaCungCapId: ncc.id },
          { sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "20", giaDuKien: "200.000" },
        ],
      }),
    ),
  );
  const ct2 = await voi(T, muaHang, (nc) => chiTietDeNghi(nc, dn.id));
  dat("Sửa được dòng khi còn nháp", ct2.deNghi.dong[0].soLuong === "4");

  // ------------------------------------------------------------------
  console.log("\n— MH-02: duyệt đề nghị, người đề nghị không tự duyệt —");

  await nemLoi("Chưa xin duyệt thì không duyệt được", "nghiep-vu", () =>
    voi(T, gd, (nc) => quyetDuyetDeNghi(nc, dn.id, LuocDoQuyetDuyetDeNghi.parse({ quyetDinh: "cho-duyet" }))),
    "sai-trang-thai",
  );

  await voi(T, muaHang, (nc) => xinDuyetDeNghi(nc, dn.id));
  const ct3 = await voi(T, muaHang, (nc) => chiTietDeNghi(nc, dn.id));
  dat("Xin duyệt xong thì chuyển Chờ duyệt", ct3.deNghi.trangThai === "PENDING_APPROVAL");
  dat("Chờ duyệt thì khóa sửa", ct3.quyen.sua === false);
  await nemLoi("Đề nghị chờ duyệt thì không sửa được", "nghiep-vu", () =>
    voi(T, muaHang, (nc) => suaDeNghi(nc, dn.id, LuocDoSuaDeNghi.parse({ lyDo: "sửa lén" }))),
    "sai-trang-thai",
  );

  await nemLoi("Nhân viên mua hàng KHÔNG có quyền duyệt", "quyen", () =>
    voi(T, muaHang, (nc) => quyetDuyetDeNghi(nc, dn.id, LuocDoQuyetDuyetDeNghi.parse({ quyetDinh: "cho-duyet" }))),
  );
  await nemLoi("Từ chối mà không ghi lý do bị chặn", "dinh-dang", () =>
    voi(T, gd, (nc) => quyetDuyetDeNghi(nc, dn.id, LuocDoQuyetDuyetDeNghi.parse({ quyetDinh: "tu-choi" }))),
  );
  dat(
    "Kế toán – Tài chính có quyền duyệt đề nghị mua (định nghĩa vai trò khớp migration)",
    (await chu.rolePermission.count({
      where: { role: { tenantId: T, code: "finance" }, permission: { code: "purchasing.approve" } },
    })) === 1,
  );
  dat(
    "Trưởng phòng Kinh doanh KHÔNG có quyền duyệt đề nghị mua",
    (await chu.rolePermission.count({
      where: { role: { tenantId: T, code: "sales-manager" }, permission: { code: "purchasing.approve" } },
    })) === 0,
  );
  dat(
    "Trưởng phòng Kinh doanh xem được công nợ (Phase 7 — định nghĩa vai trò khớp migration)",
    (await chu.rolePermission.count({
      where: { role: { tenantId: T, code: "sales-manager" }, permission: { code: "finance.view" } },
    })) === 1,
  );

  const duyet = await voi(T, gd, (nc) => quyetDuyetDeNghi(nc, dn.id, LuocDoQuyetDuyetDeNghi.parse({ quyetDinh: "cho-duyet", ghiChu: "Đồng ý, mua trong tuần" })));
  dat("MH-02: duyệt xong thì chuyển Đã duyệt", duyet.trangThai === "APPROVED");
  const ct4 = await voi(T, muaHang, (nc) => chiTietDeNghi(nc, dn.id));
  dat("Ghi lại thời điểm duyệt", ct4.deNghi.duyetLuc !== null);
  dat("Đã duyệt thì mở nút tạo đơn mua", ct4.quyen.taoDonMua === true);

  // ------------------------------------------------------------------
  console.log("\n— MH-03: đơn mua —");

  const dnChuaDuyet = await voi(T, muaHang, (nc) =>
    taoDeNghi(nc, LuocDoTaoDeNghi.parse({ lyDo: "Chưa duyệt", dong: [{ sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "5" }] })),
  );
  await nemLoi("MH-03: không đặt hàng từ đề nghị chưa duyệt", "nghiep-vu", () =>
    voi(T, muaHang, (nc) =>
      taoDonMua(nc, LuocDoTaoDonMua.parse({
        nhaCungCapId: ncc.id,
        khoId: kho.id,
        deNghiId: dnChuaDuyet.id,
        dong: [{ sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "5", donGia: "200.000" }],
      })),
    ),
    "de-nghi-chua-duyet",
  );

  const dm = await voi(T, muaHang, (nc) =>
    taoDonMua(nc, LuocDoTaoDonMua.parse({
      nhaCungCapId: ncc.id,
      khoId: kho.id,
      deNghiId: dn.id,
      ngayHenGiao: congNgay(homNay, 7),
      dong: [
        { sanPhamId: laptop.id, ten: "Laptop nhập mua", soLuong: "4", donGia: "17.000.000", vat: 10 },
        { sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "20", donGia: "200.000", vat: 10 },
      ],
    })),
  );
  dat("MH-01: đơn mua có mã DM-<năm>-0001", dm.so === `DM-${namVN()}-0001`, dm.so);

  const ctDm = await voi(T, muaHang, (nc) => chiTietDonMua(nc, dm.id));
  dat("Tổng tiền đơn mua đúng ((68tr + 4tr) + 10% VAT)", ctDm.donMua.tongCong === "79200000", ctDm.donMua.tongCong);
  dat("Đơn mua giữ liên kết tới đề nghị", ctDm.donMua.deNghi?.id === dn.id);
  dat("Đơn mua nhận đúng kho", ctDm.donMua.kho.id === kho.id);
  dat("Dòng laptop biết là hàng theo sê-ri", ctDm.donMua.dong[0].theoSerial === true);

  const ctDnSau = await voi(T, muaHang, (nc) => chiTietDeNghi(nc, dn.id));
  dat("Đề nghị chuyển sang Đã đặt hàng", ctDnSau.deNghi.trangThai === "ORDERED");
  dat("Đề nghị thấy đơn mua sinh ra từ nó", ctDnSau.donMua.length === 1 && ctDnSau.donMua[0].id === dm.id);
  await nemLoi("Đề nghị đã đặt hàng thì không hủy", "nghiep-vu", () => voi(T, muaHang, (nc) => huyDeNghi(nc, dn.id, "thôi")), "da-dat-hang");

  // ------------------------------------------------------------------
  console.log("\n— MH-04: gửi nhà cung cấp rồi thì khóa dòng hàng —");

  await nemLoi("Chưa gửi thì chưa nhận hàng được", "nghiep-vu", () =>
    voi(T, thuKho, (nc) => nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: ctDm.donMua.dong[1].id, soLuong: "1" }] }))),
    "sai-trang-thai",
  );

  await voi(T, muaHang, (nc) => suaDonMua(nc, dm.id, LuocDoSuaDonMua.parse({ ghiChu: "Giao giờ hành chính" })));
  await voi(T, muaHang, (nc) => guiDonMua(nc, dm.id));
  const ctGui = await voi(T, muaHang, (nc) => chiTietDonMua(nc, dm.id));
  dat("Gửi xong thì chuyển Đã gửi và ghi thời điểm", ctGui.donMua.trangThai === "SENT" && ctGui.donMua.guiLuc !== null);
  await nemLoi("MH-04: đơn đã gửi thì không sửa dòng hàng", "nghiep-vu", () =>
    voi(T, muaHang, (nc) => suaDonMua(nc, dm.id, LuocDoSuaDonMua.parse({ dong: [{ ten: "Sửa lén", soLuong: "1", donGia: "1" }] }))),
    "sai-trang-thai",
  );
  await nemLoi("Gửi lần hai bị chặn", "nghiep-vu", () => voi(T, muaHang, (nc) => guiDonMua(nc, dm.id)), "sai-trang-thai");

  await voi(T, muaHang, (nc) => xacNhanDonMua(nc, dm.id));
  dat("Nhà cung cấp xác nhận thì chuyển CONFIRMED", (await voi(T, muaHang, (nc) => chiTietDonMua(nc, dm.id))).donMua.trangThai === "CONFIRMED");

  // ------------------------------------------------------------------
  console.log("\n— MH-05, MH-06: nhận hàng vào kho —");

  const dongLaptop = ctDm.donMua.dong[0].id;
  const dongChuot = ctDm.donMua.dong[1].id;

  await nemLoi("MH-05: nhận quá số đặt bị chặn", "nghiep-vu", () =>
    voi(T, thuKho, (nc) => nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongChuot, soLuong: "25" }] }))),
    "nhan-qua-so-luong",
  );
  await nemLoi("Hàng theo sê-ri mà thiếu sê-ri bị chặn", "nghiep-vu", () =>
    voi(T, thuKho, (nc) => nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongLaptop, soLuong: "2", serial: [`SN-${DAU}-1`] }] }))),
    "thieu-serial",
  );
  await nemLoi("Sê-ri trùng nhau trong cùng phiếu bị chặn", "nghiep-vu", () =>
    voi(T, thuKho, (nc) =>
      nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongLaptop, soLuong: "2", serial: [`SN-${DAU}-1`, `SN-${DAU}-1`] }] })),
    ),
    "serial-trung-trong-phieu",
  );
  await nemLoi("Không nhận hàng cho ngày tương lai", "dinh-dang", () =>
    voi(T, thuKho, (nc) =>
      nhanHang(nc, dm.id, LuocDoNhanHang.parse({ ngayNhan: congNgay(homNay, 1), dong: [{ dongDonId: dongChuot, soLuong: "1" }] })),
    ),
  );
  dat("Không phiếu nhận nào được ghi khi bị chặn", (await chu.goodsReceipt.count({ where: { tenantId: T } })) === 0);

  const nhan1 = await voi(T, thuKho, (nc) =>
    nhanHang(nc, dm.id, LuocDoNhanHang.parse({
      soChungTuNcc: `HD-NCC-${DAU}`,
      dong: [
        { dongDonId: dongLaptop, soLuong: "2", serial: [`SN-${DAU}-1`, `SN-${DAU}-2`] },
        { dongDonId: dongChuot, soLuong: "20" },
      ],
    })),
  );
  dat("MH-01: phiếu nhận có mã NK-<năm>-0001", nhan1.so === `NK-${namVN()}-0001`, nhan1.so);
  dat("MH-07: nhận một phần thì đơn chuyển PARTIALLY_RECEIVED", nhan1.trangThaiDon === "PARTIALLY_RECEIVED", nhan1.trangThaiDon);

  const ton1 = await voi(T, thuKho, (nc) => tonKho(nc, { q: "", kho: "", canhBao: "", trang: 1, coTrang: 50 }));
  const tonLaptop = ton1.dong.find((d) => d.sanPham.id === laptop.id);
  const tonChuot = ton1.dong.find((d) => d.sanPham.id === chuot.id);
  dat("MH-06: laptop vào kho đúng 2 cái", tonLaptop?.tonKho === 2, String(tonLaptop?.tonKho));
  dat("MH-06: chuột vào kho đúng 20 cái", tonChuot?.tonKho === 20, String(tonChuot?.tonKho));

  const soSerial = await chu.serialNumber.count({ where: { tenantId: T, productId: laptop.id, status: "trong-kho" } });
  dat("Hai số sê-ri được ghi vào kho", soSerial === 2, String(soSerial));

  const soCai = await chu.inventoryTransaction.count({ where: { tenantId: T, refType: "don-mua", refId: dm.id } });
  dat("Sổ cái kho ghi đúng 2 dòng mang chứng từ đơn mua", soCai === 2, String(soCai));

  const doiSoat1 = await voi(T, thuKho, (nc) => doiSoatKho(nc));
  dat("MH-06: đối soát kho vẫn khớp sau khi nhập mua", doiSoat1.lech.length === 0, JSON.stringify(doiSoat1.lech).slice(0, 200));

  await nemLoi("MH-08: đơn đã nhận một phần thì không hủy", "nghiep-vu", () =>
    voi(T, muaHang, (nc) => huyDonMua(nc, dm.id, "đổi ý")),
    "da-nhan-hang",
  );

  const ctSauNhan1 = await voi(T, muaHang, (nc) => chiTietDonMua(nc, dm.id));
  dat("Dòng laptop còn phải nhận 2", ctSauNhan1.donMua.dong[0].conPhaiNhan === 2, String(ctSauNhan1.donMua.dong[0].conPhaiNhan));
  dat("Dòng chuột đã nhận đủ", ctSauNhan1.donMua.dong[1].conPhaiNhan === 0);
  dat("Tiến độ nhận 22/24", ctSauNhan1.donMua.tienDo.tongDaNhan === 22 && ctSauNhan1.donMua.tienDo.tongDat === 24);
  dat("Đơn thấy phiếu nhận đầu tiên", ctSauNhan1.phieuNhan.length === 1 && ctSauNhan1.phieuNhan[0].so === nhan1.so);

  await nemLoi("Nhận quá phần còn lại bị chặn (sau lần nhận đầu)", "nghiep-vu", () =>
    voi(T, thuKho, (nc) =>
      nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongChuot, soLuong: "1" }] })),
    ),
    "nhan-qua-so-luong",
  );
  await nemLoi("Sê-ri đã có trong hệ thống thì không nhận lại", "nghiep-vu", () =>
    voi(T, thuKho, (nc) =>
      nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongLaptop, soLuong: "1", serial: [`SN-${DAU}-1`] }] })),
    ),
    "trung-serial",
  );

  const nhan2 = await voi(T, thuKho, (nc) =>
    nhanHang(nc, dm.id, LuocDoNhanHang.parse({
      dong: [{ dongDonId: dongLaptop, soLuong: "2", serial: [`SN-${DAU}-3`, `SN-${DAU}-4`] }],
    })),
  );
  dat("MH-07: nhận nốt thì đơn chuyển RECEIVED", nhan2.trangThaiDon === "RECEIVED", nhan2.trangThaiDon);
  const ctXong = await voi(T, muaHang, (nc) => chiTietDonMua(nc, dm.id));
  dat("Ghi lại thời điểm nhận xong", ctXong.donMua.nhanXongLuc !== null);
  dat("Đơn đã nhận đủ thì khóa mọi thao tác", ctXong.quyen.nhanHang === false && ctXong.quyen.huy === false);
  await nemLoi("Nhận thêm cho đơn đã đủ bị chặn", "nghiep-vu", () =>
    voi(T, thuKho, (nc) => nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongLaptop, soLuong: "1", serial: [`SN-${DAU}-9`] }] }))),
    "sai-trang-thai",
  );

  const doiSoat2 = await voi(T, thuKho, (nc) => doiSoatKho(nc));
  dat("Đối soát kho vẫn khớp sau khi nhận đủ", doiSoat2.lech.length === 0);

  // ------------------------------------------------------------------
  console.log("\n— MH-08: hủy đơn mua chưa nhận gì —");

  const dmHuy = await voi(T, muaHang, (nc) =>
    taoDonMua(nc, LuocDoTaoDonMua.parse({
      nhaCungCapId: ncc.id,
      khoId: kho.id,
      dong: [{ sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "10", donGia: "200.000" }],
    })),
  );
  await voi(T, muaHang, (nc) => guiDonMua(nc, dmHuy.id));
  await voi(T, muaHang, (nc) => huyDonMua(nc, dmHuy.id, "Nhà cung cấp báo hết hàng"));
  const ctHuy = await voi(T, muaHang, (nc) => chiTietDonMua(nc, dmHuy.id));
  dat("Hủy đơn giữ lại lý do", ctHuy.donMua.trangThai === "CANCELLED" && ctHuy.donMua.lyDoHuy === "Nhà cung cấp báo hết hàng");
  await nemLoi("Hủy lần hai bị chặn", "nghiep-vu", () => voi(T, muaHang, (nc) => huyDonMua(nc, dmHuy.id, "lần nữa")), "sai-trang-thai");
  dat("Hủy đơn KHÔNG đụng tồn kho", (await voi(T, thuKho, (nc) => tonKho(nc, { q: "", kho: "", canhBao: "", trang: 1, coTrang: 50 }))).dong.find((d) => d.sanPham.id === chuot.id)?.tonKho === 20);

  // ------------------------------------------------------------------
  console.log("\n— Gợi ý mua cho đơn bán thiếu hàng —");

  const khach = await voi(T, tpKd, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Mua Nhiều ${DAU}`, dienThoai: "0909 666 777" })),
  );
  const donBan = await voi(T, tpKd, (nc) =>
    taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khach.id,
      dong: [
        { sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "30", donViTinh: "cai", donGia: "300.000", vat: 10, giaVon: "200.000" },
      ],
    })),
  );
  const goiY = await voi(T, muaHang, (nc) => goiYMuaChoDonBan(nc, donBan.id));
  dat("Đơn bán 30 cái mà kho chỉ có 20 → gợi ý mua 10", goiY.thieu.length === 1 && goiY.thieu[0].canMua === 10, JSON.stringify(goiY.thieu));
  dat("Gợi ý nêu rõ còn bán được bao nhiêu", goiY.thieu[0].conBanDuoc === 20, String(goiY.thieu[0].conBanDuoc));

  const dnTuDon = await voi(T, muaHang, (nc) =>
    taoDeNghi(nc, LuocDoTaoDeNghi.parse({
      donBanId: donBan.id,
      lyDo: `Thiếu hàng cho đơn ${donBan.so}`,
      dong: [{ sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "10", giaDuKien: "200.000" }],
    })),
  );
  const ctTuDon = await voi(T, muaHang, (nc) => chiTietDeNghi(nc, dnTuDon.id));
  dat("Đề nghị giữ liên kết tới đơn bán", ctTuDon.deNghi.donBan?.id === donBan.id);

  // ------------------------------------------------------------------
  console.log("\n— Danh sách và bộ lọc —");

  const dsDn = await voi(T, muaHang, (nc) => danhSachDeNghi(nc, { q: "", trangThai: "", choDuyet: "", trang: 1, coTrang: 20 }));
  dat("Danh sách mặc định bỏ đề nghị đã đóng", dsDn.dong.every((d) => !["REJECTED", "CANCELLED", "ORDERED"].includes(d.trangThai)), dsDn.dong.map((d) => d.trangThai).join(","));
  const dsCho = await voi(T, gd, (nc) => danhSachDeNghi(nc, { q: "", trangThai: "", choDuyet: "1", trang: 1, coTrang: 20 }));
  dat("Lọc chờ duyệt chỉ ra đề nghị chờ duyệt", dsCho.dong.every((d) => d.trangThai === "PENDING_APPROVAL"));
  const dsDm = await voi(T, muaHang, (nc) => danhSachDonMua(nc, { q: "", trangThai: "", nhaCungCap: "", trang: 1, coTrang: 20 }));
  dat("Danh sách đơn mua mặc định bỏ đơn đã đóng", dsDm.dong.every((o) => !["RECEIVED", "CANCELLED"].includes(o.trangThai)), String(dsDm.tong));
  const dsTatCa = await voi(T, muaHang, (nc) => danhSachDonMua(nc, { q: "", trangThai: "tat-ca", nhaCungCap: "", trang: 1, coTrang: 20 }));
  dat("Lọc tất cả thì thấy cả đơn đã đóng", dsTatCa.tong >= 2, String(dsTatCa.tong));

  // ------------------------------------------------------------------
  console.log("\n— Cách ly giữa các doanh nghiệp —");

  const tenant2 = await seedNenMong(chu, `thu-mh2-${DAU}`, "Doanh nghiệp thử mua hàng 2");
  const soDn1 = await chu.purchaseRequest.count({ where: { tenantId: T } });
  const soDn2 = await chu.purchaseRequest.count({ where: { tenantId: tenant2.id } });
  dat("Đề nghị mua nằm đúng doanh nghiệp của nó", soDn1 > 0 && soDn2 === 0, `${soDn1} / ${soDn2}`);

  await ketLuan("Thử Mua hàng");
}

main().catch((e) => {
  console.error("Bài thử gặp lỗi ngoài dự kiến:", e);
  process.exit(1);
});
