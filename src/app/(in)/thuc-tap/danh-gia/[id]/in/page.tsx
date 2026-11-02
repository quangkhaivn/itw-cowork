import Link from "next/link";
import { notFound } from "next/navigation";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietPhieuThucTap } from "@/modules/thuc-tap/service";
import PhieuThucTapIn from "@/components/danh-gia/PhieuThucTapIn";
import NutIn from "@/components/danh-gia/NutIn";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Ngày 03 tháng 11 năm 2026" theo giờ Việt Nam. */
function ngayChu(d: Date): string {
  const [n, t, ng] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-");
  return `Ngày ${ng} tháng ${t} năm ${n}`;
}

/**
 * Bản in phiếu đánh giá thực tập (DG-76): khổ A4, theo đúng bố cục mẫu đã chụp vào phiếu. In hoặc lưu
 * PDF bằng hộp thoại in của trình duyệt (QĐ-21). Quyền như xem phiếu: thực tập sinh (của mình), người
 * hướng dẫn, quản lý trong phạm vi, Nhân sự.
 */
export default async function BanInPhieuThucTap({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("danh_gia.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const du = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietPhieuThucTap(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();
  return (
    <div className="trang-in">
      <div className="thanh-in khong-in">
        <span>
          Phiếu đánh giá thực tập — {du.phieu.hoTen} · mẫu “{du.phieu.tenMau}” (phiên bản {du.phieu.phienBanMau})
        </span>
        <Link className="nut" href={`/thuc-tap/danh-gia/${id}`}>Quay lại</Link>
        <NutIn />
      </div>
      {du.phieu.trangThai !== "da-chot" && (
        <div className="hop-thong-bao canh-bao khong-in" role="status">Phiếu chưa chốt — bản in mang chữ “BẢN NHÁP”. Chốt phiếu trước khi in nộp trường.</div>
      )}
      <PhieuThucTapIn
        d={{
          mau: du.mau,
          thongTin: du.thongTin,
          ketQua: du.ketQua,
          nhanXet: du.nhanXet,
          ngayLap: ngayChu(du.phieu.chotLuc ?? new Date()),
          banNhap: du.phieu.trangThai !== "da-chot",
        }}
      />
    </div>
  );
}
