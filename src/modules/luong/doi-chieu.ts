import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { dateVeNgay } from "@/modules/crm/chung";
import { baoChoNguoiCoQuyen } from "@/modules/thong-bao/service";
import { nhanKy, thayCongTuBangCong, tinhLuong, type DauVaoLuong, type KetQuaLuong } from "./tinh-toan";

/**
 * 0.22.0 (QĐ-191) — ĐỐI CHIẾU CÔNG SAU KHI KHÓA BẢNG CÔNG. Kỳ lương tháng X đã khóa / đã chi bằng công TẠM (nhập tay, bảng
 * công nháp, mặc định đủ công) mà sau đó bảng công tháng X mới khóa: tính lại dòng với công của bảng công đã khóa (giữ nguyên
 * mọi thứ khác trong ảnh chụp), chênh lệch thành khoản "Điều chỉnh kỳ trước" (trước thuế, NHÁP) ở kỳ lương kế tiếp còn nháp
 * của người đó — chưa có kỳ thì nằm ở danh sách chờ (`cho-ky`), áp khi kỳ đó được tính. Kế toán xem, giữ hoặc xóa từng khoản.
 * Chống trùng: một dòng đối chiếu cho mỗi (kỳ gốc, người) — khóa lại / gọi lại không tạo thêm.
 */

const NGUON_TAM = ["nhap-tay", "bang-cong-nhap", "mac-dinh"];
const NHAN_NGUON: Record<string, string> = { "nhap-tay": "công nhập tay", "bang-cong-nhap": "bảng công nháp", "mac-dinh": "mặc định đủ công" };

type DongDoiChieu = { id: string; sourceRunId: string; userId: string; oldSource: string; oldWorkDays: unknown; newWorkDays: unknown; grossDelta: bigint; taxableDelta: bigint };

/** Kỳ lương NHÁP kế tiếp (sau tháng gốc) chứa người này: kỳ riêng có người đó, hoặc kỳ chung (người không thuộc kỳ riêng cùng tháng). */
async function kyKeTiep(tx: ClientTenant, userId: string, nam: number, thang: number): Promise<{ id: string; year: number; month: number } | null> {
  const ds = await tx.payrollRun.findMany({
    where: { status: "nhap", OR: [{ year: { gt: nam } }, { year: nam, month: { gt: thang } }] },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: { id: true, year: true, month: true, members: true },
  });
  for (const k of ds) {
    if (k.members.length) {
      if (k.members.includes(userId)) return k;
      continue;
    }
    const oKyRieng = ds.some((r) => r.year === k.year && r.month === k.month && r.members.includes(userId));
    if (!oKyRieng) return k;
  }
  return null;
}

/** Tạo khoản điều chỉnh (phần chịu thuế + phần không chịu thuế) cho một dòng đối chiếu vào kỳ đích. */
async function taoKhoan(tx: ClientTenant, tenantId: string, d: DongDoiChieu, kyDich: { id: string }, kyGoc: { year: number; month: number }, actorId: string) {
  const khongChiuThue = d.grossDelta - d.taxableDelta;
  const lyDo = `Đối chiếu công tháng ${nhanKy(kyGoc.year, kyGoc.month)} sau khi khóa bảng công: ${NHAN_NGUON[d.oldSource] ?? d.oldSource} ${Number(d.oldWorkDays)} công → bảng công ${Number(d.newWorkDays)} công (tự động — kế toán xem lại, giữ hoặc xóa).`;
  for (const [soTien, chiuThue] of [[d.taxableDelta, true], [khongChiuThue, false]] as const) {
    if (soTien === 0n) continue;
    await tx.payrollItem.create({
      data: {
        tenantId, runId: kyDich.id, userId: d.userId, direction: soTien > 0n ? "cong" : "tru", category: "dieu-chinh", amount: soTien > 0n ? soTien : -soTien,
        taxable: chiuThue, reason: lyDo, adjustsRunId: d.sourceRunId, createdBy: actorId, taxStage: "truoc-thue", insurable: false, reconciliationId: d.id,
      },
    });
  }
  await tx.payrollRun.update({ where: { id: kyDich.id }, data: { dirty: true } });
  await tx.payrollAttendanceReconciliation.update({ where: { id: d.id }, data: { status: "da-tao-khoan", targetRunId: kyDich.id, appliedAt: new Date() } });
}

/**
 * Gọi ngay sau khi khóa bảng công tháng (cùng giao dịch). Không đòi quyền lương: chỉ tạo khoản nháp + báo kế toán; trả về
 * con số (không số tiền) cho người khóa bảng công.
 */
