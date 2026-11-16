"use client";

import { AlertCircle, Copy, Pencil, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessForm } from "@/components/AccessForm";
import { api } from "@/lib/client";
import { DEFAULT_CATEGORIES, DEFAULT_WAREHOUSES } from "@/lib/options";
import { LINE_FIELD_KEYS, type Line, type LineFields, type Role } from "@/lib/types";

const BLANK: LineFields = {
  category: "",
  stockMovement: "",
  fromWarehouse: "",
  toWarehouse: "",
  physicalDocument: "",
  responsiblePerson: "",
  physicalReportingTime: "10:00",
  physicalAccountablePerson: "",
  systemDocument: "",
  systemResponsiblePerson: "",
  systemReportingTime: "15:00",
  systemAccountablePerson: "",
  source: "",
};

const SECTIONS: { title: string; hint?: string; fields: { key: keyof LineFields; label: string; type?: "time" }[] }[] = [
  {
    title: "Stock movement",
    fields: [
      { key: "category", label: "Category" },
      { key: "stockMovement", label: "Stock movement" },
      { key: "fromWarehouse", label: "From warehouse" },
      { key: "toWarehouse", label: "To warehouse" },
    ],
  },
  {
    title: "Physical stock",
    hint: "Leave the responsible person as N/A when there is no physical document to count.",
    fields: [
      { key: "physicalDocument", label: "Document" },
      { key: "responsiblePerson", label: "Responsible person" },
      { key: "physicalReportingTime", label: "Reporting time", type: "time" },
      { key: "physicalAccountablePerson", label: "Accountable person" },
    ],
  },
  {
    title: "System stock",
    fields: [
      { key: "systemDocument", label: "Document" },
      { key: "systemResponsiblePerson", label: "Responsible person" },
      { key: "systemReportingTime", label: "Reporting time", type: "time" },
      { key: "systemAccountablePerson", label: "Accountable person" },
    ],
  },
  { title: "Reference", fields: [{ key: "source", label: "Source" }] },
];

type Editing = { id: string | null; fields: LineFields; active: boolean };

function pick(line: Line): LineFields {
  return Object.fromEntries(LINE_FIELD_KEYS.map((k) => [k, line[k]])) as unknown as LineFields;
}

