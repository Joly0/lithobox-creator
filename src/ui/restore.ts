// Browsers (Firefox above all) restore ticked boxes and slider positions on reload, but the
// page builds its state from scratch. Replaying the handlers of every control that came back
// different from its default makes what is shown match what is ticked.

/** The parts of an <input> this needs (an interface so it can be tested without a DOM). */
export interface RestorableInput {
  type: string;
  checked: boolean;
  defaultChecked: boolean;
  value: string;
  defaultValue: string;
  dispatchEvent(e: Event): boolean;
}

/** Fire `change` (boxes) or `input` and `change` (sliders) on every restored control. Returns how many. */
export function replayRestored(inputs: Iterable<RestorableInput>, makeEvent: (type: string) => Event = (t) => new Event(t)): number {
  let n = 0;
  for (const el of inputs) {
    if ((el.type === 'checkbox' || el.type === 'radio') && el.checked !== el.defaultChecked) {
      el.dispatchEvent(makeEvent('change'));
      n++;
    } else if (el.type === 'range' && el.value !== el.defaultValue) {
      el.dispatchEvent(makeEvent('input'));
      el.dispatchEvent(makeEvent('change'));
      n++;
    }
  }
  return n;
}
