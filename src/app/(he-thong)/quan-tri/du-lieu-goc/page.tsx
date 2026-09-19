import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { timLoai } from "@/modules/du-lieu-goc/loai";
import { danhSachMuc, demTheoLoai } from "@/modules/du-lieu-goc/service";
import BangMuc from "./BangMuc";

export const dynamic = "force-dynamic";

export default async function TrangDuLieuGoc({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("master_data.view");
  const sp = await searchParams;
  const loaiChon = timLoai(layMot(sp.loai))?.ma ?? "phan_khuc_khach_hang";

  const [cacLoai, muc] = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return Promise.all([demTheoLoai(nc), danhSachMuc(nc, loaiChon)]);
  });
  const loai = cacLoai.find((l) => l.ma === loaiChon)!;

  return (
    <>
      <DauTrang
        tieuDe="Dữ liệu gốc"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Danh sách chọn dùng chung cho mọi phân hệ. Sửa ở đây một lần, mọi form dùng theo. Mục đã ngừng không hiện trong ô chọn mới nhưng bản ghi cũ vẫn giữ nguyên giá trị."
      />
      <div className="luoi-ben">
        <nav className="the" aria-label="Loại dữ liệu gốc" style={{ alignSelf: "start" }}>
          <div className="than" style={{ padding: 6 }}>
            {cacLoai.map((l) => (
              <Link
                key={l.ma}
                href={`/quan-tri/du-lieu-goc?loai=${l.ma}`}
                className="nut trong"
                style={{
                  width: "100%",
                  justifyContent: "space-between",
                  fontWeight: l.ma === loaiChon ? 700 : 500,
                  background: l.ma === loaiChon ? "var(--chinh-nhat)" : undefined,
                }}
                aria-current={l.ma === loaiChon ? "page" : undefined}
              >
                <span>{l.ten}</span>
                <span className={`huy-hieu ${l.soMuc === 0 ? "canh-bao" : ""}`}>{l.soMuc}</span>
              </Link>
            ))}
          </div>
        </nav>
        <section className="the">
          <div className="dau">
            <div>
              <h2 style={{ marginBottom: 2 }}>{loai.ten}</h2>
              <div className="phu nho">
                {loai.moTa} Dùng ở: {loai.dungO}.
              </div>
            </div>
          </div>
          {muc.length === 0 && !coQuyen(nd.hoSo, "master_data.create") ? (
            <TrongRong tieuDe="Chưa có mục nào">Cần người có quyền tạo dữ liệu gốc nhập danh sách này.</TrongRong>
          ) : (
            <BangMuc
              loai={loaiChon}
              muc={muc.map((m) => ({ id: m.id, ma: m.ma, ten: m.ten, moTa: m.moTa ?? "", thuTu: m.thuTu, trangThai: m.trangThai }))}
              duocTao={coQuyen(nd.hoSo, "master_data.create")}
              duocSua={coQuyen(nd.hoSo, "master_data.update")}
              goiYTrong={
                loai.khoiTao.length === 0
                  ? "Danh sách này để trống có chủ đích: đây là dữ liệu riêng của TGTH, hệ thống không tự điền."
                  : undefined
              }
            />
          )}
        </section>
      </div>
    </>
  );
}
