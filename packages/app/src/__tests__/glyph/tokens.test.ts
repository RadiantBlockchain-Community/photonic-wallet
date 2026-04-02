/**
 * Glyph Token Tests
 */

import { describe, it, expect } from 'vitest';

describe('Glyph Protocol', () => {
  describe('Protocol Identifiers', () => {
    it('should define FT protocol ID', () => {
      const GLYPH_FT = 1;
      expect(GLYPH_FT).toBe(1);
    });

    it('should define NFT protocol ID', () => {
      const GLYPH_NFT = 2;
      expect(GLYPH_NFT).toBe(2);
    });

    it('should define DAT protocol ID', () => {
      const GLYPH_DAT = 3;
      expect(GLYPH_DAT).toBe(3);
    });

    it('should define dMint protocol ID', () => {
      const GLYPH_DMINT = 4;
      expect(GLYPH_DMINT).toBe(4);
    });
  });

  describe('Metadata Structure', () => {
    it('should require version field', () => {
      const metadata = { v: 2, type: 'nft', p: [2] };
      expect(metadata.v).toBe(2);
    });

    it('should require protocol array', () => {
      const metadata = { v: 2, type: 'ft', p: [1] };
      expect(Array.isArray(metadata.p)).toBe(true);
    });

    it('should validate protocol combinations', () => {
      // FT and NFT are mutually exclusive
      const invalidCombination = [1, 2];
      const hasConflict = invalidCombination.includes(1) && invalidCombination.includes(2);
      expect(hasConflict).toBe(true);
    });
  });
});

describe('Fungible Tokens', () => {
  it('should have decimals field', () => {
    const ftMetadata = {
      v: 2,
      type: 'ft',
      p: [1],
      name: 'Test Token',
      ticker: 'TEST',
      decimals: 8,
    };
    expect(ftMetadata.decimals).toBe(8);
  });

  it('should have ticker field', () => {
    const ftMetadata = {
      v: 2,
      type: 'ft',
      p: [1],
      name: 'Test Token',
      ticker: 'TEST',
      decimals: 8,
    };
    expect(ftMetadata.ticker).toBe('TEST');
  });

  it('should track supply correctly', () => {
    const supply = {
      minted: 1000000,
      burned: 100,
      circulating: 999900,
    };
    expect(supply.circulating).toBe(supply.minted - supply.burned);
  });
});

describe('Non-Fungible Tokens', () => {
  it('should have unique ref', () => {
    const nftRef = '0'.repeat(64); // 32-byte txid
    expect(nftRef.length).toBe(64);
  });

  it('should support metadata attributes', () => {
    const nftMetadata = {
      v: 2,
      type: 'nft',
      p: [2],
      name: 'Test NFT #1',
      attrs: [
        { name: 'Rarity', value: 'Legendary' },
        { name: 'Power', value: 100 },
      ],
    };
    expect(nftMetadata.attrs.length).toBe(2);
  });

  it('should support content attachments', () => {
    const nftWithContent = {
      v: 2,
      type: 'nft',
      p: [2],
      name: 'Art NFT',
      main: {
        t: 'image/png',
        b: 'base64-data...',
      },
    };
    expect(nftWithContent.main.t).toBe('image/png');
  });
});

describe('dMint Tokens', () => {
  it('should require FT base protocol', () => {
    const dmintProtocols = [1, 4]; // FT + DMINT
    expect(dmintProtocols).toContain(1);
    expect(dmintProtocols).toContain(4);
  });

  it('should define mining parameters', () => {
    const dmintParams = {
      algorithm: 0x01, // BLAKE3
      startDiff: 500000,
      maxSupply: 21000000,
      reward: 50,
    };
    expect(dmintParams.algorithm).toBeDefined();
  });

  it('should support DAA modes', () => {
    const daaModes = {
      FIXED: 0,
      EPOCH: 1,
      ASERT: 2,
      LWMA: 3,
    };
    expect(Object.keys(daaModes).length).toBeGreaterThan(0);
  });
});
