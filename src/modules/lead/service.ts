import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { chuanHoaDienThoai, chuanHoaEmail, chuanHoaMaSoThue, chuanHoaTen } from "@/modules/crm/chuan-hoa";
import { khoaDoTrungLead, kiemTraMaDuLieuGoc, kiemTraNguoiPhuTrach, locTheoPhamVi, tienVeChuoi, trongPhamVi } from "@/modules/crm/chung";
import { LEAD_DANG_MO } from "@/modules/crm/hang-so";
import { batBuocThayKhach, taoKhachHang, taoLienHe, timKhachCoTheTrung, type UngVienTrung } from "@/modules/khach-hang/service";
import { taoCoHoi } from "@/modules/co-hoi/service";
import type { BoLocLead, DuLieuChuyenDoiLead, DuLieuSuaLead, DuLieuTaoLead } from "./luoc-do";

/**
 * Phân hệ Lead. Luật: BUSINESS_RULES.md LD-01 → LD-07.
 * Quyền `crm.*`, phạm vi theo `leads.owner_id`.
 */

const CHON_LEAD = {
  id: true,
  code: true,
  fullName: true,
  companyName: true,
  title: true,
  phone: true,
  email: true,
  taxCode: true,
  source: true,
  need: true,
  estimatedValue: true,
  stage: true,
  ownerId: true,
  disqualifiedReason: true,
  convertedAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, fullName: true } },
  convertedCustomer: { select: { id: true, code: true, name: true } },
  convertedOpportunity: { select: { id: true, code: true, title: true } },
} satisfies Prisma.LeadSelect;

type BanGhiLead = Prisma.LeadGetPayload<{ select: typeof CHON_LEAD }>;

function chuyenDoi(l: BanGhiLead) {
  return {
    id: l.id,
    ma: l.code,
    hoTen: l.fullName,
    congTy: l.companyName,
    chucDanh: l.title,
    dienThoai: l.phone,
    email: l.email,
    maSoThue: l.taxCode,
    nguon: l.source,
    nhuCau: l.need,
    giaTriUocTinh: tienVeChuoi(l.estimatedValue),
    giaiDoan: l.stage,
    lyDoLoai: l.disqualifiedReason,
    chuyenDoiLuc: l.convertedAt,
    ghiChu: l.note,
    taoLuc: l.createdAt,
    suaLuc: l.updatedAt,
    nguoiPhuTrach: { id: l.owner.id, hoTen: l.owner.fullName },
    khachHang: l.convertedCustomer ? { id: l.convertedCustomer.id, ma: l.convertedCustomer.code, ten: l.convertedCustomer.name } : null,
    coHoi: l.convertedOpportunity ? { id: l.convertedOpportunity.id, ma: l.convertedOpportunity.code, tieuDe: l.convertedOpportunity.title } : null,
  };
}
export type LeadChiTiet = ReturnType<typeof chuyenDoi>;

function anhChup(l: LeadChiTiet) {
  const { taoLuc: _a, suaLuc: _b, nguoiPhuTrach, khachHang, coHoi, ...con } = l;
  void _a;
  void _b;
  return { ...con, nguoiPhuTrachId: nguoiPhuTrach.id, khachHangId: khachHang?.id ?? null, coHoiId: coHoi?.id ?? null };
}

// ---------------------------------------------------------------------------
// Dò trùng (LD-03)
// ---------------------------------------------------------------------------

function khoaLead(d: { congTy?: string | null; maSoThue?: string | null; dienThoai?: string | null; email?: string | null }) {
  return {
    tenChuan: d.congTy ? chuanHoaTen(d.congTy) : null,
    maSoThue: chuanHoaMaSoThue(d.maSoThue),
    dienThoai: chuanHoaDienThoai(d.dienThoai),
    email: chuanHoaEmail(d.email),
  };
}

