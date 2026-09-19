import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc, danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { GIAI_DOAN_LEAD, LOP_GIAI_DOAN, NHAN_GIAI_DOAN } from "@/modules/crm/hang-so";
import { LuocDoLocLead } from "@/modules/lead/luoc-do";
import { danhSachLead } from "@/modules/lead/service";

export const dynamic = "force-dynamic";

export default async function TrangLead({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("crm.view");
  const sp = await searchParams;
  const gd = layMot(sp.giaiDoan);
  const boLoc = LuocDoLocLead.parse({
    q: layMot(sp.q),
    giaiDoan: gd === "tat-ca" || (GIAI_DOAN_LEAD as readonly string[]).includes(gd) ? gd : "",
    nguon: layMot(sp.nguon),
    nguoiPhuTrach: /^[0-9a-f-]{36}$/i.test(layMot(sp.nguoiPhuTrach)) ? layMot(sp.nguoiPhuTrach) : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, nguoi, nguon, tenNguon } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      kq: await danhSachLead(nc, boLoc),
      nguoi: await danhSachNguoiPhuTrach(nc, "crm.view"),
      nguon: (await luaChonDuLieuGoc(nc, ["nguon_lead"])).nguon_lead,
      tenNguon: (await banDoTenDuLieuGoc(nc, ["nguon_lead"])).nguon_lead,
    };
  });
  const duocTao = coQuyen(nd.hoSo, "crm.create");
  const coLoc = Boolean(boLoc.q || boLoc.giaiDoan || boLoc.nguon || boLoc.nguoiPhuTrach);

  return (
    <>
      <DauTrang
        tieuDe="Lead"
        duongDan={[{ nhan: "CRM" }]}
        moTa="Người và doanh nghiệp có nhu cầu, chưa thành khách hàng. Lead đủ điều kiện thì chuyển đổi thành khách hàng + cơ hội."
        hanhDong={
          duocTao && (
            <Link className="nut chinh" href="/crm/lead/moi">
              <BieuTuong ten="them" co={16} /> Thêm lead
            </Link>
          )
        }
      />
      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Họ tên, công ty, mã LD, điện thoại, email, MST" />
          </div>
          <div className="truong">
            <label htmlFor="giaiDoan">Giai đoạn</label>
            <select id="giaiDoan" name="giaiDoan" defaultValue={boLoc.giaiDoan}>
              <option value="">Đang mở</option>
              <option value="tat-ca">Tất cả</option>
              {GIAI_DOAN_LEAD.map((g) => (
                <option key={g} value={g}>
                  {NHAN_GIAI_DOAN[g]}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="nguon">Nguồn</label>
            <select id="nguon" name="nguon" defaultValue={boLoc.nguon}>
              <option value="">Tất cả</option>
              {nguon.map((n) => (
                <option key={n.ma} value={n.ma}>
                  {n.ten}
                </option>
              ))}
            </select>
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiPhuTrach">Người phụ trách</label>
              <select id="nguoiPhuTrach" name="nguoiPhuTrach" defaultValue={boLoc.nguoiPhuTrach}>
                <option value="">Tất cả</option>
                {nguoi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/crm/lead">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có lead khớp bộ lọc" : "Chưa có lead đang mở"}>
            {!coLoc && duocTao ? "Bấm “Thêm lead” khi có khách hỏi qua điện thoại, Zalo, website." : null}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Liên lạc</th>
                  <th className="an-tren-dt">Nguồn</th>
                  <th className="so">Ước tính</th>
                  <th>Giai đoạn</th>
                  <th>Phụ trách</th>
                  <th className="an-tren-dt">Liên hệ gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((l) => (
                  <tr key={l.id} className={l.giaiDoan === "DISQUALIFIED" ? "mo" : undefined}>
                    <td>
                      <Link href={`/crm/lead/${l.id}`}>{l.hoTen}</Link>
                      <div className="dong-phu">
                        {l.ma}
                        {l.congTy ? ` · ${l.congTy}` : ""}
                      </div>
                    </td>
                    <td>
                      {l.dienThoai ?? <span className="mo">—</span>}
                      {l.email && <div className="dong-phu">{l.email}</div>}
                    </td>
                    <td className="an-tren-dt">{l.nguon ? (tenNguon[l.nguon] ?? l.nguon) : <span className="mo">—</span>}</td>
                    <td className="so">{l.giaTriUocTinh ? dinhDangTien(l.giaTriUocTinh) : <span className="mo">—</span>}</td>
                    <td>
                      <span className={`huy-hieu ${LOP_GIAI_DOAN[l.giaiDoan] ?? ""}`}>{NHAN_GIAI_DOAN[l.giaiDoan]}</span>
                    </td>
                    <td>{l.nguoiPhuTrach.hoTen}</td>
                    <td className="an-tren-dt so nho">{l.lienHeCuoi ? dinhDangNgay(l.lienHeCuoi) : <span className="huy-hieu canh-bao">Chưa liên hệ</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang
          tong={kq.tong}
          trang={kq.trang}
          coTrang={kq.coTrang}
          duongDan="/crm/lead"
          thamSo={{ q: boLoc.q, giaiDoan: boLoc.giaiDoan, nguon: boLoc.nguon, nguoiPhuTrach: boLoc.nguoiPhuTrach }}
        />
      </section>
    </>
  );
}
