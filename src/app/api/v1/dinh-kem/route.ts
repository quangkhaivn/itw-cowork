import { xuLyApi } from "@/lib/api";
import { LoiDinhDang } from "@/lib/loi";
import { danhSachDinhKem, dinhKemTep } from "@/modules/dinh-kem/service";
import { LOAI_DOI_TUONG, type LoaiDoiTuong } from "@/modules/dinh-kem/tinh-toan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function docThamSo(loai: string, doiTuongId: string): { loai: LoaiDoiTuong; doiTuongId: string } {
  if (!(LOAI_DOI_TUONG as readonly string[]).includes(loai)) {
    throw new LoiDinhDang("loai", "Loại chứng từ không nhận đính kèm.");
  }
  if (!LA_UUID.test(doiTuongId)) throw new LoiDinhDang("doiTuong", "Mã chứng từ không hợp lệ.");
  return { loai: loai as LoaiDoiTuong, doiTuongId };
}

/** Danh sách tệp của một chứng từ. */
export const GET = xuLyApi(async (nc, req) => {
  const q = req.nextUrl.searchParams;
  const { loai, doiTuongId } = docThamSo(q.get("loai") ?? "", q.get("doiTuong") ?? "");
  return danhSachDinhKem(nc, loai, doiTuongId);
});

/**
 * Đính kèm một tệp. Nhận multipart/form-data — không phải JSON, vì gói tệp nhị phân
 * vào JSON thì phải mã hóa base64 và phình thêm một phần ba.
 */
export const POST = xuLyApi(async (nc, req) => {
  const form = await req.formData();
  const { loai, doiTuongId } = docThamSo(String(form.get("loai") ?? ""), String(form.get("doiTuong") ?? ""));

  const tep = form.get("tep");
  if (!(tep instanceof File)) throw new LoiDinhDang("tep", "Chưa chọn tệp.");

  const ghiChuTho = form.get("ghiChu");
  return dinhKemTep(nc, {
    loai,
    doiTuongId,
    tenTep: tep.name,
    noiDung: new Uint8Array(await tep.arrayBuffer()),
    ghiChu: typeof ghiChuTho === "string" ? ghiChuTho.slice(0, 2000) : null,
  });
});
