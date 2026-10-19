import { readFileSync } from "node:fs";
import { join } from "node:path";
import { voiTenant } from "../src/lib/db";
import { anhXaLoi, taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { khoaChungTu } from "../src/lib/khoa-chung-tu";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { nhapKho, taoKho } from "../src/modules/kho/service";
import { LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { huyDon, taoDonHang, xacNhanDon } from "../src/modules/don-hang/service";
import { LuocDoTaoDon } from "../src/modules/don-hang/luoc-do";
import { chiTietHoaDon, huyHoaDon, huyPhieuThu, phatHanhHoaDon, taoHoaDon, thuTien } from "../src/modules/tai-chinh/service";
import { LuocDoPhatHanh, LuocDoTaoHoaDon, LuocDoThuTien } from "../src/modules/tai-chinh/luoc-do";
import { LuocDoTaoNhaCungCap, taoNhaCungCap } from "../src/modules/nha-cung-cap/service";
import {
  chiTietDonMua,
  guiDonMua,
  huyDeNghi,
  huyDonMua,
  nhanHang,
  quyetDuyetDeNghi,
  taoDeNghi,
  taoDonMua,
  xinDuyetDeNghi,
  chiTietDeNghi,
} from "../src/modules/mua-hang/service";
import { LuocDoNhanHang, LuocDoQuyetDuyetDeNghi, LuocDoTaoDeNghi, LuocDoTaoDonMua } from "../src/modules/mua-hang/luoc-do";
import { chiTien, ghiNhanHoaDonMua, huyHoaDonMua, huyPhieuChi, taoHoaDonMua } from "../src/modules/cong-no-tra/service";
import { LuocDoChiTien, LuocDoGhiNhanHoaDonMua, LuocDoTaoHoaDonMua } from "../src/modules/cong-no-tra/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA ĐỘC LẬP gói 0.16.1 "Toàn vẹn tài chính và mua hàng" — cố phá các luật TV-TC-01 → 10
 * trên CSDL THẬT, bằng nhiều giao dịch `voiTenant` thật (mỗi giao dịch một kết nối):
 * đua 2 bên và 5 bên, phiếu thu chéo thứ tự hóa đơn, khóa chéo với giao dịch kiểu "gộp
 * khách", RLS khác doanh nghiệp, số tiền lẻ, và migration chạy trên dữ liệu đã trùng.
 *
 * Kiểm chứng chính là BẤT BIẾN sau cuộc đua (không thu vượt, không tiền treo trên hóa đơn
 * hủy, một đơn một hóa đơn…) chứ không phải thứ tự ai thắng — thứ tự do lịch của PostgreSQL.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const homNay = homNayVN();
const ngu = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-qa-tv-tai-chinh"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<unknown> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
    return null;
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "dinh-dang" ? e instanceof LoiDinhDang
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return e;
  }
}

/** Chạy n việc cùng lúc, mỗi việc một giao dịch riêng. */
async function dua<T>(...viec: (() => Promise<T>)[]) {
  return Promise.allSettled(viec.map((v) => v()));
}
const soDat = (ds: PromiseSettledResult<unknown>[]) => ds.filter((r) => r.status === "fulfilled").length;
function moTa(ds: PromiseSettledResult<unknown>[]): string {
  return ds
    .map((r) => {
      if (r.status === "fulfilled") return "đạt";
      const e = r.reason;
      return e instanceof LoiNghiepVu ? `LoiNghiepVu(${e.ma})` : e instanceof Error ? `${e.name}: ${e.message.slice(0, 160)}` : String(e);
    })
    .join(" / ");
}
/** Mọi lần thua đều là lỗi nghiệp vụ có chủ đích (→ 4xx), không có lỗi nào thành 500. */
function thuaSach(ds: PromiseSettledResult<unknown>[], ma?: string): boolean {
  return ds.every((r) => r.status === "fulfilled" || (r.reason instanceof LoiNghiepVu && (!ma || r.reason.ma === ma)));
}
const maHttp = (e: unknown) => anhXaLoi(e).status;

