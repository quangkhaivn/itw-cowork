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
  return new SignJWT({ tid: noiDung.tenantId, email: noiDung.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(noiDung.userId)
    .setIssuedAt()
    .setExpirationTime(`${HAN_PHIEN_GIAY}s`)
    .sign(layKhoaKy());
}

export async function giaiMaPhien(token: string): Promise<NoiDungPhien | null> {
  try {
    const { payload } = await jwtVerify(token, layKhoaKy(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.tid !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { userId: payload.sub, tenantId: payload.tid, email: payload.email };
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
export async function layPhienHienTai(): Promise<NoiDungPhien | null> {
  const kho = await cookies();
  const token = kho.get(TEN_COOKIE)?.value;
  if (!token) return null;
  return giaiMaPhien(token);
}

export const TEN_COOKIE_PHIEN = TEN_COOKIE;
