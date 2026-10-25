import net from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { NextRequest } from "next/server";
import { prisma, voiTenant, HAN_GIAO_DICH_THEO_LO_MS } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { buocChoNguoiDung } from "../src/lib/api-nhieu-buoc";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiNghiepVu } from "../src/lib/loi";
import { doiMaWebhookSes, kiemTraTenMienGui, luuKetNoi } from "../src/modules/email/ket-noi";
import { duyetChienDich, guiDuyetChienDich, taoChienDich, taoMau } from "../src/modules/email/service";
import { guiLoThu, guiThuGiaoDich } from "../src/modules/email/gui";
import { huyNhanTin } from "../src/modules/email/cong-khai";
import { kyMaLienKet } from "../src/modules/email/ma-lien-ket";
import { LuocDoKetNoiEmail, LuocDoMau, LuocDoTaoChienDich } from "../src/modules/email/luoc-do";
import { ghiTayDongY, LuocDoGhiTayDongY, LuocDoNhapCsvDongY, nhapCsvDongY, trangThaiDongYCuaNhieu } from "../src/modules/email/so-dong-y";
import { datMangSns, laUrlChungChiSns, laUrlDangKySns } from "../src/modules/email/sns";
import { bamMaWebhookSes, khopMaWebhookSes, sinhMaWebhookSes } from "../src/modules/email/ma-webhook-ses";
import { datBoTraDns } from "../src/modules/email/dns";
import { docHanMucHomNay } from "../src/modules/email/han-muc";
import { danhGiaTyLe, dungThu, ganNhanQuangCao, tranKhoiDong, xetGioiHanDiaChi } from "../src/modules/email/tinh-toan";
import { datVanChuyenThu, taoVanChuyenNodemailer, type ThuGui } from "../src/modules/email/van-chuyen";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { POST as postWebhookSes } from "../src/app/api/cong-khai/email/ses/[ma]/route";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";
import { kyThongDiep, taoChungChiTuKy, thongBaoSes, URL_CHUNG_CHI, VUNG } from "./sns-gia";

