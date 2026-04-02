// This is imported by worker.ts so it's executed early enough
import { Buffer } from "buffer";
// @ts-ignore - Polyfill Buffer for browser/worker environment
globalThis.Buffer = Buffer;
// @ts-ignore
if (typeof window !== "undefined") window.Buffer = Buffer;
// @ts-ignore
if (typeof self !== "undefined") self.Buffer = Buffer;
