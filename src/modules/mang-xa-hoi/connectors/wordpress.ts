import { goiAnToan, LoiGoiMang, type PhanHoiAnToan } from "../mang/goi-an-toan";
import { cauLoiGon, phanLoaiHttp, vanBanSangHtml } from "../tinh-toan";
import type {
  BoiCanhGoi, BuocGoi, KenhGoi, KetQuaDang, KetQuaDoiSoat, KetQuaKiemTra, KetQuaXacMinh, LoiPhanLoai,
  SocialConnector, ThongTinXacThuc, ViPham,
} from "./kieu";

/**
 * Connector WordPress (0.23.0 — chạy thật, QĐ-195): REST API `/wp-json/wp/v2` + Application Password (Basic Auth, chỉ HTTPS).
 *
 *  - Ảnh đại diện: tải byte lên `/wp/v2/media` (push), rồi tạo bài với `featured_media`.
 *  - Bài: `POST /wp/v2/posts` `{ title, content (HTML dựng từ chữ thường đã thoát), status: "publish", slug: khóa đối soát }`.
 *  - Xác minh: `GET /wp/v2/posts/<id>?context=edit` — đúng mã, đã `publish`, đúng slug (và tiêu đề) → lấy `link` làm permalink.
 *  - Đối soát: `GET /wp/v2/posts?slug=<khóa>&status=…&context=edit`.
 *  - Site tắt "đường dẫn đẹp" (không có /wp-json) → dùng `/?rest_route=` (phát hiện lúc kiểm tra kết nối, lưu meta.kieuApi).
 *
 * Mọi lần gọi đi qua `goiAnToan` (chống SSRF, hạn giờ, trần dung lượng). Không bao giờ đưa tiêu đề Authorization vào kết
 * quả, nhật ký hay thông báo lỗi.
 */

type KieuApi = "wp-json" | "rest-route";

function duongApi(kenh: KenhGoi, route: string, truyVan: Record<string, string> = {}, kieu?: KieuApi): string {
  const k = kieu ?? (kenh.meta.kieuApi === "rest-route" ? "rest-route" : "wp-json");
  const q = new URLSearchParams(truyVan);
  if (k === "rest-route") {
    const p = new URLSearchParams({ rest_route: route });
    for (const [a, b] of q) p.set(a, b);
    return `${kenh.diaChi}/?${p.toString()}`;
  }
  const s = q.toString();
  return `${kenh.diaChi}/wp-json${route}${s ? `?${s}` : ""}`;
}

function tieuDeXacThuc(xt: ThongTinXacThuc): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${xt.tenDangNhap}:${xt.matKhau}`, "utf8").toString("base64")}` };
}

function docJson(ph: PhanHoiAnToan): unknown {
  try {
    return JSON.parse(ph.than.toString("utf8"));
  } catch {
    return undefined;
  }
}

/** Trích đoạn phản hồi an toàn để lưu: chỉ vài trường biết trước, không bao giờ cả thân. */
function trichDoan(j: unknown): Record<string, unknown> | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const kq: Record<string, unknown> = {};
  for (const k of ["id", "status", "link", "slug", "code", "message", "source_url", "mime_type"]) {
    if (o[k] !== undefined) kq[k] = typeof o[k] === "string" ? cauLoiGon(o[k], 300) : o[k];
  }
  const d = o.data as Record<string, unknown> | undefined;
  if (d && typeof d === "object" && typeof d.status === "number") kq.dataStatus = d.status;
  return Object.keys(kq).length ? kq : null;
}

function thongBaoWp(ph: PhanHoiAnToan, j: unknown): string {
  const o = (j && typeof j === "object" ? j : {}) as { code?: string; message?: string };
  const goc = o.message ? cauLoiGon(o.message, 200) : `HTTP ${ph.status}`;
  if (ph.status === 401) return `WordPress từ chối đăng nhập (${goc}). Kiểm tra tên đăng nhập và mật khẩu ứng dụng.`;
  if (ph.status === 403) return `Tài khoản WordPress không đủ quyền (${goc}). Cần vai trò Tác giả (Author) trở lên.`;
  if (ph.status === 404) return `Không thấy REST API của WordPress tại địa chỉ này (${goc}).`;
  return `WordPress trả lỗi ${ph.status}: ${goc}`;
}

