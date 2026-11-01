"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

type Loai = "nghi-phep" | "tang-ca" | "giai-trinh";
const TIEU_DE: Record<Loai, string> = { "nghi-phep": "Xin nghỉ", "tang-ca": "Xin tăng ca", "giai-trinh": "Giải trình / xin chấm bù" };

/** Ba nút tạo đơn: nghỉ phép (NS-33), tăng ca (NS-40), giải trình / chấm bù (NS-20). */
export default function TaoDon({ loaiNghi }: { loaiNghi: { id: string; ten: string; truPhepNam: boolean }[] }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [loai, datLoai] = useState<Loai>("nghi-phep");
  const [canhBao, datCanhBao] = useState<string[]>([]);
  const [f, datF] = useState<Record<string, string | boolean>>({});
  const doi = (k: string, v: string | boolean) => datF((x) => ({ ...x, [k]: v }));

  function mo(l: Loai) {
    datLoai(l);
    datLoi(null);
    datCanhBao([]);
    datF(l === "nghi-phep" ? { loaiNghiId: loaiNghi[0]?.id ?? "", phan: "ca-ngay" } : l === "giai-trinh" ? { huong: "vao", sangHomSau: false } : {});
    hop.current?.showModal();
  }

  async function gui() {
    const url = loai === "nghi-phep" ? "/api/v1/cham-cong/nghi-phep" : loai === "tang-ca" ? "/api/v1/cham-cong/tang-ca" : "/api/v1/cham-cong/giai-trinh";
    const than =
      loai === "nghi-phep"
        ? { loaiNghiId: f.loaiNghiId, tuNgay: f.tuNgay, denNgay: f.phan === "ca-ngay" ? f.denNgay || f.tuNgay : f.tuNgay, phan: f.phan, lyDo: f.lyDo ?? "" }
        : loai === "tang-ca"
          ? { ngay: f.ngay, soGio: Number(f.soGio), lyDo: f.lyDo ?? "" }
          : { ngay: f.ngay, gio: f.gio, sangHomSau: Boolean(f.sangHomSau), huong: f.huong, lyDo: f.lyDo ?? "" };
    const kq = await goi<{ canhBao?: string[] }>(url, "POST", than);
    if (!kq) return;
    if (kq.canhBao?.length) {
      datCanhBao(kq.canhBao);
      router.refresh();
      return;
    }
    hop.current?.close();
    router.refresh();
  }

  const o = (k: string, nhan: string, kieu = "text", them: Record<string, unknown> = {}) => (
    <div className="truong">
      <label htmlFor={`dt-${k}`}>{nhan}</label>
      <input id={`dt-${k}`} type={kieu} value={String(f[k] ?? "")} onChange={(e) => doi(k, e.target.value)} {...them} />
      {loiCua(loi, k) && <span className="loi-truong">{loiCua(loi, k)}</span>}
    </div>
  );

  return (
    <>
      <button type="button" className="nut chinh" onClick={() => mo("nghi-phep")}>Xin nghỉ</button>
      <button type="button" className="nut" onClick={() => mo("tang-ca")}>Xin tăng ca</button>
      <button type="button" className="nut" onClick={() => mo("giai-trinh")}>Giải trình / chấm bù</button>
      <HopThoai ref={hop} tieuDe={TIEU_DE[loai]} rong={520}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          {canhBao.length > 0 && (
            <div className="hop-thong-bao canh-bao" role="status">
              Đã gửi đơn. Lưu ý: {canhBao.join(" ")}
            </div>
          )}
          {loai === "nghi-phep" && (
            <>
              <div className="truong">
                <label htmlFor="dt-loai">Loại nghỉ</label>
                <select id="dt-loai" value={String(f.loaiNghiId ?? "")} onChange={(e) => doi("loaiNghiId", e.target.value)}>
                  {loaiNghi.map((l) => <option key={l.id} value={l.id}>{l.ten}{l.truPhepNam ? " (trừ phép năm)" : ""}</option>)}
                </select>
              </div>
              <div className="truong">
                <label htmlFor="dt-phan">Thời lượng</label>
                <select id="dt-phan" value={String(f.phan)} onChange={(e) => doi("phan", e.target.value)}>
                  <option value="ca-ngay">Cả ngày (một hoặc nhiều ngày)</option>
                  <option value="sang">Nửa ngày buổi sáng</option>
                  <option value="chieu">Nửa ngày buổi chiều</option>
                </select>
              </div>
              <div className="luoi-form">
                {o("tuNgay", f.phan === "ca-ngay" ? "Từ ngày" : "Ngày", "date")}
                {f.phan === "ca-ngay" && o("denNgay", "Đến ngày", "date")}
              </div>
              <p className="phu nho" style={{ marginTop: 0 }}>Ngày nghỉ hằng tuần và ngày lễ trong khoảng không bị tính.</p>
            </>
          )}
          {loai === "tang-ca" && (
            <div className="luoi-form">
              {o("ngay", "Ngày", "date")}
              {o("soGio", "Số giờ dự kiến", "number", { min: 0.25, max: 24, step: 0.25 })}
            </div>
          )}
          {loai === "giai-trinh" && (
            <>
              <div className="luoi-form">
                {o("ngay", "Ngày công", "date")}
                {o("gio", "Giờ chấm đúng ra", "time")}
              </div>
              <div className="truong">
                <label htmlFor="dt-huong">Chấm</label>
                <select id="dt-huong" value={String(f.huong)} onChange={(e) => doi("huong", e.target.value)}>
                  <option value="vao">Giờ vào</option>
                  <option value="ra">Giờ ra</option>
                </select>
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <input type="checkbox" checked={Boolean(f.sangHomSau)} onChange={(e) => doi("sangHomSau", e.target.checked)} />
                Giờ này thuộc sáng hôm sau (ca qua đêm)
              </label>
            </>
          )}
          <div className="truong">
            <label htmlFor="dt-lydo">Lý do <span className="bat-buoc">*</span></label>
            <textarea id="dt-lydo" rows={3} value={String(f.lyDo ?? "")} onChange={(e) => doi("lyDo", e.target.value)} />
            {loiCua(loi, "lyDo") && <span className="loi-truong">{loiCua(loi, "lyDo")}</span>}
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          {canhBao.length === 0 && (
            <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang gửi…" : "Gửi đơn"}</button>
          )}
        </div>
      </HopThoai>
    </>
  );
}
