import { NextRequest, NextResponse } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { voiTenant, type ClientTenant } from "./db";
import { layPhienHienTai, phienConHieuLuc } from "./xac-thuc";
import { batBuocQuyen, ghiTuChoiQuyen, layHoSoQuyen, LoiThieuQuyen, type HoSoQuyen } from "./phan-quyen";
import { ghiKiemToan, type ThamSoGhiKiemToan } from "./kiem-toan";
import { ghiSuKien, type ThamSoGhiSuKien } from "./su-kien";
import { layIpKhach } from "./yeu-cau";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu, laLoiHetHanGiaoDich, laLoiTranhChap } from "./loi";

/**
 * Lớp bọc chung cho mọi API nghiệp vụ.
 *
 * Mỗi yêu cầu đi đúng một đường:
 *   phiên → giao dịch tenant (RLS) → hồ sơ quyền → kiểm quyền → xử lý → nhật ký → JSON
 *
 * Route KHÔNG tự đọc cookie, tự mở giao dịch hay tự bắt lỗi. Nhờ vậy không có route
 * nào "quên" kiểm quyền hay quên đặt tenant: bỏ qua lớp này thì không có `tx` để dùng.
 *
 * Nghiệp vụ nằm ở `src/modules/<phân hệ>/service.ts`, nhận `NguCanh` — chính các hàm
 * đó sau này được trợ lý AI gọi qua tool calling, với cùng kiểm quyền.
 */

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NguCanh {
  tx: ClientTenant;
  tenantId: string;
  hoSo: HoSoQuyen;
  ip: string | null;
  userAgent: string | null;
  /** Ghi Audit Log, tự điền người thực hiện và IP. */
  kiemToan(thamSo: Omit<ThamSoGhiKiemToan, "actorId" | "actorEmail" | "ipAddress" | "userAgent">): Promise<void>;
  /** Ghi Business Event, tự điền tác nhân. */
  suKien(thamSo: Omit<ThamSoGhiSuKien, "actorType" | "actorId">): Promise<void>;
}

export function taoNguCanh(
  tx: ClientTenant,
  tenantId: string,
  hoSo: HoSoQuyen,
  ip: string | null = null,
  userAgent: string | null = null,
): NguCanh {
  return {
    tx,
    tenantId,
    hoSo,
    ip,
    userAgent,
    kiemToan: (t) =>
      ghiKiemToan(tx, { ...t, actorId: hoSo.userId, actorEmail: hoSo.email, ipAddress: ip, userAgent }),
    suKien: (t) => ghiSuKien(tx, { ...t, actorType: "user", actorId: hoSo.userId }),
  };
}

export interface TuyChonApi {
  /** Quyền bắt buộc cho cả route. Kiểm thêm quyền chi tiết bên trong service nếu cần. */
  quyen?: string;
  /** Cho phép gọi khi người dùng đang bị bắt đổi mật khẩu (chỉ route đổi mật khẩu). */
  choPhepKhiPhaiDoiMatKhau?: boolean;
  /** Hạn giao dịch (ms) cho route xử lý theo lô — xem `HAN_GIAO_DICH_THEO_LO_MS` (QĐ-56). */
  hanGiaoDichMs?: number;
  /** Cho phép gọi khi vai trò bắt buộc 2 lớp mà người dùng chưa bật (chỉ các route bật 2 lớp). */
  choPhepKhiPhaiBat2Lop?: boolean;
}

type NguCanhRoute<P> = { params: Promise<P> };