/**
 * QA độc lập 0.18.0 "Email marketing — GĐ1: gửi số lượng lớn" (BUSINESS_RULES mục 29, EG-01…EG-14).
 * Cố phá: webhook SNS (URL chứng chỉ / SubscribeURL lắt léo, thân cực lớn đọc từng phần, đổi Type,
 * phiên bản chữ ký, mã của doanh nghiệp khác, doanh nghiệp kênh SMTP có mã thật), tương quan sự kiện
 * (thẻ giả trỏ sang doanh nghiệp khác, mã thư lạ, báo rác / trả lại tới cùng lúc), sổ đồng ý (chủ sở hữu
 * xóa, cùng thời điểm, từ chối ghi lùi ngày, CSV 5.000 dòng, BOM, hoa thường), trần ngày khi hai worker
 * chồng nhau, nhãn [QC], khởi động theo ngày giờ VN, tự tạm dừng ở đúng ngưỡng, thư xác nhận khi bấm
 * huỷ cùng lúc, DNS (tên miền độc, tra treo, ngoài giao dịch), CHECK địa chỉ gửi, và **migration chạy
 * trên dữ liệu 0.17** (CSDL tạm riêng, xóa khi xong).
 *
 * Không gì ra Internet: thư vào máy chủ SMTP giả, chứng chỉ SNS tự ký, DNS giả.
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
// Máy chủ SMTP giả ("250 Ok <mã>" như SES)
// ---------------------------------------------------------------------------
const hopThu: { den: string[]; du: string }[] = [];
let soThu = 0;
function dungMayChuSmtp(): Promise<{ cong: number; dong: () => void }> {
  return new Promise((ok) => {
    const s = net.createServer((sock) => {
      let dem = "";
      let trongData = false;
      let den: string[] = [];
      const gui = (x: string) => sock.write(`${x}\r\n`);
      gui("220 may-gia ESMTP");
      sock.on("data", (b) => {
        dem += b.toString("utf8");
        while (true) {
          if (trongData) {
            const ket = dem.indexOf("\r\n.\r\n");
            if (ket < 0) return;
            hopThu.push({ den, du: dem.slice(0, ket) });
            dem = dem.slice(ket + 5);
            trongData = false;
            den = [];
            gui(`250 Ok 0101019b${(++soThu).toString(16).padStart(8, "0")}-${randomUUID()}-000000`);
            continue;
          }
          const xd = dem.indexOf("\r\n");
          if (xd < 0) return;
          const dong = dem.slice(0, xd);
          dem = dem.slice(xd + 2);
          const lenh = dong.slice(0, 4).toUpperCase();
          if (lenh === "EHLO") gui("250-may-gia\r\n250-8BITMIME\r\n250 SMTPUTF8");
          else if (lenh === "RCPT") {
            den.push(/<([^>]+)>/.exec(dong)?.[1]?.toLowerCase() ?? "");
            gui("250 OK");
          } else if (lenh === "DATA") {
            trongData = true;
            gui("354 go");
          } else if (lenh === "QUIT") {
            gui("221 bye");
            sock.end();
          } else gui("250 OK");
        }
      });
      sock.on("error", () => {});
    });
    s.listen(0, "127.0.0.1", () => ok({ cong: (s.address() as net.AddressInfo).port, dong: () => s.close() }));
  });
}
const thuToi = (email: string) => hopThu.filter((h) => h.den.includes(email));
const tieuDeCua = (du: string) => /^Subject: (.*)$/m.exec(du.split("\r\n\r\n")[0].replace(/\r\n[ \t]+/g, " "))?.[1] ?? "";

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>, timeoutMs?: number): Promise<T> {
  return voiTenant(
    tenantId,
    async (tx) => {
      const hoSo = await layHoSoQuyen(tx, userId);
      if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
      return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-qa-email-gui-lon"));
    },
    { timeoutMs },
  );
}

async function nemLoi(ten: string, kieu: "nghiep-vu" | "dinh-dang" | "quyen" | "bat-ky", khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu = kieu === "bat-ky" ? true : kieu === "quyen" ? e instanceof LoiThieuQuyen : kieu === "dinh-dang" ? e instanceof LoiDinhDang : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

const KHOI = [
  { loai: "tieu-de", noiDung: "Chao {{ten}}" },
  { loai: "doan-van", noiDung: "Uu dai thang nay." },
];

const csvDongY = (emails: string[], thoiDiem = "20/10/2026") => ["Email;Nguồn;Căn cứ;Thời điểm", ...emails.map((e) => `${e};Hội thảo QA;Phiếu đăng ký giấy;${thoiDiem}`)].join("\n");

async function main() {
  console.log("=== QA email gửi số lượng lớn (0.18.0) ===\n");
  const smtp = await dungMayChuSmtp();
  /** Cổng chặn gửi: khi đặt, mọi lần gửi chờ tới khi cổng mở (mô phỏng worker gửi chậm). */
  let congChan: Promise<void> | null = null;
  datVanChuyenThu(() => {
    const vc = taoVanChuyenNodemailer({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", tenDangNhap: null, matKhau: null });
    return {
      async gui(thu: ThuGui) {
        if (congChan) await congChan;
        return vc.gui(thu);
      },
      dong: () => vc.dong(),
    };
  });
  const cc = taoChungChiTuKy();
  const daTai: string[] = [];
  const daGoi: string[] = [];
  datMangSns({
    layChungChi: async (url) => {
      daTai.push(url);
      return cc.pem;
    },
    xacNhanDangKy: async (url) => {
      daGoi.push(url);
    },
  });

  const tA = await seedNenMong(chu, `qa-eg-a-${DAU}`, "QA gửi lớn A");
  const tB = await seedNenMong(chu, `qa-eg-b-${DAU}`, "QA gửi lớn B");
  const tC = await seedNenMong(chu, `qa-eg-c-${DAU}`, "QA gửi lớn C");
  const [A, B, C] = [tA.id, tB.id, tC.id];
  const vaiTro = async (tid: string, code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tid, code } } })).id;
  async function nguoi(tid: string, ten: string, vai: string) {
    return (
      await chu.user.create({
        data: {
          tenantId: tid,
          email: `${ten}.${DAU}@qa.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: tid, roleId: await vaiTro(tid, vai) } },
          staffProfile: { create: { tenantId: tid } },
        },
      })
    ).id;
  }
  const gdA = await nguoi(A, "gd-a", "ceo");
  const mkA = await nguoi(A, "mkt-a", "marketing");
  const gdB = await nguoi(B, "gd-b", "ceo");
  const gdC = await nguoi(C, "gd-c", "ceo");
  const mkC = await nguoi(C, "mkt-c", "marketing");
  const tpC = await nguoi(C, "tp-c", "marketing-manager");
  for (const t of [A, B, C]) await chu.tenantSetting.create({ data: { tenantId: t, key: "cong_ty.dia_chi", value: "12 Đường QA, Quận 1, TP.HCM" } });
  let soLead = 0;
  const lead = async (tid: string, owner: string, email: string, nguon: string) =>
    (await chu.lead.create({ data: { tenantId: tid, code: `LD-QAEG${DAU}-${++soLead}`, fullName: `Khach ${soLead}`, email, emailNormalized: email.trim().toLowerCase(), source: nguon, ownerId: owner } })).id;

  const TOPIC_A = "arn:aws:sns:ap-southeast-1:111111111111:qa-a";
  const TOPIC_B = "arn:aws:sns:ap-southeast-1:222222222222:qa-b";
  const knSes = (them: Record<string, unknown>) =>
    LuocDoKetNoiEmail.parse({ kenh: "ses", sesVung: VUNG, tenDangNhap: "AKIAQA", matKhau: `Mk-${DAU}`, tenNguoiGui: "ITW", emailNguoiGui: "tin@tin.itwonline.com", tenMienGui: "tin.itwonline.com", ...them });
  await voi(A, gdA, (nc) => luuKetNoi(nc, knSes({ sesTopicArn: TOPIC_A, sesConfigurationSet: "qa-a" })));
  await voi(B, gdB, (nc) => luuKetNoi(nc, knSes({ sesTopicArn: TOPIC_B })));
  await voi(C, gdC, (nc) => luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", tenNguoiGui: "ITW", emailNguoiGui: "info@itwonline.com" })));
  const MA_A = (await voi(A, gdA, (nc) => doiMaWebhookSes(nc))).url.split("/").pop()!;
  const MA_B = (await voi(B, gdB, (nc) => doiMaWebhookSes(nc))).url.split("/").pop()!;

  const goi = async (ma: string, than: string | object, tieuDe: Record<string, string> = {}) => {
    const r = await postWebhookSes(
      new NextRequest(`http://localhost:3000/api/cong-khai/email/ses/${ma}`, { method: "POST", body: typeof than === "string" ? than : JSON.stringify(than), headers: { "content-type": "text/plain; charset=UTF-8", ...tieuDe } }),
      { params: Promise.resolve({ ma }) },
    );
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };

  // Chiến dịch + người nhận dựng thẳng (đã gửi, có mã thư SES) để thử tương quan sự kiện.
  let soCd = 0;
  const chienDich = async (tid: string, duyet: string, status: "COMPLETED" | "SENDING" = "COMPLETED") =>
    (await chu.emailCampaign.create({ data: { tenantId: tid, code: `EM-QA${DAU}-${++soCd}`, name: `QA ${soCd}`, subject: "x", blocks: KHOI as never, sourceCode: "loc-don-gian", status, approvedAt: new Date(), approvedBy: duyet } })).id;
  const nguoiNhan = async (tid: string, cd: string, owner: string, email: string, messageId: string | null) =>
    chu.emailRecipient.create({ data: { tenantId: tid, campaignId: cd, email, name: "x", recipientType: "lead", leadId: await lead(tid, owner, email, "qa-tq"), status: "SENT", sentAt: new Date(), messageId } });

  // ==================================================================
  console.log("— 1. Webhook SNS: URL chứng chỉ / SubscribeURL lắt léo —");
  const urlXau = [
    "http://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-a.pem",
    "https://sns.ap-southeast-1.amazonaws.com.evil.com/a.pem",
    "https://sns.ap-southeast-1.amazonaws.com@evil.com/a.pem",
    "https://evil.com@sns.ap-southeast-1.amazonaws.com/a.pem",
    "https://u:p@sns.ap-southeast-1.amazonaws.com/a.pem",
    "https://sns.ap-southeast-1.amazonaws.com:8443/a.pem",
    "https://sns.ap-southeast-1.amazonaws.com/a.pem?x=1",
    "https://sns.ap-southeast-1.amazonaws.com/a.pem#x",
    "https://sns.ap-southeast-1.amazonaws.com/a.txt",
    "https://sns.ap-southeast-1.amazonaws.com./a.pem",
    "https://sns.ap-southeast-1.amazonaws.com%2eevil.com/a.pem",
    "https://snѕ.ap-southeast-1.amazonaws.com/a.pem",
    "https://sns.ap-southeast-1.amazonaws.com\\@evil.com/a.pem",
    "https://sns.ap-southeast-1.amazonaws.com/a%2Fb.pem",
    "https://sns.us-east-1.amazonaws.com/a.pem",
    "https://sns.ap-southeast-1.amazonaws.com.cn/a.pem",
    "https://169.254.169.254/a.pem",
    "file:///etc/passwd",
    "https://xsns.ap-southeast-1.amazonaws.com/a.pem",
    "https://sns.ap-southeast-1.amazonaws.co/a.pem",
    "",
  ];
  const lotUrl = urlXau.filter((u) => laUrlChungChiSns(u, VUNG));
  dat(`URL chứng chỉ: ${urlXau.length} biến thể độc (http, host.evil, @, cổng, truy vấn, IDN, dấu chấm cuối, %2e, \\, vùng khác…) đều bị từ chối`, lotUrl.length === 0, lotUrl.join(" | "));
  dat("URL chứng chỉ thật (kể cả chữ hoa / :443 mặc định) được nhận", laUrlChungChiSns("https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-9c6465fa7f48f5cacd23014631ec1136.pem", VUNG) && laUrlChungChiSns("https://SNS.AP-SOUTHEAST-1.AMAZONAWS.COM:443/SimpleNotificationService-a.pem", VUNG));
  const subXau = [
    "http://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription",
    "https://sns.ap-southeast-1.amazonaws.com.evil.com/?Action=ConfirmSubscription",
    "https://sns.ap-southeast-1.amazonaws.com@169.254.169.254/",
    "https://sns.ap-southeast-1.amazonaws.com:8080/",
    "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
    "https://127.0.0.1/",
    "https://localhost/",
    "gopher://sns.ap-southeast-1.amazonaws.com/",
  ];
  const lotSub = subXau.filter((u) => laUrlDangKySns(u, VUNG));
  dat("SubscribeURL: mọi biến thể ngoài https://sns.<vùng của chủ đề>.amazonaws.com bị từ chối (chống SSRF)", lotSub.length === 0, lotSub.join(" | "));

  const rA0cd = await chienDich(A, gdA);
  const rA0 = await nguoiNhan(A, rA0cd, gdA, `tq0.${DAU}@gmail.com`, `mid-a0-${DAU}`);
  const mailCua = (r: { id: string; messageId: string | null }, tenant = A) => ({ messageId: r.messageId, timestamp: new Date().toISOString(), tags: { cowork_tenant: [tenant], cowork_recipient: [r.id] } });
  const truocTai = daTai.length;
  let soLot = 0;
  for (const u of urlXau.slice(0, 8)) {
    const m = thongBaoSes(TOPIC_A, { eventType: "Delivery", mail: mailCua(rA0) }, cc.khoaRieng, { SigningCertURL: u });
    const kq = await goi(MA_A, m);
    if (kq.status !== 403 && kq.status !== 400) soLot++;
  }
  dat("Qua route: URL chứng chỉ độc → 4xx, KHÔNG tải chứng chỉ nào", soLot === 0 && daTai.length === truocTai, `${soLot} lọt, tải ${daTai.length - truocTai}`);
  let goiSai = 0;
  for (const u of subXau) {
    const m = kyThongDiep({ Type: "SubscriptionConfirmation", MessageId: randomUUID(), TopicArn: TOPIC_A, Message: "x", Timestamp: new Date().toISOString(), SigningCertURL: URL_CHUNG_CHI, SubscribeURL: u, Token: "tok" }, cc.khoaRieng);
    if ((await goi(MA_A, m)).status !== 403) goiSai++;
  }
  dat("Qua route: SubscribeURL độc (đã ký đúng) → 403, KHÔNG gọi ra ngoài", goiSai === 0 && daGoi.length === 0, `${goiSai} sai, gọi ${daGoi.length}`);

  console.log("\n— 2. Webhook SNS: chữ ký, Type, thân, mã —");
  const giao = thongBaoSes(TOPIC_A, { eventType: "Delivery", mail: mailCua(rA0), delivery: { timestamp: new Date().toISOString(), recipients: [rA0.email] } }, cc.khoaRieng);
  dat("SignatureVersion '3' → 400", (await goi(MA_A, { ...giao, SignatureVersion: "3" })).status === 400);
  dat("Hạ SignatureVersion 2 → 1 trên cùng chữ ký → 403", (await goi(MA_A, { ...giao, SignatureVersion: "1" })).status === 403);
  dat("Chữ ký không phải base64 → 400", (await goi(MA_A, { ...giao, Signature: "!!!!!!!!!!!!!!!!!!!!" })).status === 400);
  dat("Chữ ký base64 rác → 403", (await goi(MA_A, { ...giao, Signature: randomBytes(256).toString("base64") })).status === 403);
  const doiType = { ...giao, Type: "SubscriptionConfirmation", SubscribeURL: "https://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription", Token: "t" };
  dat("Đổi Type Notification → SubscriptionConfirmation trên thông điệp đã ký → 403, không gọi SubscribeURL", (await goi(MA_A, doiType)).status === 403 && daGoi.length === 0);
  const thieuToken = kyThongDiep({ Type: "Notification", MessageId: randomUUID(), TopicArn: TOPIC_A, Message: "{}", Timestamp: new Date().toISOString(), SigningCertURL: URL_CHUNG_CHI }, cc.khoaRieng);
  dat("SubscriptionConfirmation thiếu Token / SubscribeURL → 403 (không 500)", (await goi(MA_A, { ...thieuToken, Type: "SubscriptionConfirmation" })).status === 403);
  const lech = await goi(MA_A, giao, { "x-amz-sns-message-type": "UnsubscribeConfirmation" });
  dat("Tiêu đề x-amz-sns-message-type giả → 400", lech.status === 400);
  for (const [ten, than] of [
    ["thân rỗng", ""],
    ["null", "null"],
    ["mảng", "[1,2]"],
    ["chuỗi", '"Notification"'],
    ["JSON lồng 50.000 tầng", "[".repeat(50_000) + "]".repeat(50_000)],
    ["__proto__", JSON.stringify({ ...giao, __proto__: { Type: "x" }, constructor: { prototype: { y: 1 } } }).replace('"MessageId"', '"__proto__":{"polluted":1},"MessageId"')],
  ] as const) {
    const kq = await goi(MA_A, than);
    dat(`Thân ${ten} → 4xx/200, không 500/503`, kq.status < 500, String(kq.status));
  }
  dat("Không bị ô nhiễm prototype", ({} as Record<string, unknown>).polluted === undefined);

  // Thân cực lớn KHÔNG có Content-Length (chunked): route phải dừng đọc khi vượt trần, không nạp hết vào bộ nhớ.
  let daKeo = 0;
  const dong = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (daKeo >= 50_000_000) return ctrl.close();
      daKeo += 65_536;
      ctrl.enqueue(new Uint8Array(65_536).fill(120));
    },
  });
  const rLon = await postWebhookSes(new NextRequest(`http://localhost:3000/api/cong-khai/email/ses/${MA_A}`, { method: "POST", body: dong, duplex: "half" } as never), { params: Promise.resolve({ ma: MA_A }) });
  dat("Thân 50 MB không Content-Length → 413 và chỉ đọc ~300 KB (không nạp cả 50 MB)", rLon.status === 413 && daKeo < 2_000_000, `${rLon.status}, đã đọc ${daKeo} byte`);
  const rKhai = await postWebhookSes(
    new NextRequest(`http://localhost:3000/api/cong-khai/email/ses/${MA_A}`, { method: "POST", body: JSON.stringify(giao), headers: { "content-length": "abc" } }),
    { params: Promise.resolve({ ma: MA_A }) },
  );
  dat("Content-Length rác → không 500", rKhai.status < 500, String(rKhai.status));

  const maGiaA = `ses_${Buffer.concat([Buffer.from(A.replace(/-/g, ""), "hex"), randomBytes(24)]).toString("base64url")}`;
  dat("Mã đúng khuôn, đúng doanh nghiệp A nhưng 24 byte ngẫu nhiên sai → 403", (await goi(MA_A.slice(0, -1) + (MA_A.endsWith("A") ? "B" : "A"), giao)).status === 403 && (await goi(maGiaA, giao)).status === 403);
  dat("Mã của B + chủ đề của A → 403 (chủ đề không khớp)", (await goi(MA_B, giao)).status === 403);
  dat("Mã của A + chủ đề của B → 403", (await goi(MA_A, thongBaoSes(TOPIC_B, { eventType: "Delivery", mail: mailCua(rA0) }, cc.khoaRieng))).status === 403);
  dat("Mã chứa doanh nghiệp không tồn tại → 403", (await goi(sinhMaWebhookSes(randomUUID()), giao)).status === 403);
  dat("So băm: băm đã lưu sai độ dài / rỗng → false, không ném", !khopMaWebhookSes(MA_A, "abc") && !khopMaWebhookSes(MA_A, "") && !khopMaWebhookSes(MA_A, null));
  // Doanh nghiệp kênh SMTP có mã thật (băm khớp) vẫn bị chặn.
  const maC = sinhMaWebhookSes(C);
  await chu.emailSetting.updateMany({ where: { tenantId: C }, data: { sesWebhookHash: bamMaWebhookSes(maC), sesTopicArn: TOPIC_A } });
  const kqC = await goi(maC, giao);
  dat("Doanh nghiệp kênh SMTP có mã khớp băm + chủ đề khớp → vẫn 403 'chưa bật SES', không ghi gì", kqC.status === 403 && (await chu.emailSnsMessage.count({ where: { tenantId: C } })) === 0, JSON.stringify(kqC));
  await chu.emailSetting.updateMany({ where: { tenantId: C }, data: { sesWebhookHash: null, sesTopicArn: null } });
  // Đổi B sang SMTP rồi gọi bằng mã cũ của B.
  await voi(B, gdB, (nc) => luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", tenNguoiGui: "ITW", emailNguoiGui: "info@itwonline.com", tenMienGui: "tin.itwonline.com", sesTopicArn: TOPIC_B })));
  dat("Chuyển kênh SES → SMTP: mã webhook cũ hết tác dụng (403)", (await goi(MA_B, thongBaoSes(TOPIC_B, { eventType: "Delivery", mail: mailCua(rA0) }, cc.khoaRieng))).status === 403);
  await voi(B, gdB, (nc) => luuKetNoi(nc, knSes({ sesTopicArn: TOPIC_B })));

  const cu = thongBaoSes(TOPIC_A, { eventType: "Delivery", mail: mailCua(rA0) }, cc.khoaRieng, { Timestamp: "2019-01-01T00:00:00.000Z" });
  const kqCu = await goi(MA_A, cu);
  const kqCu2 = await goi(MA_A, cu);
  dat("Thông điệp cũ (Timestamp 2019) đã ký đúng: xử lý một lần, phát lại → trùng lặp (chống lặp theo MessageId)", kqCu.status === 200 && kqCu2.json.trungLap === true, JSON.stringify([kqCu, kqCu2]));

  // ==================================================================
  console.log("\n— 3. Tương quan sự kiện: thẻ giả, mã thư lạ, cùng lúc —");
  const cdB = await chienDich(B, gdB);
  const rB = await nguoiNhan(B, cdB, gdB, `tqb.${DAU}@gmail.com`, `mid-b-${DAU}`);
  const rac = (mail: object, email: string) => ({ eventType: "Complaint", mail, complaint: { complainedRecipients: [{ emailAddress: email }], complaintFeedbackType: "abuse" } });
  const thuGia = [
    { cowork_tenant: [B], cowork_recipient: [rB.id] },
    { cowork_tenant: [A], cowork_recipient: [rB.id] },
    { cowork_recipient: [rB.id] },
    { cowork_tenant: [A], cowork_recipient: [`${rB.id}' OR '1'='1`] },
  ];
  for (const tags of thuGia) {
    const kq = await goi(MA_A, thongBaoSes(TOPIC_A, rac({ messageId: rB.messageId, tags }, rB.email), cc.khoaRieng));
    if (kq.status !== 200) dat(`Thẻ giả ${JSON.stringify(tags)} → 200 bỏ qua`, false, JSON.stringify(kq));
  }
  const sauB = await chu.emailRecipient.findUniqueOrThrow({ where: { id: rB.id } });
  dat(
    "Báo rác giả qua webhook A mang thẻ / mã thư của người nhận B → không đụng B (sổ, chặn, người nhận)",
    sauB.complainedAt === null && (await chu.emailConsent.count({ where: { tenantId: B } })) === 0 && (await chu.emailSuppression.count({ where: { tenantId: B } })) === 0 && (await chu.emailEvent.count({ where: { tenantId: B } })) === 0,
  );
  dat("Các thông điệp đó ghi 'bỏ qua' ở nhật ký SNS của A", (await chu.emailSnsMessage.count({ where: { tenantId: A, result: "bo-qua", sesMessageId: rB.messageId } })) === 4);
  const rA1 = await nguoiNhan(A, rA0cd, gdA, `tq1.${DAU}@gmail.com`, `mid-a1-${DAU}`);
  const rA2 = await nguoiNhan(A, rA0cd, gdA, `tq2.${DAU}@gmail.com`, `mid-a2-${DAU}`);
  await goi(MA_A, thongBaoSes(TOPIC_A, { eventType: "Delivery", mail: { messageId: rA2.messageId, tags: { cowork_tenant: [A], cowork_recipient: [rA1.id] } }, delivery: {} }, cc.khoaRieng));
  const [s1, s2] = await Promise.all([chu.emailRecipient.findUniqueOrThrow({ where: { id: rA1.id } }), chu.emailRecipient.findUniqueOrThrow({ where: { id: rA2.id } })]);
  dat("Thẻ người nhận trỏ rA1 nhưng mã thư là của rA2 → áp cho rA2 (mã thư thắng thẻ), rA1 không đổi", s1.deliveredAt === null && s2.deliveredAt !== null);
  const kqLa = await goi(MA_A, thongBaoSes(TOPIC_A, { eventType: "Bounce", mail: { messageId: "khong-ton-tai-123" }, bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "x@y.vn" }] } }, cc.khoaRieng));
  dat("Trả lại cho mã thư lạ → 200 bỏ qua, không chặn gì", kqLa.status === 200 && (await chu.emailSuppression.count({ where: { tenantId: A, email: "x@y.vn" } })) === 0);
  await goi(MA_A, thongBaoSes(TOPIC_A, { eventType: "Bounce", mail: mailCua(rA1), bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: `khac.${DAU}@gmail.com` }] } }, cc.khoaRieng));
  const sA1 = await chu.emailRecipient.findUniqueOrThrow({ where: { id: rA1.id } });
  dat("Trả lại nêu địa chỉ khác với người nhận → không đánh hỏng người nhận", sA1.status === "SENT" && sA1.bouncedAt === null && (await chu.emailSuppression.count({ where: { tenantId: A, email: rA1.email } })) === 0);

  // Cùng một báo rác tới 6 lần cùng lúc.
  const eRac = `rac.${DAU}@gmail.com`;
  await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csvDongY([eRac]), chiKiemTra: false }));
  const rRac = await nguoiNhan(A, rA0cd, gdA, eRac, `mid-rac-${DAU}`);
  const mRac = thongBaoSes(TOPIC_A, rac(mailCua(rRac), eRac), cc.khoaRieng);
  const kqRac = await Promise.all(Array.from({ length: 6 }, () => goi(MA_A, mRac)));
  dat(
    "Báo rác trùng 6 lần cùng lúc → 6×200, đúng 1 dòng 'phan-doi', 1 dòng chặn, 1 sự kiện complaint",
    kqRac.every((k) => k.status === 200) &&
      (await chu.emailConsent.count({ where: { tenantId: A, email: eRac, action: "phan-doi" } })) === 1 &&
      (await chu.emailSuppression.count({ where: { tenantId: A, email: eRac } })) === 1 &&
      (await chu.emailEvent.count({ where: { recipientId: rRac.id, eventType: "complaint" } })) === 1 &&
      kqRac.filter((k) => k.json.trungLap === true).length === 5,
    JSON.stringify(kqRac.map((k) => k.status)),
  );
  dat("Báo rác không sinh thư xác nhận", (await chu.emailTransactional.count({ where: { tenantId: A, email: eRac } })) === 0);

  // Hai lần trả lại vĩnh viễn (hai chiến dịch, hai MessageId) cho cùng địa chỉ tới cùng lúc.
  const eHong = `hong.${DAU}@gmail.com`;
  const cd2 = await chienDich(A, gdA);
  const rH1 = await nguoiNhan(A, rA0cd, gdA, eHong, `mid-h1-${DAU}`);
  const rH2 = await nguoiNhan(A, cd2, gdA, eHong, `mid-h2-${DAU}`);
  const traLai = (r: { id: string; messageId: string | null }) => thongBaoSes(TOPIC_A, { eventType: "Bounce", mail: mailCua(r), bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: eHong }] } }, cc.khoaRieng);
  const kqH = await Promise.all([goi(MA_A, traLai(rH1)), goi(MA_A, traLai(rH2))]);
  dat("Hai lần trả lại vĩnh viễn cùng lúc cho cùng email → cả hai 200 (không 503 vì trùng khóa chặn), một dòng chặn email-hong", kqH.every((k) => k.status === 200) && (await chu.emailSuppression.count({ where: { tenantId: A, email: eHong, reason: "email-hong" } })) === 1, JSON.stringify(kqH));
  // Trả lại vĩnh viễn khi địa chỉ đang bị chặn vì "huỷ nhận tin" → phải nâng thành email-hỏng (không bao giờ gỡ).
  const eHuyHong = `huyhong.${DAU}@gmail.com`;
  await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csvDongY([eHuyHong]), chiKiemTra: false }));
  const rHH = await nguoiNhan(A, rA0cd, gdA, eHuyHong, `mid-hh-${DAU}`);
  await huyNhanTin(kyMaLienKet("huy", A, rHH.id), { ip: null, userAgent: null });
  await goi(MA_A, thongBaoSes(TOPIC_A, { eventType: "Bounce", mail: mailCua(rHH), bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: eHuyHong }] } }, cc.khoaRieng));
  dat("Trả lại vĩnh viễn khi đang chặn 'huỷ nhận tin' → lý do chặn nâng thành 'email-hong'", (await chu.emailSuppression.findFirst({ where: { tenantId: A, email: eHuyHong } }))?.reason === "email-hong");
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eHuyHong, hanhDong: "dong-y", canCu: "Khách gọi điện xin nhận tin lại, ghi âm QA-1", xacNhanSauTuChoi: true })));
  dat("Đồng ý lại có căn cứ KHÔNG gỡ chặn email hỏng", (await chu.emailSuppression.count({ where: { tenantId: A, email: eHuyHong, status: "hoat-dong", reason: "email-hong" } })) === 1);

  // ==================================================================
  console.log("\n— 4. Sổ đồng ý —");
  let xoaChu = true;
  try {
    await chu.emailConsent.deleteMany({ where: { tenantId: A } });
  } catch {
    xoaChu = false;
  }
  dat("[CSDL] Chủ sở hữu cũng không XÓA được dòng sổ (trigger)", !xoaChu && (await chu.emailConsent.count({ where: { tenantId: A } })) > 0);
  const eCung = `cung.${DAU}@gmail.com`;
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eCung, hanhDong: "dong-y", canCu: "Phiếu đăng ký QA số 1 lúc 9 giờ", thoiDiem: "2026-10-20T09:00" })));
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eCung, hanhDong: "rut", canCu: "Khách gọi lại xin dừng, cùng phút", thoiDiem: "2026-10-20T09:00" })));
  dat("Đồng ý và rút cùng thời điểm → dòng ghi sau thắng (rút)", (await voiTenant(A, (tx) => trangThaiDongYCuaNhieu(tx, [eCung]))).get(eCung)?.hanhDong === "rut");
  await nemLoi("Đồng ý lại đúng bằng thời điểm rút → từ chối", "dinh-dang", () =>
    voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eCung, hanhDong: "dong-y", canCu: "Đồng ý lại cùng phút với lúc rút", thoiDiem: "2026-10-20T09:00", xacNhanSauTuChoi: true }))),
  );
  // Rút ghi lùi ngày trước lần đồng ý đang hiệu lực: sổ sẽ vẫn hiện "Đồng ý" dù cờ / danh sách chặn đã từ chối.
  const eLui = `lui.${DAU}@gmail.com`;
  await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csvDongY([eLui], "22/10/2026"), chiKiemTra: false }));
  await nemLoi("Ghi tay 'rút' với thời điểm TRƯỚC lần đồng ý đang hiệu lực → từ chối (không để sổ hiện Đồng ý trong khi đã chặn)", "dinh-dang", () =>
    voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eLui, hanhDong: "rut", canCu: "Khách nói đã xin dừng từ đầu tháng", thoiDiem: "2026-10-01T08:00" }))),
  );
  dat("…và không ghi gì, không chặn", (await chu.emailConsent.count({ where: { tenantId: A, email: eLui } })) === 1 && (await chu.emailSuppression.count({ where: { tenantId: A, email: eLui } })) === 0);
  // Sự kiện báo rác SES mang thời điểm cũ hơn lần đồng ý mới nhất (tới trễ) → phản đối vẫn phải là trạng thái hiện hành.
  const eTre = `tre.${DAU}@gmail.com`;
  await voi(A, mkA, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eTre, hanhDong: "dong-y", canCu: "Khách tự đăng ký tại quầy, phiếu QA-2" })));
  const rTre = await nguoiNhan(A, rA0cd, gdA, eTre, `mid-tre-${DAU}`);
  const lucCu = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await goi(MA_A, thongBaoSes(TOPIC_A, { eventType: "Complaint", mail: mailCua(rTre), complaint: { complainedRecipients: [{ emailAddress: eTre }], timestamp: lucCu } }, cc.khoaRieng));
  const ttTre = (await voiTenant(A, (tx) => trangThaiDongYCuaNhieu(tx, [eTre]))).get(eTre);
  dat("Báo rác tới trễ (thời điểm SES cũ hơn lần đồng ý gần nhất) → sổ hiện hành = phản đối", ttTre?.hanhDong === "phan-doi", JSON.stringify(ttTre));
  dat("…complained_at vẫn giữ thời điểm của SES", (await chu.emailRecipient.findUniqueOrThrow({ where: { id: rTre.id } })).complainedAt?.toISOString() === lucCu);

  // CSV: BOM, hoa thường / khoảng trắng, trùng khác hoa thường, ký tự công thức, email Unicode.
  const eHoa = `MiXeD.${DAU}@Gmail.COM`;
  const csvLa = [
    "﻿Email;Nguồn;Căn cứ;Thời điểm",
    `  ${eHoa}  ;Hội thảo;Phiếu 1;20/10/2026`,
    `${eHoa.toLowerCase()};Hội thảo;Phiếu 2;20/10/2026`,
    `cong.thuc.${DAU}@gmail.com;=HYPERLINK("http://evil");=1+1 cmd|' /C calc'!A0;20/10/2026`,
    `"tên có dấu.${DAU}"@gmail.com;x;Phiếu 3;20/10/2026`,
    `a@b;Hội thảo;Phiếu 4;20/10/2026`,
  ].join("\r\n");
  const kqLa2 = await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csvLa, chiKiemTra: false }));
  const dongHoa = await chu.emailConsent.findMany({ where: { tenantId: A, email: eHoa.toLowerCase() } });
  dat("CSV có BOM + CRLF đọc đúng cột; email chuẩn hóa chữ thường, bỏ khoảng trắng; trùng khác hoa thường bị loại", kqLa2.soGhi === 2 && dongHoa.length === 1 && kqLa2.loi.some((l) => l.lyDo.includes("Trùng")), JSON.stringify(kqLa2));
  dat("Ký tự công thức trong căn cứ lưu nguyên văn (không có đường xuất CSV sổ), không lỗi", (await chu.emailConsent.findFirst({ where: { tenantId: A, email: `cong.thuc.${DAU}@gmail.com` } }))?.evidence.includes("=HYPERLINK") === true);
  const leadHoa = await lead(A, gdA, eHoa.toUpperCase(), "qa-hoa");
  dat("Lead nhập email CHỮ HOA vẫn khớp sổ (đã đồng ý)", (await voiTenant(A, (tx) => trangThaiDongYCuaNhieu(tx, [(eHoa.toUpperCase())]))).get(eHoa.toLowerCase())?.hanhDong === "dong-y" && Boolean(leadHoa));
  dat("CSV quá 5.000 dòng → từ chối", await (async () => {
    try {
      await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csvDongY(Array.from({ length: 5001 }, (_, i) => `q${i}.${DAU}@gmail.com`)), chiKiemTra: true }));
      return false;
    } catch (e) {
      return e instanceof LoiNghiepVu && e.ma === "qua-nhieu-dong";
    }
  })());
  dat("CSV quá 2 MB → lược đồ từ chối", !LuocDoNhapCsvDongY.safeParse({ noiDung: "x".repeat(2_000_001) }).success);
  const nguonRoute = readFileSync(join(process.cwd(), "src/app/api/v1/email/dong-y/nhap-csv/route.ts"), "utf8");
  dat("Route nhập CSV sổ đồng ý dùng hạn giao dịch theo lô (QĐ-56) như các route nhập CSV khác", /hanGiaoDichMs:\s*HAN_GIAO_DICH_THEO_LO_MS/.test(nguonRoute));
  const ds5000 = Array.from({ length: 5000 }, (_, i) => `n${i}.${DAU}@gmail.com`);
  const bd = Date.now();
  let kq5000: { soGhi: number } | null = null;
  try {
    kq5000 = await voi(A, mkA, (nc) => nhapCsvDongY(nc, { noiDung: csvDongY(ds5000), chiKiemTra: false }), HAN_GIAO_DICH_THEO_LO_MS);
  } catch (e) {
    console.log("    (lỗi)", (e as Error).message.slice(0, 200));
  }
  const giay = (Date.now() - bd) / 1000;
  dat(`CSV 5.000 dòng ghi trọn trong một giao dịch theo lô (${giay.toFixed(1)} giây < 120)`, kq5000?.soGhi === 5000 && giay < 120, JSON.stringify(kq5000));

  // ==================================================================
  console.log("\n— 5. Hàm thuần: [QC], 24 giờ, khởi động, ngưỡng —");
  const nhanCases: [string, string, string][] = [
    ["[qc]abc", "[QC]", "[QC] abc"],
    ["   [QC]   Ưu đãi  ", "[QC]", "[QC] Ưu đãi"],
    ["[QC] [QC] x", "[QC]", "[QC] [QC] x"],
    ["Ưu đãi [QC]", "[QC]", "[QC] Ưu đãi [QC]"],
    ["", "[QC]", "[QC]"],
    ["QCVN 01 mới", "QC", "QC QCVN 01 mới"],
    ["QC: giảm giá", "QC", "QC : giảm giá"],
    ["qc giảm giá", "QC", "QC giảm giá"],
    ["x", "", "[QC] x"],
    ["x", "\n", "[QC] x"],
  ];
  const saiNhan = nhanCases.filter(([t, n, mong]) => ganNhanQuangCao(t, n) !== mong).map(([t, n, mong]) => `${JSON.stringify(t)}+${JSON.stringify(n)} → ${JSON.stringify(ganNhanQuangCao(t, n))} (mong ${JSON.stringify(mong)})`);
  dat("ganNhanQuangCao: hoa thường, khoảng trắng, nhãn giữa tiêu đề, nhãn chữ không bị coi là đã có khi tiêu đề chỉ bắt đầu bằng cùng chữ (QCVN)", saiNhan.length === 0, saiNhan.join(" ; "));
  const thuBien = dungThu("{{ten}} ưu đãi", KHOI as never, { ten: "[QC]\r\nBcc: x@evil.com", email: "a@b.vn", cong_ty: "", cong_ty_gui: "ITW" }, { tenCongTy: "ITW", diaChi: "x", lienKetHuy: "#" } as never, undefined, "[QC]");
  dat("Biến tên chứa [QC] + xuống dòng: tiêu đề một dòng, mở đầu đúng nhãn", thuBien.tieuDe.startsWith("[QC] ") && !/[\r\n]/.test(thuBien.tieuDe), thuBien.tieuDe);

  const bay = new Date("2026-10-25T05:00:00Z");
  const H24 = 24 * 3_600_000;
  const r24 = xetGioiHanDiaChi([{ id: "1", email: "a@x.vn" }], new Map([["a@x.vn", [new Date(bay.getTime() - H24), new Date(bay.getTime() - 1000), new Date(bay.getTime() - 2000)]]]), 3, bay);
  dat("24 giờ trượt: thư đúng 24 giờ trước đã rời cửa sổ → còn chỗ", r24.nhan.length === 1);
  const r24b = xetGioiHanDiaChi([{ id: "1", email: "a@x.vn" }], new Map([["a@x.vn", [new Date(bay.getTime() - H24 + 1), new Date(bay.getTime() - 1000), new Date(bay.getTime() - 2000)]]]), 3, bay);
  dat("24 giờ trượt: thư 24 giờ − 1 ms → hoãn, hạn hoãn không sớm hơn 1 phút (không lặp từng nhịp)", r24b.hoan.length === 1 && r24b.hoan[0].den.getTime() === bay.getTime() + 60_000);
  const r24c = xetGioiHanDiaChi(
    [
      { id: "1", email: "a@x.vn" },
      { id: "2", email: "a@x.vn" },
      { id: "3", email: "b@x.vn" },
    ],
    new Map(),
    1,
    bay,
  );
  dat("Trần 1: hai thư cùng địa chỉ trong một lô → một gửi, một hoãn ~24 giờ; địa chỉ khác không ảnh hưởng", r24c.nhan.join() === "1,3" && r24c.hoan[0]?.id === "2" && r24c.hoan[0].den.getTime() === bay.getTime() + H24);

  const kd = (iso: string, bd: number, muc = 200, he = 1.3) => tranKhoiDong(bd, muc, he, new Date(iso));
  dat("Khởi động: 23:59:59 giờ VN vẫn là ngày 0, 00:00 giờ VN sang ngày 1", kd("2026-10-24T16:59:59.999Z", 20261024) === 200 && kd("2026-10-24T17:00:00.000Z", 20261024) === 260);
  dat("Khởi động: hệ số 1 → không đổi; hệ số 3 sau 1.000 ngày → chặn ở trần kỹ thuật, không Infinity/NaN", kd("2026-12-01T00:00:00Z", 20261024, 50, 1) === 50 && kd("2029-07-20T00:00:00Z", 20261024, 100_000, 3) === 10_000_000);
  dat("Khởi động: ngày bắt đầu ở tương lai → dùng mức đầu (thận trọng), ngày không có thật → không áp", kd("2026-10-20T00:00:00Z", 20261101) === 200 && kd("2026-10-20T00:00:00Z", 20260231) === null);
  const ng = { hongPhanTram: 5, baoRacPhanNghin: 1, mauToiThieu: 200 };
  dat(
    "Ngưỡng: 10/200 = 5% đúng ngưỡng → chưa dừng; 11/200 → dừng; 199 mẫu 100 hỏng → chưa đủ mẫu; mốc trừ đúng",
    !danhGiaTyLe({ mau: 200, hong: 10, baoRac: 0 }, { mau: 0, hong: 0, baoRac: 0 }, ng).tamDung &&
      danhGiaTyLe({ mau: 200, hong: 11, baoRac: 0 }, { mau: 0, hong: 0, baoRac: 0 }, ng).tamDung &&
      !danhGiaTyLe({ mau: 199, hong: 100, baoRac: 0 }, { mau: 0, hong: 0, baoRac: 0 }, ng).tamDung &&
      !danhGiaTyLe({ mau: 400, hong: 60, baoRac: 0 }, { mau: 200, hong: 50, baoRac: 0 }, ng).tamDung,
  );
  const bc = danhGiaTyLe({ mau: 1000, hong: 0, baoRac: 2 }, { mau: 0, hong: 0, baoRac: 0 }, ng);
  dat("Báo rác 2/1000 = 2‰ > 1‰ → dừng mã ty-le-bao-rac; 1/1000 đúng ngưỡng → chưa", bc.tamDung && bc.ma === "ty-le-bao-rac" && !danhGiaTyLe({ mau: 1000, hong: 0, baoRac: 1 }, { mau: 0, hong: 0, baoRac: 0 }, ng).tamDung);

  // ==================================================================
  console.log("\n— 6. Tự tạm dừng theo báo rác (webhook, mẫu tối thiểu) —");
  await voi(A, gdA, (nc) => capNhatCauHinh(nc, { giaTri: { "email.mau_toi_thieu_danh_gia": 20 } }));
  const cdP = await chienDich(A, gdA, "SENDING");
  const dsP = [] as { id: string; messageId: string | null; email: string }[];
  for (let i = 0; i < 19; i++) dsP.push(await nguoiNhan(A, cdP, gdA, `p${i}.${DAU}@gmail.com`, `mid-p${i}-${DAU}`));
  await goi(MA_A, thongBaoSes(TOPIC_A, rac(mailCua(dsP[0]), dsP[0].email), cc.khoaRieng));
  dat("19 thư có kết quả (< mẫu 20) + 1 báo rác → chưa dừng", (await chu.emailCampaign.findUniqueOrThrow({ where: { id: cdP } })).status === "SENDING");
  dsP.push(await nguoiNhan(A, cdP, gdA, `p19.${DAU}@gmail.com`, `mid-p19-${DAU}`));
  await goi(MA_A, thongBaoSes(TOPIC_A, rac(mailCua(dsP[1]), dsP[1].email), cc.khoaRieng));
  const cP = await chu.emailCampaign.findUniqueOrThrow({ where: { id: cdP } });
  dat("Đủ 20 mẫu, 2 báo rác (100‰) → tự dừng mã ty-le-bao-rac ngay khi nhận webhook", cP.status === "PAUSED" && cP.pauseCode === "ty-le-bao-rac", `${cP.status} ${cP.pauseCode}`);

  // ==================================================================
  console.log("\n— 7. Trần ngày + khởi động khi hai worker chồng nhau (C, SMTP) —");
  await voi(C, gdC, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 600 } }));
  const dsW = Array.from({ length: 25 }, (_, i) => `w${i}.${DAU}@outlook.com`);
  await voi(C, mkC, (nc) => nhapCsvDongY(nc, { noiDung: csvDongY(dsW), chiKiemTra: false }));
  for (const [i, e] of dsW.entries()) await lead(C, gdC, e, i < 15 ? "qa-w1" : "qa-w2");
  const mauC = await voi(C, mkC, (nc) => taoMau(nc, LuocDoMau.parse({ ten: "Mau QA", tieuDe: "Uu dai {{ten}}", khoi: KHOI })));
  const lapVaDuyet = async (ten: string, nguon: string) => {
    const c = await voi(C, mkC, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten, mauId: mauC.id, thamSo: { doiTuong: "lead", nguon: [nguon] } })));
    await voi(C, mkC, (nc) => guiDuyetChienDich(nc, c.id));
    await voi(C, tpC, (nc) => duyetChienDich(nc, c.id));
    return c.id;
  };
  const cdW1 = await lapVaDuyet("QA W1", "qa-w1");
  const cdW2 = await lapVaDuyet("QA W2", "qa-w2");
  const bayGio = new Date();
  const vn = new Date(bayGio.getTime() + 7 * 3_600_000);
  const homNayYmd = vn.getUTCFullYear() * 10000 + (vn.getUTCMonth() + 1) * 100 + vn.getUTCDate();
  await voi(C, gdC, (nc) => capNhatCauHinh(nc, { giaTri: { "email.khoi_dong_ngay_bat_dau": homNayYmd, "email.khoi_dong_muc_dau": 10, "email.khoi_dong_he_so": 1 } }));
  let moCong!: () => void;
  congChan = new Promise<void>((ok) => (moCong = ok));
  const w1 = guiLoThu(C, bayGio);
  const hanDoi = Date.now() + 15_000;
  while ((await chu.emailRecipient.count({ where: { campaignId: { in: [cdW1, cdW2] }, status: "SENDING" } })) < 10 && Date.now() < hanDoi) await new Promise((r) => setTimeout(r, 50));
  // Worker 1 đã nhận 10 việc (đúng trần khởi động) và đang gửi chậm; worker 2 vào nhận việc lúc đó.
  setTimeout(() => moCong(), 1500);
  const w2 = await guiLoThu(C, bayGio);
  const k1 = await w1;
  congChan = null;
  const daGuiW = await chu.emailRecipient.count({ where: { campaignId: { in: [cdW1, cdW2] }, status: "SENT" } });
  dat("Trần khởi động 10/ngày chung cho 2 chiến dịch: worker thứ hai vào lúc worker đầu đang gửi KHÔNG nhận thêm (tổng ≤ 10)", daGuiW === 10 && w2.daGui === 0, `w1=${k1.daGui} w2=${w2.daGui} tổng=${daGuiW}`);
  const hmC = await voiTenant(C, (tx) => docHanMucHomNay(tx, "smtp", bayGio));
  dat("Hạn mức hôm nay: đã gửi 10, còn 0", hmC.daGuiHomNay === 10 && hmC.conLaiHomNay === 0, JSON.stringify(hmC));
  const k3 = await guiLoThu(C, new Date(bayGio.getTime() + 61_000));
  dat("Nhịp sau trong cùng ngày → không gửi thêm", k3.daGui === 0);
  const dauMai = new Date(new Date(`${vn.toISOString().slice(0, 10)}T00:00:00+07:00`).getTime() + 86_400_000 + 60_000);
  const k4 = await guiLoThu(C, dauMai);
  dat("Sang ngày mới theo giờ VN (00:01) → hạn mức mới 10", k4.daGui === 10, JSON.stringify(k4));
  await voi(C, gdC, (nc) => capNhatCauHinh(nc, { giaTri: { "email.khoi_dong_ngay_bat_dau": null } }));

  // ==================================================================
  console.log("\n— 8. Thư xác nhận từ chối —");
  const eX = `xn.${DAU}@gmail.com`;
  await voi(C, mkC, (nc) => nhapCsvDongY(nc, { noiDung: csvDongY([eX]), chiKiemTra: false }));
  const cdX1 = await chienDich(C, tpC);
  const cdX2 = await chienDich(C, tpC);
  const lX = await lead(C, gdC, eX, "qa-x");
  const mk = (cd: string) => chu.emailRecipient.create({ data: { tenantId: C, campaignId: cd, email: eX, name: "x", recipientType: "lead", leadId: lX, status: "SENT", sentAt: new Date(), attemptAt: new Date() } });
  const [x1, x2] = [await mk(cdX1), await mk(cdX2)];
  // Thêm 1 thư quảng cáo nữa trong 24 giờ → đủ 3; thư xác nhận vẫn phải đi.
  const cdX3 = await chienDich(C, tpC);
  await mk(cdX3);
  const kqHuy = await Promise.all([huyNhanTin(kyMaLienKet("huy", C, x1.id), { ip: null, userAgent: null }), huyNhanTin(kyMaLienKet("huy", C, x2.id), { ip: null, userAgent: null }), huyNhanTin(kyMaLienKet("huy", C, x1.id), { ip: null, userAgent: null })]);
  dat("Bấm huỷ 3 lần cùng lúc (hai thư khác nhau) → đúng MỘT thư xác nhận chờ gửi", kqHuy.every(Boolean) && (await chu.emailTransactional.count({ where: { tenantId: C, email: eX } })) === 1);
  const truocXn = thuToi(eX).length;
  await guiThuGiaoDich(C);
  dat("Thư xác nhận vẫn đi dù địa chỉ đã nhận đủ 3 thư quảng cáo / 24 giờ (không tính vào EG-07)", thuToi(eX).length === truocXn + 1);
  const xn = thuToi(eX).at(-1)!;
  dat("Thư xác nhận không [QC], không List-Unsubscribe, không điểm ảnh", !tieuDeCua(xn.du).startsWith("[QC]") && !/List-Unsubscribe/i.test(xn.du) && !xn.du.includes("/email/mo/"), tieuDeCua(xn.du));
  await voi(C, mkC, (nc) => ghiTayDongY(nc, LuocDoGhiTayDongY.parse({ email: eX, hanhDong: "dong-y", canCu: "Khách gửi email xin nhận lại bản tin, lưu thư QA-3", xacNhanSauTuChoi: true })));
  const x3 = await mk(await chienDich(C, tpC));
  await huyNhanTin(kyMaLienKet("huy", C, x3.id), { ip: null, userAgent: null });
  dat("Đồng ý lại rồi huỷ lần nữa → lần từ chối mới có thư xác nhận mới (tổng 2)", (await chu.emailTransactional.count({ where: { tenantId: C, email: eX } })) === 2);

  // ==================================================================
  console.log("\n— 9. DNS: tên miền độc, tra treo, ngoài giao dịch —");
  const mienXau = ["tin.itwonline.com;rm -rf /", "tin.itwonline.com\nx", "-bad.itwonline.com", "a..itwonline.com", "tín.vn", "itwonline.c", `${"a".repeat(64)}.vn`, "localhost", "tin.itwonline.com.", "1.2.3.4", "_dmarc.vn", "x y.vn"];
  const lotMien = mienXau.filter((m) => LuocDoKetNoiEmail.safeParse({ host: "smtp.x.vn", port: 587, baoMat: "starttls", tenNguoiGui: "x", emailNguoiGui: "a@b.vn", tenMienGui: m }).success);
  dat("Tên miền gửi độc (; xuống dòng, -, .., Unicode, IP, dấu chấm cuối, nhãn 64 ký tự…) bị lược đồ từ chối", lotMien.length === 0, lotMien.join(" | "));
  let dbLot = false;
  try {
    await chu.emailSetting.updateMany({ where: { tenantId: C }, data: { sendingDomain: "x.vn; drop" } });
    dbLot = true;
  } catch {
    /* CHECK */
  }
  dat("[CSDL] CHECK tên miền gửi chặn giá trị độc kể cả khi sửa tay", !dbLot);
  let trongGiaoDich = -1;
  datBoTraDns({
    txt: async () => {
      const [r] = await chu.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'`;
      trongGiaoDich = Number(r.n);
      return [["v=DMARC1; p=none"]];
    },
    cname: () => new Promise(() => {}),
    mx: () => new Promise(() => {}),
  });
  await voi(C, gdC, (nc) => luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", tenNguoiGui: "ITW", emailNguoiGui: "info@itwonline.com", tenMienGui: "tin.itwonline.com", dkim: ["abcdefghijklmnop1111"] })));
  const bdDns = Date.now();
  const kqDns = await kiemTraTenMienGui(buocChoNguoiDung(C, async (tx) => (await layHoSoQuyen(tx, gdC))!));
  const tgDns = (Date.now() - bdDns) / 1000;
  const ttDns = Object.fromEntries(kqDns.banGhi.map((b) => [b.ma, b.trangThai]));
  dat(`Tra DNS treo vô hạn → mỗi bản ghi tự hết giờ ('loi'), cả lượt ≤ 12 giây (${tgDns.toFixed(1)} giây)`, ttDns["dkim-1"] === "loi" && ttDns["mail-from-mx"] === "loi" && ttDns.dmarc === "dat" && tgDns <= 12, JSON.stringify(ttDns));
  dat("Lúc đang tra DNS không có giao dịch CSDL nào đang mở", trongGiaoDich === 0, String(trongGiaoDich));
  datBoTraDns(null);

  // ==================================================================
  console.log("\n— 10. Địa chỉ gửi / máy chủ SES —");
  await nemLoi("SES: địa chỉ gửi ở tên miền con của tên miền gửi → từ chối", "nghiep-vu", () => voi(A, gdA, (nc) => luuKetNoi(nc, knSes({ emailNguoiGui: "tin@sub.tin.itwonline.com" }))), "dia-chi-ngoai-ten-mien");
  await nemLoi("SES: địa chỉ gửi ở tên miền giống đuôi (xtin.itwonline.com) → từ chối", "nghiep-vu", () => voi(A, gdA, (nc) => luuKetNoi(nc, knSes({ emailNguoiGui: "tin@xtin.itwonline.com" }))), "dia-chi-ngoai-ten-mien");
  await voi(A, gdA, (nc) => luuKetNoi(nc, knSes({ emailNguoiGui: "Tin@TIN.ItwOnline.com", sesTopicArn: TOPIC_A, sesConfigurationSet: "qa-a" })));
  dat("SES: địa chỉ gửi chữ hoa được chuẩn hóa, lưu được", (await chu.emailSetting.findFirstOrThrow({ where: { tenantId: A } })).fromEmail === "tin@tin.itwonline.com");
  for (const [ten, data] of [
    ["chuyển sang ses khi địa chỉ ngoài tên miền", { provider: "ses", fromEmail: "x@khac.vn" }],
    ["vùng SES độc", { sesRegion: "ap-southeast-1.evil.com" }],
    ["kênh lạ", { provider: "sendgrid" }],
    ["MAIL FROM chữ hoa", { mailFromDomain: "Bounce.tin.itwonline.com" }],
  ] as const) {
    let lot = false;
    try {
      await chu.emailSetting.updateMany({ where: { tenantId: A }, data: data as never });
      lot = true;
    } catch {
      /* CHECK */
    }
    dat(`[CSDL] CHECK chặn: ${ten}`, !lot);
  }
  await chu.emailSetting.updateMany({ where: { tenantId: C }, data: { provider: "smtp" } });

  // ==================================================================
  console.log("\n— 11. Migration 0.18 trên dữ liệu 0.17 (CSDL tạm) —");
  await thuMigration();

  datVanChuyenThu(null);
  datMangSns(null);
  smtp.dong();
  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("QA email gửi số lượng lớn");
}

