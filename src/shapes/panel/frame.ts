// Flat panel in an LED strip frame: a lip over the picture's margin and walls round the back.
import { bool, num, round } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, prism, roundedRect, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { slotMatrix } from '../common/base';
import { COLORS, SIDE } from './layout';
import { cylY } from './stand';

/** LED strip frame: lip over the picture's margin at the front, walls round the back. */
const FRAME_LIP = 2;
const FRAME_LIP_OVER = 3;
const FRAME_BACK = 2.4;
const FRAME_INSERT = 2;
/** Foot: height, groove depth, how far it reaches in front of and behind the frame. */
const FOOT_H = 8;
const FOOT_GROOVE = 5;
const FOOT_REACH = 20;

/**
 * A slim frame lit by an LED strip: the picture goes in from the back against the front lip; a
 * back plate's insert presses it there and carries the strip in a groove round its inside, with
 * a notch for the cable at the bottom and keyholes to hang it. On an optional foot.
 */
export function buildFrame(k: Kernel, p: ParamValues, panelInfo: Message): BuildResult {
  const W = num(p, 'panelWidth'), H = num(p, 'panelHeight'), T = num(p, 'panelThickness');
  const g = num(p, 'slotClearance') / 2;
  // the picture's edges and the back insert in the frame's room
  const wg = num(p, 'slotWidthClearance') / 2;
  const FRAME_FIT = num(p, 'frameClearance');
  const rim = num(p, 'frameRim'), D = num(p, 'frameDepth'), strip = num(p, 'stripWidth');
  const foot = bool(p, 'frameFoot');
  const Wo = W + 2 * rim, Ho = H + 2 * rim;
  const z0 = foot ? FOOT_H - FOOT_GROOVE : 0;
  const zc = z0 + Ho / 2;
  // y: the frame's front at y0, its back (where the back plate starts) at y1
  const y0 = -D / 2, y1 = D / 2 - FRAME_BACK;
  const yPic = y0 + FRAME_LIP + g + T / 2;
  const cav = (grow: number, ya: number, yb: number) => box(k, [-W / 2 - wg - grow, ya, zc - H / 2 - wg - grow], [W / 2 + wg + grow, yb, zc + H / 2 + wg + grow]);
  const outer = box(k, [-Wo / 2, y0, z0], [Wo / 2, y1, z0 + Ho]);
  // the window in front, the room for the picture and the insert behind
  const window = box(k, [-W / 2 + FRAME_LIP_OVER, y0 - 1, zc - H / 2 + FRAME_LIP_OVER], [W / 2 - FRAME_LIP_OVER, y0 + FRAME_LIP + 0.01, zc + H / 2 - FRAME_LIP_OVER]);
  const frame = outer.subtract(window).subtract(cav(0, y0 + FRAME_LIP, y1 + 1));
  // the back plate and its insert, pressing the picture against the lip
  const insertFront = yPic + T / 2 + g;
  const plate = box(k, [-Wo / 2, y1, z0], [Wo / 2, y1 + FRAME_BACK, z0 + Ho]);
  const insert = cav(-FRAME_FIT, insertFront, y1 + 0.01).subtract(cav(-FRAME_FIT - FRAME_INSERT, insertFront - 1, y1 + 1));
  // the strip's groove round the insert's inside, half way between the picture and the plate
  const ym = (insertFront + y1) / 2;
  const groove = cav(-FRAME_FIT - FRAME_INSERT + 0.8, ym - strip / 2, ym + strip / 2).subtract(cav(-FRAME_FIT - FRAME_INSERT - 1, ym - strip, ym + strip));
  const cuts: Manifold[] = [groove];
  // the cable leaves at the bottom of the back
  cuts.push(box(k, [-6, ym - 3, zc - H / 2 - g - 1], [6, y1 + FRAME_BACK + 1, zc - H / 2 + 6]));
  if (bool(p, 'frameKeyholes'))
    for (const s of [-1, 1]) {
      // a round hole for the screw head, a slot above it the screw's neck slides up into
      const x = (s * Wo) / 4, z = z0 + Ho - rim - 15;
      cuts.push(cylY(k, x, y1 - 1, y1 + FRAME_BACK + 1, z, 4));
      cuts.push(box(k, [x - 2, y1 - 1, z], [x + 2, y1 + FRAME_BACK + 1, z + 8]).add(cylY(k, x, y1 - 1, y1 + FRAME_BACK + 1, z + 8, 2)));
    }
  const back = plate.add(insert).subtract(k.Manifold.union(cuts));
  const parts: PartOutput[] = [
    // the frame prints face down, the back plate flat on its back
    { id: 'frame', mesh: toMeshData(frame), color: COLORS.hood, explode: [0, 0, 0], printRotation: [90, 0, 0] },
    { id: 'back', mesh: toMeshData(back), color: COLORS.base, explode: [0, 90, 0], printRotation: [-90, 0, 0] },
  ];
  if (foot) {
    const fy0 = y0 - FOOT_REACH, fy1 = y1 + FRAME_BACK + FOOT_REACH;
    const block = prism(roundedRect(k, Wo + 2 * SIDE, fy1 - fy0, num(p, 'cornerRadius')), 0, FOOT_H).translate([0, (fy0 + fy1) / 2, 0]);
    const slotCut = box(k, [-Wo / 2 - g, y0 - g, z0], [Wo / 2 + g, y1 + FRAME_BACK + g, FOOT_H + 1]);
    parts.push({ id: 'foot', mesh: toMeshData(block.subtract(slotCut)), color: COLORS.base, explode: [0, 0, -30], printRotation: [0, 0, 0] });
  }
  const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, yPic, zc], [1, 0, 0], [0, 0, 1], [0, -1, 0]), explode: [0, 45, 0] };
  const stand = box(k, [-W / 2, yPic - T / 2, zc - H / 2], [W / 2, yPic + T / 2, zc + H / 2]);
  parts.push({ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, 45, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
  const info: Message[] = [{ key: 'info.outer', vars: { x: round(Wo), y: round(D), z: round(z0 + Ho) } }, panelInfo, { key: 'info.frameStrip', vars: { l: round(2 * (W + H)) } }];
  return { parts, slots: [slot], warnings: [], info };
}
