import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { thanhBuoc, type BuocGiaoDich } from "@/lib/api-nhieu-buoc";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { LoiNhaCungCapAI, nhaCungCapDangDung, tinhTrangAI, type NhaCungCapAI } from "@/modules/tro-ly/nha-cung-cap";
import { chiTietBai, taoBai } from "../bai";
import { ganHashtag } from "../bien-the";
import { docCauHinhMxh } from "../chung";
import { NEN_TANG, type NenTang } from "../hang-so";
import type { LuocDoBai, LuocDoVietBaiAi } from "../luoc-do";
import { docHoSoThuongHieu } from "../thuong-hieu";
import { batBuocKhongCoTruongCam, giaHopLe, sanPhamChoAI, type DoiChieuNhayCam } from "./du-lieu-san-pham";
import { docKetQuaAI, LoiKetQuaAI } from "./ket-qua";
import { loiNhacHeThong, loiNhacNguoiDung, TOI_DA_TOKEN_RA, uocTinhTokenVao } from "./loi-nhac";
import { chanLuotTrungKhoa, docNganSach, ghiKetQuaLuotAI, giuChoNganSach, khoaNganSach, TINH_NANG_VIET_BAI, trangThaiNganSach } from "./ngan-sach";
import { chiPhiVnd } from "./ngan-sach-thuan";

/**
 * AI VIẾT BÀI mạng xã hội từ sản phẩm Cowork (0.25.0, QĐ-237 → QĐ-239).
 *
 *  - Đi qua nhà cung cấp AI SẴN CÓ của Trợ lý (`tro-ly/nha-cung-cap.ts`) — không có client AI thứ hai. Chưa cấu hình
 *    (không có ANTHROPIC_API_KEY) → báo "chưa cấu hình", không gọi gì, không ghi gì.
 *  - Dữ liệu gửi đi: CHỈ giá bán thật + tình trạng tồn hiện tại + thông tin mô tả (danh sách trắng `sanPhamChoAI`) — câu
 *    truy vấn sản phẩm thậm chí không chọn cột giá vốn / nhà cung cấp.
 *  - Ngân sách AI theo tháng: giữ chỗ trước khi gọi, vượt → chặn kèm lời giải thích; ghi số token / chi phí thật.
 *  - Gọi mô hình NGOÀI giao dịch CSDL (QĐ-89): bước 1 kiểm + giữ chỗ, gọi mô hình, bước 3 ghi kết quả + tạo bài nháp.
 *  - Kết quả = bài NHÁP `created_by_type = ai`; Cấu hình "Bài do AI tạo phải duyệt" = 1 (mặc định) → phải duyệt trước khi
 *    hẹn giờ / đăng (luật sẵn có `canDuyet`). Người bấm "Viết bằng AI" là người soạn → không tự duyệt được.
 */

function nccHienTai(): { ncc: NhaCungCapAI | null; lyDo: string } {
  try {
    return { ncc: nhaCungCapDangDung(), lyDo: "" };
  } catch (e) {
    if (e instanceof LoiNhaCungCapAI) return { ncc: null, lyDo: e.message };
    throw e;
  }
}

function duocDungAi(nc: NguCanh): boolean {
  return coQuyen(nc.hoSo, "mxh.create") && coQuyen(nc.hoSo, "ai.view") && coQuyen(nc.hoSo, "product.view");
}

/** Trạng thái cho màn hình: đã cấu hình chưa, ngân sách tháng này, có phải duyệt bài AI không. */
export async function trangThaiAiVietBai(nc: NguCanh, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const { ncc, lyDo } = nccHienTai();
  const ns = await trangThaiNganSach(nc.tx, bayGio);
  const cfg = await docCauHinhMxh(nc.tx);
  return {
    daCauHinh: Boolean(ncc),
    lyDoChuaCauHinh: ncc ? null : `AI chưa cấu hình — ${lyDo}`,
    nhaCungCap: ncc?.ten ?? tinhTrangAI().nhaCungCap,
    duocDung: duocDungAi(nc),
    lyDoKhongDung: duocDungAi(nc) ? null : "Cần quyền soạn bài mạng xã hội, dùng trợ lý AI và xem sản phẩm.",
    aiPhaiDuyet: cfg.aiPhaiDuyet,
    nganSach: { thang: ns.thang, daDungToken: ns.daDung.token, daDungVnd: ns.daDung.vnd, soLuot: ns.daDung.soLuot, hanToken: ns.han.tokenThang, hanVnd: ns.han.vndThang, phanTram: ns.phanTram, conDung: ns.conDung },
    nangNganSach: coQuyen(nc.hoSo, "setting.update"),
  };
}

