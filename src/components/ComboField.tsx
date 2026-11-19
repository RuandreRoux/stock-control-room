"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * A text box with a dropdown of existing values. Clicking it shows the full list (the
 * browser's own suggestion list only shows values matching what is already typed, which
 * looks broken on a filled-in field). Typing narrows the list, and a new value can still
 * be typed. The list is drawn in a fixed layer so a scrolling form never cuts it off.
 */
export function ComboField({
  value,
  options,
  onChange,
  required,
  label,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  label: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // Only filter once the person starts typing; until then show everything.
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);
  const [box, setBox] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);

  const term = typed ? value.trim().toLowerCase() : "";
  const shown = term ? options.filter((o) => o.toLowerCase().includes(term)) : options;

  const place = () => {
    const rect = input.current?.getBoundingClientRect();
    if (!rect) return;
    const up = window.innerHeight - rect.bottom < 260 && rect.top > window.innerHeight - rect.bottom;
    setBox({ left: rect.left, top: up ? rect.top : rect.bottom, width: rect.width, up });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    document.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      document.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  const show = () => {
    setTyped(false);
    setActive(-1);
    setOpen(true);
  };
  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
    setTyped(false);
  };

  return (
    <span className="relative block">
      <input
        ref={input}
        type="text"
        className="input pr-9"
        maxLength={200}
        required={required}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onFocus={show}
        onClick={() => !open && show()}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) show();
            setActive((a) => Math.min(shown.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && open && active >= 0 && shown[active]) {
            e.preventDefault();
            choose(shown[active]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation(); // close the list, not the whole window
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Show all ${label} options`}
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-sm text-ink-600 hover:bg-brand-50 hover:text-brand"
        onClick={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          e.preventDefault(); // keep the focus in the box
          if (open) setOpen(false);
          else {
            input.current?.focus();
            show();
          }
        }}
      >
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {open && box && shown.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="fixed z-[60] max-h-60 overflow-y-auto rounded-sm border border-ink-200 bg-white py-1 shadow-lift"
          style={{
            left: box.left,
            width: box.width,
            ...(box.up ? { bottom: window.innerHeight - box.top + 4 } : { top: box.top + 4 }),
          }}
        >
          {shown.map((option, i) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              className={`cursor-pointer px-3 py-1.5 text-[13px] ${
                i === active ? "bg-brand-50 text-brand" : option === value ? "font-semibold text-ink-900" : "text-ink-800"
              } hover:bg-brand-50`}
              onMouseDown={(e) => {
                e.preventDefault(); // pick before the box loses focus
                choose(option);
              }}
              onClick={(e) => e.preventDefault()} // inside a label, a click would reopen the list
              onMouseEnter={() => setActive(i)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
