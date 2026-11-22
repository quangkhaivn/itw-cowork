import type { NenTang } from "../hang-so";
import type { SocialConnector } from "./kieu";
import { wordpress } from "./wordpress";

/**
 * Sổ connector có CODE (ADR-04). Nền tảng có mục trong `social_connector_settings` nhưng chưa có code (Facebook,
 * Instagram, YouTube, Zalo OA — 0.24) trả `null`: không kết nối, không đăng được, màn hình hiện "sắp có".
 */
const SO: Partial<Record<NenTang, SocialConnector>> = {
  WORDPRESS: wordpress,
};

export function layConnector(nenTang: string): SocialConnector | null {
  return SO[nenTang as NenTang] ?? null;
}

export function nenTangCoCode(): NenTang[] {
  return Object.keys(SO) as NenTang[];
}
