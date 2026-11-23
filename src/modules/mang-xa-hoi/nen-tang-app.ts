import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { thanhBuoc, type BuocGiaoDich } from "@/lib/api-nhieu-buoc";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { giaiMa, maHoa } from "@/lib/ma-hoa";
import { batBuocQuyen, coMotTrongCacQuyen, coQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { aadApp, trangThaiKhoaChu } from "./bao-mat/khoa-chu";
import { niemPhong } from "./bao-mat/niem-phong";
import { docCauHinhMxh } from "./chung";
import { GRAPH_VERSION_MAC_DINH, NHA_CUNG_CAP_APP, NHA_CUNG_CAP_CHUA_HO_TRO, TEN_NHA_CUNG_CAP, type NhaCungCapApp } from "./hang-so";
import type { LuocDoThongTinApp } from "./luoc-do";
import { goiAnToan, LoiGoiMang } from "./mang/goi-an-toan";
import { bonKyTuCuoi, cauLoiGon } from "./tinh-toan";

/**
 * "Quản trị → Kết nối nền tảng (API)" (0.23.0, QĐ-199): thông tin app của Meta / Google / Zalo theo doanh nghiệp, nhập trên
 * màn hình thay vì sửa `.env`. Bí mật niêm phong envelope bằng SOCIAL_MASTER_KEY, AAD = doanh nghiệp + nền tảng; sau khi lưu
 * KHÔNG BAO GIỜ trả lại (chỉ 4 ký tự cuối + lúc cập nhật). Chỉ Giám đốc / Quản trị (`setting.update`) ĐÃ BẬT 2 LỚP được xem
 * giá trị / sửa; Kỹ thuật / Marketing chỉ thấy "đã cấu hình / chưa". Connector 0.24 đọc từ đây (worker mở niêm phong),
 * thiếu thì dùng biến môi trường máy chủ làm dự phòng (`META_APP_ID`/`META_APP_SECRET`, `GOOGLE_CLIENT_ID`/
 * `GOOGLE_CLIENT_SECRET`, `ZALO_APP_ID`/`ZALO_SECRET_KEY`).
 */

export const BIEN_MOI_TRUONG: Record<NhaCungCapApp, { ma: string; biMat: string }> = {
  META: { ma: "META_APP_ID", biMat: "META_APP_SECRET" },
  GOOGLE: { ma: "GOOGLE_CLIENT_ID", biMat: "GOOGLE_CLIENT_SECRET" },
  ZALO: { ma: "ZALO_APP_ID", biMat: "ZALO_SECRET_KEY" },
};

const NHAN_BI_MAT: Record<NhaCungCapApp, string> = { META: "App Secret", GOOGLE: "Client Secret", ZALO: "Secret Key" };

export function coGiaTriMayChu(ncc: NhaCungCapApp, env: NodeJS.ProcessEnv = process.env): boolean {
  const b = BIEN_MOI_TRUONG[ncc];
  return Boolean(env[b.ma]?.trim() && env[b.biMat]?.trim());
}

function duocQuanLy(nc: NguCanh): boolean {
  return coQuyen(nc.hoSo, "setting.update") && nc.hoSo.da2Lop;
}

function batBuocQuanLy(nc: NguCanh, ncc?: string) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "social_app_config", objectId: null });
  if (!nc.hoSo.da2Lop) {
    throw new LoiNghiepVu(`Nhập / xem thông tin app ${ncc ? TEN_NHA_CUNG_CAP[ncc] : "nền tảng"} cần bật xác thực 2 lớp cho tài khoản của bạn (Tài khoản → Xác thực 2 lớp).`, 403, "can-2-lop");
  }
}

function laNhaCungCap(x: string): x is NhaCungCapApp {
  return (NHA_CUNG_CAP_APP as readonly string[]).includes(x);
}

export function batBuocNhaCungCap(x: string): NhaCungCapApp {
  if (laNhaCungCap(x)) return x;
  if ((NHA_CUNG_CAP_CHUA_HO_TRO as readonly string[]).includes(x)) throw new LoiNghiepVu(`${TEN_NHA_CUNG_CAP[x]} chưa được hỗ trợ.`, 409, "nen-tang-chua-ho-tro");
  throw new LoiNghiepVu("Nền tảng không hợp lệ.", 404, "khong-tim-thay");
}

