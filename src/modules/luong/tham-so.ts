import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { coMotTrongCacQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { banDoTen } from "@/modules/cham-cong/chung";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { batBuoc2Lop, batBuocQuyenLuong, docMauNganHang, KHOA_XUAT_NGAN_HANG } from "./chung";
import { luocDoGiaTriThamSo, type LuocDoThamSo, type LuocDoXuatNganHang } from "./luoc-do";
import { LOAI_THAM_SO, NHAN_LOAI_THAM_SO, chonBoHieuLuc } from "./tinh-toan";

/**
 * Tham số lương có hiệu lực theo ngày (LU-10 → LU-13). Chỉ ghi thêm: "sửa" = nhập bộ mới (cùng hoặc khác ngày hiệu
 * lực); bộ nạp sẵn (`mac-dinh`) phải được Kế toán XÁC NHẬN từng bộ (ghi người + lúc) — tới lúc đó màn hình hiện băng
 * cảnh báo và kỳ lương dùng bộ đó không gửi duyệt được (QĐ-143).
 */

function batBuocXemThamSo(nc: NguCanh) {
  if (!coMotTrongCacQuyen(nc.hoSo, ["luong.create", "luong.update", "luong.approve", "luong.export"])) throw new LoiThieuQuyen("luong.create", { objectType: "payroll_param_set" });
  batBuoc2Lop(nc);
}

export async function danhSachThamSo(nc: NguCanh, homNay = homNayVN()) {
  batBuocXemThamSo(nc);
  const ds = await nc.tx.payrollParamSet.findMany({ orderBy: [{ kind: "asc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }] });
  const ten = await banDoTen(nc.tx, ds.flatMap((d) => [d.createdBy, d.confirmedBy]));
  const nhom = LOAI_THAM_SO.map((loai) => {
    const cua = ds.filter((d) => d.kind === loai).map((d) => ({ ...d, hieuLucTu: dateVeNgay(d.effectiveFrom), taoLuc: d.createdAt }));
    const hienHanh = chonBoHieuLuc(cua, homNay);
    return {
      loai,
      nhan: NHAN_LOAI_THAM_SO[loai],
      hienHanhId: hienHanh?.id ?? null,
      bo: cua.map((d) => ({
        id: d.id,
        hieuLucTu: d.hieuLucTu,
        giaTri: d.values,
        ghiChu: d.note,
        nguon: d.source,
        taoLuc: d.createdAt,
        nguoiTao: d.createdBy ? (ten.get(d.createdBy) ?? "—") : "Nạp sẵn",
        xacNhanLuc: d.confirmedAt,
        nguoiXacNhan: d.confirmedBy ? (ten.get(d.confirmedBy) ?? "—") : null,
        hienHanh: d.id === hienHanh?.id,
        tuongLai: d.hieuLucTu > homNay,
      })),
    };
  });
  // Băng cảnh báo (LU-11): bộ CHƯA xác nhận đang hiệu lực hoặc sẽ hiệu lực.
  const canXacNhan = nhom.flatMap((n) => n.bo.filter((b) => !b.xacNhanLuc && (b.hienHanh || b.tuongLai)).map((b) => ({ id: b.id, loai: n.loai, nhan: n.nhan, hieuLucTu: b.hieuLucTu })));
  return { nhom, canXacNhan, duocSua: nc.hoSo.quyen.has("luong.create") };
}

/** Nhập bộ tham số mới (LU-13). Người nhập (Kế toán) chịu trách nhiệm → bộ nhập tay được xác nhận ngay bởi chính họ. */
export async function taoThamSo(nc: NguCanh, d: z.infer<typeof LuocDoThamSo>) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_param_set" });
  const hop = luocDoGiaTriThamSo(d.loai).safeParse(d.giaTri);
  if (!hop.success) {
    const vd = hop.error.issues[0];
    throw new LoiDinhDang("giaTri", `${NHAN_LOAI_THAM_SO[d.loai]}: ${vd?.path.join(".") ? `${vd.path.join(".")} — ` : ""}${vd?.message ?? "giá trị chưa hợp lệ"}`);
  }
  const bayGio = new Date();
  const bo = await nc.tx.payrollParamSet.create({
    data: {
      tenantId: nc.tenantId, kind: d.loai, effectiveFrom: ngayVeDate(d.hieuLucTu), values: hop.data as object, note: d.ghiChu,
      source: "nhap-tay", createdBy: nc.hoSo.userId, confirmedBy: nc.hoSo.userId, confirmedAt: bayGio,
    },
  });
  await nc.kiemToan({ action: "tao-tham-so-luong", objectType: "payroll_param_set", objectId: bo.id, after: { loai: d.loai, hieuLucTu: d.hieuLucTu, giaTri: hop.data as Record<string, unknown>, ghiChu: d.ghiChu } });
  await nc.suKien({ eventType: SU_KIEN.PAYROLL_PARAMS_CHANGED, objectType: "payroll_param_set", objectId: bo.id, payload: { loai: d.loai, hieuLucTu: d.hieuLucTu } });
  return { id: bo.id };
}

/** Kế toán xác nhận một bộ (thường là bộ nạp sẵn) sau khi đối chiếu văn bản (LU-11). Xác nhận một lần (trigger). */
export async function xacNhanThamSo(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.create", { objectType: "payroll_param_set", objectId: id });
  // Khóa tư vấn theo bộ: hai lần bấm cùng lúc → lần sau thấy đã xác nhận.
  await nc.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tham-so-luong:${id}`}))`;
  const bo = await nc.tx.payrollParamSet.findFirst({ where: { id } });
  if (!bo) throw new LoiKhongTimThay("Bộ tham số");
  if (bo.confirmedAt) throw new LoiNghiepVu("Bộ tham số này đã được xác nhận.", 409, "da-xac-nhan");
  await nc.tx.payrollParamSet.update({ where: { id }, data: { confirmedBy: nc.hoSo.userId, confirmedAt: new Date() } });
  await nc.kiemToan({ action: "xac-nhan-tham-so-luong", objectType: "payroll_param_set", objectId: id, after: { loai: bo.kind, hieuLucTu: dateVeNgay(bo.effectiveFrom) } });
  await nc.suKien({ eventType: SU_KIEN.PAYROLL_PARAMS_CHANGED, objectType: "payroll_param_set", objectId: id, payload: { loai: bo.kind, xacNhan: true } });
  return { id };
}

export async function xemMauNganHang(nc: NguCanh) {
  batBuocQuyenLuong(nc, "luong.export", { objectType: "setting" });
  return docMauNganHang(nc.tx);
}

/** Lưu mẫu file chi lương ngân hàng: cột, thứ tự, nội dung chuyển khoản (LU-51). */
export async function luuMauNganHang(nc: NguCanh, d: z.infer<typeof LuocDoXuatNganHang>) {
  batBuocQuyenLuong(nc, "luong.export", { objectType: "setting" });
  await nc.tx.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: nc.tenantId, key: KHOA_XUAT_NGAN_HANG } },
    update: { value: d, status: "hoat-dong", updatedBy: nc.hoSo.userId },
    create: { tenantId: nc.tenantId, key: KHOA_XUAT_NGAN_HANG, value: d, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "setting", after: { khoa: KHOA_XUAT_NGAN_HANG, ...d } });
  return d;
}
