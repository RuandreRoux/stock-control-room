import type { Db } from "mongodb";

/**
 * Microsoft Teams alerts. An admin creates a "webhook" workflow in Teams (it gives a
 * web address that posts into a channel or chat) and pastes that address on the Admin
 * page. The app then posts a card there whenever someone signs up.
 */

interface TeamsDoc {
  _id: "teams";
  webhookUrl: string;
  /** The app's own address, for the "Review" button on the card. */
  appUrl: string;
  updatedAt: Date;
  updatedBy: string;
  /** Scheduled reports at 10:00, 15:00 and 17:00 on working days. On unless turned off. */
  reports?: boolean;
}

const meta = (db: Db) => db.collection<TeamsDoc>("meta");

/** Teams workflow addresses are hosted by Microsoft Power Automate / Logic Apps. */
const WEBHOOK_HOSTS = [/\.logic\.azure\.com$/, /\.api\.powerplatform\.com$/, /\.webhook\.office\.com$/];

export function webhookProblem(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Paste the web address from the Teams workflow";
  if (value.length > 2000) return "That address is too long";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "That is not a web address";
  }
  if (url.protocol !== "https:" || !WEBHOOK_HOSTS.some((host) => host.test(url.hostname))) {
    return "That is not a Teams workflow address. It should start with https:// and contain logic.azure.com or powerplatform.com";
  }
  return null;
}

/** Shows enough of the address to recognise it, without displaying the secret part. */
function mask(url: string): string {
  try {
    return `${new URL(url).hostname}/...`;
  } catch {
    return "...";
  }
}

export interface TeamsStatus {
  on: boolean;
  target: string | null;
  updatedBy: string | null;
  reports: boolean;
}

export async function teamsStatus(db: Db): Promise<TeamsStatus> {
  const doc = await meta(db).findOne({ _id: "teams" });
  return doc
    ? { on: true, target: mask(doc.webhookUrl), updatedBy: doc.updatedBy, reports: doc.reports !== false }
    : { on: false, target: null, updatedBy: null, reports: false };
}

export async function setReports(db: Db, on: boolean): Promise<void> {
  await meta(db).updateOne({ _id: "teams" }, { $set: { reports: on } });
}

export async function saveTeams(db: Db, webhookUrl: string, appUrl: string, by: string): Promise<void> {
  await meta(db).updateOne(
    { _id: "teams" },
    { $set: { webhookUrl: webhookUrl.trim(), appUrl, updatedAt: new Date(), updatedBy: by } },
    { upsert: true },
  );
}

export async function removeTeams(db: Db): Promise<void> {
  await meta(db).deleteOne({ _id: "teams" });
}

/**
 * Names typed by the public on the sign-up form end up in a Teams card. Teams renders a
 * little markdown, so characters that could turn a name into a link or formatting are removed.
 */
/**
 * For text built by the app from checklist lines: removes only what Teams could turn into a
 * link or formatting, and keeps ordinary punctuation such as brackets, colons and %.
 */
export function cardText(text: string, max = 200): string {
  return text
    .replace(/\b(?:https?:\/\/|www\.)\S*/gi, " link removed ")
    .replace(/[[\]<>*_~`#|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function plain(text: string, max = 80): string {
  return text
    .replace(/\b(?:https?:\/\/|www\.)\S*/gi, " link removed ")
    .replace(/[[\]()<>*_~`#|\\!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export interface TeamsMessage {
  title: string;
  /** A line under the title, for example which documents the report covers. */
  subtitle?: string;
  lines: { label: string; value: string }[];
  /** Ready-made card elements (built with the helpers below) placed after the facts. */
  blocks?: object[];
  note?: string;
  buttonTitle: string;
  path: string;
}

export function teamsCard(message: TeamsMessage, appUrl: string) {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: "Stock Control Room", size: "Small", weight: "Bolder", color: "Good", spacing: "None" },
            { type: "TextBlock", text: message.title, size: "Large", weight: "Bolder", wrap: true, spacing: "Small" },
            ...(message.subtitle
              ? [{ type: "TextBlock", text: cardText(message.subtitle), isSubtle: true, wrap: true, spacing: "None" }]
              : []),
            ...(message.lines.length
              ? [{ type: "FactSet", facts: message.lines.map((l) => ({ title: l.label, value: plain(l.value) })) }]
              : []),
            ...(message.blocks ?? []),
            ...(message.note ? [{ type: "TextBlock", text: message.note, wrap: true, isSubtle: true, spacing: "Medium" }] : []),
          ],
          actions: [{ type: "Action.OpenUrl", title: message.buttonTitle, url: new URL(message.path, appUrl).href }],
        },
      },
    ],
  };
}

/** Posts to Teams. Never throws; gives up after 5 seconds. */
export async function postToTeams(db: Db, message: TeamsMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const doc = await meta(db).findOne({ _id: "teams" });
    if (!doc) return { ok: false, error: "Teams alerts are not set up" };
    const res = await fetch(doc.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamsCard(message, doc.appUrl)),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (res.ok) return { ok: true };
    console.warn("Teams did not accept the alert", res.status);
    if (res.status === 404) return { ok: false, error: "Teams could not find that workflow. It may have been deleted or turned off." };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Teams refused the alert. Check the workflow is turned on and copy its address again." };
    }
    return { ok: false, error: `Teams did not accept the alert (error ${res.status}).` };
  } catch (err) {
    console.warn("Could not reach Teams", err);
    return { ok: false, error: "Teams could not be reached. Please try again." };
  }
}

export function signUpMessage(name: string, username: string): TeamsMessage {
  return {
    title: "New sign-up waiting for approval",
    lines: [
      { label: "Name", value: name },
      { label: "Username", value: username },
    ],
    note: "Only approve people you recognise. They cannot sign in until an admin approves them.",
    buttonTitle: "Review sign-up",
    path: "/admin?view=users",
  };
}
