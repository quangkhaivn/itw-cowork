import type { NguCanh } from "@/lib/api";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { LoiThieuQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { docTep, ghiTep, maBam } from "./kho-tep";
import { duocSuaChungTu, duocXemChungTu } from "./quyen";
import {
  dinhDangDungLuong,
  DUNG_LUONG_TOI_DA,
  duongDanLuu,
  lamSachTenTep,
  nhanDangTep,
  SO_TEP_TOI_DA,
  type LoaiDoiTuong,
} from "./tinh-toan";

/**
 * Tệp đính kèm cho chứng từ. Luật: BUSINESS_RULES.md mục 20 (DK).
 *
 * Nội dung tệp nằm trên đĩa, bảng `attachments` chỉ giữ thông tin. Quyền mượn nguyên
 * của chứng từ chủ — xem `quyen.ts`.
 */

const CHON = {
  id: true, objectType: true, objectId: true, fileName: true, mimeType: true,
  sizeBytes: true, sha256: true, note: true, uploadedAt: true, deletedAt: true, deleteReason: true,
  uploader: { select: { id: true, fullName: true } },
} as const;

function tepRa(t: {
  id: string;
  objectType: string;
  objectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
  uploadedAt: Date;
  deletedAt: Date | null;
  deleteReason: string | null;
  uploader: { id: string; fullName: string };
}) {
  return {
    id: t.id,
    loaiDoiTuong: t.objectType,
    doiTuongId: t.objectId,
    tenTep: t.fileName,
    kieuTep: t.mimeType,
    dungLuong: t.sizeBytes,
    dungLuongGon: dinhDangDungLuong(t.sizeBytes),
    maBam: t.sha256,
    ghiChu: t.note,
    taiLuc: t.uploadedAt,
    nguoiTai: { id: t.uploader.id, hoTen: t.uploader.fullName },
    daXoa: t.deletedAt !== null,
    lyDoXoa: t.deleteReason,
    duongDanTai: `/api/v1/dinh-kem/${t.id}/tai`,
  };
}
export type TepDinhKem = ReturnType<typeof tepRa>;

/** Danh sách tệp còn hiệu lực của một chứng từ, kèm việc người đang xem làm được gì. */
export async function danhSachDinhKem(nc: NguCanh, loai: LoaiDoiTuong, doiTuongId: string) {
  if (!(await duocXemChungTu(nc, loai, doiTuongId))) {
    // Không nói "bạn thiếu quyền" cho thứ có thể người ta không được biết là có tồn tại.
    throw new LoiKhongTimThay("Chứng từ");
  }
  const ds = await nc.tx.attachment.findMany({
    where: { objectType: loai, objectId: doiTuongId, deletedAt: null },
    select: CHON,
    orderBy: { uploadedAt: "desc" },
  });
  return {
    tep: ds.map(tepRa),
    quyen: { dinhKem: await duocSuaChungTu(nc, loai, doiTuongId) },
    conThemDuoc: Math.max(0, SO_TEP_TOI_DA - ds.length),
  };
}

export interface YeuCauDinhKem {
  loai: LoaiDoiTuong;
  doiTuongId: string;
  tenTep: string;
  noiDung: Uint8Array;
  ghiChu?: string | null;
}

/**
 * Đính một tệp vào chứng từ.
 *
 * Kiểm theo thứ tự: quyền trên **chứng từ chủ** → dung lượng → số tệp → **nội dung
 * thật sự là kiểu gì**. Chỉ khi mọi thứ qua mới ghi xuống đĩa, và ghi đĩa xong mới
 * ghi bản ghi — để không bao giờ có bản ghi trỏ tới tệp không tồn tại.
 */
export async function dinhKemTep(nc: NguCanh, yc: YeuCauDinhKem) {
  if (!(await duocSuaChungTu(nc, yc.loai, yc.doiTuongId))) {
    if (!(await duocXemChungTu(nc, yc.loai, yc.doiTuongId))) throw new LoiKhongTimThay("Chứng từ");
    throw new LoiThieuQuyen(`đính kèm vào ${yc.loai}`, { objectType: yc.loai, objectId: yc.doiTuongId });
  }

  if (yc.noiDung.byteLength === 0) throw new LoiDinhDang("tep", "Tệp rỗng.");
  if (yc.noiDung.byteLength > DUNG_LUONG_TOI_DA) {
    throw new LoiNghiepVu(
      `Tệp ${dinhDangDungLuong(yc.noiDung.byteLength)} vượt mức cho phép ${dinhDangDungLuong(DUNG_LUONG_TOI_DA)}.`,
      413,
      "tep-qua-lon",
      { toiDa: DUNG_LUONG_TOI_DA },
    );
  }

  const daCo = await nc.tx.attachment.count({
    where: { objectType: yc.loai, objectId: yc.doiTuongId, deletedAt: null },
  });
  if (daCo >= SO_TEP_TOI_DA) {
    throw new LoiNghiepVu(`Một chứng từ tối đa ${SO_TEP_TOI_DA} tệp. Gỡ bớt tệp cũ trước.`, 409, "qua-nhieu-tep");
  }

  const ten = lamSachTenTep(yc.tenTep);
  const nhanDang = nhanDangTep(ten, yc.noiDung.subarray(0, 16));
  if (!nhanDang.hopLe) throw new LoiNghiepVu(nhanDang.lyDo!, 415, "kieu-tep-khong-nhan");

  const bam = maBam(yc.noiDung);
  const id = crypto.randomUUID();
  const duongDan = duongDanLuu(nc.tenantId, id, ten);

  // Ghi đĩa TRƯỚC. Nếu ghi hỏng thì giao dịch chưa ghi gì vào CSDL và không có bản
  // ghi mồ côi. Nếu CSDL hỏng sau đó thì còn lại một tệp không ai trỏ tới — rác, chứ
  // không phải bản ghi trỏ vào khoảng không.
  await ghiTep(duongDan, yc.noiDung);

  const t = await nc.tx.attachment.create({
    data: {
      id,
      tenantId: nc.tenantId,
      objectType: yc.loai,
      objectId: yc.doiTuongId,
      fileName: ten,
      storedPath: duongDan,
      mimeType: nhanDang.mime!,
      sizeBytes: yc.noiDung.byteLength,
      sha256: bam,
      note: yc.ghiChu || null,
      uploadedBy: nc.hoSo.userId,
    },
    select: CHON,
  });

  await nc.kiemToan({
    action: "tao",
    objectType: "attachment",
    objectId: t.id,
    after: { tenTep: ten, kieuTep: nhanDang.mime, dungLuong: yc.noiDung.byteLength, gan: `${yc.loai}:${yc.doiTuongId}` },
  });
  await nc.suKien({
    eventType: SU_KIEN.ATTACHMENT_ADDED,
    objectType: yc.loai,
    objectId: yc.doiTuongId,
    payload: { tepId: t.id, tenTep: ten, dungLuong: yc.noiDung.byteLength },
  });
  return tepRa(t);
}

/**
 * Đọc một tệp để tải về. Trả cả thông tin lẫn nội dung.
 *
 * Kiểm mã băm sau khi đọc: tệp trên đĩa khác với tệp đã tải lên nghĩa là có chuyện —
 * đĩa hỏng, hoặc ai đó đụng vào thư mục. Không im lặng trả một tệp không đúng.
 */
export async function taiTep(nc: NguCanh, id: string) {
  const t = await nc.tx.attachment.findFirst({
    where: { id, deletedAt: null },
    select: { ...CHON, storedPath: true },
  });
  if (!t) throw new LoiKhongTimThay("Tệp đính kèm");
  if (!(await duocXemChungTu(nc, t.objectType as LoaiDoiTuong, t.objectId))) {
    throw new LoiKhongTimThay("Tệp đính kèm");
  }

  const noiDung = await docTep(t.storedPath);
  if (maBam(noiDung) !== t.sha256) {
    throw new LoiNghiepVu(
      "Tệp trên đĩa không khớp với tệp đã tải lên. Không trả về tệp này — báo quản trị kiểm tra.",
      500,
      "tep-khong-khop",
    );
  }
  return { thongTin: tepRa(t), noiDung };
}

/** DK-06: gỡ tệp là **xóa mềm** và phải ghi lý do. Tệp vẫn nằm trên đĩa để truy được. */
export async function goTep(nc: NguCanh, id: string, lyDo: string) {
  const t = await nc.tx.attachment.findFirst({ where: { id, deletedAt: null }, select: CHON });
  if (!t) throw new LoiKhongTimThay("Tệp đính kèm");
  if (!(await duocSuaChungTu(nc, t.objectType as LoaiDoiTuong, t.objectId))) {
    if (!(await duocXemChungTu(nc, t.objectType as LoaiDoiTuong, t.objectId))) throw new LoiKhongTimThay("Tệp đính kèm");
    throw new LoiThieuQuyen(`gỡ tệp của ${t.objectType}`, { objectType: t.objectType, objectId: t.objectId });
  }

  await nc.tx.attachment.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: nc.hoSo.userId, deleteReason: lyDo },
  });
  await nc.kiemToan({
    action: "xoa",
    objectType: "attachment",
    objectId: id,
    before: { tenTep: t.fileName, gan: `${t.objectType}:${t.objectId}` },
    after: { lyDo },
  });
  await nc.suKien({
    eventType: SU_KIEN.ATTACHMENT_REMOVED,
    objectType: t.objectType,
    objectId: t.objectId,
    payload: { tepId: id, tenTep: t.fileName, lyDo },
  });
  return { id, daXoa: true };
}
