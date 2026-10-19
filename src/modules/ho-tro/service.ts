import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { kiemTraNguoiPhuTrach } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { chuyenDuoc, dangMo, hanSla, mucSla, type NguongSla } from "./tinh-toan";
import type { BoLocPhieu, DuLieuDoiTrangThai, DuLieuSuaPhieu, DuLieuTaoPhieu } from "./luoc-do";
import { taoThongBao } from "@/modules/thong-bao/service";
import { khoaChungTu } from "@/lib/khoa-chung-tu";

/**
 * Bàn dịch vụ (phiếu hỗ trợ) — mục 18 prompt 20/09. Luật: BUSINESS_RULES.md mục 9.
 *
 * Phiếu gắn được với đúng chiếc máy đã bán (số sê-ri → bảo hành → đơn hàng), nên người
 * trực không phải hỏi khách "mua hồi nào, máy gì".
 *
 * Hạn cam kết (SLA) chụp lại lúc mở phiếu từ ngưỡng trong Cấu hình: sau này Giám đốc đổi
 * ngưỡng thì phiếu cũ vẫn giữ hạn đã hứa với khách (HT-03).
 *
 * Quyền `service_desk.*`. Phạm vi: người tiếp nhận HOẶC người đang xử lý — kỹ thuật viên
 * phạm vi "own" thấy phiếu được giao cho mình.
 */

const CHON = {
  id: true, number: true, type: true, priority: true, status: true, title: true, description: true,
  responseDueAt: true, resolveDueAt: true, firstResponseAt: true, resolvedAt: true, firstResolvedAt: true, closedAt: true,
  resolution: true, createdAt: true, updatedAt: true, ownerId: true, assigneeId: true,
  customer: { select: { id: true, code: true, name: true, phone: true } },
  contact: { select: { id: true, fullName: true, phone: true, email: true } },
  warranty: { select: { id: true, serial: true, productName: true, endDate: true, status: true } },
  salesOrder: { select: { id: true, number: true } },
  project: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, fullName: true } },
  assignee: { select: { id: true, fullName: true } },
} satisfies Prisma.SupportTicketSelect;

type BanGhi = Prisma.SupportTicketGetPayload<{ select: typeof CHON }>;

function phieuRa(p: BanGhi, bayGio: Date = new Date()) {
  return {
    id: p.id,
    so: p.number,
    loai: p.type,
    uuTien: p.priority,
    trangThai: p.status,
    tieuDe: p.title,
    moTa: p.description,
    hanPhanHoi: p.responseDueAt,
    hanXuLy: p.resolveDueAt,
    phanHoiLuc: p.firstResponseAt,
    xongLuc: p.resolvedAt,
    xongLanDauLuc: p.firstResolvedAt,
    dongLuc: p.closedAt,
    cachXuLy: p.resolution,
    mucPhanHoi: mucSla(p.responseDueAt, p.firstResponseAt, bayGio, p.createdAt),
    mucXuLy: mucSla(p.resolveDueAt, p.resolvedAt, bayGio, p.createdAt),
    khachHang: { id: p.customer.id, ma: p.customer.code, ten: p.customer.name, dienThoai: p.customer.phone },
    lienHe: p.contact ? { id: p.contact.id, hoTen: p.contact.fullName, dienThoai: p.contact.phone, email: p.contact.email } : null,
    baoHanh: p.warranty ? { id: p.warranty.id, serial: p.warranty.serial, tenHang: p.warranty.productName, hetHan: p.warranty.endDate, trangThai: p.warranty.status } : null,
    donHang: p.salesOrder ? { id: p.salesOrder.id, so: p.salesOrder.number } : null,
    duAn: p.project ? { id: p.project.id, ma: p.project.code, ten: p.project.name } : null,
    nguoiTiepNhan: { id: p.owner.id, hoTen: p.owner.fullName },
    nguoiXuLy: p.assignee ? { id: p.assignee.id, hoTen: p.assignee.fullName } : null,
    taoLuc: p.createdAt,
    suaLuc: p.updatedAt,
  };
}
export type PhieuHoTroChiTiet = ReturnType<typeof phieuRa>;

