import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { prisma, voiTenant, type ClientTenant } from "@/lib/db";
import { LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coMotTrongCacQuyen } from "@/lib/phan-quyen";
import type { LuocDoTrangCongKhai } from "./luoc-do";
import { docKhuonSignedRequest, sinhMaXacNhan } from "./oauth-thuan";

/**
 * Trang công khai nền tảng đòi khi duyệt app (0.24.0, QĐ-207): Điều khoản sử dụng, Chính sách quyền riêng tư, Hướng dẫn xóa
 * dữ liệu. Quản trị sửa được (`setting.update`); chưa sửa thì hiện BẢN MẪU tiếng Việt ghi rõ "cần luật sư rà". Trang
 * `/xoa-du-lieu` kèm tra trạng thái yêu cầu xóa (mã xác nhận Meta trả cho người dùng).
 *
 * Nội dung là chữ thường (không nhận HTML): dòng bắt đầu "## " là tiêu đề mục, "- " là gạch đầu dòng, dòng trống tách đoạn.
 */

export const TRANG = ["dieu-khoan", "quyen-rieng-tu", "xoa-du-lieu"] as const;
export type Trang = (typeof TRANG)[number];

export function laTrang(x: string): x is Trang {
  return (TRANG as readonly string[]).includes(x);
}

const BAO_MAU = "BẢN MẪU — CẦN LUẬT SƯ RÀ TRƯỚC KHI DÙNG. Nội dung dưới đây do phần mềm soạn sẵn để doanh nghiệp tham khảo, chưa phải văn bản pháp lý đã được kiểm tra. Sửa ở Quản trị → Trang công khai.";

