import { Example, Section, ThemePanels } from "./section";

const COLORS: { token: string; label: string; use: string }[] = [
  { token: "background", label: "Background", use: "Page" },
  { token: "card", label: "Card", use: "Surfaces, player" },
  { token: "popover", label: "Popover", use: "Menus, dialogs" },
  { token: "muted", label: "Muted", use: "Quiet fills" },
  { token: "border", label: "Border", use: "Lines" },
  { token: "input", label: "Input", use: "Field outlines (3:1)" },
  { token: "foreground", label: "Foreground", use: "Text" },
  {
    token: "muted-foreground",
    label: "Muted text",
    use: "Secondary text (AA)",
  },
  { token: "primary", label: "Primary", use: "Accent fill" },
  { token: "primary-text", label: "Primary text", use: "Accent as text (AA)" },
  { token: "primary-soft", label: "Primary soft", use: "Accent tint" },
  { token: "wave", label: "Wave", use: "Unplayed bars (3:1)" },
  { token: "wave-progress", label: "Wave progress", use: "Played bars" },
  { token: "gold", label: "Gold", use: "Golden ear" },
  { token: "destructive", label: "Destructive", use: "Errors" },
  { token: "success", label: "Success", use: "Confirmations" },
];

const TYPE: { className: string; label: string; sample: string }[] = [
  {
    className: "font-display text-5xl font-bold tracking-tight",
    label: "Display 48, Geist bold",
    sample: "Needs ears",
  },
  {
    className: "font-display text-3xl font-bold tracking-tight",
    label: "Display 30",
    sample: "Night Bus (demo 4)",
  },
  {
    className: "text-xl font-semibold",
    label: "Title 20, Geist semibold",
    sample: "Tell people about it",
  },
  {
    className: "text-base",
    label: "Body 16",
    sample: "The vocal chop drowns here.",
  },
  { className: "text-sm", label: "UI 14", sample: "Mark as Helpful" },
  {
    className: "text-xs text-muted-foreground",
    label: "Small 12",
    sample: "2 days ago",
  },
  {
    className: "text-sm tabular-nums",
    label: "Numbers: tabular",
    sample: "1:42 / 3:42",
  },
];

const SPACE = [1, 2, 3, 4, 6, 8, 12, 16];
const RADII: { className: string; label: string }[] = [
  { className: "rounded-xs", label: "xs 3px: markers, focus" },
  { className: "rounded-sm", label: "sm: menu items" },
  { className: "rounded-md", label: "md: buttons, fields" },
  { className: "rounded-xl", label: "xl: cards, player" },
  { className: "rounded-2xl", label: "2xl: dialogs" },
  { className: "rounded-full", label: "full: chips, avatars" },
];

export function TokensSection() {
  return (
    <Section
      id="tokens"
      title="Tokens"
      description="All CSS variables in src/app/globals.css, exposed to Tailwind v4. Warm grey neutrals, one accent. Dark is the default."
    >
      <Example title="Colour">
        <ThemePanels>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {COLORS.map((c) => (
              <li key={c.token} className="min-w-0">
                <span
                  className="block h-10 rounded-md border"
                  style={{ background: `var(--${c.token})` }}
                />
                <span className="mt-1 block truncate text-xs font-medium">
                  {c.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {c.use}
                </span>
              </li>
            ))}
          </ul>
        </ThemePanels>
      </Example>

      <Example
        title="Type"
        note="Geist for everything, headings in bold with tight tracking. The logo is its own SVG mark."
      >
        <ul className="grid gap-4">
          {TYPE.map((t) => (
            <li
              key={t.label}
              className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-baseline"
            >
              <span className="text-xs text-muted-foreground">{t.label}</span>
              <span className={`${t.className} min-w-0 break-words`}>
                {t.sample}
              </span>
            </li>
          ))}
        </ul>
      </Example>

      <div className="grid gap-8 md:grid-cols-2">
        <Example title="Spacing" note="Tailwind's 4 px scale.">
          <ul className="grid gap-1.5">
            {SPACE.map((s) => (
              <li
                key={s}
                className="flex items-center gap-3 text-xs text-muted-foreground"
              >
                <span className="w-14 tabular-nums">{s * 4} px</span>
                <span
                  className="h-2 rounded-xs bg-primary"
                  style={{ width: s * 4 }}
                />
              </li>
            ))}
          </ul>
        </Example>
        <Example
          title="Radius"
          note="Bigger things get rounder corners. Chips are pills so they never look like buttons."
        >
          <ul className="grid grid-cols-3 gap-3">
            {RADII.map((r) => (
              <li key={r.label} className="text-[11px] text-muted-foreground">
                <span
                  className={`block h-12 border-2 border-foreground/40 ${r.className}`}
                />
                <span className="mt-1 block">{r.label}</span>
              </li>
            ))}
          </ul>
        </Example>
        <Example
          title="Elevation"
          note="Dark surfaces step up in lightness. Shadows only on things that float."
        >
          <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="rounded-xl border bg-card p-3">Card</div>
            <div className="rounded-xl bg-popover p-3 shadow-pop">Popover</div>
            <div className="rounded-xl bg-popover p-3 shadow-dialog">
              Dialog
            </div>
          </div>
        </Example>
        <Example
          title="Motion"
          note="120 ms for hover and press, 200 ms for things appearing, 320 ms for larger moves. Off with prefers-reduced-motion."
        >
          <div className="flex items-end gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="size-5 rounded-full bg-secondary motion-safe:animate-marker-in"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
            <span className="text-xs text-muted-foreground">
              Comment markers appearing
            </span>
          </div>
        </Example>
      </div>
    </Section>
  );
}
