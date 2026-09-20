import type { NguCanh } from "@/lib/api";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { docBangCsv, docSoTienCsv, taoCsv, type CotCsv } from "@/lib/csv";
import { chuanHoaSku } from "./chuan-hoa";
import { danhSachSanPham, datGiaNguon, suaSanPham, taoSanPham } from "./service";
import { LuocDoLocSanPham, type DuLieuNhapCsv } from "./luoc-do";

/**
 * Nhập và xuất CSV cho danh mục sản phẩm và bảng giá nhà cung cấp (mục 8 prompt).
 *
 * Luật (BUSINESS_RULES.md mục 4): nhập LUÔN xem trước — máy chủ đọc tệp, kiểm từng dòng và
 * trả về "sẽ tạo bao nhiêu, sẽ sửa bao nhiêu, dòng nào hỏng vì sao". Chỉ khi người dùng
 * bấm xác nhận mới ghi. Dòng hỏng bị bỏ qua, dòng tốt vẫn vào — và mọi thay đổi giá vẫn
 * đi qua service thường nên vẫn có lịch sử giá và nhật ký kiểm toán.
 *
 * Chỉ đọc CSV (UTF-8). Excel: "Lưu thành → CSV UTF-8" trước khi nhập.
 */

const COT_SAN_PHAM: CotCsv[] = [
  { truong: "sku", ten: ["sku", "ma", "ma san pham", "mã sản phẩm"], batBuoc: true },
  { truong: "ten", ten: ["ten", "tên", "ten san pham", "tên sản phẩm", "name"], batBuoc: true },
  { truong: "nhom", ten: ["nhom", "nhóm", "ma nhom", "mã nhóm", "category"] },
  { truong: "thuongHieu", ten: ["thuong hieu", "thương hiệu", "brand", "hang"] },
  { truong: "model", ten: ["model", "ma model"] },
  { truong: "donViTinh", ten: ["dvt", "don vi tinh", "đơn vị tính", "unit"] },
  { truong: "giaVon", ten: ["gia von", "giá vốn", "gia nhap", "giá nhập", "cost"] },
  { truong: "giaBan", ten: ["gia ban", "giá bán", "gia", "giá", "price"] },
  { truong: "vat", ten: ["vat", "thue", "thuế", "thue suat"] },
  { truong: "baoHanh", ten: ["bao hanh", "bảo hành", "bao hanh thang", "warranty"] },
  { truong: "moTa", ten: ["mo ta", "mô tả", "ghi chu", "ghi chú", "description"] },
];

const COT_GIA: CotCsv[] = [
  { truong: "sku", ten: ["sku", "ma", "ma san pham", "mã sản phẩm"], batBuoc: true },
  { truong: "giaMua", ten: ["gia mua", "giá mua", "gia nhap", "giá nhập", "gia", "giá", "price"], batBuoc: true },
  { truong: "tinhTrang", ten: ["tinh trang", "tình trạng", "ton kho", "tồn kho", "availability"] },
  { truong: "soNgayGiao", ten: ["so ngay giao", "số ngày giao", "lead time", "thoi gian giao"] },
  { truong: "thamChieu", ten: ["tham chieu", "tham chiếu", "ma bao gia", "reference"] },
  { truong: "ghiChu", ten: ["ghi chu", "ghi chú", "note"] },
];

const TINH_TRANG_CSV: Record<string, string> = {
  "con hang": "con-hang",
  "con-hang": "con-hang",
  co: "con-hang",
  "san co": "con-hang",
  "het hang": "het-hang",
  "het-hang": "het-hang",
  het: "het-hang",
  "dat truoc": "dat-truoc",
  "dat-truoc": "dat-truoc",
  order: "dat-truoc",
};

export interface DongKetQua {
  soDong: number;
  sku: string;
  viec: "tao" | "sua" | "bo-qua";
  loi?: string;
}

export interface KetQuaNhap {
  loai: string;
  tenTep: string;
  ghiThat: boolean;
  tongDong: number;
  soTao: number;
  soSua: number;
  soLoi: number;
  thieuCot: string[];
  cotLa: string[];
  dong: DongKetQua[];
  importJobId: string | null;
}

