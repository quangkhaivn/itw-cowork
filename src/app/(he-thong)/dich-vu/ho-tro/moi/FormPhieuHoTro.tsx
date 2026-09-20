"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";
import { dinhDangNgay } from "@/lib/dinh-dang";
import { LOAI_PHIEU, NHAN_LOAI_PHIEU, NHAN_UU_TIEN_PHIEU, UU_TIEN_PHIEU } from "@/modules/ho-tro/tinh-toan";

interface BaoHanhGoiY {
  id: string;
  serial: string | null;
  tenHang: string;
  ngayHetHan: string;
  mucBaoHanh: string;
  khachHang: { id: string; ma: string; ten: string };
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Mở phiếu hỗ trợ. Tra số sê-ri trước: chọn đúng máy thì khách hàng, đơn hàng và tình
 * trạng bảo hành tự điền — người trực không phải hỏi khách mua hồi nào (HT-01).
 */
export default function FormPhieuHoTro({
  nguoiXuLy,
  khachBanDau,
}: {
  nguoiXuLy: { id: string; fullName: string }[];
  khachBanDau: KhachDaChon | null;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [khach, datKhach] = useState<KhachDaChon | null>(khachBanDau);
  const [baoHanh, datBaoHanh] = useState<BaoHanhGoiY | null>(null);
  const [q, datQ] = useState("");
  const [ketQua, datKetQua] = useState<{ cau: string; ds: BaoHanhGoiY[] }>({ cau: "", ds: [] });
  const [gt, datGt] = useState({ loai: "bao-hanh", uuTien: "trung-binh", tieuDe: "", moTa: "", nguoiXuLyId: "" });
  const [lienHe, datLienHe] = useState<{ id: string; hoTen: string }[]>([]);
  const [lienHeId, datLienHeId] = useState("");
  const cau = q.trim();
  const ds = ketQua.cau === cau ? ketQua.ds : [];

  useEffect(() => {
    if (cau.length < 2) return;
    const huy = new AbortController();
    const hen = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/bao-hanh/tra-serial?serial=${encodeURIComponent(cau)}`, { signal: huy.signal });
        if (!r.ok) return;
        const d = await r.json();
        datKetQua({ cau, ds: Array.isArray(d) ? d : [] });
      } catch {
        /* ô tra sê-ri hỏng thì vẫn mở phiếu tay được */
      }
    }, 250);
    return () => {
      clearTimeout(hen);
      huy.abort();
    };
  }, [cau]);

  const khachId = khach?.id;
  useEffect(() => {
    if (!khachId) return;
    const huy = new AbortController();
    fetch(`/api/v1/khach-hang/${khachId}`, { signal: huy.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) datLienHe((d.lienHe ?? []).filter((l: { trangThai: string }) => l.trangThai === "hoat-dong").map((l: { id: string; hoTen: string }) => ({ id: l.id, hoTen: l.hoTen })));
      })
      .catch(() => {});
    return () => huy.abort();
  }, [khachId]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/ho-tro", "POST", {
      khachHangId: khach?.id ?? "",
      lienHeId,
      baoHanhId: baoHanh?.id ?? "",
      loai: gt.loai,
      uuTien: gt.uuTien,
      tieuDe: gt.tieuDe,
      moTa: gt.moTa,
      nguoiXuLyId: gt.nguoiXuLyId,
    });
    if (kq) router.push(`/dich-vu/ho-tro/${kq.id}?moTao=1`);
  }

  const thieu = !khach || gt.tieuDe.trim().length < 3;

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
        <h3>Máy nào, khách nào</h3>
        <div className="o-chon-khach">
          <label htmlFor="ht-serial">Tra số sê-ri (nếu khách đọc được số máy)</label>
          <input id="ht-serial" type="search" autoComplete="off" value={q} onChange={(e) => datQ(e.target.value)} placeholder="Nhập một phần số sê-ri…" />
          {cau.length >= 2 && !baoHanh && (
            <ul className="goi-y-khach">
              {ds.length === 0 && <li className="goi-y">Không thấy máy nào — chọn khách hàng bên dưới và mở phiếu tay.</li>}
              {ds.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      datBaoHanh(b);
                      datKhach({ id: b.khachHang.id, ma: b.khachHang.ma, ten: b.khachHang.ten });
                      datQ("");
                    }}
                  >
                    <strong>{b.serial}</strong>
                    <div className="dong-phu">
                      {b.tenHang} · {b.khachHang.ten} · bảo hành đến {dinhDangNgay(b.ngayHetHan)}
                      {b.mucBaoHanh === "het-han" ? " (đã hết)" : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {baoHanh && (
          <div className="hop-thong-bao tot" role="status" style={{ marginTop: 10 }}>
            Máy <strong>{baoHanh.serial}</strong> — {baoHanh.tenHang}, bảo hành đến {dinhDangNgay(baoHanh.ngayHetHan)}
            {baoHanh.mucBaoHanh === "het-han" ? " (đã hết bảo hành)" : ""}.{" "}
            <button type="button" className="nut trong nho" onClick={() => datBaoHanh(null)}>
              Bỏ chọn
            </button>
          </div>
        )}

        <div className="luoi-form" style={{ marginTop: 12 }}>
          <div className="truong ca-dong">
            <label htmlFor="ht-khach">
              Khách hàng <span className="bat-buoc">*</span>
            </label>
            <ChonKhachHang id="ht-khach" giaTri={khach} datGiaTri={(k) => { datKhach(k); datBaoHanh(null); }} loi={loiCua(loi, "khachHangId")} />
            <LoiTruong loi={loi} truong="khachHangId" />
          </div>
          <div className="truong">
            <label htmlFor="ht-lienhe">Người liên hệ</label>
            <select id="ht-lienhe" value={lienHeId} onChange={(e) => datLienHeId(e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {lienHe.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.hoTen}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Khách cần gì</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="ht-loai">Loại phiếu</label>
            <select id="ht-loai" value={gt.loai} onChange={(e) => datGt((c) => ({ ...c, loai: e.target.value }))}>
              {LOAI_PHIEU.map((l) => (
                <option key={l} value={l}>
                  {NHAN_LOAI_PHIEU[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="ht-uutien">Mức ưu tiên</label>
            <select id="ht-uutien" value={gt.uuTien} onChange={(e) => datGt((c) => ({ ...c, uuTien: e.target.value }))}>
              {UU_TIEN_PHIEU.map((u) => (
                <option key={u} value={u}>
                  {NHAN_UU_TIEN_PHIEU[u]}
                </option>
              ))}
            </select>
            <span className="goi-y">Mức ưu tiên quyết định hạn cam kết (đặt ở Quản trị → Cấu hình).</span>
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ht-tieude">
              Tiêu đề <span className="bat-buoc">*</span>
            </label>
            <input id="ht-tieude" type="text" value={gt.tieuDe} onChange={(e) => datGt((c) => ({ ...c, tieuDe: e.target.value }))} placeholder="Ví dụ: máy không lên nguồn" />
            <LoiTruong loi={loi} truong="tieuDe" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ht-mota">Khách mô tả</label>
            <textarea id="ht-mota" rows={3} value={gt.moTa} onChange={(e) => datGt((c) => ({ ...c, moTa: e.target.value }))} placeholder="Ghi đúng lời khách: hiện tượng, lúc nào bắt đầu, đã thử gì" />
          </div>
          <div className="truong">
            <label htmlFor="ht-nguoi">Giao cho kỹ thuật</label>
            <select id="ht-nguoi" value={gt.nguoiXuLyId} onChange={(e) => datGt((c) => ({ ...c, nguoiXuLyId: e.target.value }))}>
              <option value="">— Để giao sau —</option>
              {nguoiXuLy.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/dich-vu/ho-tro")}>
          Hủy
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieu}>
          {dangGui ? "Đang mở phiếu…" : "Mở phiếu"}
        </button>
      </div>
      {thieu && <p className="goi-y" style={{ padding: "0 16px 14px" }}>Cần chọn khách hàng và ghi tiêu đề.</p>}
    </form>
  );
}
