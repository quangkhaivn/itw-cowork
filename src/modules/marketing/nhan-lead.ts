import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { ghiKiemToan } from "@/lib/kiem-toan";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { chuanHoaDienThoai, chuanHoaEmail, chuanHoaMaSoThue } from "@/modules/crm/chuan-hoa";
import { LEAD_DANG_MO } from "@/modules/crm/hang-so";
import { khoaDoTrungLead } from "@/modules/crm/chung";
import { trongPhamVi } from "@/modules/crm/chung";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { taoThongBao } from "@/modules/thong-bao/service";
import { NHAN_KENH_NHAN, type KenhNhan } from "./hang-so";
import { chonTheoVongTron, chuanHoaUtmCampaign, hanGoiLai, KY_TU_DIEU_KHIEN, type BoUtm } from "./tinh-toan";
import { cheLienLac, kiemTraChienDichGanDuoc, kiemTraNguonLead, locMarketing } from "./chung";
import type { DuLieuNhapTayLead } from "./luoc-do";

/**
 * MỘT CỬA NHẬN LEAD — `nhanLead()`. Luật MK-06 → MK-10 (BUSINESS_RULES.md mục 22).
 *
 * Mọi nguồn — form công khai, landing page, webhook, nhập tay ở màn hình Marketing — đều
 * gọi đúng hàm này. Nhờ vậy chuẩn hóa, dò trùng, gắn chiến dịch, chia sale, tạo việc gọi
 * lại và báo chuông chỉ viết một lần và không kênh nào "quên" bước nào.
 *
 * Hàm nhận `tx` + tenant thay vì `NguCanh` vì form công khai và webhook KHÔNG có người dùng
 * đăng nhập đứng sau (cùng lý lẽ `taoThongBao`). Người gọi phải tự kiểm quyền / khóa trước:
 * nhập tay kiểm `marketing.create`, webhook kiểm khóa bí mật, form kiểm form đang mở.
 * Hàm luôn chạy bên trong `voiTenant()` của đúng doanh nghiệp — RLS vẫn là lớp chặn cuối.
 */

