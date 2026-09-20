import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { conBanDuoc, mucTon, soDuSau, tacDong, type LoaiGiaoDich } from "./tinh-toan";
import type { BoLocSerial, BoLocTheKho, BoLocTonKho, DuLieuDieuChinh, DuLieuNhapKho } from "./luoc-do";
import type { LuocDoSuaKho, LuocDoTaoKho } from "./luoc-do";
import type { z } from "zod";

/**
 * Phân hệ Kho — mục 16 prompt 20/09. Luật: BUSINESS_RULES.md mục 7.
 *
 * Nguyên tắc: **mọi** thay đổi tồn kho đi qua đúng một hàm `ghiSoKho()`. Hàm này khóa
 * dòng số dư (`SELECT … FOR UPDATE`), tính số dư mới bằng hàm thuần, chặn nếu âm, rồi
 * ghi CÙNG LÚC dòng sổ cái và số dư mới trong một giao dịch. Nhờ vậy số dư luôn cộng
 * đúng bằng tổng sổ cái, kể cả khi hai người thao tác cùng lúc (có bài thử đối soát).
 *
 * Quyền `inventory.*`, không có phạm vi theo người — kho là tài sản dùng chung (như QĐ-18).
 */

// ---------------------------------------------------------------------------
// Kho hàng
// ---------------------------------------------------------------------------

const CHON_KHO = {
  id: true, code: true, name: true, address: true, note: true, isDefault: true, status: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.WarehouseSelect;

function khoRa(k: Prisma.WarehouseGetPayload<{ select: typeof CHON_KHO }>) {
  return {
    id: k.id, ma: k.code, ten: k.name, diaChi: k.address, ghiChu: k.note,
    macDinh: k.isDefault, trangThai: k.status, taoLuc: k.createdAt, suaLuc: k.updatedAt,
  };
}
export type KhoChiTiet = ReturnType<typeof khoRa>;

export async function danhSachKho(nc: NguCanh, chiHoatDong = false) {
  batBuocQuyen(nc.hoSo, "inventory.view");
  const ds = await nc.tx.warehouse.findMany({
    where: chiHoatDong ? { status: "hoat-dong" } : {},
    select: CHON_KHO,
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
  });
  return ds.map(khoRa);
}

export async function batBuocThayKho(nc: NguCanh, id: string) {
  const k = await nc.tx.warehouse.findFirst({ where: { id }, select: CHON_KHO });
  if (!k) throw new LoiKhongTimThay("Kho");
  return khoRa(k);
}

/** Kho mặc định để gợi ý sẵn trên màn hình nhập/xuất. Chưa khai kho nào thì trả null. */
export async function khoMacDinh(nc: NguCanh) {
  const k = await nc.tx.warehouse.findFirst({
    where: { status: "hoat-dong" },
    select: CHON_KHO,
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
  });
  return k ? khoRa(k) : null;
}

export async function taoKho(nc: NguCanh, d: z.infer<typeof LuocDoTaoKho>) {
  batBuocQuyen(nc.hoSo, "inventory.create", { objectType: "warehouse" });
  try {
    const k = await nc.tx.warehouse.create({
      data: {
        tenantId: nc.tenantId, code: d.ma, name: d.ten, address: d.diaChi || null, note: d.ghiChu || null,
        isDefault: d.macDinh, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId,
      },
      select: CHON_KHO,
    });
    if (d.macDinh) await nc.tx.warehouse.updateMany({ where: { id: { not: k.id } }, data: { isDefault: false } });
    await nc.kiemToan({ action: "tao", objectType: "warehouse", objectId: k.id, after: khoRa(k) });
    await nc.suKien({ eventType: SU_KIEN.WAREHOUSE_CREATED, objectType: "warehouse", objectId: k.id, payload: { ma: k.code } });
    return khoRa(k);
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiNghiepVu("Mã kho này đã có.", 409, "trung-ma-kho");
    throw e;
  }
}

export async function suaKho(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaKho>) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "warehouse", objectId: id });
  const truoc = await batBuocThayKho(nc, id);

  // KHO-07: không ngừng kho khi còn hàng trong đó — nếu không, hàng sẽ biến mất khỏi mọi màn hình.
  if (d.trangThai === "ngung-hoat-dong" && truoc.trangThai === "hoat-dong") {
    const conHang = await nc.tx.inventoryBalance.count({ where: { warehouseId: id, onHand: { gt: 0 } } });
    if (conHang > 0) {
      throw new LoiNghiepVu(`Kho này còn ${conHang} mặt hàng đang có tồn. Chuyển hàng đi hoặc điều chỉnh về 0 trước khi ngừng.`, 409, "kho-con-hang");
    }
  }

  const k = await nc.tx.warehouse.update({
    where: { id },
    data: {
      ...(d.ten !== undefined && { name: d.ten }),
      ...(d.diaChi !== undefined && { address: d.diaChi || null }),
      ...(d.ghiChu !== undefined && { note: d.ghiChu || null }),
      ...(d.macDinh !== undefined && { isDefault: d.macDinh }),
      ...(d.trangThai !== undefined && { status: d.trangThai }),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_KHO,
  });
  if (d.macDinh) await nc.tx.warehouse.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
  await nc.kiemToan({ action: "sua", objectType: "warehouse", objectId: id, before: truoc, after: khoRa(k) });
  return khoRa(k);
}

