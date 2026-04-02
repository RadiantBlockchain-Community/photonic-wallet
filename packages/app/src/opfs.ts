import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export async function getTx(txid: string): Promise<string | undefined> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("tx", { create: true });
  try {
    const fileHandle = await dir.getFileHandle(txid);
    const buf = await (await fileHandle.getFile()).arrayBuffer();
    console.debug(`OPFS get ${txid}`);
    return bytesToHex(new Uint8Array(buf));
  } catch (error) {
    return undefined;
  }
}

export async function putTx(txid: string, hex: string) {
  console.debug(`OPFS put ${txid}`);
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("tx", { create: true });
  const fileHandle = await dir.getFileHandle(txid, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(hexToBytes(hex) as BlobPart);
  await writable.close();
  return true;
}

export async function deleteAll() {
  const root = await navigator.storage.getDirectory();
  root.removeEntry("tx", { recursive: true });
}

export default { getTx, putTx, deleteAll };
