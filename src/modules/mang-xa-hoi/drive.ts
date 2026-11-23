import type { NguCanh } from "@/lib/api";
import { thanhBuoc, type BuocGiaoDich } from "@/lib/api-nhieu-buoc";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { dinhKemTep } from "@/modules/dinh-kem/service";
import { DUNG_LUONG_TOI_DA, DUNG_LUONG_VIDEO_DRIVE_TOI_DA, duoiTep } from "@/modules/dinh-kem/tinh-toan";
import { dieuKienXemBai, docCauHinhMxh } from "./chung";
import { docJson } from "./connectors/goi-chung";
import { gocApi } from "./connectors/goc-api";
import { kiemTokenPicker } from "./connectors/oauth-mang";
import { ANH, VIDEO } from "./luat-nen-tang";
import type { LuocDoTaiDrive } from "./luoc-do";
import { goiAnToan, LoiGoiMang } from "./mang/goi-an-toan";
import { cauLoiGon } from "./tinh-toan";
import type { z } from "zod";

/**
 * Google Drive làm KHO MEDIA (0.24.0, QĐ-206): người soạn chọn tệp bằng Google Picker (trình duyệt, quyền `drive.file` —
 * chỉ tệp người dùng tự chọn), trình duyệt gửi mã tệp + access token NGẮN HẠN; máy chủ:
 *  1. kiểm token cấp cho đúng OAuth client của doanh nghiệp, có `drive.file`, còn hạn (tokeninfo — chống token lạ);
 *  2. đọc siêu dữ liệu tệp (`files.get?fields=id,name,mimeType,size`), kiểm loại (ảnh JPEG/PNG/GIF/WebP, video MP4/MOV)
 *     và dung lượng (ảnh 20 MB, video 200 MB) TRƯỚC khi tải;
 *  3. tải nội dung (`alt=media`, trần dung lượng) → tệp đính kèm của bài (nhận dạng lại theo nội dung).
 * KHÔNG đổi quyền chia sẻ trên Drive (không gọi API permissions), KHÔNG lưu token, không ghi token vào nhật ký.
 *
 * CHƯA KIỂM VỚI API THẬT: tham số `supportsAllDrives`, trường `size` dạng chuỗi, mã lỗi khi tệp chưa cấp cho app (404).
 */

const DUOI_THEO_MIME: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/gif": ["gif"], "image/webp": ["webp"], "video/mp4": ["mp4", "m4v"], "video/quicktime": ["mov"],
};

function tenTepTheoMime(ten: string, mime: string): string {
  const ds = DUOI_THEO_MIME[mime] ?? [];
  return ds.includes(duoiTep(ten)) ? ten : `${ten.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${ds[0]}`;
}

export interface KetQuaTaiDrive {
  daThem: { tepId: string; tenTep: string; kieu: string; dungLuong: number }[];
  loi: { tepId: string; thongBao: string }[];
}

