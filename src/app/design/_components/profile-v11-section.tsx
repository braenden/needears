"use client";

import { useState } from "react";
import { toast } from "sonner";

import { AvatarUpload } from "@/components/profile/avatar-upload";
import { BadgeList } from "@/components/profile/badges";
import { ProfileExtrasForm } from "@/components/profile/profile-extras-form";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileStatsBlock } from "@/components/profile/profile-stats";
import {
  jonas,
  mia,
  newcomer,
  profileExtras,
  statsFor,
} from "@/mocks/profiles";
import type { Profile } from "@/types/view";

import { Example, Section } from "./section";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ProfilePage({
  profile,
  isOwn = false,
}: {
  profile: Profile;
  isOwn?: boolean;
}) {
  const extras = profileExtras[profile.id]!;
  return (
    <div className="grid gap-5">
      <ProfileHeader
        profile={profile}
        stats={statsFor[profile.id]!}
        isOwn={isOwn}
        headingLevel={3}
        workingOn={extras.workingOn}
        daw={extras.daw}
        links={extras.links}
        showStats={false}
      />
      <ProfileStatsBlock stats={extras.stats} />
      <BadgeList badges={extras.badges} showLocked={isOwn} />
    </div>
  );
}

function EditProfileDemo() {
  const [profile, setProfile] = useState<Profile>(jonas);
  const [uploaded, setUploaded] = useState(false);
  const extras = profileExtras[jonas.id]!;
  return (
    <div className="grid gap-6 rounded-xl border p-4 sm:p-6">
      <AvatarUpload
        profile={profile}
        hasUploadedPhoto={uploaded}
        onSave={async (photo) => {
          await wait(500);
          setProfile((p) => ({ ...p, avatar_url: URL.createObjectURL(photo) }));
          setUploaded(true);
          toast.success(`Photo saved (${Math.round(photo.size / 1024)} KB).`);
          return { ok: true };
        }}
        onRemove={() => {
          setProfile((p) => ({ ...p, avatar_url: null }));
          setUploaded(false);
        }}
      />
      <ProfileExtrasForm
        initial={{
          workingOn: extras.workingOn,
          daw: extras.daw,
          links: extras.links,
        }}
        onSave={async () => {
          await wait(500);
          toast.success("Profile saved.");
          return { ok: true };
        }}
      />
    </div>
  );
}

export function ProfileV11Section() {
  return (
    <Section
      id="profile-v11"
      title="Profile photo, links and badges"
      description="Upload a photo and crop it to a square, add what you are working on, your DAW and up to five links. The profile shows four numbers about how someone gives feedback, and badges that explain how they are earned."
    >
      <Example
        title="Edit profile"
        note="Pick any image to try the crop: drag, zoom with the slider or the wheel, arrow keys and plus or minus with the square focused. Saves a 512 px image under 512 KB."
      >
        <EditProfileDemo />
      </Example>
      <Example title="Someone else (Mia, Golden ear)">
        <ProfilePage profile={mia} />
      </Example>
      <Example title="Own profile (Jonas), with badges still to earn">
        <ProfilePage profile={jonas} isOwn />
      </Example>
      <Example title="Just got here, own profile">
        <ProfilePage profile={newcomer} isOwn />
      </Example>
    </Section>
  );
}
