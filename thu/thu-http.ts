/**
 * Kiểm thử đầu-cuối qua HTTP trên một máy chủ ĐANG CHẠY:
 *   giao diện → API → cơ sở dữ liệu → quyền → nhật ký.
 *
 * Đi đúng đường người dùng đi: đăng nhập bằng cookie, bị bắt đổi mật khẩu, tạo người
 * dùng, bị từ chối quyền, bị khóa vì sai mật khẩu, được mở khóa, đăng xuất.
 *
 * Chạy (máy phát triển):
 *   THU_URL=http://localhost:3300 THU_EMAIL=... THU_MAT_KHAU=... npm run thu:http
 * THU_EMAIL / THU_MAT_KHAU là tài khoản quản trị (ceo/admin) của tenant "itw" TRÊN MÁY PHÁT TRIỂN.
 * Bài thử tạo thêm người dùng thử — không chạy trên máy chủ thật.
 */

import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";

const URL_GOC = (process.env.THU_URL ?? "http://localhost:3300").replace(/\/$/, "");
const MA_DN = process.env.THU_MA_DN ?? "itw";
const EMAIL_QT = process.env.THU_EMAIL;
let MAT_KHAU_QT = process.env.THU_MAT_KHAU ?? "";
if (!EMAIL_QT || !MAT_KHAU_QT) {
  console.error("Thiếu THU_EMAIL / THU_MAT_KHAU.");
  process.exit(1);
}
const IP_THU = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const DAU = Date.now().toString(36);
const HOST = new URL(URL_GOC).host;

