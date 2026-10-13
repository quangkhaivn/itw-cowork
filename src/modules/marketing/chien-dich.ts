import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { dateVeNgay, kiemTraNguoiPhuTrach, ngayVeDate, tienVeChuoi, trongPhamVi } from "@/modules/crm/chung";
import { baoChoNguoiCoQuyen, taoThongBao } from "@/modules/thong-bao/service";
import { NHAN_TRANG_THAI_CHIEN_DICH, TRANG_THAI_DA_CHAY, type TrangThaiChienDich } from "./hang-so";
import { cacBuocKeTiep, canDuyetNganSach, chuanHoaUtmCampaign, chuyenTrangThaiHopLe, congChiSo, tinhChiSoChienDich, type DauVaoChiSo } from "./tinh-toan";
import { cheLienLac, locMarketing } from "./chung";
import type { BoLocChienDich, DuLieuChiPhi, DuLieuChienDich, DuLieuSuaChienDich } from "./luoc-do";

/**
 * Chiến dịch marketing và chi phí. Luật MK-01 → MK-05 (BUSINESS_RULES.md mục 22).
 * Quyền `marketing.*`, phạm vi theo `marketing_campaigns.owner_id`.
 */

const CHON = {
  id: true, code: true, name: true, channel: true, utmCampaign: true, startDate: true, endDate: true, budget: true,
  targetLeads: true, ownerId: true, status: true, approvedBudget: true, approvedBy: true, approvedAt: true,
  cancelReason: true, note: true, createdAt: true, updatedAt: true,
  owner: { select: { id: true, fullName: true } },
} satisfies Prisma.MarketingCampaignSelect;
type BanGhi = Prisma.MarketingCampaignGetPayload<{ select: typeof CHON }>;

function chuyenDoi(c: BanGhi) {
  return {
    id: c.id,
    ma: c.code,
    ten: c.name,
    kenh: c.channel,
    utmCampaign: c.utmCampaign,
    ngayBatDau: dateVeNgay(c.startDate) || null,
    ngayKetThuc: dateVeNgay(c.endDate) || null,
    nganSach: tienVeChuoi(c.budget) ?? "0",
    mucTieuLead: c.targetLeads,
    trangThai: c.status as TrangThaiChienDich,
    nganSachDaDuyet: tienVeChuoi(c.approvedBudget),
    duyetLuc: c.approvedAt,
    lyDoHuy: c.cancelReason,
    ghiChu: c.note,
    taoLuc: c.createdAt,
    suaLuc: c.updatedAt,
    nguoiPhuTrach: { id: c.owner.id, hoTen: c.owner.fullName },
  };
}
export type ChienDich = ReturnType<typeof chuyenDoi>;

function anhChup(c: ChienDich) {
  const { taoLuc: _a, suaLuc: _b, nguoiPhuTrach, ...con } = c;
  void _a;
  void _b;
  return { ...con, nguoiPhuTrachId: nguoiPhuTrach.id };
}

/** Mốc đầu ngày giờ Việt Nam của "yyyy-mm-dd" → Date UTC. */
function dauNgayVN(s: string): Date {
  return new Date(`${s}T00:00:00+07:00`);
}
function sauNgayVN(s: string): Date {
  return new Date(dauNgayVN(s).getTime() + 86_400_000);
}

// ---------------------------------------------------------------------------
// Chỉ số (MK-05) — một hàm cho danh sách, chi tiết và bảng điều hành
// ---------------------------------------------------------------------------

export interface KyChiSo {
  tuNgay?: string;
  denNgay?: string;
}

