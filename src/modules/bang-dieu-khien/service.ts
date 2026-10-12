import type { NguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { dateVeNgay, homNayVN, locTheoPhamVi, ngayVeDate } from "@/modules/crm/chung";
import { dieuKienXemCoHoi } from "@/modules/co-hoi/service";
import { dieuKienXemBaoGia } from "@/modules/bao-gia/service";
import { dieuKienXemDon } from "@/modules/don-hang/service";
import { dieuKienXemPhieu } from "@/modules/ho-tro/service";
import { dieuKienXemDuAn } from "@/modules/du-an/service";
import { dieuKienXemHoaDon } from "@/modules/tai-chinh/service";
import { congNo, soNgayQuaHan, tongHopTuoiNo, bienLoiNhuanKy, dong } from "@/modules/tai-chinh/tinh-toan";
import { conBanDuoc, mucTon } from "@/modules/kho/tinh-toan";
import { XAC_SUAT_GOI_Y } from "@/modules/crm/hang-so";
import { khoiMarketingBangDieuKhien } from "@/modules/marketing/service";

/**
 * Bảng điều hành — mục 20 prompt 20/09. **Chỉ số liệu thật**, không con số minh họa.
 *
 * Mỗi khối chỉ hiện khi người đang xem có quyền tương ứng, và chỉ đếm trong **phạm vi dữ
 * liệu** của họ: Giám đốc thấy toàn công ty, trưởng phòng thấy nhóm, nhân viên thấy phần
 * mình. Không có quyền thì khối đó trả `null` — màn hình không vẽ ô trống.
 *
 * Các con số đọc thẳng từ bảng gốc. Khi dữ liệu lớn lên (vài chục nghìn đơn) thì mới dựng
 * bảng tổng hợp theo ngày và làm mới bằng worker (DATABASE.md phần B, Phase 7) — làm sớm
 * chỉ tạo thêm một nơi có thể lệch số.
 */

function dauThangVN(homNay: string): string {
  return `${homNay.slice(0, 7)}-01`;
}

export interface KhoiBanHang {
  doanhThuThangNay: number;
  giaVonThangNay: number;
  loiNhuanGop: number;
  bienLoiNhuan: number | null;
  soHoaDonThangNay: number;
  doanhThuThangTruoc: number;
  tangTruong: number | null;
}

export async function bangDieuKhien(nc: NguCanh) {
  const homNay = homNayVN();
  const dauThang = dauThangVN(homNay);
  const dauThangTruoc = (() => {
    const [nam, thang] = dauThang.split("-").map(Number);
    return thang === 1 ? `${nam - 1}-12-01` : `${nam}-${String(thang - 1).padStart(2, "0")}-01`;
  })();

  // --- Bán hàng: doanh thu ghi nhận theo HÓA ĐƠN ĐÃ PHÁT HÀNH (không phải đơn hàng) ---
  let banHang: KhoiBanHang | null = null;
  let congNoKhoi: { tongConNo: number; tongQuaHan: number; soHoaDonQuaHan: number; theoNhom: Record<string, number>; nguongCanhBao: number | null } | null = null;
  if (coQuyen(nc.hoSo, "finance.view")) {
    const dieuKien = await dieuKienXemHoaDon(nc);
    const [thangNay, thangTruoc, conNoDs, nguongCanhBao] = await Promise.all([
      nc.tx.invoice.findMany({
        where: { AND: [dieuKien, { status: "ISSUED", issueDate: { gte: ngayVeDate(dauThang) } }] },
        select: { total: true, costTotal: true },
      }),
      nc.tx.invoice.findMany({
        where: { AND: [dieuKien, { status: "ISSUED", issueDate: { gte: ngayVeDate(dauThangTruoc), lt: ngayVeDate(dauThang) } }] },
        select: { total: true },
      }),
      nc.tx.invoice.findMany({
        where: { AND: [dieuKien, { status: "ISSUED" }] },
        select: { total: true, dueDate: true, status: true, allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, salesReturn: { select: { status: true } } } } },
      }),
      docCauHinh(nc.tx, "tai_chinh.canh_bao_qua_han_ngay"),
    ]);

    const doanhThu = dong(thangNay.reduce((s, h) => s + Number(h.total), 0));
    const giaVon = dong(thangNay.reduce((s, h) => s + Number(h.costTotal), 0));
    const truoc = dong(thangTruoc.reduce((s, h) => s + Number(h.total), 0));
    banHang = {
      doanhThuThangNay: doanhThu,
      giaVonThangNay: giaVon,
      loiNhuanGop: doanhThu - giaVon,
      bienLoiNhuan: bienLoiNhuanKy(doanhThu, giaVon),
      soHoaDonThangNay: thangNay.length,
      doanhThuThangTruoc: truoc,
      tangTruong: truoc > 0 ? Math.round(((doanhThu - truoc) / truoc) * 1000) / 10 : null,
    };

    const chiTiet = conNoDs.map((hd) => {
      const daThu = hd.allocations.filter((a) => a.payment.status === "hoat-dong").reduce((s, a) => s + Number(a.amount), 0);
      const daGiamTru = hd.returnAllocations.filter((a) => a.salesReturn.status === "SETTLED").reduce((s, a) => s + Number(a.amount), 0);
      const cn = congNo(hd.status, hd.total.toString(), daThu, { daGiamTru });
      return { conNo: cn.conNo, soNgayQuaHan: soNgayQuaHan(dateVeNgay(hd.dueDate) || null, homNay) };
    });
    congNoKhoi = { ...tongHopTuoiNo(chiTiet), nguongCanhBao };
  }

  // --- Pipeline: cơ hội đang mở, có trọng số theo xác suất ---
  let pipeline: { soCoHoi: number; tongGiaTri: number; coTrongSo: number; quaHanHanhDong: number } | null = null;
  if (coQuyen(nc.hoSo, "sales.view")) {
    const ds = await nc.tx.opportunity.findMany({
      where: { AND: [await dieuKienXemCoHoi(nc), { stage: { notIn: ["WON", "LOST"] } }] },
      select: { estimatedValue: true, probability: true, stage: true, nextActionDate: true },
    });
    pipeline = {
      soCoHoi: ds.length,
      tongGiaTri: dong(ds.reduce((s, c) => s + Number(c.estimatedValue ?? 0), 0)),
      coTrongSo: dong(
        ds.reduce((s, c) => {
          const xs = c.probability ?? XAC_SUAT_GOI_Y[c.stage as keyof typeof XAC_SUAT_GOI_Y] ?? 0;
          return s + (Number(c.estimatedValue ?? 0) * xs) / 100;
        }, 0),
      ),
      quaHanHanhDong: ds.filter((c) => c.nextActionDate && dateVeNgay(c.nextActionDate) < homNay).length,
    };
  }

  // --- Báo giá chờ duyệt / đang chờ khách trả lời ---
  let baoGia: { choDuyet: number; dangChoKhach: number; giaTriDangChay: number } | null = null;
  if (coQuyen(nc.hoSo, "quotation.view")) {
    const dieuKien = await dieuKienXemBaoGia(nc);
    const ds = await nc.tx.quotation.findMany({
      where: { AND: [dieuKien, { status: { in: ["PENDING_APPROVAL", "SENT", "VIEWED", "NEGOTIATING"] } }] },
      select: { status: true, currentVersion: { select: { total: true } } },
    });
    baoGia = {
      choDuyet: ds.filter((q) => q.status === "PENDING_APPROVAL").length,
      dangChoKhach: ds.filter((q) => q.status !== "PENDING_APPROVAL").length,
      giaTriDangChay: dong(ds.reduce((s, q) => s + Number(q.currentVersion?.total ?? 0), 0)),
    };
  }

  // --- Đơn hàng chờ giao ---
  let donHang: { choGiao: number; giaTriChoGiao: number; daGiaoThangNay: number } | null = null;
  if (coQuyen(nc.hoSo, "order.view")) {
    const dieuKien = await dieuKienXemDon(nc);
    const [choGiao, daGiao] = await Promise.all([
      nc.tx.salesOrder.findMany({ where: { AND: [dieuKien, { status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] } }] }, select: { total: true } }),
      nc.tx.salesOrder.count({ where: { AND: [dieuKien, { status: "DELIVERED", completedAt: { gte: new Date(`${dauThang}T00:00:00+07:00`) } }] } }),
    ]);
    donHang = { choGiao: choGiao.length, giaTriChoGiao: dong(choGiao.reduce((s, d) => s + Number(d.total), 0)), daGiaoThangNay: daGiao };
  }

  // --- Kho: hàng hết và sắp hết ---
  let kho: { hetHang: number; sapHet: number; tongMatHang: number } | null = null;
  if (coQuyen(nc.hoSo, "inventory.view")) {
    const ds = await nc.tx.inventoryBalance.findMany({
      select: { onHand: true, reserved: true, product: { select: { minStock: true } } },
    });
    let hetHang = 0;
    let sapHet = 0;
    for (const b of ds) {
      const con = conBanDuoc({ onHand: Number(b.onHand), reserved: Number(b.reserved) });
      const muc = mucTon(con, b.product.minStock === null ? null : Number(b.product.minStock));
      if (muc === "het") hetHang += 1;
      else if (muc === "sap-het") sapHet += 1;
    }
    kho = { hetHang, sapHet, tongMatHang: ds.length };
  }

  // --- Bàn dịch vụ: phiếu đang mở và trễ hạn ---
  let dichVu: { dangMo: number; treHan: number; baoHanhSapHet: number | null } | null = null;
  if (coQuyen(nc.hoSo, "service_desk.view")) {
    const bayGio = new Date();
    const dieuKien = await dieuKienXemPhieu(nc);
    const [phieu, nguongBaoHanh] = await Promise.all([
      nc.tx.supportTicket.findMany({
        where: { AND: [dieuKien, { status: { in: ["MOI", "DANG_XU_LY", "CHO_KHACH"] } }] },
        select: { responseDueAt: true, resolveDueAt: true, firstResponseAt: true, resolvedAt: true },
      }),
      docCauHinh(nc.tx, "theo_doi.bao_hanh_sap_het_ngay"),
    ]);
    const baoHanhSapHet =
      nguongBaoHanh === null
        ? null
        : await nc.tx.warranty.count({
            where: {
              status: "hieu-luc",
              endDate: { gte: ngayVeDate(homNay), lte: ngayVeDate(new Date(Date.now() + nguongBaoHanh * 86_400_000).toISOString().slice(0, 10)) },
            },
          });
    dichVu = {
      dangMo: phieu.length,
      treHan: phieu.filter(
        (p) => (p.responseDueAt && !p.firstResponseAt && p.responseDueAt < bayGio) || (p.resolveDueAt && !p.resolvedAt && p.resolveDueAt < bayGio),
      ).length,
      baoHanhSapHet,
    };
  }

  // --- Dự án đang chạy / quá hạn ---
  let duAn: { dangChay: number; quaHan: number } | null = null;
  if (coQuyen(nc.hoSo, "project.view")) {
    const ds = await nc.tx.project.findMany({
      where: { AND: [await dieuKienXemDuAn(nc), { status: { in: ["PLANNING", "IN_PROGRESS", "ON_HOLD"] } }] },
      select: { dueDate: true },
    });
    duAn = { dangChay: ds.length, quaHan: ds.filter((d) => d.dueDate && dateVeNgay(d.dueDate) < homNay).length };
  }

  // --- Việc của tôi (ai cũng có) ---
  const pvViec = await locTheoPhamVi(nc, "task.view");
  const [viecCuaToi, viecQuaHan] = await Promise.all([
    nc.tx.task.count({ where: { ownerId: nc.hoSo.userId, status: { in: ["mo", "dang-lam"] } } }),
    nc.tx.task.count({ where: { ...(coQuyen(nc.hoSo, "task.view") ? pvViec : { ownerId: nc.hoSo.userId }), status: { in: ["mo", "dang-lam"] }, dueAt: { lt: new Date() } } }),
  ]);

  return {
    ngay: homNay,
    banHang,
    congNo: congNoKhoi,
    pipeline,
    baoGia,
    donHang,
    kho,
    dichVu,
    duAn,
    // 0.16.0 — khối Marketing; không có `marketing.view` thì null.
    marketing: await khoiMarketingBangDieuKhien(nc),
    viec: { cuaToi: viecCuaToi, quaHan: viecQuaHan },
  };
}

export type DuLieuBangDieuKhien = Awaited<ReturnType<typeof bangDieuKhien>>;
