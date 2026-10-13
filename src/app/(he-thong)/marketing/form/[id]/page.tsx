import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { luaChonChienDich } from "@/modules/marketing/chung";
import { chiTietForm } from "@/modules/marketing/service";
import FormSuaForm from "../FormSuaForm";
import MaNhung from "../MaNhung";
import { gocCongKhai } from "../../goc-cong-khai";

export const dynamic = "force-dynamic";

export default async function TrangChiTietForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nd = await yeuCauQuyen("marketing.view");
  const { ct, cd, nguon } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { ct: await chiTietForm(nc, id), cd: await luaChonChienDich(nc), nguon: (await luaChonDuLieuGoc(nc, ["nguon_lead"])).nguon_lead };
  });
  const f = ct.form;
  const url = `${await gocCongKhai()}/f/${nd.tenant.code}/${f.slug}`;
  return (
    <>
      <DauTrang
        tieuDe={f.ten}
        duongDan={[{ nhan: "Marketing" }, { nhan: "Form đăng ký", href: "/marketing/form" }]}
        moTa={`${f.trangThai === "tat" ? "Đã tắt" : "Đang nhận đăng ký"} · phụ trách ${f.nguoiPhuTrach.hoTen}`}
        hanhDong={
          <Link className="nut" href={`/marketing/nhan-lead?formId=${id}`}>
            Nhật ký gửi
          </Link>
        }
      />
      <section className="the">
        <div className="dau">
          <h2>Đặt form lên quảng cáo / website</h2>
        </div>
        <div className="than">
          <MaNhung nhan="Đường dẫn trực tiếp (thêm ?utm_source=…&utm_campaign=… khi chạy quảng cáo)" ma={url} />
          <MaNhung
            nhan="Mã nhúng iframe vào website (chỉ trang https)"
            ma={`<iframe src="${url}" title="${f.tieuDe.replace(/"/g, "'")}" width="100%" height="640" style="border:0;max-width:560px" loading="lazy"></iframe>`}
          />
          <p className="phu nho" style={{ margin: 0 }}>
            Form nhúng iframe không tự đọc UTM của trang cha — thêm UTM vào chính địa chỉ trong src nếu cần.
          </p>
        </div>
      </section>
      {ct.duocSua ? (
        <FormSuaForm
          chienDich={cd}
          nguon={nguon}
          banDau={{
            id, ten: f.ten, slug: f.slug, tieuDe: f.tieuDe, gioiThieu: f.gioiThieu ?? "", truong: f.truong, nutGui: f.nutGui ?? "",
            loiCamOn: f.loiCamOn ?? "", cauDongY: f.cauDongY ?? "", chienDichId: f.chienDich?.id ?? "", nguon: f.nguon ?? "",
            trangThai: f.trangThai === "tat" ? "tat" : "hoat-dong",
          }}
        />
      ) : (
        <section className="the">
          <div className="than phu">Bạn chỉ xem được form này. Trường: {f.truong.map((t) => t.nhan).join(", ")}.</div>
        </section>
      )}
    </>
  );
}
