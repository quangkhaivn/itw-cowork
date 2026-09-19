import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import {
  homNayVN,
  kiemTraMaDuLieuGoc,
  kiemTraNguoiPhuTrach,
  locTheoPhamVi,
  ngayVeDate,
  tienVeChuoi,
  trongPhamVi,
} from "@/modules/crm/chung";
import {
  CO_HOI_DA_DONG,
  CO_HOI_DANG_MO,
  LEAD_DANG_MO,
  XAC_SUAT_GOI_Y,
  laCoHoiDangMo,
  tinhPipeline,
  type GiaiDoanCoHoi,
} from "@/modules/crm/hang-so";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import type { BoLocCoHoi, DuLieuDoiGiaiDoan, DuLieuSuaCoHoi, DuLieuTaoCoHoi } from "./luoc-do";

/**
 * Phân hệ Cơ hội bán hàng. Luật: BUSINESS_RULES.md CH-01 → CH-09.
 *
 * Quyền `sales.*`. Được XEM một cơ hội khi: người phụ trách cơ hội nằm trong phạm vi
 * `sales.view`, HOẶC khách hàng của cơ hội nằm trong phạm vi `customer.view` (chủ tài
 * khoản khách thấy mọi cơ hội trên khách của mình). Được SỬA khi người phụ trách cơ hội
 * nằm trong phạm vi `sales.update`.
 */

/** Điều kiện Prisma: những cơ hội người này được xem. */
export async function dieuKienXemCoHoi(nc: NguCanh): Promise<Prisma.OpportunityWhereInput> {
  const [theoCoHoi, pvKhach] = await Promise.all([
    locTheoPhamVi(nc, "sales.view"),
    idNguoiTrongPhamVi(nc.tx, nc.hoSo, "customer.view"),
  ]);
  if (!theoCoHoi.ownerId || pvKhach === "tat-ca") return {};
  return { OR: [theoCoHoi, { customer: { ownerId: { in: pvKhach } } }] };
}

const CHON_CO_HOI = {
  id: true,
  code: true,
  title: true,
  description: true,
  estimatedValue: true,
  probability: true,
  expectedCloseDate: true,
  source: true,
  stage: true,
  nextAction: true,
  nextActionDate: true,
  lostReason: true,
  lostNote: true,
  competitor: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  ownerId: true,
  customer: { select: { id: true, code: true, name: true, ownerId: true } },
  contact: { select: { id: true, fullName: true, phone: true, email: true } },
  owner: { select: { id: true, fullName: true } },
} satisfies Prisma.OpportunitySelect;

type BanGhiCoHoi = Prisma.OpportunityGetPayload<{ select: typeof CHON_CO_HOI }>;

function chuyenDoi(c: BanGhiCoHoi) {
  return {
    id: c.id,
    ma: c.code,
    tieuDe: c.title,
    moTa: c.description,
    giaTri: tienVeChuoi(c.estimatedValue) ?? "0",
    xacSuat: c.probability,
    ngayDuKienChot: c.expectedCloseDate,
    nguon: c.source,
    giaiDoan: c.stage,
    hanhDongKeTiep: c.nextAction,
    ngayHanhDong: c.nextActionDate,
    lyDoThua: c.lostReason,
    ghiChuThua: c.lostNote,
    doiThu: c.competitor,
    dongLuc: c.closedAt,
    taoLuc: c.createdAt,
    suaLuc: c.updatedAt,
    khachHang: { id: c.customer.id, ma: c.customer.code, ten: c.customer.name },
    lienHe: c.contact ? { id: c.contact.id, hoTen: c.contact.fullName, dienThoai: c.contact.phone, email: c.contact.email } : null,
    nguoiPhuTrach: { id: c.owner.id, hoTen: c.owner.fullName },
  };
}
export type CoHoiChiTiet = ReturnType<typeof chuyenDoi>;

