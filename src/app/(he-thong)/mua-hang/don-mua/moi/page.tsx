import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { danhSachNhaCungCap } from "@/modules/nha-cung-cap/service";
import { danhSachKho } from "@/modules/kho/service";
import { chiTietDeNghi } from "@/modules/mua-hang/service";
import FormDonMua from "./FormDonMua";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangLapDonMua({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("purchasing.create");
  const sp = await searchParams;
  const deNghiId = layMot(sp.deNghi);

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const [ncc, kho, dg] = await Promise.all([
      danhSachNhaCungCap(nc, { q: "", trangThai: "hoat-dong", trang: 1, coTrang: 100 }),
      danhSachKho(nc, true),
      luaChonDuLieuGoc(nc, ["dieu_khoan_thanh_toan"]),
    ]);

    let deNghi: { id: string; so: string } | null = null;
    let dongDeNghi: { id: string; sanPhamId: string | null; ten: string; soLuong: string; donViTinh: string | null; giaDuKien: string }[] = [];
    let chuaDuyet = false;
    if (LA_UUID.test(deNghiId)) {
      try {
        const ct = await chiTietDeNghi(nc, deNghiId);
        if (ct.deNghi.trangThai === "APPROVED") {
          deNghi = { id: ct.deNghi.id, so: ct.deNghi.so };
          dongDeNghi = ct.deNghi.dong.map((x) => ({
            id: x.id,
            sanPhamId: x.sanPhamId,
            ten: x.ten,
            soLuong: x.soLuong,
            donViTinh: x.donViTinh,
            giaDuKien: x.giaDuKien,
          }));
        } else {
          chuaDuyet = true;
        }
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }

    return {
      nhaCungCap: ncc.dong.map((n) => ({ id: n.id, ten: n.ten, dieuKhoanThanhToan: n.dieuKhoanThanhToan })),
      kho: kho.map((k) => ({ id: k.id, ten: k.ten, macDinh: k.macDinh })),
      dieuKhoan: (dg.dieu_khoan_thanh_toan ?? []).map((x) => ({ ma: x.ma, ten: x.ten })),
      deNghi,
      dongDeNghi,
      chuaDuyet,
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Lập đơn mua"
        duongDan={[{ nhan: "Mua hàng" }, { nhan: "Đơn mua", href: "/mua-hang/don-mua" }]}
        moTa="Đặt hàng nhà cung cấp. Lập xong ở trạng thái Nháp — gửi đi mới khóa dòng hàng."
      />

      {du.chuaDuyet && (
        <div className="hop-thong-bao canh-bao" role="status">
          Đề nghị mua đó chưa được duyệt nên không chép sang được. Duyệt đề nghị trước, hoặc lập đơn mua trực tiếp ở dưới.
        </div>
      )}

      {du.kho.length === 0 ? (
        <section className="the">
          <TrongRong tieuDe="Chưa khai kho nào">
            Đơn mua cần một kho để nhận hàng về. Khai kho ở màn hình Kho → Danh sách kho trước.
          </TrongRong>
        </section>
      ) : du.nhaCungCap.length === 0 ? (
        <section className="the">
          <TrongRong tieuDe="Chưa có nhà cung cấp nào">
            Thêm nhà cung cấp ở màn hình Sản phẩm → Nhà cung cấp trước khi đặt hàng.
          </TrongRong>
        </section>
      ) : (
        <FormDonMua
          nhaCungCap={du.nhaCungCap}
          kho={du.kho}
          dieuKhoan={du.dieuKhoan}
          deNghi={du.deNghi}
          dongDeNghi={du.dongDeNghi}
        />
      )}
    </>
  );
}
