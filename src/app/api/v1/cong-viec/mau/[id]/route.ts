import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoMauViec, suaMauViec } from "@/modules/cong-viec/mau-lap";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaMauViec(nc, id, await docThan(req, LuocDoMauViec)));
