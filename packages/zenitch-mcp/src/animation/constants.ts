import { PropertyCategory, PipelineStage } from '../schemas/animation.schema.js';

export interface PropertyMetadata {
  category: PropertyCategory;
  stage: PipelineStage;
  caveat: string;
}

export const DEDUCTION_RULES = {
  LAYOUT_REFLOW: { points: 15, maxCategoryDeduction: 50 },
  GPU_EXPENSIVE_PAINT: { points: 10, maxCategoryDeduction: 30 },
  PAINT_TRIGGERING: { points: 5, maxCategoryDeduction: 15 },
  UNKNOWN_OR_CONTEXT: { points: 5, maxCategoryDeduction: 15 },
  TRANSITION_ALL: { points: 30 },
  MISSING_REDUCED_MOTION_CONTINUOUS: { points: 40, maxAllowedScore: 59 },
  MISSING_REDUCED_MOTION_GENERAL: { points: 15 },
  HIGH_SIMULTANEOUS_ELEMENTS_MODERATE: { threshold: 10, points: 10 },
  HIGH_SIMULTANEOUS_ELEMENTS_EXTREME: { threshold: 50, points: 25 },
  HIGH_TARGET_DPR: { threshold: 2.0, points: 10 }
} as const;

export const KNOWN_PROPERTY_MAP: Record<string, PropertyMetadata> = {
  // Composite-friendly (typical browser behavior: GPU-promoted layer transforms)
  'transform': {
    category: 'composite_friendly',
    stage: 'composite',
    caveat: 'Typically composited on GPU layer under normal stacking contexts without causing paint or layout.'
  },
  'opacity': {
    category: 'composite_friendly',
    stage: 'composite',
    caveat: 'Typically animated on GPU compositor thread when promoted to a render layer.'
  },
  'translate': {
    category: 'composite_friendly',
    stage: 'composite',
    caveat: 'Individual transform property; composited on modern GPU engines.'
  },
  'rotate': {
    category: 'composite_friendly',
    stage: 'composite',
    caveat: 'Individual transform property; composited on modern GPU engines.'
  },
  'scale': {
    category: 'composite_friendly',
    stage: 'composite',
    caveat: 'Individual transform property; composited on modern GPU engines.'
  },
  'filter': {
    category: 'composite_friendly',
    stage: 'composite',
    caveat: 'Often accelerated by GPU, though complex filters (like large blur or contrast chains) can impose heavy fragment shader raster costs.'
  },

  // GPU Expensive Paint
  'box-shadow': {
    category: 'gpu_expensive_paint',
    stage: 'raster',
    caveat: 'Requires multi-pass Gaussian blur on GPU rasterizer; high fill-rate overhead during animation.'
  },
  'text-shadow': {
    category: 'gpu_expensive_paint',
    stage: 'raster',
    caveat: 'Expensive per-glyph rasterization on CPU/GPU depending on font rendering pipeline.'
  },
  'backdrop-filter': {
    category: 'gpu_expensive_paint',
    stage: 'raster',
    caveat: 'Requires copying background pixel buffer and running GPU blur shader every frame; high memory bandwidth.'
  },
  'mix-blend-mode': {
    category: 'gpu_expensive_paint',
    stage: 'raster',
    caveat: 'Forces layer flattening or intermediate framebuffer blending passes during animation.'
  },
  'background-blend-mode': {
    category: 'gpu_expensive_paint',
    stage: 'raster',
    caveat: 'Requires multi-texture shader blending per rasterization tile.'
  },

  // Paint-triggering
  'background-color': {
    category: 'paint_triggering',
    stage: 'paint',
    caveat: 'Bypasses layout recalculation in typical engines but triggers layer repainting on every frame.'
  },
  'color': {
    category: 'paint_triggering',
    stage: 'paint',
    caveat: 'Triggers glyph text repainting on every frame.'
  },
  'border-color': {
    category: 'paint_triggering',
    stage: 'paint',
    caveat: 'Triggers border raster repainting on every frame.'
  },
  'outline-color': {
    category: 'paint_triggering',
    stage: 'paint',
    caveat: 'Repaints element outline decoration without reflow.'
  },
  'fill': {
    category: 'paint_triggering',
    stage: 'paint',
    caveat: 'Triggers SVG vector fill rasterization on each frame.'
  },
  'stroke': {
    category: 'paint_triggering',
    stage: 'paint',
    caveat: 'Triggers SVG vector stroke rasterization on each frame.'
  },
  'visibility': {
    category: 'paint_triggering',
    stage: 'paint',
    caveat: 'Toggles rendering visibility; triggers layer paint/clip update.'
  },

  // Layout-triggering (Reflow)
  'width': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Alters box model geometry; forces recalculation of layout tree and subsequent paint/composite passes.'
  },
  'height': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Forces full vertical layout recalculation for element and succeeding sibling nodes.'
  },
  'min-width': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Forces geometry recalculation of flex/grid or block formatting contexts.'
  },
  'max-width': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Forces geometry recalculation of container sizing.'
  },
  'min-height': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Forces geometry recalculation of container vertical dimensions.'
  },
  'max-height': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Forces geometry recalculation and potential overflow/scroll changes.'
  },
  'margin': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Triggers flow recalculation for parent and adjacent sibling boxes.'
  },
  'margin-top': { category: 'layout_reflow', stage: 'layout', caveat: 'Triggers vertical flow reflow.' },
  'margin-right': { category: 'layout_reflow', stage: 'layout', caveat: 'Triggers horizontal flow reflow.' },
  'margin-bottom': { category: 'layout_reflow', stage: 'layout', caveat: 'Triggers vertical flow reflow.' },
  'margin-left': { category: 'layout_reflow', stage: 'layout', caveat: 'Triggers horizontal flow reflow.' },
  'padding': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Alters inner box content boundaries; forces child reflow.'
  },
  'padding-top': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces child vertical reflow.' },
  'padding-right': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces child horizontal reflow.' },
  'padding-bottom': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces child vertical reflow.' },
  'padding-left': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces child horizontal reflow.' },
  'top': {
    category: 'layout_reflow',
    stage: 'layout',
    caveat: 'Forces layout recalculation for positioned elements in standard document flow.'
  },
  'right': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces horizontal layout recalculation.' },
  'bottom': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces vertical layout recalculation.' },
  'left': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces horizontal layout recalculation.' },
  'flex': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces flexbox space distribution recalculation.' },
  'flex-basis': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces flexbox item sizing recalculation.' },
  'grid-template-columns': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces CSS Grid track recomputation.' },
  'grid-template-rows': { category: 'layout_reflow', stage: 'layout', caveat: 'Forces CSS Grid track recomputation.' },
  'font-size': { category: 'layout_reflow', stage: 'layout', caveat: 'Triggers glyph font metric recomputation and line box reflow.' },
  'font-weight': { category: 'layout_reflow', stage: 'layout', caveat: 'Can trigger glyph layout shifts and text reflow.' },
  'line-height': { category: 'layout_reflow', stage: 'layout', caveat: 'Alters line box heights and vertical rhythm across paragraphs.' },
  'letter-spacing': { category: 'layout_reflow', stage: 'layout', caveat: 'Alters inline word wrapping and line formatting.' },
  'border-width': { category: 'layout_reflow', stage: 'layout', caveat: 'Changes box border metrics; forces layout reflow.' },

  // Ambiguous catchall
  'all': {
    category: 'ambiguous_catchall',
    stage: 'ambiguous',
    caveat: 'Explicitly animates every animatable property across the CSS spec, causing catastrophic reflow and repaint thrashing.'
  }
};
