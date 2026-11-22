import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { thanhBuoc, type BuocGiaoDich } from "@/lib/api-nhieu-buoc";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { aadKenh, trangThaiKhoaChu } from "./bao-mat/khoa-chu";
import { niemPhong } from "./bao-mat/niem-phong";
import { docCauHinhMxh, capNhatTrangThaiBai } from "./chung";
import { layConnector } from "./connectors/danh-muc";
import type { KetQuaKiemTra } from "./connectors/kieu";
import { HUONG_DAN_LOI, NHAN_KHA_DUNG, TEN_NEN_TANG, type KhaDung, type LoaiLoi } from "./hang-so";
import type { LuocDoDoiMatKhauKenh, LuocDoKetNoiWordPress, LuocDoSuaKenh, LuocDoThongTinWordPress } from "./luoc-do";
import { dangChoPhepLocalhost } from "./mang/goi-an-toan";
import { chuanHoaDiaChiSite } from "./tinh-toan";

/**
 * Kênh mạng xã hội (0.23.0, MXH-01 → MXH-09). Ứng dụng web chỉ NIÊM PHONG mật khẩu ứng dụng (SEC-05); không có hàm mở.
 * "Kiểm tra kết nối" khi nhập mới chạy bằng bản rõ người dùng vừa gõ (chưa lưu); kiểm tra lại kênh đã lưu thì xếp việc cho
 * worker — nơi duy nhất mở được niêm phong (SEC-06).
 */

const CHON_KENH = {
  id: true, platform: true, name: true, externalId: true, accountName: true, status: true, meta: true,
  lastCheckedAt: true, lastCheckOk: true, lastCheckMessage: true, checkRequestedAt: true, disconnectedAt: true,
  createdAt: true, credential: { select: { keyVersion: true, updatedAt: true } },
} as const;

type DongKenh = {
  id: string; platform: string; name: string; externalId: string; accountName: string | null; status: string; meta: unknown;
  lastCheckedAt: Date | null; lastCheckOk: boolean | null; lastCheckMessage: string | null; checkRequestedAt: Date | null;
  disconnectedAt: Date | null; createdAt: Date; credential: { keyVersion: number; updatedAt: Date } | null;
};

/** Dữ liệu kênh trả ra ngoài — KHÔNG có bản niêm phong, không có mật khẩu. */
function kenhRa(k: DongKenh) {
  const meta = (k.meta ?? {}) as Record<string, unknown>;
  return {
    id: k.id,
    nenTang: k.platform,
    tenNenTang: TEN_NEN_TANG[k.platform] ?? k.platform,
    ten: k.name,
    diaChi: k.externalId,
    tenDangNhap: k.accountName,
    tenHienThi: typeof meta.tenHienThi === "string" ? meta.tenHienThi : null,
    trangThai: k.status,
    kiemTraLuc: k.lastCheckedAt,
    kiemTraDat: k.lastCheckOk,
    kiemTraThongBao: k.lastCheckMessage,
    dangChoKiemTra: k.checkRequestedAt !== null,
    daNgat: k.disconnectedAt !== null,
    coBiMat: k.credential !== null,
    biMatCapNhatLuc: k.credential?.updatedAt ?? null,
    taoLuc: k.createdAt,
  };
}
export type KenhRa = ReturnType<typeof kenhRa>;

export async function danhMucNenTang(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const ds = await nc.tx.socialConnectorSetting.findMany({ orderBy: { platform: "asc" } });
  return ds.map((d) => {
    const coCode = layConnector(d.platform) !== null;
    const dungDuoc = d.availability === "AVAILABLE" && d.enabled && coCode;
    return {
      nenTang: d.platform,
      ten: d.name,
      khaDung: d.availability as KhaDung,
      nhanKhaDung: dungDuoc ? NHAN_KHA_DUNG.AVAILABLE : d.availability === "AVAILABLE" ? "Đang tắt" : NHAN_KHA_DUNG[d.availability as KhaDung] ?? d.availability,
      dungDuoc,
      ghiChu: d.note,
    };
  });
}

