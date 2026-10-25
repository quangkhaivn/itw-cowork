import type { NguCanh } from "@/lib/api";
import { thanhBuoc, type BuocGiaoDich } from "@/lib/api-nhieu-buoc";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiNghiepVu } from "@/lib/loi";
import { Prisma } from "@/generated/prisma/client";
import { SU_KIEN } from "@/lib/su-kien";
import { coKhoaMaHoa, giaiMaNghiepVu, maHoa } from "@/lib/ma-hoa";
import { docHoSoCongTy } from "@/modules/ho-so-cong-ty/service";
import type { DuLieuKetNoiEmail } from "./luoc-do";
import { cauLoiGui, chuanHoaNhanQuangCao, GOI_Y_KET_NOI, mayChuSmtpSes, thoatHtml, VUNG_SES_MAC_DINH, vungCuaTopic } from "./tinh-toan";
import { taoVanChuyen, type CauHinhSmtp } from "./van-chuyen";
import { banGhiCanCo, kiemTraDns, mailFromMacDinh, type KetQuaBanGhi } from "./dns";
import { docHanMucHomNay, docNhanQuangCao, KHOA_NHAN_QUANG_CAO, type HanMucHomNay } from "./han-muc";
import { bamMaWebhookSes, sinhMaWebhookSes, urlWebhookSes } from "./ma-webhook-ses";

/**
 * Kết nối hộp thư gửi (SMTP) — EM-01, EM-02. Quyền `integration.view` / `integration.update`.
 *
 * Mật khẩu: mã hóa AES-256-GCM (ngữ cảnh `smtp:<tenantId>`) trước khi ghi, giải mã **chỉ** lúc
 * gửi thư. Không hàm nào trả mật khẩu ra ngoài module này; nhật ký chỉ ghi "đã đổi mật khẩu".
 */

const ngucanh = (tenantId: string) => `smtp:${tenantId}`;

export interface KetNoiCongKhai {
  daCauHinh: boolean;
  host: string;
  port: number;
  baoMat: "tls" | "starttls" | "none";
  tenDangNhap: string;
  coMatKhau: boolean;
  tenNguoiGui: string;
  emailNguoiGui: string;
  traLoi: string;
  theoDoi: boolean;
  lanThuCuoi: { luc: Date; ok: boolean; loi: string | null } | null;
  capNhatLuc: Date | null;
  // 0.18.0
  kenh: "smtp" | "ses";
  sesVung: string;
  sesConfigurationSet: string;
  tenMienGui: string;
  tenMienMailFrom: string;
  dkim: string[];
  dmarcRua: string;
  sesTopicArn: string;
  nhanQuangCao: string;
  webhook: { coMa: boolean; goiY: string | null; doiLuc: Date | null; dangKyLuc: Date | null; suKienCuoiLuc: Date | null };
}

function chuoiMang(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];
}

