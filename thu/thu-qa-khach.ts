import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { chiTietKhachHang, danhSachKhachHang, suaKhachHang, taoKhachHang, taoLienHe } from "../src/modules/khach-hang/service";
import { LuocDoLocKhachHang, LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoCoHoi } from "../src/modules/co-hoi/service";
import { LuocDoTaoCoHoi } from "../src/modules/co-hoi/luoc-do";
import { chayQuet } from "../src/modules/nhac-viec/service";
import { danhSachTrangThaiHanhTrinh, doiHanhTrinh, suaTrangThaiHanhTrinh, taoTrangThaiHanhTrinh, tongQuanHanhTrinh, xepThuTuTrangThai } from "../src/modules/hanh-trinh/service";
import { LuocDoTrangThaiHanhTrinh } from "../src/modules/hanh-trinh/luoc-do";
import { ganKhachVaoNhom, taoNhomKhach } from "../src/modules/nhom-khach/service";
import { thaoTacHangLoat } from "../src/modules/khach-hang/hang-loat";
import { goBoLoc, luuBoLoc, LuocDoLuuBoLoc, LuocDoTuyChonDanhSach, luuTuyChonDanhSach, tuyChonDanhSach } from "../src/modules/khach-hang/bo-loc";
import { THAM_SO_LOC } from "../src/modules/khach-hang/danh-muc-loc";
import { diemCuaKhach, tinhLaiToanBo, xemCauHinhDiem } from "../src/modules/cham-diem/service";
import { cotThamChieuKhach, gopKhach, xemTruocGop } from "../src/modules/khach-hang/gop";
import { nhapKhachCsv, xuatKhachCsv } from "../src/modules/khach-hang/nhap-xuat";
import { banGiao, xemTruocBanGiao } from "../src/modules/ban-giao/service";
import { timCongCu } from "../src/modules/tro-ly/cong-cu";
import { timKiemToanCuc } from "../src/modules/tim-kiem/service";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * KIỂM THỬ ĐỐI KHÁNG (QA độc lập) gói "Khách hàng nâng cao" (0.16.0).
 * Nhắm vào chỗ dễ sai: cách ly tenant ở 6 bảng mới (qua service lẫn truy vấn thẳng bằng vai
 * cowork_app), phạm vi own/team ở mọi lối đọc mới, gộp khách (ca biên + tranh chấp đồng thời),
 * hành trình chỉ-ghi-thêm, bộ lọc / cột độc hại, CSV (công thức khi xuất, BOM, `;`, trùng trong tệp,
 * 2.000 dòng trong hạn giao dịch 5 giây), nhắc việc (29/02, giờ VN gần nửa đêm), bàn giao,
 * và script scripts/nhap-tu-itw-crm.ts.
 *
 * Bài ĐỎ ở đây là lỗi thật đã xác nhận — xem báo cáo QA. CHỈ chạy trên CSDL phát triển.
 *   npm run thu:qa-khach
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DAU = Date.now().toString(36);
const so8 = String(Date.now()).slice(-8);
const MST = (dau: string) => `${dau}${so8}`;
const HOM_NAY = homNayVN();
const NGAY_MAI = congNgay(HOM_NAY, 1);
const ITW_DB = process.env.QA_ITW_DB ?? "/tmp/claude-0/-home-user/cba7550c-49b8-53c6-8684-345cc56cbba2/scratchpad/qa-khach-itw/itwcrm.db";

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-qa-khach"));
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
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message.slice(0, 300)}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

async function nemLoiCsdl(ten: string, khoi: () => Promise<unknown>) {
  try {
    await khoi();
    dat(ten, false, "CSDL không chặn");
  } catch {
    dat(ten, true);
  }
}

/** Mỗi phần chạy độc lập: một ngoại lệ bất ngờ (lỗi 500) ghi thành HỎNG rồi chạy phần sau. */
async function phan(ten: string, viec: () => Promise<void>) {
  console.log(`\n— ${ten} —`);
  try {
    await viec();
  } catch (e) {
    dat(`[${ten}] không được ném lỗi bất ngờ (sẽ thành lỗi 500)`, false, e instanceof Error ? `${e.name}: ${e.message.slice(0, 400)}` : String(e));
  }
}

const loc = (x: Record<string, unknown> = {}) => LuocDoLocKhachHang.parse(x);
const ms = (t0: number) => Date.now() - t0;

async function dungTenant(ma: string, ten: string) {
  const t = await seedNenMong(chu, `${ma}-${DAU}`, ten);
  const T = t.id;
  const vai = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  async function nguoi(tenNguoi: string, vaiTro: string, quanLyId?: string | null) {
    const u = await chu.user.create({
      data: {
        tenantId: T,
        email: `${tenNguoi}.${ma}.${DAU}@thu.test`,
        passwordHash: "x",
        fullName: tenNguoi,
        userRoles: { create: { tenantId: T, roleId: await vai(vaiTro) } },
        staffProfile: { create: { tenantId: T, managerId: quanLyId ?? null } },
      },
    });
    return u.id;
  }
  return { T, code: `${ma}-${DAU}`, nguoi, vai };
}

const taoKhach = (T: string, u: string, ten: string, them: Record<string, unknown> = {}) =>
  voi(T, u, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten, ...them })));

const taoCh = (T: string, u: string, khachHangId: string, tieuDe = "Cơ hội QA") =>
  voi(T, u, (nc) => taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId, tieuDe, giaTri: "1000000", hanhDongKeTiep: "Gọi", ngayHanhDong: NGAY_MAI })));

const BANG_MOI = ["customer_journey_stages", "customer_journey_history", "customer_groups", "customer_group_members", "saved_views", "user_list_preferences"] as const;

