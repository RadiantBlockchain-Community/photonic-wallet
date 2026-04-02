import { describe, it, expect } from 'vitest';
import {
  validateV2Metadata,
  createV2Metadata,
  normalizeV1ToV2Content,
  convertV2ToV1Shorthand,
  type GlyphV2Metadata,
  type GlyphV2Content,
} from '../v2metadata';
import { GLYPH_FT, GLYPH_NFT, GLYPH_DMINT, GLYPH_MUT } from '../protocols';

describe('validateV2Metadata', () => {
  it('should accept valid minimal metadata', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [GLYPH_NFT],
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject metadata with wrong version', () => {
    const metadata = {
      v: 1,
      p: [GLYPH_NFT],
    } as unknown as GlyphV2Metadata;
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Version must be 2');
  });

  it('should reject metadata with empty protocol array', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [],
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Protocol array'))).toBe(true);
  });

  it('should reject name exceeding 256 bytes', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [GLYPH_NFT],
      name: 'x'.repeat(257),
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Name exceeds'))).toBe(true);
  });

  it('should reject description exceeding 4KB', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [GLYPH_NFT],
      desc: 'x'.repeat(4097),
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Description exceeds'))).toBe(true);
  });

  it('should reject invalid royalty bps', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [GLYPH_NFT],
      royalty: {
        enforced: true,
        bps: 15000, // > 10000
        address: 'test',
      },
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('bps must be between'))).toBe(true);
  });

  it('should reject royalty without address', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [GLYPH_NFT],
      royalty: {
        enforced: true,
        bps: 500,
        address: '',
      },
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(false);
  });

  it('should reject soulbound non-NFT token', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [GLYPH_FT],
      policy: {
        transferable: false,
      },
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('soulbound'))).toBe(true);
  });

  it('should accept soulbound NFT', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [GLYPH_NFT],
      policy: {
        transferable: false,
      },
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(true);
  });

  it('should accept full valid metadata', () => {
    const metadata: GlyphV2Metadata = {
      v: 2,
      p: [GLYPH_NFT, GLYPH_MUT],
      name: 'Test NFT',
      desc: 'A test NFT',
      created: new Date().toISOString(),
      royalty: {
        enforced: true,
        bps: 500,
        address: 'rXdTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
    };
    const result = validateV2Metadata(metadata);
    expect(result.valid).toBe(true);
  });
});

describe('createV2Metadata', () => {
  it('should create minimal metadata with defaults', () => {
    const metadata = createV2Metadata([GLYPH_NFT]);
    expect(metadata.v).toBe(2);
    expect(metadata.p).toEqual([GLYPH_NFT]);
    expect(metadata.created).toBeDefined();
  });

  it('should merge options into metadata', () => {
    const metadata = createV2Metadata([GLYPH_FT, GLYPH_DMINT], {
      name: 'Test Token',
      desc: 'A test dMint token',
    });
    expect(metadata.v).toBe(2);
    expect(metadata.p).toEqual([GLYPH_FT, GLYPH_DMINT]);
    expect(metadata.name).toBe('Test Token');
    expect(metadata.desc).toBe('A test dMint token');
  });

  it('should allow overriding created timestamp', () => {
    const customDate = '2024-01-01T00:00:00.000Z';
    const metadata = createV2Metadata([GLYPH_NFT], { created: customDate });
    expect(metadata.created).toBe(customDate);
  });
});

describe('normalizeV1ToV2Content', () => {
  it('should return undefined for undefined input', () => {
    expect(normalizeV1ToV2Content(undefined)).toBeUndefined();
  });

  it('should convert v1 shorthand to v2 content model', () => {
    const v1Main = {
      t: 'image/png',
      b: new Uint8Array([1, 2, 3, 4]),
    };
    const result = normalizeV1ToV2Content(v1Main);
    expect(result).toBeDefined();
    expect(result!.primary).toBeDefined();
    expect(result!.primary!.mime).toBe('image/png');
    expect(result!.primary!.size).toBe(4);
    expect(result!.primary!.storage).toBe('inline');
    expect(result!.primary!.data).toEqual(v1Main.b);
    expect(result!.primary!.hash.algo).toBe('sha256');
    expect(result!.primary!.hash.hex).toBeDefined();
  });
});

describe('convertV2ToV1Shorthand', () => {
  it('should return undefined for undefined content', () => {
    expect(convertV2ToV1Shorthand(undefined)).toBeUndefined();
  });

  it('should return undefined for content without primary', () => {
    const content: GlyphV2Content = {};
    expect(convertV2ToV1Shorthand(content)).toBeUndefined();
  });

  it('should return undefined for non-inline storage', () => {
    const content: GlyphV2Content = {
      primary: {
        path: 'main',
        mime: 'image/png',
        size: 100,
        hash: { algo: 'sha256', hex: 'abc' },
        storage: 'ipfs',
        uri: 'ipfs://xxx',
      },
    };
    expect(convertV2ToV1Shorthand(content)).toBeUndefined();
  });

  it('should convert v2 inline content to v1 shorthand', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const content: GlyphV2Content = {
      primary: {
        path: 'main',
        mime: 'image/png',
        size: 4,
        hash: { algo: 'sha256', hex: 'abc' },
        storage: 'inline',
        data,
      },
    };
    const result = convertV2ToV1Shorthand(content);
    expect(result).toBeDefined();
    expect(result!.t).toBe('image/png');
    expect(result!.b).toEqual(data);
  });
});
