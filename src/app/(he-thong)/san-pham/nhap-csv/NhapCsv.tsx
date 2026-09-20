"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BieuTuong from "@/components/ui/BieuTuong";
import NutXuatCsv from "@/components/crm/NutXuatCsv";
import { useGoiApi } from "@/components/ui/goi-api";

interface DongKetQua {
  soDong: number;
  sku: string;
  viec: "tao" | "sua" | "bo-qua";
  loi?: string;
}
interface KetQuaNhap {
  loai: string;
  tenTep: string;
  ghiThat: boolean;
  tongDong: number;
  soTao: number;
  soSua: number;
  soLoi: number;
  cotLa: string[];
  dong: DongKetQua[];
}

/**
 * Nhập CSV hai bước: đọc tệp ở trình duyệt → gửi lên máy chủ XEM TRƯỚC (không ghi gì)
 * → người dùng đối chiếu bảng kết quả → bấm xác nhận thì mới ghi.
 * Dòng hỏng bị bỏ qua và nêu rõ lý do; dòng tốt vẫn vào.
 */
export default function NhapCsv({ nhaCungCap }: { nhaCungCap: { id: string; ma: string; ten: string }[] }) {
  const router = useRouter();
  const oTep = useRef<HTMLInputElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [loai, datLoai] = useState<"san-pham" | "gia-nha-cung-cap">("san-pham");
  const [nccId, datNccId] = useState("");
  const [tep, datTep] = useState<{ ten: string; noiDung: string } | null>(null);
  const [kq, datKq] = useState<KetQuaNhap | null>(null);
  const [daGhi, datDaGhi] = useState(false);

  async function chonTep(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    datKq(null);
    datDaGhi(false);
    datLoi(null);
    if (!f) return datTep(null);
    datTep({ ten: f.name, noiDung: await f.text() });
  }

  async function chay(ghiThat: boolean) {
    if (!tep) return;
    const r = await goi<KetQuaNhap>("/api/v1/nhap-csv", "POST", {
      tenTep: tep.ten,
      noiDung: tep.noiDung,
      loai,
      nhaCungCapId: loai === "gia-nha-cung-cap" ? nccId : null,
      ghiThat,
    });
    if (r) {
      datKq(r);
      datDaGhi(ghiThat);
      if (ghiThat) router.refresh();
    }
  }

  const chiTiet = (loi?.chiTiet ?? null) as { thieuCot?: string[]; cotLa?: string[] } | null;

  return (
    <section className="the">
      <div className="phan-form">
        <h3>1. Chọn loại dữ liệu</h3>
        <div className="chuoi-lua-chon">
          <label className="o-chon">
            <input
              type="radio"
              name="loai"
              checked={loai === "san-pham"}
              onChange={() => {
                datLoai("san-pham");
                datKq(null);
              }}
            />
            <span>
              Danh mục sản phẩm
              <small>Tạo mới hoặc cập nhật sản phẩm theo SKU.</small>
            </span>
          </label>
          <label className="o-chon">
            <input
              type="radio"
              name="loai"
              checked={loai === "gia-nha-cung-cap"}
              onChange={() => {
                datLoai("gia-nha-cung-cap");
                datKq(null);
              }}
            />
            <span>
              Bảng giá của một nhà cung cấp
              <small>Cập nhật giá mua cho các SKU đã có.</small>
            </span>
          </label>
        </div>
        {loai === "gia-nha-cung-cap" && (
          <div className="truong" style={{ maxWidth: 360, marginTop: 10 }}>
            <label htmlFor="nc-ncc">
              Nhà cung cấp <span className="bat-buoc">*</span>
            </label>
            <select id="nc-ncc" value={nccId} onChange={(e) => datNccId(e.target.value)}>
              <option value="">— Chọn —</option>
              {nhaCungCap.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten} ({n.ma})
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="goi-y" style={{ marginTop: 10 }}>
          Tệp phải là <strong>CSV UTF-8</strong>. Trong Excel: <em>Lưu thành → CSV UTF-8 (dấu phẩy phân cách)</em>. Dấu phân cách <code>,</code> hay <code>;</code> đều đọc được.
        </p>
        <NutXuatCsv url={`/api/v1/nhap-csv/mau?loai=${loai}`} nhan="Tải tệp mẫu" lop="nut nho" />
      </div>

      <div className="phan-form">
        <h3>2. Chọn tệp</h3>
        <input ref={oTep} type="file" accept=".csv,text/csv" onChange={chonTep} aria-label="Tệp CSV" />
        {tep && (
          <p className="phu" style={{ marginTop: 8 }}>
            Đã đọc <strong>{tep.ten}</strong> ({Math.ceil(tep.noiDung.length / 1024)} KB).
          </p>
        )}
      </div>

      {loi && (
        <div className="phan-form">
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
            {chiTiet?.cotLa?.length ? <div className="nho">Cột không hiểu trong tệp: {chiTiet.cotLa.join(", ")}</div> : null}
          </div>
        </div>
      )}

      {kq && (
        <div className="phan-form">
          <h3>3. Kết quả {daGhi ? "đã nhập" : "xem trước"}</h3>
          <div className="luoi-chi-so" style={{ marginBottom: 12 }}>
            <div className="chi-so the">
              <div className="nhan">Tổng dòng</div>
              <div className="gia-tri">{kq.tongDong}</div>
            </div>
            <div className="chi-so the">
              <div className="nhan">{daGhi ? "Đã tạo mới" : "Sẽ tạo mới"}</div>
              <div className="gia-tri">{kq.soTao}</div>
            </div>
            <div className="chi-so the">
              <div className="nhan">{daGhi ? "Đã cập nhật" : "Sẽ cập nhật"}</div>
              <div className="gia-tri">{kq.soSua}</div>
            </div>
            <div className={`chi-so the ${kq.soLoi ? "loi" : ""}`}>
              <div className="nhan">Dòng hỏng (bỏ qua)</div>
              <div className="gia-tri">{kq.soLoi}</div>
            </div>
          </div>
          {kq.cotLa.length > 0 && (
            <div className="hop-thong-bao canh-bao">Cột không hiểu, sẽ bỏ qua: {kq.cotLa.join(", ")}</div>
          )}
          {daGhi && (
            <div className="hop-thong-bao tot" role="status">
              Đã nhập xong. Lịch sử giá và nhật ký kiểm toán đã ghi lại thay đổi.
            </div>
          )}
          <div className="cuon-ngang" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="bang">
              <thead>
                <tr>
                  <th className="so">Dòng</th>
                  <th>SKU</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((d) => (
                  <tr key={d.soDong} className={d.viec === "bo-qua" ? "mo" : undefined}>
                    <td className="so">{d.soDong}</td>
                    <td>{d.sku || <span className="mo">—</span>}</td>
                    <td>
                      {d.viec === "tao" && <span className="huy-hieu tot">{daGhi ? "Đã tạo" : "Sẽ tạo"}</span>}
                      {d.viec === "sua" && <span className="huy-hieu chinh">{daGhi ? "Đã cập nhật" : "Sẽ cập nhật"}</span>}
                      {d.viec === "bo-qua" && (
                        <>
                          <span className="huy-hieu loi">Bỏ qua</span> <span className="phu">{d.loi}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="chan-form">
        <button
          type="button"
          className="nut"
          onClick={() => chay(false)}
          disabled={dangGui || !tep || (loai === "gia-nha-cung-cap" && !nccId)}
        >
          <BieuTuong ten="nhap-csv" co={16} /> {dangGui ? "Đang đọc…" : "Xem trước"}
        </button>
        <button
          type="button"
          className="nut chinh"
          onClick={() => chay(true)}
          disabled={dangGui || !kq || daGhi || kq.soTao + kq.soSua === 0}
          title={!kq ? "Xem trước rồi mới nhập" : undefined}
        >
          {dangGui ? "Đang nhập…" : `Nhập ${kq ? kq.soTao + kq.soSua : 0} dòng vào hệ thống`}
        </button>
      </div>
    </section>
  );
}