export async function doiChieuCongSauKhoa(nc: NguCanh, timesheetId: string): Promise<{ soDong: number; soChenh: number; soTaoKhoan: number; soChoKy: number }> {
  const tx = nc.tx;
  const bang = await tx.timesheet.findFirst({ where: { id: timesheetId, status: "da-khoa" }, select: { id: true, year: true, month: true } });
  const kq = { soDong: 0, soChenh: 0, soTaoKhoan: 0, soChoKy: 0 };
  if (!bang) return kq;
  const kyKhoa = await tx.payrollRun.findMany({ where: { year: bang.year, month: bang.month, status: { in: ["da-khoa", "da-chi"] } }, select: { id: true, year: true, month: true } });
  if (kyKhoa.length === 0) return kq;
  const daCo = new Set((await tx.payrollAttendanceReconciliation.findMany({ where: { sourceRunId: { in: kyKhoa.map((k) => k.id) } }, select: { sourceRunId: true, userId: true } })).map((x) => `${x.sourceRunId}|${x.userId}`));
  const dongCong = await tx.timesheetRow.findMany({ where: { timesheetId: bang.id } });
  for (const ky of kyKhoa) {
    const dongLuong = await tx.payrollLine.findMany({ where: { runId: ky.id }, select: { userId: true, inputs: true, result: true } });
    for (const l of dongLuong) {
      const dv = l.inputs as unknown as DauVaoLuong & { nguon?: { nguonCong?: string } };
      const nguon = dv.nguon?.nguonCong ?? "bang-cong";
      if (!NGUON_TAM.includes(nguon) || daCo.has(`${ky.id}|${l.userId}`)) continue;
      const cua = dongCong.filter((r) => r.userId === l.userId);
      if (cua.length === 0) continue; // người không có trong bảng công khóa → không đủ căn cứ đối chiếu
      const dvMoi = thayCongTuBangCong(dv, cua.map((r) => ({
        ngay: dateVeNgay(r.workDate), dieuChinh: r.isAdjustment, cong: Number(r.workValue), nghi: Number(r.leaveDays), nghiCoLuong: r.leavePaid,
        phutTangCa: r.otMinutes, phutTangCaDem: r.otNightMinutes, loaiNgay: r.dayType, phutMuon: r.lateMinutes, phutSom: r.earlyMinutes,
      })));
      const cu = l.result as unknown as KetQuaLuong;
      const moi = tinhLuong(dvMoi);
      const grossDelta = BigInt(moi.tongThuNhap - cu.tongThuNhap);
      const taxableDelta = BigInt(moi.thuNhapChiuThue - cu.thuNhapChiuThue);
      const d = await tx.payrollAttendanceReconciliation.create({
        data: {
          tenantId: nc.tenantId, sourceRunId: ky.id, userId: l.userId, timesheetId: bang.id, oldSource: nguon,
          oldWorkDays: cu.congTinhLuong, newWorkDays: moi.congTinhLuong, grossDelta, taxableDelta, status: grossDelta === 0n && taxableDelta === 0n ? "khong-chenh" : "cho-ky",
        },
      });
      kq.soDong++;
      if (d.status === "khong-chenh") continue;
      kq.soChenh++;
      const dich = await kyKeTiep(tx, l.userId, ky.year, ky.month);
      if (dich) {
        await taoKhoan(tx, nc.tenantId, d, dich, ky, nc.hoSo.userId);
        kq.soTaoKhoan++;
      } else kq.soChoKy++;
    }
  }
  if (kq.soDong) {
    await nc.kiemToan({ action: "doi-chieu-cong-sau-khoa", objectType: "timesheet", objectId: bang.id, after: { thang: nhanKy(bang.year, bang.month), ...kq } });
  }
  if (kq.soChenh) {
    await baoChoNguoiCoQuyen(tx, nc.tenantId, "luong.create", {
      loai: "luong-doi-chieu-cong", mucDo: "canh-bao",
      tieuDe: `Bảng công ${nhanKy(bang.year, bang.month)} vừa khóa: ${kq.soChenh} người lệch công so với lương đã khóa`,
      noiDung: `${kq.soTaoKhoan} khoản “Điều chỉnh kỳ trước” đã tạo ở kỳ lương nháp kế tiếp${kq.soChoKy ? `, ${kq.soChoKy} người chờ tới khi có kỳ lương kế tiếp` : ""}. Xem lại, giữ hoặc xóa từng khoản trước khi tính lương.`,
      duongDan: "/luong", doiTuong: "timesheet", doiTuongId: bang.id, khoaChongTrung: `doi-chieu-cong:${bang.id}`,
    });
  }
  return kq;
}

/** Áp các dòng đối chiếu đang CHỜ KỲ cho những người thuộc kỳ nháp này (gọi khi tính lương). */
export async function apDoiChieuChoKy(nc: NguCanh, ky: { id: string; year: number; month: number; status: string }, userIds: string[]): Promise<number> {
  if (ky.status !== "nhap" || userIds.length === 0) return 0;
  const cho = await nc.tx.payrollAttendanceReconciliation.findMany({ where: { status: "cho-ky", userId: { in: userIds } } });
  if (cho.length === 0) return 0;
  const goc = new Map((await nc.tx.payrollRun.findMany({ where: { id: { in: cho.map((c) => c.sourceRunId) } }, select: { id: true, year: true, month: true } })).map((k) => [k.id, k]));
  let n = 0;
  for (const c of cho) {
    const g = goc.get(c.sourceRunId);
    if (!g || g.year * 12 + g.month >= ky.year * 12 + ky.month) continue;
    await taoKhoan(nc.tx, nc.tenantId, c, ky, g, nc.hoSo.userId);
    n++;
  }
  if (n) await nc.kiemToan({ action: "doi-chieu-cong-sau-khoa", objectType: "payroll_run", objectId: ky.id, after: { apTuDanhSachCho: n } });
  return n;
}
