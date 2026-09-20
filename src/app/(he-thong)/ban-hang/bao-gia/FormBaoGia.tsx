"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";
import BangDongBaoGia, { dongTrong, dongVeApi, type DongNhap } from "@/components/bao-gia/BangDongBaoGia";
import { laCoHoiDangMo } from "@/modules/crm/hang-so";

export interface GiaTriBaoGia {
  id?: string;
  khachHang: KhachDaChon | null;
  lienHeId: string;
  coHoiId: string;
  nguoiPhuTrachId: string;
  dieuKhoanThanhToan: string;
  dieuKhoanGiaoHang: string;
  dieuKhoanBaoHanh: string;
  hieuLucDen: string;
  ghiChu: string;
  dong: DongNhap[];
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Form lập báo giá (tạo mới) và sửa phiên bản đang soạn.
 *
 * Sửa một bản ĐÃ GỬI thì máy chủ từ chối (BG-02) — màn hình chi tiết không mở form này,
 * mà mời tạo phiên bản mới. Ở đây chỉ nhắc lại luật cho người dùng biết.
 */
export default function FormBaoGia({
  banDau,
  lienHeBanDau,
  coHoiBanDau,
  nguoiPhuTrach,
  dieuKhoanThanhToan,
  dieuKhoanGiaoHang,
  donViTinh,
  hienGiaVon,
  nguongBienLoiNhuan,
}: {
  banDau: GiaTriBaoGia;
  lienHeBanDau: { id: string; hoTen: string }[];
  coHoiBanDau: { id: string; ma: string; tieuDe: string }[];
  nguoiPhuTrach: { id: string; fullName: string }[];
  /** Điều khoản là Dữ liệu gốc (Quản trị → Dữ liệu gốc), không phải chữ gõ tự do. */
  dieuKhoanThanhToan: { ma: string; ten: string }[];
  dieuKhoanGiaoHang: { ma: string; ten: string }[];
  donViTinh: { ma: string; ten: string }[];
  hienGiaVon: boolean;
  nguongBienLoiNhuan: number | null;
}) {
  const router = useRouter();
  const laTaoMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState<GiaTriBaoGia>({ ...banDau, dong: banDau.dong.length ? banDau.dong : [dongTrong()] });
  const [lienHe, datLienHe] = useState(lienHeBanDau);
  const [coHoi, datCoHoi] = useState(coHoiBanDau);
  const dat = <K extends keyof GiaTriBaoGia>(k: K, v: GiaTriBaoGia[K]) => datGt((c) => ({ ...c, [k]: v }));

  // Đổi khách thì tải liên hệ và cơ hội đang mở của khách đó.
  const khachId = gt.khachHang?.id;
  useEffect(() => {
    if (!laTaoMoi || !khachId || khachId === banDau.khachHang?.id) return;
    const huy = new AbortController();
    fetch(`/api/v1/khach-hang/${khachId}`, { signal: huy.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        datLienHe((d.lienHe ?? []).filter((l: { trangThai: string }) => l.trangThai === "hoat-dong").map((l: { id: string; hoTen: string }) => ({ id: l.id, hoTen: l.hoTen })));
        datCoHoi(
          (d.coHoi ?? [])
            .filter((c: { giaiDoan: string }) => laCoHoiDangMo(c.giaiDoan))
            .map((c: { id: string; ma: string; tieuDe: string }) => ({ id: c.id, ma: c.ma, tieuDe: c.tieuDe })),
        );
      })
      .catch(() => {});
    return () => huy.abort();
  }, [khachId, laTaoMoi, banDau.khachHang?.id]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = {
      lienHeId: gt.lienHeId,
      coHoiId: gt.coHoiId,
      nguoiPhuTrachId: gt.nguoiPhuTrachId,
      dieuKhoanThanhToan: gt.dieuKhoanThanhToan,
      dieuKhoanGiaoHang: gt.dieuKhoanGiaoHang,
      dieuKhoanBaoHanh: gt.dieuKhoanBaoHanh,
      hieuLucDen: gt.hieuLucDen,
      ghiChu: gt.ghiChu,
      dong: gt.dong.filter((d) => d.ten.trim().length >= 2).map(dongVeApi),
    };
    if (laTaoMoi) {
      const kq = await goi<{ id: string }>("/api/v1/bao-gia", "POST", { ...than, khachHangId: gt.khachHang?.id ?? "" });
      if (kq) router.push(`/ban-hang/bao-gia/${kq.id}?moTao=1`);
    } else {
      const kq = await goi(`/api/v1/bao-gia/${banDau.id}`, "PATCH", than);
      if (kq) router.push(`/ban-hang/bao-gia/${banDau.id}?daLuu=1`);
    }
  }

  const aria = (t: string) => (loiCua(loi, t) ? { "aria-invalid": true as const } : {});
  const dongHopLe = gt.dong.filter((d) => d.ten.trim().length >= 2);
  const thieuBatBuoc = !gt.khachHang || dongHopLe.length === 0;

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
        <h3>Gửi cho ai</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="bg-khach">
              Khách hàng <span className="bat-buoc">*</span>
            </label>
            {laTaoMoi ? (
              <ChonKhachHang
                id="bg-khach"
                giaTri={gt.khachHang}
                datGiaTri={(k) => {
                  dat("khachHang", k);
                  dat("lienHeId", "");
                  dat("coHoiId", "");
                }}
                loi={loiCua(loi, "khachHangId")}
              />
            ) : (
              <input id="bg-khach" type="text" readOnly value={`${gt.khachHang?.ten ?? ""} (${gt.khachHang?.ma ?? ""})`} />
            )}
            <LoiTruong loi={loi} truong="khachHangId" />
          </div>
          <div className="truong">
            <label htmlFor="bg-lienhe">Người nhận báo giá</label>
            <select id="bg-lienhe" value={gt.lienHeId} onChange={(e) => dat("lienHeId", e.target.value)} {...aria("lienHeId")}>
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
            <label htmlFor="bg-cohoi">Thuộc cơ hội</label>
            <select id="bg-cohoi" value={gt.coHoiId} onChange={(e) => dat("coHoiId", e.target.value)} {...aria("coHoiId")}>
              <option value="">— Không gắn cơ hội —</option>
              {coHoi.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ma} — {c.tieuDe}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="coHoiId" />
          </div>
          <div className="truong">
            <label htmlFor="bg-phutrach">Người lập</label>
            <select id="bg-phutrach" value={gt.nguoiPhuTrachId} onChange={(e) => dat("nguoiPhuTrachId", e.target.value)} {...aria("nguoiPhuTrachId")}>
              {nguoiPhuTrach.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nguoiPhuTrachId" />
          </div>
          <div className="truong">
            <label htmlFor="bg-hieuluc">Hiệu lực đến</label>
            <input id="bg-hieuluc" type="date" value={gt.hieuLucDen} onChange={(e) => dat("hieuLucDen", e.target.value)} {...aria("hieuLucDen")} />
            <LoiTruong loi={loi} truong="hieuLucDen" />
          </div>
        </div>
      </div>

      <BangDongBaoGia dong={gt.dong} datDong={(d) => dat("dong", d)} donViTinh={donViTinh} hienGiaVon={hienGiaVon} nguongBienLoiNhuan={nguongBienLoiNhuan} />

      <div className="phan-form">
        <h3>Điều khoản in trên báo giá</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="bg-thanhtoan">Thanh toán</label>
            <select id="bg-thanhtoan" value={gt.dieuKhoanThanhToan} onChange={(e) => dat("dieuKhoanThanhToan", e.target.value)} {...aria("dieuKhoanThanhToan")}>
              <option value="">— Chưa chọn —</option>
              {dieuKhoanThanhToan.map((d) => (
                <option key={d.ma} value={d.ma}>
                  {d.ten}
                </option>
              ))}
            </select>
            {dieuKhoanThanhToan.length === 0 && <span className="goi-y">Chưa khai điều khoản nào. Thêm ở Quản trị → Dữ liệu gốc.</span>}
            <LoiTruong loi={loi} truong="dieuKhoanThanhToan" />
          </div>
          <div className="truong">
            <label htmlFor="bg-giaohang">Giao hàng</label>
            <select id="bg-giaohang" value={gt.dieuKhoanGiaoHang} onChange={(e) => dat("dieuKhoanGiaoHang", e.target.value)} {...aria("dieuKhoanGiaoHang")}>
              <option value="">— Chưa chọn —</option>
              {dieuKhoanGiaoHang.map((d) => (
                <option key={d.ma} value={d.ma}>
                  {d.ten}
                </option>
              ))}
            </select>
            {dieuKhoanGiaoHang.length === 0 && <span className="goi-y">Chưa khai điều khoản nào. Thêm ở Quản trị → Dữ liệu gốc.</span>}
            <LoiTruong loi={loi} truong="dieuKhoanGiaoHang" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="bg-baohanh">Bảo hành</label>
            <textarea id="bg-baohanh" rows={2} value={gt.dieuKhoanBaoHanh} onChange={(e) => dat("dieuKhoanBaoHanh", e.target.value)} placeholder="Theo chính sách của hãng, hoặc ghi rõ thời gian bảo hành từng nhóm hàng" />
            <LoiTruong loi={loi} truong="dieuKhoanBaoHanh" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="bg-ghichu">Ghi chú nội bộ</label>
            <textarea id="bg-ghichu" rows={2} value={gt.ghiChu} onChange={(e) => dat("ghiChu", e.target.value)} placeholder="Ghi chú cho người duyệt — không in cho khách" />
            <LoiTruong loi={loi} truong="ghiChu" />
          </div>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.back()}>
          {laTaoMoi ? "Hủy" : "Quay lại"}
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieuBatBuoc}>
          {dangGui ? "Đang lưu…" : laTaoMoi ? "Lưu báo giá" : "Lưu thay đổi"}
        </button>
      </div>
      {thieuBatBuoc && <p className="goi-y" style={{ padding: "0 16px 14px" }}>Cần chọn khách hàng và ít nhất một dòng hàng có tên.</p>}
    </form>
  );
}
