import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { coQuyen, idNguoiTrongPhamVi, layHoSoQuyen, type HoSoQuyen } from "@/lib/phan-quyen";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { napBanDoCapTren } from "@/modules/danh-gia/cap-tren";
import { nguoiGiuQuyen, taoThongBao } from "@/modules/thong-bao/service";
import type { TrangThaiBai, TrangThaiKenhBai } from "./hang-so";
import { tongHopTrangThaiBai } from "./tinh-toan";

/** Phần dùng chung của service Mạng xã hội: Cấu hình, phạm vi xem bài, tổng hợp trạng thái bài. */

export interface CauHinhMxh {
  aiPhaiDuyet: boolean;
  /** 0.24.0: mọi bài phải duyệt (mặc định tắt). */
  moiBaiPhaiDuyet: boolean;
  /** 0.24.0: số video tải lên YouTube tối đa / ngày quota. */
  youtubeToiDaNgay: number;
  /** QA 0.23.0 (QĐ-206): duyệt khi giờ hẹn đã qua — trễ ≤ số phút này thì đăng ngay, quá thì "cần hẹn lại giờ". */
  treHenToiDaPhut: number;
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
  const tre = await docCauHinh(tx, "mxh.tre_hen_toi_da_phut");
  const moi = await docCauHinh(tx, "mxh.moi_bai_phai_duyet");
  const yt = await docCauHinh(tx, "mxh.youtube_upload_toi_da_ngay");
  return {
    treHenToiDaPhut: tre ?? 60,
    moiBaiPhaiDuyet: moi === 1,
    youtubeToiDaNgay: yt ?? 6,
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

/**
 * Người giữ `hoSo` có quyền duyệt bài của `nguoiSoanId` theo PHẠM VI (QĐ-197 / MXH-21): có `mxh.approve` VÀ (Giám đốc /
 * Quản trị, hoặc cấp trên trong chuỗi quản lý, hoặc người soạn trong phạm vi `mxh.approve`). Chưa xét "không tự duyệt".
 */
export async function duyetDuocNguoiSoan(tx: ClientTenant, hoSo: HoSoQuyen, nguoiSoanId: string): Promise<boolean> {
  if (!coQuyen(hoSo, "mxh.approve")) return false;
  const bd = await napBanDoCapTren(tx);
  if (bd.laGiamDocHoacQuanTri(hoSo.userId) || bd.chuoiQuanLy(nguoiSoanId).includes(hoSo.userId)) return true;
  const pv = await idNguoiTrongPhamVi(tx, hoSo, "mxh.approve");
  return pv === "tat-ca" || pv.includes(nguoiSoanId);
}

type ThongBaoMxh = Omit<Parameters<typeof taoThongBao>[2], "nguoiNhanId">;

/**
 * QA 0.23.0 (QĐ-204): báo NGƯỜI SOẠN và mọi người có `mxh.approve` mà phạm vi bao người soạn (đăng lỗi, cần kết nối lại,
 * cần hẹn lại giờ…). Mỗi người một lần (khóa chống trùng theo người nhận). Trả danh sách người nhận.
 */
export async function baoNguoiSoanVaNguoiDuyet(tx: ClientTenant, tenantId: string, nguoiSoanId: string, d: ThongBaoMxh): Promise<string[]> {
  const nhan = new Set<string>([nguoiSoanId]);
  const ids = (await nguoiGiuQuyen(tx, "mxh.approve", true)).filter((u) => u !== nguoiSoanId);
  const hoatDong = ids.length ? await tx.user.findMany({ where: { id: { in: ids }, status: "hoat-dong", isSystem: false }, select: { id: true } }) : [];
  for (const u of hoatDong) {
    const hs = await layHoSoQuyen(tx, u.id);
    if (hs && (await duyetDuocNguoiSoan(tx, hs, nguoiSoanId))) nhan.add(u.id);
  }
  for (const id of nhan) await taoThongBao(tx, tenantId, { ...d, nguoiNhanId: id });
  return [...nhan];
}

/**
 * QA 0.23.0 (QĐ-203): thêm / gỡ ẢNH của bài sau khi bài đã gửi duyệt (khác người soạn) = sửa nội dung → đồng tác giả.
 * (Tiêu đề / nội dung: trigger CSDL `ghi_dong_tac_gia_bai` tự ghi.)
 */
export async function ghiDongTacGiaAnh(tx: ClientTenant, postId: string, userId: string): Promise<void> {
  const b = await tx.socialPost.findFirst({ where: { id: postId }, select: { submittedAt: true, createdBy: true, coAuthorIds: true } });
  if (!b || !b.submittedAt || b.createdBy === userId || b.coAuthorIds.includes(userId)) return;
  await tx.socialPost.update({ where: { id: postId }, data: { coAuthorIds: { push: userId } } });
}