async function docNguongSla(nc: NguCanh): Promise<NguongSla> {
  const [gioPhanHoiKhan, gioPhanHoiThuong, gioXuLyKhan, gioXuLyThuong] = await Promise.all([
    docCauHinh(nc.tx, "dich_vu.gio_phan_hoi_khan"),
    docCauHinh(nc.tx, "dich_vu.gio_phan_hoi_thuong"),
    docCauHinh(nc.tx, "dich_vu.gio_xu_ly_khan"),
    docCauHinh(nc.tx, "dich_vu.gio_xu_ly_thuong"),
  ]);
  return { gioPhanHoiKhan, gioPhanHoiThuong, gioXuLyKhan, gioXuLyThuong };
}

// ---------------------------------------------------------------------------
// Phạm vi
// ---------------------------------------------------------------------------

/** Phiếu người này được xem: mình tiếp nhận hoặc mình đang xử lý (theo phạm vi quyền). */
export async function dieuKienXemPhieu(nc: NguCanh): Promise<Prisma.SupportTicketWhereInput> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "service_desk.view");
  if (pv === "tat-ca") return {};
  return { OR: [{ ownerId: { in: pv } }, { assigneeId: { in: pv } }] };
}

async function docPhieu(nc: NguCanh, id: string): Promise<BanGhi> {
  const p = await nc.tx.supportTicket.findFirst({ where: { AND: [{ id }, await dieuKienXemPhieu(nc)] }, select: CHON });
  if (!p) throw new LoiKhongTimThay("Phiếu hỗ trợ");
  return p;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachPhieu(nc: NguCanh, boLoc: BoLocPhieu) {
  batBuocQuyen(nc.hoSo, "service_desk.view");
  const bayGio = new Date();
  const dieuKien: Prisma.SupportTicketWhereInput[] = [await dieuKienXemPhieu(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { title: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.trangThai === "") dieuKien.push({ status: { in: ["MOI", "DANG_XU_LY", "CHO_KHACH"] } });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });
  if (boLoc.loai) dieuKien.push({ type: boLoc.loai });
  if (boLoc.uuTien) dieuKien.push({ priority: boLoc.uuTien });
  if (boLoc.nguoiXuLy) dieuKien.push({ assigneeId: boLoc.nguoiXuLy });
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });
  if (boLoc.treHan === "1") {
    dieuKien.push({
      status: { in: ["MOI", "DANG_XU_LY", "CHO_KHACH"] },
      OR: [
        { responseDueAt: { lt: bayGio }, firstResponseAt: null },
        { resolveDueAt: { lt: bayGio }, resolvedAt: null },
      ],
    });
  }

  const where: Prisma.SupportTicketWhereInput = { AND: dieuKien };
  const [tong, ds, tatCa] = await Promise.all([
    nc.tx.supportTicket.count({ where }),
    nc.tx.supportTicket.findMany({ where, select: CHON, orderBy: [{ createdAt: "desc" }], skip: (boLoc.trang - 1) * boLoc.coTrang, take: boLoc.coTrang }),
    nc.tx.supportTicket.findMany({
      where: { AND: [await dieuKienXemPhieu(nc)] },
      select: { status: true, responseDueAt: true, resolveDueAt: true, firstResponseAt: true, resolvedAt: true },
    }),
  ]);

  const dangMoDs = tatCa.filter((p) => dangMo(p.status));
  const treHan = dangMoDs.filter(
    (p) =>
      (p.responseDueAt && !p.firstResponseAt && p.responseDueAt < bayGio) ||
      (p.resolveDueAt && !p.resolvedAt && p.resolveDueAt < bayGio),
  ).length;

  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map((p) => phieuRa(p, bayGio)),
    tomTat: {
      dangMo: dangMoDs.length,
      chuaGiao: dangMoDs.length === 0 ? 0 : tatCa.filter((p) => dangMo(p.status)).length - tatCa.filter((p) => dangMo(p.status) && p.firstResponseAt).length,
      treHan,
      daXong: tatCa.filter((p) => ["HOAN_THANH", "DONG"].includes(p.status)).length,
    },
  };
}

