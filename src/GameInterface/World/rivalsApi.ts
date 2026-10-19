import { worldCall as call } from "@/GameInterface/World/worldApi";
import type { ChatMessageView } from "@/types/socialTypes";
import type { LiveScoreView, ResultsPage, RivalsView, TauntKind, TauntTarget } from "@/types/rivalsTypes";

const seg = (s: string) => encodeURIComponent(s);

export const rivalsApi = {
  rivals: (saveId: string) => call<RivalsView>("GET", `/api/worlds/${seg(saveId)}/rivals`),
  live: (saveId: string) => call<{ live: LiveScoreView[] }>("GET", `/api/worlds/${seg(saveId)}/live`),
  results: (saveId: string, opts: { seat?: string | null; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.seat) q.set("seat", opts.seat);
    if (opts.offset) q.set("offset", String(opts.offset));
    const qs = q.toString();
    return call<ResultsPage>("GET", `/api/worlds/${seg(saveId)}/results${qs ? `?${qs}` : ""}`);
  },
  taunt: (saveId: string, body: { target: TauntTarget; kind: TauntKind; id: string }) =>
    call<{ message: ChatMessageView }>("POST", `/api/worlds/${seg(saveId)}/taunts`, body),
};
