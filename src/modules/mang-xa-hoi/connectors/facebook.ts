import { GRAPH_VERSION_MAC_DINH } from "../hang-so";
import { kiemTheoNenTang, type KieuNoiDung } from "../luat-nen-tang";
import { appsecretProof, chuanHoaDoiSoat, dungMultipart, phanLoaiLoiGraph } from "../oauth-thuan";
import { doiBuocCuoi, goiNenTang, type KetQuaGoi } from "./goi-chung";
import { gocApi } from "./goc-api";
import type { BoiCanhGoi, BuocGoi, KenhGoi, KetQuaDang, KetQuaDoiSoat, KetQuaKiemTra, KetQuaXacMinh, NoiDungDang, SocialConnector, TepMedia, ThongTinXacThuc } from "./kieu";

/**
 * Connector Facebook Page (0.24.0, QĐ-204) — Graph API, page access token (lấy qua Facebook Login for Business).
 *
 *  - Chữ + liên kết: `POST /{page}/feed { message, link }`.
 *  - Một ảnh: `POST /{page}/photos` multipart `source` + `message` (đẩy byte, không cần URL công khai).
 *  - Nhiều ảnh: từng ảnh `POST /{page}/photos published=false` → `POST /{page}/feed { message, attached_media[i] }`.
 *  - Video: tải theo phần `POST graph-video /{page}/videos upload_phase=start → transfer (từng đoạn) → finish`.
 *  - Reels: `POST /{page}/video_reels upload_phase=start` → `POST rupload.facebook.com/video-upload/{v}/{video_id}`
 *    (transfer, tiêu đề offset / file_size) → `POST /{page}/video_reels upload_phase=finish video_state=PUBLISHED`.
 *  - Xác minh: đọc lại bài (`permalink_url`) / video (`status.video_status`, `permalink_url`).
 *  - Đối soát: video theo mã đã lưu ở lượt trước; bài theo NỘI DUNG + mốc thời gian trong `published_posts` (Facebook
 *    không có slug).
 * Mọi lệnh gọi kèm `appsecret_proof`; token đi trong tiêu đề Authorization, không nằm trong URL.
 *
 * CHƯA KIỂM VỚI API THẬT: tên tham số (message / attached_media / upload_phase / video_state), dạng trả về của
 * start / transfer / finish, trường `status.video_status`, đường `published_posts`, chuỗi permalink tương đối của Reels.
 */

const TEN = "Facebook";

function v(bc: BoiCanhGoi) {
  return bc.app?.graphVersion || GRAPH_VERSION_MAC_DINH;
}

function tieuDe(xt: ThongTinXacThuc): Record<string, string> {
  return { Authorization: `OAuth ${xt.accessToken ?? ""}` };
}