export async function xemKetNoi(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "integration.view");
  const d = await nc.tx.emailSetting.findFirst({ where: { status: "hoat-dong" } });
  const nhanQC = await docNhanQuangCao(nc.tx);
  const ketNoi: KetNoiCongKhai = d
    ? {
        daCauHinh: true,
        host: d.host,
        port: d.port,
        baoMat: d.security as KetNoiCongKhai["baoMat"],
        tenDangNhap: d.username ?? "",
        coMatKhau: Boolean(d.passwordEnc),
        tenNguoiGui: d.fromName,
        emailNguoiGui: d.fromEmail,
        traLoi: d.replyTo ?? "",
        theoDoi: d.trackingEnabled,
        lanThuCuoi: d.lastTestAt ? { luc: d.lastTestAt, ok: Boolean(d.lastTestOk), loi: d.lastTestError } : null,
        capNhatLuc: d.updatedAt,
        kenh: d.provider === "ses" ? "ses" : "smtp",
        sesVung: d.sesRegion ?? VUNG_SES_MAC_DINH,
        sesConfigurationSet: d.sesConfigurationSet ?? "",
        tenMienGui: d.sendingDomain ?? "",
        tenMienMailFrom: d.mailFromDomain ?? "",
        dkim: chuoiMang(d.dkimTokens),
        dmarcRua: d.dmarcRua ?? "",
        sesTopicArn: d.sesTopicArn ?? "",
        nhanQuangCao: nhanQC,
        webhook: { coMa: Boolean(d.sesWebhookHash), goiY: d.sesWebhookHint ? `…${d.sesWebhookHint}` : null, doiLuc: d.sesWebhookRotatedAt, dangKyLuc: d.sesSubscribedAt, suKienCuoiLuc: d.sesLastEventAt },
      }
    : {
        daCauHinh: false,
        host: "",
        port: 587,
        baoMat: "starttls",
        tenDangNhap: "",
        coMatKhau: false,
        tenNguoiGui: "",
        emailNguoiGui: "",
        traLoi: "",
        theoDoi: false,
        lanThuCuoi: null,
        capNhatLuc: null,
        kenh: "smtp",
        sesVung: VUNG_SES_MAC_DINH,
        sesConfigurationSet: "",
        tenMienGui: "",
        tenMienMailFrom: "",
        dkim: [],
        dmarcRua: "",
        sesTopicArn: "",
        nhanQuangCao: nhanQC,
        webhook: { coMa: false, goiY: null, doiLuc: null, dangKyLuc: null, suKienCuoiLuc: null },
      };
  const tenMien = d?.sendingDomain
    ? {
        banGhi: (d.dnsCheck as KetQuaBanGhi[] | null) ?? banGhiCanCo({ tenMienGui: d.sendingDomain, mailFrom: d.mailFromDomain, vung: d.sesRegion ?? VUNG_SES_MAC_DINH, dkim: chuoiMang(d.dkimTokens), dmarcRua: d.dmarcRua }),
        daKiem: Boolean(d.dnsCheck),
        kiemLuc: d.dnsCheckedAt,
        mailFrom: d.mailFromDomain || mailFromMacDinh(d.sendingDomain),
      }
    : null;
  const hanMuc: HanMucHomNay = await docHanMucHomNay(nc.tx, ketNoi.kenh);
  return { ketNoi, coKhoaMaHoa: coKhoaMaHoa(), goiY: GOI_Y_KET_NOI, tenMien, hanMuc };
}