export async function taiTuDrive(x: NguCanh | BuocGiaoDich, postId: string, d: z.infer<typeof LuocDoTaiDrive>): Promise<KetQuaTaiDrive> {
  const nb = thanhBuoc(x);
  const truoc = await nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "mxh.view");
    const b = await nc.tx.socialPost.findFirst({ where: { AND: [{ id: postId, deletedAt: null }, await dieuKienXemBai(nc)] }, select: { id: true, status: true } });
    if (!b) throw new LoiKhongTimThay("Bài");
    if (!["DRAFT", "CANCELED"].includes(b.status)) throw new LoiNghiepVu("Chỉ thêm tệp khi bài còn nháp (hoặc đã hủy).", 409, "sai-trang-thai");
    const app = await nc.tx.socialAppConfig.findFirst({ where: { provider: "GOOGLE" }, select: { publicConfig: true } });
    const clientId = ((app?.publicConfig ?? {}) as Record<string, string>).clientId || process.env.GOOGLE_CLIENT_ID?.trim() || "";
    if (!clientId) throw new LoiNghiepVu("Chưa nhập Client ID của Google (Quản trị → Kết nối nền tảng (API)).", 409, "chua-cau-hinh-app");
    return { clientId, hanMs: (await docCauHinhMxh(nc.tx)).hanGoiMs };
  });

  const kt = await kiemTokenPicker(d.accessToken, truoc.clientId, truoc.hanMs);
  if (!kt.ok) throw new LoiNghiepVu(kt.thongBao, kt.loai === "RETRYABLE" ? 502 : 403, kt.ma);

  const kq: KetQuaTaiDrive = { daThem: [], loi: [] };
  const hdr = { Authorization: `Bearer ${d.accessToken}` };
  for (const tepId of [...new Set(d.tepIds)]) {
    try {
      const m = await goiAnToan({ url: `${gocApi().googleApis}/drive/v3/files/${encodeURIComponent(tepId)}?fields=id,name,mimeType,size&supportsAllDrives=true`, tieuDe: hdr, hanMs: truoc.hanMs, tranPhanHoi: 64 * 1024 });
      const j = (docJson(m) ?? {}) as { id?: unknown; name?: unknown; mimeType?: unknown; size?: unknown };
      if (m.status === 404 || m.status === 403) {
        kq.loi.push({ tepId, thongBao: "Không đọc được tệp — chỉ tệp bạn vừa chọn trong hộp chọn của Google mới tải được (quyền drive.file)." });
        continue;
      }
      if (m.status !== 200 || typeof j.mimeType !== "string") {
        kq.loi.push({ tepId, thongBao: `Google Drive trả lỗi ${m.status}.` });
        continue;
      }
      const mime = j.mimeType;
      const laVideo = VIDEO.includes(mime);
      if (!ANH.includes(mime) && !laVideo) {
        kq.loi.push({ tepId, thongBao: `Tệp “${cauLoiGon(j.name, 100)}” (${mime}) không phải ảnh JPEG / PNG / GIF / WebP hay video MP4 / MOV — không đăng được. Ảnh HEIC của iPhone: xuất sang JPEG trước.` });
        continue;
      }
      const toiDa = laVideo ? DUNG_LUONG_VIDEO_DRIVE_TOI_DA : DUNG_LUONG_TOI_DA;
      const co = Number(j.size ?? NaN);
      if (!Number.isFinite(co) || co <= 0) {
        kq.loi.push({ tepId, thongBao: "Google Drive không cho biết dung lượng tệp — không tải." });
        continue;
      }
      if (co > toiDa) {
        kq.loi.push({ tepId, thongBao: `Tệp “${cauLoiGon(j.name, 100)}” ${(co / 1048576).toFixed(1).replace(".", ",")} MB vượt mức ${toiDa / 1048576} MB.` });
        continue;
      }
      const t = await goiAnToan({ url: `${gocApi().googleApis}/drive/v3/files/${encodeURIComponent(tepId)}?alt=media&supportsAllDrives=true`, tieuDe: hdr, hanMs: Math.max(truoc.hanMs, 300_000), tranPhanHoi: co + 1 });
      if (t.status !== 200) {
        kq.loi.push({ tepId, thongBao: `Tải tệp từ Google Drive hỏng (HTTP ${t.status}).` });
        continue;
      }
      if (t.than.length !== co) {
        kq.loi.push({ tepId, thongBao: "Tệp tải về không đủ dung lượng — thử lại." });
        continue;
      }
      const ten = tenTepTheoMime(cauLoiGon(typeof j.name === "string" ? j.name : "tep-drive", 180) || "tep-drive", mime);
      const tep = await nb.giaoDich((nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: postId, tenTep: ten, noiDung: new Uint8Array(t.than), ghiChu: "Lấy từ Google Drive" }, { dungLuongToiDa: toiDa, nguon: "google-drive" }));
      kq.daThem.push({ tepId, tenTep: tep.tenTep, kieu: mime, dungLuong: co });
    } catch (e) {
      if (e instanceof LoiNghiepVu) kq.loi.push({ tepId, thongBao: e.message });
      else kq.loi.push({ tepId, thongBao: e instanceof LoiGoiMang ? `Không tải được từ Google Drive: ${e.message}` : "Không tải được từ Google Drive." });
    }
  }
  await nb.giaoDich((nc) => nc.kiemToan({ action: "tai-tu-drive", objectType: "social_post", objectId: postId, after: { soTep: kq.daThem.length, soLoi: kq.loi.length, tep: kq.daThem.map((t) => ({ ma: t.tepId, ten: t.tenTep })) } }));
  return kq;
}
