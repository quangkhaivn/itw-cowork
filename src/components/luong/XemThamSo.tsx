import { luocDoGiaTriThamSo } from "@/modules/luong/luoc-do";
import {
  LOAI_THAM_SO,
  type LoaiThamSo,
  type ThamSoBaoHiem,
  type ThamSoBieuThue,
  type ThamSoGiamTru,
  type ThamSoHoaHong,
  type ThamSoKhauTru10,
  type ThamSoTangCa,
  type ThamSoThuViec,
  type ThamSoVung,
} from "@/modules/luong/tinh-toan";

/**
 * Hiển thị một bộ tham số lương cho kế toán đọc (QĐ-167): từng nhóm có nhãn tiếng Việt và đơn vị (%, đồng); biểu thuế,
 * bậc hoa hồng, hệ số tăng ca thành bảng. Không hiện JSON thô (chỉ khi gặp loại lạ).
 */

const dong = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("vi-VN")} đ`);
const pt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`);
const VUNG = ["I", "II", "III", "IV"];

function Bang({ dau, dong: hang }: { dau: string[]; dong: (string | number)[][] }) {
  return (
    <table className="bang bang-tham-so">
      <thead><tr>{dau.map((d, i) => <th key={i} className={i > 0 ? "so" : undefined}>{d}</th>)}</tr></thead>
      <tbody>{hang.map((h, i) => <tr key={i}>{h.map((o, j) => <td key={j} className={j > 0 ? "so" : undefined}>{o}</td>)}</tr>)}</tbody>
    </table>
  );
}

function Muc({ ds }: { ds: [string, string][] }) {
  return (
    <dl className="ds-tham-so">
      {ds.map(([n, v]) => (
        <div key={n}><dt>{n}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export default function XemThamSo({ loai, giaTri }: { loai: LoaiThamSo | string; giaTri: unknown }) {
  // Giá trị sai cấu trúc (sửa tay CSDL?) → hiện thô thay vì vỡ trang.
  const hopLe = (LOAI_THAM_SO as readonly string[]).includes(loai) && luocDoGiaTriThamSo(loai as LoaiThamSo).safeParse(giaTri).success;
  if (!hopLe) return <code style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(giaTri)}</code>;
  return dung(loai as LoaiThamSo, giaTri);
}

function dung(loai: LoaiThamSo, giaTri: unknown) {
    switch (loai) {
      case "bao-hiem": {
        const g = giaTri as ThamSoBaoHiem;
        return (
          <>
            <Bang
              dau={["Khoản", "Người lao động", "Doanh nghiệp"]}
              dong={[
                ["BHXH", pt(g.nld.bhxh), pt(g.dn.bhxh)],
                ["BHYT", pt(g.nld.bhyt), pt(g.dn.bhyt)],
                ["BHTN", pt(g.nld.bhtn), pt(g.dn.bhtn)],
                ["Kinh phí công đoàn", "—", pt(g.dn.kpcd)],
              ]}
            />
            <Muc
              ds={[
                ["Lương cơ sở", dong(g.luongCoSo)],
                ["Trần BHXH, BHYT", `${g.tranLanLuongCoSo} lần lương cơ sở = ${dong(g.luongCoSo * g.tranLanLuongCoSo)}`],
                ["Trần BHTN", `${g.tranLanToiThieuVung} lần lương tối thiểu vùng`],
                ["Không đóng BH khi nghỉ không lương từ", `${g.ngayNghiKhongDong} ngày làm việc / tháng`],
              ]}
            />
          </>
        );
      }
      case "luong-toi-thieu-vung": {
        const g = giaTri as ThamSoVung;
        return (
          <>
            <Muc ds={[["Vùng của doanh nghiệp", `Vùng ${VUNG[g.vung - 1] ?? g.vung}`]]} />
            <Bang dau={["Vùng", "Lương tối thiểu / tháng"]} dong={["1", "2", "3", "4"].map((v, i) => [`Vùng ${VUNG[i]}${Number(v) === g.vung ? " (doanh nghiệp)" : ""}`, dong(g.mucVung[v])])} />
          </>
        );
      }
      case "giam-tru": {
        const g = giaTri as ThamSoGiamTru;
        return <Muc ds={[["Giảm trừ bản thân", `${dong(g.banThan)} / tháng`], ["Mỗi người phụ thuộc", `${dong(g.nguoiPhuThuoc)} / tháng`]]} />;
      }
      case "bieu-thue": {
        const g = giaTri as ThamSoBieuThue;
        return (
          <Bang
            dau={["Bậc", "Thu nhập tính thuế / tháng", "Thuế suất"]}
            dong={g.bac.map((b, i) => [String(i + 1), b.den === null ? `Trên ${dong(g.bac[i - 1]?.den ?? 0)}` : `${i === 0 ? "Đến" : `Trên ${dong(g.bac[i - 1].den)} đến`} ${dong(b.den)}`, pt(b.tyLe)])}
          />
        );
      }
      case "khau-tru-10": {
        const g = giaTri as ThamSoKhauTru10;
        return <Muc ds={[["Tỷ lệ khấu trừ", pt(g.tyLe)], ["Khấu trừ khi trả từ", dong(g.nguong)]]} />;
      }
      case "thu-viec": {
        const g = giaTri as ThamSoThuViec;
        return <Muc ds={[["Lương thử việc tối thiểu", `${pt(g.tyLeToiThieu)} lương của công việc`]]} />;
      }
      case "tang-ca": {
        const g = giaTri as ThamSoTangCa;
        return (
          <>
            <Bang
              dau={["Loại ngày", "Ban ngày", "Ban đêm"]}
              dong={[
                ["Ngày thường", pt(g.thuong), pt(g.thuongDem)],
                ["Nghỉ hằng tuần", pt(g.nghiTuan), pt(g.nghiTuanDem)],
                ["Ngày lễ", pt(g.le), pt(g.leDem)],
              ]}
            />
            <Muc ds={[["Phần cao hơn giờ bình thường", g.phanVuotMienThue ? "Không chịu thuế TNCN" : "Chịu thuế TNCN"]]} />
          </>
        );
      }
      case "hoa-hong": {
        const g = giaTri as ThamSoHoaHong;
        return g.kieu === "phang" ? (
          <Muc ds={[["Kiểu", "Một tỷ lệ cho mọi doanh số"], ["Tỷ lệ trên tiền đã thu", pt(g.tyLe)]]} />
        ) : (
          <>
            <Muc ds={[["Kiểu", "Bậc thang theo doanh số đã thu trong tháng (đạt bậc nào áp tỷ lệ bậc đó cho toàn bộ)"]]} />
            <Bang dau={["Doanh số thu từ", "Tỷ lệ"]} dong={[...g.bac].sort((a, b) => a.tu - b.tu).map((b) => [dong(b.tu), pt(b.tyLe)])} />
          </>
        );
      }
    }
}
