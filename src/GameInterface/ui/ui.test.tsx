import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Panel } from "@/GameInterface/ui/Panel";
import { DataTable } from "@/GameInterface/ui/DataTable";
import { Button } from "@/GameInterface/ui/Button";
import { Tabs } from "@/GameInterface/ui/Tabs";
import { Notice } from "@/GameInterface/ui/Notice";

describe("ui components", () => {
  test("Panel renders children", () => {
    expect(renderToStaticMarkup(<Panel>oi</Panel>)).toContain("oi");
  });
  test("DataTable renders headers, rows and highlight", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ key: "n", header: "Nome", cell: (r: { n: string }) => r.n }]}
        rows={[{ n: "A" }, { n: "B" }]}
        rowKey={(r) => r.n}
        isHighlighted={(r) => r.n === "B"}
      />,
    );
    expect(html).toContain("Nome");
    expect(html).toContain("bg-primary/10");
  });
  test("Button variants", () => {
    expect(renderToStaticMarkup(<Button variant="danger">x</Button>)).toContain("bg-destructive");
  });
  test("Tabs marks active", () => {
    const html = renderToStaticMarkup(<Tabs tabs={[{ key: "a", label: "A" }, { key: "b", label: "B" }]} active="b" onChange={() => {}} />);
    expect(html).toContain('aria-selected="true"');
  });
  test("Notice error has alert role", () => {
    expect(renderToStaticMarkup(<Notice kind="error">x</Notice>)).toContain('role="alert"');
  });
});
