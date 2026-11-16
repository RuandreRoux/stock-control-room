import { Check, Circle } from "lucide-react";
import { passwordRules } from "@/lib/password-rules";

/** The password rules, each ticked off as it is met. */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="grid gap-x-3 gap-y-1 rounded-lg bg-ink-50 p-3 text-[12px] sm:grid-cols-2" aria-label="Password rules">
      {passwordRules(password).map((rule) => (
        <li key={rule.label} className={`flex items-start gap-1.5 ${rule.ok ? "text-ink-800" : "text-ink-600"}`}>
          {rule.ok ? (
            <Check size={14} strokeWidth={2.25} className="mt-0.5 flex-none text-brand" aria-label="Met" />
          ) : (
            <Circle size={14} strokeWidth={1.75} className="mt-0.5 flex-none text-ink-400" aria-label="Not yet met" />
          )}
          <span>{rule.label}</span>
        </li>
      ))}
    </ul>
  );
}
