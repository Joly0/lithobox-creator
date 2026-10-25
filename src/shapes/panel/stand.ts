// Flat panel on an open stand: a foot with the picture's groove and an upright holder whose
// cup holds a puck light facing the picture.
import { bool, num, round } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, cylinder, prism, roundedRect, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { applyFrontText, frontText, slotMatrix } from '../common/base';
import { PILLAR, powerFit, POWER_LEDGE, POWER_WALL, powerLayout, type PowerLayout, powerTextZ, powerUnderside, pushPowerInfo, rectTray } from '../common/power';
import { COLORS, NOTCH, SOCKET_FLOOR, type StandLayout, standLayout } from './layout';

/** Cylinder along +Y from y0 to y1, centred on (x, z). */
export function cylY(k: Kernel, x: number, y0: number, y1: number, z: number, r: number): Manifold {
  return cylinder(k, 0, 0, 0, y1 - y0, r).rotate([-90, 0, 0]).translate([x, y0, z]);
}

/** What the holder (and its tenon) reads from the stand's layout; the arc's stand builds its own. */
export type HolderDims = Pick<StandLayout, 'holderW' | 'holderFront' | 'holderBack' | 'lampZ' | 'baseTop'>;

/** The holder's tenon, which sits in the socket in the foot. */
export function tenon(k: Kernel, p: ParamValues, S: HolderDims, grow: number): Manifold {
  const w = S.holderW / 2 - num(p, 'wallThickness') + grow;
  return box(k, [-w, S.holderFront + 0.8 - grow, SOCKET_FLOOR - grow], [w, S.holderBack - 0.8 + grow, S.baseTop + (grow > 0 ? 1 : 0.01)]);
}

function buildStandFoot(k: Kernel, p: ParamValues, S: StandLayout, outline?: [number, number][]): Manifold {
  const foot = prism(roundedRect(k, S.outerX, S.outerY, num(p, 'cornerRadius')), 0, S.baseTop);
  return foot.subtract(k.Manifold.union([standGroove(k, S, outline), tenon(k, p, S, num(p, 'holderClearance'))]));
}

/**
 * The picture's groove: as wide as the picture, or for a shaped picture (`outline`, in panel
 * space) its own outline with the clearance round it, as deep as the foot, so it holds a heart
 * by its narrow bottom instead of leaving it room to slide.
 */
export function standGroove(
  k: Kernel,
  S: Pick<StandLayout, 'gap' | 'wgap' | 'panelW' | 'planeY' | 'thick' | 'panelBottom' | 'panelTop' | 'baseTop'>,
  outline?: [number, number][],
): Manifold {
  const g = S.gap, wg = S.wgap;
  const slot = box(k, [-S.panelW / 2 - wg, S.planeY - S.thick / 2 - g, S.panelBottom - g], [S.panelW / 2 + wg, S.planeY + S.thick / 2 + g, S.baseTop + 1]);
  if (!outline) return slot;
  // panel x stays x, panel y goes up, its thickness along y: as the slot matrix places the picture
  const zc = (S.panelBottom + S.panelTop) / 2;
  const shaped = new k.CrossSection([outline])
    .offset(wg, 'Round')
    .extrude(S.thick + 2 * g)
    .translate([0, 0, -S.thick / 2 - g])
    .rotate([90, 0, 0])
    .translate([0, S.planeY, zc]);
  return shaped.intersect(slot);
}

export function buildHolder(k: Kernel, p: ParamValues, S: HolderDims): Manifold {
  const lampR = num(p, 'lampDiameter') / 2;
  const seat = num(p, 'holderDepth');
  const hw = S.holderW / 2;
  // upright post with a round top round the cup
  const post = box(k, [-hw, S.holderFront, S.baseTop], [hw, S.holderBack, S.lampZ]).add(cylY(k, 0, S.holderFront, S.holderBack, S.lampZ, hw));
  const cuts = [
    cylY(k, 0, S.holderFront - 1, S.holderFront + seat, S.lampZ, lampR),
    // the cable leaves the cup downwards
    box(k, [-NOTCH / 2, S.holderFront - 1, S.baseTop], [NOTCH / 2, S.holderFront + seat, S.lampZ]),
  ];
  if (bool(p, 'steelDisc')) cuts.push(cylY(k, 0, S.holderFront + seat - 0.01, S.holderFront + seat + num(p, 'discDepth'), S.lampZ, num(p, 'discDiameter') / 2 + num(p, 'discClearance')));
  return post.add(tenon(k, p, S, 0)).subtract(k.Manifold.union(cuts));
}

/** `outline`: a shaped picture's outline (panel space), for a groove of its shape. */
export function buildStand(k: Kernel, p: ParamValues, panelInfo: Message, outline?: [number, number][]): BuildResult {
  const S = standLayout(p);
  const warnings = [...S.warnings];
  const W = S.panelW, H = S.panelH, T = S.thick;
  let foot = buildStandFoot(k, p, S, outline);
  // a battery tray under the foot, as under the light box; the base text then goes on its front
  let P: PowerLayout | null = null;
  if (bool(p, 'powerBase')) {
    const grow = 2 * (POWER_WALL + powerFit(p));
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
    ? frontText(k, p, -P.outerY / 2, powerTextZ(P), P.outerX - 2 * (r + POWER_WALL + powerFit(p)) - 8, P.inner - 4)
    : frontText(k, p, -S.outerY / 2, S.baseTop / 2, S.outerX - 2 * r - 8, S.baseTop - 2);
  if (tray) tray = applyFrontText(tray, text, warnings);
  else foot = applyFrontText(foot, text, warnings);

  const parts: PartOutput[] = [
    { id: 'base', mesh: toMeshData(foot), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] },
    // printed on its back, the cup facing up
    { id: 'holder', mesh: toMeshData(buildHolder(k, p, S)), color: COLORS.holder, explode: [0, 30, 40], printRotation: [-90, 0, 0] },
  ];
  if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
  if (text?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: toMeshData(text.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });

  const zc = (S.panelBottom + S.panelTop) / 2;
  const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, S.planeY, zc], [1, 0, 0], [0, 0, 1], [0, -1, 0]) };
  const stand = box(k, [-W / 2, S.planeY - T / 2, S.panelBottom], [W / 2, S.planeY + T / 2, S.panelTop]);
  parts.push({ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, -70, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
  // a puck light in the cup, its face a little in front of the holder
  const seat = num(p, 'holderDepth');
  const lampR = num(p, 'lampDiameter') / 2 - 2;
  const lampFront = S.holderFront + seat - Math.min(16, seat + num(p, 'lampDistance') - 2);
  const lamp = cylY(k, 0, lampFront, S.holderFront + seat, S.lampZ, lampR);
  // the puck stands upright, so its light comes from its face, not its top
  parts.push({ id: 'lamp', mesh: toMeshData(lamp), color: COLORS.lamp, explode: [0, 30, 40], printRotation: [0, 0, 0], preview: true, ghost: true, light: [0, lampFront, S.lampZ] });

  const info: Message[] = [{ key: 'info.outer', vars: { x: round(P?.outerX ?? S.outerX), y: round(P?.outerY ?? S.outerY), z: round(S.totalHeight + (P ? P.height - P.seat : 0)) } }, panelInfo];
  pushPowerInfo(info, P, p);
  return { parts, slots: [slot], warnings, info };
}
