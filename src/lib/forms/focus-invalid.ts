/**
 * After a submit that failed validation: puts focus on the first field
 * marked aria-invalid in the form and scrolls it into the middle of the
 * screen, so the error next to it is in sight. Waits a frame for the
 * errors to render.
 */
export function focusFirstInvalid(form: HTMLElement | null) {
  requestAnimationFrame(() => {
    const field = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!field) return;
    field.focus({ preventScroll: true });
    field.scrollIntoView?.({ block: "center" });
  });
}