export async function luuKetNoi(nc: NguCanh, d: DuLieuKetNoiEmail) {
  batBuocQuyen(nc.hoSo, "integration.update", { objectType: "email_setting" });
  const cu = await nc.tx.emailSetting.findFirst();

  let passwordEnc: string | null | undefined = undefined; // undefined = giữ nguyên
  if (d.xoaMatKhau) passwordEnc = null;
  else if (d.matKhau) {
    if (!coKhoaMaHoa()) {
      throw new LoiNghiepVu(
        "Máy chủ chưa đặt khóa mã hóa APP_ENC_KEY nên không lưu được mật khẩu SMTP. Báo quản trị máy chủ đặt biến này rồi thử lại.",
        503,
        "chua-co-khoa-ma-hoa",
      );
    }
    passwordEnc = maHoa(d.matKhau, ngucanh(nc.tenantId));
  }
  if (d.tenDangNhap && !d.matKhau && !cu?.passwordEnc && !d.xoaMatKhau) {
    throw new LoiNghiepVu("Có tên đăng nhập thì phải nhập mật khẩu (hoặc mật khẩu ứng dụng).", 422, "thieu-mat-khau");
  }
  // 0.18.0 — EG-01. Kênh SES: máy chủ / cổng / mã hóa do máy đặt theo vùng, không nhận từ form.
  const laSes = d.kenh === "ses";
  const vung = d.sesVung || VUNG_SES_MAC_DINH;
  const may = laSes ? mayChuSmtpSes(vung) : { host: d.host, port: d.port, baoMat: d.baoMat };
  if (!laSes && !may.host) throw new LoiNghiepVu("Nhập máy chủ SMTP.", 422, "thieu-may-chu");
  if (may.baoMat === "none" && d.tenDangNhap) {
    throw new LoiNghiepVu(
      "Không gửi mật khẩu qua kết nối không mã hóa. Chọn TLS (cổng 465) hoặc STARTTLS (cổng 587).",
      422,
      "khong-ma-hoa-ket-noi",
    );
  }
  const mienGui = d.emailNguoiGui.split("@")[1] ?? "";
  if (laSes) {
    if (!d.tenMienGui) throw new LoiNghiepVu("Kênh Amazon SES cần tên miền gửi (vd tin.itwonline.com).", 422, "thieu-ten-mien-gui");
    if (!d.tenDangNhap) throw new LoiNghiepVu("Nhập tên đăng nhập SMTP của SES (SMTP credentials — khác khóa IAM thường).", 422, "thieu-dang-nhap-ses");
    if (mienGui !== d.tenMienGui) throw new LoiNghiepVu(`Địa chỉ gửi phải thuộc tên miền gửi ${d.tenMienGui} (vd tin@${d.tenMienGui}).`, 422, "dia-chi-ngoai-ten-mien");
  }
  if (d.tenMienMailFrom && d.tenMienGui && !d.tenMienMailFrom.endsWith(`.${d.tenMienGui}`)) {
    throw new LoiNghiepVu(`Tên miền MAIL FROM phải là tên miền con của ${d.tenMienGui} (vd bounce.${d.tenMienGui}).`, 422, "mail-from-ngoai-ten-mien");
  }
  if (d.sesTopicArn && vungCuaTopic(d.sesTopicArn) !== vung) {
    throw new LoiNghiepVu(`Chủ đề SNS phải ở cùng vùng ${vung} với SES.`, 422, "topic-khac-vung");
  }

  const doiTenMien =
    (cu?.sendingDomain ?? "") !== d.tenMienGui ||
    (cu?.mailFromDomain ?? "") !== d.tenMienMailFrom ||
    (cu?.sesRegion ?? VUNG_SES_MAC_DINH) !== vung ||
    JSON.stringify(chuoiMang(cu?.dkimTokens)) !== JSON.stringify(d.dkim) ||
    (cu?.dmarcRua ?? "") !== d.dmarcRua;
  const duLieu = {
    host: may.host,
    port: may.port,
    security: may.baoMat,
    provider: d.kenh,
    sesRegion: laSes || d.tenMienGui ? vung : null,
    sesConfigurationSet: d.sesConfigurationSet || null,
    sendingDomain: d.tenMienGui || null,
    mailFromDomain: d.tenMienMailFrom || null,
    dkimTokens: d.dkim,
    dmarcRua: d.dmarcRua || null,
    sesTopicArn: d.sesTopicArn || null,
    // Kết quả kiểm DNS cũ không còn đúng khi đổi tên miền / mã DKIM.
    ...(doiTenMien && { dnsCheck: Prisma.DbNull, dnsCheckedAt: null }),
    username: d.tenDangNhap || null,
    fromName: d.tenNguoiGui,
    fromEmail: d.emailNguoiGui,
    replyTo: d.traLoi || null,
    trackingEnabled: d.theoDoi,
    ...(passwordEnc !== undefined && { passwordEnc }),
    updatedBy: nc.hoSo.userId,
  };
  const sau = cu
    ? await nc.tx.emailSetting.update({ where: { id: cu.id }, data: { ...duLieu, status: "hoat-dong" } })
    : await nc.tx.emailSetting.create({ data: { ...duLieu, tenantId: nc.tenantId, createdBy: nc.hoSo.userId } });

  // EG-06: nhãn quảng cáo — chuỗi trong tenant_settings (ô Cấu hình chỉ nhận số, QĐ-73). Trống = mặc định.
  const nhanCu = await docNhanQuangCao(nc.tx);
  const nhanMoi = chuanHoaNhanQuangCao(d.nhanQuangCao);
  if (nhanMoi !== nhanCu) {
    await nc.tx.tenantSetting.upsert({
      where: { tenantId_key: { tenantId: nc.tenantId, key: KHOA_NHAN_QUANG_CAO } },
      update: { value: nhanMoi, status: "hoat-dong", updatedBy: nc.hoSo.userId },
      create: { tenantId: nc.tenantId, key: KHOA_NHAN_QUANG_CAO, value: nhanMoi, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
    });
  }

  const anhChup = (x: typeof cu) =>
    x && {
      host: x.host, port: x.port, baoMat: x.security, tenDangNhap: x.username, tenNguoiGui: x.fromName, emailNguoiGui: x.fromEmail, traLoi: x.replyTo, theoDoi: x.trackingEnabled,
      kenh: x.provider, sesVung: x.sesRegion, configurationSet: x.sesConfigurationSet, tenMienGui: x.sendingDomain, mailFrom: x.mailFromDomain, soMaDkim: chuoiMang(x.dkimTokens).length, topic: x.sesTopicArn,
    };
  await nc.kiemToan({
    action: cu ? "sua" : "tao",
    objectType: "email_setting",
    objectId: sau.id,
    before: anhChup(cu) ?? null,
    after: { ...anhChup(sau), doiMatKhau: passwordEnc === undefined ? "giu-nguyen" : passwordEnc === null ? "da-xoa" : "da-doi", nhanQuangCao: nhanMoi },
  });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CONNECTION_CHANGED, objectType: "email_setting", objectId: sau.id, payload: { host: sau.host } });
  return { ok: true };
}

