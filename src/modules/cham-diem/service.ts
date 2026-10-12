import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { locTheoPhamVi } from "@/modules/crm/chung";
import { chamDiem, chuanHoaDiemNguon, hangDiem, type CauHinhDiem, type DuKienDiem } from "./tinh-toan";

/**
 * Chấm điểm khách tiềm năng — BUSINESS_RULES.md mục 21 (KHN-08, KHN-09). QĐ-49.
 *
 * Đối tượng chấm là **khách hàng** (không phải lead): khách mang đủ tín hiệu thật — tương tác,
 * cơ hội, báo giá, đơn — còn lead ở Cowork chỉ là bước đệm ngắn trước khi chuyển đổi.
 *
 * Điểm lưu trên `customers.lead_score` để sắp xếp / lọc phía máy chủ; phần diễn giải
 * tính lại lúc xem (không lưu JSON diễn giải). Tính lại khi có sự kiện liên quan
 * (`tinhLaiDiemKhach`) và bằng nút "Tính lại toàn bộ" của quản lý.
 */

/** Khóa `tenant_settings` giữ bảng điểm theo nguồn khách (cách làm của QĐ-22: tiền tố riêng). */
export const KHOA_DIEM_NGUON = "cham_diem.nguon";

export async function docCauHinhDiem(tx: ClientTenant): Promise<CauHinhDiem> {
  const so = async (k: string) => (await docCauHinh(tx, `diem_khach.${k}`)) ?? 0;
  const dong = await tx.tenantSetting.findFirst({ where: { key: KHOA_DIEM_NGUON, status: "hoat-dong" }, select: { value: true } });
  return {
    soNgayTuongTac: await so("so_ngay_tuong_tac"),
    diemMoiTuongTac: await so("diem_moi_tuong_tac"),
    tuongTacToiDa: await so("tuong_tac_toi_da"),
    diemMoiLanGap: await so("diem_moi_lan_gap"),
    gapToiDa: await so("gap_toi_da"),
    soNgayImLang: await so("so_ngay_im_lang"),
    diemTruImLang: await so("diem_tru_im_lang"),
    diemCoHoiMo: await so("diem_co_hoi_mo"),
    diemBaoGia: await so("diem_bao_gia"),
    soNgayBaoGia: await so("so_ngay_bao_gia"),
    diemDaMua: await so("diem_da_mua"),
    diemDuLienHe: await so("diem_du_lien_he"),
    nguongNong: await docCauHinh(tx, "diem_khach.nguong_nong"),
    nguongAm: await docCauHinh(tx, "diem_khach.nguong_am"),
    diemNguon: chuanHoaDiemNguon(dong?.value),
  };
}

interface DongDuKien {
  id: string;
  created_at: Date;
  status: string;
  source: string | null;
  ten_nguon: string | null;
  loai: string | null;
  ten_hanh_trinh: string | null;
  du_lien_he: boolean;
  so_tt: number;
  so_gap: number;
  tt_cuoi: Date | null;
  so_ch: number;
  so_bg: number;
  da_mua: boolean;
}

/**
 * Gom tín hiệu cho một danh sách khách (hoặc toàn bộ khi `ids` null) bằng MỘT truy vấn có
 * tham số. Chạy trong giao dịch tenant nên RLS tự giới hạn doanh nghiệp.
 */