export async function chiTietPhieu(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "service_desk.view", { objectType: "support_ticket", objectId: id });
  const p = await docPhieu(nc, id);
  const [dienBien, nguoi] = await Promise.all([
    nc.tx.supportTicketEvent.findMany({
      where: { ticketId: id },
      select: { id: true, type: true, content: true, fromStatus: true, toStatus: true, actorId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    nc.tx.user.findMany({ where: { status: "hoat-dong", isSystem: false }, select: { id: true, fullName: true } }),
  ]);
  const tenNguoi = Object.fromEntries(nguoi.map((u) => [u.id, u.fullName]));
  const duocSua = coQuyen(nc.hoSo, "service_desk.update");

  return {
    phieu: phieuRa(p),
    dienBien: dienBien.map((d) => ({
      id: d.id,
      loai: d.type,
      noiDung: d.content,
      tuTrangThai: d.fromStatus,
      denTrangThai: d.toStatus,
      nguoi: d.actorId ? (tenNguoi[d.actorId] ?? null) : null,
      luc: d.createdAt,
    })),
    quyen: {
      sua: duocSua && dangMo(p.status),
      giao: duocSua && dangMo(p.status),
      ghiDienBien: duocSua && !["DONG", "HUY"].includes(p.status),
      doiTrangThai: duocSua && !["DONG", "HUY"].includes(p.status),
      dong: duocSua && p.status === "HOAN_THANH",
    },
  };
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

async function ghiDienBienNoiBo(
  nc: NguCanh,
  ticketId: string,
  d: { loai: string; noiDung?: string | null; tu?: string | null; den?: string | null },
) {
  await nc.tx.supportTicketEvent.create({
    data: {
      tenantId: nc.tenantId,
      ticketId,
      type: d.loai,
      content: d.noiDung ?? null,
      fromStatus: d.tu ?? null,
      toStatus: d.den ?? null,
      actorId: nc.hoSo.userId,
    },
  });
}

/**
 * TV-BH-11: mọi thứ gắn vào phiếu (máy / sê-ri, đơn hàng, dự án, bảo hành, liên hệ) phải là của
 * CHÍNH khách trên phiếu. Không thì kỹ thuật viên đi sửa máy của khách khác, hoặc phiếu của
 * khách này lộ đơn hàng của khách kia.
 */
async function kiemGanCungKhach(
  nc: NguCanh,
  khachId: string,
  d: { serialId?: string | null; donHangId?: string | null; duAnId?: string | null; lienHeId?: string | null },
) {
  if (d.lienHeId) {
    const lh = await nc.tx.contact.findFirst({ where: { id: d.lienHeId, customerId: khachId }, select: { id: true } });
    if (!lh) throw new LoiDinhDang("lienHeId", "Liên hệ không thuộc khách hàng này.");
  }
  if (d.donHangId) {
    const don = await nc.tx.salesOrder.findFirst({ where: { id: d.donHangId }, select: { customerId: true, number: true } });
    if (!don) throw new LoiDinhDang("donHangId", "Không tìm thấy đơn hàng.");
    if (don.customerId !== khachId) throw new LoiDinhDang("donHangId", `Đơn ${don.number} là của khách khác.`);
  }
  if (d.duAnId) {
    const da = await nc.tx.project.findFirst({ where: { id: d.duAnId }, select: { customerId: true, code: true } });
    if (!da) throw new LoiDinhDang("duAnId", "Không tìm thấy dự án.");
    if (da.customerId !== khachId) throw new LoiDinhDang("duAnId", `Dự án ${da.code} là của khách khác.`);
  }
  if (d.serialId) {
    // Máy của khách = đã bán theo một đơn của khách, hoặc đang có bảo hành đứng tên khách.
    const sn = await nc.tx.serialNumber.findFirst({
      where: { id: d.serialId },
      select: { serial: true, salesOrderItem: { select: { order: { select: { customerId: true } } } }, warranty: { select: { customerId: true } } },
    });
    if (!sn) throw new LoiDinhDang("serialId", "Không tìm thấy số sê-ri.");
    const cuaKhach = sn.salesOrderItem?.order.customerId === khachId || sn.warranty?.customerId === khachId;
    if (!cuaKhach) throw new LoiDinhDang("serialId", `Máy sê-ri ${sn.serial} không phải máy đã bán cho khách này.`);
  }
}

export async function taoPhieu(nc: NguCanh, d: DuLieuTaoPhieu) {
  batBuocQuyen(nc.hoSo, "service_desk.create", { objectType: "support_ticket" });
  const khach = await batBuocThayKhach(nc, d.khachHangId);

  // Gắn đúng chiếc máy: bảo hành → sê-ri → đơn hàng, ba thứ phải cùng một khách.
  let serialId = d.serialId ?? null;
  let donHangId = d.donHangId ?? null;
  if (d.baoHanhId) {
    const bh = await nc.tx.warranty.findFirst({ where: { id: d.baoHanhId }, select: { id: true, customerId: true, serialNumberId: true, salesOrderId: true } });
    if (!bh) throw new LoiDinhDang("baoHanhId", "Không tìm thấy bảo hành.");
    if (bh.customerId !== khach.id) throw new LoiDinhDang("baoHanhId", "Bảo hành này của khách khác.");
    if (serialId && bh.serialNumberId && serialId !== bh.serialNumberId) throw new LoiDinhDang("serialId", "Số sê-ri không khớp với bảo hành đã chọn.");
    serialId = serialId ?? bh.serialNumberId;
    donHangId = donHangId ?? bh.salesOrderId;
  }
  await kiemGanCungKhach(nc, khach.id, { serialId, donHangId, duAnId: d.duAnId, lienHeId: d.lienHeId });
  if (d.nguoiXuLyId) await kiemTraNguoiPhuTrach(nc, "service_desk.update", d.nguoiXuLyId);

  const bayGio = new Date();
  const { hanPhanHoi, hanXuLy } = hanSla(d.uuTien, bayGio, await docNguongSla(nc));
  const so = await capSoChungTu(nc.tx, KIEU_SO.phieuHoTro);

  const p = await nc.tx.supportTicket.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      customerId: khach.id,
      contactId: d.lienHeId || null,
      warrantyId: d.baoHanhId || null,
      serialNumberId: serialId,
      salesOrderId: donHangId,
      projectId: d.duAnId || null,
      type: d.loai,
      priority: d.uuTien,
      title: d.tieuDe,
      description: d.moTa || null,
      ownerId: nc.hoSo.userId,
      assigneeId: d.nguoiXuLyId || null,
      responseDueAt: hanPhanHoi,
      resolveDueAt: hanXuLy,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, number: true },
  });

  await ghiDienBienNoiBo(nc, p.id, { loai: "tiep-nhan", noiDung: d.moTa || d.tieuDe, den: "MOI" });
  if (d.nguoiXuLyId) await ghiDienBienNoiBo(nc, p.id, { loai: "giao-viec", noiDung: "Giao ngay lúc tiếp nhận" });

  await nc.kiemToan({ action: "tao", objectType: "support_ticket", objectId: p.id, after: { so, khachHangId: khach.id, loai: d.loai, uuTien: d.uuTien } });
  await nc.suKien({ eventType: SU_KIEN.SERVICE_TICKET_CREATED, objectType: "support_ticket", objectId: p.id, payload: { so, loai: d.loai, uuTien: d.uuTien, khachHangId: khach.id } });
  if (d.nguoiXuLyId) {
    await nc.suKien({ eventType: SU_KIEN.SERVICE_TICKET_ASSIGNED, objectType: "support_ticket", objectId: p.id, payload: { so, nguoiXuLyId: d.nguoiXuLyId } });
  }
  return { id: p.id, so, hanPhanHoi, hanXuLy };
}

