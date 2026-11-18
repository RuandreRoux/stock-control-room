"use client";

import { AlertCircle, Copy, Pencil, Plus, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UsersAdmin } from "@/components/UsersAdmin";
import { api, useSessionUser } from "@/lib/client";
import { namesOf } from "@/lib/logic";
import { DEFAULT_CATEGORIES, DEFAULT_WAREHOUSES } from "@/lib/options";
import { LINE_FIELD_KEYS, type Line, type LineFields } from "@/lib/types";

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

const PERSON_KEYS: (keyof LineFields)[] = [
  "responsiblePerson",
  "physicalAccountablePerson",
  "systemResponsiblePerson",
  "systemAccountablePerson",
];

const SECTIONS: {
  title: string;
  hint?: string;
  fields: { key: keyof LineFields; label: string; type?: "time" | "person" }[];
}[] = [
  {
    title: "Stock movement",
    fields: [
      { key: "category", label: "Category" },
      { key: "stockMovement", label: "Stock movement" },
      { key: "fromWarehouse", label: "From WH" },
      { key: "toWarehouse", label: "To WH" },
    ],
  },
  {
    title: "Physical stock",
    hint: "Choose N/A as the responsible person when there is no physical document to count.",
    fields: [
      { key: "physicalDocument", label: "Document" },
      { key: "responsiblePerson", label: "Responsible person", type: "person" },
      { key: "physicalReportingTime", label: "Reporting time", type: "time" },
      { key: "physicalAccountablePerson", label: "Accountable person", type: "person" },
    ],
  },
  {
    title: "System stock",
    hint: "The responsible person here is the data capturer who confirms the documents were received, by the physical reporting time. The system document and reporting time are kept for reference.",
    fields: [
      { key: "systemDocument", label: "Document" },
      { key: "systemResponsiblePerson", label: "Responsible person", type: "person" },
      { key: "systemReportingTime", label: "Reporting time", type: "time" },
      { key: "systemAccountablePerson", label: "Accountable person", type: "person" },
    ],
  },
  { title: "Reference", fields: [{ key: "source", label: "Source" }] },
];

type Editing = { id: string | null; fields: LineFields; active: boolean };

function pick(line: Line): LineFields {
  return Object.fromEntries(LINE_FIELD_KEYS.map((k) => [k, line[k]])) as unknown as LineFields;
}

const NEW_PERSON = "__new__";

/**
 * People are picked from the existing names so that spelling stays consistent.
 * A genuinely new person is added through "Add new person".
 */
