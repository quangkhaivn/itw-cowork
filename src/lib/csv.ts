/**
 * Đọc và ghi CSV — hàm thuần, có kiểm thử đơn vị.
 *
 * Vì sao tự viết: nhu cầu chỉ là bảng giá vài nghìn dòng, và các bẫy thật với tệp từ
 * Việt Nam là dấu phân cách `;` (Excel chạy theo ngôn ngữ máy), BOM của "CSV UTF-8",
 * và xuống dòng CRLF. Thêm một thư viện chỉ để giải mấy chuyện đó là không đáng (mục 33 prompt).
 *
 * KHÔNG đọc trực tiếp .xlsx: Excel phải "Lưu thành → CSV UTF-8" trước. Ghi rõ trên màn hình nhập.
 */

/** Dấu phân cách hay gặp, đoán bằng dòng đầu tiên. */
export function doanDauPhanCach(dongDau: string): "," | ";" | "\t" {
  const dem = (k: string) => dongDau.split(k).length - 1;
  const ung: ["," | ";" | "\t", number][] = [
    [";", dem(";")],
    ["\t", dem("\t")],
    [",", dem(",")],
  ];
  ung.sort((a, b) => b[1] - a[1]);
  return ung[0][1] > 0 ? ung[0][0] : ",";
}

/**
 * Tách CSV thành mảng dòng, mỗi dòng là mảng ô. Hiểu ô có dấu nháy kép, dấu nháy kép
 * lồng (`""`), xuống dòng bên trong ô, BOM ở đầu tệp, CRLF và LF.
 */
export function docCsv(noiDung: string, dauPhanCach?: string): string[][] {
  const van = noiDung.replace(/^﻿/, "");
  const dpc = dauPhanCach ?? doanDauPhanCach(van.split(/\r?\n/, 1)[0] ?? "");
  const dong: string[][] = [];
  let o: string[] = [];
  let hienTai = "";
  let trongNhay = false;

  for (let i = 0; i < van.length; i++) {
    const c = van[i];
    if (trongNhay) {
      if (c === '"') {
        if (van[i + 1] === '"') {
          hienTai += '"';
          i++;
        } else {
          trongNhay = false;
        }
      } else {
        hienTai += c;
      }
      continue;
    }
    if (c === '"' && hienTai.trim() === "") {
      trongNhay = true;
      hienTai = "";
    } else if (c === dpc) {
      o.push(hienTai.trim());
      hienTai = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && van[i + 1] === "\n") i++;
      o.push(hienTai.trim());
      if (o.some((x) => x !== "")) dong.push(o);
      o = [];
      hienTai = "";
    } else {
      hienTai += c;
    }
  }
  o.push(hienTai.trim());
  if (o.some((x) => x !== "")) dong.push(o);
  return dong;
}

