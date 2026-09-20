import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauDangNhap, type ThamSoTrang } from "@/lib/trang";
import { NHAN_MUC_DO } from "@/modules/nhac-viec/quy-tac";
import { viecHomNay } from "@/modules/nhac-viec/service";
import TacVuViec from "./TacVuViec";

export const dynamic = "force-dynamic";

const LA_NGAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Việc hôm nay" — mục 22 prompt 20/09.
 *
 * Danh sách **gợi ý** do bản quét lập mỗi sáng, không phải công việc chính thức. Mỗi
 * người chỉ thấy việc của chính mình; máy chủ lọc theo phiên, không nhận id người nào
 * từ trình duyệt.
 */
export default async function TrangViecHomNay({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauDangNhap();
  const sp = await searchParams;
  const ngay = LA_NGAY.test(layMot(sp.ngay)) ? layMot(sp.ngay) : undefined;

  const kq = await docDuLieu(nd, (tx) => viecHomNay(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), ngay));
  const dangMo = kq.dong.filter((v) => v.trangThai === "mo");
  const daDong = kq.dong.filter((v) => v.trangThai !== "mo");

  return (
    <>
      <DauTrang
        tieuDe="Việc hôm nay"
        moTa={`Danh sách gợi ý cho ngày ${dinhDangNgay(kq.ngay)}, do bản quét tự động lập. Đánh dấu đã xử lý hoặc bỏ qua kèm lý do.`}
        hanhDong={
          coQuyen(nd.hoSo, "setting.view") && (
            <Link className="nut" href="/quan-tri/tu-dong-hoa">
              Quy tắc nhắc việc
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className={`the chi-so ${kq.tomTat.khan > 0 ? "loi" : ""}`}>
          <div className="nhan">Việc gấp</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.khan)}</div>
          <div className="ghi-chu">Quá hạn hoặc trễ cam kết với khách</div>
        </div>
        <div className={`the chi-so ${kq.tomTat.canhBao > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Cần để ý</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.canhBao)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Chăm sóc</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.thongTin)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Đã đóng trong ngày</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.xong + kq.tomTat.boQua)}</div>
          <div className="ghi-chu">
            {dinhDangSo(kq.tomTat.xong)} đã xử lý · {dinhDangSo(kq.tomTat.boQua)} bỏ qua
          </div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Cần làm</h2>
          <span className="phu nho">
            {kq.daQuet
              ? `Quét lúc ${dinhDangNgayGio(kq.quetLuc)} · ${kq.soQuyTacChay} quy tắc chạy, ${kq.soQuyTacBoQua} bỏ qua`
              : "Hôm nay chưa chạy bản quét nào"}
          </span>
        </div>

        {dangMo.length === 0 ? (
          <TrongRong tieuDe={kq.daQuet ? "Không còn việc nào đang mở" : "Chưa có danh sách cho hôm nay"}>
            {kq.daQuet ? (
              "Bản quét đã chạy và không tìm thấy việc nào thuộc phần bạn phụ trách."
            ) : (
              <>
                Bản quét chạy theo giờ đặt ở Quản trị → Cấu hình. Chưa đặt giờ thì máy không tự quét
                {coQuyen(nd.hoSo, "setting.update") ? (
                  <>
                    {" — "}
                    <Link href="/quan-tri/tu-dong-hoa">bấm Chạy quét ngay</Link> để thử.
                  </>
                ) : (
                  "; nhờ quản trị hệ thống đặt giúp."
                )}
              </>
            )}
          </TrongRong>
        ) : (
          <ul className="viec-hom-nay">
            {dangMo.map((v) => (
              <li key={v.id}>
                <span className={`cham-muc-do ${v.mucDo}`} aria-hidden="true" />
                <div className="than-viec">
                  <div className="dau-dong">
                    <strong>{v.duongDan ? <Link href={v.duongDan}>{v.tieuDe}</Link> : v.tieuDe}</strong>
                    <span className={`huy-hieu ${NHAN_MUC_DO[v.mucDo]?.lop ?? ""}`}>
                      {NHAN_MUC_DO[v.mucDo]?.nhan ?? v.mucDo}
                    </span>
                  </div>
                  <div className="dong-phu">{v.lyDo}</div>
                  <div className="dong-phu phu">{v.nhanQuyTac}</div>
                </div>
                <div className="tac-vu">
                  <TacVuViec id={v.id} tieuDe={v.tieuDe} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {daDong.length > 0 && (
        <section className="the">
          <div className="dau">
            <h2>Đã đóng hôm nay</h2>
          </div>
          <ul className="viec-hom-nay">
            {daDong.map((v) => (
              <li key={v.id} className="da-dong">
                <span className={`cham-muc-do ${v.mucDo}`} aria-hidden="true" />
                <div className="than-viec">
                  <div className="dau-dong">
                    <strong>{v.tieuDe}</strong>
                    <span className="huy-hieu">{v.trangThai === "xong" ? "Đã xử lý" : "Bỏ qua"}</span>
                  </div>
                  <div className="dong-phu">{v.lyDo}</div>
                  {v.lyDoBoQua && <div className="dong-phu phu">Lý do bỏ qua: {v.lyDoBoQua}</div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
