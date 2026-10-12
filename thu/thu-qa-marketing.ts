import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { danhSachViec, LuocDoLocViec } from "../src/modules/cong-viec/service";
import {
  cauHinhNhanLead,
  chiTietChienDich,
  chiTietLanding,
  danhSachChienDich,
  danhSachForm,
  danhSachLanding,
  danhSachNguonWebhook,
  danhSachPhanKhuc,
  danhSachTheoPhanKhuc,
  datDanhSachNhanLead,
  docFormCongKhai,
  docLandingCongKhai,
  doiDongYNhanTin,
  doiTrangThaiChienDich,
  doiTrangThaiLanding,
  duyetNganSach,
  ghiChiPhi,
  guiFormCongKhai,
  huyChiPhi,
  khoiMarketingBangDieuKhien,
  luuPhanKhuc,
  nhanLead,
  nhanQuaWebhook,
  nhapTayLead,
  nhatKyNhanLead,
  taoChienDich,
  taoForm,
  taoLanding,
  taoNguonWebhook,
  thuHoiWebhook,
  xemTruocPhanKhuc,
  LuocDoLanding,
  type DuLieuNhanLead,
} from "../src/modules/marketing/service";
import { chayNhanCongKhai } from "../src/modules/marketing/cong-khai";
import { LuocDoForm, LuocDoLuuPhanKhuc, LuocDoNhapTayLead, LuocDoTaoChienDich } from "../src/modules/marketing/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * KIỂM THỬ ĐỐI KHÁNG (QA độc lập) gói M — Marketing & thu lead 0.16.0.
 *
 * Khác `thu-marketing.ts` (bài của người viết tính năng): bài này cố tình đi đường hiểm —
 * chạy song song, dữ liệu dạng lạ, vượt quyền, đọc chéo tenant, ghi thẳng CSDL bỏ qua service.
 * Bài ĐỎ ở đây là lỗi thật đã ghi trong báo cáo QA, không phải bài sai — đừng "sửa" bài cho xanh.
 * Không nằm trong `thu:tich-hop`. Chạy: `npm run thu:qa-marketing`. CHỈ trên CSDL phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const SO = String(Date.now()).slice(-6);
/** SĐT thử: 08 + 2 số + 6 số cuối thời gian — không đụng dải 09 của thu-marketing.ts. */
const dt = (n: number) => `08${String(n).padStart(2, "0")}${SO}`;
const IP = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const meta = { ip: IP, userAgent: "thu-qa-marketing" };

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, IP, "thu-qa-marketing"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "bat-ky";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "bat-ky" ? true
      : kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

const UTM_RONG = { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null };

/** Bộ dữ liệu nhanLead tối thiểu cho các bài gọi thẳng một cửa. */
function duLieu(p: Partial<DuLieuNhanLead> & { nguoiDuPhongId: string }): DuLieuNhanLead {
  return {
    kenh: "form", hoTen: "Khách thử", dienThoai: null, email: null, congTy: null, chucDanh: null, maSoThue: null, nhuCau: null,
    ghiChu: null, nguon: null, chienDichId: null, utm: UTM_RONG, dongYNhanTin: false, nguonDongY: "form:qa", payload: {}, ...p,
  };
}
const KHACH = { nguoiId: null, email: null, ip: IP, userAgent: "thu-qa-marketing" };

/** Chứa chuỗi SĐT thật (chỉ số) ở đâu đó trong một giá trị JSON? */
function loSo(giaTri: unknown, so: string): boolean {
  return JSON.stringify(giaTri).replace(/\D/g, " ").split(/\s+/).some((x) => x.includes(so.slice(1)));
}