/** Kiểm định dạng phần không bí mật + bí mật (không gọi mạng). Trả lỗi đầu tiên hoặc null. */
export function kiemDinhDang(ncc: NhaCungCapApp, cong: Record<string, string | null | undefined>, biMat: string | null | undefined): string | null {
  if (ncc === "META") {
    if (cong.appId != null && cong.appId !== "" && !/^\d{6,25}$/.test(cong.appId)) return "App ID của Meta là dãy số (xem ở Meta for Developers → App settings → Basic).";
    if (cong.graphVersion != null && cong.graphVersion !== "" && !/^v\d{1,2}\.\d$/.test(cong.graphVersion)) return "Phiên bản Graph API dạng v24.0.";
    if (cong.configId != null && cong.configId !== "" && !/^\d{6,25}$/.test(cong.configId)) return "Configuration ID của Facebook Login for Business là dãy số (Facebook Login for Business → Configurations).";
    if (biMat && !/^[0-9a-f]{32}$/i.test(biMat.trim())) return "App Secret của Meta là 32 ký tự hệ 16 (0-9, a-f).";
  }
  if (ncc === "GOOGLE") {
    if (cong.clientId != null && cong.clientId !== "" && !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(cong.clientId)) return "Client ID của Google có dạng <số>-<chuỗi>.apps.googleusercontent.com.";
    if (biMat && !/^[A-Za-z0-9_-]{20,100}$/.test(biMat.trim())) return "Client Secret của Google không đúng định dạng (thường bắt đầu bằng GOCSPX-).";
    if (cong.khoaPicker && !/^[A-Za-z0-9_-]{30,60}$/.test(cong.khoaPicker)) return "Google API key (Picker) không đúng định dạng (thường bắt đầu bằng AIza, 39 ký tự).";
  }
  if (ncc === "ZALO") {
    if (cong.appId != null && cong.appId !== "" && !/^\d{8,25}$/.test(cong.appId)) return "App ID của Zalo là dãy số.";
    if (biMat && !/^[A-Za-z0-9_-]{10,100}$/.test(biMat.trim())) return "Secret Key của Zalo không đúng định dạng.";
  }
  return null;
}

/** Trường không bắt buộc (không tính vào "đã cấu hình"). */
const TRUONG_TUY_CHON = ["graphVersion", "configId"];

function tenTruong(ncc: NhaCungCapApp) {
  return ncc === "GOOGLE" ? ["clientId"] : ncc === "META" ? ["appId", "graphVersion", "configId"] : ["appId"];
}

/**
 * URL cần dán sang trang của nền tảng, dựng từ APP_URL (hoặc host đang mở). 0.24.0: thêm trang Điều khoản, Quyền riêng
 * tư, Xóa dữ liệu (công khai, theo mã doanh nghiệp) và Data Deletion Callback của Meta.
 */
export function urlCanDan(goc: string, maDoanhNghiep = "") {
  const g = goc.replace(/\/+$/, "");
  let tenMien = "";
  try {
    tenMien = new URL(g).hostname;
  } catch {
    /* để trống */
  }
  return {
    goc: g,
    tenMien,
    callback: {
      META: `${g}/api/cong-khai/mxh/oauth/meta/callback`,
      GOOGLE: `${g}/api/cong-khai/mxh/oauth/google/callback`,
      ZALO: `${g}/api/cong-khai/mxh/oauth/zalo/callback`,
    } as Record<NhaCungCapApp, string>,
    dieuKhoan: `${g}/dieu-khoan${maDoanhNghiep ? `?dn=${encodeURIComponent(maDoanhNghiep)}` : ""}`,
    quyenRiengTu: `${g}/quyen-rieng-tu${maDoanhNghiep ? `?dn=${encodeURIComponent(maDoanhNghiep)}` : ""}`,
    xoaDuLieu: `${g}/xoa-du-lieu${maDoanhNghiep ? `?dn=${encodeURIComponent(maDoanhNghiep)}` : ""}`,
    /** Meta → App settings → Advanced → Data Deletion Request URL. */
    xoaDuLieuCallback: `${g}/api/cong-khai/mxh/meta/xoa-du-lieu/${encodeURIComponent(maDoanhNghiep || "ma-doanh-nghiep")}`,
    /** Google Picker: HTTP referrer cho API key. */
    referrerPicker: `${g}/*`,
  };
}