export async function suaPhieu(nc: NguCanh, id: string, d: DuLieuSuaPhieu) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "support_ticket", objectId: id });
  await khoaChungTu(nc.tx, "support_tickets", id);
  const truoc = await docPhieu(nc, id);
  if (!dangMo(truoc.status)) throw new LoiNghiepVu("Phiếu đã xử lý xong hoặc đã đóng thì không sửa được nữa.", 409, "phieu-da-dong");
  await kiemGanCungKhach(nc, truoc.customer.id, { duAnId: d.duAnId, lienHeId: d.lienHeId });

  // Đổi mức ưu tiên thì tính lại hạn cam kết cho phần chưa làm (HT-03).
  let han: { hanPhanHoi: Date | null; hanXuLy: Date | null } | null = null;
  if (d.uuTien && d.uuTien !== truoc.priority) {
    han = hanSla(d.uuTien, truoc.createdAt, await docNguongSla(nc));
  }

  await nc.tx.supportTicket.update({
    where: { id },
    data: {
      ...(d.uuTien && { priority: d.uuTien }),
      ...(d.tieuDe && { title: d.tieuDe }),
      ...(d.moTa !== undefined && { description: d.moTa || null }),
      ...(d.lienHeId !== undefined && { contactId: d.lienHeId || null }),
      ...(d.duAnId !== undefined && { projectId: d.duAnId || null }),
      ...(han && !truoc.firstResponseAt && { responseDueAt: han.hanPhanHoi }),
      ...(han && !truoc.resolvedAt && { resolveDueAt: han.hanXuLy }),
      updatedBy: nc.hoSo.userId,
    },
  });
  if (d.uuTien && d.uuTien !== truoc.priority) {
    await ghiDienBienNoiBo(nc, id, { loai: "ghi-chu", noiDung: `Đổi mức ưu tiên: ${truoc.priority} → ${d.uuTien}` });
  }
  await nc.kiemToan({ action: "sua", objectType: "support_ticket", objectId: id, before: { uuTien: truoc.priority, tieuDe: truoc.title }, after: { uuTien: d.uuTien ?? truoc.priority, tieuDe: d.tieuDe ?? truoc.title } });
  return { id };
}