/**
 * Đầu vào chỉ số cho nhiều chiến dịch một lúc. Đếm toàn doanh nghiệp — chỉ số chiến dịch
 * là con số tổng hợp, không lộ chi tiết bản ghi nào (QĐ-59).
 * - Lead: lead gắn chiến dịch, tạo trong kỳ. Đủ điều kiện = đang QUALIFIED hoặc đã CONVERTED.
 * - Doanh thu: hóa đơn ĐÃ PHÁT HÀNH của khách mang chiến dịch (chạm đầu tiên — MK-10), theo QĐ-29.
 * - Giá trị cơ hội thắng: cơ hội WON mang chiến dịch — chỉ để tham khảo, KHÔNG cộng vào ROAS.
 */
export async function dauVaoChiSo(nc: NguCanh, ids: string[], ky: KyChiSo = {}): Promise<Map<string, Required<DauVaoChiSo>>> {
  const kq = new Map<string, Required<DauVaoChiSo>>(ids.map((id) => [id, { chiPhi: 0, soLead: 0, soDuDieuKien: 0, soChuyenDoi: 0, doanhThu: 0, giaTriCoHoiThang: 0 }]));
  if (!ids.length) return kq;
  const khoangTao = {
    ...(ky.tuNgay && { gte: dauNgayVN(ky.tuNgay) }),
    ...(ky.denNgay && { lt: sauNgayVN(ky.denNgay) }),
  };
  const khoangNgay = {
    ...(ky.tuNgay && { gte: ngayVeDate(ky.tuNgay) }),
    ...(ky.denNgay && { lte: ngayVeDate(ky.denNgay) }),
  };
  const [chiPhi, lead, hoaDon, thang] = await Promise.all([
    nc.tx.marketingCost.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, status: "hoat-dong", costDate: khoangNgay }, _sum: { amount: true } }),
    nc.tx.lead.groupBy({ by: ["campaignId", "stage"], where: { campaignId: { in: ids }, createdAt: khoangTao }, _count: { _all: true } }),
    nc.tx.invoice.findMany({ where: { status: "ISSUED", customer: { campaignId: { in: ids } }, issueDate: khoangNgay }, select: { total: true, customer: { select: { campaignId: true } } } }),
    nc.tx.opportunity.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, stage: "WON", closedAt: khoangTao }, _sum: { estimatedValue: true } }),
  ]);
  for (const c of chiPhi) kq.get(c.campaignId)!.chiPhi += Number(c._sum.amount ?? 0);
  for (const l of lead) {
    const o = l.campaignId ? kq.get(l.campaignId) : undefined;
    if (!o) continue;
    o.soLead += l._count._all;
    if (l.stage === "QUALIFIED" || l.stage === "CONVERTED") o.soDuDieuKien += l._count._all;
    if (l.stage === "CONVERTED") o.soChuyenDoi += l._count._all;
  }
  for (const h of hoaDon) {
    const o = h.customer.campaignId ? kq.get(h.customer.campaignId) : undefined;
    if (o) o.doanhThu += Number(h.total);
  }
  for (const t of thang) {
    const o = t.campaignId ? kq.get(t.campaignId) : undefined;
    if (o) o.giaTriCoHoiThang += Number(t._sum.estimatedValue ?? 0);
  }
  return kq;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachChienDich(nc: NguCanh, boLoc: BoLocChienDich) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const dk: Prisma.MarketingCampaignWhereInput[] = [await locMarketing(nc)];
  if (boLoc.q) dk.push({ OR: [{ name: { contains: boLoc.q, mode: "insensitive" } }, { code: { contains: boLoc.q, mode: "insensitive" } }, { utmCampaign: { contains: boLoc.q.toLowerCase() } }] });
  if (boLoc.trangThai) dk.push({ status: boLoc.trangThai });
  if (boLoc.kenh) dk.push({ channel: boLoc.kenh });
  const ds = await nc.tx.marketingCampaign.findMany({ where: { AND: dk }, select: CHON, orderBy: [{ createdAt: "desc" }], take: 300 });
  const vao = await dauVaoChiSo(nc, ds.map((c) => c.id), { tuNgay: boLoc.tuNgay || undefined, denNgay: boLoc.denNgay || undefined });
  const dong = ds.map((c) => ({ ...chuyenDoi(c), chiSo: tinhChiSoChienDich(vao.get(c.id)!) }));
  return { dong, tong: congChiSo([...vao.values()]) };
}

