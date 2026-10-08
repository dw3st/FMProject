import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chip } from "@/GameInterface/ui/Chip";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { topicDefault, type InboxPrefs, type InboxTopic } from "@/Domain/inbox/inboxTopics";

interface TopicState {
  topic: InboxTopic;
  enabled: boolean;
  locked: boolean;
}

/**
 * Inbox preferences (`.claude/rules/game/responsibilities.md`): one switch per news topic. A
 * switched-off topic is not written at all; topics that ask for an action stay on.
 */
export function InboxPrefsPanel({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const [topics, setTopics] = useState<TopicState[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/saves/${saveId}/inbox-prefs`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: { topics: TopicState[] }) => { if (alive) setTopics(j.topics); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [saveId]);

  async function toggle(topic: InboxTopic) {
    if (!topics || busy) return;
    const next = topics.map((x) => (x.topic === topic ? { ...x, enabled: !x.enabled } : x));
    const prefs: InboxPrefs = {};
    // Only what differs from the default is stored: a default changed later still reaches untouched topics.
    for (const x of next) if (!x.locked && x.enabled !== topicDefault(x.topic)) prefs[x.topic] = x.enabled;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/saves/${saveId}/inbox-prefs`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error();
      setTopics(((await res.json()) as { topics: TopicState[] }).topics);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-arcade rounded-md p-4 h-full overflow-y-auto flex flex-col gap-3">
      <SectionTitle>{t("inbox.prefs.title")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">{t("inbox.prefs.subtitle")}</p>
      {error && <p className="text-sm text-destructive m-0">{t("warnings.errors.loadFailed")}</p>}
      {!topics ? (
        !error && <p className="text-sm text-muted-foreground m-0">{t("inbox.loadingMessages")}</p>
      ) : (
        <ul className="m-0 p-0 list-none grid gap-3 md:grid-cols-2">
          {topics.map((x) => (
            <li key={x.topic} className="flex items-start gap-3">
              <Chip
                selected={x.enabled}
                disabled={x.locked || busy}
                onClick={() => void toggle(x.topic)}
                aria-label={t(`inbox.prefs.topics.${x.topic}.label`)}
                className="shrink-0 w-20"
              >
                {x.enabled ? t("inbox.prefs.on") : t("inbox.prefs.off")}
              </Chip>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{t(`inbox.prefs.topics.${x.topic}.label`)}</div>
                <div className="text-sm text-muted-foreground">
                  {t(`inbox.prefs.topics.${x.topic}.description`)}
                  {x.locked && <span className="block text-primary">{t("inbox.prefs.locked")}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
