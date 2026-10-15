import { useState } from "react";
import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { worldApi, type WorldApiError } from "@/GameInterface/World/worldApi";

/** The owner's friends, one "Invite" each (`POST /api/worlds/:saveId/invites`). */
export function InviteFriendsModal({ saveId, open, onClose, members }: {
  saveId: string; open: boolean; onClose: () => void; members: string[];
}) {
  const { t } = useTranslation();
  const s = useSocial();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<string | null>(null);
  const [error, setError] = useState<WorldApiError | null>(null);
  const friends = s.lists.friends.filter((f) => !members.includes(f.nickname));

  async function invite(nickname: string) {
    setInviting(nickname);
    const r = await worldApi.invite(saveId, nickname);
    setInviting(null);
    if (r.ok) {
      setError(null);
      setSent((prev) => new Set(prev).add(nickname));
    } else {
      setError(r.error);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="p-5 flex flex-col gap-4">
        <DialogTitle as="h2" className="font-display font-black uppercase text-xl leading-none m-0">
          {t("world.invite.friendsTitle")}
        </DialogTitle>
        {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("world.invite.noFriends")}</p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-2">
            {friends.map((f) => (
              <li key={f.nickname} className="flex items-center justify-between gap-3">
                <span className="font-semibold text-foreground truncate">{f.nickname}</span>
                <Button onClick={() => void invite(f.nickname)} disabled={sent.has(f.nickname) || inviting !== null}>
                  {sent.has(f.nickname) ? t("world.invite.sent") : t("world.invite.send")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" flush onClick={onClose}>{t("common.close")}</Button>
      </div>
    </Modal>
  );
}