/** Giao phiếu cho kỹ thuật viên. Lần đầu có người nhận việc cũng tính là đã phản hồi (HT-04). */
export async function giaoPhieu(nc: NguCanh, id: string, nguoiXuLyId: string, ghiChu: string | null) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "support_ticket", objectId: id });
  await khoaChungTu(nc.tx, "support_tickets", id);
  const p = await docPhieu(nc, id);
  if (!dangMo(p.status)) throw new LoiNghiepVu("Phiếu đã đóng thì không giao lại được.", 409, "phieu-da-dong");
  await kiemTraNguoiPhuTrach(nc, "service_desk.update", nguoiXuLyId);

  await nc.tx.supportTicket.update({
    where: { id },
    data: {
      assigneeId: nguoiXuLyId,
      ...(p.status === "MOI" && { status: "DANG_XU_LY" }),
      updatedBy: nc.hoSo.userId,
    },
  });
  await ghiDienBienNoiBo(nc, id, { loai: "giao-viec", noiDung: ghiChu, tu: p.status, den: p.status === "MOI" ? "DANG_XU_LY" : p.status });
  await nc.kiemToan({ action: "sua", objectType: "support_ticket", objectId: id, before: { nguoiXuLyId: p.assigneeId }, after: { nguoiXuLyId } });
  await nc.suKien({ eventType: SU_KIEN.SERVICE_TICKET_ASSIGNED, objectType: "support_ticket", objectId: id, payload: { so: p.number, nguoiXuLyId } });
  if (nguoiXuLyId !== nc.hoSo.userId) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: nguoiXuLyId,
      loai: "phieu-duoc-giao",
      mucDo: p.priority === "khan" ? "khan" : "canh-bao",
      tieuDe: `Bạn được giao phiếu ${p.number}: ${p.title}`,
      noiDung: ghiChu,
      duongDan: `/dich-vu/ho-tro/${id}`,
      doiTuong: "support_ticket",
      doiTuongId: id,
      khoaChongTrung: `phieu-duoc-giao:${id}:${nguoiXuLyId}`,
    });
  }
  return { id, nguoiXuLyId };
}

/** Ghi một diễn biến: đã gọi khách, đã tới nơi, đã thay linh kiện… (HT-07). */
export async function ghiDienBien(nc: NguCanh, id: string, d: { loai: "ghi-chu" | "phan-hoi-khach"; noiDung: string }) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "support_ticket", objectId: id });
  const p = await docPhieu(nc, id);
  if (["DONG", "HUY"].includes(p.status)) throw new LoiNghiepVu("Phiếu đã đóng thì không ghi thêm được.", 409, "phieu-da-dong");

  await ghiDienBienNoiBo(nc, id, { loai: d.loai, noiDung: d.noiDung });

  // Lần liên hệ khách đầu tiên = mốc phản hồi của SLA.
  if (d.loai === "phan-hoi-khach" && !p.firstResponseAt) {
    await nc.tx.supportTicket.update({ where: { id }, data: { firstResponseAt: new Date(), ...(p.status === "MOI" && { status: "DANG_XU_LY" }) } });
    await nc.suKien({ eventType: SU_KIEN.SERVICE_TICKET_RESPONDED, objectType: "support_ticket", objectId: id, payload: { so: p.number } });
  }
  return { id };
}

