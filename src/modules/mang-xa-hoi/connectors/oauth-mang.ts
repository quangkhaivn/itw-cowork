import { goiAnToan, LoiGoiMang } from "../mang/goi-an-toan";
import { appsecretProof, phanLoaiLoiGoogle, phanLoaiLoiGraph, QUYEN_XIN, type LoiNenTang } from "../oauth-thuan";
import { cauLoiGon } from "../tinh-toan";
import { boCheYeuCau, docJson } from "./goi-chung";
import { gocApi } from "./goc-api";

/**
 * Gọi mạng phần OAuth (0.24.0, QĐ-210): đổi mã lấy token, token dài hạn, danh sách Page / Instagram / kênh YouTube, làm
 * mới token Google, kiểm token Google Picker. Nhận bí mật app ở dạng RÕ làm tham số — CHỈ worker gọi được các hàm cần
 * App Secret / Client Secret (worker là nơi duy nhất mở niêm phong, SEC-06). Không ghi log, không trả token ra ngoài
 * phạm vi kết quả hàm.
 *
 * CHƯA KIỂM VỚI API THẬT: dạng phản hồi `oauth/access_token` (expires_in), `fb_exchange_token`, `me/accounts` với
 * `instagram_business_account{…}`, `me/permissions`, Google `token` / `tokeninfo` (trường aud, azp, scope, expires_in).
 */

export type KetQuaOAuth<T> = { ok: true; giaTri: T } | ({ ok: false } & LoiNenTang);

