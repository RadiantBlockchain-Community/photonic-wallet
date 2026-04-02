import { describe, it, expect } from 'vitest';
import { SmartTokenPayload, DmintPayload } from '../types';
import { GLYPH_FT, GLYPH_DMINT } from '../protocols';
import { dMintScript, dMintDiffToTarget } from '../script';
import rjs from '@radiant-core/radiantjs';

const { Script } = rjs;

function hasNonMinimalDataPush(scriptHex: string): boolean {
  const asm = Script.fromHex(scriptHex).toASM();
  const tokens = asm.split(' ');

  return tokens.some((token) => {
    if (!/^[0-9a-f]{2}$/i.test(token)) return false;
    const value = Number.parseInt(token, 16);
    return value === 0 || (value >= 1 && value <= 16) || value === 0x81;
  });
}

function getPowHashOp(scriptHex: string): string | undefined {
  return scriptHex.toLowerCase().match(/(aa|ee|ef)bc01147f/)?.[1];
}

function getPreimageIndexWindow(scriptHex: string): string {
  const asm = Script.fromHex(scriptHex).toASM();
  const start = 'OP_OUTPOINTTXHASH';
  const end = 'OP_ROLL';
  const startIndex = asm.indexOf(start);
  const endIndex = asm.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    return '';
  }
  return asm.slice(startIndex, endIndex + end.length);
}

