import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { duLieuPipeline } from "@/modules/co-hoi/service";
import BangKanban from "./BangKanban";

export const dynamic = "force-dynamic";

export default async function TrangPipeline({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("sales.view");
  const nguoiLoc = layMot((await searchParams).nguoiPhuTrach);
  const boLoc = { nguoiPhuTrach: /^[0-9a-f-]{36}$/i.test(nguoiLoc) ? nguoiLoc : "" };

  const { pl, nguoi, lyDoThua } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      pl: await duLieuPipeline(nc, boLoc),
      nguoi: await danhSachNguoiPhuTrach(nc, "sales.view"),
      lyDoThua: (await luaChonDuLieuGoc(nc, ["ly_do_thua"])).ly_do_thua,
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Pipeline"
        duongDan={[{ nhan: "Bán hàng" }]}
        moTa={`Lead mới → Đã liên hệ → Đủ điều kiện → Cơ hội → Báo giá → Thương lượng → Thắng / Thua. Kéo thẻ cơ hội để đổi giai đoạn. Cột Thắng/Thua chỉ hiện ${pl.soNgayHienDaDong} ngày gần nhất.`}
        hanhDong={
          <>
            <Link className="nut" href="/ban-hang/co-hoi">
              Xem dạng bảng
            </Link>
            {coQuyen(nd.hoSo, "sales.create") && (
              <Link className="nut chinh" href="/ban-hang/co-hoi/moi">
                <BieuTuong ten="them" co={16} /> Tạo cơ hội
              </Link>
            )}
          </>
        }
      />
      <div className="hang-tom-tat">
        <span>
          <strong>{dinhDangSo(pl.tongKet.soLuong)}</strong> cơ hội đang mở
        </span>
        <span>
          Giá trị <strong>{dinhDangTien(pl.tongKet.tong)}</strong>
        </span>
        <span>
          Có trọng số <strong>{dinhDangTien(pl.tongKet.coTrongSo)}</strong>
        </span>
        {nguoi.length > 1 && (
          <form method="get" className="loc-gon">
            <label htmlFor="nguoiPhuTrach" className="chi-doc-man-hinh">
              Người phụ trách
            </label>
            <select id="nguoiPhuTrach" name="nguoiPhuTrach" defaultValue={boLoc.nguoiPhuTrach}>
              <option value="">Mọi người trong phạm vi</option>
              {nguoi.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
            <button className="nut nho" type="submit">
              Lọc
            </button>
          </form>
        )}
      </div>
      <BangKanban cot={pl.cot} lyDoThua={lyDoThua} duocMoLai={pl.duocMoLai} />
    </>
  );
}
