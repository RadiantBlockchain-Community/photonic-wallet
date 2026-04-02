import { describe, it, expect } from 'vitest';
import {
  GLYPH_FT,
  GLYPH_NFT,
  GLYPH_DAT,
  GLYPH_DMINT,
  GLYPH_MUT,
  GLYPH_BURN,
  GLYPH_CONTAINER,
  GLYPH_ENCRYPTED,
  GLYPH_TIMELOCK,
  GLYPH_AUTHORITY,
  GLYPH_WAVE,
  PROTOCOL_NAMES,
  getTokenType,
  hasBaseType,
  validateProtocols,
  isImmutable,
  hasRoyalty,
  isEncrypted,
  isContainer,
} from '../protocols';

describe('Glyph v2 Protocol Constants', () => {
  describe('Protocol IDs', () => {
    it('should have correct base type IDs', () => {
      expect(GLYPH_FT).toBe(1);
      expect(GLYPH_NFT).toBe(2);
      expect(GLYPH_DAT).toBe(3);
    });

    it('should have correct extension IDs', () => {
      expect(GLYPH_DMINT).toBe(4);
      expect(GLYPH_MUT).toBe(5);
      expect(GLYPH_BURN).toBe(6);
      expect(GLYPH_CONTAINER).toBe(7);
      expect(GLYPH_ENCRYPTED).toBe(8);
      expect(GLYPH_TIMELOCK).toBe(9);
      expect(GLYPH_AUTHORITY).toBe(10);
      expect(GLYPH_WAVE).toBe(11);
    });
  });

  describe('Protocol Names', () => {
    it('should have names for all protocols', () => {
      expect(PROTOCOL_NAMES[GLYPH_FT]).toBe('Fungible Token');
      expect(PROTOCOL_NAMES[GLYPH_NFT]).toBe('Non-Fungible Token');
      expect(PROTOCOL_NAMES[GLYPH_DAT]).toBe('Data Storage');
      expect(PROTOCOL_NAMES[GLYPH_DMINT]).toBe('Decentralized Minting');
      expect(PROTOCOL_NAMES[GLYPH_MUT]).toBe('Mutable State');
      expect(PROTOCOL_NAMES[GLYPH_BURN]).toBe('Burn');
      expect(PROTOCOL_NAMES[GLYPH_CONTAINER]).toBe('Container');
      expect(PROTOCOL_NAMES[GLYPH_ENCRYPTED]).toBe('Encrypted');
      expect(PROTOCOL_NAMES[GLYPH_TIMELOCK]).toBe('Timelock');
      expect(PROTOCOL_NAMES[GLYPH_AUTHORITY]).toBe('Authority');
      expect(PROTOCOL_NAMES[GLYPH_WAVE]).toBe('WAVE Name');
    });
  });
});

describe('getTokenType', () => {
  it('should return "Fungible Token" for FT', () => {
    expect(getTokenType([GLYPH_FT])).toBe('Fungible Token');
  });

  it('should return "dMint FT" for FT + DMINT', () => {
    expect(getTokenType([GLYPH_FT, GLYPH_DMINT])).toBe('dMint FT');
  });

  it('should return "NFT" for basic NFT', () => {
    expect(getTokenType([GLYPH_NFT])).toBe('NFT');
  });

  it('should return "Mutable NFT" for NFT + MUT', () => {
    expect(getTokenType([GLYPH_NFT, GLYPH_MUT])).toBe('Mutable NFT');
  });

  it('should return "Container" for NFT + CONTAINER', () => {
    expect(getTokenType([GLYPH_NFT, GLYPH_CONTAINER])).toBe('Container');
  });

  it('should return "Encrypted NFT" for NFT + ENCRYPTED', () => {
    expect(getTokenType([GLYPH_NFT, GLYPH_ENCRYPTED])).toBe('Encrypted NFT');
  });

  it('should return "Authority" for NFT + AUTHORITY', () => {
    expect(getTokenType([GLYPH_NFT, GLYPH_AUTHORITY])).toBe('Authority');
  });

  it('should return "WAVE Name" for NFT + MUT + WAVE', () => {
    expect(getTokenType([GLYPH_NFT, GLYPH_MUT, GLYPH_WAVE])).toBe('WAVE Name');
  });

  it('should return "Data" for DAT', () => {
    expect(getTokenType([GLYPH_DAT])).toBe('Data');
  });

  it('should return "Unknown" for empty protocols', () => {
    expect(getTokenType([])).toBe('Unknown');
  });
});

