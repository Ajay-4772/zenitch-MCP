import { PropertyClassificationDetail } from '../schemas/animation.schema.js';
import { KNOWN_PROPERTY_MAP, PropertyMetadata } from './constants.js';

export function classifyProperty(rawProp: string): PropertyClassificationDetail {
  const normalized = rawProp.trim().toLowerCase();

  // 1. Direct match in known map
  if (KNOWN_PROPERTY_MAP[normalized]) {
    const meta = KNOWN_PROPERTY_MAP[normalized];
    return {
      property: normalized,
      classification: meta.category,
      pipelineStage: meta.stage,
      caveat: meta.caveat
    };
  }

  // 2. Custom CSS Property (--*)
  if (normalized.startsWith('--')) {
    return {
      property: normalized,
      classification: 'unknown_or_context_dependent',
      pipelineStage: 'unknown',
      caveat: 'CSS custom property (--*); actual rendering cost depends on downstream property bindings at runtime.'
    };
  }

  // 3. Vendor prefixes (-webkit-, -moz-, -ms-, -o-)
  const prefixMatch = normalized.match(/^-(webkit|moz|ms|o)-(.+)$/);
  if (prefixMatch) {
    const unprefixed = prefixMatch[2];
    if (KNOWN_PROPERTY_MAP[unprefixed]) {
      const meta = KNOWN_PROPERTY_MAP[unprefixed];
      return {
        property: normalized,
        classification: meta.category,
        pipelineStage: meta.stage,
        caveat: `Vendor-prefixed variant of ${unprefixed}. ${meta.caveat}`
      };
    }
  }

  // 4. Context-dependent properties like clip-path or offset-path
  if (normalized === 'clip-path' || normalized === 'offset-path') {
    return {
      property: normalized,
      classification: 'unknown_or_context_dependent',
      pipelineStage: 'paint',
      caveat: `${normalized} rendering cost is context-dependent: basic geometric shapes may be accelerated, while complex SVG paths require software rasterization.`
    };
  }

  // 5. Unregistered / Unknown property
  return {
    property: normalized,
    classification: 'unknown_or_context_dependent',
    pipelineStage: 'unknown',
    caveat: `Unregistered or non-standard property "${normalized}". Static analysis treats rendering cost as uncertain; verify with browser DevTools performance profiler.`
  };
}