/**
 * Đổi trạng thái phiếu. TV-BH-12: mở lại phiếu đã xử lý xong (HOAN_THANH → DANG_XU_LY) thì
 * xóa `resolved_at` — nếu không, bộ quét SLA coi phiếu đã xong và không nhắc trễ hạn nữa. Mốc
 * xử lý xong lần đầu giữ ở `first_resolved_at`; diễn biến ghi loại `mo-lai`.
 */
export async function doiTrangThaiPhieu(nc: NguCanh, id: string, d: DuLieuDoiTrangThai) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "support_ticket", objectId: id });
  await khoaChungTu(nc.tx, "support_tickets", id);
  const p = await docPhieu(nc, id);
  if (!chuyenDuoc(p.status, d.trangThai)) {
    throw new LoiNghiepVu(`Không chuyển phiếu từ "${p.status}" sang "${d.trangThai}" được.`, 409, "sai-trang-thai");
  }
  if (d.trangThai === "HOAN_THANH" && !(d.cachXuLy && d.cachXuLy.trim().length >= 2)) {
    throw new LoiDinhDang("cachXuLy", "Ghi rõ đã xử lý thế nào trước khi đóng phiếu (HT-05).");
  }
  if (d.trangThai === "HUY" && !(d.ghiChu && d.ghiChu.trim().length >= 2)) {
    throw new LoiDinhDang("ghiChu", "Hủy phiếu phải ghi lý do.");
  }

  const bayGio = new Date();
  const moLai = p.status === "HOAN_THANH" && d.trangThai === "DANG_XU_LY";
  await nc.tx.supportTicket.update({
    where: { id },
    data: {
      status: d.trangThai,
      ...(d.trangThai === "HOAN_THANH" && { resolvedAt: p.resolvedAt ?? bayGio, firstResolvedAt: p.firstResolvedAt ?? p.resolvedAt ?? bayGio, resolution: d.cachXuLy }),
      ...(moLai && { resolvedAt: null, firstResolvedAt: p.firstResolvedAt ?? p.resolvedAt }),
      ...(d.trangThai === "DONG" && { closedAt: bayGio, resolvedAt: p.resolvedAt ?? bayGio, firstResolvedAt: p.firstResolvedAt ?? p.resolvedAt ?? bayGio, resolution: p.resolution ?? d.cachXuLy ?? "Đóng phiếu" }),
      ...(d.trangThai === "HUY" && { closedAt: bayGio, resolution: null }),
      ...(!p.firstResponseAt && ["DANG_XU_LY", "CHO_KHACH", "HOAN_THANH"].includes(d.trangThai) && { firstResponseAt: bayGio }),
      updatedBy: nc.hoSo.userId,
    },
  });

  await ghiDienBienNoiBo(nc, id, {
    loai: d.trangThai === "HOAN_THANH" ? "hoan-thanh" : d.trangThai === "DONG" ? "dong" : moLai ? "mo-lai" : "doi-trang-thai",
    noiDung: d.cachXuLy || d.ghiChu || null,
    tu: p.status,
    den: d.trangThai,
  });
  await nc.kiemToan({
    action: "sua", objectType: "support_ticket", objectId: id,
    before: { trangThai: p.status, ...(moLai && { xongLuc: p.resolvedAt }) },
    after: { trangThai: d.trangThai, ...(moLai && { xongLuc: null, moLai: true }) },
  });
  if (moLai) {
    await nc.suKien({ eventType: SU_KIEN.SERVICE_TICKET_REOPENED, objectType: "support_ticket", objectId: id, payload: { so: p.number, lyDo: d.ghiChu ?? null } });
  }

  if (d.trangThai === "HOAN_THANH") {
    await nc.suKien({ eventType: SU_KIEN.SERVICE_TICKET_COMPLETED, objectType: "support_ticket", objectId: id, payload: { so: p.number } });
  }
  if (d.trangThai === "DONG") {
    await nc.suKien({ eventType: SU_KIEN.SERVICE_TICKET_CLOSED, objectType: "support_ticket", objectId: id, payload: { so: p.number } });
  }
  return { id, trangThai: d.trangThai };
}
