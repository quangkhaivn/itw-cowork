import Link from "next/link";
import { notFound } from "next/navigation";
import NutIn from "@/components/danh-gia/NutIn";
import Can2Lop from "@/components/luong/Can2Lop";
import PhieuLuongIn from "@/components/luong/PhieuLuongIn";
import { docLuong } from "@/components/luong/doc-luong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { docHoSoCongTy } from "@/modules/ho-so-cong-ty/service";
import { chiTietPhieuLuong } from "@/modules/luong/service";
import { laKyDaKhoa } from "@/modules/luong/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ngayChu(d: Date): string {
  const [n, t, ng] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-");
  return `Ngày ${ng} tháng ${t} năm ${n}`;
}

/**
 * Bản in phiếu lương A4 (LU-43). Của mình: chỉ khi kỳ đã khóa. Của người khác: quyền xem rộng + 2 lớp + ghi nhật ký
 * xem (kiểm ở service). In / lưu PDF bằng hộp thoại in của trình duyệt (QĐ-21).
 */
export default async function BanInPhieuLuong({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("luong.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const kq = await docLuong(() =>
    docDuLieu(nd, async (tx) => {
      try {
        const p = await chiTietPhieuLuong(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
        return { p, ct: await docHoSoCongTy(tx, nd.phien.tenantId) };
      } catch (e) {
        if (e instanceof LoiKhongTimThay) return null;
        throw e;
      }
    }),
    nd,
  );
  if (kq.can2Lop) return <Can2Lop tieuDe="Phiếu lương" />;
  if (!kq.d) notFound();
  const { p, ct } = kq.d;
  const cuaToi = p.nguoi.id === nd.hoSo.userId;
  return (
    <div className="trang-in">
      <div className="thanh-in khong-in">
        <span>Phiếu lương tháng {p.ky.nhan} — {p.nguoi.hoTen}</span>
        <Link className="nut" href={cuaToi ? "/luong/phieu-cua-toi" : `/luong/${p.ky.id}`}>Quay lại</Link>
        <NutIn />
      </div>
      <PhieuLuongIn
        p={{
          congTy: { ten: ct.tenHienThi, diaChi: ct["cong_ty.dia_chi"] || null, maSoThue: ct["cong_ty.ma_so_thue"] || null },
          ky: p.ky.nhan,
          banNhap: !laKyDaKhoa(p.ky.trangThai),
          nguoi: p.nguoi,
          dauVao: p.dauVao,
          ketQua: p.ketQua,
          hoaHong: p.hoaHong,
          ngayIn: ngayChu(p.ky.khoaLuc ?? new Date()),
        }}
      />
    </div>
  );
}
