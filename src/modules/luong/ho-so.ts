import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { laLoiTrung, LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { taoThongBao } from "@/modules/thong-bao/service";
import { banDoTen } from "@/modules/cham-cong/chung";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { batBuocQuyenLuong, ghiXem, locNguoiLuong, trongPhamViLuong } from "./chung";
import { LuocDoHoSoLuong, type LuocDoKetThucNguoiPhuThuoc, type LuocDoLoaiPhuCap, type LuocDoNguoiPhuThuoc, type LuocDoSuaNguoiPhuThuoc } from "./luoc-do";
import { phanTichCsvHoSoLuong } from "./nhap-csv";
import { chonBoHieuLuc, NHAN_CACH_TRA, NHAN_LOAI_HOP_DONG, NHAN_PHUONG_PHAP_THUE, nguoiPhuThuocDuGiayTo, THUE_GOI_Y, type CachTra, type LoaiHopDong, type PhuongPhapThue } from "./tinh-toan";

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
    // QĐ-182: người phụ thuộc "chưa ghi tên" (thiếu họ tên / MST / số giấy tờ) KHÔNG được giảm trừ.
    where: { userId: { in: userIds }, infoPending: false, fromMonth: { lte: d }, OR: [{ toMonth: null }, { toMonth: { gte: d } }] },
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
    /** 0.22.0 (QĐ-173): chuyen-khoan | tien-mat; không có số tài khoản → thực tế trả tay. */
    hinhThucTra: (h.paymentMethod === "tien-mat" || !h.bankAccount ? "tien-mat" : "chuyen-khoan") as "chuyen-khoan" | "tien-mat",
    hinhThucTraKhai: h.paymentMethod as "chuyen-khoan" | "tien-mat",
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
    nguoiPhuThuoc: npt.map((p) => ({ id: p.id, hoTen: p.fullName, quanHe: p.relationship, soGiayTo: p.idNumber, chuaDuThongTin: p.infoPending, tuThang: dateVeNgay(p.fromMonth).slice(0, 7), denThang: p.toMonth ? dateVeNgay(p.toMonth).slice(0, 7) : null })),
  };
}

/**
 * Tạo PHIÊN BẢN hồ sơ lương mới (LU-02). Không sửa bản cũ: cùng ngày hiệu lực thì bản mới đè (bản tạo sau thắng).
 * Nhật ký ghi các trường đổi so với bản trước, KHÔNG ghi số tiền (QĐ-148).
 */
/** QĐ-159: không ai tự lập / sửa hồ sơ lương (kể cả người phụ thuộc) của CHÍNH MÌNH — kể cả Nhân sự, Kế toán, Giám đốc, Quản trị. */
function chanTuSua(nc: NguCanh, nguoiId: string) {
  if (nguoiId === nc.hoSo.userId) {
    throw new LoiNghiepVu("Không ai tự lập hoặc sửa hồ sơ lương của chính mình (kể cả Nhân sự, Kế toán, Giám đốc, Quản trị) — nhờ người khác có quyền lập hồ sơ lương.", 403, "tu-sua-ho-so");
  }
}

/** Che số tài khoản cho nhật ký / thông báo: chỉ giữ 4 số cuối (QĐ-159). */
export function cheTaiKhoan(tk: string | null | undefined): string | null {
  if (!tk) return null;
  return tk.length <= 4 ? "****" : `****${tk.slice(-4)}`;
}

