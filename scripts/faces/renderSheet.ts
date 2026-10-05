/**
 * Face pilot: renders a grid of generated faces to a local HTML page (for a headless-browser
 * screenshot) to check how each hair / facial-hair id looks.
 *   bun scripts/faces/renderSheet.ts <out.html> hair|beard|combos
 */
import { writeFileSync } from "node:fs";
import { faceToSvgString, generate } from "facesjs";
import { FACIAL_HAIR_IDS, HAIR_IDS, HAIR_COLORS, SKIN_COLORS, applyFaceTraits, type FaceTraits } from "@/Domain/faces/faceTraits";
import { playerFaceSvg } from "@/Domain/faces/playerFaceSvg";

const [out, mode = "hair"] = process.argv.slice(2);
const cells: { label: string; svg: string }[] = [];
const face = (hair: string, beard: string, skin: string, hairColor: string) => {
  const f = generate({ teamColors: ["#2b6cb0", "#ffffff", "#1a365d"], jersey: { id: "jersey" }, glasses: { id: "none" }, accessories: { id: "none" }, hair: { id: hair, color: hairColor }, facialHair: { id: beard }, body: { color: skin }, hairBg: { id: hair === "longHair" ? "longHair" : "none" }, head: { id: "head1", shave: "rgba(0,0,0,0)" } } as never, { gender: "male", race: "white" });
  return faceToSvgString(f);
};
if (mode === "hair") for (const [len, ids] of Object.entries(HAIR_IDS)) for (const id of ids) cells.push({ label: `${len}:${id}`, svg: face(id, "none", SKIN_COLORS[4], HAIR_COLORS.black) });
if (mode === "allhair") for (const id of ["afro","afro2","bald","blowoutFade","cornrows","crop-fade","crop-fade2","crop","curly","curly2","curly3","curlyFade1","curlyFade2","dreads","emo","faux-hawk","fauxhawk-fade","hair","high","juice","longHair","messy-short","messy","middle-part","parted","shaggy1","shaggy2","short-bald","short-fade-2","short-fade","short","short2","short3","shortBangs","spike","spike2","spike3","spike4","tall-fade"]) cells.push({ label: id, svg: face(id, "none", SKIN_COLORS[2], HAIR_COLORS.brown) });
if (mode === "beard") for (const [k, ids] of Object.entries(FACIAL_HAIR_IDS)) for (const id of ids) for (const s of [2, 7] as const) cells.push({ label: `${k}:${id} s${s}`, svg: face("short", id, SKIN_COLORS[s], HAIR_COLORS.black) });
if (mode === "combos") {
  const traits: FaceTraits[] = [];
  for (const skin of [1, 3, 5, 7] as const) for (const [hairLength, beard] of [["bald", "full"], ["short", "stubble"], ["medium", "none"], ["long", "full"]] as const)
    traits.push({ skin, hairColor: skin >= 5 ? "black" : skin === 1 ? "blond" : "brown", hairLength, beard });
  traits.forEach((t, i) => cells.push({ label: JSON.stringify(t).replace(/"/g, ""), svg: playerFaceSvg(`p${i}`, "England", ["#c53030", "#ffffff"], t) }));
}
const b64 = (s: string) => Buffer.from(s).toString("base64");
writeFileSync(out!, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff;font:12px sans-serif"><div style="display:grid;grid-template-columns:repeat(8,150px);gap:4px">${cells.map((c) => `<div><img width=150 height=225 src="data:image/svg+xml;base64,${b64(c.svg)}"><div style="height:30px;overflow:hidden">${c.label}</div></div>`).join("")}</div>`);
console.log(cells.length);