async function gomDuKien(tx: ClientTenant, cfg: CauHinhDiem, ids: string[] | null, bayGio: Date): Promise<Map<string, DuKienDiem>> {
  const tuTt = new Date(bayGio.getTime() - cfg.soNgayTuongTac * 86_400_000);
  const tuBg = new Date(bayGio.getTime() - cfg.soNgayBaoGia * 86_400_000);
  const dong = await tx.$queryRaw<DongDuKien[]>`
    SELECT c.id::text AS id, c.created_at, c.status, c.source,
           (SELECT m.name FROM master_data_items m WHERE m.type = 'nguon_lead' AND m.code = c.source LIMIT 1) AS ten_nguon,
           s.kind AS loai, s.name AS ten_hanh_trinh,
           (c.phone_normalized IS NOT NULL OR c.email_normalized IS NOT NULL OR EXISTS (
              SELECT 1 FROM contacts ct WHERE ct.customer_id = c.id AND ct.status = 'hoat-dong'
                AND (ct.phone_normalized IS NOT NULL OR ct.email_normalized IS NOT NULL))) AS du_lien_he,
           (SELECT count(*)::int FROM interactions i WHERE i.customer_id = c.id AND i.status = 'hoat-dong' AND i.occurred_at >= ${tuTt}) AS so_tt,
           (SELECT count(*)::int FROM interactions i WHERE i.customer_id = c.id AND i.status = 'hoat-dong' AND i.occurred_at >= ${tuTt}
              AND i.type IN ('meeting', 'visit')) AS so_gap,
           (SELECT max(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id AND i.status = 'hoat-dong') AS tt_cuoi,
           (SELECT count(*)::int FROM opportunities o WHERE o.customer_id = c.id AND o.status = 'hoat-dong'
              AND o.stage IN ('OPPORTUNITY', 'QUOTATION', 'NEGOTIATION')) AS so_ch,
           (SELECT count(*)::int FROM quotations q JOIN quotation_versions v ON v.id = q.current_version_id
              WHERE q.customer_id = c.id AND q.status IN ('SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED') AND v.sent_at >= ${tuBg}) AS so_bg,
           EXISTS (SELECT 1 FROM sales_orders so WHERE so.customer_id = c.id
              AND so.status IN ('CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED')) AS da_mua
    FROM customers c
    LEFT JOIN customer_journey_stages s ON s.id = c.journey_stage_id
    WHERE (${ids === null}::boolean OR c.id = ANY(${ids ?? []}::uuid[]))
  `;
  return new Map(
    dong.map((d) => [
      d.id,
      {
        bayGio,
        taoLuc: d.created_at,
        trangThai: d.status,
        loaiHanhTrinh: d.loai,
        tenHanhTrinh: d.ten_hanh_trinh,
        nguon: d.source,
        tenNguon: d.ten_nguon,
        soTuongTac: Number(d.so_tt),
        soGap: Number(d.so_gap),
        tuongTacGanNhat: d.tt_cuoi,
        soCoHoiMo: Number(d.so_ch),
        soBaoGiaGanDay: Number(d.so_bg),
        daMua: d.da_mua,
        duLienHe: d.du_lien_he,
      } satisfies DuKienDiem,
    ]),
  );
}

async function ghiDiem(tx: ClientTenant, id: string, diem: number | null) {
  // SQL thô có chủ đích: không đụng `updated_at` — tính lại điểm không phải là "sửa khách".
  if (diem === null) await tx.$executeRaw`UPDATE customers SET lead_score = NULL, lead_score_at = NULL WHERE id = ${id}::uuid`;
  else await tx.$executeRaw`UPDATE customers SET lead_score = ${diem}, lead_score_at = now() WHERE id = ${id}::uuid`;
}

/**
 * Tính lại điểm một khách — gọi từ các service sau khi có sự kiện liên quan (tương tác,
 * cơ hội, báo giá, đơn, liên hệ). Không kiểm quyền riêng: là hệ quả của thao tác đã được phép.
 */
export async function tinhLaiDiemKhach(tx: ClientTenant, khachId: string): Promise<number | null> {
  const cfg = await docCauHinhDiem(tx);
  const f = (await gomDuKien(tx, cfg, [khachId], new Date())).get(khachId);
  if (!f) return null;
  const { diem } = chamDiem(f, cfg);
  await ghiDiem(tx, khachId, diem);
  return diem;
}

/** Nút "Tính lại toàn bộ" — quản lý (`customer.approve`). */
export async function tinhLaiToanBo(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "customer" });
  const cfg = await docCauHinhDiem(nc.tx);
  const duKien = await gomDuKien(nc.tx, cfg, null, new Date());
  let soDoi = 0;
  const cu = new Map((await nc.tx.customer.findMany({ select: { id: true, leadScore: true } })).map((k) => [k.id, k.leadScore]));
  for (const [id, f] of duKien) {
    const { diem } = chamDiem(f, cfg);
    if (cu.get(id) !== diem) soDoi++;
    await ghiDiem(nc.tx, id, diem);
  }
  await nc.kiemToan({ action: "tinh-lai-diem", objectType: "customer", after: { soKhach: duKien.size, soDoi } });
  await nc.suKien({ eventType: SU_KIEN.CUSTOMER_SCORES_RECALCULATED, objectType: "customer", payload: { soKhach: duKien.size, soDoi } });
  return { soKhach: duKien.size, soDoi };
}

