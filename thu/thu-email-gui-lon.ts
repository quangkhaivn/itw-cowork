import net from "node:net";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiNghiepVu } from "../src/lib/loi";
import { doiMaWebhookSes, docKetNoiDeGui, kiemTraTenMienGui, luuKetNoi, xemKetNoi } from "../src/modules/email/ket-noi";
import { chiTietChienDich, duyetChienDich, guiDuyetChienDich, taoChienDich, taoMau, tiepTucChienDich, xemTruocNguoiNhan } from "../src/modules/email/service";
import { guiLoThu, guiThuGiaoDich } from "../src/modules/email/gui";
import { huyNhanTin } from "../src/modules/email/cong-khai";
import { kyMaLienKet } from "../src/modules/email/ma-lien-ket";
import { LuocDoKetNoiEmail, LuocDoMau, LuocDoTaoChienDich } from "../src/modules/email/luoc-do";
import { ghiTayDongY, LuocDoGhiTayDongY, nhapCsvDongY, trangThaiDongYCuaNhieu, xemSoDongY } from "../src/modules/email/so-dong-y";
import { datMangSns, type ThongDiepSns } from "../src/modules/email/sns";
import { datBoTraDns } from "../src/modules/email/dns";
import { docHanMucHomNay } from "../src/modules/email/han-muc";
import { datVanChuyenThu, taoVanChuyenNodemailer, type CauHinhSmtp } from "../src/modules/email/van-chuyen";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { guiFormCongKhai, taoForm } from "../src/modules/marketing/service";
import { LuocDoForm } from "../src/modules/marketing/luoc-do";
import { POST as postWebhookSes } from "../src/app/api/cong-khai/email/ses/[ma]/route";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";
import { kyThongDiep, taoChungChiTuKy, thongBaoSes, URL_CHUNG_CHI, VUNG } from "./sns-gia";

/**
 * Kiểm chứng 0.18.0 "Email marketing — gửi số lượng lớn" (BUSINESS_RULES mục 29 — EG) trên CSDL THẬT,
 * qua đúng service / route mà worker và SNS gọi. Thư đi qua **nodemailer thật** vào máy chủ SMTP giả
 * (`node:net`); chứng chỉ SNS là chứng chỉ **tự ký** (openssl) cắm qua `datMangSns()`; DNS giả qua
 * `datBoTraDns()`. Không gì ra Internet, không chạm tài khoản AWS nào.
 *
 * Doanh nghiệp A: kênh Amazon SES + webhook SNS + sổ đồng ý + tự tạm dừng.
 * Doanh nghiệp C: kênh SMTP thường (chưa có AWS) — [QC], 3 thư/24 giờ với hai worker đồng thời,
 * khởi động, huỷ nhận tin → thư xác nhận, DNS "làm ngay".
 * Doanh nghiệp B: cách ly (RLS) sổ đồng ý / webhook.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}
if (!process.env.APP_ENC_KEY) {
  console.error("Thiếu APP_ENC_KEY trong .env — email cần khóa mã hóa.");
  process.exit(1);
}
process.env.APP_URL ??= "http://localhost:3000";

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Máy chủ SMTP giả — trả "250 Ok <mã thư SES>" sau DATA như cổng SMTP của SES
// ---------------------------------------------------------------------------

interface ThuNhan {
  tu: string;
  den: string[];
  du: string;
  maSes: string;
}
const hopThu: ThuNhan[] = [];
let soThu = 0;

function dungMayChuSmtp(): Promise<{ cong: number; dong: () => void }> {
  return new Promise((ok) => {
    const s = net.createServer((sock) => {
      let dem = "";
      let trongData = false;
      let thu: ThuNhan = { tu: "", den: [], du: "", maSes: "" };
      const gui = (x: string) => sock.write(`${x}\r\n`);
      gui("220 may-gia ESMTP");
      sock.on("data", (b) => {
        dem += b.toString("utf8");
        while (true) {
          if (trongData) {
            const ket = dem.indexOf("\r\n.\r\n");
            if (ket < 0) return;
            thu.du = dem.slice(0, ket);
            dem = dem.slice(ket + 5);
            trongData = false;
            thu.maSes = `0101019a${(++soThu).toString(16).padStart(8, "0")}-${randomUUID()}-000000`;
            hopThu.push(thu);
            gui(`250 Ok ${thu.maSes}`);
            thu = { tu: "", den: [], du: "", maSes: "" };
            continue;
          }
          const xd = dem.indexOf("\r\n");
          if (xd < 0) return;
          const dong = dem.slice(0, xd);
          dem = dem.slice(xd + 2);
          const lenh = dong.slice(0, 4).toUpperCase();
          if (lenh === "EHLO") gui("250-may-gia\r\n250-8BITMIME\r\n250 SMTPUTF8");
          else if (lenh === "MAIL") {
            thu.tu = dong.slice(10);
            gui("250 OK");
          } else if (lenh === "RCPT") {
            thu.den.push(/<([^>]+)>/.exec(dong)?.[1]?.toLowerCase() ?? "");
            gui("250 OK");
          } else if (lenh === "DATA") {
            trongData = true;
            gui("354 Ket thuc bang <CRLF>.<CRLF>");
          } else if (lenh === "QUIT") {
            gui("221 Tam biet");
            sock.end();
          } else gui("250 OK");
        }
      });
      sock.on("error", () => {});
    });
    s.listen(0, "127.0.0.1", () => ok({ cong: (s.address() as net.AddressInfo).port, dong: () => s.close() }));
  });
}

/** Tiêu đề thư thô → bỏ gập dòng (RFC 5322 folding) để so khớp. */
function tieuDeThu(du: string): string {
  return du.split("\r\n\r\n")[0].replace(/\r\n[ \t]+/g, " ");
}
const thuToi = (email: string) => hopThu.filter((h) => h.den.includes(email));

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-email-gui-lon"));
  });
}

