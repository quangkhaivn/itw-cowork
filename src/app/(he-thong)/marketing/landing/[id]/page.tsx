import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangPhanTram, dinhDangSo } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonChienDich } from "@/modules/marketing/chung";
import { LOP_TRANG_THAI_LANDING, NHAN_TRANG_THAI_LANDING } from "@/modules/marketing/hang-so";
import { chiTietLanding, danhSachForm } from "@/modules/marketing/service";
import { gocCongKhai } from "../../goc-cong-khai";
import MaNhung from "../../form/MaNhung";
import SuaLanding from "../SuaLanding";

export const dynamic = "force-dynamic";

export default async function TrangSuaLanding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nd = await yeuCauQuyen("marketing.view");
  const { ct, forms, cd } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { ct: await chiTietLanding(nc, id), forms: await danhSachForm(nc), cd: await luaChonChienDich(nc) };
  });
  const p = ct.landing;
  const url = `${await gocCongKhai()}/lp/${nd.tenant.code}/${p.slug}`;
  const tk = ct.thongKe;
  return (
    <>
      <DauTrang
        tieuDe={p.ten}
        duongDan={[{ nhan: "Marketing" }, { nhan: "Landing page", href: "/marketing/landing" }]}
        moTa={
          <>
            <span className={`huy-hieu ${LOP_TRANG_THAI_LANDING[p.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_LANDING[p.trangThai]}</span>
            {p.xuatBanLuc && ` · xuất bản lần đầu ${dinhDangNgayGio(p.xuatBanLuc)}`} · phụ trách {p.nguoiPhuTrach.hoTen}
          </>
        }
      />
      {(!p.khoi || (p.coAB && !p.khoiB)) && <div className="hop-thong-bao loi">Nội dung khối đã lưu không hợp lệ — trang công khai sẽ không mở cho tới khi lưu lại.</div>}
      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Biến thể A</div>
          <div className="gia-tri">{tk.A.tyLe === null ? "—" : dinhDangPhanTram(tk.A.tyLe)}</div>
          <div className="ghi-chu">
            {dinhDangSo(tk.A.dangKy)} đăng ký / {dinhDangSo(tk.A.xem)} lượt xem
          </div>
        </div>
        {p.coAB && (
          <div className="the chi-so">
            <div className="nhan">Biến thể B</div>
            <div className="gia-tri">{tk.B.tyLe === null ? "—" : dinhDangPhanTram(tk.B.tyLe)}</div>
            <div className="ghi-chu">
              {dinhDangSo(tk.B.dangKy)} đăng ký / {dinhDangSo(tk.B.xem)} lượt xem
            </div>
          </div>
        )}
      </div>
      <section className="the">
        <div className="than">
          <MaNhung nhan={`Đường dẫn công khai${p.trangThai === "xuat-ban" ? "" : " (chỉ mở khi đã xuất bản)"}${p.coAB ? " — thêm ?v=a hoặc ?v=b để ép biến thể" : ""}`} ma={url} />
        </div>
      </section>
      {ct.duocSua ? (
        <SuaLanding
          trangThai={p.trangThai}
          forms={forms.map((f) => ({ id: f.id, ten: f.ten, trangThai: f.trangThai }))}
          chienDich={cd}
          banDau={{ id, ten: p.ten, slug: p.slug, tieuDe: p.tieuDe, moTa: p.moTa ?? "", formId: p.form?.id ?? "", chienDichId: p.chienDich?.id ?? "", khoi: p.khoi ?? [], khoiB: p.khoiB }}
        />
      ) : (
        <p className="phu">Bạn chỉ xem được trang này.</p>
      )}
    </>
  );
}
