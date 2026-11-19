// What the site says about groups, in one place.

/** "1 member", "23 members". */
export function members(count: number): string {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

/** "23 members · by Nora". */
export function membersBy(count: number, owner: string | null): string {
  return owner ? `${members(count)} · by ${owner}` : members(count);
}

export const GROUP_COPY = {
  emptyList:
    "A group is a place for a class, a band or a few friends, where only members hear the tracks. Make one, or search for one by its name.",
  yours: "Yours",
  askedToJoin: (count: number) => `${count} asked to join`,
  nameHint:
    "Anyone can find the group by its name. Only members see what's in it.",
  nameMissing: "Give the group a name.",
  tooMany: "You can have 3 groups. Delete one to make a new one.",
  onePerDay: "You can make one group a day. Try again tomorrow.",
  broke: "Something broke on our side. Try again in a minute.",
  noTracks: "No tracks yet.",
  noTracksOwner: (name: string) =>
    `People find the group when they search for ${name}, and ask to join. You let them in here.`,
  leaveTitle: (name: string) => `Leave ${name}?`,
  leaveBody: (ownTracks: number) =>
    ownTracks > 0
      ? `Your ${ownTracks === 1 ? "track stays" : `${ownTracks} tracks stay`} in the group. You can still delete ${ownTracks === 1 ? "it" : "them"} under Your tracks in Settings.`
      : "You won't hear the tracks here anymore. You can ask to join again later.",
  left: (name: string) => `You left ${name}.`,
  removeTitle: (name: string) => `Remove ${name}?`,
  removeBody:
    "Their tracks and comments stay in the group. They can't ask to join again.",
  // Seen from outside a group.
  membersOnlyTrack: "Only members can hear this.",
  notInIt: "It's in a group you're not in.",
  signInIfIn: "Sign in if you're in the group.",
  somethingWrong: "Something wrong here? Email",
  onlyMembersOf: "Only members of",
  canHearThis: "can hear this.",
  notInGroupAnymore: "You're not in this group anymore",
  // The card someone outside a group sees
  cardWhat: "Only members see what's in this group.",
  signInToAsk: "Sign in to ask to join",
  askToJoin: "Ask to join",
  asked: (owner: string) =>
    `You asked to join. You'll get a notification when ${owner} lets you in.`,
  cancelAsk: "Cancel request",
  askedToast: (name: string) => `Asked to join ${name}.`,
  full: "This group is full.",
  askAgainOn: (date: string) => `You can ask again on ${date}.`,
  removed: "You can't ask to join this group.",
  tooManyAsks:
    "You've asked to join a lot of groups today. Try again tomorrow.",
  // The owner's list of asks
  asksHeading: "Asked to join",
  letIn: "Let in",
  decline: "Decline",
  isIn: (name: string) => `${name} is in.`,
  fullCantLetIn: "The group is full. Remove someone to let more in.",
  // Deleting
  deleteTrackTitle: (title: string) => `Delete ${title}?`,
  deleteTrackBody: (artist: string) =>
    `It's deleted for everyone, also for ${artist}. This can't be undone.`,
  deleteCommentTitle: "Delete this comment?",
  deleteCommentBody: (author: string) =>
    `It's deleted for everyone, also for ${author}.`,
  deleteGroupTitle: (name: string) => `Delete ${name}?`,
  deleteGroupBody:
    "Every track in it is deleted for everyone, with all the comments. This can't be undone.",
  typeToDelete: (name: string) => `Type ${name} to delete it.`,
  groupDeleted: (name: string) => `${name} is deleted.`,
  // Admin
  adminInGroup: "The track is in a group.",
  adminRemovedByOwner: "It was in a group, and the group's owner deleted it.",
  adminOpenForReport: "Open for this report",
  adminOpenNote: "You'll see it for 24 hours. Opening it is logged.",
  adminOpened: (name: string | null) =>
    name
      ? `In ${name}, a group. Open for you until`
      : "In a group. Open for you until",
  adminLogged: ". This is logged.",
  // Deleting the account of someone who owns groups
  ownsGroups: (names: string[]) =>
    names.length === 1
      ? `You own ${names[0]}. The group is deleted too, with every track in it, for everyone.`
      : `You own ${names.slice(0, -1).join(", ")} and ${names.at(-1)}. The groups are deleted too, with every track in them, for everyone.`,
  // Upload
  uploadIn: (name: string) => `In ${name}`,
  hearsEveryone: "Everyone can hear this. It goes in the feed.",
  hearsGroup: (name: string) => `Only members of ${name} can hear this.`,
  // Under the feed upload's last step, for someone in a group.
  toPostIn: (name: string) => ({
    before: `To post in ${name}, upload from `,
    link: "the group's page",
    after: ".",
  }),
  toPostInAGroup: {
    before: "To post in a group, upload from ",
    link: "its page",
    after: ".",
  },
  publishEveryone: "Publish to everyone",
  publishGroup: "Publish to group",
  notInGroupUpload: (name: string) => `You're not in ${name} anymore.`,
} as const;
