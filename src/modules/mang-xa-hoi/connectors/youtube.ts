import { kiemTheoNenTang } from "../luat-nen-tang";
import { phanLoaiLoiGoogle } from "../oauth-thuan";
import { doiBuocCuoi, goiNenTang, type KetQuaGoi } from "./goi-chung";
import { gocApi } from "./goc-api";
import type { BoiCanhGoi, BuocGoi, KetQuaDang, KetQuaDoiSoat, KetQuaKiemTra, KetQuaXacMinh, SocialConnector, ThongTinXacThuc } from "./kieu";

/**
 * Connector YouTube (0.24.0, QĐ-204) — YouTube Data API v3, OAuth Google (access token còn hạn — worker làm mới trước).
 *
 *  - Tải lên RESUMABLE: `POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` (siêu dữ liệu, tiêu đề
 *    `X-Upload-Content-Length/Type`) → `Location` = URI phiên; `PUT` từng đoạn (bội số 256 KiB) với `Content-Range`;
 *    308 + `Range` = đã nhận tới đâu; 200 / 201 = xong (tài nguyên video). Đứt giữa chừng → hỏi `Content-Range: bytes *\/N`
 *    rồi tải tiếp từ byte máy chủ đã nhận; hỏng liên tiếp → lượt sau tải tiếp (URI phiên giữ trong media_external).
 *  - Quyền riêng tư: private / unlisted / public (tùy chọn bài). Thẻ (tag) chứa khóa đối soát → đối soát chính xác.
 *  - Xác minh: `videos.list?part=status,snippet&id=` — `uploadStatus` uploaded / processed; rejected / failed → lỗi.
 *  - Đối soát: phiên tải dở → hỏi phiên; không có → danh sách tải lên của kênh, tìm video có thẻ = khóa đối soát.
 * Shorts: video dọc ≤ 3 phút — YouTube tự xếp, không có API riêng (chỉ ghi chú lúc kiểm luật).
 *
 * CHƯA KIỂM VỚI API THẬT: tên máy / đường upload, mã 308 + tiêu đề Range, trường uploadStatus, `categoryId` 22.
 */

const TEN = "YouTube";
const DOAN_MAC_DINH = 8 * 1024 * 1024;
const BOI = 256 * 1024;
const HONG_LIEN_TIEP_TOI_DA = 3;

function bearer(xt: ThongTinXacThuc) {
  return { Authorization: `Bearer ${xt.accessToken ?? ""}` };
}

async function api(nhatKy: BuocGoi[], kieu: BuocGoi["kieu"], xt: ThongTinXacThuc, bc: BoiCanhGoi, duong: string, query: Record<string, string>): Promise<KetQuaGoi> {
  return goiNenTang(nhatKy, kieu, false, { url: `${gocApi().googleApis}/youtube/v3/${duong}?${new URLSearchParams(query).toString()}`, tieuDe: bearer(xt), hanMs: bc.hanMs }, phanLoaiLoiGoogle, TEN);
}

function loi(nhatKy: BuocGoi[], mediaDaTai: Record<string, string>, r: Extract<KetQuaGoi, { ok: false }>, tienTo = ""): KetQuaDang {
  return { ok: false, mediaDaTai, nhatKy, loai: r.loai, ma: `${tienTo}${r.ma}`, thongBao: r.thongBao, httpStatus: r.httpStatus, ...(r.hoanMs !== undefined ? { hoanMs: r.hoanMs } : {}) };
}

/** Byte cuối máy chủ đã nhận, từ tiêu đề `Range: bytes=0-N` (không có = chưa nhận gì). */
function daNhan(range: string | string[] | undefined): number {
  const s = Array.isArray(range) ? range[0] : range;
  const m = /bytes=0-(\d+)/.exec(s ?? "");
  return m ? Number(m[1]) + 1 : 0;
}