let soDat = 0;
let soHong = 0;
function dat(ten: string, dk: boolean, chiTiet = "") {
  if (dk) {
    soDat++;
    console.log(`  ✓ ${ten}`);
  } else {
    soHong++;
    console.log(`  ❌ HỎNG: ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
  }
}

interface PhanHoi {
  status: number;
  json: Record<string, unknown>;
  text: string;
  cookie: string | null;
  location: string | null;
}

async function goi(
  duongDan: string,
  { phuongThuc = "GET", than, cookie, origin = `http://${HOST}` }: { phuongThuc?: string; than?: unknown; cookie?: string | null; origin?: string | null } = {},
): Promise<PhanHoi> {
  const headers: Record<string, string> = { "x-real-ip": IP_THU };
  if (than !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (origin && phuongThuc !== "GET") headers.origin = origin;
  const r = await fetch(`${URL_GOC}${duongDan}`, {
    method: phuongThuc,
    headers,
    body: than === undefined ? undefined : JSON.stringify(than),
    redirect: "manual",
  });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // trang HTML
  }
  const datCookie = r.headers.get("set-cookie");
  const phien = datCookie?.match(/cowork_phien=([^;]*)/)?.[1];
  return {
    status: r.status,
    json,
    text,
    cookie: phien === undefined ? null : phien ? `cowork_phien=${phien}` : "",
    location: r.headers.get("location"),
  };
}

async function dangNhap(email: string, matKhau: string) {
  return goi("/api/dang-nhap", { phuongThuc: "POST", than: { maDoanhNghiep: MA_DN, email, matKhau } });
}

async function main() {
  console.log(`=== Thử HTTP đầu-cuối: ${URL_GOC} ===\n`);

  // --- 1. Công khai ---
  const khoe = await goi("/api/khoe");
  dat("Kiểm tra sức khỏe trả 200 và không lộ chi tiết", khoe.status === 200 && !("chiTiet" in khoe.json));
  const trangDn = await goi("/dang-nhap");
  dat("Trang đăng nhập mở được", trangDn.status === 200 && trangDn.text.includes("TGTH Business Cowork"));
  const chuaDn = await goi("/quan-tri/nguoi-dung");
  dat("Chưa đăng nhập vào trang quản trị bị đẩy về /dang-nhap", chuaDn.status === 307 && Boolean(chuaDn.location?.includes("/dang-nhap")));
  const apiChuaDn = await goi("/api/v1/nguoi-dung");
  dat("Chưa đăng nhập gọi API bị 401", apiChuaDn.status === 401);
  const tieuDe = await fetch(`${URL_GOC}/dang-nhap`);
  dat(
    "Có header chống nhúng khung (CSP frame-ancestors) và chống đoán kiểu",
    (tieuDe.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'") &&
      (tieuDe.headers.get("x-content-type-options") ?? "").includes("nosniff"),
  );

  // --- 2. Đăng nhập quản trị (có thể đang bị bắt đổi mật khẩu) ---
  const dn = await dangNhap(EMAIL_QT!, MAT_KHAU_QT);
  dat("Quản trị đăng nhập được", dn.status === 200 && Boolean(dn.cookie), `status ${dn.status} ${JSON.stringify(dn.json)}`);
  let cookieQT = dn.cookie;
  if (dn.json.chuyenDen === "/doi-mat-khau") {
    const biChan = await goi("/api/v1/nguoi-dung", { cookie: cookieQT });
    dat("Đang bị bắt đổi mật khẩu thì API nghiệp vụ trả 403", biChan.status === 403 && biChan.json.ma === "phai-doi-mat-khau");
    const trangBiChan = await goi("/bang-dieu-khien", { cookie: cookieQT });
    dat("Đang bị bắt đổi mật khẩu thì trang bị đẩy sang /doi-mat-khau", trangBiChan.status === 307 && Boolean(trangBiChan.location?.includes("/doi-mat-khau")));
    const moi = `${MAT_KHAU_QT}-Moi1`;
    const doi = await goi("/api/v1/tai-khoan/doi-mat-khau", {
      phuongThuc: "POST",
      cookie: cookieQT,
      than: { matKhauHienTai: MAT_KHAU_QT, matKhauMoi: moi, nhapLai: moi },
    });
    dat("Đổi mật khẩu lần đầu thành công và nhận cookie mới", doi.status === 200 && Boolean(doi.cookie), JSON.stringify(doi.json));
    const cookieCu = cookieQT;
    cookieQT = doi.cookie;
    MAT_KHAU_QT = moi;
    console.log(`  (mật khẩu quản trị cục bộ đã đổi thành: <mật khẩu cũ>-Moi1)`);
    const phienCu = await goi("/api/v1/nguoi-dung", { cookie: cookieCu });
    dat("Phiên ký TRƯỚC khi đổi mật khẩu bị vô hiệu", phienCu.status === 401);
  }

  // --- 3. Mọi trang quản trị dựng được, không lỗi ---
  const cacTrang: [string, string][] = [
    ["/bang-dieu-khien", "Xin chào"],
    ["/quan-tri/nguoi-dung", "Người dùng"],
    ["/quan-tri/nguoi-dung/moi", "Thêm người dùng"],
    ["/quan-tri/vai-tro", "Vai trò &amp; quyền"],
    ["/quan-tri/phong-ban", "Phòng ban"],
    ["/quan-tri/du-lieu-goc", "Dữ liệu gốc"],
    ["/quan-tri/du-lieu-goc?loai=nguon_lead", "Nguồn lead"],
    ["/quan-tri/cau-hinh", "Ngưỡng biên lợi nhuận"],
    ["/quan-tri/nhat-ky-kiem-toan", "Nhật ký kiểm toán"],
    ["/tai-khoan", "Quyền của tôi"],
    ["/doi-mat-khau", "Đổi mật khẩu"],
  ];
  for (const [duong, chu] of cacTrang) {
    const r = await goi(duong, { cookie: cookieQT });
    dat(`Trang ${duong} trả 200 và có nội dung`, r.status === 200 && r.text.includes(chu) && !r.text.includes("Không hiển thị được trang này"), `status ${r.status}`);
  }

  // --- 4. Chống CSRF ---
  const khongOrigin = await goi("/api/v1/phong-ban", { phuongThuc: "POST", cookie: cookieQT, origin: null, than: { ma: `csrf-${DAU}`, ten: "CSRF" } });
  dat("POST thiếu Origin bị chặn 403", khongOrigin.status === 403);
  const originLa = await goi("/api/v1/phong-ban", { phuongThuc: "POST", cookie: cookieQT, origin: "https://ke-gian.example", than: { ma: `csrf-${DAU}`, ten: "CSRF" } });
  dat("POST từ trang khác bị chặn 403", originLa.status === 403);

  // --- 5. Tạo phòng ban, người dùng qua API ---
  const pb = await goi("/api/v1/phong-ban", { phuongThuc: "POST", cookie: cookieQT, than: { ma: `http-${DAU}`, ten: `Phòng thử HTTP ${DAU}` } });
  dat("Tạo phòng ban qua API", pb.status === 200 && typeof pb.json.id === "string", JSON.stringify(pb.json));
  const dsVaiTro = await goi("/api/v1/vai-tro", { cookie: cookieQT });
  const vaiTroSales = (dsVaiTro.json as unknown as { id: string; ma: string }[]).find?.((v) => v.ma === "sales");
  dat("Đọc được danh sách vai trò", Boolean(vaiTroSales));

  const loiNhap = await goi("/api/v1/nguoi-dung", { phuongThuc: "POST", cookie: cookieQT, than: { email: "khong-phai-email", hoTen: "A" } });
  dat("Dữ liệu sai trả 400 kèm lỗi từng trường", loiNhap.status === 400 && typeof loiNhap.json.loiTruong === "object");

  const emailNv = `nv-http-${DAU}@thu.test`;
  const matKhauNv = `NhanVien-${DAU}-9`;
  const taoNv = await goi("/api/v1/nguoi-dung", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: {
      email: emailNv,
      hoTen: "Nhân viên thử HTTP",
      phongBanId: pb.json.id,
      vaiTroIds: [vaiTroSales?.id],
      matKhauKhoiTao: matKhauNv,
      batDoiMatKhau: false,
    },
  });
  dat("Tạo nhân viên kinh doanh qua API", taoNv.status === 200, JSON.stringify(taoNv.json));
  const idNv = taoNv.json.id as string;

  const trung = await goi("/api/v1/nguoi-dung", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { email: emailNv, hoTen: "Trùng", vaiTroIds: [], matKhauKhoiTao: "TrungLap-2026x", batDoiMatKhau: true },
  });
  dat("Email trùng trả 409", trung.status === 409);

  // --- 5b. Người mới bị bắt đổi mật khẩu; đổi xong thì phiên cũ mất hiệu lực ---
  const emailMoi = `moi-http-${DAU}@thu.test`;
  const mkTam = `TamThoi-${DAU}-7`;
  await goi("/api/v1/nguoi-dung", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { email: emailMoi, hoTen: "Người mới thử HTTP", vaiTroIds: [vaiTroSales?.id], matKhauKhoiTao: mkTam, batDoiMatKhau: true },
  });
  const dnMoi = await dangNhap(emailMoi, mkTam);
  dat("Người mới đăng nhập được, nhận lệnh chuyển sang /doi-mat-khau", dnMoi.status === 200 && dnMoi.json.chuyenDen === "/doi-mat-khau");
  const moiBiChan = await goi("/api/v1/tim-kiem?q=ab", { cookie: dnMoi.cookie });
  dat("Chưa đổi mật khẩu thì API nghiệp vụ trả 403", moiBiChan.status === 403 && moiBiChan.json.ma === "phai-doi-mat-khau");
  const mkMoi = `CuaRieng-${DAU}-8`;
  const doiMoi = await goi("/api/v1/tai-khoan/doi-mat-khau", {
    phuongThuc: "POST",
    cookie: dnMoi.cookie,
    than: { matKhauHienTai: mkTam, matKhauMoi: mkMoi, nhapLai: mkMoi },
  });
  dat("Người mới đổi mật khẩu thành công", doiMoi.status === 200 && Boolean(doiMoi.cookie));
  dat("Phiên ký TRƯỚC khi đổi mật khẩu bị vô hiệu ngay (cùng giây)", (await goi("/api/v1/tim-kiem?q=ab", { cookie: dnMoi.cookie })).status === 401);
  dat("Phiên mới cấp sau khi đổi dùng được", (await goi("/api/v1/tim-kiem?q=ab", { cookie: doiMoi.cookie })).status === 200);

  // --- 6. Nhân viên kinh doanh bị chặn ở màn hình quản trị ---
  const dnNv = await dangNhap(emailNv, matKhauNv);
  dat("Nhân viên đăng nhập được", dnNv.status === 200 && dnNv.json.chuyenDen === "/bang-dieu-khien");
  const nvGoiApi = await goi("/api/v1/nguoi-dung", { cookie: dnNv.cookie });
  dat("Nhân viên gọi API danh sách người dùng bị 403", nvGoiApi.status === 403);
  const nvMoTrang = await goi("/quan-tri/nguoi-dung", { cookie: dnNv.cookie });
  // Có loading.tsx nên Next dựng trang theo luồng: chuyển hướng có thể là 307, hoặc 200 kèm
  // lệnh NEXT_REDIRECT cho trình duyệt. Điều bắt buộc: có chuyển hướng và KHÔNG lộ nội dung bảng.
  const chuyenHuong =
    (nvMoTrang.status === 307 && Boolean(nvMoTrang.location?.includes("/khong-co-quyen"))) ||
    (nvMoTrang.status === 200 && nvMoTrang.text.includes("NEXT_REDIRECT;replace;/khong-co-quyen"));
  dat("Nhân viên mở trang quản trị bị chuyển sang /khong-co-quyen, không lộ dữ liệu", chuyenHuong && !nvMoTrang.text.includes("Phòng ban · chức danh"));
  const nvBang = await goi("/bang-dieu-khien", { cookie: dnNv.cookie });
  dat("Menu của nhân viên không có mục Quản trị", nvBang.status === 200 && !nvBang.text.includes('href="/quan-tri/nguoi-dung"'));
  const nvSuaVaiTro = await goi(`/api/v1/nguoi-dung/${idNv}`, { phuongThuc: "PATCH", cookie: dnNv.cookie, than: { vaiTroIds: [] } });
  dat("Nhân viên tự sửa vai trò của mình bị 403", nvSuaVaiTro.status === 403);
  const vetTuChoi = await goi(`/api/v1/nhat-ky-kiem-toan?hanhDong=tu-choi-quyen&nguoi=${encodeURIComponent(emailNv)}`, { cookie: cookieQT });
  dat("Các lần bị từ chối đã vào Nhật ký kiểm toán", Number(vetTuChoi.json.tong) >= 3, `tong=${vetTuChoi.json.tong}`);

  // --- 7. Tìm kiếm toàn cục theo quyền ---
  const timQt = await goi(`/api/v1/tim-kiem?q=${encodeURIComponent("thử HTTP")}`, { cookie: cookieQT });
  const kqQt = (timQt.json.ketQua as { loai: string }[]) ?? [];
  dat("Quản trị tìm thấy người dùng và phòng ban", kqQt.some((k) => k.loai === "nguoi-dung") && kqQt.some((k) => k.loai === "phong-ban"));
  const timNv = await goi(`/api/v1/tim-kiem?q=${encodeURIComponent("thử HTTP")}`, { cookie: dnNv.cookie });
  const kqNv = (timNv.json.ketQua as { loai: string }[]) ?? [];
  dat("Nhân viên tìm cùng từ khóa KHÔNG thấy người dùng khác", timNv.status === 200 && !kqNv.some((k) => k.loai === "nguoi-dung"));

  // --- 7b. CRM (Phase 2): trang, API, chống trùng, chuyển đổi, phạm vi, CSRF ---
  const cacTrangCrm: [string, string][] = [
    ["/crm/khach-hang", "Khách hàng"],
    ["/crm/khach-hang/moi", "Thêm khách hàng"],
    ["/crm/lead", "Lead"],
    ["/crm/lead/moi", "Thêm lead"],
    ["/ban-hang/pipeline", "Pipeline"],
    ["/ban-hang/co-hoi", "Cơ hội"],
    ["/ban-hang/co-hoi/moi", "Tạo cơ hội"],
    ["/cong-viec", "Công việc"],
  ];
  for (const [duong, chu] of cacTrangCrm) {
    const r = await goi(duong, { cookie: cookieQT });
    dat(`Trang ${duong} trả 200 và có nội dung`, r.status === 200 && r.text.includes(chu) && !r.text.includes("Không hiển thị được trang này"), `status ${r.status}`);
  }
  const bangQt = await goi("/bang-dieu-khien", { cookie: cookieQT });
  dat("Menu có nhóm CRM, Bán hàng và nút + Tạo mới", bangQt.text.includes('href="/crm/khach-hang"') && bangQt.text.includes('href="/ban-hang/pipeline"') && bangQt.text.includes("Tạo mới"));

  const mst = `05${String(Date.now()).slice(-8)}`;
  const tenKhach = `Công ty TNHH Thử HTTP ${DAU}`;
  // Mỗi lần chạy một số máy bàn riêng — CSDL phát triển giữ khách của các lần chạy trước, và luật chống trùng (KH-03) sẽ bắt số cũ.
  const soMayBan = `028${String(Date.now()).slice(-8)}`;
  const taoKh = await goi("/api/v1/khach-hang", { phuongThuc: "POST", cookie: cookieQT, than: { ten: tenKhach, maSoThue: mst, dienThoai: soMayBan, xacNhanKhongTrung: true } });
  dat("Tạo khách hàng qua API", taoKh.status === 200 && /^KH-\d{6}$/.test(String(taoKh.json.ma)), JSON.stringify(taoKh.json));
  const idKh = taoKh.json.id as string;
  const trungMst = await goi("/api/v1/khach-hang", { phuongThuc: "POST", cookie: cookieQT, than: { ten: "Tên khác", maSoThue: `${mst.slice(0, 4)} ${mst.slice(4)}`, xacNhanKhongTrung: true } });
  dat("Trùng mã số thuế (viết khác) trả 409 kèm khách cũ", trungMst.status === 409 && trungMst.json.ma === "trung-ma-so-thue" && JSON.stringify(trungMst.json.chiTiet).includes(idKh));
  const doTrung = await goi(`/api/v1/khach-hang/do-trung?dienThoai=${soMayBan}`, { cookie: cookieQT });
  dat("API dò trùng tìm ra khách theo điện thoại", ((doTrung.json.ungVien as { id: string }[]) ?? []).some((u) => u.id === idKh));
  const trang360 = await goi(`/crm/khach-hang/${idKh}`, { cookie: cookieQT });
  dat("Trang Customer 360 dựng được", trang360.status === 200 && trang360.text.includes(tenKhach) && trang360.text.includes("Dòng thời gian"));
  for (const tab of ["lien-he", "co-hoi", "tuong-tac", "cong-viec", "dong-thoi-gian", "sua"]) {
    const r = await goi(`/crm/khach-hang/${idKh}?tab=${tab}`, { cookie: cookieQT });
    dat(`Customer 360 thẻ "${tab}" trả 200`, r.status === 200 && !r.text.includes("Không hiển thị được trang này"), `status ${r.status}`);
  }
  const idSai = await goi("/api/v1/khach-hang/khong-phai-uuid", { cookie: cookieQT });
  dat("Id sai định dạng trên đường dẫn trả 404, không phải 500", idSai.status === 404, `status ${idSai.status}`);
  const idSaiGhi = await goi("/api/v1/lead/undefined/chuyen-doi", { phuongThuc: "POST", cookie: cookieQT, than: { khachMoi: { ten: "X" } } });
  dat("Ghi vào id sai định dạng trả 404", idSaiGhi.status === 404, `status ${idSaiGhi.status}`);
  const uuidSaiTrongThan = await goi("/api/v1/tuong-tac", { phuongThuc: "POST", cookie: cookieQT, than: { loai: "note", tieuDe: "Thử", khachHangId: "khong-phai-uuid" } });
  dat("UUID sai trong thân yêu cầu trả 400", uuidSaiTrongThan.status === 400, `status ${uuidSaiTrongThan.status}`);
  const csrfKh = await goi("/api/v1/khach-hang", { phuongThuc: "POST", cookie: cookieQT, origin: "https://ke-gian.example", than: { ten: "CSRF" } });
  dat("POST khách hàng từ trang khác bị chặn 403", csrfKh.status === 403);

  const thieuHanhDong = await goi("/api/v1/co-hoi", { phuongThuc: "POST", cookie: cookieQT, than: { khachHangId: idKh, tieuDe: "Thiếu hành động" } });
  dat("Tạo cơ hội thiếu hành động kế tiếp trả 400 đúng trường", thieuHanhDong.status === 400 && Boolean((thieuHanhDong.json.loiTruong as Record<string, unknown>)?.hanhDongKeTiep));
  const ngayMai = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const taoCh = await goi("/api/v1/co-hoi", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, tieuDe: `Máy chủ thử HTTP ${DAU}`, giaTri: "150.000.000", hanhDongKeTiep: "Gửi cấu hình", ngayHanhDong: ngayMai },
  });
  dat("Tạo cơ hội qua API", taoCh.status === 200 && String(taoCh.json.ma).startsWith("CH-"), JSON.stringify(taoCh.json));
  const idCh = taoCh.json.id as string;
  const thuaKhongLyDo = await goi(`/api/v1/co-hoi/${idCh}/giai-doan`, { phuongThuc: "POST", cookie: cookieQT, than: { giaiDoan: "LOST" } });
  dat("Thua không có lý do trả 400", thuaKhongLyDo.status === 400);
  const sangBaoGia = await goi(`/api/v1/co-hoi/${idCh}/giai-doan`, { phuongThuc: "POST", cookie: cookieQT, than: { giaiDoan: "QUOTATION" } });
  dat("Đổi giai đoạn sang Báo giá", sangBaoGia.status === 200 && sangBaoGia.json.giaiDoan === "QUOTATION");
  const trangCh = await goi(`/ban-hang/co-hoi/${idCh}`, { cookie: cookieQT });
  dat("Trang chi tiết cơ hội dựng được", trangCh.status === 200 && trangCh.text.includes(`Máy chủ thử HTTP ${DAU}`));
  const kanban = await goi("/ban-hang/pipeline", { cookie: cookieQT });
  dat("Kanban hiện cơ hội vừa tạo", kanban.text.includes(`Máy chủ thử HTTP ${DAU}`));

  const taoLd = await goi("/api/v1/lead", { phuongThuc: "POST", cookie: cookieQT, than: { hoTen: "Khách lead HTTP", congTy: `Xưởng HTTP ${DAU}`, email: `lead-${DAU}@thu.test`, xacNhanKhongTrung: true } });
  dat("Tạo lead qua API", taoLd.status === 200 && String(taoLd.json.ma).startsWith("LD-"), JSON.stringify(taoLd.json));
  const idLd = taoLd.json.id as string;
  const ghiTt = await goi("/api/v1/tuong-tac", { phuongThuc: "POST", cookie: cookieQT, than: { loai: "call", tieuDe: "Gọi lần đầu", leadId: idLd } });
  dat("Ghi tương tác trên lead", ghiTt.status === 200);
  const cdLd = await goi(`/api/v1/lead/${idLd}/chuyen-doi`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachMoi: { ten: `Xưởng HTTP ${DAU}` }, xacNhanKhongTrung: true, coHoi: { tieuDe: "Camera xưởng", giaTri: "80000000", hanhDongKeTiep: "Khảo sát", ngayHanhDong: ngayMai } },
  });
  dat("Chuyển đổi lead thành khách + cơ hội qua API", cdLd.status === 200 && Boolean(cdLd.json.khachHangId) && Boolean(cdLd.json.coHoiId), JSON.stringify(cdLd.json));
  const trangLd = await goi(`/crm/lead/${idLd}`, { cookie: cookieQT });
  dat("Trang lead sau chuyển đổi báo đã chuyển đổi", trangLd.status === 200 && trangLd.text.includes("Đã chuyển đổi"));

  const taoViec = await goi("/api/v1/cong-viec", { phuongThuc: "POST", cookie: cookieQT, than: { tieuDe: "Gọi lại khách HTTP", khachHangId: idKh, han: "2020-01-01T09:00" } });
  dat("Tạo công việc gắn khách", taoViec.status === 200 && taoViec.json.quaHan === true);
  const xongViec = await goi(`/api/v1/cong-viec/${taoViec.json.id}`, { phuongThuc: "PATCH", cookie: cookieQT, than: { trangThai: "xong" } });
  dat("Hoàn thành công việc", xongViec.status === 200 && Boolean(xongViec.json.xongLuc));

  // Phạm vi: nhân viên "own" không thấy khách của quản trị, kể cả gõ thẳng đường dẫn.
  const nvXemKh = await goi(`/api/v1/khach-hang/${idKh}`, { cookie: dnNv.cookie });
  dat("Nhân viên gọi API khách của người khác bị 404", nvXemKh.status === 404);
  const nvTrangKh = await goi(`/crm/khach-hang/${idKh}`, { cookie: dnNv.cookie });
  dat("Nhân viên mở trang khách của người khác không thấy nội dung", !nvTrangKh.text.includes(tenKhach));
  const nvDs = await goi("/crm/khach-hang", { cookie: dnNv.cookie });
  dat("Danh sách khách của nhân viên không có khách của người khác", nvDs.status === 200 && !nvDs.text.includes(tenKhach));
  const nvTaoKh = await goi("/api/v1/khach-hang", { phuongThuc: "POST", cookie: dnNv.cookie, than: { ten: `Khách của NV HTTP ${DAU}`, xacNhanKhongTrung: true } });
  dat("Nhân viên tạo được khách của mình", nvTaoKh.status === 200);
  const nvTimKh = await goi(`/api/v1/tim-kiem?q=${encodeURIComponent(mst)}`, { cookie: dnNv.cookie });
  dat("Nhân viên tìm theo MST không ra khách của người khác", !((nvTimKh.json.ketQua as { href: string }[]) ?? []).some((k) => k.href.includes(idKh)));
  const qtTimKh = await goi(`/api/v1/tim-kiem?q=${encodeURIComponent(mst)}`, { cookie: cookieQT });
  dat("Quản trị tìm theo MST ra đúng khách", ((qtTimKh.json.ketQua as { href: string }[]) ?? []).some((k) => k.href.includes(idKh)));

  // --- 7c. Sản phẩm và bảng giá (Phase 3) ---
  const cacTrangSp: [string, string][] = [
    ["/san-pham", "Sản phẩm"],
    ["/san-pham/moi", "Thêm sản phẩm"],
    ["/san-pham/nhom", "Nhóm sản phẩm"],
    ["/san-pham/thuong-hieu", "Thương hiệu"],
    ["/san-pham/nha-cung-cap", "Nhà cung cấp"],
    ["/san-pham/nhap-csv", "Nhập CSV"],
  ];
  for (const [duong, chu] of cacTrangSp) {
    const r = await goi(duong, { cookie: cookieQT });
    dat(`Trang ${duong} trả 200 và có nội dung`, r.status === 200 && r.text.includes(chu) && !r.text.includes("Không hiển thị được trang này"), `status ${r.status}`);
  }

  const taoNcc = await goi("/api/v1/nha-cung-cap", { phuongThuc: "POST", cookie: cookieQT, than: { ten: `Nhà cung cấp Thử HTTP ${DAU}`, soNgayGiao: 3 } });
  dat("Tạo nhà cung cấp qua API, mã NCC-", taoNcc.status === 200 && String(taoNcc.json.ma).startsWith("NCC-"), JSON.stringify(taoNcc.json));
  const idNcc = taoNcc.json.id as string;

  const taoTh = await goi("/api/v1/thuong-hieu", { phuongThuc: "POST", cookie: cookieQT, than: { ma: `th-${DAU}`, ten: `Hãng thử ${DAU}` } });
  dat("Tạo thương hiệu qua API", taoTh.status === 200);
  const dsNhom = await goi("/api/v1/nhom-san-pham", { cookie: cookieQT });
  const nhomLaptop = (dsNhom.json as unknown as { id: string; ma: string }[]).find?.((n) => n.ma === "laptop");
  dat("Seed đã có nhóm sản phẩm chuẩn (laptop)", Boolean(nhomLaptop));

  const skuThu = `SP-HTTP-${DAU}`.toUpperCase();
  const taoSp = await goi("/api/v1/san-pham", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { sku: skuThu, ten: `Laptop thử HTTP ${DAU}`, nhomId: nhomLaptop?.id, giaVon: "15.000.000", giaBan: "18.000.000", donViTinh: "cai" },
  });
  dat("Tạo sản phẩm qua API", taoSp.status === 200 && taoSp.json.sku === skuThu, JSON.stringify(taoSp.json));
  dat("Sản phẩm kế thừa bảo hành và số sê-ri từ nhóm", taoSp.json.baoHanhThang === 24 && taoSp.json.batBuocSerial === true);
  const idSp = taoSp.json.id as string;
  const trungSku = await goi("/api/v1/san-pham", { phuongThuc: "POST", cookie: cookieQT, than: { sku: skuThu.toLowerCase(), ten: "Trùng SKU" } });
  dat("SKU trùng (khác hoa thường) trả 409", trungSku.status === 409 && trungSku.json.ma === "trung-sku");

  const datGia = await goi(`/api/v1/san-pham/${idSp}/gia`, { phuongThuc: "POST", cookie: cookieQT, than: { nhaCungCapId: idNcc, giaMua: "14.500.000", tinhTrang: "con-hang", soNgayGiao: 2 } });
  dat("Đặt giá nhà cung cấp qua API", datGia.status === 200 && datGia.json.giaMua === "14500000", JSON.stringify(datGia.json));
  const ctSp = await goi(`/api/v1/san-pham/${idSp}`, { cookie: cookieQT });
  const ct = ctSp.json as unknown as { nenMua: { giaMua: string } | null; lichSuGia: { loai: string }[] };
  dat("Chi tiết sản phẩm nêu nguồn nên mua và lịch sử giá", ct.nenMua?.giaMua === "14500000" && ct.lichSuGia.some((h) => h.loai === "supplier"));
  const trangSp = await goi(`/san-pham/${idSp}`, { cookie: cookieQT });
  dat("Trang chi tiết sản phẩm dựng được", trangSp.status === 200 && trangSp.text.includes(skuThu));

  const csvSp = ["SKU,Tên,Giá bán", `${skuThu},Laptop thử HTTP ${DAU},19.000.000`, `SP-MOI-${DAU},Sản phẩm mới ${DAU},2.000.000`, "SP-LOI,,1.000.000"].join("\n");
  const xemTruoc = await goi("/api/v1/nhap-csv", { phuongThuc: "POST", cookie: cookieQT, than: { tenTep: "thu.csv", noiDung: csvSp, loai: "san-pham", ghiThat: false } });
  dat("Nhập CSV xem trước: 1 tạo, 1 sửa, 1 hỏng", xemTruoc.status === 200 && xemTruoc.json.soTao === 1 && xemTruoc.json.soSua === 1 && xemTruoc.json.soLoi === 1, JSON.stringify(xemTruoc.json));
  const ghiThat = await goi("/api/v1/nhap-csv", { phuongThuc: "POST", cookie: cookieQT, than: { tenTep: "thu.csv", noiDung: csvSp, loai: "san-pham", ghiThat: true } });
  dat("Nhập CSV ghi thật trả phiếu nhập", ghiThat.status === 200 && Boolean(ghiThat.json.importJobId));
  const thieuCot = await goi("/api/v1/nhap-csv", { phuongThuc: "POST", cookie: cookieQT, than: { tenTep: "x.csv", noiDung: "a,b\n1,2", loai: "san-pham", ghiThat: false } });
  dat("Tệp thiếu cột bắt buộc trả 400 kèm mã lỗi", thieuCot.status === 400 && thieuCot.json.ma === "thieu-cot");

  const mau = await goi("/api/v1/nhap-csv/mau?loai=gia-nha-cung-cap", { cookie: cookieQT });
  dat("Tải được tệp mẫu CSV", mau.status === 200 && String(mau.json.noiDung).includes("SKU"));
  const xuatSp = await goi("/api/v1/san-pham/xuat?trangThai=hoat-dong", { cookie: cookieQT });
  dat("Xuất CSV sản phẩm trả tên tệp và nội dung", xuatSp.status === 200 && String(xuatSp.json.tenTep).endsWith(".csv") && String(xuatSp.json.noiDung).includes(skuThu));

  const nvXemSp = await goi("/api/v1/san-pham", { cookie: dnNv.cookie });
  dat("Nhân viên kinh doanh XEM được danh mục sản phẩm", nvXemSp.status === 200 && Number(nvXemSp.json.tong) >= 1);
  const nvTaoSp = await goi("/api/v1/san-pham", { phuongThuc: "POST", cookie: dnNv.cookie, than: { sku: `NV-${DAU}`, ten: "Của nhân viên" } });
  dat("Nhân viên kinh doanh KHÔNG tạo được sản phẩm", nvTaoSp.status === 403);
  const nvXemNcc = await goi("/api/v1/nha-cung-cap", { cookie: dnNv.cookie });
  dat("Nhân viên kinh doanh xem được nhà cung cấp", nvXemNcc.status === 200);
  const nvNhap = await goi("/api/v1/nhap-csv", { phuongThuc: "POST", cookie: dnNv.cookie, than: { tenTep: "x.csv", noiDung: csvSp, loai: "san-pham", ghiThat: true } });
  dat("Nhân viên kinh doanh không nhập được CSV", nvNhap.status === 403);
  const timSp = await goi(`/api/v1/tim-kiem?q=${encodeURIComponent(skuThu)}`, { cookie: dnNv.cookie });
  dat("Tìm kiếm toàn cục ra sản phẩm theo SKU", ((timSp.json.ketQua as { loai: string }[]) ?? []).some((k) => k.loai === "san-pham"));

  // --- 7d. Báo giá (Phase 4) ---
  const cacTrangBg: [string, string][] = [
    ["/ban-hang/bao-gia", "Báo giá"],
    ["/ban-hang/bao-gia/moi", "Lập báo giá"],
    ["/quan-tri/ho-so-cong-ty", "Hồ sơ công ty"],
  ];
  for (const [duong, chu] of cacTrangBg) {
    const r = await goi(duong, { cookie: cookieQT });
    dat(`Trang ${duong} trả 200 và có nội dung`, r.status === 200 && r.text.includes(chu) && !r.text.includes("Không hiển thị được trang này"), `status ${r.status}`);
  }

  // Ngưỡng cao → mọi báo giá phải duyệt. Cuối mục trả ngưỡng về chưa đặt.
  const datNguong = await goi("/api/v1/cau-hinh", { phuongThuc: "PATCH", cookie: cookieQT, than: { giaTri: { "bao_gia.nguong_bien_loi_nhuan": 90 } } });
  dat("Đặt ngưỡng biên lợi nhuận qua API", datNguong.status === 200);

  const goiYSp = await goi(`/api/v1/bao-gia/goi-y-san-pham?q=${encodeURIComponent(skuThu)}`, { cookie: dnNv.cookie });
  const dsGoiY = (goiYSp.json as unknown as { sku: string; giaBan: string; giaVon: string }[]) ?? [];
  dat("Gợi ý sản phẩm cho báo giá trả giá bán và giá vốn theo nguồn nên mua", goiYSp.status === 200 && dsGoiY.some((g) => g.sku === skuThu && g.giaVon === "14500000"), JSON.stringify(dsGoiY[0]));

  const khachNv = nvTaoKh.json.id as string;
  const taoBg = await goi("/api/v1/bao-gia", {
    phuongThuc: "POST",
    cookie: dnNv.cookie,
    than: {
      khachHangId: khachNv,
      hieuLucDen: ngayMai,
      dong: [{ sanPhamId: idSp, ten: `Laptop thử HTTP ${DAU}`, soLuong: "2", donGia: "18.000.000", vat: 10, giaVon: "14.500.000" }],
    },
  });
  dat("Nhân viên lập được báo giá, số QT-", taoBg.status === 200 && String(taoBg.json.so).startsWith("QT-"), JSON.stringify(taoBg.json));
  const idBg = taoBg.json.id as string;

  const ctBg = await goi(`/api/v1/bao-gia/${idBg}`, { cookie: dnNv.cookie });
  const pbBg = (ctBg.json as unknown as { baoGia: { phienBanHienHanh: { tongCong: string; bienLoiNhuan: number; trangThai: string } } }).baoGia.phienBanHienHanh;
  dat("Tổng tiền và biên lợi nhuận tính đúng (36tr + VAT, biên 19,44%)", pbBg.tongCong === "39600000" && pbBg.bienLoiNhuan === 19.44, JSON.stringify({ t: pbBg.tongCong, b: pbBg.bienLoiNhuan }));

  const guiSom = await goi(`/api/v1/bao-gia/${idBg}/gui`, { phuongThuc: "POST", cookie: dnNv.cookie, than: { kenh: "email" } });
  dat("Dưới ngưỡng: gửi khách khi chưa duyệt bị 409", guiSom.status === 409 && guiSom.json.ma === "phai-duyet", `status ${guiSom.status}`);
  const nvTuDuyet = await goi(`/api/v1/bao-gia/${idBg}/duyet`, { phuongThuc: "POST", cookie: dnNv.cookie, than: { quyetDinh: "cho-duyet" } });
  dat("Nhân viên không có quyền duyệt báo giá", nvTuDuyet.status === 403);

  const xinDuyetBg = await goi(`/api/v1/bao-gia/${idBg}/xin-duyet`, { phuongThuc: "POST", cookie: dnNv.cookie, than: { ghiChu: "Khách quen, xin duyệt" } });
  dat("Xin duyệt chuyển sang chờ duyệt", xinDuyetBg.status === 200);
  const hangDoi = await goi("/api/v1/bao-gia?choDuyet=1", { cookie: cookieQT });
  dat("Hàng đợi duyệt của quản trị có báo giá vừa xin", hangDoi.status === 200 && ((hangDoi.json.dong as { id: string }[]) ?? []).some((b) => b.id === idBg));
  const duyetBg = await goi(`/api/v1/bao-gia/${idBg}/duyet`, { phuongThuc: "POST", cookie: cookieQT, than: { quyetDinh: "cho-duyet", ghiChu: "Đồng ý" } });
  dat("Người có quyền duyệt thì duyệt được", duyetBg.status === 200);

  const guiBg = await goi(`/api/v1/bao-gia/${idBg}/gui`, { phuongThuc: "POST", cookie: dnNv.cookie, than: { kenh: "email", ghiChu: "Gửi email" } });
  dat("Duyệt xong thì gửi khách được", guiBg.status === 200);
  const suaDaGui = await goi(`/api/v1/bao-gia/${idBg}`, { phuongThuc: "PATCH", cookie: dnNv.cookie, than: { ghiChu: "Sửa lén" } });
  dat("Bản đã gửi không sửa trực tiếp được (409 da-gui)", suaDaGui.status === 409 && suaDaGui.json.ma === "da-gui", `status ${suaDaGui.status}`);
  const banMoi = await goi(`/api/v1/bao-gia/${idBg}/phien-ban`, { phuongThuc: "POST", cookie: dnNv.cookie });
  dat("Tạo phiên bản V2 từ bản đã gửi", banMoi.status === 200 && banMoi.json.phienBan === 2, JSON.stringify(banMoi.json));

  const banIn = await goi(`/bao-gia/${idBg}/in`, { cookie: dnNv.cookie });
  dat("Bản in báo giá dựng được và có tiền bằng chữ", banIn.status === 200 && banIn.text.includes("BÁO GIÁ") && banIn.text.includes("Bằng chữ"), `status ${banIn.status}`);
  const trangBg = await goi(`/ban-hang/bao-gia/${idBg}`, { cookie: dnNv.cookie });
  dat("Trang chi tiết báo giá dựng được", trangBg.status === 200 && trangBg.text.includes(String(taoBg.json.so)));
  const trangSua = await goi(`/ban-hang/bao-gia/${idBg}/sua`, { cookie: dnNv.cookie });
  dat("Trang sửa báo giá dựng được bảng hàng (không trắng)", trangSua.status === 200 && trangSua.text.includes("Bảng hàng"), `status ${trangSua.status}`);

  // Ngưỡng thấp → biên đạt ngưỡng, gửi thẳng không cần duyệt.
  await goi("/api/v1/cau-hinh", { phuongThuc: "PATCH", cookie: cookieQT, than: { giaTri: { "bao_gia.nguong_bien_loi_nhuan": 5 } } });
  const bgDat = await goi("/api/v1/bao-gia", {
    phuongThuc: "POST",
    cookie: dnNv.cookie,
    than: { khachHangId: khachNv, dong: [{ ten: "Dịch vụ cài đặt", soLuong: "1", donGia: "5.000.000", vat: 10, giaVon: "1.000.000" }] },
  });
  const guiThang = await goi(`/api/v1/bao-gia/${bgDat.json.id}/gui`, { phuongThuc: "POST", cookie: dnNv.cookie, than: { kenh: "zalo" } });
  dat("Biên đạt ngưỡng thì gửi thẳng, không phải duyệt", bgDat.status === 200 && guiThang.status === 200, `tạo ${bgDat.status}, gửi ${guiThang.status}`);
  const chotBg = await goi(`/api/v1/bao-gia/${bgDat.json.id}/chot`, { phuongThuc: "POST", cookie: dnNv.cookie, than: { ketQua: "ACCEPTED", ghiChu: "Khách đồng ý" } });
  dat("Ghi kết quả khách chấp nhận", chotBg.status === 200);

  // Phạm vi: báo giá của quản trị, nhân viên không thấy.
  const bgQt = await goi("/api/v1/bao-gia", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, dong: [{ ten: "Hạng mục của quản trị", soLuong: "1", donGia: "1.000.000", vat: 10 }] },
  });
  const nvXemBgQt = await goi(`/api/v1/bao-gia/${bgQt.json.id}`, { cookie: dnNv.cookie });
  dat("Nhân viên gọi báo giá ngoài phạm vi bị 404", bgQt.status === 200 && nvXemBgQt.status === 404, `status ${nvXemBgQt.status}`);

  // Hồ sơ công ty: chỉ người có quyền cấu hình mới xem và sửa.
  const nvXemHs = await goi("/api/v1/ho-so-cong-ty", { cookie: dnNv.cookie });
  dat("Nhân viên không xem được hồ sơ công ty", nvXemHs.status === 403);
  const suaHs = await goi("/api/v1/ho-so-cong-ty", { phuongThuc: "PATCH", cookie: cookieQT, than: { giaTri: { "cong_ty.dien_thoai": `0900 000 ${DAU.slice(-3)}` } } });
  dat("Quản trị cập nhật được hồ sơ công ty", suaHs.status === 200 && Number(suaHs.json.soDoi) === 1, JSON.stringify(suaHs.json));

  // Trả ngưỡng về trạng thái chưa đặt để không ảnh hưởng dữ liệu thử của phiên sau.
  const xoaNguong = await goi("/api/v1/cau-hinh", { phuongThuc: "PATCH", cookie: cookieQT, than: { giaTri: { "bao_gia.nguong_bien_loi_nhuan": null } } });
  dat("Trả ngưỡng biên lợi nhuận về chưa đặt", xoaNguong.status === 200);

  // --- 7e. Đơn hàng và kho (Phase 5) ---
  const cacTrangKho: [string, string][] = [
    ["/kho", "Tồn kho"],
    ["/kho/danh-sach", "Danh sách kho"],
    ["/kho/nhap", "Nhập kho"],
    ["/kho/the-kho", "Thẻ kho"],
    ["/kho/serial", "Số sê-ri"],
    ["/ban-hang/don-hang", "Đơn hàng"],
    ["/ban-hang/don-hang/moi", "Tạo đơn hàng"],
  ];
  for (const [duong, chu] of cacTrangKho) {
    const r = await goi(duong, { cookie: cookieQT });
    dat(`Trang ${duong} trả 200 và có nội dung`, r.status === 200 && r.text.includes(chu) && !r.text.includes("Không hiển thị được trang này"), `status ${r.status}`);
  }

  const taoKho = await goi("/api/v1/kho", { phuongThuc: "POST", cookie: cookieQT, than: { ma: `kho-${DAU}`, ten: `Kho thử HTTP ${DAU}`, macDinh: true } });
  dat("Tạo kho qua API, mã tự viết hoa", taoKho.status === 200 && String(taoKho.json.ma) === `KHO-${DAU}`.toUpperCase(), JSON.stringify(taoKho.json));
  const idKho = taoKho.json.id as string;

  const nhapKho = await goi("/api/v1/kho/nhap", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khoId: idKho, lyDo: "Nhập thử qua HTTP", dong: [{ sanPhamId: idSp, soLuong: "5", giaVon: "14.500.000", serial: [`SN-HTTP-${DAU}-1`, `SN-HTTP-${DAU}-2`, `SN-HTTP-${DAU}-3`, `SN-HTTP-${DAU}-4`, `SN-HTTP-${DAU}-5`] }] },
  });
  dat("Nhập kho 5 máy có sê-ri", nhapKho.status === 200 && (nhapKho.json.dong as { tonSau: number }[])[0].tonSau === 5, JSON.stringify(nhapKho.json));
  const tonSauNhap = await goi(`/api/v1/kho/ton?kho=${idKho}`, { cookie: cookieQT });
  const dongTon = ((tonSauNhap.json.dong as { sanPham: { id: string }; tonKho: number; conBanDuoc: number }[]) ?? []).find((d) => d.sanPham.id === idSp);
  dat("Tồn kho đọc ra đúng 5, còn bán được 5", dongTon?.tonKho === 5 && dongTon?.conBanDuoc === 5, JSON.stringify(dongTon));

  const thieuSerial = await goi("/api/v1/kho/nhap", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khoId: idKho, lyDo: "Thiếu sê-ri", dong: [{ sanPhamId: idSp, soLuong: "2", serial: [`SN-HTTP-${DAU}-9`] }] },
  });
  dat("KHO-05: nhập thiếu sê-ri trả 400 kèm mã lỗi", thieuSerial.status === 400 && thieuSerial.json.ma === "thieu-serial", `status ${thieuSerial.status}`);

  const dieuChinh = await goi("/api/v1/kho/dieu-chinh", { phuongThuc: "POST", cookie: cookieQT, than: { khoId: idKho, sanPhamId: idSp, chieu: "giam", soLuong: "1", lyDo: "Kiểm kê thiếu 1 máy" } });
  dat("Điều chỉnh giảm còn 4", dieuChinh.status === 200 && (dieuChinh.json.sau as { onHand: number }).onHand === 4, JSON.stringify(dieuChinh.json));
  const dieuChinhQua = await goi("/api/v1/kho/dieu-chinh", { phuongThuc: "POST", cookie: cookieQT, than: { khoId: idKho, sanPhamId: idSp, chieu: "giam", soLuong: "99", lyDo: "Thử vượt tồn" } });
  dat("KHO-02: điều chỉnh vượt tồn trả 409", dieuChinhQua.status === 409 && dieuChinhQua.json.ma === "ton-khong-du", `status ${dieuChinhQua.status}`);

  // Đơn hàng từ báo giá đã chốt (bgDat ở mục 7d đã ở trạng thái Khách chấp nhận).
  const taoDon = await goi("/api/v1/don-hang/tu-bao-gia", { phuongThuc: "POST", cookie: cookieQT, than: { baoGiaId: bgDat.json.id } });
  dat("DH-01: tạo đơn từ báo giá đã chốt, số DH-", taoDon.status === 200 && String(taoDon.json.so).startsWith("DH-"), JSON.stringify(taoDon.json));
  const idDon = taoDon.json.id as string;
  const taoLai = await goi("/api/v1/don-hang/tu-bao-gia", { phuongThuc: "POST", cookie: cookieQT, than: { baoGiaId: bgDat.json.id } });
  dat("Gọi lại không sinh đơn thứ hai", taoLai.status === 200 && taoLai.json.id === idDon && taoLai.json.daCoTruoc === true);

  const donThuong = await goi("/api/v1/don-hang", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, dong: [{ sanPhamId: idSp, ten: `Laptop thử HTTP ${DAU}`, soLuong: "2", donViTinh: "cai", donGia: "18.000.000", vat: 10, giaVon: "14.500.000" }] },
  });
  dat("Tạo đơn thủ công qua API", donThuong.status === 200 && String(donThuong.json.so).startsWith("DH-"), JSON.stringify(donThuong.json));
  const idDon2 = donThuong.json.id as string;

  const xacNhan = await goi(`/api/v1/don-hang/${idDon2}/xac-nhan`, { phuongThuc: "POST", cookie: cookieQT, than: { khoId: idKho } });
  dat("DH-04: xác nhận đơn và giữ hàng", xacNhan.status === 200 && xacNhan.json.trangThai === "CONFIRMED", JSON.stringify(xacNhan.json));
  const tonSauGiu = await goi(`/api/v1/kho/ton?kho=${idKho}`, { cookie: cookieQT });
  const dongGiu = ((tonSauGiu.json.dong as { sanPham: { id: string }; giuCho: number; conBanDuoc: number }[]) ?? []).find((d) => d.sanPham.id === idSp);
  dat("Giữ chỗ 2, còn bán được 2", dongGiu?.giuCho === 2 && dongGiu?.conBanDuoc === 2, JSON.stringify(dongGiu));

  const suaDaXacNhan = await goi(`/api/v1/don-hang/${idDon2}`, { phuongThuc: "PATCH", cookie: cookieQT, than: { ghiChu: "Sửa lén" } });
  dat("DH-03: đơn đã xác nhận không sửa được (409)", suaDaXacNhan.status === 409 && suaDaXacNhan.json.ma === "da-xac-nhan", `status ${suaDaXacNhan.status}`);

  const ctDon = await goi(`/api/v1/don-hang/${idDon2}`, { cookie: cookieQT });
  const dongDon = ((ctDon.json as unknown as { don: { dong: { id: string; sanPhamId: string }[] } }).don.dong ?? []).find((d) => d.sanPhamId === idSp)!;
  const xuatQua = await goi(`/api/v1/don-hang/${idDon2}/phieu-xuat`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khoId: idKho, dong: [{ dongDonId: dongDon.id, soLuong: "5", serial: [`SN-HTTP-${DAU}-1`] }] },
  });
  dat("DH-05: xuất quá số lượng đặt bị 409", xuatQua.status === 409 && xuatQua.json.ma === "xuat-qua-so-luong", `status ${xuatQua.status}`);

  const xuat1 = await goi(`/api/v1/don-hang/${idDon2}/phieu-xuat`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khoId: idKho, nguoiNhan: "Anh Thử", dong: [{ dongDonId: dongDon.id, soLuong: "1", serial: [`SN-HTTP-${DAU}-1`] }] },
  });
  dat("Xuất 1 máy: đơn sang Giao một phần", xuat1.status === 200 && xuat1.json.trangThaiDon === "PARTIALLY_DELIVERED", JSON.stringify(xuat1.json));
  const xuat2 = await goi(`/api/v1/don-hang/${idDon2}/phieu-xuat`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khoId: idKho, dong: [{ dongDonId: dongDon.id, soLuong: "1", serial: [`SN-HTTP-${DAU}-2`] }] },
  });
  dat("Xuất nốt: đơn sang Đã giao đủ", xuat2.status === 200 && xuat2.json.trangThaiDon === "DELIVERED", JSON.stringify(xuat2.json));
  const serialDaBan = await goi(`/api/v1/kho/serial?q=SN-HTTP-${DAU}-1&trangThai=da-ban`, { cookie: cookieQT });
  dat("Sê-ri đã xuất chuyển sang Đã bán và gắn đơn", Number(serialDaBan.json.tong) === 1 && Boolean((serialDaBan.json.dong as { donHang: unknown }[])[0]?.donHang));

  const huyDaGiao = await goi(`/api/v1/don-hang/${idDon2}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "Thử hủy" } });
  dat("DH-07: đơn đã giao đủ thì không hủy (409)", huyDaGiao.status === 409 && huyDaGiao.json.ma === "da-giao-du", `status ${huyDaGiao.status}`);

  const huyDon = await goi(`/api/v1/don-hang/${idDon}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "Dọn dữ liệu thử HTTP" } });
  dat("Hủy đơn chưa xác nhận được, có ghi lý do", huyDon.status === 200 && huyDon.json.trangThai === "CANCELLED");
  const huyThieuLyDo = await goi(`/api/v1/don-hang/${idDon2}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "" } });
  dat("Hủy đơn không ghi lý do bị 400", huyThieuLyDo.status === 400, `status ${huyThieuLyDo.status}`);

  const doiSoat = await goi("/api/v1/kho/doi-soat", { cookie: cookieQT });
  dat("KHO-01: sổ cái khớp số dư trên mọi cặp (kho, sản phẩm)", doiSoat.status === 200 && ((doiSoat.json.lech as unknown[]) ?? []).length === 0, JSON.stringify(doiSoat.json));
  const theKhoHttp = await goi(`/api/v1/kho/the-kho?kho=${idKho}`, { cookie: cookieQT });
  dat("Thẻ kho ghi đủ các loại giao dịch", theKhoHttp.status === 200 && ["nhap", "dieu-chinh", "giu-cho", "xuat"].every((l) => ((theKhoHttp.json.dong as { loai: string }[]) ?? []).some((d) => d.loai === l)), JSON.stringify(((theKhoHttp.json.dong as { loai: string }[]) ?? []).map((d) => d.loai)));

  const trangDon = await goi(`/ban-hang/don-hang/${idDon2}`, { cookie: cookieQT });
  dat("Trang chi tiết đơn dựng được", trangDon.status === 200 && trangDon.text.includes(String(donThuong.json.so)), `status ${trangDon.status}`);

  // Phân quyền: nhân viên kinh doanh chỉ xem, không tạo đơn, không đụng kho.
  const nvXemDon = await goi("/api/v1/don-hang", { cookie: dnNv.cookie });
  dat("Nhân viên kinh doanh xem được danh sách đơn", nvXemDon.status === 200);
  const nvTaoDon = await goi("/api/v1/don-hang", { phuongThuc: "POST", cookie: dnNv.cookie, than: { khachHangId: khachNv, dong: [] } });
  dat("Nhân viên kinh doanh KHÔNG tạo được đơn (theo mục 19 đặc tả)", nvTaoDon.status === 403, `status ${nvTaoDon.status}`);
  const nvNhapKho = await goi("/api/v1/kho/nhap", { phuongThuc: "POST", cookie: dnNv.cookie, than: { khoId: idKho, lyDo: "Thử", dong: [{ sanPhamId: idSp, soLuong: "1" }] } });
  dat("Nhân viên kinh doanh không nhập kho được", nvNhapKho.status === 403);
  const nvXacNhan = await goi(`/api/v1/don-hang/${idDon2}/xac-nhan`, { phuongThuc: "POST", cookie: dnNv.cookie, than: { khoId: idKho } });
  dat("Nhân viên kinh doanh không xác nhận được đơn", nvXacNhan.status === 403);

  // --- 7f. Bảo hành, phiếu hỗ trợ, dự án (Phase 6) ---
  const cacTrangDv: [string, string][] = [
    ["/dich-vu/ho-tro", "Phiếu hỗ trợ"],
    ["/dich-vu/ho-tro/moi", "Mở phiếu hỗ trợ"],
    ["/dich-vu/bao-hanh", "Bảo hành"],
    ["/du-an", "Dự án triển khai"],
    ["/du-an/moi", "Mở dự án triển khai"],
  ];
  for (const [duong, chu] of cacTrangDv) {
    const r = await goi(duong, { cookie: cookieQT });
    dat(`Trang ${duong} trả 200 và có nội dung`, r.status === 200 && r.text.includes(chu) && !r.text.includes("Không hiển thị được trang này"), `status ${r.status}`);
  }

  // Bảo hành đã sinh ở mục 7e khi xuất 2 máy có sê-ri của đơn idDon2.
  const dsBaoHanh = await goi(`/api/v1/bao-hanh?q=SN-HTTP-${DAU}&tinhTrang=tat-ca`, { cookie: cookieQT });
  const dongBh = ((dsBaoHanh.json.dong as { id: string; serial: string; soThang: number; ngayHetHan: string; donHang: { id: string } | null }[]) ?? []);
  dat("BH-01: giao hàng sinh bảo hành cho từng máy", dsBaoHanh.status === 200 && dongBh.length === 2, `${dongBh.length} phiếu`);
  dat("Bảo hành lấy đúng số tháng của sản phẩm và gắn đơn hàng", dongBh[0]?.soThang === 24 && dongBh[0]?.donHang?.id === idDon2, JSON.stringify({ thang: dongBh[0]?.soThang }));
  const idBh = dongBh[0]?.id as string;
  const serialBh = dongBh[0]?.serial as string;

  const traSerialHttp = await goi(`/api/v1/bao-hanh/tra-serial?serial=SN-HTTP-${DAU}-1`, { cookie: cookieQT });
  dat("Tra bảo hành theo số sê-ri", traSerialHttp.status === 200 && ((traSerialHttp.json as unknown as { serial: string }[]) ?? []).length === 1);

  const suaBhThieuLyDo = await goi(`/api/v1/bao-hanh/${idBh}`, { phuongThuc: "PATCH", cookie: cookieQT, than: { soThang: 36 } });
  dat("BH-04: sửa bảo hành không ghi lý do bị 400", suaBhThieuLyDo.status === 400, `status ${suaBhThieuLyDo.status}`);
  const suaBh = await goi(`/api/v1/bao-hanh/${idBh}`, { phuongThuc: "PATCH", cookie: cookieQT, than: { soThang: 36, lyDo: "Hãng nâng bảo hành" } });
  dat("Sửa bảo hành có lý do thì hạn tính lại", suaBh.status === 200 && suaBh.json.soThang === 36, JSON.stringify(suaBh.json));

  // Phiếu hỗ trợ: SLA đọc từ Cấu hình.
  await goi("/api/v1/cau-hinh", {
    phuongThuc: "PATCH",
    cookie: cookieQT,
    than: { giaTri: { "dich_vu.gio_phan_hoi_khan": 1, "dich_vu.gio_phan_hoi_thuong": 8, "dich_vu.gio_xu_ly_khan": 4, "dich_vu.gio_xu_ly_thuong": 48 } },
  });
  const taoPhieuHt = await goi("/api/v1/ho-tro", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, baoHanhId: idBh, loai: "bao-hanh", uuTien: "khan", tieuDe: `Máy lỗi nguồn ${DAU}`, moTa: "Khách báo máy không lên." },
  });
  dat("HT-01: mở phiếu hỗ trợ, số HT-", taoPhieuHt.status === 200 && String(taoPhieuHt.json.so).startsWith("HT-"), JSON.stringify(taoPhieuHt.json));
  dat("HT-03: phiếu Khẩn có hạn phản hồi và hạn xử lý", Boolean(taoPhieuHt.json.hanPhanHoi) && Boolean(taoPhieuHt.json.hanXuLy));
  const idPhieu = taoPhieuHt.json.id as string;

  const ctPhieu = await goi(`/api/v1/ho-tro/${idPhieu}`, { cookie: cookieQT });
  const phieuJson = ctPhieu.json as unknown as { phieu: { baoHanh: { serial: string } | null; donHang: { id: string } | null }; dienBien: unknown[] };
  dat("Phiếu gắn đúng máy và đơn hàng qua bảo hành", phieuJson.phieu.baoHanh?.serial === serialBh && phieuJson.phieu.donHang?.id === idDon2, JSON.stringify({ serial: phieuJson.phieu.baoHanh?.serial, mong: serialBh, don: phieuJson.phieu.donHang?.id, mongDon: idDon2 }));
  dat("Phiếu mới có ngay diễn biến tiếp nhận", phieuJson.dienBien.length === 1);

  const giaoPhieuHt = await goi(`/api/v1/ho-tro/${idPhieu}/giao`, { phuongThuc: "POST", cookie: cookieQT, than: { nguoiXuLyId: idNv, ghiChu: "Nhờ kiểm tra" } });
  dat("HT-04: giao phiếu cho người xử lý", giaoPhieuHt.status === 200);
  const ghiDb = await goi(`/api/v1/ho-tro/${idPhieu}/dien-bien`, { phuongThuc: "POST", cookie: cookieQT, than: { loai: "phan-hoi-khach", noiDung: "Đã gọi khách, hẹn chiều nay." } });
  dat("Ghi diễn biến liên hệ khách", ghiDb.status === 200);

  const xongThieu = await goi(`/api/v1/ho-tro/${idPhieu}/trang-thai`, { phuongThuc: "POST", cookie: cookieQT, than: { trangThai: "HOAN_THANH", cachXuLy: "" } });
  dat("HT-05: hoàn thành mà không ghi cách xử lý bị 400", xongThieu.status === 400, `status ${xongThieu.status}`);
  const nhayTrangThai = await goi(`/api/v1/ho-tro/${idPhieu}/trang-thai`, { phuongThuc: "POST", cookie: cookieQT, than: { trangThai: "DONG", cachXuLy: "x" } });
  dat("HT-02: không nhảy thẳng sang Đóng khi chưa hoàn thành", nhayTrangThai.status === 409 && nhayTrangThai.json.ma === "sai-trang-thai", `status ${nhayTrangThai.status}`);
  const xong = await goi(`/api/v1/ho-tro/${idPhieu}/trang-thai`, { phuongThuc: "POST", cookie: cookieQT, than: { trangThai: "HOAN_THANH", cachXuLy: "Thay bộ nguồn, chạy ổn." } });
  dat("Hoàn thành phiếu kèm cách xử lý", xong.status === 200 && xong.json.trangThai === "HOAN_THANH");
  const dongPhieu = await goi(`/api/v1/ho-tro/${idPhieu}/trang-thai`, { phuongThuc: "POST", cookie: cookieQT, than: { trangThai: "DONG", ghiChu: "Khách xác nhận" } });
  dat("HT-06: đóng phiếu sau khi hoàn thành", dongPhieu.status === 200 && dongPhieu.json.trangThai === "DONG");
  const ghiSauDong = await goi(`/api/v1/ho-tro/${idPhieu}/dien-bien`, { phuongThuc: "POST", cookie: cookieQT, than: { loai: "ghi-chu", noiDung: "Ghi thêm" } });
  dat("Phiếu đã đóng thì không ghi thêm diễn biến (409)", ghiSauDong.status === 409 && ghiSauDong.json.ma === "phieu-da-dong", `status ${ghiSauDong.status}`);

  const trangPhieu = await goi(`/dich-vu/ho-tro/${idPhieu}`, { cookie: cookieQT });
  dat("Trang chi tiết phiếu dựng được", trangPhieu.status === 200 && trangPhieu.text.includes(String(taoPhieuHt.json.so)), `status ${trangPhieu.status}`);

  // Dự án triển khai từ đơn đã xác nhận.
  const taoDa = await goi("/api/v1/du-an", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, donHangId: idDon2, ten: `Lắp đặt thử HTTP ${DAU}`, hangMuc: ["Khảo sát", "Lắp đặt", "Bàn giao"] },
  });
  dat("DU-01: mở dự án từ đơn đã xác nhận, mã DA-", taoDa.status === 200 && String(taoDa.json.ma).startsWith("DA-"), JSON.stringify(taoDa.json));
  const idDa = taoDa.json.id as string;

  const ctDa = await goi(`/api/v1/du-an/${idDa}`, { cookie: cookieQT });
  const daJson = ctDa.json as unknown as { duAn: { hangMuc: { id: string }[]; tienDo: { tong: number } }; quyen: { nghiemThu: boolean } };
  dat("Dự án có 3 hạng mục, chưa cho nghiệm thu", daJson.duAn.hangMuc.length === 3 && daJson.quyen.nghiemThu === false);

  const nghiemThuSom = await goi(`/api/v1/du-an/${idDa}/trang-thai`, { phuongThuc: "POST", cookie: cookieQT, than: { trangThai: "ACCEPTED", ghiChu: "Thử" } });
  dat("DU-05: nghiệm thu khi chưa xong hạng mục bị 409", nghiemThuSom.status === 409, `status ${nghiemThuSom.status}`);

  for (const h of daJson.duAn.hangMuc) {
    await goi(`/api/v1/du-an/${idDa}/hang-muc/${h.id}`, { phuongThuc: "PATCH", cookie: cookieQT, than: { trangThai: "xong" } });
  }
  const ctDa2 = await goi(`/api/v1/du-an/${idDa}`, { cookie: cookieQT });
  const daJson2 = ctDa2.json as unknown as { duAn: { trangThai: string; tienDo: { phanTram: number } }; quyen: { nghiemThu: boolean } };
  dat("DU-03: hạng mục chạy thì dự án sang Đang triển khai, 100% thì mở nghiệm thu", daJson2.duAn.trangThai === "IN_PROGRESS" && daJson2.duAn.tienDo.phanTram === 100 && daJson2.quyen.nghiemThu === true, JSON.stringify(daJson2.duAn));

  const nghiemThu = await goi(`/api/v1/du-an/${idDa}/trang-thai`, { phuongThuc: "POST", cookie: cookieQT, than: { trangThai: "ACCEPTED", ghiChu: "Khách ký biên bản" } });
  dat("DU-05: nghiệm thu khi mọi hạng mục xong", nghiemThu.status === 200 && nghiemThu.json.trangThai === "ACCEPTED");
  const suaSauNghiemThu = await goi(`/api/v1/du-an/${idDa}/hang-muc`, { phuongThuc: "POST", cookie: cookieQT, than: { ten: "Thêm sau nghiệm thu" } });
  dat("Dự án đã nghiệm thu thì khóa hạng mục (409)", suaSauNghiemThu.status === 409 && suaSauNghiemThu.json.ma === "du-an-da-dong", `status ${suaSauNghiemThu.status}`);
  const trangDa = await goi(`/du-an/${idDa}`, { cookie: cookieQT });
  dat("Trang chi tiết dự án dựng được", trangDa.status === 200 && trangDa.text.includes(String(taoDa.json.ma)), `status ${trangDa.status}`);

  // Phân quyền: nhân viên kinh doanh không đụng bàn dịch vụ.
  const nvXemPhieu = await goi("/api/v1/ho-tro", { cookie: dnNv.cookie });
  dat("Nhân viên kinh doanh không xem được phiếu hỗ trợ", nvXemPhieu.status === 403);
  const nvTaoDuAn = await goi("/api/v1/du-an", { phuongThuc: "POST", cookie: dnNv.cookie, than: { khachHangId: khachNv, ten: "Dự án của NV" } });
  dat("Nhân viên kinh doanh không mở được dự án", nvTaoDuAn.status === 403);

  // --- 7g. Hóa đơn, công nợ, thu tiền và bảng điều hành (Phase 7) ---
  console.log("\n[7g] Tài chính và bảng điều hành");

  const homNayThu = new Date().toISOString().slice(0, 10);
  // Theo giờ Việt Nam, giống sản phẩm (xem ghi chú ở thu-tai-chinh.ts).
  const truocDay = (n: number) => congNgay(homNayVN(), -n);

  const taoHd = await goi("/api/v1/hoa-don", { phuongThuc: "POST", cookie: cookieQT, than: { donHangId: idDon2, ghiChu: "Xuất theo đơn thử HTTP" } });
  dat("TC-01: lập hóa đơn từ đơn đã xác nhận, số HD-", taoHd.status === 200 && String(taoHd.json.so).startsWith("HD-"), JSON.stringify(taoHd.json));
  const idHd = taoHd.json.id as string;

  const taoHdLai = await goi("/api/v1/hoa-don", { phuongThuc: "POST", cookie: cookieQT, than: { donHangId: idDon2 } });
  dat("TC-02: một đơn chỉ có một hóa đơn còn hiệu lực", taoHdLai.status === 200 && taoHdLai.json.id === idHd && taoHdLai.json.daCoTruoc === true, JSON.stringify(taoHdLai.json));

  const ctHdNhap = await goi(`/api/v1/hoa-don/${idHd}`, { cookie: cookieQT });
  const hdNhap = ctHdNhap.json as unknown as { hoaDon: { trangThai: string; tongCong: string; dong: unknown[]; conNo: number } };
  dat("Hóa đơn mới ở trạng thái Nháp, chép đủ dòng từ đơn", hdNhap.hoaDon.trangThai === "DRAFT" && hdNhap.hoaDon.dong.length > 0);
  dat("TC-03: hóa đơn nháp chưa sinh công nợ", hdNhap.hoaDon.conNo === 0, String(hdNhap.hoaDon.conNo));

  const hanSai = await goi(`/api/v1/hoa-don/${idHd}/phat-hanh`, { phuongThuc: "POST", cookie: cookieQT, than: { ngayPhatHanh: truocDay(10), hanThanhToan: truocDay(20) } });
  dat("Hạn thanh toán trước ngày phát hành bị 400", hanSai.status === 400, `status ${hanSai.status}`);

  const phatHanh = await goi(`/api/v1/hoa-don/${idHd}/phat-hanh`, { phuongThuc: "POST", cookie: cookieQT, than: { ngayPhatHanh: truocDay(10), hanThanhToan: truocDay(3) } });
  dat("TC-03: phát hành hóa đơn, chốt hạn thanh toán", phatHanh.status === 200 && phatHanh.json.trangThai === "ISSUED", JSON.stringify(phatHanh.json));
  const phatHanhLai = await goi(`/api/v1/hoa-don/${idHd}/phat-hanh`, { phuongThuc: "POST", cookie: cookieQT, than: { hanThanhToan: homNayThu } });
  dat("Phát hành lần hai bị 409", phatHanhLai.status === 409 && phatHanhLai.json.ma === "sai-trang-thai", `status ${phatHanhLai.status}`);

  const conNoKh = await goi(`/api/v1/cong-no/${idKh}`, { cookie: cookieQT });
  const hdConNo = conNoKh.json as unknown as { id: string; conNo: number; soNgayQuaHan: number }[];
  const cuaTa = hdConNo.find((h) => h.id === idHd);
  dat("Hóa đơn đã phát hành thì hiện trong công nợ và đã quá hạn", Boolean(cuaTa) && cuaTa!.conNo > 0 && cuaTa!.soNgayQuaHan >= 3, JSON.stringify(cuaTa));
  const tongHd = cuaTa ? cuaTa.conNo : 0;

  const thuQua = await goi("/api/v1/phieu-thu", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, phuongThuc: "chuyen-khoan", soTien: String(tongHd + 1000), phanBo: [{ hoaDonId: idHd, soTien: String(tongHd + 1000) }] },
  });
  dat("TC-05: không thu quá phần còn nợ", thuQua.status === 409 || thuQua.status === 400, `status ${thuQua.status}`);

  const lechPhanBo = await goi("/api/v1/phieu-thu", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, phuongThuc: "tien-mat", soTien: "1.000.000", phanBo: [{ hoaDonId: idHd, soTien: "600.000" }] },
  });
  dat("TC-05: tổng phân bổ lệch số tiền thu bị chặn", lechPhanBo.status === 409 || lechPhanBo.status === 400, `status ${lechPhanBo.status}`);

  const motPhan = Math.max(1, Math.round(tongHd / 2));
  const thu1 = await goi("/api/v1/phieu-thu", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, phuongThuc: "chuyen-khoan", soTien: String(motPhan), thamChieu: `UNC ${DAU}`, phanBo: [{ hoaDonId: idHd, soTien: String(motPhan) }] },
  });
  dat("TC-04: thu một phần, số phiếu PT-", thu1.status === 200 && String(thu1.json.so).startsWith("PT-"), JSON.stringify(thu1.json));
  const idPt = thu1.json.id as string;

  const ctHdSauThu = await goi(`/api/v1/hoa-don/${idHd}`, { cookie: cookieQT });
  const hdSauThu = ctHdSauThu.json as unknown as { hoaDon: { daThu: number; conNo: number; tinhTrangThu: string } };
  dat("Công nợ trừ đúng phần đã thu", hdSauThu.hoaDon.daThu === motPhan && hdSauThu.hoaDon.conNo === tongHd - motPhan && hdSauThu.hoaDon.tinhTrangThu === "thu-mot-phan", JSON.stringify([hdSauThu.hoaDon.daThu, hdSauThu.hoaDon.conNo, hdSauThu.hoaDon.tinhTrangThu]));

  const huyKhiDaThu = await goi(`/api/v1/hoa-don/${idHd}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "Thử hủy khi đã thu" } });
  dat("TC-08: hóa đơn đã thu tiền thì không hủy được", huyKhiDaThu.status === 409 && huyKhiDaThu.json.ma === "da-co-tien-thu", `status ${huyKhiDaThu.status}`);

  const huyPtThieuLyDo = await goi(`/api/v1/phieu-thu/${idPt}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "" } });
  dat("TC-09: hủy phiếu thu phải ghi lý do", huyPtThieuLyDo.status === 400, `status ${huyPtThieuLyDo.status}`);
  const huyPt = await goi(`/api/v1/phieu-thu/${idPt}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "Ghi nhầm khách trong bài thử" } });
  dat("TC-09: hủy phiếu thu", huyPt.status === 200, JSON.stringify(huyPt.json));

  const ctHdSauHuyPt = await goi(`/api/v1/hoa-don/${idHd}`, { cookie: cookieQT });
  const hdSauHuyPt = ctHdSauHuyPt.json as unknown as { hoaDon: { daThu: number; conNo: number } };
  dat("Hủy phiếu thu thì công nợ quay lại như trước", hdSauHuyPt.hoaDon.daThu === 0 && hdSauHuyPt.hoaDon.conNo === tongHd, JSON.stringify([hdSauHuyPt.hoaDon.daThu, hdSauHuyPt.hoaDon.conNo]));

  const congNoChung = await goi("/api/v1/cong-no", { cookie: cookieQT });
  const cnChung = congNoChung.json as unknown as { tomTat: { tongConNo: number; tongQuaHan: number }; khach: { khachHang: { id: string } }[] };
  dat("Công nợ tổng hợp có khách vừa phát hành, có phần quá hạn", cnChung.tomTat.tongConNo >= tongHd && cnChung.tomTat.tongQuaHan >= tongHd && cnChung.khach.some((k) => k.khachHang.id === idKh), JSON.stringify(cnChung.tomTat));

  const bdkQt = await goi("/api/v1/bang-dieu-khien", { cookie: cookieQT });
  const bdk = bdkQt.json as unknown as { banHang: { doanhThuThangNay: number } | null; congNo: { tongQuaHan: number } | null; donHang: unknown; viec: unknown };
  dat("Bảng điều hành trả số thật cho người có quyền tài chính", bdkQt.status === 200 && bdk.banHang !== null && bdk.congNo !== null && bdk.congNo!.tongQuaHan >= tongHd, JSON.stringify(bdk.congNo));

  const bdkNv = await goi("/api/v1/bang-dieu-khien", { cookie: dnNv.cookie });
  const bdkNvJson = bdkNv.json as unknown as { banHang: unknown; congNo: unknown; viec: unknown };
  dat("Người không có quyền tài chính không nhận khối doanh thu", bdkNv.status === 200 && bdkNvJson.banHang === null && bdkNvJson.congNo === null && bdkNvJson.viec !== undefined, JSON.stringify(bdkNvJson.banHang));

  const nvXemHd = await goi("/api/v1/hoa-don", { cookie: dnNv.cookie });
  dat("Nhân viên kinh doanh không xem được hóa đơn", nvXemHd.status === 403, `status ${nvXemHd.status}`);
  const nvThuTien = await goi("/api/v1/phieu-thu", { phuongThuc: "POST", cookie: dnNv.cookie, than: { khachHangId: idKh, phuongThuc: "tien-mat", soTien: "100.000", phanBo: [{ hoaDonId: idHd, soTien: "100.000" }] } });
  dat("Nhân viên kinh doanh không ghi được phiếu thu", nvThuTien.status === 403, `status ${nvThuTien.status}`);

  const trangHd = await goi(`/tai-chinh/hoa-don/${idHd}`, { cookie: cookieQT });
  dat("Trang chi tiết hóa đơn dựng được", trangHd.status === 200 && trangHd.text.includes(String(taoHd.json.so)), `status ${trangHd.status}`);
  const trangDsHd = await goi("/tai-chinh/hoa-don", { cookie: cookieQT });
  dat("Trang danh sách hóa đơn dựng được", trangDsHd.status === 200 && trangDsHd.text.includes(String(taoHd.json.so)), `status ${trangDsHd.status}`);
  const trangLapHd = await goi(`/tai-chinh/hoa-don/moi?donHang=${idDon2}`, { cookie: cookieQT });
  dat("Trang lập hóa đơn dựng được", trangLapHd.status === 200 && trangLapHd.text.includes("Lập hóa đơn"), `status ${trangLapHd.status}`);
  const trangCongNo = await goi("/tai-chinh/cong-no", { cookie: cookieQT });
  dat("Trang công nợ dựng được", trangCongNo.status === 200 && trangCongNo.text.includes("Tuổi nợ"), `status ${trangCongNo.status}`);
  const trangPt = await goi("/tai-chinh/phieu-thu", { cookie: cookieQT });
  dat("Trang phiếu thu dựng được", trangPt.status === 200 && trangPt.text.includes(String(thu1.json.so)), `status ${trangPt.status}`);
  const trangBdk = await goi("/bang-dieu-khien", { cookie: cookieQT });
  dat("Bảng điều hành dựng được với khối bán hàng", trangBdk.status === 200 && trangBdk.text.includes("Bán hàng tháng này"), `status ${trangBdk.status}`);
  const nvBangSau = await goi("/bang-dieu-khien", { cookie: dnNv.cookie });
  dat("Bảng điều hành của nhân viên không có khối doanh thu", nvBangSau.status === 200 && !nvBangSau.text.includes("Bán hàng tháng này"), `status ${nvBangSau.status}`);

  // --- 7h. Tự động hóa, Việc hôm nay, bảo trì, gia hạn (Phase 8) ---
  console.log("\n[7h] Tự động hóa và Việc hôm nay");

  const traiNgay = (n: number) => congNgay(homNayVN(), -n);

  // Đặt ngưỡng để mọi quy tắc đủ điều kiện chạy.
  const datNguong8 = await goi("/api/v1/cau-hinh", {
    phuongThuc: "PATCH",
    cookie: cookieQT,
    than: {
      giaTri: {
        "theo_doi.bao_gia_khong_phan_hoi_ngay": 5,
        "theo_doi.co_hoi_khong_hoat_dong_ngay": 7,
        "theo_doi.khach_chua_mua_lai_thang": 6,
        "theo_doi.bao_hanh_sap_het_ngay": 60,
        "tai_chinh.canh_bao_qua_han_ngay": 3,
        "tu_dong.gio_quet_hang_ngay": 7,
      },
    },
  });
  dat("Đặt được ngưỡng nhắc việc và giờ quét", datNguong8.status === 200, `status ${datNguong8.status}`);

  const tdh0 = await goi("/api/v1/tu-dong-hoa", { cookie: cookieQT });
  const tdhJson = tdh0.json as unknown as { quyTac: { ma: string; chay: boolean; lyDoBoQua: string }[]; duocSua: boolean };
  dat("TD-01: màn hình Tự động hóa liệt kê đủ quy tắc", tdh0.status === 200 && tdhJson.quyTac.length >= 8, `${tdhJson.quyTac?.length}`);
  dat("TD-01: mọi quy tắc đã đủ ngưỡng nên đều đang canh", tdhJson.quyTac.every((q) => q.chay), tdhJson.quyTac.filter((q) => !q.chay).map((q) => q.ma).join(","));

  // Một việc quá hạn để bản quét bắt được.
  const taoViecQuaHan = await goi("/api/v1/cong-viec", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { tieuDe: `Việc quá hạn HTTP ${DAU}`, han: `${traiNgay(2)}T09:00:00+07:00` },
  });
  dat("Tạo được việc quá hạn làm mồi cho bản quét", taoViecQuaHan.status === 200, JSON.stringify(taoViecQuaHan.json));

  const quet1 = await goi("/api/v1/tu-dong-hoa/chay", { phuongThuc: "POST", cookie: cookieQT, than: {} });
  const q1 = quet1.json as unknown as { soViec: number; soThongBao: number; soQuyTacChay: number; soQuyTacBoQua: number };
  dat("TD-02: chạy quét tay chạy được mọi quy tắc", quet1.status === 200 && q1.soQuyTacBoQua === 0, JSON.stringify(q1));
  dat("TD-02: bản quét sinh ít nhất một việc", q1.soViec >= 1, `${q1.soViec}`);

  const quet2 = await goi("/api/v1/tu-dong-hoa/chay", { phuongThuc: "POST", cookie: cookieQT, than: {} });
  dat("TD-02: quét lại trong ngày không sinh thêm việc", quet2.status === 200 && (quet2.json as unknown as { soViec: number }).soViec === 0, JSON.stringify(quet2.json));

  const vhn = await goi("/api/v1/viec-hom-nay", { cookie: cookieQT });
  const vhnJson = vhn.json as unknown as {
    daQuet: boolean;
    tomTat: { mo: number; khan: number };
    dong: { id: string; maQuyTac: string; mucDo: string; trangThai: string; tieuDe: string }[];
  };
  dat("Việc hôm nay đã có danh sách và biết là đã quét", vhn.status === 200 && vhnJson.daQuet === true);
  dat("Việc quá hạn nằm trong danh sách, mức Gấp", vhnJson.dong.some((v) => v.maQuyTac === "viec-qua-han" && v.mucDo === "khan"), JSON.stringify(vhnJson.tomTat));
  // Chạy nhiều lần trong ngày thì danh sách còn cả việc của lần chạy trước (đã đóng).
  // Lấy đúng dòng của việc vừa tạo ở bài này, và phải còn đang mở.
  const viecCuaBaiNay = vhnJson.dong.find((v) => v.maQuyTac === "viec-qua-han" && v.trangThai === "mo" && v.tieuDe.includes(DAU));
  dat("Tìm được đúng việc của lần chạy này, đang mở", Boolean(viecCuaBaiNay), JSON.stringify(vhnJson.dong.map((v) => [v.maQuyTac, v.trangThai])));
  const viecId = viecCuaBaiNay!.id;

  const boQuaThieuLyDo = await goi(`/api/v1/viec-hom-nay/${viecId}/bo-qua`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "" } });
  dat("TD-06: bỏ qua mà không ghi lý do bị 400", boQuaThieuLyDo.status === 400, `status ${boQuaThieuLyDo.status}`);

  const xongViec8 = await goi(`/api/v1/viec-hom-nay/${viecId}/xong`, { phuongThuc: "POST", cookie: cookieQT, than: {} });
  dat("TD-05: đánh dấu đã xử lý", xongViec8.status === 200 && xongViec8.json.trangThai === "xong");
  const xongLai = await goi(`/api/v1/viec-hom-nay/${viecId}/xong`, { phuongThuc: "POST", cookie: cookieQT, than: {} });
  dat("TD-05: đóng lại một việc đã đóng bị 409", xongLai.status === 409 && xongLai.json.ma === "da-dong", `status ${xongLai.status}`);

  const nvXemViec = await goi(`/api/v1/viec-hom-nay/${viecId}/xong`, { phuongThuc: "POST", cookie: dnNv.cookie, than: {} });
  dat("TD-03: không đóng được việc hôm nay của người khác (404)", nvXemViec.status === 404, `status ${nvXemViec.status}`);

  const tb = await goi("/api/v1/thong-bao", { cookie: cookieQT });
  const tbJson = tb.json as unknown as { soChuaDoc: number; dong: { id: string; loai: string; daDoc: boolean }[] };
  dat("TD-04: chuông có thông báo tóm tắt việc hôm nay", tb.status === 200 && tbJson.dong.some((t) => t.loai === "viec-hom-nay"), JSON.stringify(tbJson.soChuaDoc));
  const tbId = tbJson.dong.find((t) => t.loai === "viec-hom-nay")!.id;
  const docTb = await goi(`/api/v1/thong-bao/${tbId}/doc`, { phuongThuc: "POST", cookie: cookieQT, than: {} });
  dat("Đánh dấu một thông báo đã đọc", docTb.status === 200);
  const nvDocTb = await goi(`/api/v1/thong-bao/${tbId}/doc`, { phuongThuc: "POST", cookie: dnNv.cookie, than: {} });
  dat("TD-04: không đọc được thông báo của người khác (404)", nvDocTb.status === 404, `status ${nvDocTb.status}`);
  const docHet = await goi("/api/v1/thong-bao/doc-het", { phuongThuc: "POST", cookie: cookieQT, than: {} });
  dat("Đánh dấu đã đọc hết", docHet.status === 200);
  dat("Sau khi đọc hết thì không còn chưa đọc", ((await goi("/api/v1/thong-bao", { cookie: cookieQT })).json as unknown as { soChuaDoc: number }).soChuaDoc === 0);

  const nvBatQuyTac = await goi("/api/v1/tu-dong-hoa/quy-tac/viec-qua-han", { phuongThuc: "PATCH", cookie: dnNv.cookie, than: { bat: false } });
  dat("TD-07: nhân viên không tắt được quy tắc", nvBatQuyTac.status === 403, `status ${nvBatQuyTac.status}`);
  const nvChayQuet = await goi("/api/v1/tu-dong-hoa/chay", { phuongThuc: "POST", cookie: dnNv.cookie, than: {} });
  dat("TD-07: nhân viên không chạy được bản quét", nvChayQuet.status === 403, `status ${nvChayQuet.status}`);
  const tatQuyTac = await goi("/api/v1/tu-dong-hoa/quy-tac/viec-qua-han", { phuongThuc: "PATCH", cookie: cookieQT, than: { bat: false } });
  dat("Quản trị tắt được quy tắc", tatQuyTac.status === 200 && tatQuyTac.json.bat === false);
  const quyTacLa = await goi("/api/v1/tu-dong-hoa/quy-tac/khong-co-that", { phuongThuc: "PATCH", cookie: cookieQT, than: { bat: true } });
  dat("Mã quy tắc không có thật bị 404", quyTacLa.status === 404, `status ${quyTacLa.status}`);
  await goi("/api/v1/tu-dong-hoa/quy-tac/viec-qua-han", { phuongThuc: "PATCH", cookie: cookieQT, than: { bat: true } });

  // --- Hợp đồng bảo trì ---
  const taoBt = await goi("/api/v1/bao-tri", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: {
      khachHangId: idKh,
      ten: `Bảo trì định kỳ HTTP ${DAU}`,
      phamVi: "Vệ sinh, kiểm tra, thay vật tư",
      ngayBatDau: traiNgay(10),
      ngayKetThuc: `${new Date().getFullYear() + 1}-12-31`,
      chuKyThang: 3,
      giaTri: "12.000.000",
    },
  });
  dat("BT-01: lập hợp đồng bảo trì, mã BT-", taoBt.status === 200 && String(taoBt.json.ma).startsWith("BT-"), JSON.stringify(taoBt.json));
  const idBt = taoBt.json.id as string;

  const ngaySai = await goi("/api/v1/bao-tri", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { khachHangId: idKh, ten: "Hợp đồng sai ngày", ngayBatDau: traiNgay(1), ngayKetThuc: traiNgay(5), chuKyThang: 3 },
  });
  dat("Ngày kết thúc trước ngày bắt đầu bị 400", ngaySai.status === 400, `status ${ngaySai.status}`);

  const ctBt = await goi(`/api/v1/bao-tri/${idBt}`, { cookie: cookieQT });
  const btJson = ctBt.json as unknown as { hopDong: { kyKeTiep: string | null; tinhTrangKy: string; chuKyThang: number } };
  dat("BT-02: kỳ đầu tiên là ngày bắt đầu hợp đồng", btJson.hopDong.kyKeTiep === traiNgay(10), String(btJson.hopDong.kyKeTiep));
  dat("BT-02: kỳ đầu đã qua nên đang trễ kỳ", btJson.hopDong.tinhTrangKy === "tre-ky", btJson.hopDong.tinhTrangKy);

  const ghiTuongLai = await goi(`/api/v1/bao-tri/${idBt}/ghi-nhan`, { phuongThuc: "POST", cookie: cookieQT, than: { ngayBaoTri: "2099-01-01" } });
  dat("Không ghi nhận bảo trì cho ngày tương lai", ghiTuongLai.status === 400, `status ${ghiTuongLai.status}`);

  const ghiNhan = await goi(`/api/v1/bao-tri/${idBt}/ghi-nhan`, { phuongThuc: "POST", cookie: cookieQT, than: { ngayBaoTri: traiNgay(1), ghiChu: "Đã vệ sinh" } });
  dat("BT-03: ghi nhận bảo trì đẩy mốc kỳ kế tiếp", ghiNhan.status === 200 && Boolean(ghiNhan.json.kyKeTiep), JSON.stringify(ghiNhan.json));
  const ctBt2 = await goi(`/api/v1/bao-tri/${idBt}`, { cookie: cookieQT });
  dat("BT-03: sau ghi nhận thì không còn trễ kỳ", (ctBt2.json as unknown as { hopDong: { tinhTrangKy: string } }).hopDong.tinhTrangKy === "cho-ky-sau");

  const huyThieuLyDo8 = await goi(`/api/v1/bao-tri/${idBt}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "" } });
  dat("Hủy hợp đồng bảo trì phải ghi lý do", huyThieuLyDo8.status === 400, `status ${huyThieuLyDo8.status}`);

  // --- Gia hạn ---
  const dsGh = await goi("/api/v1/gia-han?trangThai=tat-ca", { cookie: cookieQT });
  dat("Đọc được lịch gia hạn", dsGh.status === 200);

  const trangVhn = await goi("/viec-hom-nay", { cookie: cookieQT });
  dat("Trang Việc hôm nay dựng được", trangVhn.status === 200 && trangVhn.text.includes("Việc hôm nay"), `status ${trangVhn.status}`);
  const trangTdh = await goi("/quan-tri/tu-dong-hoa", { cookie: cookieQT });
  dat("Trang Tự động hóa dựng được", trangTdh.status === 200 && trangTdh.text.includes("Quy tắc đang canh"), `status ${trangTdh.status}`);
  const trangBt = await goi("/dich-vu/bao-tri", { cookie: cookieQT });
  dat("Trang Hợp đồng bảo trì dựng được", trangBt.status === 200 && trangBt.text.includes(String(taoBt.json.ma)), `status ${trangBt.status}`);
  const trangBtCt = await goi(`/dich-vu/bao-tri/${idBt}`, { cookie: cookieQT });
  dat("Trang chi tiết hợp đồng bảo trì dựng được", trangBtCt.status === 200 && trangBtCt.text.includes("Kỳ bảo trì kế tiếp"), `status ${trangBtCt.status}`);
  const trangBtMoi = await goi("/dich-vu/bao-tri/moi", { cookie: cookieQT });
  dat("Trang lập hợp đồng bảo trì dựng được", trangBtMoi.status === 200 && trangBtMoi.text.includes("Kỳ hạn và chu kỳ"), `status ${trangBtMoi.status}`);
  const trangGh = await goi("/dich-vu/gia-han", { cookie: cookieQT });
  dat("Trang Lịch gia hạn dựng được", trangGh.status === 200 && trangGh.text.includes("Lịch gia hạn"), `status ${trangGh.status}`);

  const nvTrangTdh = await goi("/quan-tri/tu-dong-hoa", { cookie: dnNv.cookie });
  const tdhChuyenHuong =
    (nvTrangTdh.status === 307 && Boolean(nvTrangTdh.location?.includes("/khong-co-quyen"))) ||
    (nvTrangTdh.status === 200 && nvTrangTdh.text.includes("NEXT_REDIRECT;replace;/khong-co-quyen"));
  dat(
    "Nhân viên mở trang Tự động hóa bị chuyển sang /khong-co-quyen, không lộ quy tắc",
    tdhChuyenHuong && !nvTrangTdh.text.includes("Quy tắc đang canh"),
    `status ${nvTrangTdh.status}`,
  );
  const nvTrangVhn = await goi("/viec-hom-nay", { cookie: dnNv.cookie });
  dat("Ai đăng nhập cũng mở được Việc hôm nay của mình", nvTrangVhn.status === 200, `status ${nvTrangVhn.status}`);

  // --- 7i. Trợ lý ITA (Phase 9) ---
  console.log("\n[7i] Trợ lý ITA");

  const troLy = await goi("/api/v1/tro-ly", { cookie: cookieQT });
  const troLyJson = troLy.json as unknown as {
    trangThai: { daCauHinh: boolean; lyDo: string; soCongCuKhaDung: number; congCu: { ten: string }[] };
    hoiThoai: unknown[];
  };
  dat("Đọc được tình trạng trợ lý", troLy.status === 200 && Array.isArray(troLyJson.trangThai.congCu));
  dat(
    "Giám đốc được mời nhiều công cụ",
    troLyJson.trangThai.soCongCuKhaDung >= 8,
    String(troLyJson.trangThai.soCongCuKhaDung),
  );

  const nvTroLy = await goi("/api/v1/tro-ly", { cookie: dnNv.cookie });
  const nvTroLyJson = nvTroLy.json as unknown as { trangThai: { soCongCuKhaDung: number } };
  dat(
    "AI-01: nhân viên được mời ÍT công cụ hơn giám đốc",
    nvTroLy.status === 200 && nvTroLyJson.trangThai.soCongCuKhaDung < troLyJson.trangThai.soCongCuKhaDung,
    `${nvTroLyJson.trangThai?.soCongCuKhaDung} < ${troLyJson.trangThai.soCongCuKhaDung}`,
  );

  // Máy chủ thử không có khóa API nên trợ lý phải TỪ CHỐI, không được bịa câu trả lời.
  const hoiKhiChuaCauHinh = await goi("/api/v1/tro-ly/hoi", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { cauHoi: "Khách nào đang nợ quá hạn nhiều nhất?" },
  });
  if (troLyJson.trangThai.daCauHinh) {
    dat("Trợ lý đã cấu hình: trả lời được", hoiKhiChuaCauHinh.status === 200, `status ${hoiKhiChuaCauHinh.status}`);
  } else {
    dat(
      "AI-06: chưa cấu hình thì trả 503 kèm lý do, KHÔNG bịa câu trả lời",
      hoiKhiChuaCauHinh.status === 503 && hoiKhiChuaCauHinh.json.ma === "ai-chua-cau-hinh",
      `status ${hoiKhiChuaCauHinh.status} ${JSON.stringify(hoiKhiChuaCauHinh.json).slice(0, 160)}`,
    );
    dat(
      "AI-06: thông báo nói rõ thiếu gì để người quản trị biết đường sửa",
      String(hoiKhiChuaCauHinh.json.thongBao ?? "").includes("ANTHROPIC_API_KEY"),
      String(hoiKhiChuaCauHinh.json.thongBao ?? ""),
    );
  }

  const hoiRong = await goi("/api/v1/tro-ly/hoi", { phuongThuc: "POST", cookie: cookieQT, than: { cauHoi: "" } });
  dat("Câu hỏi rỗng bị 400", hoiRong.status === 400, `status ${hoiRong.status}`);

  const hoiThoaiLa = await goi("/api/v1/tro-ly/hoi-thoai/00000000-0000-4000-8000-000000000000", { cookie: cookieQT });
  dat("Hội thoại không tồn tại trả 404", hoiThoaiLa.status === 404, `status ${hoiThoaiLa.status}`);

  const duyetLa = await goi("/api/v1/tro-ly/de-xuat/00000000-0000-4000-8000-000000000000/duyet", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: {},
  });
  dat("Duyệt một đề xuất không tồn tại trả 404", duyetLa.status === 404, `status ${duyetLa.status}`);

  const trangTroLy = await goi("/tro-ly", { cookie: cookieQT });
  dat("Trang Trợ lý dựng được", trangTroLy.status === 200 && trangTroLy.text.includes("Trợ lý ITA"), `status ${trangTroLy.status}`);
  dat(
    "Trang nói thật về tình trạng cấu hình thay vì để ô chat chết",
    trangTroLy.text.includes(troLyJson.trangThai.daCauHinh ? "Sẵn sàng" : "Chưa cấu hình"),
  );

  // --- 7j. Mua hàng: đề nghị → đơn mua → nhận hàng (phần để lại từ Phase 5) ---
  console.log("\n[7j] Mua hàng");

  const taoDn = await goi("/api/v1/de-nghi-mua", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: {
      lyDo: `Bổ sung tồn kho HTTP ${DAU}`,
      ngayCan: congNgay(homNayVN(), 14),
      dong: [{ sanPhamId: idSp, ten: `Hàng thử HTTP ${DAU}`, soLuong: "6", giaDuKien: "1.200.000" }],
    },
  });
  dat("MH-01: lập đề nghị mua, số DN-", taoDn.status === 200 && String(taoDn.json.so).startsWith("DN-"), JSON.stringify(taoDn.json));
  const idDn = taoDn.json.id as string;

  const dnRong = await goi("/api/v1/de-nghi-mua", { phuongThuc: "POST", cookie: cookieQT, than: { dong: [] } });
  dat("Đề nghị không có dòng nào bị 400", dnRong.status === 400, `status ${dnRong.status}`);

  const ctDn = await goi(`/api/v1/de-nghi-mua/${idDn}`, { cookie: cookieQT });
  const dnJson = ctDn.json as unknown as {
    deNghi: { trangThai: string; tongDuKien: number; dong: { id: string }[] };
    quyen: { xinDuyet: boolean; duyet: boolean; taoDonMua: boolean };
  };
  dat("Đề nghị ở trạng thái Nháp, tổng dự kiến đúng (6 × 1,2tr)", dnJson.deNghi.trangThai === "DRAFT" && dnJson.deNghi.tongDuKien === 7_200_000, String(dnJson.deNghi.tongDuKien));
  dat("Chưa duyệt thì chưa cho tạo đơn mua", dnJson.quyen.taoDonMua === false);

  const duyetSom = await goi(`/api/v1/de-nghi-mua/${idDn}/duyet`, { phuongThuc: "POST", cookie: cookieQT, than: { quyetDinh: "cho-duyet" } });
  dat("MH-02: chưa gửi duyệt thì không duyệt được (409)", duyetSom.status === 409 && duyetSom.json.ma === "sai-trang-thai", `status ${duyetSom.status}`);

  const xinDuyet = await goi(`/api/v1/de-nghi-mua/${idDn}/xin-duyet`, { phuongThuc: "POST", cookie: cookieQT, than: {} });
  dat("Gửi duyệt được", xinDuyet.status === 200 && xinDuyet.json.trangThai === "PENDING_APPROVAL");

  const suaSauGui = await goi(`/api/v1/de-nghi-mua/${idDn}`, { phuongThuc: "PATCH", cookie: cookieQT, than: { lyDo: "sửa lén" } });
  dat("Đề nghị chờ duyệt thì khóa sửa (409)", suaSauGui.status === 409, `status ${suaSauGui.status}`);

  const tuChoiThieuLyDo = await goi(`/api/v1/de-nghi-mua/${idDn}/duyet`, { phuongThuc: "POST", cookie: cookieQT, than: { quyetDinh: "tu-choi" } });
  dat("MH-02: từ chối mà không ghi lý do bị 400", tuChoiThieuLyDo.status === 400, `status ${tuChoiThieuLyDo.status}`);

  const nvDuyet = await goi(`/api/v1/de-nghi-mua/${idDn}/duyet`, { phuongThuc: "POST", cookie: dnNv.cookie, than: { quyetDinh: "cho-duyet" } });
  dat("Nhân viên kinh doanh không duyệt được đề nghị mua", nvDuyet.status === 403, `status ${nvDuyet.status}`);

  const duyetDn = await goi(`/api/v1/de-nghi-mua/${idDn}/duyet`, { phuongThuc: "POST", cookie: cookieQT, than: { quyetDinh: "cho-duyet", ghiChu: "Đồng ý" } });
  dat("MH-02: duyệt đề nghị", duyetDn.status === 200 && duyetDn.json.trangThai === "APPROVED", JSON.stringify(duyetDn.json));

  // --- Đơn mua ---
  const dsNcc = await goi("/api/v1/nha-cung-cap?trangThai=hoat-dong", { cookie: cookieQT });
  const idNccMh = ((dsNcc.json.dong as { id: string }[]) ?? [])[0]?.id;
  dat("Có nhà cung cấp để đặt hàng", Boolean(idNccMh), `status ${dsNcc.status}`);

  const taoDm = await goi("/api/v1/don-mua", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: {
      nhaCungCapId: idNccMh,
      khoId: idKho,
      deNghiId: idDn,
      ngayHenGiao: congNgay(homNayVN(), 7),
      dong: [{ sanPhamId: idSp, ten: `Hàng thử HTTP ${DAU}`, soLuong: "6", donGia: "1.200.000", vat: 10 }],
    },
  });
  dat("MH-01: lập đơn mua, số DM-", taoDm.status === 200 && String(taoDm.json.so).startsWith("DM-"), JSON.stringify(taoDm.json));
  const idDm = taoDm.json.id as string;

  const ctDm = await goi(`/api/v1/don-mua/${idDm}`, { cookie: cookieQT });
  const dmJson = ctDm.json as unknown as {
    donMua: { trangThai: string; tongCong: string; dong: { id: string; conPhaiNhan: number }[]; tienDo: { tongDat: number } };
    quyen: { gui: boolean; nhanHang: boolean };
  };
  dat("Tổng tiền đơn mua đúng (7,2tr + 10% VAT)", dmJson.donMua.tongCong === "7920000", dmJson.donMua.tongCong);
  dat("Đơn mua ở trạng thái Nháp, chưa nhận hàng được", dmJson.donMua.trangThai === "DRAFT" && dmJson.quyen.nhanHang === false);
  const dongDm = dmJson.donMua.dong[0].id;

  const ctDnSau = await goi(`/api/v1/de-nghi-mua/${idDn}`, { cookie: cookieQT });
  dat("Đề nghị chuyển sang Đã đặt hàng", (ctDnSau.json as unknown as { deNghi: { trangThai: string } }).deNghi.trangThai === "ORDERED");

  const nhanSom = await goi(`/api/v1/don-mua/${idDm}/nhan-hang`, { phuongThuc: "POST", cookie: cookieQT, than: { dong: [{ dongDonId: dongDm, soLuong: "1" }] } });
  dat("Chưa gửi nhà cung cấp thì chưa nhận hàng được (409)", nhanSom.status === 409, `status ${nhanSom.status}`);

  const guiDm = await goi(`/api/v1/don-mua/${idDm}/gui`, { phuongThuc: "POST", cookie: cookieQT, than: {} });
  dat("Gửi đơn mua cho nhà cung cấp", guiDm.status === 200 && guiDm.json.trangThai === "SENT");

  const suaDmSauGui = await goi(`/api/v1/don-mua/${idDm}`, {
    phuongThuc: "PATCH",
    cookie: cookieQT,
    than: { dong: [{ ten: "Sửa lén", soLuong: "1", donGia: "1" }] },
  });
  dat("MH-04: đơn đã gửi thì khóa dòng hàng (409)", suaDmSauGui.status === 409, `status ${suaDmSauGui.status}`);

  const nhanQua = await goi(`/api/v1/don-mua/${idDm}/nhan-hang`, { phuongThuc: "POST", cookie: cookieQT, than: { dong: [{ dongDonId: dongDm, soLuong: "99" }] } });
  dat("MH-05: nhận quá số đặt bị 409", nhanQua.status === 409 && nhanQua.json.ma === "nhan-qua-so-luong", `status ${nhanQua.status}`);

  const thieuSerialMh = await goi(`/api/v1/don-mua/${idDm}/nhan-hang`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { dong: [{ dongDonId: dongDm, soLuong: "4" }] },
  });
  dat("MH-06: hàng theo sê-ri mà thiếu sê-ri bị 400", thieuSerialMh.status === 400 && thieuSerialMh.json.ma === "thieu-serial", `status ${thieuSerialMh.status}`);

  const tonTruoc = await goi(`/api/v1/kho/ton?q=${encodeURIComponent(skuThu)}`, { cookie: cookieQT });
  const conTruoc = (((tonTruoc.json.dong as { tonKho: number }[]) ?? [])[0]?.tonKho) ?? 0;

  const nhan1 = await goi(`/api/v1/don-mua/${idDm}/nhan-hang`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: {
      soChungTuNcc: `HD-NCC-${DAU}`,
      dong: [{ dongDonId: dongDm, soLuong: "4", serial: [`MUA-${DAU}-1`, `MUA-${DAU}-2`, `MUA-${DAU}-3`, `MUA-${DAU}-4`] }],
    },
  });
  dat("MH-01: phiếu nhận có số NK-", nhan1.status === 200 && String(nhan1.json.so).startsWith("NK-"), JSON.stringify(nhan1.json));
  dat("MH-07: nhận một phần thì đơn chuyển PARTIALLY_RECEIVED", nhan1.json.trangThaiDon === "PARTIALLY_RECEIVED", String(nhan1.json.trangThaiDon));

  const tonSau = await goi(`/api/v1/kho/ton?q=${encodeURIComponent(skuThu)}`, { cookie: cookieQT });
  const conSau = (((tonSau.json.dong as { tonKho: number }[]) ?? [])[0]?.tonKho) ?? 0;
  dat("MH-06: hàng nhận vào cộng thẳng vào tồn kho", conSau === conTruoc + 4, `${conTruoc} → ${conSau}`);

  const huySauNhan = await goi(`/api/v1/don-mua/${idDm}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "Thử hủy" } });
  dat("MH-08: đơn đã nhận một phần thì không hủy (409)", huySauNhan.status === 409 && huySauNhan.json.ma === "da-nhan-hang", `status ${huySauNhan.status}`);

  const nhan2 = await goi(`/api/v1/don-mua/${idDm}/nhan-hang`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { dong: [{ dongDonId: dongDm, soLuong: "2", serial: [`MUA-${DAU}-5`, `MUA-${DAU}-6`] }] },
  });
  dat("MH-07: nhận nốt thì đơn chuyển RECEIVED", nhan2.status === 200 && nhan2.json.trangThaiDon === "RECEIVED", String(nhan2.json.trangThaiDon));

  const nhanThem = await goi(`/api/v1/don-mua/${idDm}/nhan-hang`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { dong: [{ dongDonId: dongDm, soLuong: "1", serial: [`MUA-${DAU}-7`] }] },
  });
  dat("Đơn đã nhận đủ thì không nhận thêm (409)", nhanThem.status === 409, `status ${nhanThem.status}`);

  const goiY = await goi(`/api/v1/mua-hang/goi-y/${idDon2}`, { cookie: cookieQT });
  dat("Đọc được gợi ý mua cho đơn bán", goiY.status === 200 && Array.isArray((goiY.json as unknown as { thieu: unknown[] }).thieu), `status ${goiY.status}`);

  const nvXemMh = await goi("/api/v1/don-mua", { cookie: dnNv.cookie });
  dat("Nhân viên kinh doanh không xem được đơn mua", nvXemMh.status === 403, `status ${nvXemMh.status}`);

  const trangDnMh = await goi("/mua-hang/de-nghi?trangThai=tat-ca", { cookie: cookieQT });
  dat("Trang Đề nghị mua dựng được", trangDnMh.status === 200 && trangDnMh.text.includes(String(taoDn.json.so)), `status ${trangDnMh.status}`);
  const trangDnLoc = await goi("/mua-hang/de-nghi", { cookie: cookieQT });
  dat(
    "Danh sách mặc định ẩn đề nghị đã chuyển thành đơn mua",
    trangDnLoc.status === 200 && !trangDnLoc.text.includes(String(taoDn.json.so)),
    `status ${trangDnLoc.status}`,
  );
  const trangDnMhCt = await goi(`/mua-hang/de-nghi/${idDn}`, { cookie: cookieQT });
  dat("Trang chi tiết đề nghị dựng được", trangDnMhCt.status === 200 && trangDnMhCt.text.includes("Hàng đề nghị mua"), `status ${trangDnMhCt.status}`);
  const trangDnMhMoi = await goi(`/mua-hang/de-nghi/moi?donBan=${idDon2}`, { cookie: cookieQT });
  dat("Trang lập đề nghị dựng được", trangDnMhMoi.status === 200 && trangDnMhMoi.text.includes("Hàng cần mua"), `status ${trangDnMhMoi.status}`);
  const trangDm = await goi("/mua-hang/don-mua?trangThai=tat-ca", { cookie: cookieQT });
  dat("Trang Đơn mua dựng được", trangDm.status === 200 && trangDm.text.includes(String(taoDm.json.so)), `status ${trangDm.status}`);
  const trangDmLoc = await goi("/mua-hang/don-mua", { cookie: cookieQT });
  dat(
    "Danh sách mặc định ẩn đơn mua đã nhận đủ",
    trangDmLoc.status === 200 && !trangDmLoc.text.includes(String(taoDm.json.so)),
    `status ${trangDmLoc.status}`,
  );
  const trangDmCt = await goi(`/mua-hang/don-mua/${idDm}`, { cookie: cookieQT });
  dat("Trang chi tiết đơn mua dựng được", trangDmCt.status === 200 && trangDmCt.text.includes("Phiếu nhận hàng"), `status ${trangDmCt.status}`);
  const trangDmMoi = await goi("/mua-hang/don-mua/moi", { cookie: cookieQT });
  dat("Trang lập đơn mua dựng được", trangDmMoi.status === 200 && trangDmMoi.text.includes("Hàng đặt mua"), `status ${trangDmMoi.status}`);

  // --- 7k. Công nợ phải trả: hóa đơn nhà cung cấp và phiếu chi ---
  console.log("\n[7k] Công nợ phải trả");

  const taoHm = await goi("/api/v1/hoa-don-mua", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { donMuaId: idDm, soHoaDonNcc: `AA/25E-${DAU}` },
  });
  dat("CT-01: lập hóa đơn nhà cung cấp, số HM-", taoHm.status === 200 && String(taoHm.json.so).startsWith("HM-"), JSON.stringify(taoHm.json));
  const idHm = taoHm.json.id as string;

  const taoHmLai = await goi("/api/v1/hoa-don-mua", { phuongThuc: "POST", cookie: cookieQT, than: { donMuaId: idDm } });
  dat("CT-02: một đơn mua chỉ có một hóa đơn còn hiệu lực", taoHmLai.status === 200 && taoHmLai.json.id === idHm && taoHmLai.json.daCoTruoc === true, JSON.stringify(taoHmLai.json));

  const ctHm = await goi(`/api/v1/hoa-don-mua/${idHm}`, { cookie: cookieQT });
  const hmJson = ctHm.json as unknown as {
    hoaDon: { trangThai: string; tongCong: string; conNo: number; tinhTrangTra: string; dong: { daNhan: string | null; lechVoiNhan: number | null }[] };
    quyen: { ghiNhan: boolean; chiTien: boolean };
  };
  dat("Hóa đơn chép đúng số tiền của đơn mua (7,2tr + VAT)", hmJson.hoaDon.tongCong === "7920000", hmJson.hoaDon.tongCong);
  dat("CT-03: hóa đơn nháp CHƯA tính vào nợ phải trả", hmJson.hoaDon.conNo === 0 && hmJson.hoaDon.tinhTrangTra === "khong-tinh");
  dat("Đối chiếu ba chiều: hóa đơn biết đã nhận bao nhiêu", hmJson.hoaDon.dong[0].daNhan === "6" && hmJson.hoaDon.dong[0].lechVoiNhan === 0, JSON.stringify(hmJson.hoaDon.dong[0]));
  dat("Chưa ghi nhận thì chưa chi tiền được", hmJson.quyen.chiTien === false);

  const chiSom = await goi("/api/v1/phieu-chi", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { nhaCungCapId: idNccMh, phuongThuc: "chuyen-khoan", soTien: "1.000.000", phanBo: [{ hoaDonId: idHm, soTien: "1.000.000" }] },
  });
  dat("Chi tiền cho hóa đơn chưa ghi nhận bị 409", chiSom.status === 409 && chiSom.json.ma === "hoa-don-chua-ghi-nhan", `status ${chiSom.status}`);

  const ghiThieuHan = await goi(`/api/v1/hoa-don-mua/${idHm}/ghi-nhan`, { phuongThuc: "POST", cookie: cookieQT, than: { ngayHoaDon: homNayVN() } });
  dat("CT-04: ghi nhận mà không có hạn thanh toán bị 400", ghiThieuHan.status === 400, `status ${ghiThieuHan.status}`);

  const hanSaiHm = await goi(`/api/v1/hoa-don-mua/${idHm}/ghi-nhan`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { ngayHoaDon: congNgay(homNayVN(), -5), hanThanhToan: congNgay(homNayVN(), -10) },
  });
  dat("Hạn trước ngày hóa đơn bị 400", hanSaiHm.status === 400, `status ${hanSaiHm.status}`);

  const ghiNhanHm = await goi(`/api/v1/hoa-don-mua/${idHm}/ghi-nhan`, {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { ngayHoaDon: congNgay(homNayVN(), -20), hanThanhToan: congNgay(homNayVN(), -3) },
  });
  dat("CT-03: ghi nhận hóa đơn", ghiNhanHm.status === 200 && ghiNhanHm.json.trangThai === "RECORDED", JSON.stringify(ghiNhanHm.json));

  const ctHm2 = await goi(`/api/v1/hoa-don-mua/${idHm}`, { cookie: cookieQT });
  const hm2 = ctHm2.json as unknown as { hoaDon: { conNo: number; soNgayQuaHan: number; nhomTuoiNo: string } };
  dat("Ghi nhận rồi thì nợ phải trả bằng tổng hóa đơn", hm2.hoaDon.conNo === 7_920_000, String(hm2.hoaDon.conNo));
  dat("CT-07: quá hạn 3 ngày, nhóm tuổi nợ 1–30", hm2.hoaDon.soNgayQuaHan === 3 && hm2.hoaDon.nhomTuoiNo === "1-30", JSON.stringify(hm2.hoaDon));

  const conNoNcc = await goi(`/api/v1/cong-no-tra/${idNccMh}`, { cookie: cookieQT });
  const dsConNoNcc = conNoNcc.json as unknown as { id: string; conNo: number }[];
  dat("Hóa đơn hiện trong danh sách còn nợ của nhà cung cấp", Array.isArray(dsConNoNcc) && dsConNoNcc.some((x) => x.id === idHm));

  const chiQua = await goi("/api/v1/phieu-chi", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { nhaCungCapId: idNccMh, phuongThuc: "chuyen-khoan", soTien: "9.000.000", phanBo: [{ hoaDonId: idHm, soTien: "9.000.000" }] },
  });
  dat("CT-05: chi quá phần còn nợ bị 409", chiQua.status === 409 && chiQua.json.ma === "chi-vuot-cong-no", `status ${chiQua.status}`);

  const chiLech = await goi("/api/v1/phieu-chi", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: { nhaCungCapId: idNccMh, phuongThuc: "tien-mat", soTien: "1.000.000", phanBo: [{ hoaDonId: idHm, soTien: "600.000" }] },
  });
  dat("CT-05: tổng phân bổ lệch số tiền chi bị chặn", chiLech.status === 400 || chiLech.status === 409, `status ${chiLech.status}`);

  const chiMotPhan = await goi("/api/v1/phieu-chi", {
    phuongThuc: "POST",
    cookie: cookieQT,
    than: {
      nhaCungCapId: idNccMh,
      phuongThuc: "chuyen-khoan",
      soTien: "3.000.000",
      thamChieu: `UNC ${DAU}`,
      phanBo: [{ hoaDonId: idHm, soTien: "3.000.000" }],
    },
  });
  dat("CT-05: chi một phần, số phiếu PC-", chiMotPhan.status === 200 && String(chiMotPhan.json.so).startsWith("PC-"), JSON.stringify(chiMotPhan.json));
  const idPc = chiMotPhan.json.id as string;

  const ctHm3 = await goi(`/api/v1/hoa-don-mua/${idHm}`, { cookie: cookieQT });
  const hm3 = ctHm3.json as unknown as { hoaDon: { daTra: number; conNo: number; tinhTrangTra: string } };
  dat("CT-06: nợ trừ đúng phần đã chi", hm3.hoaDon.daTra === 3_000_000 && hm3.hoaDon.conNo === 4_920_000 && hm3.hoaDon.tinhTrangTra === "thu-mot-phan", JSON.stringify(hm3.hoaDon));

  const huyHmKhiDaChi = await goi(`/api/v1/hoa-don-mua/${idHm}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "Thử hủy" } });
  dat("CT-08: hóa đơn đã chi tiền thì không hủy được", huyHmKhiDaChi.status === 409 && huyHmKhiDaChi.json.ma === "da-co-tien-chi", `status ${huyHmKhiDaChi.status}`);

  const cnTra = await goi("/api/v1/cong-no-tra", { cookie: cookieQT });
  const cnTraJson = cnTra.json as unknown as { tomTat: { tongConNo: number; tongQuaHan: number }; nhaCungCap: { nhaCungCap: { id: string } }[] };
  dat("Bảng công nợ phải trả gom đúng nhà cung cấp", cnTra.status === 200 && cnTraJson.nhaCungCap.some((n) => n.nhaCungCap.id === idNccMh), JSON.stringify(cnTraJson.tomTat));
  dat("Toàn bộ nợ đang quá hạn", cnTraJson.tomTat.tongQuaHan >= 4_920_000, JSON.stringify(cnTraJson.tomTat));

  const huyPcThieuLyDo = await goi(`/api/v1/phieu-chi/${idPc}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "" } });
  dat("CT-09: hủy phiếu chi phải ghi lý do", huyPcThieuLyDo.status === 400, `status ${huyPcThieuLyDo.status}`);
  const huyPc = await goi(`/api/v1/phieu-chi/${idPc}/huy`, { phuongThuc: "POST", cookie: cookieQT, than: { lyDo: "Chuyển nhầm số tài khoản" } });
  dat("CT-09: hủy phiếu chi", huyPc.status === 200, JSON.stringify(huyPc.json));

  const ctHm4 = await goi(`/api/v1/hoa-don-mua/${idHm}`, { cookie: cookieQT });
  const hm4 = ctHm4.json as unknown as { hoaDon: { daTra: number; conNo: number } };
  dat("CT-09: hủy phiếu chi thì nợ quay lại như trước", hm4.hoaDon.daTra === 0 && hm4.hoaDon.conNo === 7_920_000, JSON.stringify(hm4.hoaDon));

  const nvXemHm = await goi("/api/v1/hoa-don-mua", { cookie: dnNv.cookie });
  dat("Nhân viên kinh doanh không xem được hóa đơn nhà cung cấp", nvXemHm.status === 403, `status ${nvXemHm.status}`);

  const trangHm = await goi("/tai-chinh/hoa-don-mua?trangThai=tat-ca", { cookie: cookieQT });
  dat("Trang Hóa đơn nhà cung cấp dựng được", trangHm.status === 200 && trangHm.text.includes(String(taoHm.json.so)), `status ${trangHm.status}`);
  const trangHmCt = await goi(`/tai-chinh/hoa-don-mua/${idHm}`, { cookie: cookieQT });
  dat("Trang chi tiết hóa đơn nhà cung cấp dựng được", trangHmCt.status === 200 && trangHmCt.text.includes("Nội dung hóa đơn"), `status ${trangHmCt.status}`);
  const trangCnTra = await goi("/tai-chinh/cong-no-tra", { cookie: cookieQT });
  dat("Trang Công nợ phải trả dựng được", trangCnTra.status === 200 && trangCnTra.text.includes("Tuổi nợ"), `status ${trangCnTra.status}`);
  const trangPc = await goi("/tai-chinh/phieu-chi", { cookie: cookieQT });
  dat("Trang Phiếu chi dựng được", trangPc.status === 200 && trangPc.text.includes(String(chiMotPhan.json.so)), `status ${trangPc.status}`);

  // --- 8. Khóa tạm khi sai mật khẩu, quản trị mở khóa ---
  let lanCuoi: PhanHoi | null = null;
  for (let i = 0; i < 5; i++) lanCuoi = await dangNhap(emailNv, "sai-mat-khau-1");
  dat("5 lần sai đều bị từ chối", lanCuoi?.status === 401);
  const dungMaVanBiChan = await dangNhap(emailNv, matKhauNv);
  dat("Sau 5 lần sai, mật khẩu đúng cũng bị chặn 429", dungMaVanBiChan.status === 429);
  const chiTietNv = await goi(`/api/v1/nguoi-dung/${idNv}`, { cookie: cookieQT });
  dat("Quản trị thấy tài khoản đang bị khóa tạm", Boolean(chiTietNv.json.khoaDen));
  const moKhoa = await goi(`/api/v1/nguoi-dung/${idNv}`, { phuongThuc: "PATCH", cookie: cookieQT, than: { moKhoaDangNhap: true } });
  dat("Quản trị mở khóa đăng nhập", moKhoa.status === 200);
  const sauMoKhoa = await dangNhap(emailNv, matKhauNv);
  dat("Sau khi mở khóa, nhân viên đăng nhập lại được", sauMoKhoa.status === 200, `status ${sauMoKhoa.status}`);

  // --- 9. Email không tồn tại bị giới hạn giống hệt email thật ---
  const emailMa = `khong-ton-tai-${DAU}@thu.test`;
  const kqMa: number[] = [];
  for (let i = 0; i < 6; i++) kqMa.push((await dangNhap(emailMa, "gi-do-12345")).status);
  dat("Email không tồn tại: 5 lần 401 rồi 429 (không lộ email nào có thật)", kqMa.slice(0, 5).every((s) => s === 401) && kqMa[5] === 429, kqMa.join(","));

  // --- 10. Ngừng hoạt động thì phiên đang mở mất hiệu lực ngay ---
  const ngung = await goi(`/api/v1/nguoi-dung/${idNv}`, { phuongThuc: "PATCH", cookie: cookieQT, than: { trangThai: "ngung-hoat-dong" } });
  dat("Quản trị ngừng hoạt động tài khoản", ngung.status === 200);
  const phienNvSauNgung = await goi("/api/v1/tim-kiem?q=ab", { cookie: sauMoKhoa.cookie });
  dat("Phiên của người bị ngừng hoạt động bị từ chối ngay", phienNvSauNgung.status === 401);

  // --- 11. Đăng xuất ---
  const xuat = await goi("/api/dang-xuat", { phuongThuc: "POST", cookie: cookieQT });
  dat("Đăng xuất xóa cookie", xuat.status === 200 && xuat.cookie === "");

  console.log(`\nThử HTTP: ${soDat} đạt, ${soHong} hỏng`);
  if (process.env.THU_GHI_MAT_KHAU_MOI) console.log(`MAT_KHAU_QT_MOI=${MAT_KHAU_QT}`);
  process.exit(soHong ? 1 : 0);
}

main().catch((e) => {
  console.error("Bài thử HTTP gặp lỗi ngoài dự kiến:", e);
  process.exit(1);
});
