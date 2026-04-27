export function cleanupOrphanedDialogState() {
  if (typeof document === "undefined") {
    return;
  }

  // Only clear the global modal lock if Ark/Chakra no longer has any dialogs mounted.
  if (document.querySelectorAll('[data-scope="dialog"]').length > 0) {
    return;
  }

  const body = document.body;
  body.removeAttribute("data-scroll-lock");
  body.removeAttribute("data-inert");
  body.style.removeProperty("pointer-events");
  body.style.removeProperty("overflow");
  body.style.removeProperty("padding-right");

  const root = document.getElementById("root");
  root?.removeAttribute("aria-hidden");
  root?.removeAttribute("data-aria-hidden");
}
