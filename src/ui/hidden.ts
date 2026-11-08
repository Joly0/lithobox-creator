import type { PartOutput } from '../core/types';

/** A lithophane in the view: a photo's relief, or the plain stand-in of a slot without one. */
export const isLithophane = (p: PartOutput) => !!p.relief || (!!p.preview && p.id.startsWith('panel-'));
/** The preview lamp (puck light or bulb). */
export const isLamp = (p: PartOutput) => !!p.preview && !isLithophane(p);

/** Ids of the parts the "show lithophanes" and "show lamp" toggles hide. */
export function hiddenParts(parts: PartOutput[], lithophanes: boolean, lamp: boolean): string[] {
  return parts.filter((p) => (!lithophanes && isLithophane(p)) || (!lamp && isLamp(p))).map((p) => p.id);
}
