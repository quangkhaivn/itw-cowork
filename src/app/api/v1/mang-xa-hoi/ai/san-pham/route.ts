import { xuLyApi } from "@/lib/api";
import { sanPhamDeVietBai } from "@/modules/mang-xa-hoi/ai/service";

/** Sản phẩm để chọn cho AI viết bài — giá bán + tình trạng tồn, KHÔNG có giá vốn / nhà cung cấp (QĐ-237). */
export const GET = xuLyApi((nc, req) => sanPhamDeVietBai(nc, req.nextUrl.searchParams.get("q")?.slice(0, 100) ?? null), { quyen: "product.view" });
