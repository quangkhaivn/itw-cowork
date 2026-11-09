import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS, prisma, voiTenant, type ClientTenant } from "@/lib/db";
import { demVaKiem } from "@/lib/gioi-han-toc-do";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { batBuocQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { LuocDoAnhXaPin, LuocDoMayChamCong, LuocDoSuaMayChamCong } from "@/modules/nhan-su/luoc-do";
import { BO_DOC_ZKTECO, laSoSeriHopLe, type BoDocAdms } from "./adms";
import { docCauHinhChamCong, kiemDuocDuyet, so } from "./chung";
import { phanTichCsvAnhXaPin, phanTichCsvChamCong } from "./nhap-csv";
import { canChapNhanMoiTinh, danhGiaGioMay, mocVN, ngayVNCua } from "./tinh-toan";

/**
 * Máy chấm công vân tay (ZKTeco ADMS/PUSH) — đăng ký máy, nhận dữ liệu máy đẩy lên, PIN chưa khớp,
 * nhập CSV dự phòng. Luật: BUSINESS_RULES.md mục 30 (NS-14 → NS-17). Quyết định QĐ-104 → QĐ-106.
 *
 * Đường máy gọi vào (`/iclock/*`) KHÔNG có phiên đăng nhập: máy được nhận ra bằng số sê-ri (SN) đã được
 * Nhân sự đăng ký trước cho đúng doanh nghiệp + địa điểm. SN lạ → từ chối và ghi nhật ký máy chủ.
 */

// Trần KỸ THUẬT (không phải ngưỡng nghiệp vụ): chặn kẻ dò gửi dồn dập hoặc gửi thân khổng lồ. Áp TRƯỚC khi
// tra SN (chưa biết doanh nghiệp nên chưa đọc được Cấu hình). Trần theo máy (SN + IP, tổng theo SN) nằm ở
// Cấu hình của doanh nghiệp, áp sau khi nhận ra máy (QĐ-114).
export const ADMS_THAN_TOI_DA_BYTE = 2 * 1024 * 1024;
const ADMS_TOI_DA_MOI_PHUT_THEO_IP = 600;
/** Không ghi "lần cuối thấy máy" quá dày: một lần mỗi 30 giây là đủ cho cảnh báo mất kết nối tính bằng phút. */
const ADMS_GHI_NHIP_MOI_MS = 30_000;

// ---------------------------------------------------------------------------
// Đường máy gọi vào
// ---------------------------------------------------------------------------

export interface YeuCauHttpAdms {
  phuongThuc: string;
  /** Phần đường dẫn sau `/iclock/`, ví dụ `cdata`, `getrequest.aspx`. */
  doan: string;
  truyVan: URLSearchParams;
  /** Thân đã đọc (đã kiểm trần byte ở route); null với GET. */
  than: string | null;
  ip: string | null;
}

export interface PhanHoiHttpAdms {
  status: number;
  than: string;
}

/** 0.22.0 (QĐ-175): trần số máy lạ lưu toàn hệ thống và nhịp ghi tối đa một lần / SN / 30 giây. */
export const MAY_LA_TOI_DA = 500;
const MAY_LA_GHI_MOI_GIAY = 30;

/**
 * Ghi máy lạ (SN chưa đăng ký ở doanh nghiệp nào) qua hàm SECURITY DEFINER `ghi_may_la` — KHÔNG lưu lần chấm. Trần: một
 * lần ghi / SN / 30 giây (đếm Redis / bộ nhớ) + tối đa `MAY_LA_TOI_DA` dòng toàn hệ thống. Lỗi ghi không ảnh hưởng câu trả
 * lời cho máy.
 */
async function ghiMayLa(sn: string, ip: string | null, model: string | null): Promise<void> {
  try {
    const nhip = await demVaKiem(`adms:may-la:${sn.toUpperCase()}`, 1, MAY_LA_GHI_MOI_GIAY);
    if (!nhip.choPhep) return;
    await prisma.$queryRaw`SELECT public.ghi_may_la(${sn}, ${ip}, ${model}, ${MAY_LA_TOI_DA}::int) AS ok`;
  } catch (loi) {
    console.warn("[cham-cong/adms] không ghi được máy lạ:", loi instanceof Error ? loi.message : loi);
  }
}

let lanBaoSnLa = 0;
function ghiNhatKySnLa(sn: string, ip: string | null) {
  // Nhật ký máy chủ, tối đa một dòng mỗi 10 giây — máy lạ gọi mỗi vài giây không làm ngập log.
  if (Date.now() - lanBaoSnLa < 10_000) return;
  lanBaoSnLa = Date.now();
  console.warn(`[cham-cong/adms] Máy chưa đăng ký gọi vào: SN=${sn} IP=${ip ?? "?"} — từ chối. Đăng ký ở Nhân sự → Máy chấm công nếu đây là máy của công ty.`);
}

/** Tra (doanh nghiệp, máy) theo SN qua hàm SECURITY DEFINER `tra_may_cham_cong` (QĐ-104) — không phân biệt hoa thường. */
export async function traMayTheoSn(sn: string): Promise<{ tenantId: string; deviceId: string } | null> {
  const dong = await prisma.$queryRaw<{ tenant_id: string; device_id: string }[]>`
    SELECT tenant_id::text AS tenant_id, device_id::text AS device_id FROM public.tra_may_cham_cong(${sn})
  `;
  return dong[0] ? { tenantId: dong[0].tenant_id, deviceId: dong[0].device_id } : null;
}

/**
 * Xử lý một yêu cầu của máy chấm công. Trả văn bản thuần theo giao thức PUSH. Bộ đọc thay được
 * (`boDoc`) — bài thử và bản đọc riêng cho mẫu máy khác chuẩn (QĐ-105).
 */
export async function xuLyAdms(y: YeuCauHttpAdms, tuyChon: { boDoc?: BoDocAdms; bayGio?: () => Date } = {}): Promise<PhanHoiHttpAdms> {
  const boDoc = tuyChon.boDoc ?? BO_DOC_ZKTECO;
  const bayGio = tuyChon.bayGio ?? (() => new Date());
  const yc = boDoc.phanTichYeuCau(y.phuongThuc, y.doan, y.truyVan);
  if (yc.diemCuoi === "khac") return { status: 404, than: "Not Found" };
  if (!laSoSeriHopLe(yc.sn)) return { status: 400, than: "ERROR: SN" };

  const theoIp = await demVaKiem(`adms:ip:${y.ip ?? "?"}`, ADMS_TOI_DA_MOI_PHUT_THEO_IP, 60);
  if (!theoIp.choPhep) return { status: 429, than: "ERROR: TOO MANY REQUESTS" };

  const may = await traMayTheoSn(yc.sn);
  if (!may) {
    ghiNhatKySnLa(yc.sn, y.ip);
    // 0.22.0 (QĐ-175): ghi vào danh sách "máy đang gọi nhưng chưa đăng ký" để Kỹ thuật bấm đăng ký. Không lưu lần chấm.
    const model = (y.truyVan.get("DeviceType") ?? y.truyVan.get("pushver") ?? (yc.info ? yc.info.split(",")[0] : null))?.trim().slice(0, 100) || null;
    await ghiMayLa(yc.sn, y.ip, model);
    return { status: 401, than: "ERROR: UNKNOWN DEVICE" };
  }

  // Lần đồng bộ đầu của máy gửi cả chục nghìn dòng (thân ≤ 2 MB ≈ 50.000 dòng): ghi theo lô có trần rõ ràng
  // nên nới hạn giao dịch như các route theo lô (QĐ-56). Hạn mặc định 5 giây làm lô lớn hỏng 500 → máy gửi
  // lại đúng lô đó mãi mãi và không bao giờ đồng bộ được (QA 0.19.0).
  return voiTenant(may.tenantId, async (tx) => {
    const tb = await tx.attendanceDevice.findFirst({
      where: { id: may.deviceId },
      select: { id: true, serialNumber: true, locationId: true, ipAllowlist: true, lastSeenAt: true, attlogStamp: true, operlogStamp: true, info: true },
    });
    if (!tb) return { status: 401, than: "ERROR: UNKNOWN DEVICE" };
    if (tb.ipAllowlist.length > 0 && (!y.ip || !tb.ipAllowlist.includes(y.ip))) {
      console.warn(`[cham-cong/adms] Máy SN=${tb.serialNumber} gọi từ IP ${y.ip ?? "?"} không nằm trong danh sách cho phép — từ chối.`);
      return { status: 403, than: "ERROR: IP" };
    }
    if (!(await trongTranMay(tx, tb.serialNumber, y.ip))) return { status: 429, than: "ERROR: TOO MANY REQUESTS" };

    // Nhịp sống: mọi yêu cầu của máy đã đăng ký đều cập nhật "lần cuối thấy máy" (NS-17).
    const luc = bayGio();
    const thongTin = yc.info ? phanTichInfoAnToan(yc.info) : null;
    if (!tb.lastSeenAt || luc.getTime() - tb.lastSeenAt.getTime() >= ADMS_GHI_NHIP_MOI_MS || thongTin) {
      await tx.attendanceDevice.update({
        where: { id: tb.id },
        data: { lastSeenAt: luc, lastIp: y.ip, offlineAlertedAt: null, ...(thongTin && { info: thongTin }) },
      });
    }

    if (yc.diemCuoi === "getrequest" || yc.diemCuoi === "devicecmd") return { status: 200, than: boDoc.phanHoiOk() };
    if (yc.batTay) return { status: 200, than: boDoc.phanHoiBatTay(tb.serialNumber, { attlogStamp: tb.attlogStamp, operlogStamp: tb.operlogStamp }) };
    if (yc.phuongThuc !== "POST") return { status: 200, than: boDoc.phanHoiOk() };

    const than = y.than ?? "";
    if (yc.bang === "ATTLOG") {
      const { dong, loi } = boDoc.phanTichAttlog(than);
      const soMoi = await ghiAttlog(tx, may.tenantId, tb, dong, luc);
      if (yc.stamp) await tx.attendanceDevice.update({ where: { id: tb.id }, data: { attlogStamp: yc.stamp } });
      if (dong.length || loi.length) {
        await ghiSuKien(tx, {
          eventType: SU_KIEN.ATTENDANCE_DEVICE_UPLOADED, actorType: "system", objectType: "attendance_device", objectId: tb.id,
          payload: { soDong: dong.length, soMoi, soTrung: dong.length - soMoi, soLoi: loi.length, loi: loi.slice(0, 20) },
        });
      }
      return { status: 200, than: boDoc.phanHoiOk(dong.length + loi.length) };
    }
    // OPERLOG, ATTPHOTO, BIODATA… — chưa dùng; nhận và báo OK để máy không gửi lại mãi.
    if (yc.bang === "OPERLOG" && yc.stamp) await tx.attendanceDevice.update({ where: { id: tb.id }, data: { operlogStamp: yc.stamp } });
    return { status: 200, than: boDoc.phanHoiOk(than.split(/\r?\n/).filter((d) => d.trim() !== "").length) };
  }, { timeoutMs: HAN_GIAO_DICH_THEO_LO_MS });
}

/**
 * Trần tốc độ theo máy (NS-14, QĐ-114): đếm theo (SN, IP nguồn) — người lạ biết SN gửi dồn từ IP của họ chỉ
 * làm CẶP (SN, IP lạ) bị 429, máy thật ở IP văn phòng vẫn gửi được. Thêm trần TỔNG theo SN (mọi IP, mặc định
 * gấp 5) chống lạm dụng bằng nhiều IP; yêu cầu đã bị chặn ở trần (SN, IP) không cộng vào trần tổng, nên
 * một IP lạ đóng góp tối đa đúng trần (SN, IP) của nó. Cả hai ngưỡng ở Cấu hình.
 */
async function trongTranMay(tx: ClientTenant, sn: string, ip: string | null): Promise<boolean> {
  const ch = await docCauHinhChamCong(tx);
  const ma = sn.toUpperCase();
  const theoCap = await demVaKiem(`adms:sn-ip:${ma}:${ip ?? "?"}`, so(ch.admsToiDaPhutSnIp, 120), 60);
  if (!theoCap.choPhep) return false;
  const theoSn = await demVaKiem(`adms:sn:${ma}`, so(ch.admsToiDaPhutSn, 600), 60);
  return theoSn.choPhep;
}

function phanTichInfoAnToan(info: string): Prisma.InputJsonValue | null {
  const p = info.split(",").map((s) => s.trim().slice(0, 60));
  const ten = ["phienBan", "soNguoi", "soVanTay", "soBanGhi", "ip"];
  const kq: Record<string, string> = {};
  p.slice(0, ten.length).forEach((v, i) => {
    if (v) kq[ten[i]] = v;
  });
  return Object.keys(kq).length ? kq : null;
}

/**
 * Ghi các dòng ATTLOG. Chống trùng bằng khóa duy nhất (máy, PIN, giờ) + `skipDuplicates` — máy gửi lại
 * cả lô (mất mạng giữa chừng, đặt lại mốc Stamp) cũng không nhân đôi (NS-14). PIN chưa gán cho ai thì
 * vẫn ghi, `user_id` trống, chờ Nhân sự gán (NS-15).
 */
async function ghiAttlog(
  tx: ClientTenant,
  tenantId: string,
  may: { id: string; locationId: string | null },
  dong: { pin: string; luc: Date; trangThai: number | null; xacThuc: number | null; maCongViec: string | null; dongGoc: string }[],
  bayGio: Date,
): Promise<number> {
  if (dong.length === 0) return 0;
  // Giờ máy lệch / vô lý (NS-14, QĐ-113): ngưỡng ở Cấu hình; lần chấm mang cờ vào hàng chờ xem xét và
  // CHƯA tính công cho tới khi quản lý chấp nhận (như GPS ngoài vùng).
  const ch = await docCauHinhChamCong(tx);
  const nguongGio = { lechToiDaPhut: so(ch.gioMayLechToiDaPhut, 60), namToiThieu: so(ch.gioMayNamToiThieu, 2020) };
  const pins = [...new Set(dong.map((d) => d.pin))];
  const hs = await tx.staffProfile.findMany({ where: { attendancePin: { in: pins } }, select: { userId: true, attendancePin: true } });
  const theoPin = new Map(hs.map((h) => [h.attendancePin!, h.userId]));
  let soMoi = 0;
  // Theo lô 1.000 dòng: lần đồng bộ đầu của máy có thể gửi cả chục nghìn dòng.
  for (let i = 0; i < dong.length; i += 1000) {
    const lo = dong.slice(i, i + 1000);
    const kq = await tx.attendancePunch.createMany({
      skipDuplicates: true,
      data: lo.map((d) => {
        const co = danhGiaGioMay(d.luc, bayGio, nguongGio);
        return {
          tenantId,
          userId: theoPin.get(d.pin) ?? null,
          matchedAt: theoPin.has(d.pin) ? bayGio : null,
          pin: d.pin,
          punchedAt: d.luc,
          source: "van-tay",
          deviceId: may.id,
          locationId: may.locationId,
          deviceStatus: d.trangThai,
          verifyCode: d.xacThuc,
          workCode: d.maCongViec,
          rawLine: d.dongGoc,
          flags: co,
          needsReview: canChapNhanMoiTinh({ gpsResult: null, flags: co }),
        };
      }),
    });
    soMoi += kq.count;
  }
  return soMoi;
}

// ---------------------------------------------------------------------------
// Quản lý máy
// ---------------------------------------------------------------------------

/**
 * 0.22.0 (QĐ-176): quyền máy chấm công = `may_cham_cong.<hd>` (Kỹ thuật, Trưởng kỹ thuật, Nhân sự, Giám đốc, Quản trị)
 * HOẶC quyền nhân sự tương ứng như trước (`nhan_su.view / create / update`). Kỹ thuật không cần quyền hồ sơ / lương.
 */
export function coQuyenMay(nc: NguCanh, hd: "view" | "create" | "update"): boolean {
  return coQuyen(nc.hoSo, `may_cham_cong.${hd}`) || coQuyen(nc.hoSo, `nhan_su.${hd}`);
}
export function batBuocQuyenMay(nc: NguCanh, hd: "view" | "create" | "update", doiTuong: { objectType: string; objectId?: string | null } = { objectType: "attendance_device" }): void {
  if (!coQuyenMay(nc, hd)) throw new LoiThieuQuyen(`may_cham_cong.${hd}`, doiTuong);
}

export async function danhSachMay(nc: NguCanh, bayGio = new Date()) {
  if (!coQuyenMay(nc, "view") && !nc.hoSo.quyen.has("cham_cong.view")) batBuocQuyenMay(nc, "view");
  const ch = await docCauHinhChamCong(nc.tx);
  const nguongMs = so(ch.mayMatKetNoiPhut, 10) * 60_000;
  const ds = await nc.tx.attendanceDevice.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true, serialNumber: true, name: true, status: true, lastSeenAt: true, lastIp: true, ipAllowlist: true, info: true, createdAt: true,
      location: { select: { id: true, name: true } },
    },
  });
  const xemChiTiet = coQuyenMay(nc, "view");
  return {
    nguongPhut: so(ch.mayMatKetNoiPhut, 10),
    dong: ds.map((m) => ({
      id: m.id,
      // Người chỉ có cham_cong.view (trưởng phòng) thấy tên + trạng thái, không thấy SN / IP.
      soSeri: xemChiTiet ? m.serialNumber : null,
      ten: m.name,
      trangThai: m.status,
      diaDiem: m.location ? { id: m.location.id, ten: m.location.name } : null,
      lanCuoi: m.lastSeenAt,
      ipCuoi: xemChiTiet ? m.lastIp : null,
      ipChoPhep: xemChiTiet ? m.ipAllowlist : [],
      thongTin: xemChiTiet ? m.info : null,
      trucTuyen: m.status === "hoat-dong" && m.lastSeenAt !== null && bayGio.getTime() - m.lastSeenAt.getTime() <= nguongMs,
    })),
  };
}