/** Danh sách cấu hình app. Người quản lý (setting.update + 2 lớp) thấy phần không bí mật + 4 ký tự cuối; người khác chỉ thấy trạng thái. */
export async function danhSachThongTinApp(nc: NguCanh) {
  if (!coMotTrongCacQuyen(nc.hoSo, ["setting.view", "setting.update", "mxh.view", "technical.view"])) batBuocQuyen(nc.hoSo, "setting.view");
  const quanLy = duocQuanLy(nc);
  const ds = await nc.tx.socialAppConfig.findMany();
  const khoa = trangThaiKhoaChu();
  const dong = NHA_CUNG_CAP_APP.map((ncc) => {
    const d = ds.find((x) => x.provider === ncc);
    const cong = (d?.publicConfig ?? {}) as Record<string, string>;
    const coManHinh = Boolean(d?.ciphertext) && tenTruong(ncc).filter((t) => !TRUONG_TUY_CHON.includes(t)).every((t) => cong[t]);
    const mayChu = coGiaTriMayChu(ncc);
    return {
      nhaCungCap: ncc,
      ten: TEN_NHA_CUNG_CAP[ncc],
      hoTro: true,
      daCauHinh: coManHinh || mayChu,
      nguon: coManHinh ? ("man-hinh" as const) : mayChu ? ("may-chu" as const) : null,
      nhanBiMat: NHA_CUNG_CAP_APP.includes(ncc) ? NHAN_BI_MAT[ncc] : "",
      // Chỉ người quản lý thấy phần dưới.
      congKhai: quanLy ? { ...cong, ...(ncc === "META" && !cong.graphVersion ? { graphVersion: GRAPH_VERSION_MAC_DINH } : {}) } : null,
      bonSoCuoi: quanLy ? d?.secretLast4 ?? null : null,
      coKhoaPicker: ncc === "GOOGLE" ? Boolean(d?.pickerKeyEnc) : null,
      khoaPickerBonSoCuoi: quanLy && ncc === "GOOGLE" ? d?.pickerKeyLast4 ?? null : null,
      biMatCapNhatLuc: quanLy ? d?.secretUpdatedAt ?? null : null,
      kiemTra: d?.checkedAt ? { trangThai: d.checkStatus, thongBao: d.checkMessage, luc: d.checkedAt } : null,
      dangChoKiemTra: Boolean(d?.checkRequestedAt),
    };
  });
  const chuaHoTro = NHA_CUNG_CAP_CHUA_HO_TRO.map((ncc) => ({ nhaCungCap: ncc, ten: TEN_NHA_CUNG_CAP[ncc], hoTro: false }));
  return { quanLy, can2Lop: coQuyen(nc.hoSo, "setting.update") && !nc.hoSo.da2Lop, khoaChu: { coKhoa: khoa.coKhoa, loi: khoa.loi }, dong, chuaHoTro };
}

/**
 * Lưu thông tin app. Bí mật mới (nếu có) niêm phong ngay; trống = giữ bí mật cũ. Kiểm toán ghi "đã đổi App Secret Meta",
 * KHÔNG ghi giá trị (cả 4 ký tự cuối).
 */
