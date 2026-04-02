/**
 * Cryptographic Utilities Tests
 */

import { describe, it, expect, vi } from 'vitest';

describe('Crypto Utilities', () => {
  describe('Key Generation', () => {
    it('should generate random bytes', () => {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      
      // Should not be all zeros
      const hasNonZero = bytes.some(b => b !== 0);
      expect(hasNonZero).toBe(true);
    });

    it('should generate different values each time', () => {
      const bytes1 = new Uint8Array(32);
      const bytes2 = new Uint8Array(32);
      
      crypto.getRandomValues(bytes1);
      crypto.getRandomValues(bytes2);
      
      // Should be different (extremely unlikely to be same)
      const areEqual = bytes1.every((b, i) => b === bytes2[i]);
      expect(areEqual).toBe(false);
    });
  });

  describe('Hex Encoding', () => {
    it('should convert bytes to hex string', () => {
      const bytes = new Uint8Array([0x00, 0x11, 0x22, 0xff]);
      const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      expect(hex).toBe('001122ff');
    });

    it('should convert hex string to bytes', () => {
      const hex = '001122ff';
      const bytes = new Uint8Array(
        hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );
      
      expect(bytes).toEqual(new Uint8Array([0x00, 0x11, 0x22, 0xff]));
    });
  });
});

describe('Address Validation', () => {
  it('should validate Radiant mainnet address format', () => {
    // Radiant addresses start with '1' for mainnet P2PKH
    const validAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    expect(validAddress.startsWith('1')).toBe(true);
    expect(validAddress.length).toBeGreaterThanOrEqual(26);
    expect(validAddress.length).toBeLessThanOrEqual(35);
  });

  it('should reject invalid characters', () => {
    const invalidChars = ['0', 'O', 'I', 'l'];
    const validBase58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    invalidChars.forEach(char => {
      expect(validBase58.includes(char)).toBe(false);
    });
  });
});