export async function taoHoSoLuong(nc: NguCanh, d: z.infer<typeof LuocDoHoSoLuong>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_profile", objectId: d.nguoiId });
  chanTuSua(nc, d.nguoiId);
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true, fullName: true, status: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  if (d.phuCap.length) {
    const loai = await nc.tx.salaryAllowanceType.findMany({ where: { id: { in: d.phuCap.map((p) => p.loaiId) }, status: "hoat-dong" }, select: { id: true } });
    if (loai.length !== d.phuCap.length) throw new LoiDinhDang("phuCap", "Có loại phụ cấp không tồn tại hoặc đã ngừng.");
  }
  const truoc = (await hoSoApDung(nc.tx, [d.nguoiId], d.hieuLucTu)).get(d.nguoiId) ?? null;
  // Tài khoản ngân hàng so với phiên bản TẠO SAU CÙNG (bản người nhận đang thấy), không phụ thuộc ngày hiệu lực.
  const moiNhat = await nc.tx.salaryProfile.findFirst({ where: { userId: d.nguoiId }, orderBy: { createdAt: "desc" }, select: { bankAccount: true, bankName: true, accountHolder: true, paymentMethod: true } });
  const moi = await nc.tx.salaryProfile.create({
    data: {
      tenantId: nc.tenantId, userId: d.nguoiId, effectiveFrom: ngayVeDate(d.hieuLucTu), contractType: d.loaiHopDong, probationPercent: d.tyLeThuViec,
      payBasis: d.cachTra, baseSalary: BigInt(d.luongCoBan), insuranceSalary: BigInt(d.luongDongBH), kpiBonus: BigInt(d.thuongKpi),
      commissionEnabled: d.huongHoaHong, taxMethod: d.phuongPhapThue, allowances: d.phuCap, bankAccount: d.soTaiKhoan, bankName: d.nganHang,
      accountHolder: d.chuTaiKhoan, taxCode: d.maSoThue, note: d.ghiChu, createdBy: nc.hoSo.userId, paymentMethod: d.hinhThucTra,
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
    if (truoc.paymentMethod !== d.hinhThucTra) truongDoi.push("hình thức trả");
  }
  await nc.kiemToan({
    action: "tao-ho-so-luong", objectType: "salary_profile", objectId: moi.id,
    after: { nguoi: d.nguoiId, hieuLucTu: d.hieuLucTu, loaiHopDong: d.loaiHopDong, cachTra: d.cachTra, phienBanTruoc: truoc?.id ?? null, truongDoi: truoc ? truongDoi : ["tạo mới"] },
  });
  await nc.suKien({ eventType: SU_KIEN.SALARY_PROFILE_CHANGED, objectType: "salary_profile", objectId: moi.id, payload: { nguoi: d.nguoiId, hieuLucTu: d.hieuLucTu } });
  // QĐ-159: đổi tài khoản nhận lương → báo chính nhân viên trong ứng dụng + kiểm toán (số tài khoản che, chỉ 4 số cuối).
  // QA 0.21.0 v2: tài khoản ĐANG / SẼ áp dụng theo ngày hiệu lực có thể khác bản vừa tạo (bản lùi ngày không bao giờ thắng
  // bản hiệu lực sau nó) — thông báo phải nói đúng tài khoản sẽ nhận lương, không chỉ số của bản vừa tạo.
  const tatCa = (await nc.tx.salaryProfile.findMany({ where: { userId: d.nguoiId }, select: { id: true, effectiveFrom: true, createdAt: true, bankAccount: true } }))
    .map((x) => ({ ...x, hieuLucTu: dateVeNgay(x.effectiveFrom), taoLuc: x.createdAt }));
  const homNay = homNayVN();
  const apDung = [homNay, ...new Set(tatCa.map((x) => x.hieuLucTu).filter((n) => n > homNay))].sort()
    .map((n) => ({ ngay: n, tk: chonBoHieuLuc(tatCa, n)?.bankAccount ?? null }))
    .filter((x) => x.tk !== d.soTaiKhoan);
  // QA 0.22.0: đổi HÌNH THỨC nhận lương (chuyển khoản ↔ tiền mặt / trả tay) cũng là đổi nơi nhận tiền — báo nhân viên +
  // kiểm toán như đổi tài khoản; trước đây chuyển sang tiền mặt (giữ nguyên số tài khoản) không báo ai, không gắn cờ QĐ-161.
  const doiHinhThuc = Boolean(moiNhat && moiNhat.paymentMethod !== d.hinhThucTra);
  const doiTk = moiNhat && (moiNhat.bankAccount !== d.soTaiKhoan || moiNhat.bankName !== d.nganHang || moiNhat.accountHolder !== d.chuTaiKhoan || doiHinhThuc);
  if (doiTk) {
    await nc.kiemToan({
      action: "doi-tai-khoan-luong", objectType: "salary_profile", objectId: moi.id,
      before: { nguoi: d.nguoiId, taiKhoan: cheTaiKhoan(moiNhat.bankAccount), nganHang: moiNhat.bankName, hinhThucTra: moiNhat.paymentMethod },
      after: { nguoi: d.nguoiId, taiKhoan: cheTaiKhoan(d.soTaiKhoan), nganHang: d.nganHang, hinhThucTra: d.hinhThucTra, hieuLucTu: d.hieuLucTu },
    });
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: d.nguoiId, loai: "doi-tai-khoan-luong", mucDo: "canh-bao",
      tieuDe: "Tài khoản nhận lương của bạn vừa được đổi",
      noiDung: `${nc.hoSo.hoTen} đổi ${doiHinhThuc ? `hình thức nhận lương thành ${d.hinhThucTra === "tien-mat" ? "TIỀN MẶT / trả tay" : "chuyển khoản"} — ` : ""}tài khoản nhận lương thành ${cheTaiKhoan(d.soTaiKhoan) ?? "(trống)"}${d.nganHang ? ` — ${d.nganHang}` : ""} (hiệu lực từ ${d.hieuLucTu.split("-").reverse().join("/")}).${apDung.map((x) => ` Lưu ý: tài khoản ${x.ngay === homNay ? "đang áp dụng hôm nay" : `áp dụng từ ${x.ngay.split("-").reverse().join("/")}`} là ${cheTaiKhoan(x.tk) ?? "(trống)"}.`).join("")} Không phải bạn yêu cầu thì báo ngay Kế toán / Giám đốc.`,
      duongDan: "/luong/phieu-cua-toi", doiTuong: "salary_profile", doiTuongId: moi.id, khoaChongTrung: `doi-tai-khoan-luong:${moi.id}`,
    });
  }
  return { id: moi.id, nguoi: { id: u.id, hoTen: u.fullName }, doiTaiKhoan: Boolean(doiTk) };
}

