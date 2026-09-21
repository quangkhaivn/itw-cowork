import type { Prisma } from "@/generated/prisma/client";
import type { ClientTenant } from "@/lib/db";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { taoThongBao } from "@/modules/thong-bao/service";
import { congNo } from "@/modules/tai-chinh/tinh-toan";
import { MA_TAC_VU_QUET, QUY_TAC, timQuyTac, type DinhNghiaQuyTac } from "./quy-tac";
import {
  cauTomTatHangNgay,
  congNgay,
  congThang,
  kiemTraDieuKien,
  kyBaoTriKeTiep,
  mocQuaHan,
  sapXepViec,
  soNgayGiua,
  tomTatViec,
} from "./tinh-toan";

/**
 * Bản quét nhắc việc — mục 21–22 prompt 20/09. Luật: BUSINESS_RULES.md mục 13.
 *
 * Mỗi ngày quét một lần, sinh ra "Việc hôm nay" cho từng người và một thông báo tóm tắt.
 * Chạy lại trong ngày **không nhân đôi** nhờ khóa duy nhất trên `daily_action_items`
 * (người + ngày + quy tắc + đối tượng) và `dedupe_key` trên thông báo.
 *
 * Bản quét chạy với tư cách **hệ thống**, không phải một người, nên nó nhìn toàn bộ dữ
 * liệu của doanh nghiệp. Việc sinh ra luôn gắn đúng người phụ trách bản ghi, và mỗi
 * người chỉ đọc được việc của chính mình — phạm vi dữ liệu không bị bản quét chọc thủng.
 */

export interface KetQuaQuyTac {
  ma: string;
  chay: boolean;
  lyDoBoQua: string;
  soViec: number;
}

export interface KetQuaQuet {
  jobRunId: string;
  ngay: string;
  soQuyTacChay: number;
  soQuyTacBoQua: number;
  soViec: number;
  soThongBao: number;
  quyTac: KetQuaQuyTac[];
}

/** "2026-09-17" → "17/09/2026". Câu lý do là chữ người đọc, không phải chuỗi máy. */
function ngayGon(ngay: string): string {
  const [n, t, g] = ngay.split("-");
  return n && t && g ? `${g}/${t}/${n}` : ngay;
}

/** Một việc chuẩn bị ghi. `nguoiId` null = không có ai phụ trách → bỏ, không đẩy bừa. */
interface ViecMoi {
  nguoiId: string | null;
  maQuyTac: string;
  mucDo: string;
  tieuDe: string;
  lyDo: string;
  duongDan: string;
  doiTuong: string;
  doiTuongId: string;
}

// ---------------------------------------------------------------------------
// Trạng thái quy tắc: công tắc trong CSDL + ngưỡng trong Cấu hình
// ---------------------------------------------------------------------------

export interface TrangThaiQuyTac {
  ma: string;
  nhan: string;
  moTa: string;
  nhom: string;
  mucDo: string;
  bat: boolean;
  khoaNguong: string | null;
  nguong: number | null;
  chay: boolean;
  lyDoBoQua: string;
  lanChayCuoi: Date | null;
}

export async function trangThaiQuyTac(tx: ClientTenant): Promise<TrangThaiQuyTac[]> {
  const congTac = await tx.automationRule.findMany({ select: { code: true, enabled: true, lastRunAt: true } });
  const ra: TrangThaiQuyTac[] = [];
  for (const q of QUY_TAC) {
    const ct = congTac.find((c) => c.code === q.ma);
    const bat = ct?.enabled ?? true;
    const nguong = q.khoaNguong ? await docCauHinh(tx, q.khoaNguong) : null;
    const dk = kiemTraDieuKien(q, bat, nguong);
    ra.push({
      ma: q.ma,
      nhan: q.nhan,
      moTa: q.moTa,
      nhom: q.nhom,
      mucDo: q.mucDo,
      bat,
      khoaNguong: q.khoaNguong,
      nguong: dk.nguong,
      chay: dk.chay,
      lyDoBoQua: dk.lyDoBoQua,
      lanChayCuoi: ct?.lastRunAt ?? null,
    });
  }
  return ra;
}