async function nemLoi(ten: string, kieu: "nghiep-vu" | "quyen" | "bat-ky", khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu = kieu === "bat-ky" ? true : kieu === "quyen" ? e instanceof LoiThieuQuyen : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

const KHOI = [
  { loai: "tieu-de", noiDung: "Chao {{ten}}" },
  { loai: "doan-van", noiDung: "Uu dai thang nay cho {{cong_ty}}." },
  { loai: "nut", nhan: "Xem uu dai", url: "https://thegioitinhoc.vn/khuyen-mai" },
];

async function main() {
  console.log("=== Thử email gửi số lượng lớn (EG, 0.18.0) ===\n");
  const smtp = await dungMayChuSmtp();
  // Mọi kết nối (kể cả SES email-smtp.<vùng>.amazonaws.com) đi vào máy chủ giả; ghi lại cấu hình máy đã dựng.
  const cauHinhDaDung: CauHinhSmtp[] = [];
  datVanChuyenThu((c) => {
    cauHinhDaDung.push(c);
    return taoVanChuyenNodemailer({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", tenDangNhap: null, matKhau: null });
  });
  const cc = taoChungChiTuKy();
  const ccKhac = taoChungChiTuKy();
  const daTaiChungChi: string[] = [];
  const daGoiXacNhan: string[] = [];
  datMangSns({
    layChungChi: async (url) => {
      daTaiChungChi.push(url);
      return cc.pem;
    },
    xacNhanDangKy: async (url) => {
      daGoiXacNhan.push(url);
    },
  });

  const tA = await seedNenMong(chu, `thu-eg-a-${DAU}`, "Doanh nghiệp thử gửi lớn A");
  const tB = await seedNenMong(chu, `thu-eg-b-${DAU}`, "Doanh nghiệp thử gửi lớn B");
  const tC = await seedNenMong(chu, `thu-eg-c-${DAU}`, "Doanh nghiệp thử gửi lớn C");
  const A = tA.id;
  const B = tB.id;
  const C = tC.id;
  const vaiTro = async (tid: string, code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tid, code } } })).id;
  async function nguoi(tid: string, ten: string, vai: string) {
    const u = await chu.user.create({
      data: {
        tenantId: tid,
        email: `${ten}.${DAU}@thu.test`,
        passwordHash: "x",
        fullName: ten,
        userRoles: { create: { tenantId: tid, roleId: await vaiTro(tid, vai) } },
        staffProfile: { create: { tenantId: tid } },
      },
    });
    return u.id;
  }
  const gdA = await nguoi(A, "gd-a", "ceo");
  const tpA = await nguoi(A, "tp-mkt-a", "marketing-manager");
  const mkA = await nguoi(A, "mkt-a", "marketing");
  const ttsA = await nguoi(A, "tts-a", "marketing-intern");
  const saleA = await nguoi(A, "sale-a", "sales");
  const gdB = await nguoi(B, "gd-b", "ceo");
  const gdC = await nguoi(C, "gd-c", "ceo");
  const tpC = await nguoi(C, "tp-mkt-c", "marketing-manager");
  const mkC = await nguoi(C, "mkt-c", "marketing");
  for (const t of [A, B, C]) await chu.tenantSetting.create({ data: { tenantId: t, key: "cong_ty.dia_chi", value: "12 Đường Thử, Quận 1, TP.HCM" } });
  console.log("");

  let soLead = 0;
  const lead = async (tid: string, owner: string, email: string, nguon: string, them: Record<string, unknown> = {}) =>
    (
      await chu.lead.create({
        data: { tenantId: tid, code: `LD-EG${DAU}-${++soLead}`, fullName: `Khach ${soLead}`, companyName: `Cty ${soLead}`, email, emailNormalized: email.toLowerCase(), source: nguon, ownerId: owner, ...them },
      })
    ).id;

  // ------------------------------------------------------------------
  console.log("— EG-01: kênh Amazon SES —");
  const kn = (them: Record<string, unknown>) =>
    LuocDoKetNoiEmail.parse({ kenh: "ses", sesVung: VUNG, tenDangNhap: "AKIATHUSMTP", matKhau: `MatKhauSes-${DAU}`, tenNguoiGui: "ITW", emailNguoiGui: "tin@tin.itwonline.com", ...them });
  await nemLoi("SES cần tên miền gửi", "nghiep-vu", () => voi(A, gdA, (nc) => luuKetNoi(nc, kn({}))), "thieu-ten-mien-gui");
  await nemLoi("Địa chỉ gửi phải thuộc tên miền gửi", "nghiep-vu", () => voi(A, gdA, (nc) => luuKetNoi(nc, kn({ tenMienGui: "tin.itwonline.com", emailNguoiGui: "sale@itwonline.com" }))), "dia-chi-ngoai-ten-mien");
  await nemLoi("MAIL FROM phải là tên miền con của tên miền gửi", "nghiep-vu", () => voi(A, gdA, (nc) => luuKetNoi(nc, kn({ tenMienGui: "tin.itwonline.com", tenMienMailFrom: "bounce.khac.vn" }))), "mail-from-ngoai-ten-mien");
  await nemLoi("Chủ đề SNS phải cùng vùng SES", "nghiep-vu", () => voi(A, gdA, (nc) => luuKetNoi(nc, kn({ tenMienGui: "tin.itwonline.com", sesTopicArn: "arn:aws:sns:us-east-1:123456789012:ses" }))), "topic-khac-vung");
  dat("Lược đồ: vùng AWS sai khuôn bị từ chối", !LuocDoKetNoiEmail.safeParse({ kenh: "ses", sesVung: "ap-southeast-1.evil.com", tenNguoiGui: "x", emailNguoiGui: "a@b.vn" }).success);
  const TOPIC = "arn:aws:sns:ap-southeast-1:123456789012:cowork-ses-su-kien";
  await voi(A, gdA, (nc) =>
    luuKetNoi(nc, kn({ host: "evil.example", port: 25, baoMat: "none", tenMienGui: "tin.itwonline.com", sesConfigurationSet: "cowork-tin", dkim: ["abcdefghijklmnop1111", "abcdefghijklmnop2222", "abcdefghijklmnop3333"], dmarcRua: "dmarc@itwonline.com", sesTopicArn: TOPIC })),
  );
  const dongA = await chu.emailSetting.findFirstOrThrow({ where: { tenantId: A } });
  dat("SES: máy chủ / cổng / mã hóa do máy đặt theo vùng (bỏ giá trị form gửi lên)", dongA.host === "email-smtp.ap-southeast-1.amazonaws.com" && dongA.port === 587 && dongA.security === "starttls", `${dongA.host}:${dongA.port} ${dongA.security}`);
  dat("SES: mật khẩu SMTP mã hóa v1:", dongA.passwordEnc?.startsWith("v1:") === true && !JSON.stringify(dongA).includes(`MatKhauSes-${DAU}`));
  await chu.emailSetting.update({ where: { id: dongA.id }, data: { host: "evil.example", port: 25 } });
  const kdg = await voiTenant(A, (tx) => docKetNoiDeGui(tx, A));
  dat("SES: lúc gửi luôn dựng email-smtp.<vùng>.amazonaws.com:587 STARTTLS, không tin cột host", kdg?.smtp.host === "email-smtp.ap-southeast-1.amazonaws.com" && kdg.smtp.port === 587 && kdg.smtp.baoMat === "starttls" && kdg.kenh === "ses");
  let loCheck = false;
  try {
    await chu.emailSetting.update({ where: { id: dongA.id }, data: { fromEmail: "x@khac.vn" } });
  } catch {
    loCheck = true;
  }
  dat("[CSDL] CHECK: kênh SES thì địa chỉ gửi phải thuộc tên miền gửi", loCheck);
  const xemA = await voi(A, gdA, (nc) => xemKetNoi(nc));
  dat("Xem kết nối không lộ mật khẩu; có tên miền + hạn mức hôm nay (SES mặc định 5.000/ngày)", !JSON.stringify(xemA).includes(dongA.passwordEnc!) && xemA.tenMien?.mailFrom === "bounce.tin.itwonline.com" && xemA.hanMuc.tranNgayDat === 5000 && xemA.hanMuc.tranNgayMacDinhSes, JSON.stringify(xemA.hanMuc));

  // ------------------------------------------------------------------
  console.log("\n— EG-08: sổ đồng ý — form, ghi tay, CSV —");
  await voi(A, gdA, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 600 } }));
  const formHoi = await voi(A, mkA, (nc) =>
    taoForm(nc, LuocDoForm.parse({ ten: "Dang ky nhan tin", tieuDe: "Nhan uu dai", nguon: "website", truong: [{ khoa: "hoTen", batBuoc: true }, { khoa: "email", batBuoc: true }], cauDongY: "Tôi đồng ý nhận thư quảng cáo qua email" })),
  );
  const formKhongHoi = await voi(A, mkA, (nc) => taoForm(nc, LuocDoForm.parse({ ten: "Lien he chung", tieuDe: "Lien he", nguon: "website", truong: [{ khoa: "hoTen", batBuoc: true }, { khoa: "email", batBuoc: true }] })));
  const meta = { ip: "203.0.113.7", userAgent: "thu" };
  const eForm = `form.${DAU}@gmail.com`;
  const eFormKhong = `khongtich.${DAU}@outlook.com`;
  const eFormKhongHoi = `khonghoi.${DAU}@yahoo.com`;
  await voiTenant(A, (tx) => guiFormCongKhai(tx, A, formHoi.slug, { hoTen: "Khach Form", email: eForm, dongYNhanTin: true }, meta));
  await voiTenant(A, (tx) => guiFormCongKhai(tx, A, formHoi.slug, { hoTen: "Khach Khong Tich", email: eFormKhong, dongYNhanTin: false }, meta));
  await voiTenant(A, (tx) => guiFormCongKhai(tx, A, formKhongHoi.slug, { hoTen: "Khach Khong Hoi", email: eFormKhongHoi, dongYNhanTin: true }, meta));
  const soForm = await chu.emailConsent.findMany({ where: { tenantId: A, email: eForm } });
  dat("Form có ô đồng ý + khách tự tích → một dòng 'dong-y' nguồn form, căn cứ ghi câu chữ ô đồng ý", soForm.length === 1 && soForm[0].action === "dong-y" && soForm[0].source === "form" && soForm[0].evidence.includes("Tôi đồng ý nhận thư quảng cáo") && soForm[0].ipAddress === meta.ip && (soForm[0].evidenceRef ?? "").startsWith("lead_capture:"), JSON.stringify(soForm[0]));
  dat("Không tích ô đồng ý → không ghi đồng ý", (await chu.emailConsent.count({ where: { tenantId: A, email: eFormKhong } })) === 0);
  dat("Form không hỏi đồng ý → không bao giờ coi là đồng ý (dù thân gửi dongYNhanTin: true)", (await chu.emailConsent.count({ where: { tenantId: A, email: eFormKhongHoi } })) === 0);

  const eTay = `tay.${DAU}@abc-corp.vn`;
  const eChuaCo = `chuaco.${DAU}@gmail.com`;
  const eCsv = `csv.${DAU}@gmail.com`;
  dat("Ghi tay: căn cứ bắt buộc (tối thiểu 10 ký tự)", !LuocDoGhiTayDongY.safeParse({ email: eTay, hanhDong: "dong-y", canCu: "ok" }).success);
  await nemLoi("Nhân viên kinh doanh không ghi được sổ đồng ý (marketing.update)", "quyen", () => voi(A, saleA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eTay, hanhDong: "dong-y", canCu: "Khách ký phiếu đăng ký tại hội thảo 20/10" }))));
  await nemLoi("Thực tập sinh marketing không ghi được sổ đồng ý", "quyen", () => voi(A, ttsA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eTay, hanhDong: "dong-y", canCu: "Khách ký phiếu đăng ký tại hội thảo 20/10" }))));
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eTay, hanhDong: "dong-y", canCu: "Khách ký phiếu đăng ký tại hội thảo 20/10, bản scan lưu ở hồ sơ HT-10" })));
  dat("Ghi tay có căn cứ → 'dong-y' nguồn nhap-tay, có người ghi", (await chu.emailConsent.count({ where: { tenantId: A, email: eTay, action: "dong-y", source: "nhap-tay", actorEmail: `mkt-a.${DAU}@thu.test` } })) === 1);

  const csv = [
    "Email;Nguồn;Căn cứ;Thời điểm",
    `${eCsv};Hội thảo camera 10/2026;Phiếu đăng ký số 15;15/10/2026 09:30`,
    `${eCsv};Trùng;Phiếu khác;16/10/2026`,
    `sai-email;Hội thảo;Phiếu 16;15/10/2026`,
    `ngay.${DAU}@gmail.com;Hội thảo;Phiếu 17;31/02/2026`,
    `tuonglai.${DAU}@gmail.com;Hội thảo;Phiếu 18;01/01/2099`,
    `ngan.${DAU}@gmail.com;Hội thảo;x;15/10/2026`,
  ].join("\n");
  const thuCsv = await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csv, chiKiemTra: true }));
  dat("CSV đọc thử: 1 dòng ghi được, 5 dòng lỗi có số dòng — không ghi gì", thuCsv.soGhi === 1 && thuCsv.soLoi === 5 && thuCsv.loi.map((l) => l.soDong).join(",") === "3,4,5,6,7" && (await chu.emailConsent.count({ where: { tenantId: A, email: eCsv } })) === 0, JSON.stringify(thuCsv));
  await nemLoi("CSV thiếu cột → từ chối", "nghiep-vu", () => voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: "Email;Nguồn\na@b.vn;x", chiKiemTra: false })), "thieu-cot");
  await nemLoi("CSV cần marketing.update", "quyen", () => voi(A, saleA, (nc) => nhapCsvDongY(nc, { noiDung: csv, chiKiemTra: false })));
  const ghiCsv = await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csv, chiKiemTra: false }));
  const dongCsv = await chu.emailConsent.findFirst({ where: { tenantId: A, email: eCsv } });
  dat("CSV: ghi 'dong-y' nguồn nhap-csv, thời điểm theo tệp (giờ VN), căn cứ gồm nguồn + căn cứ", ghiCsv.soGhi === 1 && dongCsv?.source === "nhap-csv" && dongCsv.occurredAt.toISOString() === "2026-10-15T02:30:00.000Z" && dongCsv.evidence.includes("Hội thảo camera") && dongCsv.evidence.includes("Phiếu đăng ký số 15"), JSON.stringify(dongCsv));
  dat("CSV nhập lại cùng tệp: không ghi trùng (đã có)", (await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csv, chiKiemTra: false }))).soGhi === 0 && (await chu.emailConsent.count({ where: { tenantId: A, email: eCsv } })) === 1);

  // Sổ chỉ ghi thêm: cả vai chủ sở hữu lẫn vai ứng dụng.
  let suaDuoc = true;
  try {
    await chu.emailConsent.updateMany({ where: { tenantId: A }, data: { evidence: "sửa lén" } });
  } catch {
    suaDuoc = false;
  }
  let xoaDuoc = true;
  try {
    await voiTenant(A, (tx) => tx.emailConsent.deleteMany({ where: { email: eForm } }));
  } catch {
    xoaDuoc = false;
  }
  dat("[CSDL] Sổ đồng ý chỉ ghi thêm: chặn sửa (trigger) và xóa (ứng dụng không có quyền)", !suaDuoc && !xoaDuoc && (await chu.emailConsent.count({ where: { tenantId: A, email: eForm } })) === 1);
  let canCuRong = false;
  try {
    await chu.emailConsent.create({ data: { tenantId: A, email: `x.${DAU}@a.vn`, action: "dong-y", source: "nhap-tay", evidence: "ngắn", occurredAt: new Date() } });
  } catch {
    canCuRong = true;
  }
  dat("[CSDL] CHECK: đồng ý phải có căn cứ ≥ 10 ký tự", canCuRong);

  // ------------------------------------------------------------------
  console.log("\n— EG-09: chốt người nhận chỉ lấy người có đồng ý còn hiệu lực —");
  const eRut = `rut.${DAU}@gmail.com`;
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eRut, hanhDong: "dong-y", canCu: "Khách gửi email xin nhận bản tin 01/10", thoiDiem: "2026-10-01T09:00" })));
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eRut, hanhDong: "rut", canCu: "Khách gọi điện xin dừng nhận thư" })));
  for (const e of [eTay, eChuaCo, eCsv, eRut]) await lead(A, saleA, e, "website");
  // Lead có cờ đồng ý cũ (marketing_opt_in) nhưng không có dòng nào trong sổ → vẫn bị loại.
  await chu.lead.updateMany({ where: { tenantId: A, emailNormalized: eChuaCo }, data: { marketingOptIn: true, marketingOptInAt: new Date(), marketingConsentSource: "tu-khai" } });
  const mauA = await voi(A, mkA, (nc) => taoMau(nc, LuocDoMau.parse({ ten: "Mau A", tieuDe: "[QC] Uu dai cho {{cong_ty}}", khoi: KHOI })));
  const thamSoA = { doiTuong: "lead", nguon: ["website"] };
  const xt = await voi(A, mkA, (nc) => xemTruocNguoiNhan(nc, "loc-don-gian", thamSoA));
  const lyDoXt = Object.fromEntries(xt.biLoai.map((b) => [b.lyDo, b.so]));
  dat("Xem trước: chỉ 3 người có đồng ý (form, ghi tay, CSV); 'chưa đồng ý' 3 người; người đã rút tính 'đã từ chối'", xt.hopLe === 3 && lyDoXt["chua-dong-y"] === 3 && lyDoXt["da-tu-choi"] === 1, JSON.stringify(xt.biLoai));
  const cdA = await voi(A, mkA, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Chien dich A", mauId: mauA.id, thamSo: thamSoA })));
  await voi(A, mkA, (nc) => guiDuyetChienDich(nc, cdA.id));
  const dyA = await voi(A, tpA, (nc) => duyetChienDich(nc, cdA.id));
  const nnA = await chu.emailRecipient.findMany({ where: { campaignId: cdA.id } });
  const boQuaChua = nnA.filter((r) => r.status === "SKIPPED" && r.reason === "Chưa có đồng ý nhận thư quảng cáo");
  dat("Duyệt: 3 vào hàng gửi, 3 dòng 'Bị loại — Chưa có đồng ý nhận thư quảng cáo' (kể cả người chỉ có cờ cũ)", dyA.tomTat.hopLe === 3 && boQuaChua.length === 3 && boQuaChua.some((r) => r.email === eChuaCo), JSON.stringify(dyA.tomTat));
  dat("Người đã rút đồng ý: Bị loại 'Đã từ chối nhận tin'", nnA.some((r) => r.email === eRut && r.status === "SKIPPED" && r.reason === "Đã từ chối nhận tin"));
  // Rút đồng ý SAU lúc duyệt, trước lượt gửi → lúc gửi kiểm lại và loại.
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eCsv, hanhDong: "rut", canCu: "Khách trả lời thư xin dừng" })));

  // ------------------------------------------------------------------
  console.log("\n— EG-01 + EG-06: gửi qua SES — tiêu đề phụ, mã thư, nhãn [QC] —");
  const truocA = hopThu.length;
  const loA = await guiLoThu(A);
  const thuA = hopThu.slice(truocA);
  dat("Gửi 2 thư (người vừa rút đồng ý bị loại lúc gửi)", loA.daGui === 2 && loA.boQua === 1 && thuToi(eCsv).length === 0, JSON.stringify(loA));
  dat("Người vừa rút: Bị loại kèm lý do", (await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cdA.id, email: eCsv } })).status === "SKIPPED");
  dat("Kết nối SES dựng tới email-smtp.ap-southeast-1.amazonaws.com:587 STARTTLS với tên đăng nhập SMTP", cauHinhDaDung.some((c) => c.host === "email-smtp.ap-southeast-1.amazonaws.com" && c.port === 587 && c.baoMat === "starttls" && c.tenDangNhap === "AKIATHUSMTP" && c.matKhau === `MatKhauSes-${DAU}`));
  const thuForm = thuA.find((h) => h.den.includes(eForm))!;
  const td = tieuDeThu(thuForm.du);
  dat("Tiêu đề X-SES-CONFIGURATION-SET", /^X-SES-CONFIGURATION-SET: cowork-tin$/im.test(td), td.slice(0, 600));
  const rForm = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cdA.id, email: eForm } });
  dat("Tiêu đề X-SES-MESSAGE-TAGS mang doanh nghiệp + người nhận", new RegExp(`^X-SES-MESSAGE-TAGS: cowork_tenant=${A}, cowork_recipient=${rForm.id}$`, "im").test(td));
  dat("Lưu mã thư SES từ câu '250 Ok <mã>'", rForm.messageId === thuForm.maSes, `${rForm.messageId} vs ${thuForm.maSes}`);
  const tieuDeMoi = /^Subject: (.*)$/m.exec(td)?.[1] ?? "";
  dat("EG-06: tiêu đề mở đầu [QC] đúng một lần (mẫu đã có [QC] sẵn)", tieuDeMoi.startsWith("[QC] Uu dai cho") && tieuDeMoi.split("[QC]").length === 2, tieuDeMoi);
  const ctA = await voi(A, mkA, (nc) => chiTietChienDich(nc, cdA.id));
  dat("Xem trước chiến dịch mang nhãn [QC] như thư thật", ctA.xemTruoc.tieuDe.startsWith("[QC] "));

  // ------------------------------------------------------------------
  console.log("\n— EG-02 / EG-03: webhook SNS — mã, chữ ký, chủ đề, chứng chỉ, trùng lặp —");
  await nemLoi("Doanh nghiệp B (kênh SMTP / chưa có kết nối) không tạo được mã webhook SES", "nghiep-vu", () => voi(B, gdB, (nc) => doiMaWebhookSes(nc)), "chua-bat-ses");
  await nemLoi("Nhân viên marketing không tạo được mã webhook (integration.update)", "quyen", () => voi(A, mkA, (nc) => doiMaWebhookSes(nc)));
  const wh1 = await voi(A, gdA, (nc) => doiMaWebhookSes(nc));
  const wh = await voi(A, gdA, (nc) => doiMaWebhookSes(nc));
  const ma1 = wh1.url.split("/").pop()!;
  const MA = wh.url.split("/").pop()!;
  dat("URL webhook dạng /api/cong-khai/email/ses/ses_…; máy chủ chỉ giữ băm", /\/api\/cong-khai\/email\/ses\/ses_[A-Za-z0-9_-]{54}$/.test(wh.url) && !JSON.stringify(await chu.emailSetting.findFirstOrThrow({ where: { tenantId: A } })).includes(MA));
  const goi = async (ma: string, than: string | object, tieuDe: Record<string, string> = {}) => {
    const r = await postWebhookSes(
      new NextRequest(`http://localhost:3000/api/cong-khai/email/ses/${ma}`, { method: "POST", body: typeof than === "string" ? than : JSON.stringify(than), headers: { "content-type": "text/plain; charset=UTF-8", ...tieuDe } }),
      { params: Promise.resolve({ ma }) },
    );
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const mail = (r: { id: string; messageId: string | null }) => ({ messageId: r.messageId, timestamp: new Date().toISOString(), destination: [], tags: { cowork_tenant: [A], cowork_recipient: [r.id] } });
  const giaoToi = thongBaoSes(TOPIC, { eventType: "Delivery", mail: mail(rForm), delivery: { timestamp: new Date().toISOString(), recipients: [eForm], smtpResponse: "250 ok" } }, cc.khoaRieng);
  dat("Mã đã đổi (cũ) → 403", (await goi(ma1, giaoToi)).status === 403);
  dat("Mã sai khuôn → 403", (await goi("khong-hop-le", giaoToi)).status === 403);
  dat("Thân không phải JSON → 400", (await goi(MA, "{hỏng")).status === 400);
  dat("JSON không phải thông điệp SNS → 400", (await goi(MA, { Type: "Notification", hello: 1 })).status === 400);
  dat("Tiêu đề x-amz-sns-message-type lệch Type → 400", (await goi(MA, giaoToi, { "x-amz-sns-message-type": "SubscriptionConfirmation" })).status === 400);
  const r413 = await postWebhookSes(new NextRequest(`http://localhost:3000/api/cong-khai/email/ses/${MA}`, { method: "POST", body: "x".repeat(310_000) }), { params: Promise.resolve({ ma: MA }) });
  dat("Thân quá 300 KB → 413", r413.status === 413);
  dat("Chủ đề khác chủ đề đã khai → 403", (await goi(MA, thongBaoSes("arn:aws:sns:ap-southeast-1:123456789012:chu-de-khac", { eventType: "Delivery", mail: mail(rForm) }, cc.khoaRieng))).status === 403);
  const truocTai = daTaiChungChi.length;
  const hostSai = kyThongDiep({ ...giaoToi, MessageId: randomUUID(), SigningCertURL: "https://sns.ap-southeast-1.amazonaws.com.evil.example/cert.pem" }, cc.khoaRieng);
  dat("URL chứng chỉ ngoài sns.<vùng>.amazonaws.com → 403, KHÔNG tải", (await goi(MA, hostSai)).status === 403 && daTaiChungChi.length === truocTai);
  const khacVung = kyThongDiep({ ...giaoToi, MessageId: randomUUID(), SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-x.pem" }, cc.khoaRieng);
  dat("Chứng chỉ ở vùng khác vùng chủ đề → 403", (await goi(MA, khacVung)).status === 403 && daTaiChungChi.length === truocTai);
  dat("Chữ ký bằng khóa khác (chứng chỉ không khớp) → 403", (await goi(MA, thongBaoSes(TOPIC, { eventType: "Delivery", mail: mail(rForm) }, ccKhac.khoaRieng))).status === 403);
  dat("Sửa nội dung sau khi ký → 403", (await goi(MA, { ...giaoToi, Message: giaoToi.Message.replace("Delivery", "Complaint") })).status === 403);
  dat("Chứng chỉ được đệm (tải một lần cho một URL)", daTaiChungChi.filter((u) => u === URL_CHUNG_CHI).length === 1, String(daTaiChungChi.length));
  const ok1 = await goi(MA, giaoToi, { "x-amz-sns-message-type": "Notification" });
  dat("Thông điệp hợp lệ (chữ ký v2) → 200, ghi delivered_at", ok1.status === 200 && (await chu.emailRecipient.findUniqueOrThrow({ where: { id: rForm.id } })).deliveredAt !== null, JSON.stringify(ok1));
  const lap = await goi(MA, giaoToi);
  dat("Gửi lại đúng MessageId → 200 'trùng lặp', không ghi sự kiện thứ hai", lap.status === 200 && lap.json.trungLap === true && (await chu.emailEvent.count({ where: { recipientId: rForm.id, eventType: "delivery" } })) === 1);
  const moi = thongBaoSes(TOPIC, { eventType: "Send", mail: mail(rForm), send: {} }, cc.khoaRieng);
  const [ss1, ss2] = await Promise.all([goi(MA, moi), goi(MA, moi)]);
  dat("Cùng một thông điệp MỚI tới hai lần cùng lúc → chỉ xử lý một lần", ss1.status === 200 && ss2.status === 200 && (await chu.emailEvent.count({ where: { recipientId: rForm.id, eventType: "send" } })) === 1 && [ss1, ss2].filter((x) => x.json.trungLap === true).length === 1, JSON.stringify([ss1.json, ss2.json]));
  const v1 = thongBaoSes(TOPIC, { eventType: "Send", mail: mail(rForm), send: {} }, cc.khoaRieng, { SignatureVersion: "1", Subject: "Amazon SES Email Event Notification" });
  dat("Chữ ký phiên bản 1 (SHA1) + có Subject → 200", (await goi(MA, v1)).status === 200 && (await chu.emailEvent.count({ where: { recipientId: rForm.id, eventType: "send" } })) === 2);
  dat("Nhật ký SNS chỉ ghi thêm", await (async () => {
    try {
      await chu.emailSnsMessage.updateMany({ where: { tenantId: A }, data: { note: "x" } });
      return false;
    } catch {
      return true;
    }
  })());

  console.log("\n— SubscriptionConfirmation —");
  const xn = (url: string) =>
    kyThongDiep({ Type: "SubscriptionConfirmation", MessageId: randomUUID(), TopicArn: TOPIC, Message: "You have chosen to subscribe…", Timestamp: new Date().toISOString(), SigningCertURL: URL_CHUNG_CHI, SubscribeURL: url, Token: "tok-123" }, cc.khoaRieng);
  const xnSai = await goi(MA, xn("https://169.254.169.254/latest/meta-data/"));
  dat("SubscribeURL không phải sns.<vùng>.amazonaws.com → 403, KHÔNG gọi (chống SSRF)", xnSai.status === 403 && daGoiXacNhan.length === 0);
  const urlDung = "https://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=x&Token=tok-123";
  const xnDung = xn(urlDung);
  const xnOk = await goi(MA, xnDung, { "x-amz-sns-message-type": "SubscriptionConfirmation" });
  dat("SubscribeURL đúng host → gọi xác nhận một lần, ghi lúc đăng ký", xnOk.status === 200 && daGoiXacNhan.length === 1 && daGoiXacNhan[0] === urlDung && (await chu.emailSetting.findFirstOrThrow({ where: { tenantId: A } })).sesSubscribedAt !== null);
  dat("Gửi lại xác nhận → không gọi lần hai", (await goi(MA, xnDung)).status === 200 && daGoiXacNhan.length === 1);

  // ------------------------------------------------------------------
  console.log("\n— EG-04: trả lại / báo rác —");
  const rTay = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cdA.id, email: eTay } });
  await goi(MA, thongBaoSes(TOPIC, { eventType: "Bounce", mail: mail(rTay), bounce: { bounceType: "Transient", bounceSubType: "MailboxFull", bouncedRecipients: [{ emailAddress: eTay }] } }, cc.khoaRieng));
  const sauTam = await chu.emailRecipient.findUniqueOrThrow({ where: { id: rTay.id } });
  dat("Trả lại tạm thời: không chặn, không đổi trạng thái", sauTam.status === "SENT" && sauTam.bouncedAt === null && sauTam.bounceType === "Transient" && (await chu.emailSuppression.count({ where: { tenantId: A, email: eTay } })) === 0);
  await goi(MA, thongBaoSes(TOPIC, { eventType: "Bounce", mail: mail(rTay), bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: eTay, diagnosticCode: "smtp; 550 5.1.1 user unknown" }] } }, cc.khoaRieng));
  const sauHong = await chu.emailRecipient.findUniqueOrThrow({ where: { id: rTay.id } });
  dat("Trả lại vĩnh viễn: Lỗi kèm lý do, bounced_at, danh sách chặn 'email-hong'", sauHong.status === "FAILED" && (sauHong.reason ?? "").includes("trả lại vĩnh viễn") && sauHong.bouncedAt !== null && (await chu.emailSuppression.count({ where: { tenantId: A, email: eTay, reason: "email-hong" } })) === 1, `${sauHong.status} ${sauHong.reason}`);
  await goi(MA, thongBaoSes(TOPIC, { notificationType: "Complaint", mail: mail(rForm), complaint: { complainedRecipients: [{ emailAddress: eForm }], complaintFeedbackType: "abuse" } }, cc.khoaRieng));
  const sauRac = await chu.emailRecipient.findUniqueOrThrow({ where: { id: rForm.id } });
  const ttRac = (await voiTenant(A, (tx) => trangThaiDongYCuaNhieu(tx, [eForm]))).get(eForm);
  const leadRac = await chu.lead.findMany({ where: { tenantId: A, emailNormalized: eForm } });
  dat("Báo rác: complained_at, chặn 'bao-rac', sổ ghi 'phan-doi', mọi lead cùng email bị đánh dấu từ chối", sauRac.complainedAt !== null && (await chu.emailSuppression.count({ where: { tenantId: A, email: eForm, reason: "bao-rac" } })) === 1 && ttRac?.hanhDong === "phan-doi" && leadRac.length > 0 && leadRac.every((l) => l.marketingOptOutAt && !l.marketingOptIn && l.marketingConsentSource === "bao-rac-email"));
  dat("Báo rác: KHÔNG gửi thư xác nhận", (await chu.emailTransactional.count({ where: { tenantId: A, email: eForm } })) === 0);
  await nemLoi("Đồng ý lại sau khi báo rác: phải tích xác nhận", "nghiep-vu", () => voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eForm, hanhDong: "dong-y", canCu: "Khách gọi lại xin nhận tin tiếp, ghi âm cuộc gọi 25/10" }))), "can-xac-nhan-sau-tu-choi");
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eForm, hanhDong: "dong-y", canCu: "Khách gọi lại xin nhận tin tiếp, ghi âm cuộc gọi 25/10", xacNhanSauTuChoi: true })));
  dat("Đồng ý lại có xác nhận: sổ 'dong-y', gỡ chặn báo rác, lead bỏ từ chối", (await voiTenant(A, (tx) => trangThaiDongYCuaNhieu(tx, [eForm]))).get(eForm)?.hanhDong === "dong-y" && (await chu.emailSuppression.count({ where: { tenantId: A, email: eForm, status: "hoat-dong" } })) === 0 && (await chu.lead.count({ where: { tenantId: A, emailNormalized: eForm, marketingOptOutAt: { not: null } } })) === 0);
  const nhapLaiRut = await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: `Email;Nguồn;Căn cứ;Thời điểm\n${eRut};Hội thảo;Phiếu 99;20/10/2026`, chiKiemTra: false }));
  dat("CSV không ghi được đồng ý cho người đã rút", nhapLaiRut.soGhi === 0 && nhapLaiRut.loi[0]?.lyDo.includes("đã rút"));
  const soA = await voi(A, ttsA, (nc) => xemSoDongY(nc, { q: "", trang: 1 }));
  dat("Thực tập sinh xem sổ: email bị che", soA.dong.length > 0 && soA.dong.every((d) => d.email.includes("•••")));
  const soQ = await voi(A, mkA, (nc) => xemSoDongY(nc, { q: eForm, trang: 1 }));
  dat("Tra theo email: lịch sử đủ 3 dòng + trạng thái hiện hành", soQ.dong.length === 3 && soQ.hienTai?.hanhDong === "dong-y", JSON.stringify(soQ.dong.map((d) => d.hanhDong)));

  // ------------------------------------------------------------------
  console.log("\n— EG-05: tự tạm dừng khi tỷ lệ trả lại vượt ngưỡng —");
  await voi(A, gdA, (nc) => capNhatCauHinh(nc, { giaTri: { "email.mau_toi_thieu_danh_gia": 20 } }));
  const emailsP = Array.from({ length: 25 }, (_, i) => `p${i}.${DAU}@gmail.com`);
  for (const e of emailsP) await lead(A, saleA, e, "nguon-p");
  await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: ["Email;Nguồn;Căn cứ;Thời điểm", ...emailsP.map((e) => `${e};Hội thảo;Phiếu đăng ký;20/10/2026`)].join("\n"), chiKiemTra: false }));
  const cdP = await voi(A, mkA, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Chien dich P", mauId: mauA.id, thamSo: { doiTuong: "lead", nguon: ["nguon-p"] } })));
  await voi(A, mkA, (nc) => guiDuyetChienDich(nc, cdP.id));
  await voi(A, tpA, (nc) => duyetChienDich(nc, cdP.id));
  // Gửi 22 thư (chừa 3 chờ để chiến dịch còn đang gửi).
  await voi(A, gdA, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 22 } }));
  // Mốc giả tương lai để ra khỏi cửa sổ "thư/phút" của các lần gửi ở trên.
  const tP = Date.now() + 120_000;
  const loP = await guiLoThu(A, new Date(tP));
  dat("Gửi 22/25 thư", loP.daGui === 22, JSON.stringify(loP));
  const daGuiP = await chu.emailRecipient.findMany({ where: { campaignId: cdP.id, status: "SENT" }, orderBy: { email: "asc" } });
  await goi(MA, thongBaoSes(TOPIC, { eventType: "Bounce", mail: mail(daGuiP[0]), bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: daGuiP[0].email }] } }, cc.khoaRieng));
  dat("1/22 trả lại (4,5%) — chưa vượt 5%, vẫn gửi", (await chu.emailCampaign.findUniqueOrThrow({ where: { id: cdP.id } })).status === "SENDING");
  await goi(MA, thongBaoSes(TOPIC, { eventType: "Bounce", mail: mail(daGuiP[1]), bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: daGuiP[1].email }] } }, cc.khoaRieng));
  const cP = await chu.emailCampaign.findUniqueOrThrow({ where: { id: cdP.id } });
  dat("2/22 trả lại (9,1%) > 5% → máy tự tạm dừng ngay khi nhận sự kiện, kèm lý do", cP.status === "PAUSED" && cP.pauseCode === "ty-le-hong" && (cP.pauseReason ?? "").includes("vượt ngưỡng 5%"), `${cP.status} ${cP.pauseReason}`);
  const tbP = await chu.notification.findMany({ where: { tenantId: A, objectId: cdP.id, type: "email-tam-dung" } });
  dat("Báo người duyệt (marketing.approve) và người lập", tbP.some((t) => t.userId === tpA) && tbP.some((t) => t.userId === gdA) && tbP.some((t) => t.userId === mkA), tbP.map((t) => t.userId).join(","));
  dat("Sự kiện + kiểm toán 'tu-tam-dung'", (await chu.auditLog.count({ where: { tenantId: A, objectId: cdP.id, action: "tu-tam-dung" } })) === 1);
  await goi(MA, thongBaoSes(TOPIC, { eventType: "Bounce", mail: mail(daGuiP[2]), bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: daGuiP[2].email }] } }, cc.khoaRieng));
  dat("Thêm một lần trả lại: không báo trùng", (await chu.notification.count({ where: { tenantId: A, objectId: cdP.id, type: "email-tam-dung" } })) === tbP.length);
  dat("Đang tạm dừng thì worker không gửi tiếp", (await guiLoThu(A, new Date(tP + 65_000))).daGui === 0);
  await voi(A, tpA, (nc) => tiepTucChienDich(nc, cdP.id));
  const cP2 = await chu.emailCampaign.findUniqueOrThrow({ where: { id: cdP.id } });
  dat("Tiếp tục: chụp mốc (mẫu 22, hỏng 3) — chỉ xét thư gửi sau mốc", cP2.status === "SENDING" && cP2.rateBaseSample === 22 && cP2.rateBaseBounced === 3, `${cP2.rateBaseSample}/${cP2.rateBaseBounced}`);
  const loP2 = await guiLoThu(A, new Date(tP + 130_000));
  dat("Sau khi tiếp tục không bị dừng lại ngay vì thư cũ; gửi nốt 3 thư", loP2.daGui === 3 && (await chu.emailCampaign.findUniqueOrThrow({ where: { id: cdP.id } })).status === "SENDING", JSON.stringify(loP2));

  // ------------------------------------------------------------------
  console.log("\n— EG-11: báo cáo theo tên miền nhận —");
  const ctA2 = await voi(A, mkA, (nc) => chiTietChienDich(nc, cdA.id));
  const tm = Object.fromEntries((ctA2.theoTenMien ?? []).map((t) => [t.nhom, t]));
  dat("4 nhóm; gmail: 1 gửi, 1 tới hộp thư, 1 báo rác; khác: 1 gửi, 1 trả lại", ctA2.theoTenMien?.length === 4 && tm["gmail.com"].daGui === 1 && tm["gmail.com"].denHop === 1 && tm["gmail.com"].baoRac === 1 && tm["khac"].daGui === 1 && tm["khac"].hong === 1 && tm["outlook.com"].daGui === 0, JSON.stringify(ctA2.theoTenMien));
  dat("Thống kê chiến dịch có tới hộp thư / trả lại / báo rác", ctA2.thongKe.denHop === 1 && ctA2.thongKe.hong === 1 && ctA2.thongKe.baoRac === 1, JSON.stringify(ctA2.thongKe));

  // ------------------------------------------------------------------
  console.log("\n— EG-12: kiểm tra DNS (SES và SMTP) —");
  datBoTraDns({
    txt: async (ten) => {
      if (ten === "_dmarc.tin.itwonline.com") return [["v=DMARC1; p=none; rua=mailto:dmarc@itwonline.com"]];
      if (ten === "bounce.tin.itwonline.com") return [["v=spf1 include:amazonses.com ~all"]];
      throw Object.assign(new Error("không có"), { code: "ENODATA" });
    },
    cname: async (ten) => {
      if (ten.startsWith("abcdefghijklmnop1111.")) return ["abcdefghijklmnop1111.dkim.amazonses.com"];
      if (ten.startsWith("abcdefghijklmnop2222.")) throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
      throw Object.assign(new Error("không có"), { code: "ENOTFOUND" });
    },
    mx: async () => [{ exchange: "mx.sai.vn", priority: 10 }],
  });
  await nemLoi("Nhân viên marketing không kiểm DNS được (integration.update)", "quyen", () => voi(A, mkA, (nc) => kiemTraTenMienGui(nc)));
  const dnsA = await voi(A, gdA, (nc) => kiemTraTenMienGui(nc));
  const tt = Object.fromEntries(dnsA.banGhi.map((b) => [b.ma, b.trangThai]));
  dat("Từng bản ghi có trạng thái: DMARC ✓, DKIM 1 ✓ / 2 lỗi tra / 3 thiếu, MX sai, SPF ✓", tt.dmarc === "dat" && tt["dkim-1"] === "dat" && tt["dkim-2"] === "loi" && tt["dkim-3"] === "thieu" && tt["mail-from-mx"] === "sai" && tt["mail-from-spf"] === "dat", JSON.stringify(tt));
  dat("Lưu kết quả + kiểm toán", (await chu.emailSetting.findFirstOrThrow({ where: { tenantId: A } })).dnsCheckedAt !== null && (await chu.auditLog.count({ where: { tenantId: A, action: "kiem-tra-dns" } })) === 1);

  // ------------------------------------------------------------------
  console.log("\n— Doanh nghiệp C: kênh SMTP (chưa có AWS) —");
  await voi(C, gdC, (nc) =>
    luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", tenNguoiGui: "ITW", emailNguoiGui: "info@itwonline.com", tenMienGui: "tin.itwonline.com", dmarcRua: "dmarc@itwonline.com", nhanQuangCao: "[Quang cao]" })),
  );
  const dongC = await chu.emailSetting.findFirstOrThrow({ where: { tenantId: C } });
  dat("SMTP + đã khai tên miền gửi: địa chỉ gửi không bắt buộc thuộc tên miền gửi", dongC.provider === "smtp" && dongC.sendingDomain === "tin.itwonline.com");
  const dnsC = await voi(C, gdC, (nc) => kiemTraTenMienGui(nc));
  const ttC = Object.fromEntries(dnsC.banGhi.map((b) => [b.ma, b.trangThai]));
  dat("Kiểm DNS khi chưa có SES: DMARC (làm ngay) ✓, DKIM 'chưa khai', MAIL FROM vẫn được tra", ttC.dmarc === "dat" && ttC["dkim-1"] === "chua-khai" && ttC["mail-from-spf"] === "dat", JSON.stringify(ttC));
  datBoTraDns(null);
  const maC = sinhMaWebhookC();
  function sinhMaWebhookC() {
    return `ses_${Buffer.concat([Buffer.from(C.replace(/-/g, ""), "hex"), Buffer.alloc(24, 7)]).toString("base64url")}`;
  }
  dat("Webhook SES của doanh nghiệp kênh SMTP → 403", (await goi(maC, giaoToi)).status === 403);
  await nemLoi("Kênh SMTP: không tạo được mã webhook SES", "nghiep-vu", () => voi(C, gdC, (nc) => doiMaWebhookSes(nc)), "chua-bat-ses");

  // Đồng ý cho các địa chỉ của C.
  const eX = `x.${DAU}@gmail.com`;
  const emailsW = Array.from({ length: 15 }, (_, i) => `w${i}.${DAU}@outlook.com`);
  await voi(C, mkC, (nc) => nhapCsvDongY(nc, { noiDung: ["Email;Nguồn;Căn cứ;Thời điểm", ...[eX, ...emailsW].map((e) => `${e};Form giấy;Phiếu đăng ký;20/10/2026`)].join("\n"), chiKiemTra: false }));
  for (const e of emailsW) await lead(C, gdC, e, "nguon-w");
  await lead(C, gdC, eX, "nguon-x");
  await voi(C, gdC, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 600 } }));
  const mauC = await voi(C, mkC, (nc) => taoMau(nc, LuocDoMau.parse({ ten: "Mau C", tieuDe: "Uu dai thang 11", khoi: KHOI })));
  const lapVaDuyet = async (ten: string, nguon: string) => {
    const c = await voi(C, mkC, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten, mauId: mauC.id, thamSo: { doiTuong: "lead", nguon: [nguon] } })));
    await voi(C, mkC, (nc) => guiDuyetChienDich(nc, c.id));
    await voi(C, tpC, (nc) => duyetChienDich(nc, c.id));
    return c.id;
  };

  console.log("\n— EG-10: khởi động (warm-up) —");
  const bayGio = new Date();
  const vn = new Date(bayGio.getTime() + 7 * 3_600_000);
  const homNayYmd = vn.getUTCFullYear() * 10000 + (vn.getUTCMonth() + 1) * 100 + vn.getUTCDate();
  await voi(C, gdC, (nc) => capNhatCauHinh(nc, { giaTri: { "email.khoi_dong_ngay_bat_dau": homNayYmd, "email.khoi_dong_muc_dau": 10, "email.khoi_dong_he_so": 1 } }));
  dat("Cấu hình ngày khởi động: ngày không có thật bị từ chối", await (async () => {
    try {
      await voi(C, gdC, (nc) => capNhatCauHinh(nc, { giaTri: { "email.khoi_dong_ngay_bat_dau": 20260231 } }));
      return false;
    } catch {
      return true;
    }
  })());
  const hm = await voiTenant(C, (tx) => docHanMucHomNay(tx, "smtp", bayGio));
  dat("Hạn mức hôm nay = đường khởi động 10 (SMTP không có trần ngày mặc định)", hm.tranHomNay === 10 && hm.khoiDong?.ngayThu === 1 && hm.tranNgayDat === null, JSON.stringify(hm));
  const cdW = await lapVaDuyet("Chien dich W", "nguon-w");
  const truocW = hopThu.length;
  const loW1 = await guiLoThu(C, bayGio);
  const loW2 = await guiLoThu(C, new Date(bayGio.getTime() + 61_000));
  dat("Worker chỉ gửi 10/15 trong ngày đầu khởi động", loW1.daGui + loW2.daGui === 10 && hopThu.length - truocW === 10, `${loW1.daGui}+${loW2.daGui}`);
  const thuW = hopThu.slice(truocW)[0];
  const tieuDeW = /^Subject: (.*)$/m.exec(tieuDeThu(thuW.du))?.[1] ?? "";
  dat("EG-06: nhãn quảng cáo tự đặt '[Quang cao]' đứng đầu tiêu đề", tieuDeW === "[Quang cao] Uu dai thang 11", tieuDeW);
  dat("Kênh SMTP: không có tiêu đề X-SES-*", !/X-SES-/i.test(tieuDeThu(thuW.du)));
  await voi(C, gdC, (nc) => capNhatCauHinh(nc, { giaTri: { "email.khoi_dong_ngay_bat_dau": null } }));
  const loW3 = await guiLoThu(C, new Date(bayGio.getTime() + 122_000));
  dat("Bỏ ngày khởi động → gửi nốt 5", loW3.daGui === 5, JSON.stringify(loW3));

  console.log("\n— EG-07: tối đa 3 thư quảng cáo / địa chỉ / 24 giờ — hai worker cùng lúc —");
  const cdX = [] as string[];
  for (let i = 1; i <= 4; i++) cdX.push(await lapVaDuyet(`Chien dich X${i}`, "nguon-x"));
  const t0 = new Date(bayGio.getTime() + 600_000);
  const truocX = thuToi(eX).length;
  // Hai worker chạy song song (hai giao dịch nhận việc), rồi thêm một nhịp nữa.
  const [k1, k2] = await Promise.all([guiLoThu(C, t0), guiLoThu(C, t0)]);
  const k3 = await guiLoThu(C, new Date(t0.getTime() + 61_000));
  const daNhanX = thuToi(eX).length - truocX;
  dat("Đúng 3 thư tới cùng một địa chỉ dù có 4 chiến dịch và hai worker chạy cùng lúc", daNhanX === 3, `${daNhanX} (${k1.daGui}+${k2.daGui}+${k3.daGui})`);
  const conX = await chu.emailRecipient.findMany({ where: { campaignId: { in: cdX }, status: "QUEUED" } });
  dat("Thư thứ 4 được HOÃN (vẫn Chờ gửi, có deferred_until ≈ 24 giờ sau thư đầu), không Lỗi", conX.length === 1 && conX[0].deferredUntil !== null && conX[0].deferCount >= 1 && conX[0].deferredUntil.getTime() >= t0.getTime() + 24 * 3_600_000 - 1000 && (await chu.emailRecipient.count({ where: { campaignId: { in: cdX }, status: "FAILED" } })) === 0, JSON.stringify(conX.map((r) => [r.deferredUntil, r.deferCount])));
  dat("Chiến dịch còn thư hoãn chưa 'Đã gửi xong'", (await chu.emailCampaign.findUniqueOrThrow({ where: { id: conX[0].campaignId } })).status === "SENDING");
  const k4 = await guiLoThu(C, new Date(t0.getTime() + 2 * 3_600_000));
  dat("Trong 24 giờ vẫn hoãn", k4.daGui === 0);
  const k5 = await guiLoThu(C, new Date(t0.getTime() + 24 * 3_600_000 + 120_000));
  dat("Ra khỏi cửa sổ 24 giờ → gửi thư thứ 4", k5.daGui === 1 && thuToi(eX).length - truocX === 4, JSON.stringify(k5));

  console.log("\n— EG-13: huỷ nhận tin → rút đồng ý + thư xác nhận (một lần) —");
  const rW = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cdW, email: emailsW[0] } });
  dat("Huỷ nhận tin", await huyNhanTin(kyMaLienKet("huy", C, rW.id), { ip: "198.51.100.9", userAgent: "thu" }));
  const soRut = await chu.emailConsent.findMany({ where: { tenantId: C, email: emailsW[0] }, orderBy: { recordedAt: "asc" } });
  dat("Sổ: thêm dòng 'rut' nguồn huy-nhan-tin, tham chiếu người nhận", soRut.at(-1)?.action === "rut" && soRut.at(-1)?.source === "huy-nhan-tin" && soRut.at(-1)?.evidenceRef === `email_recipient:${rW.id}`);
  dat("Cờ cũ khớp sổ: lead từ chối, nguồn huy-nhan-tin-email; danh sách chặn", (await chu.lead.count({ where: { tenantId: C, emailNormalized: emailsW[0], marketingOptOutAt: { not: null }, marketingOptIn: false, marketingConsentSource: "huy-nhan-tin-email" } })) === 1 && (await chu.emailSuppression.count({ where: { tenantId: C, email: emailsW[0], reason: "huy-nhan-tin" } })) === 1);
  await huyNhanTin(kyMaLienKet("huy", C, rW.id), { ip: null, userAgent: null });
  dat("Bấm lại: vẫn chỉ một thư xác nhận chờ gửi", (await chu.emailTransactional.count({ where: { tenantId: C, email: emailsW[0] } })) === 1);
  const truocXn = hopThu.length;
  const soThuW0 = thuToi(emailsW[0]).length;
  const soXn = await guiThuGiaoDich(C);
  const thuXn = hopThu.slice(truocXn).filter((h) => h.den.includes(emailsW[0]));
  const tdXn = thuXn[0] ? tieuDeThu(thuXn[0].du) : "";
  dat("Gửi một thư xác nhận tới đúng người vừa từ chối", soXn === 1 && thuXn.length === 1, String(soXn));
  dat("Thư xác nhận: không [QC], không List-Unsubscribe, không điểm ảnh theo dõi", !/^Subject:.*\[Quang cao\]/m.test(tdXn) && !/List-Unsubscribe/i.test(tdXn) && !thuXn[0].du.includes("/email/mo/"));
  const xnDong = await chu.emailTransactional.findFirstOrThrow({ where: { tenantId: C, email: emailsW[0] } });
  const pXn = xnDong.payload as { nhanLuc?: string; dungTu?: string };
  const lucRut = (await chu.emailRecipient.findUniqueOrThrow({ where: { id: rW.id } })).unsubscribedAt!;
  dat("Thư xác nhận mang thời điểm nhận yêu cầu và thời điểm ngừng gửi (= lúc bấm huỷ)", pXn.nhanLuc === lucRut.toISOString() && pXn.dungTu === lucRut.toISOString(), JSON.stringify(pXn));
  dat("Hàng chờ ghi Đã gửi", xnDong.status === "SENT" && xnDong.sentAt !== null);
  dat("Chạy lại không gửi lần hai", (await guiThuGiaoDich(C)) === 0 && thuToi(emailsW[0]).length === soThuW0 + 1);
  // Huỷ từ thư của chiến dịch khác khi đã từ chối rồi → không thêm thư xác nhận.
  const cdW2 = await chu.emailCampaign.create({ data: { tenantId: C, code: `EM-T${DAU}`, name: "W2", subject: "x", blocks: KHOI as never, sourceCode: "loc-don-gian", status: "COMPLETED", approvedAt: new Date(), approvedBy: tpC } });
  const rW2 = await chu.emailRecipient.create({ data: { tenantId: C, campaignId: cdW2.id, email: emailsW[0], name: "x", recipientType: "lead", leadId: (await chu.lead.findFirstOrThrow({ where: { tenantId: C, emailNormalized: emailsW[0] } })).id, status: "SENT", sentAt: new Date() } });
  await huyNhanTin(kyMaLienKet("huy", C, rW2.id), { ip: null, userAgent: null });
  dat("Huỷ lần nữa ở chiến dịch khác khi đã từ chối → không thêm thư xác nhận", (await chu.emailTransactional.count({ where: { tenantId: C, email: emailsW[0] } })) === 1);

  // ------------------------------------------------------------------
  console.log("\n— Cách ly doanh nghiệp (RLS) —");
  await voi(B, gdB, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eTay, hanhDong: "rut", canCu: "Doanh nghiệp B ghi từ chối" })));
  const demB = await voiTenant(B, async (tx) => ({ so: await tx.emailConsent.count(), sns: await tx.emailSnsMessage.count(), gd: await tx.emailTransactional.count() }));
  dat("B chỉ thấy đúng dòng sổ của mình, không thấy nhật ký SNS / thư giao dịch của A, C", demB.so === 1 && demB.sns === 0 && demB.gd === 0, JSON.stringify(demB));
  dat("Lời từ chối ở B không đổi trạng thái đồng ý của cùng email ở A", (await voiTenant(A, (tx) => trangThaiDongYCuaNhieu(tx, [eTay]))).get(eTay)?.hanhDong === "dong-y");
  let ghiCheo = false;
  try {
    await voiTenant(B, (tx) => tx.emailConsent.create({ data: { tenantId: A, email: `cheo.${DAU}@a.vn`, action: "rut", source: "nhap-tay", evidence: "ghi chéo doanh nghiệp", occurredAt: new Date() } }));
  } catch {
    ghiCheo = true;
  }
  dat("RLS: B không ghi được dòng sổ mang tenant A", ghiCheo);
  const soB = await voi(B, gdB, (nc) => xemSoDongY(nc, { q: "", trang: 1 }));
  dat("Màn hình sổ của B chỉ có dòng của B", soB.tong === 1);

  datVanChuyenThu(null);
  datMangSns(null);
  smtp.dong();
  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử email gửi số lượng lớn");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});

export type { ThongDiepSns };