function chuanHoaTinhTrang(s: string): string {
  const k = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
  return TINH_TRANG_CSV[k] ?? (k ? "khong-ro" : "khong-ro");
}

/**
 * Nhập CSV. `ghiThat = false` chỉ xem trước (không ghi gì, kể cả import_jobs ở chế độ ghi thật
 * thì mới lưu). Trả kết quả từng dòng để giao diện hiện bảng đối chiếu.
 */
export async function nhapCsv(nc: NguCanh, d: DuLieuNhapCsv): Promise<KetQuaNhap> {
  batBuocQuyen(nc.hoSo, d.ghiThat ? "product.create" : "product.view", { objectType: "import_job" });
  if (d.ghiThat) batBuocQuyen(nc.hoSo, "product.update", { objectType: "import_job" });

  const laGia = d.loai === "gia-nha-cung-cap";
  if (laGia && !d.nhaCungCapId) throw new LoiNghiepVu("Chọn nhà cung cấp trước khi nhập bảng giá.", 400, "thieu-nha-cung-cap");

  const bang = docBangCsv(d.noiDung, laGia ? COT_GIA : COT_SAN_PHAM);
  const ketQua: KetQuaNhap = {
    loai: d.loai,
    tenTep: d.tenTep,
    ghiThat: d.ghiThat,
    tongDong: bang.dong.length,
    soTao: 0,
    soSua: 0,
    soLoi: 0,
    thieuCot: bang.thieuCot,
    cotLa: bang.cotLa,
    dong: [],
    importJobId: null,
  };
  if (bang.thieuCot.length) {
    throw new LoiNghiepVu(
      `Tệp thiếu cột bắt buộc: ${bang.thieuCot.join(", ")}. Tải tệp mẫu ở nút "Tải mẫu CSV" rồi điền theo đúng tiêu đề cột.`,
      400,
      "thieu-cot",
      { thieuCot: bang.thieuCot, cotLa: bang.cotLa },
    );
  }
  if (bang.dong.length > 5000) throw new LoiNghiepVu("Tệp quá 5.000 dòng — tách nhỏ rồi nhập từng phần.", 400, "qua-nhieu-dong");

  // Tra cứu sẵn để không hỏi cơ sở dữ liệu trong từng dòng.
  const [sanPham, nhom, thuongHieu] = await Promise.all([
    nc.tx.product.findMany({ select: { id: true, skuNormalized: true } }),
    laGia ? Promise.resolve([]) : nc.tx.productCategory.findMany({ select: { id: true, code: true, name: true } }),
    laGia ? Promise.resolve([]) : nc.tx.brand.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  const theoSku = new Map(sanPham.map((p) => [p.skuNormalized, p.id]));
  const khoaTen = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const theoNhom = new Map(nhom.flatMap((n) => [[khoaTen(n.code), n.id] as const, [khoaTen(n.name), n.id] as const]));
  const theoThuongHieu = new Map(thuongHieu.flatMap((b) => [[khoaTen(b.code), b.id] as const, [khoaTen(b.name), b.id] as const]));
  const daGap = new Set<string>();

  for (const { soDong, duLieu } of bang.dong) {
    let sku = duLieu.sku ?? "";
    try {
      sku = chuanHoaSku(sku);
      if (daGap.has(sku)) throw new Error("SKU lặp lại trong chính tệp này — giữ dòng đầu tiên.");
      daGap.add(sku);
      const daCo = theoSku.get(sku);

      if (laGia) {
        if (!daCo) throw new Error("Chưa có sản phẩm nào mang SKU này — nhập danh mục sản phẩm trước.");
        const gia = docSoTienCsv(duLieu.giaMua ?? "");
        if (gia === null) throw new Error("Thiếu giá mua.");
        if (d.ghiThat) {
          await datGiaNguon(
            nc,
            daCo,
            {
              nhaCungCapId: d.nhaCungCapId!,
              giaMua: gia,
              tinhTrang: chuanHoaTinhTrang(duLieu.tinhTrang ?? "") as never,
              soNgayGiao: duLieu.soNgayGiao ? Number.parseInt(duLieu.soNgayGiao, 10) || null : null,
              thamChieu: duLieu.thamChieu || null,
              ghiChu: duLieu.ghiChu || null,
              lyDo: `Nhập từ tệp ${d.tenTep}`,
            },
            { nguon: "nhap-csv" },
          );
        }
        ketQua.soSua++;
        ketQua.dong.push({ soDong, sku, viec: "sua" });
        continue;
      }

      // --- Danh mục sản phẩm ---
      const ten = (duLieu.ten ?? "").trim();
      if (ten.length < 2) throw new Error("Thiếu tên sản phẩm.");
      const nhomId = duLieu.nhom ? theoNhom.get(khoaTen(duLieu.nhom)) : undefined;
      if (duLieu.nhom && !nhomId) throw new Error(`Nhóm "${duLieu.nhom}" chưa có trong hệ thống.`);
      const thuongHieuId = duLieu.thuongHieu ? theoThuongHieu.get(khoaTen(duLieu.thuongHieu)) : undefined;
      if (duLieu.thuongHieu && !thuongHieuId) throw new Error(`Thương hiệu "${duLieu.thuongHieu}" chưa có trong hệ thống.`);
      const giaVon = docSoTienCsv(duLieu.giaVon ?? "");
      const giaBan = docSoTienCsv(duLieu.giaBan ?? "");
      const vat = duLieu.vat ? Number(duLieu.vat.replace(/[^\d.,]/g, "").replace(",", ".")) : undefined;
      if (vat !== undefined && (!Number.isFinite(vat) || vat < 0 || vat > 100)) throw new Error("Thuế suất phải từ 0 đến 100.");
      const baoHanh = duLieu.baoHanh ? Number.parseInt(duLieu.baoHanh, 10) : undefined;

      const chung = {
        ten,
        nhomId: nhomId ?? null,
        thuongHieuId: thuongHieuId ?? null,
        model: duLieu.model || null,
        moTa: duLieu.moTa || null,
        donViTinh: duLieu.donViTinh || null,
        giaVon,
        giaBan,
        ...(vat !== undefined && { vat }),
        ...(Number.isFinite(baoHanh) && { baoHanhThang: baoHanh }),
        lyDoDoiGia: `Nhập từ tệp ${d.tenTep}`,
      };

      if (daCo) {
        // KHÔNG gửi lại `sku` khi cập nhật: cùng một sản phẩm, và gửi bản chuẩn hóa sẽ
        // viết hoa lại SKU mà người dùng đã đặt trên giao diện.
        if (d.ghiThat) await suaSanPham(nc, daCo, chung, { nguon: "nhap-csv" });
        ketQua.soSua++;
        ketQua.dong.push({ soDong, sku, viec: "sua" });
      } else {
        if (d.ghiThat) {
          // Tạo mới thì giữ nguyên cách viết trong tệp (chỉ gộp khoảng trắng).
          const moi = await taoSanPham(nc, { sku: (duLieu.sku ?? "").trim(), ...chung, vat: chung.vat ?? 10 } as never, { nguon: "nhap-csv" });
          theoSku.set(sku, moi.id);
        }
        ketQua.soTao++;
        ketQua.dong.push({ soDong, sku, viec: "tao" });
      }
    } catch (e) {
      ketQua.soLoi++;
      ketQua.dong.push({ soDong, sku, viec: "bo-qua", loi: e instanceof Error ? e.message : String(e) });
    }
  }

  if (d.ghiThat) {
    const job = await nc.tx.importJob.create({
      data: {
        tenantId: nc.tenantId,
        type: d.loai,
        fileName: d.tenTep,
        status: ketQua.soLoi === ketQua.tongDong && ketQua.tongDong > 0 ? "that-bai" : "da-nhap",
        totalRows: ketQua.tongDong,
        okRows: ketQua.soTao + ketQua.soSua,
        errorRows: ketQua.soLoi,
        createdRows: ketQua.soTao,
        updatedRows: ketQua.soSua,
        errors: ketQua.dong.filter((r) => r.loi).slice(0, 200) as never,
        createdBy: nc.hoSo.userId,
      },
      select: { id: true },
    });
    ketQua.importJobId = job.id;
    await nc.kiemToan({
      action: "tao",
      objectType: "import_job",
      objectId: job.id,
      after: { loai: d.loai, tenTep: d.tenTep, soTao: ketQua.soTao, soSua: ketQua.soSua, soLoi: ketQua.soLoi },
    });
    await nc.suKien({
      eventType: SU_KIEN.IMPORT_COMPLETED,
      objectType: "import_job",
      objectId: job.id,
      payload: { loai: d.loai, soTao: ketQua.soTao, soSua: ketQua.soSua, soLoi: ketQua.soLoi },
    });
  }
  return ketQua;
}

/** Mười lần nhập gần nhất — để biết ai nhập tệp nào, kết quả ra sao. */
export async function lichSuNhap(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "product.view");
  const ds = await nc.tx.importJob.findMany({
    select: { id: true, type: true, fileName: true, status: true, totalRows: true, createdRows: true, updatedRows: true, errorRows: true, createdAt: true, createdBy: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const nguoi = await nc.tx.user.findMany({
    where: { id: { in: [...new Set(ds.map((j) => j.createdBy).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, fullName: true },
  });
  const ten = new Map(nguoi.map((u) => [u.id, u.fullName]));
  return ds.map((j) => ({
    id: j.id,
    loai: j.type,
    tenTep: j.fileName,
    trangThai: j.status,
    tongDong: j.totalRows,
    soTao: j.createdRows,
    soSua: j.updatedRows,
    soLoi: j.errorRows,
    luc: j.createdAt,
    nguoi: j.createdBy ? (ten.get(j.createdBy) ?? "—") : "hệ thống",
  }));
}

/** Tệp mẫu để người dùng điền đúng tiêu đề cột. */
export function mauCsv(loai: "san-pham" | "gia-nha-cung-cap"): string {
  return loai === "gia-nha-cung-cap"
    ? taoCsv(
        ["SKU", "Giá mua", "Tình trạng", "Số ngày giao", "Tham chiếu", "Ghi chú"],
        [["LAP-DELL-3420", "15.200.000", "Còn hàng", "3", "BG-0925", "Giá tháng 9"]],
      )
    : taoCsv(
        ["SKU", "Tên", "Nhóm", "Thương hiệu", "Model", "ĐVT", "Giá vốn", "Giá bán", "VAT", "Bảo hành", "Mô tả"],
        [["LAP-DELL-3420", "Laptop Dell Vostro 3420 i5", "laptop", "Dell", "V3420-i5", "cai", "15.200.000", "17.900.000", "10", "24", "i5-1235U/8GB/256GB"]],
      );
}

/** Xuất danh mục sản phẩm theo đúng bộ lọc đang xem (tối đa 5.000 dòng). */
export async function xuatSanPhamCsv(nc: NguCanh, thamSo: Record<string, string>): Promise<{ tenTep: string; noiDung: string }> {
  batBuocQuyen(nc.hoSo, "product.export", { objectType: "product" });
  const boLoc = LuocDoLocSanPham.parse({ ...thamSo, trang: 1, coTrang: 200 });
  const dong: (string | number | null)[][] = [];
  for (let trang = 1; trang <= 25; trang++) {
    const kq = await danhSachSanPham(nc, { ...boLoc, trang });
    for (const p of kq.dong) {
      dong.push([
        p.sku, p.ten, p.nhom?.code ?? "", p.thuongHieu?.name ?? "", p.model ?? "", p.donViTinh ?? "",
        p.giaVon ?? "", p.giaBan ?? "", p.vat, p.baoHanhThang ?? "", p.soNguon,
        p.bienLoiNhuan === null ? "" : p.bienLoiNhuan, p.trangThai,
      ]);
    }
    if (kq.dong.length < boLoc.coTrang || dong.length >= kq.tong) break;
  }
  await nc.kiemToan({ action: "sua", objectType: "product", objectId: null, after: { xuatCsv: dong.length } });
  return {
    tenTep: `san-pham-${new Date().toISOString().slice(0, 10)}.csv`,
    noiDung: taoCsv(
      ["SKU", "Tên", "Nhóm", "Thương hiệu", "Model", "ĐVT", "Giá vốn", "Giá bán", "VAT", "Bảo hành", "Số nguồn", "Biên LN %", "Trạng thái"],
      dong,
    ),
  };
}
