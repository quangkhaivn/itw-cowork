import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { dateVeNgay, ngayVeDate } from "@/modules/crm/chung";
import { taoThongBao } from "@/modules/thong-bao/service";
import { banDoTen, congDuKienCuaNguoi, coTheDuyet, docCauHinhChamCong, kiemDuocDuyet, locNguoiXem, type CauHinhChamCong } from "@/modules/cham-cong/chung";
import { NHAN_TRANG_THAI_DON } from "@/modules/cham-cong/don-tu";
import { cacNgayTrongThang, ngayVNCua } from "@/modules/cham-cong/tinh-toan";
import type { LuocDoDonNghi, LuocDoQuyetDinhNghi } from "./luoc-do";
import { donChongNhau, phepChuyenSang, phepDaTichLuy, quyPhepNam, soDuPhep, soNgayCuaDon, type CauHinhPhep, type SoDuPhep } from "./tinh-toan";

/**
 * Nghỉ phép (0.19.0): đơn nghỉ cả ngày / nửa ngày, duyệt bởi quản lý trực tiếp hoặc Nhân sự, hủy,
 * lịch nghỉ của nhóm, quỹ phép năm. Luật: BUSINESS_RULES.md mục 30 (NS-30 → NS-35).
 *
 * Quỹ phép KHÔNG lưu thành cột: tính lúc đọc từ Cấu hình + ngày vào làm + điều chỉnh + đơn đã duyệt
 * (như công nợ — TC-06, QĐ-108). Chống tiêu trùng quỹ khi hai đơn được duyệt cùng lúc bằng khóa dòng
 * `leave_balances` (người, năm) — thứ tự khóa: đơn → quỹ (QĐ-109).
 */

export function cauHinhPhep(ch: CauHinhChamCong): CauHinhPhep {
  return {
    soNgayNam: ch.phepSoNgayNam ?? 12,
    thamNienSoNam: ch.phepThamNienSoNam,
    thamNienCongNgay: ch.phepThamNienCongNgay ?? 1,
    congDonTheoThang: (ch.phepCongDonTheoThang ?? 1) === 1,
    chuyenNamSauToiDa: ch.phepChuyenNamSauToiDa ?? 0,
  };
}

/** Số ngày đã dùng / đang chờ của các loại nghỉ trừ quỹ phép năm, trong năm `nam`. */
async function ngayDaDungPhep(tx: ClientTenant, userId: string, nam: number, boQuaDonId?: string) {
  const ds = await tx.leaveRequest.groupBy({
    by: ["status"],
    where: {
      userId,
      status: { in: ["da-duyet", "cho-duyet"] },
      leaveType: { usesBalance: true },
      startDate: { gte: ngayVeDate(`${nam}-01-01`), lte: ngayVeDate(`${nam}-12-31`) },
      ...(boQuaDonId && { NOT: { id: boQuaDonId } }),
    },
    _sum: { days: true },
  });
  const lay = (s: string) => Number(ds.find((x) => x.status === s)?._sum.days ?? 0);
  return { daDung: lay("da-duyet"), dangCho: lay("cho-duyet") };
}

async function dieuChinhNam(tx: ClientTenant, userId: string, nam: number): Promise<number> {
  const r = await tx.leaveAdjustment.aggregate({ where: { userId, year: nam }, _sum: { days: true } });
  return Number(r._sum.days ?? 0);
}

/**
 * Quỹ phép của một người trong năm, tính tới ngày `denNgay` (NS-31, NS-32). Phép chuyển sang = phần
 * còn lại CẢ NĂM của năm trước (gồm cả phần năm trước được chuyển từ năm trước nữa), không quá trần.
 */
export async function tinhSoDuPhep(tx: ClientTenant, userId: string, nam: number, denNgay: string, ch: CauHinhPhep, boQuaDonId?: string): Promise<SoDuPhep> {
  const hs = await tx.staffProfile.findFirst({ where: { userId }, select: { hiredAt: true } });
  const ngayVao = hs?.hiredAt ? dateVeNgay(hs.hiredAt) : null;
  let chuyenSang = 0;
  if (ch.chuyenNamSauToiDa > 0) {
    // Tối đa lùi 3 năm — trước đó coi như không còn gì chuyển (trần chuyển thường là vài ngày).
    let conLai = 0;
    for (let n = nam - 3; n < nam; n++) {
      if (ngayVao && ngayVao > `${n}-12-31`) {
        conLai = 0;
        continue;
      }
      const dung = await ngayDaDungPhep(tx, userId, n);
      const dc = await dieuChinhNam(tx, userId, n);
      conLai = quyPhepNam(ngayVao, n, ch) + phepChuyenSang(conLai, ch) + dc - dung.daDung;
    }
    chuyenSang = phepChuyenSang(conLai, ch);
  }
  const dung = await ngayDaDungPhep(tx, userId, nam, boQuaDonId);
  return soDuPhep({
    quyNam: quyPhepNam(ngayVao, nam, ch),
    daTichLuy: phepDaTichLuy(ngayVao, nam, denNgay, ch),
    chuyenSang,
    dieuChinh: await dieuChinhNam(tx, userId, nam),
    daDung: dung.daDung,
    dangCho: dung.dangCho,
  });
}