// ---------------------------------------------------------------------------
// Từng quy tắc — mỗi hàm chỉ ĐỌC và trả về danh sách việc, không tự ghi
// ---------------------------------------------------------------------------

async function quetBaoGiaChoPhanHoi(tx: ClientTenant, homNay: string, nguong: number): Promise<ViecMoi[]> {
  const moc = new Date(`${mocQuaHan(homNay, nguong)}T23:59:59+07:00`);
  const ds = await tx.quotation.findMany({
    where: {
      status: { in: ["SENT", "VIEWED", "NEGOTIATING"] },
      currentVersion: { sentAt: { lt: moc } },
    },
    select: {
      id: true, number: true, ownerId: true,
      customer: { select: { name: true } },
      currentVersion: { select: { sentAt: true, total: true } },
    },
  });
  return ds.map((q) => {
    const ngayGui = q.currentVersion?.sentAt ? dateVeNgay(q.currentVersion.sentAt) : homNay;
    const soNgay = soNgayGiua(ngayGui, homNay);
    return {
      nguoiId: q.ownerId,
      maQuyTac: "bao-gia-cho-phan-hoi",
      mucDo: "canh-bao",
      tieuDe: `Gọi lại về báo giá ${q.number} — ${q.customer.name}`,
      lyDo: `Đã gửi ${soNgay} ngày (từ ${ngayGon(ngayGui)}) mà khách chưa trả lời.`,
      duongDan: `/ban-hang/bao-gia/${q.id}`,
      doiTuong: "quotation",
      doiTuongId: q.id,
    };
  });
}

async function quetCoHoiKhongHoatDong(tx: ClientTenant, homNay: string, nguong: number): Promise<ViecMoi[]> {
  const mocNgay = mocQuaHan(homNay, nguong);
  const moc = new Date(`${mocNgay}T23:59:59+07:00`);
  const ds = await tx.opportunity.findMany({
    where: {
      stage: { notIn: ["WON", "LOST"] },
      status: "hoat-dong",
      createdAt: { lt: moc },
      interactions: { none: { occurredAt: { gte: moc } } },
    },
    select: {
      id: true, code: true, title: true, ownerId: true, createdAt: true,
      customer: { select: { name: true } },
      interactions: { select: { occurredAt: true }, orderBy: { occurredAt: "desc" }, take: 1 },
    },
  });
  return ds.map((c) => {
    const ganNhat = c.interactions[0]?.occurredAt ?? c.createdAt;
    const soNgay = soNgayGiua(dateVeNgay(ganNhat), homNay);
    return {
      nguoiId: c.ownerId,
      maQuyTac: "co-hoi-khong-hoat-dong",
      mucDo: "canh-bao",
      tieuDe: `Cơ hội ${c.code} im lặng — ${c.customer.name}`,
      lyDo: c.interactions.length
        ? `${soNgay} ngày không có cuộc gọi, cuộc gặp hay ghi chú nào.`
        : `Mở ${soNgay} ngày mà chưa ghi nhận liên hệ nào.`,
      duongDan: `/ban-hang/co-hoi/${c.id}`,
      doiTuong: "opportunity",
      doiTuongId: c.id,
    };
  });
}

async function quetViecQuaHan(tx: ClientTenant, homNay: string): Promise<ViecMoi[]> {
  const ds = await tx.task.findMany({
    where: { status: { in: ["mo", "dang-lam"] }, dueAt: { lt: new Date() } },
    select: { id: true, title: true, ownerId: true, dueAt: true },
  });
  return ds.map((v) => ({
    nguoiId: v.ownerId,
    maQuyTac: "viec-qua-han",
    mucDo: "khan",
    tieuDe: v.title,
    lyDo: `Quá hạn ${soNgayGiua(dateVeNgay(v.dueAt), homNay)} ngày (hạn ${ngayGon(dateVeNgay(v.dueAt))}).`,
    duongDan: `/cong-viec?id=${v.id}`,
    doiTuong: "task",
    doiTuongId: v.id,
  }));
}

