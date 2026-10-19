import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { batBuocThayKho, ghiSoKho } from "@/modules/kho/service";
import {
  chuyenKhoSuaDuoc,
  huyDuoc,
  kiemDongNhan,
  nhanDuoc,
  tongKetChuyen,
  xuatDuoc,
} from "./tinh-toan";
import type {
  BoLocChuyenKho,
  DuLieuNhanChuyenKho,
  DuLieuTaoChuyenKho,
  DuLieuXuatChuyenKho,
} from "./luoc-do";

/**
 * Chuyển kho nội bộ. Luật: BUSINESS_RULES.md mục 19 (CK).
 *
 * Hai bước vì hàng đi xe giữa hai kho: **xuất** khỏi kho nguồn, rồi **nhận** vào kho
 * đích. Giữa hai bước hàng không nằm ở kho nào — tồn tổng giảm đúng bằng số đang
 * trên đường, và màn hình nói thẳng như vậy. Gộp một bước thì tồn nhảy tức thì từ
 * kho này sang kho kia, và khi hàng thiếu lúc tới nơi thì không còn chỗ nào để ghi.
 *
 * Hàng đi qua **đúng** `ghiSoKho()` mà bán hàng, mua hàng và trả hàng dùng.
 */

const CHON_DONG = {
  id: true, lineNo: true, productId: true, sku: true, name: true,
  quantity: true, receivedQty: true, unit: true, note: true,
  product: { select: { id: true, sku: true, name: true, requiresSerial: true, quanLyTon: true, costPrice: true } },
  serials: { select: { id: true, serial: true, status: true } },
} satisfies Prisma.StockTransferItemSelect;

const CHON = {
  id: true, number: true, status: true, transferDate: true, reason: true, notes: true,
  shippedAt: true, receivedAt: true, cancelledAt: true, cancelReason: true,
  ownerId: true, createdAt: true, updatedAt: true,
  fromWarehouse: { select: { id: true, code: true, name: true, status: true } },
  toWarehouse: { select: { id: true, code: true, name: true, status: true } },
  owner: { select: { id: true, fullName: true } },
  items: { select: CHON_DONG, orderBy: { lineNo: "asc" } },
} satisfies Prisma.StockTransferSelect;

type BanGhi = Prisma.StockTransferGetPayload<{ select: typeof CHON }>;

function phieuRa(p: BanGhi) {
  const tongKet = tongKetChuyen(
    p.items.map((d) => ({ soLuong: d.quantity.toString(), daNhan: d.receivedQty.toString() })),
  );
  return {
    id: p.id,
    so: p.number,
    trangThai: p.status,
    ngayChuyen: p.transferDate,
    lyDo: p.reason,
    ghiChu: p.notes,
    xuatLuc: p.shippedAt,
    nhanLuc: p.receivedAt,
    huyLuc: p.cancelledAt,
    lyDoHuy: p.cancelReason,
    khoNguon: { id: p.fromWarehouse.id, ma: p.fromWarehouse.code, ten: p.fromWarehouse.name },
    khoDich: { id: p.toWarehouse.id, ma: p.toWarehouse.code, ten: p.toWarehouse.name },
    nguoiPhuTrach: { id: p.owner.id, hoTen: p.owner.fullName },
    tongKet,
    dong: p.items.map((d) => ({
      id: d.id,
      thuTu: d.lineNo,
      sanPhamId: d.productId,
      sku: d.sku,
      ten: d.name,
      soLuong: d.quantity.toString(),
      daNhan: d.receivedQty.toString(),
      thieu: Math.max(0, Number(d.quantity) - Number(d.receivedQty)),
      donViTinh: d.unit,
      theoSerial: d.product?.requiresSerial ?? false,
      quanLyTon: d.product?.quanLyTon ?? false,
      serial: d.serials.map((s) => ({ id: s.id, serial: s.serial, trangThai: s.status })),
      ghiChu: d.note,
    })),
    taoLuc: p.createdAt,
    suaLuc: p.updatedAt,
  };
}
export type ChuyenKhoChiTiet = ReturnType<typeof phieuRa>;

