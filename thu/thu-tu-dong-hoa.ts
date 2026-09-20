import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoViec, taoViec } from "../src/modules/cong-viec/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay, congThang } from "../src/modules/nhac-viec/tinh-toan";
import { QUY_TAC } from "../src/modules/nhac-viec/quy-tac";
import {
  batTatQuyTac,
  boQuaViec,
  chayQuet,
  chayQuetTay,
  danhDauXongViec,
  trangThaiQuyTac,
  viecHomNay,
  xemTuDongHoa,
} from "../src/modules/nhac-viec/service";
import { danhSachThongBao, danhDauDaDoc, danhDauDocHet, taoThongBao } from "../src/modules/thong-bao/service";
import {
  boQuaGiaHan,
  chiTietHopDongBaoTri,
  chotGiaHan,
  danhSachGiaHan,
  danhSachHopDongBaoTri,
  ghiNhanBaoTri,
  huyHopDongBaoTri,
  suaHopDongBaoTri,
  taoHopDongBaoTri,
} from "../src/modules/bao-tri/service";
import { LuocDoChotGiaHan, LuocDoTaoHopDongBaoTri } from "../src/modules/bao-tri/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng Tự động hóa, Việc hôm nay, thông báo, bảo trì định kỳ và gia hạn (Phase 8)
 * trên CSDL THẬT. Luật: BUSINESS_RULES.md mục 13 (TD) và mục 14 (BT/GH).
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-tu-dong-hoa"));
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
  console.log("=== Thử Tự động hóa, Việc hôm nay, Bảo trì và Gia hạn (Phase 8) ===\n");
  const tenant = await seedNenMong(chu, `thu-td-${DAU}`, "Doanh nghiệp thử tự động hóa");
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
  const tpKd = await nguoi("truong-phong-kinh-doanh", "sales-manager");
  const nvKd = await nguoi("nhan-vien-kinh-doanh", "sales", tpKd);
  const cskh = await nguoi("cham-soc-khach", "customer-service");
  console.log("");

  // ------------------------------------------------------------------
  console.log("— TD-01: quy tắc thiếu ngưỡng thì KHÔNG quét —");

  const tt0 = await voi(T, gd, (nc) => trangThaiQuyTac(nc.tx));
  dat("Danh mục quy tắc đủ số lượng", tt0.length === QUY_TAC.length, `${tt0.length}/${QUY_TAC.length}`);
  const canNguong = tt0.filter((q) => q.khoaNguong !== null);
  dat(
    "Mọi quy tắc cần ngưỡng đều đang KHÔNG chạy vì chưa ai đặt ngưỡng",
    canNguong.length > 0 && canNguong.every((q) => !q.chay && q.lyDoBoQua.length > 0),
    canNguong.map((q) => `${q.ma}:${q.chay}`).join(","),
  );
  dat(
    "Quy tắc không cần ngưỡng vẫn chạy được ngay",
    tt0.filter((q) => q.khoaNguong === null).every((q) => q.chay),
  );

  // ------------------------------------------------------------------
  console.log("\n— TD-02: bản quét sinh việc, chạy lại không nhân đôi —");

  const khach = await voi(T, tpKd, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty TNHH Thử Tự Động ${DAU}`, dienThoai: "0909 777 111", nguoiPhuTrachId: nvKd })),
  );

  // Một việc đã quá hạn của nhân viên kinh doanh — quy tắc này không cần ngưỡng.
  const viecQuaHan = await voi(T, nvKd, (nc) =>
    taoViec(nc, LuocDoTaoViec.parse({
      tieuDe: `Gọi lại khách ${DAU}`,
      khachHangId: khach.id,
      han: `${congNgay(homNay, -3)}T09:00:00+07:00`,
      nguoiPhuTrachId: nvKd,
    })),
  );
  dat("Dựng được một việc đã quá hạn để quy tắc bắt", Boolean(viecQuaHan.id));

  const lan1 = await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: homNay, trigger: "tay", nguoiChayId: gd }));
  dat("Bản quét chạy xong và có kết quả từng quy tắc", lan1.quyTac.length === QUY_TAC.length);
  dat("Số quy tắc bỏ qua đúng bằng số quy tắc thiếu ngưỡng", lan1.soQuyTacBoQua === canNguong.length, `${lan1.soQuyTacBoQua}`);
  dat("Sinh ít nhất một việc từ quy tắc việc quá hạn", lan1.soViec >= 1, `${lan1.soViec} việc`);

  const lan2 = await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: homNay, trigger: "tay", nguoiChayId: gd }));
  dat("TD-02: chạy lại trong ngày KHÔNG sinh thêm việc nào", lan2.soViec === 0, `${lan2.soViec} việc`);
  dat("TD-02: chạy lại cũng không rung thêm chuông", lan2.soThongBao === 0, `${lan2.soThongBao} thông báo`);

  // ------------------------------------------------------------------
  console.log("\n— TD-03: mỗi người chỉ thấy việc của chính mình —");

  const cuaNv = await voi(T, nvKd, (nc) => viecHomNay(nc));
  dat("Nhân viên thấy việc quá hạn của mình", cuaNv.dong.some((v) => v.doiTuongId === viecQuaHan.id));
  dat("Việc quá hạn được xếp mức Gấp", cuaNv.dong.find((v) => v.doiTuongId === viecQuaHan.id)?.mucDo === "khan");
  dat("Lý do ghi rõ quá hạn bao nhiêu ngày", /quá hạn 3 ngày/i.test(cuaNv.dong.find((v) => v.doiTuongId === viecQuaHan.id)?.lyDo ?? ""));

  const cuaTp = await voi(T, tpKd, (nc) => viecHomNay(nc));
  dat(
    "TD-03: trưởng phòng KHÔNG thấy việc hôm nay của nhân viên (đây là danh sách cá nhân)",
    !cuaTp.dong.some((v) => v.doiTuongId === viecQuaHan.id),
  );
  const cuaCskh = await voi(T, cskh, (nc) => viecHomNay(nc));
  dat("Người không liên quan có danh sách rỗng", cuaCskh.dong.length === 0);

  // ------------------------------------------------------------------
  console.log("\n— TD-04: chuông thông báo —");

  const tbNv = await voi(T, nvKd, (nc) => danhSachThongBao(nc));
  dat("Nhân viên có một thông báo tóm tắt việc hôm nay", tbNv.dong.some((t) => t.loai === "viec-hom-nay"));
  dat("Chuông đếm đúng số chưa đọc", tbNv.soChuaDoc === tbNv.dong.filter((t) => !t.daDoc).length);
  const tbCuaToi = tbNv.dong.find((t) => t.loai === "viec-hom-nay")!;
  dat("Câu tóm tắt có số việc thật", /việc gấp/.test(tbCuaToi.tieuDe), tbCuaToi.tieuDe);

  const tbCskh = await voi(T, cskh, (nc) => danhSachThongBao(nc));
  dat("TD-04: người không có việc thì KHÔNG bị rung chuông", tbCskh.dong.length === 0);

  await voi(T, nvKd, (nc) => danhDauDaDoc(nc, tbCuaToi.id));
  const sauDoc = await voi(T, nvKd, (nc) => danhSachThongBao(nc));
  dat("Đánh dấu đã đọc thì số chưa đọc giảm", sauDoc.soChuaDoc === tbNv.soChuaDoc - 1);
  await nemLoi("Không đọc được thông báo của người khác", "khong-thay", () => voi(T, cskh, (nc) => danhDauDaDoc(nc, tbCuaToi.id)));

  // Chống trùng thông báo.
  const tao1 = await voiTenant(T, (tx) =>
    taoThongBao(tx, T, { nguoiNhanId: cskh, loai: "thu", tieuDe: "Thử chống trùng", khoaChongTrung: `thu-${DAU}` }),
  );
  const tao2 = await voiTenant(T, (tx) =>
    taoThongBao(tx, T, { nguoiNhanId: cskh, loai: "thu", tieuDe: "Thử chống trùng", khoaChongTrung: `thu-${DAU}` }),
  );
  dat("Cùng khóa chống trùng thì chỉ tạo một lần", tao1 === true && tao2 === false);
  await voi(T, cskh, (nc) => danhDauDocHet(nc));
  dat("Đánh dấu đọc hết thì không còn chưa đọc", (await voi(T, cskh, (nc) => danhSachThongBao(nc))).soChuaDoc === 0);

  // ------------------------------------------------------------------
  console.log("\n— TD-05: đóng một việc hôm nay —");

  const viecId = cuaNv.dong.find((v) => v.doiTuongId === viecQuaHan.id)!.id;
  await voi(T, nvKd, (nc) => danhDauXongViec(nc, viecId));
  const sauXong = await voi(T, nvKd, (nc) => viecHomNay(nc));
  dat("Việc chuyển sang Đã xử lý", sauXong.dong.find((v) => v.id === viecId)?.trangThai === "xong");
  dat("Tóm tắt đếm lại đúng", sauXong.tomTat.xong === 1 && sauXong.tomTat.khan === 0);
  await nemLoi("Đóng lại một việc đã đóng bị chặn", "nghiep-vu", () => voi(T, nvKd, (nc) => danhDauXongViec(nc, viecId)), "da-dong");
  await nemLoi("Không đóng được việc của người khác", "khong-thay", () => voi(T, cskh, (nc) => danhDauXongViec(nc, viecId)));

  // Việc thứ hai để thử bỏ qua.
  const viec2 = await voi(T, nvKd, (nc) =>
    taoViec(nc, LuocDoTaoViec.parse({
      tieuDe: `Việc quá hạn thứ hai ${DAU}`,
      han: `${congNgay(homNay, -1)}T09:00:00+07:00`,
      nguoiPhuTrachId: nvKd,
    })),
  );
  await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: homNay, trigger: "tay", nguoiChayId: gd }));
  const ds2 = await voi(T, nvKd, (nc) => viecHomNay(nc));
  const viec2Id = ds2.dong.find((v) => v.doiTuongId === viec2.id)!.id;
  await voi(T, nvKd, (nc) => boQuaViec(nc, viec2Id, "Khách đã hẹn lại tuần sau"));
  const ds3 = await voi(T, nvKd, (nc) => viecHomNay(nc));
  const daBo = ds3.dong.find((v) => v.id === viec2Id)!;
  dat("TD-06: bỏ qua giữ lại lý do", daBo.trangThai === "bo-qua" && daBo.lyDoBoQua === "Khách đã hẹn lại tuần sau");

  // ------------------------------------------------------------------
  console.log("\n— TD-07: bật tắt quy tắc, chỉ người có quyền cấu hình —");

  await nemLoi("Nhân viên không tắt được quy tắc", "quyen", () => voi(T, nvKd, (nc) => batTatQuyTac(nc, "viec-qua-han", false)));
  await voi(T, gd, (nc) => batTatQuyTac(nc, "viec-qua-han", false));
  const ttSauTat = await voi(T, gd, (nc) => trangThaiQuyTac(nc.tx));
  const qtTat = ttSauTat.find((q) => q.ma === "viec-qua-han")!;
  dat("Quy tắc đã tắt thì không chạy, và nói rõ là đang tắt", !qtTat.chay && /tắt/.test(qtTat.lyDoBoQua));
  await nemLoi("Bật/tắt một mã quy tắc không có thật bị chặn", "khong-thay", () => voi(T, gd, (nc) => batTatQuyTac(nc, "khong-co-that", true)));
  await voi(T, gd, (nc) => batTatQuyTac(nc, "viec-qua-han", true));

  await nemLoi("Nhân viên không chạy được bản quét tay", "quyen", () => voi(T, nvKd, (nc) => chayQuetTay(nc)));
  const manHinh = await voi(T, gd, (nc) => xemTuDongHoa(nc));
  dat("Màn hình Tự động hóa có lịch sử chạy", manHinh.lanChay.length >= 2);
  dat("Lần chạy ghi rõ là chạy tay", manHinh.lanChay[0].nguonChay === "tay");
  dat("Giám đốc được sửa công tắc", manHinh.duocSua === true);
  const cskhXem = await voi(T, cskh, (nc) => xemTuDongHoa(nc)).catch(() => null);
  dat("Người không có quyền cấu hình không mở được màn hình Tự động hóa", cskhXem === null);

  // ------------------------------------------------------------------
  console.log("\n— Quy tắc chạy thật khi đã đặt ngưỡng —");

  await voi(T, gd, (nc) =>
    capNhatCauHinh(nc, {
      giaTri: {
        "theo_doi.bao_gia_khong_phan_hoi_ngay": 5,
        "theo_doi.co_hoi_khong_hoat_dong_ngay": 7,
        "theo_doi.khach_chua_mua_lai_thang": 6,
        "theo_doi.bao_hanh_sap_het_ngay": 60,
        "tai_chinh.canh_bao_qua_han_ngay": 3,
        "tu_dong.gio_quet_hang_ngay": 7,
      },
    }),
  );
  const ttDu = await voi(T, gd, (nc) => trangThaiQuyTac(nc.tx));
  dat("Đặt ngưỡng xong thì mọi quy tắc đều sẵn sàng", ttDu.every((q) => q.chay), ttDu.filter((q) => !q.chay).map((q) => q.ma).join(","));

  // ------------------------------------------------------------------
  console.log("\n— BT: hợp đồng bảo trì định kỳ —");

  await nemLoi("Ngày kết thúc trước ngày bắt đầu bị chặn", "dinh-dang", () =>
    voi(T, cskh, (nc) =>
      taoHopDongBaoTri(nc, LuocDoTaoHopDongBaoTri.parse({
        khachHangId: khach.id,
        ten: "Hợp đồng sai ngày",
        ngayBatDau: homNay,
        ngayKetThuc: congNgay(homNay, -1),
        chuKyThang: 3,
      })),
    ),
  );

  const hd = await voi(T, cskh, (nc) =>
    taoHopDongBaoTri(nc, LuocDoTaoHopDongBaoTri.parse({
      khachHangId: khach.id,
      ten: `Bảo trì camera ${DAU}`,
      phamVi: "Vệ sinh, kiểm tra, thay vật tư hao mòn",
      ngayBatDau: congNgay(homNay, -10),
      ngayKetThuc: congThang(homNay, 12),
      chuKyThang: 3,
      giaTri: "12.000.000",
    })),
  );
  dat("BT-01: hợp đồng có mã BT-", hd.ma.startsWith("BT-"), hd.ma);

  const ct = await voi(T, cskh, (nc) => chiTietHopDongBaoTri(nc, hd.id));
  dat("BT-02: chưa bảo trì lần nào thì kỳ đầu là ngày bắt đầu", ct.hopDong.kyKeTiep === congNgay(homNay, -10));
  dat("Kỳ đầu đã qua nên tình trạng là trễ kỳ", ct.hopDong.tinhTrangKy === "tre-ky");

  await nemLoi("Không ghi nhận bảo trì cho ngày tương lai", "dinh-dang", () =>
    voi(T, cskh, (nc) => ghiNhanBaoTri(nc, hd.id, { ngayBaoTri: congNgay(homNay, 1), ghiChu: "" })),
  );
  await nemLoi("Không ghi nhận bảo trì trước ngày bắt đầu hợp đồng", "dinh-dang", () =>
    voi(T, cskh, (nc) => ghiNhanBaoTri(nc, hd.id, { ngayBaoTri: congNgay(homNay, -30), ghiChu: "" })),
  );

  const ghi = await voi(T, cskh, (nc) => ghiNhanBaoTri(nc, hd.id, { ngayBaoTri: congNgay(homNay, -5), ghiChu: "Đã vệ sinh 12 mắt camera" }));
  dat("BT-03: ghi nhận xong thì kỳ kế tiếp đẩy lên đúng chu kỳ", ghi.kyKeTiep === congThang(congNgay(homNay, -5), 3), String(ghi.kyKeTiep));
  const ct2 = await voi(T, cskh, (nc) => chiTietHopDongBaoTri(nc, hd.id));
  dat("Sau ghi nhận, hợp đồng không còn trễ kỳ", ct2.hopDong.tinhTrangKy === "cho-ky-sau", ct2.hopDong.tinhTrangKy);

  const dsHd = await voi(T, cskh, (nc) => danhSachHopDongBaoTri(nc, { q: "", trangThai: "", khachHang: "", trang: 1, coTrang: 20 }));
  dat("Danh sách mặc định chỉ hiện hợp đồng đang hiệu lực", dsHd.dong.length === 1 && dsHd.dong[0].id === hd.id);

  await voi(T, cskh, (nc) => suaHopDongBaoTri(nc, hd.id, { chuKyThang: 6 }));
  const ct3 = await voi(T, cskh, (nc) => chiTietHopDongBaoTri(nc, hd.id));
  dat("Đổi chu kỳ thì kỳ kế tiếp tính lại", ct3.hopDong.kyKeTiep === congThang(congNgay(homNay, -5), 6), String(ct3.hopDong.kyKeTiep));

  // Hợp đồng ngắn: ghi nhận kỳ cuối thì tự hết hạn.
  const hdNgan = await voi(T, cskh, (nc) =>
    taoHopDongBaoTri(nc, LuocDoTaoHopDongBaoTri.parse({
      khachHangId: khach.id,
      ten: `Bảo trì ngắn hạn ${DAU}`,
      ngayBatDau: congNgay(homNay, -2),
      ngayKetThuc: congNgay(homNay, 1),
      chuKyThang: 3,
    })),
  );
  const ghiNgan = await voi(T, cskh, (nc) => ghiNhanBaoTri(nc, hdNgan.id, { ngayBaoTri: homNay, ghiChu: "" }));
  dat("BT-04: hết kỳ cuối thì không còn kỳ kế tiếp", ghiNgan.kyKeTiep === null);
  const ctNgan = await voi(T, cskh, (nc) => chiTietHopDongBaoTri(nc, hdNgan.id));
  dat("BT-04: hợp đồng tự chuyển sang Hết hạn", ctNgan.hopDong.trangThai === "het-han", ctNgan.hopDong.trangThai);
  await nemLoi("Hợp đồng hết hạn thì không ghi nhận bảo trì nữa", "nghiep-vu", () =>
    voi(T, cskh, (nc) => ghiNhanBaoTri(nc, hdNgan.id, { ngayBaoTri: homNay, ghiChu: "" })),
    "sai-trang-thai",
  );

  await voi(T, cskh, (nc) => huyHopDongBaoTri(nc, hdNgan.id, "Khách dừng hợp tác"));
  const ctHuy = await voi(T, cskh, (nc) => chiTietHopDongBaoTri(nc, hdNgan.id));
  dat("Hủy hợp đồng giữ lại lý do và xóa mốc kỳ", ctHuy.hopDong.trangThai === "huy" && ctHuy.hopDong.lyDoHuy === "Khách dừng hợp tác");
  await nemLoi("Hủy lần hai bị chặn", "nghiep-vu", () => voi(T, cskh, (nc) => huyHopDongBaoTri(nc, hdNgan.id, "lần nữa")), "da-huy");

  // ------------------------------------------------------------------
  console.log("\n— Quy tắc bảo trì tới kỳ bắt được hợp đồng trễ —");

  const hdTre = await voi(T, cskh, (nc) =>
    taoHopDongBaoTri(nc, LuocDoTaoHopDongBaoTri.parse({
      khachHangId: khach.id,
      ten: `Bảo trì đang trễ kỳ ${DAU}`,
      ngayBatDau: congNgay(homNay, -20),
      ngayKetThuc: congThang(homNay, 12),
      chuKyThang: 3,
    })),
  );
  const ngayMai = congNgay(homNay, 1);
  const quetMai = await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: ngayMai, trigger: "tay", nguoiChayId: gd }));
  dat("Bản quét ngày khác sinh việc mới", quetMai.soViec > 0, `${quetMai.soViec}`);
  const viecCskh = await voi(T, cskh, (nc) => viecHomNay(nc, ngayMai));
  dat(
    "Hợp đồng trễ kỳ vào danh sách của người phụ trách",
    viecCskh.dong.some((v) => v.maQuyTac === "bao-tri-den-ky" && v.doiTuongId === hdTre.id),
  );

  // ------------------------------------------------------------------
  console.log("\n— GH: gia hạn —");

  const dsGh = await voi(T, cskh, (nc) => danhSachGiaHan(nc, { q: "", trangThai: "tat-ca", nguon: "", trang: 1, coTrang: 20 }));
  dat("Chưa có bảo hành sắp hết thì lịch gia hạn rỗng", dsGh.tong === 0, `${dsGh.tong}`);

  // Dựng thẳng một dòng gia hạn từ hợp đồng bảo trì để thử luồng chốt.
  await chu.renewal.create({
    data: {
      tenantId: T,
      sourceType: "bao-tri",
      maintenanceContractId: hd.id,
      customerId: khach.id,
      ownerId: nvKd,
      title: `Gia hạn hợp đồng bảo trì ${DAU}`,
      dueDate: new Date(`${congNgay(homNay, 20)}T00:00:00Z`),
    },
  });
  const dsGh2 = await voi(T, cskh, (nc) => danhSachGiaHan(nc, { q: "", trangThai: "", nguon: "", trang: 1, coTrang: 20 }));
  dat("GH-01: dòng gia hạn hiện ở trạng thái chờ chốt", dsGh2.tong === 1 && dsGh2.dong[0].trangThai === "moi");
  dat("Số ngày còn lại tính đúng", dsGh2.dong[0].soNgayConLai === 20, String(dsGh2.dong[0].soNgayConLai));
  const ghId = dsGh2.dong[0].id;

  await nemLoi("Chăm sóc khách hàng không có quyền bán thì không chốt được", "quyen", () =>
    voi(T, cskh, (nc) =>
      chotGiaHan(nc, ghId, LuocDoChotGiaHan.parse({ hanhDongKeTiep: "Gọi khách", ngayHanhDong: homNay })),
    ),
  );

  const chot = await voi(T, tpKd, (nc) =>
    chotGiaHan(nc, ghId, LuocDoChotGiaHan.parse({
      tieuDe: `Gia hạn bảo trì ${DAU}`,
      giaTri: "12.000.000",
      hanhDongKeTiep: "Gọi khách xác nhận gia hạn",
      ngayHanhDong: congNgay(homNay, 2),
      nguoiPhuTrachId: nvKd,
    })),
  );
  dat("GH-03: chốt gia hạn sinh cơ hội có mã CH-", chot.maCoHoi.startsWith("CH-"), chot.maCoHoi);
  const dsGh3 = await voi(T, cskh, (nc) => danhSachGiaHan(nc, { q: "", trangThai: "tat-ca", nguon: "", trang: 1, coTrang: 20 }));
  dat("Dòng gia hạn chuyển sang Đã mở cơ hội và giữ liên kết", dsGh3.dong[0].trangThai === "da-tao-co-hoi" && dsGh3.dong[0].coHoi?.id === chot.coHoiId);
  await nemLoi("Chốt lại một dòng đã xử lý bị chặn", "nghiep-vu", () =>
    voi(T, tpKd, (nc) => chotGiaHan(nc, ghId, LuocDoChotGiaHan.parse({ hanhDongKeTiep: "Gọi lại", ngayHanhDong: homNay }))),
    "da-xu-ly",
  );
  await nemLoi("Bỏ qua một dòng đã xử lý bị chặn", "nghiep-vu", () => voi(T, cskh, (nc) => boQuaGiaHan(nc, ghId, "thôi")), "da-xu-ly");

  // Dòng thứ hai để thử bỏ qua.
  const gh2 = await chu.renewal.create({
    data: {
      tenantId: T,
      sourceType: "bao-tri",
      maintenanceContractId: hdTre.id,
      customerId: khach.id,
      ownerId: nvKd,
      title: `Gia hạn thứ hai ${DAU}`,
      dueDate: new Date(`${congNgay(homNay, 30)}T00:00:00Z`),
    },
  });
  await voi(T, cskh, (nc) => boQuaGiaHan(nc, gh2.id, "Khách đã thanh lý thiết bị"));
  const dsGh4 = await voi(T, cskh, (nc) => danhSachGiaHan(nc, { q: "", trangThai: "bo-qua", nguon: "", trang: 1, coTrang: 20 }));
  dat("GH-04: bỏ qua giữ lại lý do", dsGh4.dong.length === 1 && dsGh4.dong[0].lyDoBoQua === "Khách đã thanh lý thiết bị");

  // ------------------------------------------------------------------
  console.log("\n— Cách ly: bản quét của doanh nghiệp này không chạm doanh nghiệp khác —");

  const tenant2 = await seedNenMong(chu, `thu-td2-${DAU}`, "Doanh nghiệp thử thứ hai");
  const gd2 = await (async () => {
    const vt = (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant2.id, code: "ceo" } } })).id;
    return (
      await chu.user.create({
        data: {
          tenantId: tenant2.id,
          email: `gd2.${DAU}@thu.test`,
          passwordHash: "x",
          fullName: "giam-doc-2",
          userRoles: { create: { tenantId: tenant2.id, roleId: vt } },
          staffProfile: { create: { tenantId: tenant2.id } },
        },
      })
    ).id;
  })();
  const quet2 = await voi(tenant2.id, gd2, (nc) => chayQuet(nc.tx, tenant2.id, { ngay: homNay, trigger: "tay", nguoiChayId: gd2 }));
  dat("Doanh nghiệp mới không nhận việc nào của doanh nghiệp cũ", quet2.soViec === 0, `${quet2.soViec}`);
  const soViecT = await chu.dailyActionItem.count({ where: { tenantId: T } });
  const soViecT2 = await chu.dailyActionItem.count({ where: { tenantId: tenant2.id } });
  dat("Việc hôm nay nằm đúng doanh nghiệp của nó", soViecT > 0 && soViecT2 === 0, `${soViecT} / ${soViecT2}`);

  // ------------------------------------------------------------------
  console.log("\n— Lần chạy nền ghi lại đầy đủ —");

  const lanChay = await chu.jobRun.findMany({ where: { tenantId: T }, orderBy: { startedAt: "desc" } });
  dat("Mọi lần chạy đều kết thúc ở trạng thái xong", lanChay.every((l) => l.status === "xong" && l.finishedAt !== null));
  dat("Lần chạy ghi lại chi tiết từng quy tắc", lanChay.every((l) => Array.isArray((l.detail as { quyTac?: unknown[] }).quyTac)));
  dat("Lần chạy tay ghi lại người bấm", lanChay.every((l) => l.trigger !== "tay" || l.startedBy !== null));

  await ketLuan("Thử Tự động hóa, Việc hôm nay, Bảo trì, Gia hạn");
}

main().catch((e) => {
  console.error("Bài thử gặp lỗi ngoài dự kiến:", e);
  process.exit(1);
});
