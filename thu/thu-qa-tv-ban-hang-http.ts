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
import { chiTietDonHang, taoDonHang } from "../src/modules/don-hang/service";
import { LuocDoTaoDon } from "../src/modules/don-hang/luoc-do";
import { chotBaoGia, guiKhach, quyetDuyet, taoBaoGia, xinDuyet } from "../src/modules/bao-gia/service";
import { LuocDoTaoBaoGia } from "../src/modules/bao-gia/luoc-do";
import { taoHoaDon } from "../src/modules/tai-chinh/service";
import { LuocDoTaoHoaDon } from "../src/modules/tai-chinh/luoc-do";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA ĐỘC LẬP QUA HTTP — gói 0.16.1 "Toàn vẹn bán hàng–kho": mã trạng thái + câu tiếng Việt của
 * các API bị khóa chứng từ, yêu cầu đồng thời qua HTTP thật (không 500), và các trang đã sửa
 * dựng được. Chạy vào máy chủ ĐANG CHẠY (bản `next start`) dùng chung CSDL của .env:
 *   THU_URL=http://localhost:3317 npm run thu:qa-tv-ban-hang-http
 * Tự dựng người dùng thử trong doanh nghiệp `itw`. KHÔNG nằm trong `thu:tich-hop`.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}
const URL_GOC = (process.env.THU_URL ?? "http://localhost:3317").replace(/\/$/, "");
const HOST = new URL(URL_GOC).host;
const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const MAT_KHAU = "MatKhauQaBanHang2026!";