async function timTrungLead(
  nc: NguCanh,
  k: ReturnType<typeof khoaLead>,
  boQuaLeadId?: string,
): Promise<UngVienTrung[]> {
  const khach = await timKhachCoTheTrung(nc, k);
  const hoac: Prisma.LeadWhereInput[] = [];
  if (k.dienThoai) hoac.push({ phoneNormalized: k.dienThoai });
  if (k.email) hoac.push({ emailNormalized: k.email });
  if (k.maSoThue) hoac.push({ taxCodeNormalized: k.maSoThue });
  if (!hoac.length) return khach;

  const leads = await nc.tx.lead.findMany({
    where: { OR: hoac, stage: { in: LEAD_DANG_MO }, ...(boQuaLeadId && { NOT: { id: boQuaLeadId } }) },
    select: { id: true, code: true, fullName: true, companyName: true, ownerId: true, phoneNormalized: true, emailNormalized: true, taxCodeNormalized: true, owner: { select: { fullName: true } } },
    take: 5,
  });
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "crm.view");
  return [
    ...khach,
    ...leads.map((l) => ({
      loai: "lead" as const,
      id: l.id,
      ma: l.code,
      ten: l.companyName ? `${l.fullName} — ${l.companyName}` : l.fullName,
      nguoiPhuTrach: l.owner.fullName,
      lyDo: [
        k.dienThoai && l.phoneNormalized === k.dienThoai && "Trùng số điện thoại",
        k.email && l.emailNormalized === k.email && "Trùng email",
        k.maSoThue && l.taxCodeNormalized === k.maSoThue && "Trùng mã số thuế",
      ].filter((x): x is string => Boolean(x)),
      moDuoc: pv === "tat-ca" || pv.includes(l.ownerId),
    })),
  ];
}