function PersonField({
  value,
  people,
  onChange,
}: {
  value: string;
  people: string[];
  onChange: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const options = value && !people.includes(value) ? [...people, value] : people;

  if (adding) {
    return (
      <span className="flex gap-2">
        <input
          type="text"
          className="input"
          maxLength={200}
          autoFocus
          placeholder="Name of the new person"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setAdding(false);
            if (!value.trim()) onChange("");
          }}
        >
          List
        </button>
      </span>
    );
  }
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW_PERSON) {
          setAdding(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">Select a person</option>
      {options.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      <option value={NEW_PERSON}>Add new person...</option>
    </select>
  );
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
  const [applyToAll, setApplyToAll] = useState(false);
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
        await api(`/api/lines/${editing.id}`, { method: "PATCH", body: JSON.stringify({ ...fields, active, applyToAll }) });
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
      className="m-auto w-[min(760px,calc(100vw-32px))] rounded-xl bg-white p-0 shadow-modal backdrop:bg-ink-900/40"
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
                    {type === "person" ? (
                      <PersonField
                        value={fields[key]}
                        people={suggestions.people}
                        onChange={(value) => setFields((prev) => ({ ...prev, [key]: value }))}
                      />
                    ) : (
                      <input
                        type={type ?? "text"}
                        className="input"
                        maxLength={200}
                        required={key === "category" || key === "stockMovement" || type === "time"}
                        list={type ? undefined : `options-${key}`}
                        value={fields[key]}
                        onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    )}
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
              <input
                type="checkbox"
                className="check mt-0.5"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
              />
              <span>
                <span className="block font-semibold text-ink-900">Also correct all earlier sheets</span>
                <span className="text-[12px] text-ink-600">
                  Changes always apply to the sheet being filled in and the sheet due today (and so to the reports).
                  Tick this to fix a mistake, such as a wrong name, on every earlier sheet too. Leave it unticked when
                  something has changed from now on, such as a new responsible person, so earlier days keep who was
                  responsible then.
                </span>
              </span>
            </label>
          )}
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
  const user = useSessionUser();
  const params = useSearchParams();
  const [view, setView] = useState<"lines" | "users">(params.get("view") === "users" ? "users" : "lines");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    try {
      setLines((await api<{ lines: Line[] }>("/api/lines")).lines);
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
    // One shared list of people for all four person fields.
    const people = new Set<string>(["N/A"]);
    for (const key of PERSON_KEYS) sets[key].forEach((p) => people.add(p));
    sets.people = people;
    return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b))]));
  }, [lines]);

  const categories = useMemo(() => [...new Set((lines ?? []).map((l) => l.category))], [lines]);

  // The individual names that appear in the Responsible and Accountable filters.
  const peopleNames = useMemo(() => {
    const names = new Set<string>();
    for (const line of lines ?? []) for (const key of PERSON_KEYS) namesOf(line[key]).forEach((n) => names.add(n));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [lines]);

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

  if (user && user.role !== "admin") {
    return (
      <div className="mx-auto mt-12 max-w-sm">
        <div className="card p-6">
          <h1 className="font-display text-xl font-bold text-ink-900">Admin</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            This page is for admins only. Ask an admin if you need a line changed or a password reset.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink-900">Admin</h1>
        <div className="inline-flex rounded-sm border border-ink-200 bg-white p-0.5" role="group" aria-label="Admin section">
          {(
            [
              { value: "lines", label: "Checklist lines" },
              { value: "users", label: "Users" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => setView(option.value)}
              className={`h-8 rounded-sm px-3 font-display text-[12px] font-semibold uppercase tracking-[0.05em] transition-colors duration-200 ${
                view === option.value ? "bg-brand text-white" : "text-ink-600 hover:bg-brand-50 hover:text-brand"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {view === "users" ? (
        <div className="mt-4">
          <UsersAdmin people={peopleNames} />
        </div>
      ) : (
        <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-600">
          Add a line or edit any column. Changes apply to the sheet being filled in and the sheet due today; earlier
          sheets keep the details they were checked against unless you choose to correct them too.
        </p>
        <div className="flex gap-2">
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
            <table className="w-full min-w-[1500px] text-[13px]">
              <thead className="bg-ink-50">
                <tr>
                  <th colSpan={4} />
                  <th colSpan={4} className="caps border-l border-ink-200 px-3 pt-2 text-left font-semibold text-brand">
                    Physical stock
                  </th>
                  <th colSpan={4} className="caps border-l border-ink-200 px-3 pt-2 text-left font-semibold text-brand">
                    System stock
                  </th>
                  <th colSpan={2} className="border-l border-ink-200" />
                </tr>
                <tr>
                  {[
                    "Category",
                    "Stock movement",
                    "From WH",
                    "To WH",
                    "Document",
                    "Responsible",
                    "Accountable",
                    "Time",
                    "Document",
                    "Responsible",
                    "Accountable",
                    "Time",
                    "Source",
                    "",
                  ].map((h, i) => (
                    <th
                      key={i}
                      className={`caps px-3 py-2 text-left font-semibold ${i === 4 || i === 8 || i === 12 ? "border-l border-ink-200" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => (
                  <tr key={line.id} className={`border-t border-ink-100 align-top ${line.active ? "" : "bg-ink-50 text-ink-600"}`}>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {line.category}
                      {!line.active && (
                        <span className="mt-1 block w-fit rounded-full border border-ink-200 px-2 text-[11px] font-semibold">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-ink-900">{line.stockMovement}</td>
                    <td className="px-3 py-2.5">{line.fromWarehouse || "N/A"}</td>
                    <td className="px-3 py-2.5">{line.toWarehouse || "N/A"}</td>
                    <td className="border-l border-ink-100 px-3 py-2.5">{line.physicalDocument || "N/A"}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink-900">{line.responsiblePerson || "N/A"}</td>
                    <td className="px-3 py-2.5">{line.physicalAccountablePerson || "N/A"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{line.physicalReportingTime}</td>
                    <td className="border-l border-ink-100 px-3 py-2.5">{line.systemDocument || "N/A"}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink-900">{line.systemResponsiblePerson || "N/A"}</td>
                    <td className="px-3 py-2.5">{line.systemAccountablePerson || "N/A"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{line.systemReportingTime}</td>
                    <td className="border-l border-ink-100 px-3 py-2.5 text-[12px] text-ink-600">{line.source}</td>
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
        </>
      )}
    </div>
  );
}
