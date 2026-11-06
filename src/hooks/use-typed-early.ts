import { useCallback } from "react";

import { takeEarlyInput } from "@/lib/forms/early-input";

/**
 * A ref for a text field (marked with data-early) that picks up what was
 * typed before the page had loaded. On a slow phone people start typing
 * while the script is still on its way: the text is either still in the
 * field, or was noted before the field was drawn again.
 */
export function useTypedEarly(
  setValue: (value: string) => void,
): (element: HTMLInputElement | HTMLTextAreaElement | null) => void {
  return useCallback(
    (element) => {
      if (!element) return;
      const noted = element.dataset.early
        ? takeEarlyInput(element.dataset.early)
        : undefined;
      const value = element.value || noted;
      if (value) setValue(value);
    },
    [setValue],
  );
}
