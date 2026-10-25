import { createHash } from "node:crypto";
import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { docBangCsv } from "@/lib/csv";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docCauHinh } from "@/modules/cau-hinh/service";
import {
  cheEmail,
  docThoiDiem,
  laEmailHopLe,
  NHAN_HANH_DONG_DONG_Y,
  NHAN_LY_DO_LOAI,
  NHAN_NGUON_DONG_Y,
  type HanhDongDongY,
  type KetQuaLoc,
  type NguonDongY,
} from "./tinh-toan";

/**
 * Sổ đồng ý nhận thư quảng cáo — BUSINESS_RULES.md mục 29 (EG-08, EG-09), QĐ-96.
 *
 * Bảng `email_consents` **chỉ ghi thêm**: mỗi lần đồng ý / rút / phản đối là một dòng có căn cứ, thời
 * điểm, người ghi. Trạng thái hiện hành của một email = dòng mới nhất (theo thời điểm xảy ra, rồi lúc
 * ghi). Cờ cũ `marketing_opt_in` / `marketing_opt_out_at` trên lead / liên hệ và danh sách chặn được
 * giữ **khớp** với sổ: rút / phản đối luôn bật từ chối trên mọi lead / liên hệ cùng email và đưa email
 * vào danh sách chặn; đồng ý lại sau khi đã từ chối chỉ qua đường ghi tay có căn cứ + xác nhận.
 */

export const MUC_DICH_QUANG_CAO = "quang-cao-email";

/** Cờ `marketing_consent_source` ghi lên lead / liên hệ — giữ nguyên chữ cũ của EM-10 cho huỷ nhận tin. */
function nguonCot(nguon: NguonDongY): string {
  if (nguon === "huy-nhan-tin") return "huy-nhan-tin-email";
  if (nguon === "bao-rac") return "bao-rac-email";
  return `so-dong-y:${nguon}`;
}

/** Trạng thái hiện hành của nhiều email (đã chuẩn hóa chữ thường). Email chưa có dòng nào thì không có trong bản đồ. */
export async function trangThaiDongYCuaNhieu(tx: ClientTenant, emails: string[]): Promise<Map<string, { hanhDong: HanhDongDongY; luc: Date }>> {
  const ban = new Map<string, { hanhDong: HanhDongDongY; luc: Date }>();
  const ds = [...new Set(emails.filter(Boolean).map((e) => e.trim().toLowerCase()))];
  for (let i = 0; i < ds.length; i += 5000) {
    const dong = await tx.$queryRaw<{ email: string; action: HanhDongDongY; occurred_at: Date }[]>`
      SELECT DISTINCT ON (email) email, action, occurred_at
      FROM email_consents
      WHERE purpose = ${MUC_DICH_QUANG_CAO} AND email = ANY(${ds.slice(i, i + 5000)}::text[])
      ORDER BY email, occurred_at DESC, recorded_at DESC, id DESC`;
    for (const d of dong) ban.set(d.email, { hanhDong: d.action, luc: d.occurred_at });
  }
  return ban;
}

export interface DuLieuGhiDongY {
  email: string;
  hanhDong: HanhDongDongY;
  nguon: NguonDongY;
  canCu: string;
  thamChieu?: string | null;
  luc?: Date;
  nguoiId?: string | null;
  nguoiEmail?: string | null;
  ip?: string | null;
  leadId?: string | null;
  contactId?: string | null;
}

/**
 * Ghi một dòng vào sổ và đồng bộ cờ cũ. Gọi trong giao dịch của đúng doanh nghiệp. Hai lần ghi cùng
 * email chạy cùng lúc xếp hàng nhau (khóa tư vấn theo email) để "trạng thái trước" luôn đúng.
 * Trả trạng thái TRƯỚC khi ghi để bên gọi biết có đổi thật không (vd chỉ gửi thư xác nhận từ chối một lần).
 */
