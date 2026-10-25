// Flat picture on an open foot: the picture stands in a groove of its shape and a puck light
// lies flat in a seat behind it, shining up the picture's back.
import { bool, num, round } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, prism, roundedRect, toMeshData, type Kernel } from '../../geometry/kernel';
import { applyFrontText, cableCuts, frontText, lampCuts, puckLamp, slotMatrix } from '../common/base';
import { PILLAR, POWER_FIT, POWER_LEDGE, POWER_WALL, powerLayout, type PowerLayout, powerTextZ, powerUnderside, pushPowerInfo, rectTray } from '../common/power';
import { COLORS, type SeatLayout, seatLayout } from './layout';
import { standGroove } from './stand';

/** `outline`: a shaped picture's outline (panel space), for a groove of its shape. */
export function buildSeatBase(k: Kernel, p: ParamValues, panelInfo: Message, outline?: [number, number][]): BuildResult {
  const S: SeatLayout = seatLayout(p);
  const warnings = [...S.warnings];
  const W = S.panelW, H = S.panelH, T = S.thick;
  let foot = prism(roundedRect(k, S.outerX, S.outerY, num(p, 'cornerRadius')), 0, S.baseTop);
  foot = foot.subtract(
    k.Manifold.union([
      standGroove(k, S, outline),
      ...lampCuts(k, p, S.lampY, S.baseTop),
      ...cableCuts(k, p, S.cable, S.lampY, S.baseTop, S.outerY / 2),
    ]),
  );
  // a battery tray under the foot, as under the light box; the base text then goes on its front
  let P: PowerLayout | null = null;
  if (bool(p, 'powerBase')) {
    const grow = 2 * (POWER_WALL + POWER_FIT);
    const corner = (sx: number, sy: number): [number, number] => [sx * (S.outerX / 2 - PILLAR / 2 - 1), sy * (S.outerY / 2 - PILLAR / 2 - 1)];
    P = powerLayout(p, {
      size: [S.outerX + grow, S.outerY + grow],
      innerW: S.outerX - 2 * POWER_LEDGE,
      innerL: S.outerY - 2 * POWER_LEDGE,
      pillars: [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)],
      post: PILLAR,
      baseTop: S.baseTop,
    }, warnings);
    foot = foot.subtract(k.Manifold.union(powerUnderside(k, p, P)));
  }
  const r = num(p, 'cornerRadius');
  let tray = P ? rectTray(k, p, S.outerX, S.outerY, P) : null;
  const text = P
    ? frontText(k, p, -P.outerY / 2, powerTextZ(P), P.outerX - 2 * (r + POWER_WALL + POWER_FIT) - 8, P.inner - 4)
    : frontText(k, p, -S.outerY / 2, S.baseTop / 2, S.outerX - 2 * r - 8, S.baseTop - 2);
  if (tray) tray = applyFrontText(tray, text, warnings);
  else foot = applyFrontText(foot, text, warnings);

  const parts: PartOutput[] = [
    { id: 'base', mesh: toMeshData(foot), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] },
  ];
  if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
  if (text?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: toMeshData(text.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });

  const zc = (S.panelBottom + S.panelTop) / 2;
  const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, S.planeY, zc], [1, 0, 0], [0, 0, 1], [0, -1, 0]) };
  const stand = box(k, [-W / 2, S.planeY - T / 2, S.panelBottom], [W / 2, S.planeY + T / 2, S.panelTop]);
  parts.push({ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, -70, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
  // the puck lies flat in its seat, behind the picture, shining up its back
  parts.push(puckLamp(k, p, S.lampY, S.baseTop));

  const info: Message[] = [
    { key: 'info.outer', vars: { x: round(P?.outerX ?? S.outerX), y: round(P?.outerY ?? S.outerY), z: round(S.totalHeight + (P ? P.height - P.seat : 0)) } },
    panelInfo,
  ];
  pushPowerInfo(info, P, p);
  return { parts, slots: [slot], warnings, info };
}