// ---------------------------------------------------------------------------
// Lõi: ghi sổ kho
// ---------------------------------------------------------------------------

export interface YeuCauGhiSo {
  khoId: string;
  sanPhamId: string;
  loai: LoaiGiaoDich;
  soLuong: number;
  /** Với `xuat`: bao nhiêu trong số đó đang được giữ chỗ (để nhả giữ chỗ tương ứng). */
  nhaGiuCho?: number;
  /** Với `dieu-chinh`: 1 = tăng, -1 = giảm. */
  chieu?: 1 | -1;
  giaVon?: string | number | null;
  loaiChungTu?: string | null;
  chungTuId?: string | null;
  soChungTu?: string | null;
  lyDo?: string | null;
  ghiChu?: string | null;
}

/**
 * Ghi một giao dịch kho và cập nhật số dư trong cùng một giao dịch CSDL.
 *
 * Không kiểm quyền ở đây: hàm này là lõi dùng chung, người gọi (nhập kho, xuất kho,
 * xác nhận đơn…) đã kiểm quyền theo nghiệp vụ của mình.
 */
export async function ghiSoKho(nc: NguCanh, yc: YeuCauGhiSo) {
  // Khóa dòng số dư đến hết giao dịch: hai người cùng xuất một mặt hàng phải xếp hàng.
  const dsKhoa = await nc.tx.$queryRaw<{ id: string; on_hand: string; reserved: string }[]>`
    SELECT id, on_hand::text, reserved::text FROM inventory_balances
    WHERE warehouse_id = ${yc.khoId}::uuid AND product_id = ${yc.sanPhamId}::uuid
    FOR UPDATE
  `;
  const truoc = dsKhoa[0]
    ? { onHand: Number(dsKhoa[0].on_hand), reserved: Number(dsKhoa[0].reserved) }
    : { onHand: 0, reserved: 0 };

  const td = tacDong(yc.loai, yc.soLuong, { nhaGiuCho: yc.nhaGiuCho, chieu: yc.chieu });
  const { sau, hopLe, lyDo } = soDuSau(truoc, td);
  if (!hopLe) {
    const sp = await nc.tx.product.findFirst({ where: { id: yc.sanPhamId }, select: { sku: true, name: true } });
    const ten = sp ? `${sp.name}${sp.sku ? ` (${sp.sku})` : ""}` : "Sản phẩm";
    throw new LoiNghiepVu(`${ten}: ${lyDo} Đang có ${truoc.onHand}, giữ chỗ ${truoc.reserved}.`, 409, "ton-khong-du", {
      sanPhamId: yc.sanPhamId, onHand: truoc.onHand, reserved: truoc.reserved, conBanDuoc: conBanDuoc(truoc),
    });
  }

  if (dsKhoa[0]) {
    await nc.tx.inventoryBalance.update({ where: { id: dsKhoa[0].id }, data: { onHand: sau.onHand, reserved: sau.reserved } });
  } else {
    await nc.tx.inventoryBalance.create({
      data: { tenantId: nc.tenantId, warehouseId: yc.khoId, productId: yc.sanPhamId, onHand: sau.onHand, reserved: sau.reserved },
    });
  }

  await nc.tx.inventoryTransaction.create({
    data: {
      tenantId: nc.tenantId,
      warehouseId: yc.khoId,
      productId: yc.sanPhamId,
      type: yc.loai,
      quantity: Math.abs(yc.soLuong),
      onHandDelta: td.onHandDelta,
      reservedDelta: td.reservedDelta,
      onHandAfter: sau.onHand,
      reservedAfter: sau.reserved,
      unitCost: yc.giaVon === undefined || yc.giaVon === null || yc.giaVon === "" ? null : String(yc.giaVon),
      refType: yc.loaiChungTu ?? null,
      refId: yc.chungTuId ?? null,
      refNumber: yc.soChungTu ?? null,
      reason: yc.lyDo ?? null,
      note: yc.ghiChu ?? null,
      createdBy: nc.hoSo.userId,
    },
  });

  return { truoc, sau };
}

