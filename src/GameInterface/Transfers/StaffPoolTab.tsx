import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { Notice } from "@/GameInterface/ui/Notice";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { TextField } from "@/GameInterface/ui/TextField";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { formatWageFull } from "@/Domain/money";
import { starsIn } from "@/Domain/staff/staff";
import { COACH_AREAS, ROLE_SPECIALTY, STAFF_ROLES, isStaffRole, type CoachArea, type StaffRole } from "@/Domain/staff/staffTypes";
import { DP_CATEGORIES } from "@/GameEngine/PlayerDevelopment";
import { defaultPoolSortDir, type StaffPoolItem, type StaffPoolSort, type StaffPoolSortDir } from "@/Domain/staff/staffPool";
import { Icon } from "@/GameInterface/Icons";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import { StaffDetailModal } from "@/GameInterface/Staff/StaffDetailModal";
import { StrongCountry } from "@/GameInterface/Scouting/StrongCountry";
import { StaffFace } from "@/GameInterface/Components/PersonFace";
import { staffCall, type StaffData, type StaffPoolPage } from "@/GameInterface/Staff/staffApi";
import { HireStaffModal } from "@/GameInterface/Transfers/HireStaffModal";

type RoleKey = "all" | StaffRole;
type MinStars = "any" | "2" | "3" | "4" | "4.5";
const PAGE = 50;

