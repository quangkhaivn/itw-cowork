import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrangThai from "@/components/ui/TrangThai";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { HANH_DONG, MO_TA_HANH_DONG, MO_TA_PHAN_HE, PHAN_HE } from "@/lib/vai-tro";
import { chiTietVaiTro } from "@/modules/vai-tro/service";
import MaTranQuyen from "./MaTranQuyen";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangChiTietVaiTro({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("role.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();

  const v = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietVaiTro(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!v) notFound();

  const duocSua = coQuyen(nd.hoSo, "role.update") && !v.biKhoa;
  // Thứ tự phân hệ theo danh mục trong mã (bám sidebar), không theo bảng chữ cái.
  const phanHe = PHAN_HE.filter((ph) => v.danhMuc.some((p) => p.module === ph)).map((ph) => ({
    ma: ph,
    ten: MO_TA_PHAN_HE[ph],
  }));

  return (
    <>
      <DauTrang
        tieuDe={v.ten}
        duongDan={[{ nhan: "Quản trị" }, { nhan: "Vai trò & quyền", href: "/quan-tri/vai-tro" }]}
        moTa={
          <>
            Mã <code>{v.ma}</code> · <TrangThai giaTri={v.trangThai} /> {v.moTa ? `· ${v.moTa}` : ""}
          </>
        }
      />

      {v.biKhoa && (
        <div className="hop-thong-bao thong-tin">
          Vai trò này luôn giữ toàn quyền để hệ thống luôn còn người quản trị được. Không sửa quyền được.
        </div>
      )}
      {v.laVaiTroAI && (
        <div className="hop-thong-bao canh-bao">
          Trợ lý AI chỉ được đọc, phân tích và soạn nháp. Quyền Duyệt và Xóa bị khóa cho vai trò này — mọi thao tác đó
          phải có người duyệt.
        </div>
      )}

      <MaTranQuyen
        id={v.id}
        duocSua={duocSua}
        laVaiTroAI={v.laVaiTroAI}
        phanHe={phanHe}
        hanhDong={HANH_DONG.map((h) => ({ ma: h, ten: MO_TA_HANH_DONG[h] }))}
        coSan={v.danhMuc.map((p) => p.code)}
        quyen={v.quyen}
        quyenCuaToi={[...nd.hoSo.quyen]}
      />

      <section className="the">
        <div className="dau">
          <h2>Người đang giữ vai trò ({v.nguoi.length})</h2>
        </div>
        {v.nguoi.length === 0 ? (
          <div className="than phu">Chưa có ai. Gán vai trò ở màn hình Người dùng.</div>
        ) : (
          <table className="bang">
            <tbody>
              {v.nguoi.map((n) => (
                <tr key={n.id} className={n.trangThai !== "hoat-dong" ? "mo" : undefined}>
                  <td>
                    {coQuyen(nd.hoSo, "user.view") ? <Link href={`/quan-tri/nguoi-dung/${n.id}`}>{n.hoTen}</Link> : n.hoTen}
                    <div className="dong-phu">{n.email}</div>
                  </td>
                  <td>
                    <TrangThai giaTri={n.trangThai} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