async function goiJson(url: string, o: { phuongThuc?: "GET" | "POST"; tieuDe?: Record<string, string>; than?: string; hanMs: number }, phanLoai: (s: number, j: unknown) => LoiNenTang, ten: string): Promise<KetQuaOAuth<unknown>> {
  // Che client_secret / code / token nếu máy chủ nhại lại trong lỗi (luật QA 0.23.0).
  const che = boCheYeuCau({ url, tieuDe: o.tieuDe, than: o.than });
  try {
    const ph = await goiAnToan({ url, phuongThuc: o.phuongThuc ?? "GET", tieuDe: o.tieuDe, than: o.than, hanMs: o.hanMs, tranPhanHoi: 2 * 1024 * 1024 });
    const j = docJson(ph);
    if (ph.status >= 200 && ph.status < 300) return { ok: true, giaTri: j };
    const l = phanLoai(ph.status, j);
    return { ok: false, ...l, ma: che(l.ma).slice(0, 100), thongBao: che(l.thongBao) };
  } catch (e) {
    return { ok: false, loai: "RETRYABLE", ma: e instanceof LoiGoiMang ? e.loai : "loi-khac", thongBao: che(`${ten}: ${e instanceof Error ? cauLoiGon(e.message, 200) : "lỗi mạng"}`) };
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export interface PageMeta {
  id: string;
  ten: string;
  accessToken: string;
  tasks: string[];
  instagram: { id: string; username: string | null; ten: string | null } | null;
}

export interface KetQuaDoiMaMeta {
  userId: string;
  tenNguoi: string | null;
  hetHanUserToken: Date | null;
  quyenThieu: string[];
  pages: PageMeta[];
}

export async function doiMaMeta(o: { appId: string; appSecret: string; graphVersion: string; redirectUri: string; code: string; hanMs: number; bayGio: Date }): Promise<KetQuaOAuth<KetQuaDoiMaMeta>> {
  const g = `${gocApi().graph}/${o.graphVersion}`;
  const t1 = await goiJson(`${g}/oauth/access_token?${new URLSearchParams({ client_id: o.appId, redirect_uri: o.redirectUri, client_secret: o.appSecret, code: o.code })}`, { hanMs: o.hanMs }, phanLoaiLoiGraph, "Meta");
  if (!t1.ok) return t1;
  const ngan = (t1.giaTri as { access_token?: unknown }).access_token;
  if (typeof ngan !== "string") return { ok: false, loai: "PERMANENT", ma: "meta-khong-co-token", thongBao: "Meta không trả access token." };
  const t2 = await goiJson(`${g}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: o.appId, client_secret: o.appSecret, fb_exchange_token: ngan })}`, { hanMs: o.hanMs }, phanLoaiLoiGraph, "Meta");
  if (!t2.ok) return t2;
  const dai = (t2.giaTri as { access_token?: unknown; expires_in?: unknown });
  if (typeof dai.access_token !== "string") return { ok: false, loai: "PERMANENT", ma: "meta-khong-co-token-dai", thongBao: "Meta không đổi được token dài hạn." };
  const tok = dai.access_token;
  const hdr = { Authorization: `OAuth ${tok}` };
  const proof = appsecretProof(tok, o.appSecret);
  const me = await goiJson(`${g}/me?${new URLSearchParams({ fields: "id,name", appsecret_proof: proof })}`, { tieuDe: hdr, hanMs: o.hanMs }, phanLoaiLoiGraph, "Meta");
  if (!me.ok) return me;
  const m = me.giaTri as { id?: unknown; name?: unknown };
  if (typeof m.id !== "string") return { ok: false, loai: "PERMANENT", ma: "meta-khong-co-nguoi", thongBao: "Meta không trả mã người dùng." };
  const pq = await goiJson(`${g}/me/permissions?${new URLSearchParams({ appsecret_proof: proof })}`, { tieuDe: hdr, hanMs: o.hanMs }, phanLoaiLoiGraph, "Meta");
  const daCap = new Set(pq.ok ? (((pq.giaTri as { data?: unknown }).data ?? []) as { permission?: unknown; status?: unknown }[]).filter((x) => x.status === "granted").map((x) => String(x.permission)) : []);
  const quyenThieu = pq.ok ? QUYEN_XIN.META.filter((q) => q.batBuoc && !daCap.has(q.ma)).map((q) => q.ma) : [];
  const ac = await goiJson(`${g}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,tasks,instagram_business_account{id,username,name}", limit: "100", appsecret_proof: proof })}`, { tieuDe: hdr, hanMs: o.hanMs }, phanLoaiLoiGraph, "Meta");
  if (!ac.ok) return ac;
  const pages: PageMeta[] = [];
  for (const p of ((ac.giaTri as { data?: unknown }).data ?? []) as Record<string, unknown>[]) {
    if (typeof p.id !== "string" || typeof p.access_token !== "string") continue;
    const ig = p.instagram_business_account as { id?: unknown; username?: unknown; name?: unknown } | undefined;
    pages.push({
      id: p.id,
      ten: typeof p.name === "string" ? cauLoiGon(p.name, 150) : p.id,
      accessToken: p.access_token,
      tasks: Array.isArray(p.tasks) ? (p.tasks as unknown[]).map(String) : [],
      instagram: ig && typeof ig.id === "string" ? { id: ig.id, username: typeof ig.username === "string" ? ig.username : null, ten: typeof ig.name === "string" ? cauLoiGon(ig.name, 150) : null } : null,
    });
  }
  const giay = Number(dai.expires_in ?? 0);
  return { ok: true, giaTri: { userId: m.id, tenNguoi: typeof m.name === "string" ? cauLoiGon(m.name, 150) : null, hetHanUserToken: giay > 0 ? new Date(o.bayGio.getTime() + giay * 1000) : null, quyenThieu, pages } };
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

export interface TokenGoogle {
  accessToken: string;
  refreshToken: string | null;
  hetHan: Date;
  scope: string[];
}

function docTokenGoogle(j: unknown, bayGio: Date): TokenGoogle | null {
  const t = (j ?? {}) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown };
  if (typeof t.access_token !== "string") return null;
  const giay = Math.max(60, Number(t.expires_in ?? 3600));
  return { accessToken: t.access_token, refreshToken: typeof t.refresh_token === "string" ? t.refresh_token : null, hetHan: new Date(bayGio.getTime() + giay * 1000), scope: typeof t.scope === "string" ? t.scope.split(/\s+/).filter(Boolean) : [] };
}

export async function doiMaGoogle(o: { clientId: string; clientSecret: string; redirectUri: string; code: string; hanMs: number; bayGio: Date }): Promise<KetQuaOAuth<TokenGoogle>> {
  const r = await goiJson(`${gocApi().googleOAuth}/token`, {
    phuongThuc: "POST",
    tieuDe: { "Content-Type": "application/x-www-form-urlencoded" },
    than: new URLSearchParams({ code: o.code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: "authorization_code" }).toString(),
    hanMs: o.hanMs,
  }, phanLoaiLoiGoogle, "Google");
  if (!r.ok) return r;
  const t = docTokenGoogle(r.giaTri, o.bayGio);
  if (!t) return { ok: false, loai: "PERMANENT", ma: "google-khong-co-token", thongBao: "Google không trả access token." };
  return { ok: true, giaTri: t };
}

export async function lamMoiTokenGoogle(o: { clientId: string; clientSecret: string; refreshToken: string; hanMs: number; bayGio: Date }): Promise<KetQuaOAuth<TokenGoogle>> {
  const r = await goiJson(`${gocApi().googleOAuth}/token`, {
    phuongThuc: "POST",
    tieuDe: { "Content-Type": "application/x-www-form-urlencoded" },
    than: new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, refresh_token: o.refreshToken, grant_type: "refresh_token" }).toString(),
    hanMs: o.hanMs,
  }, phanLoaiLoiGoogle, "Google");
  if (!r.ok) return r;
  const t = docTokenGoogle(r.giaTri, o.bayGio);
  if (!t) return { ok: false, loai: "RETRYABLE", ma: "google-khong-co-token", thongBao: "Google không trả access token mới." };
  return { ok: true, giaTri: { ...t, refreshToken: t.refreshToken ?? o.refreshToken } };
}