const CHON_SAN_PHAM = {
  id: true, sku: true, name: true, model: true, description: true, specifications: true, unit: true, sellingPrice: true, vatRate: true,
  warrantyMonths: true, status: true, quanLyTon: true, minStock: true, category: { select: { name: true } }, brand: { select: { name: true } },
} as const;

/**
 * LỚP ĐỐI CHIẾU (QA 0.25.0, QĐ-240): đọc RIÊNG giá vốn, giá nhập theo nhà cung cấp, tên / mã nhà cung cấp của các sản phẩm —
 * KHÔNG đưa vào dữ liệu gửi đi, chỉ để `sanPhamChoAI` bỏ dòng mô tả / thông số chứa đúng các giá trị đó (người nhập ghi giá
 * vốn không nhãn, viết lách dấu, kẻ bảng…). Truy vấn dữ liệu gửi AI (`CHON_SAN_PHAM`) vẫn không chọn các cột này.
 */
async function doiChieuNhayCam(nc: NguCanh, ids: string[]): Promise<Map<string, DoiChieuNhayCam>> {
  if (!ids.length) return new Map();
  const ds = await nc.tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, costPrice: true, defaultSupplier: { select: { name: true, code: true } }, supplierPrices: { select: { purchasePrice: true, supplier: { select: { name: true, code: true } } } } },
  });
  return new Map(ds.map((p) => [p.id, {
    giaVon: [p.costPrice, ...p.supplierPrices.map((x) => x.purchasePrice)].filter((x) => x !== null).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0),
    nhaCungCap: [p.defaultSupplier, ...p.supplierPrices.map((x) => x.supplier)].flatMap((x) => (x ? [x.name, x.code] : [])),
  }]));
}

/**
 * Sản phẩm để chọn trên màn hình AI viết bài (giá bán + tình trạng tồn — không có giá vốn). QA 0.25.0 (QĐ-240): cùng quyền
 * với AI viết bài (mxh.create + ai.view + product.view) — trước đây chỉ cần product.view nên ai xem sản phẩm (Kinh doanh, Kỹ
 * thuật…) cũng đọc được tình trạng còn / sắp hết / hết hàng dù không có quyền xem kho.
 */
export async function sanPhamDeVietBai(nc: NguCanh, tuKhoa: string | null) {
  batBuocQuyen(nc.hoSo, "mxh.create");
  batBuocQuyen(nc.hoSo, "ai.view");
  batBuocQuyen(nc.hoSo, "product.view");
  const q = tuKhoa?.trim();
  const ds = await nc.tx.product.findMany({
    where: { status: "hoat-dong", ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } : {}) },
    select: CHON_SAN_PHAM, orderBy: { name: "asc" }, take: 50,
  });
  const ton = await tonConBan(nc, ds.map((p) => p.id));
  const dc = await doiChieuNhayCam(nc, ds.map((p) => p.id));
  const xem = coQuyen(nc.hoSo, "inventory.view");
  return ds.map((p) => ({ id: p.id, ...sanPhamChoAI({ ...p, conBanDuoc: ton.get(p.id) ?? 0 }, xem, dc.get(p.id)) }));
}

/**
 * Còn bán được (tồn − giữ chỗ) cộng mọi kho. Đọc trực tiếp (RLS doanh nghiệp) để tính TÌNH TRẠNG còn / sắp hết / hết cho
 * AI; con số chỉ lộ ra khi người yêu cầu có `inventory.view` (QĐ-237).
 */
async function tonConBan(nc: NguCanh, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const ds = await nc.tx.inventoryBalance.groupBy({ by: ["productId"], where: { productId: { in: ids } }, _sum: { onHand: true, reserved: true } });
  return new Map(ds.map((d) => [d.productId, Math.max(0, Number(d._sum.onHand ?? 0) - Number(d._sum.reserved ?? 0))]));
}

