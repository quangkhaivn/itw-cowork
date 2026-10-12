import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import NutXuatCsv from "@/components/crm/NutXuatCsv";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc, danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { NHAN_TRANG_THAI_KHACH, TRANG_THAI_KHACH } from "@/modules/crm/hang-so";
import { LuocDoLocKhachHang } from "@/modules/khach-hang/luoc-do";
import { danhSachKhachHang, demTheoHanhTrinh } from "@/modules/khach-hang/service";
import { danhSachBoLoc, kiemTraThamSoBoLoc, tuyChonDanhSach } from "@/modules/khach-hang/bo-loc";
import { chuoiTruyVan, LOC_NHANH, SAP_XEP, THAM_SO_LOC } from "@/modules/khach-hang/danh-muc-loc";
import { docDanhMucTrangThai } from "@/modules/hanh-trinh/service";
import { danhSachNhomKhach } from "@/modules/nhom-khach/service";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { hangDiem } from "@/modules/cham-diem/tinh-toan";
import BangKhachHang from "./BangKhachHang";
import CongCuDanhSach from "./CongCuDanhSach";

export const dynamic = "force-dynamic";

export default async function TrangKhachHang({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("customer.view");
  const sp = await searchParams;
  const coThamSo = THAM_SO_LOC.some((k) => layMot(sp[k])) || layMot(sp.xem) === "tat-ca";

  const { kq, dem, nguoi, phanKhuc, tenDuLieu, trangThaiHT, nhom, boLoc: dsBoLoc, tuyChon, nguong, thamSo, macDinhDangDung } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const tuyChon = await tuyChonDanhSach(nc);
    // Không có tham số nào trên URL → áp bộ lọc mặc định của người dùng (nếu có). "Xóa lọc" đi
    // tới ?xem=tat-ca để thoát mặc định.
    const macDinhDangDung = !coThamSo && tuyChon.macDinh ? tuyChon.macDinh : null;
    const tho: Record<string, string> = macDinhDangDung
      ? macDinhDangDung.thamSo
      : Object.fromEntries(THAM_SO_LOC.map((k) => [k, layMot(sp[k])]).filter(([, v]) => v));
    // Giá trị từ URL cũng qua đúng bộ kiểm như bộ lọc đã lưu: giá trị lạ bị bỏ, không làm hỏng trang.
    const thamSo = kiemTraThamSoBoLoc(tho);
    const boLoc = LuocDoLocKhachHang.parse({ ...thamSo, trang: layMot(sp.trang) || 1 });
    const [kq, dem, nguoi, luaChon, tenDuLieu, trangThaiHT, nhom, dsBoLoc, nong, am] = await Promise.all([
      danhSachKhachHang(nc, boLoc),
      demTheoHanhTrinh(nc, boLoc),
      danhSachNguoiPhuTrach(nc, "customer.view"),
      luaChonDuLieuGoc(nc, ["phan_khuc_khach_hang"]),
      banDoTenDuLieuGoc(nc, ["phan_khuc_khach_hang", "nguon_lead"]),
      docDanhMucTrangThai(tx),
      danhSachNhomKhach(nc),
      danhSachBoLoc(nc),
      docCauHinh(tx, "diem_khach.nguong_nong"),
      docCauHinh(tx, "diem_khach.nguong_am"),
    ]);
    return {
      kq, dem, nguoi, phanKhuc: luaChon.phan_khuc_khach_hang, tenDuLieu, trangThaiHT, nhom: nhom.nhom, boLoc: dsBoLoc, tuyChon,
      nguong: { nong, am }, thamSo: { ...thamSo }, macDinhDangDung,
    };
  });

  const duocTao = coQuyen(nd.hoSo, "customer.create");
  const duocSua = coQuyen(nd.hoSo, "customer.update");
  const quanLy = coQuyen(nd.hoSo, "customer.approve");
  const coLoc = Object.keys(thamSo).length > 0;
  const phamVi = nd.hoSo.phamVi.get("customer.view");
  const lienKet = (them: Record<string, string | undefined>) => `/crm/khach-hang${chuoiTruyVan({ ...thamSo, ...them, xem: "tat-ca" })}`;

  return (
    <>
      <DauTrang
        tieuDe="Khách hàng"
        duongDan={[{ nhan: "CRM" }]}
        moTa={
          phamVi === "all"
            ? "Toàn bộ khách hàng của công ty. Mỗi khách một mã; trùng mã số thuế bị chặn khi nhập."
            : "Khách hàng trong phạm vi bạn phụ trách. Tìm theo tên, mã, MST, điện thoại, email hoặc tên người liên hệ."
        }
        hanhDong={
          <>
            {coQuyen(nd.hoSo, "customer.export") && <NutXuatCsv url={`/api/v1/khach-hang/xuat-csv${chuoiTruyVan(thamSo)}`} />}
            {duocTao && (
              <Link className="nut" href="/crm/khach-hang/nhap-csv">
                <BieuTuong ten="nhap-csv" co={16} /> Nhập CSV
              </Link>
            )}
            {quanLy && (
              <Link className="nut" href="/crm/khach-hang/gop">
                Gộp khách trùng
              </Link>
            )}
            {duocTao && (
              <Link className="nut chinh" href="/crm/khach-hang/moi">
                <BieuTuong ten="them" co={16} /> Thêm khách hàng
              </Link>
            )}
          </>
        }
      />

      {macDinhDangDung && (
        <div className="hop-thong-bao" role="status">
          Đang dùng bộ lọc mặc định “{macDinhDangDung.ten}”. <Link href="/crm/khach-hang?xem=tat-ca">Xem tất cả</Link>
        </div>
      )}
      {kq.canhBao && (
        <div className="hop-thong-bao canh-bao" role="status">
          {kq.canhBao}
        </div>
      )}

      <section className="the">
        {/* Thẻ trạng thái hành trình + số khách — bấm để lọc */}
        <nav className="ds-hanh-trinh" aria-label="Lọc theo trạng thái hành trình">
          <Link href={lienKet({ hanhTrinh: undefined, trang: undefined })} aria-current={!thamSo.hanhTrinh ? "true" : undefined}>
            <span className="ten">Tất cả</span>
            <span className="so">{dinhDangSo(dem.tong)}</span>
          </Link>
          {trangThaiHT
            .filter((t) => t.trangThai === "hoat-dong" || dem.theoId[t.id])
            .map((t) => (
              <Link
                key={t.id}
                href={lienKet({ hanhTrinh: t.id })}
                aria-current={thamSo.hanhTrinh === t.id ? "true" : undefined}
                style={{ "--mau": t.mau } as React.CSSProperties}
              >
                <span className="ten">{t.ten}</span>
                <span className="so">{dinhDangSo(dem.theoId[t.id] ?? 0)}</span>
              </Link>
            ))}
          <Link href={lienKet({ hanhTrinh: "chua-co" })} aria-current={thamSo.hanhTrinh === "chua-co" ? "true" : undefined}>
            <span className="ten">Chưa có trạng thái</span>
            <span className="so">{dinhDangSo(dem.theoId["chua-co"] ?? 0)}</span>
          </Link>
        </nav>

        <nav className="loc-nhanh" aria-label="Lọc nhanh">
          <span className="phu nho">Lọc nhanh:</span>
          {LOC_NHANH.map((l) => (
            <Link key={l.ma} href={lienKet({ nhanh: thamSo.nhanh === l.ma ? undefined : l.ma })} aria-current={thamSo.nhanh === l.ma ? "true" : undefined}>
              {l.nhan}
            </Link>
          ))}
        </nav>

        <form className="bo-loc" method="get">
          <input type="hidden" name="xem" value="tat-ca" />
          {thamSo.hanhTrinh && <input type="hidden" name="hanhTrinh" value={thamSo.hanhTrinh} />}
          {thamSo.nhanh && <input type="hidden" name="nhanh" value={thamSo.nhanh} />}
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={thamSo.q ?? ""} placeholder="Tên, mã KH, MST, điện thoại, email, người liên hệ" />
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiPhuTrach">Người phụ trách</label>
              <select id="nguoiPhuTrach" name="nguoiPhuTrach" defaultValue={thamSo.nguoiPhuTrach ?? ""}>
                <option value="">Tất cả</option>
                {nguoi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="truong">
            <label htmlFor="nhom">Nhóm</label>
            <select id="nhom" name="nhom" defaultValue={thamSo.nhom ?? ""}>
              <option value="">Tất cả</option>
              {nhom.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.ten}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="phanKhuc">Phân khúc</label>
            <select id="phanKhuc" name="phanKhuc" defaultValue={thamSo.phanKhuc ?? ""}>
              <option value="">Tất cả</option>
              {phanKhuc.map((p) => (
                <option key={p.ma} value={p.ma}>
                  {p.ten}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Giao dịch</label>
            <select id="trangThai" name="trangThai" defaultValue={thamSo.trangThai ?? ""}>
              <option value="">Tất cả</option>
              {TRANG_THAI_KHACH.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_KHACH[t]}
                </option>
              ))}
              <option value="da-gop">Đã gộp</option>
            </select>
          </div>
          <div className="truong">
            <label htmlFor="sapXep">Sắp xếp</label>
            <select id="sapXep" name="sapXep" defaultValue={thamSo.sapXep ?? ""}>
              <option value="">Mới cập nhật</option>
              {SAP_XEP.filter((s) => s.ma !== "moi-cap-nhat").map((s) => (
                <option key={s.ma} value={s.ma}>
                  {s.nhan}
                </option>
              ))}
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/crm/khach-hang?xem=tat-ca">
              Xóa lọc
            </Link>
          )}
        </form>

        <CongCuDanhSach
          boLoc={dsBoLoc}
          thamSo={thamSo}
          cot={tuyChon.cot}
          macDinhId={tuyChon.macDinh?.id ?? null}
          duocDungChung={quanLy}
        />

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có khách hàng khớp bộ lọc" : "Chưa có khách hàng nào"}>
            {coLoc
              ? "Thử bỏ bớt điều kiện lọc, hoặc tìm bằng số điện thoại / mã số thuế."
              : duocTao
                ? "Bấm “Thêm khách hàng”, nhập CSV, hoặc chuyển đổi một lead đủ điều kiện thành khách hàng."
                : null}
          </TrongRong>
        ) : (
          <BangKhachHang
            cot={tuyChon.cot}
            dong={kq.dong.map((k) => ({
              id: k.id,
              ma: k.ma,
              ten: k.ten,
              maSoThue: k.maSoThue,
              dienThoai: k.dienThoai,
              email: k.email,
              soLienHe: k.soLienHe,
              phanKhuc: k.phanKhuc ? (tenDuLieu.phan_khuc_khach_hang[k.phanKhuc] ?? k.phanKhuc) : null,
              nguon: k.nguon ? (tenDuLieu.nguon_lead[k.nguon] ?? k.nguon) : null,
              nguoiPhuTrach: k.nguoiPhuTrach.hoTen,
              hanhTrinh: k.hanhTrinh ? { id: k.hanhTrinh.id, ten: k.hanhTrinh.ten, mau: k.hanhTrinh.mau } : null,
              diem: k.diem,
              hang: hangDiem(k.diem, nguong.nong, nguong.am),
              nhom: k.nhom,
              soCoHoiMo: k.soCoHoiMo,
              trangThai: k.trangThai,
              tinhThanh: k.tinhThanh,
              taoLuc: k.taoLuc.toISOString(),
            }))}
            trangThaiHT={trangThaiHT.filter((t) => t.trangThai === "hoat-dong").map((t) => ({ id: t.id, ten: t.ten, mau: t.mau }))}
            nhom={nhom.filter((g) => g.trangThai === "hoat-dong").map((g) => ({ id: g.id, ten: g.ten }))}
            nguoi={nguoi.map((n) => ({ id: n.id, ten: n.fullName }))}
            duocSua={duocSua}
          />
        )}
        <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/crm/khach-hang" thamSo={{ ...thamSo, xem: "tat-ca" }} />
      </section>
    </>
  );
}