export async function taoMay(nc: NguCanh, d: z.infer<typeof LuocDoMayChamCong>) {
  batBuocQuyenMay(nc, "create");
  if (d.diaDiemId) {
    const dd = await nc.tx.workLocation.findFirst({ where: { id: d.diaDiemId, status: "hoat-dong" }, select: { id: true } });
    if (!dd) throw new LoiDinhDang("diaDiemId", "Địa điểm không tồn tại hoặc đã ngừng.");
  }
  try {
    const m = await nc.tx.attendanceDevice.create({
      data: {
        tenantId: nc.tenantId, serialNumber: d.soSeri, name: d.ten, locationId: d.diaDiemId, ipAllowlist: d.ipChoPhep,
        createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId,
      },
    });
    // QĐ-175: SN này đang nằm trong danh sách máy lạ → xóa dòng máy lạ và đặt ATTLOGStamp=0: lần bắt tay kế tiếp bảo máy
    // gửi lại TOÀN BỘ nhật ký chấm công đã có (máy lạ chưa được lưu lần chấm nào).
    const tuMayLa = Number((await nc.tx.$queryRaw<{ n: number }[]>`SELECT public.xoa_may_la(${d.soSeri}) AS n`)[0]?.n ?? 0) > 0;
    if (tuMayLa) await nc.tx.attendanceDevice.update({ where: { id: m.id }, data: { attlogStamp: "0", operlogStamp: "0" } });
    await nc.kiemToan({ action: tuMayLa ? "dang-ky-may-la" : "tao", objectType: "attendance_device", objectId: m.id, after: { ...d, tuMayLa } });
    await nc.suKien({ eventType: SU_KIEN.HR_SETUP_CHANGED, objectType: "attendance_device", objectId: m.id, payload: { hanhDong: "dang-ky-may", soSeri: d.soSeri, tuMayLa } });
    return { id: m.id, tuMayLa, chuaCoDiaDiem: !d.diaDiemId };
  } catch (e) {
    // SN duy nhất TOÀN HỆ THỐNG (NS-14). Không nói máy thuộc doanh nghiệp nào.
    if (laLoiTrung(e)) throw new LoiDinhDang("soSeri", "Số sê-ri này đã được đăng ký trên hệ thống. Kiểm lại SN trên máy.");
    throw e;
  }
}

