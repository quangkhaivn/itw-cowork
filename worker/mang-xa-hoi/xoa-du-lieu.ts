import { voiTenant } from "../../src/lib/db";
import { ghiKiemToan } from "../../src/lib/kiem-toan";
import { capNhatTrangThaiBai } from "../../src/modules/mang-xa-hoi/chung";
import { kiemSignedRequest } from "../../src/modules/mang-xa-hoi/oauth-thuan";
import { nguoiGiuQuyen, taoThongBao } from "../../src/modules/thong-bao/service";
import { docThongTinApp } from "./kiem-tra";

/**
 * Worker: Data Deletion Callback của Meta (0.24.0, QĐ-207). Route công khai đã nhận + kiểm khuôn + trả mã xác nhận; ở đây
 * kiểm CHỮ KÝ bằng App Secret (chỉ worker mở được). Đúng chữ ký → XÓA token (bản niêm phong) của mọi kênh Meta do người
 * đó cấp quyền (oauth_subject = user_id), kênh sang "Đã ngắt", hủy lượt đăng chưa chạy, hủy kênh chờ chọn; báo Marketing.
 * Sai chữ ký → CHU_KY_SAI, không xóa gì. Trang `/xoa-du-lieu?ma=…` cho xem trạng thái.
 */
export async function xuLyXoaDuLieu(tenantId: string, bayGio: Date, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const ds = await voiTenant(tenantId, (tx) => tx.socialDataDeletionRequest.findMany({ where: { status: "CHO_KIEM" }, take: 20, orderBy: { createdAt: "asc" } }));
  if (!ds.length) return 0;
  let app: Awaited<ReturnType<typeof docThongTinApp>> = null;
  try {
    app = await docThongTinApp(tenantId, "META", env);
  } catch {
    app = null;
  }
  for (const yc of ds) {
    if (!app) {
      // Chưa có App Secret thì không kiểm được — để nguyên CHO_KIEM (Quản trị nhập xong sẽ chạy tiếp).
      continue;
    }
    const k = kiemSignedRequest(yc.signedRequest, app.biMat);
    await voiTenant(tenantId, async (tx) => {
      if (!k.ok) {
        await tx.socialDataDeletionRequest.update({ where: { id: yc.id }, data: { status: "CHU_KY_SAI", resultMessage: "Chữ ký không khớp App Secret — yêu cầu không phải do Meta gửi. Không xóa gì.", processedAt: bayGio } });
        await ghiKiemToan(tx, { action: "xoa-du-lieu-meta", objectType: "social_data_deletion_request", objectId: yc.id, after: { ketQua: "chu-ky-sai", boi: "worker" } });
        return;
      }
      const uid = k.noiDung.user_id;
      const kenh = await tx.socialConnection.findMany({ where: { oauthProvider: "META", oauthSubject: uid, disconnectedAt: null }, select: { id: true, name: true } });
      for (const c of kenh) {
        await tx.socialCredential.deleteMany({ where: { connectionId: c.id } });
        await tx.socialConnection.update({ where: { id: c.id }, data: { status: "DISCONNECTED", disconnectedAt: bayGio, checkRequestedAt: null, lastCheckMessage: "Người cấp quyền đã yêu cầu xóa dữ liệu trên Facebook — token đã bị xóa." } });
        const huy = await tx.socialPostTarget.findMany({ where: { connectionId: c.id, status: { in: ["PENDING", "QUEUED"] } }, select: { id: true, postId: true } });
        if (huy.length) {
          await tx.socialPostTarget.updateMany({ where: { id: { in: huy.map((h) => h.id) } }, data: { status: "CANCELED", errorMessage: "Kênh đã ngắt (yêu cầu xóa dữ liệu).", nextAttemptAt: null } });
          for (const p of new Set(huy.map((h) => h.postId))) await capNhatTrangThaiBai(tx, p);
        }
      }
      const yeuCau = await tx.socialOauthRequest.findMany({ where: { provider: "META", oauthSubject: uid }, select: { id: true } });
      await tx.socialOauthCandidate.deleteMany({ where: { requestId: { in: yeuCau.map((y) => y.id) } } });
      await tx.socialDataDeletionRequest.update({ where: { id: yc.id }, data: { status: "DA_XOA", platformUserId: uid, deletedCount: kenh.length, resultMessage: kenh.length ? `Đã xóa token của ${kenh.length} kênh.` : "Không có dữ liệu nào của người này.", processedAt: bayGio } });
      await ghiKiemToan(tx, { action: "xoa-du-lieu-meta", objectType: "social_data_deletion_request", objectId: yc.id, after: { ketQua: "da-xoa", soKenh: kenh.length, boi: "worker" } });
      if (kenh.length) {
        const nguoi = await nguoiGiuQuyen(tx, "mxh.update", true);
        const hd = await tx.user.findMany({ where: { id: { in: nguoi }, status: "hoat-dong", isSystem: false }, select: { id: true } });
        for (const u of hd) {
          await taoThongBao(tx, tenantId, {
            nguoiNhanId: u.id, loai: "mxh-xoa-du-lieu", mucDo: "canh-bao",
            tieuDe: `Facebook yêu cầu xóa dữ liệu: ${kenh.length} kênh đã bị ngắt`,
            noiDung: `Người cấp quyền đã gỡ ứng dụng / yêu cầu xóa dữ liệu trên Facebook. Kênh: ${kenh.map((c) => c.name).join(", ")}. Muốn đăng tiếp thì kết nối lại.`,
            duongDan: "/mang-xa-hoi/kenh", doiTuong: "social_data_deletion_request", doiTuongId: yc.id, khoaChongTrung: `mxh-xoa-du-lieu:${yc.id}`,
          });
        }
      }
    });
  }
  return ds.length;
}
