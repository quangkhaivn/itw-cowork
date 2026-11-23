"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

export interface ChienDichSua {
  id: string;
  ten: string;
  tuNgay: string | null;
  denNgay: string | null;
  mucTieu: string | null;
  trangThai: string;
  chienDichMarketing: { id: string } | null;
}

/** Tạo / sửa chiến dịch nội dung. Liên kết chiến dịch Marketing chỉ hiện khi người dùng xem được Marketing. */
export default function FormChienDich({ cd, marketing }: { cd?: ChienDichSua; marketing: { id: string; ma: string; ten: string }[] }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ten, datTen] = useState(cd?.ten ?? "");
  const [tuNgay, datTuNgay] = useState(cd?.tuNgay ?? "");
  const [denNgay, datDenNgay] = useState(cd?.denNgay ?? "");
  const [mucTieu, datMucTieu] = useState(cd?.mucTieu ?? "");
  const [mk, datMk] = useState(cd?.chienDichMarketing?.id ?? "");
  const [trangThai, datTrangThai] = useState(cd?.trangThai ?? "hoat-dong");

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    const than = { ten, tuNgay: tuNgay || null, denNgay: denNgay || null, mucTieu: mucTieu || null, ...(marketing.length || !cd ? { chienDichMarketingId: mk || null } : {}), ...(cd ? { trangThai } : {}) };
    if (await goi(cd ? `/api/v1/mang-xa-hoi/chien-dich/${cd.id}` : "/api/v1/mang-xa-hoi/chien-dich", cd ? "PUT" : "POST", than)) {
      if (!cd) { datTen(""); datTuNgay(""); datDenNgay(""); datMucTieu(""); datMk(""); }
      router.refresh();
    }
  }

  return (
    <form onSubmit={luu} style={{ display: "grid", gap: 8 }}>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      <div className="luoi-form">
        <div className="truong"><label htmlFor={`cd-ten-${cd?.id ?? "moi"}`}>Tên chiến dịch <span className="bat-buoc">*</span></label>
          <input id={`cd-ten-${cd?.id ?? "moi"}`} value={ten} maxLength={200} onChange={(e) => datTen(e.target.value)} />
          {loiCua(loi, "ten") && <span className="loi-truong">{loiCua(loi, "ten")}</span>}</div>
        <div className="truong"><label htmlFor={`cd-tu-${cd?.id ?? "moi"}`}>Từ ngày</label><input id={`cd-tu-${cd?.id ?? "moi"}`} type="date" value={tuNgay} onChange={(e) => datTuNgay(e.target.value)} /></div>
        <div className="truong"><label htmlFor={`cd-den-${cd?.id ?? "moi"}`}>Đến ngày</label><input id={`cd-den-${cd?.id ?? "moi"}`} type="date" value={denNgay} onChange={(e) => datDenNgay(e.target.value)} />
          {loiCua(loi, "denNgay") && <span className="loi-truong">{loiCua(loi, "denNgay")}</span>}</div>
        {marketing.length > 0 && (
          <div className="truong"><label htmlFor={`cd-mk-${cd?.id ?? "moi"}`}>Chiến dịch Marketing liên kết</label>
            <select id={`cd-mk-${cd?.id ?? "moi"}`} value={mk} onChange={(e) => datMk(e.target.value)}>
              <option value="">— Không liên kết —</option>
              {marketing.map((m) => <option key={m.id} value={m.id}>{m.ma} — {m.ten}</option>)}
            </select></div>
        )}
        {cd && (
          <div className="truong"><label htmlFor={`cd-tt-${cd.id}`}>Trạng thái</label>
            <select id={`cd-tt-${cd.id}`} value={trangThai} onChange={(e) => datTrangThai(e.target.value)}>
              <option value="hoat-dong">Đang dùng</option><option value="luu-tru">Lưu trữ (không thêm bài mới)</option>
            </select></div>
        )}
        <div className="truong ca-dong"><label htmlFor={`cd-mt-${cd?.id ?? "moi"}`}>Mục tiêu</label>
          <textarea id={`cd-mt-${cd?.id ?? "moi"}`} rows={2} maxLength={2000} value={mucTieu} onChange={(e) => datMucTieu(e.target.value)} placeholder="Ví dụ: 30 tin nhắn hỏi giá laptop văn phòng trong tháng 12" /></div>
      </div>
      <div><button type="submit" className="nut chinh nho" disabled={dangGui || ten.trim().length < 2}>{cd ? "Lưu" : "Tạo chiến dịch"}</button></div>
    </form>
  );
}
