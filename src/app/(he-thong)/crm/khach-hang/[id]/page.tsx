import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import { NHAN_MUC_DO_HO_SO } from "@/modules/khach-hang/ho-so";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import GhiTuongTac from "@/components/crm/GhiTuongTac";
import NutTaoViec from "@/components/crm/NutTaoViec";
import DongThoiGian from "@/components/crm/DongThoiGian";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangNgayGio, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc, danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import {
  LOP_GIAI_DOAN,
  NHAN_GIAI_DOAN,
  NHAN_TRANG_THAI_KHACH,
  NHAN_TRANG_THAI_VIEC,
  NHAN_TUONG_TAC,
  NHAN_UU_TIEN,
  NHAN_DANH_GIA_KET_QUA,
} from "@/modules/crm/hang-so";
import { khach360, LOAI_DU_LIEU_KHACH, quyenGiaoDienKhach } from "@/modules/khach-hang/service";
import FormKhachHang from "../FormKhachHang";
import QuanLyLienHe from "./QuanLyLienHe";
import { DoiHanhTrinh, NhomCuaKhach } from "./HanhTrinhKhach";
import { docDanhMucTrangThai, lichSuHanhTrinh } from "@/modules/hanh-trinh/service";
import { danhSachNhomKhach, nhomCuaKhach } from "@/modules/nhom-khach/service";
import { diemCuaKhach } from "@/modules/cham-diem/service";
import { NHAN_HANG } from "@/modules/cham-diem/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THE = ["tong-quan", "hanh-trinh", "lien-he", "co-hoi", "tuong-tac", "cong-viec", "dong-thoi-gian", "sua"] as const;
type The = (typeof THE)[number];