async function docTrongPhamVi(nc: NguCanh, id: string, maQuyen = "marketing.view") {
  const c = await nc.tx.marketingCampaign.findFirst({ where: { id, ...(await locMarketing(nc, maQuyen)) }, select: CHON });
  if (!c) throw new LoiKhongTimThay("Chiến dịch");
  return chuyenDoi(c);
}

export async function chiTietChienDich(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.view", { objectType: "marketing_campaign", objectId: id });
  const cd = await docTrongPhamVi(nc, id);
  const [vao, chiPhi, leads, utm, forms, nguonWebhook, landing] = await Promise.all([
    dauVaoChiSo(nc, [id]),
    nc.tx.marketingCost.findMany({ where: { campaignId: id }, orderBy: [{ costDate: "desc" }, { createdAt: "desc" }], select: { id: true, costDate: true, amount: true, category: true, note: true, status: true, cancelReason: true, createdAt: true } }),
    nc.tx.lead.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, code: true, fullName: true, companyName: true, phone: true, email: true, stage: true, captureChannel: true, utmSource: true, createdAt: true, owner: { select: { fullName: true } } },
    }),
    nc.tx.lead.groupBy({ by: ["utmSource", "utmMedium"], where: { campaignId: id }, _count: { _all: true } }),
    nc.tx.marketingForm.findMany({ where: { campaignId: id }, select: { id: true, name: true, slug: true, status: true } }),
    nc.tx.marketingWebhookSource.findMany({ where: { campaignId: id }, select: { id: true, name: true, code: true, status: true } }),
    nc.tx.landingPage.findMany({ where: { campaignId: id }, select: { id: true, name: true, slug: true, status: true } }),
  ]);
  const duocSua = coQuyen(nc.hoSo, "marketing.update") && (await trongPhamVi(nc, "marketing.update", cd.nguoiPhuTrach.id));
  const coDuyet = coQuyen(nc.hoSo, "marketing.approve");
  const tuDuyetDuoc = cd.nguoiPhuTrach.id !== nc.hoSo.userId || nc.hoSo.phamVi.get("marketing.approve") === "all";
  const chiSo = tinhChiSoChienDich(vao.get(id)!);
  const daChi = chiSo.chiPhi;
  const tran = cd.nganSachDaDuyet !== null ? Number(cd.nganSachDaDuyet) : Number(cd.nganSach);
  return {
    chienDich: cd,
    chiSo,
    canDuyet: canDuyetNganSach(Number(cd.nganSach), cd.nganSachDaDuyet === null ? null : Number(cd.nganSachDaDuyet)),
    vuotNganSach: tran > 0 && daChi > tran ? daChi - tran : 0,
    chiPhi: chiPhi.map((c) => ({ id: c.id, ngay: dateVeNgay(c.costDate), soTien: c.amount.toString(), loai: c.category, ghiChu: c.note, trangThai: c.status, lyDoHuy: c.cancelReason })),
    leads: leads.map((l) =>
      cheLienLac(nc.hoSo, "lead", {
        id: l.id, ma: l.code, hoTen: l.fullName, congTy: l.companyName, dienThoai: l.phone, email: l.email, giaiDoan: l.stage, kenhNhan: l.captureChannel, utmSource: l.utmSource, taoLuc: l.createdAt, nguoiPhuTrach: l.owner.fullName,
      }),
    ),
    utm: utm.map((u) => ({ nguon: u.utmSource, kenh: u.utmMedium, soLead: u._count._all })).sort((a, b) => b.soLead - a.soLead),
    forms: forms.map((f) => ({ id: f.id, ten: f.name, slug: f.slug, trangThai: f.status })),
    nguonWebhook: nguonWebhook.map((w) => ({ id: w.id, ten: w.name, ma: w.code, trangThai: w.status })),
    landing: landing.map((p) => ({ id: p.id, ten: p.name, slug: p.slug, trangThai: p.status })),
    quyen: {
      sua: duocSua && !["ket-thuc", "huy"].includes(cd.trangThai),
      ghiChiPhi: duocSua && cd.trangThai !== "huy",
      duyet: coDuyet && cd.trangThai === "cho-duyet" && tuDuyetDuoc,
      buocKeTiep: duocSua ? cacBuocKeTiep(cd.trangThai) : [],
      xemLienLac: !leads.length || coQuyen(nc.hoSo, "crm.view"),
    },
  };
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

