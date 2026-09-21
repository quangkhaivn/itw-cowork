import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNhaCungCap } from "@/modules/nha-cung-cap/service";
import { goiYMuaChoDonBan } from "@/modules/mua-hang/service";
import FormDeNghi from "./FormDeNghi";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lập đề nghị mua. Mở từ một đơn bán thiếu hàng (`?donBan=`) thì các dòng được điền sẵn
 * đúng phần còn thiếu — đó là đường đi thường gặp nhất.
 */
export default async function TrangLapDeNghi({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("purchasing.create");
  const sp = await searchParams;
  const donBanId = layMot(sp.donBan);

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const ncc = await danhSachNhaCungCap(nc, { q: "", trangThai: "hoat-dong", trang: 1, coTrang: 100 });
    let donBan: { id: string; so: string } | null = null;
    let thieu: Awaited<ReturnType<typeof goiYMuaChoDonBan>>["thieu"] = [];
    if (LA_UUID.test(donBanId)) {
      try {
        const g = await goiYMuaChoDonBan(nc, donBanId);
        donBan = { id: g.donBan.id, so: g.donBan.so };
        thieu = g.thieu;
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }
    return { nhaCungCap: ncc.dong.map((n) => ({ id: n.id, ten: n.ten })), donBan, thieu };
  });

  return (
    <>
      <DauTrang
        tieuDe="Lập đề nghị mua"
        duongDan={[{ nhan: "Mua hàng" }, { nhan: "Đề nghị mua", href: "/mua-hang/de-nghi" }]}
        moTa="Nêu rõ cần mua gì và vì sao. Duyệt xong mới đặt nhà cung cấp được."
      />
      <FormDeNghi nhaCungCap={du.nhaCungCap} donBan={du.donBan} thieu={du.thieu} />
    </>
  );
}
