"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChonNguoiNhan, { type ThamSoLoc } from "@/components/email/ChonNguoiNhan";
import SoanThu from "@/components/email/SoanThu";
import { useGoiApi } from "@/components/ui/goi-api";
import type { Khoi } from "@/modules/email/tinh-toan";

type LuaChon = { ma: string; ten: string }[];

/** Sửa chiến dịch khi còn Nháp: tên, nội dung, người nhận. */
export default function SuaNhap({
  id,
  ten: tenDau,
  tieuDe: tieuDeDau,
  khoi: khoiDau,
  thamSo: thamSoDau,
  luaChon,
  xemLead,
  xemLienHe,
  emailCuaToi,
  duocGuiThu,
}: {
  id: string;
  ten: string;
  tieuDe: string;
  khoi: Khoi[];
  thamSo: ThamSoLoc;
  luaChon: { nguon: LuaChon; phanKhuc: LuaChon; nganh: LuaChon };
  xemLead: boolean;
  xemLienHe: boolean;
  emailCuaToi: string;
  duocGuiThu: boolean;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ten, datTen] = useState(tenDau);
  const [tieuDe, datTieuDe] = useState(tieuDeDau);
  const [khoi, datKhoi] = useState(khoiDau);
  const [thamSo, datThamSo] = useState(thamSoDau);
  const [daLuu, datDaLuu] = useState(false);

  async function luu() {
    datDaLuu(false);
    if (await goi(`/api/v1/email/chien-dich/${id}`, "PATCH", { ten, tieuDe, khoi, nguon: "loc-don-gian", thamSo })) {
      datDaLuu(true);
      router.refresh();
    }
  }

  return (
    <>
      <section className="the" style={{ marginBottom: 16 }}>
        {loi && (
          <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
            {loi.thongBao}
          </div>
        )}
        {daLuu && (
          <div className="hop-thong-bao tot" role="status" style={{ margin: 16 }}>
            Đã lưu. Gửi duyệt khi sẵn sàng.
          </div>
        )}
        <div className="phan-form">
          <div className="truong">
            <label htmlFor="sn-ten">Tên chiến dịch</label>
            <input type="text" id="sn-ten" value={ten} maxLength={255} onChange={(e) => (datDaLuu(false), datTen(e.target.value))} />
          </div>
        </div>
        <div className="phan-form">
          <h3>Người nhận</h3>
          <ChonNguoiNhan giaTri={thamSo} khiDoi={(t) => (datDaLuu(false), datThamSo(t))} luaChon={luaChon} xemLead={xemLead} xemLienHe={xemLienHe} />
        </div>
        <div className="chan-form">
          <button type="button" className="nut chinh" disabled={dangGui} onClick={luu}>
            {dangGui ? "Đang lưu…" : "Lưu nháp"}
          </button>
        </div>
      </section>
      <SoanThu
        tieuDe={tieuDe}
        khoi={khoi}
        khiDoi={(t, k) => {
          datDaLuu(false);
          datTieuDe(t);
          datKhoi(k);
        }}
        duocGuiThu={duocGuiThu}
        emailCuaToi={emailCuaToi}
      />
    </>
  );
}