export async function soDuPhepCua(nc: NguCanh, userId: string | null, nam?: number) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const id = userId ?? nc.hoSo.userId;
  if (id !== nc.hoSo.userId) {
    const loc = await locNguoiXem(nc);
    if (loc.userId && !loc.userId.in.includes(id)) throw new LoiKhongTimThay("Nhân viên");
  }
  const homNay = ngayVNCua(new Date());
  const n = nam ?? Number(homNay.slice(0, 4));
  const denNgay = n === Number(homNay.slice(0, 4)) ? homNay : `${n}-12-31`;
  const ch = cauHinhPhep(await docCauHinhChamCong(nc.tx));
  return { nam: n, ...(await tinhSoDuPhep(nc.tx, id, n, denNgay, ch)), congDonTheoThang: ch.congDonTheoThang };
}

/** Số ngày công của khoảng nghỉ theo lịch làm của người xin (bỏ ngày nghỉ tuần, ngày lễ). */
async function soNgayDon(tx: ClientTenant, userId: string, tu: string, den: string, phan: "ca-ngay" | "sang" | "chieu") {
  const ds = await congDuKienCuaNguoi(tx, userId, tu, den);
  return soNgayCuaDon(ds.map((x) => ({ ngay: x.ngay, giaTriDuKien: x.giaTri, phanDuKien: x.phan })), phan);
}

async function kiemChongNhau(tx: ClientTenant, userId: string, d: { tuNgay: string; denNgay: string; phan: "ca-ngay" | "sang" | "chieu" }, boQua?: string) {
  const ds = await tx.leaveRequest.findMany({
    where: {
      userId,
      status: { in: ["cho-duyet", "da-duyet"] },
      startDate: { lte: ngayVeDate(d.denNgay) },
      endDate: { gte: ngayVeDate(d.tuNgay) },
      ...(boQua && { NOT: { id: boQua } }),
    },
    select: { startDate: true, endDate: true, portion: true },
  });
  const trung = ds.find((x) =>
    donChongNhau({ tu: d.tuNgay, den: d.denNgay, phan: d.phan }, { tu: dateVeNgay(x.startDate), den: dateVeNgay(x.endDate), phan: x.portion as "ca-ngay" }),
  );
  if (trung) throw new LoiNghiepVu("Khoảng nghỉ trùng với một đơn khác đang chờ hoặc đã duyệt.", 409, "trung-don");
}

