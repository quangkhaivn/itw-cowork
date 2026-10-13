import Link from "next/link";
import { notFound } from "next/navigation";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgay, dinhDangPhanTram, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc } from "@/modules/crm/chung";
import { chiTietBaoGia, soPhienBan, xemPhienBan } from "@/modules/bao-gia/service";
import { docTienBangChu, NHAN_TRANG_THAI_BAO_GIA } from "@/modules/bao-gia/tinh-toan";
import { docHoSoCongTy, docLogoCongTy } from "@/modules/ho-so-cong-ty/service";
import NutIn from "./NutIn";

export const dynamic = "force-dynamic";

const CHAM = "………………";
const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bản in báo giá — in ra giấy hoặc lưu PDF bằng chính hộp thoại in của trình duyệt (QĐ-21).
 *
 * Không dùng thư viện sinh PDF: bản in là HTML có `@media print`, nên sửa mẫu chỉ là sửa
 * CSS, và font tiếng Việt luôn đúng vì dùng font hệ thống.
 *
 * Bố cục theo mẫu PDF báo giá của ITW CRM (0.16.0): logo + đầu công ty, dải tiêu đề, khối khách
 * hàng, bảng hàng có VAT, khối tổng + bằng chữ, điều khoản đánh số, ký tên hai bên.
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
        logo: await docLogoCongTy(tx),
        tenDieuKhoan: await banDoTenDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "don_vi_tinh"]),
      };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const { bg, pb, congTy, tenDieuKhoan, logo } = du;
  const coCk = Number(pb.tongChietKhau) > 0;
  // Điều khoản đánh số như mẫu ITW: từng điều khoản của phiên bản, điều khoản chung của công ty,
  // rồi dòng "TK" thông tin chuyển khoản.
  const dieuKhoan: { loai: "so" | "tk"; noiDung: string }[] = [
    ...(pb.dieuKhoanThanhToan ? [{ loai: "so" as const, noiDung: `Thanh toán: ${tenDieuKhoan.dieu_khoan_thanh_toan?.[pb.dieuKhoanThanhToan] ?? pb.dieuKhoanThanhToan}` }] : []),
    ...(pb.dieuKhoanGiaoHang ? [{ loai: "so" as const, noiDung: `Giao hàng: ${tenDieuKhoan.dieu_khoan_giao_hang?.[pb.dieuKhoanGiaoHang] ?? pb.dieuKhoanGiaoHang}` }] : []),
    ...(pb.dieuKhoanBaoHanh ? [{ loai: "so" as const, noiDung: `Bảo hành: ${pb.dieuKhoanBaoHanh}` }] : []),
    ...(congTy["cong_ty.dieu_khoan_mac_dinh"] || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => ({ loai: "so" as const, noiDung: x })),
    ...(congTy["cong_ty.ngan_hang"] && congTy["cong_ty.so_tai_khoan"]
      ? [
          {
            loai: "tk" as const,
            noiDung: `Thông tin chuyển khoản: ${congTy["cong_ty.so_tai_khoan"]} — ${congTy["cong_ty.ngan_hang"]}${congTy["cong_ty.chu_tai_khoan"] ? ` — ${congTy["cong_ty.chu_tai_khoan"]}` : ""}`,
          },
        ]
      : []),
  ];
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

      <article className="to-in mau-itw">
        {/* 1. Đầu trang: logo + thông tin công ty (bố cục theo mẫu báo giá ITW) */}
        <header className="dau-itw">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- logo nhúng data: URI từ Hồ sơ công ty
            <img className="logo-itw" src={`data:${logo.mime};base64,${logo.duLieu}`} alt={congTy.tenHienThi} />
          )}
          <div className="cty-itw">
            <h1>{congTy.tenHienThi}</h1>
            {congTy["cong_ty.dia_chi"] && (
              <div>
                <b>Đ/c:</b> {congTy["cong_ty.dia_chi"]}
              </div>
            )}
            {(congTy["cong_ty.dien_thoai"] || congTy["cong_ty.email"]) && (
              <div>
                {congTy["cong_ty.dien_thoai"] && (
                  <>
                    <b>ĐT:</b> {congTy["cong_ty.dien_thoai"]}
                  </>
                )}
                {congTy["cong_ty.dien_thoai"] && congTy["cong_ty.email"] ? <span className="cach"> | </span> : null}
                {congTy["cong_ty.email"] && (
                  <>
                    <b>Email:</b> {congTy["cong_ty.email"]}
                  </>
                )}
              </div>
            )}
            {(congTy["cong_ty.website"] || congTy["cong_ty.ma_so_thue"]) && (
              <div>
                {congTy["cong_ty.website"] && (
                  <>
                    <b>Web:</b> {congTy["cong_ty.website"]}
                  </>
                )}
                {congTy["cong_ty.website"] && congTy["cong_ty.ma_so_thue"] ? <span className="cach"> | </span> : null}
                {congTy["cong_ty.ma_so_thue"] && (
                  <>
                    <b>MST:</b> {congTy["cong_ty.ma_so_thue"]}
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* 2. Dải tiêu đề + dòng số / ngày / hiệu lực */}
        <div className="dai-itw tieu-de">BẢNG BÁO GIÁ</div>
        <div className="dai-itw phu">QUOTATION / PROPOSAL</div>
        <div className="thong-tin-itw">
          <span>
            <b>SỐ BG:</b> {soPhienBan(bg.so, pb.phienBan)}
          </span>
          <span>
            <b>NGÀY:</b> {dinhDangNgay(pb.guiLuc ?? pb.taoLuc)}
          </span>
          <span>{pb.hieuLucDen ? `Hiệu lực đến: ${dinhDangNgay(pb.hieuLucDen)}` : ""}</span>
        </div>

        {/* 3. Khối khách hàng */}
        <div className="dai-itw muc">KÍNH GỬI {bg.khachHang.ten.toUpperCase()}</div>
        <table className="khach-itw">
          <tbody>
            <tr>
              <td colSpan={3}>
                <b>Tên khách hàng/Công ty:</b> {bg.khachHang.ten}
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <b>Địa chỉ:</b> {bg.khachHang.diaChi || CHAM}
              </td>
              <td>
                <b>Người liên hệ:</b> {bg.lienHe ? `${bg.lienHe.hoTen}${bg.lienHe.chucDanh ? ` (${bg.lienHe.chucDanh})` : ""}` : CHAM}
              </td>
            </tr>
            <tr>
              <td>
                <b>MST:</b> {bg.khachHang.maSoThue || CHAM}
              </td>
              <td>
                <b>Điện thoại:</b> {bg.lienHe?.dienThoai || bg.khachHang.dienThoai || CHAM}
              </td>
              <td>
                <b>Email:</b> {bg.lienHe?.email || bg.khachHang.email || CHAM}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="loi-mo-itw">{congTy.tenHienThi} xin trân trọng gửi đến Quý khách hàng bảng báo giá sản phẩm/dịch vụ như sau:</p>

        {/* 4. Bảng hàng — có VAT từng dòng */}
        <div className="cuon-ngang">
        <table className="bang-in bang-itw">
          <thead>
            <tr>
              <th className="giua-itw">STT</th>
              <th>Mã SP</th>
              <th>Tên sản phẩm / Mô tả</th>
              <th className="giua-itw">ĐVT</th>
              <th className="giua-itw">SL</th>
              <th className="so">Đơn giá (VNĐ)</th>
              {coCk && <th className="so">CK</th>}
              <th className="so">VAT</th>
              <th className="so">Thành tiền (VNĐ)</th>
            </tr>
          </thead>
          <tbody>
            {pb.dong.map((d, i) => (
              <tr key={d.id}>
                <td className="giua-itw">{i + 1}</td>
                <td className="nho-itw">{d.sku ?? ""}</td>
                <td>
                  <strong>{d.ten}</strong>
                  {d.moTa && <div className="mo-ta-in">{d.moTa}</div>}
                </td>
                <td className="giua-itw">{(d.donViTinh ? tenDieuKhoan.don_vi_tinh?.[d.donViTinh] : null) ?? d.donViTinh ?? ""}</td>
                <td className="giua-itw">{Number(d.soLuong).toLocaleString("vi-VN")}</td>
                <td className="so">{dinhDangSo(Math.round(Number(d.donGia)))}</td>
                {coCk && <td className="so">{Number(d.chietKhau) > 0 ? dinhDangPhanTram(d.chietKhau) : "—"}</td>}
                <td className="so">{dinhDangPhanTram(d.vat)}</td>
                <td className="so">
                  <strong>{dinhDangSo(Math.round(Number(d.thanhTien)))}</strong>
                </td>
              </tr>
            ))}
            {pb.dong.length === 0 && (
              <tr>
                <td colSpan={coCk ? 9 : 8} className="giua-itw">
                  (Chưa có dòng hàng)
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* 5. Khối tổng */}
        <table className="tong-itw">
          <tbody>
            <tr>
              <th>Cộng tiền hàng</th>
              <td>{dinhDangTien(pb.tamTinh)}</td>
            </tr>
            {Number(pb.tongChietKhau) > 0 && (
              <tr>
                <th>Chiết khấu</th>
                <td>− {dinhDangTien(pb.tongChietKhau)}</td>
              </tr>
            )}
            <tr>
              <th>Thuế GTGT (VAT)</th>
              <td>{dinhDangTien(pb.tongVat)}</td>
            </tr>
            <tr className="tong-cong">
              <th>TỔNG CỘNG THANH TOÁN</th>
              <td>{dinhDangTien(pb.tongCong)}</td>
            </tr>
            <tr className="bang-chu">
              <td colSpan={2}>Bằng chữ: {docTienBangChu(Number(pb.tongCong))}</td>
            </tr>
          </tbody>
        </table>

        {/* 6. Điều khoản */}
        {dieuKhoan.length > 0 && (
          <section className="dieu-khoan-itw">
            <div className="dai-itw muc">ĐIỀU KHOẢN &amp; GHI CHÚ</div>
            <table>
              <tbody>
                {dieuKhoan.map((dk, i) => (
                  <tr key={i}>
                    <td className={`so-dk ${dk.loai}`}>{dk.loai === "tk" ? "TK" : String(i + 1).padStart(2, "0")}</td>
                    <td>{dk.noiDung}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 7. Ký tên */}
        <footer className="ky-itw">
          <div>
            <div className="dai-ky">KHÁCH HÀNG</div>
            <div className="ghi-ky">(Ký, ghi rõ họ tên)</div>
            <div className="cho-ky" />
          </div>
          <div>
            <div className="dai-ky">{congTy.tenHienThi.toUpperCase()}</div>
            <div className="ghi-ky">(Ký, đóng dấu)</div>
            <div className="cho-ky" />
            <div className="ten-ky">{congTy["cong_ty.nguoi_ky"]}</div>
            {congTy["cong_ty.chuc_vu_nguoi_ky"] && <div className="phu-ky">{congTy["cong_ty.chuc_vu_nguoi_ky"]}</div>}
          </div>
        </footer>
        <p className="lap-boi-itw">
          Người lập: <b>{bg.nguoiPhuTrach.hoTen}</b>
          {bg.nguoiPhuTrach.dienThoai ? ` · ĐT: ${bg.nguoiPhuTrach.dienThoai}` : ""}
          {bg.nguoiPhuTrach.email ? ` · ${bg.nguoiPhuTrach.email}` : ""}
        </p>
      </article>
    </div>
  );
}
