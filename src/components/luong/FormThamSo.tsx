"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Nhập bộ tham số lương MỚI có hiệu lực từ ngày (LU-13). Điền sẵn giá trị bộ hiện hành; ô số, ô chọn và bảng bậc
 * (biểu thuế, bậc hoa hồng) dựng theo đúng cấu trúc của bộ. Không sửa bộ cũ — lịch sử giữ nguyên. Kiểm tra thật
 * (lược đồ theo loại, bậc tăng dần…) ở máy chủ.
 */

type GiaTri = number | string | boolean | null | GiaTri[] | { [k: string]: GiaTri };

const NHAN: Record<string, string> = {
  nld: "Người lao động đóng (% lương đóng BH)",
  dn: "Doanh nghiệp đóng (% lương đóng BH)",
  bhxh: "BHXH (%)",
  bhyt: "BHYT (%)",
  bhtn: "BHTN (%)",
  kpcd: "Kinh phí công đoàn (%)",
  luongCoSo: "Lương cơ sở (đồng)",
  tranLanLuongCoSo: "Trần BHXH / BHYT = số lần lương cơ sở (lần)",
  tranLanToiThieuVung: "Trần BHTN = số lần lương tối thiểu vùng (lần)",
  ngayNghiKhongDong: "Nghỉ không lương từ ngần này ngày làm việc thì không đóng BH (ngày)",
  vung: "Vùng của doanh nghiệp (1 – 4)",
  mucVung: "Mức lương tối thiểu tháng theo vùng (đồng)",
  "1": "Vùng I (đồng / tháng)",
  "2": "Vùng II (đồng / tháng)",
  "3": "Vùng III (đồng / tháng)",
  "4": "Vùng IV (đồng / tháng)",
  banThan: "Giảm trừ bản thân (đồng / tháng)",
  nguoiPhuThuoc: "Giảm trừ mỗi người phụ thuộc (đồng / tháng)",
  bac: "Các bậc",
  den: "Thu nhập tính thuế / tháng đến (đồng; trống = bậc cuối)",
  tu: "Doanh số thu trong tháng từ (đồng)",
  tyLe: "Tỷ lệ (%)",
  nguong: "Khấu trừ khi trả từ (đồng)",
  tyLeToiThieu: "Lương thử việc tối thiểu (% lương của công việc)",
  thuong: "Ngày thường, ban ngày (% lương giờ)",
  thuongDem: "Ngày thường, ban đêm (% lương giờ)",
  nghiTuan: "Nghỉ hằng tuần, ban ngày (% lương giờ)",
  nghiTuanDem: "Nghỉ hằng tuần, ban đêm (% lương giờ)",
  le: "Ngày lễ, ban ngày (% lương giờ)",
  leDem: "Ngày lễ, ban đêm (% lương giờ)",
  phanVuotMienThue: "Phần tiền tăng ca cao hơn giờ bình thường không chịu thuế",
  kieu: "Kiểu",
};

function datTheoDuong(goc: GiaTri, duong: (string | number)[], v: GiaTri): GiaTri {
  if (duong.length === 0) return v;
  const [k, ...con] = duong;
  if (Array.isArray(goc)) {
    const m = [...goc];
    m[k as number] = datTheoDuong(m[k as number], con, v);
    return m;
  }
  const o = { ...(goc as Record<string, GiaTri>) };
  o[k as string] = datTheoDuong(o[k as string], con, v);
  return o;
}