export interface KenhYoutube {
  id: string;
  ten: string;
  customUrl: string | null;
}

export async function kenhYoutubeCuaToi(accessToken: string, hanMs: number): Promise<KetQuaOAuth<KenhYoutube[]>> {
  const r = await goiJson(`${gocApi().googleApis}/youtube/v3/channels?part=snippet&mine=true&maxResults=50`, { tieuDe: { Authorization: `Bearer ${accessToken}` }, hanMs }, phanLoaiLoiGoogle, "YouTube");
  if (!r.ok) return r;
  const ds = (((r.giaTri as { items?: unknown }).items ?? []) as { id?: unknown; snippet?: { title?: unknown; customUrl?: unknown } }[])
    .filter((k) => typeof k.id === "string")
    .map((k) => ({ id: String(k.id), ten: cauLoiGon(String(k.snippet?.title ?? k.id), 150), customUrl: typeof k.snippet?.customUrl === "string" ? k.snippet.customUrl : null }));
  return { ok: true, giaTri: ds };
}

/**
 * Kiểm access token do trình duyệt đưa lên (Google Picker): phải cấp cho ĐÚNG OAuth client của doanh nghiệp (aud / azp),
 * có quyền drive.file, còn hạn — chống đưa token của ứng dụng khác vào (confused deputy). Không cần Client Secret.
 */
export async function kiemTokenPicker(accessToken: string, clientId: string, hanMs: number): Promise<KetQuaOAuth<{ conLaiGiay: number }>> {
  const r = await goiJson(`${gocApi().googleOAuth}/tokeninfo?${new URLSearchParams({ access_token: accessToken })}`, { hanMs }, phanLoaiLoiGoogle, "Google");
  if (!r.ok) return { ok: false, loai: r.loai === "RETRYABLE" ? "RETRYABLE" : "PERMANENT", ma: r.ma, thongBao: "Google không xác nhận được quyền chọn tệp (token hết hạn?). Bấm lại “Chọn từ Google Drive”." };
  const t = r.giaTri as { aud?: unknown; azp?: unknown; scope?: unknown; expires_in?: unknown };
  if (t.aud !== clientId && t.azp !== clientId) return { ok: false, loai: "PERMANENT", ma: "picker-sai-client", thongBao: "Token không cấp cho ứng dụng Cowork của doanh nghiệp — từ chối." };
  const scope = typeof t.scope === "string" ? t.scope.split(/\s+/) : [];
  if (!scope.includes("https://www.googleapis.com/auth/drive.file")) return { ok: false, loai: "PERMANENT", ma: "picker-thieu-quyen", thongBao: "Token không có quyền drive.file." };
  const con = Number(t.expires_in ?? 0);
  if (!(con > 0)) return { ok: false, loai: "PERMANENT", ma: "picker-het-han", thongBao: "Token đã hết hạn — bấm lại “Chọn từ Google Drive”." };
  return { ok: true, giaTri: { conLaiGiay: con } };
}