/** A column header that sorts the whole pool by it (server-side); the active one shows its direction. */
function SortHeader({ col, label, align, sort, dir, onSort }: {
  col: StaffPoolSort; label: string; align: "left" | "center";
  sort: StaffPoolSort; dir: StaffPoolSortDir; onSort: (col: StaffPoolSort) => void;
}) {
  const active = sort === col;
  return (
    <th className={`${TABLE_CELL.head} ${align === "left" ? "text-left" : "text-center"}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer font-display font-bold uppercase tracking-[0.08em] text-[13px] hover:text-primary transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
        {active && <Icon name={dir === "asc" ? "chevron-up" : "chevron-down"} size={16} className="text-primary" />}
      </button>
    </th>
  );
}

const coachAreasOf = (m: StaffPoolItem): Record<CoachArea, number> =>
  Object.fromEntries(COACH_AREAS.map((a) => [a, starsIn(m, a)])) as Record<CoachArea, number>;

/**
 * Transfers → Staff (`.claude/rules/game/staff.md`): the save's free professionals, filtered by
 * role, minimum stars and maximum wage, with the asking wage at the club's wage factor. Hiring
 * opens `HireStaffModal`; unemployed, the list stays visible and hiring is disabled.
 */
export function StaffPoolTab({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const [role, setRole] = useState<RoleKey>(() => {
    const r = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("role") : null;
    return isStaffRole(r) ? r : "all";
  });
  const [minStars, setMinStars] = useState<MinStars>("any");
  const [maxWage, setMaxWage] = useState("");
  // The search follows the wage field only after the user stops typing (~300 ms).
  const [maxWageQuery, setMaxWageQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setMaxWageQuery(maxWage), 300);
    return () => clearTimeout(id);
  }, [maxWage]);
  const [sort, setSort] = useState<StaffPoolSort>("stars");
  const [dir, setDir] = useState<StaffPoolSortDir>("desc");
  const onSort = (col: StaffPoolSort) => {
    if (col === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(col); setDir(defaultPoolSortDir(col)); }
  };
  const [page, setPage] = useState<StaffPoolPage | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [staff, setStaff] = useState<StaffData | null>(null);
  const [hiring, setHiring] = useState<StaffPoolItem | null>(null);
  const [viewing, setViewing] = useState<StaffPoolItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useCallback((offset: number) => {
    const p = new URLSearchParams({ sort, dir, offset: String(offset), limit: String(PAGE) });
    if (role !== "all") p.set("role", role);
    if (minStars !== "any") p.set("minStars", minStars);
    const wage = Number(maxWageQuery.replace(/[^\d]/g, ""));
    if (maxWageQuery.trim() !== "" && Number.isFinite(wage)) p.set("maxWage", String(wage));
    return `/api/saves/${saveId}/staff/pool?${p}`;
  }, [saveId, role, minStars, maxWageQuery, sort, dir]);

  const loadStaff = useCallback(async () => {
    const r = await staffCall<StaffData>(`/api/saves/${saveId}/staff`);
    setStaff(r.ok ? r.data : null);
  }, [saveId]);

  useEffect(() => { void loadStaff(); }, [loadStaff]);

  useEffect(() => {
    let live = true;
    setPage(null);
    void staffCall<StaffPoolPage>(query(0)).then((r) => {
      if (!live) return;
      if (r.ok) { setPage(r.data); setLoadFailed(false); }
      else setLoadFailed(true);
    });
    return () => { live = false; };
  }, [query]);

  async function more() {
    if (!page) return;
    const r = await staffCall<StaffPoolPage>(query(page.items.length));
    if (r.ok) setPage({ total: r.data.total, items: [...page.items, ...r.data.items] });
  }

  const strongIn = (m: StaffPoolItem): string => {
    if (m.role === "coach") {
      const by = coachAreasOf(m);
      const best = COACH_AREAS.reduce((a, b) => (by[b] > by[a] ? b : a));
      return t(`staff.area.${best}`);
    }
    const s = ROLE_SPECIALTY[m.role];
    return (DP_CATEGORIES as readonly string[]).includes(s) ? t(`staff.area.${s}`) : t(`staff.specialty.${s}`);
  };

  const profile = useMemo(() => viewing && {
    ...viewing,
    ...(viewing.role === "coach" ? { starsByArea: coachAreasOf(viewing) } : {}),
  }, [viewing]);

  return (
    <div className="flex flex-col gap-6">
      {!staff && <Notice kind="warning">{t("staffPool.noClub")}</Notice>}
      {notice && <Notice kind="info">{notice}</Notice>}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{t("staffPool.role")}</Label>
          <OptionChips<RoleKey>
            value={role}
            onChange={setRole}
            options={[{ key: "all", label: t("staffPool.all") }, ...STAFF_ROLES.map((r) => ({ key: r, label: t(`staff.roles.${r}`) }))]}
          />
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-2">
            <Label>{t("staffPool.minStars")}</Label>
            <OptionChips<MinStars>
              value={minStars}
              onChange={setMinStars}
              options={[
                { key: "any", label: t("staffPool.any") },
                ...(["2", "3", "4", "4.5"] as const).map((s) => ({ key: s, label: `${s.replace(".", ",")}★` })),
              ]}
            />
          </div>
          <TextField
            id="staff-pool-max-wage"
            variant="box"
            label={t("staffPool.maxWage")}
            inputMode="numeric"
            value={maxWage}
            onChange={(e) => setMaxWage(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {loadFailed ? (
        <p className="text-sm text-muted-foreground m-0">{t("staffPool.loadFailed")}</p>
      ) : !page ? (
        <p className="text-sm text-muted-foreground m-0">{t("staffPool.loading")}</p>
      ) : page.items.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("staffPool.empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("staffPool.total", { count: page.total })}</p>
          <div className={`${TABLE_STYLE.shell} overflow-x-auto`}>
            <table className="w-full">
              <thead className={TABLE_STYLE.head}>
                <tr>
                  <SortHeader col="name" label={t("staffPool.colName")} align="left" sort={sort} dir={dir} onSort={onSort} />
                  <SortHeader col="role" label={t("staffPool.colRole")} align="left" sort={sort} dir={dir} onSort={onSort} />
                  <SortHeader col="age" label={t("staffPool.colAge")} align="center" sort={sort} dir={dir} onSort={onSort} />
                  <SortHeader col="stars" label={t("staffPool.colStars")} align="left" sort={sort} dir={dir} onSort={onSort} />
                  <th className={`${TABLE_CELL.head} text-left`}>{t("staffPool.colStrong")}</th>
                  <SortHeader col="wage" label={t("staffPool.colWage")} align="center" sort={sort} dir={dir} onSort={onSort} />
                  <th className={TABLE_CELL.head} />
                </tr>
              </thead>
              <tbody className={TABLE_STYLE.body}>
                {page.items.map((m) => (
                  <tr key={m.id} className={TABLE_STYLE.row}>
                    <td className={TABLE_CELL.body}>
                      <span className="flex items-center gap-3">
                        <StaffFace member={m} size={32} ringClassName="border border-border" />
                        <button type="button" className={`${TABLE_STYLE.name} text-left hover:text-primary cursor-pointer bg-transparent border-0 p-0`} onClick={() => setViewing(m)}>
                          {m.name}
                        </button>
                      </span>
                    </td>
                    <td className={`${TABLE_CELL.body} text-sm`}>{t(`staff.roles.${m.role}`)}</td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{m.age}</td>
                    <td className={TABLE_CELL.body}><StaffStars stars={m.stars} /></td>
                    <td className={`${TABLE_CELL.body} text-sm text-muted-foreground`}>
                      {m.strongCountry ? <StrongCountry country={m.strongCountry.country} k={m.strongCountry.k} /> : strongIn(m)}
                    </td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{formatWageFull(m.askingWage)}</td>
                    <td className={`${TABLE_CELL.body} text-right`}>
                      <Button variant="secondary" flush disabled={!staff} onClick={() => setHiring(m)}>{t("staffPool.hire")}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.items.length < page.total && (
            <Button variant="secondary" className="self-start" onClick={() => void more()}>{t("staffPool.loadMore")}</Button>
          )}
        </div>
      )}

      <StaffDetailModal
        saveId={saveId}
        member={profile || null}
        mode="pool"
        onClose={() => setViewing(null)}
        onHire={staff ? () => { setHiring(viewing); setViewing(null); } : undefined}
      />
      <HireStaffModal
        saveId={saveId}
        member={hiring}
        staff={staff}
        onClose={() => setHiring(null)}
        onHired={(next, name) => {
          setStaff(next);
          setHiring(null);
          setNotice(t("staffPool.hired", { name }));
          setPage((p) => (p ? { total: p.total - 1, items: p.items.filter((x) => x.id !== hiring?.id) } : p));
        }}
      />
    </div>
  );
}