function loiTuMang(e: unknown, laGhi: boolean): LoiPhanLoai {
  if (e instanceof LoiGoiMang) {
    if (e.loai === "chan-dia-chi" || e.loai === "giao-thuc" || e.loai === "chuyen-huong") {
      return { loai: "PERMANENT", ma: e.loai, thongBao: e.message, httpStatus: null };
    }
    // Đã gửi xong một yêu cầu GHI mà không có câu trả lời trọn vẹn → không biết bài đã lên chưa.
    if (e.daGui && laGhi) return { loai: "UNKNOWN", ma: e.loai, thongBao: e.message, httpStatus: null };
    return { loai: "RETRYABLE", ma: e.loai, thongBao: e.message, httpStatus: null };
  }
  return { loai: laGhi ? "UNKNOWN" : "RETRYABLE", ma: "loi-khac", thongBao: cauLoiGon(e, 200), httpStatus: null };
}

const KET_QUA_THEO_LOAI = { RETRYABLE: "retryable", PERMANENT: "permanent", NEEDS_REAUTH: "needs_reauth", UNKNOWN: "unknown" } as const;

async function goi(
  nhatKy: BuocGoi[],
  kieu: BuocGoi["kieu"],
  laGhi: boolean,
  yc: Parameters<typeof goiAnToan>[0],
): Promise<{ ok: true; ph: PhanHoiAnToan; j: unknown } | ({ ok: false; ph: PhanHoiAnToan | null; j: unknown } & LoiPhanLoai)> {
  const batDau = new Date();
  try {
    const ph = await goiAnToan(yc);
    const j = docJson(ph);
    if (ph.status >= 200 && ph.status < 300) {
      nhatKy.push({ kieu, ketQua: "success", loaiLoi: null, httpStatus: ph.status, thongBao: null, trichDoan: trichDoan(j), batDau, ketThuc: new Date() });
      return { ok: true, ph, j };
    }
    const pl = phanLoaiHttp(ph.status);
    const loi: LoiPhanLoai = { loai: pl.loai, ma: (j as { code?: string } | undefined)?.code ?? pl.ma, thongBao: thongBaoWp(ph, j), httpStatus: ph.status };
    nhatKy.push({ kieu, ketQua: KET_QUA_THEO_LOAI[loi.loai], loaiLoi: loi.loai, httpStatus: ph.status, thongBao: loi.thongBao, trichDoan: trichDoan(j), batDau, ketThuc: new Date() });
    return { ok: false, ph, j, ...loi };
  } catch (e) {
    const loi = loiTuMang(e, laGhi);
    nhatKy.push({ kieu, ketQua: KET_QUA_THEO_LOAI[loi.loai], loaiLoi: loi.loai, httpStatus: null, thongBao: loi.thongBao, trichDoan: null, batDau, ketThuc: new Date() });
    return { ok: false, ph: null, j: undefined, ...loi };
  }
}

const THUC_THE: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Tiêu đề để so khi đọc lại: bỏ thẻ HTML, giải mã thực thể (`&amp;`, `&#8211;`, `&#x27;`…), gộp khoảng trắng. WordPress lọc
 * kses tiêu đề của người không có `unfiltered_html` nên bản lưu có thể khác bản gửi mà vẫn là cùng một tiêu đề.
 */
export function chuanHoaTieuDeWp(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, t: string) => {
      if (t[0] === "#") {
        const n = t[1] === "x" || t[1] === "X" ? Number.parseInt(t.slice(2), 16) : Number(t.slice(1));
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return THUC_THE[t.toLowerCase()] ?? m;
    })
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tên tệp an toàn cho tiêu đề Content-Disposition. */
function tenTepAnToan(ten: string): string {
  const s = ten.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
  return s || "anh";
}

