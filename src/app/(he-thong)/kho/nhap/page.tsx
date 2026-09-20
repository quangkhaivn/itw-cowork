import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachKho, khoMacDinh } from "@/modules/kho/service";
import FormNhapKho from "./FormNhapKho";

export const dynamic = "force-dynamic";

export default async function TrangNhapKho() {
  const nd = await yeuCauQuyen("inventory.create");

  const { kho, macDinh, theoSerial } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const [kho, macDinh, sp] = await Promise.all([
      danhSachKho(nc, true),
      khoMacDinh(nc),
      tx.product.findMany({ where: { requiresSerial: true, status: "hoat-dong" }, select: { id: true } }),
    ]);
    return { kho, macDinh, theoSerial: sp.map((p) => p.id) };
  });

  return (
    <>
      <DauTrang
        tieuDe="Nhập kho"
        duongDan={[{ nhan: "Kho" }, { nhan: "Tồn kho", href: "/kho" }]}
        moTa="Ghi hàng vào kho. Mỗi lần nhập đều vào thẻ kho kèm nguồn hàng và người nhập — không sửa, không xóa được."
      />
      {kho.length === 0 ? (
        <section className="the">
          <TrongRong tieuDe="Chưa có kho đang hoạt động">
            Khai kho trước khi nhập hàng.
            <div style={{ marginTop: 12 }}>
              <Link className="nut chinh" href="/kho/danh-sach">
                Khai kho hàng
              </Link>
            </div>
          </TrongRong>
        </section>
      ) : (
        <FormNhapKho kho={kho.map((k) => ({ id: k.id, ma: k.ma, ten: k.ten }))} khoMacDinhId={macDinh?.id ?? ""} sanPhamTheoSerial={theoSerial} />
      )}
    </>
  );
}
