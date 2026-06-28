/** Глобальный флаг: зажат пробел для режима перемещения камеры */
let spaceHeld = false;

export function setFloorSpaceHeld(value: boolean) {
  spaceHeld = value;
}

export function isFloorSpaceHeld() {
  return spaceHeld;
}
