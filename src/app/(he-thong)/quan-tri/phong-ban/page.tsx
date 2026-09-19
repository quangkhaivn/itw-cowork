import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrangThai from "@/components/ui/TrangThai";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { cayPhongBan } from "@/modules/phong-ban/service";
import SuaPhongBan from "./SuaPhongBan";

export const dynamic = "force-dynamic";

export default async function TrangPhongBan() {
  const nd = await yeuCauQuyen("department.view");
  const cay = await docDuLieu(nd, (tx) => cayPhongBan(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const luaChonCha = cay.filter((p) => p.trangThai === "hoat-dong").map((p) => ({ id: p.id, ten: p.ten, cap: p.cap }));
  const duocTao = coQuyen(nd.hoSo, "department.create");
  const duocSua = coQuyen(nd.hoSo, "department.update");

  return (
    <>
      <DauTrang
        tieuDe="Phòng ban"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Cơ cấu tổ chức. Phòng ban lồng nhau được; vai trò có phạm vi “Phòng ban” thấy dữ liệu của phòng mình và mọi phòng con."
        hanhDong={duocTao && <SuaPhongBan luaChonCha={luaChonCha} />}
      />
      <section className="the">
        {cay.length === 0 ? (
          <TrongRong tieuDe="Chưa có phòng ban nào" />
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Phòng ban</th>
                  <th>Mã</th>
                  <th className="so">Nhân sự đang hoạt động</th>
                  <th>Trạng thái</th>
                  {duocSua && <th />}
                </tr>
              </thead>
              <tbody>
                {cay.map((p) => (
                  <tr key={p.id} id={p.id} className={p.trangThai !== "hoat-dong" ? "mo" : undefined}>
                    <td>
                      <span className="thut-le" style={{ paddingLeft: p.cap * 20 }}>
                        {p.cap > 0 && <span className="mo">└ </span>}
                        {p.ten}
                      </span>
                    </td>
                    <td>
                      <code>{p.ma}</code>
                    </td>
                    <td className="so">
                      {p.soNguoi > 0 && coQuyen(nd.hoSo, "user.view") ? (
                        <Link href={`/quan-tri/nguoi-dung?phongBan=${encodeURIComponent(p.ma)}`}>{dinhDangSo(p.soNguoi)}</Link>
                      ) : (
                        dinhDangSo(p.soNguoi)
                      )}
                    </td>
                    <td>
                      <TrangThai giaTri={p.trangThai} />
                    </td>
                    {duocSua && (
                      <td style={{ textAlign: "right" }}>
                        <SuaPhongBan
                          luaChonCha={luaChonCha.filter((c) => c.id !== p.id)}
                          phongBan={{ id: p.id, ma: p.ma, ten: p.ten, chaId: p.chaId ?? "", trangThai: p.trangThai }}
                        />
                      </td>
                    )}
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
