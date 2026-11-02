"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

type ChiTieu = { id?: string; ten: string; trongSo: string; nguon: "tu-dong" | "thu-cong"; chiSo: string; chieu: string; mucTieuThang: string; mucTieuQuy: string };
export interface BoKpiSua {
  id: string;
  ma: string;
  ten: string;
  moTa: string;
  chucDanh: string;
  maVaiTro: string;
  trangThai: string;
  chiTieu: { id: string; ten: string; trongSo: number; nguon: "tu-dong" | "thu-cong"; chiSo: string | null; chieu: string; mucTieuThang: number | null; mucTieuQuy: number | null }[];
}

/** Bộ KPI theo vị trí (DG-50): mỗi chỉ tiêu có trọng số (tổng 100), nguồn tự tính / quản lý chấm, mục tiêu tháng / quý. */
export default function FormBoKpi({ bo, chiSo, vaiTro, nhanNut, lopNut = "nut chinh" }: { bo?: BoKpiSua; chiSo: { ma: string; ten: string; donVi: string }[]; vaiTro: { ma: string; ten: string }[]; nhanNut: string; lopNut?: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const dauChiTieu = (): ChiTieu[] =>
    bo?.chiTieu.map((c) => ({ id: c.id, ten: c.ten, trongSo: String(c.trongSo), nguon: c.nguon, chiSo: c.chiSo ?? "", chieu: c.chieu, mucTieuThang: c.mucTieuThang === null ? "" : String(c.mucTieuThang), mucTieuQuy: c.mucTieuQuy === null ? "" : String(c.mucTieuQuy) })) ??
    [{ ten: "", trongSo: "100", nguon: "tu-dong", chiSo: chiSo[0]?.ma ?? "", chieu: "", mucTieuThang: "", mucTieuQuy: "" }];
  const dau = { ma: bo?.ma ?? "", ten: bo?.ten ?? "", moTa: bo?.moTa ?? "", chucDanh: bo?.chucDanh ?? "", maVaiTro: bo?.maVaiTro ?? "", trangThai: bo?.trangThai ?? "hoat-dong" };
  const [gt, datGt] = useState(dau);
  const [ct, datCt] = useState<ChiTieu[]>(dauChiTieu);
  const tong = ct.reduce((s, c) => s + (Number(c.trongSo) || 0), 0);
  const doi = (i: number, k: keyof ChiTieu, v: string) => datCt(ct.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  async function gui() {
    const than = {
      ...gt,
      chiTieu: ct.map((c) => ({
        ...(c.id && { id: c.id }), ten: c.ten, trongSo: Number(c.trongSo), nguon: c.nguon, chiSo: c.nguon === "tu-dong" ? c.chiSo : null,
        ...(c.chieu && { chieu: c.chieu }), mucTieuThang: c.mucTieuThang, mucTieuQuy: c.mucTieuQuy,
      })),
    };
    if (await goi(bo ? `/api/v1/danh-gia/kpi/${bo.id}` : "/api/v1/danh-gia/kpi", bo ? "PUT" : "POST", than)) {
      hop.current?.close();
      router.refresh();
    }
  }
  return (
    <>
      <button type="button" className={lopNut} onClick={() => { datGt(dau); datCt(dauChiTieu()); datLoi(null); hop.current?.showModal(); }}>{nhanNut}</button>
      <HopThoai ref={hop} tieuDe={bo ? `Sửa ${bo.ten}` : "Thêm bộ KPI"} rong={900}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}{Object.values(loi.loiTruong ?? {}).flat().length ? ` — ${Object.values(loi.loiTruong).flat().join(" ")}` : ""}</div>}
          <div className="luoi-form">
            <div className="truong"><label>Mã *</label><input value={gt.ma} onChange={(e) => datGt({ ...gt, ma: e.target.value })} placeholder="kinh-doanh" /></div>
            <div className="truong"><label>Tên *</label><input value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} /></div>
            <div className="truong"><label>Áp cho chức danh</label><input value={gt.chucDanh} onChange={(e) => datGt({ ...gt, chucDanh: e.target.value })} placeholder="Khớp đúng chức danh trên hồ sơ" /></div>
            <div className="truong"><label>Hoặc vai trò</label><select value={gt.maVaiTro} onChange={(e) => datGt({ ...gt, maVaiTro: e.target.value })}><option value="">—</option>{vaiTro.map((v) => <option key={v.ma} value={v.ma}>{v.ten}</option>)}</select></div>
            <div className="truong"><label>Trạng thái</label><select value={gt.trangThai} onChange={(e) => datGt({ ...gt, trangThai: e.target.value })}><option value="hoat-dong">Đang dùng</option><option value="ngung-hoat-dong">Ngừng</option></select></div>
          </div>
          <p className="goi-y">Để trống cả chức danh và vai trò = bộ mặc định cho người không khớp bộ nào.</p>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Chỉ tiêu</th><th style={{ width: 80 }}>Trọng số</th><th>Nguồn</th><th>Chỉ số tự tính</th><th style={{ width: 120 }}>Mục tiêu tháng</th><th style={{ width: 120 }}>Mục tiêu quý</th><th /></tr></thead>
            <tbody>{ct.map((c, i) => (
              <tr key={i}>
                <td><input value={c.ten} onChange={(e) => doi(i, "ten", e.target.value)} /></td>
                <td><input type="number" value={c.trongSo} onChange={(e) => doi(i, "trongSo", e.target.value)} /></td>
                <td><select value={c.nguon} onChange={(e) => doi(i, "nguon", e.target.value)}><option value="tu-dong">Tự tính</option><option value="thu-cong">Quản lý chấm</option></select></td>
                <td>{c.nguon === "tu-dong" ? <select value={c.chiSo} onChange={(e) => doi(i, "chiSo", e.target.value)}>{chiSo.map((x) => <option key={x.ma} value={x.ma}>{x.ten} ({x.donVi})</option>)}</select> : <span className="phu">0–100 điểm</span>}</td>
                <td><input value={c.mucTieuThang} onChange={(e) => doi(i, "mucTieuThang", e.target.value)} disabled={c.nguon !== "tu-dong"} /></td>
                <td><input value={c.mucTieuQuy} onChange={(e) => doi(i, "mucTieuQuy", e.target.value)} disabled={c.nguon !== "tu-dong"} /></td>
                <td><button type="button" className="nut nho" onClick={() => datCt(ct.filter((_, j) => j !== i))} disabled={ct.length === 1}>Bỏ</button></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button type="button" className="nut nho" onClick={() => datCt([...ct, { ten: "", trongSo: "0", nguon: "thu-cong", chiSo: chiSo[0]?.ma ?? "", chieu: "", mucTieuThang: "", mucTieuQuy: "" }])}>+ Thêm chỉ tiêu</button>
            <span className={Math.abs(tong - 100) < 0.01 ? "phu" : "loi-truong"}>Tổng trọng số: {tong} / 100</span>
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </HopThoai>
    </>
  );
}
