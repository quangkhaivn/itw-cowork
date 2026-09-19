import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import NutTaoViec from "@/components/crm/NutTaoViec";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { NHAN_TRANG_THAI_VIEC, NHAN_UU_TIEN, TRANG_THAI_VIEC } from "@/modules/crm/hang-so";
import { danhSachViec, LuocDoLocViec } from "@/modules/cong-viec/service";
import TacVuViec from "./TacVuViec";

export const dynamic = "force-dynamic";

const LOP_UU_TIEN: Record<string, string> = { khan: "loi", cao: "canh-bao", "trung-binh": "", thap: "" };

export default async function TrangCongViec({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("task.view");
  const sp = await searchParams;
  const cheDo = layMot(sp.cheDo);
  const tt = layMot(sp.trangThai);
  const idViec = layMot(sp.id);
  const boLoc = LuocDoLocViec.parse({
    cheDo: ["cua-toi", "qua-han", "tat-ca"].includes(cheDo) ? cheDo : "cua-toi",
    trangThai: tt === "tat-ca" || (TRANG_THAI_VIEC as readonly string[]).includes(tt) ? tt : "",
    nguoiPhuTrach: /^[0-9a-f-]{36}$/i.test(layMot(sp.nguoiPhuTrach)) ? layMot(sp.nguoiPhuTrach) : "",
    q: layMot(sp.q),
    id: /^[0-9a-f-]{36}$/i.test(idViec) ? idViec : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, nguoiXem, nguoiGiao } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      kq: await danhSachViec(nc, boLoc),
      nguoiXem: await danhSachNguoiPhuTrach(nc, "task.view"),
      nguoiGiao: coQuyen(nd.hoSo, "task.create") ? await danhSachNguoiPhuTrach(nc, "task.create") : [],
    };
  });

  const the = [
    { ma: "cua-toi", nhan: "Việc của tôi" },
    { ma: "qua-han", nhan: "Quá hạn", so: kq.soQuaHanCuaToi },
    ...(nguoiXem.length > 1 ? [{ ma: "tat-ca", nhan: "Cả nhóm" }] : []),
  ];

  return (
    <>
      <DauTrang
        tieuDe="Công việc"
        moTa="Việc cần làm có hạn, gắn với khách hàng, lead hoặc cơ hội. Việc đã xảy ra (cuộc gọi, cuộc gặp) ghi ở phần Tương tác."
        hanhDong={coQuyen(nd.hoSo, "task.create") && <NutTaoViec nguoiPhuTrach={nguoiGiao} toiId={nd.hoSo.userId} lopNut="nut chinh" moNgay={layMot(sp.tao) === "1"} />}
      />

      {boLoc.id ? (
        <div className="hop-thong-bao thong-tin">
          Đang xem một công việc. <Link href="/cong-viec">Về danh sách việc của tôi</Link>
        </div>
      ) : (
        <nav className="thanh-the" aria-label="Chế độ xem">
          {the.map((t) => (
            <Link key={t.ma} href={`/cong-viec?cheDo=${t.ma}`} aria-current={boLoc.cheDo === t.ma ? "page" : undefined}>
              {t.nhan}
              {t.so ? <span className="dem-the loi">{t.so}</span> : null}
            </Link>
          ))}
        </nav>
      )}

      <section className="the">
        {!boLoc.id && (
          <form className="bo-loc" method="get">
            <input type="hidden" name="cheDo" value={boLoc.cheDo} />
            <div className="truong rong">
              <label htmlFor="q">Tìm</label>
              <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Tên việc hoặc tên khách hàng" />
            </div>
            <div className="truong">
              <label htmlFor="trangThai">Trạng thái</label>
              <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai}>
                <option value="">Chưa xong</option>
                <option value="tat-ca">Tất cả</option>
                {TRANG_THAI_VIEC.map((t) => (
                  <option key={t} value={t}>
                    {NHAN_TRANG_THAI_VIEC[t]}
                  </option>
                ))}
              </select>
            </div>
            {boLoc.cheDo === "tat-ca" && nguoiXem.length > 1 && (
              <div className="truong">
                <label htmlFor="nguoiPhuTrach">Người làm</label>
                <select id="nguoiPhuTrach" name="nguoiPhuTrach" defaultValue={boLoc.nguoiPhuTrach}>
                  <option value="">Tất cả</option>
                  {nguoiXem.map((n) => (
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
          </form>
        )}

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={boLoc.cheDo === "qua-han" ? "Không có việc quá hạn" : "Không có công việc nào"}>
            {boLoc.cheDo === "cua-toi" && !boLoc.q ? "Việc được giao cho bạn hoặc bạn tự tạo sẽ hiện ở đây." : null}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Trạng thái</th>
                  <th>Việc</th>
                  <th>Hạn</th>
                  <th className="an-tren-dt">Gắn với</th>
                  <th>Người làm</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((v) => (
                  <tr key={v.id} className={v.trangThai === "xong" || v.trangThai === "huy" ? "mo" : undefined}>
                    <td>{v.duocSua ? <TacVuViec id={v.id} trangThai={v.trangThai} /> : <span className="huy-hieu">{NHAN_TRANG_THAI_VIEC[v.trangThai]}</span>}</td>
                    <td>
                      <strong style={{ fontWeight: 600 }}>{v.tieuDe}</strong>{" "}
                      {v.uuTien !== "trung-binh" && <span className={`huy-hieu ${LOP_UU_TIEN[v.uuTien]}`}>{NHAN_UU_TIEN[v.uuTien]}</span>}
                      {v.moTa && <div className="dong-phu">{v.moTa}</div>}
                    </td>
                    <td className="so nho">
                      {v.han ? dinhDangNgayGio(v.han) : <span className="mo">Không hạn</span>}
                      {v.quaHan && (
                        <div>
                          <span className="huy-hieu loi">Quá hạn</span>
                        </div>
                      )}
                    </td>
                    <td className="an-tren-dt">
                      {v.coHoi && (
                        <div>
                          <Link href={`/ban-hang/co-hoi/${v.coHoi.id}`}>{v.coHoi.ma}</Link> <span className="phu">{v.coHoi.ten}</span>
                        </div>
                      )}
                      {v.khachHang && (
                        <div>
                          <Link href={`/crm/khach-hang/${v.khachHang.id}`}>{v.khachHang.ten}</Link>
                        </div>
                      )}
                      {v.lead && (
                        <div>
                          <Link href={`/crm/lead/${v.lead.id}`}>{v.lead.ma}</Link> <span className="phu">{v.lead.ten}</span>
                        </div>
                      )}
                      {!v.coHoi && !v.khachHang && !v.lead && <span className="mo">—</span>}
                    </td>
                    <td>{v.nguoiPhuTrach.hoTen}</td>
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
          duongDan="/cong-viec"
          thamSo={{ cheDo: boLoc.cheDo, trangThai: boLoc.trangThai, nguoiPhuTrach: boLoc.nguoiPhuTrach, q: boLoc.q, id: boLoc.id }}
        />
      </section>
    </>
  );
}
