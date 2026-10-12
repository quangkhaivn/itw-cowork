"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BieuTuong from "@/components/ui/BieuTuong";
import NutXuatCsv from "@/components/crm/NutXuatCsv";
import { useGoiApi } from "@/components/ui/goi-api";

interface DongKetQua {
  soDong: number;
  ten: string;
  viec: "tao" | "sua" | "bo-qua";
  ma?: string;
  loi?: string;
}
interface KetQua {
  tongDong: number;
  soTao: number;
  soSua: number;
  soLoi: number;
  cotLa: string[];
  dong: DongKetQua[];
}

/**
 * Nhập CSV khách hàng hai bước (KHN-16): XEM TRƯỚC — máy chủ chạy thử từng dòng qua đúng
 * service rồi cuộn ngược — người dùng đối chiếu, rồi mới GHI.
 */
export default function NhapKhachCsv() {
  const router = useRouter();
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [tep, datTep] = useState<{ ten: string; noiDung: string } | null>(null);
  const [xacNhanTrung, datXacNhanTrung] = useState(false);
  const [kq, datKq] = useState<KetQua | null>(null);
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
    const r = await goi<KetQua>("/api/v1/khach-hang/nhap-csv", "POST", { tenTep: tep.ten, noiDung: tep.noiDung, ghiThat, xacNhanTrung });
    if (r) {
      datKq(r);
      datDaGhi(ghiThat);
      if (ghiThat) router.refresh();
    }
  }

  return (
    <section className="the">
      <div className="phan-form">
        <h3>1. Chuẩn bị tệp</h3>
        <p className="goi-y">
          Tệp <strong>CSV UTF-8</strong> (Excel: <em>Lưu thành → CSV UTF-8</em>). Cột bắt buộc: <strong>Tên</strong>. Cột khác: Mã KH, MST, Loại khách, Phân khúc, Ngành,
          Nguồn (mã hoặc tên trong Dữ liệu gốc), Điện thoại, Email, Địa chỉ, Tỉnh / thành, Website, Người phụ trách (email đăng nhập), Trạng thái, Trạng thái hành trình,
          Nhóm (nhiều nhóm cách nhau bằng <code>|</code>), Liên hệ chính, ĐT liên hệ, Email liên hệ, Ngày sinh liên hệ (dd/mm/yyyy), Ghi chú. Tệp xuất từ danh sách khách nhập lại được ngay.
        </p>
        <NutXuatCsv url="/api/v1/khach-hang/mau-csv" nhan="Tải tệp mẫu" lop="nut nho" />
      </div>

      <div className="phan-form">
        <h3>2. Chọn tệp</h3>
        <input type="file" accept=".csv,text/csv" onChange={chonTep} aria-label="Tệp CSV" />
        <label className="nho" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
          <input
            type="checkbox"
            checked={xacNhanTrung}
            onChange={(e) => {
              datXacNhanTrung(e.target.checked);
              datKq(null);
            }}
          />
          Tôi đã kiểm các dòng “có thể trùng” và xác nhận đều là khách mới (KH-03)
        </label>
      </div>

      {loi && (
        <div className="phan-form">
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
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
            <div className="chi-so the">
              <div className="nhan">Dòng bỏ qua</div>
              <div className="gia-tri">{kq.soLoi}</div>
            </div>
          </div>
          {kq.cotLa.length > 0 && <div className="hop-thong-bao canh-bao">Cột không hiểu, sẽ bỏ qua: {kq.cotLa.join(", ")}</div>}
          {daGhi && (
            <div className="hop-thong-bao tot" role="status">
              Đã nhập xong. Nhật ký kiểm toán và lịch sử hành trình đã ghi lại thay đổi.
            </div>
          )}
          <div className="cuon-ngang" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="bang">
              <thead>
                <tr>
                  <th className="so">Dòng</th>
                  <th>Khách</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((d) => (
                  <tr key={d.soDong} className={d.viec === "bo-qua" ? "mo" : undefined}>
                    <td className="so">{d.soDong}</td>
                    <td>
                      {d.ten || <span className="mo">—</span>}
                      {d.ma && <div className="dong-phu">{d.ma}</div>}
                    </td>
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
        <button type="button" className="nut" onClick={() => chay(false)} disabled={dangGui || !tep}>
          <BieuTuong ten="nhap-csv" co={16} /> {dangGui ? "Đang đọc…" : "Xem trước"}
        </button>
        <button type="button" className="nut chinh" onClick={() => chay(true)} disabled={dangGui || !kq || daGhi || kq.soTao + kq.soSua === 0}>
          {dangGui ? "Đang nhập…" : `Nhập ${kq ? kq.soTao + kq.soSua : 0} dòng vào hệ thống`}
        </button>
      </div>
    </section>
  );
}