export async function suaMay(nc: NguCanh, id: string, vao: z.input<typeof LuocDoSuaMayChamCong>) {
  batBuocQuyenMay(nc, "update", { objectType: "attendance_device", objectId: id });
  const d = { ...vao, diaDiemId: vao.diaDiemId || undefined };
  await khoaChungTu(nc.tx, "attendance_devices", id);
  const cu = await nc.tx.attendanceDevice.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Máy chấm công");
  if (d.diaDiemId && d.diaDiemId !== cu.locationId) {
    const dd = await nc.tx.workLocation.findFirst({ where: { id: d.diaDiemId, status: "hoat-dong" }, select: { id: true } });
    if (!dd) throw new LoiDinhDang("diaDiemId", "Địa điểm không tồn tại hoặc đã ngừng.");
  }
  await nc.tx.attendanceDevice.update({
    where: { id },
    data: {
      ...(d.ten && { name: d.ten }), ...(d.diaDiemId && { locationId: d.diaDiemId }), ...(d.ipChoPhep && { ipAllowlist: d.ipChoPhep }),
      ...(d.trangThai && { status: d.trangThai }), updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({
    action: "sua", objectType: "attendance_device", objectId: id,
    before: { ten: cu.name, diaDiemId: cu.locationId, ipChoPhep: cu.ipAllowlist, trangThai: cu.status }, after: { ...d },
  });
  await nc.suKien({ eventType: SU_KIEN.HR_SETUP_CHANGED, objectType: "attendance_device", objectId: id, payload: { hanhDong: "sua-may" } });
  return { id };
}

// ---------------------------------------------------------------------------
// PIN chưa khớp
// ---------------------------------------------------------------------------

export interface KetQuaApPin {
  /** Số lần chấm vừa được gán cho người này. */
  soLanCham: number;
  /** Số lần chấm chưa khớp thuộc kỳ bảng công ĐÃ KHÓA — chỉ áp khi chọn tường minh (đã áp nếu `apCaKyDaKhoa`). */
  soKyDaKhoa: number;
  /** Số lần chấm trước ngày vào làm — không bao giờ áp (có thể là người cũ dùng lại PIN). */
  soTruocNgayVaoLam: number;
}

/**
 * Gán người cho các lần chấm vân tay / CSV chưa khớp mang đúng PIN (NS-15, QĐ-118). Cập nhật duy nhất mà
 * trigger `chan_sua_lan_cham` cho phép trên bảng chỉ-ghi-thêm: `user_id` NULL → có giá trị.
 *  - chỉ lần chấm TỪ NGÀY VÀO LÀM trở đi (chưa khai ngày vào làm → không giới hạn);
 *  - chỉ lần chấm thuộc kỳ CHƯA KHÓA; kỳ đã khóa → trả số lượng để người dùng biết, áp khi chọn tường minh
 *    `apCaKyDaKhoa` (cần quyền duyệt chấm công với người này, không tự áp cho mình) — bảng công kỳ sau tự sinh
 *    dòng điều chỉnh (NS-53);
 *  - ghi nhật ký kiểm toán.
 */
export async function apDungPinChuaKhop(nc: NguCanh, pin: string, userId: string, tuyChon: { apCaKyDaKhoa?: boolean } = {}): Promise<KetQuaApPin> {
  const apKhoa = tuyChon.apCaKyDaKhoa === true;
  if (apKhoa) {
    if (userId === nc.hoSo.userId) throw new LoiNghiepVu("Không tự áp lần chấm ở kỳ đã khóa cho chính mình — người khác có quyền duyệt làm.", 403, "khong-tu-duyet");
    batBuocQuyen(nc.hoSo, "cham_cong.approve", { objectType: "attendance_punch", objectId: pin });
    await kiemDuocDuyet(nc, userId, { objectType: "attendance_punch", objectId: pin });
  }
  const hs = await nc.tx.staffProfile.findFirst({ where: { userId }, select: { hiredAt: true } });
  const tu = hs?.hiredAt ? mocVN(hs.hiredAt.toISOString().slice(0, 10), 0) : null;
  const kyKhoa = await nc.tx.timesheet.findMany({ where: { status: "da-khoa" }, select: { year: true, month: true } });
  const trongKyKhoa = kyKhoa.map((k) => {
    const dau = `${k.year}-${String(k.month).padStart(2, "0")}-01`;
    const sau = k.month === 12 ? `${k.year + 1}-01-01` : `${k.year}-${String(k.month + 1).padStart(2, "0")}-01`;
    return { punchedAt: { gte: mocVN(dau, 0), lt: mocVN(sau, 0) } };
  });
  const coSo = { pin, userId: null, ...(tu && { punchedAt: { gte: tu } }) };
  const soTruocNgayVaoLam = tu ? await nc.tx.attendancePunch.count({ where: { pin, userId: null, punchedAt: { lt: tu } } }) : 0;
  const soKyDaKhoa = trongKyKhoa.length ? await nc.tx.attendancePunch.count({ where: { AND: [coSo, { OR: trongKyKhoa }] } }) : 0;
  const kq = await nc.tx.attendancePunch.updateMany({
    where: apKhoa || trongKyKhoa.length === 0 ? coSo : { AND: [coSo, { NOT: { OR: trongKyKhoa } }] },
    data: { userId, matchedAt: new Date() },
  });
  if (kq.count > 0 || soKyDaKhoa > 0 || soTruocNgayVaoLam > 0) {
    await nc.kiemToan({
      action: "ap-pin-chua-khop", objectType: "staff_profile", objectId: userId,
      after: { pin, soLanChamGanLai: kq.count, soKyDaKhoa, apCaKyDaKhoa: apKhoa, soTruocNgayVaoLam, ngayVaoLam: tu ? ngayVNCua(tu) : null },
    });
  }
  if (kq.count > 0) {
    await nc.suKien({ eventType: SU_KIEN.ATTENDANCE_PIN_MAPPED, objectType: "user", objectId: userId, payload: { pin, soLanCham: kq.count, apCaKyDaKhoa: apKhoa } });
  }
  return { soLanCham: kq.count, soKyDaKhoa, soTruocNgayVaoLam };
}

export async function danhSachPinChuaKhop(nc: NguCanh) {
  batBuocQuyenMay(nc, "view", { objectType: "attendance_punch" });
  const nhom = await nc.tx.attendancePunch.groupBy({
    by: ["pin"],
    where: { userId: null, pin: { not: null } },
    _count: { _all: true },
    _min: { punchedAt: true },
    _max: { punchedAt: true },
    orderBy: { pin: "asc" },
  });
  // QĐ-118: PIN đã gán cho người mà vẫn còn lần chấm chưa khớp = phần thuộc kỳ đã khóa / trước ngày vào làm.
  const chu = await nc.tx.staffProfile.findMany({
    where: { attendancePin: { in: nhom.map((n) => n.pin!) } },
    select: { attendancePin: true, hiredAt: true, user: { select: { id: true, fullName: true } } },
  });
  const theoPin = new Map(chu.map((c) => [c.attendancePin!, c]));
  // QA 0.22.0 (QĐ-176): Kỹ thuật (chỉ `may_cham_cong.*`) chỉ thấy TÊN người đã gán — ngày vào làm là hồ sơ nhân sự.
  const xemHoSo = coQuyen(nc.hoSo, "nhan_su.view");
  return nhom.map((n) => {
    const c = theoPin.get(n.pin!);
    return {
      pin: n.pin!, soLanCham: n._count._all, dauTien: n._min.punchedAt, ganNhat: n._max.punchedAt,
      nguoiDaGan: c ? { id: c.user.id, hoTen: c.user.fullName, ngayVaoLam: xemHoSo && c.hiredAt ? c.hiredAt.toISOString().slice(0, 10) : null } : null,
    };
  });
}

/** Gán một PIN chưa khớp cho một người: đặt mã chấm công của người đó rồi áp lại các lần chấm cũ. */
export async function anhXaPin(nc: NguCanh, d: z.input<typeof LuocDoAnhXaPin>) {
  batBuocQuyenMay(nc, "update", { objectType: "staff_profile", objectId: d.nguoiId });
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true, fullName: true, staffProfile: { select: { attendancePin: true } } } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  const cuaAi = await nc.tx.staffProfile.findFirst({ where: { attendancePin: d.pin }, select: { userId: true } });
  if (cuaAi && cuaAi.userId !== d.nguoiId) throw new LoiNghiepVu("Mã chấm công này đã gán cho người khác.", 409, "pin-da-gan");
  if (u.staffProfile?.attendancePin && u.staffProfile.attendancePin !== d.pin) {
    throw new LoiNghiepVu(`${u.fullName} đang có mã chấm công ${u.staffProfile.attendancePin}. Đổi mã ở hồ sơ nhân sự nếu máy đã khai lại.`, 409, "da-co-pin");
  }
  // QA 0.22.0: gán PIN đang có lần chấm CHƯA KHỚP cho chính mình = tự nhận công (có thể là lần chấm của người khác) —
  // cùng luật "không tự đặt công cho mình" (QĐ-174). Kỹ thuật (0.22.0) và Nhân sự đều nhờ người khác gán.
  if (d.nguoiId === nc.hoSo.userId && (await nc.tx.attendancePunch.count({ where: { pin: d.pin, userId: null } })) > 0) {
    throw new LoiNghiepVu("Không tự gán mã chấm công đang có lần chấm chưa khớp cho chính mình — nhờ Nhân sự / người khác có quyền gán.", 403, "khong-tu-gan-pin");
  }
  await nc.tx.staffProfile.upsert({
    where: { userId: d.nguoiId },
    update: { attendancePin: d.pin, updatedBy: nc.hoSo.userId },
    create: { tenantId: nc.tenantId, userId: d.nguoiId, attendancePin: d.pin, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
  });
  const kq = await apDungPinChuaKhop(nc, d.pin, d.nguoiId, { apCaKyDaKhoa: d.apCaKyDaKhoa });
  await nc.kiemToan({ action: "gan-ma-cham-cong", objectType: "staff_profile", objectId: d.nguoiId, after: { maChamCong: d.pin, soLanChamGanLai: kq.soLanCham } });
  return kq;
}

// ---------------------------------------------------------------------------
// Nhập CSV dự phòng (NS-16)
// ---------------------------------------------------------------------------

export async function nhapCsvChamCong(nc: NguCanh, noiDung: string, ghi: boolean) {
  batBuocQuyen(nc.hoSo, "cham_cong.update", { objectType: "attendance_punch" });
  const { dong, loi, thieuCot } = phanTichCsvChamCong(noiDung);
  if (thieuCot.length) throw new LoiNghiepVu(`Tệp thiếu cột: ${thieuCot.join(", ")}.`, 422, "thieu-cot");
  const pins = [...new Set(dong.map((d) => d.pin))];
  const hs = await nc.tx.staffProfile.findMany({ where: { attendancePin: { in: pins } }, select: { userId: true, attendancePin: true } });
  const theoPin = new Map(hs.map((h) => [h.attendancePin!, h.userId]));
  const chuaKhop = pins.filter((p) => !theoPin.has(p));
  const xemTruoc = {
    soDong: dong.length,
    soLoi: loi.length,
    loi: loi.slice(0, 50),
    soPin: pins.length,
    pinChuaKhop: chuaKhop.slice(0, 50),
    tuLuc: dong.length ? new Date(Math.min(...dong.map((d) => d.luc.getTime()))) : null,
    denLuc: dong.length ? new Date(Math.max(...dong.map((d) => d.luc.getTime()))) : null,
  };
  if (!ghi) return { ...xemTruoc, daGhi: 0, trung: 0 };
  if (dong.length === 0) throw new LoiNghiepVu("Không có dòng hợp lệ để nhập.", 422, "khong-co-dong");
  let daGhi = 0;
  const bayGio = new Date();
  for (let i = 0; i < dong.length; i += 1000) {
    const kq = await nc.tx.attendancePunch.createMany({
      skipDuplicates: true,
      data: dong.slice(i, i + 1000).map((d) => ({
        tenantId: nc.tenantId, userId: theoPin.get(d.pin) ?? null, matchedAt: theoPin.has(d.pin) ? bayGio : null, pin: d.pin,
        punchedAt: d.luc, source: "nhap-csv", createdBy: nc.hoSo.userId,
      })),
    });
    daGhi += kq.count;
  }
  await nc.kiemToan({ action: "nhap-cham-cong", objectType: "attendance_punch", after: { soDong: dong.length, daGhi, trung: dong.length - daGhi, soLoi: loi.length } });
  await nc.suKien({ eventType: SU_KIEN.ATTENDANCE_IMPORTED, objectType: "attendance_punch", payload: { soDong: dong.length, daGhi, soLoi: loi.length } });
  return { ...xemTruoc, daGhi, trung: dong.length - daGhi };
}

// ---------------------------------------------------------------------------
// 0.22.0 — Kỹ thuật: danh sách nhân viên (chỉ tên + PIN), máy lạ, kiểm tra kết nối, nhập CSV ánh xạ PIN ↔ email
// ---------------------------------------------------------------------------

/** QĐ-176: Kỹ thuật ánh xạ PIN chỉ thấy TÊN (và PIN đã gán) — không email, không hồ sơ, không lương. */
export async function nhanVienChoAnhXa(nc: NguCanh) {
  batBuocQuyenMay(nc, "view", { objectType: "staff_profile" });
  const ds = await nc.tx.user.findMany({
    where: { status: "hoat-dong", isSystem: false },
    select: { id: true, fullName: true, staffProfile: { select: { attendancePin: true } } },
    orderBy: { fullName: "asc" },
  });
  return ds.map((u) => ({ id: u.id, hoTen: u.fullName, pin: u.staffProfile?.attendancePin ?? null }));
}

export interface MayLa {
  soSeri: string;
  ipCuoi: string | null;
  lanDau: Date;
  lanCuoi: Date;
  soLan: number;
  model: string | null;
  cungIpVoiBan: boolean;
}

/**
 * QĐ-175: máy đang gọi nhưng chưa đăng ký mà doanh nghiệp này được thấy — cùng IP với người đang xem, cùng IP với một máy
 * đã đăng ký của doanh nghiệp, hoặc đúng SN gõ vào (hàm `ds_may_la`, cần ngữ cảnh doanh nghiệp). Chỉ người có quyền
 * đăng ký máy.
 */
export async function danhSachMayLa(nc: NguCanh, sn: string | null = null): Promise<MayLa[]> {
  batBuocQuyenMay(nc, "create", { objectType: "attendance_unknown_device" });
  const snSach = sn && laSoSeriHopLe(sn) ? sn : null;
  const ds = await nc.tx.$queryRaw<{ serial_number: string; last_ip: string | null; first_seen_at: Date; last_seen_at: Date; hit_count: number; model: string | null; cung_ip_nguoi_xem: boolean }[]>`
    SELECT * FROM public.ds_may_la(${nc.ip}, ${snSach})`;
  return ds.map((m) => ({ soSeri: m.serial_number, ipCuoi: m.last_ip, lanDau: m.first_seen_at, lanCuoi: m.last_seen_at, soLan: Number(m.hit_count), model: m.model, cungIpVoiBan: m.cung_ip_nguoi_xem }));
}

/** "Kiểm tra kết nối" một máy (QĐ-178): lần gọi cuối, IP nguồn, trực tuyến hay chưa, thông tin máy tự báo. */
export async function kiemTraKetNoiMay(nc: NguCanh, id: string, bayGio = new Date()) {
  batBuocQuyenMay(nc, "view", { objectType: "attendance_device", objectId: id });
  const m = await nc.tx.attendanceDevice.findFirst({ where: { id }, select: { id: true, name: true, serialNumber: true, status: true, lastSeenAt: true, lastIp: true, info: true, ipAllowlist: true } });
  if (!m) throw new LoiKhongTimThay("Máy chấm công");
  const ch = await docCauHinhChamCong(nc.tx);
  const nguongPhut = so(ch.mayMatKetNoiPhut, 10);
  const giay = m.lastSeenAt ? Math.round((bayGio.getTime() - m.lastSeenAt.getTime()) / 1000) : null;
  const trucTuyen = m.status === "hoat-dong" && giay !== null && giay <= nguongPhut * 60;
  let goiY: string;
  if (m.status !== "hoat-dong") goiY = "Máy đang ở trạng thái Ngừng — Cowork từ chối dữ liệu của máy. Bật lại nếu máy vẫn dùng.";
  else if (giay === null) goiY = "Cowork CHƯA nhận được lần gọi nào từ máy này. Kiểm lại trên máy: địa chỉ máy chủ, cổng, HTTPS bật / tắt đúng như hướng dẫn; máy có mạng; SN gõ đúng (SN sai thì máy hiện trong danh sách “Máy đang gọi nhưng chưa đăng ký”).";
  else if (trucTuyen) goiY = "Máy đang kết nối bình thường.";
  else goiY = `Máy im lặng quá ${nguongPhut} phút — kiểm mạng / nguồn điện của máy.`;
  return { id: m.id, ten: m.name, soSeri: m.serialNumber, lanCuoi: m.lastSeenAt, ipCuoi: m.lastIp, giayTruoc: giay, trucTuyen, nguongPhut, thongTin: m.info, ipChoPhep: m.ipAllowlist, goiY };
}

/**
 * Nhập CSV ánh xạ PIN ↔ email (NS-15, QĐ-179): mỗi dòng gán mã chấm công cho người có email đó, rồi áp lần chấm chưa khớp
 * cũ như "Gán cho…" (chỉ kỳ chưa khóa, từ ngày vào làm). Xem trước → ghi; lỗi theo từng dòng; dòng lỗi bỏ qua.
 */
export async function nhapCsvAnhXaPin(nc: NguCanh, noiDung: string, ghi: boolean) {
  batBuocQuyenMay(nc, "update", { objectType: "staff_profile" });
  const { dong, loi, thieuCot } = phanTichCsvAnhXaPin(noiDung);
  if (thieuCot.length) throw new LoiNghiepVu(`Tệp thiếu cột: ${thieuCot.join(", ")}.`, 422, "thieu-cot");
  const nguoi = await nc.tx.user.findMany({
    where: { isSystem: false, email: { in: [...new Set(dong.map((d) => d.email))], mode: "insensitive" } },
    select: { id: true, email: true, fullName: true, status: true, staffProfile: { select: { attendancePin: true } } },
  });
  const theoEmail = new Map(nguoi.map((u) => [u.email.toLowerCase(), u]));
  const chuPin = new Map(
    (await nc.tx.staffProfile.findMany({ where: { attendancePin: { in: [...new Set(dong.map((d) => d.pin))] } }, select: { userId: true, attendancePin: true } })).map((h) => [h.attendancePin!, h.userId]),
  );
  const loiDong = [...loi];
  const hopLe: { soDong: number; pin: string; nguoiId: string; hoTen: string; daCo: boolean }[] = [];
  const pinTrongTep = new Map<string, number>();
  const nguoiTrongTep = new Map<string, number>();
  for (const d of dong) {
    const u = theoEmail.get(d.email);
    if (!u) { loiDong.push({ soDong: d.soDong, lyDo: `Không có nhân viên với email ${d.email}.` }); continue; }
    if (u.status !== "hoat-dong") { loiDong.push({ soDong: d.soDong, lyDo: `${u.fullName} đã ngừng hoạt động.` }); continue; }
    if (u.id === nc.hoSo.userId) { loiDong.push({ soDong: d.soDong, lyDo: "Không tự gán mã chấm công cho chính mình — nhờ người khác có quyền." }); continue; }
    if (pinTrongTep.has(d.pin)) { loiDong.push({ soDong: d.soDong, lyDo: `PIN ${d.pin} trùng dòng ${pinTrongTep.get(d.pin)}.` }); continue; }
    // QA 0.22.0: một người hai dòng (hai PIN khác nhau) — xem trước báo hợp lệ cả hai rồi lúc ghi dòng sau lỗi 409 làm
    // hỏng cả lô. Báo lỗi dòng ngay ở bước xem trước.
    if (nguoiTrongTep.has(u.id)) { loiDong.push({ soDong: d.soDong, lyDo: `${u.fullName} trùng dòng ${nguoiTrongTep.get(u.id)}.` }); continue; }
    pinTrongTep.set(d.pin, d.soDong);
    nguoiTrongTep.set(u.id, d.soDong);
    const chu = chuPin.get(d.pin);
    if (chu && chu !== u.id) { loiDong.push({ soDong: d.soDong, lyDo: `PIN ${d.pin} đã gán cho người khác.` }); continue; }
    const pinCu = u.staffProfile?.attendancePin ?? null;
    if (pinCu && pinCu !== d.pin) { loiDong.push({ soDong: d.soDong, lyDo: `${u.fullName} đang có mã ${pinCu} — đổi ở hồ sơ nhân sự nếu máy đã khai lại.` }); continue; }
    hopLe.push({ soDong: d.soDong, pin: d.pin, nguoiId: u.id, hoTen: u.fullName, daCo: pinCu === d.pin });
  }
  loiDong.sort((a, b) => a.soDong - b.soDong);
  const xemTruoc = { soDong: dong.length + loi.length, hopLe: hopLe.map((h) => ({ soDong: h.soDong, pin: h.pin, hoTen: h.hoTen, daCo: h.daCo })), loi: loiDong.slice(0, 200), soLoi: loiDong.length };
  if (!ghi) return { ...xemTruoc, daGhi: 0, soLanChamGanLai: 0 };
  let daGhi = 0;
  let soLan = 0;
  for (const h of hopLe) {
    const kq = await anhXaPin(nc, { pin: h.pin, nguoiId: h.nguoiId, apCaKyDaKhoa: false });
    if (!h.daCo) daGhi++;
    soLan += kq.soLanCham;
  }
  await nc.kiemToan({ action: "nhap-anh-xa-pin", objectType: "staff_profile", after: { soDong: xemTruoc.soDong, daGhi, soLoi: loiDong.length, soLanChamGanLai: soLan } });
  return { ...xemTruoc, daGhi, soLanChamGanLai: soLan };
}