export function noiDungMau(trang: Trang, tenDn: string): { tieuDe: string; noiDung: string } {
  if (trang === "dieu-khoan") {
    return {
      tieuDe: "Điều khoản sử dụng",
      noiDung: `${BAO_MAU}

## 1. Phạm vi
TGTH Cowork là phần mềm quản lý nội bộ của ${tenDn}. Tính năng Mạng xã hội cho phép nhân viên được giao quyền soạn và đăng bài lên Trang Facebook, tài khoản Instagram chuyên nghiệp, kênh YouTube và website WordPress do ${tenDn} sở hữu hoặc được ủy quyền quản lý.

## 2. Tài khoản được kết nối
- Người kết nối phải là quản trị viên hợp pháp của Trang / tài khoản / kênh.
- Cowork chỉ dùng quyền được cấp để đăng bài, đọc lại bài đã đăng và đọc thông tin kênh; không gửi tin nhắn, không đọc bình luận ở phiên bản này.
- Người kết nối có thể thu hồi quyền bất cứ lúc nào trên Facebook (Cài đặt → Doanh nghiệp tích hợp), Google (myaccount.google.com/permissions) hoặc bằng nút "Ngắt kết nối" trong Cowork.

## 3. Nội dung đăng
- ${tenDn} chịu trách nhiệm về nội dung đăng qua Cowork và tuân thủ chính sách của từng nền tảng.
- Bài do trợ lý AI soạn phải được người có thẩm quyền duyệt trước khi đăng.

## 4. Giới hạn trách nhiệm
Cowork không bảo đảm nền tảng luôn chấp nhận bài (hạn mức, chính sách, sự cố của nền tảng). Cowork chỉ báo "đã đăng" khi đọc lại thấy bài trên nền tảng.

## 5. Liên hệ
Mọi thắc mắc gửi về bộ phận phụ trách của ${tenDn}.`,
    };
  }
  if (trang === "quyen-rieng-tu") {
    return {
      tieuDe: "Chính sách quyền riêng tư",
      noiDung: `${BAO_MAU}

## 1. Dữ liệu chúng tôi thu thập khi bạn kết nối kênh
- Facebook / Instagram: mã người dùng trong ứng dụng, tên, danh sách Trang bạn quản lý, mã và tên tài khoản Instagram chuyên nghiệp gắn với Trang, mã truy cập (access token) của Trang.
- Google / YouTube: mã và tên kênh YouTube, mã truy cập và mã làm mới (refresh token); tệp Google Drive chỉ khi bạn TỰ CHỌN trong hộp chọn tệp của Google.

## 2. Mục đích sử dụng
Chỉ để đăng bài bạn soạn / duyệt lên kênh của ${tenDn}, đọc lại xác minh bài đã lên, và lấy ảnh / video bạn chọn làm nội dung bài. Không bán, không chia sẻ cho bên thứ ba, không dùng để quảng cáo.

## 3. Lưu trữ và bảo vệ
- Mã truy cập được mã hóa (AES-256-GCM, khóa riêng) trên máy chủ của ${tenDn}; không hiện lại trên màn hình, không ghi vào nhật ký.
- Tệp ảnh / video lưu cùng bài trên máy chủ của ${tenDn}; quyền chia sẻ trên Google Drive của bạn không bị thay đổi.

## 4. Thời gian lưu và xóa
- Mã truy cập bị xóa khi kênh bị ngắt kết nối, khi bạn gỡ ứng dụng trên Facebook (Cowork nhận yêu cầu xóa dữ liệu tự động), hoặc khi bạn yêu cầu.
- Xem cách yêu cầu xóa ở trang "Hướng dẫn xóa dữ liệu".

## 5. Quyền của bạn
Bạn có quyền được biết, truy cập, chỉnh sửa, xóa dữ liệu cá nhân và rút lại sự đồng ý theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và văn bản hướng dẫn.

## 6. Liên hệ
Bộ phận phụ trách dữ liệu của ${tenDn}.`,
    };
  }
  return {
    tieuDe: "Hướng dẫn xóa dữ liệu",
    noiDung: `${BAO_MAU}

## Cách yêu cầu xóa dữ liệu
- Gỡ ứng dụng trên Facebook: Cài đặt & quyền riêng tư → Cài đặt → Doanh nghiệp tích hợp (Business Integrations) → chọn ứng dụng của ${tenDn} → Gỡ. Facebook tự gửi yêu cầu xóa dữ liệu tới Cowork; bạn nhận một mã xác nhận để tra trạng thái ở trang này.
- Gỡ quyền Google: myaccount.google.com/permissions → chọn ứng dụng → Xóa quyền truy cập.
- Hoặc liên hệ ${tenDn} để yêu cầu xóa trực tiếp.

## Dữ liệu bị xóa
Mã truy cập (token) của mọi Trang / tài khoản Instagram bạn đã kết nối; các kênh đó chuyển sang "Đã ngắt" và các lượt đăng chưa chạy bị hủy. Bài đã đăng trên nền tảng KHÔNG bị Cowork xóa (bạn tự xóa trên nền tảng nếu muốn).

## Thời hạn
Yêu cầu được xử lý tự động trong vài phút sau khi nhận.`,
  };
}

/** Doanh nghiệp của trang công khai: theo mã `dn`; không có mã mà máy chỉ có MỘT doanh nghiệp đang hoạt động → doanh nghiệp đó. */
export async function timDoanhNghiepCongKhai(dn: string | null | undefined): Promise<{ id: string; code: string; name: string } | null> {
  if (dn) {
    if (!/^[a-z0-9-]{1,50}$/i.test(dn)) return null;
    return prisma.tenant.findFirst({ where: { code: dn, status: "hoat-dong" }, select: { id: true, code: true, name: true } });
  }
  const ds = await prisma.tenant.findMany({ where: { status: "hoat-dong" }, select: { id: true, code: true, name: true }, take: 2 });
  return ds.length === 1 ? ds[0] : null;
}

export async function docTrang(tx: ClientTenant, trang: Trang, tenDn: string) {
  const d = await tx.legalPage.findFirst({ where: { slug: trang } });
  if (d) return { tieuDe: d.title, noiDung: d.body, laMau: false, capNhatLuc: d.updatedAt };
  return { ...noiDungMau(trang, tenDn), laMau: true, capNhatLuc: null };
}

export async function danhSachTrang(nc: NguCanh) {
  if (!coMotTrongCacQuyen(nc.hoSo, ["setting.view", "setting.update"])) batBuocQuyen(nc.hoSo, "setting.view");
  const t = await nc.tx.tenant.findFirst({ where: { id: nc.tenantId }, select: { name: true, code: true } });
  const ds = [];
  for (const tr of TRANG) ds.push({ trang: tr, ...(await docTrang(nc.tx, tr, t?.name ?? "Công ty")) });
  return { maDoanhNghiep: t?.code ?? "", ds };
}

