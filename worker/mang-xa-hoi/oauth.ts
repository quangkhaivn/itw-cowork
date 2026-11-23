import { voiTenant } from "../../src/lib/db";
import { ghiKiemToan } from "../../src/lib/kiem-toan";
import { aadKenh, aadOAuth } from "../../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { niemPhong } from "../../src/modules/mang-xa-hoi/bao-mat/niem-phong";
import { docCauHinhMxh } from "../../src/modules/mang-xa-hoi/chung";
import { doiMaGoogle, doiMaMeta, kenhYoutubeCuaToi } from "../../src/modules/mang-xa-hoi/connectors/oauth-mang";
import { GRAPH_VERSION_MAC_DINH } from "../../src/modules/mang-xa-hoi/hang-so";
import { QUYEN_XIN } from "../../src/modules/mang-xa-hoi/oauth-thuan";
import { cauLoiGon } from "../../src/modules/mang-xa-hoi/tinh-toan";
import { moNiemPhong } from "./giai-ma";
import { docThongTinApp } from "./kiem-tra";

/**
 * Worker: đổi mã OAuth lấy token (0.24.0, QĐ-203) — cần App Secret / Client Secret nên CHỈ chạy ở đây (SEC-06).
 *
 * Yêu cầu CHO_DOI_MA (callback đã niêm phong mã) → mở mã → đổi token → lấy Page + Instagram (Meta) / kênh YouTube
 * (Google) → mỗi kênh tìm được một dòng "chờ chọn", token niêm phong với AAD của kênh SẼ tạo (kênh đã nối thì dùng lại
 * mã kênh cũ — kết nối lại). Xong xóa mã (dùng một lần). Hỏng → LOI kèm lời giải thích.
 */

const HAN_DOI_MA_MS = 10 * 60_000;
const HAN_CHON_MS = 30 * 60_000;

interface UngVien {
  platform: "FACEBOOK_PAGE" | "INSTAGRAM" | "YOUTUBE";
  externalId: string;
  name: string;
  meta: Record<string, unknown>;
  banRo: string;
  tokenExpiresAt: Date | null;
}