function q(xt: ThongTinXacThuc, bc: BoiCanhGoi, them: Record<string, string> = {}): string {
  const p = new URLSearchParams(them);
  if (bc.app?.appSecret && xt.accessToken) p.set("appsecret_proof", appsecretProof(xt.accessToken, bc.app.appSecret));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function bieuMau(truong: Record<string, string>): { than: string; ct: string } {
  return { than: new URLSearchParams(truong).toString(), ct: "application/x-www-form-urlencoded" };
}

async function graph(nhatKy: BuocGoi[], kieu: BuocGoi["kieu"], laGhi: boolean, xt: ThongTinXacThuc, bc: BoiCanhGoi, o: { duong: string; query?: Record<string, string>; form?: Record<string, string>; multipart?: { than: Buffer; contentType: string }; goc?: string }): Promise<KetQuaGoi> {
  const goc = o.goc ?? gocApi().graph;
  const url = `${goc}/${v(bc)}/${o.duong}${q(xt, bc, o.query)}`;
  const f = o.form ? bieuMau(o.form) : null;
  return goiNenTang(nhatKy, kieu, laGhi, {
    url,
    phuongThuc: o.form || o.multipart ? "POST" : "GET",
    tieuDe: { ...tieuDe(xt), ...(f ? { "Content-Type": f.ct } : {}), ...(o.multipart ? { "Content-Type": o.multipart.contentType } : {}) },
    than: f ? f.than : o.multipart?.than,
    hanMs: bc.hanMs,
  }, phanLoaiLoiGraph, TEN);
}

function loi(nhatKy: BuocGoi[], mediaDaTai: Record<string, string>, r: Extract<KetQuaGoi, { ok: false }>, tienTo = ""): KetQuaDang {
  return { ok: false, mediaDaTai, nhatKy, loai: r.loai, ma: `${tienTo}${r.ma}`, thongBao: r.thongBao, httpStatus: r.httpStatus, ...(r.hoanMs !== undefined ? { hoanMs: r.hoanMs } : {}) };
}

function chonKieu(nd: NoiDungDang): KieuNoiDung {
  if (nd.kieu && nd.kieu.startsWith("fb-")) return nd.kieu;
  const video = nd.media.filter((m) => m.mime.startsWith("video/"));
  if (video.length) return nd.tuyChon?.facebookReels ? "fb-reels" : "fb-video";
  const anh = nd.media.filter((m) => m.mime.startsWith("image/"));
  return anh.length === 0 ? "fb-chu" : anh.length === 1 ? "fb-anh" : "fb-nhieu-anh";
}

function permalink(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  if (/^https:\/\//.test(u)) return u;
  if (u.startsWith("/")) return `https://www.facebook.com${u}`;
  return null;
}

/** Tải video theo phần (start / transfer / finish) lên /{page}/videos. */
async function taiVideo(kenh: KenhGoi, xt: ThongTinXacThuc, nd: NoiDungDang, bc: BoiCanhGoi, nhatKy: BuocGoi[], mediaDaTai: Record<string, string>, vd: TepMedia): Promise<KetQuaDang> {
  const goc = gocApi().graphVideo;
  const noiDung = await vd.docNoiDung();
  let phien = mediaDaTai.__fbPhien;
  let tu = Number(mediaDaTai.__fbTu ?? "0");
  let den = Number(mediaDaTai.__fbDen ?? "0");
  if (!phien) {
    const s = await graph(nhatKy, "media", false, xt, bc, { goc, duong: `${kenh.diaChi}/videos`, form: { upload_phase: "start", file_size: String(noiDung.length) } });
    if (!s.ok) return loi(nhatKy, mediaDaTai, s, "video-");
    const j = (s.j ?? {}) as { upload_session_id?: unknown; video_id?: unknown; start_offset?: unknown; end_offset?: unknown };
    if (typeof j.upload_session_id !== "string" || typeof j.video_id !== "string") return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "video-khong-co-phien", thongBao: "Facebook không trả phiên tải video.", httpStatus: s.ph.status };
    phien = j.upload_session_id;
    tu = Number(j.start_offset ?? 0);
    den = Number(j.end_offset ?? 0);
    Object.assign(mediaDaTai, { __fbPhien: phien, __fbVideoId: j.video_id, __fbTu: String(tu), __fbDen: String(den) });
  }
  let vong = 0;
  while (tu < den && tu < noiDung.length) {
    if (++vong > 2000) break;
    const mp = dungMultipart({ upload_phase: "transfer", upload_session_id: phien, start_offset: String(tu) }, { ten: "video_file_chunk", tenTep: vd.tenTep, mime: "application/octet-stream", noiDung: noiDung.subarray(tu, Math.min(den, noiDung.length)) });
    const t = await graph(nhatKy, "media", false, xt, bc, { goc, duong: `${kenh.diaChi}/videos`, multipart: mp });
    if (!t.ok) {
      // Đoạn hỏng: giữ phiên + vị trí — lượt sau tải tiếp từ đây.
      return loi(nhatKy, mediaDaTai, { ...t, loai: t.loai === "UNKNOWN" ? "RETRYABLE" : t.loai }, "video-");
    }
    const j = (t.j ?? {}) as { start_offset?: unknown; end_offset?: unknown };
    tu = Number(j.start_offset ?? den);
    den = Number(j.end_offset ?? den);
    mediaDaTai.__fbTu = String(tu);
    mediaDaTai.__fbDen = String(den);
  }
  const f = await graph(nhatKy, "publish", true, xt, bc, { goc, duong: `${kenh.diaChi}/videos`, form: { upload_phase: "finish", upload_session_id: phien, description: nd.noiDung, ...(nd.tieuDe ? { title: nd.tieuDe } : {}) } });
  if (!f.ok) return loi(nhatKy, mediaDaTai, f);
  if ((f.j as { success?: unknown } | undefined)?.success !== true) {
    doiBuocCuoi(nhatKy, { ketQua: "unknown", loaiLoi: "UNKNOWN", thongBao: "Kết thúc tải video không báo thành công." });
    return { ok: false, mediaDaTai, nhatKy, loai: "UNKNOWN", ma: "video-finish-khong-ro", thongBao: "Facebook không xác nhận kết thúc tải video — đang đối soát.", httpStatus: f.ph.status };
  }
  return { ok: true, externalId: mediaDaTai.__fbVideoId, url: null, mediaDaTai, nhatKy };
}

/** Reels: start → transfer (rupload) → finish. */
async function taiReels(kenh: KenhGoi, xt: ThongTinXacThuc, nd: NoiDungDang, bc: BoiCanhGoi, nhatKy: BuocGoi[], mediaDaTai: Record<string, string>, vd: TepMedia): Promise<KetQuaDang> {
  let id = mediaDaTai.__fbReelId;
  if (!id) {
    const s = await graph(nhatKy, "media", false, xt, bc, { duong: `${kenh.diaChi}/video_reels`, form: { upload_phase: "start" } });
    if (!s.ok) return loi(nhatKy, mediaDaTai, s, "reels-");
    const vid = (s.j as { video_id?: unknown } | undefined)?.video_id;
    if (typeof vid !== "string" || !/^\d+$/.test(vid)) return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "reels-khong-co-ma", thongBao: "Facebook không trả mã video Reels.", httpStatus: s.ph.status };
    id = vid;
    mediaDaTai.__fbReelId = id;
  }
  if (mediaDaTai.__fbReelDaTai !== "1") {
    const noiDung = await vd.docNoiDung();
    // Không dùng upload_url nền tảng trả về: dựng từ địa chỉ gốc cố định (không gọi URL lạ).
    const t = await goiNenTang(nhatKy, "media", false, {
      url: `${gocApi().rupload}/video-upload/${v(bc)}/${id}`,
      phuongThuc: "POST",
      tieuDe: { ...tieuDe(xt), offset: "0", file_size: String(noiDung.length), "Content-Type": "application/octet-stream" },
      than: noiDung,
      hanMs: Math.max(bc.hanMs, 120_000),
    }, phanLoaiLoiGraph, TEN);
    if (!t.ok) return loi(nhatKy, mediaDaTai, { ...t, loai: t.loai === "UNKNOWN" ? "RETRYABLE" : t.loai }, "reels-");
    mediaDaTai.__fbReelDaTai = "1";
  }
  const f = await graph(nhatKy, "publish", true, xt, bc, { duong: `${kenh.diaChi}/video_reels`, form: { upload_phase: "finish", video_id: id, video_state: "PUBLISHED", description: nd.noiDung } });
  if (!f.ok) return loi(nhatKy, mediaDaTai, f);
  if ((f.j as { success?: unknown } | undefined)?.success !== true) {
    doiBuocCuoi(nhatKy, { ketQua: "unknown", loaiLoi: "UNKNOWN", thongBao: "Kết thúc Reels không báo thành công." });
    return { ok: false, mediaDaTai, nhatKy, loai: "UNKNOWN", ma: "reels-finish-khong-ro", thongBao: "Facebook không xác nhận đăng Reels — đang đối soát.", httpStatus: f.ph.status };
  }
  return { ok: true, externalId: id, url: null, mediaDaTai, nhatKy };
}

