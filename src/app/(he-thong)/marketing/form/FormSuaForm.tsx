"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { DS_KHOA_TRUONG_FORM, TRUONG_FORM, type KhoaTruongForm } from "@/modules/marketing/hang-so";

export interface GiaTriForm {
  id?: string;
  ten: string;
  slug: string;
  tieuDe: string;
  gioiThieu: string;
  truong: { khoa: KhoaTruongForm; nhan: string; batBuoc: boolean }[];
  nutGui: string;
  loiCamOn: string;
  cauDongY: string;
  chienDichId: string;
  nguon: string;
  trangThai: "hoat-dong" | "tat";
}

/** Dựng form đăng ký: chọn trường từ danh mục an toàn (MK-11), không có ô HTML tự do. */
export default function FormSuaForm({
  banDau,
  chienDich,
  nguon,
}: {
  banDau: GiaTriForm;
  chienDich: { id: string; ma: string; ten: string }[];
  nguon: { ma: string; ten: string }[];
}) {
  const router = useRouter();
  const laMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState(banDau);
  const [daLuu, datDaLuu] = useState(false);
  const dat = <K extends keyof GiaTriForm>(k: K, v: GiaTriForm[K]) => {
    datGt((c) => ({ ...c, [k]: v }));
    datDaLuu(false);
  };
  const coTruong = (k: KhoaTruongForm) => gt.truong.find((t) => t.khoa === k);
  const batTat = (k: KhoaTruongForm, bat: boolean) =>
    dat("truong", bat ? [...gt.truong, { khoa: k, nhan: TRUONG_FORM[k].nhan, batBuoc: false }] : gt.truong.filter((t) => t.khoa !== k));
  const suaTruong = (k: KhoaTruongForm, d: Partial<{ nhan: string; batBuoc: boolean }>) => dat("truong", gt.truong.map((t) => (t.khoa === k ? { ...t, ...d } : t)));

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = { ...gt, id: undefined, slug: gt.slug || null, chienDichId: gt.chienDichId || null, nguon: gt.nguon || null };
    const kq = await goi<{ id: string }>(laMoi ? "/api/v1/marketing/form" : `/api/v1/marketing/form/${banDau.id}`, laMoi ? "POST" : "PATCH", than);
    if (kq) {
      if (laMoi) router.push(`/marketing/form/${kq.id}`);
      else {
        datDaLuu(true);
        router.refresh();
      }
    }
  }

  const o = (k: "ten" | "slug" | "tieuDe" | "nutGui", nhan: string, goiY?: string) => (
    <div className="truong">
      <label htmlFor={`fm-${k}`}>{nhan}</label>
      <input id={`fm-${k}`} type="text" value={gt[k]} onChange={(e) => dat(k, e.target.value)} aria-invalid={loiCua(loi, k) ? true : undefined} />
      {goiY && <span className="goi-y">{goiY}</span>}
      {loiCua(loi, k) && <span className="loi-truong">{loiCua(loi, k)}</span>}
    </div>
  );

  return (
    <form className="the" onSubmit={gui} noValidate>
      <div className="phan-form">
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}{loiCua(loi, "truong") ? ` — ${loiCua(loi, "truong")}` : ""}</div>}
        {daLuu && <div className="hop-thong-bao tot" role="status">Đã lưu form.</div>}
        <div className="luoi-form">
          {o("ten", "Tên form (nội bộ)")}
          {o("slug", "Đường dẫn", "Bỏ trống để tự tạo từ tên. Đổi đường dẫn làm hỏng liên kết cũ.")}
          {o("tieuDe", "Tiêu đề hiện cho khách")}
          {o("nutGui", "Chữ trên nút gửi")}
          <div className="truong ca-dong">
            <label htmlFor="fm-gt">Giới thiệu ngắn</label>
            <textarea id="fm-gt" rows={2} value={gt.gioiThieu} onChange={(e) => dat("gioiThieu", e.target.value)} />
          </div>
        </div>
      </div>
      <div className="phan-form">
        <h3>Trường trên form</h3>
        <p className="goi-y">Chỉ chọn từ danh mục an toàn. Cần Họ tên (hoặc Công ty) và Số điện thoại (hoặc Email).</p>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th>Dùng</th>
                <th>Trường</th>
                <th>Nhãn hiện cho khách</th>
                <th>Bắt buộc</th>
              </tr>
            </thead>
            <tbody>
              {DS_KHOA_TRUONG_FORM.map((k) => {
                const t = coTruong(k);
                return (
                  <tr key={k}>
                    <td>
                      <input type="checkbox" aria-label={`Dùng ${TRUONG_FORM[k].nhan}`} checked={Boolean(t)} onChange={(e) => batTat(k, e.target.checked)} />
                    </td>
                    <td>{TRUONG_FORM[k].nhan}</td>
                    <td>{t && <input type="text" aria-label={`Nhãn ${TRUONG_FORM[k].nhan}`} value={t.nhan} onChange={(e) => suaTruong(k, { nhan: e.target.value })} />}</td>
                    <td>{t && <input type="checkbox" aria-label={`${TRUONG_FORM[k].nhan} bắt buộc`} checked={t.batBuoc} onChange={(e) => suaTruong(k, { batBuoc: e.target.checked })} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="phan-form">
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="fm-dy">Câu hỏi đồng ý nhận tin marketing</label>
            <input id="fm-dy" type="text" value={gt.cauDongY} onChange={(e) => dat("cauDongY", e.target.value)} placeholder="vd: Tôi đồng ý nhận thông tin khuyến mãi qua email / Zalo" />
            <span className="goi-y">Bỏ trống = form không hỏi, và lead KHÔNG được coi là đã đồng ý. Ô tích trên form luôn để trống sẵn.</span>
          </div>
          <div className="truong ca-dong">
            <label htmlFor="fm-ct">Lời cảm ơn sau khi gửi</label>
            <input id="fm-ct" type="text" value={gt.loiCamOn} onChange={(e) => dat("loiCamOn", e.target.value)} />
          </div>
          <div className="truong">
            <label htmlFor="fm-cd">Chiến dịch</label>
            <select id="fm-cd" value={gt.chienDichId} onChange={(e) => dat("chienDichId", e.target.value)}>
              <option value="">— Không gắn —</option>
              {chienDich.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ma} — {c.ten}
                </option>
              ))}
            </select>
            <span className="goi-y">utm_campaign trên đường dẫn khớp chiến dịch khác thì lead theo chiến dịch đó.</span>
          </div>
          <div className="truong">
            <label htmlFor="fm-ng">Nguồn lead</label>
            <select id="fm-ng" value={gt.nguon} onChange={(e) => dat("nguon", e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {nguon.map((n) => (
                <option key={n.ma} value={n.ma}>
                  {n.ten}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="fm-tt">Trạng thái</label>
            <select id="fm-tt" value={gt.trangThai} onChange={(e) => dat("trangThai", e.target.value as GiaTriForm["trangThai"])}>
              <option value="hoat-dong">Đang nhận đăng ký</option>
              <option value="tat">Tắt (đường dẫn trả “không tồn tại”)</option>
            </select>
          </div>
        </div>
      </div>
      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/marketing/form")}>
          Về danh sách
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui}>
          {dangGui ? "Đang lưu…" : laMoi ? "Tạo form" : "Lưu form"}
        </button>
      </div>
    </form>
  );
}
