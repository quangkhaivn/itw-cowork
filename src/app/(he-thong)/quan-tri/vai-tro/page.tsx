import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrangThai from "@/components/ui/TrangThai";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachVaiTro } from "@/modules/vai-tro/service";
import TaoVaiTro from "./TaoVaiTro";

export const dynamic = "force-dynamic";

export default async function TrangVaiTro() {
  const nd = await yeuCauQuyen("role.view");
  const ds = await docDuLieu(nd, (tx) => danhSachVaiTro(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));

  return (
    <>
      <DauTrang
        tieuDe="Vai trò & quyền"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Mỗi vai trò là một bộ quyền (Xem, Tạo, Sửa, Xóa, Duyệt, Xuất) trên từng phân hệ, kèm phạm vi dữ liệu: của tôi, nhóm tôi quản lý, phòng ban, hoặc toàn công ty. Quyền được kiểm ở máy chủ cho mọi thao tác."
        hanhDong={coQuyen(nd.hoSo, "role.create") && <TaoVaiTro vaiTro={ds.map((v) => ({ id: v.id, ten: v.ten }))} />}
      />
      <section className="the">
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th>Vai trò</th>
                <th className="so">Số quyền</th>
                <th className="so">Người đang giữ</th>
                <th>Loại</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((v) => (
                <tr key={v.id} className={v.trangThai !== "hoat-dong" ? "mo" : undefined}>
                  <td>
                    <Link href={`/quan-tri/vai-tro/${v.id}`}>{v.ten}</Link>
                    {v.moTa && <div className="dong-phu">{v.moTa}</div>}
                  </td>
                  <td className="so">{dinhDangSo(v.soQuyen)}</td>
                  <td className="so">{dinhDangSo(v.soNguoi)}</td>
                  <td>
                    {v.biKhoa ? (
                      <span className="huy-hieu chinh">Toàn quyền — khóa</span>
                    ) : v.dungSan ? (
                      <span className="huy-hieu">Dựng sẵn</span>
                    ) : (
                      <span className="huy-hieu">Tự tạo</span>
                    )}
                  </td>
                  <td>
                    <TrangThai giaTri={v.trangThai} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