interface PhanHoi { status: number; json: Record<string, unknown>; text: string; cookies: Record<string, string> }
async function goi(duongDan: string, { phuongThuc = "GET", than, cookie }: { phuongThuc?: string; than?: unknown; cookie?: string | null } = {}): Promise<PhanHoi> {
  const headers: Record<string, string> = { "x-real-ip": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  if (than !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (phuongThuc !== "GET") headers.origin = `http://${HOST}`;
  const r = await fetch(`${URL_GOC}${duongDan}`, { method: phuongThuc, headers, body: than === undefined ? undefined : JSON.stringify(than), redirect: "manual" });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* HTML */ }
  const cookies: Record<string, string> = {};
  for (const c of r.headers.getSetCookie()) { const m = /^([^=]+)=([^;]*)/.exec(c); if (m) cookies[m[1]] = m[2]; }
  return { status: r.status, json, text, cookies };
}
const tb = (r: PhanHoi) => String(r.json.thongBao ?? "");
const coDau = (s: string) => /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i.test(s);

async function main() {
  console.log(`=== QA HTTP gói bán hàng–kho 0.16.1: ${URL_GOC} ===\n`);
  const T = (await chu.tenant.findUniqueOrThrow({ where: { code: "itw" } })).id;
  const roleId = (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code: "ceo" } } })).id;
  const u = await chu.user.create({
    data: { tenantId: T, email: `qa-bh.${DAU}@qa.test`, passwordHash: await bamMatKhau(MAT_KHAU), fullName: "QA bán hàng", userRoles: { create: { tenantId: T, roleId } }, staffProfile: { create: { tenantId: T } } },
  });
  const voi = <R,>(viec: (nc: NguCanh) => Promise<R>) =>
    voiTenant(T, async (tx) => viec(taoNguCanh(tx, T, (await layHoSoQuyen(tx, u.id))!, "127.0.0.1", "qa-http")), { timeoutMs: 20_000 });

  const dn = await goi("/api/dang-nhap", { phuongThuc: "POST", than: { maDoanhNghiep: "itw", email: u.email, matKhau: MAT_KHAU } });
  const ck = dn.cookies.cowork_phien ? `cowork_phien=${dn.cookies.cowork_phien}` : null;
  dat("Đăng nhập được", dn.status === 200 && Boolean(ck), `${dn.status} ${dn.text.slice(0, 200)}`);

  const khach = await voi((nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Http Delta ${DAU}`, dienThoai: "0913 579 246" })));
  const kho = await voi((nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: `qh-${DAU}`.slice(0, 20), ten: `Kho QA HTTP ${DAU}` })));
  const sp1 = await voi((nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `QH1-${DAU}`, ten: "Chuột HTTP", giaBan: "100000", giaVon: "60000", donViTinh: "cai" })));
  const sp2 = await voi((nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `QH2-${DAU}`, ten: "Phím HTTP", giaBan: "100000", giaVon: "60000", donViTinh: "cai" })));
  await voi((nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "QA HTTP", dong: [{ sanPhamId: sp1.id, soLuong: "500" }, { sanPhamId: sp2.id, soLuong: "500" }] })));
  const don = (ds: { id: string }[]) => voi((nc) => taoDonHang(nc, LuocDoTaoDon.parse({ khachHangId: khach.id, dong: ds.map((s) => ({ sanPhamId: s.id, ten: "Hàng HTTP", soLuong: "1", donGia: "100000" })) })));

  // ------------------------------------------------------------------
  console.log("— Đồng thời qua HTTP —");
  const d1 = await don([sp1]);
  const xn = await Promise.all(Array.from({ length: 5 }, () => goi(`/api/v1/don-hang/${d1.id}/xac-nhan`, { phuongThuc: "POST", than: { khoId: kho.id }, cookie: ck })));
  const ma = xn.map((r) => r.status).sort();
  dat("Xác nhận ×5 qua HTTP: một 200, bốn 409", JSON.stringify(ma) === JSON.stringify([200, 409, 409, 409, 409]), JSON.stringify(ma));
  const r409 = xn.find((r) => r.status === 409)!;
  dat("409 có câu tiếng Việt và mã sai-trang-thai", coDau(tb(r409)) && r409.json.ma === "sai-trang-thai", tb(r409));

  let co500 = 0;
  for (let i = 0; i < 6; i++) {
    const a = await don([sp1, sp2]);
    const b = await don([sp2, sp1]);
    const kq = await Promise.all([a, b].map((d) => goi(`/api/v1/don-hang/${d.id}/xac-nhan`, { phuongThuc: "POST", than: { khoId: kho.id }, cookie: ck })));
    co500 += kq.filter((r) => r.status >= 500).length;
  }
  dat("Hai đơn dòng hàng ngược thứ tự xác nhận cùng lúc (×6): không có 500", co500 === 0, String(co500));

  // ------------------------------------------------------------------
  console.log("\n— Mã lỗi nghiệp vụ —");
  const [l1] = (await voi((nc) => chiTietDonHang(nc, d1.id))).don.dong;
  const trung = await goi(`/api/v1/don-hang/${d1.id}/phieu-xuat`, { phuongThuc: "POST", than: { khoId: kho.id, dong: [{ dongDonId: l1.id, soLuong: "1" }, { dongDonId: l1.id, soLuong: "1" }] }, cookie: ck });
  dat("Phiếu xuất lặp dòng → 400 tiếng Việt", trung.status === 400 && JSON.stringify(trung.json).includes("chỉ xuất hiện một lần"), `${trung.status} ${trung.text.slice(0, 200)}`);

  const hd = await voi((nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: d1.id })));
  const huy = await goi(`/api/v1/don-hang/${d1.id}/huy`, { phuongThuc: "POST", than: { lyDo: "Khách đổi ý" }, cookie: ck });
  dat("Hủy đơn còn hóa đơn → 409 con-hoa-don, nêu số hóa đơn", huy.status === 409 && huy.json.ma === "con-hoa-don" && tb(huy).includes(hd.so), `${huy.status} ${tb(huy)}`);

  const bg = await voi((nc) => taoBaoGia(nc, LuocDoTaoBaoGia.parse({ khachHangId: khach.id, dong: [{ sanPhamId: sp1.id, ten: "Chuột HTTP", soLuong: "2", donGia: "100.000", vat: 10, giaVon: "60.000" }] })));
  await voi((nc) => xinDuyet(nc, bg.id, null)).catch(() => undefined);
  await voi((nc) => quyetDuyet(nc, bg.id, { quyetDinh: "cho-duyet", ghiChu: null })).catch(() => undefined);
  await voi((nc) => guiKhach(nc, bg.id, { kenh: "email", ghiChu: null }));
  await voi((nc) => chotBaoGia(nc, bg.id, { ketQua: "ACCEPTED", ghiChu: null }));
  const tdb = await Promise.all(Array.from({ length: 3 }, () => goi("/api/v1/don-hang/tu-bao-gia", { phuongThuc: "POST", than: { baoGiaId: bg.id }, cookie: ck })));
  dat("Tạo đơn từ báo giá ×3 qua HTTP: đều 200, cùng một đơn", tdb.every((r) => r.status === 200) && new Set(tdb.map((r) => r.json.id)).size === 1, tdb.map((r) => `${r.status}:${String(r.json.id ?? tb(r))}`).join(" "));
  const pb = await goi(`/api/v1/bao-gia/${bg.id}/phien-ban`, { phuongThuc: "POST", cookie: ck });
  dat("Ra phiên bản mới khi đã có đơn → 409 bao-gia-da-co-don", pb.status === 409 && pb.json.ma === "bao-gia-da-co-don" && coDau(tb(pb)), `${pb.status} ${tb(pb)}`);

  const traLe = await goi("/api/v1/tra-hang-ban", { phuongThuc: "POST", than: { khachHangId: khach.id, khoId: kho.id, lyDo: "Trả lẻ", dong: [{ sanPhamId: sp1.id, ten: "Chuột", soLuong: "1", donGia: "100000" }] }, cookie: ck });
  dat("Trả hàng không theo đơn → 400, lỗi ở trường donHangId", traLe.status === 400 && JSON.stringify(traLe.json.loiTruong ?? {}).includes("donHangId"), `${traLe.status} ${traLe.text.slice(0, 200)}`);

  const khongCo = await goi(`/api/v1/don-hang/00000000-0000-4000-8000-000000000000/xac-nhan`, { phuongThuc: "POST", than: { khoId: kho.id }, cookie: ck });
  dat("Đơn không tồn tại → 404 tiếng Việt", khongCo.status === 404 && coDau(tb(khongCo)), `${khongCo.status} ${tb(khongCo)}`);
  const sai = await goi(`/api/v1/don-hang/abc/huy`, { phuongThuc: "POST", than: { lyDo: "x x" }, cookie: ck });
  dat("Mã đơn không phải UUID → 404, không 500", sai.status === 404, String(sai.status));

  // ------------------------------------------------------------------
  console.log("\n— Trang đã sửa dựng được —");
  const donTuBg = String(tdb[0].json.id);
  for (const [ten, duong] of [
    ["Chi tiết đơn hàng", `/ban-hang/don-hang/${d1.id}`],
    ["Chi tiết đơn từ báo giá", `/ban-hang/don-hang/${donTuBg}`],
    ["Chi tiết báo giá", `/ban-hang/bao-gia/${bg.id}`],
    ["Lập phiếu khách trả (không đơn → hướng dẫn)", "/tra-hang/khach-tra/moi"],
    ["Lập phiếu khách trả theo đơn", `/tra-hang/khach-tra/moi?don=${d1.id}`],
  ] as const) {
    const r = await goi(duong, { cookie: ck });
    dat(`${ten}: 200`, r.status === 200 && !r.text.includes("Application error"), String(r.status));
    if (duong === "/tra-hang/khach-tra/moi") dat("Trang trả hàng không đơn hiện hướng dẫn theo đơn", r.text.includes("Trả hàng phải theo một đơn đã giao"));
  }

  await chu.$disconnect();
  ketLuan("QA HTTP bán hàng–kho 0.16.1");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
