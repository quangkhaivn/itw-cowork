import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chamCongCuaToi } from "@/modules/cham-cong/service";
import ChamCong from "./ChamCong";

export const dynamic = "force-dynamic";

/**
 * Chấm công GPS — trang làm cho ĐIỆN THOẠI trước (NS-11 → NS-13, NS-18). Hai nút lớn Vào ca / Ra ca;
 * vị trí chỉ lấy đúng lúc bấm. Geolocation của trình duyệt chỉ chạy trên HTTPS.
 */
export default async function TrangChamCong() {
  const nd = await yeuCauQuyen("cham_cong.create");
  const kq = await docDuLieu(nd, (tx) => chamCongCuaToi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang
        tieuDe="Chấm công"
        duongDan={[{ nhan: "Nhân sự" }]}
        moTa="Bấm Vào ca khi bắt đầu làm, Ra ca khi về. Ở văn phòng có máy vân tay thì chấm trên máy cũng được."
        hanhDong={
          <>
            <Link className="nut" href="/cham-cong/don-tu">Đơn từ</Link>
            {coQuyen(nd.hoSo, "cham_cong.view") && <Link className="nut" href="/cham-cong/truc-tiep">Bảng trực tiếp</Link>}
          </>
        }
      />
      <ChamCong duLieu={JSON.parse(JSON.stringify(kq))} />
    </>
  );
}