async function kiemTraUtm(nc: NguCanh, utm: string | null | undefined, boQuaId?: string): Promise<string | null> {
  const ma = chuanHoaUtmCampaign(utm);
  if (!ma) return null;
  const trung = await nc.tx.marketingCampaign.findFirst({ where: { utmCampaign: ma, ...(boQuaId && { NOT: { id: boQuaId } }) }, select: { code: true } });
  if (trung) throw new LoiNghiepVu(`Mã utm_campaign "${ma}" đã dùng cho chiến dịch ${trung.code}.`, 409, "trung-utm");
  return ma;
}

export async function taoChienDich(nc: NguCanh, d: DuLieuChienDich) {
  batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "marketing_campaign" });
  const ownerId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  if (ownerId !== nc.hoSo.userId) await kiemTraNguoiPhuTrach(nc, "marketing.create", ownerId);
  const utm = await kiemTraUtm(nc, d.utmCampaign);
  const ma = await capSoChungTu(nc.tx, KIEU_SO.chienDich);
  try {
    const c = await nc.tx.marketingCampaign.create({
      data: {
        tenantId: nc.tenantId,
        code: ma,
        name: d.ten,
        channel: d.kenh,
        utmCampaign: utm,
        startDate: d.ngayBatDau ? ngayVeDate(d.ngayBatDau) : null,
        endDate: d.ngayKetThuc ? ngayVeDate(d.ngayKetThuc) : null,
        budget: d.nganSach,
        targetLeads: d.mucTieuLead ?? null,
        ownerId,
        note: d.ghiChu ?? null,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: CHON,
    });
    const kq = chuyenDoi(c);
    await nc.kiemToan({ action: "tao", objectType: "marketing_campaign", objectId: c.id, after: anhChup(kq) });
    await nc.suKien({ eventType: SU_KIEN.CAMPAIGN_CREATED, objectType: "marketing_campaign", objectId: c.id, payload: { ma, nganSach: kq.nganSach } });
    return kq;
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiNghiepVu("Mã utm_campaign đã dùng cho chiến dịch khác.", 409, "trung-utm");
    throw e;
  }
}

async function docDuocSua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "marketing_campaign", objectId: id });
  const c = await docTrongPhamVi(nc, id);
  if (!(await trongPhamVi(nc, "marketing.update", c.nguoiPhuTrach.id))) {
    throw new LoiNghiepVu("Bạn chỉ xem được chiến dịch này, không sửa được (ngoài phạm vi phụ trách).", 403, "ngoai-pham-vi");
  }
  return c;
}