export default function FormThamSo({ loai, nhanLoai, giaTriDau, homNay }: { loai: string; nhanLoai: string; giaTriDau: GiaTri; homNay: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [gt, datGt] = useState<GiaTri>(giaTriDau);
  const [hieuLuc, datHieuLuc] = useState(homNay);
  const [ghiChu, datGhiChu] = useState("");
  // Chế độ JSON nâng cao (QĐ-167): chỉ khi cần dán nguyên bộ; mặc định là biểu mẫu từng ô.
  const [cheDoJson, datCheDoJson] = useState(false);
  const [vanBanJson, datVanBanJson] = useState("");
  const doi = (duong: (string | number)[], v: GiaTri) => datGt((x) => datTheoDuong(x, duong, v));

  function mo() {
    datGt(JSON.parse(JSON.stringify(giaTriDau)));
    datHieuLuc(homNay);
    datGhiChu("");
    datCheDoJson(false);
    datLoi(null);
    hop.current?.showModal();
  }

  function o(k: string, v: GiaTri, duong: (string | number)[]): React.ReactNode {
    const id = `ts-${loai}-${duong.join("-")}`;
    if (typeof v === "boolean") {
      return (
        <div key={id} className="truong ca-dong">
          <label style={{ display: "flex", gap: 8 }}><input id={id} type="checkbox" checked={v} onChange={(e) => doi(duong, e.target.checked)} /> {NHAN[k] ?? k}</label>
        </div>
      );
    }
    if (k === "kieu") {
      return (
        <div key={id} className="truong">
          <label htmlFor={id}>{NHAN[k]}</label>
          <select id={id} value={String(v)} onChange={(e) => doi(duong, e.target.value)}>
            <option value="phang">Phẳng (một tỷ lệ)</option>
            <option value="bac-thang">Bậc thang theo doanh số thu</option>
          </select>
        </div>
      );
    }
    if (Array.isArray(v)) {
      const cot = k === "bac" ? (loai === "bieu-thue" ? ["den", "tyLe"] : ["tu", "tyLe"]) : Object.keys((v[0] as Record<string, GiaTri>) ?? {});
      return (
        <div key={id} className="truong ca-dong">
          <label>{NHAN[k] ?? k}</label>
          <table className="bang">
            <thead><tr>{cot.map((c) => <th key={c}>{NHAN[c] ?? c}</th>)}<th /></tr></thead>
            <tbody>
              {v.map((dong, i) => (
                <tr key={i}>
                  {cot.map((c) => {
                    const x = (dong as Record<string, GiaTri>)[c];
                    return (
                      <td key={c}>
                        <input inputMode="decimal" value={x === null || x === undefined ? "" : String(x)} onChange={(e) => doi([...duong, i, c], e.target.value === "" ? (c === "den" ? null : 0) : Number(e.target.value.replace(/\./g, "").replace(",", ".")))} />
                      </td>
                    );
                  })}
                  <td><button type="button" className="nut nho" onClick={() => doi(duong, v.filter((_, j) => j !== i))}>Bỏ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="nut nho" onClick={() => doi(duong, [...v, Object.fromEntries(cot.map((c) => [c, c === "den" ? null : 0]))])}>+ Thêm bậc</button>
        </div>
      );
    }
    if (v !== null && typeof v === "object") {
      return (
        <fieldset key={id} className="truong ca-dong" style={{ border: "1px solid var(--vien)", borderRadius: 6, padding: 8 }}>
          <legend>{NHAN[k] ?? k}</legend>
          <div className="luoi-form">{Object.entries(v).map(([k2, v2]) => o(k2, v2, [...duong, k2]))}</div>
        </fieldset>
      );
    }
    return (
      <div key={id} className="truong">
        <label htmlFor={id}>{NHAN[k] ?? k}</label>
        <input id={id} inputMode="decimal" value={v === null ? "" : String(v)} onChange={(e) => doi(duong, e.target.value === "" ? 0 : Number(e.target.value.replace(/\./g, "").replace(",", ".")))} />
      </div>
    );
  }

  function doiCheDo() {
    if (!cheDoJson) {
      datVanBanJson(JSON.stringify(gt, null, 2));
      datCheDoJson(true);
      return;
    }
    try {
      datGt(JSON.parse(vanBanJson) as GiaTri);
      datCheDoJson(false);
      datLoi(null);
    } catch {
      datLoi({ thongBao: "JSON chưa hợp lệ — sửa lại hoặc bấm “Đóng” để bỏ.", loiTruong: {}, status: 400 });
    }
  }

  async function luu() {
    let giaTri: GiaTri = gt;
    if (cheDoJson) {
      try {
        giaTri = JSON.parse(vanBanJson) as GiaTri;
      } catch {
        datLoi({ thongBao: "JSON chưa hợp lệ.", loiTruong: {}, status: 400 });
        return;
      }
    }
    if (await goi("/api/v1/luong/tham-so", "POST", { loai, hieuLucTu: hieuLuc, giaTri, ghiChu })) {
      hop.current?.close();
      router.refresh();
    }
  }

  return (
    <>
      <button type="button" className="nut" onClick={mo}>Nhập bộ mới</button>
      <HopThoai ref={hop} tieuDe={`Bộ mới — ${nhanLoai}`} rong={680}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <p className="goi-y">Số ghi không dấu chấm phân cách cũng được (15500000). Tỷ lệ ghi theo phần trăm (8 = 8%, 17,5 = 17,5%).</p>
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor={`ts-${loai}-hl`}>Hiệu lực từ ngày</label>
              <input id={`ts-${loai}-hl`} type="date" value={hieuLuc} onChange={(e) => datHieuLuc(e.target.value)} />
            </div>
            {cheDoJson ? (
              <div className="truong ca-dong">
                <label htmlFor={`ts-${loai}-json`}>Giá trị dạng JSON (nâng cao)</label>
                <textarea id={`ts-${loai}-json`} rows={12} style={{ fontFamily: "monospace", fontSize: 12 }} value={vanBanJson} onChange={(e) => datVanBanJson(e.target.value)} />
              </div>
            ) : gt !== null && typeof gt === "object" && !Array.isArray(gt) ? Object.entries(gt).map(([k, v]) => o(k, v, [k])) : null}
            <div className="truong ca-dong">
              <label htmlFor={`ts-${loai}-gc`}>Căn cứ (số văn bản, ngày ban hành) <span className="bat-buoc">*</span></label>
              <textarea id={`ts-${loai}-gc`} rows={2} value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut trong" onClick={doiCheDo} disabled={dangGui}>{cheDoJson ? "Về biểu mẫu" : "Chế độ JSON nâng cao"}</button>
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={luu} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu bộ mới"}</button>
        </div>
      </HopThoai>
    </>
  );
}
