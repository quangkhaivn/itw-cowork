import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietPhanKhuc } from "@/modules/marketing/service";
import SuaPhanKhuc, { type DieuKien } from "../SuaPhanKhuc";
import { docLuaChonPhanKhuc } from "../lua-chon";

export const dynamic = "force-dynamic";

export default async function TrangChiTietPhanKhuc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nd = await yeuCauQuyen("marketing.view");
  const { ct, lc } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { ct: await chiTietPhanKhuc(nc, id), lc: await docLuaChonPhanKhuc(nc) };
  });
  const p = ct.phanKhuc;
  return (
    <>
      <DauTrang tieuDe={p.ten} duongDan={[{ nhan: "Marketing" }, { nhan: "Phân khúc", href: "/marketing/phan-khuc" }]} moTa={`Tạo bởi ${p.nguoiPhuTrach.hoTen}`} />
      {!p.phanKhuc && <div className="hop-thong-bao loi">Điều kiện đã lưu không còn hợp lệ — chọn lại điều kiện rồi lưu.</div>}
      {ct.xemTruoc && (
        <div className="luoi-chi-so">
          <div className="the chi-so">
            <div className="nhan">Khớp điều kiện</div>
            <div className="gia-tri">{ct.xemTruoc.tong.toLocaleString("vi-VN")}</div>
          </div>
          <div className="the chi-so">
            <div className="nhan">Nhận được tin</div>
            <div className="gia-tri">{ct.xemTruoc.nhanDuoc.toLocaleString("vi-VN")}</div>
            <div className="ghi-chu">{ct.xemTruoc.nhanDuocCoEmail.toLocaleString("vi-VN")} có email</div>
          </div>
          <div className="the chi-so">
            <div className="nhan">Đã từ chối nhận tin</div>
            <div className="gia-tri">{ct.xemTruoc.tuChoi.toLocaleString("vi-VN")}</div>
          </div>
        </div>
      )}
      <SuaPhanKhuc
        id={id}
        luaChon={lc}
        duocSua={ct.duocSua}
        banDau={{ ten: p.ten, ghiChu: p.ghiChu ?? "", doiTuong: p.doiTuong, dieuKien: (p.phanKhuc?.dieuKien ?? {}) as unknown as DieuKien }}
      />
    </>
  );
}
