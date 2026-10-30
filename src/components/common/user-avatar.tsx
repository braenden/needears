import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/types/view";

export function displayNameOf(
  profile: Pick<Profile, "display_name" | "handle">,
) {
  return profile.display_name || profile.handle;
}

function initials(profile: Pick<Profile, "display_name" | "handle">) {
  const words = displayNameOf(profile).replace(/_/g, " ").trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Avatar with initials when there is no image. Decorative: the name is next to it. */
export function UserAvatar({
  profile,
  size = "default",
  className,
}: {
  profile: Pick<Profile, "display_name" | "handle" | "avatar_url">;
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className} aria-hidden="true">
      {profile.avatar_url ? (
        <AvatarImage src={profile.avatar_url} alt="" />
      ) : null}
      <AvatarFallback>{initials(profile)}</AvatarFallback>
    </Avatar>
  );
}