describe('hasBaseType', () => {
  it('should return true for FT', () => {
    expect(hasBaseType([GLYPH_FT])).toBe(true);
  });

  it('should return true for NFT', () => {
    expect(hasBaseType([GLYPH_NFT])).toBe(true);
  });

  it('should return true for DAT', () => {
    expect(hasBaseType([GLYPH_DAT])).toBe(true);
  });

  it('should return false for extensions only', () => {
    expect(hasBaseType([GLYPH_MUT])).toBe(false);
    expect(hasBaseType([GLYPH_BURN])).toBe(false);
  });

  it('should return true for combinations with base type', () => {
    expect(hasBaseType([GLYPH_NFT, GLYPH_MUT])).toBe(true);
    expect(hasBaseType([GLYPH_FT, GLYPH_DMINT])).toBe(true);
  });
});

describe('validateProtocols', () => {
  it('should accept valid FT', () => {
    const result = validateProtocols([GLYPH_FT]);
    expect(result.valid).toBe(true);
  });

  it('should accept valid NFT', () => {
    const result = validateProtocols([GLYPH_NFT]);
    expect(result.valid).toBe(true);
  });

  it('should accept valid dMint (FT + DMINT)', () => {
    const result = validateProtocols([GLYPH_FT, GLYPH_DMINT]);
    expect(result.valid).toBe(true);
  });

  it('should accept valid Mutable NFT', () => {
    const result = validateProtocols([GLYPH_NFT, GLYPH_MUT]);
    expect(result.valid).toBe(true);
  });

  it('should reject FT + NFT (mutually exclusive)', () => {
    const result = validateProtocols([GLYPH_FT, GLYPH_NFT]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('mutually exclusive');
  });

  it('should reject DMINT without FT', () => {
    const result = validateProtocols([GLYPH_NFT, GLYPH_DMINT]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('requires');
  });

  it('should reject MUT without NFT', () => {
    const result = validateProtocols([GLYPH_FT, GLYPH_MUT]);
    expect(result.valid).toBe(false);
  });

  it('should reject BURN alone', () => {
    const result = validateProtocols([GLYPH_BURN]);
    expect(result.valid).toBe(false);
  });

  it('should accept BURN with FT', () => {
    const result = validateProtocols([GLYPH_FT, GLYPH_BURN]);
    expect(result.valid).toBe(true);
  });

  it('should accept BURN with NFT', () => {
    const result = validateProtocols([GLYPH_NFT, GLYPH_BURN]);
    expect(result.valid).toBe(true);
  });

  it('should reject TIMELOCK without ENCRYPTED', () => {
    const result = validateProtocols([GLYPH_NFT, GLYPH_TIMELOCK]);
    expect(result.valid).toBe(false);
  });

  it('should accept TIMELOCK with ENCRYPTED and NFT', () => {
    const result = validateProtocols([GLYPH_NFT, GLYPH_ENCRYPTED, GLYPH_TIMELOCK]);
    expect(result.valid).toBe(true);
  });

  it('should accept WAVE with NFT + MUT', () => {
    const result = validateProtocols([GLYPH_NFT, GLYPH_MUT, GLYPH_WAVE]);
    expect(result.valid).toBe(true);
  });

  it('should reject WAVE without MUT', () => {
    const result = validateProtocols([GLYPH_NFT, GLYPH_WAVE]);
    expect(result.valid).toBe(false);
  });
});

describe('isImmutable', () => {
  it('should return true for basic NFT', () => {
    expect(isImmutable([GLYPH_NFT])).toBe(true);
  });

  it('should return false for mutable NFT', () => {
    expect(isImmutable([GLYPH_NFT, GLYPH_MUT])).toBe(false);
  });

  it('should return true for FT (always immutable)', () => {
    expect(isImmutable([GLYPH_FT])).toBe(true);
  });
});

describe('hasRoyalty', () => {
  it('should return true when royalty with bps is present', () => {
    expect(hasRoyalty({ royalty: { bps: 500 } })).toBe(true);
  });

  it('should return false when royalty is missing', () => {
    expect(hasRoyalty({})).toBe(false);
  });

  it('should return false when bps is 0', () => {
    expect(hasRoyalty({ royalty: { bps: 0 } })).toBe(false);
  });

  it('should return false when bps is undefined', () => {
    expect(hasRoyalty({ royalty: {} })).toBe(false);
  });
});

describe('isEncrypted', () => {
  it('should return true when ENCRYPTED is present', () => {
    expect(isEncrypted([GLYPH_NFT, GLYPH_ENCRYPTED])).toBe(true);
  });

  it('should return false when ENCRYPTED is not present', () => {
    expect(isEncrypted([GLYPH_NFT])).toBe(false);
  });
});

describe('isContainer', () => {
  it('should return true when CONTAINER is present', () => {
    expect(isContainer([GLYPH_NFT, GLYPH_CONTAINER])).toBe(true);
  });

  it('should return false when CONTAINER is not present', () => {
    expect(isContainer([GLYPH_NFT])).toBe(false);
  });
});
