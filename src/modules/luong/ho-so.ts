import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { laLoiTrung, LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { banDoTen } from "@/modules/cham-cong/chung";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { batBuocQuyenLuong, ghiXem, locNguoiLuong, trongPhamViLuong } from "./chung";
import type { LuocDoHoSoLuong, LuocDoKetThucNguoiPhuThuoc, LuocDoLoaiPhuCap, LuocDoNguoiPhuThuoc } from "./luoc-do";
import { chonBoHieuLuc, NHAN_CACH_TRA, NHAN_LOAI_HOP_DONG, NHAN_PHUONG_PHAP_THUE, type CachTra, type LoaiHopDong, type PhuongPhapThue } from "./tinh-toan";

/**
 * Hồ sơ lương (LU-01 → LU-05): phiên bản theo ngày hiệu lực (chỉ ghi thêm), danh mục phụ cấp, người phụ thuộc.
 * Nhân sự quản lý (`luong.update`); xem cần `luong.view` phạm vi rộng hơn "của tôi" + 2 lớp; mỗi lần xem ghi nhật ký.
 */

type DongHoSo = Awaited<ReturnType<ClientTenant["salaryProfile"]["findMany"]>>[number];

/** Phiên bản hồ sơ áp cho ngày `ngay` của nhiều người (QĐ-144: hiệu lực lớn nhất ≤ ngày, cùng ngày → bản tạo sau). */
export async function hoSoApDung(tx: ClientTenant, userIds: string[] | null, ngay: string): Promise<Map<string, DongHoSo>> {
  const ds = await tx.salaryProfile.findMany({
    where: { ...(userIds ? { userId: { in: userIds } } : {}), effectiveFrom: { lte: ngayVeDate(ngay) } },
    orderBy: [{ userId: "asc" }, { effectiveFrom: "asc" }],
  });
  const theoNguoi = new Map<string, DongHoSo[]>();
  for (const d of ds) theoNguoi.set(d.userId, [...(theoNguoi.get(d.userId) ?? []), d]);
  const kq = new Map<string, DongHoSo>();
  for (const [u, arr] of theoNguoi) {
    const chon = chonBoHieuLuc(arr.map((x) => ({ ...x, hieuLucTu: dateVeNgay(x.effectiveFrom), taoLuc: x.createdAt })), ngay);
    if (chon) kq.set(u, chon);
  }
  return kq;
}

/** Số người phụ thuộc đang được giảm trừ trong tháng có ngày đầu `dauThang` (LU-04). */
export async function soNguoiPhuThuoc(tx: ClientTenant, userIds: string[], dauThang: string): Promise<Map<string, number>> {
  const d = ngayVeDate(dauThang);
  const ds = await tx.salaryDependent.findMany({
    where: { userId: { in: userIds }, fromMonth: { lte: d }, OR: [{ toMonth: null }, { toMonth: { gte: d } }] },
    select: { userId: true },
  });
  const kq = new Map<string, number>();
  for (const x of ds) kq.set(x.userId, (kq.get(x.userId) ?? 0) + 1);
  return kq;
}

function moTaHoSo(h: DongHoSo, tenPhuCap: Map<string, string>) {
  const phuCap = Array.isArray(h.allowances) ? (h.allowances as { loaiId: string; soTien: number }[]) : [];
  return {
    id: h.id,
    hieuLucTu: dateVeNgay(h.effectiveFrom),
    loaiHopDong: h.contractType as LoaiHopDong,
    nhanLoaiHopDong: NHAN_LOAI_HOP_DONG[h.contractType as LoaiHopDong] ?? h.contractType,
    tyLeThuViec: h.probationPercent === null ? null : Number(h.probationPercent),
    cachTra: h.payBasis as CachTra,
    nhanCachTra: NHAN_CACH_TRA[h.payBasis as CachTra] ?? h.payBasis,
    luongCoBan: Number(h.baseSalary),
    luongDongBH: Number(h.insuranceSalary),
    thuongKpi: Number(h.kpiBonus),
    huongHoaHong: h.commissionEnabled,
    phuongPhapThue: h.taxMethod as PhuongPhapThue,
    nhanPhuongPhapThue: NHAN_PHUONG_PHAP_THUE[h.taxMethod as PhuongPhapThue] ?? h.taxMethod,
    phuCap: phuCap.map((p) => ({ loaiId: p.loaiId, ten: tenPhuCap.get(p.loaiId) ?? "—", soTien: Number(p.soTien) })),
    soTaiKhoan: h.bankAccount,
    nganHang: h.bankName,
    chuTaiKhoan: h.accountHolder,
    maSoThue: h.taxCode,
    ghiChu: h.note,
    taoLuc: h.createdAt,
  };
}

async function banDoPhuCap(tx: ClientTenant) {
  const ds = await tx.salaryAllowanceType.findMany({ select: { id: true, name: true } });
  return new Map(ds.map((d) => [d.id, d.name]));
}

/** Danh sách nhân viên trong phạm vi + hồ sơ đang hiệu lực (LU-01). Ghi nhật ký xem. */
export async function danhSachHoSo(nc: NguCanh, homNay = homNayVN()) {
  batBuocQuyenLuong(nc, "luong.view", { objectType: "salary_profile" });
  const loc = await locNguoiLuong(nc);
  const nguoi = await nc.tx.user.findMany({
    where: { isSystem: false, status: "hoat-dong", ...(loc.userId ? { id: { in: loc.userId.in } } : {}) },
    select: { id: true, fullName: true, email: true, staffProfile: { select: { employeeCode: true, jobTitle: true, staffType: true } } },
    orderBy: { fullName: "asc" },
  });
  const ids = nguoi.map((n) => n.id);
  const hs = await hoSoApDung(nc.tx, ids, homNay);
  const npt = await soNguoiPhuThuoc(nc.tx, ids, `${homNay.slice(0, 7)}-01`);
  const tenPc = await banDoPhuCap(nc.tx);
  await ghiXem(nc, "danh-sach-ho-so-luong", { objectType: "salary_profile" }, [...hs.keys()]);
  return nguoi.map((n) => {
    const h = hs.get(n.id);
    return {
      id: n.id, hoTen: n.fullName, email: n.email, maNv: n.staffProfile?.employeeCode ?? null, chucDanh: n.staffProfile?.jobTitle ?? null,
      hoSo: h ? moTaHoSo(h, tenPc) : null, soNguoiPhuThuoc: npt.get(n.id) ?? 0,
    };
  });
}

/** Lịch sử phiên bản hồ sơ + người phụ thuộc của một nhân viên. Ngoài phạm vi → 404 (không lộ tồn tại). */
export async function lichSuHoSo(nc: NguCanh, userId: string) {
  batBuocQuyenLuong(nc, "luong.view", { objectType: "salary_profile", objectId: userId });
  if (!(await trongPhamViLuong(nc, userId))) throw new LoiKhongTimThay("Nhân viên");
  const u = await nc.tx.user.findFirst({ where: { id: userId, isSystem: false }, select: { id: true, fullName: true, staffProfile: { select: { employeeCode: true, hiredAt: true } } } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  const ds = await nc.tx.salaryProfile.findMany({ where: { userId }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  const npt = await nc.tx.salaryDependent.findMany({ where: { userId }, orderBy: { fromMonth: "asc" } });
  const tenPc = await banDoPhuCap(nc.tx);
  const ten = await banDoTen(nc.tx, ds.map((d) => d.createdBy));
  await ghiXem(nc, "lich-su-ho-so-luong", { objectType: "salary_profile", objectId: userId }, [userId]);
  return {
    nguoi: { id: u.id, hoTen: u.fullName, maNv: u.staffProfile?.employeeCode ?? null, ngayVaoLam: u.staffProfile?.hiredAt ? dateVeNgay(u.staffProfile.hiredAt) : null },
    phienBan: ds.map((d) => ({ ...moTaHoSo(d, tenPc), nguoiTao: d.createdBy ? (ten.get(d.createdBy) ?? "—") : "—" })),
    nguoiPhuThuoc: npt.map((p) => ({ id: p.id, hoTen: p.fullName, quanHe: p.relationship, soGiayTo: p.idNumber, tuThang: dateVeNgay(p.fromMonth).slice(0, 7), denThang: p.toMonth ? dateVeNgay(p.toMonth).slice(0, 7) : null })),
  };
}

/**
 * Tạo PHIÊN BẢN hồ sơ lương mới (LU-02). Không sửa bản cũ: cùng ngày hiệu lực thì bản mới đè (bản tạo sau thắng).
 * Nhật ký ghi các trường đổi so với bản trước, KHÔNG ghi số tiền (QĐ-148).
 */
export async function taoHoSoLuong(nc: NguCanh, d: z.infer<typeof LuocDoHoSoLuong>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_profile", objectId: d.nguoiId });
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true, fullName: true, status: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  if (d.phuCap.length) {
    const loai = await nc.tx.salaryAllowanceType.findMany({ where: { id: { in: d.phuCap.map((p) => p.loaiId) }, status: "hoat-dong" }, select: { id: true } });
    if (loai.length !== d.phuCap.length) throw new LoiDinhDang("phuCap", "Có loại phụ cấp không tồn tại hoặc đã ngừng.");
  }
  const truoc = (await hoSoApDung(nc.tx, [d.nguoiId], d.hieuLucTu)).get(d.nguoiId) ?? null;
  const moi = await nc.tx.salaryProfile.create({
    data: {
      tenantId: nc.tenantId, userId: d.nguoiId, effectiveFrom: ngayVeDate(d.hieuLucTu), contractType: d.loaiHopDong, probationPercent: d.tyLeThuViec,
      payBasis: d.cachTra, baseSalary: BigInt(d.luongCoBan), insuranceSalary: BigInt(d.luongDongBH), kpiBonus: BigInt(d.thuongKpi),
      commissionEnabled: d.huongHoaHong, taxMethod: d.phuongPhapThue, allowances: d.phuCap, bankAccount: d.soTaiKhoan, bankName: d.nganHang,
      accountHolder: d.chuTaiKhoan, taxCode: d.maSoThue, note: d.ghiChu, createdBy: nc.hoSo.userId,
    },
  });
  const truongDoi: string[] = [];
  if (truoc) {
    const so = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    if (so(truoc.contractType, d.loaiHopDong) || so(truoc.probationPercent === null ? null : Number(truoc.probationPercent), d.tyLeThuViec)) truongDoi.push("loại hợp đồng");
    if (so(truoc.payBasis, d.cachTra)) truongDoi.push("cách trả lương");
    if (Number(truoc.baseSalary) !== d.luongCoBan) truongDoi.push("lương cơ bản");
    if (Number(truoc.insuranceSalary) !== d.luongDongBH) truongDoi.push("lương đóng bảo hiểm");
    if (Number(truoc.kpiBonus) !== d.thuongKpi) truongDoi.push("mức thưởng KPI");
    if (truoc.commissionEnabled !== d.huongHoaHong) truongDoi.push("hoa hồng");
    if (truoc.taxMethod !== d.phuongPhapThue) truongDoi.push("cách khấu trừ thuế");
    if (so(truoc.allowances, d.phuCap)) truongDoi.push("phụ cấp");
    if (so(truoc.bankAccount, d.soTaiKhoan) || so(truoc.bankName, d.nganHang) || so(truoc.accountHolder, d.chuTaiKhoan)) truongDoi.push("tài khoản ngân hàng");
    if (so(truoc.taxCode, d.maSoThue)) truongDoi.push("mã số thuế");
  }
  await nc.kiemToan({
    action: "tao-ho-so-luong", objectType: "salary_profile", objectId: moi.id,
    after: { nguoi: d.nguoiId, hieuLucTu: d.hieuLucTu, loaiHopDong: d.loaiHopDong, cachTra: d.cachTra, phienBanTruoc: truoc?.id ?? null, truongDoi: truoc ? truongDoi : ["tạo mới"] },
  });
  await nc.suKien({ eventType: SU_KIEN.SALARY_PROFILE_CHANGED, objectType: "salary_profile", objectId: moi.id, payload: { nguoi: d.nguoiId, hieuLucTu: d.hieuLucTu } });
  return { id: moi.id, nguoi: { id: u.id, hoTen: u.fullName } };
}

// ---------------------------------------------------------------------------
// Danh mục phụ cấp (LU-03)
// ---------------------------------------------------------------------------

export async function danhSachLoaiPhuCap(nc: NguCanh) {
  if (!nc.hoSo.quyen.has("luong.update")) batBuocQuyenLuong(nc, "luong.view", { objectType: "salary_allowance_type" });
  else batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_allowance_type" });
  const ds = await nc.tx.salaryAllowanceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return ds.map((x) => ({ id: x.id, ma: x.code, ten: x.name, chiuThue: x.taxable, tinhBH: x.insurable, theo: x.basis, thuTu: x.sortOrder, trangThai: x.status }));
}

export async function taoLoaiPhuCap(nc: NguCanh, d: z.infer<typeof LuocDoLoaiPhuCap>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_allowance_type" });
  try {
    const x = await nc.tx.salaryAllowanceType.create({
      data: { tenantId: nc.tenantId, code: d.ma, name: d.ten, taxable: d.chiuThue, insurable: d.tinhBH, basis: d.theo, sortOrder: d.thuTu, status: d.trangThai, createdBy: nc.hoSo.userId },
    });
    await nc.kiemToan({ action: "tao", objectType: "salary_allowance_type", objectId: x.id, after: d });
    return { id: x.id };
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("ma", "Mã phụ cấp đã có.");
    throw e;
  }
}

/** Sửa loại phụ cấp: đổi cờ chỉ áp cho lần tính SAU (dòng lương đã tính giữ ảnh chụp cờ cũ). Không đổi mã. */
export async function suaLoaiPhuCap(nc: NguCanh, id: string, d: z.infer<typeof LuocDoLoaiPhuCap>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_allowance_type", objectId: id });
  const cu = await nc.tx.salaryAllowanceType.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Loại phụ cấp");
  if (cu.code !== d.ma) throw new LoiDinhDang("ma", "Không đổi mã của loại phụ cấp đã có.");
  await nc.tx.salaryAllowanceType.update({ where: { id }, data: { name: d.ten, taxable: d.chiuThue, insurable: d.tinhBH, basis: d.theo, sortOrder: d.thuTu, status: d.trangThai } });
  await nc.kiemToan({ action: "sua", objectType: "salary_allowance_type", objectId: id, before: { ten: cu.name, chiuThue: cu.taxable, tinhBH: cu.insurable, theo: cu.basis, trangThai: cu.status }, after: d });
  return { id };
}

// ---------------------------------------------------------------------------
// Người phụ thuộc (LU-04)
// ---------------------------------------------------------------------------

export async function themNguoiPhuThuoc(nc: NguCanh, d: z.infer<typeof LuocDoNguoiPhuThuoc>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_dependent" });
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  if (d.denThang && d.denThang < d.tuThang) throw new LoiDinhDang("denThang", "Tháng kết thúc phải từ tháng bắt đầu trở đi.");
  const x = await nc.tx.salaryDependent.create({
    data: {
      tenantId: nc.tenantId, userId: d.nguoiId, fullName: d.hoTen, relationship: d.quanHe, idNumber: d.soGiayTo,
      fromMonth: ngayVeDate(`${d.tuThang}-01`), toMonth: d.denThang ? ngayVeDate(`${d.denThang}-01`) : null, createdBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({ action: "tao", objectType: "salary_dependent", objectId: x.id, after: { nguoi: d.nguoiId, tuThang: d.tuThang, denThang: d.denThang } });
  await nc.suKien({ eventType: SU_KIEN.SALARY_PROFILE_CHANGED, objectType: "salary_dependent", objectId: x.id, payload: { nguoi: d.nguoiId } });
  return { id: x.id };
}

/** Kết thúc giảm trừ một người phụ thuộc từ sau tháng `denThang` (không xóa — kỳ đã tính giữ ảnh chụp số người). */
export async function ketThucNguoiPhuThuoc(nc: NguCanh, id: string, d: z.infer<typeof LuocDoKetThucNguoiPhuThuoc>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_dependent", objectId: id });
  const x = await nc.tx.salaryDependent.findFirst({ where: { id } });
  if (!x) throw new LoiKhongTimThay("Người phụ thuộc");
  if (`${d.denThang}-01` < dateVeNgay(x.fromMonth)) throw new LoiNghiepVu("Tháng kết thúc phải từ tháng bắt đầu trở đi.", 422, "sai-thang");
  await nc.tx.salaryDependent.update({ where: { id }, data: { toMonth: ngayVeDate(`${d.denThang}-01`) } });
  await nc.kiemToan({ action: "sua", objectType: "salary_dependent", objectId: id, before: { denThang: x.toMonth ? dateVeNgay(x.toMonth).slice(0, 7) : null }, after: { denThang: d.denThang } });
  return { id };
}
