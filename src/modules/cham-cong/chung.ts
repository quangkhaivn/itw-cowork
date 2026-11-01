import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { coQuyen, idNguoiTrongPhamVi, LoiThieuQuyen } from "@/lib/phan-quyen";
import { luocDoGiaTri, timMuc } from "@/modules/cau-hinh/danh-muc";
import { cacNgayTrongKhoang, congDuKien, PHAN_NGAY, type CaLam, type CongDuKien, type NghiTrongNgay, type PhanNgay } from "./tinh-toan";

/**
 * Phần dùng chung của chấm công (0.19.0): đọc Cấu hình một lần, phạm vi xem / duyệt, lịch làm và
 * công dự kiến của nhiều người trong một khoảng ngày. Luật: BUSINESS_RULES.md mục 30.
 */

// ---------------------------------------------------------------------------
// Cấu hình
// ---------------------------------------------------------------------------

const KHOA_CAU_HINH = {
  banKinhMacDinhM: "cham_cong.ban_kinh_mac_dinh_m",
  doChinhXacToiDaM: "cham_cong.do_chinh_xac_toi_da_m",
  tocDoToiDaKmh: "cham_cong.toc_do_toi_da_kmh",
  chongBamTrungGiay: "cham_cong.chong_bam_trung_giay",
  choPhepMuonPhut: "cham_cong.di_muon_cho_phep_phut",
  choPhepSomPhut: "cham_cong.ve_som_cho_phep_phut",
  cuaSoTruocPhut: "cham_cong.cua_so_truoc_ca_phut",
  cuaSoSauPhut: "cham_cong.cua_so_sau_ca_phut",
  nhacChuaChamSauPhut: "cham_cong.nhac_chua_cham_sau_phut",
  mayMatKetNoiPhut: "cham_cong.may_mat_ket_noi_phut",
  hanPhanHoiNgay: "cham_cong.han_phan_hoi_ngay",
  gioDemBatDau: "cham_cong.gio_dem_bat_dau",
  gioDemKetThuc: "cham_cong.gio_dem_ket_thuc",
  tangCaToiDaThang: "cham_cong.tang_ca_toi_da_thang",
  tangCaToiDaNam: "cham_cong.tang_ca_toi_da_nam",
  tangCaCanhBaoPhanTram: "cham_cong.tang_ca_canh_bao_phan_tram",
  phepSoNgayNam: "nghi_phep.so_ngay_nam",
  phepThamNienSoNam: "nghi_phep.tham_nien_so_nam",
  phepThamNienCongNgay: "nghi_phep.tham_nien_cong_ngay",
  phepCongDonTheoThang: "nghi_phep.cong_don_theo_thang",
  phepChuyenNamSauToiDa: "nghi_phep.chuyen_nam_sau_toi_da",
} as const;

export type CauHinhChamCong = { -readonly [K in keyof typeof KHOA_CAU_HINH]: number | null };

/** Đọc mọi ngưỡng chấm công / nghỉ phép bằng MỘT truy vấn; khóa chưa đặt hoặc sai lược đồ → mặc định. */
export async function docCauHinhChamCong(tx: ClientTenant): Promise<CauHinhChamCong> {
  const khoas = Object.values(KHOA_CAU_HINH) as string[];
  const dong = await tx.tenantSetting.findMany({ where: { key: { in: khoas }, status: "hoat-dong" }, select: { key: true, value: true } });
  const bang = new Map(dong.map((d) => [d.key, d.value]));
  const kq = {} as CauHinhChamCong;
  for (const [ten, khoa] of Object.entries(KHOA_CAU_HINH) as [keyof CauHinhChamCong, string][]) {
    const muc = timMuc(khoa);
    if (!muc) throw new Error(`Khóa cấu hình không có trong danh mục: ${khoa}`);
    const gt = bang.get(khoa);
    const hop = gt === undefined ? null : luocDoGiaTri(muc).safeParse(gt);
    kq[ten] = hop?.success ? hop.data : muc.macDinh;
  }
  return kq;
}

/** Giá trị số chắc chắn có (các khóa có mặc định ≠ null trong danh mục). */
export function so(x: number | null, duPhong: number): number {
  return x ?? duPhong;
}

// ---------------------------------------------------------------------------
// Phạm vi
// ---------------------------------------------------------------------------

/** Id người mà người đang thao tác được XEM chấm công (luôn gồm chính mình nếu có `cham_cong.view`). */
export async function nguoiDuocXem(nc: NguCanh): Promise<string[] | "tat-ca"> {
  return idNguoiTrongPhamVi(nc.tx, nc.hoSo, "cham_cong.view");
}

