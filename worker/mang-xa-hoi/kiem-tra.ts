import { voiTenant } from "../../src/lib/db";
import { ghiKiemToan } from "../../src/lib/kiem-toan";
import { aadApp, aadKenh } from "../../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { docCauHinhMxh } from "../../src/modules/mang-xa-hoi/chung";
import { layConnector } from "../../src/modules/mang-xa-hoi/connectors/danh-muc";
import type { ThongTinXacThuc } from "../../src/modules/mang-xa-hoi/connectors/kieu";
import { GRAPH_VERSION_MAC_DINH, type NhaCungCapApp } from "../../src/modules/mang-xa-hoi/hang-so";
import { BIEN_MOI_TRUONG, kiemDinhDang, kiemTraAppMeta } from "../../src/modules/mang-xa-hoi/nen-tang-app";
import { moNiemPhong } from "./giai-ma";

/**
 * Việc "kiểm tra lại" cần mở niêm phong — chỉ chạy ở worker (SEC-06): kênh đã lưu (mật khẩu ứng dụng WordPress) và
 * thông tin app đã lưu (App Secret Meta). Người dùng bấm nút → route đặt `check_requested_at` → vòng worker (15 giây) xử lý.
 */

export async function kiemTraKenhDaXep(tenantId: string, bayGio: Date, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const ds = await voiTenant(tenantId, async (tx) => ({
    kenh: await tx.socialConnection.findMany({ where: { checkRequestedAt: { not: null }, disconnectedAt: null }, include: { credential: true }, take: 10 }),
    hanMs: (await docCauHinhMxh(tx)).hanGoiMs,
  }));
  let dem = 0;
  for (const k of ds.kenh) {
    const c = layConnector(k.platform);
    let ok = false;
    let thongBao = "Nền tảng chưa được hỗ trợ.";
    let canNhapLai = false;
    let meta: Record<string, unknown> | null = null;
    if (c && k.credential) {
      try {
        const xt = JSON.parse(moNiemPhong(k.credential, aadKenh(tenantId, k.id), env)) as ThongTinXacThuc;
        const kq = await c.kiemTraKetNoi({ id: k.id, diaChi: k.externalId, tenDangNhap: k.accountName, meta: (k.meta ?? {}) as Record<string, unknown> }, xt, { hanMs: ds.hanMs });
        ok = kq.ok;
        thongBao = kq.thongBao;
        canNhapLai = kq.loai === "NEEDS_REAUTH";
        if (kq.ok) meta = { ...((k.meta ?? {}) as object), ...kq.meta };
      } catch (e) {
        thongBao = e instanceof Error && e.name === "LoiKhoaChuMxh" ? e.message : "Không mở được bí mật của kênh (SOCIAL_MASTER_KEY không khớp lúc lưu?).";
      }
    } else if (!k.credential) thongBao = "Kênh chưa có mật khẩu ứng dụng — nhập lại.";
    await voiTenant(tenantId, async (tx) => {
      await tx.socialConnection.update({
        where: { id: k.id },
        data: {
          checkRequestedAt: null, lastCheckedAt: bayGio, lastCheckOk: ok, lastCheckMessage: thongBao,
          ...(ok ? { status: "ACTIVE", ...(meta ? { meta: meta as object } : {}) } : canNhapLai || !k.credential ? { status: "NEEDS_REAUTH" } : {}),
        },
      });
      await ghiKiemToan(tx, { action: "kiem-tra-kenh-mxh", objectType: "social_connection", objectId: k.id, after: { dat: ok, boi: "worker" } });
    });
    dem++;
  }
  return dem;
}

/**
 * Thông tin app một nền tảng cho connector (0.24 dùng): bí mật đã lưu trên màn hình (mở niêm phong), không có thì biến môi
 * trường máy chủ (dự phòng). Chỉ worker gọi.
 */
export async function docThongTinApp(tenantId: string, ncc: NhaCungCapApp, env: NodeJS.ProcessEnv = process.env): Promise<{ nguon: "man-hinh" | "may-chu"; cong: Record<string, string>; biMat: string } | null> {
  const d = await voiTenant(tenantId, (tx) => tx.socialAppConfig.findFirst({ where: { provider: ncc } }));
  const cong = (d?.publicConfig ?? {}) as Record<string, string>;
  if (d?.ciphertext && d.iv && d.authTag && d.wrappedKey && d.keyVersion) {
    const biMat = moNiemPhong({ ciphertext: d.ciphertext, iv: d.iv, authTag: d.authTag, wrappedKey: d.wrappedKey, keyVersion: d.keyVersion }, aadApp(tenantId, ncc), env);
    return { nguon: "man-hinh", cong, biMat };
  }
  const b = BIEN_MOI_TRUONG[ncc];
  if (env[b.ma]?.trim() && env[b.biMat]?.trim()) {
    return { nguon: "may-chu", cong: ncc === "GOOGLE" ? { clientId: env[b.ma]!.trim() } : { appId: env[b.ma]!.trim(), ...(ncc === "META" ? { graphVersion: cong.graphVersion || GRAPH_VERSION_MAC_DINH } : {}) }, biMat: env[b.biMat]!.trim() };
  }
  return null;
}

export async function kiemTraAppDaXep(tenantId: string, bayGio: Date, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const ds = await voiTenant(tenantId, async (tx) => ({
    dong: await tx.socialAppConfig.findMany({ where: { checkRequestedAt: { not: null } }, take: 5 }),
    hanMs: (await docCauHinhMxh(tx)).hanGoiMs,
  }));
  for (const d of ds.dong) {
    const ncc = d.provider as NhaCungCapApp;
    let kq: { trangThai: string; thongBao: string };
    try {
      const tt = await docThongTinApp(tenantId, ncc, env);
      if (!tt || tt.nguon !== "man-hinh") kq = { trangThai: "loi", thongBao: "Chưa lưu đủ thông tin app." };
      else if (ncc === "META") kq = await kiemTraAppMeta(tt.cong.appId ?? "", tt.biMat, tt.cong.graphVersion || GRAPH_VERSION_MAC_DINH, ds.hanMs);
      else {
        const loi = kiemDinhDang(ncc, tt.cong, tt.biMat);
        kq = loi ? { trangThai: "loi", thongBao: loi } : { trangThai: "chi-dinh-dang", thongBao: "Định dạng đúng — kiểm thật khi kết nối kênh đầu tiên." };
      }
    } catch (e) {
      kq = { trangThai: "loi", thongBao: e instanceof Error && e.name === "LoiKhoaChuMxh" ? e.message : "Không mở được bí mật đã lưu (SOCIAL_MASTER_KEY không khớp lúc lưu?)." };
    }
    await voiTenant(tenantId, async (tx) => {
      await tx.socialAppConfig.update({ where: { id: d.id }, data: { checkRequestedAt: null, checkStatus: kq.trangThai, checkMessage: kq.thongBao, checkedAt: bayGio } });
      await ghiKiemToan(tx, { action: "kiem-tra-app-mxh", objectType: "social_app_config", after: { nenTang: ncc, ketQua: kq.trangThai, boi: "worker" } });
    });
  }
  return ds.dong.length;
}
