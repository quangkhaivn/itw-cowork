import type { NenTang } from "../hang-so";
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import type { SocialConnector } from "./kieu";
import { wordpress } from "./wordpress";
import { youtube } from "./youtube";

/**
 * Sổ connector có CODE (ADR-04). 0.24.0: WordPress, Facebook Page, Instagram, YouTube. Zalo OA có mục trong
 * `social_connector_settings` nhưng chưa có code → `null`: không kết nối, không đăng được, màn hình hiện "chưa hỗ trợ".
 */
const SO: Partial<Record<NenTang, SocialConnector>> = {
  WORDPRESS: wordpress,
  FACEBOOK_PAGE: facebook,
  INSTAGRAM: instagram,
  YOUTUBE: youtube,
};

export function layConnector(nenTang: string): SocialConnector | null {
  return SO[nenTang as NenTang] ?? null;
}

export function nenTangCoCode(): NenTang[] {
  return Object.keys(SO) as NenTang[];
}
