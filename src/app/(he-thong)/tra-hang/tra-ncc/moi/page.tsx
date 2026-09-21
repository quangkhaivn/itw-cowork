import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNhaCungCap } from "@/modules/nha-cung-cap/service";
import { danhSachKho } from "@/modules/kho/service";
import { goiYTraTheoDonMua } from "@/modules/tra-hang/service";
import FormTraHangMua, { type DongGoiYMua } from "./FormTraHangMua";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangLapTraHangMua({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("purchasing.update");
  const sp = await searchParams;
  const donId = layMot(sp.don);

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const [kho, ncc] = await Promise.all([
      danhSachKho(nc, true),
      danhSachNhaCungCap(nc, { q: "", trangThai: "hoat-dong", trang: 1, coTrang: 100 }),
    ]);

    let don: { id: string; so: string; khoId: string } | null = null;
    let nccTuDon: { id: string; ten: string } | null = null;
    let dongGoiY: DongGoiYMua[] = [];
    if (LA_UUID.test(donId)) {
      try {
        const g = await goiYTraTheoDonMua(nc, donId);
        don = { id: g.donMua.id, so: g.donMua.so, khoId: g.donMua.khoId };
        nccTuDon = { id: g.nhaCungCap.id, ten: g.nhaCungCap.name };
        dongGoiY = g.dong
          .filter((x) => x.conTraDuoc > 0)
          .map((x) => ({
            dongDonId: x.dongDonId,
            sanPhamId: x.sanPhamId,
            ten: x.ten,
            donViTinh: x.donViTinh,
            donGia: x.donGia,
            vat: x.vat,
            conTraDuoc: x.conTraDuoc,
          }));
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }

    return {
      kho: kho.map((k) => ({ id: k.id, ten: k.ten, macDinh: k.macDinh })),
      nhaCungCap: ncc.dong.map((n) => ({ id: n.id, ten: n.ten })),
      don,
      nccTuDon,
      dongGoiY,
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Lập phiếu trả hàng nhà cung cấp"
        duongDan={[{ nhan: "Trả hàng" }, { nhan: "Trả nhà cung cấp", href: "/tra-hang/tra-ncc" }]}
        moTa="Lập xong ở trạng thái Nháp. Hàng chỉ thật sự rời kho khi thủ kho xác nhận, và nợ chỉ giảm khi kế toán chốt."
      />

      {du.kho.length === 0 ? (
        <section className="the">
          <TrongRong tieuDe="Chưa khai kho nào">
            Phiếu trả hàng cần một kho để xuất hàng đi. Khai kho ở màn hình Kho → Danh sách kho trước.
          </TrongRong>
        </section>
      ) : du.nhaCungCap.length === 0 && !du.nccTuDon ? (
        <section className="the">
          <TrongRong tieuDe="Chưa khai nhà cung cấp nào">
            Khai nhà cung cấp ở màn hình Sản phẩm → Nhà cung cấp trước.
          </TrongRong>
        </section>
      ) : (
        <FormTraHangMua
          kho={du.kho}
          nhaCungCap={du.nhaCungCap}
          don={du.don}
          nccTuDon={du.nccTuDon}
          dongGoiY={du.dongGoiY}
        />
      )}
    </>
  );
}
