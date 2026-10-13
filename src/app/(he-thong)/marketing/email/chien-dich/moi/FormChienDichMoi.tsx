"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChonNguoiNhan from "@/components/email/ChonNguoiNhan";
import { nguonVaThamSo, type PhanKhucChon, type ThamSoLoc } from "@/components/email/tham-so-nguoi-nhan";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

type LuaChon = { ma: string; ten: string }[];

export default function FormChienDichMoi({
  mau,
  luaChon,
  xemLead,
  xemLienHe,
  dsPhanKhuc,
  xemPhanKhuc,
}: {
  mau: { id: string; ten: string }[];
  luaChon: { nguon: LuaChon; phanKhuc: LuaChon; nganh: LuaChon };
  xemLead: boolean;
  xemLienHe: boolean;
  dsPhanKhuc: PhanKhucChon[];
  xemPhanKhuc: boolean;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ten, datTen] = useState("");
  const [mauId, datMauId] = useState(mau[0]?.id ?? "");
  const [thamSo, datThamSo] = useState<ThamSoLoc>({ doiTuong: xemLead ? "lead" : xemLienHe ? "lien-he" : "phan-khuc", giaiDoan: [], nguon: [], phanKhuc: [], nganh: [] });

  async function tao(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/email/chien-dich", "POST", { ten, mauId, ...nguonVaThamSo(thamSo) });
    if (kq) router.push(`/marketing/email/chien-dich/${kq.id}`);
  }

  return (
    <form className="the" onSubmit={tao}>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
          {loi.thongBao}
        </div>
      )}
      <div className="phan-form">
        <h3>Chiến dịch</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="cd-ten">Tên đợt gửi</label>
            <input type="text" id="cd-ten" value={ten} maxLength={255} onChange={(e) => datTen(e.target.value)} placeholder="Ưu đãi máy chủ tháng 10" required />
            {loiCua(loi, "ten") && <span className="chu-loi">{loiCua(loi, "ten")}</span>}
          </div>
          <div className="truong">
            <label htmlFor="cd-mau">Mẫu email</label>
            <select id="cd-mau" value={mauId} onChange={(e) => datMauId(e.target.value)}>
              {mau.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ten}
                </option>
              ))}
            </select>
            <span className="goi-y">Nội dung được chép sang chiến dịch; sửa thêm được khi còn Nháp.</span>
          </div>
        </div>
      </div>
      <div className="phan-form">
        <h3>Người nhận</h3>
        <ChonNguoiNhan giaTri={thamSo} khiDoi={datThamSo} luaChon={luaChon} xemLead={xemLead} xemLienHe={xemLienHe} dsPhanKhuc={dsPhanKhuc} xemPhanKhuc={xemPhanKhuc} />
      </div>
      <div className="chan-form">
        <button type="submit" className="nut chinh" disabled={dangGui || !mauId}>
          {dangGui ? "Đang lập…" : "Lập đợt gửi (Nháp)"}
        </button>
      </div>
    </form>
  );
}
