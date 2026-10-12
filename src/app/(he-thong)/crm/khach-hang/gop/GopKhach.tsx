"use client";

import Link from "next/link";
import { useState } from "react";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

interface XemTruoc {
  giuLai: { id: string; ma: string; ten: string; maSoThue: string | null; nguoiPhuTrach: string };
  biGop: { id: string; ma: string; ten: string; maSoThue: string | null; nguoiPhuTrach: string };
  chuyen: { bang: string; so: number; giuNguyen: boolean }[];
  boSung: { truong: string; giaTri: string }[];
}

/** Tên bảng → nhãn đọc được. Bảng chưa có nhãn vẫn hiện tên kỹ thuật — không bị giấu đi. */
const NHAN_BANG: Record<string, string> = {
  "contacts.customer_id": "Người liên hệ",
  "leads.converted_customer_id": "Lead đã chuyển đổi",
  "interactions.customer_id": "Tương tác",
  "opportunities.customer_id": "Cơ hội",
  "tasks.customer_id": "Công việc",
  "quotations.customer_id": "Báo giá",
  "sales_orders.customer_id": "Đơn hàng",
  "invoices.customer_id": "Hóa đơn",
  "payments.customer_id": "Phiếu thu",
  "warranties.customer_id": "Bảo hành",
  "support_tickets.customer_id": "Phiếu hỗ trợ",
  "projects.customer_id": "Dự án",
  "maintenance_contracts.customer_id": "Hợp đồng bảo trì",
  "renewals.customer_id": "Gia hạn",
  "sales_returns.customer_id": "Phiếu khách trả hàng",
  "customer_group_members.customer_id": "Thành viên nhóm",
  "customer_journey_history.customer_id": "Lịch sử hành trình (giữ nguyên làm bằng chứng)",
};

export default function GopKhach({ giuLaiBanDau }: { giuLaiBanDau: KhachDaChon | null }) {
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [giuLai, datGiuLai] = useState<KhachDaChon | null>(giuLaiBanDau);
  const [biGop, datBiGop] = useState<KhachDaChon | null>(null);
  const [xt, datXt] = useState<XemTruoc | null>(null);
  const [lyDo, datLyDo] = useState("");
  const [xong, datXong] = useState<string | null>(null);

  async function xemTruoc() {
    datXt(null);
    datXong(null);
    if (!giuLai || !biGop) return;
    const r = await goi<XemTruoc>(`/api/v1/khach-hang/gop?giuLaiId=${giuLai.id}&biGopId=${biGop.id}`, "GET");
    if (r) datXt(r);
  }
  async function gop() {
    if (!giuLai || !biGop) return;
    const r = await goi<{ giuLaiId: string }>("/api/v1/khach-hang/gop", "POST", { giuLaiId: giuLai.id, biGopId: biGop.id, lyDo });
    if (r) {
      datXong(r.giuLaiId);
      datXt(null);
      datBiGop(null);
      datLyDo("");
    }
  }

  return (
    <section className="the">
      <div className="phan-form">
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="gop-giu">Khách GIỮ LẠI</label>
            <ChonKhachHang
              id="gop-giu"
              giaTri={giuLai}
              datGiaTri={(k) => {
                datGiuLai(k);
                datXt(null);
                datLoi(null);
              }}
            />
          </div>
          <div className="truong">
            <label htmlFor="gop-bi">Khách BỊ GỘP</label>
            <ChonKhachHang
              id="gop-bi"
              giaTri={biGop}
              datGiaTri={(k) => {
                datBiGop(k);
                datXt(null);
                datLoi(null);
              }}
            />
          </div>
        </div>
        <button type="button" className="nut" onClick={xemTruoc} disabled={dangGui || !giuLai || !biGop}>
          Xem trước
        </button>
      </div>

      {loi && (
        <div className="phan-form">
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        </div>
      )}
      {xong && (
        <div className="phan-form">
          <div className="hop-thong-bao tot" role="status">
            Đã gộp xong. <Link href={`/crm/khach-hang/${xong}`}>Mở khách giữ lại</Link>
          </div>
        </div>
      )}

      {xt && (
        <div className="phan-form">
          <h3>
            Gộp {xt.biGop.ma} — {xt.biGop.ten} vào {xt.giuLai.ma} — {xt.giuLai.ten}
          </h3>
          <table className="bang">
            <thead>
              <tr>
                <th>Loại bản ghi</th>
                <th className="so">Số bản ghi của khách bị gộp</th>
              </tr>
            </thead>
            <tbody>
              {xt.chuyen
                .filter((c) => c.so > 0)
                .map((c) => (
                  <tr key={c.bang}>
                    <td>{NHAN_BANG[c.bang] ?? c.bang}</td>
                    <td className="so">
                      {dinhDangSo(c.so)} {c.giuNguyen ? "(giữ nguyên)" : "→ chuyển"}
                    </td>
                  </tr>
                ))}
              {xt.chuyen.every((c) => c.so === 0) && (
                <tr>
                  <td colSpan={2} className="phu">
                    Khách bị gộp không có bản ghi nào gắn kèm.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {xt.boSung.length > 0 && (
            <p className="phu">
              Bổ sung vào khách giữ lại (đang trống): {xt.boSung.map((b) => `${b.truong}: ${b.giaTri}`).join(" · ")}
            </p>
          )}
          <div className="truong" style={{ marginTop: 12 }}>
            <label htmlFor="gop-ly-do">
              Lý do gộp <span className="bat-buoc">*</span>
            </label>
            <input id="gop-ly-do" value={lyDo} onChange={(e) => datLyDo(e.target.value)} maxLength={1000} placeholder="Ví dụ: cùng một công ty, nhập hai lần" />
          </div>
          <div className="chan-form" style={{ paddingInline: 0 }}>
            <button type="button" className="nut chinh" onClick={gop} disabled={dangGui || lyDo.trim().length < 3}>
              {dangGui ? "Đang gộp…" : "Gộp khách"}
            </button>
            <span className="phu nho">Không hoàn tác bằng một nút — nhật ký kiểm toán ghi đủ trước/sau để đối chiếu.</span>
          </div>
        </div>
      )}
    </section>
  );
}
