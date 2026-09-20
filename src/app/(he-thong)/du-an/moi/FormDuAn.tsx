"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Mở dự án triển khai. Hạng mục nhập mỗi dòng một việc lớn — đánh dấu xong dần, và chỉ
 * nghiệm thu được khi mọi hạng mục đã xong (DU-05).
 */
export default function FormDuAn({
  nguoiPhuTrach,
  khachBanDau,
  donHangBanDau,
  toiId,
}: {
  nguoiPhuTrach: { id: string; fullName: string }[];
  khachBanDau: KhachDaChon | null;
  donHangBanDau: { id: string; so: string } | null;
  toiId: string;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [khach, datKhach] = useState<KhachDaChon | null>(khachBanDau);
  const [donHang, datDonHang] = useState<{ id: string; so: string } | null>(donHangBanDau);
  const [dsDon, datDsDon] = useState<{ id: string; so: string; trangThai: string }[]>([]);
  const [gt, datGt] = useState({
    ten: "",
    moTa: "",
    nguoiPhuTrachId: toiId,
    ngayBatDau: "",
    ngayDuKien: "",
    hangMuc: "Khảo sát mặt bằng\nLắp đặt, cấu hình\nBàn giao và hướng dẫn sử dụng",
  });

  const khachId = khach?.id;
  useEffect(() => {
    if (!khachId || donHangBanDau) return;
    const huy = new AbortController();
    fetch(`/api/v1/don-hang?khachHang=${khachId}&trangThai=tat-ca&coTrang=50`, { signal: huy.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) datDsDon((d.dong ?? []).map((x: { id: string; so: string; trangThai: string }) => ({ id: x.id, so: x.so, trangThai: x.trangThai })).filter((x: { trangThai: string }) => x.trangThai !== "DRAFT"));
      })
      .catch(() => {});
    return () => huy.abort();
  }, [khachId, donHangBanDau]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/du-an", "POST", {
      khachHangId: khach?.id ?? "",
      donHangId: donHang?.id ?? "",
      ten: gt.ten,
      moTa: gt.moTa,
      nguoiPhuTrachId: gt.nguoiPhuTrachId,
      ngayBatDau: gt.ngayBatDau,
      ngayDuKien: gt.ngayDuKien,
      hangMuc: gt.hangMuc.split("\n").map((s) => s.trim()).filter((s) => s.length >= 2),
    });
    if (kq) router.push(`/du-an/${kq.id}?moTao=1`);
  }

  const thieu = !khach || gt.ten.trim().length < 3;

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
        <h3>Dự án cho ai</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="da-khach">
              Khách hàng <span className="bat-buoc">*</span>
            </label>
            <ChonKhachHang id="da-khach" giaTri={khach} datGiaTri={(k) => { datKhach(k); datDonHang(null); }} loi={loiCua(loi, "khachHangId")} />
            <LoiTruong loi={loi} truong="khachHangId" />
          </div>
          <div className="truong">
            <label htmlFor="da-don">Từ đơn hàng</label>
            {donHangBanDau ? (
              <input id="da-don" type="text" readOnly value={donHangBanDau.so} />
            ) : (
              <select id="da-don" value={donHang?.id ?? ""} onChange={(e) => datDonHang(dsDon.find((x) => x.id === e.target.value) ?? null)}>
                <option value="">— Không gắn đơn —</option>
                {dsDon.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.so}
                  </option>
                ))}
              </select>
            )}
            <LoiTruong loi={loi} truong="donHangId" />
            <span className="goi-y">Chỉ chọn được đơn đã xác nhận — đơn còn nháp thì chưa triển khai.</span>
          </div>
          <div className="truong">
            <label htmlFor="da-phutrach">Người phụ trách</label>
            <select id="da-phutrach" value={gt.nguoiPhuTrachId} onChange={(e) => datGt((c) => ({ ...c, nguoiPhuTrachId: e.target.value }))}>
              {nguoiPhuTrach.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Nội dung triển khai</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="da-ten">
              Tên dự án <span className="bat-buoc">*</span>
            </label>
            <input id="da-ten" type="text" value={gt.ten} onChange={(e) => datGt((c) => ({ ...c, ten: e.target.value }))} placeholder="Ví dụ: Lắp 24 camera cho 6 cửa hàng" />
            <LoiTruong loi={loi} truong="ten" />
          </div>
          <div className="truong">
            <label htmlFor="da-batdau">Bắt đầu</label>
            <input id="da-batdau" type="date" value={gt.ngayBatDau} onChange={(e) => datGt((c) => ({ ...c, ngayBatDau: e.target.value }))} />
          </div>
          <div className="truong">
            <label htmlFor="da-dukien">Hạn dự kiến</label>
            <input id="da-dukien" type="date" value={gt.ngayDuKien} onChange={(e) => datGt((c) => ({ ...c, ngayDuKien: e.target.value }))} />
            <LoiTruong loi={loi} truong="ngayDuKien" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="da-mota">Mô tả phạm vi</label>
            <textarea id="da-mota" rows={2} value={gt.moTa} onChange={(e) => datGt((c) => ({ ...c, moTa: e.target.value }))} placeholder="Làm những gì, ở đâu, ai nghiệm thu" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="da-hangmuc">Hạng mục (mỗi dòng một việc lớn)</label>
            <textarea id="da-hangmuc" rows={5} value={gt.hangMuc} onChange={(e) => datGt((c) => ({ ...c, hangMuc: e.target.value }))} />
            <span className="goi-y">Thêm bớt hạng mục sau cũng được. Nghiệm thu chỉ mở khi mọi hạng mục đã xong.</span>
          </div>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/du-an")}>
          Hủy
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieu}>
          {dangGui ? "Đang mở dự án…" : "Mở dự án"}
        </button>
      </div>
      {thieu && <p className="goi-y" style={{ padding: "0 16px 14px" }}>Cần chọn khách hàng và đặt tên dự án.</p>}
    </form>
  );
}