/** Cấp dưới TRỰC TIẾP (staff_profiles.manager_id) — quản lý trực tiếp luôn xem và duyệt được đơn của họ. */
export async function capDuoiTrucTiep(tx: ClientTenant, userId: string): Promise<string[]> {
  const ds = await tx.staffProfile.findMany({ where: { managerId: userId }, select: { userId: true } });
  return ds.map((d) => d.userId);
}

/** Điều kiện Prisma lọc bản ghi có cột `userId` theo phạm vi xem + cấp dưới trực tiếp. */
export async function locNguoiXem(nc: NguCanh): Promise<{ userId?: { in: string[] } }> {
  const pv = await nguoiDuocXem(nc);
  if (pv === "tat-ca") return {};
  const ds = new Set([...pv, nc.hoSo.userId, ...(await capDuoiTrucTiep(nc.tx, nc.hoSo.userId))]);
  return { userId: { in: [...ds] } };
}

export async function duocXemNguoi(nc: NguCanh, userId: string): Promise<boolean> {
  if (userId === nc.hoSo.userId) return true;
  const loc = await locNguoiXem(nc);
  return !loc.userId || loc.userId.in.includes(userId);
}

/**
 * Ai được DUYỆT đơn của `nguoiXinId` (NS-21, NS-34):
 *  - quản lý trực tiếp (staff_profiles.manager_id) — luôn được;
 *  - hoặc có `cham_cong.approve` và người xin nằm trong phạm vi quyền đó (trưởng phòng: nhóm / phòng;
 *    Nhân sự, Giám đốc: toàn công ty).
 * Không ai tự duyệt đơn của mình, trừ người có phạm vi duyệt toàn công ty (như BG-05).
 */
export async function kiemDuocDuyet(nc: NguCanh, nguoiXinId: string, doiTuong: { objectType: string; objectId: string }): Promise<void> {
  const pvDuyet = nc.hoSo.phamVi.get("cham_cong.approve");
  if (nguoiXinId === nc.hoSo.userId) {
    if (pvDuyet === "all") return;
    throw new LoiNghiepVu("Không tự duyệt đơn của chính mình — quản lý trực tiếp hoặc Nhân sự duyệt.", 403, "khong-tu-duyet");
  }
  const hs = await nc.tx.staffProfile.findFirst({ where: { userId: nguoiXinId }, select: { managerId: true } });
  if (hs?.managerId === nc.hoSo.userId) return;
  if (!coQuyen(nc.hoSo, "cham_cong.approve")) throw new LoiThieuQuyen("cham_cong.approve", doiTuong);
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "cham_cong.approve");
  if (pv !== "tat-ca" && !pv.includes(nguoiXinId)) {
    if (!(await duocXemNguoi(nc, nguoiXinId))) throw new LoiKhongTimThay("Đơn");
    throw new LoiNghiepVu("Người này không thuộc nhóm bạn được duyệt.", 403, "ngoai-pham-vi-duyet");
  }
}