/**
 * Viết bài bằng AI → bài nháp do AI tạo (kèm nội dung riêng theo kênh). Trả chi tiết bài + cảnh báo của bước làm sạch.
 */
export async function vietBaiAi(x: NguCanh | BuocGiaoDich, d: z.infer<typeof LuocDoVietBaiAi>, bayGio: Date = new Date()) {
  const nb = thanhBuoc(x);

  // Bước 1 — kiểm quyền, nhà cung cấp, kênh, sản phẩm; dựng lời nhắc; giữ chỗ ngân sách.
  const b1 = await nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "mxh.create", { objectType: "social_post" });
    batBuocQuyen(nc.hoSo, "ai.view", { objectType: "social_post" });
    batBuocQuyen(nc.hoSo, "product.view", { objectType: "social_post" });
    const khoa = d.khoaLapLai?.trim() || null;
    if (khoa) {
      // QA 0.25.0 (QĐ-245): kiểm khóa lặp lại DƯỚI khóa tư vấn ngân sách — lượt cùng khóa đang gọi mô hình (chưa có bài) → 409.
      await khoaNganSach(nc);
      const da = await nc.tx.socialPost.findFirst({ where: { idempotencyKey: khoa }, select: { id: true, createdBy: true } });
      if (da) {
        if (da.createdBy !== nc.hoSo.userId) throw new LoiNghiepVu("Khóa lặp lại đã được dùng cho bài khác.", 409, "khoa-lap-lai-trung");
        return { trung: { ...(await chiTietBai(nc, da.id)), trung: true, canhBaoAi: [] as string[] } };
      }
      await chanLuotTrungKhoa(nc, TINH_NANG_VIET_BAI, khoa);
    }
    const { ncc, lyDo } = nccHienTai();
    if (!ncc) throw new LoiNghiepVu(`AI chưa cấu hình — ${lyDo} Bài vẫn soạn tay được như thường.`, 503, "ai-chua-cau-hinh");

    const kenh = await nc.tx.socialConnection.findMany({ where: { id: { in: [...new Set(d.kenhIds)] } }, select: { id: true, name: true, platform: true, disconnectedAt: true } });
    if (kenh.length !== new Set(d.kenhIds).size) throw new LoiNghiepVu("Có kênh không tồn tại.", 404, "khong-tim-thay");
    const ngat = kenh.find((k) => k.disconnectedAt);
    if (ngat) throw new LoiNghiepVu(`Kênh “${ngat.name}” đã ngắt.`, 409, "kenh-da-ngat");
    const nenTang = [...new Set(kenh.map((k) => k.platform))].filter((p): p is NenTang => (NEN_TANG as readonly string[]).includes(p));
    if (d.chienDichId) {
      const cd = await nc.tx.socialCampaign.findFirst({ where: { id: d.chienDichId, status: "hoat-dong" }, select: { id: true } });
      if (!cd) throw new LoiNghiepVu("Chiến dịch không tồn tại hoặc đã lưu trữ.", 404, "khong-tim-thay");
    }

    const ids = [...new Set(d.sanPhamIds)];
    // Câu truy vấn KHÔNG chọn giá vốn / nhà cung cấp (lớp chặn thứ nhất); `sanPhamChoAI` là danh sách trắng (lớp hai);
    // `batBuocKhongCoTruongCam` kiểm lần cuối (lớp ba).
    const sp = await nc.tx.product.findMany({ where: { id: { in: ids } }, select: CHON_SAN_PHAM });
    if (sp.length !== ids.length) throw new LoiKhongTimThay("Sản phẩm");
    const ngung = sp.find((p) => p.status !== "hoat-dong");
    if (ngung) throw new LoiNghiepVu(`Sản phẩm “${ngung.name}” đã ngừng kinh doanh — không viết bài quảng cáo.`, 409, "san-pham-ngung");
    const ton = await tonConBan(nc, ids);
    const dc = await doiChieuNhayCam(nc, ids);
    const xem = coQuyen(nc.hoSo, "inventory.view");
    const duLieu = ids.map((id) => sp.find((p) => p.id === id)!).map((p) => sanPhamChoAI({ ...p, conBanDuoc: ton.get(p.id) ?? 0 }, xem, dc.get(p.id)));
    batBuocKhongCoTruongCam(duLieu);

    const hoSo = await docHoSoThuongHieu(nc.tx);
    const heThong = loiNhacHeThong();
    const nguoiDung = loiNhacNguoiDung({ sanPham: duLieu, nenTang, hoSo, yeuCau: d.yeuCau?.trim() || null });
    const duTruToken = uocTinhTokenVao(heThong, nguoiDung) + TOI_DA_TOKEN_RA;
    const { gia } = await docNganSach(nc.tx);
    const duTruVnd = chiPhiVnd(duTruToken - TOI_DA_TOKEN_RA, TOI_DA_TOKEN_RA, gia);
    const luotId = await giuChoNganSach(nc, { tinhNang: TINH_NANG_VIET_BAI, duTruToken, duTruVnd, soMuc: duLieu.length, khoaLapLai: khoa }, bayGio);
    return { trung: null, ncc, heThong, nguoiDung, nenTang, gia, luotId, giaThat: giaHopLe(duLieu), soSanPham: duLieu.length };
  });
  if (b1.trung) return b1.trung;
  const { ncc, heThong, nguoiDung, nenTang, gia, luotId, giaThat } = b1;

  // Bước 2 — gọi mô hình NGOÀI giao dịch. Không công cụ: chỉ nhận chữ.
  let chu = "";
  let tokenVao: number | null = null;
  let tokenRa: number | null = null;
  let model: string | null = ncc.model;
  let loiGoi: LoiNghiepVu | null = null;
  try {
    const ph = await ncc.goi({ heThong, tinNhan: [{ vaiTro: "nguoi-dung", noiDung: nguoiDung }], congCu: [], toiDaToken: TOI_DA_TOKEN_RA });
    tokenVao = ph.tokensIn;
    tokenRa = ph.tokensOut;
    model = ph.model ?? model;
    chu = ph.khoi.filter((k) => k.loai === "van-ban").map((k) => (k as { noiDung: string }).noiDung).join("\n");
  } catch (e) {
    const ma = e instanceof LoiNhaCungCapAI ? e.ma : "loi-goi";
    // Không đưa chi tiết lỗi của nhà cung cấp ra ngoài (có thể chứa lại một phần lời nhắc).
    loiGoi = new LoiNghiepVu(`Chưa gọi được AI (${e instanceof LoiNhaCungCapAI ? e.message : "lỗi không rõ"}). Không có bài nào được tạo — thử lại sau ít phút.`, 502, "ai-loi-goi", { ma });
  }

  // Bước 3 — ghi kết quả lượt AI + tạo bài nháp do AI tạo.
  const ketQua = await nb.giaoDich(async (nc) => {
    const chiPhi = tokenVao !== null || tokenRa !== null ? chiPhiVnd(tokenVao ?? 0, tokenRa ?? 0, gia) : null;
    if (loiGoi) {
      await ghiKetQuaLuotAI(nc.tx, luotId, { trangThai: "loi", tokenVao, tokenRa, chiPhiVnd: chiPhi, nhaCungCap: ncc.ten, model, maLoi: String((loiGoi.chiTiet as { ma?: string } | undefined)?.ma ?? "loi-goi") }, new Date());
      await nc.kiemToan({ action: "ai-viet-bai-mxh-loi", objectType: "social_post", after: { luotId, ma: loiGoi.ma } });
      return { loi: loiGoi };
    }
    let kq;
    try {
      kq = docKetQuaAI(chu, nenTang, giaThat);
    } catch (e) {
      if (!(e instanceof LoiKetQuaAI)) throw e;
      await ghiKetQuaLuotAI(nc.tx, luotId, { trangThai: "loi", tokenVao, tokenRa, chiPhiVnd: chiPhi, nhaCungCap: ncc.ten, model, maLoi: "ket-qua-hong" }, new Date());
      await nc.kiemToan({ action: "ai-viet-bai-mxh-loi", objectType: "social_post", after: { luotId, ma: "ket-qua-hong" } });
      return { loi: new LoiNghiepVu(`${e.message} (Lượt này vẫn tính vào ngân sách AI.)`, 502, "ai-ket-qua-hong") };
    }
    const kenh = await nc.tx.socialConnection.findMany({ where: { id: { in: d.kenhIds } }, select: { id: true, platform: true } });
    const bienThe = kenh.flatMap((k) => {
      const v = kq.bienThe[k.platform as NenTang];
      return v ? [{ kenhId: k.id, tieuDe: v.tieuDe, noiDung: v.noiDung, hashtags: v.hashtags }] : [];
    });
    const duLieuBai: z.infer<typeof LuocDoBai> = {
      tieuDe: kq.tieuDe, noiDung: ganHashtag(kq.noiDung, kq.hashtags), kenhIds: d.kenhIds, khoaLapLai: d.khoaLapLai?.trim() || null,
      chienDichId: d.chienDichId ?? null, bienThe,
    };
    // QA 0.25.0 (QĐ-246): tạo bài trong SAVEPOINT — hỏng nghiệp vụ SAU khi đã gọi AI (chiến dịch vừa bị lưu trữ, kênh vừa
    // ngắt, mất quyền giữa chừng…) thì cuộn riêng phần bài, vẫn ghi lượt AI "lỗi" kèm số token thật. Trước đây cả bước cuộn
    // ngược → lượt AI treo "dang-goi" mãi (giữ chỗ ước tính tối đa, mất số token thật).
    await nc.tx.$executeRaw`SAVEPOINT ai_viet_bai_tao`;
    let bai: Awaited<ReturnType<typeof taoBai>>;
    try {
      bai = await taoBai(nc, duLieuBai, "ai");
      // Trùng khóa lặp lại với bài vừa có (hiếm — người dùng tự tạo bài cùng khóa): không gắn lượt AI này vào bài đó.
      if (bai.trung) throw new LoiNghiepVu("Khóa lặp lại đã được dùng cho một bài khác vừa tạo — thử lại.", 409, "khoa-lap-lai-trung");
    } catch (e) {
      if (!(e instanceof LoiNghiepVu) && !(e instanceof LoiThieuQuyen)) throw e;
      await nc.tx.$executeRaw`ROLLBACK TO SAVEPOINT ai_viet_bai_tao`;
      const ma = e instanceof LoiNghiepVu ? e.ma : "thieu-quyen";
      await ghiKetQuaLuotAI(nc.tx, luotId, { trangThai: "loi", tokenVao, tokenRa, chiPhiVnd: chiPhi, nhaCungCap: ncc.ten, model, maLoi: `tao-bai:${ma}` }, new Date());
      await nc.kiemToan({ action: "ai-viet-bai-mxh-loi", objectType: "social_post", after: { luotId, ma: `tao-bai:${ma}` } });
      return { loi: e };
    }
    await nc.tx.$executeRaw`RELEASE SAVEPOINT ai_viet_bai_tao`;
    await ghiKetQuaLuotAI(nc.tx, luotId, { trangThai: "xong", tokenVao, tokenRa, chiPhiVnd: chiPhi, nhaCungCap: ncc.ten, model }, new Date());
    await nc.tx.socialPost.update({ where: { id: bai.id }, data: { aiUsageId: luotId } });
    await nc.tx.socialPostReview.create({ data: { tenantId: nc.tenantId, postId: bai.id, action: "ai-tao", actorId: nc.hoSo.userId, note: `AI soạn từ ${b1.soSanPham} sản phẩm — nháp, ${(await docCauHinhMxh(nc.tx)).aiPhaiDuyet ? "phải duyệt trước khi đăng" : "kiểm kỹ trước khi đăng"}` } });
    // Kiểm toán ghi số liệu, KHÔNG ghi lời nhắc / dữ liệu sản phẩm / nội dung AI viết.
    await nc.kiemToan({ action: "ai-viet-bai-mxh", objectType: "social_post", objectId: bai.id, after: { luotId, soSanPham: b1.soSanPham, sanPhamIds: d.sanPhamIds, soKenh: d.kenhIds.length, tokenVao, tokenRa, chiPhiVnd: chiPhi, canhBao: kq.canhBao.length } });
    return { bai: { ...(await chiTietBai(nc, bai.id)), trung: false, canhBaoAi: kq.canhBao } };
  });
  if ("loi" in ketQua && ketQua.loi) throw ketQua.loi;
  return (ketQua as { bai: Awaited<ReturnType<typeof chiTietBai>> & { trung: boolean; canhBaoAi: string[] } }).bai;
}