export async function suaTrang(nc: NguCanh, trangNhap: string, d: z.infer<typeof LuocDoTrangCongKhai>) {
  batBuocQuyen(nc.hoSo, "setting.update", { objectType: "legal_page" });
  if (!laTrang(trangNhap)) throw new LoiNghiepVu("Trang không hợp lệ.", 404, "khong-tim-thay");
  if (/<\s*(script|iframe|style|object|embed)\b/i.test(d.noiDung)) throw new LoiNghiepVu("Nội dung là chữ thường — không nhận mã HTML / script.", 400, "co-html");
  await nc.tx.legalPage.upsert({
    where: { tenantId_slug: { tenantId: nc.tenantId, slug: trangNhap } },
    create: { tenantId: nc.tenantId, slug: trangNhap, title: d.tieuDe, body: d.noiDung, updatedBy: nc.hoSo.userId },
    update: { title: d.tieuDe, body: d.noiDung, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua-trang-cong-khai", objectType: "legal_page", objectId: null, after: { trang: trangNhap, tieuDe: d.tieuDe, doDai: d.noiDung.length } });
  return danhSachTrang(nc);
}

// ---------------------------------------------------------------------------
// Data Deletion Callback (Meta)
// ---------------------------------------------------------------------------

/**
 * Nhận yêu cầu xóa dữ liệu (route công khai, không phiên). Kiểm KHUÔN signed_request (thuật toán, user_id) — rác bị từ
 * chối 400 trước khi ghi; ghi yêu cầu CHO_KIEM kèm mã xác nhận; worker kiểm CHỮ KÝ bằng App Secret trong ≤ 15 giây rồi
 * xóa token. Trả `{ url, confirmation_code }` đúng dạng Meta yêu cầu.
 */
export async function nhanYeuCauXoaDuLieu(dn: string, signedRequest: string, ip: string | null): Promise<{ ok: true; url: string; confirmation_code: string } | { ok: false; status: number; thongBao: string }> {
  const t = await timDoanhNghiepCongKhai(dn);
  if (!t) return { ok: false, status: 404, thongBao: "Không tìm thấy doanh nghiệp." };
  const k = docKhuonSignedRequest(signedRequest);
  if (!k.ok) return { ok: false, status: 400, thongBao: k.ly };
  const ma = sinhMaXacNhan();
  await voiTenant(t.id, (tx) => tx.socialDataDeletionRequest.create({ data: { tenantId: t.id, provider: "META", confirmationCode: ma, signedRequest: signedRequest.trim(), platformUserId: null, ipAddress: ip?.slice(0, 64) ?? null } }));
  const goc = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  return { ok: true, url: `${goc}/xoa-du-lieu?dn=${encodeURIComponent(t.code)}&ma=${ma}`, confirmation_code: ma };
}

export const NHAN_TRANG_THAI_XOA: Record<string, string> = {
  CHO_KIEM: "Đã nhận — đang xử lý (vài phút).",
  DA_XOA: "Đã xóa dữ liệu.",
  CHU_KY_SAI: "Yêu cầu không hợp lệ (chữ ký không đúng) — không xóa gì.",
  LOI: "Xử lý lỗi — liên hệ doanh nghiệp.",
};

export async function trangThaiXoaDuLieu(tenantId: string, ma: string) {
  if (!/^[A-Z0-9]{8,32}$/.test(ma)) return null;
  const d = await voiTenant(tenantId, (tx) => tx.socialDataDeletionRequest.findFirst({ where: { confirmationCode: ma }, select: { status: true, createdAt: true, processedAt: true, resultMessage: true } }));
  if (!d) return null;
  return { trangThai: d.status, nhan: NHAN_TRANG_THAI_XOA[d.status] ?? d.status, nhanLuc: d.createdAt, xuLyLuc: d.processedAt, ketQua: d.status === "DA_XOA" ? d.resultMessage : null };
}