function maVideo(j: unknown): string | null {
  const id = (j as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

/** Hỏi phiên đã nhận tới đâu: { xong, id } nếu đã nhận đủ; { tiep } nếu còn thiếu; { het } nếu phiên không còn. */
async function hoiPhien(nhatKy: BuocGoi[], bc: BoiCanhGoi, xt: ThongTinXacThuc, phien: string, tong: number): Promise<{ xong: string } | { tiep: number } | { het: true } | { loi: Extract<KetQuaGoi, { ok: false }> }> {
  const r = await goiNenTang(nhatKy, "media", false, { url: phien, phuongThuc: "PUT", tieuDe: { ...bearer(xt), "Content-Range": `bytes */${tong}`, "Content-Length": "0" }, than: Buffer.alloc(0), hanMs: bc.hanMs }, phanLoaiLoiGoogle, TEN, [308]);
  if (!r.ok) {
    if (r.httpStatus === 404 || r.httpStatus === 410) return { het: true };
    return { loi: r };
  }
  if (r.ph.status === 308) return { tiep: daNhan(r.ph.tieuDe.range) };
  const id = maVideo(r.j);
  return id ? { xong: id } : { het: true };
}

export const youtube: SocialConnector = {
  nenTang: "YOUTUBE",

  khaNang() {
    return { kieuNoiDung: ["video"], media: "push", soAnhToiDa: 0, doDaiTieuDeToiDa: 100, doDaiNoiDungToiDa: 5_000, canTieuDe: true };
  },

  validate(nd, mt) {
    return kiemTheoNenTang("YOUTUBE", nd, mt).viPham;
  },

  async kiemTraKetNoi(kenh, xt, bc): Promise<KetQuaKiemTra> {
    const nhatKy: BuocGoi[] = [];
    const r = await api(nhatKy, "check", xt, bc, "channels", { part: "snippet", id: kenh.diaChi });
    if (!r.ok) return { ok: false, thongBao: r.thongBao, loai: r.loai, meta: {} };
    const k = (((r.j as { items?: unknown } | undefined)?.items ?? []) as { id?: unknown; snippet?: { title?: unknown; customUrl?: unknown } }[])[0];
    if (!k || k.id !== kenh.diaChi) return { ok: false, thongBao: "Không đọc được kênh YouTube đã nối (kênh bị xóa / tài khoản đổi?).", loai: "NEEDS_REAUTH", meta: {} };
    return { ok: true, thongBao: `Kết nối tốt — kênh YouTube “${String(k.snippet?.title ?? kenh.diaChi)}”.`, loai: null, meta: { tenHienThi: typeof k.snippet?.title === "string" ? k.snippet.title : null } };
  },

  async publish(kenh, xt, nd, bc): Promise<KetQuaDang> {
    const nhatKy: BuocGoi[] = [];
    const mediaDaTai = { ...nd.mediaDaTai };
    const vd = nd.media.find((m) => m.mime.startsWith("video/"));
    if (!vd) return { ok: false, mediaDaTai, nhatKy, loai: "PERMANENT", ma: "khong-co-video", thongBao: "Bài YouTube cần một video.", httpStatus: null };
    const noiDung = await vd.docNoiDung();
    const tong = noiDung.length;
    const doan = Math.max(BOI, Math.floor((bc.doanYoutube ?? DOAN_MAC_DINH) / BOI) * BOI);
    let phien: string | undefined = mediaDaTai.__ytPhien;
    let tu = 0;

    if (phien) {
      const h = await hoiPhien(nhatKy, bc, xt, phien, tong);
      if ("xong" in h) return { ok: true, externalId: h.xong, url: null, mediaDaTai, nhatKy };
      if ("loi" in h) return loi(nhatKy, mediaDaTai, h.loi, "phien-");
      if ("het" in h) {
        delete mediaDaTai.__ytPhien;
        phien = undefined;
      } else tu = h.tiep;
    }
    if (!phien) {
      const sieu = {
        snippet: { title: (nd.tieuDe ?? "").slice(0, 100), description: nd.noiDung, categoryId: "22", tags: [nd.khoaDoiSoat] },
        status: { privacyStatus: nd.tuyChon?.youtubeRiengTu ?? "private", selfDeclaredMadeForKids: false },
      };
      const r = await goiNenTang(nhatKy, "media", false, {
        url: `${gocApi().googleApis}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
        phuongThuc: "POST",
        tieuDe: { ...bearer(xt), "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(tong), "X-Upload-Content-Type": vd.mime },
        than: JSON.stringify(sieu),
        hanMs: bc.hanMs,
      }, phanLoaiLoiGoogle, TEN);
      if (!r.ok) return loi(nhatKy, mediaDaTai, { ...r, loai: r.loai === "UNKNOWN" ? "RETRYABLE" : r.loai }, "phien-");
      const loc = r.ph.tieuDe.location;
      let uri: URL | null = null;
      try {
        uri = new URL(String(loc ?? ""));
      } catch {
        uri = null;
      }
      // Chỉ nhận URI phiên trên đúng máy Google API (không gọi URL lạ do phản hồi chỉ tới).
      if (!uri || uri.host !== new URL(gocApi().googleApis).host) return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "phien-khong-hop-le", thongBao: "YouTube không trả URI phiên tải lên hợp lệ.", httpStatus: r.ph.status };
      phien = uri.toString();
      mediaDaTai.__ytPhien = phien;
      tu = 0;
    }

    let hong = 0;
    let vong = 0;
    while (tu < tong) {
      if (++vong > 10_000) break;
      const den = Math.min(tu + doan, tong);
      const r = await goiNenTang(nhatKy, den === tong ? "publish" : "media", den === tong, {
        url: phien,
        phuongThuc: "PUT",
        tieuDe: { ...bearer(xt), "Content-Type": vd.mime, "Content-Range": `bytes ${tu}-${den - 1}/${tong}` },
        than: noiDung.subarray(tu, den),
        hanMs: Math.max(bc.hanMs, 60_000),
      }, phanLoaiLoiGoogle, TEN, [308]);
      if (r.ok && r.ph.status === 308) {
        tu = daNhan(r.ph.tieuDe.range);
        hong = 0;
        continue;
      }
      if (r.ok) {
        const id = maVideo(r.j);
        if (!id) {
          doiBuocCuoi(nhatKy, { ketQua: "unknown", loaiLoi: "UNKNOWN", thongBao: "Tải xong nhưng không có mã video." });
          return { ok: false, mediaDaTai, nhatKy, loai: "UNKNOWN", ma: "khong-co-ma-video", thongBao: "YouTube nhận video nhưng không trả mã — đang đối soát.", httpStatus: r.ph.status };
        }
        delete mediaDaTai.__ytPhien;
        return { ok: true, externalId: id, url: null, mediaDaTai, nhatKy };
      }
      // Lỗi giữa chừng: 4xx (trừ 408 / 429) là lỗi thật; còn lại hỏi phiên rồi tải tiếp từ byte đã nhận.
      if (r.httpStatus !== null && r.httpStatus >= 400 && r.httpStatus < 500 && r.httpStatus !== 408 && r.httpStatus !== 429) {
        if (r.httpStatus === 404 || r.httpStatus === 410) delete mediaDaTai.__ytPhien;
        return loi(nhatKy, mediaDaTai, r);
      }
      if (++hong > HONG_LIEN_TIEP_TOI_DA) {
        return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "tai-do-dang", thongBao: `YouTube: tải video bị ngắt nhiều lần (đã nhận ${Math.round((tu / tong) * 100)}%) — lượt sau tải tiếp từ chỗ dừng.`, httpStatus: r.httpStatus };
      }
      const h = await hoiPhien(nhatKy, bc, xt, phien, tong);
      if ("xong" in h) {
        delete mediaDaTai.__ytPhien;
        return { ok: true, externalId: h.xong, url: null, mediaDaTai, nhatKy };
      }
      if ("het" in h) {
        delete mediaDaTai.__ytPhien;
        return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "phien-het", thongBao: "Phiên tải YouTube không còn — tải lại từ đầu ở lần sau.", httpStatus: null };
      }
      if ("loi" in h) {
        if (h.loi.loai === "NEEDS_REAUTH" || h.loi.loai === "PERMANENT") return loi(nhatKy, mediaDaTai, h.loi);
        continue;
      }
      tu = h.tiep;
    }
    return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "tai-do-dang", thongBao: "YouTube: tải chưa xong — lượt sau tải tiếp.", httpStatus: null };
  },

  async verify(_kenh, xt, externalId, _nd, bc): Promise<KetQuaXacMinh> {
    const nhatKy: BuocGoi[] = [];
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(externalId)) return { ok: false, khongThay: true, nhatKy, loai: "PERMANENT", ma: "ma-sai", thongBao: "Mã video không hợp lệ.", httpStatus: null };
    const r = await api(nhatKy, "verify", xt, bc, "videos", { part: "status,snippet", id: externalId });
    if (!r.ok) return { ok: false, khongThay: false, nhatKy, loai: r.loai, ma: r.ma, thongBao: r.thongBao, httpStatus: r.httpStatus };
    const it = (((r.j as { items?: unknown } | undefined)?.items ?? []) as { id?: unknown; status?: { uploadStatus?: unknown; rejectionReason?: unknown; failureReason?: unknown } }[])[0];
    if (!it || it.id !== externalId) {
      doiBuocCuoi(nhatKy, { ketQua: "not_found" });
      return { ok: false, khongThay: true, nhatKy, loai: "PERMANENT", ma: "khong-thay", thongBao: "Đọc lại không thấy video trên YouTube (đã bị xóa?).", httpStatus: r.ph.status };
    }
    const tt = String(it.status?.uploadStatus ?? "");
    if (tt === "rejected" || tt === "failed" || tt === "deleted") {
      const ly = String(it.status?.rejectionReason ?? it.status?.failureReason ?? tt);
      doiBuocCuoi(nhatKy, { ketQua: "permanent", loaiLoi: "PERMANENT", thongBao: `YouTube: ${ly}` });
      return { ok: false, khongThay: false, nhatKy, loai: "PERMANENT", ma: `yt-${tt}`, thongBao: `YouTube từ chối video (${ly}) — kiểm bản quyền / định dạng rồi đăng lại.`, httpStatus: r.ph.status };
    }
    if (tt !== "uploaded" && tt !== "processed") return { ok: false, khongThay: false, nhatKy, loai: "RETRYABLE", ma: "yt-dang-xu-ly", thongBao: "YouTube đang xử lý video.", httpStatus: r.ph.status };
    return { ok: true, externalId, url: `https://www.youtube.com/watch?v=${externalId}`, nhatKy };
  },

  async reconcile(kenh, xt, khoa, bc, nd): Promise<KetQuaDoiSoat> {
    const nhatKy: BuocGoi[] = [];
    const phien = nd?.mediaDaTai?.__ytPhien;
    if (phien) {
      const tong = nd?.media?.find((m) => m.mime.startsWith("video/"))?.dungLuong ?? 0;
      if (tong > 0) {
        const h = await hoiPhien(nhatKy, bc, xt, phien, tong);
        if ("xong" in h) {
          doiBuocCuoi(nhatKy, { kieu: "reconcile", ketQua: "found" });
          return { ok: true, externalId: h.xong, nhatKy };
        }
        if ("tiep" in h) {
          // Phiên còn dở → video CHƯA tồn tại; tải tiếp an toàn.
          doiBuocCuoi(nhatKy, { kieu: "reconcile", ketQua: "not_found" });
          return { ok: true, externalId: null, nhatKy };
        }
      }
    }
    const c = await api(nhatKy, "reconcile", xt, bc, "channels", { part: "contentDetails", id: kenh.diaChi });
    if (!c.ok) return { ok: false, nhatKy, loai: c.loai, ma: c.ma, thongBao: c.thongBao, httpStatus: c.httpStatus };
    const ds = ((c.j as { items?: unknown } | undefined)?.items ?? []) as { contentDetails?: { relatedPlaylists?: { uploads?: unknown } } }[];
    const uploads = ds[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (typeof uploads !== "string") return { ok: false, nhatKy, loai: "RETRYABLE", ma: "khong-thay-uploads", thongBao: "Không đọc được danh sách video của kênh.", httpStatus: c.ph.status };
    const p = await api(nhatKy, "reconcile", xt, bc, "playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "25" });
    if (!p.ok) return { ok: false, nhatKy, loai: p.loai, ma: p.ma, thongBao: p.thongBao, httpStatus: p.httpStatus };
    const ids = (((p.j as { items?: unknown } | undefined)?.items ?? []) as { contentDetails?: { videoId?: unknown } }[]).map((x) => x.contentDetails?.videoId).filter((x): x is string => typeof x === "string");
    if (!ids.length) {
      doiBuocCuoi(nhatKy, { ketQua: "not_found" });
      return { ok: true, externalId: null, nhatKy };
    }
    const vds = await api(nhatKy, "reconcile", xt, bc, "videos", { part: "snippet", id: ids.join(",") });
    if (!vds.ok) return { ok: false, nhatKy, loai: vds.loai, ma: vds.ma, thongBao: vds.thongBao, httpStatus: vds.httpStatus };
    const thay = (((vds.j as { items?: unknown } | undefined)?.items ?? []) as { id?: unknown; snippet?: { tags?: unknown } }[]).find((x) => Array.isArray(x.snippet?.tags) && (x.snippet!.tags as unknown[]).includes(khoa));
    doiBuocCuoi(nhatKy, { ketQua: thay ? "found" : "not_found" });
    return { ok: true, externalId: thay ? String(thay.id) : null, nhatKy };
  },
};