function LineDialog({
  editing,
  suggestions,
  onClose,
  onSaved,
}: {
  editing: Editing;
  suggestions: Record<string, string[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [fields, setFields] = useState(editing.fields);
  const [active, setActive] = useState(editing.active);
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
      if (editing.id) {
        await api(`/api/lines/${editing.id}`, { method: "PATCH", body: JSON.stringify({ ...fields, active }) });
      } else {
        await api("/api/lines", { method: "POST", body: JSON.stringify(fields) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the line");
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(720px,calc(100vw-32px))] rounded-xl bg-white p-0 shadow-modal backdrop:bg-ink-900/40"
    >
      <form onSubmit={save}>
        <header className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="font-display text-lg font-bold text-ink-900">{editing.id ? "Edit Line" : "Add Line"}</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-4">
          {SECTIONS.map((section) => (
            <fieldset key={section.title}>
              <legend className="font-display text-[14px] font-bold text-brand">{section.title}</legend>
              {section.hint && <p className="text-[12px] text-ink-600">{section.hint}</p>}
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {section.fields.map(({ key, label, type }) => (
                  <label key={key} className="block">
                    <span className="caps mb-1 block">{label}</span>
                    <input
                      type={type ?? "text"}
                      className="input"
                      maxLength={200}
                      required={key === "category" || key === "stockMovement" || type === "time"}
                      list={type ? undefined : `options-${key}`}
                      value={fields[key]}
                      onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                    {!type && (
                      <datalist id={`options-${key}`}>
                        {(suggestions[key] ?? []).map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {editing.id && (
            <label className="flex items-start gap-3 rounded-lg bg-ink-50 p-3">
              <input type="checkbox" className="check mt-0.5" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>
                <span className="block font-semibold text-ink-900">Active</span>
                <span className="text-[12px] text-ink-600">
                  Inactive lines no longer appear on the daily check sheet. Their history is kept.
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
            {busy ? "Saving..." : "Save line"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export default function AdminPage() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [codeRequired, setCodeRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    try {
      const [res, session] = await Promise.all([
        api<{ role: Role; lines: Line[] }>("/api/lines"),
        api<{ adminCodeRequired: boolean }>("/api/session"),
      ]);
      setLines(res.lines);
      setRole(res.role);
      setCodeRequired(session.adminCodeRequired);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the lines");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const suggestions = useMemo(() => {
    const sets: Record<string, Set<string>> = {};
    for (const key of LINE_FIELD_KEYS) sets[key] = new Set();
    DEFAULT_CATEGORIES.forEach((c) => sets.category.add(c));
    DEFAULT_WAREHOUSES.forEach((w) => {
      sets.fromWarehouse.add(w);
      sets.toWarehouse.add(w);
    });
    for (const line of lines ?? []) {
      for (const key of LINE_FIELD_KEYS) if (line[key]) sets[key].add(line[key]);
    }
    // People can be picked from either side of the sheet.
    const people = new Set<string>();
    for (const key of ["responsiblePerson", "physicalAccountablePerson", "systemResponsiblePerson", "systemAccountablePerson"]) {
      sets[key].forEach((p) => people.add(p));
    }
    for (const key of ["responsiblePerson", "physicalAccountablePerson", "systemResponsiblePerson", "systemAccountablePerson"]) {
      sets[key] = people;
    }
    return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b))]));
  }, [lines]);

  const categories = useMemo(() => [...new Set((lines ?? []).map((l) => l.category))], [lines]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (lines ?? []).filter((l) => {
      if (!showInactive && !l.active) return false;
      if (category && l.category !== category) return false;
      if (!term) return true;
      return LINE_FIELD_KEYS.some((k) => l[k].toLowerCase().includes(term));
    });
  }, [lines, search, category, showInactive]);

  const inactiveCount = (lines ?? []).filter((l) => !l.active).length;

  if (role !== null && role !== "admin") {
    return (
      <div className="mx-auto mt-12 max-w-sm">
        <div className="card p-6">
          <h1 className="font-display text-xl font-bold text-ink-900">Admin</h1>
          <p className="mb-4 mt-1 text-[13px] text-ink-600">Enter the admin code to add or edit checklist lines.</p>
          <AccessForm label="Admin code" onDone={load} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink-900">Checklist Lines</h1>
          <p className="mt-1 max-w-xl text-[13px] text-ink-600">
            Add a line or edit any column. Changes apply from today&rsquo;s sheet onwards; previous days keep the details
            they were checked against.
          </p>
        </div>
        <div className="flex gap-2">
          {codeRequired && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await api("/api/session", { method: "DELETE" });
                window.location.href = "/";
              }}
            >
              Sign out
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!lines}
            onClick={() => setEditing({ id: null, fields: { ...BLANK, category }, active: true })}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Add line
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px]">
          <AlertCircle size={16} strokeWidth={1.75} className="flex-none text-danger" aria-hidden />
          {error}
        </div>
      )}

      <section aria-label="Filters" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search lines</span>
          <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-2.5 text-ink-400" aria-hidden />
          <input type="search" className="input pl-9" placeholder="Search any column" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="w-full sm:w-52">
          <span className="sr-only">Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {inactiveCount > 0 && (
          <label className="flex h-9 items-center gap-2 text-[13px] text-ink-800">
            <input type="checkbox" className="check" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive ({inactiveCount})
          </label>
        )}
        <span className="ml-auto text-[12px] text-ink-600">{lines ? `${visible.length} lines` : ""}</span>
      </section>

      <section className="card mt-2 overflow-hidden">
        {!lines ? (
          <p className="px-4 py-10 text-center text-ink-600">{error ? "The lines could not be loaded." : "Loading lines..."}</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-ink-600">No lines match this selection.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead className="bg-ink-50">
                <tr>
                  {["Category", "Stock movement", "Physical stock", "System stock", "Source", ""].map((h, i) => (
                    <th key={i} className="caps px-4 py-2 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => (
                  <tr key={line.id} className={`border-t border-ink-100 align-top ${line.active ? "" : "bg-ink-50 text-ink-600"}`}>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {line.category}
                      {!line.active && (
                        <span className="mt-1 block w-fit rounded-full border border-ink-200 px-2 text-[11px] font-semibold">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-ink-900">{line.stockMovement}</p>
                      <p className="text-[12px] text-ink-600">
                        {line.fromWarehouse || "N/A"} to {line.toWarehouse || "N/A"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>{line.physicalDocument || "N/A"}</p>
                      <p className="text-[12px] text-ink-600">
                        {line.responsiblePerson || "N/A"} by {line.physicalReportingTime} - accountable{" "}
                        {line.physicalAccountablePerson || "N/A"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>{line.systemDocument || "N/A"}</p>
                      <p className="text-[12px] text-ink-600">
                        {line.systemResponsiblePerson || "N/A"} by {line.systemReportingTime} - accountable{" "}
                        {line.systemAccountablePerson || "N/A"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-ink-600">{line.source}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon border-transparent"
                        aria-label={`Edit ${line.stockMovement}`}
                        title="Edit"
                        onClick={() => setEditing({ id: line.id, fields: pick(line), active: line.active })}
                      >
                        <Pencil size={16} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon border-transparent"
                        aria-label={`Duplicate ${line.stockMovement}`}
                        title="Duplicate as a new line"
                        onClick={() => setEditing({ id: null, fields: pick(line), active: true })}
                      >
                        <Copy size={16} strokeWidth={1.75} aria-hidden />
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
        <LineDialog
          key={editing.id ?? "new"}
          editing={editing}
          suggestions={suggestions}
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