async function quetCongNoQuaHan(tx: ClientTenant, homNay: string, nguong: number): Promise<ViecMoi[]> {
  const han = ngayVeDate(mocQuaHan(homNay, nguong));
  const ds = await tx.invoice.findMany({
    where: { status: "ISSUED", dueDate: { lt: han } },
    select: {
      id: true, number: true, ownerId: true, total: true, dueDate: true, status: true,
      customer: { select: { name: true } },
      allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, salesReturn: { select: { status: true } } } },
    },
  });
  const ra: ViecMoi[] = [];
  for (const hd of ds) {
    const daThu = hd.allocations.filter((a) => a.payment.status === "hoat-dong").reduce((s, a) => s + Number(a.amount), 0);
    const daGiamTru = hd.returnAllocations.filter((a) => a.salesReturn.status === "SETTLED").reduce((s, a) => s + Number(a.amount), 0);
    const cn = congNo(hd.status, hd.total.toString(), daThu, { daGiamTru });
    if (cn.conNo <= 0) continue;
    const ngayHan = dateVeNgay(hd.dueDate);
    ra.push({
      nguoiId: hd.ownerId,
      maQuyTac: "cong-no-qua-han",
      mucDo: "khan",
      tieuDe: `Đòi nợ hóa đơn ${hd.number} — ${hd.customer.name}`,
      lyDo: `Còn ${cn.conNo.toLocaleString("vi-VN")} ₫, quá hạn ${soNgayGiua(ngayHan, homNay)} ngày (hạn ${ngayGon(ngayHan)}).`,
      duongDan: `/tai-chinh/hoa-don/${hd.id}`,
      doiTuong: "invoice",
      doiTuongId: hd.id,
    });
  }
  return ra;
}

async function quetPhieuTreHan(tx: ClientTenant): Promise<ViecMoi[]> {
  const bayGio = new Date();
  const ds = await tx.supportTicket.findMany({
    where: {
      status: { in: ["MOI", "DANG_XU_LY", "CHO_KHACH"] },
      OR: [
        { firstResponseAt: null, responseDueAt: { lt: bayGio } },
        { resolvedAt: null, resolveDueAt: { lt: bayGio } },
      ],
    },
    select: {
      id: true, number: true, title: true, ownerId: true, assigneeId: true,
      responseDueAt: true, resolveDueAt: true, firstResponseAt: true, resolvedAt: true,
      customer: { select: { name: true } },
    },
  });
  return ds.map((p) => {
    const trePhanHoi = !p.firstResponseAt && p.responseDueAt !== null && p.responseDueAt < bayGio;
    const han = trePhanHoi ? p.responseDueAt! : p.resolveDueAt!;
    const gioTre = Math.max(0, Math.round((bayGio.getTime() - han.getTime()) / 3_600_000));
    return {
      nguoiId: p.assigneeId ?? p.ownerId,
      maQuyTac: "phieu-ho-tro-tre-han",
      mucDo: "khan",
      tieuDe: `Phiếu ${p.number} trễ cam kết — ${p.customer.name}`,
      lyDo: trePhanHoi
        ? `Chưa phản hồi khách, trễ ${gioTre} giờ so với hạn đã hứa.`
        : `Chưa xử lý xong, trễ ${gioTre} giờ so với hạn đã hứa.`,
      duongDan: `/dich-vu/ho-tro/${p.id}`,
      doiTuong: "support_ticket",
      doiTuongId: p.id,
    };
  });
}