export const wordpress: SocialConnector = {
  nenTang: "WORDPRESS",

  khaNang() {
    return { kieuNoiDung: ["bai-viet", "anh"], media: "push", soAnhToiDa: 1, doDaiTieuDeToiDa: 300, doDaiNoiDungToiDa: 100_000, canTieuDe: true };
  },

  validate(nd): ViPham[] {
    const v: ViPham[] = [];
    if (!nd.tieuDe?.trim()) v.push({ truong: "tieuDe", thongBao: "Bài WordPress cần tiêu đề." });
    if ((nd.tieuDe ?? "").length > 300) v.push({ truong: "tieuDe", thongBao: "Tiêu đề tối đa 300 ký tự." });
    if (!nd.noiDung.trim()) v.push({ truong: "noiDung", thongBao: "Nội dung trống." });
    if (nd.noiDung.length > 100_000) v.push({ truong: "noiDung", thongBao: "Nội dung tối đa 100.000 ký tự." });
    return v;
  },

  async kiemTraKetNoi(kenh: KenhGoi, xt: ThongTinXacThuc, bc: BoiCanhGoi): Promise<KetQuaKiemTra> {
    const nhatKy: BuocGoi[] = [];
    let kieu: "wp-json" | "rest-route" = "wp-json";
    let r = await goi(nhatKy, "check", false, { url: duongApi(kenh, "/wp/v2/users/me", { context: "edit" }, kieu), tieuDe: tieuDeXacThuc(xt), hanMs: bc.hanMs });
    if (!r.ok && r.httpStatus === 404) {
      kieu = "rest-route";
      r = await goi(nhatKy, "check", false, { url: duongApi(kenh, "/wp/v2/users/me", { context: "edit" }, kieu), tieuDe: tieuDeXacThuc(xt), hanMs: bc.hanMs });
    }
    if (!r.ok) return { ok: false, thongBao: r.thongBao, loai: r.loai, meta: {} };
    const u = (r.j ?? {}) as { id?: number; name?: string; capabilities?: Record<string, boolean> };
    if (typeof u.id !== "number") {
      return { ok: false, thongBao: "Địa chỉ này trả lời nhưng không phải REST API của WordPress.", loai: "PERMANENT", meta: {} };
    }
    const cap = u.capabilities ?? {};
    const thieu = [cap.publish_posts ? null : "đăng bài (publish_posts)", cap.upload_files ? null : "tải ảnh (upload_files)"].filter(Boolean);
    const meta = { kieuApi: kieu, wpUserId: u.id, tenHienThi: u.name ? cauLoiGon(u.name, 100) : null };
    if (thieu.length) {
      return { ok: false, thongBao: `Đăng nhập được nhưng tài khoản thiếu quyền ${thieu.join(", ")}. Dùng tài khoản vai trò Tác giả (Author) hoặc Biên tập viên (Editor).`, loai: "NEEDS_REAUTH", meta };
    }
    return { ok: true, thongBao: `Kết nối tốt — đăng nhập là “${meta.tenHienThi ?? xt.tenDangNhap}”, đủ quyền đăng bài và tải ảnh.`, loai: null, meta };
  },

  async publish(kenh, xt, nd, bc): Promise<KetQuaDang> {
    const nhatKy: BuocGoi[] = [];
    const mediaDaTai = { ...nd.mediaDaTai };
    const anh = nd.media[0];
    let featured: number | undefined;
    if (anh) {
      if (mediaDaTai[anh.attachmentId]) featured = Number(mediaDaTai[anh.attachmentId]);
      else {
        const m = await goi(nhatKy, "media", true, {
          url: duongApi(kenh, "/wp/v2/media"),
          phuongThuc: "POST",
          tieuDe: { ...tieuDeXacThuc(xt), "Content-Type": anh.mime, "Content-Disposition": `attachment; filename="${tenTepAnToan(anh.tenTep)}"` },
          than: anh.noiDung,
          hanMs: bc.hanMs,
        });
        if (!m.ok) {
          // Ảnh tải hỏng mà kết quả chưa rõ: tải lại chỉ sinh thêm một ảnh rác trong thư viện, không sinh bài trùng —
          // nên coi là lỗi tạm thời (thử lại), không cần đối soát.
          const loai = m.loai === "UNKNOWN" ? "RETRYABLE" : m.loai;
          return { ok: false, mediaDaTai, nhatKy, loai, ma: `anh-${m.ma}`, thongBao: `Tải ảnh lên WordPress hỏng: ${m.thongBao}`, httpStatus: m.httpStatus };
        }
        const id = (m.j as { id?: unknown } | undefined)?.id;
        if (typeof id !== "number") {
          return { ok: false, mediaDaTai, nhatKy, loai: "RETRYABLE", ma: "anh-khong-co-ma", thongBao: "WordPress nhận ảnh nhưng không trả mã ảnh.", httpStatus: m.ph.status };
        }
        featured = id;
        mediaDaTai[anh.attachmentId] = String(id);
      }
    }
    const than = JSON.stringify({
      title: nd.tieuDe ?? "",
      content: vanBanSangHtml(nd.noiDung),
      status: "publish",
      slug: nd.khoaDoiSoat,
      ...(featured ? { featured_media: featured } : {}),
    });
    const p = await goi(nhatKy, "publish", true, {
      url: duongApi(kenh, "/wp/v2/posts"),
      phuongThuc: "POST",
      tieuDe: { ...tieuDeXacThuc(xt), "Content-Type": "application/json; charset=utf-8" },
      than,
      hanMs: bc.hanMs,
    });
    if (!p.ok) return { ok: false, mediaDaTai, nhatKy, loai: p.loai, ma: p.ma, thongBao: p.thongBao, httpStatus: p.httpStatus };
    const j = (p.j ?? {}) as { id?: unknown; link?: unknown };
    if (typeof j.id !== "number") {
      // 2xx mà không có mã bài: không được coi là đã đăng (ADR-05) — đối soát.
      nhatKy[nhatKy.length - 1] = { ...nhatKy[nhatKy.length - 1], ketQua: "unknown", loaiLoi: "UNKNOWN", thongBao: "Phản hồi thành công nhưng không có mã bài." };
      return { ok: false, mediaDaTai, nhatKy, loai: "UNKNOWN", ma: "khong-co-ma-bai", thongBao: "WordPress trả lời thành công nhưng không có mã bài — đang đối soát.", httpStatus: p.ph.status };
    }
    return { ok: true, externalId: String(j.id), url: typeof j.link === "string" ? j.link : null, mediaDaTai, nhatKy };
  },

  async verify(kenh, xt, externalId, nd, bc): Promise<KetQuaXacMinh> {
    const nhatKy: BuocGoi[] = [];
    if (!/^\d+$/.test(externalId)) return { ok: false, khongThay: true, nhatKy, loai: "PERMANENT", ma: "ma-sai", thongBao: "Mã bài không hợp lệ.", httpStatus: null };
    const r = await goi(nhatKy, "verify", false, { url: duongApi(kenh, `/wp/v2/posts/${externalId}`, { context: "edit" }), tieuDe: tieuDeXacThuc(xt), hanMs: bc.hanMs });
    if (!r.ok) {
      return { ok: false, khongThay: r.httpStatus === 404, nhatKy, loai: r.httpStatus === 404 ? "PERMANENT" : r.loai, ma: r.ma, thongBao: r.httpStatus === 404 ? "Đọc lại không thấy bài trên WordPress (đã bị xóa?)." : r.thongBao, httpStatus: r.httpStatus };
    }
    const b = (r.j ?? {}) as { id?: unknown; status?: unknown; link?: unknown; slug?: unknown; title?: { raw?: unknown } };
    const sai: string[] = [];
    if (String(b.id) !== externalId) sai.push("mã bài");
    if (b.status !== "publish") sai.push(`trạng thái (${String(b.status)})`);
    if (typeof b.slug !== "string" || !b.slug.startsWith(nd.khoaDoiSoat)) sai.push("đường dẫn (slug)");
    // QA 0.23.0: tài khoản không có quyền unfiltered_html (Tác giả — vai trò khuyến nghị) bị WordPress lọc kses tiêu đề
    // ("A & B" lưu thành "A &amp; B", thẻ lạ bị gỡ) → so sau khi chuẩn hóa, không so nguyên văn (bài đã lên mà báo Lỗi).
    if (nd.tieuDe && typeof b.title?.raw === "string" && chuanHoaTieuDeWp(b.title.raw) !== chuanHoaTieuDeWp(nd.tieuDe)) sai.push("tiêu đề");
    if (typeof b.link !== "string" || !/^https?:\/\//.test(b.link)) sai.push("permalink");
    if (sai.length) {
      nhatKy[nhatKy.length - 1] = { ...nhatKy[nhatKy.length - 1], ketQua: "permanent", loaiLoi: "PERMANENT", thongBao: `Đọc lại không khớp: ${sai.join(", ")}.` };
      return { ok: false, khongThay: false, nhatKy, loai: b.status === "future" || b.status === "pending" || b.status === "draft" ? "RETRYABLE" : "PERMANENT", ma: "doc-lai-khong-khop", thongBao: `Đọc lại bài trên WordPress không khớp: ${sai.join(", ")}.`, httpStatus: r.ph.status };
    }
    return { ok: true, externalId, url: b.link as string, nhatKy };
  },

  async reconcile(kenh, xt, khoaDoiSoat, bc): Promise<KetQuaDoiSoat> {
    const nhatKy: BuocGoi[] = [];
    const r = await goi(nhatKy, "reconcile", false, {
      url: duongApi(kenh, "/wp/v2/posts", { slug: khoaDoiSoat, status: "publish,future,draft,pending,private", context: "edit", _fields: "id,slug,status" }),
      tieuDe: tieuDeXacThuc(xt),
      hanMs: bc.hanMs,
    });
    if (!r.ok) return { ok: false, nhatKy, loai: r.loai, ma: r.ma, thongBao: r.thongBao, httpStatus: r.httpStatus };
    const ds = Array.isArray(r.j) ? (r.j as { id?: unknown; slug?: unknown }[]) : [];
    const thay = ds.find((x) => typeof x.id === "number" && typeof x.slug === "string" && x.slug.startsWith(khoaDoiSoat));
    nhatKy[nhatKy.length - 1] = { ...nhatKy[nhatKy.length - 1], ketQua: thay ? "found" : "not_found" };
    return { ok: true, externalId: thay ? String(thay.id) : null, nhatKy };
  },
};