export const facebook: SocialConnector = {
  nenTang: "FACEBOOK_PAGE",

  khaNang() {
    return { kieuNoiDung: ["bai-viet", "anh", "video"], media: "push", soAnhToiDa: 10, doDaiTieuDeToiDa: null, doDaiNoiDungToiDa: 63_206, canTieuDe: false };
  },

  validate(nd, mt) {
    return kiemTheoNenTang("FACEBOOK_PAGE", nd, mt).viPham;
  },

  async kiemTraKetNoi(kenh, xt, bc): Promise<KetQuaKiemTra> {
    const nhatKy: BuocGoi[] = [];
    const r = await graph(nhatKy, "check", false, xt, bc, { duong: kenh.diaChi, query: { fields: "id,name,link" } });
    if (!r.ok) return { ok: false, thongBao: r.thongBao, loai: r.loai, meta: {} };
    const p = (r.j ?? {}) as { id?: unknown; name?: unknown; link?: unknown };
    if (String(p.id) !== kenh.diaChi) return { ok: false, thongBao: "Facebook trả về Page khác với Page đã nối.", loai: "PERMANENT", meta: {} };
    return { ok: true, thongBao: `Kết nối tốt — Page “${String(p.name ?? kenh.diaChi)}”.`, loai: null, meta: { tenHienThi: typeof p.name === "string" ? p.name : null, ...(typeof p.link === "string" ? { lienKet: p.link } : {}) } };
  },

  async publish(kenh, xt, nd, bc): Promise<KetQuaDang> {
    const nhatKy: BuocGoi[] = [];
    const mediaDaTai = { ...nd.mediaDaTai };
    const kieu = chonKieu(nd);
    const anh = nd.media.filter((m) => m.mime.startsWith("image/"));
    const vd = nd.media.find((m) => m.mime.startsWith("video/"));

    if (kieu === "fb-video" && vd) return taiVideo(kenh, xt, nd, bc, nhatKy, mediaDaTai, vd);
    if (kieu === "fb-reels" && vd) return taiReels(kenh, xt, nd, bc, nhatKy, mediaDaTai, vd);

    if (kieu === "fb-anh" && anh[0]) {
      const a = anh[0];
      const mp = dungMultipart({ message: nd.noiDung, published: "true" }, { ten: "source", tenTep: a.tenTep, mime: a.mime, noiDung: await a.docNoiDung() });
      const r = await graph(nhatKy, "publish", true, xt, bc, { duong: `${kenh.diaChi}/photos`, multipart: mp });
      if (!r.ok) return loi(nhatKy, mediaDaTai, r);
      const j = (r.j ?? {}) as { id?: unknown; post_id?: unknown };
      const ma = typeof j.post_id === "string" ? j.post_id : null;
      if (!ma) {
        doiBuocCuoi(nhatKy, { ketQua: "unknown", loaiLoi: "UNKNOWN", thongBao: "Phản hồi thành công nhưng không có mã bài." });
        return { ok: false, mediaDaTai, nhatKy, loai: "UNKNOWN", ma: "khong-co-ma-bai", thongBao: "Facebook nhận ảnh nhưng không trả mã bài — đang đối soát.", httpStatus: r.ph.status };
      }
      return { ok: true, externalId: ma, url: null, mediaDaTai, nhatKy };
    }

    const form: Record<string, string> = { message: nd.noiDung };
    if (kieu === "fb-nhieu-anh") {
      const ids: string[] = [];
      for (const a of anh) {
        let id = mediaDaTai[a.attachmentId];
        if (!id) {
          const mp = dungMultipart({ published: "false" }, { ten: "source", tenTep: a.tenTep, mime: a.mime, noiDung: await a.docNoiDung() });
          const r = await graph(nhatKy, "media", false, xt, bc, { duong: `${kenh.diaChi}/photos`, multipart: mp });
          // Ảnh chưa đăng hỏng giữa chừng: tải lại chỉ thêm một ảnh ẩn, không sinh bài trùng → thử lại.
          if (!r.ok) return loi(nhatKy, mediaDaTai, { ...r, loai: r.loai === "UNKNOWN" ? "RETRYABLE" : r.loai }, "anh-");
          const pid = (r.j as { id?: unknown } | undefined)?.id;
          if (typeof pid !== "string") return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "anh-khong-co-ma", thongBao: "Facebook nhận ảnh nhưng không trả mã ảnh.", httpStatus: r.ph.status };
          id = pid;
          mediaDaTai[a.attachmentId] = id;
        }
        ids.push(id);
      }
      ids.forEach((id, i) => (form[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    } else if (nd.tuyChon?.lienKet) form.link = nd.tuyChon.lienKet;

    const r = await graph(nhatKy, "publish", true, xt, bc, { duong: `${kenh.diaChi}/feed`, form });
    if (!r.ok) return loi(nhatKy, mediaDaTai, r);
    const id = (r.j as { id?: unknown } | undefined)?.id;
    if (typeof id !== "string") {
      doiBuocCuoi(nhatKy, { ketQua: "unknown", loaiLoi: "UNKNOWN", thongBao: "Phản hồi thành công nhưng không có mã bài." });
      return { ok: false, mediaDaTai, nhatKy, loai: "UNKNOWN", ma: "khong-co-ma-bai", thongBao: "Facebook trả lời thành công nhưng không có mã bài — đang đối soát.", httpStatus: r.ph.status };
    }
    return { ok: true, externalId: id, url: null, mediaDaTai, nhatKy };
  },

  async verify(kenh, xt, externalId, nd, bc): Promise<KetQuaXacMinh> {
    const nhatKy: BuocGoi[] = [];
    if (!/^[\d_]+$/.test(externalId)) return { ok: false, khongThay: true, nhatKy, loai: "PERMANENT", ma: "ma-sai", thongBao: "Mã bài không hợp lệ.", httpStatus: null };
    const laVideo = nd.kieu === "fb-video" || nd.kieu === "fb-reels";
    const r = await graph(nhatKy, "verify", false, xt, bc, { duong: externalId, query: { fields: laVideo ? "id,permalink_url,status,published" : "id,permalink_url,is_published,message" } });
    if (!r.ok) {
      const khongThay = r.httpStatus === 404 || r.ma.startsWith("graph-100");
      return { ok: false, khongThay, nhatKy, loai: khongThay ? "PERMANENT" : r.loai, ma: r.ma, thongBao: khongThay ? "Đọc lại không thấy bài trên Facebook (đã bị xóa?)." : r.thongBao, httpStatus: r.httpStatus };
    }
    const b = (r.j ?? {}) as { id?: unknown; permalink_url?: unknown; is_published?: unknown; status?: { video_status?: unknown } };
    const url = permalink(b.permalink_url);
    if (String(b.id) !== externalId) {
      doiBuocCuoi(nhatKy, { ketQua: "permanent", loaiLoi: "PERMANENT", thongBao: "Đọc lại không khớp mã." });
      return { ok: false, khongThay: false, nhatKy, loai: "PERMANENT", ma: "doc-lai-khong-khop", thongBao: "Đọc lại bài trên Facebook không khớp mã bài.", httpStatus: r.ph.status };
    }
    if (laVideo) {
      const tt = String(b.status?.video_status ?? "");
      if (tt === "error") return { ok: false, khongThay: false, nhatKy, loai: "PERMANENT", ma: "video-loi", thongBao: "Facebook báo lỗi xử lý video (định dạng / mã hóa không hợp). Xuất lại video H.264 rồi đăng lại.", httpStatus: r.ph.status };
      if (tt !== "ready" || !url) return { ok: false, khongThay: false, nhatKy, loai: "RETRYABLE", ma: "video-dang-xu-ly", thongBao: "Facebook đang xử lý video — sẽ đọc lại sau.", httpStatus: r.ph.status };
    } else if (b.is_published === false) {
      return { ok: false, khongThay: false, nhatKy, loai: "RETRYABLE", ma: "chua-cong-khai", thongBao: "Bài chưa hiện công khai trên Page.", httpStatus: r.ph.status };
    }
    if (!url) {
      doiBuocCuoi(nhatKy, { ketQua: "permanent", loaiLoi: "PERMANENT", thongBao: "Không có permalink." });
      return { ok: false, khongThay: false, nhatKy, loai: "RETRYABLE", ma: "khong-co-permalink", thongBao: "Facebook chưa trả đường dẫn bài.", httpStatus: r.ph.status };
    }
    return { ok: true, externalId, url, nhatKy };
  },

  async reconcile(kenh, xt, _khoa, bc, nd): Promise<KetQuaDoiSoat> {
    const nhatKy: BuocGoi[] = [];
    const daTai = nd?.mediaDaTai ?? {};
    const maVideo = daTai.__fbReelId ?? daTai.__fbVideoId;
    if (maVideo && (nd?.kieu === "fb-video" || nd?.kieu === "fb-reels" || !nd?.kieu)) {
      const r = await graph(nhatKy, "reconcile", false, xt, bc, { duong: maVideo, query: { fields: "id,status,published" } });
      if (!r.ok && !(r.httpStatus === 404 || r.ma.startsWith("graph-100"))) return { ok: false, nhatKy, loai: r.loai, ma: r.ma, thongBao: r.thongBao, httpStatus: r.httpStatus };
      const j = (r.ok ? r.j : {}) as { id?: unknown; published?: unknown; status?: { video_status?: unknown; publishing_phase?: { status?: unknown } } };
      // Video đã kết thúc tải (published / đang xử lý sau finish) → coi như đã lên, chuyển sang xác minh.
      const daLen = r.ok && (j.published === true || j.status?.publishing_phase?.status === "complete");
      doiBuocCuoi(nhatKy, { ketQua: daLen ? "found" : "not_found" });
      return { ok: true, externalId: daLen ? maVideo : null, nhatKy };
    }
    const r = await graph(nhatKy, "reconcile", false, xt, bc, { duong: `${kenh.diaChi}/published_posts`, query: { fields: "id,message,created_time", limit: "25" } });
    if (!r.ok) return { ok: false, nhatKy, loai: r.loai, ma: r.ma, thongBao: r.thongBao, httpStatus: r.httpStatus };
    const ds = ((r.j as { data?: unknown } | undefined)?.data ?? []) as { id?: unknown; message?: unknown; created_time?: unknown }[];
    const moc = nd?.batDauLuot ? nd.batDauLuot.getTime() - 10 * 60_000 : 0;
    const can = chuanHoaDoiSoat(nd?.noiDung);
    const thay = Array.isArray(ds) ? ds.find((b) => typeof b.id === "string" && chuanHoaDoiSoat(String(b.message ?? "")) === can && (!moc || Date.parse(String(b.created_time)) >= moc)) : undefined;
    doiBuocCuoi(nhatKy, { ketQua: thay ? "found" : "not_found" });
    return { ok: true, externalId: thay ? String(thay.id) : null, nhatKy };
  },
};