async function quetBaoHanhSapHet(
  tx: ClientTenant,
  tenantId: string,
  homNay: string,
  nguong: number,
): Promise<ViecMoi[]> {
  const den = ngayVeDate(congNgay(homNay, nguong));
  const ds = await tx.warranty.findMany({
    where: { status: "hieu-luc", endDate: { gte: ngayVeDate(homNay), lte: den } },
    select: {
      id: true, serial: true, productName: true, endDate: true, customerId: true,
      customer: { select: { name: true, ownerId: true } },
    },
  });
  const ra: ViecMoi[] = [];
  for (const b of ds) {
    const hetHan = dateVeNgay(b.endDate);
    const con = soNgayGiua(homNay, hetHan);
    // Lập sẵn dòng gia hạn để người bán chốt. Một bảo hành + một ngày hết hạn = một dòng.
    await tx.renewal.upsert({
      where: { tenantId_warrantyId_dueDate: { tenantId, warrantyId: b.id, dueDate: b.endDate } },
      update: {},
      create: {
        tenantId,
        sourceType: "bao-hanh",
        warrantyId: b.id,
        customerId: b.customerId,
        ownerId: b.customer.ownerId,
        title: `Gia hạn bảo hành ${b.productName}${b.serial ? ` (${b.serial})` : ""}`,
        dueDate: b.endDate,
      },
    });
    ra.push({
      nguoiId: b.customer.ownerId,
      maQuyTac: "bao-hanh-sap-het",
      mucDo: "thong-tin",
      tieuDe: `Mời gia hạn: ${b.productName} — ${b.customer.name}`,
      lyDo: `Hết bảo hành sau ${con} ngày (ngày ${ngayGon(hetHan)})${b.serial ? `, máy số ${b.serial}` : ""}.`,
      duongDan: "/dich-vu/gia-han",
      doiTuong: "warranty",
      doiTuongId: b.id,
    });
  }
  return ra;
}

async function quetBaoTriDenKy(tx: ClientTenant, tenantId: string, homNay: string): Promise<ViecMoi[]> {
  const ds = await tx.maintenanceContract.findMany({
    where: { status: "hieu-luc" },
    select: {
      id: true, code: true, name: true, ownerId: true, customerId: true,
      startDate: true, endDate: true, cycleMonths: true, lastServiceDate: true,
      customer: { select: { name: true } },
    },
  });
  const ra: ViecMoi[] = [];
  for (const h of ds) {
    const ky = kyBaoTriKeTiep(
      dateVeNgay(h.startDate),
      dateVeNgay(h.endDate),
      h.cycleMonths,
      h.lastServiceDate ? dateVeNgay(h.lastServiceDate) : null,
    );
    if (!ky || soNgayGiua(homNay, ky) > 0) continue;
    const tre = soNgayGiua(ky, homNay);
    ra.push({
      nguoiId: h.ownerId,
      maQuyTac: "bao-tri-den-ky",
      mucDo: "canh-bao",
      tieuDe: `Bảo trì kỳ tới hạn: ${h.name} — ${h.customer.name}`,
      lyDo: tre > 0 ? `Kỳ bảo trì ${ngayGon(ky)} đã trễ ${tre} ngày.` : `Hôm nay tới kỳ bảo trì theo hợp đồng ${h.code}.`,
      duongDan: `/dich-vu/bao-tri/${h.id}`,
      doiTuong: "maintenance_contract",
      doiTuongId: h.id,
    });
  }
  return ra;
}

async function quetKhachLauChuaMuaLai(tx: ClientTenant, homNay: string, soThang: number): Promise<ViecMoi[]> {
  const moc = ngayVeDate(congThang(homNay, -soThang));
  const ds = await tx.customer.findMany({
    where: {
      status: "hoat-dong",
      salesOrders: { some: { status: { not: "CANCELLED" } }, none: { status: { not: "CANCELLED" }, orderDate: { gte: moc } } },
    },
    select: {
      id: true, code: true, name: true, ownerId: true,
      salesOrders: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { orderDate: "desc" },
        take: 1,
        select: { orderDate: true },
      },
    },
  });
  return ds.map((k) => {
    const lanCuoi = k.salesOrders[0] ? dateVeNgay(k.salesOrders[0].orderDate) : homNay;
    return {
      nguoiId: k.ownerId,
      maQuyTac: "khach-lau-chua-mua-lai",
      mucDo: "thong-tin",
      tieuDe: `Chăm sóc lại: ${k.name}`,
      lyDo: `Đơn gần nhất ngày ${ngayGon(lanCuoi)}, đã ${soNgayGiua(lanCuoi, homNay)} ngày chưa mua lại.`,
      duongDan: `/crm/khach-hang/${k.id}`,
      doiTuong: "customer",
      doiTuongId: k.id,
    };
  });
}

