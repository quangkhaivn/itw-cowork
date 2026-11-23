import { GRAPH_VERSION_MAC_DINH } from "../hang-so";
import { kiemTheoNenTang, type KieuNoiDung } from "../luat-nen-tang";
import { appsecretProof, chuanHoaDoiSoat, phanLoaiLoiGraph } from "../oauth-thuan";
import { doiBuocCuoi, goiNenTang, nguMacDinh, type KetQuaGoi } from "./goi-chung";
import { gocApi } from "./goc-api";
import type { BoiCanhGoi, BuocGoi, KetQuaDang, KetQuaDoiSoat, KetQuaKiemTra, KetQuaXacMinh, NoiDungDang, SocialConnector, ThongTinXacThuc } from "./kieu";

/**
 * Connector Instagram (0.24.0, QĐ-211) — Instagram Graph API qua Facebook Login (tài khoản chuyên nghiệp gắn Page,
 * dùng page access token).
 *
 * Luồng: đọc `content_publishing_limit` → tạo container (`POST /{ig}/media` với `image_url` / `video_url` = LINK KÝ trên
 * tên miền Cowork, QĐ-198) → hỏi `status_code` tới khi FINISHED (chưa xong sau vài lần hỏi thì HOÃN lượt, giữ mã
 * container) → `POST /{ig}/media_publish creation_id` → đọc lại `permalink`.
 * Carousel: từng ảnh một container `is_carousel_item=true` → container cha `media_type=CAROUSEL children=…`.
 * Reels: `media_type=REELS video_url=… share_to_feed=true`.
 * Đối soát: container đã PUBLISHED → tìm media theo chú thích + mốc thời gian (Instagram không có slug).
 *
 * CHƯA KIỂM VỚI API THẬT: tên trường `content_publishing_limit` (config.quota_total / quota_usage), các giá trị
 * status_code (IN_PROGRESS / FINISHED / ERROR / EXPIRED / PUBLISHED), giới hạn 100 hay 50 bài / 24 giờ (đọc lúc chạy).
 */

const TEN = "Instagram";
const SO_LAN_HOI = 5;
const CACH_HOI_MS = 2_000;

function v(bc: BoiCanhGoi) {
  return bc.app?.graphVersion || GRAPH_VERSION_MAC_DINH;
}