export async function taoDonNghi(nc: NguCanh, d: z.infer<typeof LuocDoDonNghi>) {
  batBuocQuyen(nc.hoSo, "cham_cong.create", { objectType: "leave_request" });
  const loai = await nc.tx.leaveType.findFirst({ where: { id: d.loaiNghiId, status: "hoat-dong" } });
  if (!loai) throw new LoiDinhDang("loaiNghiId", "Loại nghỉ không tồn tại hoặc đã ngừng.");
  const soNgay = await soNgayDon(nc.tx, nc.hoSo.userId, d.tuNgay, d.denNgay, d.phan);
  if (soNgay <= 0) throw new LoiNghiepVu("Khoảng đã chọn không có ngày làm việc nào theo lịch của bạn (ngày nghỉ tuần, ngày lễ hoặc chưa được gán lịch).", 422, "khong-co-ngay-lam");
  await kiemChongNhau(nc.tx, nc.hoSo.userId, d);
  if (loai.usesBalance) {
    const ch = cauHinhPhep(await docCauHinhChamCong(nc.tx));
    // Cùng mốc tích lũy với lúc duyệt (quyetDinhNghi): nghỉ ở tương lai → tới ngày nghỉ; nghỉ đã qua
    // (xin bù) → tới hôm nay. Trước đây lấy luôn ngày nghỉ: xin bù phép tháng 1 vào tháng 11 bị chặn vì chỉ
    // tính 1/12 quỹ, trong khi duyệt lại cho qua (QA 0.19.0).
    const homNay = ngayVNCua(new Date());
    const sd = await tinhSoDuPhep(nc.tx, nc.hoSo.userId, Number(d.tuNgay.slice(0, 4)), d.tuNgay > homNay ? d.tuNgay : homNay, ch);
    const conDuoc = Math.round((sd.duocDung - sd.dangCho) * 10) / 10;
    if (soNgay > conDuoc) {
      throw new LoiNghiepVu(`Quỹ phép không đủ: xin ${soNgay} ngày, còn được dùng ${Math.max(0, conDuoc)} ngày (đã trừ đơn đang chờ).`, 422, "vuot-quy-phep", { soDu: sd });
    }
  }
  const r = await nc.tx.leaveRequest.create({
    data: {
      tenantId: nc.tenantId, userId: nc.hoSo.userId, leaveTypeId: loai.id, startDate: ngayVeDate(d.tuNgay), endDate: ngayVeDate(d.denNgay),
      portion: d.phan, days: soNgay, reason: d.lyDo,
    },
  });
  await nc.kiemToan({ action: "tao", objectType: "leave_request", objectId: r.id, after: { ...d, soNgay, loai: loai.code } });
  await nc.suKien({ eventType: SU_KIEN.LEAVE_REQUESTED, objectType: "leave_request", objectId: r.id, payload: { loai: loai.code, soNgay } });
  const hs = await nc.tx.staffProfile.findFirst({ where: { userId: nc.hoSo.userId }, select: { managerId: true } });
  if (hs?.managerId && hs.managerId !== nc.hoSo.userId) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: hs.managerId, loai: "nghi-phep-cho-duyet",
      tieuDe: `${nc.hoSo.hoTen} xin nghỉ ${soNgay} ngày (${loai.name})`,
      noiDung: `${d.tuNgay.split("-").reverse().join("/")} → ${d.denNgay.split("-").reverse().join("/")}: ${d.lyDo}`,
      duongDan: "/cham-cong/don-tu", doiTuong: "leave_request", doiTuongId: r.id, khoaChongTrung: `nghi-phep-cho-duyet:${r.id}`,
    });
  }
  return { id: r.id, soNgay };
}

/** Khóa quỹ phép (người, năm): tạo dòng nếu chưa có (không đua P2002), rồi `FOR UPDATE`. */
async function khoaQuyPhep(nc: NguCanh, userId: string, nam: number) {
  await nc.tx.$executeRaw(Prisma.sql`
    INSERT INTO leave_balances (id, tenant_id, user_id, year)
    VALUES (gen_random_uuid(), ${nc.tenantId}::uuid, ${userId}::uuid, ${nam})
    ON CONFLICT (tenant_id, user_id, year) DO NOTHING
  `);
  const dong = await nc.tx.leaveBalance.findFirst({ where: { userId, year: nam }, select: { id: true } });
  if (!dong) throw new Error("Không tạo được dòng khóa quỹ phép.");
  await khoaChungTu(nc.tx, "leave_balances", dong.id);
}

/**
 * Duyệt / từ chối / hủy đơn nghỉ (NS-34, NS-35). Khóa đơn → (đơn trừ quỹ) khóa quỹ phép → đọc lại số
 * dư → kiểm. Hai đơn của cùng một người được duyệt cùng lúc: lần sau chờ lần trước COMMIT rồi mới đọc
 * quỹ, nên không thể cùng tiêu một ngày phép.
 * Hủy: người xin hủy đơn còn chờ; người duyệt được (quản lý trực tiếp / Nhân sự) hủy cả đơn đã duyệt —
 * bắt buộc lý do, ngày phép trả lại quỹ (quỹ tính lúc đọc).
 */
