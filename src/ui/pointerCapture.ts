// setPointerCapture can throw (e.g. NotFoundError) if the browser no longer
// considers the pointer active — rare, but real (a pointer released between
// the event firing and this call). Capture is a nice-to-have (keeps drag
// tracking working if the pointer leaves the element); losing it isn't fatal,
// so failures are swallowed rather than breaking the gesture.
export function safeSetPointerCapture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // ignore
  }
}