export interface KetNoiDeGui {
  smtp: CauHinhSmtp;
  tu: { ten: string; email: string };
  traLoi: string | null;
  theoDoi: boolean;
  kenh: "smtp" | "ses";
  sesConfigurationSet: string | null;
}

/** Đọc kết nối kèm mật khẩu đã giải mã — chỉ dùng ngay trước khi gửi. Chưa cấu hình → null. */
export async function docKetNoiDeGui(tx: ClientTenant, tenantId: string): Promise<KetNoiDeGui | null> {
  const d = await tx.emailSetting.findFirst({ where: { status: "hoat-dong" } });
  if (!d) return null;
  const laSes = d.provider === "ses";
  // SES: luôn dựng máy chủ từ vùng (không tin cột host — EG-01).
  const may = laSes ? mayChuSmtpSes(d.sesRegion ?? VUNG_SES_MAC_DINH) : { host: d.host, port: d.port, baoMat: d.security as CauHinhSmtp["baoMat"] };
  return {
    kenh: laSes ? "ses" : "smtp",
    sesConfigurationSet: laSes ? d.sesConfigurationSet : null,
    smtp: {
      host: may.host,
      port: may.port,
      baoMat: may.baoMat,
      tenDangNhap: d.username,
      matKhau: d.passwordEnc
        ? giaiMaNghiepVu(d.passwordEnc, ngucanh(tenantId), "mật khẩu SMTP", "nhập lại mật khẩu ở Quản trị → Kết nối email")
        : null,
    },
    tu: { ten: d.fromName, email: d.fromEmail },
    traLoi: d.replyTo,
    theoDoi: d.trackingEnabled,
  };
}

/**
 * "Gửi thư thử" tới email của người đang đăng nhập — kiểm kết nối thật. Ghi kết quả lần thử.
 *
 * 0.16.1 (QĐ-89): ba bước — đọc cấu hình trong giao dịch ngắn, **gửi SMTP ngoài giao dịch** (máy chủ
 * thư chậm tới 30 giây không còn giữ kết nối CSDL và quá hạn 5 giây của Prisma), ghi kết quả trong
 * giao dịch ngắn thứ hai. Nhận `NguCanh` (bài thử cũ, mọi bước trong giao dịch đang có) hoặc
 * `BuocGiaoDich` (route qua `xuLyApiNhieuBuoc`).
 */
export async function guiThuKiemTraKetNoi(x: NguCanh | BuocGiaoDich) {
  const nb = thanhBuoc(x);
  const { kn, hs, den } = await nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "integration.update", { objectType: "email_setting" });
    const kn = await docKetNoiDeGui(nc.tx, nc.tenantId);
    if (!kn) throw new LoiNghiepVu("Chưa cấu hình kết nối email.", 409, "chua-cau-hinh-email");
    const hs = await docHoSoCongTy(nc.tx, nc.tenantId);
    return { kn, hs, den: { ten: nc.hoSo.hoTen, email: nc.hoSo.email } };
  });

  const vc = taoVanChuyen(kn.smtp);
  let loi: string | null = null;
  const noiDung = `Kết nối email của ${hs.tenHienThi || "doanh nghiệp"} hoạt động. Thư này gửi qua ${kn.smtp.host}:${kn.smtp.port}.`;
  try {
    await vc.gui({
      tu: kn.tu,
      den,
      traLoi: kn.traLoi,
      tieuDe: "Thư thử từ TGTH Business Cowork",
      text: noiDung,
      html: `<p>${thoatHtml(noiDung)}</p>`,
    });
  } catch (e) {
    loi = cauLoiGui(e as Record<string, never>);
  } finally {
    vc.dong();
  }

  await nb.giaoDich(async (nc) => {
    await nc.tx.emailSetting.updateMany({ data: { lastTestAt: new Date(), lastTestOk: loi === null, lastTestError: loi } });
    await nc.kiemToan({ action: "gui-thu", objectType: "email_setting", after: { den: den.email, ok: loi === null } });
    await nc.suKien({ eventType: SU_KIEN.EMAIL_TEST_SENT, objectType: "email_setting", payload: { ok: loi === null } });
  });
  return { ok: loi === null, loi, den: den.email };
}

