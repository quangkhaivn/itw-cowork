import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timTenantTheoMa, voiTenant } from "@/lib/db";
import { bamMatKhau, datCookiePhien, kiemTraMatKhau, kyPhien } from "@/lib/xac-thuc";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { ghiKiemToan } from "@/lib/kiem-toan";
import { demVaKiem, xoaDem } from "@/lib/gioi-han-toc-do";
import { layIpKhach } from "@/lib/yeu-cau";
import { docCauHinh } from "@/modules/cau-hinh/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LuocDo = z.object({
  maDoanhNghiep: z.string().trim().min(1).max(50),
  email: z.string().trim().toLowerCase().email().max(255),
  matKhau: z.string().min(1).max(200),
});

/** Một câu trả lời duy nhất cho mọi kiểu sai, để không lộ email nào có thật. */
const THONG_BAO_SAI = "Mã doanh nghiệp, email hoặc mật khẩu không đúng.";

/**
 * Chống dò mật khẩu — ba lớp:
 *   1. Theo IP: tối đa 30 lần / 15 phút, bất kể tài khoản nào.
 *   2. Theo (doanh nghiệp, email): tối đa 5 lần / 15 phút — áp cả với email KHÔNG
 *      tồn tại, để phản hồi của email thật và email giả giống hệt nhau.
 *   3. Theo tài khoản trong cơ sở dữ liệu: sai N lần liên tiếp thì khóa M phút
 *      (N, M đặt ở màn hình Cấu hình). Lớp này còn nguyên kể cả khi Redis mất.
 */
const TOI_DA_THEO_IP = 30;
const TOI_DA_THEO_TAI_KHOAN = 5;
const CUA_SO_GIAY = 15 * 60;

function biChan(giay: number) {
  const phut = Math.max(1, Math.ceil(giay / 60));
  return NextResponse.json(
    { thongBao: `Đăng nhập sai quá nhiều lần. Thử lại sau khoảng ${phut} phút.` },
    { status: 429, headers: { "Retry-After": String(giay) } },
  );
}

