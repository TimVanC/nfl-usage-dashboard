/* eslint-disable @next/next/no-img-element */
import { initials } from "@/lib/format";

/**
 * Player avatar with a source toggle. NEXT_PUBLIC_AVATAR_SOURCE=headshot uses
 * the nflverse headshot_url; "initials" renders initials in team colors so a
 * paid tier can drop headshots without touching callers.
 */
const SOURCE = process.env.NEXT_PUBLIC_AVATAR_SOURCE ?? "headshot";

export function Avatar({ name, src, color, size = 36 }: { name: string; src: string | null; color?: string | null; size?: number }) {
  const bg = color ? `#${color.replace("#", "")}` : "var(--surface-2)";
  const style = { width: size, height: size, minWidth: size };
  if (SOURCE === "headshot" && src) {
    return (
      <span className="inline-block overflow-hidden rounded-full border border-border" style={{ ...style, background: bg }}>
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover object-top" loading="lazy" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full font-semibold text-white" style={{ ...style, background: bg, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}