export async function danhSachKenh(nc: NguCanh, coDaNgat = false) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const ds = await nc.tx.socialConnection.findMany({
    where: coDaNgat ? {} : { disconnectedAt: null },
    select: CHON_KENH,
    orderBy: [{ disconnectedAt: { sort: "desc", nulls: "first" } }, { createdAt: "asc" }],
  });
  return ds.map(kenhRa);
}

/** Nền tảng phải: có mục AVAILABLE + bật + có code. Không thì 409 kèm trạng thái (CONNECTOR_PENDING_APPROVAL…). */
async function batBuocNenTangDungDuoc(nc: NguCanh, nenTang: string): Promise<void> {
  const d = await nc.tx.socialConnectorSetting.findFirst({ where: { platform: nenTang } });
  if (!d || !layConnector(nenTang)) throw new LoiNghiepVu(`${TEN_NEN_TANG[nenTang] ?? nenTang} chưa được hỗ trợ.`, 409, "nen-tang-chua-ho-tro");
  if (d.availability !== "AVAILABLE") {
    throw new LoiNghiepVu(`${d.name}: ${NHAN_KHA_DUNG[d.availability as KhaDung] ?? d.availability}.`, 409, d.availability === "PENDING_APPROVAL" ? "nen-tang-cho-duyet" : "nen-tang-tat");
  }
  if (!d.enabled) throw new LoiNghiepVu(`${d.name} đang tắt trên máy chủ.`, 409, "nen-tang-tat");
}

function batBuocCoKhoaChu() {
  const k = trangThaiKhoaChu();
  if (!k.coKhoa) throw new LoiNghiepVu(k.loi ?? "Máy chủ chưa đặt SOCIAL_MASTER_KEY.", 503, "thieu-social-master-key");
}

function diaChiHopLe(nhap: string): string {
  const d = chuanHoaDiaChiSite(nhap, dangChoPhepLocalhost());
  if (!d.hopLe) throw new LoiNghiepVu(d.lyDo!, 400, "dia-chi-site");
  return d.url!;
}

/**
 * Kiểm tra thông tin WordPress người dùng VỪA NHẬP (chưa lưu) — gọi site thật, ngoài giao dịch CSDL. Không lưu gì,
 * không ghi mật khẩu ở đâu cả.
 */
export async function kiemTraThongTinWordPress(x: NguCanh | BuocGiaoDich, d: z.infer<typeof LuocDoThongTinWordPress>): Promise<KetQuaKiemTra & { huongDan: string | null }> {
  const nb = thanhBuoc(x);
  const hanMs = await nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_connection" });
    await batBuocNenTangDungDuoc(nc, "WORDPRESS");
    return (await docCauHinhMxh(nc.tx)).hanGoiMs;
  });
  const diaChi = diaChiHopLe(d.diaChi);
  const kq = await layConnector("WORDPRESS")!.kiemTraKetNoi({ id: "moi", diaChi, tenDangNhap: d.tenDangNhap, meta: {} }, { tenDangNhap: d.tenDangNhap, matKhau: d.matKhauUngDung }, { hanMs });
  await nb.giaoDich((nc) => nc.kiemToan({ action: "kiem-tra-kenh-mxh", objectType: "social_connection", after: { diaChi, tenDangNhap: d.tenDangNhap, dat: kq.ok } }));
  return { ...kq, huongDan: kq.loai ? HUONG_DAN_LOI[kq.loai as LoaiLoi] : null };
}

/**
 * Nối một site WordPress: kiểm tra kết nối thật bằng thông tin vừa nhập (phải đạt), rồi lưu kênh + bản niêm phong trong
 * MỘT giao dịch. Mật khẩu ứng dụng không đi vào nhật ký, sự kiện, phản hồi.
 */
