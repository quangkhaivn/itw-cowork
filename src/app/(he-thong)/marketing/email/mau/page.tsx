import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocMau } from "@/modules/email/luoc-do";
import { danhSachMau } from "@/modules/email/service";

export const dynamic = "force-dynamic";

export default async function TrangMauEmail({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("marketing.view");
  const sp = await searchParams;
  const loc = LuocDoLocMau.parse({ q: layMot(sp.q), luuTru: layMot(sp.luuTru) === "co" ? "co" : "" });
  const ds = await docDuLieu(nd, (tx) => danhSachMau(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), loc));
  return (
    <>
      <DauTrang
        tieuDe="Mẫu email"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Mẫu thư soạn bằng khối an toàn: tiêu đề, đoạn văn, nút liên kết, ảnh, danh sách. Chiến dịch chép nội dung từ mẫu lúc lập."
        hanhDong={
          coQuyen(nd.hoSo, "marketing.create") ? (
            <Link className="nut chinh" href="/marketing/email/mau/moi">
              Soạn mẫu mới
            </Link>
          ) : null
        }
      />
      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={loc.q} placeholder="Tên mẫu, tiêu đề thư" />
          </div>
          <div className="truong">
            <label htmlFor="luuTru">Hiện</label>
            <select id="luuTru" name="luuTru" defaultValue={loc.luuTru}>
              <option value="">Đang dùng</option>
              <option value="co">Đã lưu trữ</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
        </form>
        {ds.length === 0 ? (
          <TrongRong tieuDe={loc.q ? "Không có mẫu nào khớp" : "Chưa có mẫu email nào"}>Soạn một mẫu rồi dùng nó cho các chiến dịch.</TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Mẫu</th>
                  <th className="an-tren-dt">Tiêu đề thư</th>
                  <th className="so">Khối</th>
                  <th className="an-tren-dt">Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/marketing/email/mau/${m.id}`}>
                        <strong>{m.ten}</strong>
                      </Link>
                      <div className="dong-phu">{m.tieuDe}</div>
                    </td>
                    <td className="an-tren-dt">{m.tieuDe}</td>
                    <td className="so">{m.soKhoi}</td>
                    <td className="an-tren-dt nho">{dinhDangNgayGio(m.capNhatLuc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
