import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Xác thực và phiên đăng nhập.
 *
 * Phiên lưu trong cookie httpOnly đã ký (JWT HS256). Cookie CHỈ chứa định danh
 * người dùng và tenant — KHÔNG chứa danh sách quyền. Quyền luôn đọc lại từ cơ sở
 * dữ liệu mỗi yêu cầu, để khi Giám đốc thu hồi quyền của ai thì có hiệu lực ngay,
 * không phải chờ cookie hết hạn.
 */

const TEN_COOKIE = "cowork_phien";
const HAN_PHIEN_GIAY = 60 * 60 * 8; // 8 tiếng, một ngày làm việc

export interface NoiDungPhien {
  userId: string;
  tenantId: string;
  email: string;
}

export interface PhienDaGiaiMa extends NoiDungPhien {
  /** Thời điểm ký phiên (mili-giây). So với users.password_changed_at để vô hiệu phiên cũ. */
  kyLucMs: number;
}

/**
 * Phiên có còn hiệu lực so với lần đổi mật khẩu gần nhất không.
 * Đổi mật khẩu (tự đổi hoặc quản trị đặt lại) thì mọi phiên ký TRƯỚC đó bị vô hiệu —
 * người đang giữ phiên cũ trên máy khác bị đẩy ra.
 *
 * So bằng mili-giây (claim riêng `ms`), không bằng `iat` của JWT: `iat` chỉ tính theo giây,
 * nên phiên ký trong cùng giây với lúc đổi mật khẩu sẽ lọt. Bài thử HTTP đã bắt đúng lỗi này.
 */
export function phienConHieuLuc(kyLucMs: number, doiMatKhauLuc: Date | null): boolean {
  if (!doiMatKhauLuc) return true;
  return kyLucMs >= doiMatKhauLuc.getTime();
}

function layKhoaKy(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET thiếu hoặc ngắn hơn 32 ký tự. Sinh bằng: openssl rand -base64 48");
  }
  return new TextEncoder().encode(secret);
}

export async function bamMatKhau(matKhau: string): Promise<string> {
  return bcrypt.hash(matKhau, 12);
}

export async function kiemTraMatKhau(matKhau: string, bam: string): Promise<boolean> {
  return bcrypt.compare(matKhau, bam);
}

export async function kyPhien(noiDung: NoiDungPhien): Promise<string> {
  return new SignJWT({ tid: noiDung.tenantId, email: noiDung.email, ms: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(noiDung.userId)
    .setIssuedAt()
    .setExpirationTime(`${HAN_PHIEN_GIAY}s`)
    .sign(layKhoaKy());
}

export async function giaiMaPhien(token: string): Promise<PhienDaGiaiMa | null> {
  try {
    const { payload } = await jwtVerify(token, layKhoaKy(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.tid !== "string" || typeof payload.email !== "string") {
      return null;
    }
    // Phiên tạm giữa hai bước đăng nhập không phải phiên thật (XT-04).
    if (payload.p !== undefined) return null;
    // Phiên ký trước bản 19/09 không có claim `ms` → dùng iat (giây) quy ra mili-giây.
    const kyLucMs = typeof payload.ms === "number" ? payload.ms : (payload.iat ?? 0) * 1000;
    return { userId: payload.sub, tenantId: payload.tid, email: payload.email, kyLucMs };
  } catch {
    return null;
  }
}

/** Đặt cookie phiên sau khi đăng nhập thành công. */
export async function datCookiePhien(token: string): Promise<void> {
  const kho = await cookies();
  kho.set(TEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HAN_PHIEN_GIAY,
  });
}

export async function xoaCookiePhien(): Promise<void> {
  const kho = await cookies();
  kho.delete(TEN_COOKIE);
}

/** Đọc phiên hiện tại. Trả về null nếu chưa đăng nhập hoặc cookie hỏng/hết hạn. */
export async function layPhienHienTai(): Promise<PhienDaGiaiMa | null> {
  const kho = await cookies();
  const token = kho.get(TEN_COOKIE)?.value;
  if (!token) return null;
  return giaiMaPhien(token);
}

export const TEN_COOKIE_PHIEN = TEN_COOKIE;

// ---------------------------------------------------------------------------
// Phiên tạm giữa hai bước đăng nhập (xác thực 2 lớp — XT-04)
// ---------------------------------------------------------------------------

const TEN_COOKIE_2_LOP = "cowork_2lop";
const HAN_PHIEN_TAM_GIAY = 5 * 60;

/**
 * Sau khi mật khẩu đúng mà tài khoản bật 2 lớp: chưa cấp phiên thật, chỉ cấp một phiên tạm
 * 5 phút có mục đích `2lop`. Phiên tạm KHÔNG mở được trang hay API nào — `giaiMaPhien()` từ
 * chối nó vì khác tên cookie và có claim `p`; chỉ route nhập mã đọc nó.
 */
export async function kyPhienTam2Lop(noiDung: NoiDungPhien): Promise<string> {
  return new SignJWT({ tid: noiDung.tenantId, email: noiDung.email, ms: Date.now(), p: "2lop" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(noiDung.userId)
    .setIssuedAt()
    .setExpirationTime(`${HAN_PHIEN_TAM_GIAY}s`)
    .sign(layKhoaKy());
}

export async function giaiMaPhienTam2Lop(token: string): Promise<PhienDaGiaiMa | null> {
  try {
    const { payload } = await jwtVerify(token, layKhoaKy(), { algorithms: ["HS256"] });
    if (payload.p !== "2lop" || !payload.sub || typeof payload.tid !== "string" || typeof payload.email !== "string" || typeof payload.ms !== "number") {
      return null;
    }
    return { userId: payload.sub, tenantId: payload.tid, email: payload.email, kyLucMs: payload.ms };
  } catch {
    return null;
  }
}

export async function datCookiePhienTam2Lop(token: string): Promise<void> {
  const kho = await cookies();
  kho.set(TEN_COOKIE_2_LOP, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/dang-nhap",
    maxAge: HAN_PHIEN_TAM_GIAY,
  });
}

export async function docCookiePhienTam2Lop(): Promise<string | null> {
  const kho = await cookies();
  return kho.get(TEN_COOKIE_2_LOP)?.value ?? null;
}

export async function xoaCookiePhienTam2Lop(): Promise<void> {
  const kho = await cookies();
  kho.set(TEN_COOKIE_2_LOP, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/dang-nhap", maxAge: 0 });
}
