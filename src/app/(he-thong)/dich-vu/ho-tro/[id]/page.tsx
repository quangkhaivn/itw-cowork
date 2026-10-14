import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgay, dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { chiTietPhieu } from "@/modules/ho-tro/service";
import {
  LOP_TRANG_THAI_PHIEU, LOP_UU_TIEN_PHIEU, NHAN_LOAI_PHIEU, NHAN_MUC_SLA,
  NHAN_TRANG_THAI_PHIEU, NHAN_UU_TIEN_PHIEU,
} from "@/modules/ho-tro/tinh-toan";
import TacVuPhieu from "./TacVuPhieu";

export const dynamic = "force-dynamic";

const NHAN_DIEN_BIEN: Record<string, string> = {
  "tiep-nhan": "Tiếp nhận",
  "ghi-chu": "Ghi chú nội bộ",
  "giao-viec": "Giao việc",
  "doi-trang-thai": "Đổi trạng thái",
  "phan-hoi-khach": "Đã liên hệ khách",
  "hoan-thanh": "Xử lý xong",
  dong: "Đóng phiếu",
  "mo-lai": "Mở lại phiếu",
};

export default async function TrangChiTietPhieu({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("service_desk.view");
  const { id } = await params;
  const moTao = layMot((await searchParams).moTao) === "1";

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietPhieu(nc, id);
      return { ct, nguoi: await danhSachNguoiPhuTrach(nc, "service_desk.update") };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const { ct, nguoi } = du;
  const p = ct.phieu;
  const slaPhanHoi = NHAN_MUC_SLA[p.mucPhanHoi];
  const slaXuLy = NHAN_MUC_SLA[p.mucXuLy];

  return (
    <>
      <DauTrang
        tieuDe={`${p.so} — ${p.tieuDe}`}
        duongDan={[{ nhan: "Dịch vụ" }, { nhan: "Phiếu hỗ trợ", href: "/dich-vu/ho-tro" }]}
        moTa={
          <>
            <Link href={`/crm/khach-hang/${p.khachHang.id}`}>{p.khachHang.ten}</Link>
            {p.khachHang.dienThoai && ` · ${p.khachHang.dienThoai}`}
            {" · "}
            {NHAN_LOAI_PHIEU[p.loai] ?? p.loai}
            {" · Tiếp nhận: "}
            {p.nguoiTiepNhan.hoTen}
          </>
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã mở phiếu {p.so}. Giao cho kỹ thuật và ghi lại mỗi lần liên hệ khách.
        </div>
      )}

      {(ct.quyen.ghiDienBien || ct.quyen.giao || ct.quyen.doiTrangThai) && (
        <section className="the" style={{ padding: 16 }}>
          <TacVuPhieu
            phieuId={p.id}
            trangThai={p.trangThai}
            quyen={ct.quyen}
            nguoiXuLy={nguoi.map((n) => ({ id: n.id, fullName: n.fullName }))}
            nguoiXuLyHienTai={p.nguoiXuLy?.id ?? null}
          />
        </section>
      )}

      <div className="luoi-ben-phai">
        <div>
          <section className="the">
            <div className="dau">
              <h2>Diễn biến</h2>
              <span className={`huy-hieu ${LOP_TRANG_THAI_PHIEU[p.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_PHIEU[p.trangThai] ?? p.trangThai}</span>
            </div>
            {p.moTa && (
              <div className="than" style={{ borderBottom: "1px solid var(--vien)" }}>
                <strong>Khách mô tả:</strong>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{p.moTa}</p>
              </div>
            )}
            {ct.dienBien.length === 0 ? (
              <TrongRong tieuDe="Chưa có diễn biến nào">Ghi lại mỗi lần gọi khách, mỗi lần tới nơi — sau này còn tra.</TrongRong>
            ) : (
              <ul className="ds-tuong-tac">
                {ct.dienBien.map((d) => (
                  <li key={d.id}>
                    <div className="dau-dong">
                      <strong>{NHAN_DIEN_BIEN[d.loai] ?? d.loai}</strong>
                      <span className="phu">{dinhDangNgayGio(d.luc)}</span>
                      {d.nguoi && <span className="phu">· {d.nguoi}</span>}
                      {d.denTrangThai && d.tuTrangThai && (
                        <span className="huy-hieu">
                          {NHAN_TRANG_THAI_PHIEU[d.tuTrangThai] ?? d.tuTrangThai} → {NHAN_TRANG_THAI_PHIEU[d.denTrangThai] ?? d.denTrangThai}
                        </span>
                      )}
                    </div>
                    {d.noiDung && <p>{d.noiDung}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {p.cachXuLy && (
            <section className="the">
              <div className="dau">
                <h2>Cách xử lý</h2>
              </div>
              <div className="than">
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.cachXuLy}</p>
              </div>
            </section>
          )}
        </div>

        <div>
          <section className="the">
            <div className="dau">
              <h2>Cam kết dịch vụ</h2>
            </div>
            <dl className="bang-thong-tin">
              <div>
                <dt>Ưu tiên</dt>
                <dd>
                  <span className={`huy-hieu ${LOP_UU_TIEN_PHIEU[p.uuTien] ?? ""}`}>{NHAN_UU_TIEN_PHIEU[p.uuTien] ?? p.uuTien}</span>
                </dd>
              </div>
              <div>
                <dt>Phản hồi</dt>
                <dd>
                  <span className={`huy-hieu ${slaPhanHoi.lop}`}>{slaPhanHoi.nhan}</span>
                  <div className="dong-phu">
                    {p.hanPhanHoi ? `hạn ${dinhDangNgayGio(p.hanPhanHoi)}` : "chưa đặt ngưỡng"}
                    {p.phanHoiLuc ? ` · đã phản hồi ${dinhDangNgayGio(p.phanHoiLuc)}` : ""}
                  </div>
                </dd>
              </div>
              <div>
                <dt>Xử lý xong</dt>
                <dd>
                  <span className={`huy-hieu ${slaXuLy.lop}`}>{slaXuLy.nhan}</span>
                  <div className="dong-phu">
                    {p.hanXuLy ? `hạn ${dinhDangNgayGio(p.hanXuLy)}` : "chưa đặt ngưỡng"}
                    {p.xongLuc ? ` · xong ${dinhDangNgayGio(p.xongLuc)}` : ""}
                  </div>
                </dd>
              </div>
              <div>
                <dt>Người xử lý</dt>
                <dd>{p.nguoiXuLy?.hoTen ?? <span className="mo">Chưa giao</span>}</dd>
              </div>
              <div>
                <dt>Mở lúc</dt>
                <dd>{dinhDangNgayGio(p.taoLuc)}</dd>
              </div>
              {p.dongLuc && (
                <div>
                  <dt>Đóng lúc</dt>
                  <dd>{dinhDangNgayGio(p.dongLuc)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="the">
            <div className="dau">
              <h2>Máy và chứng từ</h2>
            </div>
            <dl className="bang-thong-tin">
              <div>
                <dt>Bảo hành</dt>
                <dd>
                  {p.baoHanh ? (
                    <>
                      <Link href={`/dich-vu/bao-hanh/${p.baoHanh.id}`}>{p.baoHanh.serial ?? p.baoHanh.tenHang}</Link>
                      <div className="dong-phu">
                        {p.baoHanh.tenHang} · đến {dinhDangNgay(p.baoHanh.hetHan)}
                      </div>
                    </>
                  ) : (
                    <span className="mo">Không gắn máy</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Đơn hàng</dt>
                <dd>
                  {p.donHang && coQuyen(nd.hoSo, "order.view") ? (
                    <Link href={`/ban-hang/don-hang/${p.donHang.id}`}>{p.donHang.so}</Link>
                  ) : (
                    <span className="mo">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Dự án</dt>
                <dd>
                  {p.duAn && coQuyen(nd.hoSo, "project.view") ? (
                    <Link href={`/du-an/${p.duAn.id}`}>{p.duAn.ma}</Link>
                  ) : (
                    <span className="mo">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Người liên hệ</dt>
                <dd>{p.lienHe ? `${p.lienHe.hoTen}${p.lienHe.dienThoai ? ` · ${p.lienHe.dienThoai}` : ""}` : <span className="mo">Chưa chọn</span>}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
