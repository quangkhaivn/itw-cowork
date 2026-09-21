import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauMotTrongCacQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachKhachHang } from "@/modules/khach-hang/service";
import { danhSachKho } from "@/modules/kho/service";
import { goiYTraTheoDon } from "@/modules/tra-hang/service";
import FormTraHangBan, { type DongGoiY } from "./FormTraHangBan";

export const dynamic = "force-dynamic";

const QUYEN_LAP = ["order.update", "service_desk.update"];
const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangLapTraHangBan({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauMotTrongCacQuyen(QUYEN_LAP);
  const sp = await searchParams;
  const donId = layMot(sp.don);

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const kho = await danhSachKho(nc, true);
    const khach = coQuyen(nd.hoSo, "customer.view")
      ? (await danhSachKhachHang(nc, { q: "", nguoiPhuTrach: "", phanKhuc: "", trangThai: "", trang: 1, coTrang: 100 })).dong
      : [];

    let don: { id: string; so: string } | null = null;
    let khachTuDon: { id: string; ten: string } | null = null;
    let dongGoiY: DongGoiY[] = [];
    if (LA_UUID.test(donId)) {
      try {
        const g = await goiYTraTheoDon(nc, donId);
        don = { id: g.donHang.id, so: g.donHang.so };
        khachTuDon = { id: g.khachHang.id, ten: g.khachHang.name };
        dongGoiY = g.dong
          .filter((x) => x.conTraDuoc > 0)
          .map((x) => ({
            dongDonId: x.dongDonId,
            sanPhamId: x.sanPhamId,
            sku: x.sku,
            ten: x.ten,
            donViTinh: x.donViTinh,
            donGia: x.donGia,
            vat: x.vat,
            conTraDuoc: x.conTraDuoc,
            theoSerial: x.theoSerial,
          }));
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }

    return {
      kho: kho.map((k) => ({ id: k.id, ten: k.ten, macDinh: k.macDinh })),
      khach: khach.map((k) => ({ id: k.id, ten: k.ten })),
      don,
      khachTuDon,
      dongGoiY,
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Lập phiếu khách trả hàng"
        duongDan={[{ nhan: "Trả hàng" }, { nhan: "Khách trả hàng", href: "/tra-hang/khach-tra" }]}
        moTa="Lập xong ở trạng thái Nháp. Hàng chỉ thật sự vào kho khi thủ kho xác nhận, và tiền chỉ giảm khi kế toán chốt."
      />

      {du.kho.length === 0 ? (
        <section className="the">
          <TrongRong tieuDe="Chưa khai kho nào">
            Phiếu trả hàng cần một kho để nhận hàng về. Khai kho ở màn hình Kho → Danh sách kho trước.
          </TrongRong>
        </section>
      ) : du.khach.length === 0 && !du.khachTuDon ? (
        <section className="the">
          <TrongRong tieuDe="Chưa chọn được khách hàng">
            Mở phiếu từ nút &ldquo;Khách trả hàng&rdquo; trên trang đơn hàng, hoặc xin cấp quyền xem khách hàng.
          </TrongRong>
        </section>
      ) : (
        <FormTraHangBan
          kho={du.kho}
          khach={du.khach}
          don={du.don}
          khachTuDon={du.khachTuDon}
          dongGoiY={du.dongGoiY}
        />
      )}
    </>
  );
}
