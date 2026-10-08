import type { InboxCategory, InboxMessage } from "@/types/inboxTypes";

/**
 * Reader-facing switchable groups of inbox messages (spec
 * `docs/superpowers/specs/2026-10-07-responsibilities-inbox-design.md`, section 2). The filter lives
 * in one place, `SaveService.appendInbox`, which drops a message whose topic is switched off.
 */
export const INBOX_TOPICS = [
  "actions", "contracts", "transfer_news", "injuries", "development", "youth", "retirement",
  "competitions", "club_records", "facilities", "scouting_alerts", "scouting_reports", "manager_news",
] as const;
export type InboxTopic = (typeof INBOX_TOPICS)[number];
export type InboxPrefs = Partial<Record<InboxTopic, boolean>>;

const DEFAULT_OFF = new Set<InboxTopic>(["manager_news", "scouting_reports"]);
/** Topics that ask the player to act: never dropped. */
const LOCKED = new Set<InboxTopic>(["actions"]);

/** Category → topic (exhaustive: a new category does not compile without a topic). */
const CATEGORY_TOPIC: Record<InboxCategory, InboxTopic> = {
  development: "development",
  youth: "youth",
  injury: "injuries",
  retirement: "retirement",
  season: "competitions",
  cup: "competitions",
  continental: "competitions",
  club_record: "club_records",
  facilities: "facilities",
  contract: "contracts",
  transfer: "transfer_news",
  transfer_in: "transfer_news",
  transfer_out: "transfer_news",
  scouting: "scouting_alerts",
  manager_news: "manager_news",
  // Board (objective, warnings, manager contract offer...), job offers and player talks ask for an answer.
  board: "actions",
  job: "actions",
  player: "actions",
};

/** `${category}:${kind}` that leave the category's topic. */
const KIND_TOPIC: Record<string, InboxTopic> = {
  "transfer:bid": "actions",
  "transfer:loan_bid": "actions",
  "transfer:rival_bid": "actions",
  "season:negative_balance": "actions",
  "retirement:reborn": "actions",
  "scouting:report": "scouting_reports",
  "scouting:mission_done": "scouting_reports",
  "scouting:recommendation": "scouting_reports",
};

export function inboxTopicOf(m: InboxMessage): InboxTopic {
  const kind = (m as { kind?: string }).kind;
  return (kind ? KIND_TOPIC[`${m.category}:${kind}`] : undefined) ?? CATEGORY_TOPIC[m.category] ?? "actions";
}

export function topicDefault(t: InboxTopic): boolean {
  return !DEFAULT_OFF.has(t);
}

export function topicLocked(t: InboxTopic): boolean {
  return LOCKED.has(t);
}

/** Whether a message is written to the inbox under the given preferences. */
export function inboxAllowed(m: InboxMessage, prefs: InboxPrefs | undefined): boolean {
  const t = inboxTopicOf(m);
  if (topicLocked(t)) return true;
  return prefs?.[t] ?? topicDefault(t);
}

/**
 * Validates a PUT body. Throws on a non-object, an unknown topic, a non-boolean value or an attempt
 * to switch a locked topic off; `true` on a locked topic is accepted and dropped.
 */
export function sanitizeInboxPrefs(raw: unknown): InboxPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid prefs");
  const out: InboxPrefs = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(INBOX_TOPICS as readonly string[]).includes(k)) throw new Error(`unknown topic ${k}`);
    if (typeof v !== "boolean") throw new Error(`invalid value for ${k}`);
    const topic = k as InboxTopic;
    if (topicLocked(topic)) {
      if (!v) throw new Error(`locked topic ${k}`);
      continue;
    }
    out[topic] = v;
  }
  return out;
}

/** The topic list as the screen shows it: effective state, locked flag. */
export function inboxTopicStates(prefs: InboxPrefs | undefined): { topic: InboxTopic; enabled: boolean; locked: boolean }[] {
  return INBOX_TOPICS.map((topic) => ({
    topic,
    enabled: topicLocked(topic) || (prefs?.[topic] ?? topicDefault(topic)),
    locked: topicLocked(topic),
  }));
}