export async function suaChienDich(nc: NguCanh, id: string, d: DuLieuSuaChienDich) {
  const truoc = await docDuocSua(nc, id);
  if (truoc.trangThai === "ket-thuc" || truoc.trangThai === "huy") {
    throw new LoiNghiepVu("Chiến dịch đã kết thúc hoặc đã hủy, không sửa được.", 409, "da-dong");
  }
  const utm = d.utmCampaign !== undefined ? await kiemTraUtm(nc, d.utmCampaign, id) : undefined;
  if (d.nguoiPhuTrachId && d.nguoiPhuTrachId !== truoc.nguoiPhuTrach.id) await kiemTraNguoiPhuTrach(nc, "marketing.update", d.nguoiPhuTrachId);
  const batDau = d.ngayBatDau !== undefined ? d.ngayBatDau : truoc.ngayBatDau;
  const ketThuc = d.ngayKetThuc !== undefined ? d.ngayKetThuc : truoc.ngayKetThuc;
  if (batDau && ketThuc && ketThuc < batDau) throw new LoiNghiepVu("Ngày kết thúc phải sau ngày bắt đầu.", 422, "sai-ngay");

  // MK-03: tăng ngân sách vượt mức đã duyệt khi đang chạy → về chờ duyệt (CSDL cũng chặn).
  const nganSachMoi = d.nganSach !== undefined ? Number(d.nganSach) : Number(truoc.nganSach);
  const daDuyet = truoc.nganSachDaDuyet === null ? null : Number(truoc.nganSachDaDuyet);
  const veChoDuyet = (TRANG_THAI_DA_CHAY as string[]).includes(truoc.trangThai) && canDuyetNganSach(nganSachMoi, daDuyet);

  const c = await nc.tx.marketingCampaign.update({
    where: { id },
    data: {
      ...(d.ten !== undefined && { name: d.ten }),
      ...(d.kenh !== undefined && { channel: d.kenh }),
      ...(utm !== undefined && { utmCampaign: utm }),
      ...(d.ngayBatDau !== undefined && { startDate: d.ngayBatDau ? ngayVeDate(d.ngayBatDau) : null }),
      ...(d.ngayKetThuc !== undefined && { endDate: d.ngayKetThuc ? ngayVeDate(d.ngayKetThuc) : null }),
      ...(d.nganSach !== undefined && { budget: d.nganSach }),
      ...(d.mucTieuLead !== undefined && { targetLeads: d.mucTieuLead }),
      ...(d.nguoiPhuTrachId && { ownerId: d.nguoiPhuTrachId }),
      ...(d.ghiChu !== undefined && { note: d.ghiChu }),
      ...(veChoDuyet && { status: "cho-duyet" }),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON,
  });
  const sau = chuyenDoi(c);
  await nc.kiemToan({ action: "sua", objectType: "marketing_campaign", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
  await nc.suKien({ eventType: SU_KIEN.CAMPAIGN_UPDATED, objectType: "marketing_campaign", objectId: id, payload: veChoDuyet ? { veChoDuyet: true } : {} });
  if (veChoDuyet) await baoChoDuyet(nc, sau);
  return { ...sau, veChoDuyet };
}

async function baoChoDuyet(nc: NguCanh, c: ChienDich) {
  await nc.suKien({ eventType: SU_KIEN.CAMPAIGN_BUDGET_REQUESTED, objectType: "marketing_campaign", objectId: c.id, payload: { nganSach: c.nganSach } });
  await baoChoNguoiCoQuyen(
    nc.tx,
    nc.tenantId,
    "marketing.approve",
    {
      loai: "chien-dich-cho-duyet",
      mucDo: "canh-bao",
      tieuDe: `Chiến dịch ${c.ma} chờ duyệt ngân sách`,
      noiDung: `${c.ten} — ngân sách ${Number(c.nganSach).toLocaleString("vi-VN")} ₫.`,
      duongDan: `/marketing/chien-dich/${c.id}`,
      doiTuong: "marketing_campaign",
      doiTuongId: c.id,
    },
    nc.hoSo.userId,
  );
}

/** Đổi trạng thái theo bước người dùng bấm (MK-02, MK-03). Duyệt ngân sách là hàm riêng. */
export async function doiTrangThaiChienDich(nc: NguCanh, id: string, den: TrangThaiChienDich, lyDo?: string | null) {
  const truoc = await docDuocSua(nc, id);
  if (!chuyenTrangThaiHopLe(truoc.trangThai, den)) {
    throw new LoiNghiepVu(`Không chuyển được từ "${NHAN_TRANG_THAI_CHIEN_DICH[truoc.trangThai]}" sang "${NHAN_TRANG_THAI_CHIEN_DICH[den]}".`, 409, "sai-buoc");
  }
  const canDuyet = canDuyetNganSach(Number(truoc.nganSach), truoc.nganSachDaDuyet === null ? null : Number(truoc.nganSachDaDuyet));
  if (den === "dang-chay" && canDuyet) {
    throw new LoiNghiepVu("Chiến dịch có ngân sách chưa được duyệt. Gửi duyệt trước khi chạy (MK-03).", 409, "chua-duyet-ngan-sach");
  }
  if (den === "cho-duyet" && !canDuyet) {
    throw new LoiNghiepVu("Ngân sách bằng 0 hoặc đã được duyệt đủ — không cần gửi duyệt.", 409, "khong-can-duyet");
  }
  if (den === "huy" && (!lyDo || lyDo.trim().length < 3)) {
    throw new LoiNghiepVu("Ghi lý do hủy chiến dịch (tối thiểu 3 ký tự).", 422, "thieu-ly-do");
  }
  const c = await nc.tx.marketingCampaign.update({
    where: { id },
    data: { status: den, ...(den === "huy" && { cancelReason: lyDo }), updatedBy: nc.hoSo.userId },
    select: CHON,
  });
  const sau = chuyenDoi(c);
  await nc.kiemToan({ action: den === "huy" ? "huy" : "doi-giai-doan", objectType: "marketing_campaign", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
  await nc.suKien({ eventType: SU_KIEN.CAMPAIGN_STATUS_CHANGED, objectType: "marketing_campaign", objectId: id, payload: { tu: truoc.trangThai, den } });
  if (den === "cho-duyet") await baoChoDuyet(nc, sau);
  return sau;
}

/** MK-03: duyệt / từ chối ngân sách. Người phụ trách không tự duyệt, trừ phạm vi duyệt toàn công ty. */
export async function duyetNganSach(nc: NguCanh, id: string, d: { dongY: boolean; ghiChu?: string | null }) {
  batBuocQuyen(nc.hoSo, "marketing.approve", { objectType: "marketing_campaign", objectId: id });
  const truoc = await docTrongPhamVi(nc, id, "marketing.approve");
  if (truoc.trangThai !== "cho-duyet") throw new LoiNghiepVu("Chiến dịch không ở trạng thái chờ duyệt.", 409, "khong-cho-duyet");
  if (truoc.nguoiPhuTrach.id === nc.hoSo.userId && nc.hoSo.phamVi.get("marketing.approve") !== "all") {
    throw new LoiNghiepVu("Người phụ trách không tự duyệt ngân sách chiến dịch của mình.", 403, "tu-duyet");
  }
  if (!d.dongY && (!d.ghiChu || d.ghiChu.trim().length < 3)) throw new LoiNghiepVu("Ghi lý do từ chối (tối thiểu 3 ký tự).", 422, "thieu-ly-do");
  const c = await nc.tx.marketingCampaign.update({
    where: { id },
    data: d.dongY
      ? { status: "ke-hoach", approvedBudget: truoc.nganSach, approvedBy: nc.hoSo.userId, approvedAt: new Date(), updatedBy: nc.hoSo.userId }
      : { status: "ke-hoach", updatedBy: nc.hoSo.userId },
    select: CHON,
  });
  const sau = chuyenDoi(c);
  await nc.kiemToan({ action: d.dongY ? "duyet" : "tu-choi-duyet", objectType: "marketing_campaign", objectId: id, before: anhChup(truoc), after: { ...anhChup(sau), ghiChu: d.ghiChu ?? null } });
  await nc.suKien({
    eventType: d.dongY ? SU_KIEN.CAMPAIGN_BUDGET_APPROVED : SU_KIEN.CAMPAIGN_BUDGET_REJECTED,
    objectType: "marketing_campaign",
    objectId: id,
    payload: { nganSach: truoc.nganSach, ghiChu: d.ghiChu ?? null },
  });
  if (truoc.nguoiPhuTrach.id !== nc.hoSo.userId) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: truoc.nguoiPhuTrach.id,
      loai: d.dongY ? "chien-dich-da-duyet" : "chien-dich-tu-choi",
      mucDo: d.dongY ? "thong-tin" : "canh-bao",
      tieuDe: d.dongY ? `Ngân sách chiến dịch ${truoc.ma} đã được duyệt` : `Ngân sách chiến dịch ${truoc.ma} bị từ chối`,
      noiDung: d.ghiChu ?? null,
      duongDan: `/marketing/chien-dich/${id}`,
      doiTuong: "marketing_campaign",
      doiTuongId: id,
    });
  }
  return sau;
}

// ---------------------------------------------------------------------------
// Chi phí (MK-04)
// ---------------------------------------------------------------------------

export async function ghiChiPhi(nc: NguCanh, campaignId: string, d: DuLieuChiPhi) {
  const c = await docDuocSua(nc, campaignId);
  if (c.trangThai === "huy") throw new LoiNghiepVu("Chiến dịch đã hủy, không ghi chi phí được.", 409, "da-huy");
  const cp = await nc.tx.marketingCost.create({
    data: { tenantId: nc.tenantId, campaignId, costDate: ngayVeDate(d.ngay), amount: d.soTien, category: d.loai, note: d.ghiChu ?? null, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
    select: { id: true },
  });
  const tong = await nc.tx.marketingCost.aggregate({ where: { campaignId, status: "hoat-dong" }, _sum: { amount: true } });
  const daChi = Number(tong._sum.amount ?? 0);
  const tran = c.nganSachDaDuyet !== null ? Number(c.nganSachDaDuyet) : Number(c.nganSach);
  const vuot = tran > 0 && daChi > tran ? daChi - tran : 0;
  await nc.kiemToan({ action: "tao", objectType: "marketing_cost", objectId: cp.id, after: { chienDichId: campaignId, ngay: d.ngay, soTien: d.soTien, loai: d.loai, ghiChu: d.ghiChu ?? null } });
  await nc.suKien({ eventType: SU_KIEN.CAMPAIGN_COST_RECORDED, objectType: "marketing_campaign", objectId: campaignId, payload: { chiPhiId: cp.id, soTien: d.soTien, vuotNganSach: vuot } });
  return { id: cp.id, daChi, vuotNganSach: vuot };
}

export async function huyChiPhi(nc: NguCanh, chiPhiId: string, lyDo: string) {
  const cp = await nc.tx.marketingCost.findFirst({ where: { id: chiPhiId }, select: { id: true, campaignId: true, status: true, amount: true, costDate: true } });
  if (!cp) throw new LoiKhongTimThay("Khoản chi");
  await docDuocSua(nc, cp.campaignId);
  if (cp.status === "huy") throw new LoiNghiepVu("Khoản chi đã hủy trước đó.", 409, "da-huy");
  await nc.tx.marketingCost.update({ where: { id: chiPhiId }, data: { status: "huy", cancelledAt: new Date(), cancelledBy: nc.hoSo.userId, cancelReason: lyDo, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "huy", objectType: "marketing_cost", objectId: chiPhiId, before: { trangThai: "hoat-dong", soTien: cp.amount.toString(), ngay: dateVeNgay(cp.costDate) }, after: { trangThai: "huy", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.CAMPAIGN_COST_CANCELLED, objectType: "marketing_campaign", objectId: cp.campaignId, payload: { chiPhiId, lyDo } });
  return { id: chiPhiId, trangThai: "huy" };
}
