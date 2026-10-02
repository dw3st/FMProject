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
    expect(renderToStaticMarkup(<Button variant="danger">x</Button>)).toContain("text-destructive");
  });
  test("Tabs marks active", () => {
    const html = renderToStaticMarkup(<Tabs tabs={[{ key: "a", label: "A" }, { key: "b", label: "B" }]} active="b" onChange={() => {}} />);
    expect(html).toContain('aria-selected="true"');
  });
  test("Notice error has alert role", () => {
    expect(renderToStaticMarkup(<Notice kind="error">x</Notice>)).toContain('role="alert"');
  });
});

import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { Label } from "@/GameInterface/ui/Label";
import { ChoiceCard } from "@/GameInterface/ui/ChoiceCard";
import { Chip } from "@/GameInterface/ui/Chip";
import { TextField } from "@/GameInterface/ui/TextField";
import { StatBar } from "@/GameInterface/ui/StatBar";
import { Badge } from "@/GameInterface/ui/Badge";

describe("ui standard components", () => {
  test("ScreenTitle uses the heavy display style", () => {
    const html = renderToStaticMarkup(<ScreenTitle subtitle="sub">Elenco</ScreenTitle>);
    expect(html).toContain("font-black");
    expect(html).toContain("text-3xl");
    expect(html).toContain("sub");
  });
  test("SectionTitle and Label", () => {
    expect(renderToStaticMarkup(<SectionTitle>S</SectionTitle>)).toContain("text-xl");
    expect(renderToStaticMarkup(<Label>L</Label>)).toContain("tracking-[0.08em]");
  });
  test("ChoiceCard / Chip mark selection", () => {
    expect(renderToStaticMarkup(<ChoiceCard title="A" selected onSelect={() => {}} />)).toContain("ring-primary");
    expect(renderToStaticMarkup(<Chip selected>x</Chip>)).toContain("border-primary");
  });
  test("TextField shows its label", () => {
    expect(renderToStaticMarkup(<TextField id="n" label="Nome" />)).toContain("Nome");
  });
  test("StatBar shows the number and a 6px track", () => {
    const html = renderToStaticMarkup(<StatBar value={5} />);
    expect(html).toContain("h-1.5");
    expect(html).toContain("5.0");
  });
  test("Badge is at least text-sm", () => {
    expect(renderToStaticMarkup(<Badge>ok</Badge>)).toContain("text-sm");
  });
});

import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { StatsTable, StatsHead, StatsRow, NumberCell, NameCell } from "@/GameInterface/Components/StatsTable";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";

describe("Leagues look shared with Stats", () => {
  test("SegmentedTabs marks the active tab and disables tabs", () => {
    const html = renderToStaticMarkup(
      <SegmentedTabs
        tabs={[{ key: "a", label: "A" }, { key: "b", label: "B", disabled: true }]}
        active="a"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("disabled");
  });
  test("SegmentedTabs accepts no active tab", () => {
    const html = renderToStaticMarkup(<SegmentedTabs tabs={[{ key: "a", label: "A" }]} active={null} onChange={() => {}} />);
    expect(html).not.toContain('aria-selected="true"');
  });
  test("StatsTable uses the Leagues table classes", () => {
    const html = renderToStaticMarkup(
      <StatsTable head={<StatsHead>Jogador</StatsHead>}>
        <StatsRow highlight>
          <NameCell>Fulano</NameCell>
          <NumberCell strong>7</NumberCell>
          <NumberCell>3</NumberCell>
        </StatsRow>
      </StatsTable>,
    );
    expect(html).toContain(TABLE_STYLE.shell);
    expect(html).toContain(TABLE_STYLE.head);
    expect(html).toContain(TABLE_STYLE.key);
    expect(html).toContain(TABLE_STYLE.number);
    expect(html).toContain(TABLE_STYLE.rowHighlight);
  });
});