async function chayMotQuyTac(
  tx: ClientTenant,
  tenantId: string,
  q: DinhNghiaQuyTac,
  homNay: string,
  nguong: number | null,
): Promise<ViecMoi[]> {
  switch (q.ma) {
    case "bao-gia-cho-phan-hoi":
      return quetBaoGiaChoPhanHoi(tx, homNay, nguong!);
    case "co-hoi-khong-hoat-dong":
      return quetCoHoiKhongHoatDong(tx, homNay, nguong!);
    case "viec-qua-han":
      return quetViecQuaHan(tx, homNay);
    case "cong-no-qua-han":
      return quetCongNoQuaHan(tx, homNay, nguong!);
    case "phieu-ho-tro-tre-han":
      return quetPhieuTreHan(tx);
    case "bao-hanh-sap-het":
      return quetBaoHanhSapHet(tx, tenantId, homNay, nguong!);
    case "bao-tri-den-ky":
      return quetBaoTriDenKy(tx, tenantId, homNay);
    case "khach-lau-chua-mua-lai":
      return quetKhachLauChuaMuaLai(tx, homNay, nguong!);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Bản quét
// ---------------------------------------------------------------------------

export interface TuyChonQuet {
  ngay?: string;
  trigger?: "lich" | "tay";
  nguoiChayId?: string | null;
}

/**
 * Chạy bản quét cho MỘT doanh nghiệp. Gọi được từ worker nền (không có người dùng) và
 * từ nút "Chạy quét ngay" trên màn hình Tự động hóa.
 *
 * Một lần chạy = một dòng `job_runs`. Lần chạy theo lịch trùng ngày bị CSDL chặn bằng
 * chỉ mục riêng phần, nên worker khởi động lại giữa chừng cũng không quét hai lần.
 */
export async function chayQuet(tx: ClientTenant, tenantId: string, tc: TuyChonQuet = {}): Promise<KetQuaQuet> {
  const homNay = tc.ngay ?? homNayVN();
  const trigger = tc.trigger ?? "lich";
  const run = await tx.jobRun.create({
    data: {
      tenantId,
      jobCode: MA_TAC_VU_QUET,
      forDate: ngayVeDate(homNay),
      trigger,
      status: "dang-chay",
      startedBy: tc.nguoiChayId ?? null,
    },
    select: { id: true },
  });

  const trangThai = await trangThaiQuyTac(tx);
  const ketQua: KetQuaQuyTac[] = [];
  const theoNguoi = new Map<string, { mucDo: string; trangThai: string }[]>();
  let soViec = 0;

  try {
    for (const q of QUY_TAC) {
      const t = trangThai.find((x) => x.ma === q.ma)!;
      if (!t.chay) {
        ketQua.push({ ma: q.ma, chay: false, lyDoBoQua: t.lyDoBoQua, soViec: 0 });
        continue;
      }
      const viec = await chayMotQuyTac(tx, tenantId, q, homNay, t.nguong);
      let dem = 0;
      for (const v of viec) {
        if (!v.nguoiId) continue;
        const da = await tx.dailyActionItem.findFirst({
          where: {
            userId: v.nguoiId,
            forDate: ngayVeDate(homNay),
            ruleCode: v.maQuyTac,
            objectType: v.doiTuong,
            objectId: v.doiTuongId,
          },
          select: { id: true },
        });
        if (da) continue;
        await tx.dailyActionItem.create({
          data: {
            tenantId,
            userId: v.nguoiId,
            forDate: ngayVeDate(homNay),
            ruleCode: v.maQuyTac,
            severity: v.mucDo,
            title: v.tieuDe,
            reason: v.lyDo,
            link: v.duongDan,
            objectType: v.doiTuong,
            objectId: v.doiTuongId,
          },
        });
        dem += 1;
        const cua = theoNguoi.get(v.nguoiId) ?? [];
        cua.push({ mucDo: v.mucDo, trangThai: "mo" });
        theoNguoi.set(v.nguoiId, cua);
      }
      soViec += dem;
      ketQua.push({ ma: q.ma, chay: true, lyDoBoQua: "", soViec: dem });
      await tx.automationRule.upsert({
        where: { tenantId_code: { tenantId, code: q.ma } },
        update: { lastRunAt: new Date() },
        create: { tenantId, code: q.ma, enabled: true, lastRunAt: new Date() },
      });
    }

    // Một thông báo tóm tắt cho mỗi người CÓ việc. Không có việc thì không rung chuông.
    let soThongBao = 0;
    for (const [nguoiId, ds] of theoNguoi) {
      const cau = cauTomTatHangNgay(tomTatViec(ds));
      if (!cau) continue;
      const tao = await taoThongBao(tx, tenantId, {
        nguoiNhanId: nguoiId,
        loai: "viec-hom-nay",
        mucDo: ds.some((v) => v.mucDo === "khan") ? "khan" : "canh-bao",
        tieuDe: cau,
        noiDung: "Mở màn hình Việc hôm nay để xem chi tiết và đánh dấu đã xử lý.",
        duongDan: "/viec-hom-nay",
        khoaChongTrung: `viec-hom-nay:${homNay}`,
      });
      if (tao) soThongBao += 1;
    }

    const chay = ketQua.filter((k) => k.chay).length;
    await tx.jobRun.update({
      where: { id: run.id },
      data: {
        status: "xong",
        finishedAt: new Date(),
        rulesRun: chay,
        rulesSkipped: ketQua.length - chay,
        itemsCreated: soViec,
        notifsCreated: soThongBao,
        detail: { quyTac: ketQua } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      jobRunId: run.id,
      ngay: homNay,
      soQuyTacChay: chay,
      soQuyTacBoQua: ketQua.length - chay,
      soViec,
      soThongBao,
      quyTac: ketQua,
    };
  } catch (loi) {
    await tx.jobRun.update({
      where: { id: run.id },
      data: {
        status: "hong",
        finishedAt: new Date(),
        error: loi instanceof Error ? loi.message : String(loi),
        detail: { quyTac: ketQua } as unknown as Prisma.InputJsonValue,
      },
    });
    throw loi;
  }
}

// ---------------------------------------------------------------------------
// Việc hôm nay — mỗi người chỉ thấy việc của chính mình
// ---------------------------------------------------------------------------

export async function viecHomNay(nc: NguCanh, ngay?: string) {
  const homNay = ngay || homNayVN();
  const ds = await nc.tx.dailyActionItem.findMany({
    where: { userId: nc.hoSo.userId, forDate: ngayVeDate(homNay) },
    select: {
      id: true, ruleCode: true, severity: true, title: true, reason: true, link: true,
      objectType: true, objectId: true, status: true, resolvedAt: true, skipReason: true,
    },
  });
  const dong = ds.map((v) => ({
    id: v.id,
    maQuyTac: v.ruleCode,
    nhanQuyTac: timQuyTac(v.ruleCode)?.nhan ?? v.ruleCode,
    mucDo: v.severity,
    tieuDe: v.title,
    lyDo: v.reason,
    duongDan: v.link,
    doiTuong: v.objectType,
    doiTuongId: v.objectId,
    trangThai: v.status,
    xongLuc: v.resolvedAt,
    lyDoBoQua: v.skipReason,
  }));
  const lanQuet = await nc.tx.jobRun.findFirst({
    where: { jobCode: MA_TAC_VU_QUET, forDate: ngayVeDate(homNay), status: "xong" },
    orderBy: { startedAt: "desc" },
    select: { finishedAt: true, rulesRun: true, rulesSkipped: true },
  });
  return {
    ngay: homNay,
    tomTat: tomTatViec(dong),
    daQuet: lanQuet !== null,
    quetLuc: lanQuet?.finishedAt ?? null,
    soQuyTacChay: lanQuet?.rulesRun ?? 0,
    soQuyTacBoQua: lanQuet?.rulesSkipped ?? 0,
    dong: sapXepViec(dong),
  };
}

async function docViec(nc: NguCanh, id: string) {
  const v = await nc.tx.dailyActionItem.findFirst({
    where: { id, userId: nc.hoSo.userId },
    select: { id: true, status: true, ruleCode: true, title: true },
  });
  if (!v) throw new LoiKhongTimThay("Việc hôm nay");
  return v;
}

export async function danhDauXongViec(nc: NguCanh, id: string) {
  const v = await docViec(nc, id);
  if (v.status !== "mo") throw new LoiNghiepVu("Việc này đã đóng rồi.", 409, "da-dong");
  await nc.tx.dailyActionItem.update({
    where: { id },
    data: { status: "xong", resolvedAt: new Date(), resolvedBy: nc.hoSo.userId },
  });
  return { id, trangThai: "xong" };
}

export async function boQuaViec(nc: NguCanh, id: string, lyDo: string) {
  const v = await docViec(nc, id);
  if (v.status !== "mo") throw new LoiNghiepVu("Việc này đã đóng rồi.", 409, "da-dong");
  await nc.tx.dailyActionItem.update({
    where: { id },
    data: { status: "bo-qua", resolvedAt: new Date(), resolvedBy: nc.hoSo.userId, skipReason: lyDo },
  });
  return { id, trangThai: "bo-qua" };
}

// ---------------------------------------------------------------------------
// Màn hình Tự động hóa (Quản trị)
// ---------------------------------------------------------------------------

export async function xemTuDongHoa(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "setting.view");
  const quyTac = await trangThaiQuyTac(nc.tx);
  const lanChay = await nc.tx.jobRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 15,
    select: {
      id: true, jobCode: true, forDate: true, trigger: true, status: true,
      startedAt: true, finishedAt: true, rulesRun: true, rulesSkipped: true,
      itemsCreated: true, notifsCreated: true, error: true,
    },
  });
  return {
    quyTac,
    duocSua: coQuyen(nc.hoSo, "setting.update"),
    lanChay: lanChay.map((l) => ({
      id: l.id,
      maTacVu: l.jobCode,
      ngay: dateVeNgay(l.forDate),
      nguonChay: l.trigger,
      trangThai: l.status,
      batDau: l.startedAt,
      ketThuc: l.finishedAt,
      soQuyTacChay: l.rulesRun,
      soQuyTacBoQua: l.rulesSkipped,
      soViec: l.itemsCreated,
      soThongBao: l.notifsCreated,
      loi: l.error,
    })),
  };
}

export async function batTatQuyTac(nc: NguCanh, ma: string, bat: boolean) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "automation_rule", objectId: ma });
  const q = timQuyTac(ma);
  if (!q) throw new LoiKhongTimThay("Quy tắc");
  await nc.tx.automationRule.upsert({
    where: { tenantId_code: { tenantId: nc.tenantId, code: ma } },
    update: { enabled: bat, updatedBy: nc.hoSo.userId },
    create: { tenantId: nc.tenantId, code: ma, enabled: bat, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "automation_rule",
    objectId: null,
    after: { quyTac: ma, bat },
  });
  await nc.suKien({ eventType: SU_KIEN.SETTING_CHANGED, objectType: "automation_rule", payload: { quyTac: ma, bat } });
  return { ma, bat };
}

/** Nút "Chạy quét ngay" — cần quyền sửa cấu hình, và luôn ghi lại là chạy tay. */
export async function chayQuetTay(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "job_run" });
  const kq = await chayQuet(nc.tx, nc.tenantId, { trigger: "tay", nguoiChayId: nc.hoSo.userId });
  await nc.kiemToan({
    action: "tao",
    objectType: "job_run",
    objectId: kq.jobRunId,
    after: { ngay: kq.ngay, soViec: kq.soViec, soThongBao: kq.soThongBao },
  });
  return kq;
}