// ---------------------------------------------------------------------------
// 0.18.0 — Webhook sự kiện SES và kiểm tra DNS tên miền gửi
// ---------------------------------------------------------------------------

/**
 * Tạo / đổi mã webhook SES (EG-02). Mã hiện **một lần** trong URL trả về; máy chủ chỉ giữ SHA-256.
 * Đổi mã → URL cũ hết hiệu lực ngay (phải sửa lại đăng ký HTTPS trong SNS). Chỉ khi kênh đang là SES.
 */
export async function doiMaWebhookSes(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "integration.update", { objectType: "email_setting" });
  const d = await nc.tx.emailSetting.findFirst({ where: { status: "hoat-dong" }, select: { id: true, provider: true, sesWebhookHint: true } });
  if (!d || d.provider !== "ses") throw new LoiNghiepVu("Webhook sự kiện chỉ bật khi kênh gửi là Amazon SES. Lưu kết nối SES trước.", 409, "chua-bat-ses");
  const ma = sinhMaWebhookSes(nc.tenantId);
  const bayGio = new Date();
  await nc.tx.emailSetting.update({
    where: { id: d.id },
    data: { sesWebhookHash: bamMaWebhookSes(ma), sesWebhookHint: ma.slice(-4), sesWebhookRotatedAt: bayGio, sesSubscribedAt: null, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "doi-khoa", objectType: "email_setting", objectId: d.id, before: { goiYMa: d.sesWebhookHint }, after: { goiYMa: ma.slice(-4) } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_SES_WEBHOOK_ROTATED, objectType: "email_setting", objectId: d.id, payload: {} });
  return { url: urlWebhookSes(ma), doiLuc: bayGio };
}

/**
 * "Kiểm tra" DNS tên miền gửi (EG-12): đọc cấu hình (giao dịch ngắn) → tra DNS **ngoài giao dịch** →
 * ghi kết quả (giao dịch ngắn). Báo từng bản ghi kể cả khi chưa có SES.
 */
export async function kiemTraTenMienGui(x: NguCanh | BuocGiaoDich) {
  const nb = thanhBuoc(x);
  const cauHinh = await nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "integration.update", { objectType: "email_setting" });
    const d = await nc.tx.emailSetting.findFirst({ where: { status: "hoat-dong" } });
    if (!d?.sendingDomain) throw new LoiNghiepVu("Chưa khai tên miền gửi (vd tin.itwonline.com) ở Kết nối email.", 409, "chua-co-ten-mien");
    return { id: d.id, tenMienGui: d.sendingDomain, mailFrom: d.mailFromDomain, vung: d.sesRegion ?? VUNG_SES_MAC_DINH, dkim: chuoiMang(d.dkimTokens), dmarcRua: d.dmarcRua };
  });
  const banGhi = await kiemTraDns(cauHinh);
  const luc = new Date();
  await nb.giaoDich(async (nc) => {
    await nc.tx.emailSetting.update({ where: { id: cauHinh.id }, data: { dnsCheck: banGhi as never, dnsCheckedAt: luc } });
    const dem = Object.fromEntries(["dat", "sai", "thieu", "loi", "chua-khai"].map((t) => [t, banGhi.filter((b) => b.trangThai === t).length]));
    await nc.kiemToan({ action: "kiem-tra-dns", objectType: "email_setting", objectId: cauHinh.id, after: { tenMien: cauHinh.tenMienGui, ...dem } });
    await nc.suKien({ eventType: SU_KIEN.EMAIL_DNS_CHECKED, objectType: "email_setting", objectId: cauHinh.id, payload: dem });
  });
  return { banGhi, kiemLuc: luc };
}
