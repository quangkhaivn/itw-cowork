"use client";

import { useGoiApi } from "@/components/ui/goi-api";
import { useState } from "react";
import { NHAN_GIAI_DOAN } from "@/modules/crm/hang-so";
import { nguonVaThamSo, type PhanKhucChon, type ThamSoLoc } from "./tham-so-nguoi-nhan";

export type { PhanKhucChon, ThamSoLoc };

type LuaChon = { ma: string; ten: string }[];

interface XemTruoc {
  moTa: string;
  tong: number;
  hopLe: number;
  biLoai: { lyDo: string; nhan: string; so: number }[];
  mau: { ten: string; congTy: string | null; email: string; loai: string }[];
}

/**
 * Chọn người nhận (EM-12): nguồn "loc-don-gian" (lead / liên hệ theo điều kiện) hoặc nguồn
 * "phan-khuc" của gói Marketing — chỉ người đã đồng ý nhận tin (MK-14). Dùng phân khúc cần
 * `marketing.update` (máy chủ kiểm lại; ở đây chỉ để không mời bấm nút chắc chắn bị từ chối).
 */
export default function ChonNguoiNhan({
  giaTri,
  khiDoi,
  luaChon,
  xemLead,
  xemLienHe,
  dsPhanKhuc = [],
  xemPhanKhuc = false,
  chiDoc = false,
}: {
  giaTri: ThamSoLoc;
  khiDoi: (t: ThamSoLoc) => void;
  luaChon: { nguon: LuaChon; phanKhuc: LuaChon; nganh: LuaChon };
  xemLead: boolean;
  xemLienHe: boolean;
  dsPhanKhuc?: PhanKhucChon[];
  xemPhanKhuc?: boolean;
  chiDoc?: boolean;
}) {
  const { goi, dangGui, loi } = useGoiApi();
  const [kq, datKq] = useState<XemTruoc | null>(null);
  const doi = (t: Partial<ThamSoLoc>) => {
    datKq(null);
    khiDoi({ ...giaTri, ...t });
  };
  const bat = (ds: string[], ma: string, co: boolean) => (co ? [...ds, ma] : ds.filter((x) => x !== ma));

  async function dem() {
    const r = await goi<XemTruoc>("/api/v1/email/nguoi-nhan/xem-truoc", "POST", nguonVaThamSo(giaTri));
    if (r) datKq(r);
  }

  const nhomChon = (nhan: string, ds: LuaChon, chon: string[], khoa: keyof ThamSoLoc) =>
    ds.length > 0 && (
      <fieldset className="truong ca-dong" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="nho" style={{ fontWeight: 600, marginBottom: 4 }}>
          {nhan} <span className="phu">(không chọn = tất cả)</span>
        </legend>
        <div className="chuoi-lua-chon" style={{ gap: "4px 16px" }}>
          {ds.map((x) => (
            <label key={x.ma} className="nho" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" disabled={chiDoc} checked={chon.includes(x.ma)} onChange={(e) => doi({ [khoa]: bat(chon, x.ma, e.target.checked) })} />
              {x.ten}
            </label>
          ))}
        </div>
      </fieldset>
    );

  return (
    <div>
      <div className="luoi-form">
        <div className="truong">
          <label htmlFor="nn-doi-tuong">Gửi tới</label>
          <select id="nn-doi-tuong" disabled={chiDoc} value={giaTri.doiTuong} onChange={(e) => doi({ doiTuong: e.target.value as ThamSoLoc["doiTuong"] })}>
            <option value="lead" disabled={!xemLead}>
              Lead{!xemLead ? " (cần quyền xem CRM)" : ""}
            </option>
            <option value="lien-he" disabled={!xemLienHe}>
              Liên hệ của khách hàng{!xemLienHe ? " (cần quyền xem khách hàng)" : ""}
            </option>
            <option value="phan-khuc" disabled={!xemPhanKhuc}>
              Phân khúc marketing{!xemPhanKhuc ? " (cần quyền sửa Marketing)" : ""}
            </option>
          </select>
        </div>
        {giaTri.doiTuong === "phan-khuc" && (
          <div className="truong">
            <label htmlFor="nn-phan-khuc">Phân khúc</label>
            <select
              id="nn-phan-khuc"
              disabled={chiDoc}
              value={giaTri.phanKhucId ?? ""}
              onChange={(e) => {
                const p = dsPhanKhuc.find((x) => x.id === e.target.value);
                doi({ phanKhucId: e.target.value, tenPhanKhuc: p?.ten ?? "" });
              }}
            >
              <option value="">— Chọn phân khúc —</option>
              {dsPhanKhuc.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ten} ({p.doiTuong === "lead" ? "lead" : "liên hệ khách"})
                </option>
              ))}
            </select>
            <span className="goi-y">Chỉ gửi người đã đồng ý nhận tin và chưa từ chối. Sửa điều kiện ở Marketing → Phân khúc.</span>
          </div>
        )}
        {giaTri.doiTuong === "lead" &&
          nhomChon(
            "Giai đoạn lead",
            ["NEW_LEAD", "CONTACTED", "QUALIFIED", "DISQUALIFIED"].map((g) => ({ ma: g, ten: NHAN_GIAI_DOAN[g] })),
            giaTri.giaiDoan,
            "giaiDoan",
          )}
        {giaTri.doiTuong !== "phan-khuc" && nhomChon("Nguồn", luaChon.nguon, giaTri.nguon, "nguon")}
        {giaTri.doiTuong === "lien-he" && nhomChon("Phân khúc khách", luaChon.phanKhuc, giaTri.phanKhuc, "phanKhuc")}
        {giaTri.doiTuong === "lien-he" && nhomChon("Ngành nghề khách", luaChon.nganh, giaTri.nganh, "nganh")}
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="nut" onClick={dem} disabled={dangGui}>
          {dangGui ? "Đang đếm…" : "Xem trước số người nhận"}
        </button>
      </div>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ marginTop: 12 }}>
          {loi.thongBao}
        </div>
      )}
      {kq && (
        <div style={{ marginTop: 12 }}>
          <p>
            <strong>{kq.hopLe}</strong> người sẽ nhận thư (lọc ra {kq.tong}).{" "}
            {kq.biLoai.map((b) => (
              <span key={b.lyDo} className="huy-hieu" style={{ marginRight: 6 }}>
                {b.nhan}: {b.so}
              </span>
            ))}
          </p>
          {kq.mau.length > 0 && (
            <table className="bang nho">
              <tbody>
                {kq.mau.map((m, i) => (
                  <tr key={i}>
                    <td>{m.ten}</td>
                    <td className="an-tren-dt">{m.congTy ?? "—"}</td>
                    <td>{m.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {kq.hopLe > kq.mau.length && <p className="phu nho">Hiện {kq.mau.length} người đầu tiên.</p>}
        </div>
      )}
    </div>
  );
}
