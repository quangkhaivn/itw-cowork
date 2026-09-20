"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Các nút hành động trên một báo giá: xin duyệt, duyệt / từ chối, gửi khách, ghi kết quả,
 * tạo phiên bản mới.
 *
 * Nút nào hiện là do MÁY CHỦ quyết (`quyen` trong `chiTietBaoGia`). Ẩn nút chỉ để đỡ rối
 * mắt — người dùng gọi thẳng API vẫn bị chặn ở service (mục 34 prompt).
 */

type Viec = "xin-duyet" | "duyet" | "gui" | "chot" | "ban-moi" | "tao-don" | null;

export default function TacVuBaoGia({
  baoGiaId,
  quyen,
  canDuyet,
  lyDoCanDuyet,
}: {
  baoGiaId: string;
  quyen: { sua: boolean; taoBanMoi: boolean; xinDuyet: boolean; duyet: boolean; tuDuyetBiChan: boolean; gui: boolean; chot: boolean; taoDon: boolean };
  /** Bản hiện hành có dưới ngưỡng biên lợi nhuận không (để nhắc trước khi bấm). */
  canDuyet: boolean;
  lyDoCanDuyet: string | null;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [viec, datViec] = useState<Viec>(null);
  const [ghiChu, datGhiChu] = useState("");
  const [kenh, datKenh] = useState("email");
  const [ketQua, datKetQua] = useState("ACCEPTED");

  const mo = (v: Viec) => {
    datViec(v);
    datGhiChu("");
    datLoi(null);
    hop.current?.showModal();
  };

  async function chay(quyetDinh?: "cho-duyet" | "tu-choi") {
    const duong = `/api/v1/bao-gia/${baoGiaId}`;
    const kq =
      viec === "xin-duyet" ? await goi(`${duong}/xin-duyet`, "POST", { ghiChu })
      : viec === "duyet" ? await goi(`${duong}/duyet`, "POST", { quyetDinh, ghiChu })
      : viec === "gui" ? await goi(`${duong}/gui`, "POST", { kenh, ghiChu })
      : viec === "chot" ? await goi(`${duong}/chot`, "POST", { ketQua, ghiChu })
      : viec === "ban-moi" ? await goi(`${duong}/phien-ban`, "POST")
      : viec === "tao-don" ? await goi<{ id: string }>("/api/v1/don-hang/tu-bao-gia", "POST", { baoGiaId })
      : null;
    if (!kq) return;
    hop.current?.close();
    const viecCu = viec;
    datViec(null);
    if (viecCu === "ban-moi") router.push(`/ban-hang/bao-gia/${baoGiaId}/sua`);
    else if (viecCu === "tao-don") router.push(`/ban-hang/don-hang/${(kq as { id: string }).id}?moTao=1`);
    else router.refresh();
  }

  const tieuDe =
    viec === "xin-duyet" ? "Xin duyệt báo giá"
    : viec === "duyet" ? "Duyệt báo giá"
    : viec === "gui" ? "Ghi nhận đã gửi khách"
    : viec === "chot" ? "Khách trả lời thế nào?"
    : viec === "tao-don" ? "Chuyển báo giá thành đơn hàng"
    : "Tạo phiên bản mới";

  return (
    <>
      <div className="hanh-dong">
        {quyen.xinDuyet && (
          <button type="button" className={`nut${canDuyet ? " chinh" : ""}`} onClick={() => mo("xin-duyet")}>
            Xin duyệt
          </button>
        )}
        {quyen.gui && (
          <button type="button" className="nut chinh" onClick={() => mo("gui")}>
            Gửi khách
          </button>
        )}
        {quyen.duyet && (
          <button type="button" className="nut" onClick={() => mo("duyet")}>
            Duyệt / Từ chối
          </button>
        )}
        {quyen.chot && (
          <button type="button" className="nut" onClick={() => mo("chot")}>
            Ghi kết quả
          </button>
        )}
        {quyen.taoDon && (
          <button type="button" className="nut chinh" onClick={() => mo("tao-don")}>
            Tạo đơn hàng
          </button>
        )}
        {quyen.taoBanMoi && (
          <button type="button" className="nut" onClick={() => mo("ban-moi")}>
            Tạo phiên bản mới
          </button>
        )}
      </div>

      <HopThoai ref={hop} tieuDe={tieuDe} rong={520} khiDong={() => datViec(null)}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}

          {viec === "xin-duyet" && (
            <p className="goi-y" style={{ marginTop: 0 }}>
              {lyDoCanDuyet === "threshold_not_set"
                ? "Hệ thống chưa đặt ngưỡng biên lợi nhuận, nên mọi báo giá đều phải qua duyệt. Giám đốc đặt ngưỡng ở Quản trị → Cấu hình hệ thống."
                : "Báo giá đang dưới ngưỡng biên lợi nhuận. Ghi rõ lý do để người duyệt quyết nhanh."}
            </p>
          )}
          {viec === "tao-don" && (
            <p className="goi-y" style={{ marginTop: 0 }}>
              Đơn hàng mới sẽ chép nguyên bảng hàng và số tiền của bản báo giá khách đã chấp nhận — không phải nhập lại. Sau đó xác nhận đơn để giữ hàng trong kho.
            </p>
          )}
          {viec === "ban-moi" && (
            <p className="goi-y" style={{ marginTop: 0 }}>
              Bản hiện tại sẽ được đánh dấu “đã thay bằng bản mới” và giữ nguyên để đối chiếu. Bản mới chép lại toàn bộ dòng hàng để bạn sửa.
            </p>
          )}

          {viec === "gui" && (
            <div className="truong">
              <label htmlFor="bg-kenh">Gửi bằng cách nào</label>
              <select id="bg-kenh" value={kenh} onChange={(e) => datKenh(e.target.value)}>
                <option value="email">Email</option>
                <option value="zalo">Zalo</option>
                <option value="in-giay">In giấy / gặp trực tiếp</option>
                <option value="khac">Khác</option>
              </select>
              <span className="goi-y">Hệ thống chưa tự gửi email — bạn gửi rồi ghi lại ở đây để mọi người biết.</span>
            </div>
          )}

          {viec === "chot" && (
            <div className="truong">
              <label htmlFor="bg-ketqua">Kết quả</label>
              <select id="bg-ketqua" value={ketQua} onChange={(e) => datKetQua(e.target.value)}>
                <option value="ACCEPTED">Khách chấp nhận</option>
                <option value="NEGOTIATING">Đang thương lượng</option>
                <option value="REJECTED">Khách từ chối</option>
              </select>
            </div>
          )}

          {viec !== "ban-moi" && viec !== "tao-don" && (
            <div className="truong">
              <label htmlFor="bg-ghichu">Ghi chú</label>
              <textarea id="bg-ghichu" rows={3} value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} placeholder={viec === "chot" ? "Khách nói gì, cần làm gì tiếp" : "Không bắt buộc"} />
            </div>
          )}
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy
          </button>
          {viec === "duyet" ? (
            <>
              <button type="button" className="nut nguy-hiem" onClick={() => chay("tu-choi")} disabled={dangGui}>
                Từ chối
              </button>
              <button type="button" className="nut chinh" onClick={() => chay("cho-duyet")} disabled={dangGui}>
                {dangGui ? "Đang lưu…" : "Đồng ý duyệt"}
              </button>
            </>
          ) : (
            <button type="button" className="nut chinh" onClick={() => chay()} disabled={dangGui}>
              {dangGui ? "Đang lưu…" : viec === "gui" ? "Đã gửi khách" : viec === "ban-moi" ? "Tạo bản mới" : viec === "tao-don" ? "Tạo đơn hàng" : "Xác nhận"}
            </button>
          )}
        </div>
      </HopThoai>
    </>
  );
}
