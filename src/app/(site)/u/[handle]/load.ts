import { cache } from "react";
import { getProfileByHandle } from "@/lib/data/profiles";

/** One lookup per request, shared by the layout, metadata and the page. */
export const loadProfile = cache(getProfileByHandle);
