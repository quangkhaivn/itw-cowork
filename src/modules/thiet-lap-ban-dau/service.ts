import type { NguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { coQuyenMay, danhSachMayLa } from "@/modules/cham-cong/may-cham-cong";
import { congNgay } from "@/modules/cham-cong/tinh-toan";
import { homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { KHOA_LOGO } from "@/modules/ho-so-cong-ty/service";
import { nguoiGiuQuyen } from "@/modules/thong-bao/service";
import { hoSoApDung, soNguoiPhuThuocChuaDu } from "@/modules/luong/ho-so";
import { LOAI_THAM_SO, chonBoHieuLuc } from "@/modules/luong/tinh-toan";
import { dateVeNgay } from "@/modules/crm/chung";

/**
 * 0.22.0 (QĐ-180) — "Thiết lập ban đầu": việc cần BỔ SUNG theo người phụ trách. Không việc nào bắt buộc — phần mềm vẫn
 * chạy khi thiếu (BUSINESS_RULES mục 33). Mỗi nhóm chỉ hiện cho người có quyền của nhóm đó; đếm bằng truy vấn nhẹ (count
 * / distinct), chạy trong ngữ cảnh doanh nghiệp (RLS). Không trả số tiền, không trả tên người — chỉ con số còn thiếu.
 */

export type MaNhomThietLap = "nhan-su" | "ke-toan" | "ky-thuat" | "quan-tri";

export interface ViecThietLap {
  ma: string;
  ten: string;
  /** Số mục còn thiếu (0 = xong). */
  conThieu: number;
  xong: boolean;
  duongDan: string;
  ghiChu: string;
}

export interface NhomThietLap {
  ma: MaNhomThietLap;
  ten: string;
  viec: ViecThietLap[];
}

const GHI_CHU_CHUNG = "Không bắt buộc — phần mềm vẫn chạy.";

function viec(ma: string, ten: string, conThieu: number, duongDan: string, ghiChu: string): ViecThietLap {
  return { ma, ten, conThieu: Math.max(0, conThieu), xong: conThieu <= 0, duongDan, ghiChu: `${GHI_CHU_CHUNG} ${ghiChu}`.trim() };
}

/** Nhóm việc người đang đăng nhập phụ trách (theo quyền). */
export function nhomDuocThay(nc: NguCanh): MaNhomThietLap[] {
  const ds: MaNhomThietLap[] = [];
  if (coQuyen(nc.hoSo, "nhan_su.update")) ds.push("nhan-su");
  if (coQuyen(nc.hoSo, "luong.create") || coQuyen(nc.hoSo, "luong.update")) ds.push("ke-toan");
  if (coQuyenMay(nc, "view")) ds.push("ky-thuat");
  if (coQuyen(nc.hoSo, "setting.update")) ds.push("quan-tri");
  return ds;
}

export async function viecThietLap(nc: NguCanh, homNay = homNayVN()): Promise<{ nhom: NhomThietLap[]; tongConThieu: number; soViecChuaXong: number }> {
  const tx = nc.tx;
  const thay = nhomDuocThay(nc);
  const nhom: NhomThietLap[] = [];
  const nguoiHoatDong = await tx.user.findMany({ where: { status: "hoat-dong", isSystem: false }, select: { id: true } });
  const idsHoatDong = nguoiHoatDong.map((u) => u.id);

  if (thay.includes("nhan-su")) {
    const [diaDiem, ca, macDinh, le, khongPin, mayChuaDiaDiem] = await Promise.all([
      tx.workLocation.count({ where: { status: "hoat-dong" } }),
      tx.workShift.count({ where: { status: "hoat-dong" } }),
      tx.workSchedule.count({ where: { status: "hoat-dong", isDefault: true } }),
      tx.holiday.count({ where: { status: "hoat-dong", date: { gte: ngayVeDate(homNay), lte: ngayVeDate(congNgay(homNay, 365)) } } }),
      tx.user.count({ where: { status: "hoat-dong", isSystem: false, OR: [{ staffProfile: null }, { staffProfile: { attendancePin: null } }] } }),
      tx.attendanceDevice.count({ where: { status: "hoat-dong", locationId: null } }),
    ]);
    nhom.push({
      ma: "nhan-su",
      ten: "Nhân sự",
      viec: [
        viec("dia-diem", "Địa điểm làm việc và bán kính GPS", diaDiem > 0 ? 0 : 1, "/nhan-su/thiet-lap", "Chưa có địa điểm thì chấm GPS ghi “ngoài vùng” chờ quản lý xem xét; bán kính trống = mặc định Cấu hình."),
        viec("ca", "Ca làm", ca > 0 ? 0 : 1, "/nhan-su/thiet-lap", "Giờ vào / ra, nghỉ giữa ca."),
        viec("lich-mac-dinh", "Lịch mặc định của công ty", macDinh > 0 ? 0 : 1, "/nhan-su/thiet-lap", "Người chưa được gán lịch dùng lịch mặc định; chưa có thì lương tạm tính công chuẩn theo T2–T6."),
        viec("ngay-le", "Ngày lễ 12 tháng tới", le > 0 ? 0 : 1, "/nhan-su/thiet-lap", "Nhắc: lễ âm lịch (Tết Nguyên đán, Giỗ Tổ Hùng Vương 10/3 âm lịch) đổi ngày dương mỗi năm — nhập tay cho năm tới."),
        viec("ho-so-pin", "Hồ sơ nhân sự và mã chấm công (PIN)", khongPin, "/nhan-su/ho-so", "Người không dùng máy vân tay không cần PIN (chấm GPS hoặc Nhân sự đặt công tay)."),
        viec("may-dia-diem", "Địa điểm đặt máy chấm công", mayChuaDiaDiem, "/may-cham-cong", "Kỹ thuật đăng ký máy trước; chọn địa điểm để kiểm tốc độ di chuyển bất thường."),
      ],
    });
  }

  if (thay.includes("ke-toan")) {
    // Tham số hiệu lực hôm nay chưa xác nhận (mỗi loại một bộ hiệu lực).
    const ts = await tx.payrollParamSet.findMany({ where: { effectiveFrom: { lte: ngayVeDate(homNay) } }, select: { kind: true, effectiveFrom: true, createdAt: true, confirmedAt: true } });
    let chuaXacNhan = 0;
    for (const loai of LOAI_THAM_SO) {
      const chon = chonBoHieuLuc(ts.filter((x) => x.kind === loai).map((x) => ({ ...x, hieuLucTu: dateVeNgay(x.effectiveFrom), taoLuc: x.createdAt })), homNay);
      if (!chon || !chon.confirmedAt) chuaXacNhan++;
    }
    const hs = await hoSoApDung(tx, idsHoatDong, homNay);
    const thieuTk = [...hs.values()].filter((h) => !h.bankAccount && h.paymentMethod !== "tien-mat").length;
    // QĐ-182: người phụ thuộc "chưa ghi tên" (chưa được giảm trừ) đang trong thời gian giảm trừ tháng này.
    const nptChuaDu = [...(await soNguoiPhuThuocChuaDu(tx, idsHoatDong, `${homNay.slice(0, 7)}-01`)).values()].reduce((a, b) => a + b, 0);
    nhom.push({
      ma: "ke-toan",
      ten: "Kế toán",
      viec: [
        viec("tham-so-luong", "Xác nhận tham số lương", chuaXacNhan, "/luong/tham-so", "Chưa xác nhận vẫn gửi duyệt / duyệt được (có cảnh báo, kiểm toán ghi lại)."),
        viec("ho-so-luong", "Hồ sơ lương", idsHoatDong.length - hs.size, "/luong/ho-so", "Người chưa có hồ sơ không vào bảng lương; bảng lương liệt kê riêng kèm nút tạo hồ sơ. Có thể nhập CSV."),
        viec("tai-khoan", "Tài khoản ngân hàng", thieuTk, "/luong/ho-so", "Chưa có tài khoản thì trả tay / tiền mặt — không chặn khóa kỳ, không vào file ngân hàng."),
        viec("nguoi-phu-thuoc", "Người phụ thuộc chưa đủ giấy tờ", nptChuaDu, "/luong/ho-so", "Thiếu họ tên hoặc giấy tờ hợp lệ (MST 10 / 10-3 số, CCCD 12 số, giấy tờ khác ≥ 6 ký tự chữ-số) thì CHƯA được giảm trừ gia cảnh — bổ sung ở Hồ sơ lương."),
      ],
    });
  }

  if (thay.includes("ky-thuat")) {
    const may = await tx.attendanceDevice.count({ where: { status: "hoat-dong" } });
    const mayLa = coQuyenMay(nc, "create") ? (await danhSachMayLa(nc)).length : 0;
    nhom.push({
      ma: "ky-thuat",
      ten: "Kỹ thuật",
      viec: [
        viec("may-cham-cong", "Máy chấm công", may > 0 ? 0 : 1, "/may-cham-cong", "Chưa có máy thì chấm GPS hoặc Nhân sự đặt công tay."),
        viec("may-la", "Máy lạ chờ đăng ký", mayLa, "/may-cham-cong", "Máy đang gọi về nhưng chưa đăng ký — lần chấm của máy lạ không được lưu."),
      ],
    });
  }

  if (thay.includes("quan-tri")) {
    const [ten, logo, mauTruong, giuQuyen] = await Promise.all([
      tx.tenantSetting.count({ where: { key: { in: ["cong_ty.ten", "cong_ty.dia_chi", "cong_ty.ma_so_thue"] }, status: "hoat-dong" } }),
      tx.tenantSetting.count({ where: { key: KHOA_LOGO, status: "hoat-dong" } }),
      tx.internEvalTemplate.count({ where: { status: "hoat-dong", school: { not: null } } }),
      Promise.all(["luong.create", "luong.update", "luong.approve", "setting.update"].map((m) => nguoiGiuQuyen(tx, m, true))),
    ]);
    const canBat = [...new Set(giuQuyen.flat())];
    const chua2Lop = canBat.length ? await tx.user.count({ where: { id: { in: canBat }, status: "hoat-dong", isSystem: false, totpEnabledAt: null } }) : 0;
    nhom.push({
      ma: "quan-tri",
      ten: "Giám đốc / Quản trị",
      viec: [
        viec("ho-so-cong-ty", "Hồ sơ công ty (tên, địa chỉ, mã số thuế)", 3 - ten, "/quan-tri/ho-so-cong-ty", "In trên báo giá, phiếu lương."),
        viec("logo", "Logo công ty", logo > 0 ? 0 : 1, "/quan-tri/ho-so-cong-ty", "Chưa có logo thì bản in chỉ có chữ."),
        viec("mau-phieu-thuc-tap", "Mẫu phiếu đánh giá thực tập của trường", mauTruong > 0 ? 0 : 1, "/thuc-tap/mau", "Chưa có mẫu của trường thì dùng mẫu chung."),
        viec("bat-2-lop", "Bật xác thực 2 lớp (người quản lý lương / cấu hình)", chua2Lop, "/tai-khoan#xac-thuc-2-lop", "Xem / tính lương người khác cần 2 lớp (Cấu hình luong.bat_buoc_2_lop)."),
      ],
    });
  }

  const tatCa = nhom.flatMap((n) => n.viec);
  return { nhom, tongConThieu: tatCa.reduce((a, v) => a + v.conThieu, 0), soViecChuaXong: tatCa.filter((v) => !v.xong).length };
}
