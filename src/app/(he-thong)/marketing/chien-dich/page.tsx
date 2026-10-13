import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangPhanTram, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { KENH_MARKETING, LOP_TRANG_THAI_CHIEN_DICH, NHAN_KENH, NHAN_TRANG_THAI_CHIEN_DICH, TRANG_THAI_CHIEN_DICH } from "@/modules/marketing/hang-so";
import { LuocDoLocChienDich } from "@/modules/marketing/luoc-do";
import { danhSachChienDich } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

const LA_NGAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function TrangChienDich({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("marketing.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const kenh = layMot(sp.kenh);
  const boLoc = LuocDoLocChienDich.parse({
    q: layMot(sp.q),
    trangThai: (TRANG_THAI_CHIEN_DICH as readonly string[]).includes(tt) ? tt : "",
    kenh: (KENH_MARKETING as readonly string[]).includes(kenh) ? kenh : "",
    tuNgay: LA_NGAY.test(layMot(sp.tuNgay)) ? layMot(sp.tuNgay) : "",
    denNgay: LA_NGAY.test(layMot(sp.denNgay)) ? layMot(sp.denNgay) : "",
  });
  const kq = await docDuLieu(nd, (tx) => danhSachChienDich(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.kenh || boLoc.tuNgay || boLoc.denNgay);

  return (
    <>
      <DauTrang
        tieuDe="Chiến dịch marketing"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Ngân sách, chi phí thực tế và hiệu quả của từng chiến dịch. CPL = chi phí / lead; ROAS = doanh thu hóa đơn của khách mới do chiến dịch mang về / chi phí. Chưa có mẫu số thì để trống, không ghi 0."
        hanhDong={
          coQuyen(nd.hoSo, "marketing.create") && (
            <Link className="nut chinh" href="/marketing/chien-dich/moi">
              <BieuTuong ten="them" co={16} /> Thêm chiến dịch
            </Link>
          )
        }
      />
      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Chi phí {boLoc.tuNgay || boLoc.denNgay ? "trong kỳ" : "đã ghi"}</div>
          <div className="gia-tri">{dinhDangTien(kq.tong.chiPhi)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Lead từ chiến dịch</div>
          <div className="gia-tri">{dinhDangSo(kq.tong.soLead)}</div>
          <div className="ghi-chu">{dinhDangSo(kq.tong.soDuDieuKien)} đủ điều kiện · {dinhDangSo(kq.tong.soChuyenDoi)} thành khách</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">CPL chung</div>
          <div className="gia-tri">{kq.tong.cpl === null ? "—" : dinhDangTien(kq.tong.cpl)}</div>
          <div className="ghi-chu">{kq.tong.cpl === null ? "chưa có lead" : "chi phí / lead"}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">ROAS chung</div>
          <div className="gia-tri">{kq.tong.roas === null ? "—" : `${dinhDangSo(kq.tong.roas)} lần`}</div>
          <div className="ghi-chu">doanh thu {dinhDangTien(kq.tong.doanhThu)}</div>
        </div>
      </div>
      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Tên, mã CD, utm_campaign" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai}>
              <option value="">Tất cả</option>
              {TRANG_THAI_CHIEN_DICH.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_CHIEN_DICH[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="kenh">Kênh</label>
            <select id="kenh" name="kenh" defaultValue={boLoc.kenh}>
              <option value="">Tất cả</option>
              {KENH_MARKETING.map((k) => (
                <option key={k} value={k}>
                  {NHAN_KENH[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="tuNgay">Từ ngày</label>
            <input id="tuNgay" name="tuNgay" type="date" defaultValue={boLoc.tuNgay} />
          </div>
          <div className="truong">
            <label htmlFor="denNgay">Đến ngày</label>
            <input id="denNgay" name="denNgay" type="date" defaultValue={boLoc.denNgay} />
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/marketing/chien-dich">
              Xóa lọc
            </Link>
          )}
        </form>
        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có chiến dịch khớp bộ lọc" : "Chưa có chiến dịch nào"}>
            {!coLoc ? "Tạo chiến dịch để gắn lead từ form, landing page, webhook và theo dõi chi phí / lead." : null}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Chiến dịch</th>
                  <th>Trạng thái</th>
                  <th className="so">Ngân sách</th>
                  <th className="so">Đã chi</th>
                  <th className="so">Lead</th>
                  <th className="so an-tren-dt">CPL</th>
                  <th className="so an-tren-dt">Chuyển đổi</th>
                  <th className="so an-tren-dt">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/marketing/chien-dich/${c.id}`}>{c.ten}</Link>
                      <div className="dong-phu">
                        {c.ma} · {NHAN_KENH[c.kenh] ?? c.kenh}
                        {c.ngayBatDau ? ` · ${dinhDangNgay(c.ngayBatDau)}` : ""}
                        {c.ngayKetThuc ? ` → ${dinhDangNgay(c.ngayKetThuc)}` : ""}
                      </div>
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_CHIEN_DICH[c.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_CHIEN_DICH[c.trangThai]}</span>
                    </td>
                    <td className="so">{Number(c.nganSach) > 0 ? dinhDangTien(c.nganSach) : <span className="mo">—</span>}</td>
                    <td className="so">{dinhDangTien(c.chiSo.chiPhi)}</td>
                    <td className="so">{dinhDangSo(c.chiSo.soLead)}</td>
                    <td className="so an-tren-dt">{c.chiSo.cpl === null ? <span className="mo">—</span> : dinhDangTien(c.chiSo.cpl)}</td>
                    <td className="so an-tren-dt">{c.chiSo.tyLeChuyenDoi === null ? <span className="mo">—</span> : dinhDangPhanTram(c.chiSo.tyLeChuyenDoi)}</td>
                    <td className="so an-tren-dt">{c.chiSo.roas === null ? <span className="mo">—</span> : `${dinhDangSo(c.chiSo.roas)}×`}</td>
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
