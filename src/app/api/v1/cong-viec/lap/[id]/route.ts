import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoLapViec, suaLapViec } from "@/modules/cong-viec/mau-lap";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaLapViec(nc, id, await docThan(req, LuocDoLapViec)));