async function main() {
  console.log("=== QA đối kháng: Marketing & thu lead (0.16.0) ===\n");
  const tA = await seedNenMong(chu, `qa-mk-a-${DAU}`, "DN thử QA Marketing A");
  const tB = await seedNenMong(chu, `qa-mk-b-${DAU}`, "DN thử QA Marketing B");
  const A = tA.id;
  const B = tB.id;
  async function nguoi(T: string, ten: string, vai: string) {
    const role = await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code: vai } } });
    const u = await chu.user.create({
      data: {
        tenantId: T, email: `${ten}.${DAU}.${T.slice(0, 4)}@thu.test`, passwordHash: "x", fullName: ten,
        userRoles: { create: { tenantId: T, roleId: role.id } },
        staffProfile: { create: { tenantId: T } },
      },
    });
    return u.id;
  }
  const gd = await nguoi(A, "qa-giam-doc", "ceo");
  const tpmk = await nguoi(A, "qa-truong-phong-mk", "marketing-manager");
  const nvmk = await nguoi(A, "qa-nhan-vien-mk", "marketing");
  const tts = await nguoi(A, "qa-thuc-tap", "marketing-intern");
  const ai = await nguoi(A, "qa-tro-ly-ai", "ai-assistant");
  const s = [await nguoi(A, "qa-sale-1", "sales"), await nguoi(A, "qa-sale-2", "sales"), await nguoi(A, "qa-sale-3", "sales"), await nguoi(A, "qa-sale-4", "sales")];
  const saleKhoa = await nguoi(A, "qa-sale-nghi", "sales");
  const nvmkB = await nguoi(B, "qa-nhan-vien-mk-b", "marketing");
  console.log("");

  // =====================================================================
  console.log("— 1. Đường công khai: mã DN / slug lạ, cách ly tenant —");
  const formA = await voi(A, nvmk, (nc) =>
    taoForm(nc, LuocDoForm.parse({ ten: "Form QA chung", slug: "dang-ky", tieuDe: "Đăng ký", truong: [{ khoa: "hoTen", batBuoc: true }, { khoa: "dienThoai", batBuoc: true }], cauDongY: "Tôi đồng ý nhận tin" })),
  );
  const formB = await voi(B, nvmkB, (nc) =>
    taoForm(nc, LuocDoForm.parse({ ten: "Form QA chung B", slug: "dang-ky", tieuDe: "Đăng ký B", truong: [{ khoa: "hoTen", batBuoc: true }, { khoa: "dienThoai", batBuoc: true }] })),
  );
  const guiCK = (ma: string, slug: string, than: Record<string, unknown>, ip = IP) =>
    chayNhanCongKhai(ma, "form", ip, (tx, tid) => guiFormCongKhai(tx, tid, slug.slice(0, 60), than, { ip, userAgent: "qa" }));

  const kqA = await guiCK(tA.code, "dang-ky", { hoTen: "Khách của A", dienThoai: dt(1) });
  const leadA = await chu.lead.findUniqueOrThrow({ where: { id: (kqA as { leadId: string }).leadId } });
  dat("NM: cùng slug ở hai DN — gửi qua mã DN A chỉ tạo lead trong A", leadA.tenantId === A && (await chu.lead.count({ where: { tenantId: B } })) === 0);
  const kqB = await guiCK(tB.code, "dang-ky", { hoTen: "Khách của B", dienThoai: dt(1) });
  dat("NM: cùng SĐT gửi vào DN B → lead MỚI trong B (không ghi thêm vào lead của A)", kqB.ketQua === "tao-moi" && (await chu.lead.count({ where: { tenantId: B } })) === 1);
  const formCKB = await voiTenant(B, (tx) => docFormCongKhai(tx, "dang-ky"));
  dat("NM: đọc form công khai trong tenant B trả form của B", formCKB?.id === formB.id && formCKB.id !== formA.id);

  for (const [moTa, ma] of [
    ["mã '..'", ".."],
    ["mã '%00'", "itw%00"],
    ["mã có NUL thật", "itw\u0000"],
    ["mã chữ hoa", tA.code.toUpperCase()],
    ["mã unicode", "thế-giới"],
    ["mã rất dài", "a".repeat(5000)],
    ["mã không tồn tại", `khong-co-${DAU}`],
  ] as const) {
    await nemLoi(`Mã DN lạ (${moTa}) → không tìm thấy (404), không lỗi 500`, "khong-thay", () => guiCK(ma, "dang-ky", { hoTen: "X", dienThoai: dt(2) }));
  }
  for (const [moTa, slug] of [
    ["'../dang-ky'", "../dang-ky"],
    ["'dang-ky%00'", "dang-ky%00"],
    ["NUL thật", "dang-ky\u0000"],
    ["unicode", "đăng-ký"],
    ["chữ hoa", "DANG-KY"],
    ["rất dài", "d".repeat(10_000)],
  ] as const) {
    await nemLoi(`Slug lạ (${moTa}) → 404 khong-tim-thay`, "nghiep-vu", () => guiCK(tA.code, slug, { hoTen: "X", dienThoai: dt(2) }), "khong-tim-thay");
  }
  dat("Trang công khai: slug lạ đọc form → null (404)", (await voiTenant(A, (tx) => docFormCongKhai(tx, "../dang-ky"))) === null);
  dat("Trang công khai: slug lạ đọc landing → null (404)", (await voiTenant(A, (tx) => docLandingCongKhai(tx, "%00", "A", false))) === null);

  await nemLoi("Ký tự NUL trong họ tên → từ chối như dữ liệu sai (400), không phải lỗi CSDL 500", "nghiep-vu", () => guiCK(tA.code, "dang-ky", { hoTen: "Nul\u0000Bot", dienThoai: dt(11) }));

  // Trường ngoài danh mục / ngoài cấu hình form, giả quyền
  const kqLa = await guiCK(tA.code, "dang-ky", {
    hoTen: "Khách giả quyền", dienThoai: dt(3), ownerId: gd, nguoiPhuTrachId: gd, stage: "CONVERTED", giaiDoan: "CONVERTED",
    congTy: "Công ty không có trong form", maSoThue: "0101234567", tenantId: B, campaignId: "00000000-0000-0000-0000-000000000000",
  });
  const lLa = await chu.lead.findUniqueOrThrow({ where: { id: (kqLa as { leadId: string }).leadId } });
  dat("MK-11: form ngoài không ghi được người phụ trách / giai đoạn / tenant / chiến dịch", lLa.ownerId !== gd && lLa.stage === "NEW_LEAD" && lLa.tenantId === A && lLa.campaignId === null);
  dat("MK-11: trường có trong danh mục nhưng KHÔNG có trong form (công ty, MST) bị bỏ", lLa.companyName === null && lLa.taxCode === null);

  // dongYNhanTin dạng chuỗi "true" không được coi là đồng ý
  await nemLoi("MK-13: dongYNhanTin = \"true\" (chuỗi) → từ chối, không coi là đồng ý", "nghiep-vu", () => guiCK(tA.code, "dang-ky", { hoTen: "Chuỗi", dienThoai: dt(4), dongYNhanTin: "true" }), "du-lieu-sai");

  // Ô bẫy chỉ có khoảng trắng / không phải chuỗi
  const truocBay = await chu.lead.count({ where: { tenantId: A } });
  const bay = await guiCK(tA.code, "dang-ky", { hoTen: "Bot 2", dienThoai: dt(5), website_url: "x" });
  dat("Honeypot: có giá trị → spam, không tạo lead", bay.ketQua === "spam" && (await chu.lead.count({ where: { tenantId: A } })) === truocBay);

  // landingId giả (của DN khác / không dùng form này) không được gắn
  const kqLp = await chayNhanCongKhai(tA.code, "form", IP, (tx, tid) =>
    guiFormCongKhai(tx, tid, "dang-ky", { hoTen: "Landing giả", dienThoai: dt(6) }, { ...meta, landingPageId: "00000000-0000-4000-8000-000000000000", landingVariant: "B" }),
  );
  const nkLp = await chu.leadCapture.findFirst({ where: { tenantId: A, leadId: (kqLp as { leadId: string }).leadId } });
  dat("landingId giả → kênh form, không gắn landing/biến thể", nkLp?.channel === "form" && nkLp.landingPageId === null && nkLp.landingVariant === null);

  // Form tắt / chiến dịch hủy
  const cdHuy = await voi(A, nvmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Chiến dịch sẽ hủy", kenh: "facebook", utmCampaign: `huy-${DAU}` })));
  const formCdHuy = await voi(A, nvmk, (nc) => taoForm(nc, LuocDoForm.parse({ ten: "Form chiến dịch hủy", tieuDe: "Form chiến dịch hủy", chienDichId: cdHuy.id, truong: [{ khoa: "hoTen" }, { khoa: "dienThoai" }] })));
  await voi(A, nvmk, (nc) => doiTrangThaiChienDich(nc, cdHuy.id, "huy", "Dừng ngân sách"));
  const kqHuy = await guiCK(tA.code, formCdHuy.slug, { hoTen: "Sau khi hủy", dienThoai: dt(7), utm_campaign: `huy-${DAU}` });
  const lHuy = await chu.lead.findUniqueOrThrow({ where: { id: (kqHuy as { leadId: string }).leadId } });
  dat("Chiến dịch đã hủy: lead vẫn nhận nhưng KHÔNG gắn vào chiến dịch hủy (cả qua form lẫn utm)", lHuy.campaignId === null);
  await chu.marketingForm.update({ where: { id: formCdHuy.id }, data: { status: "tat" } });
  dat("Form tắt → trang công khai 404", (await voiTenant(A, (tx) => docFormCongKhai(tx, formCdHuy.slug))) === null);
  await nemLoi("Form tắt → gửi bị từ chối 404", "nghiep-vu", () => guiCK(tA.code, formCdHuy.slug, { hoTen: "Muộn", dienThoai: dt(8) }), "khong-tim-thay");

  // =====================================================================
  console.log("\n— 2. Webhook: khóa chéo tenant, khóa thu hồi, thân lạ —");
  const whA = await voi(A, nvmk, (nc) => taoNguonWebhook(nc, { ten: "Nguồn QA", ma: "zapier" }));
  const whB = await voi(B, nvmkB, (nc) => taoNguonWebhook(nc, { ten: "Nguồn QA B", ma: "zapier" }));
  const goiWh = (ma: string, nguon: string, khoa: string | null, than: unknown) =>
    chayNhanCongKhai(ma, "webhook", IP, (tx, tid) => nhanQuaWebhook(tx, tid, nguon, khoa, than, meta));
  await nemLoi("Webhook: khóa ĐÚNG của DN B gọi vào cùng mã nguồn của DN A → 401", "nghiep-vu", () => goiWh(tA.code, "zapier", whB.khoa, { full_name: "Chéo", phone: dt(9) }), "sai-khoa");
  await nemLoi("Webhook: khóa của A gọi vào DN B → 401", "nghiep-vu", () => goiWh(tB.code, "zapier", whA.khoa, { full_name: "Chéo", phone: dt(9) }), "sai-khoa");
  dat("Webhook: lần gọi chéo bị từ chối ghi nhật ký vào DN bị gọi, không vào DN kia", (await chu.leadCapture.count({ where: { tenantId: A, webhookSourceId: whA.nguon.id, result: "tu-choi" } })) === 1);
  await nemLoi("Webhook: thân là mảng → 400", "nghiep-vu", () => goiWh(tA.code, "zapier", whA.khoa, [{ full_name: "A" }]), "du-lieu-sai");
  await nemLoi("Webhook: thân null (không phải JSON) → 400", "nghiep-vu", () => goiWh(tA.code, "zapier", whA.khoa, null), "du-lieu-sai");
  await nemLoi("Webhook: trường sai kiểu (phone là số) → 400", "nghiep-vu", () => goiWh(tA.code, "zapier", whA.khoa, { full_name: "A", phone: 912345678 }), "du-lieu-sai");
  await nemLoi("Webhook: khóa rỗng → 401", "nghiep-vu", () => goiWh(tA.code, "zapier", "", { full_name: "A", phone: dt(9) }), "sai-khoa");
  await nemLoi("Webhook: mã nguồn lạ '../zapier' → 401 (không lộ có nguồn hay không)", "nghiep-vu", () => goiWh(tA.code, "../zapier", whA.khoa, { full_name: "A", phone: dt(9) }), "sai-khoa");
  const okWh = await goiWh(tA.code, "zapier", whA.khoa, { full_name: "Khách webhook", phone: dt(9), ownerId: gd, stage: "CONVERTED" });
  const lWh = await chu.lead.findFirstOrThrow({ where: { tenantId: A, phoneNormalized: dt(9) } });
  dat("Webhook: trường lạ (ownerId, stage) bị bỏ", okWh.ketQua === "tao-moi" && lWh.ownerId !== gd && lWh.stage === "NEW_LEAD");
  await voi(A, nvmk, (nc) => thuHoiWebhook(nc, whA.nguon.id));
  await nemLoi("Webhook: khóa đúng nhưng nguồn đã thu hồi → 401", "nghiep-vu", () => goiWh(tA.code, "zapier", whA.khoa, { full_name: "Sau thu hồi", phone: dt(10) }), "sai-khoa");
  dat("Webhook: thu hồi ở A không ảnh hưởng nguồn cùng mã của B", (await goiWh(tB.code, "zapier", whB.khoa, { full_name: "Khách B2", phone: dt(10) })).ketQua === "tao-moi");

  // =====================================================================
  console.log("\n— 3. nhanLead: song song, trùng, dạng SĐT/email khác, người nghỉ —");
  await voi(A, tpmk, (nc) => datDanhSachNhanLead(nc, [...s, saleKhoa]));
  await chu.user.update({ where: { id: saleKhoa }, data: { status: "ngung-hoat-dong" } });
  const cauHinh = await voi(A, tpmk, (nc) => cauHinhNhanLead(nc));
  dat("Danh sách nhận lead: người đã nghỉ hiện 'hết hiệu lực'", cauHinh.danhSach.find((d) => d.id === saleKhoa)?.conHieuLuc === false);

  const truocSS = new Date();
  const kqSS = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) =>
      voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: `Song song ${i}`, dienThoai: dt(20 + i), nguoiDuPhongId: nvmk }), KHACH)),
    ),
  );
  const loiSS = kqSS.filter((k) => k.status === "rejected") as PromiseRejectedResult[];
  dat("MK-08: 20 lead song song → không lỗi", loiSS.length === 0, loiSS.map((l) => String(l.reason?.message ?? l.reason).slice(0, 160)).join(" | "));
  const leadSS = await chu.lead.findMany({ where: { tenantId: A, createdAt: { gte: truocSS }, fullName: { startsWith: "Song song" } }, select: { ownerId: true, code: true } });
  const demChia = new Map<string, number>();
  for (const l of leadSS) demChia.set(l.ownerId, (demChia.get(l.ownerId) ?? 0) + 1);
  dat("MK-08: 20 lead song song → đủ 20 lead, mã không trùng", leadSS.length === 20 && new Set(leadSS.map((l) => l.code)).size === 20, `${leadSS.length}`);
  dat("MK-08: chia đều 4 sale × 5, không ai ngoài danh sách", s.every((id) => demChia.get(id) === 5) && demChia.size === 4, JSON.stringify([...demChia.values()]));
  dat("MK-08: người đã nghỉ trong danh sách không nhận lead nào", !demChia.has(saleKhoa));

  // Trùng song song — MK-07: không được ra hai lead mở cho cùng một người.
  let soVongTrung = 0;
  const chiTietTrung: string[] = [];
  for (let vong = 0; vong < 3; vong++) {
    const so = dt(50 + vong);
    const kq = await Promise.allSettled([
      voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: "Bấm hai lần", dienThoai: so, nguoiDuPhongId: nvmk }), KHACH)),
      voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: "Bấm hai lần", dienThoai: `+84 ${so.slice(1, 4)} ${so.slice(4)}`, nguoiDuPhongId: nvmk }), KHACH)),
    ]);
    const soMo = await chu.lead.count({ where: { tenantId: A, phoneNormalized: so } });
    if (soMo > 1) soVongTrung++;
    chiTietTrung.push(`${soMo} lead (${kq.map((k) => (k.status === "fulfilled" ? k.value.ketQua : "lỗi")).join("/")})`);
  }
  dat("MK-07: 2 lần gửi CÙNG LÚC cùng SĐT → chỉ 1 lead đang mở (thử 3 vòng)", soVongTrung === 0, `${soVongTrung}/3 vòng ra lead trùng: ${chiTietTrung.join("; ")}`);

  // Dạng khác nhau tuần tự
  const goc = await voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: "Dạng gốc", dienThoai: dt(60), email: `Dang.Goc.${DAU}@Mail.VN`, nguoiDuPhongId: nvmk }), KHACH));
  const bienThe: [string, Partial<DuLieuNhanLead>][] = [
    ["+84 có khoảng trắng", { dienThoai: `+84 ${dt(60).slice(1, 4)} ${dt(60).slice(4, 7)} ${dt(60).slice(7)}` }],
    ["0084", { dienThoai: `0084${dt(60).slice(1)}` }],
    ["dấu chấm, gạch", { dienThoai: `${dt(60).slice(0, 4)}.${dt(60).slice(4, 7)}-${dt(60).slice(7)}` }],
    ["84 không dấu +", { dienThoai: `84${dt(60).slice(1)}` }],
    ["email chữ hoa + khoảng trắng", { email: `  DANG.GOC.${DAU}@MAIL.vn  ` }],
  ];
  for (const [moTa, p] of bienThe) {
    const k = await voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: "Dạng khác", nguoiDuPhongId: nvmk, ...p }), KHACH));
    dat(`MK-07: ${moTa} → nhận ra trùng lead đang mở`, k.ketQua === "ghi-them" && k.leadId === goc.leadId, `${k.ketQua}`);
  }

  // Chưa đặt hạn gọi lại
  const viecGoc = await chu.task.findFirstOrThrow({ where: { leadId: goc.leadId } });
  dat("MK-09: chưa đặt hạn gọi lại → việc không hạn, mô tả nói rõ", viecGoc.dueAt === null && Boolean(viecGoc.description?.includes("Chưa đặt hạn")));
  await voi(A, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "marketing.phut_goi_lai_lead": 0 } })).catch(() => null);
  const k0 = await voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: "Hạn 0 phút", dienThoai: dt(61), nguoiDuPhongId: nvmk }), KHACH));
  dat("MK-09: cấu hình 0 phút (nếu lưu được) không sinh hạn = lúc nhận", k0.hanGoiLai === null || k0.hanGoiLai.getTime() > Date.now() - 1000);

  // Danh sách trống, người phụ trách form không có crm.view (Thực tập sinh) — MK-08 + MK-15
  await voi(A, tpmk, (nc) => datDanhSachNhanLead(nc, []));
  const formTts = await voi(A, tts, (nc) => taoForm(nc, LuocDoForm.parse({ ten: "Form thực tập sinh", tieuDe: "Form TTS", truong: [{ khoa: "hoTen" }, { khoa: "dienThoai" }, { khoa: "email" }] })));
  const soTts = dt(70);
  const kqTts = await guiCK(tA.code, formTts.slug, { hoTen: "Khách vào form TTS", dienThoai: soTts, email: `kh.tts.${DAU}@mail.vn` });
  const lTts = await chu.lead.findUniqueOrThrow({ where: { id: (kqTts as { leadId: string }).leadId } });
  dat(
    "MK-08: người nhận lead phải có crm.view — danh sách trống thì KHÔNG giao lead cho Thực tập sinh (người phụ trách form, không có crm.view)",
    lTts.ownerId !== tts,
    `lead ${lTts.code} giao cho thực tập sinh`,
  );
  const viecTts = await voi(A, tts, (nc) => danhSachViec(nc, LuocDoLocViec.parse({ cheDo: "cua-toi" })));
  dat(
    "MK-15: Thực tập sinh KHÔNG thấy SĐT/email thật của khách ở bất kỳ đâu (kể cả mô tả việc 'Gọi lại')",
    !loSo(viecTts, soTts) && !JSON.stringify(viecTts).includes(`kh.tts.${DAU}@mail.vn`),
    "việc gọi lại giao cho thực tập sinh có mô tả chứa SĐT + email thật",
  );
  const tayTts = await voi(A, tts, (nc) => nhapTayLead(nc, LuocDoNhapTayLead.parse({ hoTen: "TTS nhập tay", dienThoai: dt(71) })));
  dat("MK-08: Thực tập sinh nhập tay khi danh sách trống → lead không được giao cho chính TTS", tayTts.nguoiNhanId !== tts, `cachChia=${tayTts.cachChia}`);
  await voi(A, tpmk, (nc) => datDanhSachNhanLead(nc, s));

  // =====================================================================
  console.log("\n— 4. Phân quyền và che liên lạc —");
  const cdTts = await voi(A, tts, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Chiến dịch của TTS", kenh: "zalo", utmCampaign: `tts-${DAU}` })));
  const soCd = dt(72);
  await voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: "Khách chiến dịch TTS", dienThoai: soCd, email: `cd.tts.${DAU}@mail.vn`, utm: { ...UTM_RONG, utm_campaign: `TTS-${DAU}` }, nguoiDuPhongId: nvmk }), KHACH));
  const xemTts = {
    danhSach: await voi(A, tts, (nc) => danhSachChienDich(nc, { q: "", trangThai: "", kenh: "", tuNgay: "", denNgay: "" })),
    chiTiet: await voi(A, tts, (nc) => chiTietChienDich(nc, cdTts.id)),
    nhatKy: await voi(A, tts, (nc) => nhatKyNhanLead(nc, {})),
    form: await voi(A, tts, (nc) => danhSachForm(nc)),
    webhook: await voi(A, tts, (nc) => danhSachNguonWebhook(nc)),
    landing: await voi(A, tts, (nc) => danhSachLanding(nc)),
    xemTruoc: await voi(A, tts, (nc) => xemTruocPhanKhuc(nc, LuocDoLuuPhanKhuc.parse({ ten: "Xem thử", phanKhuc: { doiTuong: "lead", dieuKien: {} } }).phanKhuc)),
    xemTruocLh: await voi(A, tts, (nc) => xemTruocPhanKhuc(nc, LuocDoLuuPhanKhuc.parse({ ten: "Xem thử", phanKhuc: { doiTuong: "lien-he", dieuKien: {} } }).phanKhuc)),
    bangDk: await voi(A, tts, (nc) => khoiMarketingBangDieuKhien(nc)),
  };
  dat("MK-01: utm_campaign khác hoa thường vẫn gắn đúng chiến dịch", xemTts.chiTiet.leads.length === 1, String(xemTts.chiTiet.leads.length));
  for (const [ten, gt] of Object.entries(xemTts)) {
    dat(`MK-15: Thực tập sinh — ${ten}: không lộ SĐT/email thật`, !loSo(gt, soCd) && !loSo(gt, dt(1)) && !JSON.stringify(gt).includes(`cd.tts.${DAU}@mail.vn`));
  }
  dat("MK-15: nhật ký nhận lead — mọi dòng của TTS đều daChe", xemTts.nhatKy.dong.every((d) => !d.lead || d.lead.daChe));
  await nemLoi("Thực tập sinh không đổi đồng ý nhận tin của lead", "quyen", () => voi(A, tts, (nc) => doiDongYNhanTin(nc, "lead", leadA.id, { dongY: true, nguon: "giả" })));
  // Phân khúc: thực tập sinh lưu phân khúc rồi lấy danh sách — vẫn che
  const pkTts = await voi(A, tts, (nc) => luuPhanKhuc(nc, null, LuocDoLuuPhanKhuc.parse({ ten: "PK TTS", phanKhuc: { doiTuong: "lead", dieuKien: {} } })));
  const dsPkTts = await voi(A, tts, (nc) => danhSachTheoPhanKhuc(nc, pkTts.id, { chiNguoiNhanDuoc: false }));
  dat("MK-15: danhSachTheoPhanKhuc (mặc định) của TTS đã che", dsPkTts.length > 0 && !loSo(dsPkTts, soCd) && !loSo(dsPkTts, dt(1)));
  await nemLoi("MK-15: TTS xin danh sách KHÔNG che → thiếu quyền", "quyen", () => voi(A, tts, (nc) => danhSachTheoPhanKhuc(nc, pkTts.id, { boCheDeGui: true })));

  // Sale (phạm vi own, không có marketing.view) không chạm được Marketing
  for (const [ten, viec] of [
    ["danh sách chiến dịch", (nc: NguCanh) => danhSachChienDich(nc, { q: "", trangThai: "", kenh: "", tuNgay: "", denNgay: "" })],
    ["chi tiết chiến dịch", (nc: NguCanh) => chiTietChienDich(nc, cdTts.id)],
    ["xem trước phân khúc", (nc: NguCanh) => xemTruocPhanKhuc(nc, LuocDoLuuPhanKhuc.parse({ ten: "Xem thử", phanKhuc: { doiTuong: "lead", dieuKien: {} } }).phanKhuc)],
    ["danh sách theo phân khúc", (nc: NguCanh) => danhSachTheoPhanKhuc(nc, pkTts.id)],
    ["nhật ký nhận lead", (nc: NguCanh) => nhatKyNhanLead(nc, {})],
    ["cấu hình nhận lead", (nc: NguCanh) => cauHinhNhanLead(nc)],
    ["nhập tay lead", (nc: NguCanh) => nhapTayLead(nc, LuocDoNhapTayLead.parse({ hoTen: "Sale nhập", dienThoai: dt(73) }))],
  ] as const) {
    await nemLoi(`Sale (own) không có marketing.* → ${ten} bị chặn`, "quyen", () => voi<unknown>(A, s[0], viec as (nc: NguCanh) => Promise<unknown>));
  }
  dat("Bảng điều hành: sale không có khối Marketing", (await voi(A, s[0], (nc) => khoiMarketingBangDieuKhien(nc))) === null);

  // Duyệt: ai-assistant, tự duyệt khi phạm vi không phải toàn công ty
  const cdDuyet = await voi(A, nvmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Cần duyệt QA", kenh: "google", nganSach: "5000000" })));
  await voi(A, nvmk, (nc) => doiTrangThaiChienDich(nc, cdDuyet.id, "cho-duyet"));
  await nemLoi("ai-assistant không duyệt được ngân sách", "quyen", () => voi(A, ai, (nc) => duyetNganSach(nc, cdDuyet.id, { dongY: true })));
  await nemLoi("ai-assistant không đổi trạng thái chiến dịch", "quyen", () => voi(A, ai, (nc) => doiTrangThaiChienDich(nc, cdDuyet.id, "ke-hoach")));
  await nemLoi("ai-assistant không ghi chi phí", "quyen", () => voi(A, ai, (nc) => ghiChiPhi(nc, cdDuyet.id, { ngay: "2026-10-10", soTien: "1000", loai: "khac", ghiChu: null })));
  await nemLoi("ai-assistant không nhập tay lead", "quyen", () => voi(A, ai, (nc) => nhapTayLead(nc, LuocDoNhapTayLead.parse({ hoTen: "AI nhập", dienThoai: dt(74) }))));
  await nemLoi("Nhân viên Marketing (không có approve) không tự duyệt chiến dịch của mình", "quyen", () => voi(A, nvmk, (nc) => duyetNganSach(nc, cdDuyet.id, { dongY: true })));
  // Hạ phạm vi duyệt của Trưởng phòng Marketing xuống "team" → không tự duyệt chiến dịch của chính mình
  const cdTp = await voi(A, tpmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Của trưởng phòng", kenh: "google", nganSach: "7000000" })));
  await voi(A, tpmk, (nc) => doiTrangThaiChienDich(nc, cdTp.id, "cho-duyet"));
  const vaiTp = await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: A, code: "marketing-manager" } } });
  const qDuyet = await chu.permission.findUniqueOrThrow({ where: { code: "marketing.approve" } });
  await chu.rolePermission.update({ where: { roleId_permissionId: { roleId: vaiTp.id, permissionId: qDuyet.id } }, data: { dataScope: "team" } });
  await nemLoi("MK-03: phạm vi duyệt 'team' → người phụ trách không tự duyệt", "nghiep-vu", () => voi(A, tpmk, (nc) => duyetNganSach(nc, cdTp.id, { dongY: true })), "tu-duyet");
  await chu.rolePermission.update({ where: { roleId_permissionId: { roleId: vaiTp.id, permissionId: qDuyet.id } }, data: { dataScope: "all" } });

  // =====================================================================
  console.log("\n— 5. Chiến dịch & chỉ số —");
  const cd = await voi(A, tpmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Chỉ số QA", kenh: "facebook", utmCampaign: `Chi-So QA ${DAU}` })));
  await nemLoi("MK-01: utm_campaign trùng khác hoa thường / dấu cách bị chặn", "nghiep-vu", () =>
    voi(A, tpmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Trùng hoa thường", kenh: "google", utmCampaign: `CHI-SO-QA-${DAU.toUpperCase()}` }))), "trung-utm",
  );
  await voi(A, tpmk, (nc) => ghiChiPhi(nc, cd.id, { ngay: "2026-10-05", soTien: "1000000", loai: "quang-cao", ghiChu: null }));
  const cpHuy = await voi(A, tpmk, (nc) => ghiChiPhi(nc, cd.id, { ngay: "2026-10-05", soTien: "9000000", loai: "quang-cao", ghiChu: "nhầm" }));
  await voi(A, tpmk, (nc) => huyChiPhi(nc, cpHuy.id, "Ghi nhầm số"));
  await nemLoi("MK-04: hủy chi phí lần hai bị chặn", "nghiep-vu", () => voi(A, tpmk, (nc) => huyChiPhi(nc, cpHuy.id, "Lại")), "da-huy");
  const utmCd = `chi-so-qa-${DAU}`;
  const l1 = await voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: "Chỉ số 1", dienThoai: dt(80), utm: { ...UTM_RONG, utm_campaign: utmCd.toUpperCase() }, nguoiDuPhongId: nvmk }), KHACH));
  await voiTenant(A, (tx) => nhanLead(tx, A, duLieu({ hoTen: "Chỉ số 2", dienThoai: dt(81), utm: { ...UTM_RONG, utm_campaign: `Chi so QA ${DAU}` }, nguoiDuPhongId: nvmk }), KHACH));
  // Khách mới của chiến dịch có cả cơ hội thắng lẫn hóa đơn
  const kh = await voi(A, s[0], (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Khách chỉ số ${DAU}`, xacNhanKhongTrung: true })));
  await chu.customer.update({ where: { id: kh.id }, data: { campaignId: cd.id } });
  await chu.opportunity.create({ data: { tenantId: A, code: `CH-QA-${DAU}`, customerId: kh.id, title: "Thắng", estimatedValue: 50_000_000, ownerId: s[0], stage: "WON", closedAt: new Date(), campaignId: cd.id } });
  const hd = (so: string, status: string, total: number) =>
    chu.invoice.create({
      data: { tenantId: A, number: `HD-QA-${so}-${DAU}`, customerId: kh.id, ownerId: s[0], status, issueDate: new Date("2026-10-10"), dueDate: new Date("2026-11-10"), ...(status === "ISSUED" ? { issuedAt: new Date(), issuedBy: s[0] } : {}), subtotal: total, total },
    });
  await hd("1", "ISSUED", 3_000_000);
  await hd("2", "DRAFT", 7_000_000);
  const ct = await voi(A, tpmk, (nc) => chiTietChienDich(nc, cd.id));
  dat("MK-01/10: utm_campaign gõ lệch hoa thường / dấu cách vẫn gắn chiến dịch", ct.chiSo.soLead === 2, String(ct.chiSo.soLead));
  dat("MK-05: chi phí đã hủy không tính (chỉ 1.000.000)", ct.chiSo.chiPhi === 1_000_000, String(ct.chiSo.chiPhi));
  dat("MK-05: CPL = 1.000.000 / 2 = 500.000 (không tính khoản hủy)", ct.chiSo.cpl === 500_000, String(ct.chiSo.cpl));
  dat("MK-05: doanh thu chỉ từ hóa đơn ĐÃ PHÁT HÀNH, không cộng cơ hội thắng, không cộng nháp", ct.chiSo.doanhThu === 3_000_000 && ct.chiSo.giaTriCoHoiThang === 50_000_000, `${ct.chiSo.doanhThu}/${ct.chiSo.giaTriCoHoiThang}`);
  dat("MK-05: ROAS = 3tr / 1tr = 3", ct.chiSo.roas === 3, String(ct.chiSo.roas));
  const tong = (await voi(A, tpmk, (nc) => danhSachChienDich(nc, { q: "", trangThai: "", kenh: "", tuNgay: "", denNgay: "" }))).tong;
  dat("MK-05: dòng tổng không đếm doanh thu hai lần", tong.doanhThu === 3_000_000, String(tong.doanhThu));
  const lCd = await chu.lead.findUniqueOrThrow({ where: { id: l1.leadId } });
  dat("MK-10: lead mang campaign_id đúng chiến dịch theo utm", lCd.campaignId === cd.id);

  let chanLh = false;
  const khLh = await voi(A, s[0], (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Khách LH ${DAU}`, xacNhanKhongTrung: true, lienHe: { hoTen: "Người liên hệ", dienThoai: dt(82) } })));
  const lh = await chu.contact.findFirstOrThrow({ where: { customerId: khLh.id } });
  try {
    await chu.contact.update({ where: { id: lh.id }, data: { marketingOptIn: true, marketingOptInAt: new Date(), marketingOptOutAt: new Date() } });
  } catch {
    chanLh = true;
  }
  dat("MK-13: CSDL chặn liên hệ vừa đồng ý vừa từ chối", chanLh);
  let chanThieuLuc = false;
  try {
    await chu.lead.update({ where: { id: lCd.id }, data: { marketingOptIn: true, marketingOptInAt: null } });
  } catch {
    chanThieuLuc = true;
  }
  dat("MK-13: CSDL chặn đồng ý mà không có thời điểm", chanThieuLuc);

  // Từ chối luôn thắng (QĐ-63): người khác gửi lại form có tích đồng ý không được xóa lời từ chối
  const kqTc = await guiCK(tA.code, "dang-ky", { hoTen: "Đã từ chối", dienThoai: dt(83) });
  const idTc = (kqTc as { leadId: string }).leadId;
  await voi(A, tpmk, (nc) => doiDongYNhanTin(nc, "lead", idTc, { dongY: false, nguon: "Khách gọi xin hủy" }));
  await guiCK(tA.code, "dang-ky", { hoTen: "Ai đó điền hộ", dienThoai: dt(83), dongYNhanTin: true });
  const sauTc = await chu.lead.findUniqueOrThrow({ where: { id: idTc } });
  dat(
    "MK-13/QĐ-63: 'từ chối luôn thắng' — form công khai gửi lại (ai cũng gửi được) không xóa lời từ chối đã ghi",
    sauTc.marketingOptOutAt !== null && !sauTc.marketingOptIn,
    `opt_in=${sauTc.marketingOptIn}, opt_out_at=${sauTc.marketingOptOutAt?.toISOString() ?? null}`,
  );

  // =====================================================================
  console.log("\n— 6. Landing: nội dung nguy hiểm —");
  dat("MK-16: nút liên kết javascript: bị từ chối", !LuocDoLanding.safeParse({ ten: "LP x", tieuDe: "LP x", khoi: [{ loai: "nut-goi", nhan: "Bấm", kieu: "lien-ket", giaTri: "javascript:alert(1)" }] }).success);
  dat("MK-16: nút liên kết JaVaScRiPt: + khoảng trắng bị từ chối", !LuocDoLanding.safeParse({ ten: "LP x", tieuDe: "LP x", khoi: [{ loai: "nut-goi", nhan: "Bấm", kieu: "lien-ket", giaTri: "  JaVaScRiPt:alert(1)" }] }).success);
  dat("MK-16: ảnh data: bị từ chối", !LuocDoLanding.safeParse({ ten: "LP x", tieuDe: "LP x", khoi: [{ loai: "anh", url: "data:image/svg+xml,<svg onload=alert(1)>", moTa: "x" }] }).success);
  dat("MK-16: ảnh http: bị từ chối", !LuocDoLanding.safeParse({ ten: "LP x", tieuDe: "LP x", khoi: [{ loai: "anh", url: "http://a.vn/a.png", moTa: "x" }] }).success);
  dat("MK-16: nút điện thoại chèn 'javascript:' bị từ chối", !LuocDoLanding.safeParse({ ten: "LP x", tieuDe: "LP x", khoi: [{ loai: "nut-goi", nhan: "Gọi", kieu: "dien-thoai", giaTri: "javascript:1" }] }).success);
  dat("MK-16: khối loại lạ 'html' bị từ chối", !LuocDoLanding.safeParse({ ten: "LP x", tieuDe: "LP x", khoi: [{ loai: "html", noiDung: "<script>alert(1)</script>" }] }).success);
  dat("MK-16: 31 khối bị từ chối", !LuocDoLanding.safeParse({ ten: "LP x", tieuDe: "LP x", khoi: Array.from({ length: 31 }, () => ({ loai: "tieu-de", tieuDe: "x" })) }).success);
  const lp = await voi(A, nvmk, (nc) => taoLanding(nc, LuocDoLanding.parse({ ten: "LP QA", tieuDe: "LP QA", khoi: [{ loai: "tieu-de", tieuDe: "Xin chào" }] })));
  await chu.landingPage.update({ where: { id: lp.id }, data: { blocks: [{ loai: "anh", url: "javascript:alert(1)", moTa: "x" }], status: "xuat-ban", publishedAt: new Date() } });
  dat("MK-16: khối bị sửa tay trong CSDL thành javascript: → trang công khai không dựng (null)", (await voiTenant(A, (tx) => docLandingCongKhai(tx, lp.slug, "A", false))) === null);
  await chu.landingPage.update({ where: { id: lp.id }, data: { blocks: [{ loai: "tieu-de", tieuDe: "OK" }], status: "an" } });
  dat("MK-16: trang ẩn → 404", (await voiTenant(A, (tx) => docLandingCongKhai(tx, lp.slug, "A", false))) === null);
  await voi(A, nvmk, (nc) => doiTrangThaiLanding(nc, lp.id, "xuat-ban"));
  const lpTk = await voi(A, tts, (nc) => chiTietLanding(nc, lp.id)).catch((e) => e);
  dat("Thực tập sinh không xem landing của người khác (phạm vi own) → 404", lpTk instanceof LoiKhongTimThay);
  dat("Landing tenant A không đọc được trong tenant B", (await voiTenant(B, (tx) => docLandingCongKhai(tx, lp.slug, "A", false))) === null);

  // =====================================================================
  console.log("\n— 7. Cách ly & bất biến —");
  const BANG_MOI = ["marketing_campaigns", "marketing_costs", "marketing_lead_assignees", "marketing_forms", "marketing_webhook_sources", "lead_captures", "marketing_segments", "landing_pages"];
  const rls = await chu.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
    `SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1::text[]) AND relkind = 'r'`, BANG_MOI,
  );
  dat("8 bảng mới đều bật RLS", rls.length === 8 && rls.every((r) => r.relrowsecurity), rls.filter((r) => !r.relrowsecurity).map((r) => r.relname).join(","));
  for (const bang of BANG_MOI) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${bang}"`);
    dat(`RLS: vai cowork_app không đặt tenant đọc ${bang} → 0 dòng`, Number(n) === 0, String(n));
  }
  const cheoB = await voiTenant(B, async (tx) => ({
    lead: await tx.lead.count({ where: { tenantId: A } }),
    nk: await tx.leadCapture.count({ where: { tenantId: A } }),
    cd: await tx.marketingCampaign.count({ where: { tenantId: A } }),
    pk: await tx.marketingSegment.count({ where: { tenantId: A } }),
    lp: await tx.landingPage.count({ where: { tenantId: A } }),
    wh: await tx.marketingWebhookSource.count({ where: { tenantId: A } }),
    cp: await tx.marketingCost.count({ where: { tenantId: A } }),
    gn: await tx.marketingLeadAssignee.count({ where: { tenantId: A } }),
  }));
  dat("RLS: trong tenant B không thấy dòng nào của A ở mọi bảng mới", Object.values(cheoB).every((n) => n === 0), JSON.stringify(cheoB));
  await nemLoi("RLS: trong tenant B ghi lead_captures mang tenant_id của A → bị chặn", "bat-ky", () =>
    voiTenant(B, (tx) => tx.leadCapture.create({ data: { tenantId: A, channel: "form", result: "spam" } })),
  );
  await nemLoi("lead_captures: vai chủ sở hữu DELETE → bị trigger chặn", "bat-ky", () => chu.leadCapture.deleteMany({ where: { tenantId: A } }));
  await nemLoi("lead_captures: vai chủ sở hữu UPDATE thô → bị trigger chặn", "bat-ky", () => chu.$executeRawUnsafe(`UPDATE lead_captures SET reason = 'sửa' WHERE tenant_id = '${A}'`));
  await nemLoi("lead_captures: vai ứng dụng DELETE trong tenant → bị chặn", "bat-ky", () => voiTenant(A, (tx) => tx.leadCapture.deleteMany({})));
  await nemLoi("lead_captures: vai ứng dụng không TRUNCATE được", "bat-ky", () => prisma.$executeRawUnsafe(`TRUNCATE lead_captures`));
  dat("lead_captures còn nguyên sau các lần cố xóa", (await chu.leadCapture.count({ where: { tenantId: A } })) > 10);

  // Phân khúc của A không đếm lead của B
  const pkA = await voi(A, gd, (nc) => danhSachPhanKhuc(nc));
  const tongA = await chu.lead.count({ where: { tenantId: A } });
  const pkTtsDem = pkA.find((p) => p.id === pkTts.id)?.dem?.tong;
  dat("Phân khúc 'mọi lead' của A đếm đúng số lead của A (không lẫn B)", pkTtsDem === tongA, `${pkTtsDem} vs ${tongA}`);

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("QA Marketing");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