export async function luuThongTinApp(nc: NguCanh, nccNhap: string, d: z.infer<typeof LuocDoThongTinApp>) {
  const ncc = batBuocNhaCungCap(nccNhap);
  batBuocQuanLy(nc, ncc);
  const loi = kiemDinhDang(ncc, d, d.biMat);
  if (loi) throw new LoiNghiepVu(loi, 400, "sai-dinh-dang");
  const cu = await nc.tx.socialAppConfig.findFirst({ where: { provider: ncc } });
  const congCu = (cu?.publicConfig ?? {}) as Record<string, string>;
  const cong: Record<string, string> = {};
  for (const t of tenTruong(ncc)) {
    const v = (d as Record<string, string | null | undefined>)[t];
    const gt = v === undefined ? congCu[t] : (v ?? "").trim();
    if (gt) cong[t] = gt;
  }
  if (ncc === "META" && !cong.graphVersion) cong.graphVersion = GRAPH_VERSION_MAC_DINH;
  const biMat = d.biMat?.trim() || null;
  const khoaPicker = ncc === "GOOGLE" ? d.khoaPicker?.trim() || null : null;
  if (khoaPicker) {
    const lp = kiemDinhDang(ncc, { khoaPicker }, null);
    if (lp) throw new LoiNghiepVu(lp, 400, "sai-dinh-dang");
  }
  // Google API key (Picker): khóa phía trình duyệt (giới hạn HTTP referrer) — trình duyệt PHẢI nhận được để mở Google
  // Picker, nên mã hóa bằng APP_ENC_KEY (ứng dụng web giải được để đưa cho người soạn bài), không dùng envelope chỉ-worker
  // (QĐ-213). Không bao giờ hiện lại trên màn hình quản trị (chỉ 4 ký tự cuối), không vào kiểm toán.
  const picker = khoaPicker ? { pickerKeyEnc: maHoa(khoaPicker, aadPicker(nc.tenantId)), pickerKeyLast4: bonKyTuCuoi(khoaPicker) } : {};
  let niem = {};
  if (biMat) {
    const k = trangThaiKhoaChu();
    if (!k.coKhoa) throw new LoiNghiepVu(k.loi ?? "Máy chủ chưa đặt SOCIAL_MASTER_KEY.", 503, "thieu-social-master-key");
    const bn = niemPhong(biMat, aadApp(nc.tenantId, ncc));
    niem = { ...bn, secretLast4: bonKyTuCuoi(biMat), secretUpdatedAt: new Date(), secretUpdatedBy: nc.hoSo.userId };
  }
  const doiCong = JSON.stringify(congCu) !== JSON.stringify(cong);
  await nc.tx.socialAppConfig.upsert({
    where: { tenantId_provider: { tenantId: nc.tenantId, provider: ncc } },
    create: { tenantId: nc.tenantId, provider: ncc, publicConfig: cong, ...niem, ...picker, updatedBy: nc.hoSo.userId },
    // Đổi thông tin → kết quả kiểm tra cũ không còn đúng.
    update: { publicConfig: cong, ...niem, ...picker, updatedBy: nc.hoSo.userId, ...(doiCong || biMat ? { checkStatus: null, checkMessage: null, checkedAt: null } : {}) },
  });
  if (khoaPicker) await nc.kiemToan({ action: "doi-bi-mat-app-mxh", objectType: "social_app_config", objectId: null, after: { noiDung: "đã đổi Google API key (Picker)" } });
  if (doiCong) await nc.kiemToan({ action: "luu-thong-tin-app-mxh", objectType: "social_app_config", objectId: null, before: { nenTang: ncc, ...congCu }, after: { nenTang: ncc, ...cong } });
  if (biMat) await nc.kiemToan({ action: "doi-bi-mat-app-mxh", objectType: "social_app_config", objectId: null, after: { noiDung: `đã đổi ${NHAN_BI_MAT[ncc]} ${ncc === "META" ? "Meta" : ncc === "GOOGLE" ? "Google" : "Zalo"}` } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_APP_CONFIG_CHANGED, objectType: "social_app_config", objectId: null, payload: { nenTang: ncc, doiBiMat: Boolean(biMat), doiThongTin: doiCong } });
  return danhSachThongTinApp(nc);
}

/** Xóa bí mật (và tuỳ chọn cả thông tin) của một nền tảng. */
export async function xoaBiMatApp(nc: NguCanh, nccNhap: string) {
  const ncc = batBuocNhaCungCap(nccNhap);
  batBuocQuanLy(nc, ncc);
  const cu = await nc.tx.socialAppConfig.findFirst({ where: { provider: ncc }, select: { id: true } });
  if (cu) {
    await nc.tx.socialAppConfig.update({
      where: { id: cu.id },
      data: { ciphertext: null, iv: null, authTag: null, wrappedKey: null, keyVersion: null, secretLast4: null, pickerKeyEnc: null, pickerKeyLast4: null, secretUpdatedAt: new Date(), secretUpdatedBy: nc.hoSo.userId, checkStatus: null, checkMessage: null, checkedAt: null, checkRequestedAt: null, updatedBy: nc.hoSo.userId },
    });
  }
  await nc.kiemToan({ action: "xoa-bi-mat-app-mxh", objectType: "social_app_config", objectId: null, after: { noiDung: `đã xóa ${NHAN_BI_MAT[ncc]} ${TEN_NHA_CUNG_CAP[ncc]}` } });
  return danhSachThongTinApp(nc);
}

// ---------------------------------------------------------------------------
// Kiểm tra
// ---------------------------------------------------------------------------