/**
 * Dựng CSDL tạm, chạy mọi migration TRƯỚC 0.18, đổ dữ liệu kiểu 0.17 (từ chối / đồng ý / danh sách chặn
 * lẫn lộn), chạy migration 0.18 rồi soát sổ đồng ý được chuyển sang. Xóa CSDL tạm khi xong.
 */
async function thuMigration() {
  const goc = new URL(process.env.DATABASE_URL_OWNER!);
  goc.search = "";
  const tenTam = `${goc.pathname.slice(1)}_mig_${DAU}`.slice(0, 63);
  const quanTri = new pg.Client({ connectionString: goc.toString() });
  await quanTri.connect();
  await quanTri.query(`CREATE DATABASE "${tenTam}"`);
  const urlTam = new URL(goc.toString());
  urlTam.pathname = `/${tenTam}`;
  const db = new pg.Client({ connectionString: urlTam.toString() });
  await db.connect();
  try {
    const thuMuc = join(process.cwd(), "prisma/migrations");
    const ds = readdirSync(thuMuc).filter((d) => /^\d{14}_/.test(d)).sort();
    const moi = "20261025090001_email_gui_lon";
    for (const d of ds) {
      if (d === moi) break;
      await db.query(readFileSync(join(thuMuc, d, "migration.sql"), "utf8"));
    }
    const id = () => randomUUID();
    const t1 = id();
    const t2 = id();
    await db.query(`INSERT INTO tenants (id, code, name, updated_at) VALUES ($1,'mig1','Mig 1',now()), ($2,'mig2','Mig 2',now())`, [t1, t2]);
    const u1 = id();
    const u2 = id();
    await db.query(`INSERT INTO users (id, tenant_id, email, password_hash, full_name, updated_at) VALUES ($1,$2,'u1@x.vn','x','U1',now()), ($3,$4,'u2@x.vn','x','U2',now())`, [u1, t1, u2, t2]);
    let n = 0;
    const lead = async (t: string, u: string, email: string | null, optIn: boolean, optInAt: string | null, optOutAt: string | null, nguon: string | null = null) =>
      db.query(
        `INSERT INTO leads (id, tenant_id, code, full_name, owner_id, email, email_normalized, phone_normalized, marketing_opt_in, marketing_opt_in_at, marketing_opt_out_at, marketing_consent_source, updated_at)
         VALUES ($1,$2,$3,'L',$4,$5,$5,$6,$7,$8,$9,$10,'2026-10-01T00:00:00Z')`,
        [id(), t, `LD-${++n}`, u, email, `0900${String(n).padStart(6, "0")}`, optIn, optInAt, optOutAt, nguon],
      );
    const kh = id();
    await db.query(`INSERT INTO customers (id, tenant_id, code, name, name_normalized, owner_id, updated_at) VALUES ($1,$2,'KH-1','K','k',$3,now())`, [kh, t1, u1]);
    const lienHe = async (email: string, optIn: boolean, optInAt: string | null, optOutAt: string | null) =>
      db.query(
        `INSERT INTO contacts (id, tenant_id, customer_id, full_name, email, email_normalized, marketing_opt_in, marketing_opt_in_at, marketing_opt_out_at, updated_at)
         VALUES ($1,$2,$3,'C',$4,$4,$5,$6,$7,'2026-09-15T00:00:00Z')`,
        [id(), t1, kh, email, optIn, optInAt, optOutAt],
      );
    const chan = async (t: string, email: string, reason: string, status: string, luc: string) =>
      db.query(`INSERT INTO email_suppressions (id, tenant_id, email, reason, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())`, [id(), t, email, reason, status, luc]);
    // 1. Từ chối ở một lead, đồng ý ở lead khác cùng email → chỉ 'rut' (lúc từ chối muộn nhất).
    await lead(t1, u1, "mix@x.vn", false, null, "2026-09-01T00:00:00Z");
    await lead(t1, u1, "mix@x.vn", true, "2026-09-20T00:00:00Z", null, "form:a");
    await lead(t1, u1, "mix@x.vn", false, null, "2026-09-05T00:00:00Z");
    // 2. Chỉ có dòng chặn huỷ nhận tin (không còn lead).
    await chan(t1, "huy@x.vn", "huy-nhan-tin", "hoat-dong", "2026-08-01T00:00:00Z");
    // 3. Dòng chặn đã gỡ + lead đồng ý → 'dong-y'.
    await chan(t1, "gobo@x.vn", "huy-nhan-tin", "go-bo", "2026-08-01T00:00:00Z");
    await lead(t1, u1, "gobo@x.vn", true, "2026-09-10T00:00:00Z", null, "form:b");
    // 4. Email hỏng + lead đồng ý → 'dong-y' (vẫn bị chặn email hỏng ở danh sách chặn).
    await chan(t1, "hong@x.vn", "email-hong", "hoat-dong", "2026-08-01T00:00:00Z");
    await lead(t1, u1, "hong@x.vn", true, "2026-09-10T00:00:00Z", null, "form:e");
    // 5. Lead + liên hệ cùng email đồng ý → một dòng, lúc đồng ý muộn nhất.
    await lead(t1, u1, "hai@x.vn", true, "2026-09-01T00:00:00Z", null, "form:c");
    await lienHe("hai@x.vn", true, "2026-09-15T00:00:00Z", null);
    // 6. Liên hệ từ chối, lead đồng ý.
    await lienHe("lh@x.vn", false, null, "2026-09-02T00:00:00Z");
    await lead(t1, u1, "lh@x.vn", true, "2026-09-25T00:00:00Z", null);
    // 7. Email sai khuôn / null — bỏ qua, không làm hỏng migration.
    await lead(t1, u1, "khong-phai-email", true, "2026-09-01T00:00:00Z", null);
    await lead(t1, u1, null, true, "2026-09-01T00:00:00Z", null);
    // 8. Cùng email hai doanh nghiệp: t1 từ chối, t2 đồng ý.
    await lead(t1, u1, "cheo@x.vn", false, null, "2026-09-03T00:00:00Z");
    await lead(t2, u2, "cheo@x.vn", true, "2026-09-04T00:00:00Z", null, "form:d");
    // 9. Đồng ý mà KHÔNG có nguồn → căn cứ ghi "không rõ" (vẫn ≥ 10 ký tự).
    await lead(t2, u2, "khongnguon@x.vn", true, "2026-09-06T00:00:00Z", null);
    // 10. Dữ liệu email 0.16/0.17 để các CHECK thêm mới phải chạy được trên dòng cũ.
    await db.query(`INSERT INTO email_settings (id, tenant_id, host, port, security, from_name, from_email, updated_at) VALUES ($1,$2,'smtp.x.vn',587,'starttls','X','Info@X.vn',now())`, [id(), t1]);

    await db.query(readFileSync(join(thuMuc, moi, "migration.sql"), "utf8"));
    const { rows } = await db.query<{ tenant_id: string; email: string; action: string; source: string; evidence: string; occurred_at: Date }>(`SELECT tenant_id, email, action, source, evidence, occurred_at FROM email_consents ORDER BY email`);
    const cua = (t: string, e: string) => rows.filter((r) => r.tenant_id === t && r.email === e);
    const mot = (t: string, e: string, action: string, luc?: string) => {
      const r = cua(t, e);
      return r.length === 1 && r[0].action === action && r[0].source === "chuyen-doi" && (!luc || r[0].occurred_at.toISOString() === luc);
    };
    dat("Migration: email từng từ chối ở một lead (dù lead khác đồng ý) → đúng một dòng 'rut' lúc từ chối muộn nhất", mot(t1, "mix@x.vn", "rut", "2026-09-05T00:00:00.000Z"), JSON.stringify(cua(t1, "mix@x.vn")));
    dat("Migration: chỉ có dòng chặn 'huỷ nhận tin' → 'rut'", mot(t1, "huy@x.vn", "rut", "2026-08-01T00:00:00.000Z"));
    dat("Migration: dòng chặn đã gỡ + lead đồng ý → 'dong-y'", mot(t1, "gobo@x.vn", "dong-y", "2026-09-10T00:00:00.000Z"));
    dat("Migration: email hỏng + lead đồng ý → 'dong-y' (chặn email hỏng vẫn giữ)", mot(t1, "hong@x.vn", "dong-y"));
    dat("Migration: lead + liên hệ cùng email → một dòng 'dong-y' (lúc đồng ý muộn nhất)", mot(t1, "hai@x.vn", "dong-y", "2026-09-15T00:00:00.000Z"), JSON.stringify(cua(t1, "hai@x.vn")));
    dat("Migration: liên hệ từ chối + lead đồng ý → 'rut'", mot(t1, "lh@x.vn", "rut"));
    dat("Migration: email sai khuôn / trống bị bỏ qua", !rows.some((r) => !r.email.includes("@")));
    dat("Migration: tách theo doanh nghiệp (t1 'rut', t2 'dong-y' cùng email)", mot(t1, "cheo@x.vn", "rut") && mot(t2, "cheo@x.vn", "dong-y"));
    dat("Migration: đồng ý không nguồn → căn cứ 'không rõ'", mot(t2, "khongnguon@x.vn", "dong-y") && cua(t2, "khongnguon@x.vn")[0].evidence.includes("không rõ"));
    dat("Migration: tổng số dòng đúng 9", rows.length === 9, String(rows.length));
    const { rows: st } = await db.query(`SELECT provider, dkim_tokens FROM email_settings`);
    dat("Migration: kết nối SMTP cũ (địa chỉ gửi chữ hoa) → provider 'smtp', CHECK mới không vỡ", st.length === 1 && st[0].provider === "smtp");
    let sua = true;
    try {
      await db.query(`UPDATE email_consents SET evidence = 'x'`);
    } catch {
      sua = false;
    }
    dat("Migration: trigger chỉ-ghi-thêm có hiệu lực ngay (chưa cần chạy rls.sql)", !sua);
  } finally {
    await db.end();
    await quanTri.query(`DROP DATABASE IF EXISTS "${tenTam}" WITH (FORCE)`);
    await quanTri.end();
  }
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
