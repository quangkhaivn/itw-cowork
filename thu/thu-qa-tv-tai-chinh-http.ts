/**
 * QA 0.16.1 qua HTTP — các route tài chính / mua hàng trên một máy chủ ĐANG CHẠY: mã lỗi,
 * thông báo tiếng Việt, phân quyền không đổi, và đua hai yêu cầu HTTP thật cùng lúc.
 *
 * Chạy (máy phát triển, bản `next start` trỏ cùng CSDL trong .env):
 *   THU_URL=http://localhost:3024 npm run thu:qa-tv-tai-chinh-http
 * Dựng dữ liệu bằng service trong tiến trình (tenant "itw"), rồi gọi API như trình duyệt.
 */
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen } from "../src/lib/phan-quyen";
import { bamMatKhau } from "../src/lib/xac-thuc";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { nhapKho, taoKho } from "../src/modules/kho/service";
import { LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { taoDonHang, xacNhanDon } from "../src/modules/don-hang/service";
import { LuocDoTaoDon } from "../src/modules/don-hang/luoc-do";
import { phatHanhHoaDon, taoHoaDon } from "../src/modules/tai-chinh/service";
import { LuocDoPhatHanh, LuocDoTaoHoaDon } from "../src/modules/tai-chinh/luoc-do";
import { LuocDoTaoNhaCungCap, taoNhaCungCap } from "../src/modules/nha-cung-cap/service";
import { guiDonMua, taoDonMua } from "../src/modules/mua-hang/service";
import { LuocDoTaoDonMua } from "../src/modules/mua-hang/luoc-do";
import { taoHoaDonMua } from "../src/modules/cong-no-tra/service";
import { LuocDoTaoHoaDonMua } from "../src/modules/cong-no-tra/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const URL_GOC = (process.env.THU_URL ?? "http://localhost:3024").replace(/\/$/, "");
const HOST = new URL(URL_GOC).host;
const DAU = Date.now().toString(36);
const MAT_KHAU = `Qa-TvTc-${DAU}-mat-khau!`;
const chu = clientChuSoHuu();

interface PhanHoi {
  status: number;
  json: Record<string, unknown>;
}
async function goi(duongDan: string, { phuongThuc = "GET", than, cookie, ip = "10.77.0.1" }: { phuongThuc?: string; than?: unknown; cookie?: string | null; ip?: string } = {}): Promise<PhanHoi & { cookie: string | null }> {
  const headers: Record<string, string> = { "x-real-ip": ip };
  if (than !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (phuongThuc !== "GET") headers.origin = `http://${HOST}`;
  const r = await fetch(`${URL_GOC}${duongDan}`, { method: phuongThuc, headers, body: than === undefined ? undefined : JSON.stringify(than), redirect: "manual" });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // HTML
  }
  const phien = r.headers.getSetCookie().map((c) => /^cowork_phien=([^;]*)/.exec(c)?.[1]).find(Boolean);
  return { status: r.status, json, cookie: phien ? `cowork_phien=${phien}` : null };
}
const tb = (r: PhanHoi) => String(r.json.thongBao ?? "");
const coDau = (s: string) => /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i.test(s);

async function main() {
  console.log("=== QA 0.16.1 qua HTTP ===\n");
  const T = (await chu.tenant.findUniqueOrThrow({ where: { code: "itw" } })).id;
  const hash = await bamMatKhau(MAT_KHAU);
  const nguoi = async (ten: string, vai: string) => {
    const role = await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code: vai } } });
    return (
      await chu.user.create({
        data: {
          tenantId: T, email: `${ten}.${DAU}@qa.test`, passwordHash: hash, fullName: ten,
          userRoles: { create: { tenantId: T, roleId: role.id } }, staffProfile: { create: { tenantId: T } },
        },
      })
    ).id;
  };
  const gd = await nguoi("qah-giam-doc", "ceo");
  const kt = await nguoi("qah-ke-toan", "finance");
  const tpkd = await nguoi("qah-tpkd", "sales-manager");
  await nguoi("qah-sale", "sales");
  const mh = await nguoi("qah-mua-hang", "purchasing");
  const thukho = await nguoi("qah-thu-kho", "warehouse");
  const voi = <X>(u: string, f: (nc: NguCanh) => Promise<X>) =>
    voiTenant(T, async (tx) => f(taoNguCanh(tx, T, (await layHoSoQuyen(tx, u))!, "127.0.0.1", "qa-http")));

  const khach = await voi(tpkd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `DEMO QA HTTP ${DAU}`, dienThoai: "0909 323 001" })));
  const kho = await voi(gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: `qah-${DAU}`.slice(0, 20), ten: `DEMO kho QA HTTP ${DAU}` })));
  const sp = await voi(gd, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `QAH-${DAU}`, ten: "DEMO Chuột QA", giaBan: "1000000", giaVon: "600000", donViTinh: "cai" })));
  await voi(thukho, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "DEMO nhập QA HTTP", dong: [{ sanPhamId: sp.id, soLuong: "50", giaVon: "600000" }] })));
  const donXacNhan = async () => {
    const don = await voi(tpkd, (nc) => taoDonHang(nc, LuocDoTaoDon.parse({ khachHangId: khach.id, dong: [{ sanPhamId: sp.id, ten: "DEMO Chuột QA", soLuong: "1", donGia: "1000000", vat: 10, giaVon: "600000" }] })));
    await voi(tpkd, (nc) => xacNhanDon(nc, don.id, { khoId: kho.id, ghiChu: null }));
    return don;
  };

  const dangNhap = async (ten: string, ip: string) => {
    const r = await goi("/api/dang-nhap", { phuongThuc: "POST", than: { maDoanhNghiep: "itw", email: `${ten}.${DAU}@qa.test`, matKhau: MAT_KHAU }, ip });
    if (!r.cookie) throw new Error(`Không đăng nhập được ${ten}: ${r.status} ${JSON.stringify(r.json)}`);
    return r.cookie;
  };
  const cKt = await dangNhap("qah-ke-toan", "10.77.1.1");
  const cSale = await dangNhap("qah-sale", "10.77.1.2");
  const cMh = await dangNhap("qah-mua-hang", "10.77.1.3");

  console.log("— Lập hóa đơn từ một đơn, 3 yêu cầu HTTP cùng lúc —");
  const don = await donXacNhan();
  const lap = await Promise.all([1, 2, 3].map(() => goi("/api/v1/hoa-don", { phuongThuc: "POST", than: { donHangId: don.id }, cookie: cKt })));
  dat("Cả 3 trả 200", lap.every((r) => r.status === 200), lap.map((r) => r.status).join(","));
  dat("Cùng một hóa đơn, đúng một lần daCoTruoc = false", new Set(lap.map((r) => r.json.id)).size === 1 && lap.filter((r) => r.json.daCoTruoc === false).length === 1, JSON.stringify(lap.map((r) => r.json)));
  const hdId = String(lap[0].json.id);
  await voi(kt, (nc) => phatHanhHoaDon(nc, hdId, LuocDoPhatHanh.parse({ hanThanhToan: congNgay(homNayVN(), 30) })));

  console.log("\n— Thu tiền —");
  const thanThu = (soTien: string, phanBo = [{ hoaDonId: hdId, soTien }]) => ({ khachHangId: khach.id, phuongThuc: "chuyen-khoan", soTien, phanBo });
  const r403 = await goi("/api/v1/phieu-thu", { phuongThuc: "POST", than: thanThu("1.100.000"), cookie: cSale });
  dat("Nhân viên kinh doanh ghi phiếu thu → 403 (phân quyền không đổi)", r403.status === 403 && tb(r403).includes("không có quyền"), `${r403.status} ${tb(r403)}`);
  const r0 = await goi("/api/v1/phieu-thu", { phuongThuc: "POST", than: { ...thanThu("1.000"), phanBo: [{ hoaDonId: hdId, soTien: "500" }, { hoaDonId: hdId, soTien: "500" }] }, cookie: cKt });
  dat("Một hóa đơn hai dòng trong phiếu → 400 kèm lỗi trường phanBo", r0.status === 400 && !!(r0.json.loiTruong as Record<string, unknown>)?.phanBo, `${r0.status} ${JSON.stringify(r0.json)}`);
  const hd2 = await voi(kt, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ khachHangId: khach.id, dong: [{ ten: "DEMO phí lắp", soLuong: "1", donGia: "100000" }] })));
  await voi(kt, (nc) => phatHanhHoaDon(nc, hd2.id, LuocDoPhatHanh.parse({ hanThanhToan: congNgay(homNayVN(), 30) })));
  const rLe = await goi("/api/v1/phieu-thu", { phuongThuc: "POST", than: thanThu("1", [{ hoaDonId: hdId, soTien: "0,4" }, { hoaDonId: hd2.id, soTien: "0,6" }]), cookie: cKt });
  dat("Dòng phân bổ 0,4 ₫ → 400 tiếng Việt, không phải 500", rLe.status === 400 && coDau(tb(rLe)), `${rLe.status} ${tb(rLe)}`);
  const dua = await Promise.all([1, 2].map(() => goi("/api/v1/phieu-thu", { phuongThuc: "POST", than: thanThu("1.100.000"), cookie: cKt })));
  const ma = dua.map((r) => r.status).sort();
  dat("Hai phiếu thu đủ tiền cùng lúc qua HTTP: 200 và 409", ma[0] === 200 && ma[1] === 409, ma.join(","));
  const thua = dua.find((r) => r.status === 409);
  dat("409 mang mã thu-vuot-cong-no và thông báo tiếng Việt", thua?.json.ma === "thu-vuot-cong-no" && coDau(tb(thua!)), JSON.stringify(thua?.json));
  const ptId = String(dua.find((r) => r.status === 200)!.json.id);

  const rHuyHd = await goi(`/api/v1/hoa-don/${hdId}/huy`, { phuongThuc: "POST", than: { lyDo: "Thử hủy" }, cookie: cKt });
  dat("Hủy hóa đơn đã thu → 409 da-co-tien-thu", rHuyHd.status === 409 && rHuyHd.json.ma === "da-co-tien-thu" && tb(rHuyHd).includes("hủy phiếu thu trước"), `${rHuyHd.status} ${tb(rHuyHd)}`);
  const huy2 = await Promise.all([1, 2].map(() => goi(`/api/v1/phieu-thu/${ptId}/huy`, { phuongThuc: "POST", than: { lyDo: "Ghi nhầm" }, cookie: cKt })));
  dat("Hủy phiếu thu hai lần cùng lúc qua HTTP: 200 và 409 da-huy", huy2.map((r) => r.status).sort().join(",") === "200,409" && huy2.some((r) => r.json.ma === "da-huy"), JSON.stringify(huy2.map((r) => [r.status, r.json.ma])));
  const rSaiId = await goi("/api/v1/hoa-don/khong-phai-uuid/huy", { phuongThuc: "POST", than: { lyDo: "x x" }, cookie: cKt });
  dat("id không phải UUID → 404, không 500", rSaiId.status === 404, String(rSaiId.status));
  const rLyDo = await goi(`/api/v1/hoa-don/${hdId}/huy`, { phuongThuc: "POST", than: { lyDo: "" }, cookie: cKt });
  dat("Hủy hóa đơn không lý do → 400", rLyDo.status === 400, String(rLyDo.status));

  console.log("\n— Mua hàng —");
  const ncc = await voi(mh, (nc) => taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `DEMO NCC QA HTTP ${DAU}`, dienThoai: "0909 323 101" })));
  const dm = await voi(mh, (nc) => taoDonMua(nc, LuocDoTaoDonMua.parse({ nhaCungCapId: ncc.id, khoId: kho.id, dong: [{ sanPhamId: sp.id, ten: "DEMO Chuột QA", soLuong: "1", donGia: "600000" }] })));
  await voi(mh, (nc) => guiDonMua(nc, dm.id));
  const hm = await voi(kt, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id })));
  const ctDm = await goi(`/api/v1/don-mua/${dm.id}`, { cookie: cMh });
  dat("Chi tiết đơn mua còn hóa đơn NCC: quyen.huy = false", ctDm.status === 200 && (ctDm.json.quyen as Record<string, boolean>)?.huy === false, JSON.stringify(ctDm.json.quyen));
  const rHuyDm = await goi(`/api/v1/don-mua/${dm.id}/huy`, { phuongThuc: "POST", than: { lyDo: "Đổi nhà cung cấp" }, cookie: cMh });
  dat("Hủy đơn mua còn hóa đơn NCC → 409 da-co-hoa-don-ncc, nêu số hóa đơn", rHuyDm.status === 409 && rHuyDm.json.ma === "da-co-hoa-don-ncc" && tb(rHuyDm).includes(hm.so), `${rHuyDm.status} ${tb(rHuyDm)}`);
  const rMh403 = await goi(`/api/v1/hoa-don-mua/${hm.id}/huy`, { phuongThuc: "POST", than: { lyDo: "Thử" }, cookie: cMh });
  dat("Mua hàng không hủy được hóa đơn NCC (cần finance.approve) → 403", rMh403.status === 403, String(rMh403.status));
  const rHuyHm = await goi(`/api/v1/hoa-don-mua/${hm.id}/huy`, { phuongThuc: "POST", than: { lyDo: "NCC xuất lại" }, cookie: cKt });
  dat("Kế toán hủy hóa đơn NCC → 200", rHuyHm.status === 200, `${rHuyHm.status} ${tb(rHuyHm)}`);
  const rHuyDm2 = await goi(`/api/v1/don-mua/${dm.id}/huy`, { phuongThuc: "POST", than: { lyDo: "Đổi nhà cung cấp" }, cookie: cMh });
  dat("Rồi hủy đơn mua → 200", rHuyDm2.status === 200 && rHuyDm2.json.trangThai === "CANCELLED", `${rHuyDm2.status} ${JSON.stringify(rHuyDm2.json)}`);

  await chu.$disconnect();
  ketLuan("QA 0.16.1 qua HTTP");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
