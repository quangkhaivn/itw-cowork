import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Đặt thư mục đính kèm sang chỗ tạm TRƯỚC khi nạp module kho tệp — bài thử không
// được rải tệp vào thư mục dữ liệu thật của máy phát triển.
process.env.THU_MUC_DINH_KEM = mkdtempSync(path.join(tmpdir(), "cowork-dinh-kem-"));

import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoDonHang } from "../src/modules/don-hang/service";
import { LuocDoTaoDon } from "../src/modules/don-hang/luoc-do";
import { danhSachDinhKem, dinhKemTep, goTep, taiTep } from "../src/modules/dinh-kem/service";
import { DUNG_LUONG_TOI_DA, SO_TEP_TOI_DA } from "../src/modules/dinh-kem/tinh-toan";
import { thuMucGoc } from "../src/modules/dinh-kem/kho-tep";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng tệp đính kèm trên CSDL THẬT và đĩa thật (thư mục tạm).
 * Luật: BUSINESS_RULES.md mục 20 (DK-01 → DK-06).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-dinh-kem"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "dinh-dang" ? e instanceof LoiDinhDang
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

const PDF = (duoi = "") => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, ...Buffer.from(duoi)]);

async function main() {
  console.log("=== Thử Tệp đính kèm ===");
  console.log(`(thư mục tạm: ${thuMucGoc()})\n`);
  const tenant = await seedNenMong(chu, `thu-dk-${DAU}`, "Doanh nghiệp thử đính kèm");
  const T = tenant.id;

  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const nguoi = async (ten: string, vai: string) =>
    (
      await chu.user.create({
        data: {
          tenantId: T,
          email: `${ten}.${DAU}@thu.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
          staffProfile: { create: { tenantId: T } },
        },
      })
    ).id;

  const gd = await nguoi("giam-doc", "ceo");
  const tpkd = await nguoi("truong-phong-kd", "sales-manager");
  const nvA = await nguoi("kinh-doanh-a", "sales");
  const nvB = await nguoi("kinh-doanh-b", "sales");
  const thukho = await nguoi("thu-kho", "warehouse");
  // Hai nhân viên do Trưởng phòng quản lý — để phạm vi "nhóm" có nghĩa thật.
  await chu.staffProfile.updateMany({ where: { userId: { in: [nvA, nvB] } }, data: { managerId: tpkd } });
  console.log("");

  // ------------------------------------------------------------------
  const sp = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `DK-${DAU}`, ten: "Máy in", giaBan: "5000000", giaVon: "4000000" })),
  );
  const khachA = await voi(T, nvA, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Khách của A ${DAU}`, dienThoai: "0909 000 111" })),
  );
  // Đơn do Trưởng phòng lập nhưng giao cho nhân viên A phụ trách — đúng cách phạm vi
  // dữ liệu vận hành thật: A thấy đơn của mình, B không thấy.
  const donA = await voi(T, tpkd, (nc) =>
    taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khachA.id,
      nguoiPhuTrachId: nvA,
      dong: [{ sanPhamId: sp.id, ten: "Máy in", soLuong: "1", donGia: "5000000", vat: 10 }],
    })),
  );

  // ------------------------------------------------------------------
  console.log("— DK-01, DK-02: đính kèm và quyền —");

  await nemLoi("Loại chứng từ không có thật bị chặn", "khong-thay", () =>
    voi(T, gd, (nc) =>
      danhSachDinhKem(nc, "bang_luong" as never, donA.id),
    ),
  );

  await nemLoi("Nhân viên chỉ xem đơn thì không đính kèm được", "quyen", () =>
    voi(T, nvA, (nc) =>
      dinhKemTep(nc, { loai: "sales_order", doiTuongId: donA.id, tenTep: "a.pdf", noiDung: PDF() }),
    ),
  );

  const t1 = await voi(T, tpkd, (nc) =>
    dinhKemTep(nc, {
      loai: "sales_order",
      doiTuongId: donA.id,
      tenTep: "hợp đồng khách A.pdf",
      noiDung: PDF("noi dung mau"),
      ghiChu: "Bản khách đã ký",
    }),
  );
  dat("DK-01: đính kèm được, giữ nguyên tên tiếng Việt có dấu", t1.tenTep === "hợp đồng khách A.pdf", t1.tenTep);
  dat("Nhận đúng kiểu tệp theo nội dung", t1.kieuTep === "application/pdf", t1.kieuTep);

  const ds1 = await voi(T, tpkd, (nc) => danhSachDinhKem(nc, "sales_order", donA.id));
  dat("Tệp hiện trong danh sách của chứng từ", ds1.tep.length === 1 && ds1.tep[0].id === t1.id);
  dat("Trưởng phòng thấy nút đính kèm", ds1.quyen.dinhKem === true);

  const dsNvA = await voi(T, nvA, (nc) => danhSachDinhKem(nc, "sales_order", donA.id));
  dat("Nhân viên phụ trách xem được tệp nhưng không thấy nút đính kèm", dsNvA.tep.length === 1 && dsNvA.quyen.dinhKem === false);
  const dsKho = await voi(T, thukho, (nc) => danhSachDinhKem(nc, "sales_order", donA.id));
  dat("Thủ kho (phạm vi toàn bộ) xem được tệp, không đính kèm được", dsKho.tep.length === 1 && dsKho.quyen.dinhKem === false);

  // ------------------------------------------------------------------
  console.log("\n— DK-02: phạm vi dữ liệu, không chỉ mã quyền —");

  await nemLoi("Nhân viên B KHÔNG đọc được tệp của đơn do A phụ trách", "khong-thay", () =>
    voi(T, nvB, (nc) => danhSachDinhKem(nc, "sales_order", donA.id)),
  );
  await nemLoi("Nhân viên B KHÔNG tải được tệp đó dù biết mã tệp", "khong-thay", () =>
    voi(T, nvB, (nc) => taiTep(nc, t1.id)),
  );
  const tpkdXem = ds1;
  dat("Trưởng phòng (phạm vi nhóm) đọc được tệp của nhân viên mình", tpkdXem.tep.length === 1);

  // ------------------------------------------------------------------
  console.log("\n— DK-03, DK-04: chặn tệp xấu —");

  await nemLoi("Tệp rỗng bị chặn", "dinh-dang", () =>
    voi(T, tpkd, (nc) => dinhKemTep(nc, { loai: "sales_order", doiTuongId: donA.id, tenTep: "rong.pdf", noiDung: new Uint8Array() })),
  );

  await nemLoi("DK-03: tệp vượt 20 MB bị chặn", "nghiep-vu", () =>
    voi(T, tpkd, (nc) =>
      dinhKemTep(nc, {
        loai: "sales_order",
        doiTuongId: donA.id,
        tenTep: "to.pdf",
        noiDung: new Uint8Array(DUNG_LUONG_TOI_DA + 1),
      }),
    ),
    "tep-qua-lon",
  );

  await nemLoi("DK-04: đuôi ngoài danh sách trắng bị chặn", "nghiep-vu", () =>
    voi(T, tpkd, (nc) =>
      dinhKemTep(nc, { loai: "sales_order", doiTuongId: donA.id, tenTep: "chay.exe", noiDung: new Uint8Array([0x4d, 0x5a]) }),
    ),
    "kieu-tep-khong-nhan",
  );

  await nemLoi("DK-04: TỆP ĐỘI LỐT — tên .pdf nhưng ruột là thứ khác", "nghiep-vu", () =>
    voi(T, tpkd, (nc) =>
      dinhKemTep(nc, {
        loai: "sales_order",
        doiTuongId: donA.id,
        tenTep: "that-su-la-exe.pdf",
        noiDung: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
      }),
    ),
    "kieu-tep-khong-nhan",
  );

  await nemLoi("DK-04: SVG bị chặn — mã chạy được, không phải tài liệu", "nghiep-vu", () =>
    voi(T, tpkd, (nc) =>
      dinhKemTep(nc, {
        loai: "sales_order",
        doiTuongId: donA.id,
        tenTep: "logo.svg",
        noiDung: new Uint8Array(Buffer.from("<svg onload=alert(1)>")),
      }),
    ),
  );

  const tenXau = await voi(T, tpkd, (nc) =>
    dinhKemTep(nc, { loai: "sales_order", doiTuongId: donA.id, tenTep: "../../../etc/passwd.txt", noiDung: new Uint8Array(Buffer.from("abc")) }),
  );
  dat("DK-05: tên tệp kiểu thoát thư mục bị làm sạch", tenXau.tenTep === "passwd.txt", tenXau.tenTep);

  // ------------------------------------------------------------------
  console.log("\n— DK-05: tải về đúng nội dung —");

  const noiDungGoc = PDF("noi dung mau");
  const taiVe = await voi(T, nvA, (nc) => taiTep(nc, t1.id));
  dat("Tải về đúng từng byte đã tải lên", Buffer.from(taiVe.noiDung).equals(Buffer.from(noiDungGoc)), `${taiVe.noiDung.length} byte`);
  dat("Tải về kèm đúng kiểu tệp", taiVe.thongTin.kieuTep === "application/pdf");

  // Sửa trộm tệp trên đĩa rồi tải lại — phải báo hỏng, không im lặng trả tệp sai.
  const banGhi = await chu.attachment.findFirstOrThrow({ where: { id: t1.id }, select: { storedPath: true } });
  writeFileSync(path.join(thuMucGoc(), banGhi.storedPath), Buffer.from(PDF("da bi doi")));
  await nemLoi("Tệp trên đĩa bị đổi thì KHÔNG trả về, báo lỗi rõ ràng", "nghiep-vu", () =>
    voi(T, nvA, (nc) => taiTep(nc, t1.id)),
    "tep-khong-khop",
  );

  // ------------------------------------------------------------------
  console.log("\n— DK-06: gỡ tệp là xóa mềm —");

  await nemLoi("Người không sửa được chứng từ thì không gỡ được tệp", "quyen", () =>
    voi(T, thukho, (nc) => goTep(nc, tenXau.id, "Thử gỡ")),
  );

  const daGo = await voi(T, tpkd, (nc) => goTep(nc, tenXau.id, "Tải nhầm tệp của chứng từ khác"));
  dat("DK-06: gỡ được tệp", daGo.daXoa === true);

  const ds2 = await voi(T, tpkd, (nc) => danhSachDinhKem(nc, "sales_order", donA.id));
  dat("Tệp đã gỡ không còn trong danh sách", ds2.tep.every((t) => t.id !== tenXau.id), String(ds2.tep.length));

  const conBanGhi = await chu.attachment.findFirstOrThrow({
    where: { id: tenXau.id },
    select: { deletedAt: true, deleteReason: true, deletedBy: true },
  });
  dat(
    "DK-06: bản ghi vẫn còn kèm lý do và người gỡ — không mất dấu vết",
    conBanGhi.deletedAt !== null && conBanGhi.deletedBy === tpkd && (conBanGhi.deleteReason ?? "").includes("Tải nhầm"),
    JSON.stringify(conBanGhi),
  );

  await nemLoi("Gỡ tệp đã gỡ rồi thì báo không thấy", "khong-thay", () =>
    voi(T, tpkd, (nc) => goTep(nc, tenXau.id, "Gỡ lần hai")),
  );
  await nemLoi("Tệp đã gỡ thì không tải về được nữa", "khong-thay", () =>
    voi(T, nvA, (nc) => taiTep(nc, tenXau.id)),
  );

  // ------------------------------------------------------------------
  console.log("\n— Trần số tệp —");

  const donB = await voi(T, tpkd, (nc) =>
    taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khachA.id,
      dong: [{ sanPhamId: sp.id, ten: "Máy in", soLuong: "1", donGia: "5000000", vat: 10 }],
    })),
  );
  for (let i = 0; i < SO_TEP_TOI_DA; i += 1) {
    await voi(T, tpkd, (nc) =>
      dinhKemTep(nc, { loai: "sales_order", doiTuongId: donB.id, tenTep: `tep-${i}.txt`, noiDung: new Uint8Array(Buffer.from(`noi dung ${i}`)) }),
    );
  }
  const dsDay = await voi(T, tpkd, (nc) => danhSachDinhKem(nc, "sales_order", donB.id));
  dat(`Đính đủ ${SO_TEP_TOI_DA} tệp thì báo hết chỗ`, dsDay.conThemDuoc === 0 && dsDay.tep.length === SO_TEP_TOI_DA, String(dsDay.tep.length));
  await nemLoi("Vượt trần số tệp bị chặn", "nghiep-vu", () =>
    voi(T, tpkd, (nc) =>
      dinhKemTep(nc, { loai: "sales_order", doiTuongId: donB.id, tenTep: "them.txt", noiDung: new Uint8Array(Buffer.from("x")) }),
    ),
    "qua-nhieu-tep",
  );

  // ------------------------------------------------------------------
  console.log("\n— Dấu vết —");

  const kiemToan = await chu.auditLog.count({ where: { tenantId: T, objectType: "attachment" } });
  dat("Mỗi lần đính kèm và gỡ đều ghi Nhật ký kiểm toán", kiemToan >= 3, String(kiemToan));
  const suKien = await chu.businessEvent.count({ where: { tenantId: T, eventType: { in: ["ATTACHMENT_ADDED", "ATTACHMENT_REMOVED"] } } });
  dat("Có sự kiện nghiệp vụ cho tệp thêm và tệp gỡ", suKien >= 3, String(suKien));

  await ketLuan("Thử Tệp đính kèm");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => chu.$disconnect());
