// Flat panel: one lithophane, on its own, on an open stand, or at the front of a light box.
// The open stand is a foot with the picture in a groove at the front and an upright holder
// behind it whose cup holds a puck light facing the picture; the holder plugs into the foot.
// The light box is a base (lamp seat, steel disc, cable, text, like the box's) and a hood
// (side walls, back wall and top in one piece) that sits on a ledge round the base. The
// picture stands in a groove in the base and slides into grooves in the hood's front posts
// and top, so the hood holds it; the lamp light bounces round inside the hood onto it.
//
// Model space: millimetres, Z up, centred on x = 0, standing on z = 0, picture facing -Y.
import { bool, num, round, type ShapeDefinition, str } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, prism, roundedRect, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { ensureFont } from '../../geometry/text';
import { applyFrontText, cableCuts, frontText, lampCuts, puckLamp, slotMatrix } from '../common/base';
import { POWER_FIT, POWER_WALL, powerTextZ, powerUnderside, pushPowerInfo, rectTray } from '../common/power';
import { applyLidJoint, jointGeometry, type JointGeometry } from '../common/lid';
import { lightBox, lightFrame, lightStand, panelGroups } from './params';
import { hangingLoop } from '../common/outlines';
import { COLORS, FIT, LIP, type PanelLayout, panelLayout, standLayout } from './layout';
import { buildStand } from './stand';
import { buildFrame } from './frame';

/** The picture plus its clearance: the groove it slides into. */
function envelope(k: Kernel, L: PanelLayout): Manifold {
  const g = L.gap;
  return box(k, [-L.panelW / 2 - g, L.planeY - L.thick / 2 - g, L.panelBottom - g], [L.panelW / 2 + g, L.planeY + L.thick / 2 + g, L.panelTop + g]);
}

function footprint(k: Kernel, p: ParamValues, L: PanelLayout) {
  return roundedRect(k, L.outerX, L.outerY, num(p, 'cornerRadius'));
}

function buildBase(k: Kernel, p: ParamValues, L: PanelLayout, joint: JointGeometry): Manifold {
  const foot = footprint(k, p, L);
  const base = prism(foot, 0, L.baseTop);
  // ledge round the sides and back where the hood walls stand
  const keep = box(k, [-L.outerX / 2 + L.wall + FIT, -L.outerY / 2 - 1, L.hoodBottom - 1], [L.outerX / 2 - L.wall - FIT, L.outerY / 2 - L.wall - FIT, L.baseTop + 2]);
  const ledge = prism(foot, L.hoodBottom, L.baseTop + 1).subtract(keep);
  const cuts = [ledge, envelope(k, L), ...lampCuts(k, p, L.lampY, L.baseTop), ...cableCuts(k, p, L.cable, L.lampY, L.baseTop, L.outerY / 2), ...joint.bodyCuts];
  if (L.power) cuts.push(...powerUnderside(k, p, L.power));
  const body = joint.bodyAdds.length ? base.add(k.Manifold.union(joint.bodyAdds)) : base;
  return body.subtract(k.Manifold.union(cuts));
}

function buildHood(k: Kernel, p: ParamValues, L: PanelLayout, joint: JointGeometry): Manifold {
  const foot = footprint(k, p, L);
  const hx = L.outerX / 2, hy = L.outerY / 2;
  // side walls, back wall and top plate; open at the front and the bottom
  const shell = prism(foot, L.hoodBottom, L.top).subtract(box(k, [-hx + L.wall, -hy - 1, L.hoodBottom - 1], [hx - L.wall, hy - L.wall, L.topInner]));
  // front posts with the picture's side grooves, from the front face to behind the picture
  const postIn = L.panelW / 2 - L.engage;
  const postBack = L.planeY + L.thick / 2 + L.gap + LIP;
  const tall = prism(foot, L.baseTop, L.topInner + 0.01);
  const posts = [1, -1].map((s) => tall.intersect(box(k, [s > 0 ? postIn : -hx - 1, -hy - 1, L.baseTop - 1], [s > 0 ? hx + 1 : -postIn, postBack, L.topInner + 1])));
  // corner blocks for the closure: behind each front post and in the back corners
  const b = L.block;
  const blocks = [1, -1].flatMap((s) =>
    [[postBack - 0.01, postBack + b], [hy - b, hy + 1]].map(([y0, y1]) => tall.intersect(box(k, [s > 0 ? hx - b : -hx - 1, y0, L.baseTop - 1], [s > 0 ? hx + 1 : -hx + b, y1, L.topInner + 1]))),
  );
  let hood = k.Manifold.union([shell, ...posts, ...blocks]).subtract(envelope(k, L));
  hood = applyLidJoint(k, hood, joint);
  return hood;
}