/** Bỏ dấu, chữ thường, bỏ ký tự lạ — để so tên cột không phụ thuộc cách gõ. */
function khoaCot(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface CotCsv {
  /** Tên trường trong dữ liệu trả về. */
  truong: string;
  /** Các cách viết tiêu đề cột được chấp nhận. */
  ten: string[];
  batBuoc?: boolean;
}

export interface KetQuaDocBang<T = Record<string, string>> {
  /** Tiêu đề cột thiếu so với khai báo bắt buộc. */
  thieuCot: string[];
  /** Cột trong tệp mà hệ thống không hiểu — báo để người nhập biết mình gõ sai tên cột. */
  cotLa: string[];
  dong: { soDong: number; duLieu: T }[];
}

/**
 * Đọc CSV có dòng tiêu đề thành danh sách bản ghi theo khai báo cột.
 * `soDong` tính theo số dòng trong tệp (dòng tiêu đề là 1) để báo lỗi đúng chỗ.
 */
export function docBangCsv(noiDung: string, cot: CotCsv[]): KetQuaDocBang {
  const bang = docCsv(noiDung);
  if (bang.length === 0) return { thieuCot: cot.filter((c) => c.batBuoc).map((c) => c.ten[0]), cotLa: [], dong: [] };

  const tieuDe = bang[0].map(khoaCot);
  const viTri = new Map<string, number>();
  for (const c of cot) {
    const i = tieuDe.findIndex((t) => c.ten.some((ten) => khoaCot(ten) === t));
    if (i >= 0) viTri.set(c.truong, i);
  }
  const daDung = new Set(viTri.values());
  const cotLa = bang[0].filter((_, i) => !daDung.has(i) && bang[0][i].trim() !== "");
  const thieuCot = cot.filter((c) => c.batBuoc && !viTri.has(c.truong)).map((c) => c.ten[0]);

  const dong = bang.slice(1).map((o, i) => {
    const duLieu: Record<string, string> = {};
    for (const [truong, vt] of viTri) duLieu[truong] = o[vt] ?? "";
    return { soDong: i + 2, duLieu };
  });
  return { thieuCot, cotLa, dong };
}

/** Ghi CSV cho Excel tiếng Việt: BOM + CRLF + bọc nháy khi cần. */
export function taoCsv(tieuDe: string[], dong: (string | number | null | undefined)[][]): string {
  const o = (x: string | number | null | undefined) => {
    const s = x === null || x === undefined ? "" : String(x);
    return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [tieuDe, ...dong].map((h) => h.map(o).join(",")).join("\r\n") + "\r\n";
}

/**
 * Những cách viết "chưa có giá" hay gặp trong bảng giá của nhà cung cấp. Chỉ các ô này
 * mới được coi là bỏ trống; mọi chữ nghĩa khác trong ô giá đều báo lỗi dòng, để một ô
 * gõ nhầm không âm thầm biến thành "không có giá".
 */
const O_CHUA_CO_GIA = new Set(["", "-", "--", "—", "n/a", "na", "lien he", "lienhe", "call", "lh", "chua co", "chua co gia", "cho bao gia", "updating", "dang cap nhat"]);

/**
 * Số tiền trong tệp CSV: "12.000.000", "12,000,000", "12000000.50", "12 000 000 ₫".
 *
 * Trả `null` khi ô trống hoặc ghi rõ là chưa có giá ("liên hệ", "—"…).
 * Ném lỗi khi ô có nội dung khác mà không đọc được ra một con số hợp lệ.
 */
export function docSoTienCsv(s: string): string | null {
  const chu = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[₫đ.\s]+/g, " ")
    .trim();
  if (O_CHUA_CO_GIA.has(chu)) return null;
  return docSoTienCsvCoChuSo(s);
}

function docSoTienCsvCoChuSo(s: string): string | null {
  const t = s.replace(/[^\d.,-]/g, "").trim();
  // Ô có nội dung nhưng không có chữ số nào ("mười lăm triệu") — báo lỗi, đừng đoán.
  if (!t) throw new Error(`Không đọc được số tiền: "${s}". Để trống ô nếu chưa có giá.`);
  let chuan = t;
  const coPhay = t.includes(",");
  const coCham = t.includes(".");
  if (coPhay && coCham) {
    // Dấu nào xuất hiện SAU cùng là dấu thập phân.
    chuan = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coPhay) {
    // "12,5" = thập phân; "12,000" = ngăn nghìn (3 chữ số sau dấu).
    const sau = t.slice(t.lastIndexOf(",") + 1);
    chuan = sau.length === 3 ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (coCham) {
    const sau = t.slice(t.lastIndexOf(".") + 1);
    chuan = sau.length === 3 && t.split(".").length > 1 && t.replace(/\./g, "").length > 3 ? t.replace(/\./g, "") : t;
  }
  if (!/^-?\d+(\.\d+)?$/.test(chuan)) throw new Error(`Không đọc được số tiền: "${s}". Để trống ô nếu chưa có giá.`);
  const n = Number(chuan);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Số tiền không hợp lệ: "${s}"`);
  // Bỏ số 0 thừa ở phần thập phân: 12.50 → "12.5", 15200000.00 → "15200000".
  return String(Math.round(n * 100) / 100);
}
