"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";
import BangDongBaoGia, { dongTrong, dongVeApi, type DongNhap } from "@/components/bao-gia/BangDongBaoGia";

export interface GiaTriDonHang {
  id?: string;
  khachHang: KhachDaChon | null;
  lienHeId: string;
  nguoiPhuTrachId: string;
  ngayDat: string;
  ngayGiaoDuKien: string;
  diaChiGiao: string;
  dieuKhoanThanhToan: string;
  dieuKhoanGiaoHang: string;
  ghiChu: string;
  dong: DongNhap[];
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Form tạo đơn thủ công và sửa đơn còn nháp.
 *
 * Đơn sinh từ báo giá thì **không** đi qua form này — dòng hàng chép thẳng sang để số
 * tiền khớp báo giá (DH-01). Đơn đã xác nhận cũng không mở form này (DH-03).
 */
export default function FormDonHang({
  banDau,
  lienHeBanDau,
  nguoiPhuTrach,
  dieuKhoanThanhToan,
  dieuKhoanGiaoHang,
  donViTinh,
  hienGiaVon,
}: {
  banDau: GiaTriDonHang;
  lienHeBanDau: { id: string; hoTen: string }[];
  nguoiPhuTrach: { id: string; fullName: string }[];
  dieuKhoanThanhToan: { ma: string; ten: string }[];
  dieuKhoanGiaoHang: { ma: string; ten: string }[];
  donViTinh: { ma: string; ten: string }[];
  hienGiaVon: boolean;
}) {
  const router = useRouter();
  const laTaoMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState<GiaTriDonHang>({ ...banDau, dong: banDau.dong.length ? banDau.dong : [dongTrong()] });
  const [lienHe, datLienHe] = useState(lienHeBanDau);
  const dat = <K extends keyof GiaTriDonHang>(k: K, v: GiaTriDonHang[K]) => datGt((c) => ({ ...c, [k]: v }));

  const khachId = gt.khachHang?.id;
  useEffect(() => {
    if (!laTaoMoi || !khachId || khachId === banDau.khachHang?.id) return;
    const huy = new AbortController();
    fetch(`/api/v1/khach-hang/${khachId}`, { signal: huy.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        datLienHe((d.lienHe ?? []).filter((l: { trangThai: string }) => l.trangThai === "hoat-dong").map((l: { id: string; hoTen: string }) => ({ id: l.id, hoTen: l.hoTen })));
        if (d.khach?.diaChi && !gt.diaChiGiao) dat("diaChiGiao", d.khach.diaChi);
      })
      .catch(() => {});
    return () => huy.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khachId, laTaoMoi, banDau.khachHang?.id]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = {
      lienHeId: gt.lienHeId,
      nguoiPhuTrachId: gt.nguoiPhuTrachId,
      ngayDat: gt.ngayDat,
      ngayGiaoDuKien: gt.ngayGiaoDuKien,
      diaChiGiao: gt.diaChiGiao,
      dieuKhoanThanhToan: gt.dieuKhoanThanhToan,
      dieuKhoanGiaoHang: gt.dieuKhoanGiaoHang,
      ghiChu: gt.ghiChu,
      dong: gt.dong.filter((d) => d.ten.trim().length >= 2).map(dongVeApi),
    };
    if (laTaoMoi) {
      const kq = await goi<{ id: string }>("/api/v1/don-hang", "POST", { ...than, khachHangId: gt.khachHang?.id ?? "" });
      if (kq) router.push(`/ban-hang/don-hang/${kq.id}?moTao=1`);
    } else {
      const kq = await goi(`/api/v1/don-hang/${banDau.id}`, "PATCH", than);
      if (kq) router.push(`/ban-hang/don-hang/${banDau.id}`);
    }
  }

  const aria = (t: string) => (loiCua(loi, t) ? { "aria-invalid": true as const } : {});
  const thieuBatBuoc = !gt.khachHang || gt.dong.filter((d) => d.ten.trim().length >= 2).length === 0;

  return (
    <form className="the" onSubmit={gui} noValidate>
      {loi && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        </div>
      )}

      <div className="phan-form">
        <h3>Bán cho ai</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="dh-khach">
              Khách hàng <span className="bat-buoc">*</span>
            </label>
            {laTaoMoi ? (
              <ChonKhachHang
                id="dh-khach"
                giaTri={gt.khachHang}
                datGiaTri={(k) => {
                  dat("khachHang", k);
                  dat("lienHeId", "");
                }}
                loi={loiCua(loi, "khachHangId")}
              />
            ) : (
              <input id="dh-khach" type="text" readOnly value={`${gt.khachHang?.ten ?? ""} (${gt.khachHang?.ma ?? ""})`} />
            )}
            <LoiTruong loi={loi} truong="khachHangId" />
          </div>
          <div className="truong">
            <label htmlFor="dh-lienhe">Người nhận hàng</label>
            <select id="dh-lienhe" value={gt.lienHeId} onChange={(e) => dat("lienHeId", e.target.value)} {...aria("lienHeId")}>
              <option value="">— Chưa chọn —</option>
              {lienHe.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.hoTen}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="dh-phutrach">Người phụ trách</label>
            <select id="dh-phutrach" value={gt.nguoiPhuTrachId} onChange={(e) => dat("nguoiPhuTrachId", e.target.value)} {...aria("nguoiPhuTrachId")}>
              {nguoiPhuTrach.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="dh-ngaydat">Ngày đặt</label>
            <input id="dh-ngaydat" type="date" value={gt.ngayDat} onChange={(e) => dat("ngayDat", e.target.value)} {...aria("ngayDat")} />
          </div>
          <div className="truong">
            <label htmlFor="dh-ngaygiao">Giao dự kiến</label>
            <input id="dh-ngaygiao" type="date" value={gt.ngayGiaoDuKien} onChange={(e) => dat("ngayGiaoDuKien", e.target.value)} {...aria("ngayGiaoDuKien")} />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="dh-diachi">Địa chỉ giao hàng</label>
            <textarea id="dh-diachi" rows={2} value={gt.diaChiGiao} onChange={(e) => dat("diaChiGiao", e.target.value)} placeholder="Để trống thì lấy địa chỉ khách hàng" />
          </div>
        </div>
      </div>

      <BangDongBaoGia dong={gt.dong} datDong={(d) => dat("dong", d)} donViTinh={donViTinh} hienGiaVon={hienGiaVon} nguongBienLoiNhuan={null} />

      <div className="phan-form">
        <h3>Điều khoản</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="dh-thanhtoan">Thanh toán</label>
            <select id="dh-thanhtoan" value={gt.dieuKhoanThanhToan} onChange={(e) => dat("dieuKhoanThanhToan", e.target.value)} {...aria("dieuKhoanThanhToan")}>
              <option value="">— Chưa chọn —</option>
              {dieuKhoanThanhToan.map((d) => (
                <option key={d.ma} value={d.ma}>
                  {d.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="dieuKhoanThanhToan" />
          </div>
          <div className="truong">
            <label htmlFor="dh-giaohang">Giao hàng</label>
            <select id="dh-giaohang" value={gt.dieuKhoanGiaoHang} onChange={(e) => dat("dieuKhoanGiaoHang", e.target.value)} {...aria("dieuKhoanGiaoHang")}>
              <option value="">— Chưa chọn —</option>
              {dieuKhoanGiaoHang.map((d) => (
                <option key={d.ma} value={d.ma}>
                  {d.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="dieuKhoanGiaoHang" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="dh-ghichu">Ghi chú</label>
            <textarea id="dh-ghichu" rows={2} value={gt.ghiChu} onChange={(e) => dat("ghiChu", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.back()}>
          {laTaoMoi ? "Hủy" : "Quay lại"}
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieuBatBuoc}>
          {dangGui ? "Đang lưu…" : laTaoMoi ? "Tạo đơn hàng" : "Lưu thay đổi"}
        </button>
      </div>
      {thieuBatBuoc && <p className="goi-y" style={{ padding: "0 16px 14px" }}>Cần chọn khách hàng và ít nhất một dòng hàng có tên.</p>}
    </form>
  );
}