// ---------------------------------------------------------------------------
// Nhập kho, điều chỉnh
// ---------------------------------------------------------------------------

async function batBuocSanPham(nc: NguCanh, ids: string[]) {
  const ds = await nc.tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, name: true, status: true, requiresSerial: true, costPrice: true },
  });
  const theoId = new Map(ds.map((p) => [p.id, p]));
  for (const id of ids) {
    const p = theoId.get(id);
    if (!p) throw new LoiKhongTimThay("Sản phẩm");
    if (p.status !== "hoat-dong") throw new LoiNghiepVu(`Sản phẩm ${p.name} đang ngừng kinh doanh, không nhập/xuất được.`, 409, "san-pham-ngung");
  }
  return theoId;
}

/** Nhập hàng vào kho. Hàng quản lý theo sê-ri phải khai đủ sê-ri (KHO-05). */
export async function nhapKho(nc: NguCanh, d: DuLieuNhapKho) {
  batBuocQuyen(nc.hoSo, "inventory.create", { objectType: "inventory" });
  const kho = await batBuocThayKho(nc, d.khoId);
  if (kho.trangThai !== "hoat-dong") throw new LoiNghiepVu("Kho này đã ngừng hoạt động.", 409, "kho-ngung");
  const sanPham = await batBuocSanPham(nc, d.dong.map((x) => x.sanPhamId));

  const ketQua: { sanPhamId: string; soLuong: string; tonSau: number }[] = [];
  for (const dong of d.dong) {
    const sp = sanPham.get(dong.sanPhamId)!;
    const sl = Number(dong.soLuong);

    if (sp.requiresSerial) {
      if (dong.serial.length !== sl) {
        throw new LoiNghiepVu(
          `${sp.name} quản lý theo số sê-ri: cần đúng ${sl} sê-ri, đang có ${dong.serial.length}.`,
          400, "thieu-serial", { sanPhamId: sp.id, canCo: sl, dangCo: dong.serial.length },
        );
      }
      const rieng = new Set(dong.serial.map((s) => s.toUpperCase()));
      if (rieng.size !== dong.serial.length) throw new LoiNghiepVu(`${sp.name}: có số sê-ri trùng nhau trong cùng lần nhập.`, 400, "serial-trung-trong-phieu");
    }

    const { sau } = await ghiSoKho(nc, {
      khoId: d.khoId,
      sanPhamId: dong.sanPhamId,
      loai: "nhap",
      soLuong: sl,
      giaVon: dong.giaVon ?? sp.costPrice?.toString() ?? null,
      loaiChungTu: "nhap-kho",
      lyDo: d.lyDo,
      ghiChu: dong.ghiChu || d.ghiChu || null,
    });

    for (const serial of dong.serial) {
      try {
        await nc.tx.serialNumber.create({
          data: {
            tenantId: nc.tenantId, productId: dong.sanPhamId, serial: serial.trim(),
            warehouseId: d.khoId, status: "trong-kho", createdBy: nc.hoSo.userId,
          },
        });
      } catch (e) {
        if (laLoiTrung(e)) throw new LoiNghiepVu(`Số sê-ri ${serial} của ${sp.name} đã có trong hệ thống.`, 409, "trung-serial", { serial });
        throw e;
      }
    }
    ketQua.push({ sanPhamId: dong.sanPhamId, soLuong: dong.soLuong, tonSau: sau.onHand });
  }

  await nc.kiemToan({ action: "tao", objectType: "inventory", after: { kho: kho.ma, lyDo: d.lyDo, soDong: d.dong.length } });
  await nc.suKien({ eventType: SU_KIEN.STOCK_RECEIVED, objectType: "inventory", payload: { khoId: d.khoId, soDong: d.dong.length } });
  return { khoId: d.khoId, dong: ketQua };
}