/** Điểm + diễn giải của một khách cho trang Customer 360. Kiểm phạm vi xem. */
export async function diemCuaKhach(nc: NguCanh, khachId: string) {
  batBuocQuyen(nc.hoSo, "customer.view", { objectType: "customer", objectId: khachId });
  const k = await nc.tx.customer.findFirst({
    where: { id: khachId, ...(await locTheoPhamVi(nc, "customer.view")) },
    select: { id: true, leadScore: true, leadScoreAt: true },
  });
  if (!k) throw new LoiKhongTimThay("Khách hàng");
  const cfg = await docCauHinhDiem(nc.tx);
  const f = (await gomDuKien(nc.tx, cfg, [khachId], new Date())).get(khachId)!;
  const tinh = chamDiem(f, cfg);
  return {
    diemLuu: k.leadScore,
    tinhLuc: k.leadScoreAt,
    diemHienTai: tinh.diem,
    phan: tinh.phan,
    hang: hangDiem(k.leadScore ?? tinh.diem, cfg.nguongNong, cfg.nguongAm),
    nguong: { nong: cfg.nguongNong, am: cfg.nguongAm },
  };
}

// ---------------------------------------------------------------------------
// Bảng điểm theo nguồn khách — màn hình "Chấm điểm khách" (setting.update để sửa)
// ---------------------------------------------------------------------------

export async function xemCauHinhDiem(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "customer.view");
  const cfg = await docCauHinhDiem(nc.tx);
  const nguon = await nc.tx.masterDataItem.findMany({
    where: { type: "nguon_lead" },
    select: { code: true, name: true, status: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const phanBo = await nc.tx.customer.groupBy({
    by: ["leadScore"],
    where: { ...(await locTheoPhamVi(nc, "customer.view")), status: { notIn: ["da-gop", "ngung-giao-dich"] } },
    _count: { _all: true },
  });
  let nong = 0;
  let am = 0;
  let lanh = 0;
  let chuaCo = 0;
  for (const p of phanBo) {
    const h = hangDiem(p.leadScore, cfg.nguongNong, cfg.nguongAm);
    if (p.leadScore === null) chuaCo += p._count._all;
    else if (h === "nong") nong += p._count._all;
    else if (h === "am") am += p._count._all;
    else if (h === "lanh") lanh += p._count._all;
  }
  const daDat = (await nc.tx.tenantSetting.findMany({ where: { key: { startsWith: "diem_khach." } }, select: { key: true } })).map((d) => d.key);
  return {
    cauHinh: cfg,
    /** Khóa trọng số Giám đốc đã tự đặt — còn lại đang dùng mặc định (ghi rõ trên màn hình). */
    daDat,
    nguon: nguon.map((n) => ({ ma: n.code, ten: n.name, dangDung: n.status === "hoat-dong", diem: cfg.diemNguon[n.code] ?? null })),
    thongKe: { nong, am, lanh, chuaCo, coHang: cfg.nguongNong !== null && cfg.nguongAm !== null && cfg.nguongAm < cfg.nguongNong },
    quyen: { suaCauHinh: coQuyen(nc.hoSo, "setting.update"), tinhLai: coQuyen(nc.hoSo, "customer.approve") },
  };
}

export async function luuDiemNguon(nc: NguCanh, diem: Record<string, number | null>) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "setting" });
  const maHopLe = new Set((await nc.tx.masterDataItem.findMany({ where: { type: "nguon_lead" }, select: { code: true } })).map((m) => m.code));
  const moi: Record<string, number> = {};
  for (const [ma, d] of Object.entries(diem)) {
    if (!maHopLe.has(ma)) throw new LoiNghiepVu(`Nguồn "${ma}" không có trong Dữ liệu gốc.`, 422, "nguon-la");
    if (d === null) continue;
    if (!Number.isInteger(d) || d < 0 || d > 100) throw new LoiNghiepVu("Điểm mỗi nguồn là số nguyên từ 0 đến 100.", 422, "diem-sai");
    moi[ma] = d;
  }
  const cu = await nc.tx.tenantSetting.findFirst({ where: { key: KHOA_DIEM_NGUON }, select: { value: true } });
  await nc.tx.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: nc.tenantId, key: KHOA_DIEM_NGUON } },
    update: { value: moi, status: "hoat-dong", updatedBy: nc.hoSo.userId },
    create: { tenantId: nc.tenantId, key: KHOA_DIEM_NGUON, value: moi, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "setting", before: { khoa: KHOA_DIEM_NGUON, giaTri: cu?.value ?? null }, after: { khoa: KHOA_DIEM_NGUON, giaTri: moi } });
  await nc.suKien({ eventType: SU_KIEN.SETTING_CHANGED, objectType: "setting", payload: { khoa: KHOA_DIEM_NGUON } });
  return { diemNguon: moi };
}