let gocGraph = "https://graph.facebook.com";
/** CHỈ bài thử: trỏ kiểm tra Meta sang máy chủ giả cục bộ. */
export function datGocGraphChoBaiThu(goc: string | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("Không đổi địa chỉ Graph API trên môi trường thật.");
  gocGraph = goc ?? "https://graph.facebook.com";
}

export interface KetQuaKiemTraApp {
  trangThai: "ok" | "loi" | "chi-dinh-dang";
  thongBao: string;
}

/**
 * Meta: lấy app token bằng `oauth/access_token?grant_type=client_credentials` — đúng App ID + App Secret thì có token
 * (token bị bỏ ngay, không lưu, không trả). Gọi qua lớp chống SSRF, có hạn giờ. Dùng ở route (bản rõ vừa nhập) và ở worker
 * (bí mật đã lưu, worker mở niêm phong).
 */
export async function kiemTraAppMeta(appId: string, biMat: string, graphVersion: string, hanMs: number): Promise<KetQuaKiemTraApp> {
  const q = new URLSearchParams({ client_id: appId, client_secret: biMat, grant_type: "client_credentials" });
  try {
    const ph = await goiAnToan({ url: `${gocGraph}/${graphVersion}/oauth/access_token?${q.toString()}`, hanMs, tranPhanHoi: 64 * 1024 });
    let j: { access_token?: unknown; error?: { message?: string; code?: number } } = {};
    try {
      j = JSON.parse(ph.than.toString("utf8"));
    } catch {
      /* không phải JSON */
    }
    if (ph.status === 200 && typeof j.access_token === "string") return { trangThai: "ok", thongBao: "Meta xác nhận đúng App ID và App Secret (đã lấy được app token)." };
    if (ph.status >= 400 && ph.status < 500) return { trangThai: "loi", thongBao: `Meta từ chối: ${cauLoiGon(j.error?.message ?? `HTTP ${ph.status}`, 200)}. Kiểm lại App ID / App Secret.` };
    return { trangThai: "loi", thongBao: `Meta trả lỗi ${ph.status} — thử lại sau.` };
  } catch (e) {
    return { trangThai: "loi", thongBao: e instanceof LoiGoiMang ? `Không gọi được Meta: ${e.message}` : "Không gọi được Meta." };
  }
}

function kiemTraDinhDangApp(ncc: NhaCungCapApp, cong: Record<string, string>, coBiMat: boolean): KetQuaKiemTraApp {
  const loi = kiemDinhDang(ncc, cong, null);
  if (loi) return { trangThai: "loi", thongBao: loi };
  const thieu = tenTruong(ncc).filter((t) => !TRUONG_TUY_CHON.includes(t) && !cong[t]);
  if (thieu.length || !coBiMat) return { trangThai: "loi", thongBao: "Chưa nhập đủ thông tin app." };
  return {
    trangThai: "chi-dinh-dang",
    thongBao: ncc === "GOOGLE"
      ? "Định dạng Client ID / Client Secret đúng. Google chỉ kiểm thật được khi kết nối kênh YouTube / Drive đầu tiên (0.24)."
      : "Định dạng App ID / Secret Key đúng. Zalo chỉ kiểm thật được khi kết nối OA đầu tiên.",
  };
}

/**
 * Nút "Kiểm tra". Có bản rõ vừa nhập (chưa lưu) → kiểm ngay (Meta gọi mạng, ngoài giao dịch). Không có → Google / Zalo kiểm
 * định dạng ngay; Meta xếp việc cho worker (chỉ worker mở được bí mật đã lưu).
 */