async function graph(nhatKy: BuocGoi[], kieu: BuocGoi["kieu"], laGhi: boolean, xt: ThongTinXacThuc, bc: BoiCanhGoi, o: { duong: string; query?: Record<string, string>; form?: Record<string, string> }): Promise<KetQuaGoi> {
  const p = new URLSearchParams(o.query ?? {});
  if (bc.app?.appSecret && xt.accessToken) p.set("appsecret_proof", appsecretProof(xt.accessToken, bc.app.appSecret));
  const qs = p.toString();
  return goiNenTang(nhatKy, kieu, laGhi, {
    url: `${gocApi().graph}/${v(bc)}/${o.duong}${qs ? `?${qs}` : ""}`,
    phuongThuc: o.form ? "POST" : "GET",
    tieuDe: { Authorization: `OAuth ${xt.accessToken ?? ""}`, ...(o.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    than: o.form ? new URLSearchParams(o.form).toString() : undefined,
    hanMs: bc.hanMs,
  }, phanLoaiLoiGraph, TEN);
}

function loi(nhatKy: BuocGoi[], mediaDaTai: Record<string, string>, r: Extract<KetQuaGoi, { ok: false }>, tienTo = ""): KetQuaDang {
  return { ok: false, mediaDaTai, nhatKy, loai: r.loai, ma: `${tienTo}${r.ma}`, thongBao: r.thongBao, httpStatus: r.httpStatus, ...(r.hoanMs !== undefined ? { hoanMs: r.hoanMs } : {}) };
}

function chonKieu(nd: NoiDungDang): KieuNoiDung {
  if (nd.kieu && nd.kieu.startsWith("ig-")) return nd.kieu;
  if (nd.media.some((m) => m.mime.startsWith("video/"))) return "ig-reels";
  return nd.media.length > 1 ? "ig-carousel" : "ig-anh";
}

type TrangThaiContainer = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED" | "KHAC";

async function hoiContainer(nhatKy: BuocGoi[], xt: ThongTinXacThuc, bc: BoiCanhGoi, id: string, soLan = SO_LAN_HOI): Promise<{ tt: TrangThaiContainer; loi?: Extract<KetQuaGoi, { ok: false }>; chiTiet?: string }> {
  const ngu = bc.ngu ?? nguMacDinh;
  for (let i = 0; i < soLan; i++) {
    await bc.giuKhoa?.();
    const r = await graph(nhatKy, "media", false, xt, bc, { duong: id, query: { fields: "status_code,status" } });
    if (!r.ok) return { tt: "KHAC", loi: r };
    const j = (r.j ?? {}) as { status_code?: unknown; status?: unknown };
    const tt = String(j.status_code ?? "");
    if (tt === "FINISHED" || tt === "ERROR" || tt === "EXPIRED" || tt === "PUBLISHED") return { tt, chiTiet: typeof j.status === "string" ? j.status : undefined };
    if (i < soLan - 1) await ngu(CACH_HOI_MS);
  }
  return { tt: "IN_PROGRESS" };
}

export const instagram: SocialConnector = {
  nenTang: "INSTAGRAM",

  khaNang() {
    return { kieuNoiDung: ["anh", "video"], media: "pull", soAnhToiDa: 10, doDaiTieuDeToiDa: null, doDaiNoiDungToiDa: 2_200, canTieuDe: false };
  },

  validate(nd, mt) {
    return kiemTheoNenTang("INSTAGRAM", nd, mt).viPham;
  },

  async kiemTraKetNoi(kenh, xt, bc): Promise<KetQuaKiemTra> {
    const nhatKy: BuocGoi[] = [];
    const r = await graph(nhatKy, "check", false, xt, bc, { duong: kenh.diaChi, query: { fields: "id,username,name" } });
    if (!r.ok) return { ok: false, thongBao: r.thongBao, loai: r.loai, meta: {} };
    const p = (r.j ?? {}) as { id?: unknown; username?: unknown };
    if (String(p.id) !== kenh.diaChi) return { ok: false, thongBao: "Instagram trả về tài khoản khác với tài khoản đã nối.", loai: "PERMANENT", meta: {} };
    return { ok: true, thongBao: `Kết nối tốt — Instagram @${String(p.username ?? "")}.`, loai: null, meta: { tenHienThi: typeof p.username === "string" ? `@${p.username}` : null, username: p.username ?? null } };
  },

  async publish(kenh, xt, nd, bc): Promise<KetQuaDang> {
    const nhatKy: BuocGoi[] = [];
    const mediaDaTai = { ...nd.mediaDaTai };
    const kieu = chonKieu(nd);
    if (!bc.linkMedia) {
      return { ok: false, mediaDaTai, nhatKy, loai: "PERMANENT", ma: "can-https", thongBao: "Instagram cần Cowork chạy ở địa chỉ https công khai (APP_URL bắt đầu bằng https://).", httpStatus: null };
    }
    const thu = bc.linkMedia(nd.media[0]?.attachmentId ?? "00000000-0000-4000-8000-000000000000", false);
    if (!/^https:\/\//.test(thu)) {
      return { ok: false, mediaDaTai, nhatKy, loai: "PERMANENT", ma: "can-https", thongBao: "Instagram cần Cowork chạy ở địa chỉ https công khai (APP_URL bắt đầu bằng https://) — Instagram tải ảnh / video từ link trên tên miền Cowork.", httpStatus: null };
    }

    // Hạn mức đăng / 24 giờ — đọc lúc chạy (tài liệu ghi 100, có chỗ ghi 50; không đoán).
    if (!mediaDaTai.__igContainer) {
      const h = await graph(nhatKy, "check", false, xt, bc, { duong: `${kenh.diaChi}/content_publishing_limit`, query: { fields: "config,quota_usage" } });
      if (!h.ok) return loi(nhatKy, mediaDaTai, h, "han-muc-");
      const d = (((h.j as { data?: unknown } | undefined)?.data ?? []) as { quota_usage?: unknown; config?: { quota_total?: unknown } }[])[0] ?? {};
      const dung = Number(d.quota_usage ?? 0);
      const tong = Number(d.config?.quota_total ?? 0);
      if (tong > 0 && dung >= tong) {
        return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "ig-het-han-muc", thongBao: `Instagram: đã đăng ${dung}/${tong} bài trong 24 giờ qua qua API — hoãn 1 giờ rồi thử lại.`, httpStatus: h.ph.status, hoanMs: 3_600_000 };
      }
    }

    let container = mediaDaTai.__igContainer;
    if (!container) {
      const form: Record<string, string> = { caption: nd.noiDung };
      if (kieu === "ig-reels") {
        const vd = nd.media.find((m) => m.mime.startsWith("video/"))!;
        Object.assign(form, { media_type: "REELS", video_url: bc.linkMedia(vd.attachmentId, false), share_to_feed: "true" });
      } else if (kieu === "ig-carousel") {
        const con: string[] = [];
        for (const a of nd.media) {
          let id = mediaDaTai[a.attachmentId];
          if (!id) {
            const r = await graph(nhatKy, "media", false, xt, bc, { duong: `${kenh.diaChi}/media`, form: { image_url: bc.linkMedia(a.attachmentId, a.mime !== "image/jpeg"), is_carousel_item: "true" } });
            if (!r.ok) return loi(nhatKy, mediaDaTai, { ...r, loai: r.loai === "UNKNOWN" ? "RETRYABLE" : r.loai }, "anh-");
            const cid = (r.j as { id?: unknown } | undefined)?.id;
            if (typeof cid !== "string") return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "anh-khong-co-ma", thongBao: "Instagram không trả mã container ảnh.", httpStatus: r.ph.status };
            id = cid;
            mediaDaTai[a.attachmentId] = id;
          }
          con.push(id);
        }
        for (const id of con) {
          const h = await hoiContainer(nhatKy, xt, bc, id);
          if (h.loi) return loi(nhatKy, mediaDaTai, h.loi);
          if (h.tt === "ERROR" || h.tt === "EXPIRED") {
            for (const a of nd.media) if (mediaDaTai[a.attachmentId] === id) delete mediaDaTai[a.attachmentId];
            return { ok: false, mediaDaTai, nhatKy, loai: h.tt === "EXPIRED" ? "RETRYABLE" : "PERMANENT", ma: `ig-anh-${h.tt.toLowerCase()}`, thongBao: `Instagram không nhận một ảnh của carousel${h.chiTiet ? ` (${h.chiTiet})` : ""}.`, httpStatus: null };
          }
          if (h.tt !== "FINISHED") return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "ig-dang-xu-ly", thongBao: "Instagram đang xử lý ảnh — hoãn 30 giây.", httpStatus: null, hoanMs: 30_000 };
        }
        Object.assign(form, { media_type: "CAROUSEL", children: con.join(",") });
      } else {
        const a = nd.media[0];
        form.image_url = bc.linkMedia(a.attachmentId, a.mime !== "image/jpeg");
      }
      const r = await graph(nhatKy, "media", false, xt, bc, { duong: `${kenh.diaChi}/media`, form });
      // Tạo container chưa đăng gì: hỏng giữa chừng thì tạo lại được (chỉ thêm container rác) → thử lại.
      if (!r.ok) return loi(nhatKy, mediaDaTai, { ...r, loai: r.loai === "UNKNOWN" ? "RETRYABLE" : r.loai }, "container-");
      const id = (r.j as { id?: unknown } | undefined)?.id;
      if (typeof id !== "string") return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "container-khong-co-ma", thongBao: "Instagram không trả mã container.", httpStatus: r.ph.status };
      container = id;
      mediaDaTai.__igContainer = id;
    }

    const h = await hoiContainer(nhatKy, xt, bc, container);
    if (h.loi) return loi(nhatKy, mediaDaTai, h.loi);
    if (h.tt === "IN_PROGRESS") return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "ig-dang-xu-ly", thongBao: "Instagram đang xử lý media — hoãn 30 giây rồi hỏi lại (không tính lần thử).", httpStatus: null, hoanMs: 30_000 };
    if (h.tt === "EXPIRED") {
      delete mediaDaTai.__igContainer;
      return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "ig-container-het-han", thongBao: "Container Instagram hết hạn (quá 24 giờ chưa đăng) — tạo lại ở lần sau.", httpStatus: null };
    }
    if (h.tt === "ERROR") {
      delete mediaDaTai.__igContainer;
      return { ok: false, mediaDaTai, nhatKy, loai: "PERMANENT", ma: "ig-container-loi", thongBao: `Instagram không nhận media${h.chiTiet ? `: ${h.chiTiet}` : ""}. Kiểm định dạng (JPEG, tỉ lệ 4:5 → 1,91:1; video H.264) rồi đăng lại.`, httpStatus: null };
    }
    if (h.tt === "PUBLISHED") {
      // Lượt trước đã đăng xong mà không nhận được mã → đối soát tìm media.
      return { ok: false, mediaDaTai, nhatKy, loai: "UNKNOWN", ma: "ig-da-dang-truoc", thongBao: "Container đã được đăng ở lượt trước — đang đối soát.", httpStatus: null };
    }
    const p = await graph(nhatKy, "publish", true, xt, bc, { duong: `${kenh.diaChi}/media_publish`, form: { creation_id: container } });
    if (!p.ok) return loi(nhatKy, mediaDaTai, p);
    const id = (p.j as { id?: unknown } | undefined)?.id;
    if (typeof id !== "string") {
      doiBuocCuoi(nhatKy, { ketQua: "unknown", loaiLoi: "UNKNOWN", thongBao: "Phản hồi thành công nhưng không có mã media." });
      return { ok: false, mediaDaTai, nhatKy, loai: "UNKNOWN", ma: "khong-co-ma-bai", thongBao: "Instagram trả lời thành công nhưng không có mã media — đang đối soát.", httpStatus: p.ph.status };
    }
    return { ok: true, externalId: id, url: null, mediaDaTai, nhatKy };
  },

  async verify(_kenh, xt, externalId, _nd, bc): Promise<KetQuaXacMinh> {
    const nhatKy: BuocGoi[] = [];
    if (!/^\d+$/.test(externalId)) return { ok: false, khongThay: true, nhatKy, loai: "PERMANENT", ma: "ma-sai", thongBao: "Mã media không hợp lệ.", httpStatus: null };
    const r = await graph(nhatKy, "verify", false, xt, bc, { duong: externalId, query: { fields: "id,permalink,media_type,timestamp" } });
    if (!r.ok) {
      const khongThay = r.httpStatus === 404 || r.ma.startsWith("graph-100");
      return { ok: false, khongThay, nhatKy, loai: khongThay ? "PERMANENT" : r.loai, ma: r.ma, thongBao: khongThay ? "Đọc lại không thấy bài trên Instagram." : r.thongBao, httpStatus: r.httpStatus };
    }
    const b = (r.j ?? {}) as { id?: unknown; permalink?: unknown };
    if (String(b.id) !== externalId || typeof b.permalink !== "string" || !/^https:\/\//.test(b.permalink)) {
      doiBuocCuoi(nhatKy, { ketQua: "retryable", loaiLoi: "RETRYABLE", thongBao: "Chưa có permalink." });
      return { ok: false, khongThay: false, nhatKy, loai: "RETRYABLE", ma: "khong-co-permalink", thongBao: "Instagram chưa trả đường dẫn bài.", httpStatus: r.ph.status };
    }
    return { ok: true, externalId, url: b.permalink, nhatKy };
  },

  async reconcile(kenh, xt, _khoa, bc, nd): Promise<KetQuaDoiSoat> {
    const nhatKy: BuocGoi[] = [];
    const container = nd?.mediaDaTai?.__igContainer;
    if (container) {
      const h = await hoiContainer(nhatKy, xt, bc, container, 1);
      if (h.loi && !(h.loi.httpStatus === 404)) return { ok: false, nhatKy, loai: h.loi.loai, ma: h.loi.ma, thongBao: h.loi.thongBao, httpStatus: h.loi.httpStatus };
      // Container chưa được đăng → chắc chắn chưa có bài; đăng lại bằng chính container này (không sinh trùng).
      if (h.tt !== "PUBLISHED") {
        doiBuocCuoi(nhatKy, { kieu: "reconcile", ketQua: "not_found" });
        return { ok: true, externalId: null, nhatKy };
      }
    }
    const r = await graph(nhatKy, "reconcile", false, xt, bc, { duong: `${kenh.diaChi}/media`, query: { fields: "id,caption,timestamp", limit: "25" } });
    if (!r.ok) return { ok: false, nhatKy, loai: r.loai, ma: r.ma, thongBao: r.thongBao, httpStatus: r.httpStatus };
    const ds = ((r.j as { data?: unknown } | undefined)?.data ?? []) as { id?: unknown; caption?: unknown; timestamp?: unknown }[];
    const moc = nd?.batDauLuot ? nd.batDauLuot.getTime() - 10 * 60_000 : 0;
    const can = chuanHoaDoiSoat(nd?.noiDung);
    const thay = Array.isArray(ds) ? ds.find((b) => typeof b.id === "string" && chuanHoaDoiSoat(String(b.caption ?? "")) === can && (!moc || Date.parse(String(b.timestamp)) >= moc)) : undefined;
    doiBuocCuoi(nhatKy, { ketQua: thay ? "found" : "not_found" });
    return { ok: true, externalId: thay ? String(thay.id) : null, nhatKy };
  },
};

