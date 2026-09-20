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
  dat("Phiếu gắn đúng máy và đơn hàng qua bảo hành", phieuJson.phieu.baoHanh?.serial === `SN-HTTP-${DAU}-1` && phieuJson.phieu.donHang?.id === idDon2);
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
