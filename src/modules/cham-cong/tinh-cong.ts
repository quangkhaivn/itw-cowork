import type { ClientTenant } from "@/lib/db";
import { dateVeNgay, ngayVeDate } from "@/modules/crm/chung";
import { lichCuaNhieuNguoi, ngayLeTrongKhoang, nghiDaDuyet, so, type CauHinhChamCong } from "./chung";
import { duocTinhCong, quyetDinhMoiNhat } from "./service";
import {
  apXetThieuGio,
  congDuKien,
  congNgay,
  ganNgayCong,
  mocVN,
  tinhCongNgay,
  tinhTangCa,
  type DongCongThang,
  type QuyetDinhThieuGio,
} from "./tinh-toan";

/**
 * Tính công nhiều người × nhiều ngày từ dữ liệu hiện có (lần chấm được tính, nghỉ phép đã duyệt, tăng ca đã
 * duyệt, quyết định xét ngày thiếu giờ). Dùng cho bảng công (NS-50, NS-53) và hàng chờ ngày thiếu giờ (QĐ-116).
 */

export interface DongTinh extends DongCongThang {
  vaoDau: Date | null;
  raCuoi: Date | null;
  nguon: string[];
  maLoaiNghi: string | null;
  /** Phút có mặt / phải có mặt (QĐ-116) — null khi không đủ giờ vào / ra. */
  phutCoMat: number | null;
  phutPhaiCoMat: number | null;
}

/** Tính công của nhiều người cho một danh sách ngày (một tháng) — dùng cho bảng công và điều chỉnh. */
export async function tinhCong(tx: ClientTenant, ch: CauHinhChamCong, userIds: string[], cacNgay: string[]): Promise<DongTinh[]> {
  if (userIds.length === 0 || cacNgay.length === 0) return [];
  const tu = cacNgay[0];
  const den = cacNgay[cacNgay.length - 1];
  const truoc = congNgay(tu, -1);
  const sau = congNgay(den, 1);
  const lich = await lichCuaNhieuNguoi(tx, userIds, sau);
  const le = await ngayLeTrongKhoang(tx, truoc, sau);
  const nghi = await nghiDaDuyet(tx, userIds, tu, den);
  const lan = await tx.attendancePunch.findMany({
    where: { userId: { in: userIds }, punchedAt: { gte: mocVN(truoc, 0), lt: mocVN(congNgay(sau, 1), 0) } },
    select: { id: true, userId: true, punchedAt: true, source: true, gpsResult: true, flags: true, needsReview: true },
  });
  const qd = await quyetDinhMoiNhat(tx, lan.filter((p) => p.needsReview).map((p) => p.id));
  const tangCa = await tx.overtimeRequest.findMany({
    where: { userId: { in: userIds }, status: "da-duyet", workDate: { gte: ngayVeDate(tu), lte: ngayVeDate(den) } },
    select: { userId: true, workDate: true, approvedHours: true },
  });
  const gioTc = new Map(tangCa.map((t) => [`${t.userId}|${dateVeNgay(t.workDate)}`, Number(t.approvedHours ?? 0)]));
  const macDinh = { choPhepMuonPhut: so(ch.choPhepMuonPhut, 5), choPhepSomPhut: so(ch.choPhepSomPhut, 5), coMatToiThieuPhanTram: so(ch.coMatToiThieuPhanTram, 50) };
  const xetNgay = await quyetDinhNgayMoiNhat(tx, userIds, tu, den);
  const dem = { batDauGio: so(ch.gioDemBatDau, 22), ketThucGio: so(ch.gioDemKetThuc, 6) };

  const kq: DongTinh[] = [];
  for (const userId of userIds) {
    const lichNguoi = lich.get(userId)!;
    const tatCaNgay = [truoc, ...cacNgay, sau];
    const duKien = new Map(
      tatCaNgay.map((d) => {
        const l = lichNguoi(d);
        return [d, congDuKien(d, l?.ca ?? null, l?.ngay ?? null, le.has(d))];
      }),
    );
    const cuaNguoi = lan.filter((p) => p.userId === userId);
    const tinh = cuaNguoi.filter((p) => duocTinhCong(p, qd.get(p.id)));
    const theoLuc = new Map(tinh.map((p) => [p.punchedAt.getTime(), p]));
    const nhom = ganNgayCong(tinh.map((p) => p.punchedAt), [...duKien.values()], so(ch.cuaSoTruocPhut, 240), so(ch.cuaSoSauPhut, 480));
    const choXemXet = new Set(cuaNguoi.filter((p) => p.needsReview && !qd.has(p.id)).map((p) => p.punchedAt.getTime()));
    for (const ngay of cacNgay) {
      const dk = duKien.get(ngay)!;
      const ds = nhom.get(ngay) ?? [];
      const ng = nghi.get(userId)?.get(ngay) ?? null;
      if (dk.giaTri === 0 && ds.length === 0 && !ng) continue;
      const cong = apXetThieuGio(tinhCongNgay(dk, ds, ng, macDinh), xetNgay.get(`${userId}|${ngay}`));
      const tc = tinhTangCa(dk, cong.vaoDau, cong.raCuoi, gioTc.get(`${userId}|${ngay}`) ?? null, dem);
      const co = [...cong.co];
      if (ds.some((t) => choXemXet.has(t.getTime()))) co.push("cho-xem-xet");
      kq.push({
        userId, ngay, laDieuChinh: false, loaiNgay: dk.loaiNgay, congDuKien: dk.giaTri, congThucTe: cong.giaTriCong,
        phutMuon: cong.phutMuon, phutSom: cong.phutSom, nghiNgay: cong.nghiNgay, nghiCoLuong: ng?.coLuong ?? false,
        phutTangCa: tc.phut, phutTangCaDem: tc.phutDem, co, vaoDau: cong.vaoDau, raCuoi: cong.raCuoi,
        nguon: [...new Set(ds.map((t) => theoLuc.get(t.getTime())?.source).filter((x): x is string => Boolean(x)))],
        maLoaiNghi: ng?.maLoai ?? null,
        phutCoMat: cong.phutCoMat ?? null,
        phutPhaiCoMat: cong.phutPhaiCoMat ?? null,
      });
    }
  }
  return kq;
}


/** Quyết định xét ngày thiếu giờ MỚI NHẤT theo (người|ngày) trong khoảng (QĐ-116). */
export async function quyetDinhNgayMoiNhat(tx: ClientTenant, userIds: string[], tu: string, den: string): Promise<Map<string, QuyetDinhThieuGio>> {
  if (userIds.length === 0) return new Map();
  const ds = await tx.attendanceDayReview.findMany({
    where: { userId: { in: userIds }, workDate: { gte: ngayVeDate(tu), lte: ngayVeDate(den) } },
    orderBy: { reviewedAt: "asc" },
    select: { userId: true, workDate: true, decision: true },
  });
  const kq = new Map<string, QuyetDinhThieuGio>();
  for (const r of ds) kq.set(`${r.userId}|${dateVeNgay(r.workDate)}`, r.decision as QuyetDinhThieuGio);
  return kq;
}