export async function quyetDinhNghi(nc: NguCanh, id: string, d: z.infer<typeof LuocDoQuyetDinhNghi>) {
  await khoaChungTu(nc.tx, "leave_requests", id);
  const r = await nc.tx.leaveRequest.findFirst({ where: { id }, include: { leaveType: true } });
  if (!r) throw new LoiKhongTimThay("Đơn nghỉ");
  const laNguoiXin = r.userId === nc.hoSo.userId;
  if (d.hanhDong === "huy") {
    if (r.status === "cho-duyet" && laNguoiXin) {
      // người xin tự hủy đơn còn chờ
    } else if (r.status === "da-duyet") {
      if (laNguoiXin && nc.hoSo.phamVi.get("cham_cong.approve") !== "all") {
        throw new LoiNghiepVu("Đơn đã duyệt: nhờ quản lý trực tiếp hoặc Nhân sự hủy giúp.", 403, "nho-quan-ly-huy");
      }
      if (!laNguoiXin) await kiemDuocDuyet(nc, r.userId, { objectType: "leave_request", objectId: id });
    } else if (!laNguoiXin && r.status === "cho-duyet") {
      throw new LoiNghiepVu("Đơn còn chờ duyệt — chọn Từ chối thay vì Hủy.", 422, "dung-tu-choi");
    } else {
      throw new LoiNghiepVu(`Đơn đã ở trạng thái "${NHAN_TRANG_THAI_DON[r.status] ?? r.status}".`, 409, "da-xu-ly");
    }
    if (!d.ghiChu) throw new LoiNghiepVu("Hủy đơn nghỉ phải ghi lý do.", 422, "thieu-ly-do");
  } else {
    await kiemDuocDuyet(nc, r.userId, { objectType: "leave_request", objectId: id });
    if (r.status !== "cho-duyet") throw new LoiNghiepVu(`Đơn đã ở trạng thái "${NHAN_TRANG_THAI_DON[r.status] ?? r.status}".`, 409, "da-xu-ly");
    if (d.hanhDong === "tu-choi" && !d.ghiChu) throw new LoiNghiepVu("Từ chối thì ghi lý do để người xin biết.", 422, "thieu-ly-do");
  }

  const tu = dateVeNgay(r.startDate);
  const den = dateVeNgay(r.endDate);
  let soNgay = Number(r.days);
  if (d.hanhDong === "duyet") {
    // Lịch / ngày lễ có thể đã đổi từ lúc gửi — tính lại số ngày lúc duyệt.
    soNgay = await soNgayDon(nc.tx, r.userId, tu, den, r.portion as "ca-ngay");
    if (soNgay <= 0) throw new LoiNghiepVu("Khoảng nghỉ không còn ngày làm việc nào (lịch hoặc ngày lễ đã đổi). Từ chối đơn này.", 422, "khong-co-ngay-lam");
    await kiemChongNhau(nc.tx, r.userId, { tuNgay: tu, denNgay: den, phan: r.portion as "ca-ngay" }, id);
    if (r.leaveType.usesBalance) {
      const nam = Number(tu.slice(0, 4));
      await khoaQuyPhep(nc, r.userId, nam);
      const ch = cauHinhPhep(await docCauHinhChamCong(nc.tx));
      const homNay = ngayVNCua(new Date());
      // Nghỉ ở tháng sau: được dùng phần tích lũy tới tháng nghỉ (cộng dồn theo tháng).
      const sd = await tinhSoDuPhep(nc.tx, r.userId, nam, tu > homNay ? tu : homNay, ch, id);
      if (soNgay > sd.duocDung) {
        throw new LoiNghiepVu(`Quỹ phép không đủ để duyệt: đơn ${soNgay} ngày, còn được dùng ${Math.max(0, sd.duocDung)} ngày.`, 422, "vuot-quy-phep", { soDu: sd });
      }
    }
  } else if (d.hanhDong === "huy" && r.leaveType.usesBalance) {
    await khoaQuyPhep(nc, r.userId, Number(tu.slice(0, 4)));
  }

  const trangThai = d.hanhDong === "duyet" ? "da-duyet" : d.hanhDong === "tu-choi" ? "tu-choi" : "da-huy";
  await nc.tx.leaveRequest.update({
    where: { id },
    data: {
      status: trangThai,
      days: soNgay,
      ...(d.hanhDong !== "huy" && { decidedBy: nc.hoSo.userId, decidedAt: new Date(), decisionNote: d.ghiChu ?? null }),
      ...(d.hanhDong === "huy" && { cancelledBy: nc.hoSo.userId, cancelledAt: new Date(), cancelReason: d.ghiChu }),
    },
  });
  await nc.kiemToan({
    action: d.hanhDong === "duyet" ? "duyet" : d.hanhDong === "tu-choi" ? "tu-choi-duyet" : "huy",
    objectType: "leave_request", objectId: id, before: { trangThai: r.status, soNgay: Number(r.days) }, after: { trangThai, soNgay, ghiChu: d.ghiChu },
  });
  await nc.suKien({
    eventType: d.hanhDong === "huy" ? SU_KIEN.LEAVE_CANCELLED : SU_KIEN.LEAVE_DECIDED,
    objectType: "leave_request", objectId: id, payload: { trangThai, soNgay, loai: r.leaveType.code },
  });
  if (!laNguoiXin) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: r.userId,
      loai: "nghi-phep-da-xu-ly",
      mucDo: d.hanhDong === "duyet" ? "thong-tin" : "canh-bao",
      tieuDe: d.hanhDong === "duyet" ? `Đơn nghỉ ${soNgay} ngày của bạn đã được duyệt` : d.hanhDong === "tu-choi" ? "Đơn nghỉ của bạn bị từ chối" : "Đơn nghỉ đã duyệt của bạn đã bị hủy",
      noiDung: d.ghiChu ?? null,
      duongDan: "/cham-cong/don-tu",
      doiTuong: "leave_request",
      doiTuongId: id,
      khoaChongTrung: `nghi-phep-da-xu-ly:${id}:${trangThai}`,
    });
  }
  return { id, trangThai, soNgay };
}