/** Điều chỉnh tồn sau kiểm kê. Luôn phải có lý do (KHO-03). */
export async function dieuChinhTon(nc: NguCanh, d: DuLieuDieuChinh) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "inventory" });
  await batBuocThayKho(nc, d.khoId);
  await batBuocSanPham(nc, [d.sanPhamId]);

  const { truoc, sau } = await ghiSoKho(nc, {
    khoId: d.khoId,
    sanPhamId: d.sanPhamId,
    loai: "dieu-chinh",
    soLuong: Number(d.soLuong),
    chieu: d.chieu === "tang" ? 1 : -1,
    loaiChungTu: "dieu-chinh",
    lyDo: d.lyDo,
    ghiChu: d.ghiChu || null,
  });

  await nc.kiemToan({
    action: "sua", objectType: "inventory", objectId: d.sanPhamId,
    before: { onHand: truoc.onHand }, after: { onHand: sau.onHand, lyDo: d.lyDo },
  });
  await nc.suKien({ eventType: SU_KIEN.STOCK_ADJUSTED, objectType: "inventory", objectId: d.sanPhamId, payload: { khoId: d.khoId, chieu: d.chieu, soLuong: d.soLuong, lyDo: d.lyDo } });
  return { truoc, sau };
}

/** Đặt mức tồn tối thiểu để cảnh báo sắp hết hàng. Bỏ trống = tắt cảnh báo. */
export async function datMucTonToiThieu(nc: NguCanh, sanPhamId: string, muc: string | number | null) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "product", objectId: sanPhamId });
  const sp = await nc.tx.product.findFirst({ where: { id: sanPhamId }, select: { id: true, minStock: true } });
  if (!sp) throw new LoiKhongTimThay("Sản phẩm");
  const gt = muc === null || muc === "" ? null : String(muc).replace(/\./g, "").replace(",", ".");
  if (gt !== null && (!/^\d+(\.\d{1,3})?$/.test(gt) || Number(gt) < 0)) {
    throw new LoiNghiepVu("Mức tồn tối thiểu phải là số không âm.", 400, "muc-ton-sai");
  }
  await nc.tx.product.update({ where: { id: sanPhamId }, data: { minStock: gt, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "product", objectId: sanPhamId, before: { mucTonToiThieu: sp.minStock?.toString() ?? null }, after: { mucTonToiThieu: gt } });
  return { sanPhamId, mucTonToiThieu: gt };
}

// ---------------------------------------------------------------------------
// Đọc: tồn kho, thẻ kho, sê-ri
// ---------------------------------------------------------------------------