export async function doTrungLead(nc: NguCanh, d: { congTy: string; maSoThue: string; dienThoai: string; email: string; boQuaId: string }) {
  if (!coQuyen(nc.hoSo, "crm.create") && !coQuyen(nc.hoSo, "crm.update")) batBuocQuyen(nc.hoSo, "crm.create");
  try {
    return { ungVien: await timTrungLead(nc, khoaLead(d), d.boQuaId || undefined) };
  } catch {
    return { ungVien: [] as UngVienTrung[] };
  }
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachLead(nc: NguCanh, boLoc: BoLocLead) {
  batBuocQuyen(nc.hoSo, "crm.view");
  const dieuKien: Prisma.LeadWhereInput[] = [await locTheoPhamVi(nc, "crm.view")];
  if (boLoc.q) {
    const so = boLoc.q.replace(/\D/g, "");
    dieuKien.push({
      OR: [
        { fullName: { contains: boLoc.q, mode: "insensitive" } },
        { companyName: { contains: boLoc.q, mode: "insensitive" } },
        { code: { contains: boLoc.q, mode: "insensitive" } },
        { email: { contains: boLoc.q, mode: "insensitive" } },
        ...(so.length >= 4 ? [{ phoneNormalized: { contains: so } }, { taxCodeNormalized: { contains: so } }] : []),
      ],
    });
  }
  if (boLoc.giaiDoan === "") dieuKien.push({ stage: { in: LEAD_DANG_MO } });
  else if (boLoc.giaiDoan !== "tat-ca") dieuKien.push({ stage: boLoc.giaiDoan });
  if (boLoc.nguon) dieuKien.push({ source: boLoc.nguon });
  if (boLoc.nguoiPhuTrach) dieuKien.push({ ownerId: boLoc.nguoiPhuTrach });

  const where: Prisma.LeadWhereInput = { AND: dieuKien };
  const [tong, dong] = await Promise.all([
    nc.tx.lead.count({ where }),
    nc.tx.lead.findMany({
      where,
      select: { ...CHON_LEAD, interactions: { select: { occurredAt: true }, orderBy: { occurredAt: "desc" }, take: 1 } },
      orderBy: [{ createdAt: "desc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
  ]);
  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: dong.map((l) => ({ ...chuyenDoi(l), lienHeCuoi: l.interactions[0]?.occurredAt ?? null })),
  };
}

async function docLeadTrongPhamVi(nc: NguCanh, id: string, maQuyen: string) {
  const l = await nc.tx.lead.findFirst({ where: { id, ...(await locTheoPhamVi(nc, maQuyen)) }, select: CHON_LEAD });
  if (!l) throw new LoiKhongTimThay("Lead");
  return chuyenDoi(l);
}

/** Kiểm người dùng thấy lead — phân hệ tương tác / công việc gọi trước khi gắn. */
export async function batBuocThayLead(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "crm.view", { objectType: "lead", objectId: id });
  return docLeadTrongPhamVi(nc, id, "crm.view");
}

export async function chiTietLead(nc: NguCanh, id: string) {
  const lead = await batBuocThayLead(nc, id);
  const [tuongTac, viec] = await Promise.all([
    nc.tx.interaction.findMany({
      where: { leadId: id, status: "hoat-dong" },
      select: { id: true, type: true, subject: true, content: true, outcome: true, occurredAt: true, owner: { select: { fullName: true } } },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    coQuyen(nc.hoSo, "task.view")
      ? nc.tx.task.findMany({
          where: { leadId: id },
          select: { id: true, title: true, status: true, priority: true, dueAt: true, owner: { select: { fullName: true } } },
          orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const duocSua = coQuyen(nc.hoSo, "crm.update") && (await trongPhamVi(nc, "crm.update", lead.nguoiPhuTrach.id));
  const dangMo = (LEAD_DANG_MO as string[]).includes(lead.giaiDoan);
  return {
    lead,
    tuongTac: tuongTac.map((t) => ({
      id: t.id, loai: t.type, tieuDe: t.subject, noiDung: t.content, ketQua: t.outcome, luc: t.occurredAt, nguoi: t.owner.fullName,
    })),
    viec: viec.map((v) => ({ id: v.id, tieuDe: v.title, trangThai: v.status, uuTien: v.priority, han: v.dueAt, nguoi: v.owner.fullName })),
    quyen: {
      sua: duocSua && dangMo,
      moLaiLeadDaLoai: duocSua && lead.giaiDoan === "DISQUALIFIED",
      chuyenDoi: duocSua && dangMo && coQuyen(nc.hoSo, "customer.view"),
      taoKhachMoi: coQuyen(nc.hoSo, "customer.create"),
      taoCoHoi: coQuyen(nc.hoSo, "sales.create"),
      ghiTuongTac: coQuyen(nc.hoSo, "crm.create") && lead.giaiDoan !== "CONVERTED",
      taoViec: coQuyen(nc.hoSo, "task.create"),
    },
  };
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

export async function taoLead(nc: NguCanh, d: DuLieuTaoLead, rawPayload?: Record<string, unknown>) {
  batBuocQuyen(nc.hoSo, "crm.create", { objectType: "lead" });
  const k = khoaLead(d);
  if (!k.dienThoai && !k.email) throw new LoiDinhDang("dienThoai", "Cần ít nhất số điện thoại hoặc email để liên lạc lại (LD-02).");
  const ownerId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "crm.create", ownerId);
  await kiemTraMaDuLieuGoc(nc, "nguon_lead", d.nguon, "nguon");

  // MK-07: cùng khóa với `nhanLead()` — lead tạo tay và lead từ form không lọt qua nhau khi cùng lúc.
  await khoaDoTrungLead(nc.tx, nc.tenantId, k);
  const ungVien = await timTrungLead(nc, k);
  if (ungVien.length && !d.xacNhanKhongTrung) {
    throw new LoiNghiepVu(
      "Số điện thoại, email hoặc mã số thuế này đã có trong hệ thống. Kiểm tra danh sách; nếu đúng là lead mới thì xác nhận để lưu.",
      409,
      "co-the-trung",
      { ungVien },
    );
  }

  const ma = await capSoChungTu(nc.tx, KIEU_SO.lead);
  const l = await nc.tx.lead.create({
    data: {
      tenantId: nc.tenantId,
      code: ma,
      fullName: d.hoTen,
      companyName: d.congTy ?? null,
      title: d.chucDanh ?? null,
      phone: d.dienThoai ?? null,
      phoneNormalized: k.dienThoai,
      email: d.email ?? null,
      emailNormalized: k.email,
      taxCode: d.maSoThue ?? null,
      taxCodeNormalized: k.maSoThue,
      source: d.nguon ?? null,
      need: d.nhuCau ?? null,
      estimatedValue: d.giaTriUocTinh ?? null,
      ownerId,
      note: d.ghiChu ?? null,
      rawPayload: (rawPayload ?? undefined) as never,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_LEAD,
  });
  const kq = chuyenDoi(l);
  await nc.kiemToan({ action: "tao", objectType: "lead", objectId: l.id, after: anhChup(kq) });
  await nc.suKien({ eventType: SU_KIEN.LEAD_CAPTURED, objectType: "lead", objectId: l.id, payload: { ma, nguon: d.nguon ?? null } });
  if (ownerId !== nc.hoSo.userId) {
    await nc.suKien({ eventType: SU_KIEN.LEAD_ASSIGNED, objectType: "lead", objectId: l.id, payload: { nguoiPhuTrachId: ownerId } });
  }
  return kq;
}

async function docLeadDuocSua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "crm.update", { objectType: "lead", objectId: id });
  const l = await docLeadTrongPhamVi(nc, id, "crm.view");
  if (!(await trongPhamVi(nc, "crm.update", l.nguoiPhuTrach.id))) {
    throw new LoiNghiepVu("Bạn chỉ xem được lead này, không sửa được (ngoài phạm vi phụ trách).", 403, "ngoai-pham-vi");
  }
  return l;
}

export async function suaLead(nc: NguCanh, id: string, d: DuLieuSuaLead) {
  await khoaChungTu(nc.tx, "leads", id);
  const truoc = await docLeadDuocSua(nc, id);
  if (truoc.giaiDoan === "CONVERTED") throw new LoiNghiepVu("Lead đã chuyển đổi thành khách hàng, không sửa được (LD-06).", 409, "da-chuyen-doi");
  // Lead đã loại chỉ được "mở lại" bằng cách đặt giai đoạn đang mở.
  if (truoc.giaiDoan === "DISQUALIFIED" && !d.giaiDoan) {
    throw new LoiNghiepVu("Lead đã bị loại. Chọn lại giai đoạn để mở lại lead trước khi sửa.", 409, "da-loai");
  }

  const doiDt = d.dienThoai !== undefined && d.dienThoai !== truoc.dienThoai;
  const doiEmail = d.email !== undefined && d.email !== truoc.email;
  const doiMst = d.maSoThue !== undefined && d.maSoThue !== truoc.maSoThue;
  const k = khoaLead({
    dienThoai: d.dienThoai !== undefined ? d.dienThoai : truoc.dienThoai,
    email: d.email !== undefined ? d.email : truoc.email,
    maSoThue: doiMst ? d.maSoThue : null,
  });
  if (!k.dienThoai && !k.email) throw new LoiDinhDang("dienThoai", "Cần ít nhất số điện thoại hoặc email (LD-02).");
  if ((doiDt || doiEmail || doiMst) && !d.xacNhanKhongTrung) {
    const ungVien = await timTrungLead(
      nc,
      { tenChuan: null, dienThoai: doiDt ? k.dienThoai : null, email: doiEmail ? k.email : null, maSoThue: doiMst ? k.maSoThue : null },
      id,
    );
    if (ungVien.length) {
      throw new LoiNghiepVu("Thông tin liên lạc mới trùng với bản ghi khác. Xác nhận nếu vẫn muốn lưu.", 409, "co-the-trung", { ungVien });
    }
  }
  if (d.nguoiPhuTrachId && d.nguoiPhuTrachId !== truoc.nguoiPhuTrach.id) await kiemTraNguoiPhuTrach(nc, "crm.update", d.nguoiPhuTrachId);
  await kiemTraMaDuLieuGoc(nc, "nguon_lead", d.nguon, "nguon", truoc.nguon);

  const l = await nc.tx.lead.update({
    where: { id },
    data: {
      ...(d.hoTen !== undefined && { fullName: d.hoTen }),
      ...(d.congTy !== undefined && { companyName: d.congTy }),
      ...(d.chucDanh !== undefined && { title: d.chucDanh }),
      ...(doiDt && { phone: d.dienThoai, phoneNormalized: k.dienThoai }),
      ...(doiEmail && { email: d.email, emailNormalized: k.email }),
      ...(doiMst && { taxCode: d.maSoThue, taxCodeNormalized: k.maSoThue }),
      ...(d.nguon !== undefined && { source: d.nguon }),
      ...(d.nhuCau !== undefined && { need: d.nhuCau }),
      ...(d.giaTriUocTinh !== undefined && { estimatedValue: d.giaTriUocTinh }),
      ...(d.ghiChu !== undefined && { note: d.ghiChu }),
      ...(d.nguoiPhuTrachId && { ownerId: d.nguoiPhuTrachId }),
      ...(d.giaiDoan && { stage: d.giaiDoan, disqualifiedReason: null }),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_LEAD,
  });
  const sau = chuyenDoi(l);
  const doiGiaiDoan = sau.giaiDoan !== truoc.giaiDoan;
  await nc.kiemToan({ action: doiGiaiDoan ? "doi-giai-doan" : "sua", objectType: "lead", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
  await nc.suKien({ eventType: SU_KIEN.LEAD_UPDATED, objectType: "lead", objectId: id, payload: doiGiaiDoan ? { tu: truoc.giaiDoan, den: sau.giaiDoan } : {} });
  if (sau.nguoiPhuTrach.id !== truoc.nguoiPhuTrach.id) {
    await nc.suKien({ eventType: SU_KIEN.LEAD_ASSIGNED, objectType: "lead", objectId: id, payload: { nguoiPhuTrachId: sau.nguoiPhuTrach.id } });
  }
  return sau;
}

export async function loaiLead(nc: NguCanh, id: string, lyDo: string) {
  await khoaChungTu(nc.tx, "leads", id);
  const truoc = await docLeadDuocSua(nc, id);
  if (!(LEAD_DANG_MO as string[]).includes(truoc.giaiDoan)) {
    throw new LoiNghiepVu("Chỉ loại được lead đang mở.", 409, "khong-dang-mo");
  }
  const l = await nc.tx.lead.update({
    where: { id },
    data: { stage: "DISQUALIFIED", disqualifiedReason: lyDo, updatedBy: nc.hoSo.userId },
    select: CHON_LEAD,
  });
  const sau = chuyenDoi(l);
  await nc.kiemToan({ action: "doi-giai-doan", objectType: "lead", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
  await nc.suKien({ eventType: SU_KIEN.LEAD_DISQUALIFIED, objectType: "lead", objectId: id, payload: { lyDo } });
  return sau;
}

/**
 * Chuyển đổi lead (LD-05, LD-06). Toàn bộ nằm trong MỘT giao dịch của lớp bọc API:
 * lỗi ở bước nào (trùng MST, thiếu quyền tạo cơ hội…) thì không bước nào được ghi.
 */
export async function chuyenDoiLead(nc: NguCanh, id: string, d: DuLieuChuyenDoiLead) {
  // TV-BH-01: khóa dòng lead rồi mới đọc giai đoạn — bấm "Chuyển đổi" hai lần cùng lúc không
  // sinh hai khách / hai cơ hội; yêu cầu sau chờ, thấy CONVERTED và bị chặn (LD-06).
  await khoaChungTu(nc.tx, "leads", id);
  const lead = await docLeadDuocSua(nc, id);
  if (!(LEAD_DANG_MO as string[]).includes(lead.giaiDoan)) {
    throw new LoiNghiepVu(
      lead.giaiDoan === "CONVERTED" ? "Lead đã được chuyển đổi trước đó (LD-06)." : "Lead đã bị loại. Mở lại trước khi chuyển đổi.",
      409,
      "khong-dang-mo",
    );
  }

  // 1. Khách hàng: gắn khách có sẵn, hoặc tạo mới (tự dò trùng + chặn trùng MST).
  let khachId: string;
  let khachMoi = false;
  if (d.khachHangId) {
    await batBuocThayKhach(nc, d.khachHangId);
    khachId = d.khachHangId;
  } else {
    const km = d.khachMoi!;
    const k = await taoKhachHang(nc, {
      ten: km.ten,
      maSoThue: km.maSoThue ?? lead.maSoThue,
      phanKhuc: km.phanKhuc ?? null,
      loaiKhach: km.loaiKhach ?? null,
      diaChi: km.diaChi ?? null,
      nguon: lead.nguon,
      dienThoai: lead.congTy ? null : lead.dienThoai,
      email: lead.congTy ? null : lead.email,
      nguoiPhuTrachId: lead.nguoiPhuTrach.id,
      ghiChu: lead.nhuCau ? `Nhu cầu ban đầu (lead ${lead.ma}): ${lead.nhuCau}` : null,
      lienHe: null,
      xacNhanKhongTrung: d.xacNhanKhongTrung,
    });
    khachId = k.id;
    khachMoi = true;
  }

  // 2. Liên hệ từ thông tin người của lead.
  let lienHeId: string | null = null;
  if (d.taoLienHe) {
    const lh = await taoLienHe(nc, khachId, {
      hoTen: lead.hoTen,
      chucDanh: lead.chucDanh,
      dienThoai: lead.dienThoai,
      email: lead.email,
      laChinh: khachMoi,
    });
    lienHeId = lh.id;
  }

  // 3. Cơ hội (tùy chọn).
  let coHoiId: string | null = null;
  if (d.coHoi) {
    const ch = await taoCoHoi(
      nc,
      {
        khachHangId: khachId,
        lienHeId,
        tieuDe: d.coHoi.tieuDe,
        moTa: lead.nhuCau,
        giaTri: d.coHoi.giaTri,
        ngayDuKienChot: d.coHoi.ngayDuKienChot ?? null,
        nguon: lead.nguon,
        nguoiPhuTrachId: lead.nguoiPhuTrach.id,
        hanhDongKeTiep: d.coHoi.hanhDongKeTiep,
        ngayHanhDong: d.coHoi.ngayHanhDong,
      },
      { tuLeadId: id },
    );
    coHoiId = ch.id;
  }

  // 3b. Marketing (MK-10): chiến dịch đi theo sang cơ hội; sang khách chỉ khi khách MỚI do
  // chiến dịch mang về — khách cũ đã có lịch sử mua trước chiến dịch, gắn vào sẽ thổi phồng ROAS.
  const { campaignId } = await nc.tx.lead.findUniqueOrThrow({ where: { id }, select: { campaignId: true } });
  if (campaignId) {
    if (khachMoi) await nc.tx.customer.updateMany({ where: { id: khachId, campaignId: null }, data: { campaignId } });
    if (coHoiId) await nc.tx.opportunity.update({ where: { id: coHoiId }, data: { campaignId } });
  }

  // 4. Lịch sử của lead đi theo sang khách (dòng thời gian Customer 360 không sót).
  await nc.tx.interaction.updateMany({ where: { leadId: id, customerId: null }, data: { customerId: khachId, contactId: lienHeId } });
  await nc.tx.task.updateMany({ where: { leadId: id, customerId: null }, data: { customerId: khachId } });

  // 5. Đóng lead, giữ con trỏ.
  const l = await nc.tx.lead.update({
    where: { id },
    data: {
      stage: "CONVERTED",
      convertedCustomerId: khachId,
      convertedOpportunityId: coHoiId,
      convertedAt: new Date(),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_LEAD,
  });
  const sau = chuyenDoi(l);
  await nc.kiemToan({ action: "chuyen-doi", objectType: "lead", objectId: id, before: anhChup(lead), after: anhChup(sau) });
  await nc.suKien({
    eventType: SU_KIEN.LEAD_CONVERTED,
    objectType: "lead",
    objectId: id,
    payload: { khachHangId: khachId, khachMoi, lienHeId, coHoiId },
  });
  return { lead: sau, khachHangId: khachId, coHoiId };
}