export async function ghiSoDongY(tx: ClientTenant, tenantId: string, d: DuLieuGhiDongY): Promise<{ id: string; truoc: HanhDongDongY | null; truocLuc: Date | null }> {
  const email = d.email.trim().toLowerCase();
  if (!laEmailHopLe(email)) throw new LoiDinhDang("email", "Email không hợp lệ.");
  const canCu = d.canCu.trim().slice(0, 4000);
  if (canCu.length < (d.hanhDong === "dong-y" ? 10 : 2)) throw new LoiDinhDang("canCu", "Ghi căn cứ (tối thiểu 10 ký tự) cho lần đồng ý.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cowork:dong-y:${tenantId}:${email}`}))`;
  const truoc = (await trangThaiDongYCuaNhieu(tx, [email])).get(email) ?? null;
  const luc = d.luc ?? new Date();
  // Từ chối luôn thắng (MK-13): rút / phản đối mang thời điểm KHÔNG sau lần đồng ý đang hiệu lực (vd sự
  // kiện báo rác của SES tới trễ, thời điểm SES cũ hơn một lần đồng ý vừa ghi) vẫn phải là trạng thái hiện
  // hành của sổ — nếu không, sổ hiện "Đồng ý" trong khi cờ cũ / danh sách chặn đã từ chối. Khi đó dòng
  // sổ ghi theo lúc nhận, thời điểm gốc giữ trong căn cứ. Bằng thời điểm thì dòng ghi sau đã thắng nhờ
  // recorded_at. QA 0.18.0.
  const tuChoi = d.hanhDong === "rut" || d.hanhDong === "phan-doi";
  const lucSo = tuChoi && truoc?.hanhDong === "dong-y" && luc.getTime() < truoc.luc.getTime() ? new Date(Math.max(Date.now(), truoc.luc.getTime() + 1)) : luc;
  const canCuSo = lucSo === luc ? canCu : `${canCu} (thời điểm gốc ${luc.toISOString()}, sớm hơn lần đồng ý đang hiệu lực — ghi theo lúc nhận)`.slice(0, 4000);
  const dong = await tx.emailConsent.create({
    data: {
      tenantId,
      email,
      purpose: MUC_DICH_QUANG_CAO,
      action: d.hanhDong,
      source: d.nguon,
      evidence: canCuSo,
      evidenceRef: d.thamChieu?.slice(0, 255) ?? null,
      occurredAt: lucSo,
      actorId: d.nguoiId ?? null,
      actorEmail: d.nguoiEmail?.slice(0, 255) ?? null,
      ipAddress: d.ip?.slice(0, 45) ?? null,
      leadId: d.leadId ?? null,
      contactId: d.contactId ?? null,
    },
    select: { id: true },
  });
  if (d.hanhDong === "rut" || d.hanhDong === "phan-doi") await apDungTuChoi(tx, tenantId, email, luc, d.nguon, d.hanhDong);
  else await apDungDongY(tx, tenantId, email, luc, d.nguon, truoc !== null && truoc.hanhDong !== "dong-y");
  return { id: dong.id, truoc: truoc?.hanhDong ?? null, truocLuc: truoc?.luc ?? null };
}

/** Rút / phản đối: từ chối trên mọi lead + liên hệ cùng email (tắt đồng ý — MK-13) và đưa vào danh sách chặn. */
async function apDungTuChoi(tx: ClientTenant, tenantId: string, email: string, luc: Date, nguon: NguonDongY, hanhDong: "rut" | "phan-doi") {
  const tuChoi = { marketingOptOutAt: luc, marketingOptIn: false, marketingConsentSource: nguonCot(nguon) };
  await tx.lead.updateMany({ where: { emailNormalized: email, marketingOptOutAt: null }, data: tuChoi });
  await tx.contact.updateMany({ where: { emailNormalized: email, marketingOptOutAt: null }, data: tuChoi });
  const lyDo = hanhDong === "phan-doi" ? "bao-rac" : "huy-nhan-tin";
  const cu = await tx.emailSuppression.findFirst({ where: { email }, select: { id: true, reason: true, status: true } });
  if (!cu) {
    await tx.emailSuppression.create({ data: { tenantId, email, reason: lyDo, note: `Sổ đồng ý: ${NHAN_NGUON_DONG_Y[nguon]}` } });
  } else if (cu.status !== "hoat-dong" || (cu.reason !== "email-hong" && cu.reason !== "bao-rac")) {
    // Email hỏng vẫn là email hỏng (chặn vĩnh viễn); báo rác không bị hạ xuống "huỷ nhận tin".
    await tx.emailSuppression.update({ where: { id: cu.id }, data: { reason: cu.status === "hoat-dong" && cu.reason === "email-hong" ? "email-hong" : lyDo, status: "hoat-dong" } });
  }
}

/**
 * Đồng ý: bật `marketing_opt_in` trên lead / liên hệ cùng email chưa từ chối. Đồng ý **lại sau khi đã
 * từ chối** (chỉ đường ghi tay có xác nhận gọi tới đây) thì gỡ từ chối trên lead / liên hệ và gỡ dòng
 * chặn "huỷ nhận tin" / "báo rác" — không bao giờ gỡ "email hỏng".
 */
async function apDungDongY(tx: ClientTenant, _tenantId: string, email: string, luc: Date, nguon: NguonDongY, laiSauTuChoi: boolean) {
  const dongY = { marketingOptIn: true, marketingOptInAt: luc, marketingOptOutAt: null, marketingConsentSource: nguonCot(nguon) };
  if (laiSauTuChoi) {
    await tx.lead.updateMany({ where: { emailNormalized: email }, data: dongY });
    await tx.contact.updateMany({ where: { emailNormalized: email }, data: dongY });
    await tx.emailSuppression.updateMany({ where: { email, reason: { in: ["huy-nhan-tin", "bao-rac"] }, status: "hoat-dong" }, data: { status: "go-bo", note: "Đồng ý lại có căn cứ (sổ đồng ý)" } });
  } else {
    await tx.lead.updateMany({ where: { emailNormalized: email, marketingOptOutAt: null, marketingOptIn: false }, data: dongY });
    await tx.contact.updateMany({ where: { emailNormalized: email, marketingOptOutAt: null, marketingOptIn: false }, data: dongY });
  }
}

/** `email.bat_buoc_dong_y` (mặc định 1 = bật). */
export async function batBuocDongY(tx: ClientTenant): Promise<boolean> {
  return ((await docCauHinh(tx, "email.bat_buoc_dong_y")) ?? 1) >= 1;
}

/**
 * EG-09: lúc chốt người nhận, loại người chưa có "Đồng ý" còn hiệu lực trong sổ (khi bật bắt buộc).
 * Trả kết quả lọc mới — người bị loại mang lý do `chua-dong-y`.
 */
export async function locTheoSoDongY<T extends KetQuaLoc>(tx: ClientTenant, kq: T): Promise<T> {
  if (!(await batBuocDongY(tx))) return kq;
  const tt = await trangThaiDongYCuaNhieu(tx, kq.hopLe.map((u) => u.email));
  const hopLe: KetQuaLoc["hopLe"] = [];
  const biLoai = [...kq.biLoai];
  for (const u of kq.hopLe) {
    if (tt.get(u.email)?.hanhDong === "dong-y") hopLe.push(u);
    else biLoai.push({ ...u, lyDo: "chua-dong-y" });
  }
  return { ...kq, hopLe, biLoai };
}

// ---------------------------------------------------------------------------
// Màn hình Sổ đồng ý
// ---------------------------------------------------------------------------

export const LuocDoGhiTayDongY = z.object({
  email: z.string().trim().toLowerCase().max(254).refine(laEmailHopLe, "Email không hợp lệ."),
  hanhDong: z.enum(["dong-y", "rut", "phan-doi"]),
  canCu: z.string().trim().min(10, "Ghi căn cứ (tối thiểu 10 ký tự): người đó đồng ý / từ chối ở đâu, lúc nào, bằng chứng lưu ở đâu.").max(4000),
  /** "yyyy-mm-ddThh:mm" giờ Việt Nam hoặc trống = bây giờ. */
  thoiDiem: z.string().trim().max(40).default(""),
  /** Đồng ý lại sau khi người đó đã rút / phản đối — phải tích xác nhận. */
  xacNhanSauTuChoi: z.boolean().default(false),
});
export type DuLieuGhiTayDongY = z.infer<typeof LuocDoGhiTayDongY>;

function docThoiDiemNhap(s: string, bayGio: Date): Date {
  if (!s) return bayGio;
  const d = docThoiDiem(s.replace("T", " "));
  if (!d) throw new LoiDinhDang("thoiDiem", "Thời điểm không hợp lệ.");
  if (d.getTime() > bayGio.getTime() + 5 * 60_000) throw new LoiDinhDang("thoiDiem", "Thời điểm không được ở tương lai.");
  return d;
}

/** Ghi tay một dòng (đồng ý có căn cứ, rút, phản đối). Quyền `marketing.update`. */
export async function ghiTayDongY(nc: NguCanh, d: DuLieuGhiTayDongY) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "email_consent" });
  const bayGio = new Date();
  const luc = docThoiDiemNhap(d.thoiDiem, bayGio);
  if (d.hanhDong === "dong-y") {
    const hien = (await trangThaiDongYCuaNhieu(nc.tx, [d.email])).get(d.email);
    if (hien && hien.hanhDong !== "dong-y") {
      if (!d.xacNhanSauTuChoi) {
        throw new LoiNghiepVu(
          `Người này đã ${hien.hanhDong === "rut" ? "rút đồng ý" : "báo thư rác"} lúc trước. Chỉ ghi đồng ý lại khi có căn cứ rõ ràng người đó đồng ý lại — tích ô xác nhận.`,
          409,
          "can-xac-nhan-sau-tu-choi",
        );
      }
      if (luc.getTime() <= hien.luc.getTime()) throw new LoiDinhDang("thoiDiem", "Thời điểm đồng ý lại phải sau lần từ chối gần nhất.");
    }
  } else if (d.thoiDiem) {
    // Rút / phản đối ghi lùi về TRƯỚC lần đồng ý đang hiệu lực thì không còn là trạng thái hiện hành — sổ
    // sẽ vẫn hiện "Đồng ý" trong khi lead / danh sách chặn đã từ chối. Người ghi phải chọn thời điểm sau
    // lần đồng ý đó (hoặc để trống = bây giờ). QA 0.18.0.
    const hien = (await trangThaiDongYCuaNhieu(nc.tx, [d.email])).get(d.email);
    if (hien?.hanhDong === "dong-y" && luc.getTime() < hien.luc.getTime()) {
      throw new LoiDinhDang("thoiDiem", `Thời điểm từ chối không được trước lần đồng ý gần nhất (${dinhDangNgayGio(hien.luc)}). Để trống nếu khách vừa từ chối.`);
    }
  }
  const kq = await ghiSoDongY(nc.tx, nc.tenantId, {
    email: d.email,
    hanhDong: d.hanhDong,
    nguon: "nhap-tay",
    canCu: d.canCu,
    luc,
    nguoiId: nc.hoSo.userId,
    nguoiEmail: nc.hoSo.email,
    ip: nc.ip,
  });
  await nc.kiemToan({ action: "ghi-dong-y", objectType: "email_consent", objectId: kq.id, before: { trangThai: kq.truoc }, after: { email: cheEmail(d.email), hanhDong: d.hanhDong, luc: luc.toISOString() } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CONSENT_RECORDED, objectType: "email_consent", objectId: kq.id, payload: { hanhDong: d.hanhDong, nguon: "nhap-tay", truoc: kq.truoc } });
  return { id: kq.id, truoc: kq.truoc, sau: d.hanhDong };
}