export async function kiemTraThongTinApp(x: NguCanh | BuocGiaoDich, nccNhap: string, d: z.infer<typeof LuocDoThongTinApp>) {
  const ncc = batBuocNhaCungCap(nccNhap);
  const nb = thanhBuoc(x);
  const truoc = await nb.giaoDich(async (nc) => {
    batBuocQuanLy(nc, ncc);
    const cu = await nc.tx.socialAppConfig.findFirst({ where: { provider: ncc } });
    const cong = { ...((cu?.publicConfig ?? {}) as Record<string, string>) };
    for (const t of tenTruong(ncc)) {
      const v = (d as Record<string, string | null | undefined>)[t];
      if (v) cong[t] = v.trim();
    }
    return { cong, coBiMatLuu: Boolean(cu?.ciphertext), hanMs: (await docCauHinhMxh(nc.tx)).hanGoiMs };
  });
  const biMat = d.biMat?.trim() || null;
  const loiDinhDang = kiemDinhDang(ncc, truoc.cong, biMat);
  let kq: KetQuaKiemTraApp & { dangCho?: boolean };
  if (loiDinhDang) kq = { trangThai: "loi", thongBao: loiDinhDang };
  else if (ncc !== "META") kq = kiemTraDinhDangApp(ncc, truoc.cong, Boolean(biMat) || truoc.coBiMatLuu);
  else if (biMat) {
    kq = truoc.cong.appId ? await kiemTraAppMeta(truoc.cong.appId, biMat, truoc.cong.graphVersion || GRAPH_VERSION_MAC_DINH, truoc.hanMs) : { trangThai: "loi", thongBao: "Nhập App ID." };
  } else if (truoc.coBiMatLuu && truoc.cong.appId) {
    await nb.giaoDich(async (nc) => {
      await nc.tx.socialAppConfig.update({ where: { tenantId_provider: { tenantId: nc.tenantId, provider: ncc } }, data: { checkRequestedAt: new Date() } });
      await nc.kiemToan({ action: "kiem-tra-app-mxh", objectType: "social_app_config", after: { nenTang: ncc, cach: "xep-viec-worker" } });
    });
    return { trangThai: null, thongBao: "Đã gửi yêu cầu — máy nền kiểm bằng App Secret đã lưu trong khoảng 15 giây. Tải lại trang để xem kết quả.", dangCho: true };
  } else kq = { trangThai: "loi", thongBao: "Chưa nhập đủ App ID và App Secret." };
  // Chỉ ghi kết quả vào dòng đã lưu khi kiểm đúng thông tin đang lưu (không có bản rõ mới).
  await nb.giaoDich(async (nc) => {
    if (!biMat) {
      await nc.tx.socialAppConfig.updateMany({ where: { provider: ncc }, data: { checkStatus: kq.trangThai, checkMessage: kq.thongBao, checkedAt: new Date() } });
    }
    await nc.kiemToan({ action: "kiem-tra-app-mxh", objectType: "social_app_config", after: { nenTang: ncc, ketQua: kq.trangThai, banMoi: Boolean(biMat) } });
  });
  return kq;
}

// ---------------------------------------------------------------------------
// Google Picker (0.24.0, QĐ-213)
// ---------------------------------------------------------------------------

export function aadPicker(tenantId: string): string {
  return `mxh-picker:${tenantId}`;
}

/**
 * Cấu hình cho Google Picker trên trình duyệt (người soạn bài: `mxh.create` / `mxh.update`): Client ID (không bí mật),
 * API key (khóa trình duyệt), App ID = số project (phần số đầu của Client ID — Picker cần để cấp quyền drive.file cho
 * đúng app). Không có Client Secret.
 */
export async function cauHinhPicker(nc: NguCanh) {
  if (!coMotTrongCacQuyen(nc.hoSo, ["mxh.create", "mxh.update"])) batBuocQuyen(nc.hoSo, "mxh.create");
  const d = await nc.tx.socialAppConfig.findFirst({ where: { provider: "GOOGLE" } });
  const cong = (d?.publicConfig ?? {}) as Record<string, string>;
  const clientId = cong.clientId || process.env.GOOGLE_CLIENT_ID?.trim() || "";
  if (!clientId) throw new LoiNghiepVu("Chưa nhập Client ID của Google (Quản trị → Kết nối nền tảng (API)).", 409, "chua-cau-hinh-app");
  if (!d?.pickerKeyEnc) throw new LoiNghiepVu("Chưa nhập Google API key (Picker) ở Quản trị → Kết nối nền tảng (API).", 409, "chua-co-khoa-picker");
  let apiKey: string;
  try {
    apiKey = giaiMa(d.pickerKeyEnc, aadPicker(nc.tenantId));
  } catch {
    throw new LoiNghiepVu("Không đọc được Google API key (Picker) — nhập lại ở Quản trị → Kết nối nền tảng (API).", 500, "khoa-picker-hong");
  }
  const appId = /^(\d+)-/.exec(clientId)?.[1] ?? "";
  if (!appId) throw new LoiKhongTimThay("Số project Google");
  return { clientId, apiKey, appId, scope: "https://www.googleapis.com/auth/drive.file" };
}