/** Tồn kho theo từng cặp (kho, sản phẩm), kèm mức cảnh báo. */
export async function tonKho(nc: NguCanh, boLoc: BoLocTonKho) {
  batBuocQuyen(nc.hoSo, "inventory.view");
  const dieuKien: Prisma.InventoryBalanceWhereInput[] = [];
  if (boLoc.kho) dieuKien.push({ warehouseId: boLoc.kho });
  if (boLoc.q) {
    dieuKien.push({
      product: { OR: [{ sku: { contains: boLoc.q, mode: "insensitive" } }, { name: { contains: boLoc.q, mode: "insensitive" } }] },
    });
  }
  const where: Prisma.InventoryBalanceWhereInput = { AND: dieuKien };

  const [tong, ds] = await Promise.all([
    nc.tx.inventoryBalance.count({ where }),
    nc.tx.inventoryBalance.findMany({
      where,
      select: {
        id: true, onHand: true, reserved: true, updatedAt: true,
        warehouse: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, sku: true, name: true, unit: true, minStock: true, requiresSerial: true } },
      },
      orderBy: [{ product: { name: "asc" } }, { warehouse: { code: "asc" } }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
  ]);

  const dong = ds.map((b) => {
    const sd = { onHand: Number(b.onHand), reserved: Number(b.reserved) };
    const con = conBanDuoc(sd);
    const toiThieu = b.product.minStock === null ? null : Number(b.product.minStock);
    return {
      id: b.id,
      kho: { id: b.warehouse.id, ma: b.warehouse.code, ten: b.warehouse.name },
      sanPham: { id: b.product.id, sku: b.product.sku, ten: b.product.name, donViTinh: b.product.unit, theoSerial: b.product.requiresSerial },
      tonKho: sd.onHand,
      giuCho: sd.reserved,
      conBanDuoc: con,
      mucToiThieu: toiThieu,
      mucCanhBao: mucTon(con, toiThieu),
      suaLuc: b.updatedAt,
    };
  });

  const loc = boLoc.canhBao === "1" ? dong.filter((d) => d.mucCanhBao !== "du") : dong;
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: loc, locCanhBao: boLoc.canhBao === "1" };
}

/** Tổng tồn của một sản phẩm trên mọi kho — dùng khi lập đơn để biết còn bán được bao nhiêu. */
export async function tonTheoSanPham(nc: NguCanh, sanPhamIds: string[]) {
  if (!coQuyen(nc.hoSo, "inventory.view") || sanPhamIds.length === 0) return new Map<string, { tonKho: number; giuCho: number; conBanDuoc: number }>();
  const ds = await nc.tx.inventoryBalance.groupBy({
    by: ["productId"],
    where: { productId: { in: sanPhamIds } },
    _sum: { onHand: true, reserved: true },
  });
  return new Map(
    ds.map((d) => {
      const sd = { onHand: Number(d._sum.onHand ?? 0), reserved: Number(d._sum.reserved ?? 0) };
      return [d.productId, { tonKho: sd.onHand, giuCho: sd.reserved, conBanDuoc: conBanDuoc(sd) }];
    }),
  );
}