async function main() {
  console.log("=== QA đối kháng — Khách hàng nâng cao (0.16.0) ===");
  const A = await dungTenant("qa-khn-a", "QA Khách nâng cao A");
  const T = A.T;
  const gd = await A.nguoi("giam-doc", "ceo");
  const tp = await A.nguoi("truong-phong", "sales-manager");
  const nv1 = await A.nguoi("nv-1", "sales", tp);
  const nv2 = await A.nguoi("nv-2", "sales", tp);
  const nvKhac = await A.nguoi("nv-doi-khac", "sales", null);
  const daNghi = await A.nguoi("da-nghi", "sales", tp);
  await chu.user.update({ where: { id: daNghi }, data: { status: "ngung-hoat-dong" } });
  const aiA = (await chu.user.findFirstOrThrow({ where: { tenantId: T, isSystem: true }, select: { id: true } })).id;

  const B = await dungTenant("qa-khn-b", "QA Khách nâng cao B");
  const gdB = await B.nguoi("giam-doc-b", "ceo");

  const dm = await voi(T, gd, (nc) => danhSachTrangThaiHanhTrinh(nc));
  const st = Object.fromEntries(dm.map((t) => [t.ma, t]));

  // Dữ liệu chung
  const k1 = await taoKhach(T, nv1, `QA Khách Một ${DAU}`, { dienThoai: "0931000001" });
  const k2 = await taoKhach(T, nv2, `QA Khách Hai Bí Mật ${DAU}`, { dienThoai: "0931000002", maSoThue: MST("41") });
  const kB = await taoKhach(B.T, gdB, `QA Khách Doanh Nghiệp B ${DAU}`, { dienThoai: "0931000099" });
  await taoCh(B.T, gdB, kB.id, "Cơ hội của B");
  const nhomA = (await voi(T, gd, (nc) => taoNhomKhach(nc, { ten: `QA Nhóm A ${DAU}`, mau: "#112233" })))!;
  await voi(T, gd, (nc) => ganKhachVaoNhom(nc, nhomA.id, [k1.id, k2.id]));
  const blChungA = await voi(T, tp, (nc) => luuBoLoc(nc, { ten: "Chung của A", thamSo: { nguoiPhuTrach: nv2 }, dungChung: true }));
  await voi(T, nv1, (nc) => luuTuyChonDanhSach(nc, { cot: ["diem"], boLocMacDinhId: blChungA.id }));
  await voi(T, nv1, (nc) => doiHanhTrinh(nc, k1.id, { trangThaiId: st["dang-tu-van"].id, ghiChu: "QA" }));

  // ------------------------------------------------------------------
  await phan("Cách ly tenant — truy vấn thẳng bằng vai cowork_app (6 bảng mới)", async () => {
    for (const bang of BANG_MOI) {
      const r = await app.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${bang}"`);
      dat(`Không đặt app.tenant_id → ${bang} trả 0 dòng`, r[0].n === 0, String(r[0].n));
    }
    for (const bang of BANG_MOI) {
      const n = await voiTenant(B.T, (tx) => tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${bang}" WHERE tenant_id = $1::uuid`, T));
      dat(`Ngữ cảnh B: đọc thẳng ${bang} của A = 0 dòng`, n[0].n === 0, String(n[0].n));
    }
    await nemLoiCsdl("Ngữ cảnh B: INSERT customer_groups mang tenant_id của A bị RLS chặn", () =>
      voiTenant(B.T, (tx) => tx.customerGroup.create({ data: { tenantId: T, name: `Lẻn ${DAU}`, color: "#000000" } })),
    );
    await nemLoiCsdl("Ngữ cảnh B: INSERT saved_views mang tenant_id của A bị RLS chặn", () =>
      voiTenant(B.T, (tx) => tx.savedView.create({ data: { tenantId: T, ownerId: nv1, screen: "khach-hang", name: "Lẻn", filters: {} } })),
    );
    const sua = await voiTenant(B.T, (tx) => tx.$executeRawUnsafe(`UPDATE saved_views SET is_shared = false, name = 'bị B sửa' WHERE id = $1::uuid`, blChungA.id));
    const xoa = await voiTenant(B.T, (tx) => tx.$executeRawUnsafe(`DELETE FROM customer_group_members WHERE group_id = $1::uuid`, nhomA.id));
    const xoaPref = await voiTenant(B.T, (tx) => tx.$executeRawUnsafe(`UPDATE user_list_preferences SET columns = '[]'::jsonb WHERE user_id = $1::uuid`, nv1));
    dat("Ngữ cảnh B: UPDATE/DELETE thẳng dữ liệu A ảnh hưởng 0 dòng", sua === 0 && xoa === 0 && xoaPref === 0, `${sua}/${xoa}/${xoaPref}`);
    const blSau = await chu.savedView.findUniqueOrThrow({ where: { id: blChungA.id } });
    dat("Bộ lọc dùng chung của A còn nguyên", blSau.isShared && blSau.name === "Chung của A");
    dat("Thành viên nhóm A còn nguyên", (await chu.customerGroupMember.count({ where: { groupId: nhomA.id } })) === 2);
    await nemLoiCsdl("Ngữ cảnh A (vai cowork_app): DELETE lịch sử hành trình bị trigger chặn", () =>
      voiTenant(T, (tx) => tx.$executeRawUnsafe(`DELETE FROM customer_journey_history WHERE customer_id = $1::uuid`, k1.id)),
    );
    await nemLoiCsdl("Ngữ cảnh A (vai cowork_app): UPDATE lịch sử hành trình bị trigger chặn", () =>
      voiTenant(T, (tx) => tx.$executeRawUnsafe(`UPDATE customer_journey_history SET note = 'sửa' WHERE customer_id = $1::uuid`, k1.id)),
    );
    await nemLoiCsdl("CSDL chặn dòng lịch sử 'đổi' mà từ = sang", () =>
      chu.customerJourneyHistory.create({ data: { tenantId: T, customerId: k1.id, fromStageId: st["khach-moi"].id, toStageId: st["khach-moi"].id } }),
    );
    // Ghi chú (không chấm điểm): khóa ngoại một cột không kiểm tenant — PostgreSQL kiểm FK bỏ qua RLS.
    try {
      const nhomB = (await voi(B.T, gdB, (nc) => taoNhomKhach(nc, { ten: `QA Nhóm B ${DAU}`, mau: "#445566" })))!;
      await voiTenant(B.T, (tx) => tx.customerGroupMember.create({ data: { tenantId: B.T, groupId: nhomB.id, customerId: k1.id } }).then(() => { throw new Error("cuon-nguoc"); }));
    } catch (e) {
      const coLot = e instanceof Error && e.message === "cuon-nguoc";
      console.log(`  ⓘ GHI CHÚ: ở mức CSDL, B ${coLot ? "CÓ THỂ" : "không thể"} gắn khách của A (biết UUID) vào nhóm của B — FK một cột không kiểm tenant (mẫu chung của Cowork, service đã chặn).`);
    }
  });

  await phan("Cách ly tenant — qua service (B thao tác lên dữ liệu A)", async () => {
    await nemLoi("B không gắn khách của mình vào nhóm của A", "khong-thay", () => voi(B.T, gdB, (nc) => ganKhachVaoNhom(nc, nhomA.id, [kB.id])));
    await nemLoi("B không thao tác hàng loạt lên khách của A", "nghiep-vu", () => voi(B.T, gdB, (nc) => thaoTacHangLoat(nc, { ids: [k1.id], thaoTac: "doi-phu-trach", giaTri: gdB })), "ngoai-pham-vi");
    await nemLoi("B không gộp khách của A vào khách của B", "khong-thay", () => voi(B.T, gdB, (nc) => gopKhach(nc, { giuLaiId: kB.id, biGopId: k1.id, lyDo: "Lẻn gộp" })));
    await nemLoi("B không xem trước bàn giao nhân viên của A", "khong-thay", () => voi(B.T, gdB, (nc) => xemTruocBanGiao(nc, nv1)));
    const nvB = await B.nguoi("nv-b", "sales");
    await nemLoi("B không bàn giao việc của mình cho nhân viên của A", "khong-thay", () => voi(B.T, gdB, (nc) => banGiao(nc, nvB, { nguoiNhanId: nv1, khoaTaiKhoan: false })));
    await nemLoi("A không bàn giao cho nhân viên của B", "khong-thay", () => voi(T, gd, (nc) => banGiao(nc, nv2, { nguoiNhanId: nvB, khoaTaiKhoan: false })));
    await nemLoi("B không đặt bộ lọc dùng chung của A làm mặc định", "khong-thay", () => voi(B.T, gdB, (nc) => luuTuyChonDanhSach(nc, { boLocMacDinhId: blChungA.id })));
    await nemLoi("B không gỡ bộ lọc của A", "khong-thay", () => voi(B.T, gdB, (nc) => goBoLoc(nc, blChungA.id)));
    await nemLoi("B không đổi khách của A sang trạng thái hành trình của B", "khong-thay", () => voi(B.T, gdB, (nc) => doiHanhTrinh(nc, k1.id, { trangThaiId: st["khach-moi"].id, ghiChu: null })));
    await nemLoi("B không ngừng trạng thái hành trình của A", "khong-thay", () => voi(B.T, gdB, (nc) => suaTrangThaiHanhTrinh(nc, st["da-chot-don"].id, { trangThai: "ngung-hoat-dong" })));
    await nemLoi("B không xem điểm khách của A", "khong-thay", () => voi(B.T, gdB, (nc) => diemCuaKhach(nc, k1.id)));
    const xB = await voi(B.T, gdB, (nc) => xuatKhachCsv(nc, {}));
    dat("Xuất CSV của B không chứa khách A", !xB.noiDung.includes(`QA Khách Một ${DAU}`) && xB.noiDung.includes(`Doanh Nghiệp B ${DAU}`));
    const tqB = await voi(B.T, gdB, (nc) => tongQuanHanhTrinh(nc, {}));
    dat("Phễu / tổng quan của B chỉ đếm 1 khách của B", tqB.tong === 1, String(tqB.tong));
    const tlB = await voi(B.T, gdB, (nc) => tinhLaiToanBo(nc));
    dat("Tính lại toàn bộ ở B chỉ chạm khách của B", tlB.soKhach === 1, JSON.stringify(tlB));
  });

  // ------------------------------------------------------------------
  await phan("Phạm vi: sale 'own' trên mọi lối đọc mới", async () => {
    const x = await voi(T, nv1, (nc) => xuatKhachCsv(nc, { nguoiPhuTrach: nv2 }));
    dat("Xuất CSV với nguoiPhuTrach = đồng nghiệp → chỉ dòng tiêu đề", x.noiDung.trim().split("\r\n").length === 1);
    const xNhom = await voi(T, nv1, (nc) => xuatKhachCsv(nc, { nhom: nhomA.id }));
    dat("Xuất CSV theo nhóm chung → không lộ khách NV2", !xNhom.noiDung.includes("Hai Bí Mật"));
    const tq = await voi(T, nv1, (nc) => tongQuanHanhTrinh(nc, { nguoiPhuTrach: nv2 }));
    dat("Phễu với bộ lọc người phụ trách = đồng nghiệp → 0", tq.tong === 0 && tq.pheu.tong === 0);
    // Chưa đặt ngưỡng → thống kê chỉ đếm được "chưa có điểm": làm hai khách (NV1, NV2) mất điểm để so phạm vi.
    const kDiem2 = await taoKhach(T, nv2, `QA Chưa điểm NV2 ${DAU}`);
    const kDiem1 = await taoKhach(T, nv1, `QA Chưa điểm NV1 ${DAU}`);
    await chu.customer.updateMany({ where: { id: { in: [kDiem1.id, kDiem2.id] } }, data: { leadScore: null, leadScoreAt: null } });
    const ch = await voi(T, nv1, (nc) => xemCauHinhDiem(nc));
    const chuaCoNv1 = await chu.customer.count({ where: { tenantId: T, ownerId: nv1, leadScore: null, status: { notIn: ["da-gop", "ngung-giao-dich"] } } });
    dat("Thống kê điểm của NV1 chỉ đếm khách NV1 (chưa có điểm)", ch.thongKe.chuaCo === chuaCoNv1, `${ch.thongKe.chuaCo} vs ${chuaCoNv1}`);
    const cc = (await voi(T, nv1, (nc) => timCongCu("tim_khach_hang")!.chay(nc, { tuKhoa: "Hai Bí Mật" }))) as { tong: number };
    dat("Trợ lý tim_khach_hang: NV1 không thấy khách NV2", cc.tong === 0);
    await nemLoi("Trợ lý diem_hanh_trinh_khach: NV1 không đọc khách NV2", "khong-thay", () => voi(T, nv1, (nc) => timCongCu("diem_hanh_trinh_khach")!.chay(nc, { khachHangId: k2.id })));
    const tk = await voi(T, nv1, (nc) => timKiemToanCuc(nc, "Hai Bí Mật"));
    dat("Tìm kiếm toàn cục: NV1 không thấy khách NV2", !tk.some((r) => r.loai === "khach-hang"));
    await nemLoi("Sale không xem trước gộp", "quyen", () => voi(T, nv1, (nc) => xemTruocGop(nc, k1.id, k2.id)));
    await nemLoi("Sale không gộp khách (kể cả hai khách của chính mình)", "quyen", async () => {
      const k1c = await taoKhach(T, nv1, `QA NV1 phụ ${DAU}`);
      return voi(T, nv1, (nc) => gopKhach(nc, { giuLaiId: k1.id, biGopId: k1c.id, lyDo: "Trùng" }));
    });
    await nemLoi("Sale không bàn giao", "quyen", () => voi(T, nv1, (nc) => banGiao(nc, nv2, { nguoiNhanId: nv1, khoaTaiKhoan: false })));
    await nemLoi("Sale không tạo trạng thái hành trình", "quyen", () => voi(T, nv1, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: "Lẻn", mau: "#123456" }))));
    await nemLoi("Sale không lưu bộ lọc dùng chung", "quyen", () => voi(T, nv1, (nc) => luuBoLoc(nc, { ten: "Chung lẻn", thamSo: {}, dungChung: true })));
    // Trưởng phòng (team) đổi người phụ trách hàng loạt
    await nemLoi("TP không giao khách hàng loạt cho sale ngoài đội", "nghiep-vu", () => voi(T, tp, (nc) => thaoTacHangLoat(nc, { ids: [k1.id], thaoTac: "doi-phu-trach", giaTri: nvKhac })), "ngoai-pham-vi");
    await nemLoi("TP không giao khách hàng loạt cho Giám đốc (ngoài phạm vi)", "nghiep-vu", () => voi(T, tp, (nc) => thaoTacHangLoat(nc, { ids: [k1.id], thaoTac: "doi-phu-trach", giaTri: gd })), "ngoai-pham-vi");
    await nemLoi("Không giao hàng loạt cho người đã nghỉ", "nghiep-vu", () => voi(T, gd, (nc) => thaoTacHangLoat(nc, { ids: [k1.id], thaoTac: "doi-phu-trach", giaTri: daNghi })), "nguoi-phu-trach");
    await nemLoi("Không giao hàng loạt cho tài khoản máy (trợ lý AI)", "nghiep-vu", () => voi(T, gd, (nc) => thaoTacHangLoat(nc, { ids: [k1.id], thaoTac: "doi-phu-trach", giaTri: aiA })), "nguoi-phu-trach");
    dat("Khách k1 vẫn của NV1 sau các lô bị từ chối", (await chu.customer.findUniqueOrThrow({ where: { id: k1.id } })).ownerId === nv1);
    const trungId = await voi(T, nv1, (nc) => thaoTacHangLoat(nc, { ids: [k1.id, k1.id, k1.id], thaoTac: "gan-nhom", giaTri: nhomA.id }));
    dat("Lô có id lặp được gộp, không lỗi trùng khóa", trungId.soKhach === 1);
    await nemLoi("Lô gắn nhóm không tồn tại / của tenant khác", "khong-thay", async () => {
      const nB = await chu.customerGroup.findFirstOrThrow({ where: { tenantId: B.T } });
      return voi(T, gd, (nc) => thaoTacHangLoat(nc, { ids: [k1.id], thaoTac: "gan-nhom", giaTri: nB.id }));
    });
  });

  // ------------------------------------------------------------------
  await phan("Gộp khách — ca biên", async () => {
    await nemLoi("Gộp khách vào chính nó bị chặn", "nghiep-vu", () => voi(T, gd, (nc) => gopKhach(nc, { giuLaiId: k1.id, biGopId: k1.id, lyDo: "Tự gộp" })), "cung-khach");
    const x = await taoKhach(T, nv1, `QA Gộp X ${DAU}`, { email: "trung@qa.test", lienHe: { hoTen: "Chị Trùng", email: "lienhe@qa.test", laChinh: true } });
    const y = await taoKhach(T, nv2, `QA Gộp Y ${DAU}`, { email: "trung@qa.test", lienHe: { hoTen: "Chị Trùng", email: "lienhe@qa.test", laChinh: true } });
    await voi(T, gd, (nc) => ganKhachVaoNhom(nc, nhomA.id, [x.id, y.id]));
    await taoCh(T, nv2, y.id, "Cơ hội của Y");
    const ds = await voi(T, gd, (nc) => cotThamChieuKhach(nc.tx));
    const dem = async (id: string) => {
      const kq: Record<string, number> = {};
      for (const { bang, cot } of ds) kq[`${bang}.${cot}`] = (await chu.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${bang}" WHERE "${cot}" = $1::uuid`, id))[0].n;
      return kq;
    };
    const tX = await dem(x.id);
    const tY = await dem(y.id);
    const auditTruoc = await chu.auditLog.count({ where: { tenantId: T, action: "gop-khach" } });
    await voi(T, tp, (nc) => gopKhach(nc, { giuLaiId: x.id, biGopId: y.id, lyDo: "Trùng email, cùng nhóm, liên hệ trùng" }));
    const sX = await dem(x.id);
    const sY = await dem(y.id);
    const mat: string[] = [];
    for (const k of Object.keys(tX)) {
      if (k === "customers.merged_into_id") continue;
      const truoc = tX[k] + tY[k] - (k === "customer_group_members.customer_id" ? 1 : 0);
      if (sX[k] + sY[k] !== truoc) mat.push(`${k}: ${tX[k] + tY[k]}→${sX[k] + sY[k]}`);
    }
    dat("Hai khách cùng nhóm + liên hệ trùng email: gộp không lỗi, không mất bản ghi", mat.length === 0, mat.join("; "));
    dat("Khách giữ lại còn đúng 1 dòng trong nhóm chung", (await chu.customerGroupMember.count({ where: { groupId: nhomA.id, customerId: x.id } })) === 1);
    dat("Khách giữ lại có 2 liên hệ (giữ cả hai, chỉ 1 chính)", (await chu.contact.count({ where: { customerId: x.id } })) === 2 && (await chu.contact.count({ where: { customerId: x.id, isPrimary: true } })) === 1);
    dat("Audit gộp: 2 dòng mới (khách giữ + khách bị gộp)", (await chu.auditLog.count({ where: { tenantId: T, action: "gop-khach" } })) === auditTruoc + 2);

    await nemLoi("Gộp lại khách đã da-gop (làm khách bị gộp) bị chặn", "nghiep-vu", () => voi(T, gd, (nc) => gopKhach(nc, { giuLaiId: x.id, biGopId: y.id, lyDo: "Gộp lần hai" })), "da-gop");
    await nemLoi("Gộp chéo B→A sau A→B (khách da-gop làm khách giữ lại) bị chặn", "nghiep-vu", () => voi(T, gd, (nc) => gopKhach(nc, { giuLaiId: y.id, biGopId: x.id, lyDo: "Gộp ngược" })), "da-gop");
    await nemLoi("Xem trước gộp với khách đã gộp cũng bị chặn", "nghiep-vu", () => voi(T, gd, (nc) => xemTruocGop(nc, y.id, x.id)), "da-gop");

    // Khách giữ lại đang ngừng giao dịch
    const ng = await taoKhach(T, nv1, `QA Ngừng GD ${DAU}`);
    await voi(T, gd, (nc) => suaKhachHang(nc, ng.id, { trangThai: "ngung-giao-dich", xacNhanKhongTrung: false }));
    const vao = await taoKhach(T, nv1, `QA Vào ngừng ${DAU}`);
    const chVao = await taoCh(T, nv1, vao.id, "Cơ hội sang khách ngừng");
    await voi(T, gd, (nc) => gopKhach(nc, { giuLaiId: ng.id, biGopId: vao.id, lyDo: "Gộp vào khách ngừng" }));
    dat("Gộp vào khách ngừng giao dịch: chạy được, cơ hội chuyển sang", (await chu.opportunity.findUniqueOrThrow({ where: { id: chVao.id } })).customerId === ng.id);

    // Sau gộp: khách bị gộp không còn hiện ở các lối đọc
    const tenY = `QA Gộp Y ${DAU}`;
    dat("Danh sách mặc định ẩn khách bị gộp", (await voi(T, gd, (nc) => danhSachKhachHang(nc, loc({ q: tenY })))).tong === 0);
    const ccTim = (await voi(T, gd, (nc) => timCongCu("tim_khach_hang")!.chay(nc, { tuKhoa: tenY }))) as { tong: number };
    dat("Trợ lý tim_khach_hang ẩn khách bị gộp", ccTim.tong === 0);
    const xuat = await voi(T, gd, (nc) => xuatKhachCsv(nc, {}));
    dat("Xuất CSV mặc định không có khách bị gộp", !xuat.noiDung.includes(tenY));
    const tk = await voi(T, gd, (nc) => timKiemToanCuc(nc, tenY));
    dat("Tìm kiếm toàn cục (thanh tìm trên cùng) KHÔNG trả khách đã gộp", !tk.some((r) => r.loai === "khach-hang" && r.tieuDe === tenY), JSON.stringify(tk.filter((r) => r.loai === "khach-hang").map((r) => r.tieuDe)));
    await voi(T, gd, (nc) => tinhLaiToanBo(nc));
    dat("Khách bị gộp không có điểm sau tính lại toàn bộ", (await chu.customer.findUniqueOrThrow({ where: { id: y.id } })).leadScore === null);
    const ctY = await voi(T, gd, (nc) => chiTietKhachHang(nc, y.id));
    dat("Mở lại khách bị gộp theo id: thấy trỏ sang khách giữ lại", ctY.trangThai === "da-gop" && ctY.gopVao?.id === x.id);
    await nemLoi("Không đổi hành trình khách đã gộp", "nghiep-vu", () => voi(T, gd, (nc) => doiHanhTrinh(nc, y.id, { trangThaiId: st["khach-moi"].id, ghiChu: null })), "da-gop");
    await nemLoi("Không thêm liên hệ cho khách đã gộp", "nghiep-vu", () => voi(T, gd, (nc) => taoLienHe(nc, y.id, { hoTen: "Người mới" })), "da-gop");
    await nemLoi("Lô hàng loạt có khách đã gộp → từ chối cả lô", "nghiep-vu", () => voi(T, gd, (nc) => thaoTacHangLoat(nc, { ids: [x.id, y.id], thaoTac: "gan-nhom", giaTri: nhomA.id })), "da-gop");

    // Nhắc đứng lâu không nhắc khách đã gộp / ngừng giao dịch
    const ttDl = (await voi(T, gd, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: `QA Đứng lâu gộp ${DAU}`, mau: "#123456", soNgayDungLau: 2 }))))!;
    const cu = new Date(Date.now() - 10 * 86_400_000);
    await chu.customer.updateMany({ where: { id: { in: [y.id, ng.id] } }, data: { journeyStageId: ttDl.id, journeyStageChangedAt: cu } });
    await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: HOM_NAY, trigger: "tay", nguoiChayId: gd }));
    dat("Quét không nhắc 'đứng lâu' cho khách đã gộp / ngừng giao dịch",
      (await chu.dailyActionItem.count({ where: { tenantId: T, ruleCode: "khach-dung-lau", objectId: { in: [y.id, ng.id] } } })) === 0);
    await chu.customer.updateMany({ where: { id: { in: [ng.id] } }, data: { journeyStageId: null, journeyStageChangedAt: null } });
    await voi(T, gd, (nc) => suaTrangThaiHanhTrinh(nc, ttDl.id, { trangThai: "ngung-hoat-dong" }));
    dat("Ngừng được trạng thái chỉ còn khách đã gộp (không tính khách da-gop)", (await chu.customerJourneyStage.findUniqueOrThrow({ where: { id: ttDl.id } })).status === "ngung-hoat-dong");
  });

  await phan("Gộp khách — tranh chấp đồng thời (B→A trong lúc C→B đang chạy)", async () => {
    const kA = await taoKhach(T, nv1, `QA Đua A ${DAU}`, { lienHe: { hoTen: "Anh A", laChinh: true } });
    const kBb = await taoKhach(T, nv1, `QA Đua B ${DAU}`, { lienHe: { hoTen: "Anh B", laChinh: true } });
    const kC = await taoKhach(T, nv1, `QA Đua C ${DAU}`, { lienHe: { hoTen: "Anh C", laChinh: true } });
    const chC = await taoCh(T, nv1, kC.id, "Cơ hội của C");
    let thaKhoa: () => void = () => {};
    const choThaKhoa = new Promise<void>((r) => (thaKhoa = r));
    let daKhoa: () => void = () => {};
    const choDaKhoa = new Promise<void>((r) => (daKhoa = r));
    // Một phiên khác giữ khóa dòng liên hệ của C → giao dịch gộp C→B đọc xong hai khách rồi bị chặn ở bước ghi đầu tiên.
    const giuKhoa = chu.$transaction(async (t) => {
      await t.$queryRawUnsafe(`SELECT id FROM contacts WHERE customer_id = $1::uuid FOR UPDATE`, kC.id);
      daKhoa();
      await choThaKhoa;
    }, { timeout: 30_000 });
    await choDaKhoa;
    const gopCB = voi(T, gd, (nc) => gopKhach(nc, { giuLaiId: kBb.id, biGopId: kC.id, lyDo: "Đua: C vào B" })).then(() => "ok", (e: unknown) => (e instanceof Error ? e.message : String(e)));
    await new Promise((r) => setTimeout(r, 600));
    let kqBA = "ok";
    try {
      await voi(T, gd, (nc) => gopKhach(nc, { giuLaiId: kA.id, biGopId: kBb.id, lyDo: "Đua: B vào A" }));
    } catch (e) {
      kqBA = e instanceof Error ? e.message : String(e);
    }
    thaKhoa();
    await giuKhoa;
    const kqCB = await gopCB;
    const c = await chu.customer.findUniqueOrThrow({ where: { id: kC.id } });
    const b = await chu.customer.findUniqueOrThrow({ where: { id: kBb.id } });
    const chSau = await chu.opportunity.findUniqueOrThrow({ where: { id: chC.id }, select: { customerId: true } });
    const chuSoHuuCh = await chu.customer.findUniqueOrThrow({ where: { id: chSau.customerId } });
    console.log(`    (B→A: ${kqBA}; C→B: ${kqCB}; C.merged_into = ${c.mergedIntoId === kA.id ? "A" : c.mergedIntoId === kBb.id ? "B" : c.mergedIntoId}; B.status = ${b.status})`);
    dat("Không để chuỗi gộp: khách bị gộp không trỏ vào một khách cũng đã gộp",
      !(c.status === "da-gop" && c.mergedIntoId === kBb.id && b.status === "da-gop"),
      "C trỏ vào B trong khi B đã gộp vào A (đọc trạng thái không khóa dòng — TOCTOU)");
    dat("Cơ hội của C không bị treo trên một khách đã gộp (ẩn khỏi danh sách)", chuSoHuuCh.status !== "da-gop", `cơ hội nằm ở ${chuSoHuuCh.code} (${chuSoHuuCh.status})`);
  });

  // ------------------------------------------------------------------
  await phan("Hành trình: trạng thái ngừng, đổi thứ tự, phễu kỳ rỗng", async () => {
    const ttTam = (await voi(T, gd, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: `QA Tạm ${DAU}`, mau: "#654321" }))))!;
    await voi(T, gd, (nc) => suaTrangThaiHanhTrinh(nc, ttTam.id, { trangThai: "ngung-hoat-dong" }));
    await nemLoi("Không đổi khách sang trạng thái đã ngừng", "nghiep-vu", () => voi(T, nv1, (nc) => doiHanhTrinh(nc, k1.id, { trangThaiId: ttTam.id, ghiChu: null })), "trang-thai-ngung");
    const k1Truoc = (await chu.customer.findUniqueOrThrow({ where: { id: k1.id } })).journeyStageId;
    const kLo = await taoKhach(T, nv1, `QA Lô ngừng ${DAU}`);
    await nemLoi("Lô đổi hành trình sang trạng thái ngừng → lỗi, cả lô cuộn ngược", "nghiep-vu", () => voi(T, nv1, (nc) => thaoTacHangLoat(nc, { ids: [k1.id, kLo.id], thaoTac: "doi-hanh-trinh", giaTri: ttTam.id })), "trang-thai-ngung");
    dat("Không khách nào trong lô bị đổi", (await chu.customer.findUniqueOrThrow({ where: { id: k1.id } })).journeyStageId === k1Truoc);

    const truoc = await voi(T, gd, (nc) => danhSachTrangThaiHanhTrinh(nc));
    const ids = truoc.map((t) => t.id);
    const daoNguoc = [...ids].reverse();
    await voi(T, gd, (nc) => xepThuTuTrangThai(nc, daoNguoc));
    const tq = await voi(T, gd, (nc) => tongQuanHanhTrinh(nc, {}));
    const thuTuMoMoi = daoNguoc.filter((id) => truoc.find((t) => t.id === id)!.loai !== "that-bai");
    dat("Đổi thứ tự trạng thái → bước phễu theo đúng thứ tự mới", tq.pheu.buoc.map((b) => b.id).join() === thuTuMoMoi.join());
    dat("Phễu: số đạt không tăng dần theo bước (bước sau ≤ bước trước)", tq.pheu.buoc.every((b, i) => i === 0 || b.soDat <= tq.pheu.buoc[i - 1].soDat));
    await voi(T, gd, (nc) => xepThuTuTrangThai(nc, ids));
    await nemLoi("Sắp xếp có id lặp bị từ chối", "nghiep-vu", () => voi(T, gd, (nc) => xepThuTuTrangThai(nc, [...ids.slice(1), ids[1]])), "lech-danh-sach");
    await nemLoi("Sắp xếp chèn id trạng thái của tenant khác bị từ chối", "nghiep-vu", async () => {
      const sB = await chu.customerJourneyStage.findFirstOrThrow({ where: { tenantId: B.T } });
      return voi(T, gd, (nc) => xepThuTuTrangThai(nc, [...ids.slice(1), sB.id]));
    }, "lech-danh-sach");

    const rong = await voi(T, gd, (nc) => tongQuanHanhTrinh(nc, { tu: "2001-01-01", den: "2001-01-31" }));
    dat("Phễu kỳ không có dữ liệu: tổng 0, mọi tỷ lệ là null (không 0%)",
      rong.pheu.tong === 0 && rong.pheu.tyLeThanhCong === null && rong.pheu.buoc.every((b) => b.tyLeTrenTong === null && b.tyLeTuBuocTruoc === null),
      JSON.stringify(rong.pheu.buoc[0]));
    await nemLoi("Kỳ ngược (từ > đến) bị từ chối", "nghiep-vu", () => voi(T, gd, (nc) => tongQuanHanhTrinh(nc, { tu: "2026-02-02", den: "2026-01-01" })), "khoang-ngay");
  });

  // ------------------------------------------------------------------
  await phan("Bộ lọc đã lưu / cột: giá trị độc hại", async () => {
    const doc = JSON.parse(`{"__proto__":"x","constructor":"y","toString":"z","q":"${"a".repeat(5000)}","sapXep":"__proto__","nhanh":"constructor","nhom":"' OR 1=1 --","hanhTrinh":"chua-co"}`) as Record<string, string>;
    const kqParse = LuocDoLuuBoLoc.safeParse({ ten: "Độc", thamSo: doc });
    if (kqParse.success) {
      const bl = await voi(T, nv1, (nc) => luuBoLoc(nc, kqParse.data));
      const goc = await chu.savedView.findUniqueOrThrow({ where: { id: bl.id } });
      const khoa = Object.keys(goc.filters as object);
      dat("Khóa lạ (__proto__/constructor/toString) và giá trị lạ không vào CSDL", khoa.every((k) => (THAM_SO_LOC as readonly string[]).includes(k)) && khoa.join() === "hanhTrinh", JSON.stringify(goc.filters).slice(0, 200));
      dat("Đọc lại ra đúng tham số sạch", JSON.stringify(bl.thamSo) === JSON.stringify({ hanhTrinh: "chua-co" }), JSON.stringify(bl.thamSo));
    } else {
      dat("Lược đồ bộ lọc từ chối thẳng tham số độc (chấp nhận được)", true);
    }
    dat("Lược đồ: tên bộ lọc quá 100 ký tự bị từ chối", !LuocDoLuuBoLoc.safeParse({ ten: "x".repeat(101), thamSo: {} }).success);
    dat("Lược đồ: tham số lồng (mảng/đối tượng) bị từ chối", !LuocDoLuuBoLoc.safeParse({ ten: "x", thamSo: { q: ["a"] } }).success && !LuocDoLuuBoLoc.safeParse({ ten: "x", thamSo: { q: { $ne: 1 } } }).success);
    dat("Lược đồ cột: mảng lồng / quá 30 cột bị từ chối", !LuocDoTuyChonDanhSach.safeParse({ cot: [["diem"]] }).success && !LuocDoTuyChonDanhSach.safeParse({ cot: Array.from({ length: 31 }, () => "diem") }).success);
    dat("Lược đồ lọc danh sách: sapXep '__proto__' / nhanh 'constructor' bị từ chối", !LuocDoLocKhachHang.safeParse({ sapXep: "__proto__" }).success && !LuocDoLocKhachHang.safeParse({ nhanh: "constructor" }).success);
    for (const cot of [["__proto__"], ["constructor"], ["x".repeat(10_000)], ["diem", "toString"]]) {
      await nemLoi(`Cột lạ ${cot.join(",").slice(0, 20)} bị từ chối`, "nghiep-vu", () => voi(T, nv1, (nc) => luuTuyChonDanhSach(nc, { cot })), "cot-la");
    }
    // CSDL bị sửa tay
    await chu.userListPreference.updateMany({ where: { userId: nv1 }, data: { columns: JSON.parse('{"__proto__":["diem"],"length":3}') } });
    const tc1 = await voi(T, nv1, (nc) => tuyChonDanhSach(nc));
    dat("Cột lưu là đối tượng độc → về bộ mặc định, không lỗi", tc1.cot.includes("phu-trach"));
    await chu.userListPreference.updateMany({ where: { userId: nv1 }, data: { columns: "diem" } });
    dat("Cột lưu là chuỗi → về bộ mặc định", (await voi(T, nv1, (nc) => tuyChonDanhSach(nc))).cot.includes("phu-trach"));
    const blRieng2 = await voi(T, nv2, (nc) => luuBoLoc(nc, { ten: "Riêng NV2", thamSo: { q: "Bí Mật" }, dungChung: false }));
    await nemLoi("NV1 không đặt bộ lọc cá nhân của NV2 làm mặc định", "khong-thay", () => voi(T, nv1, (nc) => luuTuyChonDanhSach(nc, { boLocMacDinhId: blRieng2.id })));
    await nemLoi("NV1 không gỡ bộ lọc cá nhân của NV2", "khong-thay", () => voi(T, nv1, (nc) => goBoLoc(nc, blRieng2.id)));
    await chu.userListPreference.updateMany({ where: { userId: nv1 }, data: { defaultViewId: blRieng2.id } });
    dat("Mặc định trỏ (sửa tay) vào bộ lọc cá nhân người khác → bỏ qua", (await voi(T, nv1, (nc) => tuyChonDanhSach(nc))).macDinh === null);
    await chu.savedView.update({ where: { id: blRieng2.id }, data: { filters: { q: ["x"], nhom: { in: [] }, nguoiPhuTrach: 12, sapXep: "diem" } } });
    const doc2 = await voi(T, nv2, (nc) => tuyChonDanhSach(nc).then(() => luuTuyChonDanhSach(nc, { boLocMacDinhId: blRieng2.id })));
    dat("filters sửa tay kiểu lạ (mảng/đối tượng/số) bị loại khi đọc", JSON.stringify(doc2.macDinh?.thamSo) === JSON.stringify({ sapXep: "diem" }), JSON.stringify(doc2.macDinh?.thamSo));
  });

  // ------------------------------------------------------------------
  await phan("CSV: xuất chống công thức (CSV injection), nhập BOM / ';' / trùng trong tệp / phạm vi", async () => {
    const doc = ["=cmd|' /C calc'!A0", "+SUM(1+1)*cmd|' /C calc'!A0", "-2+3+cmd|' /C calc'!A0", "@SUM(1+1)*cmd|' /C calc'!A0"];
    const kIn = await taoKhach(T, gd, `${doc[0]} ${DAU}`, { ghiChu: doc[1], diaChi: doc[2], website: doc[3] });
    const x = await voi(T, gd, (nc) => xuatKhachCsv(nc, { q: DAU }));
    const dong = x.noiDung.split("\r\n").find((l) => l.includes(kIn.ma)) ?? "";
    const o = dong.split(",").map((s) => s.replace(/^"/, ""));
    const nguyHiem = o.filter((s) => /^[=+\-@\t\r]/.test(s));
    dat("Xuất CSV: ô bắt đầu bằng = + - @ phải được vô hiệu (thêm ' hoặc tab) — chống CSV injection", nguyHiem.length === 0, `ô nguy hiểm: ${nguyHiem.join(" | ").slice(0, 200)}`);

    const csvBom = "﻿Tên;Điện thoại;MST\n" + `QA Nhập BOM Một ${DAU};0932000001;${MST("51")}\n` + `QA Nhập BOM Hai ${DAU};0932000002;${MST("51")}\n` + `QA Nhập BOM Ba ${DAU};0932000003;\n`;
    const kq = await voi(T, gd, (nc) => nhapKhachCsv(nc, { tenTep: "bom.csv", noiDung: csvBom, ghiThat: true, xacNhanTrung: true }));
    dat("CSV có BOM + dấu ';' đọc đúng cột", kq.cotLa.length === 0 && kq.tongDong === 3, JSON.stringify(kq.cotLa));
    dat("Dòng trùng MST trong cùng tệp: dòng sau bị bỏ, kèm lý do", kq.soTao === 2 && kq.dong.find((d) => d.soDong === 3)?.loi?.includes("cùng tệp") === true, JSON.stringify(kq.dong));

    const ngaySai = ["29/02/1991", "1990-02-29", "01/01/2999", "00/01/1990", "1990/01/01"];
    const csvNgay = ["Tên,Liên hệ,Ngày sinh", ...ngaySai.map((n, i) => `QA Ngày sai ${i} ${DAU},Người ${i},${n}`)].join("\n");
    const kqN = await voi(T, gd, (nc) => nhapKhachCsv(nc, { tenTep: "ngay.csv", noiDung: csvNgay, ghiThat: false, xacNhanTrung: true }));
    dat("Ngày sinh sai (29/02 năm thường, tương lai, ngày 0, sai dạng) đều bị bỏ", kqN.soLoi === ngaySai.length, JSON.stringify(kqN.dong.map((d) => d.loi ?? "OK")));
    const kq29 = await voi(T, gd, (nc) => nhapKhachCsv(nc, { tenTep: "ngay.csv", noiDung: `Tên,Liên hệ,Ngày sinh\nQA Nhuận ${DAU},Người nhuận,29/02/1992`, ghiThat: false, xacNhanTrung: true }));
    dat("Ngày sinh 29/02 năm nhuận được nhận", kq29.soTao === 1);

    // Phạm vi khi nhập
    const nvB = await chu.user.findFirstOrThrow({ where: { tenantId: B.T, isSystem: false } });
    const emailNv2 = (await chu.user.findUniqueOrThrow({ where: { id: nv2 } })).email;
    const tenK2Truoc = (await chu.customer.findUniqueOrThrow({ where: { id: k2.id } })).name;
    const csvPv = [
      "Mã KH,Tên,MST,Người phụ trách (email)",
      `,QA Đổi tên qua MST ${DAU},${MST("41")},`,
      `${k2.ma},QA Đổi tên qua mã ${DAU},,`,
      `,QA Giao cho NV2 ${DAU},,${emailNv2}`,
      `,QA Giao cho người tenant B ${DAU},,${nvB.email}`,
    ].join("\n");
    const kqPv = await voi(T, nv1, (nc) => nhapKhachCsv(nc, { tenTep: "pham-vi.csv", noiDung: csvPv, ghiThat: true, xacNhanTrung: true }));
    dat("Sale nhập CSV: không sửa được khách ngoài phạm vi (qua MST hay Mã KH), không giao cho đồng nghiệp / người tenant khác",
      kqPv.soTao === 0 && kqPv.soSua === 0 && kqPv.soLoi === 4, JSON.stringify(kqPv.dong.map((d) => `${d.soDong}:${d.viec}:${d.loi ?? ""}`)));
    dat("Tên khách của NV2 không đổi", (await chu.customer.findUniqueOrThrow({ where: { id: k2.id } })).name === tenK2Truoc);
    const loiMst = kqPv.dong.find((d) => d.soDong === 2)?.loi ?? "";
    dat("Lỗi dòng không lộ mã khách ngoài phạm vi", !loiMst.includes(k2.ma), loiMst);
  });

  // ------------------------------------------------------------------
  await phan("Nhắc việc: ngưỡng chưa đặt, giờ VN gần nửa đêm, 29/02, chạy hai lần", async () => {
    const ttKhong = (await voi(T, gd, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: `QA Không ngưỡng ${DAU}`, mau: "#111111" }))))!;
    const ttBa = (await voi(T, gd, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: `QA Ba ngày ${DAU}`, mau: "#222222", soNgayDungLau: 3 }))))!;
    const kKhong = await taoKhach(T, nv1, `QA Không ngưỡng ${DAU}`);
    const kSau = await taoKhach(T, nv1, `QA Vào 00:30 giờ VN ${DAU}`);
    const kTruoc = await taoKhach(T, nv1, `QA Vào 23:30 giờ VN ${DAU}`);
    const ngay3 = congNgay(HOM_NAY, -3);
    await chu.customer.update({ where: { id: kKhong.id }, data: { journeyStageId: ttKhong.id, journeyStageChangedAt: new Date(Date.now() - 400 * 86_400_000) } });
    // 17:30Z ngày D = 00:30 sáng D+1 giờ VN → mới 2 ngày; 16:30Z ngày D = 23:30 tối D giờ VN → đủ 3 ngày.
    await chu.customer.update({ where: { id: kSau.id }, data: { journeyStageId: ttBa.id, journeyStageChangedAt: new Date(`${ngay3}T17:30:00Z`) } });
    await chu.customer.update({ where: { id: kTruoc.id }, data: { journeyStageId: ttBa.id, journeyStageChangedAt: new Date(`${ngay3}T16:30:00Z`) } });
    await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: HOM_NAY, trigger: "tay", nguoiChayId: gd }));
    await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: HOM_NAY, trigger: "tay", nguoiChayId: gd }));
    const dem = (id: string) => chu.dailyActionItem.count({ where: { tenantId: T, ruleCode: "khach-dung-lau", objectId: id } });
    dat("Trạng thái chưa đặt ngưỡng: khách 400 ngày cũng không bị nhắc", (await dem(kKhong.id)) === 0);
    dat("Vào 00:30 giờ VN (17:30 UTC hôm trước): mới 2 ngày → chưa nhắc", (await dem(kSau.id)) === 0);
    dat("Vào 23:30 giờ VN: đủ 3 ngày → nhắc đúng 1 lần dù quét hai lần", (await dem(kTruoc.id)) === 1);

    const kSn = await taoKhach(T, nv1, `QA Sinh 29-02 ${DAU}`);
    const lh = await voi(T, nv1, (nc) => taoLienHe(nc, kSn.id, { hoTen: "Người sinh 29/02", ngaySinh: "1992-02-29" }));
    const demSn = (ngay: string) => chu.dailyActionItem.count({ where: { tenantId: T, ruleCode: "sinh-nhat-lien-he", objectId: lh.id, forDate: new Date(`${ngay}T00:00:00Z`) } });
    for (const ngay of ["2027-02-28", "2028-02-28", "2028-02-29", "2027-03-01"]) await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay, trigger: "tay", nguoiChayId: gd }));
    dat("Sinh 29/02: năm thường nhắc 28/02", (await demSn("2027-02-28")) === 1);
    dat("Sinh 29/02: năm nhuận KHÔNG nhắc 28/02, nhắc 29/02", (await demSn("2028-02-28")) === 0 && (await demSn("2028-02-29")) === 1);
    dat("Sinh 29/02: không nhắc nhầm 01/03 năm thường", (await demSn("2027-03-01")) === 0);
  });

  // ------------------------------------------------------------------
  await phan("Bàn giao: người nhận lạ, Giám đốc cuối cùng, tự bàn giao", async () => {
    await nemLoi("Không bàn giao cho tài khoản máy (trợ lý AI)", "khong-thay", () => voi(T, gd, (nc) => banGiao(nc, nv2, { nguoiNhanId: aiA, khoaTaiKhoan: false })));
    const kGd = await taoKhach(T, gd, `QA Khách của GĐ ${DAU}`);
    await nemLoi("GĐ tự bàn giao và tự khóa mình → chặn, cả giao dịch cuộn ngược", "nghiep-vu", () => voi(T, gd, (nc) => banGiao(nc, gd, { nguoiNhanId: tp, khoaTaiKhoan: true })));
    dat("Khách của GĐ không bị chuyển khi bàn giao bị chặn", (await chu.customer.findUniqueOrThrow({ where: { id: kGd.id } })).ownerId === gd);

    // Doanh nghiệp chỉ một Giám đốc; một vai trò tùy biến có user.update bàn giao + khóa Giám đốc.
    const E = await dungTenant("qa-khn-e", "QA Bàn giao E");
    const gdE = await E.nguoi("gd-e", "ceo");
    const role = await chu.role.create({ data: { tenantId: E.T, code: "nhan-su", name: "Nhân sự" } });
    for (const code of ["user.view", "user.update"]) {
      const p = await chu.permission.findFirstOrThrow({ where: { code } });
      await chu.rolePermission.create({ data: { tenantId: E.T, roleId: role.id, permissionId: p.id, dataScope: "all" } });
    }
    const ns = (await chu.user.create({
      data: { tenantId: E.T, email: `ns.${DAU}@thu.test`, passwordHash: "x", fullName: "Nhân sự", userRoles: { create: { tenantId: E.T, roleId: role.id } }, staffProfile: { create: { tenantId: E.T } } },
    })).id;
    const kE = await taoKhach(E.T, gdE, `QA Khách GĐ E ${DAU}`);
    await nemLoi("Bàn giao + khóa Giám đốc/Quản trị cuối cùng bị chặn (bất biến ≥1 quản trị)", "nghiep-vu", () => voi(E.T, ns, (nc) => banGiao(nc, gdE, { nguoiNhanId: ns, khoaTaiKhoan: true })), "mat-quan-tri-cuoi");
    dat("…và không việc nào bị chuyển", (await chu.customer.findUniqueOrThrow({ where: { id: kE.id } })).ownerId === gdE);
    dat("…Giám đốc vẫn hoạt động", (await chu.user.findUniqueOrThrow({ where: { id: gdE } })).status === "hoat-dong");
    const kqKhongKhoa = await voi(E.T, ns, (nc) => banGiao(nc, gdE, { nguoiNhanId: ns, khoaTaiKhoan: false }));
    dat("Bàn giao không khóa: chuyển việc, giữ tài khoản", kqKhongKhoa.daKhoa === false && (await chu.user.findUniqueOrThrow({ where: { id: gdE } })).status === "hoat-dong");
  });

  // ------------------------------------------------------------------
  await phan("Hiệu năng trong hạn giao dịch 5 giây (Prisma mặc định, cùng đường với API)", async () => {
    const F = await dungTenant("qa-khn-f", "QA Hiệu năng F");
    const gdF = await F.nguoi("gd-f", "ceo");
    const nvF = await F.nguoi("nv-f", "sales");
    const N = 3000;
    await chu.customer.createMany({
      data: Array.from({ length: N }, (_, i) => ({ tenantId: F.T, code: `QAF${String(i).padStart(5, "0")}`, name: `QA hiệu năng ${i}`, nameNormalized: `qa hieu nang ${i}`, ownerId: gdF })),
    });
    const ids500 = (await chu.customer.findMany({ where: { tenantId: F.T }, select: { id: true }, take: 500, orderBy: { code: "asc" } })).map((k) => k.id);
    const dmF = await voi(F.T, gdF, (nc) => danhSachTrangThaiHanhTrinh(nc));
    let t0 = Date.now();
    try {
      const r = await voi(F.T, gdF, (nc) => thaoTacHangLoat(nc, { ids: ids500, thaoTac: "doi-hanh-trinh", giaTri: dmF[1].id }));
      const tg = ms(t0);
      dat(`Đổi hành trình hàng loạt 500 khách xong trong một giao dịch (${tg} ms)`, r.soDoi === 500);
      if (tg > 3500) console.log(`    ⚠ CẢNH BÁO: ${tg} ms — sát hạn 5.000 ms của giao dịch; máy thật tải cao có thể hỏng.`);
    } catch (e) {
      dat(`Đổi hành trình hàng loạt 500 khách (giới hạn lô cho phép) KHÔNG được hỏng vì hết hạn giao dịch`, false, `${ms(t0)} ms — ${e instanceof Error ? e.message.slice(0, 160) : e}`);
    }
    t0 = Date.now();
    try {
      const r = await voi(F.T, gdF, (nc) => thaoTacHangLoat(nc, { ids: ids500, thaoTac: "doi-phu-trach", giaTri: nvF }));
      const tg = ms(t0);
      dat(`Đổi người phụ trách hàng loạt 500 khách xong (${tg} ms)`, r.soDoi === 500);
      if (tg > 3500) console.log(`    ⚠ CẢNH BÁO: ${tg} ms — sát hạn 5.000 ms của giao dịch; máy thật tải cao có thể hỏng.`);
    } catch (e) {
      dat(`Đổi người phụ trách hàng loạt 500 khách KHÔNG được hỏng vì hết hạn giao dịch`, false, `${ms(t0)} ms — ${e instanceof Error ? e.message.slice(0, 160) : e}`);
    }
    t0 = Date.now();
    try {
      const r = await voi(F.T, gdF, (nc) => tinhLaiToanBo(nc));
      dat(`Tính lại toàn bộ ${N} khách xong (${ms(t0)} ms)`, r.soKhach === N);
    } catch (e) {
      dat(`Tính lại toàn bộ ${N} khách KHÔNG được hỏng vì hết hạn giao dịch`, false, `${ms(t0)} ms — ${e instanceof Error ? e.message.slice(0, 160) : e}`);
    }
    // Nhập CSV đo trên một doanh nghiệp gần như trống (không phải do 3.000 khách ở trên làm chậm dò trùng).
    const F2 = await dungTenant("qa-khn-f2", "QA Hiệu năng F2");
    const gdF2 = await F2.nguoi("gd-f2", "ceo");
    for (const soDong of [100, 300, 2000]) {
      const csv = ["Tên,Điện thoại", ...Array.from({ length: soDong }, (_, i) => `QA Nhập lô ${soDong} số ${i} ${DAU},09${String(40_000_000 + soDong * 10 + i).padStart(8, "0")}`)].join("\n");
      t0 = Date.now();
      try {
        const r = await voi(F2.T, gdF2, (nc) => nhapKhachCsv(nc, { tenTep: `lo-${soDong}.csv`, noiDung: csv, ghiThat: false, xacNhanTrung: true }));
        dat(`Xem trước nhập CSV ${soDong} dòng xong (${ms(t0)} ms, ${r.soTao} tạo, ${r.soLoi} lỗi)`, r.soTao + r.soLoi === soDong);
      } catch (e) {
        dat(`Xem trước nhập CSV ${soDong} dòng (trong giới hạn 5.000 dòng) KHÔNG được hỏng vì hết hạn giao dịch`, false, `${ms(t0)} ms — ${e instanceof Error ? e.message.slice(0, 160) : e}`);
      }
    }
  });

  // ------------------------------------------------------------------
  await phan("Script scripts/nhap-tu-itw-crm.ts", async () => {
    const G = await dungTenant("qa-khn-g", "QA Nhập ITW G");
    await G.nguoi("gd-g", "ceo");
    const email = `gd-g.qa-khn-g.${DAU}@thu.test`;
    const dir = mkdtempSync(path.join(tmpdir(), "qa-itw-"));
    const db = path.join(dir, "itwcrm.db");
    copyFileSync(ITW_DB, db);
    const TEN_DAC_BIET = `DEMO O'Brien "Nháy" ; DROP TABLE customers; -- <script>alert(1)</script> 😀 ${DAU}`;
    const GHI_CHU_DAC_BIET = "Dòng 1\nDòng 2 \\ ' \" ` $(rm -rf /) ${x}";
    {
      const sqlite = (await import("node:sqlite" as string)) as { DatabaseSync: new (p: string) => { prepare(s: string): { run(...a: unknown[]): unknown }; close(): void } };
      const d = new sqlite.DatabaseSync(db);
      d.prepare("UPDATE customers SET name = ?, notes = ? WHERE code = 'KH000002'").run(TEN_DAC_BIET, GHI_CHU_DAC_BIET);
      d.close();
    }
    const demG = async () => {
      const r: Record<string, number> = {};
      for (const bang of ["customers", "contacts", "interactions", "customer_journey_stages", "customer_groups", "customer_group_members", "customer_journey_history", "audit_logs", "business_events"]) {
        r[bang] = (await chu.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${bang}" WHERE tenant_id = $1::uuid`, G.T))[0].n;
      }
      return r;
    };
    const chay = (...them: string[]) =>
      execFileSync(path.join(process.cwd(), "node_modules/.bin/tsx"), ["scripts/nhap-tu-itw-crm.ts", db, "--tenant", G.code, "--email", email, ...them], { encoding: "utf8", env: process.env, timeout: 300_000 });
    const d0 = await demG();
    const out0 = chay();
    const d1 = await demG();
    dat("Chạy thử (mặc định) không ghi gì — đếm 9 bảng trước/sau bằng nhau", JSON.stringify(d0) === JSON.stringify(d1), `${JSON.stringify(d0)} → ${JSON.stringify(d1)}`);
    dat("Chạy thử báo rõ là chạy thử", out0.includes("CHẠY THỬ") && /Khách hàng: \d+ mới/.test(out0));
    const soMoiThu = Number(/Khách hàng: (\d+) mới/.exec(out0)?.[1] ?? -1);
    const out1 = chay("--ghi");
    const d2 = await demG();
    const soMoi = Number(/Khách hàng: (\d+) mới/.exec(out1)?.[1] ?? -1);
    dat("--ghi tạo đúng số khách như chạy thử báo", soMoi === soMoiThu && d2.customers - d1.customers === soMoi && soMoi > 0, `thử ${soMoiThu}, ghi ${soMoi}, CSDL +${d2.customers - d1.customers}`);
    console.log(`    (lần ghi 1: ${out1.split("\n").filter((l) => /Khách hàng:|Người liên hệ|lỗi|✗/.test(l)).join(" | ")})`);
    const out2 = chay("--ghi");
    const d3 = await demG();
    dat("--ghi lần hai không nhân đôi khách / liên hệ / tương tác / nhóm / trạng thái",
      ["customers", "contacts", "interactions", "customer_groups", "customer_journey_stages", "customer_group_members"].every((b) => d3[b as keyof typeof d3] === d2[b as keyof typeof d2]),
      `${JSON.stringify(d2)} → ${JSON.stringify(d3)}`);
    dat("Lần hai báo khách 'đã nhập lần trước'", /0 mới/.test(out2));
    const kDb = await chu.customer.findFirst({ where: { tenantId: G.T, note: { contains: "ITW CRM KH000002" } } });
    dat("Tên chứa ký tự đặc biệt / SQL / HTML / emoji lưu nguyên văn", kDb?.name === TEN_DAC_BIET, kDb?.name);
    dat("Ghi chú nhiều dòng + ký tự đặc biệt giữ nguyên", Boolean(kDb?.note?.startsWith(GHI_CHU_DAC_BIET)), JSON.stringify(kDb?.note?.slice(0, 80)));
    await nemLoiCsdl("Script từ chối khi email người chạy không thuộc doanh nghiệp", async () => {
      execFileSync(path.join(process.cwd(), "node_modules/.bin/tsx"), ["scripts/nhap-tu-itw-crm.ts", db, "--tenant", G.code, "--email", "khong-co@thu.test"], { encoding: "utf8", env: process.env, stdio: "pipe" });
    });
  });

  await chu.$disconnect();
  await app.$disconnect();
  ketLuan("QA đối kháng — Khách hàng nâng cao");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  await app.$disconnect();
  process.exit(1);
});