export default async function TrangKhach360({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("customer.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const sp = await searchParams;
  const tabYeuCau = layMot(sp.tab) as The;
  const moTao = layMot(sp.moTao) === "1";

  const duLieu = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const d = await khach360(nc, id);
      const quyen = await quyenGiaoDienKhach(nc, d.khach.nguoiPhuTrach.id);
      const tenDuLieu = await banDoTenDuLieuGoc(nc, LOAI_DU_LIEU_KHACH);
      const nguoiViec = quyen.taoViec ? await danhSachNguoiPhuTrach(nc, "task.create") : [];
      const choSua =
        quyen.sua && tabYeuCau === "sua"
          ? { luaChon: await luaChonDuLieuGoc(nc, LOAI_DU_LIEU_KHACH), nguoi: await danhSachNguoiPhuTrach(nc, "customer.update") }
          : null;
      // 0.16.0: hành trình, nhóm, điểm.
      const [danhMucHT, lichSuHT, nhomKhach, tatCaNhom, diem] = await Promise.all([
        docDanhMucTrangThai(tx),
        tabYeuCau === "hanh-trinh" ? lichSuHanhTrinh(nc, id) : Promise.resolve([]),
        nhomCuaKhach(nc, id),
        danhSachNhomKhach(nc),
        diemCuaKhach(nc, id),
      ]);
      return { ...d, quyenUi: quyen, tenDuLieu, nguoiViec, choSua, danhMucHT, lichSuHT, nhomKhach, tatCaNhom: tatCaNhom.nhom, diem };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!duLieu) notFound();
  const { khach, lienHe, coHoi, tuongTac, viec, dongThoiGian, thongKe, hoSo, quyen, quyenUi, tenDuLieu, nguoiViec, choSua, danhMucHT, lichSuHT, nhomKhach, tatCaNhom, diem } = duLieu;
  const daGop = khach.trangThai === "da-gop";
  const suaDuoc = quyenUi.sua && !daGop;
  const tab: The = THE.includes(tabYeuCau) && (tabYeuCau !== "sua" || quyenUi.sua) ? tabYeuCau : "tong-quan";
  const ten = (loai: string, ma: string | null) => (ma ? (tenDuLieu[loai]?.[ma] ?? ma) : "—");

  const cacThe: { ma: The; nhan: string; so?: number; hien: boolean }[] = [
    { ma: "tong-quan", nhan: "Tổng quan", hien: true },
    { ma: "hanh-trinh", nhan: "Hành trình & điểm", hien: true },
    { ma: "lien-he", nhan: "Liên hệ", so: lienHe.filter((l) => l.trangThai === "hoat-dong").length, hien: true },
    { ma: "co-hoi", nhan: "Cơ hội", so: coHoi.length, hien: quyen.xemCoHoi },
    { ma: "tuong-tac", nhan: "Tương tác", so: tuongTac.length, hien: quyen.xemTuongTac },
    { ma: "cong-viec", nhan: "Công việc", so: viec.filter((v) => v.trangThai === "mo" || v.trangThai === "dang-lam").length, hien: quyen.xemViec },
    { ma: "dong-thoi-gian", nhan: "Dòng thời gian", hien: true },
  ];

  return (
    <>
      <DauTrang
        tieuDe={khach.ten}
        duongDan={[{ nhan: "CRM" }, { nhan: "Khách hàng", href: "/crm/khach-hang" }]}
        moTa={
          <>
            {khach.ma}
            {khach.maSoThue && ` · MST ${khach.maSoThue}`} · Phụ trách: {khach.nguoiPhuTrach.hoTen} ·{" "}
            <span className="huy-hieu">{NHAN_TRANG_THAI_KHACH[khach.trangThai] ?? khach.trangThai}</span>{" "}
            {khach.hanhTrinh && (
              <span className="nhan-mau">
                <span className="cham-mau" style={{ "--mau": khach.hanhTrinh.mau } as React.CSSProperties} />
                {khach.hanhTrinh.ten}
              </span>
            )}{" "}
            {khach.diem !== null && (
              <span className={`diem-khach ${diem.hang ?? ""}`} title={diem.hang ? `Khách ${NHAN_HANG[diem.hang]}` : "Chưa đặt ngưỡng Nóng/Ấm"}>
                {khach.diem} điểm{diem.hang ? ` · ${NHAN_HANG[diem.hang]}` : ""}
              </span>
            )}
          </>
        }
        hanhDong={
          <>
            {quyenUi.taoCoHoi && (
              <Link className="nut chinh" href={`/ban-hang/co-hoi/moi?khachHang=${khach.id}`}>
                <BieuTuong ten="them" co={16} /> Tạo cơ hội
              </Link>
            )}
            {quyenUi.taoViec && <NutTaoViec ganKem={{ khachHangId: khach.id }} nguoiPhuTrach={nguoiViec} toiId={nd.hoSo.userId} />}
            {quyenUi.quanLy && !daGop && (
              <Link className="nut" href={`/crm/khach-hang/gop?giuLai=${khach.id}`}>
                Gộp khách trùng vào đây
              </Link>
            )}
            {suaDuoc && tab !== "sua" && (
              <Link className="nut" href={`/crm/khach-hang/${khach.id}?tab=sua`}>
                Sửa thông tin
              </Link>
            )}
          </>
        }
      />

      {daGop && khach.gopVao && (
        <div className="hop-thong-bao canh-bao" role="status">
          Khách này đã được gộp vào <Link href={`/crm/khach-hang/${khach.gopVao.id}`}>{khach.gopVao.ma} — {khach.gopVao.ten}</Link>
          {khach.gopVao.luc ? ` ngày ${dinhDangNgay(khach.gopVao.luc)}` : ""}. Mọi liên hệ, cơ hội, chứng từ đã chuyển sang khách giữ lại; trang này chỉ còn để tra cứu.
        </div>
      )}

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã tạo khách hàng {khach.ma}. Bước tiếp theo thường là thêm người liên hệ hoặc tạo cơ hội.
        </div>
      )}

      {tab !== "sua" && (
        <nav className="thanh-the" aria-label="Các phần của khách hàng">
          {cacThe
            .filter((t) => t.hien)
            .map((t) => (
              <Link key={t.ma} href={`/crm/khach-hang/${khach.id}${t.ma === "tong-quan" ? "" : `?tab=${t.ma}`}`} aria-current={tab === t.ma ? "page" : undefined}>
                {t.nhan}
                {t.so !== undefined && <span className="dem-the">{t.so}</span>}
              </Link>
            ))}
        </nav>
      )}

      {tab === "sua" && choSua && (
        <FormKhachHang
          luaChon={choSua.luaChon}
          nguoiPhuTrach={choSua.nguoi}
          banDau={{
            id: khach.id,
            ten: khach.ten,
            maSoThue: khach.maSoThue ?? "",
            loaiKhach: khach.loaiKhach ?? "",
            phanKhuc: khach.phanKhuc ?? "",
            nganh: khach.nganh ?? "",
            nguon: khach.nguon ?? "",
            diaChi: khach.diaChi ?? "",
            tinhThanh: khach.tinhThanh ?? "",
            website: khach.website ?? "",
            dienThoai: khach.dienThoai ?? "",
            email: khach.email ?? "",
            nguoiPhuTrachId: khach.nguoiPhuTrach.id,
            ghiChu: khach.ghiChu ?? "",
            trangThai: khach.trangThai,
          }}
        />
      )}

      {tab === "tong-quan" && (
        <>
          <div className="luoi-chi-so">
            {quyen.xemCoHoi && (
              <>
                <div className="the chi-so">
                  <div className="nhan">Cơ hội đang mở</div>
                  <div className="gia-tri">{dinhDangSo(thongKe.soCoHoiMo)}</div>
                  <div className="ghi-chu">Giá trị {dinhDangTien(thongKe.giaTriPipeline)}</div>
                </div>
                <div className="the chi-so">
                  <div className="nhan">Pipeline có trọng số</div>
                  <div className="gia-tri">{dinhDangTien(thongKe.pipelineTrongSo)}</div>
                  <div className="ghi-chu">Giá trị × xác suất</div>
                </div>
                <div className="the chi-so">
                  <div className="nhan">Cơ hội đã thắng</div>
                  <div className="gia-tri">{dinhDangSo(thongKe.soCoHoiThang)}</div>
                  <div className="ghi-chu">Giá trị ước tính {dinhDangTien(thongKe.giaTriDaThang)}</div>
                </div>
              </>
            )}
            <div className="the chi-so">
              <div className="nhan">Tương tác gần nhất</div>
              <div className="gia-tri" style={{ fontSize: 16 }}>{tuongTac[0] ? dinhDangNgay(tuongTac[0].luc) : "Chưa có"}</div>
              <div className="ghi-chu">{tuongTac[0] ? `${NHAN_TUONG_TAC[tuongTac[0].loai]} · ${tuongTac[0].nguoi}` : "Ghi cuộc gọi đầu tiên ở thẻ Tương tác"}</div>
            </div>
          </div>

          {hoSo.mucDo !== "day-du" && (
            <section className="the">
              <div className="dau">
                <h2>Độ đầy đủ hồ sơ: {hoSo.diem}%</h2>
                <span className={`huy-hieu ${hoSo.mucDo === "thieu-bat-buoc" ? "canh-bao" : ""}`}>{NHAN_MUC_DO_HO_SO[hoSo.mucDo]}</span>
              </div>
              <div className="than">
                {hoSo.thieuBatBuoc.length > 0 && (
                  <p style={{ marginTop: 0 }}>
                    <strong>Thiếu bắt buộc:</strong> {hoSo.thieuBatBuoc.join(", ")}. Hồ sơ thiếu thì báo giá, hóa đơn và chăm sóc sau bán dễ sai người, sai thông tin.
                  </p>
                )}
                {hoSo.thieuNenCo.length > 0 && (
                  <p className="phu" style={{ marginTop: 0 }}>
                    Nên bổ sung: {hoSo.thieuNenCo.join(", ")}.
                  </p>
                )}
                <ul className="ds-van-de phu nho" style={{ marginBottom: 0 }}>
                  {hoSo.truong
                    .filter((t) => !t.co)
                    .map((t) => (
                      <li key={t.ma}>
                        {t.nhan}: {t.goiY}
                      </li>
                    ))}
                </ul>
                {suaDuoc && (
                  <p style={{ marginBottom: 0 }}>
                    <Link className="nut nho" href={`/crm/khach-hang/${khach.id}?tab=sua`}>
                      Bổ sung hồ sơ
                    </Link>
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="luoi-the">
            <section className="the">
              <div className="dau">
                <h2>Thông tin</h2>
                {hoSo.mucDo === "day-du" && <span className="huy-hieu tot">Hồ sơ đầy đủ</span>}
              </div>
              <dl className="bang-thong-tin">
                <dt>Loại khách</dt>
                <dd>{ten("loai_khach_hang", khach.loaiKhach)}</dd>
                <dt>Phân khúc</dt>
                <dd>{ten("phan_khuc_khach_hang", khach.phanKhuc)}</dd>
                <dt>Ngành nghề</dt>
                <dd>{ten("nganh_nghe", khach.nganh)}</dd>
                <dt>Nguồn</dt>
                <dd>{ten("nguon_lead", khach.nguon)}</dd>
                <dt>Điện thoại</dt>
                <dd>{khach.dienThoai ? <a href={`tel:${khach.dienThoai.replace(/\s/g, "")}`}>{khach.dienThoai}</a> : "—"}</dd>
                <dt>Email</dt>
                <dd>{khach.email ? <a href={`mailto:${khach.email}`}>{khach.email}</a> : "—"}</dd>
                <dt>Địa chỉ</dt>
                <dd>{[khach.diaChi, khach.tinhThanh].filter(Boolean).join(", ") || "—"}</dd>
                <dt>Website</dt>
                <dd>{khach.website ?? "—"}</dd>
                <dt>Tạo lúc</dt>
                <dd>{dinhDangNgayGio(khach.taoLuc)}</dd>
                {khach.ghiChu && (
                  <>
                    <dt>Ghi chú</dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>{khach.ghiChu}</dd>
                  </>
                )}
              </dl>
            </section>
            <section className="the">
              <div className="dau">
                <h2>Hoạt động gần đây</h2>
                <Link className="nho" href={`/crm/khach-hang/${khach.id}?tab=dong-thoi-gian`}>
                  Xem tất cả
                </Link>
              </div>
              <div className="than">
                <DongThoiGian muc={dongThoiGian.slice(0, 8)} />
              </div>
            </section>
          </div>
          <p className="phu" style={{ marginTop: 16 }}>
            Báo giá, đơn hàng, dự án, thanh toán, hỗ trợ, bảo hành, gia hạn và tài liệu sẽ hiện trên trang này khi các phân hệ đó chạy (Phase 4–6).
          </p>
        </>
      )}

      {tab === "hanh-trinh" && (
        <div className="luoi-the">
          <section className="the">
            <div className="dau">
              <h2>Hành trình khách hàng</h2>
              <Link className="nho" href="/crm/hanh-trinh">
                Xem phễu
              </Link>
            </div>
            <div className="than">
              <p style={{ marginTop: 0 }}>
                Hiện tại:{" "}
                {khach.hanhTrinh ? (
                  <span className="nhan-mau">
                    <span className="cham-mau" style={{ "--mau": khach.hanhTrinh.mau } as React.CSSProperties} />
                    {khach.hanhTrinh.ten}
                  </span>
                ) : (
                  <span className="mo">chưa có trạng thái</span>
                )}
                {khach.hanhTrinh?.tuLuc && <span className="phu nho"> · từ {dinhDangNgayGio(khach.hanhTrinh.tuLuc)}</span>}
              </p>
              {suaDuoc && (
                <DoiHanhTrinh
                  khachHangId={khach.id}
                  hienTaiId={khach.hanhTrinh?.id ?? null}
                  trangThai={danhMucHT.filter((t) => t.trangThai === "hoat-dong").map((t) => ({ id: t.id, ten: t.ten }))}
                />
              )}
              <h3 style={{ marginTop: 18 }}>Lịch sử</h3>
              {lichSuHT.length === 0 ? (
                <p className="phu nho">Chưa có lần đổi nào.</p>
              ) : (
                <ul className="ds-tuong-tac">
                  {lichSuHT.map((l) => (
                    <li key={l.id}>
                      <div className="dau-dong">
                        <span className={`huy-hieu ${l.tuDong ? "chinh" : ""}`}>{l.tuDong ? "Tự động" : "Đổi tay"}</span>
                        <strong>
                          {l.tu?.ten ?? "(chưa có)"} → {l.sang?.ten ?? "(bỏ trống)"}
                        </strong>
                        <span className="phu">
                          {dinhDangNgayGio(l.luc)} · {l.nguoi}
                          {l.moc && ` · mốc: ${l.moc}`}
                        </span>
                      </div>
                      {l.ghiChu && <p className="phu">{l.ghiChu}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section className="the">
            <div className="dau">
              <h2>Điểm khách tiềm năng</h2>
              <Link className="nho" href="/crm/cham-diem">
                Cách chấm
              </Link>
            </div>
            <div className="than">
              {diem.diemHienTai === null ? (
                <p className="phu">{diem.phan[0]?.nhan ?? "Không chấm điểm."}</p>
              ) : (
                <>
                  <p style={{ marginTop: 0 }}>
                    <span className={`diem-khach ${diem.hang ?? ""}`} style={{ fontSize: 18 }}>
                      {diem.diemHienTai}
                    </span>{" "}
                    {diem.hang ? <strong>Khách {NHAN_HANG[diem.hang]}</strong> : <span className="phu nho">Chưa đặt ngưỡng Nóng/Ấm — chưa xếp hạng.</span>}
                  </p>
                  <ul className="ds-diem">
                    {diem.phan.map((p, i) => (
                      <li key={i}>
                        <span>{p.nhan}</span>
                        <span className={`so ${p.diem < 0 ? "am-diem" : ""}`}>
                          {p.diem > 0 ? "+" : ""}
                          {p.diem}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {diem.diemLuu !== diem.diemHienTai && (
                    <p className="phu nho">Điểm lưu trên danh sách ({diem.diemLuu ?? "chưa tính"}) sẽ cập nhật ở lần tính lại kế tiếp.</p>
                  )}
                  {diem.tinhLuc && <p className="phu nho">Tính lần cuối: {dinhDangNgayGio(diem.tinhLuc)}</p>}
                </>
              )}
            </div>
          </section>
          <section className="the">
            <div className="dau">
              <h2>Nhóm khách hàng</h2>
            </div>
            <div className="than">
              <NhomCuaKhach
                khachHangId={khach.id}
                dangCo={nhomKhach.map((n) => n.id)}
                tatCa={(suaDuoc ? tatCaNhom.filter((g) => g.trangThai === "hoat-dong" || nhomKhach.some((n) => n.id === g.id)) : nhomKhach).map((g) => ({ id: g.id, ten: g.ten, mau: g.mau }))}
                duocSua={suaDuoc}
              />
            </div>
          </section>
        </div>
      )}

      {tab === "lien-he" && <QuanLyLienHe khachHangId={khach.id} lienHe={lienHe} duocSua={suaDuoc} />}

      {tab === "co-hoi" && (
        <section className="the">
          <div className="dau">
            <h2>Cơ hội</h2>
            {quyenUi.taoCoHoi && (
              <Link className="nut nho" href={`/ban-hang/co-hoi/moi?khachHang=${khach.id}`}>
                <BieuTuong ten="them" co={14} /> Tạo cơ hội
              </Link>
            )}
          </div>
          {coHoi.length === 0 ? (
            <TrongRong tieuDe="Chưa có cơ hội nào với khách này" />
          ) : (
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th>Cơ hội</th>
                    <th>Giai đoạn</th>
                    <th className="so">Giá trị</th>
                    <th>Hành động kế tiếp</th>
                    <th>Phụ trách</th>
                  </tr>
                </thead>
                <tbody>
                  {coHoi.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/ban-hang/co-hoi/${c.id}`}>{c.tieuDe}</Link>
                        <div className="dong-phu">{c.ma}</div>
                      </td>
                      <td>
                        <span className={`huy-hieu ${LOP_GIAI_DOAN[c.giaiDoan] ?? ""}`}>{NHAN_GIAI_DOAN[c.giaiDoan]}</span>
                        <div className="dong-phu">{c.xacSuat}%</div>
                      </td>
                      <td className="so">{dinhDangTien(c.giaTri)}</td>
                      <td>
                        {c.hanhDongKeTiep ?? <span className="mo">—</span>}
                        {c.ngayHanhDong && <div className="dong-phu">{dinhDangNgay(c.ngayHanhDong)}</div>}
                      </td>
                      <td>{c.nguoiPhuTrach}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "tuong-tac" && (
        <section className="the">
          <div className="dau">
            <h2>Tương tác</h2>
          </div>
          {quyenUi.ghiTuongTac && (
            <div className="than" style={{ borderBottom: "1px solid var(--vien)" }}>
              <GhiTuongTac khachHangId={khach.id} lienHe={lienHe.filter((l) => l.trangThai === "hoat-dong").map((l) => ({ id: l.id, hoTen: l.hoTen }))} />
            </div>
          )}
          {tuongTac.length === 0 ? (
            <TrongRong tieuDe="Chưa ghi tương tác nào" />
          ) : (
            <ul className="ds-tuong-tac">
              {tuongTac.map((t) => (
                <li key={t.id}>
                  <div className="dau-dong">
                    <span className="huy-hieu">{NHAN_TUONG_TAC[t.loai] ?? t.loai}</span>
                    <strong>{t.tieuDe}</strong>
                    <span className="phu">
                      {dinhDangNgayGio(t.luc)} · {t.nguoi}
                      {t.lienHe && ` · với ${t.lienHe}`}
                      {t.coHoi && (
                        <>
                          {" · "}
                          <Link href={`/ban-hang/co-hoi/${t.coHoi.id}`}>{t.coHoi.code}</Link>
                        </>
                      )}
                    </span>
                  </div>
                  {t.noiDung && <p>{t.noiDung}</p>}
                  {t.ketQua && <p className="phu">Kết quả: {t.ketQua}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "cong-viec" && (
        <section className="the">
          <div className="dau">
            <h2>Công việc</h2>
            {quyenUi.taoViec && <NutTaoViec ganKem={{ khachHangId: khach.id }} nguoiPhuTrach={nguoiViec} toiId={nd.hoSo.userId} lopNut="nut nho" />}
          </div>
          {viec.length === 0 ? (
            <TrongRong tieuDe="Chưa có công việc nào gắn với khách này" />
          ) : (
            <table className="bang">
              <tbody>
                {viec.map((v) => (
                  <tr key={v.id} className={v.trangThai === "xong" || v.trangThai === "huy" ? "mo" : undefined}>
                    <td>
                      <Link href={`/cong-viec/${v.id}`}>{v.tieuDe}</Link>
                      <div className="dong-phu">
                        {v.nguoi} · {NHAN_UU_TIEN[v.uuTien]}
                      </div>
                      {v.ketQua && (
                        <div className="dong-phu">
                          <strong>Kết quả{v.danhGia ? ` (${NHAN_DANH_GIA_KET_QUA[v.danhGia] ?? v.danhGia})` : ""}:</strong> {v.ketQua}
                        </div>
                      )}
                    </td>
                    <td className="so nho">{v.han ? dinhDangNgayGio(v.han) : "Không hạn"}</td>
                    <td>
                      <span className="huy-hieu">{NHAN_TRANG_THAI_VIEC[v.trangThai]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "dong-thoi-gian" && (
        <section className="the">
          <div className="dau">
            <h2>Dòng thời gian</h2>
            <span className="phu nho">Gộp từ tương tác, cơ hội, công việc, lead gốc — mới nhất trước</span>
          </div>
          <div className="than">
            <DongThoiGian muc={dongThoiGian} />
          </div>
        </section>
      )}
    </>
  );
}
