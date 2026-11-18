// A friend's account profile (`docs/superpowers/specs/2026-11-18-account-profile-design.md`): the start screen's
// blocks, without the list of saves.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Icon } from "@/GameInterface/Icons";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import { fetchAccountProfile } from "@/GameInterface/Account/accountApi";
import { AccountAchievements, CareersTable, ProfileHeader, ProfileStats, TrophyCabinet } from "@/GameInterface/Account/AccountProfileBlocks";
import type { AccountProfileView } from "@/types/accountTypes";

export function FriendProfileModal({ nickname, onClose }: { nickname: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<AccountProfileView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setView(null);
    setFailed(false);
    if (!nickname) return;
    let live = true;
    void fetchAccountProfile(nickname).then((v) => {
      if (!live) return;
      if (v) setView(v);
      else setFailed(true);
    });
    return () => { live = false; };
  }, [nickname]);

  return (
    <Modal open={nickname !== null} onClose={onClose} size="report">
      <div className="p-5 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("account.friendTitle", { nickname: nickname ?? "" })}</h2>
          <button type="button" onClick={onClose} aria-label={t("social.close")} title={t("social.close")}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
            <Icon name="close" size={16} />
          </button>
        </div>
        {failed && <p role="alert" className="text-sm text-destructive m-0">{t("account.loadFailed")}</p>}
        {!view && !failed && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
        {view && (
          <>
            <ProfileHeader view={view} />
            <ProfileStats view={view} />
            <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
              <TrophyCabinet view={view} />
              <AccountAchievements view={view} />
            </div>
            <div>
              <SectionTitle className="mb-3"><TitleParts accent={t("account.allCareers.accent")}>{t("account.allCareers.main")}</TitleParts></SectionTitle>
              <CareersTable view={view} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
