import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach, homNayVN, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import FormCoHoi from "../FormCoHoi";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangTaoCoHoi({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("sales.create");
  const khachId = layMot((await searchParams).khachHang);

  const { nguon, nguoi, khach, lienHe } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    let khach: { id: string; ma: string; ten: string; nguon: string | null } | null = null;
    let lienHe: { id: string; hoTen: string }[] = [];
    if (LA_UUID.test(khachId)) {
      try {
        const k = await batBuocThayKhach(nc, khachId);
        khach = { id: k.id, ma: k.ma, ten: k.ten, nguon: k.nguon };
        lienHe = (
          await tx.contact.findMany({
            where: { customerId: k.id, status: "hoat-dong" },
            select: { id: true, fullName: true },
            orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }],
          })
        ).map((l) => ({ id: l.id, hoTen: l.fullName }));
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }
    return {
      nguon: (await luaChonDuLieuGoc(nc, ["nguon_lead"])).nguon_lead,
      nguoi: await danhSachNguoiPhuTrach(nc, "sales.create"),
      khach,
      lienHe,
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Tạo cơ hội"
        duongDan={[
          { nhan: "Bán hàng" },
          { nhan: "Cơ hội", href: "/ban-hang/co-hoi" },
          ...(khach ? [{ nhan: khach.ten, href: `/crm/khach-hang/${khach.id}` }] : []),
        ]}
      />
      <FormCoHoi
        nguon={nguon}
        nguoiPhuTrach={nguoi}
        lienHeBanDau={lienHe}
        banDau={{
          khachHang: khach ? { id: khach.id, ma: khach.ma, ten: khach.ten } : null,
          lienHeId: lienHe[0]?.id ?? "",
          tieuDe: "",
          moTa: "",
          giaTri: "",
          xacSuat: "",
          ngayDuKienChot: "",
          nguon: khach?.nguon ?? "",
          nguoiPhuTrachId: nd.hoSo.userId,
          hanhDongKeTiep: "",
          ngayHanhDong: homNayVN(),
          doiThu: "",
        }}
      />
    </>
  );
}
