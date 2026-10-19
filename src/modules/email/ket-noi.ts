import type { NguCanh } from "@/lib/api";
import { thanhBuoc, type BuocGiaoDich } from "@/lib/api-nhieu-buoc";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { coKhoaMaHoa, giaiMaNghiepVu, maHoa } from "@/lib/ma-hoa";
import { docHoSoCongTy } from "@/modules/ho-so-cong-ty/service";
import type { DuLieuKetNoiEmail } from "./luoc-do";
import { cauLoiGui, GOI_Y_KET_NOI, thoatHtml } from "./tinh-toan";
import { taoVanChuyen, type CauHinhSmtp } from "./van-chuyen";

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
}

export async function xemKetNoi(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "integration.view");
  const d = await nc.tx.emailSetting.findFirst({ where: { status: "hoat-dong" } });
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
      };
  return { ketNoi, coKhoaMaHoa: coKhoaMaHoa(), goiY: GOI_Y_KET_NOI };
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
  if (d.baoMat === "none" && d.tenDangNhap) {
    throw new LoiNghiepVu(
      "Không gửi mật khẩu qua kết nối không mã hóa. Chọn TLS (cổng 465) hoặc STARTTLS (cổng 587).",
      422,
      "khong-ma-hoa-ket-noi",
    );
  }

  const duLieu = {
    host: d.host,
    port: d.port,
    security: d.baoMat,
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

  const anhChup = (x: typeof cu) =>
    x && { host: x.host, port: x.port, baoMat: x.security, tenDangNhap: x.username, tenNguoiGui: x.fromName, emailNguoiGui: x.fromEmail, traLoi: x.replyTo, theoDoi: x.trackingEnabled };
  await nc.kiemToan({
    action: cu ? "sua" : "tao",
    objectType: "email_setting",
    objectId: sau.id,
    before: anhChup(cu) ?? null,
    after: { ...anhChup(sau), doiMatKhau: passwordEnc === undefined ? "giu-nguyen" : passwordEnc === null ? "da-xoa" : "da-doi" },
  });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CONNECTION_CHANGED, objectType: "email_setting", objectId: sau.id, payload: { host: sau.host } });
  return { ok: true };
}

export interface KetNoiDeGui {
  smtp: CauHinhSmtp;
  tu: { ten: string; email: string };
  traLoi: string | null;
  theoDoi: boolean;
}

/** Đọc kết nối kèm mật khẩu đã giải mã — chỉ dùng ngay trước khi gửi. Chưa cấu hình → null. */
export async function docKetNoiDeGui(tx: ClientTenant, tenantId: string): Promise<KetNoiDeGui | null> {
  const d = await tx.emailSetting.findFirst({ where: { status: "hoat-dong" } });
  if (!d) return null;
  return {
    smtp: {
      host: d.host,
      port: d.port,
      baoMat: d.security as CauHinhSmtp["baoMat"],
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
