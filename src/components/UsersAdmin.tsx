"use client";

import { AlertCircle, Check, KeyRound, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useSessionUser } from "@/lib/client";
import { formatDay, formatTime, sastDate } from "@/lib/time";
import type { Role, UserAccount } from "@/lib/types";

type Editing = { mode: "new" } | { mode: "edit" | "reset"; account: UserAccount };

/**
 * A random temporary password that is easy to read out and meets the password rules:
 * an upper-case letter, lower-case letters, a number and a special character (the dashes).
 */
function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz"; // no look-alikes (o/0, l/1/i)
  const digits = "23456789";
  const values = crypto.getRandomValues(new Uint32Array(12));
  const pick = (set: string, i: number) => set[values[i] % set.length];
  const group = (from: number) => [0, 1, 2, 3].map((i) => pick(letters, from + i)).join("");
  return `${pick(letters, 0).toUpperCase()}${group(0).slice(1)}-${group(4)}-${pick(digits, 8)}${pick(digits, 9)}${pick(letters, 10)}${pick(digits, 11)}`;
}

function UserDialog({
  editing,
  people,
  isSelf,
  onClose,
  onSaved,
}: {
  editing: Editing;
  people: string[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const account = editing.mode === "new" ? null : editing.account;
  const [username, setUsername] = useState("");
  const [name, setName] = useState(account?.name ?? "");
  const [role, setRole] = useState<Role>(account?.role ?? "user");
  const [person, setPerson] = useState(account?.person ?? "");
  const [active, setActive] = useState(account?.active ?? true);
  const [password, setPassword] = useState(editing.mode === "edit" ? "" : temporaryPassword());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing.mode === "new") {
        await api("/api/users", {
          method: "POST",
          body: JSON.stringify({ username: username.trim().toLowerCase(), name, role, person, password }),
        });
      } else if (editing.mode === "reset") {
        await api(`/api/users/${editing.account.id}`, { method: "PATCH", body: JSON.stringify({ password }) });
      } else {
        const body = isSelf ? { name, person } : { name, person, role, active };
        await api(`/api/users/${editing.account.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  };

  const title = editing.mode === "new" ? "Add User" : editing.mode === "reset" ? "Reset Password" : "Edit User";
  const options = person && !people.includes(person) ? [...people, person] : people;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-xl bg-white p-0 shadow-modal backdrop:bg-ink-900/40"
    >
      <form onSubmit={save}>
        <header className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          {editing.mode === "reset" && (
            <p className="text-[13px] text-ink-800">
              Resetting signs <strong>{editing.account.name}</strong> out everywhere. Give them the temporary password
              below; they will be asked to choose their own when they sign in.
            </p>
          )}
          {editing.mode === "new" && (
            <label className="block">
              <span className="caps mb-1 block">Username</span>
              <input
                type="text"
                className="input"
                required
                autoFocus
                autoCapitalize="none"
                spellCheck={false}
                maxLength={40}
                placeholder="for example hans"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <span className="mt-1 block text-[12px] text-ink-600">
                What they type to sign in. Lower-case letters and numbers; it cannot be changed later.
              </span>
            </label>
          )}
          {editing.mode !== "reset" && (
            <>
              <label className="block">
                <span className="caps mb-1 block">Name</span>
                <input type="text" className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                <span className="mt-1 block text-[12px] text-ink-600">Recorded against every check this person ticks.</span>
              </label>
              <label className="block">
                <span className="caps mb-1 block">Their lines on the check sheet</span>
                <select className="input" value={person} onChange={(e) => setPerson(e.target.value)}>
                  <option value="">No particular lines</option>
                  {options.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[12px] text-ink-600">
                  The first time they sign in, the sheet opens on these lines. They can still see everything.
                </span>
              </label>
              <fieldset disabled={isSelf}>
                <legend className="caps mb-1">Access</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { value: "user", label: "User", hint: "Daily checks and the dashboard" },
                      { value: "admin", label: "Admin", hint: "Also lines, users and correcting previous days" },
                    ] as const
                  ).map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${
                        role === option.value ? "border-brand bg-brand-50" : "border-ink-200"
                      } ${isSelf ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <input
                        type="radio"
                        name="role"
                        className="check mt-0.5"
                        checked={role === option.value}
                        onChange={() => setRole(option.value)}
                      />
                      <span>
                        <span className="block font-semibold text-ink-900">{option.label}</span>
                        <span className="text-[12px] text-ink-600">{option.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {isSelf && <p className="mt-1 text-[12px] text-ink-600">You cannot change your own access.</p>}
              </fieldset>
            </>
          )}
          {editing.mode !== "edit" && (
            <label className="block">
              <span className="caps mb-1 block">Temporary password</span>
              <span className="flex gap-2">
                <input
                  type="text"
                  className="input font-mono"
                  required
                  minLength={10}
                  maxLength={200}
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="btn btn-ghost" onClick={() => setPassword(temporaryPassword())}>
                  New
                </button>
              </span>
              <span className="mt-1 block text-[12px] text-ink-600">
                Write this down now and give it to the person. It is not shown again, and they must replace it at
                first sign-in. If you type your own, it must follow the password rules.
              </span>
            </label>
          )}
          {editing.mode === "edit" && !isSelf && (
            <label className="flex items-start gap-3 rounded-lg bg-ink-50 p-3">
              <input type="checkbox" className="check mt-0.5" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>
                <span className="block font-semibold text-ink-900">Active</span>
                <span className="text-[12px] text-ink-600">
                  Untick when someone leaves. They are signed out at once and can no longer sign in.
                </span>
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="flex items-center gap-2 text-[13px] font-semibold text-danger">
              <AlertCircle size={16} strokeWidth={1.75} aria-hidden />
              {error}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-ink-100 px-6 py-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : editing.mode === "reset" ? "Reset password" : "Save user"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** Admin: who can sign in, what they can do, and password resets. */
export function UsersAdmin({ people }: { people: string[] }) {
  const me = useSessionUser();
  const [accounts, setAccounts] = useState<UserAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAccounts((await api<{ users: UserAccount[] }>("/api/users")).users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the users");
    }
    // Lets the top bar refresh its "waiting for approval" count.
    window.dispatchEvent(new Event("scr:users-changed"));
  }, []);

  const decide = async (account: UserAccount, approve: boolean) => {
    if (!approve && !window.confirm(`Reject the sign-up from ${account.name} (${account.username})? This removes it.`)) return;
    setBusyId(account.id);
    try {
      if (approve) await api(`/api/users/${account.id}`, { method: "PATCH", body: JSON.stringify({ approve: true }) });
      else await api(`/api/users/${account.id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the sign-up");
    }
    setBusyId(null);
    load();
  };

  const waiting = (accounts ?? []).filter((a) => a.pending);
  const approved = (accounts ?? []).filter((a) => !a.pending);
  useEffect(() => {
    load();
  }, [load]);

  const lastSeen = (iso: string | null) => {
    if (!iso) return "Never";
    const day = sastDate(iso);
    return `${day === sastDate() ? "Today" : formatDay(day)} ${formatTime(iso)}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-600">
          Everyone signs in with their own username and password. People can create their own account on the sign-in
          screen, which you approve here, or you can add someone yourself with a temporary password.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ mode: "new" })}>
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          Add user
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px]">
          <AlertCircle size={16} strokeWidth={1.75} className="flex-none text-danger" aria-hidden />
          {error}
        </div>
      )}

      {waiting.length > 0 && (
        <section className="mt-3 overflow-hidden rounded-lg border border-warn/60 bg-warn/10" aria-label="Waiting for approval">
          <header className="px-4 py-3">
            <h2 className="font-display text-base font-bold text-ink-900">
              Waiting for Approval ({waiting.length})
            </h2>
            <p className="text-[12px] text-ink-800">
              These people created their own account. Approve only people you recognise; they cannot sign in until
              you do.
            </p>
          </header>
          <ul className="border-t border-warn/40 bg-white">
            {waiting.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 px-4 py-3 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">{account.name}</p>
                  <p className="text-[12px] text-ink-600">
                    Username <strong className="text-ink-800">{account.username}</strong> - signed up{" "}
                    {lastSeen(account.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busyId === account.id}
                  onClick={() => decide(account, false)}
                >
                  <Trash2 size={15} strokeWidth={1.75} aria-hidden />
                  Reject
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === account.id}
                  onClick={() => decide(account, true)}
                >
                  <Check size={16} strokeWidth={2} aria-hidden />
                  Approve
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mt-3 overflow-hidden">
        {!accounts ? (
          <p className="px-4 py-10 text-center text-ink-600">{error ? "The users could not be loaded." : "Loading users..."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-ink-50">
                <tr>
                  {["Name", "Username", "Access", "Their lines", "Last sign-in", "Status", ""].map((h, i) => (
                    <th key={i} className="caps px-4 py-2 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {approved.map((account) => (
                  <tr key={account.id} className={`border-t border-ink-100 ${account.active ? "" : "bg-ink-50 text-ink-600"}`}>
                    <td className="px-4 py-2.5 font-semibold text-ink-900">
                      {account.name}
                      {account.id === me?.id && <span className="ml-2 text-[12px] font-normal text-ink-600">(you)</span>}
                    </td>
                    <td className="px-4 py-2.5">{account.username}</td>
                    <td className="px-4 py-2.5">{account.role === "admin" ? "Admin" : "User"}</td>
                    <td className="px-4 py-2.5">{account.person || <span className="text-ink-400">None</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{lastSeen(account.lastLoginAt)}</td>
                    <td className="px-4 py-2.5">
                      {!account.active ? "Inactive" : account.mustChangePassword ? "Temporary password" : "Active"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon border-transparent"
                        aria-label={`Edit ${account.name}`}
                        title="Edit"
                        onClick={() => setEditing({ mode: "edit", account })}
                      >
                        <Pencil size={16} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon border-transparent"
                        aria-label={`Reset password for ${account.name}`}
                        title="Reset password"
                        onClick={() => setEditing({ mode: "reset", account })}
                      >
                        <KeyRound size={16} strokeWidth={1.75} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <UserDialog
          key={editing.mode === "new" ? "new" : `${editing.mode}-${editing.account.id}`}
          editing={editing}
          people={people}
          isSelf={editing.mode !== "new" && editing.account.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
