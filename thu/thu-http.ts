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