export const panelShape: ShapeDefinition = {
  id: 'panel',
  groups: panelGroups,
  presets: [
    { id: 'square', values: { panelWidth: 150, panelHeight: 150 } },
    { id: 'landscape', values: { panelWidth: 180, panelHeight: 120 } },
    { id: 'portrait', values: { panelWidth: 120, panelHeight: 180 } },
  ],
  validate: (p) => (lightBox(p) ? panelLayout(p).warnings : lightStand(p) ? standLayout(p).warnings : []),
  async prepare(p) {
    if ((lightBox(p) || lightStand(p)) && str(p, 'baseText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    const W = num(p, 'panelWidth'), H = num(p, 'panelHeight'), T = num(p, 'panelThickness');
    const panelInfo: Message = { key: 'info.panel', vars: { w: W, h: H, t: T } };

    if (lightStand(p)) return buildStand(k, p, panelInfo);
    if (lightFrame(p)) return buildFrame(k, p, panelInfo);
    if (!lightBox(p)) {
      // the lithophane on its own, standing on the ground
      const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, 0, H / 2], [1, 0, 0], [0, 0, 1], [0, -1, 0]) };
      const stand = box(k, [-W / 2, -T / 2, 0], [W / 2, T / 2, H]);
      const parts: PartOutput[] = [{ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, 0, 0], printRotation: [0, 0, 0], preview: true, ghost: true }];
      if (bool(p, 'loop')) {
        // printed with the picture as one object (standing, like the picture), in its panel space
        const ring = hangingLoop(k, { high: H / 2, low: H / 2 }, T, num(p, 'loopHole'));
        parts.push({ id: 'loop', object: 'litho-front', mesh: toMeshData(ring), matrix: slot.matrix, color: COLORS.panel, explode: [0, 0, 0], printRotation: [90, 0, 0] });
      }
      return { parts, slots: [slot], warnings: [], info: [panelInfo] };
    }

    const L = panelLayout(p);
    const warnings = [...L.warnings];
    const joint = jointGeometry(k, p, L.joint, L.sockets, L.latches);
    let base = buildBase(k, p, L, joint);
    const parts: PartOutput[] = [];

    // with a battery tray the base text goes on the tray's front, as on the box
    const P = L.power;
    const r = num(p, 'cornerRadius');
    let tray = P ? rectTray(k, p, L.outerX, L.outerY, P) : null;
    const text = P
      ? frontText(k, p, -P.outerY / 2, powerTextZ(P), P.outerX - 2 * (r + POWER_WALL + POWER_FIT) - 8, P.inner - 4)
      : frontText(k, p, -L.outerY / 2, L.baseTop / 2, L.outerX - 2 * r - 8, L.baseTop - 2);
    if (tray) tray = applyFrontText(tray, text, warnings);
    else base = applyFrontText(base, text, warnings);

    parts.push(
      { id: 'base', mesh: toMeshData(base), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] },
      // printed upside down: the top plate on the bed, the walls standing up
      { id: 'hood', mesh: toMeshData(buildHood(k, p, L, joint)), color: COLORS.hood, explode: [0, 0, 120], printRotation: [180, 0, 0] },
    );
    if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
    if (text?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: toMeshData(text.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });

    const zc = (L.panelBottom + L.panelTop) / 2;
    const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, L.planeY, zc], [1, 0, 0], [0, 0, 1], [0, -1, 0]) };
    const stand = box(k, [-W / 2, L.planeY - T / 2, L.panelBottom], [W / 2, L.planeY + T / 2, L.panelTop]);
    parts.push({ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, -70, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
    parts.push(puckLamp(k, p, L.lampY, L.baseTop));

    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(P?.outerX ?? L.outerX), y: round(P?.outerY ?? L.outerY), z: round(L.totalHeight + (P ? P.height - P.seat : 0)) } },
      panelInfo,
    ];
    pushPowerInfo(info, P, p);
    if (L.joint.magnetsFit) info.push({ key: 'info.magnets', vars: { n: 8, d: num(p, 'magnetDiameter'), h: num(p, 'magnetHeight') } });
    return { parts, slots: [slot], warnings, info };
  },
};

export { panelLayout, standLayout, type PanelLayout, type StandLayout } from './layout';
