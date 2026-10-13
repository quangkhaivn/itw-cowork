import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { voiTenant } from "@/lib/db";
import {
  datCookiePhien,
  docCookiePhienTam2Lop,
  giaiMaPhienTam2Lop,
  kyPhien,
  phienConHieuLuc,
  xoaCookiePhienTam2Lop,
} from "@/lib/xac-thuc";
import { mocMuonHon } from "@/lib/phan-quyen";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { ghiKiemToan } from "@/lib/kiem-toan";
import { demVaKiem, xoaDem } from "@/lib/gioi-han-toc-do";
import { LoiNghiepVu } from "@/lib/loi";
import { layIpKhach } from "@/lib/yeu-cau";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { kiemMaDangNhap } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bước 2 của đăng nhập (XT-04, XT-05): nhập mã 6 số từ ứng dụng xác thực, hoặc một mã khôi phục.
 *
 * Giữ đúng các bất biến xác thực của ARCHITECTURE mục 5:
 *  - **Một câu lỗi chung** cho mọi kiểu sai (mã sai, mã đã dùng, phiên tạm hết hạn sau khi đã đọc).
 *  - **Giới hạn tốc độ** theo IP và theo tài khoản, cộng **khóa tài khoản** dùng chung bộ đếm
 *    `failed_login_count` với bước mật khẩu (ngưỡng N lần / M phút ở Cấu hình).
 *  - Phiên tạm ký trước lần đổi mật khẩu / đổi thiết lập 2 lớp gần nhất thì vô hiệu.
 */

const LuocDo = z.object({ ma: z.string().trim().min(6).max(20) });
const THONG_BAO_SAI = "Mã xác thực không đúng hoặc đã dùng.";
const HET_PHIEN = "Phiên đăng nhập tạm đã hết hạn. Nhập lại mật khẩu.";
const CUA_SO_GIAY = 15 * 60;

function biChan(giay: number) {
  const phut = Math.max(1, Math.ceil(giay / 60));
  return NextResponse.json(
    { thongBao: `Nhập sai quá nhiều lần. Thử lại sau khoảng ${phut} phút.` },
    { status: 429, headers: { "Retry-After": String(giay) } },
  );
}

