import Link from "next/link";
import { notFound } from "next/navigation";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgay, dinhDangPhanTram, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc } from "@/modules/crm/chung";
import { chiTietBaoGia, soPhienBan, xemPhienBan } from "@/modules/bao-gia/service";
import { docTienBangChu, NHAN_TRANG_THAI_BAO_GIA } from "@/modules/bao-gia/tinh-toan";
import { docHoSoCongTy } from "@/modules/ho-so-cong-ty/service";
import NutIn from "./NutIn";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bản in báo giá — in ra giấy hoặc lưu PDF bằng chính hộp thoại in của trình duyệt (QĐ-21).
 *
 * Không dùng thư viện sinh PDF: bản in là HTML có `@media print`, nên sửa mẫu chỉ là sửa
 * CSS, và font tiếng Việt luôn đúng vì dùng font hệ thống.
 *
 * Thông tin công ty lấy từ Hồ sơ công ty (Quản trị → Hồ sơ công ty). Chưa khai thì để
 * trống kèm nhắc — KHÔNG điền dữ liệu pháp nhân tự nghĩ ra (mục 5 luật vault).
 */
export default async function BanInBaoGia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("quotation.view");
  const { id } = await params;
  const banId = layMot((await searchParams).phienBan);

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietBaoGia(nc, id);
      const ban = LA_UUID.test(banId) && banId !== ct.baoGia.phienBanHienHanh?.id ? (await xemPhienBan(nc, id, banId)).phienBan : ct.baoGia.phienBanHienHanh;
      if (!ban) return null;
      return {
        bg: ct.baoGia,
        pb: ban,
        congTy: await docHoSoCongTy(tx, nd.phien.tenantId),
        tenDieuKhoan: await banDoTenDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "don_vi_tinh"]),
      };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const { bg, pb, congTy, tenDieuKhoan } = du;
  const thieu = [
    ["Địa chỉ công ty", congTy["cong_ty.dia_chi"]],
    ["Mã số thuế", congTy["cong_ty.ma_so_thue"]],
    ["Điện thoại", congTy["cong_ty.dien_thoai"]],
    ["Người ký", congTy["cong_ty.nguoi_ky"]],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  return (
    <div className="trang-in">
      <div className="thanh-in khong-in">
        <Link href={`/ban-hang/bao-gia/${bg.id}`}>← Về báo giá</Link>
        <span>
          {soPhienBan(bg.so, pb.phienBan)} · {NHAN_TRANG_THAI_BAO_GIA[pb.trangThai] ?? pb.trangThai}
        </span>
        <NutIn />
      </div>

      {thieu.length > 0 && (
        <div className="hop-thong-bao canh-bao khong-in" role="status">
          Hồ sơ công ty còn thiếu: {thieu.join(", ")}. Bản in sẽ để trống những mục này.{" "}
          <Link href="/quan-tri/ho-so-cong-ty">Khai hồ sơ công ty</Link>
        </div>
      )}

      <article className="to-in">
        <header className="dau-in">
          <div>
            <h1>{congTy.tenHienThi}</h1>
            <dl>
              {congTy["cong_ty.dia_chi"] && (
                <div>
                  <dt>Địa chỉ:</dt>
                  <dd>{congTy["cong_ty.dia_chi"]}</dd>
                </div>
              )}
              {congTy["cong_ty.ma_so_thue"] && (
                <div>
                  <dt>Mã số thuế:</dt>
                  <dd>{congTy["cong_ty.ma_so_thue"]}</dd>
                </div>
              )}
              {(congTy["cong_ty.dien_thoai"] || congTy["cong_ty.email"]) && (
                <div>
                  <dt>Liên hệ:</dt>
                  <dd>
                    {congTy["cong_ty.dien_thoai"]}
                    {congTy["cong_ty.dien_thoai"] && congTy["cong_ty.email"] ? " · " : ""}
                    {congTy["cong_ty.email"]}
                  </dd>
                </div>
              )}
              {congTy["cong_ty.website"] && (
                <div>
                  <dt>Website:</dt>
                  <dd>{congTy["cong_ty.website"]}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="so-in">
            <h2>BÁO GIÁ</h2>
            <div className="so">{soPhienBan(bg.so, pb.phienBan)}</div>
            <div>Ngày: {dinhDangNgay(pb.guiLuc ?? pb.taoLuc)}</div>
            {pb.hieuLucDen && <div>Hiệu lực đến: {dinhDangNgay(pb.hieuLucDen)}</div>}
          </div>
        </header>

        <section className="khach-in">
          <h3>Kính gửi</h3>
          <div className="ten-khach">{bg.khachHang.ten}</div>
          <dl>
            {bg.lienHe && (
              <div>
                <dt>Người nhận:</dt>
                <dd>
                  {bg.lienHe.hoTen}
                  {bg.lienHe.chucDanh ? ` — ${bg.lienHe.chucDanh}` : ""}
                  {bg.lienHe.dienThoai ? ` · ${bg.lienHe.dienThoai}` : ""}
                </dd>
              </div>
            )}
            {bg.khachHang.diaChi && (
              <div>
                <dt>Địa chỉ:</dt>
                <dd>{bg.khachHang.diaChi}</dd>
              </div>
            )}
            {bg.khachHang.maSoThue && (
              <div>
                <dt>Mã số thuế:</dt>
                <dd>{bg.khachHang.maSoThue}</dd>
              </div>
            )}
          </dl>
          <p className="loi-mo">
            {congTy.tenHienThi} trân trọng gửi Quý khách bảng báo giá cho các hạng mục dưới đây. Đơn giá tính bằng đồng Việt Nam (VND).
          </p>
        </section>

        <table className="bang-in">
          <thead>
            <tr>
              <th className="so">STT</th>
              <th>Hàng hóa / dịch vụ</th>
              <th className="so">SL</th>
              <th>ĐVT</th>
              <th className="so">Đơn giá</th>
              {Number(pb.tongChietKhau) > 0 && <th className="so">CK</th>}
              <th className="so">VAT</th>
              <th className="so">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {pb.dong.map((d, i) => (
              <tr key={d.id}>
                <td className="so">{i + 1}</td>
                <td>
                  <strong>{d.ten}</strong>
                  {d.moTa && <div className="mo-ta-in">{d.moTa}</div>}
                </td>
                <td className="so">{Number(d.soLuong).toLocaleString("vi-VN")}</td>
                <td>{(d.donViTinh ? tenDieuKhoan.don_vi_tinh?.[d.donViTinh] : null) ?? d.donViTinh ?? ""}</td>
                <td className="so">{dinhDangTien(d.donGia)}</td>
                {Number(pb.tongChietKhau) > 0 && <td className="so">{Number(d.chietKhau) > 0 ? dinhDangPhanTram(d.chietKhau) : "—"}</td>}
                <td className="so">{dinhDangPhanTram(d.vat)}</td>
                <td className="so">{dinhDangTien(d.thanhTien)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="tong-in">
          <dl>
            <div>
              <dt>Tạm tính</dt>
              <dd>{dinhDangTien(pb.tamTinh)}</dd>
            </div>
            {Number(pb.tongChietKhau) > 0 && (
              <div>
                <dt>Chiết khấu</dt>
                <dd>− {dinhDangTien(pb.tongChietKhau)}</dd>
              </div>
            )}
            <div>
              <dt>Thuế GTGT</dt>
              <dd>{dinhDangTien(pb.tongVat)}</dd>
            </div>
            <div className="tong-cong">
              <dt>Tổng cộng</dt>
              <dd>{dinhDangTien(pb.tongCong)}</dd>
            </div>
          </dl>
          <p className="bang-chu">Bằng chữ: {docTienBangChu(Number(pb.tongCong))}</p>
        </div>

        {(pb.dieuKhoanThanhToan || pb.dieuKhoanGiaoHang || pb.dieuKhoanBaoHanh || congTy["cong_ty.dieu_khoan_mac_dinh"] || congTy["cong_ty.ngan_hang"]) && (
          <section className="dieu-khoan-in">
            <h3>Điều khoản</h3>
            <ul>
              {pb.dieuKhoanThanhToan && <li>Thanh toán: {tenDieuKhoan.dieu_khoan_thanh_toan?.[pb.dieuKhoanThanhToan] ?? pb.dieuKhoanThanhToan}</li>}
              {pb.dieuKhoanGiaoHang && <li>Giao hàng: {tenDieuKhoan.dieu_khoan_giao_hang?.[pb.dieuKhoanGiaoHang] ?? pb.dieuKhoanGiaoHang}</li>}
              {pb.dieuKhoanBaoHanh && <li>Bảo hành: {pb.dieuKhoanBaoHanh}</li>}
              {congTy["cong_ty.ngan_hang"] && congTy["cong_ty.so_tai_khoan"] && (
                <li>
                  Tài khoản nhận tiền: {congTy["cong_ty.so_tai_khoan"]} — {congTy["cong_ty.ngan_hang"]}
                  {congTy["cong_ty.chu_tai_khoan"] ? ` — ${congTy["cong_ty.chu_tai_khoan"]}` : ""}
                </li>
              )}
            </ul>
            {congTy["cong_ty.dieu_khoan_mac_dinh"] && <p className="dieu-khoan-chung">{congTy["cong_ty.dieu_khoan_mac_dinh"]}</p>}
          </section>
        )}

        <footer className="chan-in">
          <div>
            <div className="nhan-ky">Người lập báo giá</div>
            <div className="cho-ky" />
            <div className="ten-ky">{bg.nguoiPhuTrach.hoTen}</div>
            {bg.nguoiPhuTrach.dienThoai && <div className="phu-ky">{bg.nguoiPhuTrach.dienThoai}</div>}
            {bg.nguoiPhuTrach.email && <div className="phu-ky">{bg.nguoiPhuTrach.email}</div>}
          </div>
          <div>
            <div className="nhan-ky">Đại diện {congTy.tenHienThi}</div>
            <div className="cho-ky" />
            <div className="ten-ky">{congTy["cong_ty.nguoi_ky"]}</div>
            {congTy["cong_ty.chuc_vu_nguoi_ky"] && <div className="phu-ky">{congTy["cong_ty.chuc_vu_nguoi_ky"]}</div>}
          </div>
        </footer>
      </article>
    </div>
  );
}
