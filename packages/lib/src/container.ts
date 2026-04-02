/**
 * Glyph v2 Container/Collection Support
 * Reference: Glyph v2 Token Standard Section 14
 */

import { GlyphV2Container, GlyphV2Metadata, GlyphV2Relationships } from "./v2metadata";
import { GLYPH_NFT, GLYPH_CONTAINER } from "./protocols";
import { hexToBytes } from "@noble/hashes/utils";
import Outpoint from "./Outpoint";

/**
 * Create container metadata
 */
export function createContainer(
  name: string,
  options?: {
    type?: "collection" | "bundle" | "album";
    max_items?: number;
    desc?: string;
    preview?: any;
  }
): GlyphV2Metadata {
  const container: GlyphV2Container = {
    type: options?.type || "collection",
    max_items: options?.max_items,
    minted: 0,
    items: [],
  };

  return {
    v: 2,
    p: [GLYPH_NFT, GLYPH_CONTAINER],
    name,
    desc: options?.desc,
    container,
    preview: options?.preview,
  };
}

/**
 * Add item to container
 */
export function addItemToContainer(
  containerMetadata: GlyphV2Metadata,
  itemRef: string
): GlyphV2Metadata {
  if (!containerMetadata.container) {
    throw new Error("Not a container token");
  }

  const container = { ...containerMetadata.container };
  const items = [...(container.items || [])];

  // Check max_items limit
  if (container.max_items && items.length >= container.max_items) {
    throw new Error(`Container is full (max: ${container.max_items})`);
  }

  // Add item if not already present
  if (!items.includes(itemRef)) {
    items.push(itemRef);
    container.items = items;
    container.minted = items.length;
  }

  return {
    ...containerMetadata,
    container,
  };
}

/**
 * Remove item from container
 */
export function removeItemFromContainer(
  containerMetadata: GlyphV2Metadata,
  itemRef: string
): GlyphV2Metadata {
  if (!containerMetadata.container) {
    throw new Error("Not a container token");
  }

  const container = { ...containerMetadata.container };
  const items = (container.items || []).filter((ref) => ref !== itemRef);

  container.items = items;
  container.minted = items.length;

  return {
    ...containerMetadata,
    container,
  };
}

/**
 * Create child token relationship to container
 */
export function createChildRelationship(
  containerRef: string,
  index?: number
): GlyphV2Relationships {
  return {
    container: {
      ref: containerRef,
      index,
    },
  };
}

/**
 * Validate container metadata
 */
export function validateContainer(
  metadata: GlyphV2Metadata
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Must have CONTAINER protocol
  if (!metadata.p.includes(GLYPH_CONTAINER)) {
    errors.push("Container metadata must include GLYPH_CONTAINER protocol");
  }

  // Must have NFT protocol
  if (!metadata.p.includes(GLYPH_NFT)) {
    errors.push("Container must be an NFT");
  }

  // Validate container object
  if (!metadata.container) {
    errors.push("Container metadata missing container object");
  } else {
    const container = metadata.container;

    if (!container.type) {
      errors.push("Container type is required");
    }

    if (container.max_items !== undefined && container.max_items < 0) {
      errors.push("Container max_items must be positive");
    }

    if (container.minted !== undefined && container.items) {
      if (container.minted !== container.items.length) {
        errors.push("Container minted count doesn't match items array length");
      }
    }

    if (container.max_items && container.items && container.items.length > container.max_items) {
      errors.push(`Container has more items (${container.items.length}) than max_items (${container.max_items})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get container statistics
 */
export function getContainerStats(metadata: GlyphV2Metadata): {
  type: string;
  total: number;
  max?: number;
  available?: number;
  full: boolean;
} {
  if (!metadata.container) {
    throw new Error("Not a container token");
  }

  const container = metadata.container;
  const total = container.items?.length || 0;
  const max = container.max_items;
  const available = max ? max - total : undefined;
  const full = max ? total >= max : false;

  return {
    type: container.type,
    total,
    max,
    available,
    full,
  };
}

/**
 * Create child token with container reference
 */
export function createChildToken(
  containerRef: string,
  childMetadata: Partial<GlyphV2Metadata>,
  index?: number
): GlyphV2Metadata {
  // Convert container ref to little-endian bytes for 'in' field
  const containerRefBytes = hexToBytes(
    Outpoint.fromString(containerRef).reverse().toString()
  );

  return {
    v: 2,
    p: childMetadata.p || [GLYPH_NFT],
    ...childMetadata,
    rels: {
      ...childMetadata.rels,
      container: {
        ref: containerRef,
        index,
      },
    },
    // Legacy 'in' field for v1 compatibility
    in: [containerRefBytes],
  };
}

/**
 * Check if token is a container
 */
export function isContainer(metadata: GlyphV2Metadata): boolean {
  return metadata.p.includes(GLYPH_CONTAINER);
}

/**
 * Check if token is a child of a container
 */
export function isChildToken(metadata: GlyphV2Metadata): boolean {
  return !!(metadata.rels?.container || metadata.in);
}

/**
 * Get container reference from child token
 */
export function getContainerRef(metadata: GlyphV2Metadata): string | undefined {
  if (metadata.rels?.container) {
    return metadata.rels.container.ref;
  }

  // Fallback to legacy 'in' field
  const inField = (metadata as Record<string, unknown>).in as Uint8Array[] | undefined;
  if (inField && inField.length > 0) {
    const refBytes = inField[0];
    return Outpoint.fromString(
      Buffer.from(refBytes).toString("hex")
    ).reverse().toString();
  }

  return undefined;
}