export async function ketNoiWordPress(x: NguCanh | BuocGiaoDich, d: z.infer<typeof LuocDoKetNoiWordPress>) {
  batBuocCoKhoaChu();
  const kq = await kiemTraThongTinWordPress(x, d);
  if (!kq.ok) throw new LoiNghiepVu(`Chưa lưu kênh: ${kq.thongBao}`, 422, "kiem-tra-ket-noi-hong", { huongDan: kq.huongDan });
  const diaChi = diaChiHopLe(d.diaChi);
  return thanhBuoc(x).giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_connection" });
    const trung = await nc.tx.socialConnection.findFirst({ where: { platform: "WORDPRESS", externalId: diaChi, disconnectedAt: null }, select: { id: true } });
    if (trung) throw new LoiNghiepVu("Site này đã được nối. Muốn đổi tài khoản / mật khẩu ứng dụng thì dùng “Nhập lại mật khẩu” ở kênh đó.", 409, "kenh-da-noi");
    const id = crypto.randomUUID();
    const bn = niemPhong(JSON.stringify({ tenDangNhap: d.tenDangNhap, matKhau: d.matKhauUngDung }), aadKenh(nc.tenantId, id));
    const bayGio = new Date();
    const k = await nc.tx.socialConnection.create({
      data: {
        id, tenantId: nc.tenantId, platform: "WORDPRESS", name: d.ten?.trim() || (new URL(diaChi).host), externalId: diaChi,
        accountName: d.tenDangNhap, status: "ACTIVE", meta: kq.meta as object, lastCheckedAt: bayGio, lastCheckOk: true,
        lastCheckMessage: kq.thongBao, createdBy: nc.hoSo.userId,
        credential: { create: { tenantId: nc.tenantId, ...bn, updatedBy: nc.hoSo.userId } },
      },
      select: CHON_KENH,
    });
    await nc.kiemToan({ action: "ket-noi-kenh-mxh", objectType: "social_connection", objectId: id, after: { nenTang: "WORDPRESS", diaChi, tenDangNhap: d.tenDangNhap, phienBanKhoa: bn.keyVersion } });
    await nc.suKien({ eventType: SU_KIEN.SOCIAL_CONNECTION_CHANGED, objectType: "social_connection", objectId: id, payload: { hanhDong: "ket-noi", nenTang: "WORDPRESS", diaChi } });
    return kenhRa(k);
  });
}

async function layKenh(nc: NguCanh, id: string) {
  const k = await nc.tx.socialConnection.findFirst({ where: { id }, select: CHON_KENH });
  if (!k) throw new LoiKhongTimThay("Kênh");
  return k;
}

/** Nhập lại mật khẩu ứng dụng (kênh cần nhập lại / đổi tài khoản): kiểm tra thật rồi niêm phong lại (data key mới). */
export async function doiMatKhauKenh(x: NguCanh | BuocGiaoDich, id: string, d: z.infer<typeof LuocDoDoiMatKhauKenh>) {
  batBuocCoKhoaChu();
  const nb = thanhBuoc(x);
  const k = await nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_connection", objectId: id });
    const k = await layKenh(nc, id);
    if (k.disconnectedAt) throw new LoiNghiepVu("Kênh đã ngắt — nối lại như kênh mới.", 409, "kenh-da-ngat");
    return k;
  });
  const tenDangNhap = d.tenDangNhap?.trim() || k.accountName || "";
  const kq = await kiemTraThongTinWordPress(nb, { diaChi: k.externalId, tenDangNhap, matKhauUngDung: d.matKhauUngDung });
  if (!kq.ok) throw new LoiNghiepVu(`Chưa lưu: ${kq.thongBao}`, 422, "kiem-tra-ket-noi-hong", { huongDan: kq.huongDan });
  return nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_connection", objectId: id });
    const bn = niemPhong(JSON.stringify({ tenDangNhap, matKhau: d.matKhauUngDung }), aadKenh(nc.tenantId, id));
    await nc.tx.socialCredential.upsert({
      where: { connectionId: id },
      create: { connectionId: id, tenantId: nc.tenantId, ...bn, updatedBy: nc.hoSo.userId },
      update: { ...bn, updatedBy: nc.hoSo.userId },
    });
    const sau = await nc.tx.socialConnection.update({
      where: { id },
      data: { accountName: tenDangNhap, status: "ACTIVE", meta: kq.meta as object, lastCheckedAt: new Date(), lastCheckOk: true, lastCheckMessage: kq.thongBao, checkRequestedAt: null, updatedBy: nc.hoSo.userId },
      select: CHON_KENH,
    });
    await nc.kiemToan({ action: "doi-mat-khau-kenh-mxh", objectType: "social_connection", objectId: id, before: { trangThai: k.status, tenDangNhap: k.accountName }, after: { trangThai: "ACTIVE", tenDangNhap, phienBanKhoa: bn.keyVersion } });
    await nc.suKien({ eventType: SU_KIEN.SOCIAL_CONNECTION_CHANGED, objectType: "social_connection", objectId: id, payload: { hanhDong: "nhap-lai-mat-khau" } });
    return kenhRa(sau);
  });
}

