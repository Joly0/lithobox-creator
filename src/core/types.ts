// Shared types between the UI thread, the geometry worker and the shape modules.
// All lengths are millimetres, Z is up, the model stands on z = 0.

export type Vec3 = [number, number, number];
export type ParamValue = number | boolean | string;
export type ParamValues = Record<string, ParamValue>;

/** A translatable message: an i18n key plus values to interpolate. */
export interface Message {
  key: string;
  vars?: Record<string, string | number>;
}

interface ParamBase {
  key: string;
  /** Hidden behind the "advanced" toggle in the UI. */
  advanced?: boolean;
  /** Shown only when this returns true for the current values. */
  visibleIf?: (p: ParamValues) => boolean;
}

export interface NumberParam extends ParamBase {
  type: 'number';
  default: number;
  min: number;
  max: number;
  step: number;
  unit?: 'mm' | 'deg' | '%';
}

export interface BoolParam extends ParamBase {
  type: 'bool';
  default: boolean;
}

export interface SelectParam extends ParamBase {
  type: 'select';
  default: string;
  options: string[];
}

export interface TextParam extends ParamBase {
  type: 'text';
  default: string;
  maxLength: number;
  /** Allow several lines (textarea). */
  multiline?: boolean;
}

/** A colour as '#rrggbb' (a colour picker). */
export interface ColorParam extends ParamBase {
  type: 'color';
  default: string;
}

export type ParamDef = NumberParam | BoolParam | SelectParam | TextParam | ColorParam;

export interface ParamGroup {
  id: string;
  params: ParamDef[];
  /** Which step of the sidebar shows it: designing the shape (default) or adding pictures. */
  step?: 'design' | 'pictures';
}

/** Indexed triangle mesh, ready to transfer between threads. */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
  /**
   * Curved lithophanes: each vertex's place in the flat picture (x, y) and its thickness above
   * the back (z), for the lamp view. Flat panels need none: their positions are that already.
   */
  local?: Float32Array;
}

export interface PartOutput {
  id: string;
  mesh: MeshData;
  color: string;
  /** Offset applied in the exploded view, scaled by the explode slider. */
  explode: Vec3;
  /** Rotation (degrees, XYZ) that puts the part in its print orientation. */
  printRotation: Vec3;
  /** Preview-only geometry (e.g. lithophane stand-ins, lamp); never exported. */
  preview?: boolean;
  /** Translucent rendering in the viewer. */
  ghost?: boolean;
  /**
   * Parts with the same `object` are exported as one slicer object with several
   * volumes (e.g. raised text that gets its own filament). Defaults to the part id.
   */
  object?: string;
  /** Filament slot for this volume in multi-material slicers (1-based). */
  extruder?: number;
  /** Per-object slicer settings (Bambu Studio / OrcaSlicer keys), e.g. { sparse_infill_density: '100%' }. */
  slicer?: Record<string, string>;
  /**
   * Column-major 4x4 that places the mesh in the assembled preview (lithophanes are built
   * flat in panel space and moved into their slot). Export ignores it and uses printRotation.
   */
  matrix?: number[];
  /** Only needed for printing (support fins): exported, not shown in the assembled preview. */
  printOnly?: boolean;
  /** For the preview lamp: where its light comes from (default: centre, 4 mm below its top). */
  light?: Vec3;
  /** Smooth relief surface: no outlines, plain vertex normals (lithophanes). */
  relief?: boolean;
  /** For relief parts: the first cols × rows vertices form the relief grid (row-major). */
  reliefGrid?: [number, number];
  /** For relief parts that wrap round a cylinder (axis along mesh y): the back's radius. */
  wrapRadius?: number;
  /** For relief parts cut to an outline: where the picture is (the outline less the margin). */
  mask?: Outline;
  /** For relief parts on a ball (centre at the mesh origin): normals point out from it. */
  wrapSphere?: boolean;
  /** For relief parts on a ball: how the photo is laid on it (see litho/mesh.ts sphereUV). */
  sphereProjection?: { projection: 'band' | 'conformal' | 'front'; lat: [number, number]; half: number; blend: number; around: number };
}

/**
 * A place where a flat picture panel goes. Shapes report these so that later
 * features (a lithophane generator) can produce matching panels.
 * `matrix` is column-major 4x4 mapping panel space (x right, y up, z out of
 * the picture, origin at the panel centre) to model space.
 */
export interface PanelSlot {
  id: string;
  width: number;
  height: number;
  thickness: number;
  matrix: number[];
  /**
   * The picture runs all the way round a cylinder instead of lying flat: panel x is the
   * distance round it (`width` is the full circumference), the axis is panel y through the
   * origin, the picture's middle faces +z, and the back (inside) has this radius.
   * `open`: an arc over part of the way round (`width` is its length at half the thickness),
   * with side margins and side walls.
   */
  wrap?: { radius: number; open?: boolean; slope?: number; sphere?: SphereSlot };
  /** Print this picture upside down (its top edge on the bed), e.g. a shade with a rim at the top. */
  upsideDown?: boolean;
  /** Where the lithophane moves in the exploded view, when not the usual way out of its slot. */
  explode?: Vec3;
  /** A flat picture that is not rectangular: its outline inside width × height (see Outline). */
  outline?: Outline;
  /**
   * Not a relief of its own: this slot's picture goes into the relief of the slot with this id
   * (a ball's second photo on its back half).
   */
  pictureOf?: string;
}

/**
 * A ball (see PanelSlot.wrap): panel y runs along the meridian, the ball's centre at the panel's
 * origin. `sMid` is the panel's middle measured from the equator, `band` the picture's bottom and
 * top, `edge` where the flat bottom cut meets the wall (the rows' start), `cutY` the cut plane's
 * height relative to the centre, and an optional hole through the wall (panel x, y, radius).
 */
export interface SphereSlot {
  sMid: number;
  band: [number, number];
  edge: number;
  cutY: number;
  hole?: { x: number; y: number; r: number };
  /** How the photo is laid on the ball, the half width of a 'front' picture (radians), and the picture's size in mm. */
  projection?: 'band' | 'conformal' | 'front';
  half?: number;
  /** 'front': from seen-from-the-front (0) towards shape-true (1). */
  blend?: number;
  /** 'band' and 'conformal': how far round the picture reaches (radians). */
  around?: number;
  picture: [number, number];
  /** 'front': the back half shows a second picture (slot 'back'), the ball turned half round. */
  back?: boolean;
}

/**
 * A round or regular-polygon outline in panel space: a circle of `radius`, or with `sides` a
 * polygon of that apothem whose first side faces -y; its centre `cy` above the panel's centre.
 */
export interface Outline {
  radius: number;
  sides?: number;
  cy: number;
  /** Any other outline (a star, a heart): its corners in panel space, anticlockwise; `radius` then unused. */
  points?: [number, number][];
  /** For a mask with `points`: how far inside the outline the picture stays (its margin). */
  inset?: number;
}

export interface BuildResult {
  parts: PartOutput[];
  slots: PanelSlot[];
  warnings: Message[];
  /** Facts worth showing next to the model (sizes, magnet count, ...). */
  info: Message[];
}