export async function doiMaOAuthDaXep(tenantId: string, bayGio: Date, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const ds = await voiTenant(tenantId, async (tx) => ({
    yc: await tx.socialOauthRequest.findMany({ where: { status: "CHO_DOI_MA" }, take: 5, orderBy: { callbackAt: "asc" } }),
    hanMs: (await docCauHinhMxh(tx)).hanGoiMs,
  }));
  let dem = 0;
  for (const yc of ds.yc) {
    dem++;
    const loi = async (thongBao: string) => {
      await voiTenant(tenantId, async (tx) => {
        await tx.socialOauthRequest.updateMany({ where: { id: yc.id, status: "CHO_DOI_MA" }, data: { status: "LOI", errorMessage: thongBao, ciphertext: null, iv: null, authTag: null, wrappedKey: null, keyVersion: null, exchangedAt: bayGio } });
        await ghiKiemToan(tx, { action: "doi-ma-oauth", objectType: "social_oauth_request", objectId: yc.id, after: { nenTang: yc.provider, ketQua: "loi", lyDo: thongBao.slice(0, 200), boi: "worker" } });
      });
    };
    if (!yc.callbackAt || yc.callbackAt.getTime() + HAN_DOI_MA_MS < bayGio.getTime()) {
      await loi("Mã cấp quyền đã quá hạn trước khi đổi được — bắt đầu kết nối lại.");
      continue;
    }
    if (!yc.ciphertext || !yc.iv || !yc.authTag || !yc.wrappedKey || !yc.keyVersion) {
      await loi("Thiếu mã cấp quyền.");
      continue;
    }
    let code: string;
    let app: Awaited<ReturnType<typeof docThongTinApp>>;
    try {
      code = moNiemPhong({ ciphertext: yc.ciphertext, iv: yc.iv, authTag: yc.authTag, wrappedKey: yc.wrappedKey, keyVersion: yc.keyVersion }, aadOAuth(tenantId, yc.id), env);
      app = await docThongTinApp(tenantId, yc.provider as "META" | "GOOGLE", env);
    } catch (e) {
      await loi(e instanceof Error && e.name === "LoiKhoaChuMxh" ? e.message : "Không mở được mã / thông tin app (SOCIAL_MASTER_KEY không khớp?).");
      continue;
    }
    if (!app) {
      await loi("Chưa có thông tin app — Giám đốc / Quản trị nhập ở Quản trị → Kết nối nền tảng (API).");
      continue;
    }

    const uv: UngVien[] = [];
    let subject = "";
    let taiKhoan: string | null = null;
    let quyenThieu: string[] = [];
    if (yc.provider === "META") {
      const r = await doiMaMeta({ appId: app.cong.appId ?? "", appSecret: app.biMat, graphVersion: app.cong.graphVersion || GRAPH_VERSION_MAC_DINH, redirectUri: yc.redirectUri, code, hanMs: ds.hanMs, bayGio });
      if (!r.ok) {
        await loi(`Meta không đổi được mã: ${r.thongBao}`);
        continue;
      }
      subject = r.giaTri.userId;
      taiKhoan = r.giaTri.tenNguoi;
      quyenThieu = r.giaTri.quyenThieu;
      for (const p of r.giaTri.pages) {
        const coDang = p.tasks.length === 0 || p.tasks.some((t) => t === "CREATE_CONTENT" || t === "MANAGE");
        uv.push({ platform: "FACEBOOK_PAGE", externalId: p.id, name: p.ten, meta: { metaUserId: subject, tasks: p.tasks, ...(coDang ? {} : { ghiChu: "Tài khoản không có quyền tạo nội dung trên Page này." }) }, banRo: JSON.stringify({ loai: "meta", accessToken: p.accessToken }), tokenExpiresAt: null });
        if (p.instagram) {
          uv.push({ platform: "INSTAGRAM", externalId: p.instagram.id, name: p.instagram.username ? `@${p.instagram.username}` : p.instagram.ten ?? p.instagram.id, meta: { metaUserId: subject, pageId: p.id, username: p.instagram.username, tenHienThi: p.instagram.username ? `@${p.instagram.username}` : null }, banRo: JSON.stringify({ loai: "meta", accessToken: p.accessToken }), tokenExpiresAt: null });
        }
      }
      if (!uv.length) {
        await loi("Tài khoản Facebook này không quản lý Page nào (hoặc chưa tích chọn Page khi cấp quyền). Kết nối lại và chọn Page.");
        continue;
      }
    } else {
      const r = await doiMaGoogle({ clientId: app.cong.clientId ?? "", clientSecret: app.biMat, redirectUri: yc.redirectUri, code, hanMs: ds.hanMs, bayGio });
      if (!r.ok) {
        await loi(`Google không đổi được mã: ${r.thongBao}`);
        continue;
      }
      if (!r.giaTri.refreshToken) {
        await loi("Google không trả refresh token (tài khoản đã cấp quyền trước đó). Vào myaccount.google.com/permissions gỡ quyền “TGTH Cowork” rồi kết nối lại.");
        continue;
      }
      quyenThieu = QUYEN_XIN.GOOGLE.filter((q) => q.batBuoc && !r.giaTri.scope.includes(q.ma)).map((q) => q.ma.replace("https://www.googleapis.com/auth/", ""));
      const k = await kenhYoutubeCuaToi(r.giaTri.accessToken, ds.hanMs);
      if (!k.ok) {
        await loi(`Không đọc được kênh YouTube: ${k.thongBao}`);
        continue;
      }
      if (!k.giaTri.length) {
        await loi("Tài khoản Google này chưa có kênh YouTube — tạo kênh trên youtube.com rồi kết nối lại.");
        continue;
      }
      subject = k.giaTri[0].id;
      taiKhoan = k.giaTri[0].ten;
      const banRo = JSON.stringify({ loai: "google", accessToken: r.giaTri.accessToken, refreshToken: r.giaTri.refreshToken, hetHan: r.giaTri.hetHan.toISOString() });
      for (const c of k.giaTri) uv.push({ platform: "YOUTUBE", externalId: c.id, name: c.ten, meta: { customUrl: c.customUrl, tenHienThi: c.ten }, banRo, tokenExpiresAt: r.giaTri.hetHan });
    }

    await voiTenant(tenantId, async (tx) => {
      for (const u of uv) {
        const daCo = await tx.socialConnection.findFirst({ where: { platform: u.platform, externalId: u.externalId, disconnectedAt: null }, select: { id: true } });
        const connectionId = daCo?.id ?? crypto.randomUUID();
        const bn = niemPhong(u.banRo, aadKenh(tenantId, connectionId), undefined);
        await tx.socialOauthCandidate.create({
          data: { tenantId, requestId: yc.id, platform: u.platform, externalId: u.externalId, name: cauLoiGon(u.name, 200), meta: u.meta as object, connectionId, existing: Boolean(daCo), ...bn, tokenExpiresAt: u.tokenExpiresAt },
        });
      }
      await tx.socialOauthRequest.update({
        where: { id: yc.id },
        data: { status: "DA_SAN_SANG", oauthSubject: subject, accountName: taiKhoan ? cauLoiGon(taiKhoan, 200) : null, missingScopes: quyenThieu, exchangedAt: bayGio, ciphertext: null, iv: null, authTag: null, wrappedKey: null, keyVersion: null },
      });
      await ghiKiemToan(tx, { action: "doi-ma-oauth", objectType: "social_oauth_request", objectId: yc.id, after: { nenTang: yc.provider, ketQua: "ok", soKenh: uv.length, quyenThieu, boi: "worker" } });
    }, { timeoutMs: 30_000 });
  }
  return dem;
}

/** Dọn: state quá hạn chưa dùng → HET_HAN; kênh chờ chọn quá 30 phút → xóa (hủy token). */
export async function donDepOAuth(tenantId: string, bayGio: Date): Promise<void> {
  await voiTenant(tenantId, async (tx) => {
    await tx.socialOauthRequest.updateMany({ where: { status: "CHO_DONG_Y", expiresAt: { lt: bayGio } }, data: { status: "HET_HAN" } });
    const cu = await tx.socialOauthRequest.findMany({ where: { status: "DA_SAN_SANG", exchangedAt: { lt: new Date(bayGio.getTime() - HAN_CHON_MS) } }, select: { id: true } });
    if (cu.length) {
      await tx.socialOauthCandidate.deleteMany({ where: { requestId: { in: cu.map((c) => c.id) } } });
      await tx.socialOauthRequest.updateMany({ where: { id: { in: cu.map((c) => c.id) } }, data: { status: "HET_HAN", errorMessage: "Quá 30 phút chưa chọn kênh." } });
    }
    // Phòng hờ: dòng chờ chọn của yêu cầu đã xong / hỏng.
    await tx.socialOauthCandidate.deleteMany({ where: { request: { status: { in: ["HOAN_TAT", "LOI", "HET_HAN"] } } } });
  });
}
