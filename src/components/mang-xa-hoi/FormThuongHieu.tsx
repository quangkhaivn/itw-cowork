"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import type { HoSoThuongHieu } from "@/modules/mang-xa-hoi/thuong-hieu-thuan";

const dong = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Sửa hồ sơ thương hiệu — mỗi dòng một mục; bài mẫu cách nhau bằng một dòng "---". */
export default function FormThuongHieu({ hs, suaDuoc }: { hs: HoSoThuongHieu; suaDuoc: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [giongVan, datGiongVan] = useState(hs.giongVan ?? "");
  const [tuCam, datTuCam] = useState(hs.tuCam.join("\n"));
  const [hashtag, datHashtag] = useState(hs.hashtagBatBuoc.join("\n"));
  const [cau, datCau] = useState(hs.cauBatBuoc.join("\n"));
  const [cta, datCta] = useState(hs.cta.join("\n"));
  const [baiMau, datBaiMau] = useState(hs.baiMau.join("\n---\n"));
  const [daLuu, datDaLuu] = useState(false);

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    datDaLuu(false);
    const than = {
      giongVan: giongVan || null, tuCam: dong(tuCam), hashtagBatBuoc: dong(hashtag), cauBatBuoc: dong(cau), cta: dong(cta),
      baiMau: baiMau.split(/\n-{3,}\n/).map((x) => x.trim()).filter(Boolean),
    };
    if (await goi("/api/v1/mang-xa-hoi/thuong-hieu", "PUT", than)) {
      datDaLuu(true);
      router.refresh();
    }
  }

  const o = (id: string, nhan: string, goiY: string, gt: string, dat: (s: string) => void, hang = 4) => (
    <div className="truong ca-dong">
      <label htmlFor={id}>{nhan}</label>
      <textarea id={id} rows={hang} value={gt} onChange={(e) => dat(e.target.value)} disabled={!suaDuoc} />
      <span className="phu nho">{goiY}</span>
    </div>
  );
  return (
    <form onSubmit={luu} className="the" style={{ padding: 16 }}>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      {daLuu && <div className="hop-thong-bao thong-tin">Đã lưu hồ sơ thương hiệu.</div>}
      {!suaDuoc && <div className="hop-thong-bao thong-tin">Chỉ người duyệt bài (Trưởng phòng Marketing, Giám đốc, Quản trị) sửa được hồ sơ này.</div>}
      <div className="luoi-form">
        {o("th-giong-van", "Giọng văn", "Ví dụ: thân thiện, chuyên nghiệp, xưng “ITW” – gọi khách “anh/chị”; câu ngắn, rõ lợi ích. Tối đa 2.000 ký tự.", giongVan, datGiongVan, 3)}
        {o("th-tu-cam", "Từ cấm", "Mỗi dòng một từ / cụm từ (tối đa 200). Bài có từ cấm → cảnh báo; AI được dặn tránh.", tuCam, datTuCam)}
        {o("th-cau", "Câu bắt buộc", "Mỗi dòng một câu (tối đa 20), ví dụ “Bảo hành chính hãng tại ITW”. Bài thiếu → cảnh báo.", cau, datCau, 3)}
        {o("th-hashtag", "Hashtag bắt buộc", "Mỗi dòng một hashtag (tối đa 30), ví dụ #ITW. Bài thiếu → cảnh báo.", hashtag, datHashtag, 3)}
        {o("th-cta", "Câu kêu gọi hành động (CTA)", "Mỗi dòng một câu (tối đa 10), ví dụ “Nhắn tin để được tư vấn cấu hình phù hợp”. AI chọn một câu hợp bài.", cta, datCta, 3)}
        {o("th-bai-mau", "Bài mẫu", "Tối đa 5 bài, mỗi bài ≤ 3.000 ký tự, cách nhau bằng một dòng chỉ có ---. AI học giọng văn từ đây (không chép nguyên).", baiMau, datBaiMau, 10)}
      </div>
      {suaDuoc && <div className="chan-form" style={{ marginTop: 12 }}><button type="submit" className="nut chinh" disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu hồ sơ"}</button></div>}
    </form>
  );
}
