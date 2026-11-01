"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Tác vụ của Nhân sự trên bảng công: sinh / sinh lại nháp, khóa, phản hồi (nhân viên), giải quyết phản hồi.
 * Dùng chung cho trang danh sách (chỉ "Sinh bảng công") và trang chi tiết.
 */
export default function TacVuBangCong({
  bang,
  cheDo = "sinh",
}: {
  bang?: { id: string; nam: number; thang: number };
  cheDo?: "sinh" | "sinh-lai" | "khoa" | "phan-hoi";
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const bayGio = new Date();
  const [thang, datThang] = useState(() => {
    const t = new Date(Date.UTC(bayGio.getUTCFullYear(), bayGio.getUTCMonth() - 1, 1));
    return t.toISOString().slice(0, 7);
  });
  const [phanHoi, datPhanHoi] = useState({ ngay: "", noiDung: "" });

  async function sinh(nam: number, th: number) {
    const kq = await goi<{ id: string }>("/api/v1/cham-cong/bang-cong", "POST", { nam, thang: th });
    if (!kq) return;
    hop.current?.close();
    router.push(`/cham-cong/bang-cong/${kq.id}`);
    router.refresh();
  }

  if (cheDo === "sinh-lai" && bang) {
    return (
      <>
        <button type="button" className="nut" disabled={dangGui} onClick={() => window.confirm("Tính lại toàn bộ bảng nháp từ lần chấm / đơn hiện có? Phản hồi của nhân viên được giữ.") && sinh(bang.nam, bang.thang)}>
          {dangGui ? "Đang tính…" : "Sinh lại"}
        </button>
        {loi && <span className="chu-loi nho"> {loi.thongBao}</span>}
      </>
    );
  }
  if (cheDo === "khoa" && bang) {
    return (
      <>
        <button
          type="button"
          className="nut chinh"
          disabled={dangGui}
          onClick={async () => {
            if (!window.confirm(`Khóa bảng công tháng ${bang.thang}/${bang.nam}? Khóa rồi KHÔNG mở lại được; sai sót sau đó sửa bằng dòng điều chỉnh ở kỳ sau.`)) return;
            if (await goi(`/api/v1/cham-cong/bang-cong/${bang.id}`, "POST", { hanhDong: "khoa" })) router.refresh();
          }}
        >
          Khóa bảng công
        </button>
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      </>
    );
  }
  if (cheDo === "phan-hoi" && bang) {
    return (
      <>
        <button type="button" className="nut" onClick={() => { datLoi(null); hop.current?.showModal(); }}>Phản hồi bảng công</button>
        <HopThoai ref={hop} tieuDe="Phản hồi bảng công" rong={480}>
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <div className="truong">
              <label htmlFor="ph-ngay">Ngày (nếu về một ngày cụ thể)</label>
              <input id="ph-ngay" type="date" value={phanHoi.ngay} onChange={(e) => datPhanHoi({ ...phanHoi, ngay: e.target.value })} />
            </div>
            <div className="truong">
              <label htmlFor="ph-nd">Nội dung <span className="bat-buoc">*</span></label>
              <textarea id="ph-nd" rows={4} value={phanHoi.noiDung} onChange={(e) => datPhanHoi({ ...phanHoi, noiDung: e.target.value })} placeholder="Ví dụ: chiều 07/10 em có chấm ra lúc 17:30 nhưng bảng ghi thiếu giờ ra." />
              <span className="goi-y">Nếu quên chấm, gửi thêm đơn Giải trình / chấm bù để quản lý duyệt.</span>
            </div>
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
            <button
              type="button"
              className="nut chinh"
              disabled={dangGui || phanHoi.noiDung.trim().length < 5}
              onClick={async () => {
                if (await goi(`/api/v1/cham-cong/bang-cong/${bang.id}/phan-hoi`, "POST", phanHoi)) {
                  hop.current?.close();
                  router.refresh();
                }
              }}
            >
              Gửi phản hồi
            </button>
          </div>
        </HopThoai>
      </>
    );
  }
  return (
    <>
      <button type="button" className="nut chinh" onClick={() => { datLoi(null); hop.current?.showModal(); }}>Sinh bảng công</button>
      <HopThoai ref={hop} tieuDe="Sinh bảng công nháp" rong={420}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <div className="truong">
            <label htmlFor="bc-thang">Tháng</label>
            <input id="bc-thang" type="month" value={thang} onChange={(e) => datThang(e.target.value)} />
            <span className="goi-y">Tính từ lần chấm (vân tay, GPS, chấm bù, nhập tệp), đơn nghỉ và tăng ca đã duyệt. Sinh lại được khi còn nháp.</span>
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" disabled={dangGui || !/^\d{4}-\d{2}$/.test(thang)} onClick={() => sinh(Number(thang.slice(0, 4)), Number(thang.slice(5)))}>
            {dangGui ? "Đang tính…" : "Sinh"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
