"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";
import ONhapTien from "@/components/crm/ONhapTien";
import { dinhDangNhapTien } from "@/lib/dinh-dang";

export interface GiaTriCoHoi {
  id?: string;
  khachHang: KhachDaChon | null;
  lienHeId: string;
  tieuDe: string;
  moTa: string;
  giaTri: string;
  xacSuat: string;
  ngayDuKienChot: string;
  nguon: string;
  nguoiPhuTrachId: string;
  hanhDongKeTiep: string;
  ngayHanhDong: string;
  doiThu: string;
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Form tạo / sửa cơ hội. CH-02: hành động kế tiếp + ngày là bắt buộc — form không cho lưu
 * khi thiếu, máy chủ và CSDL cũng chặn.
 */
export default function FormCoHoi({
  banDau,
  lienHeBanDau,
  nguon,
  nguoiPhuTrach,
}: {
  banDau: GiaTriCoHoi;
  lienHeBanDau: { id: string; hoTen: string }[];
  nguon: { ma: string; ten: string }[];
  nguoiPhuTrach: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const laTaoMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState({ ...banDau, giaTri: dinhDangNhapTien(banDau.giaTri) });
  const [lienHe, datLienHe] = useState(lienHeBanDau);
  const [daLuu, datDaLuu] = useState(false);
  const dat = <K extends keyof GiaTriCoHoi>(k: K, v: GiaTriCoHoi[K]) => {
    datGt((c) => ({ ...c, [k]: v }));
    datDaLuu(false);
  };

  // Chọn khách khác thì tải danh sách liên hệ của khách đó.
  const khachId = gt.khachHang?.id;
  useEffect(() => {
    if (!laTaoMoi || !khachId || khachId === banDau.khachHang?.id) return;
    const huy = new AbortController();
    fetch(`/api/v1/khach-hang/${khachId}`, { signal: huy.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) datLienHe((d.lienHe ?? []).filter((l: { trangThai: string }) => l.trangThai === "hoat-dong"));
      })
      .catch(() => {});
    return () => huy.abort();
  }, [khachId, laTaoMoi, banDau.khachHang?.id]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const chung = {
      lienHeId: gt.lienHeId,
      tieuDe: gt.tieuDe,
      moTa: gt.moTa,
      giaTri: gt.giaTri || "0",
      ...(gt.xacSuat !== "" && { xacSuat: Number(gt.xacSuat) }),
      ngayDuKienChot: gt.ngayDuKienChot,
      nguon: gt.nguon,
      nguoiPhuTrachId: gt.nguoiPhuTrachId,
      hanhDongKeTiep: gt.hanhDongKeTiep,
      ngayHanhDong: gt.ngayHanhDong,
      doiThu: gt.doiThu,
    };
    if (laTaoMoi) {
      const kq = await goi<{ id: string }>("/api/v1/co-hoi", "POST", { ...chung, khachHangId: gt.khachHang?.id ?? "" });
      if (kq) router.push(`/ban-hang/co-hoi/${kq.id}?moTao=1`);
    } else {
      const kq = await goi(`/api/v1/co-hoi/${banDau.id}`, "PATCH", chung);
      if (kq) {
        datDaLuu(true);
        router.refresh();
      }
    }
  }

  const aria = (t: string) => (loiCua(loi, t) ? { "aria-invalid": true as const } : {});
  const thieuBatBuoc = !gt.khachHang || gt.tieuDe.trim().length < 3 || gt.hanhDongKeTiep.trim().length < 3 || !gt.ngayHanhDong;

  return (
    <form className="the" onSubmit={gui} noValidate>
      {(loi || daLuu) && (
        <div style={{ padding: "16px 16px 0" }}>
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          {daLuu && <div className="hop-thong-bao tot" role="status">Đã lưu thay đổi.</div>}
        </div>
      )}
      <div className="phan-form">
        <h3>Cơ hội</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="ch-khach">
              Khách hàng <span className="bat-buoc">*</span>
            </label>
            {laTaoMoi ? (
              <ChonKhachHang id="ch-khach" giaTri={gt.khachHang} datGiaTri={(k) => { dat("khachHang", k); dat("lienHeId", ""); }} loi={loiCua(loi, "khachHangId")} />
            ) : (
              <input id="ch-khach" type="text" readOnly value={`${gt.khachHang?.ten ?? ""} (${gt.khachHang?.ma ?? ""})`} />
            )}
            <LoiTruong loi={loi} truong="khachHangId" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ch-tieude">
              Tiêu đề <span className="bat-buoc">*</span>
            </label>
            <input id="ch-tieude" type="text" value={gt.tieuDe} onChange={(e) => dat("tieuDe", e.target.value)} placeholder="Ví dụ: 20 bộ PC văn phòng cho phòng kế toán" {...aria("tieuDe")} />
            <LoiTruong loi={loi} truong="tieuDe" />
          </div>
          <div className="truong">
            <label htmlFor="ch-lienhe">Người liên hệ</label>
            <select id="ch-lienhe" value={gt.lienHeId} onChange={(e) => dat("lienHeId", e.target.value)} {...aria("lienHeId")}>
              <option value="">— Chưa chọn —</option>
              {lienHe.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.hoTen}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="lienHeId" />
          </div>
          <div className="truong">
            <label htmlFor="ch-phutrach">Người phụ trách</label>
            <select id="ch-phutrach" value={gt.nguoiPhuTrachId} onChange={(e) => dat("nguoiPhuTrachId", e.target.value)} {...aria("nguoiPhuTrachId")}>
              {nguoiPhuTrach.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nguoiPhuTrachId" />
          </div>
          <div className="truong">
            <label htmlFor="ch-giatri">Giá trị ước tính</label>
            <ONhapTien id="ch-giatri" giaTri={gt.giaTri} datGiaTri={(v) => dat("giaTri", v)} {...aria("giaTri")} />
            <LoiTruong loi={loi} truong="giaTri" />
          </div>
          <div className="truong">
            <label htmlFor="ch-xacsuat">Xác suất thắng (%)</label>
            <input id="ch-xacsuat" type="number" min={0} max={100} value={gt.xacSuat} onChange={(e) => dat("xacSuat", e.target.value)} placeholder="Để trống = theo giai đoạn" />
            <LoiTruong loi={loi} truong="xacSuat" />
          </div>
          <div className="truong">
            <label htmlFor="ch-ngaychot">Dự kiến chốt</label>
            <input id="ch-ngaychot" type="date" value={gt.ngayDuKienChot} onChange={(e) => dat("ngayDuKienChot", e.target.value)} />
          </div>
          <div className="truong">
            <label htmlFor="ch-nguon">Nguồn</label>
            <select id="ch-nguon" value={gt.nguon} onChange={(e) => dat("nguon", e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {nguon.map((n) => (
                <option key={n.ma} value={n.ma}>
                  {n.ten}
                </option>
              ))}
            </select>
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ch-mota">Mô tả nhu cầu</label>
            <textarea id="ch-mota" rows={3} value={gt.moTa} onChange={(e) => dat("moTa", e.target.value)} />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ch-doithu">Đối thủ</label>
            <input id="ch-doithu" type="text" value={gt.doiThu} onChange={(e) => dat("doiThu", e.target.value)} />
          </div>
        </div>
      </div>
      <div className="phan-form nhan-manh">
        <h3>Hành động kế tiếp</h3>
        <p className="goi-y" style={{ marginTop: 0 }}>Cơ hội đang mở luôn phải có việc cụ thể và ngày làm — để không cơ hội nào bị bỏ quên.</p>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="ch-hanhdong">
              Việc cần làm <span className="bat-buoc">*</span>
            </label>
            <input id="ch-hanhdong" type="text" value={gt.hanhDongKeTiep} onChange={(e) => dat("hanhDongKeTiep", e.target.value)} placeholder="Ví dụ: gửi cấu hình đề xuất" {...aria("hanhDongKeTiep")} />
            <LoiTruong loi={loi} truong="hanhDongKeTiep" />
          </div>
          <div className="truong">
            <label htmlFor="ch-ngayhd">
              Ngày thực hiện <span className="bat-buoc">*</span>
            </label>
            <input id="ch-ngayhd" type="date" value={gt.ngayHanhDong} onChange={(e) => dat("ngayHanhDong", e.target.value)} {...aria("ngayHanhDong")} />
            <LoiTruong loi={loi} truong="ngayHanhDong" />
          </div>
        </div>
      </div>
      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.back()}>
          {laTaoMoi ? "Hủy" : "Quay lại"}
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieuBatBuoc}>
          {dangGui ? "Đang lưu…" : laTaoMoi ? "Tạo cơ hội" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
