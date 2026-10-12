import { redirect } from "next/navigation";
import Khung2Lop from "@/components/bao-mat/Khung2Lop";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, layNguoiDungHienTai } from "@/lib/trang";
import { trangThai2LopCuaToi } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

/**
 * Trang bắt buộc bật 2 lớp (XT-06) — đứng riêng ngoài khung ứng dụng như trang đổi mật khẩu:
 * người có vai trò bị bắt mà chưa bật thì chưa vào được màn hình nào khác.
 */
export default async function TrangBat2Lop() {
  const nd = await layNguoiDungHienTai();
  if (!nd) redirect("/dang-nhap");
  if (nd.hoSo.phaiDoiMatKhau) redirect("/doi-mat-khau");
  const tt = await docDuLieu(nd, (tx) => trangThai2LopCuaToi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <main className="giua">
      <div className="the the-don" style={{ maxWidth: 560 }}>
        <h1>Bật xác thực 2 lớp</h1>
        <p className="phu">
          Vai trò của bạn ({nd.hoSo.vaiTro.map((v) => v.name).join(", ")}) được Quản trị đặt bắt buộc xác thực 2 lớp. Bật xong mới vào được hệ thống.
        </p>
        <Khung2Lop trangThai={{ ...tt, batLuc: tt.batLuc?.toISOString() ?? null }} sauKhiBat="/bang-dieu-khien" />
      </div>
    </main>
  );
}
