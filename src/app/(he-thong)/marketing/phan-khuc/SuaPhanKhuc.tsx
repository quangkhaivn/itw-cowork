"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { NHAN_GIAI_DOAN, NHAN_TRANG_THAI_KHACH } from "@/modules/crm/hang-so";
import { NHAN_DOI_TUONG_PHAN_KHUC, NHAN_KENH_NHAN } from "@/modules/marketing/hang-so";

type Mc = { ma: string; ten: string };
export interface LuaChonPhanKhuc {
  nguon: Mc[];
  chienDich: Mc[];
  phanKhuc: Mc[];
  nganh: Mc[];
  loaiKhach: Mc[];
}
export type DieuKien = Record<string, string | string[]>;

interface XemTruoc {
  tong: number;
  nhanDuoc: number;
  tuChoi: number;
  nhanDuocCoEmail: number;
  mau: { id: string; hoTen: string; congTy: string | null; dienThoai: string | null; email: string | null; dongYNhanTin: boolean; tuChoiNhanTin: boolean; daChe: boolean }[];
}

const MAC_DINH_LEAD: DieuKien = { nguon: [], chienDichIds: [], giaiDoan: [], kenhNhan: [], utmSource: "", taoTuNgay: "", taoDenNgay: "", coEmail: "", coDienThoai: "", dongYNhanTin: "" };
const MAC_DINH_LH: DieuKien = { nguon: [], chienDichIds: [], phanKhuc: [], nganh: [], loaiKhach: [], trangThaiKhach: [], tinhThanh: [], coEmail: "", coDienThoai: "", dongYNhanTin: "" };

/**
 * Dựng phân khúc bằng các ô chọn theo danh mục trường cho phép (MK-14) — không có ô nhập
 * biểu thức. Xem trước gọi máy chủ, kết quả đã che theo quyền (MK-15).
 */