// ---------------------------------------------------------------------------
// Danh mục phụ cấp (LU-03)
// ---------------------------------------------------------------------------

export async function danhSachLoaiPhuCap(nc: NguCanh) {
  if (!nc.hoSo.quyen.has("luong.update")) batBuocQuyenLuong(nc, "luong.view", { objectType: "salary_allowance_type" });
  else batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_allowance_type" });
  const ds = await nc.tx.salaryAllowanceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return ds.map((x) => ({ id: x.id, ma: x.code, ten: x.name, chiuThue: x.taxable, tinhBH: x.insurable, theo: x.basis, traDu: x.fullMonth, thuTu: x.sortOrder, trangThai: x.status }));
}

export async function taoLoaiPhuCap(nc: NguCanh, d: z.infer<typeof LuocDoLoaiPhuCap>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_allowance_type" });
  try {
    const x = await nc.tx.salaryAllowanceType.create({
      data: { tenantId: nc.tenantId, code: d.ma, name: d.ten, taxable: d.chiuThue, insurable: d.tinhBH, basis: d.theo, fullMonth: d.traDu, sortOrder: d.thuTu, status: d.trangThai, createdBy: nc.hoSo.userId },
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
  await nc.tx.salaryAllowanceType.update({ where: { id }, data: { name: d.ten, taxable: d.chiuThue, insurable: d.tinhBH, basis: d.theo, fullMonth: d.traDu, sortOrder: d.thuTu, status: d.trangThai } });
  await nc.kiemToan({ action: "sua", objectType: "salary_allowance_type", objectId: id, before: { ten: cu.name, chiuThue: cu.taxable, tinhBH: cu.insurable, theo: cu.basis, traDu: cu.fullMonth, trangThai: cu.status }, after: d });
  return { id };
}

// ---------------------------------------------------------------------------
// Người phụ thuộc (LU-04)
// ---------------------------------------------------------------------------

export async function themNguoiPhuThuoc(nc: NguCanh, d: z.infer<typeof LuocDoNguoiPhuThuoc>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_dependent" });
  chanTuSua(nc, d.nguoiId);
  const u = await nc.tx.user.findFirst({ where: { id: d.nguoiId, isSystem: false }, select: { id: true } });
  if (!u) throw new LoiKhongTimThay("Nhân viên");
  if (d.denThang && d.denThang < d.tuThang) throw new LoiDinhDang("denThang", "Tháng kết thúc phải từ tháng bắt đầu trở đi.");
  const x = await nc.tx.salaryDependent.create({
    data: {
      tenantId: nc.tenantId, userId: d.nguoiId, fullName: d.hoTen, relationship: d.quanHe, idNumber: d.soGiayTo,
      fromMonth: ngayVeDate(`${d.tuThang}-01`), toMonth: d.denThang ? ngayVeDate(`${d.denThang}-01`) : null, createdBy: nc.hoSo.userId,
      // QĐ-192: thiếu họ tên hoặc giấy tờ hợp lệ (MST / CCCD / giấy tờ khác) → "chưa đủ giấy tờ", không giảm trừ.
      infoPending: !nguoiPhuThuocDuGiayTo(d.hoTen, d.soGiayTo),
    },
  });
  await nc.kiemToan({ action: "tao", objectType: "salary_dependent", objectId: x.id, after: { nguoi: d.nguoiId, tuThang: d.tuThang, denThang: d.denThang, chuaDuGiayTo: !nguoiPhuThuocDuGiayTo(d.hoTen, d.soGiayTo) } });
  await nc.suKien({ eventType: SU_KIEN.SALARY_PROFILE_CHANGED, objectType: "salary_dependent", objectId: x.id, payload: { nguoi: d.nguoiId } });
  return { id: x.id, chuaDuGiayTo: !nguoiPhuThuocDuGiayTo(d.hoTen, d.soGiayTo) };
}

/** Kết thúc giảm trừ một người phụ thuộc từ sau tháng `denThang` (không xóa — kỳ đã tính giữ ảnh chụp số người). */
export async function ketThucNguoiPhuThuoc(nc: NguCanh, id: string, d: z.infer<typeof LuocDoKetThucNguoiPhuThuoc>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_dependent", objectId: id });
  const x = await nc.tx.salaryDependent.findFirst({ where: { id } });
  if (!x) throw new LoiKhongTimThay("Người phụ thuộc");
  chanTuSua(nc, x.userId);
  if (`${d.denThang}-01` < dateVeNgay(x.fromMonth)) throw new LoiNghiepVu("Tháng kết thúc phải từ tháng bắt đầu trở đi.", 422, "sai-thang");
  await nc.tx.salaryDependent.update({ where: { id }, data: { toMonth: ngayVeDate(`${d.denThang}-01`) } });
  await nc.kiemToan({ action: "sua", objectType: "salary_dependent", objectId: id, before: { denThang: x.toMonth ? dateVeNgay(x.toMonth).slice(0, 7) : null }, after: { denThang: d.denThang } });
  return { id };
}

// ---------------------------------------------------------------------------
// 0.22.0 (QĐ-179) — nhập CSV hồ sơ lương hàng loạt
// ---------------------------------------------------------------------------

/**
 * Nhập CSV hồ sơ lương: XEM TRƯỚC (`ghi` = false) kiểm từng dòng — email có thật, trong phạm vi, không phải chính mình
 * (QĐ-159), không trùng trong tệp, qua đúng lược đồ hồ sơ; GHI tạo PHIÊN BẢN MỚI cho từng dòng hợp lệ qua `taoHoSoLuong`
 * (kiểm toán, đổi tài khoản → báo nhân viên). Trường không có trong tệp giữ theo phiên bản đang hiệu lực (phụ cấp, thưởng
 * KPI, hoa hồng, cách trả…). Số người phụ thuộc lớn hơn số đang đăng ký → thêm người phụ thuộc "chưa ghi tên" từ tháng
 * hiệu lực (Nhân sự bổ sung họ tên sau); nhỏ hơn → chỉ cảnh báo (kết thúc người phụ thuộc làm tay, có tháng).
 */
export async function nhapCsvHoSoLuong(nc: NguCanh, noiDung: string, ghi: boolean, hieuLucTu = `${homNayVN().slice(0, 7)}-01`) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_profile" });
  const { dong, loi, thieuCot } = phanTichCsvHoSoLuong(noiDung);
  if (thieuCot.length) throw new LoiNghiepVu(`Tệp thiếu cột: ${thieuCot.join(", ")}.`, 422, "thieu-cot");
  const emails = [...new Set(dong.map((d) => d.email))];
  const nguoi = await nc.tx.user.findMany({ where: { isSystem: false, email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true, fullName: true, status: true } });
  const theoEmail = new Map(nguoi.map((u) => [u.email.toLowerCase(), u]));
  const hien = await hoSoApDung(nc.tx, nguoi.map((u) => u.id), hieuLucTu);
  const npt = await soNguoiPhuThuoc(nc.tx, nguoi.map((u) => u.id), hieuLucTu);
  const loc = await locNguoiLuong(nc);
  const loiDong = [...loi];
  const daGap = new Map<string, number>();
  const hopLe: { soDong: number; nguoiId: string; hoTen: string; hoSo: z.infer<typeof LuocDoHoSoLuong>; soNguoiPhuThuoc: number | null; nptHienTai: number; taoMoi: boolean; doiTaiKhoan: boolean }[] = [];
  for (const d of dong) {
    const u = theoEmail.get(d.email);
    if (!u || (loc.userId && !loc.userId.in.includes(u.id))) { loiDong.push({ soDong: d.soDong, lyDo: `Không có nhân viên với email ${d.email}.` }); continue; }
    if (u.status !== "hoat-dong") { loiDong.push({ soDong: d.soDong, lyDo: `${u.fullName} đã ngừng hoạt động.` }); continue; }
    if (u.id === nc.hoSo.userId) { loiDong.push({ soDong: d.soDong, lyDo: "Không ai tự nhập hồ sơ lương của chính mình (QĐ-159) — nhờ người khác có quyền." }); continue; }
    if (daGap.has(u.id)) { loiDong.push({ soDong: d.soDong, lyDo: `Trùng email với dòng ${daGap.get(u.id)}.` }); continue; }
    daGap.set(u.id, d.soDong);
    const h = hien.get(u.id) ?? null;
    const loaiHd = d.loaiHopDong ?? ((h?.contractType as LoaiHopDong | undefined) ?? "chinh-thuc");
    const vao = {
      nguoiId: u.id, hieuLucTu, loaiHopDong: loaiHd,
      tyLeThuViec: d.tyLeThuViec ?? (h?.probationPercent !== null && h?.probationPercent !== undefined ? Number(h.probationPercent) : null),
      cachTra: h?.payBasis ?? "thang", luongCoBan: d.luongCoBan, luongDongBH: d.luongDongBH ?? (h ? Number(h.insuranceSalary) : 0),
      thuongKpi: h ? Number(h.kpiBonus) : 0, huongHoaHong: h?.commissionEnabled ?? false,
      phuongPhapThue: h && (!d.loaiHopDong || d.loaiHopDong === h.contractType) ? h.taxMethod : THUE_GOI_Y[loaiHd],
      phuCap: Array.isArray(h?.allowances) ? (h!.allowances as { loaiId: string; soTien: number }[]) : [],
      // QA 0.22.0: tệp đổi số tài khoản → KHÔNG giữ tên chủ tài khoản của tài khoản cũ (file ngân hàng dùng họ tên nhân viên).
      soTaiKhoan: d.soTaiKhoan ?? h?.bankAccount ?? null, nganHang: d.nganHang ?? h?.bankName ?? null,
      chuTaiKhoan: d.soTaiKhoan && d.soTaiKhoan !== (h?.bankAccount ?? null) ? null : (h?.accountHolder ?? null),
      maSoThue: d.maSoThue ?? h?.taxCode ?? null, ghiChu: `Nhập CSV hồ sơ lương (dòng ${d.soDong})`,
      hinhThucTra: d.hinhThucTra ?? ((h?.paymentMethod as "chuyen-khoan" | "tien-mat" | undefined) ?? "chuyen-khoan"),
    };
    const kt = LuocDoHoSoLuong.safeParse(vao);
    if (!kt.success) { loiDong.push({ soDong: d.soDong, lyDo: kt.error.issues.map((i) => i.message).join("; ") }); continue; }
    hopLe.push({
      soDong: d.soDong, nguoiId: u.id, hoTen: u.fullName, hoSo: kt.data, soNguoiPhuThuoc: d.soNguoiPhuThuoc, nptHienTai: npt.get(u.id) ?? 0, taoMoi: !h,
      doiTaiKhoan: Boolean(h && ((h.bankAccount ?? null) !== kt.data.soTaiKhoan || h.paymentMethod !== kt.data.hinhThucTra)),
    });
  }
  loiDong.sort((a, b) => a.soDong - b.soDong);
  const xemTruoc = {
    soDong: dong.length + loi.length,
    hieuLucTu,
    hopLe: hopLe.map((h) => ({
      soDong: h.soDong, hoTen: h.hoTen, loaiHopDong: NHAN_LOAI_HOP_DONG[h.hoSo.loaiHopDong], luongCoBan: h.hoSo.luongCoBan, luongDongBH: h.hoSo.luongDongBH,
      taiKhoan: cheTaiKhoan(h.hoSo.soTaiKhoan), hinhThucTra: h.hoSo.hinhThucTra === "tien-mat" || !h.hoSo.soTaiKhoan ? "Trả tay" : "Chuyển khoản",
      soNguoiPhuThuoc: h.soNguoiPhuThuoc ?? h.nptHienTai, taoMoi: h.taoMoi, doiTaiKhoan: h.doiTaiKhoan,
    })),
    loi: loiDong.slice(0, 200),
    soLoi: loiDong.length,
  };
  if (!ghi) return { ...xemTruoc, daGhi: 0, canhBao: [] as string[] };
  let daGhi = 0;
  const canhBao: string[] = [];
  for (const h of hopLe) {
    await taoHoSoLuong(nc, h.hoSo);
    daGhi++;
    if (h.soNguoiPhuThuoc !== null && h.soNguoiPhuThuoc > h.nptHienTai) {
      for (let i = h.nptHienTai; i < h.soNguoiPhuThuoc; i++) {
        const npt0 = await themNguoiPhuThuoc(nc, { nguoiId: h.nguoiId, hoTen: `Người phụ thuộc ${i + 1} (nhập CSV — bổ sung họ tên)`, quanHe: "chưa ghi", soGiayTo: null, tuThang: hieuLucTu.slice(0, 7), denThang: null });
        // QĐ-182: chưa có họ tên + MST / số giấy tờ → KHÔNG giảm trừ cho tới khi bổ sung.
        await nc.tx.salaryDependent.update({ where: { id: npt0.id }, data: { infoPending: true } });
      }
      canhBao.push(`${h.hoTen}: thêm ${h.soNguoiPhuThuoc - h.nptHienTai} người phụ thuộc chưa ghi tên — CHƯA được giảm trừ cho tới khi bổ sung họ tên và mã số thuế / số giấy tờ ở Hồ sơ lương.`);
    } else if (h.soNguoiPhuThuoc !== null && h.soNguoiPhuThuoc < h.nptHienTai) {
      canhBao.push(`${h.hoTen}: tệp ghi ${h.soNguoiPhuThuoc} người phụ thuộc, đang đăng ký ${h.nptHienTai} — kết thúc người phụ thuộc ở Hồ sơ lương (có tháng kết thúc), không tự xóa.`);
    }
  }
  // Nhật ký tổng: không ghi số tiền (QĐ-148). Từng phiên bản đã có nhật ký riêng "tao-ho-so-luong".
  await nc.kiemToan({ action: "nhap-ho-so-luong", objectType: "salary_profile", after: { soDong: xemTruoc.soDong, daGhi, soLoi: loiDong.length, hieuLucTu } });
  return { ...xemTruoc, daGhi, canhBao };
}

/** Họ tên "giữ chỗ" do nhập CSV tạo (QĐ-182). */
export const laTenGiuCho = (ten: string) => /\(nhập CSV — bổ sung họ tên\)/.test(ten);

/**
 * QĐ-182: bổ sung / sửa họ tên, quan hệ, MST hoặc số giấy tờ của người phụ thuộc. Người "chưa ghi tên" chỉ được giảm trừ
 * khi đã có họ tên thật VÀ MST / số giấy tờ. Không tự sửa người phụ thuộc của chính mình (QĐ-159).
 */
export async function suaNguoiPhuThuoc(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaNguoiPhuThuoc>) {
  batBuocQuyenLuong(nc, "luong.update", { objectType: "salary_dependent", objectId: id });
  const x = await nc.tx.salaryDependent.findFirst({ where: { id } });
  if (!x) throw new LoiKhongTimThay("Người phụ thuộc");
  chanTuSua(nc, x.userId);
  // QĐ-192: đủ giấy tờ = họ tên thật + MST (10 / 10-3 số), CCCD (12 số) hoặc giấy tờ khác ≥ 6 ký tự chữ-số.
  const conThieu = !nguoiPhuThuocDuGiayTo(d.hoTen, d.soGiayTo);
  await nc.tx.salaryDependent.update({ where: { id }, data: { fullName: d.hoTen, relationship: d.quanHe, idNumber: d.soGiayTo, infoPending: conThieu } });
  await nc.kiemToan({
    action: "sua-nguoi-phu-thuoc", objectType: "salary_dependent", objectId: id,
    before: { nguoi: x.userId, chuaDuThongTin: x.infoPending, coSoGiayTo: Boolean(x.idNumber) }, after: { nguoi: x.userId, chuaDuThongTin: conThieu, coSoGiayTo: Boolean(d.soGiayTo) },
  });
  await nc.suKien({ eventType: SU_KIEN.SALARY_PROFILE_CHANGED, objectType: "salary_dependent", objectId: id, payload: { nguoi: x.userId } });
  return { id, chuaDuThongTin: conThieu };
}

/** Số người phụ thuộc "chưa ghi tên" đang trong thời gian giảm trừ của tháng (để cảnh báo). */
export async function soNguoiPhuThuocChuaDu(tx: ClientTenant, userIds: string[] | null, dauThang: string): Promise<Map<string, number>> {
  const d = ngayVeDate(dauThang);
  const ds = await tx.salaryDependent.findMany({
    where: { ...(userIds ? { userId: { in: userIds } } : {}), infoPending: true, fromMonth: { lte: d }, OR: [{ toMonth: null }, { toMonth: { gte: d } }] },
    select: { userId: true },
  });
  const kq = new Map<string, number>();
  for (const x of ds) kq.set(x.userId, (kq.get(x.userId) ?? 0) + 1);
  return kq;
}