async function main() {
  console.log("=== QA độc lập: toàn vẹn tài chính và mua hàng (0.16.1) ===\n");
  const tenant = await seedNenMong(chu, `qa-tvtc-${DAU}`, "Doanh nghiệp QA toàn vẹn tài chính");
  const tenantB = await seedNenMong(chu, `qa-tvtc-b-${DAU}`, "Doanh nghiệp QA thứ hai");
  const T = tenant.id;
  const TB = tenantB.id;
  const nguoi = async (tid: string, ten: string, vai: string) => {
    const role = await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tid, code: vai } } });
    return (
      await chu.user.create({
        data: {
          tenantId: tid,
          email: `${ten}.${DAU}@qa.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: tid, roleId: role.id } },
          staffProfile: { create: { tenantId: tid } },
        },
      })
    ).id;
  };
  const gd = await nguoi(T, "qa-giam-doc", "ceo");
  const kt = await nguoi(T, "qa-ke-toan", "finance");
  const kt2 = await nguoi(T, "qa-ke-toan-2", "finance");
  const tpkd = await nguoi(T, "qa-tpkd", "sales-manager");
  const thukho = await nguoi(T, "qa-thu-kho", "warehouse");
  const muahang = await nguoi(T, "qa-mua-hang", "purchasing");
  const ktB = await nguoi(TB, "qa-ke-toan-b", "finance");
  const gdB = await nguoi(TB, "qa-giam-doc-b", "ceo");
  console.log("");

  const khach = await voi(T, tpkd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty QA Toàn Vẹn ${DAU}`, dienThoai: "0909 223 001" })));
  const kho = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-qa", ten: "Kho QA", macDinh: true })));
  const sp = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `QA-CHUOT-${DAU}`, ten: "Chuột", giaBan: "1000000", giaVon: "600000", donViTinh: "cai" })),
  );
  await voi(T, thukho, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "Nhập đầu kỳ QA", dong: [{ sanPhamId: sp.id, soLuong: "500", giaVon: "600000" }] })));

  const donDaXacNhan = async (sl: number) => {
    const don = await voi(T, tpkd, (nc) =>
      taoDonHang(nc, LuocDoTaoDon.parse({ khachHangId: khach.id, dong: [{ sanPhamId: sp.id, ten: "Chuột", soLuong: String(sl), donGia: "1000000", vat: 10, giaVon: "600000" }] })),
    );
    await voi(T, tpkd, (nc) => xacNhanDon(nc, don.id, { khoId: kho.id, ghiChu: null }));
    return don;
  };
  /** Hóa đơn đã phát hành: sl × 1.100.000 ₫. */
  const hoaDon = async (sl: number) => {
    const don = await donDaXacNhan(sl);
    const hd = await voi(T, kt, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id })));
    await voi(T, kt, (nc) => phatHanhHoaDon(nc, hd.id, LuocDoPhatHanh.parse({ hanThanhToan: congNgay(homNay, 30) })));
    return { id: hd.id, don, tong: sl * 1_100_000 };
  };
  const thuPB = (phanBo: { hoaDonId: string; soTien: string | number }[], soTien?: string | number, nguoiThu = kt, tid = T) =>
    voi(tid, nguoiThu, (nc) =>
      thuTien(
        nc,
        LuocDoThuTien.parse({
          khachHangId: khach.id,
          phuongThuc: "chuyen-khoan",
          soTien: soTien ?? String(phanBo.reduce((s, p) => s + Number(p.soTien), 0)),
          phanBo,
        }),
      ),
    );
  const thu = (hoaDonId: string, soTien: number, nguoiThu = kt) => thuPB([{ hoaDonId, soTien: String(soTien) }], String(soTien), nguoiThu);
  const daThu = async (invoiceId: string) => {
    const ds = await chu.paymentAllocation.findMany({ where: { invoiceId, payment: { status: "hoat-dong" } }, select: { amount: true } });
    return ds.reduce((s, a) => s + Number(a.amount), 0);
  };

  // ==================================================================
  console.log("— 1. Thu tiền chạy đua —");
  {
    const hd = await hoaDon(2);
    const r = await dua(() => thu(hd.id, 880_000, kt), () => thu(hd.id, 1_320_000, kt2));
    dat("Hai phiếu thu một phần cùng lúc (40% + 60%) đều được ghi — khóa không chặn nhầm", soDat(r) === 2, moTa(r));
    dat("Tổng đã thu đúng bằng tổng hóa đơn", (await daThu(hd.id)) === hd.tong);
    const paid = await chu.businessEvent.count({ where: { tenantId: T, eventType: "INVOICE_PAID", objectId: hd.id } });
    dat("Đúng MỘT sự kiện INVOICE_PAID (phiếu sau đọc số đã thu mới)", paid === 1, String(paid));
  }
  {
    const hd = await hoaDon(4);
    const phan = hd.tong / 4;
    const r = await dua(...[kt, kt2, kt, kt2, gd].map((u) => () => thu(hd.id, phan, u)));
    dat("Đua 5 bên, mỗi bên 25%: đúng 4 phiếu được ghi", soDat(r) === 4, moTa(r));
    dat("Bên thua bị chặn bằng lỗi nghiệp vụ thu-vuot-cong-no (không 500)", thuaSach(r, "thu-vuot-cong-no"), moTa(r));
    dat("Đua 5 bên: đã thu = đúng tổng, không vượt", (await daThu(hd.id)) === hd.tong);
  }
  {
    // Hai phiếu thu, mỗi phiếu phân bổ cho HAI hóa đơn nhưng liệt kê theo thứ tự ngược nhau.
    const a = await hoaDon(1);
    const b = await hoaDon(1);
    const viec: (() => Promise<unknown>)[] = [];
    for (let i = 0; i < 5; i++) {
      viec.push(() => thuPB([{ hoaDonId: a.id, soTien: "100000" }, { hoaDonId: b.id, soTien: "100000" }], undefined, kt));
      viec.push(() => thuPB([{ hoaDonId: b.id, soTien: "100000" }, { hoaDonId: a.id, soTien: "100000" }], undefined, kt2));
    }
    const t0 = Date.now();
    const r = await dua(...viec);
    dat("10 phiếu thu chéo thứ tự [A,B] / [B,A] cùng lúc: tất cả được ghi, không khóa chéo", soDat(r) === 10, moTa(r));
    dat("…và xong trong thời gian hợp lý (không treo chờ khóa)", Date.now() - t0 < 15_000, `${Date.now() - t0} ms`);
    const [ta, tb] = [await daThu(a.id), await daThu(b.id)];
    dat("Mỗi hóa đơn đã thu đúng 10 × 100.000", ta === 1_000_000 && tb === 1_000_000, JSON.stringify({ ta, tb }));
  }
  {
    const hd = await hoaDon(1);
    const pt = await thu(hd.id, hd.tong);
    const r = await dua(...[kt, kt2, gd, kt, kt2].map((u, i) => () => voi(T, u, (nc) => huyPhieuThu(nc, pt.id, `Hủy lần ${i + 1}`))));
    dat("Hủy một phiếu thu 5 lần cùng lúc: đúng một lần ghi", soDat(r) === 1, moTa(r));
    dat("Bốn lần kia báo da-huy", thuaSach(r, "da-huy"), moTa(r));
    const sk = await chu.businessEvent.count({ where: { tenantId: T, eventType: "PAYMENT_CANCELLED", objectId: pt.id } });
    dat("Đúng một sự kiện PAYMENT_CANCELLED", sk === 1, String(sk));
    const lai = await thu(hd.id, hd.tong);
    dat("Phiếu đã hủy thì thu lại đủ được", !!lai.id && (await daThu(hd.id)) === hd.tong);
  }
  {
    // Hủy phiếu thu (phân bổ A, B) đua với hủy hóa đơn A và với một phiếu thu mới cho B.
    const a = await hoaDon(1);
    const b = await hoaDon(2);
    const pt = await thuPB([{ hoaDonId: a.id, soTien: "500000" }, { hoaDonId: b.id, soTien: "500000" }]);
    const r = await dua<unknown>(
      () => voi(T, kt, (nc) => huyPhieuThu(nc, pt.id, "Séc bị trả")),
      () => voi(T, kt2, (nc) => huyHoaDon(nc, a.id, "Lập nhầm")),
      () => thu(b.id, 1_000_000, gd),
    );
    dat("Hủy phiếu thu ‖ hủy hóa đơn ‖ thu mới: không lỗi 500", thuaSach(r), moTa(r));
    const ttA = (await chu.invoice.findUniqueOrThrow({ where: { id: a.id } })).status;
    const thuA = await daThu(a.id);
    dat("Không có tiền thu treo trên hóa đơn đã hủy", ttA !== "CANCELLED" || thuA === 0, JSON.stringify({ ttA, thuA }));
    const thuB = await daThu(b.id);
    dat("Hóa đơn B không bị thu vượt", thuB <= b.tong, String(thuB));
  }
  {
    // Thu từng phần cộng lại ĐÚNG bằng tổng (số lẻ chia không hết), rồi thêm 1 ₫ thì bị chặn.
    const hd = await hoaDon(1);
    for (const x of [366_667, 366_667, 366_666]) await thu(hd.id, x);
    const ct = await voi(T, kt, (nc) => chiTietHoaDon(nc, hd.id));
    dat("Ba lần thu lẻ cộng đúng bằng tổng: đã thu đủ, còn nợ 0", ct.hoaDon.conNo === 0 && ct.hoaDon.tinhTrangThu === "da-thu-du", JSON.stringify({ conNo: ct.hoaDon.conNo }));
    await nemLoi("Thu thêm 1 ₫ sau khi đủ bị chặn thu-vuot-cong-no", "nghiep-vu", () => thu(hd.id, 1), "thu-vuot-cong-no");
  }

  console.log("\n— 2. Số tiền lẻ (Decimal 18,2) —");
  {
    const a = await hoaDon(1);
    const b = await hoaDon(1);
    const e1 = await nemLoi("Phân bổ 0,4 ₫ + 0,6 ₫ (làm tròn thành 0 + 1) bị chặn rõ ràng thay vì lỗi CHECK", "dinh-dang", () =>
      thuPB([{ hoaDonId: a.id, soTien: 0.4 }, { hoaDonId: b.id, soTien: 0.6 }], 1),
    );
    dat("…trả 400 chứ không phải 500", maHttp(e1) === 400, String(maHttp(e1)));
    const e2 = await nemLoi("Dòng phân bổ 0 ₫ bị chặn", "dinh-dang", () =>
      thuPB([{ hoaDonId: a.id, soTien: "1000" }, { hoaDonId: b.id, soTien: "0" }], "1000"),
    );
    dat("…cũng 400", maHttp(e2) === 400, String(maHttp(e2)));
    dat("Không phiếu thu nào được ghi từ các yêu cầu lỗi", (await daThu(a.id)) === 0 && (await daThu(b.id)) === 0);
    // Tiền tính theo đồng (TC: số nguyên VND): dư 0,01 ₫ làm tròn về đúng phần còn nợ, dư 0,5 ₫ thành 1 ₫ là vượt.
    // Ô nhập dùng định dạng Việt Nam: dấu chấm phân nghìn, dấu phẩy thập phân.
    const thuChuoi = (soTien: string) => thuPB([{ hoaDonId: a.id, soTien }], soTien);
    await nemLoi("Thu dư 0,5 ₫ (tròn thành +1 ₫) bị chặn thu-vuot-cong-no", "nghiep-vu", () => thuChuoi("1.100.000,5"), "thu-vuot-cong-no");
    const pt = await thuChuoi("1.100.000,01");
    const luu = await chu.payment.findUniqueOrThrow({ where: { id: pt.id }, select: { amount: true } });
    dat("Thu dư 0,01 ₫ ghi đúng số đã làm tròn về đồng — không vượt nợ", Number(luu.amount) === a.tong && (await daThu(a.id)) === a.tong, luu.amount.toString());
  }

  console.log("\n— 3. Lập hóa đơn chạy đua; đơn đã hủy —");
  {
    const don = await donDaXacNhan(1);
    const r = await dua(...[kt, kt2, gd, kt, kt2].map((u) => () => voi(T, u, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id })))));
    dat("Lập hóa đơn 5 lần cùng lúc: cả 5 trả về bình thường", soDat(r) === 5, moTa(r));
    const ok = r.filter((x): x is PromiseFulfilledResult<{ id: string; so: string; daCoTruoc: boolean }> => x.status === "fulfilled").map((x) => x.value);
    dat("Cùng một hóa đơn, đúng một lần daCoTruoc = false", new Set(ok.map((x) => x.id)).size === 1 && ok.filter((x) => !x.daCoTruoc).length === 1, JSON.stringify(ok));
    dat("CSDL có đúng một hóa đơn còn hiệu lực", (await chu.invoice.count({ where: { salesOrderId: don.id, status: { not: "CANCELLED" } } })) === 1);

    const donHuy = await donDaXacNhan(1);
    await voi(T, gd, (nc) => huyDon(nc, donHuy.id, "Khách đổi ý"));
    await nemLoi("Lập hóa đơn cho đơn đã hủy bị chặn don-da-huy", "nghiep-vu", () => voi(T, kt, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: donHuy.id }))), "don-da-huy");
  }

  console.log("\n— 4. Khóa chéo với giao dịch kiểu gộp khách → 409 thử lại, không phải 500 —");
  {
    // Giao dịch "gộp khách" khóa dòng khách (FOR UPDATE) rồi sửa hóa đơn của khách đó; phiếu thu
    // khóa hóa đơn rồi chèn phiếu (khóa khóa-ngoại lên dòng khách). Hai thứ tự ngược nhau →
    // PostgreSQL hủy một bên (40P01). Bên bị hủy phải nhận 409 "thử lại", dữ liệu nguyên vẹn.
    const hd = await hoaDon(1);
    const gop = voiTenant(
      T,
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${khach.id}::uuid FOR UPDATE`;
        await ngu(500);
        await tx.$executeRaw`UPDATE invoices SET updated_at = now() WHERE id = ${hd.id}::uuid`;
        return "gop-xong";
      },
      { timeoutMs: 15_000 },
    );
    await ngu(100);
    const r = await Promise.allSettled([gop, thu(hd.id, hd.tong)]);
    const biHuy = r.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    dat("PostgreSQL hủy đúng một bên (khóa chéo có thật, không treo mãi)", biHuy.length === 1, moTa(r));
    dat(
      "Bên bị hủy vì khóa chéo được trả 409 kèm thông báo tiếng Việt, không phải 500",
      biHuy.length > 0 && biHuy.every((x) => maHttp(x.reason) === 409),
      biHuy.map((x) => `${maHttp(x.reason)} ${x.reason instanceof Error ? x.reason.message.slice(0, 120) : ""}`).join(" | "),
    );
    const thuSau = await daThu(hd.id);
    dat("Không ghi dở: đã thu là 0 hoặc đúng tổng", thuSau === 0 || thuSau === hd.tong, String(thuSau));
  }

  // ==================================================================
  const ncc = await voi(T, muahang, (nc) => taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `Nguồn QA ${DAU}`, dienThoai: "0909 223 101" })));
  const donMuaDaGui = async (sl: number, deNghi?: { id: string; dongId: string }) => {
    const dm = await voi(T, muahang, (nc) =>
      taoDonMua(
        nc,
        LuocDoTaoDonMua.parse({
          nhaCungCapId: ncc.id, khoId: kho.id, deNghiId: deNghi?.id,
          dong: [{ sanPhamId: sp.id, ten: "Chuột", soLuong: String(sl), donGia: "600000", vat: 10, deNghiDongId: deNghi?.dongId }],
        }),
      ),
    );
    await voi(T, muahang, (nc) => guiDonMua(nc, dm.id));
    return dm;
  };
  const hoaDonMua = async (sl: number) => {
    const dm = await donMuaDaGui(sl);
    const hd = await voi(T, kt, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id })));
    await voi(T, kt, (nc) => ghiNhanHoaDonMua(nc, hd.id, LuocDoGhiNhanHoaDonMua.parse({ ngayHoaDon: homNay, hanThanhToan: congNgay(homNay, 30) })));
    return { dm, id: hd.id, tong: sl * 660_000 };
  };
  const chiPB = (phanBo: { hoaDonId: string; soTien: string | number }[], soTien: string | number, u = kt) =>
    voi(T, u, (nc) => chiTien(nc, LuocDoChiTien.parse({ nhaCungCapId: ncc.id, phuongThuc: "chuyen-khoan", soTien, phanBo })));
  const daChi = async (billId: string) => {
    const ds = await chu.supplierPaymentAllocation.findMany({ where: { billId, payment: { status: "hoat-dong" } }, select: { amount: true } });
    return ds.reduce((s, a) => s + Number(a.amount), 0);
  };

  console.log("\n— 5. Chi tiền chạy đua (chiều mua) —");
  {
    const hd = await hoaDonMua(4);
    const phan = hd.tong / 4;
    const r = await dua(...[kt, kt2, gd, kt, kt2].map((u) => () => chiPB([{ hoaDonId: hd.id, soTien: String(phan) }], String(phan), u)));
    dat("Đua 5 phiếu chi 25%: đúng 4 phiếu", soDat(r) === 4, moTa(r));
    dat("Bên thua là chi-vuot-cong-no", thuaSach(r, "chi-vuot-cong-no"), moTa(r));
    dat("Đã chi = đúng tổng hóa đơn NCC", (await daChi(hd.id)) === hd.tong);
    const pcId = (await chu.supplierPayment.findFirstOrThrow({ where: { allocations: { some: { billId: hd.id } }, status: "hoat-dong" }, select: { id: true } })).id;
    const h = await dua(() => voi(T, kt, (nc) => huyPhieuChi(nc, pcId, "Chuyển nhầm")), () => voi(T, kt2, (nc) => huyPhieuChi(nc, pcId, "Trùng")));
    dat("Hủy một phiếu chi hai lần cùng lúc: một lần ghi, lần kia da-huy", soDat(h) === 1 && thuaSach(h, "da-huy"), moTa(h));
    dat("Đúng một sự kiện SUPPLIER_PAYMENT_CANCELLED", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "SUPPLIER_PAYMENT_CANCELLED", objectId: pcId } })) === 1);
    const e = await nemLoi("Phiếu chi có dòng phân bổ 0 ₫ bị chặn (trước đây 500 vì CHECK)", "dinh-dang", () =>
      chiPB([{ hoaDonId: hd.id, soTien: 0.4 }], 0.4),
    );
    dat("…số tiền tổng 0,4 ₫ cũng không lọt — 400", maHttp(e) === 400, String(maHttp(e)));
  }

  console.log("\n— 6. Mua hàng: nhận hàng, hủy đơn mua chạy đua —");
  {
    const dm = await donMuaDaGui(4);
    const ct = await voi(T, muahang, (nc) => chiTietDonMua(nc, dm.id));
    const dongId = ct.donMua.dong[0].id;
    const nhan = (sl: string, u: string) => () => voi(T, u, (nc) => nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongId, soLuong: sl, giaVon: "600000" }] })));
    const r = await dua(nhan("2", thukho), nhan("2", gd));
    dat("Nhận 2 + 2 trên đơn 4 cùng lúc: cả hai được ghi", soDat(r) === 2, moTa(r));
    const sau = await chu.purchaseOrder.findUniqueOrThrow({ where: { id: dm.id }, select: { status: true, items: { select: { receivedQty: true } } } });
    dat("Đơn chuyển Đã nhận đủ, số đã nhận = 4 (trạng thái tính sau khóa, không kẹt 'nhận một phần')", sau.status === "RECEIVED" && Number(sau.items[0].receivedQty) === 4, JSON.stringify(sau));
  }
  {
    const dm = await donMuaDaGui(4);
    const dongId = (await voi(T, muahang, (nc) => chiTietDonMua(nc, dm.id))).donMua.dong[0].id;
    const nhan = (u: string) => () => voi(T, u, (nc) => nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongId, soLuong: "3", giaVon: "600000" }] })));
    const r = await dua(nhan(thukho), nhan(gd));
    dat("Nhận 3 + 3 trên đơn 4 cùng lúc: đúng một phiếu, bên kia lỗi nghiệp vụ", soDat(r) === 1 && thuaSach(r), moTa(r));
    const q = await chu.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: dm.id }, select: { receivedQty: true } });
    dat("Số đã nhận = 3, không vượt số đặt", Number(q.receivedQty) === 3, q.receivedQty.toString());
    const ct = await voi(T, muahang, (nc) => chiTietDonMua(nc, dm.id));
    dat("Đơn đã nhận một phần: nút Hủy đơn mua ẩn (huyDonMua sẽ chặn da-nhan-hang)", ct.quyen.huy === false, JSON.stringify(ct.quyen));
  }
  {
    const dm = await donMuaDaGui(2);
    const dongId = (await voi(T, muahang, (nc) => chiTietDonMua(nc, dm.id))).donMua.dong[0].id;
    const r = await dua<unknown>(
      () => voi(T, muahang, (nc) => huyDonMua(nc, dm.id, "Nhà cung cấp hết hàng")),
      () => voi(T, thukho, (nc) => nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongId, soLuong: "2", giaVon: "600000" }] }))),
    );
    dat("Hủy đơn mua ‖ nhận hàng: đúng một việc thành công, bên kia lỗi nghiệp vụ", soDat(r) === 1 && thuaSach(r), moTa(r));
    const o = await chu.purchaseOrder.findUniqueOrThrow({ where: { id: dm.id }, select: { status: true, items: { select: { receivedQty: true } } } });
    const phieu = await chu.goodsReceipt.count({ where: { purchaseOrderId: dm.id } });
    dat("Đơn đã hủy thì không có hàng nhận vào", o.status !== "CANCELLED" || (phieu === 0 && Number(o.items[0].receivedQty) === 0), JSON.stringify({ o, phieu }));
  }
  {
    const dm = await donMuaDaGui(1);
    const r = await dua<unknown>(
      () => voi(T, muahang, (nc) => huyDonMua(nc, dm.id, "Đổi nhà cung cấp")),
      () => voi(T, kt, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id }))),
    );
    dat("Hủy đơn mua ‖ ghi hóa đơn NCC: đúng một việc thành công", soDat(r) === 1 && thuaSach(r), moTa(r));
    const st = (await chu.purchaseOrder.findUniqueOrThrow({ where: { id: dm.id } })).status;
    const soHd = await chu.supplierBill.count({ where: { purchaseOrderId: dm.id, status: { not: "CANCELLED" } } });
    dat("TV-TC-10 giữ được khi đua: không có hóa đơn NCC hiệu lực trên đơn đã hủy", st !== "CANCELLED" || soHd === 0, JSON.stringify({ st, soHd }));
  }
  {
    const hd = await hoaDonMua(1);
    let ct = await voi(T, muahang, (nc) => chiTietDonMua(nc, hd.dm.id));
    dat("Đơn mua còn hóa đơn NCC: nút Hủy ẩn", ct.quyen.huy === false, JSON.stringify(ct.quyen));
    await voi(T, kt, (nc) => huyHoaDonMua(nc, hd.id, "NCC xuất lại"));
    ct = await voi(T, muahang, (nc) => chiTietDonMua(nc, hd.dm.id));
    dat("Hủy hóa đơn NCC xong: nút Hủy đơn mua hiện lại", ct.quyen.huy === true, JSON.stringify(ct.quyen));
  }

  console.log("\n— 7. Đề nghị mua ↔ đơn mua chạy đua —");
  const deNghiDaDuyet = async () => {
    const dn = await voi(T, muahang, (nc) => taoDeNghi(nc, LuocDoTaoDeNghi.parse({ lyDo: "QA", dong: [{ sanPhamId: sp.id, ten: "Chuột", soLuong: "2", giaDuKien: "600000" }] })));
    await voi(T, muahang, (nc) => xinDuyetDeNghi(nc, dn.id));
    await voi(T, kt, (nc) => quyetDuyetDeNghi(nc, dn.id, LuocDoQuyetDuyetDeNghi.parse({ quyetDinh: "cho-duyet" })));
    const ct = await voi(T, muahang, (nc) => chiTietDeNghi(nc, dn.id));
    return { id: dn.id, dongId: ct.deNghi.dong[0].id };
  };
  const lapTuDeNghi = (dn: { id: string; dongId: string }, u = muahang) => () =>
    voi(T, u, (nc) =>
      taoDonMua(nc, LuocDoTaoDonMua.parse({ nhaCungCapId: ncc.id, khoId: kho.id, deNghiId: dn.id, dong: [{ sanPhamId: sp.id, ten: "Chuột", soLuong: "2", donGia: "600000", deNghiDongId: dn.dongId }] })),
    );
  {
    const dn = await deNghiDaDuyet();
    const r = await dua(...[muahang, gd, muahang, gd, muahang].map((u) => lapTuDeNghi(dn, u)));
    dat("5 người cùng lập đơn mua từ một đề nghị: đúng một đơn", soDat(r) === 1 && thuaSach(r, "de-nghi-chua-duyet"), moTa(r));
    const dm1 = (r.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>).value;
    // Hủy đơn (đề nghị → Đã duyệt) đua với lập đơn mới từ chính đề nghị đó.
    const r2 = await dua<unknown>(() => voi(T, muahang, (nc) => huyDonMua(nc, dm1.id, "NCC hết hàng")), lapTuDeNghi(dn, gd));
    dat("Hủy đơn mua ‖ lập lại từ đề nghị: không lỗi 500", thuaSach(r2), moTa(r2));
    const conHieuLuc = await chu.purchaseOrder.count({ where: { requestId: dn.id, status: { not: "CANCELLED" } } });
    const ttDn = (await chu.purchaseRequest.findUniqueOrThrow({ where: { id: dn.id } })).status;
    dat("Đề nghị có nhiều nhất một đơn mua hiệu lực", conHieuLuc <= 1, String(conHieuLuc));
    dat("Trạng thái đề nghị khớp đơn: ORDERED ⇔ có đơn hiệu lực", (ttDn === "ORDERED") === (conHieuLuc === 1) && ["ORDERED", "APPROVED"].includes(ttDn), JSON.stringify({ ttDn, conHieuLuc }));
  }
  {
    const dn = await deNghiDaDuyet();
    const r = await dua<unknown>(() => voi(T, muahang, (nc) => huyDeNghi(nc, dn.id, "Không cần nữa")), lapTuDeNghi(dn, gd));
    dat("Hủy đề nghị ‖ lập đơn mua: đúng một việc thành công", soDat(r) === 1 && thuaSach(r), moTa(r));
    const ttDn = (await chu.purchaseRequest.findUniqueOrThrow({ where: { id: dn.id } })).status;
    const soDon = await chu.purchaseOrder.count({ where: { requestId: dn.id, status: { not: "CANCELLED" } } });
    dat("Không có đơn mua hiệu lực từ đề nghị đã hủy", !(ttDn === "CANCELLED" && soDon > 0), JSON.stringify({ ttDn, soDon }));
  }

  // ==================================================================
  console.log("\n— 8. RLS: doanh nghiệp B không khóa / không đụng được chứng từ của A —");
  {
    const hd = await hoaDon(1);
    const pt = await thu(hd.id, 100_000);
    const hdm = await hoaDonMua(1);
    const pc = await chiPB([{ hoaDonId: hdm.id, soTien: "100000" }], "100000");
    const khoaDuoc = await voiTenant(TB, async (tx) => ({
      hd: await khoaChungTu(tx, "invoices", hd.id),
      pt: await khoaChungTu(tx, "payments", pt.id),
      dm: await khoaChungTu(tx, "purchase_orders", hdm.dm.id),
      sb: await khoaChungTu(tx, "supplier_bills", [hdm.id, hd.id]),
    }));
    dat("khoaChungTu từ doanh nghiệp B trả [] cho mọi dòng của A", Object.values(khoaDuoc).every((x) => x.length === 0), JSON.stringify(khoaDuoc));
    // Và B KHÔNG bị chờ khóa của A: A đang giữ khóa hóa đơn, B gọi khóa cùng id vẫn xong ngay.
    const giuA = voiTenant(T, async (tx) => { await khoaChungTu(tx, "invoices", hd.id); await ngu(1500); return 1; }, { timeoutMs: 10_000 });
    await ngu(100);
    const t0 = Date.now();
    await voiTenant(TB, (tx) => khoaChungTu(tx, "invoices", hd.id));
    dat("B không phải chờ khóa của A (RLS lọc trước khi khóa)", Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
    await giuA;

    await nemLoi("B hủy hóa đơn của A → không tìm thấy", "khong-thay", () => voi(TB, gdB, (nc) => huyHoaDon(nc, hd.id, "Phá")));
    await nemLoi("B hủy phiếu thu của A → không tìm thấy", "khong-thay", () => voi(TB, gdB, (nc) => huyPhieuThu(nc, pt.id, "Phá")));
    await nemLoi("B hủy phiếu chi của A → không tìm thấy", "khong-thay", () => voi(TB, gdB, (nc) => huyPhieuChi(nc, pc.id, "Phá")));
    await nemLoi("B hủy hóa đơn NCC của A → không tìm thấy", "khong-thay", () => voi(TB, gdB, (nc) => huyHoaDonMua(nc, hdm.id, "Phá")));
    await nemLoi("B hủy đơn mua của A → không tìm thấy", "khong-thay", () => voi(TB, gdB, (nc) => huyDonMua(nc, hdm.dm.id, "Phá")));
    await nemLoi("B phát hành hóa đơn của A → không tìm thấy", "khong-thay", () => voi(TB, gdB, (nc) => phatHanhHoaDon(nc, hd.id, LuocDoPhatHanh.parse({}))));
    const khachB = await voi(TB, gdB, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Khách B ${DAU}`, dienThoai: "0909 223 901" })));
    await nemLoi("B thu tiền vào hóa đơn của A → không tìm thấy (không lặng lẽ thành công)", "khong-thay", () =>
      voi(TB, ktB, (nc) => thuTien(nc, LuocDoThuTien.parse({ khachHangId: khachB.id, phuongThuc: "tien-mat", soTien: "1000", phanBo: [{ hoaDonId: hd.id, soTien: "1000" }] }))),
    );
    await nemLoi("B lập hóa đơn từ đơn hàng của A → lỗi, không tạo gì", "dinh-dang", () => voi(TB, ktB, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: hd.don.id }))));
    const a = await chu.invoice.findUniqueOrThrow({ where: { id: hd.id }, select: { status: true } });
    const p = await chu.payment.findUniqueOrThrow({ where: { id: pt.id }, select: { status: true } });
    dat("Chứng từ của A nguyên vẹn", a.status === "ISSUED" && p.status === "hoat-dong" && (await daThu(hd.id)) === 100_000);
    dat("B không có hóa đơn nào", (await chu.invoice.count({ where: { tenantId: TB } })) === 0);
  }

  // ==================================================================
  console.log("\n— 9. Migration 20261014085000 trên dữ liệu đã trùng —");
  {
    const sql = readFileSync(join(__dirname, "../prisma/migrations/20261014085000_toan_ven_tai_chinh/migration.sql"), "utf8");
    const khoiKiem = sql.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
    const taoChiMuc = sql.match(/CREATE UNIQUE INDEX "invoices_mot_hieu_luc_moi_don"[\s\S]*?;/)?.[0];
    dat("Đọc được khối kiểm và lệnh tạo chỉ mục từ migration", !!khoiKiem && !!taoChiMuc);
    const hd = await hoaDon(1);
    const goc = await chu.invoice.findUniqueOrThrow({ where: { id: hd.id }, select: { customerId: true, ownerId: true, salesOrderId: true } });
    const ketQua: { thongBao?: string; changelog?: number; chiMucHong?: boolean; sachThi?: boolean } = {};
    class CuonNguoc extends Error {}
    try {
      await chu.$transaction(
        async (tx) => {
          // Dựng lại tình trạng "trước migration": bỏ chỉ mục, chèn hóa đơn trùng cho cùng đơn.
          await tx.$executeRawUnsafe(`DROP INDEX "invoices_mot_hieu_luc_moi_don"`);
          await tx.invoice.create({ data: { tenantId: T, number: `HD-QA-TRUNG-${DAU}`, customerId: goc.customerId, salesOrderId: goc.salesOrderId, ownerId: goc.ownerId } });
          const ds = await tx.$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM (SELECT sales_order_id, count(*) FROM invoices WHERE sales_order_id IS NOT NULL AND status <> 'CANCELLED' GROUP BY 1 HAVING count(*) > 1) t`,
          );
          ketQua.changelog = ds[0].n;
          await tx.$executeRawUnsafe("SAVEPOINT kiem");
          try {
            await tx.$executeRawUnsafe(khoiKiem!);
          } catch (e) {
            ketQua.thongBao = e instanceof Error ? e.message : String(e);
          }
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT kiem");
          try {
            await tx.$executeRawUnsafe(taoChiMuc!);
          } catch {
            ketQua.chiMucHong = true;
          }
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT kiem");
          // Hủy hóa đơn thừa (như CHANGELOG hướng dẫn) thì khối kiểm qua và chỉ mục tạo được.
          await tx.invoice.updateMany({ where: { number: `HD-QA-TRUNG-${DAU}`, tenantId: T }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Trùng" } });
          await tx.$executeRawUnsafe(khoiKiem!);
          await tx.$executeRawUnsafe(taoChiMuc!);
          ketQua.sachThi = true;
          throw new CuonNguoc();
        },
        { timeout: 20_000 },
      );
    } catch (e) {
      if (!(e instanceof CuonNguoc)) throw e;
    }
    dat("Câu kiểm trong CHANGELOG tìm ra đơn trùng", ketQua.changelog === 1, String(ketQua.changelog));
    dat("Migration dừng với thông báo rõ ràng, nêu số đơn trùng", !!ketQua.thongBao && ketQua.thongBao.includes("Có 1 đơn hàng và 0 đơn mua"), ketQua.thongBao ?? "");
    dat("Bỏ khối kiểm thì CREATE INDEX cũng không qua (chốt cuối đúng là chỉ mục duy nhất)", ketQua.chiMucHong === true);
    dat("Hủy hóa đơn thừa rồi chạy lại: qua kiểm và tạo được chỉ mục", ketQua.sachThi === true);
    const conChiMuc = await chu.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'invoices_mot_hieu_luc_moi_don'`);
    dat("Sau bài thử, chỉ mục thật vẫn còn (đã cuộn ngược)", conChiMuc[0].n === 1);
  }

  await chu.$disconnect();
  ketLuan("QA độc lập toàn vẹn tài chính và mua hàng");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
