import { useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { NavTabIcon } from "@/GameInterface/Components/useNavEntries";
import { WORLD_ITEM, fullLabelKey, groupIconOf, isReadyGroup, navItemOf } from "@/GameInterface/Components/navItems";
import {
  NAV_MENU_LIMITS, addGroup, defaultMenu, findTab, groupCount, groupedMenu, moveNode, moveTabInGroup, moveTabIntoGroup,
  moveTabOutOfGroup, readNavMenu, removeGroup, renameGroup, resetMenu, setPosition, writeNavMenu,
  type NavMenu, type NavNode, type NavPosition,
} from "@/GameInterface/Components/navMenu";

type Dragged = { kind: "tab"; id: string } | { kind: "group"; id: string };

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const ROW = "flex min-h-10 items-center gap-2 rounded border bg-card px-2";
const ICON_BTN =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded border-0 bg-transparent text-muted-foreground cursor-pointer hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

function IconButton({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={ICON_BTN} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/**
 * The player's menu, edited in Settings (`navMenu.ts`): where it sits, the order of the tabs and his own groups. Rows
 * are dragged (a tab dropped on a group goes inside it) and every move also has a button, for the keyboard. Each change
 * is saved and shows in the bar at once. A group left empty lasts while this editor is open.
 */
export function NavMenuEditor() {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<NavMenu>(readNavMenu);
  const [drag, setDrag] = useState<Dragged | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const apply = (next: NavMenu) => {
    if (next === menu) return;
    setMenu(next);
    writeNavMenu(next);
  };
  const groups = menu.items.filter((n): n is Extract<NavNode, { kind: "group" }> => n.kind === "group");
  const groupLabel = (g: { id: string; name: string }) => g.name || (isReadyGroup(g.id) ? t(`nav.group.${g.id}`) : "");

  const endDrag = () => { setDrag(null); setOver(null); };
  const startDrag = (what: Dragged) => (e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", what.id); } catch { /* some browsers refuse: the state is enough */ }
    setDrag(what);
  };
  /** A drop target: `accepts` decides by what is dragged; the innermost target takes the drop. */
  const target = (key: string, accepts: (d: Dragged) => boolean, onDrop: (d: Dragged) => void) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!drag || !accepts(drag)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (over !== key) setOver(key);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!drag || !accepts(drag)) return;
      e.preventDefault();
      e.stopPropagation();
      onDrop(drag);
      endDrag();
    },
  });

  /** Dropped before the top-level entry at `index` (`items.length` = the end). */
  const dropAtTop = (d: Dragged, index: number) => {
    if (d.kind === "group") {
      const from = menu.items.findIndex((n) => n.kind === "group" && n.id === d.id);
      if (from >= 0) apply(moveNode(menu, from, from < index ? index - 1 : index));
      return;
    }
    const at = findTab(menu, d.id);
    if (!at) return;
    apply(at.groupId === null ? moveNode(menu, at.index, at.index < index ? index - 1 : index) : moveTabOutOfGroup(menu, d.id, index));
  };
  const any = () => true;
  const tabOnly = (d: Dragged) => d.kind === "tab";

  const tabName = (id: string): ReactNode => {
    const item = navItemOf(id);
    if (!item) return id;
    return (
      <>
        <NavTabIcon item={item} size={18} />
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{t(fullLabelKey(item))}</span>
        {id === WORLD_ITEM.href && <span className="shrink-0 text-sm text-muted-foreground">{t("settings.menu.worldOnly")}</span>}
      </>
    );
  };
  const handle = <Icon name="more" size={16} className="shrink-0 text-muted-foreground" />;
  const rowTone = (key: string) => (over === key ? "border-primary" : "border-border");

  const full = groupCount(menu) >= NAV_MENU_LIMITS.GROUPS;

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-1">
        <div className="flex flex-col gap-2">
          <div className={LABEL}>{t("settings.menu.position")}</div>
          <OptionChips<NavPosition>
            value={menu.position}
            onChange={(k) => apply(setPosition(menu, k))}
            options={[{ key: "top", label: t("settings.menu.top") }, { key: "left", label: t("settings.menu.left") }]}
          />
          <p className="m-0 text-sm text-muted-foreground">{t("settings.menu.positionHint")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5">
          <Button variant="secondary" flush onClick={() => apply({ ...defaultMenu(), position: menu.position })}>{t("settings.menu.presetFlat")}</Button>
          <Button variant="secondary" flush onClick={() => apply({ ...groupedMenu(), position: menu.position })}>{t("settings.menu.presetGroups")}</Button>
        </div>

        <p className="m-0 text-sm text-muted-foreground">{t("settings.menu.help")}</p>

        <div className="flex flex-wrap items-center gap-x-5">
          <Button variant="secondary" flush disabled={full} title={full ? t("settings.menu.groupLimit") : undefined} onClick={() => apply(addGroup(menu, t("settings.menu.newGroup")))}>
            <Icon name="plus" size={16} />
            {t("settings.menu.newGroup")}
          </Button>
          <Button variant="secondary" flush onClick={() => apply(resetMenu())}>{t("settings.menu.reset")}</Button>
        </div>
      </div>

      {/* The list scrolls inside its own panel, so the controls beside it stay in view. */}
      <ul
        className="m-0 flex list-none flex-col gap-1.5 overflow-y-auto p-0 pr-1 lg:col-span-2 lg:max-h-[calc(100vh-17rem)]"
        onDragEnd={endDrag}
      >
        {menu.items.map((node, i) => {
          const last = i === menu.items.length - 1;
          if (node.kind === "tab") {
            const key = `top:${node.id}`;
            return (
              <li
                key={key}
                draggable
                onDragStart={startDrag({ kind: "tab", id: node.id })}
                {...target(key, any, (d) => dropAtTop(d, i))}
                className={`${ROW} cursor-grab ${rowTone(key)} ${drag?.kind === "tab" && drag.id === node.id ? "opacity-50" : ""}`}
              >
                {handle}
                <span className="flex min-w-0 flex-1 items-center gap-2">{tabName(node.id)}</span>
                {groups.length > 0 && (
                  <select
                    value=""
                    aria-label={t("settings.menu.moveToGroup")}
                    title={t("settings.menu.moveToGroup")}
                    onChange={(e) => { if (e.target.value) apply(moveTabIntoGroup(menu, node.id, e.target.value)); }}
                    className="h-8 max-w-[11rem] shrink-0 rounded border border-border bg-card px-2 text-sm text-muted-foreground"
                  >
                    <option value="">{t("settings.menu.moveToGroup")}</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{groupLabel(g) || t("nav.group.unnamed")}</option>)}
                  </select>
                )}
                <IconButton icon="chevron-up" label={t("settings.menu.up")} disabled={i === 0} onClick={() => apply(moveNode(menu, i, i - 1))} />
                <IconButton icon="chevron-down" label={t("settings.menu.down")} disabled={last} onClick={() => apply(moveNode(menu, i, i + 1))} />
              </li>
            );
          }
          const key = `group:${node.id}`;
          const look = groupIconOf(node.id);
          // On the group: a tab goes inside it (at the end), another group takes its place before it.
          const onGroup = target(key, any, (d) => (d.kind === "tab" ? apply(moveTabIntoGroup(menu, d.id, node.id)) : dropAtTop(d, i)));
          return (
            <li key={key} {...onGroup} className={`flex flex-col gap-1.5 rounded-md border p-2 ${rowTone(key)} ${drag?.kind === "group" && drag.id === node.id ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <span draggable onDragStart={startDrag({ kind: "group", id: node.id })} className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center" title={t("settings.menu.drag")}>
                  {handle}
                </span>
                <Icon name={look.icon} size={18} className={`shrink-0 ${look.tone}`} />
                <input
                  type="text"
                  value={groupLabel(node)}
                  maxLength={NAV_MENU_LIMITS.NAME}
                  placeholder={t("settings.menu.groupName")}
                  aria-label={t("settings.menu.groupName")}
                  onChange={(e) => apply(renameGroup(menu, node.id, e.target.value))}
                  className="h-8 min-w-0 flex-1 rounded border border-border bg-transparent px-2 font-display text-sm font-bold uppercase tracking-[0.08em] text-foreground focus:border-primary focus:outline-none"
                />
                <IconButton icon="chevron-up" label={t("settings.menu.up")} disabled={i === 0} onClick={() => apply(moveNode(menu, i, i - 1))} />
                <IconButton icon="chevron-down" label={t("settings.menu.down")} disabled={last} onClick={() => apply(moveNode(menu, i, i + 1))} />
                <IconButton icon="trash2" label={t("settings.menu.deleteGroup")} onClick={() => apply(removeGroup(menu, node.id))} />
              </div>
              {node.tabs.length === 0 && <p className="m-0 pl-8 text-sm text-muted-foreground">{t("settings.menu.emptyGroup")}</p>}
              {node.tabs.map((id, j) => {
                const inKey = `in:${node.id}:${id}`;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={startDrag({ kind: "tab", id })}
                    {...target(inKey, tabOnly, (d) => apply(moveTabIntoGroup(menu, d.id, node.id, j)))}
                    className={`${ROW} ml-8 cursor-grab ${rowTone(inKey)} ${drag?.kind === "tab" && drag.id === id ? "opacity-50" : ""}`}
                  >
                    {handle}
                    <span className="flex min-w-0 flex-1 items-center gap-2">{tabName(id)}</span>
                    <IconButton icon="arrow-left" label={t("settings.menu.leaveGroup")} onClick={() => apply(moveTabOutOfGroup(menu, id))} />
                    <IconButton icon="chevron-up" label={t("settings.menu.up")} disabled={j === 0} onClick={() => apply(moveTabInGroup(menu, node.id, j, j - 1))} />
                    <IconButton icon="chevron-down" label={t("settings.menu.down")} disabled={j === node.tabs.length - 1} onClick={() => apply(moveTabInGroup(menu, node.id, j, j + 1))} />
                  </div>
                );
              })}
            </li>
          );
        })}
        {/* The end of the list: where a dragged row lands last. */}
        <li
          aria-hidden="true"
          {...target("end", any, (d) => dropAtTop(d, menu.items.length))}
          className={`h-3 rounded border border-dashed ${drag ? rowTone("end") : "border-transparent"}`}
        />
      </ul>
    </div>
  );
}