export default function SuaPhanKhuc({
  id,
  banDau,
  luaChon,
  duocSua,
}: {
  id?: string;
  banDau: { ten: string; ghiChu: string; doiTuong: "lead" | "lien-he"; dieuKien: DieuKien };
  luaChon: LuaChonPhanKhuc;
  duocSua: boolean;
}) {
  const router = useRouter();
  const luu = useGoiApi();
  const xt = useGoiApi();
  const [ten, datTen] = useState(banDau.ten);
  const [ghiChu, datGhiChu] = useState(banDau.ghiChu);
  const [doiTuong, datDoiTuong] = useState(banDau.doiTuong);
  const [dk, datDk] = useState<DieuKien>({ ...(banDau.doiTuong === "lead" ? MAC_DINH_LEAD : MAC_DINH_LH), ...banDau.dieuKien });
  const [kq, datKq] = useState<XemTruoc | null>(null);

  const ds = (k: string) => (Array.isArray(dk[k]) ? (dk[k] as string[]) : []);
  const bat = (k: string, v: string, on: boolean) => datDk((c) => ({ ...c, [k]: on ? [...ds(k), v] : ds(k).filter((x) => x !== v) }));
  const thanPk = () => {
    const goc = doiTuong === "lead" ? MAC_DINH_LEAD : MAC_DINH_LH;
    return { doiTuong, dieuKien: Object.fromEntries(Object.keys(goc).map((k) => [k, dk[k] ?? goc[k]])) };
  };

  const nhom = (k: string, nhan: string, mucs: Mc[]) =>
    mucs.length > 0 && (
      <fieldset className="truong ca-dong" style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend className="nhan" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
          {nhan} <span className="phu">(không chọn = tất cả)</span>
        </legend>
        <div className="chuoi-lua-chon" style={{ gap: "6px 16px" }}>
          {mucs.map((m) => (
            <label key={m.ma} className="o-chon">
              <input type="checkbox" checked={ds(k).includes(m.ma)} onChange={(e) => bat(k, m.ma, e.target.checked)} disabled={!duocSua} />
              <span>{m.ten}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  const coKhong = (k: string, nhan: string) => (
    <div className="truong">
      <label htmlFor={`pk-${k}`}>{nhan}</label>
      <select id={`pk-${k}`} value={(dk[k] as string) ?? ""} onChange={(e) => datDk((c) => ({ ...c, [k]: e.target.value }))} disabled={!duocSua}>
        <option value="">Không lọc</option>
        <option value="co">Có</option>
        <option value="khong">Không</option>
      </select>
    </div>
  );

  async function xemTruoc() {
    const r = await xt.goi<XemTruoc>("/api/v1/marketing/phan-khuc/xem-truoc", "POST", thanPk());
    if (r) datKq(r);
  }
  async function luuPk(e: React.FormEvent) {
    e.preventDefault();
    const r = await luu.goi<{ id: string }>(id ? `/api/v1/marketing/phan-khuc/${id}` : "/api/v1/marketing/phan-khuc", id ? "PATCH" : "POST", { ten, ghiChu: ghiChu || null, phanKhuc: thanPk() });
    if (r) {
      if (!id) router.push(`/marketing/phan-khuc/${r.id}`);
      else router.refresh();
    }
  }

  return (
    <form className="the" onSubmit={luuPk} noValidate>
      <div className="phan-form">
        {luu.loi && <div className="hop-thong-bao loi" role="alert">{luu.loi.thongBao}</div>}
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="pk-ten">Tên phân khúc</label>
            <input id="pk-ten" type="text" value={ten} onChange={(e) => datTen(e.target.value)} disabled={!duocSua} />
          </div>
          <div className="truong">
            <label htmlFor="pk-dt">Đối tượng</label>
            <select
              id="pk-dt"
              value={doiTuong}
              disabled={!duocSua}
              onChange={(e) => {
                const v = e.target.value as "lead" | "lien-he";
                datDoiTuong(v);
                datDk(v === "lead" ? MAC_DINH_LEAD : MAC_DINH_LH);
                datKq(null);
              }}
            >
              {Object.entries(NHAN_DOI_TUONG_PHAN_KHUC).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="truong ca-dong">
            <label htmlFor="pk-gc">Ghi chú</label>
            <input id="pk-gc" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} disabled={!duocSua} />
          </div>
        </div>
      </div>
      <div className="phan-form">
        <h3>Điều kiện</h3>
        <div className="luoi-form">
          {nhom("nguon", doiTuong === "lead" ? "Nguồn lead" : "Nguồn khách", luaChon.nguon)}
          {nhom("chienDichIds", "Chiến dịch", luaChon.chienDich)}
          {doiTuong === "lead" ? (
            <>
              {nhom("giaiDoan", "Giai đoạn lead", ["NEW_LEAD", "CONTACTED", "QUALIFIED", "DISQUALIFIED", "CONVERTED"].map((g) => ({ ma: g, ten: NHAN_GIAI_DOAN[g] })))}
              {nhom("kenhNhan", "Kênh nhận", Object.entries(NHAN_KENH_NHAN).map(([ma, ten]) => ({ ma, ten })))}
              <div className="truong">
                <label htmlFor="pk-utm">utm_source</label>
                <input id="pk-utm" type="text" value={(dk.utmSource as string) ?? ""} onChange={(e) => datDk((c) => ({ ...c, utmSource: e.target.value }))} disabled={!duocSua} />
              </div>
              <div className="truong">
                <label htmlFor="pk-tu">Tạo từ ngày</label>
                <input id="pk-tu" type="date" value={(dk.taoTuNgay as string) ?? ""} onChange={(e) => datDk((c) => ({ ...c, taoTuNgay: e.target.value }))} disabled={!duocSua} />
              </div>
              <div className="truong">
                <label htmlFor="pk-den">Đến ngày</label>
                <input id="pk-den" type="date" value={(dk.taoDenNgay as string) ?? ""} onChange={(e) => datDk((c) => ({ ...c, taoDenNgay: e.target.value }))} disabled={!duocSua} />
              </div>
            </>
          ) : (
            <>
              {nhom("phanKhuc", "Phân khúc khách", luaChon.phanKhuc)}
              {nhom("nganh", "Ngành", luaChon.nganh)}
              {nhom("loaiKhach", "Loại khách", luaChon.loaiKhach)}
              {nhom("trangThaiKhach", "Trạng thái khách", Object.entries(NHAN_TRANG_THAI_KHACH).map(([ma, ten]) => ({ ma, ten })))}
              <div className="truong ca-dong">
                <label htmlFor="pk-tinh">Tỉnh / thành (cách nhau dấu phẩy)</label>
                <input
                  id="pk-tinh"
                  type="text"
                  value={ds("tinhThanh").join(", ")}
                  onChange={(e) => datDk((c) => ({ ...c, tinhThanh: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                  disabled={!duocSua}
                />
              </div>
            </>
          )}
          {coKhong("coEmail", "Có email")}
          {coKhong("coDienThoai", "Có điện thoại")}
          {coKhong("dongYNhanTin", "Đã đồng ý nhận tin")}
        </div>
      </div>
      <div className="phan-form">
        <div className="hang-nhap" style={{ marginBottom: 12 }}>
          <button type="button" className="nut" onClick={xemTruoc} disabled={xt.dangGui}>
            {xt.dangGui ? "Đang đếm…" : "Xem trước"}
          </button>
        </div>
        {xt.loi && <div className="hop-thong-bao loi" role="alert">{xt.loi.thongBao}</div>}
        {kq && (
          <>
            <p>
              <strong>{kq.tong.toLocaleString("vi-VN")}</strong> người khớp · <strong>{kq.nhanDuoc.toLocaleString("vi-VN")}</strong> nhận được tin (đã đồng ý, chưa từ chối) · {kq.nhanDuocCoEmail.toLocaleString("vi-VN")} trong số đó có email · {kq.tuChoi.toLocaleString("vi-VN")} đã từ chối
            </p>
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Liên lạc</th>
                    <th>Nhận tin</th>
                  </tr>
                </thead>
                <tbody>
                  {kq.mau.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {m.hoTen}
                        {m.congTy && <div className="dong-phu">{m.congTy}</div>}
                      </td>
                      <td>
                        {m.dienThoai ?? "—"}
                        {m.email && <div className="dong-phu">{m.email}</div>}
                      </td>
                      <td>{m.tuChoiNhanTin ? <span className="huy-hieu loi">Đã từ chối</span> : m.dongYNhanTin ? <span className="huy-hieu tot">Đồng ý</span> : <span className="huy-hieu">Chưa hỏi</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {kq.mau.some((m) => m.daChe) && <p className="phu nho">Liên lạc được che theo quyền của bạn (MK-15).</p>}
          </>
        )}
      </div>
      {duocSua && (
        <div className="chan-form">
          <button type="submit" className="nut chinh" disabled={luu.dangGui || ten.trim().length < 3}>
            {luu.dangGui ? "Đang lưu…" : id ? "Lưu phân khúc" : "Tạo phân khúc"}
          </button>
        </div>
      )}
    </form>
  );
}