/** Thẻ kho: sổ cái giao dịch, mới nhất trước. */
export async function theKho(nc: NguCanh, boLoc: BoLocTheKho) {
  batBuocQuyen(nc.hoSo, "inventory.view");
  const where: Prisma.InventoryTransactionWhereInput = {
    ...(boLoc.sanPham && { productId: boLoc.sanPham }),
    ...(boLoc.kho && { warehouseId: boLoc.kho }),
    ...(boLoc.loai && { type: boLoc.loai }),
  };
  const [tong, ds] = await Promise.all([
    nc.tx.inventoryTransaction.count({ where }),
    nc.tx.inventoryTransaction.findMany({
      where,
      select: {
        id: true, type: true, quantity: true, onHandDelta: true, reservedDelta: true, onHandAfter: true,
        reservedAfter: true, refType: true, refId: true, refNumber: true, reason: true, note: true,
        createdAt: true, createdBy: true,
        warehouse: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, sku: true, name: true, unit: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
  ]);

  const nguoi = await nc.tx.user.findMany({
    where: { id: { in: [...new Set(ds.map((d) => d.createdBy).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, fullName: true },
  });
  const tenNguoi = Object.fromEntries(nguoi.map((u) => [u.id, u.fullName]));

  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map((d) => ({
      id: d.id,
      loai: d.type,
      soLuong: Number(d.quantity),
      tonThayDoi: Number(d.onHandDelta),
      giuChoThayDoi: Number(d.reservedDelta),
      tonSau: Number(d.onHandAfter),
      giuChoSau: Number(d.reservedAfter),
      loaiChungTu: d.refType,
      chungTuId: d.refId,
      soChungTu: d.refNumber,
      lyDo: d.reason,
      ghiChu: d.note,
      luc: d.createdAt,
      nguoi: d.createdBy ? (tenNguoi[d.createdBy] ?? null) : null,
      kho: { id: d.warehouse.id, ma: d.warehouse.code, ten: d.warehouse.name },
      sanPham: { id: d.product.id, sku: d.product.sku, ten: d.product.name, donViTinh: d.product.unit },
    })),
  };
}

export async function danhSachSerial(nc: NguCanh, boLoc: BoLocSerial) {
  batBuocQuyen(nc.hoSo, "inventory.view");
  const where: Prisma.SerialNumberWhereInput = {
    ...(boLoc.q && { serial: { contains: boLoc.q, mode: "insensitive" } }),
    ...(boLoc.sanPham && { productId: boLoc.sanPham }),
    ...(boLoc.kho && { warehouseId: boLoc.kho }),
    ...(boLoc.trangThai && { status: boLoc.trangThai }),
  };
  const [tong, ds] = await Promise.all([
    nc.tx.serialNumber.count({ where }),
    nc.tx.serialNumber.findMany({
      where,
      select: {
        id: true, serial: true, status: true, createdAt: true,
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true } },
        salesOrderItem: { select: { id: true, order: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
  ]);
  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map((s) => ({
      id: s.id,
      serial: s.serial,
      trangThai: s.status,
      sanPham: { id: s.product.id, sku: s.product.sku, ten: s.product.name },
      kho: s.warehouse ? { id: s.warehouse.id, ma: s.warehouse.code } : null,
      donHang: s.salesOrderItem?.order ? { id: s.salesOrderItem.order.id, so: s.salesOrderItem.order.number, khach: s.salesOrderItem.order.customer.name } : null,
      taoLuc: s.createdAt,
    })),
  };
}

/**
 * Đối soát: tổng sổ cái của từng cặp (kho, sản phẩm) phải bằng số dư đang lưu.
 * Dùng cho bài thử và cho màn hình quản trị khi nghi ngờ số liệu.
 */
export async function doiSoatKho(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "inventory.view");
  const [soDu, soCai] = await Promise.all([
    nc.tx.inventoryBalance.findMany({ select: { warehouseId: true, productId: true, onHand: true, reserved: true } }),
    nc.tx.inventoryTransaction.groupBy({ by: ["warehouseId", "productId"], _sum: { onHandDelta: true, reservedDelta: true } }),
  ]);
  const khoa = (w: string, p: string) => `${w}|${p}`;
  const theoKhoa = new Map(soCai.map((s) => [khoa(s.warehouseId, s.productId), s]));
  const lech: { warehouseId: string; productId: string; soDu: number; soCai: number }[] = [];
  for (const b of soDu) {
    const s = theoKhoa.get(khoa(b.warehouseId, b.productId));
    const tongSoCai = Number(s?._sum.onHandDelta ?? 0);
    if (Math.abs(tongSoCai - Number(b.onHand)) > 0.0005) {
      lech.push({ warehouseId: b.warehouseId, productId: b.productId, soDu: Number(b.onHand), soCai: tongSoCai });
    }
  }
  return { soCap: soDu.length, lech };
}
