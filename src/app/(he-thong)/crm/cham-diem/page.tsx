import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { xemCauHinhDiem } from "@/modules/cham-diem/service";
import { DANH_MUC_CAU_HINH } from "@/modules/cau-hinh/danh-muc";
import { DiemNguon, NutTinhLai } from "./CauHinhDiem";

export const dynamic = "force-dynamic";

export default async function TrangChamDiem() {
  const nd = await yeuCauQuyen("customer.view");
  const kq = await docDuLieu(nd, (tx) => xemCauHinhDiem(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const daDat = new Set(kq.daDat);
  const muc = DANH_MUC_CAU_HINH.filter((m) => m.khoa.startsWith("diem_khach."));
  const giaTri: Record<string, number | null> = {
    so_ngay_tuong_tac: kq.cauHinh.soNgayTuongTac,
    diem_moi_tuong_tac: kq.cauHinh.diemMoiTuongTac,
    tuong_tac_toi_da: kq.cauHinh.tuongTacToiDa,
    diem_moi_lan_gap: kq.cauHinh.diemMoiLanGap,
    gap_toi_da: kq.cauHinh.gapToiDa,
    so_ngay_im_lang: kq.cauHinh.soNgayImLang,
    diem_tru_im_lang: kq.cauHinh.diemTruImLang,
    diem_co_hoi_mo: kq.cauHinh.diemCoHoiMo,
    diem_bao_gia: kq.cauHinh.diemBaoGia,
    so_ngay_bao_gia: kq.cauHinh.soNgayBaoGia,
    diem_da_mua: kq.cauHinh.diemDaMua,
    diem_du_lien_he: kq.cauHinh.diemDuLienHe,
    nguong_nong: kq.cauHinh.nguongNong,
    nguong_am: kq.cauHinh.nguongAm,
  };

  return (
    <>
      <DauTrang
        tieuDe="Chấm điểm khách"
        duongDan={[{ nhan: "CRM" }]}
        moTa="Điểm 0–100 cho từng khách, cộng từ tín hiệu có thật trong hệ thống: nguồn khách, tương tác gần đây, gặp mặt, im lặng lâu, cơ hội đang mở, báo giá đã gửi, đã có đơn, có cách liên lạc. Không dùng giá vốn, không dùng AI. Điểm tự tính lại khi có tương tác, cơ hội, báo giá, đơn hàng mới."
        hanhDong={kq.quyen.tinhLai && <NutTinhLai />}
      />

      {!kq.thongKe.coHang && (
        <div className="hop-thong-bao canh-bao" role="status">
          Chưa đặt đủ ngưỡng điểm Nóng / Ấm (hoặc ngưỡng Ấm không nhỏ hơn ngưỡng Nóng) — hệ thống vẫn chấm điểm và sắp xếp theo điểm, nhưng chưa xếp hạng Nóng / Ấm / Lạnh và bộ lọc “Khách nóng” chưa dùng được.
          {coQuyen(nd.hoSo, "setting.view") && (
            <>
              {" "}
              Đặt ở <Link href="/quan-tri/cau-hinh">Quản trị → Cấu hình</Link>, nhóm “Chấm điểm khách hàng”.
            </>
          )}
        </div>
      )}

      <div className="luoi-chi-so">
        {kq.thongKe.coHang && (
          <>
            <div className="the chi-so">
              <div className="nhan">Khách Nóng</div>
              <div className="gia-tri">{dinhDangSo(kq.thongKe.nong)}</div>
              <div className="ghi-chu">Từ {kq.cauHinh.nguongNong} điểm</div>
            </div>
            <div className="the chi-so">
              <div className="nhan">Khách Ấm</div>
              <div className="gia-tri">{dinhDangSo(kq.thongKe.am)}</div>
              <div className="ghi-chu">Từ {kq.cauHinh.nguongAm} điểm</div>
            </div>
            <div className="the chi-so">
              <div className="nhan">Khách Lạnh</div>
              <div className="gia-tri">{dinhDangSo(kq.thongKe.lanh)}</div>
            </div>
          </>
        )}
        <div className="the chi-so">
          <div className="nhan">Chưa có điểm</div>
          <div className="gia-tri">{dinhDangSo(kq.thongKe.chuaCo)}</div>
          <div className="ghi-chu">Khách chưa phát sinh sự kiện nào kể từ khi bật chấm điểm</div>
        </div>
      </div>

      <div className="luoi-the">
        <section className="the">
          <div className="dau">
            <h2>Trọng số đang dùng</h2>
            {coQuyen(nd.hoSo, "setting.update") && (
              <Link className="nho" href="/quan-tri/cau-hinh">
                Sửa ở Cấu hình
              </Link>
            )}
          </div>
          <div className="cuon-ngang">
            <table className="bang">
              <tbody>
                {muc.map((m) => {
                  const k = m.khoa.replace("diem_khach.", "");
                  const v = giaTri[k];
                  return (
                    <tr key={m.khoa}>
                      <td>{m.nhan}</td>
                      <td className="so">
                        {v === null ? <span className="huy-hieu canh-bao">Chưa đặt</span> : `${dinhDangSo(v)} ${m.donVi}`}
                      </td>
                      <td>{daDat.has(m.khoa) ? <span className="huy-hieu tot">Giám đốc đã đặt</span> : m.macDinh !== null ? <span className="huy-hieu">Mặc định</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="the">
          <div className="dau">
            <h2>Điểm theo nguồn khách</h2>
          </div>
          <DiemNguon nguon={kq.nguon} duocSua={kq.quyen.suaCauHinh} />
        </section>
      </div>
    </>
  );
}