export const LuocDoNhapCsvDongY = z.object({
  noiDung: z.string().min(1, "Tệp trống.").max(2_000_000, "Tệp quá 2 MB — chia nhỏ rồi nhập."),
  chiKiemTra: z.boolean().default(false),
});

const COT_CSV = [
  { truong: "email", ten: ["email", "e-mail", "địa chỉ email"], batBuoc: true },
  { truong: "nguon", ten: ["nguồn", "nguon"], batBuoc: true },
  { truong: "canCu", ten: ["căn cứ", "can cu", "bằng chứng", "bang chung"], batBuoc: true },
  { truong: "thoiDiem", ten: ["thời điểm", "thoi diem", "ngày đồng ý", "ngay dong y"], batBuoc: true },
];
const TOI_DA_DONG_CSV = 5000;

export interface DongCsvLoi {
  soDong: number;
  lyDo: string;
}

/**
 * Nhập đồng ý từ CSV (cột Email, Nguồn, Căn cứ, Thời điểm). Quyền `marketing.update`. Mỗi dòng hợp lệ
 * thành một dòng "dong-y" nguồn `nhap-csv`. **Không** ghi đồng ý cho email đã rút / phản đối — phải ghi
 * tay có xác nhận (EG-08). `chiKiemTra` = đọc thử, không ghi gì.
 */
