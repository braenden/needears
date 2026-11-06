import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/view";

import type { ProfileLink } from "./link-hosts";
import { ProfileLinks } from "./profile-links";

/**
 * Who it is: picture, name, @handle, the bio and the links. The numbers,
 * badges and the rest are under About. Edit profile sits on the right on
 * wide screens and under the bio on phones.
 */
export function ProfileHeader({
  profile,
  isOwn = false,
  onEdit,
  headingLevel = 1,
  links = [],
  className,
}: {
  profile: Pick<Profile, "handle" | "display_name" | "avatar_url" | "bio">;
  isOwn?: boolean;
  onEdit?: () => void;
  /** 1 on the profile page. Lower when shown inside another page. */
  headingLevel?: 1 | 2 | 3;
  links?: ProfileLink[];
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  const edit = (extra: string) =>
    isOwn ? (
      <Button variant="outline" size="sm" onClick={onEdit} className={extra}>
        Edit profile
      </Button>
    ) : null;

  return (
    <header className={cn("@container", className)}>
      <div className="flex items-center gap-4 @md:gap-6">
        <UserAvatar
          profile={profile}
          size="xl"
          className="@md:size-24 @md:text-2xl"
        />
        <div className="min-w-0 flex-1">
          <Heading className="font-display text-3xl leading-[1.05] font-bold tracking-tight break-words @md:text-4xl">
            {displayNameOf(profile)}
          </Heading>
          <p className="mt-1 text-[15px] break-all text-muted-foreground">
            @{profile.handle}
          </p>
        </div>
        {edit("hidden shrink-0 @md:inline-flex")}
      </div>
      {profile.bio ? (
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-pretty break-words">
          {profile.bio}
        </p>
      ) : null}
      {links.length > 0 ? (
        <ProfileLinks links={links} className="mt-2" />
      ) : null}
      {edit("mt-4 w-full @md:hidden")}
    </header>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <div role="status" aria-label="Loading profile">
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
    </div>
  );
}