describe('dMint Token Creation (Glyph v2)', () => {
  describe('Payload Structure', () => {
    it('should include v:2 version field', () => {
      const payload: SmartTokenPayload = {
        v: 2,
        p: [GLYPH_FT, GLYPH_DMINT],
        ticker: 'TEST',
      };
      
      expect(payload.v).toBe(2);
    });

    it('should include FT and DMINT protocols', () => {
      const payload: SmartTokenPayload = {
        v: 2,
        p: [GLYPH_FT, GLYPH_DMINT],
        ticker: 'TEST',
      };
      
      expect(payload.p).toContain(GLYPH_FT);
      expect(payload.p).toContain(GLYPH_DMINT);
    });

    it('should include dmint object with algorithm', () => {
      const dmint: DmintPayload = {
        algo: 0x01, // Blake3
        numContracts: 1,
        maxHeight: 10000,
        reward: 100,
        premine: 0,
        diff: 10,
      };
      
      const payload: SmartTokenPayload = {
        v: 2,
        p: [GLYPH_FT, GLYPH_DMINT],
        ticker: 'TEST',
        dmint,
      };
      
      expect(payload.dmint).toBeDefined();
      expect(payload.dmint?.algo).toBe(0x01);
    });
  });

  describe('Algorithm IDs', () => {
    // Helper function to map algorithm string to ID
    const mapAlgoToId = (algo: string): number => {
      const algoMap: Record<string, number> = {
        'sha256d': 0x00,
        'blake3': 0x01,
        'k12': 0x02,
        'argon2light': 0x03,
      };
      return algoMap[algo] ?? 0x00;
    };

    it('should map sha256d to 0x00', () => {
      expect(mapAlgoToId('sha256d')).toBe(0x00);
    });

    it('should map blake3 to 0x01', () => {
      expect(mapAlgoToId('blake3')).toBe(0x01);
    });

    it('should map k12 to 0x02', () => {
      expect(mapAlgoToId('k12')).toBe(0x02);
    });

    it('should map argon2light to 0x03', () => {
      expect(mapAlgoToId('argon2light')).toBe(0x03);
    });

    it('should default unknown algorithms to sha256d (0x00)', () => {
      expect(mapAlgoToId('unknown')).toBe(0x00);
    });
  });

  describe('DAA Modes', () => {
    it('should support fixed DAA mode (0x00)', () => {
      const dmint: DmintPayload = {
        algo: 0x01,
        numContracts: 1,
        maxHeight: 10000,
        reward: 100,
        premine: 0,
        diff: 10,
        // No daa field = fixed mode
      };
      
      expect(dmint.daa).toBeUndefined();
    });

    it('should support ASERT DAA mode (0x02)', () => {
      const dmint: DmintPayload = {
        algo: 0x01,
        numContracts: 1,
        maxHeight: 10000,
        reward: 100,
        premine: 0,
        diff: 10,
        daa: {
          mode: 0x02,
          targetBlockTime: 60,
          halfLife: 1000,
        },
      };
      
      expect(dmint.daa).toBeDefined();
      expect(dmint.daa?.mode).toBe(0x02);
      expect(dmint.daa?.halfLife).toBe(1000);
    });

    it('should support LWMA DAA mode (0x03)', () => {
      const dmint: DmintPayload = {
        algo: 0x01,
        numContracts: 1,
        maxHeight: 10000,
        reward: 100,
        premine: 0,
        diff: 10,
        daa: {
          mode: 0x03,
          targetBlockTime: 60,
          windowSize: 144,
        },
      };
      
      expect(dmint.daa).toBeDefined();
      expect(dmint.daa?.mode).toBe(0x03);
      expect(dmint.daa?.windowSize).toBe(144);
    });

    it('should support Epoch DAA mode (0x01)', () => {
      const dmint: DmintPayload = {
        algo: 0x00, // sha256d
        numContracts: 1,
        maxHeight: 10000,
        reward: 100,
        premine: 0,
        diff: 10,
        daa: {
          mode: 0x01,
          targetBlockTime: 600,
          epochLength: 2016,
          maxAdjustment: 4,
        },
      };
      
      expect(dmint.daa).toBeDefined();
      expect(dmint.daa?.mode).toBe(0x01);
      expect(dmint.daa?.epochLength).toBe(2016);
    });

    it('should support Schedule DAA mode (0x04)', () => {
      const dmint: DmintPayload = {
        algo: 0x01,
        numContracts: 1,
        maxHeight: 10000,
        reward: 100,
        premine: 0,
        diff: 10,
        daa: {
          mode: 0x04,
          targetBlockTime: 60,
          schedule: [
            { height: 0, difficulty: 10 },
            { height: 1000, difficulty: 100 },
            { height: 5000, difficulty: 1000 },
          ],
        },
      };
      
      expect(dmint.daa).toBeDefined();
      expect(dmint.daa?.mode).toBe(0x04);
      expect(dmint.daa?.schedule).toHaveLength(3);
    });
  });

  describe('Complete dMint Token Payloads', () => {
    it('should create valid Blake3 ASERT token', () => {
      const payload: SmartTokenPayload = {
        v: 2,
        p: [GLYPH_FT, GLYPH_DMINT],
        ticker: 'BLAKE',
        name: 'Blake3 Token',
        dmint: {
          algo: 0x01, // Blake3
          numContracts: 1,
          maxHeight: 10000,
          reward: 100,
          premine: 0,
          diff: 2500000,
          daa: {
            mode: 0x02, // ASERT
            targetBlockTime: 60,
            halfLife: 3600,
          },
        },
      };
      
      expect(payload.v).toBe(2);
      expect(payload.p).toContain(GLYPH_FT);
      expect(payload.p).toContain(GLYPH_DMINT);
      expect(payload.dmint?.algo).toBe(0x01);
      expect(payload.dmint?.daa?.mode).toBe(0x02);
    });

    it('should create valid SHA256d Fixed token', () => {
      const payload: SmartTokenPayload = {
        v: 2,
        p: [GLYPH_FT, GLYPH_DMINT],
        ticker: 'SHA256',
        name: 'SHA256d Token',
        dmint: {
          algo: 0x00, // SHA256d
          numContracts: 1,
          maxHeight: 21000000,
          reward: 50,
          premine: 1000000,
          diff: 500000,
        },
      };
      
      expect(payload.v).toBe(2);
      expect(payload.dmint?.algo).toBe(0x00);
      expect(payload.dmint?.premine).toBe(1000000);
      expect(payload.dmint?.daa).toBeUndefined(); // Fixed mode
    });

    it('should create valid K12 LWMA token', () => {
      const payload: SmartTokenPayload = {
        v: 2,
        p: [GLYPH_FT, GLYPH_DMINT],
        ticker: 'K12',
        name: 'KangarooTwelve Token',
        dmint: {
          algo: 0x02, // K12
          numContracts: 1,
          maxHeight: 5000,
          reward: 200,
          premine: 0,
          diff: 2000000,
          daa: {
            mode: 0x03, // LWMA
            targetBlockTime: 30,
            windowSize: 72,
          },
        },
      };
      
      expect(payload.dmint?.algo).toBe(0x02);
      expect(payload.dmint?.daa?.mode).toBe(0x03);
      expect(payload.dmint?.daa?.windowSize).toBe(72);
    });

    it('should create valid Argon2Light Epoch token', () => {
      const payload: SmartTokenPayload = {
        v: 2,
        p: [GLYPH_FT, GLYPH_DMINT],
        ticker: 'ARG2',
        name: 'Argon2 Light Token',
        dmint: {
          algo: 0x03, // Argon2Light
          numContracts: 1,
          maxHeight: 100000,
          reward: 10,
          premine: 500,
          diff: 50000,
          daa: {
            mode: 0x01, // Epoch
            targetBlockTime: 120,
            epochLength: 500,
            maxAdjustment: 2,
          },
        },
      };
      
      expect(payload.dmint?.algo).toBe(0x03);
      expect(payload.dmint?.daa?.mode).toBe(0x01);
      expect(payload.dmint?.daa?.epochLength).toBe(500);
    });
  });

  describe('dMint Script Encoding', () => {
    const contractRef = '11'.repeat(36);
    const tokenRef = '22'.repeat(36);
    const target = dMintDiffToTarget(10);

    const algoCases = [
      { algo: 'sha256d', expectedOp: 'aa' },
      { algo: 'blake3', expectedOp: 'ee' },
      { algo: 'k12', expectedOp: 'ef' },
    ] as const;

    const daaCases = [
      { daaMode: 'fixed', daaParams: null },
      { daaMode: 'asert', daaParams: { targetBlockTime: 60, halfLife: 1000, asymptote: 0 } },
      { daaMode: 'lwma', daaParams: { targetBlockTime: 60, windowSize: 144 } },
      { daaMode: 'epoch', daaParams: { targetBlockTime: 60, epochLength: 2016, maxAdjustment: 4 } },
      {
        daaMode: 'schedule',
        daaParams: {
          schedule: [
            { height: 0, difficulty: 10 },
            { height: 1000, difficulty: 50 },
          ],
        },
      },
    ] as const;

    it('should emit canonical minimal pushes for all supported algorithms and DAA modes', () => {
      for (const { algo, expectedOp } of algoCases) {
        for (const { daaMode, daaParams } of daaCases) {
          const script = dMintScript(
            0,
            contractRef,
            tokenRef,
            100,
            10,
            target,
            algo,
            daaMode,
            daaParams
          );

          expect(getPowHashOp(script)).toBe(expectedOp);
          expect(hasNonMinimalDataPush(script)).toBe(false);
        }
      }
    });

    it('uses legacy preimage stack indices for sha256d fixed contracts', () => {
      const script = dMintScript(
        0,
        contractRef,
        tokenRef,
        100,
        10,
        target,
        'sha256d',
        'fixed',
        null
      );

      const indexWindow = getPreimageIndexWindow(script);
      expect(indexWindow).toContain('OP_OUTPOINTTXHASH OP_5 OP_PICK');
      expect(indexWindow).toContain('OP_9 OP_PICK OP_9 OP_PICK');
      expect(indexWindow).toContain('OP_10 OP_ROLL');
    });

    it('uses enhanced preimage stack indices for v2 contracts with extra state fields', () => {
      const script = dMintScript(
        0,
        contractRef,
        tokenRef,
        100,
        10,
        target,
        'blake3',
        'asert',
        { targetBlockTime: 60, halfLife: 1000, asymptote: 0 }
      );

      const indexWindow = getPreimageIndexWindow(script);
      expect(indexWindow).toContain('OP_OUTPOINTTXHASH OP_10 OP_PICK');
      expect(indexWindow).toContain('OP_14 OP_PICK OP_14 OP_PICK');
      expect(indexWindow).toContain('OP_15 OP_ROLL');
    });
  });
});