export async function nhapCsvDongY(nc: NguCanh, d: z.infer<typeof LuocDoNhapCsvDongY>) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "email_consent" });
  const bang = docBangCsv(d.noiDung, COT_CSV);
  if (bang.thieuCot.length) throw new LoiNghiepVu(`Tệp thiếu cột: ${bang.thieuCot.join(", ")}. Cần đủ 4 cột Email, Nguồn, Căn cứ, Thời điểm.`, 422, "thieu-cot");
  if (bang.dong.length > TOI_DA_DONG_CSV) throw new LoiNghiepVu(`Tối đa ${TOI_DA_DONG_CSV} dòng mỗi lần nhập.`, 422, "qua-nhieu-dong");
  const bayGio = new Date();
  const loi: DongCsvLoi[] = [];
  const hopLe: { soDong: number; email: string; canCu: string; luc: Date }[] = [];
  const daGap = new Set<string>();
  for (const { soDong, duLieu } of bang.dong) {
    const email = (duLieu.email ?? "").trim().toLowerCase();
    const nguon = (duLieu.nguon ?? "").trim();
    const canCu = (duLieu.canCu ?? "").trim();
    const luc = docThoiDiem(duLieu.thoiDiem ?? "");
    if (!laEmailHopLe(email)) loi.push({ soDong, lyDo: "Email không hợp lệ" });
    else if (nguon.length < 2) loi.push({ soDong, lyDo: "Thiếu nguồn" });
    else if (canCu.length < 5) loi.push({ soDong, lyDo: "Căn cứ quá ngắn (tối thiểu 5 ký tự)" });
    else if (!luc) loi.push({ soDong, lyDo: "Thời điểm không hợp lệ (dd/mm/yyyy [hh:mm] hoặc yyyy-mm-dd)" });
    else if (luc.getTime() > bayGio.getTime() + 5 * 60_000) loi.push({ soDong, lyDo: "Thời điểm ở tương lai" });
    else if (daGap.has(email)) loi.push({ soDong, lyDo: "Trùng email trong tệp (giữ dòng đầu)" });
    else {
      daGap.add(email);
      hopLe.push({ soDong, email, canCu: `Nguồn: ${nguon.slice(0, 200)}. Căn cứ: ${canCu.slice(0, 2000)}`, luc });
    }
  }
  const tt = await trangThaiDongYCuaNhieu(nc.tx, hopLe.map((h) => h.email));
  const ghi: typeof hopLe = [];
  let daCo = 0;
  for (const h of hopLe) {
    const hien = tt.get(h.email);
    if (hien && hien.hanhDong !== "dong-y") loi.push({ soDong: h.soDong, lyDo: "Người này đã rút đồng ý / báo rác — chỉ ghi đồng ý lại bằng tay kèm căn cứ" });
    else if (hien && hien.luc.getTime() >= h.luc.getTime()) daCo++;
    else ghi.push(h);
  }
  loi.sort((a, b) => a.soDong - b.soDong);
  if (d.chiKiemTra) return { chiKiemTra: true, soGhi: ghi.length, soDaCo: daCo, loi: loi.slice(0, 200), soLoi: loi.length, cotLa: bang.cotLa };

  const thamChieu = `csv:${createHash("sha256").update(d.noiDung).digest("hex").slice(0, 16)}`;
  for (const h of ghi) {
    await ghiSoDongY(nc.tx, nc.tenantId, { email: h.email, hanhDong: "dong-y", nguon: "nhap-csv", canCu: h.canCu, thamChieu, luc: h.luc, nguoiId: nc.hoSo.userId, nguoiEmail: nc.hoSo.email, ip: nc.ip });
  }
  await nc.kiemToan({ action: "nhap-dong-y", objectType: "email_consent", after: { thamChieu, soGhi: ghi.length, soDaCo: daCo, soLoi: loi.length } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CONSENT_IMPORTED, objectType: "email_consent", payload: { thamChieu, soGhi: ghi.length, soLoi: loi.length } });
  return { chiKiemTra: false, soGhi: ghi.length, soDaCo: daCo, loi: loi.slice(0, 200), soLoi: loi.length, cotLa: bang.cotLa };
}

