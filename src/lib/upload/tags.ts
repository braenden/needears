import { TAG_PATTERN, TAGS_MAX } from "@/config/limits";

// "Deep House, lo-fi,, " -> ["deep house", "lo-fi"]; anything the database
// would refuse is dropped rather than failing the whole upload.
export function parseTags(value: string): string[] {
  const tags = value
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, " "))
    .filter((t) => TAG_PATTERN.test(t));
  return [...new Set(tags)].slice(0, TAGS_MAX);
}