export function xuLyApi<P extends Record<string, string> = Record<string, never>>(
  xuLy: (nc: NguCanh, req: NextRequest, thamSo: P) => Promise<unknown>,
  tuyChon: TuyChonApi = {},
) {
  return async (req: NextRequest, ctx: NguCanhRoute<P>): Promise<NextResponse> => {
    const phien = await layPhienHienTai();
    if (!phien) return traLoiChuaDangNhap();

    const ip = layIpKhach(req.headers);
    const userAgent = req.headers.get("user-agent");
    let hoSoDaDoc: HoSoQuyen | null = null;

    try {
      const thamSo = ((await ctx?.params) ?? {}) as P;
      // Mọi tham số đường dẫn tên `id` / `...Id` phải là UUID. Không kiểm thì chuỗi lạ
      // ("undefined", "abc") đi thẳng xuống PostgreSQL và thành lỗi 500 (phát hiện 20/09).
      for (const [khoa, giaTri] of Object.entries(thamSo)) {
        if ((khoa === "id" || khoa.endsWith("Id")) && !LA_UUID.test(String(giaTri))) throw new LoiKhongTimThay();
      }
      const ketQua = await voiTenant(phien.tenantId, async (tx) => {
        const hoSo = await kiemHoSoTrongGiaoDich(tx, phien, tuyChon, (h) => (hoSoDaDoc = h));
        return xuLy(taoNguCanh(tx, phien.tenantId, hoSo, ip, userAgent), req, thamSo);
      }, { timeoutMs: tuyChon.hanGiaoDichMs });
      // Route trả tệp (tải tệp đính kèm) tự dựng phản hồi nhị phân; mọi route khác
      // trả dữ liệu thuần và được bọc thành JSON ở đây.
      if (ketQua instanceof NextResponse) return ketQua;
      return NextResponse.json(ketQua ?? { ok: true });
    } catch (loi) {
      return xuLyLoiApi(loi, phien, hoSoDaDoc, ip, userAgent);
    }
  };
}

type PhienApi = NonNullable<Awaited<ReturnType<typeof layPhienHienTai>>>;

/**
 * Bước kiểm chung của mọi API, chạy TRONG giao dịch tenant: hồ sơ quyền còn hiệu lực, không bị
 * bắt đổi mật khẩu / bật 2 lớp, có quyền của route. Dùng chung cho `xuLyApi` và
 * `xuLyApiNhieuBuoc` (src/lib/api-nhieu-buoc.ts) để hai đường không lệch nhau.
 */
export async function kiemHoSoTrongGiaoDich(
  tx: ClientTenant,
  phien: PhienApi,
  tuyChon: Pick<TuyChonApi, "quyen" | "choPhepKhiPhaiDoiMatKhau" | "choPhepKhiPhaiBat2Lop">,
  khiDocDuoc?: (hoSo: HoSoQuyen) => void,
): Promise<HoSoQuyen> {
  const hoSo = await layHoSoQuyen(tx, phien.userId);
  if (!hoSo || !phienConHieuLuc(phien.kyLucMs, hoSo.doiMatKhauLuc)) throw new LoiChuaDangNhap();
  khiDocDuoc?.(hoSo);
  if (hoSo.phaiDoiMatKhau && !tuyChon.choPhepKhiPhaiDoiMatKhau) {
    throw new LoiNghiepVu("Bạn phải đổi mật khẩu trước khi tiếp tục.", 403, "phai-doi-mat-khau");
  }
  if (hoSo.phaiBat2Lop && !tuyChon.choPhepKhiPhaiBat2Lop && !tuyChon.choPhepKhiPhaiDoiMatKhau) {
    throw new LoiNghiepVu("Vai trò của bạn bắt buộc xác thực 2 lớp. Bật 2 lớp trước khi tiếp tục.", 403, "phai-bat-2-lop");
  }
  if (tuyChon.quyen) batBuocQuyen(hoSo, tuyChon.quyen);
  return hoSo;
}

/** Đổi lỗi thành phản hồi; thiếu quyền thì ghi vết từ chối trong giao dịch riêng (giao dịch chính đã cuộn ngược). */
export async function xuLyLoiApi(
  loi: unknown,
  phien: PhienApi,
  hoSo: HoSoQuyen | null,
  ip: string | null,
  userAgent: string | null,
): Promise<NextResponse> {
  if (loi instanceof LoiThieuQuyen) {
    await voiTenant(phien.tenantId, (tx) =>
      ghiTuChoiQuyen(
        tx,
        { userId: phien.userId, email: phien.email, vaiTro: hoSo?.vaiTro.map((v) => v.code) },
        loi,
        { ipAddress: ip, userAgent },
      ),
    ).catch((e) => console.error("[api] không ghi được vết từ chối quyền:", e));
    return traLoi(403, "Bạn không có quyền thực hiện thao tác này.", { quyenThieu: loi.maQuyen });
  }
  return anhXaLoi(loi);
}

