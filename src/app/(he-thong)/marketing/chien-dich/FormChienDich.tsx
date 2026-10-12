"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ONhapTien from "@/components/crm/ONhapTien";
import { KENH_MARKETING, NHAN_KENH } from "@/modules/marketing/hang-so";

export interface GiaTriChienDich {
  id?: string;
  ten: string;
  kenh: string;
  utmCampaign: string;
  ngayBatDau: string;
  ngayKetThuc: string;
  nganSach: string;
  mucTieuLead: string;
  nguoiPhuTrachId: string;
  ghiChu: string;
}

function Loi({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

export default function FormChienDich({
  banDau,
  nguoiPhuTrach,
  nganSachDaDuyet,
}: {
  banDau: GiaTriChienDich;
  nguoiPhuTrach: { id: string; fullName: string }[];
  nganSachDaDuyet?: string | null;
}) {
  const router = useRouter();
  const laMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState(banDau);
  const dat = (k: keyof GiaTriChienDich, v: string) => datGt((c) => ({ ...c, [k]: v }));

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = { ...gt, id: undefined, mucTieuLead: gt.mucTieuLead || null, utmCampaign: gt.utmCampaign || null, nganSach: gt.nganSach || "0" };
    const kq = await goi<{ id: string }>(laMoi ? "/api/v1/marketing/chien-dich" : `/api/v1/marketing/chien-dich/${banDau.id}`, laMoi ? "POST" : "PATCH", than);
    if (kq) router.push(`/marketing/chien-dich/${laMoi ? kq.id : banDau.id}`);
  }

  const aria = (t: string) => (loiCua(loi, t) ? { "aria-invalid": true as const } : {});
  return (
    <form className="the" onSubmit={gui} noValidate>
      <div className="phan-form">
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="cd-ten">
              Tên chiến dịch <span className="bat-buoc">*</span>
            </label>
            <input id="cd-ten" type="text" value={gt.ten} onChange={(e) => dat("ten", e.target.value)} {...aria("ten")} />
            <Loi loi={loi} truong="ten" />
          </div>
          <div className="truong">
            <label htmlFor="cd-kenh">Kênh</label>
            <select id="cd-kenh" value={gt.kenh} onChange={(e) => dat("kenh", e.target.value)}>
              {KENH_MARKETING.map((k) => (
                <option key={k} value={k}>
                  {NHAN_KENH[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="cd-utm">Mã utm_campaign</label>
            <input id="cd-utm" type="text" value={gt.utmCampaign} onChange={(e) => dat("utmCampaign", e.target.value)} placeholder="vd: camera-tet-2027" {...aria("utmCampaign")} />
            <span className="goi-y">Lead đến từ đường dẫn có utm_campaign này tự gắn vào chiến dịch.</span>
            <Loi loi={loi} truong="utmCampaign" />
          </div>
          <div className="truong">
            <label htmlFor="cd-bd">Ngày bắt đầu</label>
            <input id="cd-bd" type="date" value={gt.ngayBatDau} onChange={(e) => dat("ngayBatDau", e.target.value)} />
          </div>
          <div className="truong">
            <label htmlFor="cd-kt">Ngày kết thúc</label>
            <input id="cd-kt" type="date" value={gt.ngayKetThuc} onChange={(e) => dat("ngayKetThuc", e.target.value)} {...aria("ngayKetThuc")} />
            <Loi loi={loi} truong="ngayKetThuc" />
          </div>
          <div className="truong">
            <label htmlFor="cd-ns">Ngân sách</label>
            <ONhapTien id="cd-ns" giaTri={gt.nganSach} datGiaTri={(v) => dat("nganSach", v)} />
            <span className="goi-y">
              Lớn hơn 0 thì phải được duyệt trước khi chạy.
              {nganSachDaDuyet ? ` Đã duyệt tới ${nganSachDaDuyet} ₫ — vượt mức này phải duyệt lại.` : ""}
            </span>
            <Loi loi={loi} truong="nganSach" />
          </div>
          <div className="truong">
            <label htmlFor="cd-mt">Mục tiêu số lead</label>
            <input id="cd-mt" type="number" min={0} value={gt.mucTieuLead} onChange={(e) => dat("mucTieuLead", e.target.value)} />
          </div>
          <div className="truong">
            <label htmlFor="cd-pt">Người phụ trách</label>
            <select id="cd-pt" value={gt.nguoiPhuTrachId} onChange={(e) => dat("nguoiPhuTrachId", e.target.value)} {...aria("nguoiPhuTrachId")}>
              {nguoiPhuTrach.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
            <Loi loi={loi} truong="nguoiPhuTrachId" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="cd-gc">Ghi chú</label>
            <textarea id="cd-gc" rows={3} value={gt.ghiChu} onChange={(e) => dat("ghiChu", e.target.value)} />
          </div>
        </div>
      </div>
      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.back()}>
          Hủy
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || gt.ten.trim().length < 3}>
          {dangGui ? "Đang lưu…" : laMoi ? "Tạo chiến dịch" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