export interface TacNhanNhanLead {
  /** Người dùng thao tác (nhập tay). Null = khách ngoài qua form / webhook. */
  nguoiId: string | null;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface DuLieuNhanLead {
  kenh: KenhNhan;
  hoTen: string | null;
  dienThoai: string | null;
  email: string | null;
  congTy: string | null;
  chucDanh: string | null;
  maSoThue: string | null;
  nhuCau: string | null;
  ghiChu: string | null;
  /** Mã Dữ liệu gốc `nguon_lead`. Mã lạ / đã tắt thì bỏ, không chặn khách. */
  nguon: string | null;
  /** Chiến dịch mặc định của kênh (form / nguồn webhook / chọn tay). utm_campaign khớp thì thắng. */
  chienDichId: string | null;
  utm: BoUtm;
  /** Chính người đăng ký tự tích đồng ý nhận tin (MK-13). */
  dongYNhanTin: boolean;
  /** Ghi nhận đồng ý ở đâu, ví dụ "form:camera-tet". */
  nguonDongY: string;
  formId?: string | null;
  webhookSourceId?: string | null;
  landingPageId?: string | null;
  landingVariant?: "A" | "B" | null;
  /** Người dự phòng khi không chia được (người phụ trách form / nguồn webhook / người nhập). */
  nguoiDuPhongId: string;
  /** Nhập tay: chỉ định người nhận cụ thể. */
  nguoiChiDinhId?: string | null;
  /** Dữ liệu gốc đã cắt độ dài, lưu để đối chiếu. */
  payload: Record<string, unknown>;
}

export interface KetQuaNhanLead {
  ketQua: "tao-moi" | "ghi-them";
  leadId: string;
  leadMa: string;
  nguoiNhanId: string;
  /** Lý do chọn người nhận — hiện cho Marketing để không ai phải đoán. */
  cachChia: "vong-tron" | "nguoi-phu-trach-khach" | "nguoi-phu-trach-lead" | "phu-trach-chien-dich" | "du-phong" | "chi-dinh" | "quan-tri";
  viecId: string | null;
  hanGoiLai: Date | null;
  khachTrungId: string | null;
  chienDichId: string | null;
  captureId: string;
}

/** Bộ đếm chia lead dùng chung bảng `document_sequences` — nguyên tử như cấp số chứng từ. */
async function tangDemChiaLead(tx: ClientTenant): Promise<number> {
  const [{ last_number }] = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO document_sequences (id, tenant_id, doc_type, period, last_number, updated_at)
    VALUES (gen_random_uuid(), current_setting('app.tenant_id')::uuid, 'chia_lead', '', 1, now())
    ON CONFLICT (tenant_id, doc_type, period)
    DO UPDATE SET last_number = document_sequences.last_number + 1, updated_at = now()
    RETURNING last_number
  `;
  return last_number;
}

/** Điều kiện "có quyền xem lead" — người nhận lead phải mở được lead của mình. */
const CO_QUYEN_XEM_LEAD: Prisma.UserWhereInput = {
  status: "hoat-dong",
  isSystem: false,
  userRoles: {
    some: {
      status: "hoat-dong",
      role: { status: "hoat-dong", rolePermissions: { some: { status: "hoat-dong", permission: { code: "crm.view" } } } },
    },
  },
};

/** Người đang hoạt động VÀ có `crm.view` — điều kiện cho MỌI bước chọn người nhận lead (MK-08). */
async function nhanDuocLead(tx: ClientTenant, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return Boolean(await tx.user.findFirst({ where: { id, ...CO_QUYEN_XEM_LEAD }, select: { id: true } }));
}

/** Danh sách nhận lead còn dùng được, đúng thứ tự vòng (MK-08). */
export async function danhSachNhanLeadHieuLuc(tx: ClientTenant) {
  const ds = await tx.marketingLeadAssignee.findMany({
    where: { status: "hoat-dong", user: CO_QUYEN_XEM_LEAD },
    select: { userId: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return ds.map((d) => d.userId);
}

function cat(s: string | null | undefined, toiDa: number): string | null {
  const t = s?.trim();
  return t ? t.slice(0, toiDa) : null;
}

function moTaKenh(d: DuLieuNhanLead, tenChienDich: string | null) {
  return `${NHAN_KENH_NHAN[d.kenh]}${tenChienDich ? ` · chiến dịch ${tenChienDich}` : ""}${d.utm.utm_source ? ` · nguồn quảng cáo ${d.utm.utm_source}` : ""}`;
}

export async function nhanLead(tx: ClientTenant, tenantId: string, d: DuLieuNhanLead, tacNhan: TacNhanNhanLead): Promise<KetQuaNhanLead> {
  // 0. Chốt cuối: ký tự điều khiển (NUL…) trong bất kỳ trường chữ nào → 400, không để CSDL ném 500.
  for (const [truong, v] of Object.entries({ hoTen: d.hoTen, dienThoai: d.dienThoai, email: d.email, congTy: d.congTy, chucDanh: d.chucDanh, maSoThue: d.maSoThue, nhuCau: d.nhuCau, ghiChu: d.ghiChu, ...d.utm })) {
    if (typeof v === "string" && KY_TU_DIEU_KHIEN.test(v)) throw new LoiDinhDang(truong, "Có ký tự không hợp lệ.");
  }
  // 1. Chuẩn hóa. Sai dạng thì ném lỗi theo trường — bên gọi đã kiểm trước, đây là chốt cuối.
  const dienThoai = chuanHoaDienThoai(d.dienThoai);
  const email = chuanHoaEmail(d.email);
  const maSoThue = chuanHoaMaSoThue(d.maSoThue);
  if (!dienThoai && !email) throw new LoiDinhDang("dienThoai", "Cần số điện thoại hoặc email để liên lạc lại (LD-02).");
  const hoTen = cat(d.hoTen, 255) ?? cat(d.congTy, 255);
  if (!hoTen || hoTen.length < 2) throw new LoiDinhDang("hoTen", "Cần họ tên (hoặc tên công ty).");
  const congTy = cat(d.congTy, 255);
  const nhuCau = cat(d.nhuCau, 3000);
  const ghiChu = cat(d.ghiChu, 3000);
  const bayGio = new Date();

  // 2. Gắn chiến dịch (MK-10): utm_campaign khớp chiến dịch → chiến dịch đó; không thì của kênh.
  let chienDich: { id: string; name: string; ownerId: string } | null = null;
  const utmMa = chuanHoaUtmCampaign(d.utm.utm_campaign);
  if (utmMa) {
    chienDich = await tx.marketingCampaign.findFirst({ where: { utmCampaign: utmMa, status: { not: "huy" } }, select: { id: true, name: true, ownerId: true } });
  }
  if (!chienDich && d.chienDichId) {
    chienDich = await tx.marketingCampaign.findFirst({ where: { id: d.chienDichId, status: { not: "huy" } }, select: { id: true, name: true, ownerId: true } });
  }
  const nguon = d.nguon
    ? (await tx.masterDataItem.findFirst({ where: { type: "nguon_lead", code: d.nguon, status: "hoat-dong" }, select: { code: true } }))?.code ?? null
    : null;
  const soPhut = await docCauHinh(tx, "marketing.phut_goi_lai_lead");
  const han = hanGoiLai(bayGio, soPhut);
  const ghiChuHan = han ? "" : "\nChưa đặt hạn gọi lại lead trong Cấu hình hệ thống (Marketing → Hạn gọi lại lead mới).";
  const kenhMoTa = moTaKenh(d, chienDich?.name ?? null);
  const dongYMoi = { marketingOptIn: true, marketingOptInAt: bayGio, marketingOptOutAt: null, marketingConsentSource: d.nguonDongY.slice(0, 100) };

  const nhatKy = (ketQua: "tao-moi" | "ghi-them", leadId: string, nguoiNhan: string) =>
    tx.leadCapture.create({
      data: {
        tenantId,
        channel: d.kenh,
        result: ketQua,
        leadId,
        campaignId: chienDich?.id ?? null,
        formId: d.formId ?? null,
        webhookSourceId: d.webhookSourceId ?? null,
        landingPageId: d.landingPageId ?? null,
        landingVariant: d.landingVariant ?? null,
        assignedTo: nguoiNhan,
        utmSource: d.utm.utm_source,
        utmMedium: d.utm.utm_medium,
        utmCampaign: d.utm.utm_campaign,
        utmContent: d.utm.utm_content,
        utmTerm: d.utm.utm_term,
        payload: d.payload as never,
        ipAddress: tacNhan.ip,
        createdBy: tacNhan.nguoiId,
      },
      select: { id: true },
    });
  const kiemToan = (action: "tao" | "sua", objectId: string, after: Record<string, unknown>) =>
    ghiKiemToan(tx, { actorId: tacNhan.nguoiId, actorEmail: tacNhan.email, action, objectType: "lead", objectId, after, ipAddress: tacNhan.ip, userAgent: tacNhan.userAgent });
  const suKien = (eventType: (typeof SU_KIEN)[keyof typeof SU_KIEN], objectType: string, objectId: string, payload: Record<string, unknown>) =>
    ghiSuKien(tx, { eventType, actorType: tacNhan.nguoiId ? "user" : "system", actorId: tacNhan.nguoiId, objectType, objectId, payload });

  const taoViecGoiLai = async (leadId: string, nguoiNhan: string, tieuDe: string) => {
    const v = await tx.task.create({
      data: {
        tenantId,
        title: tieuDe.slice(0, 255),
        // MK-15: KHÔNG chép SĐT / email vào mô tả việc — người xem việc mở lead để thấy liên lạc
        // theo đúng quyền của mình (việc có thể giao / chuyển cho người không có crm.view).
        description: `Kênh: ${kenhMoTa}.\nMở lead để xem thông tin liên lạc.${nhuCau ? `\nNhu cầu: ${nhuCau}` : ""}${ghiChuHan}`,
        ownerId: nguoiNhan,
        priority: "cao",
        dueAt: han,
        leadId,
        createdBy: tacNhan.nguoiId,
        updatedBy: tacNhan.nguoiId,
      },
      select: { id: true },
    });
    await suKien(SU_KIEN.TASK_CREATED, "task", v.id, { leadId, tuDong: "goi-lai-lead" });
    return v.id;
  };

  // 3. Dò trùng lead đang mở (MK-07): ghi thêm vào lead cũ, không đẻ lead thứ hai.
  //    Khóa theo SĐT / email / MST trước khi dò — hai lần gửi cùng lúc không lọt qua nhau.
  await khoaDoTrungLead(tx, tenantId, { dienThoai, email, maSoThue });

  // MK-13 "từ chối luôn thắng": người này (lead bất kỳ giai đoạn, hoặc liên hệ khách) đã từng
  // từ chối thì KHÔNG bật đồng ý lại qua kênh công khai — ai cũng gửi form hộ được. Để người
  // phụ trách xác nhận lại bằng tay (ghi chú bên dưới).
  const hoacNguoi = (cot: "lead" | "contact") => [
    ...(dienThoai ? [{ phoneNormalized: dienThoai }] : []),
    ...(email ? [{ emailNormalized: email }] : []),
    ...(cot === "lead" && maSoThue ? [{ taxCodeNormalized: maSoThue }] : []),
  ];
  const [leadTuChoi, lienHeTuChoi] = await Promise.all([
    tx.lead.findFirst({ where: { OR: hoacNguoi("lead"), marketingOptOutAt: { not: null } }, select: { marketingOptOutAt: true }, orderBy: { marketingOptOutAt: "desc" } }),
    tx.contact.findFirst({ where: { OR: hoacNguoi("contact"), marketingOptOutAt: { not: null } }, select: { marketingOptOutAt: true }, orderBy: { marketingOptOutAt: "desc" } }),
  ]);
  const tuChoiLuc = leadTuChoi?.marketingOptOutAt ?? lienHeTuChoi?.marketingOptOutAt ?? null;
  const tichDongYNhungDaTuChoi = d.dongYNhanTin && tuChoiLuc !== null;
  const GHI_CHU_TU_CHOI = "Khách gửi form tích đồng ý nhận tin nhưng đã từng từ chối nhận tin – cần xác nhận lại với khách trước khi gửi tin marketing.";
  const ghiChuTuChoi = (leadId: string, ownerId: string) =>
    tx.interaction.create({
      data: { tenantId, type: "note", leadId, subject: "Cần xác nhận lại đồng ý nhận tin", content: `${GHI_CHU_TU_CHOI}\nKênh: ${kenhMoTa}.`, ownerId, createdBy: tacNhan.nguoiId, updatedBy: tacNhan.nguoiId },
    });
  const hoac: Prisma.LeadWhereInput[] = [];
  if (dienThoai) hoac.push({ phoneNormalized: dienThoai });
  if (email) hoac.push({ emailNormalized: email });
  if (maSoThue) hoac.push({ taxCodeNormalized: maSoThue });
  const cu = await tx.lead.findFirst({
    where: { OR: hoac, stage: { in: LEAD_DANG_MO } },
    select: { id: true, code: true, ownerId: true, phone: true, email: true, companyName: true, taxCode: true, campaignId: true, owner: { select: { status: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (cu) {
    await tx.interaction.create({
      data: {
        tenantId,
        type: "note",
        leadId: cu.id,
        subject: `Đăng ký lại qua ${NHAN_KENH_NHAN[d.kenh].toLowerCase()}`.slice(0, 255),
        content: [`Kênh: ${kenhMoTa}.`, `Họ tên khai: ${hoTen}`, congTy && `Công ty: ${congTy}`, d.dienThoai && `Điện thoại: ${d.dienThoai}`, email && `Email: ${email}`, nhuCau && `Nhu cầu: ${nhuCau}`, ghiChu && `Ghi chú: ${ghiChu}`]
          .filter(Boolean)
          .join("\n"),
        ownerId: cu.ownerId,
        createdBy: tacNhan.nguoiId,
        updatedBy: tacNhan.nguoiId,
      },
    });
    // Bổ sung chỗ còn trống, không ghi đè thông tin sale đã sửa.
    await tx.lead.update({
      where: { id: cu.id },
      data: {
        ...(!cu.phone && dienThoai && { phone: d.dienThoai, phoneNormalized: dienThoai }),
        ...(!cu.email && email && { email, emailNormalized: email }),
        ...(!cu.companyName && congTy && { companyName: congTy }),
        ...(!cu.taxCode && maSoThue && { taxCode: d.maSoThue, taxCodeNormalized: maSoThue }),
        ...(!cu.campaignId && chienDich && { campaignId: chienDich.id }),
        ...(d.dongYNhanTin && !tuChoiLuc ? dongYMoi : {}),
        updatedBy: tacNhan.nguoiId,
      },
    });
    if (tichDongYNhungDaTuChoi) await ghiChuTuChoi(cu.id, cu.ownerId);
    const conViec = await tx.task.findFirst({ where: { leadId: cu.id, status: { in: ["mo", "dang-lam"] } }, select: { id: true } });
    const viecId = conViec ? null : await taoViecGoiLai(cu.id, cu.ownerId, `Gọi lại lead đăng ký lại: ${hoTen}`);
    await taoThongBao(tx, tenantId, {
      nguoiNhanId: cu.ownerId,
      loai: "lead-dang-ky-lai",
      tieuDe: `Lead ${cu.code} vừa đăng ký lại`,
      noiDung: `${hoTen} — ${kenhMoTa}.`,
      duongDan: `/crm/lead/${cu.id}`,
      doiTuong: "lead",
      doiTuongId: cu.id,
    });
    const nk = await nhatKy("ghi-them", cu.id, cu.ownerId);
    await kiemToan("sua", cu.id, { ghiThemTu: d.kenh, chienDichId: chienDich?.id ?? null, dongYNhanTin: d.dongYNhanTin });
    await suKien(SU_KIEN.LEAD_RECAPTURED, "lead", cu.id, { kenh: d.kenh, chienDichId: chienDich?.id ?? null, captureId: nk.id });
    return {
      ketQua: "ghi-them",
      leadId: cu.id,
      leadMa: cu.code,
      nguoiNhanId: cu.ownerId,
      cachChia: "nguoi-phu-trach-lead",
      viecId,
      hanGoiLai: viecId ? han : null,
      khachTrungId: null,
      chienDichId: chienDich?.id ?? null,
      captureId: nk.id,
    };
  }

  // 4. Trùng khách / liên hệ đã có → vẫn tạo lead (nhu cầu mới), gắn cảnh báo, giao người phụ trách khách.
  const hoacKhach: Prisma.CustomerWhereInput[] = [];
  if (dienThoai) hoacKhach.push({ phoneNormalized: dienThoai }, { contacts: { some: { phoneNormalized: dienThoai, status: "hoat-dong" } } });
  if (email) hoacKhach.push({ emailNormalized: email }, { contacts: { some: { emailNormalized: email, status: "hoat-dong" } } });
  if (maSoThue) hoacKhach.push({ taxCodeNormalized: maSoThue });
  const chonKhach = { id: true, code: true, name: true, ownerId: true } as const;
  // Khách đã gộp (gói K, KHN-12/13) không nhận bản ghi mới: ưu tiên khách còn dùng; chỉ trùng khách
  // đã gộp thì đi theo `merged_into_id` sang khách giữ lại.
  let khach = await tx.customer.findFirst({ where: { OR: hoacKhach, status: { not: "da-gop" } }, select: chonKhach, orderBy: { createdAt: "asc" } });
  if (!khach && hoacKhach.length) {
    const daGop = await tx.customer.findFirst({ where: { OR: hoacKhach, status: "da-gop" }, select: { mergedIntoId: true }, orderBy: { createdAt: "asc" } });
    if (daGop?.mergedIntoId) khach = await tx.customer.findFirst({ where: { id: daGop.mergedIntoId, status: { not: "da-gop" } }, select: chonKhach });
  }

  // 5. Chọn người nhận (MK-08).
  let nguoiNhan: string | null = null;
  let cachChia: KetQuaNhanLead["cachChia"] = "vong-tron";
  if (d.nguoiChiDinhId && (await nhanDuocLead(tx, d.nguoiChiDinhId))) {
    nguoiNhan = d.nguoiChiDinhId;
    cachChia = "chi-dinh";
  } else if (khach && (await nhanDuocLead(tx, khach.ownerId))) {
    nguoiNhan = khach.ownerId;
    cachChia = "nguoi-phu-trach-khach";
  } else {
    const ds = await danhSachNhanLeadHieuLuc(tx);
    if (ds.length) {
      nguoiNhan = chonTheoVongTron(ds, await tangDemChiaLead(tx));
      cachChia = "vong-tron";
    } else if (chienDich && (await nhanDuocLead(tx, chienDich.ownerId))) {
      nguoiNhan = chienDich.ownerId;
      cachChia = "phu-trach-chien-dich";
    } else if (await nhanDuocLead(tx, d.nguoiDuPhongId)) {
      nguoiNhan = d.nguoiDuPhongId;
      cachChia = "du-phong";
    } else {
      // Đường cuối: người phụ trách form đã nghỉ mà chưa ai cấu hình danh sách nhận lead.
      // Không bỏ rơi khách — giao Giám đốc / Quản trị và để chuông báo họ cấu hình lại.
      const qt = await tx.user.findFirst({
        where: { status: "hoat-dong", isSystem: false, userRoles: { some: { status: "hoat-dong", role: { code: { in: ["ceo", "admin"] } } } } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (!qt) throw new LoiNghiepVu("Chưa có ai nhận lead. Liên hệ quản trị hệ thống.", 503, "chua-co-nguoi-nhan");
      nguoiNhan = qt.id;
      cachChia = "quan-tri";
    }
  }

  if (!nguoiNhan) throw new LoiNghiepVu("Chưa có ai nhận lead. Liên hệ quản trị hệ thống.", 503, "chua-co-nguoi-nhan");

  // 6. Tạo lead.
  const ma = await capSoChungTu(tx, KIEU_SO.lead);
  const l = await tx.lead.create({
    data: {
      tenantId,
      code: ma,
      fullName: hoTen,
      companyName: congTy,
      title: cat(d.chucDanh, 255),
      phone: dienThoai ? cat(d.dienThoai, 30) : null,
      phoneNormalized: dienThoai,
      email,
      emailNormalized: email,
      taxCode: maSoThue ? cat(d.maSoThue, 30) : null,
      taxCodeNormalized: maSoThue,
      source: nguon,
      need: nhuCau,
      note: ghiChu,
      ownerId: nguoiNhan,
      campaignId: chienDich?.id ?? null,
      utmSource: d.utm.utm_source,
      utmMedium: d.utm.utm_medium,
      utmCampaign: d.utm.utm_campaign,
      utmContent: d.utm.utm_content,
      utmTerm: d.utm.utm_term,
      captureChannel: d.kenh,
      matchedCustomerId: khach?.id ?? null,
      rawPayload: d.payload as never,
      // MK-13: đã từng từ chối → lead mới mang luôn lời từ chối (từ chối luôn thắng).
      ...(tuChoiLuc
        ? { marketingOptOutAt: tuChoiLuc, marketingConsentSource: "ke-thua-tu-choi" }
        : d.dongYNhanTin
          ? dongYMoi
          : {}),
      createdBy: tacNhan.nguoiId,
      updatedBy: tacNhan.nguoiId,
    },
    select: { id: true },
  });
  if (tichDongYNhungDaTuChoi) await ghiChuTuChoi(l.id, nguoiNhan);
  const viecId = await taoViecGoiLai(l.id, nguoiNhan, `Gọi lại lead mới: ${hoTen}${congTy && congTy !== hoTen ? ` — ${congTy}` : ""}`);
  await taoThongBao(tx, tenantId, {
    nguoiNhanId: nguoiNhan,
    loai: "lead-moi",
    mucDo: khach ? "canh-bao" : "thong-tin",
    tieuDe: `Lead mới ${ma}: ${hoTen}`,
    noiDung: `${kenhMoTa}.${khach ? ` Trùng khách đã có ${khach.code} — ${khach.name}.` : ""}${han ? "" : " Chưa đặt hạn gọi lại."}`,
    duongDan: `/crm/lead/${l.id}`,
    doiTuong: "lead",
    doiTuongId: l.id,
  });
  const nk = await nhatKy("tao-moi", l.id, nguoiNhan);
  await kiemToan("tao", l.id, {
    ma,
    hoTen,
    kenh: d.kenh,
    chienDichId: chienDich?.id ?? null,
    nguoiPhuTrachId: nguoiNhan,
    cachChia,
    khachTrungId: khach?.id ?? null,
    dongYNhanTin: d.dongYNhanTin,
  });
  await suKien(SU_KIEN.LEAD_CAPTURED, "lead", l.id, { ma, kenh: d.kenh, nguon, chienDichId: chienDich?.id ?? null, captureId: nk.id });
  await suKien(SU_KIEN.LEAD_ASSIGNED, "lead", l.id, { nguoiPhuTrachId: nguoiNhan, cachChia });
  return {
    ketQua: "tao-moi",
    leadId: l.id,
    leadMa: ma,
    nguoiNhanId: nguoiNhan,
    cachChia,
    viecId,
    hanGoiLai: han,
    khachTrungId: khach?.id ?? null,
    chienDichId: chienDich?.id ?? null,
    captureId: nk.id,
  };
}

/**
 * Ghi một lần nhận bị TỪ CHỐI (khóa sai, dữ liệu hỏng, quá tốc độ, bẫy spam). Gọi trong
 * một `voiTenant()` RIÊNG sau khi giao dịch chính đã cuộn ngược — giống `ghiTuChoiQuyen`.
 */
export async function ghiNhanBiTuChoi(
  tx: ClientTenant,
  tenantId: string,
  d: {
    kenh: KenhNhan;
    ketQua?: "tu-choi" | "spam";
    lyDo: string;
    formId?: string | null;
    webhookSourceId?: string | null;
    landingPageId?: string | null;
    ip: string | null;
    payload?: Record<string, unknown>;
  },
) {
  await tx.leadCapture.create({
    data: {
      tenantId,
      channel: d.kenh,
      result: d.ketQua ?? "tu-choi",
      reason: d.lyDo.slice(0, 1000),
      formId: d.formId ?? null,
      webhookSourceId: d.webhookSourceId ?? null,
      landingPageId: d.landingPageId ?? null,
      payload: (d.payload ?? null) as never,
      ipAddress: d.ip,
    },
  });
}

// ---------------------------------------------------------------------------
// Nhập tay ở màn hình Marketing
// ---------------------------------------------------------------------------

export async function nhapTayLead(nc: NguCanh, d: DuLieuNhapTayLead) {
  batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "lead" });
  await kiemTraChienDichGanDuoc(nc.tx, d.chienDichId);
  await kiemTraNguonLead(nc.tx, d.nguon);
  const kq = await nhanLead(
    nc.tx,
    nc.tenantId,
    {
      kenh: "nhap-tay",
      hoTen: d.hoTen,
      dienThoai: d.dienThoai ?? null,
      email: d.email ?? null,
      congTy: d.congTy ?? null,
      chucDanh: d.chucDanh ?? null,
      maSoThue: d.maSoThue ?? null,
      nhuCau: d.nhuCau ?? null,
      ghiChu: d.ghiChu ?? null,
      nguon: d.nguon ?? null,
      chienDichId: d.chienDichId ?? null,
      utm: { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null },
      dongYNhanTin: d.dongYNhanTin,
      nguonDongY: `nhap-tay:${nc.hoSo.email}`,
      nguoiDuPhongId: nc.hoSo.userId,
      payload: { nhapBoi: nc.hoSo.email },
    },
    { nguoiId: nc.hoSo.userId, email: nc.hoSo.email, ip: nc.ip, userAgent: nc.userAgent },
  );
  return kq;
}

// ---------------------------------------------------------------------------
// Danh sách sale nhận lead (MK-08)
// ---------------------------------------------------------------------------

export async function cauHinhNhanLead(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const [ds, ungVien, soPhut] = await Promise.all([
    nc.tx.marketingLeadAssignee.findMany({
      where: { status: "hoat-dong" },
      select: { userId: true, sortOrder: true, user: { select: { fullName: true, email: true, status: true } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    nc.tx.user.findMany({ where: CO_QUYEN_XEM_LEAD, select: { id: true, fullName: true, email: true }, orderBy: { fullName: "asc" } }),
    docCauHinh(nc.tx, "marketing.phut_goi_lai_lead"),
  ]);
  const hopLe = new Set(ungVien.map((u) => u.id));
  return {
    danhSach: ds.map((d) => ({ id: d.userId, hoTen: d.user.fullName, email: d.user.email, conHieuLuc: hopLe.has(d.userId) })),
    ungVien: ungVien.map((u) => ({ id: u.id, hoTen: u.fullName, email: u.email })),
    phutGoiLai: soPhut,
    duocSua: coQuyen(nc.hoSo, "marketing.update"),
  };
}

/** Thay cả danh sách theo đúng thứ tự gửi lên. Người không có `crm.view` bị từ chối. */
export async function datDanhSachNhanLead(nc: NguCanh, nguoiIds: string[]) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "marketing_lead_assignee" });
  const ids = [...new Set(nguoiIds)];
  if (ids.length) {
    const hopLe = await nc.tx.user.findMany({ where: { id: { in: ids }, ...CO_QUYEN_XEM_LEAD }, select: { id: true } });
    if (hopLe.length !== ids.length) {
      throw new LoiNghiepVu("Có người không còn hoạt động hoặc không có quyền xem lead (crm.view), nên không nhận lead được.", 422, "nguoi-nhan-khong-hop-le");
    }
  }
  const truoc = await danhSachNhanLeadHieuLuc(nc.tx);
  await nc.tx.marketingLeadAssignee.updateMany({ where: { userId: { notIn: ids } }, data: { status: "tam-dung", updatedBy: nc.hoSo.userId } });
  for (const [i, userId] of ids.entries()) {
    await nc.tx.marketingLeadAssignee.upsert({
      where: { tenantId_userId: { tenantId: nc.tenantId, userId } },
      create: { tenantId: nc.tenantId, userId, sortOrder: i, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
      update: { sortOrder: i, status: "hoat-dong", updatedBy: nc.hoSo.userId },
    });
  }
  await nc.kiemToan({ action: "sua", objectType: "marketing_lead_assignee", before: { nguoiIds: truoc }, after: { nguoiIds: ids } });
  await nc.suKien({ eventType: SU_KIEN.LEAD_ASSIGNEES_CHANGED, objectType: "marketing_lead_assignee", payload: { soNguoi: ids.length } });
  return { nguoiIds: ids };
}

// ---------------------------------------------------------------------------
// Nhật ký nhận lead
// ---------------------------------------------------------------------------

export async function nhatKyNhanLead(
  nc: NguCanh,
  boLoc: { kenh?: string; ketQua?: string; chienDichId?: string; webhookSourceId?: string; formId?: string; trang?: number },
) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const where: Prisma.LeadCaptureWhereInput = {
    ...(boLoc.kenh && { channel: boLoc.kenh }),
    ...(boLoc.ketQua && { result: boLoc.ketQua }),
    ...(boLoc.chienDichId && { campaignId: boLoc.chienDichId }),
    ...(boLoc.webhookSourceId && { webhookSourceId: boLoc.webhookSourceId }),
    ...(boLoc.formId && { formId: boLoc.formId }),
  };
  const trang = Math.max(1, boLoc.trang ?? 1);
  const coTrang = 30;
  const [tong, dong] = await Promise.all([
    nc.tx.leadCapture.count({ where }),
    nc.tx.leadCapture.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (trang - 1) * coTrang,
      take: coTrang,
      select: {
        id: true, channel: true, result: true, reason: true, createdAt: true, ipAddress: true, utmSource: true, utmCampaign: true, assignedTo: true,
        lead: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
        campaign: { select: { id: true, code: true, name: true } },
        form: { select: { name: true } },
        webhookSource: { select: { name: true } },
        landingPage: { select: { name: true } },
      },
    }),
  ]);
  const nguoi = await nc.tx.user.findMany({ where: { id: { in: dong.map((d) => d.assignedTo).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
  const tenNguoi = new Map(nguoi.map((n) => [n.id, n.fullName]));
  return {
    tong,
    trang,
    coTrang,
    dong: dong.map((d) => ({
      id: d.id,
      kenh: d.channel,
      ketQua: d.result,
      lyDo: d.reason,
      luc: d.createdAt,
      ip: d.ipAddress,
      utmSource: d.utmSource,
      utmCampaign: d.utmCampaign,
      nguoiNhan: d.assignedTo ? (tenNguoi.get(d.assignedTo) ?? null) : null,
      noiNhan: d.form?.name ?? d.webhookSource?.name ?? d.landingPage?.name ?? null,
      chienDich: d.campaign ? { id: d.campaign.id, ma: d.campaign.code, ten: d.campaign.name } : null,
      lead: d.lead
        ? cheLienLac(nc.hoSo, "lead", { id: d.lead.id, ma: d.lead.code, hoTen: d.lead.fullName, dienThoai: d.lead.phone, email: d.lead.email })
        : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Đồng ý / từ chối nhận tin (MK-13) — trên lead và trên liên hệ
// ---------------------------------------------------------------------------

export async function doiDongYNhanTin(nc: NguCanh, doiTuong: "lead" | "lien-he", id: string, d: { dongY: boolean; nguon: string }) {
  // Ai sửa được bản ghi thì ghi nhận được ý kiến của chính người đó; Marketing cũng được.
  const quyen = doiTuong === "lead" ? "crm.update" : "customer.update";
  if (!coQuyen(nc.hoSo, quyen) && !coQuyen(nc.hoSo, "marketing.update")) batBuocQuyen(nc.hoSo, quyen, { objectType: doiTuong, objectId: id });
  const bayGio = new Date();
  const data = d.dongY
    ? { marketingOptIn: true, marketingOptInAt: bayGio, marketingOptOutAt: null, marketingConsentSource: d.nguon }
    : { marketingOptIn: false, marketingOptOutAt: bayGio, marketingConsentSource: d.nguon };
  if (doiTuong === "lead") {
    const l = await nc.tx.lead.findFirst({ where: { id, ...(coQuyen(nc.hoSo, "marketing.update") ? {} : await locMarketing(nc, "crm.update")) }, select: { id: true, marketingOptIn: true, marketingOptOutAt: true } });
    if (!l) throw new LoiKhongTimThay("Lead");
    await nc.tx.lead.update({ where: { id }, data: { ...data, updatedBy: nc.hoSo.userId } });
    await nc.kiemToan({ action: "sua", objectType: "lead", objectId: id, before: { dongYNhanTin: l.marketingOptIn, tuChoiLuc: l.marketingOptOutAt }, after: { dongYNhanTin: d.dongY, nguon: d.nguon } });
  } else {
    const c = await nc.tx.contact.findFirst({ where: { id }, select: { id: true, marketingOptIn: true, marketingOptOutAt: true, customer: { select: { ownerId: true } } } });
    if (!c) throw new LoiKhongTimThay("Liên hệ");
    if (!coQuyen(nc.hoSo, "marketing.update") && !(await trongPhamVi(nc, "customer.update", c.customer.ownerId))) throw new LoiKhongTimThay("Liên hệ");
    await nc.tx.contact.update({ where: { id }, data: { ...data, updatedBy: nc.hoSo.userId } });
    await nc.kiemToan({ action: "sua", objectType: "contact", objectId: id, before: { dongYNhanTin: c.marketingOptIn, tuChoiLuc: c.marketingOptOutAt }, after: { dongYNhanTin: d.dongY, nguon: d.nguon } });
  }
  await nc.suKien({ eventType: SU_KIEN.MARKETING_CONSENT_CHANGED, objectType: doiTuong === "lead" ? "lead" : "contact", objectId: id, payload: { dongY: d.dongY } });
  return { id, dongY: d.dongY };
}

/** Thông tin marketing của một lead cho trang chi tiết lead (CRM). Cùng quyền + phạm vi `crm.view`. */
export async function thongTinMarketingLead(nc: NguCanh, leadId: string) {
  batBuocQuyen(nc.hoSo, "crm.view", { objectType: "lead", objectId: leadId });
  const l = await nc.tx.lead.findFirst({
    where: { id: leadId, ...(await locMarketing(nc, "crm.view")) },
    select: {
      captureChannel: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
      marketingOptIn: true, marketingOptInAt: true, marketingOptOutAt: true, marketingConsentSource: true,
      campaign: { select: { id: true, code: true, name: true } },
      matchedCustomer: { select: { id: true, code: true, name: true } },
      _count: { select: { captures: true } },
    },
  });
  if (!l) throw new LoiKhongTimThay("Lead");
  return {
    kenhNhan: l.captureChannel,
    utm: { utm_source: l.utmSource, utm_medium: l.utmMedium, utm_campaign: l.utmCampaign, utm_content: l.utmContent, utm_term: l.utmTerm },
    chienDich: l.campaign ? { id: l.campaign.id, ma: l.campaign.code, ten: l.campaign.name } : null,
    khachTrung: l.matchedCustomer ? { id: l.matchedCustomer.id, ma: l.matchedCustomer.code, ten: l.matchedCustomer.name } : null,
    dongYNhanTin: l.marketingOptIn,
    dongYLuc: l.marketingOptInAt,
    tuChoiLuc: l.marketingOptOutAt,
    nguonDongY: l.marketingConsentSource,
    soLanDangKy: l._count.captures,
    duocDoiDongY: coQuyen(nc.hoSo, "crm.update") || coQuyen(nc.hoSo, "marketing.update"),
  };
}
