/** Ctrl (Win/Linux) или Cmd (Mac) — рамка выделения */
export function isMarqueeModifier(e: { ctrlKey: boolean; metaKey: boolean }) {
  return e.ctrlKey || e.metaKey;
}

/** Shift — добавить/убрать объект из выделения */
export function isAdditiveSelectModifier(e: { shiftKey: boolean }) {
  return e.shiftKey;
}
