import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { docCauHinh } from "@/modules/cau-hinh/service";
import type { TrangThaiBai, TrangThaiKenhBai } from "./hang-so";
import { tongHopTrangThaiBai } from "./tinh-toan";

/** Phần dùng chung của service Mạng xã hội: Cấu hình, phạm vi xem bài, tổng hợp trạng thái bài. */

export interface CauHinhMxh {
  aiPhaiDuyet: boolean;
  hanLinkMediaPhut: number;
  soLanThuToiDa: number;
  hanGoiMs: number;
  choDoiSoatMs: number;
  phutKetDang: number;
}

/** Đọc mọi khóa Cấu hình của phân hệ trong ngữ cảnh doanh nghiệp. */
export async function docCauHinhMxh(tx: ClientTenant): Promise<CauHinhMxh> {
  // Tuần tự: một giao dịch là một kết nối — truy vấn song song trên cùng kết nối chỉ xếp hàng (và pg cảnh báo).
  const ai = await docCauHinh(tx, "mxh.ai_phai_duyet");
  const link = await docCauHinh(tx, "mxh.han_link_media_phut");
  const lan = await docCauHinh(tx, "mxh.so_lan_thu_toi_da");
  const han = await docCauHinh(tx, "mxh.han_goi_giay");
  const cho = await docCauHinh(tx, "mxh.cho_doi_soat_giay");
  const ket = await docCauHinh(tx, "mxh.phut_ket_dang");
  return {
    // Chỉ đúng 0 mới tắt (mặc định an toàn: phải duyệt).
    aiPhaiDuyet: ai !== 0,
    hanLinkMediaPhut: link ?? 60,
    soLanThuToiDa: lan ?? 5,
    hanGoiMs: (han ?? 30) * 1000,
    choDoiSoatMs: (cho ?? 120) * 1000,
    phutKetDang: ket ?? 10,
  };
}

/** Điều kiện xem bài theo phạm vi `mxh.view` (người soạn trong phạm vi). Thực tập sinh: chỉ bài của mình. */
export async function dieuKienXemBai(nc: NguCanh): Promise<{ createdBy?: { in: string[] } }> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "mxh.view");
  return pv === "tat-ca" ? {} : { createdBy: { in: pv } };
}

/** Tính lại trạng thái bài từ các kênh và ghi nếu đổi. Trả trạng thái mới. */
export async function capNhatTrangThaiBai(tx: ClientTenant, postId: string): Promise<TrangThaiBai | null> {
  const bai = await tx.socialPost.findFirst({ where: { id: postId }, select: { status: true, targets: { select: { status: true } } } });
  if (!bai) return null;
  const hienTai = bai.status as TrangThaiBai;
  if (!["SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIALLY_FAILED", "FAILED"].includes(hienTai)) return hienTai;
  const moi = tongHopTrangThaiBai(hienTai, bai.targets.map((t) => t.status as TrangThaiKenhBai));
  if (moi !== hienTai) await tx.socialPost.update({ where: { id: postId }, data: { status: moi } });
  return moi;
}