export const LuocDoLocSoDongY = z.object({
  q: z.string().trim().toLowerCase().max(254).default(""),
  trang: z.coerce.number().int().min(1).max(10_000).default(1),
});

const CO_TRANG_SO = 50;

/**
 * Xem sổ. Quyền `marketing.view`. Email hiện đủ cho người có `crm.view` hoặc `customer.view` (MK-15),
 * người khác thấy dạng che — trừ khi tự gõ đúng email cần tra.
 */
export async function xemSoDongY(nc: NguCanh, loc: z.infer<typeof LuocDoLocSoDongY>) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const xemDu = coQuyen(nc.hoSo, "crm.view") || coQuyen(nc.hoSo, "customer.view");
  const where = { purpose: MUC_DICH_QUANG_CAO, ...(loc.q && { email: loc.q.includes("@") ? loc.q : { contains: loc.q } }) };
  const [tong, ds, dem] = await Promise.all([
    nc.tx.emailConsent.count({ where }),
    nc.tx.emailConsent.findMany({ where, orderBy: [{ recordedAt: "desc" }, { id: "desc" }], skip: (loc.trang - 1) * CO_TRANG_SO, take: CO_TRANG_SO }),
    nc.tx.$queryRaw<{ action: string; so: bigint }[]>`
      SELECT action, count(*) AS so FROM (
        SELECT DISTINCT ON (email) email, action FROM email_consents WHERE purpose = ${MUC_DICH_QUANG_CAO}
        ORDER BY email, occurred_at DESC, recorded_at DESC, id DESC) t
      GROUP BY action`,
  ]);
  const hienTai = loc.q.includes("@") ? ((await trangThaiDongYCuaNhieu(nc.tx, [loc.q])).get(loc.q) ?? null) : null;
  const theoTrangThai = Object.fromEntries(dem.map((d) => [d.action, Number(d.so)])) as Partial<Record<HanhDongDongY, number>>;
  return {
    tong,
    trang: loc.trang,
    coTrang: CO_TRANG_SO,
    batBuoc: await batBuocDongY(nc.tx),
    theoTrangThai,
    hienTai: hienTai && { hanhDong: hienTai.hanhDong, nhan: NHAN_HANH_DONG_DONG_Y[hienTai.hanhDong], luc: hienTai.luc },
    dong: ds.map((r) => ({
      id: r.id,
      email: xemDu || r.email === loc.q ? r.email : cheEmail(r.email),
      hanhDong: r.action as HanhDongDongY,
      nhanHanhDong: NHAN_HANH_DONG_DONG_Y[r.action as HanhDongDongY] ?? r.action,
      nguon: r.source,
      nhanNguon: NHAN_NGUON_DONG_Y[r.source as NguonDongY] ?? r.source,
      canCu: r.evidence,
      thamChieu: r.evidenceRef,
      luc: r.occurredAt,
      ghiLuc: r.recordedAt,
      nguoiGhi: r.actorEmail,
    })),
    lyDoChua: NHAN_LY_DO_LOAI["chua-dong-y"],
  };
}