/** Có được duyệt không (cho giao diện hiện nút) — không ném lỗi. */
export async function coTheDuyet(nc: NguCanh, nguoiXinId: string): Promise<boolean> {
  try {
    await kiemDuocDuyet(nc, nguoiXinId, { objectType: "cham-cong", objectId: nguoiXinId });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lịch làm, ngày lễ, nghỉ phép đã duyệt → công dự kiến
// ---------------------------------------------------------------------------

export function laLichNgay(x: unknown): x is PhanNgay[] {
  return Array.isArray(x) && x.length === 7 && x.every((v) => (PHAN_NGAY as readonly string[]).includes(v as string));
}

export interface LichApDung {
  scheduleId: string;
  tenLich: string;
  tenCa: string;
  ca: CaLam;
  ngay: PhanNgay[];
}

type DongGanLich = { userId: string; effectiveFrom: Date; schedule: { id: string; name: string; days: unknown; shift: { name: string; startMinute: number; endMinute: number; breakStartMinute: number | null; breakMinutes: number; lateGraceMinutes: number | null; earlyGraceMinutes: number | null } } };

/** Lịch áp cho từng người: hàm (ngày) → lịch có hiệu lực ngày đó, hoặc null nếu chưa gán. */
export async function lichCuaNhieuNguoi(tx: ClientTenant, userIds: string[], den: string): Promise<Map<string, (ngay: string) => LichApDung | null>> {
  const ds = (await tx.scheduleAssignment.findMany({
    where: { userId: { in: userIds }, effectiveFrom: { lte: new Date(`${den}T00:00:00.000Z`) } },
    orderBy: { effectiveFrom: "asc" },
    select: {
      userId: true,
      effectiveFrom: true,
      schedule: {
        select: {
          id: true, name: true, days: true,
          shift: { select: { name: true, startMinute: true, endMinute: true, breakStartMinute: true, breakMinutes: true, lateGraceMinutes: true, earlyGraceMinutes: true } },
        },
      },
    },
  })) as DongGanLich[];
  const theoNguoi = new Map<string, { tu: string; lich: LichApDung | null }[]>();
  for (const g of ds) {
    const s = g.schedule;
    const lich: LichApDung | null = laLichNgay(s.days)
      ? {
          scheduleId: s.id,
          tenLich: s.name,
          tenCa: s.shift.name,
          ngay: s.days,
          ca: {
            batDauPhut: s.shift.startMinute,
            ketThucPhut: s.shift.endMinute,
            nghiBatDauPhut: s.shift.breakStartMinute,
            nghiPhut: s.shift.breakMinutes,
            choPhepMuonPhut: s.shift.lateGraceMinutes,
            choPhepSomPhut: s.shift.earlyGraceMinutes,
          },
        }
      : null;
    const arr = theoNguoi.get(g.userId) ?? [];
    arr.push({ tu: g.effectiveFrom.toISOString().slice(0, 10), lich });
    theoNguoi.set(g.userId, arr);
  }
  const kq = new Map<string, (ngay: string) => LichApDung | null>();
  for (const id of userIds) {
    const arr = theoNguoi.get(id) ?? [];
    kq.set(id, (ngay: string) => {
      let chon: LichApDung | null = null;
      for (const a of arr) if (a.tu <= ngay) chon = a.lich;
      return chon;
    });
  }
  return kq;
}

export async function ngayLeTrongKhoang(tx: ClientTenant, tu: string, den: string): Promise<Map<string, string>> {
  const ds = await tx.holiday.findMany({
    where: { status: "hoat-dong", date: { gte: new Date(`${tu}T00:00:00.000Z`), lte: new Date(`${den}T00:00:00.000Z`) } },
    select: { date: true, name: true },
  });
  return new Map(ds.map((d) => [d.date.toISOString().slice(0, 10), d.name]));
}

/** Nghỉ phép ĐÃ DUYỆT theo (người → ngày → phần nghỉ). */
export async function nghiDaDuyet(tx: ClientTenant, userIds: string[], tu: string, den: string): Promise<Map<string, Map<string, NghiTrongNgay>>> {
  const ds = await tx.leaveRequest.findMany({
    where: {
      userId: { in: userIds },
      status: "da-duyet",
      startDate: { lte: new Date(`${den}T00:00:00.000Z`) },
      endDate: { gte: new Date(`${tu}T00:00:00.000Z`) },
    },
    select: { userId: true, startDate: true, endDate: true, portion: true, leaveType: { select: { code: true, paid: true } } },
  });
  const kq = new Map<string, Map<string, NghiTrongNgay>>();
  for (const d of ds) {
    const m = kq.get(d.userId) ?? new Map<string, NghiTrongNgay>();
    for (const ngay of cacNgayTrongKhoang(d.startDate.toISOString().slice(0, 10), d.endDate.toISOString().slice(0, 10))) {
      if (ngay < tu || ngay > den) continue;
      const cu = m.get(ngay);
      const phan = d.portion as NghiTrongNgay["phan"];
      const giaTri = phan === "ca-ngay" ? 1 : 0.5;
      // Hai đơn nửa ngày (sáng + chiều) cùng một ngày = nghỉ cả ngày.
      m.set(ngay, cu ? { ...cu, giaTri: Math.min(1, cu.giaTri + giaTri), phan: "ca-ngay" } : { giaTri, phan, maLoai: d.leaveType.code, coLuong: d.leaveType.paid });
    }
    kq.set(d.userId, m);
  }
  return kq;
}

/** Công dự kiến của MỘT người trong một khoảng ngày (dùng cho đơn nghỉ, nhắc việc, bảng công). */
export async function congDuKienCuaNguoi(tx: ClientTenant, userId: string, tu: string, den: string): Promise<CongDuKien[]> {
  const lich = (await lichCuaNhieuNguoi(tx, [userId], den)).get(userId)!;
  const le = await ngayLeTrongKhoang(tx, tu, den);
  return cacNgayTrongKhoang(tu, den).map((ngay) => {
    const l = lich(ngay);
    return congDuKien(ngay, l?.ca ?? null, l?.ngay ?? null, le.has(ngay));
  });
}

/** Họ tên theo id (cho các cột "người duyệt", "người tạo" không khai quan hệ). */
export async function banDoTen(tx: ClientTenant, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ds = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (ds.length === 0) return new Map();
  const u = await tx.user.findMany({ where: { id: { in: ds } }, select: { id: true, fullName: true } });
  return new Map(u.map((x) => [x.id, x.fullName]));
}
