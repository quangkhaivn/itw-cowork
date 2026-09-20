import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { laCoHoiDangMo } from "@/modules/crm/hang-so";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import FormBaoGia from "../FormBaoGia";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hiệu lực mặc định: 30 ngày kể từ hôm nay (sửa được trên form). */
function hieuLucMacDinh(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
}

export default async function TrangLapBaoGia({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("quotation.create");
  const sp = await searchParams;
  const khachId = layMot(sp.khachHang);
  const coHoiId = layMot(sp.coHoi);

  const { nguoi, khach, lienHe, coHoi, nguong, dieuKhoan } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    let khach: { id: string; ma: string; ten: string } | null = null;
    let lienHe: { id: string; hoTen: string }[] = [];
    let coHoi: { id: string; ma: string; tieuDe: string }[] = [];

    // Vào từ trang cơ hội: lấy luôn khách của cơ hội đó.
    let khachCanTim = LA_UUID.test(khachId) ? khachId : "";
    if (!khachCanTim && LA_UUID.test(coHoiId) && coQuyen(nd.hoSo, "sales.view")) {
      const ch = await tx.opportunity.findFirst({ where: { id: coHoiId }, select: { customerId: true } });
      khachCanTim = ch?.customerId ?? "";
    }

    if (khachCanTim) {
      try {
        const k = await batBuocThayKhach(nc, khachCanTim);
        khach = { id: k.id, ma: k.ma, ten: k.ten };
        lienHe = (
          await tx.contact.findMany({
            where: { customerId: k.id, status: "hoat-dong" },
            select: { id: true, fullName: true },
            orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }],
          })
        ).map((l) => ({ id: l.id, hoTen: l.fullName }));
        if (coQuyen(nd.hoSo, "sales.view")) {
          coHoi = (
            await tx.opportunity.findMany({
              where: { customerId: k.id },
              select: { id: true, code: true, title: true, stage: true },
              orderBy: { createdAt: "desc" },
              take: 50,
            })
          )
            .filter((c) => laCoHoiDangMo(c.stage))
            .map((c) => ({ id: c.id, ma: c.code, tieuDe: c.title }));
        }
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }

    return {
      nguoi: await danhSachNguoiPhuTrach(nc, "quotation.create"),
      khach,
      lienHe,
      coHoi,
      nguong: await docCauHinh(tx, "bao_gia.nguong_bien_loi_nhuan"),
      dieuKhoan: await luaChonDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "don_vi_tinh"]),
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Lập báo giá"
        duongDan={[
          { nhan: "Bán hàng" },
          { nhan: "Báo giá", href: "/ban-hang/bao-gia" },
          ...(khach ? [{ nhan: khach.ten, href: `/crm/khach-hang/${khach.id}` }] : []),
        ]}
        moTa="Lưu xong là có bản V1 ở trạng thái Nháp. Gửi khách rồi mới tính là báo giá đã phát hành."
      />
      <FormBaoGia
        nguoiPhuTrach={nguoi}
        dieuKhoanThanhToan={dieuKhoan.dieu_khoan_thanh_toan}
        dieuKhoanGiaoHang={dieuKhoan.dieu_khoan_giao_hang}
        donViTinh={dieuKhoan.don_vi_tinh}
        lienHeBanDau={lienHe}
        coHoiBanDau={coHoi}
        hienGiaVon={coQuyen(nd.hoSo, "product.view")}
        nguongBienLoiNhuan={nguong}
        banDau={{
          khachHang: khach,
          lienHeId: lienHe[0]?.id ?? "",
          coHoiId: coHoi.find((c) => c.id === coHoiId)?.id ?? "",
          nguoiPhuTrachId: nd.hoSo.userId,
          dieuKhoanThanhToan: "",
          dieuKhoanGiaoHang: "",
          dieuKhoanBaoHanh: "",
          hieuLucDen: hieuLucMacDinh(),
          ghiChu: "",
          dong: [],
        }}
      />
    </>
  );
}
