import { afterAll, describe, expect, test } from "bun:test";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { SaveService } from "@/backend/SaveService";
import type { NewsItem } from "@/types/newsTypes";

const item = (id: string, date: string): NewsItem => ({ id, date, kind: "thrashing", importance: 1, clubIds: [], playerIds: [], params: {} });

describe("news DAL", () => {
  const saveId = `news-dal-${Date.now()}`;
  const fs = new FileSystemDAL();
  afterAll(async () => { await fs.deleteSave(saveId); });

  test("append por mês, sem duplicar id, lista os meses", async () => {
    const buf = new BufferingSaveDAL(new FileSystemDAL());
    const svc = new SaveService(buf);
    await svc.appendNews(saveId, [item("a", "2027-03-10"), item("b", "2027-04-01")]);
    await svc.appendNews(saveId, [item("a", "2027-03-10")]);
    expect(await fs.listNewsMonths(saveId)).toEqual([]);          // nada sem flush
    await buf.flush();
    const svc2 = new SaveService(new FileSystemDAL());
    expect((await svc2.getNewsMonth(saveId, "2027-03")).map((n) => n.id)).toEqual(["a"]);
    expect(await svc2.listNewsMonths(saveId)).toEqual(["2027-03", "2027-04"]);
  });
  test("apaga meses antigos", async () => {
    const svc = new SaveService(new FileSystemDAL());
    await svc.pruneNews(saveId, "2027-04");
    expect(await svc.listNewsMonths(saveId)).toEqual(["2027-04"]);
  });
});