function anhChup(c: CoHoiChiTiet) {
  return {
    ma: c.ma,
    tieuDe: c.tieuDe,
    giaTri: c.giaTri,
    xacSuat: c.xacSuat,
    ngayDuKienChot: c.ngayDuKienChot,
    giaiDoan: c.giaiDoan,
    hanhDongKeTiep: c.hanhDongKeTiep,
    ngayHanhDong: c.ngayHanhDong,
    lyDoThua: c.lyDoThua,
    khachHangId: c.khachHang.id,
    lienHeId: c.lienHe?.id ?? null,
    nguoiPhuTrachId: c.nguoiPhuTrach.id,
  };
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachCoHoi(nc: NguCanh, boLoc: BoLocCoHoi) {
  batBuocQuyen(nc.hoSo, "sales.view");
  const dieuKien: Prisma.OpportunityWhereInput[] = [await dieuKienXemCoHoi(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { title: { contains: boLoc.q, mode: "insensitive" } },
        { code: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.giaiDoan === "dang-mo") dieuKien.push({ stage: { in: CO_HOI_DANG_MO } });
  else if (boLoc.giaiDoan === "da-dong") dieuKien.push({ stage: { in: CO_HOI_DA_DONG } });
  else if (boLoc.giaiDoan) dieuKien.push({ stage: boLoc.giaiDoan });
  if (boLoc.nguoiPhuTrach) dieuKien.push({ ownerId: boLoc.nguoiPhuTrach });
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });
  if (boLoc.quaHan) dieuKien.push({ stage: { in: CO_HOI_DANG_MO }, nextActionDate: { lt: ngayVeDate(homNayVN()) } });

  const where: Prisma.OpportunityWhereInput = { AND: dieuKien };
  const [tong, dong, tatCaDangMo] = await Promise.all([
    nc.tx.opportunity.count({ where }),
    nc.tx.opportunity.findMany({
      where,
      select: CHON_CO_HOI,
      orderBy: [{ nextActionDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
    // Tổng pipeline của đúng bộ lọc đang xem (không phân trang).
    nc.tx.opportunity.findMany({ where, select: { stage: true, estimatedValue: true, probability: true } }),
  ]);
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: dong.map(chuyenDoi), pipeline: tinhPipeline(tatCaDangMo) };
}

async function docCoHoiDuocXem(nc: NguCanh, id: string): Promise<CoHoiChiTiet & { _ownerId: string }> {
  const c = await nc.tx.opportunity.findFirst({ where: { AND: [{ id }, await dieuKienXemCoHoi(nc)] }, select: CHON_CO_HOI });
  if (!c) throw new LoiKhongTimThay("Cơ hội");
  return { ...chuyenDoi(c), _ownerId: c.ownerId };
}

/** Kiểm người dùng thấy cơ hội — phân hệ khác (tương tác, công việc) gọi trước khi gắn. */
export async function batBuocThayCoHoi(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "sales.view", { objectType: "opportunity", objectId: id });
  return docCoHoiDuocXem(nc, id);
}

export async function chiTietCoHoi(nc: NguCanh, id: string) {
  const { _ownerId, ...coHoi } = await batBuocThayCoHoi(nc, id);
  const [tuongTac, viec, leadGoc] = await Promise.all([
    nc.tx.interaction.findMany({
      where: { opportunityId: id, status: "hoat-dong" },
      select: {
        id: true, type: true, subject: true, content: true, outcome: true, occurredAt: true,
        owner: { select: { fullName: true } }, contact: { select: { fullName: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    coQuyen(nc.hoSo, "task.view")
      ? nc.tx.task.findMany({
          where: { opportunityId: id },
          select: { id: true, title: true, status: true, priority: true, dueAt: true, owner: { select: { fullName: true } } },
          orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        })
      : Promise.resolve([]),
    nc.tx.lead.findFirst({ where: { convertedOpportunityId: id }, select: { id: true, code: true, fullName: true } }),
  ]);
  const duocSua = coQuyen(nc.hoSo, "sales.update") && (await trongPhamVi(nc, "sales.update", _ownerId));
  return {
    coHoi,
    tuongTac: tuongTac.map((t) => ({
      id: t.id, loai: t.type, tieuDe: t.subject, noiDung: t.content, ketQua: t.outcome, luc: t.occurredAt,
      nguoi: t.owner.fullName, lienHe: t.contact?.fullName ?? null,
    })),
    viec: viec.map((v) => ({ id: v.id, tieuDe: v.title, trangThai: v.status, uuTien: v.priority, han: v.dueAt, nguoi: v.owner.fullName })),
    leadGoc,
    quyen: {
      sua: duocSua,
      moLai: duocSua && coQuyen(nc.hoSo, "sales.approve"),
      ghiTuongTac: coQuyen(nc.hoSo, "crm.create"),
      taoViec: coQuyen(nc.hoSo, "task.create"),
    },
  };
}

// ---------------------------------------------------------------------------
// Pipeline Kanban: 3 cột lead + 5 cột cơ hội (mục 7 prompt)
// ---------------------------------------------------------------------------

/** Cơ hội đã đóng chỉ hiện trên bảng trong số ngày này — bảng là việc đang chạy, không phải kho lưu trữ. */
const NGAY_HIEN_DA_DONG = 30;
const THE_MOI_COT = 50;

export async function duLieuPipeline(nc: NguCanh, boLoc: { nguoiPhuTrach: string }) {
  batBuocQuyen(nc.hoSo, "sales.view");
  const xemLead = coQuyen(nc.hoSo, "crm.view");
  const locNguoi = boLoc.nguoiPhuTrach ? { ownerId: boLoc.nguoiPhuTrach } : {};
  const tuNgayDong = new Date(Date.now() - NGAY_HIEN_DA_DONG * 24 * 60 * 60 * 1000);
  const homNay = ngayVeDate(homNayVN());

  const dieuKienCoHoi = await dieuKienXemCoHoi(nc);
  const coHoi = await nc.tx.opportunity.findMany({
    where: {
      AND: [
        dieuKienCoHoi,
        locNguoi,
        { OR: [{ stage: { in: CO_HOI_DANG_MO } }, { stage: { in: CO_HOI_DA_DONG }, closedAt: { gte: tuNgayDong } }] },
      ],
    },
    select: {
      id: true, code: true, title: true, stage: true, estimatedValue: true, probability: true,
      nextAction: true, nextActionDate: true, ownerId: true,
      customer: { select: { name: true } }, owner: { select: { fullName: true } },
    },
    orderBy: [{ nextActionDate: { sort: "asc", nulls: "last" } }],
  });

  const leads = xemLead
    ? await nc.tx.lead.findMany({
        where: { AND: [await locTheoPhamVi(nc, "crm.view"), locNguoi, { stage: { in: LEAD_DANG_MO } }] },
        select: {
          id: true, code: true, fullName: true, companyName: true, stage: true, estimatedValue: true,
          owner: { select: { fullName: true } }, createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const pvSua = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "sales.update");
  const duocSua = (ownerId: string) => coQuyen(nc.hoSo, "sales.update") && (pvSua === "tat-ca" || pvSua.includes(ownerId));

  const cotLead = (xemLead ? LEAD_DANG_MO : []).map((gd) => {
    const ds = leads.filter((l) => l.stage === gd);
    return {
      giaiDoan: gd as string,
      laLead: true,
      soLuong: ds.length,
      tongGiaTri: ds.reduce((s, l) => s + Number(l.estimatedValue?.toString() ?? 0), 0),
      the: ds.slice(0, THE_MOI_COT).map((l) => ({
        id: l.id,
        ma: l.code,
        tieuDe: l.companyName ? `${l.fullName} — ${l.companyName}` : l.fullName,
        phu: null as string | null,
        giaTri: tienVeChuoi(l.estimatedValue),
        xacSuat: null as number | null,
        hanhDong: null as string | null,
        ngayHanhDong: null as Date | null,
        quaHan: false,
        nguoi: l.owner.fullName,
        href: `/crm/lead/${l.id}`,
        keoDuoc: false,
      })),
    };
  });

  const cotCoHoi = (["OPPORTUNITY", "QUOTATION", "NEGOTIATION", "WON", "LOST"] as GiaiDoanCoHoi[]).map((gd) => {
    const ds = coHoi.filter((c) => c.stage === gd);
    return {
      giaiDoan: gd as string,
      laLead: false,
      soLuong: ds.length,
      tongGiaTri: ds.reduce((s, c) => s + Number(c.estimatedValue.toString()), 0),
      the: ds.slice(0, THE_MOI_COT).map((c) => ({
        id: c.id,
        ma: c.code,
        tieuDe: c.title,
        phu: c.customer.name,
        giaTri: tienVeChuoi(c.estimatedValue),
        xacSuat: c.probability,
        hanhDong: c.nextAction,
        ngayHanhDong: c.nextActionDate,
        quaHan: laCoHoiDangMo(c.stage) && !!c.nextActionDate && c.nextActionDate < homNay,
        nguoi: c.owner.fullName,
        href: `/ban-hang/co-hoi/${c.id}`,
        keoDuoc: duocSua(c.ownerId),
      })),
    };
  });

  return {
    cot: [...cotLead, ...cotCoHoi],
    tongKet: tinhPipeline(coHoi),
    soNgayHienDaDong: NGAY_HIEN_DA_DONG,
    duocMoLai: coQuyen(nc.hoSo, "sales.approve"),
  };
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

async function kiemTraLienHeCuaKhach(nc: NguCanh, lienHeId: string | null | undefined, khachId: string) {
  if (!lienHeId) return;
  const lh = await nc.tx.contact.findFirst({ where: { id: lienHeId, customerId: khachId }, select: { id: true } });
  if (!lh) throw new LoiDinhDang("lienHeId", "Liên hệ không thuộc khách hàng này.");
}

export async function taoCoHoi(nc: NguCanh, d: DuLieuTaoCoHoi, tuy: { tuLeadId?: string } = {}) {
  batBuocQuyen(nc.hoSo, "sales.create", { objectType: "opportunity" });
  await batBuocThayKhach(nc, d.khachHangId); // CH-07
  await kiemTraLienHeCuaKhach(nc, d.lienHeId, d.khachHangId);
  const ownerId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "sales.create", ownerId);
  await kiemTraMaDuLieuGoc(nc, "nguon_lead", d.nguon, "nguon");

  const ma = await capSoChungTu(nc.tx, KIEU_SO.coHoi);
  const c = await nc.tx.opportunity.create({
    data: {
      tenantId: nc.tenantId,
      code: ma,
      customerId: d.khachHangId,
      contactId: d.lienHeId ?? null,
      title: d.tieuDe,
      description: d.moTa ?? null,
      estimatedValue: d.giaTri,
      probability: d.xacSuat ?? XAC_SUAT_GOI_Y.OPPORTUNITY,
      expectedCloseDate: d.ngayDuKienChot ? ngayVeDate(d.ngayDuKienChot) : null,
      source: d.nguon ?? null,
      ownerId,
      stage: "OPPORTUNITY",
      nextAction: d.hanhDongKeTiep,
      nextActionDate: ngayVeDate(d.ngayHanhDong),
      competitor: d.doiThu ?? null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_CO_HOI,
  });
  const kq = chuyenDoi(c);
  await nc.kiemToan({ action: "tao", objectType: "opportunity", objectId: c.id, after: anhChup(kq) });
  await nc.suKien({
    eventType: SU_KIEN.OPPORTUNITY_CREATED,
    objectType: "opportunity",
    objectId: c.id,
    payload: { ma, khachHangId: d.khachHangId, giaTri: d.giaTri, ...(tuy.tuLeadId && { tuLeadId: tuy.tuLeadId }) },
  });
  return kq;
}

async function docCoHoiDuocSua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "sales.update", { objectType: "opportunity", objectId: id });
  const c = await docCoHoiDuocXem(nc, id);
  if (!(await trongPhamVi(nc, "sales.update", c._ownerId))) {
    throw new LoiNghiepVu("Bạn chỉ xem được cơ hội này, không sửa được (ngoài phạm vi phụ trách).", 403, "ngoai-pham-vi");
  }
  return c;
}

export async function suaCoHoi(nc: NguCanh, id: string, d: DuLieuSuaCoHoi) {
  const truoc = await docCoHoiDuocSua(nc, id);
  if (!laCoHoiDangMo(truoc.giaiDoan)) {
    throw new LoiNghiepVu("Cơ hội đã đóng. Mở lại (cần quyền duyệt) trước khi sửa.", 409, "da-dong");
  }
  if (d.lienHeId !== undefined) await kiemTraLienHeCuaKhach(nc, d.lienHeId, truoc.khachHang.id);
  if (d.nguoiPhuTrachId && d.nguoiPhuTrachId !== truoc.nguoiPhuTrach.id) {
    await kiemTraNguoiPhuTrach(nc, "sales.update", d.nguoiPhuTrachId);
  }
  await kiemTraMaDuLieuGoc(nc, "nguon_lead", d.nguon, "nguon", truoc.nguon);

  const c = await nc.tx.opportunity.update({
    where: { id },
    data: {
      ...(d.lienHeId !== undefined && { contactId: d.lienHeId }),
      ...(d.tieuDe !== undefined && { title: d.tieuDe }),
      ...(d.moTa !== undefined && { description: d.moTa }),
      ...(d.giaTri !== undefined && { estimatedValue: d.giaTri }),
      ...(d.xacSuat !== undefined && { probability: d.xacSuat }),
      ...(d.ngayDuKienChot !== undefined && { expectedCloseDate: d.ngayDuKienChot ? ngayVeDate(d.ngayDuKienChot) : null }),
      ...(d.nguon !== undefined && { source: d.nguon }),
      ...(d.nguoiPhuTrachId && { ownerId: d.nguoiPhuTrachId }),
      ...(d.hanhDongKeTiep !== undefined && { nextAction: d.hanhDongKeTiep }),
      ...(d.ngayHanhDong !== undefined && { nextActionDate: ngayVeDate(d.ngayHanhDong) }),
      ...(d.doiThu !== undefined && { competitor: d.doiThu }),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_CO_HOI,
  });
  const sau = chuyenDoi(c);
  await nc.kiemToan({ action: "sua", objectType: "opportunity", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
  await nc.suKien({ eventType: SU_KIEN.OPPORTUNITY_UPDATED, objectType: "opportunity", objectId: id });
  return sau;
}

/**
 * Đổi giai đoạn — đường duy nhất để đóng / mở lại cơ hội.
 *   - LOST: bắt buộc lý do thua trong Dữ liệu gốc (CH-03); xác suất 0.
 *   - WON: xác suất 100. Đóng thì ghi closed_at (CH-05).
 *   - Đã đóng → giai đoạn khác: cần `sales.approve` (CH-06) và phải có lại
 *     Hành động kế tiếp + Ngày (CH-02).
 *   - Xác suất gợi ý theo giai đoạn chỉ áp khi người dùng chưa tự chỉnh xác suất.
 */
export async function doiGiaiDoan(nc: NguCanh, id: string, d: DuLieuDoiGiaiDoan) {
  const truoc = await docCoHoiDuocSua(nc, id);
  const tu = truoc.giaiDoan as GiaiDoanCoHoi;
  const den = d.giaiDoan;
  if (tu === den) return truoc;

  const dangDong = !laCoHoiDangMo(tu);
  const moLai = dangDong && laCoHoiDangMo(den);
  if (dangDong) {
    batBuocQuyen(nc.hoSo, "sales.approve", { objectType: "opportunity", objectId: id });
  }

  const data: Prisma.OpportunityUpdateInput = { stage: den, updatedBy: nc.hoSo.userId };

  if (den === "LOST") {
    if (!d.lyDoThua) throw new LoiDinhDang("lyDoThua", "Chọn lý do thua.");
    await kiemTraMaDuLieuGoc(nc, "ly_do_thua", d.lyDoThua, "lyDoThua");
    Object.assign(data, { lostReason: d.lyDoThua, lostNote: d.ghiChuThua ?? null, probability: 0, closedAt: new Date() });
  } else if (den === "WON") {
    Object.assign(data, { lostReason: null, lostNote: null, probability: 100, closedAt: new Date() });
  } else {
    // Sang một giai đoạn đang mở.
    const hanhDong = d.hanhDongKeTiep ?? (moLai ? undefined : truoc.hanhDongKeTiep);
    const ngay = d.ngayHanhDong ?? (moLai ? undefined : truoc.ngayHanhDong?.toISOString().slice(0, 10));
    if (!hanhDong) throw new LoiDinhDang("hanhDongKeTiep", "Cơ hội đang mở phải có hành động kế tiếp.");
    if (!ngay) throw new LoiDinhDang("ngayHanhDong", "Cơ hội đang mở phải có ngày hành động kế tiếp.");
    const xacSuatChuaChinh = !dangDong && truoc.xacSuat === XAC_SUAT_GOI_Y[tu];
    Object.assign(data, {
      nextAction: hanhDong,
      nextActionDate: ngayVeDate(ngay),
      probability: d.xacSuat ?? (dangDong || xacSuatChuaChinh ? XAC_SUAT_GOI_Y[den] : truoc.xacSuat),
      ...(moLai && { closedAt: null, lostReason: null, lostNote: null }),
    });
  }

  const c = await nc.tx.opportunity.update({ where: { id }, data, select: CHON_CO_HOI });
  const sau = chuyenDoi(c);
  await nc.kiemToan({ action: "doi-giai-doan", objectType: "opportunity", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
  const loaiSuKien =
    den === "WON" ? SU_KIEN.OPPORTUNITY_WON
    : den === "LOST" ? SU_KIEN.OPPORTUNITY_LOST
    : moLai ? SU_KIEN.OPPORTUNITY_REOPENED
    : SU_KIEN.OPPORTUNITY_STAGE_CHANGED;
  await nc.suKien({
    eventType: loaiSuKien,
    objectType: "opportunity",
    objectId: id,
    payload: { tu, den, giaTri: sau.giaTri, ...(den === "LOST" && { lyDoThua: d.lyDoThua }) },
  });
  return sau;
}
