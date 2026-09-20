"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";
import { dinhDangNhapTien } from "@/lib/dinh-dang";

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Lập hợp đồng bảo trì định kỳ. Chu kỳ tính bằng THÁNG; kỳ đầu tiên là ngày bắt đầu
 * hợp đồng, các kỳ sau cộng dồn từ lần bảo trì gần nhất (BT-02).
 */
export default function FormBaoTri({
  nguoiPhuTrach,
  toiId,
  khachBanDau,
}: {
  nguoiPhuTrach: { id: string; hoTen: string }[];
  toiId: string;
  khachBanDau: KhachDaChon | null;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [khach, datKhach] = useState<KhachDaChon | null>(khachBanDau);
  const [gt, datGt] = useState({
    ten: "",
    phamVi: "",
    ngayBatDau: "",
    ngayKetThuc: "",
    chuKyThang: "3",
    giaTri: "",
    nguoiPhuTrachId: toiId,
    ghiChu: "",
  });

  const sua = (thay: Partial<typeof gt>) => datGt((c) => ({ ...c, ...thay }));

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/bao-tri", "POST", {
      khachHangId: khach?.id ?? "",
      ten: gt.ten,
      phamVi: gt.phamVi,
      ngayBatDau: gt.ngayBatDau,
      ngayKetThuc: gt.ngayKetThuc,
      chuKyThang: Number(gt.chuKyThang || 0),
      giaTri: gt.giaTri || "0",
      nguoiPhuTrachId: gt.nguoiPhuTrachId,
      ghiChu: gt.ghiChu,
    });
    if (kq) router.push(`/dich-vu/bao-tri/${kq.id}?moTao=1`);
  }

  const thieu = !khach || gt.ten.trim().length < 3 || !gt.ngayBatDau || !gt.ngayKetThuc;

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
        <h3>Hợp đồng cho ai</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="bt-khach">
              Khách hàng <span className="bat-buoc">*</span>
            </label>
            <ChonKhachHang id="bt-khach" giaTri={khach} datGiaTri={datKhach} loi={loiCua(loi, "khachHangId")} />
            <LoiTruong loi={loi} truong="khachHangId" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="bt-ten">
              Tên hợp đồng <span className="bat-buoc">*</span>
            </label>
            <input
              id="bt-ten"
              type="text"
              value={gt.ten}
              onChange={(e) => sua({ ten: e.target.value })}
              placeholder="Ví dụ: Bảo trì hệ thống camera 12 cửa hàng"
            />
            <LoiTruong loi={loi} truong="ten" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="bt-phamvi">Phạm vi công việc</label>
            <textarea
              id="bt-phamvi"
              rows={3}
              value={gt.phamVi}
              onChange={(e) => sua({ phamVi: e.target.value })}
              placeholder="Mỗi kỳ làm những gì: vệ sinh, kiểm tra, thay vật tư hao mòn…"
            />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Kỳ hạn và chu kỳ</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="bt-batdau">
              Ngày bắt đầu <span className="bat-buoc">*</span>
            </label>
            <input id="bt-batdau" type="date" value={gt.ngayBatDau} onChange={(e) => sua({ ngayBatDau: e.target.value })} />
            <LoiTruong loi={loi} truong="ngayBatDau" />
            <span className="goi-y">Cũng là kỳ bảo trì đầu tiên.</span>
          </div>
          <div className="truong">
            <label htmlFor="bt-ketthuc">
              Ngày kết thúc <span className="bat-buoc">*</span>
            </label>
            <input id="bt-ketthuc" type="date" value={gt.ngayKetThuc} onChange={(e) => sua({ ngayKetThuc: e.target.value })} />
            <LoiTruong loi={loi} truong="ngayKetThuc" />
          </div>
          <div className="truong">
            <label htmlFor="bt-chuky">
              Chu kỳ (tháng) <span className="bat-buoc">*</span>
            </label>
            <input
              id="bt-chuky"
              type="number"
              min={1}
              max={60}
              value={gt.chuKyThang}
              onChange={(e) => sua({ chuKyThang: e.target.value })}
            />
            <LoiTruong loi={loi} truong="chuKyThang" />
          </div>
          <div className="truong">
            <label htmlFor="bt-giatri">Giá trị hợp đồng</label>
            <input
              id="bt-giatri"
              type="text"
              inputMode="numeric"
              className="phai"
              value={gt.giaTri}
              onChange={(e) => sua({ giaTri: dinhDangNhapTien(e.target.value) })}
            />
          </div>
          <div className="truong">
            <label htmlFor="bt-phutrach">Người phụ trách</label>
            <select id="bt-phutrach" value={gt.nguoiPhuTrachId} onChange={(e) => sua({ nguoiPhuTrachId: e.target.value })}>
              {nguoiPhuTrach.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.hoTen}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nguoiPhuTrachId" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="bt-ghichu">Ghi chú</label>
            <input id="bt-ghichu" type="text" value={gt.ghiChu} onChange={(e) => sua({ ghiChu: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/dich-vu/bao-tri")} disabled={dangGui}>
          Hủy
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieu}>
          {dangGui ? "Đang lập…" : "Lập hợp đồng"}
        </button>
      </div>
      {thieu && (
        <p className="goi-y" style={{ padding: "0 16px 14px" }}>
          Cần khách hàng, tên hợp đồng và kỳ hạn.
        </p>
      )}
    </form>
  );
}