export async function POST(req: NextRequest) {
  const token = await docCookiePhienTam2Lop();
  const phien = token ? await giaiMaPhienTam2Lop(token) : null;
  if (!phien) return NextResponse.json({ thongBao: HET_PHIEN, ma: "het-phien-tam" }, { status: 401 });

  const dauVao = LuocDo.safeParse(await req.json().catch(() => null));
  if (!dauVao.success) return NextResponse.json({ thongBao: THONG_BAO_SAI }, { status: 400 });

  const ip = layIpKhach(req.headers);
  const userAgent = req.headers.get("user-agent");
  const theoIp = await demVaKiem(`2-lop:ip:${ip ?? "khong-ro"}`, 30, CUA_SO_GIAY);
  if (!theoIp.choPhep) return biChan(theoIp.conLaiGiay);
  const khoaTk = `2-lop:tk:${phien.tenantId}:${phien.userId}`;
  const theoTk = await demVaKiem(khoaTk, 5, CUA_SO_GIAY);
  if (!theoTk.choPhep) return biChan(theoTk.conLaiGiay);

  type KetQua =
    | { loai: "ok"; phaiDoiMatKhau: boolean }
    | { loai: "sai" }
    | { loai: "het" }
    | { loai: "khoa"; conLaiGiay: number }
    | { loai: "loi-khoa-ma-hoa" };

  const ketQua = await voiTenant<KetQua>(phien.tenantId, async (tx) => {
    const u = await tx.user.findFirst({
      where: { id: phien.userId, status: "hoat-dong", isSystem: false },
      select: {
        id: true,
        email: true,
        totpEnabledAt: true,
        lockedUntil: true,
        failedLoginCount: true,
        passwordChangedAt: true,
        securityChangedAt: true,
        mustChangePassword: true,
        lastLoginAt: true,
      },
    });
    if (!u || !u.totpEnabledAt || !phienConHieuLuc(phien.kyLucMs, mocMuonHon(u.passwordChangedAt, u.securityChangedAt))) return { loai: "het" };
    // Phiên tạm chỉ dùng được MỘT lần: đã có lần đăng nhập thành công sau lúc ký phiên tạm này
    // (chính nó, hoặc một lần đăng nhập khác) thì phiên tạm hết giá trị.
    if (u.lastLoginAt && phien.kyLucMs < u.lastLoginAt.getTime()) return { loai: "het" };
    const bayGio = new Date();
    if (u.lockedUntil && u.lockedUntil > bayGio) {
      return { loai: "khoa", conLaiGiay: Math.ceil((u.lockedUntil.getTime() - bayGio.getTime()) / 1000) };
    }

    let loaiMa: Awaited<ReturnType<typeof kiemMaDangNhap>>;
    try {
      loaiMa = await kiemMaDangNhap(tx, u.id, dauVao.data.ma);
    } catch (e) {
      // APP_ENC_KEY thiếu / sai / bản mã hỏng: người ngoài chỉ thấy câu chung, log máy chủ ghi rõ.
      if (e instanceof LoiNghiepVu && e.ma === "khoa-ma-hoa-khong-khop") {
        console.error(`[dang-nhap/2-lop] không kiểm được mã 2 lớp của người dùng ${u.id}: ${e.message}`);
        return { loai: "loi-khoa-ma-hoa" };
      }
      throw e;
    }
    if (!loaiMa) {
      const soLanToiDa = (await docCauHinh(tx, "bao_mat.so_lan_sai_toi_da")) ?? 5;
      const soPhutKhoa = (await docCauHinh(tx, "bao_mat.so_phut_khoa")) ?? 15;
      const soLanSai = u.failedLoginCount + 1;
      const khoa = soLanSai >= soLanToiDa;
      await tx.user.update({
        where: { id: u.id },
        data: { failedLoginCount: khoa ? 0 : soLanSai, ...(khoa && { lockedUntil: new Date(bayGio.getTime() + soPhutKhoa * 60_000) }) },
      });
      await ghiSuKien(tx, { eventType: SU_KIEN.TWO_FACTOR_FAILED, actorType: "user", actorId: u.id, objectType: "user", objectId: u.id, payload: { lanSai: soLanSai } });
      await ghiKiemToan(tx, { actorId: u.id, actorEmail: u.email, action: "xac-thuc-2-lop-that-bai", objectType: "user", objectId: u.id, ipAddress: ip, userAgent });
      if (khoa) {
        await ghiSuKien(tx, { eventType: SU_KIEN.USER_LOCKED, actorType: "system", objectType: "user", objectId: u.id, payload: { soPhut: soPhutKhoa, soLanSai, buoc: "2-lop" } });
        await ghiKiemToan(tx, { actorEmail: u.email, action: "khoa-dang-nhap", objectType: "user", objectId: u.id, after: { soPhut: soPhutKhoa, soLanSai, buoc: "2-lop" }, ipAddress: ip, userAgent });
      }
      return { loai: "sai" };
    }

    await tx.user.update({ where: { id: u.id }, data: { lastLoginAt: bayGio, failedLoginCount: 0, lockedUntil: null } });
    await ghiSuKien(tx, { eventType: SU_KIEN.USER_LOGGED_IN, actorType: "user", actorId: u.id, objectType: "user", objectId: u.id, payload: { email: u.email, haiLop: loaiMa } });
    await ghiKiemToan(tx, { actorId: u.id, actorEmail: u.email, action: "dang-nhap", objectType: "user", objectId: u.id, after: { haiLop: loaiMa }, ipAddress: ip, userAgent });
    if (loaiMa === "khoi-phuc") {
      const con = await tx.userRecoveryCode.count({ where: { userId: u.id, usedAt: null } });
      await ghiSuKien(tx, { eventType: SU_KIEN.RECOVERY_CODE_USED, actorType: "user", actorId: u.id, objectType: "user", objectId: u.id, payload: { conLai: con } });
      await ghiKiemToan(tx, { actorId: u.id, actorEmail: u.email, action: "dung-ma-khoi-phuc", objectType: "user", objectId: u.id, after: { conLai: con }, ipAddress: ip, userAgent });
    }
    return { loai: "ok", phaiDoiMatKhau: u.mustChangePassword };
  });

  if (ketQua.loai === "het") {
    await xoaCookiePhienTam2Lop();
    return NextResponse.json({ thongBao: HET_PHIEN, ma: "het-phien-tam" }, { status: 401 });
  }
  if (ketQua.loai === "khoa") return biChan(ketQua.conLaiGiay);
  if (ketQua.loai === "loi-khoa-ma-hoa") {
    return NextResponse.json(
      { thongBao: "Hệ thống tạm thời không kiểm được mã xác thực. Báo Quản trị hệ thống.", ma: "khong-kiem-duoc-ma" },
      { status: 503 },
    );
  }
  if (ketQua.loai === "sai") return NextResponse.json({ thongBao: THONG_BAO_SAI }, { status: 401 });

  // Đúng mã thì xoá bộ đếm theo tài khoản, như bước mật khẩu — nếu không, lần đăng nhập đúng
  // thứ 6 trong 15 phút bị 429 dù chưa hề sai.
  await xoaDem(khoaTk);
  await xoaCookiePhienTam2Lop();
  await datCookiePhien(await kyPhien({ userId: phien.userId, tenantId: phien.tenantId, email: phien.email }));
  return NextResponse.json({ ok: true, chuyenDen: ketQua.phaiDoiMatKhau ? "/doi-mat-khau" : "/bang-dieu-khien" });
}