export async function POST(req: NextRequest) {
  const dauVao = LuocDo.safeParse(await req.json().catch(() => null));
  if (!dauVao.success) {
    return NextResponse.json({ thongBao: THONG_BAO_SAI }, { status: 400 });
  }
  const { maDoanhNghiep, email, matKhau } = dauVao.data;

  const ip = layIpKhach(req.headers);
  const userAgent = req.headers.get("user-agent");

  const theoIp = await demVaKiem(`dang-nhap:ip:${ip ?? "khong-ro"}`, TOI_DA_THEO_IP, CUA_SO_GIAY);
  if (!theoIp.choPhep) return biChan(theoIp.conLaiGiay);
  const khoaTaiKhoan = `dang-nhap:tk:${maDoanhNghiep.toLowerCase()}:${email}`;
  const theoTaiKhoan = await demVaKiem(khoaTaiKhoan, TOI_DA_THEO_TAI_KHOAN, CUA_SO_GIAY);
  if (!theoTaiKhoan.choPhep) return biChan(theoTaiKhoan.conLaiGiay);

  const tenant = await timTenantTheoMa(maDoanhNghiep.toLowerCase());
  if (!tenant) {
    // Vẫn tốn thời gian băm một lần để thời gian phản hồi không tiết lộ tenant có thật hay không.
    await bamMatKhau(matKhau);
    return NextResponse.json({ thongBao: THONG_BAO_SAI }, { status: 401 });
  }

  type KetQua =
    | { loai: "ok"; id: string; email: string; hoTen: string; phaiDoiMatKhau: boolean }
    | { loai: "sai" }
    | { loai: "khoa"; conLaiGiay: number };

  const ketQua = await voiTenant<KetQua>(tenant.id, async (tx) => {
    const nguoiDung = await tx.user.findFirst({
      where: { email, status: "hoat-dong" },
      select: {
        id: true,
        email: true,
        fullName: true,
        passwordHash: true,
        isSystem: true,
        mustChangePassword: true,
        failedLoginCount: true,
        lockedUntil: true,
      },
    });

    // Tài khoản máy (ví dụ trợ lý ITA) không được đăng nhập bằng form.
    if (!nguoiDung || nguoiDung.isSystem) {
      await bamMatKhau(matKhau);
      await ghiSuKien(tx, {
        eventType: SU_KIEN.USER_LOGIN_FAILED,
        actorType: "system",
        objectType: "user",
        payload: { email, lyDo: nguoiDung ? "tai-khoan-he-thong" : "khong-ton-tai" },
      });
      await ghiKiemToan(tx, { actorEmail: email, action: "dang-nhap-that-bai", objectType: "user", ipAddress: ip, userAgent });
      return { loai: "sai" };
    }

    const bayGio = new Date();
    if (nguoiDung.lockedUntil && nguoiDung.lockedUntil > bayGio) {
      // Không kiểm mật khẩu khi đang khóa — kể cả mật khẩu đúng cũng không mở được.
      return { loai: "khoa", conLaiGiay: Math.ceil((nguoiDung.lockedUntil.getTime() - bayGio.getTime()) / 1000) };
    }

    const dung = await kiemTraMatKhau(matKhau, nguoiDung.passwordHash);
    if (!dung) {
      const soLanToiDa = (await docCauHinh(tx, "bao_mat.so_lan_sai_toi_da")) ?? 5;
      const soPhutKhoa = (await docCauHinh(tx, "bao_mat.so_phut_khoa")) ?? 15;
      const soLanSai = nguoiDung.failedLoginCount + 1;
      const khoa = soLanSai >= soLanToiDa;
      await tx.user.update({
        where: { id: nguoiDung.id },
        data: {
          failedLoginCount: khoa ? 0 : soLanSai,
          ...(khoa && { lockedUntil: new Date(bayGio.getTime() + soPhutKhoa * 60_000) }),
        },
      });
      await ghiSuKien(tx, {
        eventType: SU_KIEN.USER_LOGIN_FAILED,
        actorType: "user",
        actorId: nguoiDung.id,
        objectType: "user",
        objectId: nguoiDung.id,
        payload: { email, lyDo: "sai-mat-khau", lanSai: soLanSai },
      });
      await ghiKiemToan(tx, {
        actorId: nguoiDung.id,
        actorEmail: email,
        action: "dang-nhap-that-bai",
        objectType: "user",
        objectId: nguoiDung.id,
        ipAddress: ip,
        userAgent,
      });
      if (khoa) {
        await ghiSuKien(tx, {
          eventType: SU_KIEN.USER_LOCKED,
          actorType: "system",
          objectType: "user",
          objectId: nguoiDung.id,
          payload: { soPhut: soPhutKhoa, soLanSai },
        });
        await ghiKiemToan(tx, {
          actorEmail: email,
          action: "khoa-dang-nhap",
          objectType: "user",
          objectId: nguoiDung.id,
          after: { soPhut: soPhutKhoa, soLanSai },
          ipAddress: ip,
          userAgent,
        });
      }
      return { loai: "sai" };
    }

    await tx.user.update({
      where: { id: nguoiDung.id },
      data: { lastLoginAt: bayGio, failedLoginCount: 0, lockedUntil: null },
    });
    await ghiSuKien(tx, {
      eventType: SU_KIEN.USER_LOGGED_IN,
      actorType: "user",
      actorId: nguoiDung.id,
      objectType: "user",
      objectId: nguoiDung.id,
      payload: { email },
    });
    await ghiKiemToan(tx, {
      actorId: nguoiDung.id,
      actorEmail: email,
      action: "dang-nhap",
      objectType: "user",
      objectId: nguoiDung.id,
      ipAddress: ip,
      userAgent,
    });

    return {
      loai: "ok",
      id: nguoiDung.id,
      email: nguoiDung.email,
      hoTen: nguoiDung.fullName,
      phaiDoiMatKhau: nguoiDung.mustChangePassword,
    };
  });

  if (ketQua.loai === "khoa") return biChan(ketQua.conLaiGiay);
  if (ketQua.loai === "sai") return NextResponse.json({ thongBao: THONG_BAO_SAI }, { status: 401 });

  await xoaDem(khoaTaiKhoan);
  const token = await kyPhien({ userId: ketQua.id, tenantId: tenant.id, email: ketQua.email });
  await datCookiePhien(token);

  return NextResponse.json({
    ok: true,
    hoTen: ketQua.hoTen,
    doanhNghiep: tenant.name,
    chuyenDen: ketQua.phaiDoiMatKhau ? "/doi-mat-khau" : "/bang-dieu-khien",
  });
}