export async function suaKenh(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaKenh>) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_connection", objectId: id });
  const k = await layKenh(nc, id);
  const sau = await nc.tx.socialConnection.update({ where: { id }, data: { name: d.ten, updatedBy: nc.hoSo.userId }, select: CHON_KENH });
  await nc.kiemToan({ action: "sua", objectType: "social_connection", objectId: id, before: { ten: k.name }, after: { ten: d.ten } });
  return kenhRa(sau);
}

/** Xếp việc "kiểm tra lại" cho worker (route không mở được niêm phong). */
export async function yeuCauKiemTraKenh(nc: NguCanh, id: string, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_connection", objectId: id });
  const k = await layKenh(nc, id);
  if (k.disconnectedAt) throw new LoiNghiepVu("Kênh đã ngắt.", 409, "kenh-da-ngat");
  await nc.tx.socialConnection.update({ where: { id }, data: { checkRequestedAt: bayGio } });
  return { daXep: true, thongBao: "Đã gửi yêu cầu — máy nền kiểm trong khoảng 15 giây, tải lại trang để xem kết quả." };
}

/**
 * Ngắt kênh (MXH-06): đánh dấu DISCONNECTED, XÓA bản niêm phong (hủy data key — bí mật không còn mở được), hủy các lượt
 * đăng chưa chạy của kênh. Lượt đang đăng / đối soát để worker chạy nốt? Không — worker thấy kênh đã ngắt thì báo lỗi.
 */
export async function ngatKenh(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "mxh.delete", { objectType: "social_connection", objectId: id });
  const k = await layKenh(nc, id);
  if (k.disconnectedAt) return kenhRa(k);
  await nc.tx.socialCredential.deleteMany({ where: { connectionId: id } });
  const sau = await nc.tx.socialConnection.update({ where: { id }, data: { status: "DISCONNECTED", disconnectedAt: new Date(), checkRequestedAt: null, updatedBy: nc.hoSo.userId }, select: CHON_KENH });
  const huy = await nc.tx.socialPostTarget.findMany({ where: { connectionId: id, status: { in: ["PENDING", "QUEUED"] } }, select: { id: true, postId: true } });
  if (huy.length) {
    await nc.tx.socialPostTarget.updateMany({ where: { id: { in: huy.map((h) => h.id) } }, data: { status: "CANCELED", errorMessage: "Kênh đã ngắt.", nextAttemptAt: null } });
    for (const postId of new Set(huy.map((h) => h.postId))) await capNhatTrangThaiBai(nc.tx, postId);
  }
  await nc.kiemToan({ action: "ngat-kenh-mxh", objectType: "social_connection", objectId: id, before: { trangThai: k.status }, after: { trangThai: "DISCONNECTED", huyLuotCho: huy.length } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_CONNECTION_CHANGED, objectType: "social_connection", objectId: id, payload: { hanhDong: "ngat", huyLuotCho: huy.length } });
  return kenhRa(sau);
}