export async function danhSachDonNghi(nc: NguCanh, loai: "cua-toi" | "cho-toi-duyet" | "tat-ca", trangThai = "") {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const xem = await locNguoiXem(nc);
  const locNguoi = loai === "cua-toi" ? { userId: nc.hoSo.userId } : loai === "tat-ca" ? xem : { ...xem, NOT: { userId: nc.hoSo.userId }, status: "cho-duyet" };
  const ds = await nc.tx.leaveRequest.findMany({
    where: { AND: [locNguoi, trangThai ? { status: trangThai } : {}] },
    orderBy: { startDate: "desc" },
    take: 200,
    select: {
      id: true, userId: true, startDate: true, endDate: true, portion: true, days: true, reason: true, status: true, decidedBy: true, decidedAt: true,
      decisionNote: true, cancelReason: true, createdAt: true, user: { select: { fullName: true } }, leaveType: { select: { name: true, paid: true, usesBalance: true } },
    },
  });
  const ten = await banDoTen(nc.tx, ds.map((x) => x.decidedBy));
  const kq = [];
  for (const r of ds) {
    const duocDuyet = r.status === "cho-duyet" && (await coTheDuyet(nc, r.userId));
    kq.push({
      id: r.id, nguoi: { id: r.userId, hoTen: r.user.fullName }, loai: r.leaveType.name, coLuong: r.leaveType.paid, truPhep: r.leaveType.usesBalance,
      tuNgay: dateVeNgay(r.startDate), denNgay: dateVeNgay(r.endDate), phan: r.portion, soNgay: Number(r.days), lyDo: r.reason, trangThai: r.status,
      nguoiDuyet: r.decidedBy ? ten.get(r.decidedBy) ?? "—" : null, duyetLuc: r.decidedAt, ghiChu: r.decisionNote ?? r.cancelReason, taoLuc: r.createdAt,
      duocDuyet,
      duocHuy: (r.status === "cho-duyet" && r.userId === nc.hoSo.userId) || (r.status === "da-duyet" && r.userId !== nc.hoSo.userId && (await coTheDuyet(nc, r.userId))),
    });
  }
  return kq;
}

/** Lịch nghỉ của nhóm trong một tháng (NS-35): đơn đã duyệt + đang chờ, theo phạm vi xem. */
export async function lichNghiThang(nc: NguCanh, nam: number, thang: number) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const ngays = cacNgayTrongThang(nam, thang);
  const ds = await nc.tx.leaveRequest.findMany({
    where: {
      AND: [
        await locNguoiXem(nc),
        { status: { in: ["da-duyet", "cho-duyet"] }, startDate: { lte: ngayVeDate(ngays[ngays.length - 1]) }, endDate: { gte: ngayVeDate(ngays[0]) } },
      ],
    },
    orderBy: [{ startDate: "asc" }],
    select: { id: true, userId: true, startDate: true, endDate: true, portion: true, status: true, user: { select: { fullName: true } }, leaveType: { select: { name: true } } },
  });
  return {
    nam, thang, ngays,
    dong: ds.map((r) => ({
      id: r.id, nguoi: { id: r.userId, hoTen: r.user.fullName }, loai: r.leaveType.name, tuNgay: dateVeNgay(r.startDate), denNgay: dateVeNgay(r.endDate),
      phan: r.portion, trangThai: r.status,
    })),
  };
}