export class LoiChuaDangNhap extends Error {
  constructor() {
    super("Chưa đăng nhập.");
    this.name = "LoiChuaDangNhap";
  }
}

export function traLoiChuaDangNhap(): NextResponse {
  return traLoi(401, "Chưa đăng nhập hoặc phiên đã hết hạn.");
}

function traLoi(status: number, thongBao: string, them: Record<string, unknown> = {}) {
  return NextResponse.json({ thongBao, ...them }, { status });
}

export function anhXaLoi(loi: unknown): NextResponse {
  if (loi instanceof LoiChuaDangNhap) return traLoi(401, "Phiên đăng nhập không còn hiệu lực. Đăng nhập lại.");
  if (loi instanceof ZodError) {
    const phang = z.flattenError(loi);
    return traLoi(400, "Dữ liệu nhập chưa hợp lệ.", { loiTruong: phang.fieldErrors, loiChung: phang.formErrors });
  }
  if (loi instanceof LoiDinhDang) {
    return traLoi(400, loi.message, { ma: loi.ma, loiTruong: { [loi.truong]: [loi.message] }, loiChung: [] });
  }
  if (loi instanceof LoiKhongTimThay) return traLoi(404, loi.message);
  if (loi instanceof LoiNghiepVu) {
    return traLoi(loi.status, loi.message, {
      ...(loi.ma && { ma: loi.ma }),
      ...(loi.chiTiet !== undefined && { chiTiet: loi.chiTiet }),
    });
  }
  // Lỗi trùng khóa duy nhất của PostgreSQL mà service chưa tự bắt.
  if (typeof loi === "object" && loi && "code" in loi && (loi as { code: unknown }).code === "P2002") {
    return traLoi(409, "Dữ liệu bị trùng với một bản ghi đã có.");
  }
  // Hai yêu cầu tranh nhau cùng dòng dữ liệu (khóa chéo / tuần tự hóa) — cả giao dịch đã cuộn
  // ngược, không ghi gì; người dùng thử lại là được (TV-BH-01, QA 0.16.1).
  if (laLoiTranhChap(loi)) {
    return traLoi(409, "Có người khác đang thao tác trên cùng chứng từ hoặc mặt hàng. Không có gì được ghi — tải lại trang rồi thử lại.", { ma: "tranh-chap-dong-thoi" });
  }
  if (laLoiHetHanGiaoDich(loi)) {
    return traLoi(503, "Hệ thống đang bận, thao tác chưa được ghi. Thử lại sau ít giây.", { ma: "he-thong-ban" });
  }
  // Giá trị sai kiểu với cột (uuid không hợp lệ trong thân yêu cầu…) — lỗi của dữ liệu vào, không phải của máy chủ.
  if (typeof loi === "object" && loi && "code" in loi && (loi as { code: unknown }).code === "P2007") {
    return traLoi(400, "Dữ liệu nhập chưa hợp lệ.");
  }
  console.error("[api] lỗi ngoài dự kiến:", loi);
  // Không trả chi tiết lỗi ra ngoài: có thể lộ cấu trúc cơ sở dữ liệu.
  return traLoi(500, "Hệ thống gặp lỗi. Thử lại sau hoặc báo quản trị viên.");
}

/** Đọc thân yêu cầu JSON và kiểm bằng lược đồ Zod. Sai thì ném ZodError → 400. */
export async function docThan<T>(req: NextRequest, luocDo: ZodType<T>): Promise<T> {
  const than = await req.json().catch(() => {
    throw new LoiNghiepVu("Thân yêu cầu không phải JSON hợp lệ.", 400);
  });
  return luocDo.parse(than);
}

/** Đọc tham số truy vấn thành object thường để kiểm bằng Zod. */
export function docTruyVan<T>(req: NextRequest, luocDo: ZodType<T>): T {
  return luocDo.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}
