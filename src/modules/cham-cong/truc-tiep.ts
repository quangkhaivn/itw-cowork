import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { danhSachMay } from "./may-cham-cong";
import { coTheDuyet, docCauHinhChamCong, lichCuaNhieuNguoi, locNguoiXem, ngayLeTrongKhoang, nghiDaDuyet, so } from "./chung";
import { duocTinhCong, lanChamCanXemXet, quyetDinhMoiNhat } from "./service";
import {
  congDuKien,
  congNgay,
  duongDanBanDo,
  ganNgayCong,
  mocVN,
  ngayVNCua,
  NHAN_TRANG_THAI_HOM_NAY,
  phutDiMuon,
  trangThaiHomNay,
  type TrangThaiHomNay,
} from "./tinh-toan";

/**
 * Bảng chấm công trực tiếp (NS-60): trạng thái hôm nay của từng người trong PHẠM VI người xem
 * (`cham_cong.view`: nhân viên thấy mình, trưởng phòng thấy nhóm / phòng, Nhân sự + Giám đốc thấy cả
 * công ty; quản lý trực tiếp luôn thấy cấp dưới trực tiếp). Giao diện hỏi lại mỗi 10 giây.
 */
export async function bangTrucTiep(nc: NguCanh, loc: { phongBanId: string | null; diaDiemId: string | null }, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const ch = await docCauHinhChamCong(nc.tx);
  const ngay = ngayVNCua(bayGio);
  const homQua = congNgay(ngay, -1);
  const ngayMai = congNgay(ngay, 1);

  const phamVi = await locNguoiXem(nc);
  const nguoi = await nc.tx.user.findMany({
    where: {
      status: "hoat-dong",
      isSystem: false,
      ...(phamVi.userId && { id: phamVi.userId }),
      ...((loc.phongBanId || loc.diaDiemId) && {
        staffProfile: { ...(loc.phongBanId && { departmentId: loc.phongBanId }), ...(loc.diaDiemId && { defaultLocationId: loc.diaDiemId }) },
      }),
    },
    orderBy: { fullName: "asc" },
    take: 1000,
    select: {
      id: true,
      fullName: true,
      staffProfile: { select: { staffType: true, managerId: true, department: { select: { id: true, name: true } }, defaultLocation: { select: { id: true, name: true } } } },
    },
  });
  const ids = nguoi.map((n) => n.id);
  const lich = await lichCuaNhieuNguoi(nc.tx, ids, ngayMai);
  const le = await ngayLeTrongKhoang(nc.tx, homQua, ngayMai);
  const nghi = await nghiDaDuyet(nc.tx, ids, ngay, ngay);
  const lanCham = await nc.tx.attendancePunch.findMany({
    where: { userId: { in: ids }, punchedAt: { gte: mocVN(homQua, 0), lte: bayGio } },
    orderBy: { punchedAt: "asc" },
    select: {
      id: true, userId: true, punchedAt: true, source: true, direction: true, gpsResult: true, flags: true, needsReview: true, latitude: true, longitude: true,
      ticketId: true, device: { select: { name: true } }, location: { select: { name: true } },
    },
  });
  const qd = await quyetDinhMoiNhat(nc.tx, lanCham.filter((p) => p.needsReview).map((p) => p.id));
  const theoNguoi = new Map<string, typeof lanCham>();
  for (const p of lanCham) {
    if (!p.userId) continue;
    const ds = theoNguoi.get(p.userId) ?? [];
    ds.push(p);
    theoNguoi.set(p.userId, ds);
  }

  const dem: Record<TrangThaiHomNay, number> = {
    "nghi-phep": 0, "hien-truong": 0, "da-ra-ca": 0, "di-muon": 0, "da-vao-ca": 0, "chua-den": 0, "chua-toi-gio": 0, "khong-co-ca": 0,
  };
  const choPhepMuon = so(ch.choPhepMuonPhut, 5);
  const dong = nguoi.map((n) => {
    const lichNguoi = lich.get(n.id)!;
    const cacNgay = [homQua, ngay, ngayMai].map((d) => {
      const l = lichNguoi(d);
      return congDuKien(d, l?.ca ?? null, l?.ngay ?? null, le.has(d));
    });
    const duKien = cacNgay[1];
    const tatCa = (theoNguoi.get(n.id) ?? []).filter((p) => duocTinhCong(p, qd.get(p.id)));
    const nhom = ganNgayCong(tatCa.map((p) => p.punchedAt), cacNgay, so(ch.cuaSoTruocPhut, 240), so(ch.cuaSoSauPhut, 480)).get(ngay) ?? [];
    const homNay = tatCa.filter((p) => nhom.some((t) => t.getTime() === p.punchedAt.getTime()));
    const ng = nghi.get(n.id)?.get(ngay) ?? null;
    const trangThai = trangThaiHomNay(
      duKien,
      homNay.map((p) => ({ luc: p.punchedAt, huong: (p.direction as "vao" | "ra" | null) ?? null, ketQuaGps: p.gpsResult })),
      Boolean(ng && duKien.giaTri > 0 && ng.giaTri >= duKien.giaTri),
      bayGio,
      choPhepMuon,
    );
    dem[trangThai] += 1;
    const dau = homNay[0];
    const cuoi = homNay[homNay.length - 1];
    const choXemXet = (theoNguoi.get(n.id) ?? []).filter((p) => p.needsReview && !qd.has(p.id) && p.punchedAt >= mocVN(homQua, 0)).length;
    return {
      id: n.id,
      hoTen: n.fullName,
      loaiNhanSu: n.staffProfile?.staffType ?? "chinh-thuc",
      phongBan: n.staffProfile?.department ?? null,
      diaDiem: n.staffProfile?.defaultLocation ? { id: n.staffProfile.defaultLocation.id, ten: n.staffProfile.defaultLocation.name } : null,
      trangThai,
      nhanTrangThai: NHAN_TRANG_THAI_HOM_NAY[trangThai],
      gioVaoCa: duKien.khoang?.batDau ?? null,
      gioRaCa: duKien.khoang?.ketThuc ?? null,
      vaoLuc: dau?.punchedAt ?? null,
      phutMuon: dau ? phutDiMuon(dau.punchedAt, duKien.khoang?.batDau ?? null, duKien.choPhepMuonPhut ?? choPhepMuon) : 0,
      lanCuoi: cuoi
        ? {
            luc: cuoi.punchedAt,
            nguon: cuoi.source,
            huong: cuoi.direction,
            ketQuaGps: cuoi.gpsResult,
            noi: cuoi.device?.name ?? cuoi.location?.name ?? null,
            banDo: cuoi.latitude !== null && cuoi.longitude !== null ? duongDanBanDo(cuoi.latitude, cuoi.longitude) : null,
            phieuId: cuoi.ticketId,
          }
        : null,
      soLanCham: homNay.length,
      choXemXet,
      /** 0.22.0 (QĐ-171): người chưa được gán lịch → đang theo lịch mặc định của doanh nghiệp. */
      theoLichMacDinh: Boolean(lichNguoi(ngay)?.macDinh),
      tenLich: lichNguoi(ngay)?.tenLich ?? null,
    };
  });

  const coThayMay = coQuyen(nc.hoSo, "nhan_su.view") || coQuyen(nc.hoSo, "cham_cong.view");
  const may = coThayMay && (coQuyen(nc.hoSo, "nhan_su.view") || coQuyen(nc.hoSo, "cham_cong.approve")) ? await danhSachMay(nc, bayGio) : null;
  const canXemXet = coQuyen(nc.hoSo, "cham_cong.approve") || (await nc.tx.staffProfile.count({ where: { managerId: nc.hoSo.userId } })) > 0
    ? (await lanChamCanXemXet(nc, phamVi.userId ? phamVi.userId.in.filter((x) => x !== nc.hoSo.userId) : "tat-ca", mocVN(congNgay(ngay, -7), 0)))
    : [];
  const duocDuyet: typeof canXemXet = [];
  for (const p of canXemXet) if (p.nguoi.id && (await coTheDuyet(nc, p.nguoi.id))) duocDuyet.push(p);

  return {
    ngay,
    capNhatLuc: bayGio,
    tomTat: dem,
    dong,
    may: may ? { nguongPhut: may.nguongPhut, dong: may.dong.filter((m) => m.trangThai === "hoat-dong") } : null,
    canXemXet: duocDuyet,
  };
}