async function docPhieu(nc: NguCanh, id: string): Promise<BanGhi> {
  const p = await nc.tx.stockTransfer.findFirst({ where: { id }, select: CHON });
  if (!p) throw new LoiKhongTimThay("Phiếu chuyển kho");
  return p;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachChuyenKho(nc: NguCanh, boLoc: BoLocChuyenKho) {
  batBuocQuyen(nc.hoSo, "inventory.view");
  const dieuKien: Prisma.StockTransferWhereInput[] = [];
  if (boLoc.trangThai === "tat-ca") {
    // không lọc
  } else if (boLoc.trangThai === "") {
    dieuKien.push({ status: { in: ["DRAFT", "IN_TRANSIT"] } });
  } else {
    dieuKien.push({ status: boLoc.trangThai });
  }
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { reason: { contains: boLoc.q, mode: "insensitive" } },
        { items: { some: { name: { contains: boLoc.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (boLoc.kho) {
    dieuKien.push({ OR: [{ fromWarehouseId: boLoc.kho }, { toWarehouseId: boLoc.kho }] });
  }

  const where: Prisma.StockTransferWhereInput = { AND: dieuKien };
  const [tong, ds, dangDi] = await Promise.all([
    nc.tx.stockTransfer.count({ where }),
    nc.tx.stockTransfer.findMany({
      where,
      select: CHON,
      orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
    nc.tx.stockTransfer.findMany({
      where: { status: "IN_TRANSIT" },
      select: { items: { select: { quantity: true, receivedQty: true } } },
    }),
  ]);

  const tongDangDi = dangDi.reduce(
    (s, p) => s + tongKetChuyen(p.items.map((d) => ({ soLuong: d.quantity.toString(), daNhan: d.receivedQty.toString() }))).tongXuat,
    0,
  );

  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map(phieuRa),
    tomTat: {
      soPhieuDangDi: dangDi.length,
      // Số hàng đã rời kho nguồn mà chưa tới kho đích. Không nằm ở kho nào — cố ý.
      soLuongDangDi: Math.round(tongDangDi * 1000) / 1000,
    },
  };
}

export async function chiTietChuyenKho(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "inventory.view", { objectType: "stock_transfer", objectId: id });
  const p = phieuRa(await docPhieu(nc, id));
  const duocGhi = coQuyen(nc.hoSo, "inventory.update");
  return {
    phieu: p,
    quyen: {
      sua: coQuyen(nc.hoSo, "inventory.create") && chuyenKhoSuaDuoc(p.trangThai),
      xuat: duocGhi && xuatDuoc(p.trangThai),
      nhan: duocGhi && nhanDuoc(p.trangThai),
      huy: coQuyen(nc.hoSo, "inventory.create") && huyDuoc(p.trangThai),
    },
  };
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

export async function taoChuyenKho(nc: NguCanh, d: DuLieuTaoChuyenKho) {
  batBuocQuyen(nc.hoSo, "inventory.create", { objectType: "stock_transfer" });
  if (d.khoNguonId === d.khoDichId) {
    throw new LoiDinhDang("khoDichId", "Kho nhận phải khác kho xuất.");
  }
  const nguon = await batBuocThayKho(nc, d.khoNguonId);
  const dich = await batBuocThayKho(nc, d.khoDichId);
  for (const k of [nguon, dich]) {
    if (k.trangThai !== "hoat-dong") throw new LoiNghiepVu(`Kho ${k.ten} đã ngừng hoạt động.`, 409, "kho-ngung");
  }

  const sanPham = await nc.tx.product.findMany({
    where: { id: { in: d.dong.map((x) => x.sanPhamId) } },
    select: { id: true, sku: true, name: true, unit: true, status: true },
  });
  const theoId = new Map(sanPham.map((s) => [s.id, s]));
  for (const x of d.dong) {
    const sp = theoId.get(x.sanPhamId);
    if (!sp) throw new LoiKhongTimThay("Sản phẩm");
    if (sp.status !== "hoat-dong") {
      throw new LoiNghiepVu(`Sản phẩm ${sp.name} đang ngừng kinh doanh, không chuyển kho được.`, 409, "san-pham-ngung");
    }
  }

  const so = await capSoChungTu(nc.tx, KIEU_SO.chuyenKho);
  const p = await nc.tx.stockTransfer.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      fromWarehouseId: nguon.id,
      toWarehouseId: dich.id,
      ownerId: nc.hoSo.userId,
      transferDate: ngayVeDate(d.ngayChuyen || homNayVN()),
      reason: d.lyDo,
      notes: d.ghiChu || null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
      items: {
        create: d.dong.map((x, i) => {
          const sp = theoId.get(x.sanPhamId)!;
          return {
            tenantId: nc.tenantId,
            lineNo: i + 1,
            productId: sp.id,
            sku: sp.sku,
            name: sp.name,
            quantity: x.soLuong,
            unit: sp.unit,
            note: [x.ghiChu, x.serial.length > 0 ? `${DAU_SERIAL} ${x.serial.join(", ")}` : ""].filter(Boolean).join(" · ") || null,
          };
        }),
      },
    },
    select: { id: true, number: true },
  });

  await nc.kiemToan({
    action: "tao",
    objectType: "stock_transfer",
    objectId: p.id,
    after: { so, tuKho: nguon.ma, denKho: dich.ma, soDong: d.dong.length },
  });
  await nc.suKien({
    eventType: SU_KIEN.STOCK_TRANSFER_CREATED,
    objectType: "stock_transfer",
    objectId: p.id,
    payload: { so, khoNguonId: nguon.id, khoDichId: dich.id },
  });
  return { id: p.id, so };
}

const DAU_SERIAL = "[serial]";

/** Đọc lại danh sách sê-ri đã khai trong ghi chú dòng. */
export function docSerialTuGhiChu(ghiChu: string | null): string[] {
  if (!ghiChu) return [];
  const i = ghiChu.indexOf(DAU_SERIAL);
  if (i < 0) return [];
  return ghiChu
    .slice(i + DAU_SERIAL.length)
    .split(" · ")[0]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Xuất: hàng thật sự rời kho nguồn. Từ đây phiếu khóa lại (CK-03). */
export async function xuatChuyenKho(nc: NguCanh, id: string, d: DuLieuXuatChuyenKho) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "stock_transfer", objectId: id });
  // TV-BH-01: khóa phiếu rồi mới đọc trạng thái — bấm hai lần không xuất kho hai lần.
  await khoaChungTu(nc.tx, "stock_transfers", id);
  const p = await docPhieu(nc, id);
  if (!xuatDuoc(p.status)) throw new LoiNghiepVu("Chỉ xuất được phiếu còn nháp.", 409, "sai-trang-thai");
  if (p.fromWarehouse.status !== "hoat-dong") throw new LoiNghiepVu("Kho xuất đã ngừng hoạt động.", 409, "kho-ngung");
  if (p.toWarehouse.status !== "hoat-dong") throw new LoiNghiepVu("Kho nhận đã ngừng hoạt động.", 409, "kho-ngung");

  // Kiểm toàn bộ sê-ri TRƯỚC khi đụng tồn kho — lỗi sê-ri phải nói rõ là lỗi sê-ri.
  const keHoach: { dongId: string; sanPhamId: string; soLuong: number; quanLyTon: boolean; giaVon: string | null; serial: string[] }[] = [];
  for (const dong of p.items) {
    const sl = Number(dong.quantity);
    const khai = docSerialTuGhiChu(dong.note);
    if (dong.product?.requiresSerial) {
      if (khai.length !== sl) {
        throw new LoiNghiepVu(
          `${dong.name} quản lý theo số sê-ri: cần đúng ${sl} sê-ri, đang có ${khai.length}.`,
          400, "thieu-serial", { dongId: dong.id, canCo: sl, dangCo: khai.length },
        );
      }
      for (const s of khai) {
        const sn = await nc.tx.serialNumber.findFirst({
          where: { productId: dong.productId, serial: s },
          select: { id: true, status: true, warehouseId: true },
        });
        if (!sn) throw new LoiNghiepVu(`Số sê-ri ${s} không có trong hệ thống.`, 409, "serial-khong-co", { serial: s });
        if (sn.status !== "trong-kho") throw new LoiNghiepVu(`Số sê-ri ${s} không còn trong kho.`, 409, "serial-da-dung", { serial: s });
        if (sn.warehouseId !== p.fromWarehouse.id) {
          throw new LoiNghiepVu(`Số sê-ri ${s} đang nằm ở kho khác, không chuyển từ kho này được.`, 409, "serial-khac-kho", { serial: s });
        }
      }
    }
    keHoach.push({
      dongId: dong.id,
      sanPhamId: dong.productId,
      soLuong: sl,
      quanLyTon: dong.product?.quanLyTon ?? false,
      giaVon: dong.product?.costPrice?.toString() ?? null,
      serial: khai,
    });
  }

  for (const k of keHoach) {
    if (k.quanLyTon) {
      await ghiSoKho(nc, {
        khoId: p.fromWarehouse.id,
        sanPhamId: k.sanPhamId,
        loai: "xuat",
        soLuong: k.soLuong,
        giaVon: k.giaVon,
        loaiChungTu: "chuyen-kho",
        chungTuId: p.id,
        soChungTu: p.number,
        lyDo: `Chuyển sang ${p.toWarehouse.name} theo phiếu ${p.number}`,
        ghiChu: d.ghiChu || null,
      });
    }
    for (const s of k.serial) {
      const sn = await nc.tx.serialNumber.findFirst({ where: { productId: k.sanPhamId, serial: s }, select: { id: true } });
      if (!sn) continue;
      // CK-05: đang trên đường thì không thuộc kho nào. Nói nó còn ở kho nguồn hay
      // đã ở kho đích đều là nói sai.
      const kq = await nc.tx.serialNumber.updateMany({
        where: { id: sn.id, status: "trong-kho", warehouseId: p.fromWarehouse.id },
        data: { status: "dang-chuyen", warehouseId: null, stockTransferItemId: k.dongId },
      });
      if (kq.count !== 1) throw new LoiNghiepVu(`Số sê-ri ${s} vừa được xuất theo chứng từ khác.`, 409, "serial-da-dung", { serial: s });
    }
  }

  await nc.tx.stockTransfer.update({
    where: { id },
    data: {
      status: "IN_TRANSIT",
      shippedAt: new Date(),
      shippedBy: nc.hoSo.userId,
      notes: d.ghiChu ? [p.notes, d.ghiChu].filter(Boolean).join(" · ") : p.notes,
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({ action: "sua", objectType: "stock_transfer", objectId: id, before: { trangThai: p.status }, after: { trangThai: "IN_TRANSIT" } });
  await nc.suKien({
    eventType: SU_KIEN.STOCK_TRANSFER_SHIPPED,
    objectType: "stock_transfer",
    objectId: id,
    payload: { so: p.number, khoNguonId: p.fromWarehouse.id, khoDichId: p.toWarehouse.id },
  });
  return { id, trangThai: "IN_TRANSIT" };
}

/**
 * Nhận: hàng vào kho đích. Bỏ trống `dong` nghĩa là nhận đủ.
 * Nhận thiếu phải ghi lý do — hàng không được biến mất lặng lẽ giữa hai kho (CK-04).
 */
export async function nhanChuyenKho(nc: NguCanh, id: string, d: DuLieuNhanChuyenKho) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "stock_transfer", objectId: id });
  // TV-BH-01: hai người cùng bấm "Nhận hàng" — người sau thấy phiếu đã RECEIVED và bị chặn,
  // không nhập kho đích hai lần.
  await khoaChungTu(nc.tx, "stock_transfers", id);
  const p = await docPhieu(nc, id);
  if (!nhanDuoc(p.status)) throw new LoiNghiepVu("Chỉ nhận được hàng đang trên đường.", 409, "sai-trang-thai");
  if (p.toWarehouse.status !== "hoat-dong") throw new LoiNghiepVu("Kho nhận đã ngừng hoạt động.", 409, "kho-ngung");

  const khai = new Map(d.dong.map((x) => [x.dongId, x]));
  for (const x of d.dong) {
    if (!p.items.some((i) => i.id === x.dongId)) throw new LoiDinhDang("dong", "Dòng hàng không thuộc phiếu này.");
  }

  const keHoach: { dongId: string; sanPhamId: string; nhan: number; xuat: number; quanLyTon: boolean; giaVon: string | null; ghiChu: string | null; serial: string[] }[] = [];
  for (const dong of p.items) {
    const x = khai.get(dong.id);
    const xuat = Number(dong.quantity);
    const nhan = x ? Number(x.soLuongNhan) : xuat;
    const ghiChu = x?.ghiChu ?? null;
    const kiem = kiemDongNhan(xuat, nhan, ghiChu);
    if (!kiem.hopLe) {
      throw new LoiNghiepVu(`${dong.name}: ${kiem.lyDo}`, 409, "nhan-khong-hop-le", { dongId: dong.id, daXuat: xuat, nhan });
    }
    keHoach.push({
      dongId: dong.id,
      sanPhamId: dong.productId,
      nhan,
      xuat,
      quanLyTon: dong.product?.quanLyTon ?? false,
      giaVon: dong.product?.costPrice?.toString() ?? null,
      ghiChu,
      serial: docSerialTuGhiChu(dong.note),
    });
  }

  for (const k of keHoach) {
    if (k.quanLyTon && k.nhan > 0) {
      await ghiSoKho(nc, {
        khoId: p.toWarehouse.id,
        sanPhamId: k.sanPhamId,
        loai: "nhap",
        soLuong: k.nhan,
        giaVon: k.giaVon,
        loaiChungTu: "chuyen-kho",
        chungTuId: p.id,
        soChungTu: p.number,
        lyDo: `Nhận từ ${p.fromWarehouse.name} theo phiếu ${p.number}`,
        ghiChu: d.ghiChu || null,
      });
    }

    // Sê-ri: nhận đủ thì mọi sê-ri về kho đích. Thiếu thì chỉ những sê-ri thật sự
    // tới nơi mới về kho — phần còn lại giữ nguyên "đang chuyển" để còn truy được.
    if (k.serial.length > 0 && k.nhan >= k.xuat) {
      for (const s of k.serial) {
        const sn = await nc.tx.serialNumber.findFirst({ where: { productId: k.sanPhamId, serial: s }, select: { id: true } });
        if (!sn) continue;
        await nc.tx.serialNumber.update({
          where: { id: sn.id },
          data: { status: "trong-kho", warehouseId: p.toWarehouse.id },
        });
      }
    }

    await nc.tx.stockTransferItem.update({
      where: { id: k.dongId },
      data: {
        receivedQty: String(k.nhan),
        ...(k.ghiChu ? { note: [p.items.find((i) => i.id === k.dongId)?.note, k.ghiChu].filter(Boolean).join(" · ") } : {}),
      },
    });
  }

  const tongKet = tongKetChuyen(keHoach.map((k) => ({ soLuong: k.xuat, daNhan: k.nhan })));
  await nc.tx.stockTransfer.update({
    where: { id },
    data: {
      status: "RECEIVED",
      receivedAt: new Date(),
      receivedBy: nc.hoSo.userId,
      notes: d.ghiChu ? [p.notes, d.ghiChu].filter(Boolean).join(" · ") : p.notes,
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({
    action: "sua",
    objectType: "stock_transfer",
    objectId: id,
    before: { trangThai: p.status },
    after: { trangThai: "RECEIVED", tongXuat: tongKet.tongXuat, tongNhan: tongKet.tongNhan, thieu: tongKet.thieu },
  });
  await nc.suKien({
    eventType: SU_KIEN.STOCK_TRANSFER_RECEIVED,
    objectType: "stock_transfer",
    objectId: id,
    payload: { so: p.number, tongXuat: tongKet.tongXuat, tongNhan: tongKet.tongNhan, thieu: tongKet.thieu },
  });
  return { id, trangThai: "RECEIVED", tongKet };
}

/** CK-06: chỉ hủy được phiếu còn nháp. Hàng đã rời kho thì phải chuyển ngược lại. */
export async function huyChuyenKho(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "inventory.create", { objectType: "stock_transfer", objectId: id });
  await khoaChungTu(nc.tx, "stock_transfers", id);
  const p = await docPhieu(nc, id);
  if (!huyDuoc(p.status)) {
    throw new LoiNghiepVu(
      "Hàng đã rời kho rồi — không hủy phiếu được. Nhận về kho đích rồi lập phiếu chuyển ngược, hoặc điều chỉnh tồn kèm lý do.",
      409, "sai-trang-thai",
    );
  }
  await nc.tx.stockTransfer.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: lyDo, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "stock_transfer", objectId: id, before: { trangThai: p.status }, after: { trangThai: "CANCELLED", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.STOCK_TRANSFER_CANCELLED, objectType: "stock_transfer", objectId: id, payload: { so: p.number, lyDo } });
  return { id, trangThai: "CANCELLED" };
}
