import { Buffer } from "buffer";
import { BlockHeader as RadJSBlockHeader } from "@radiantblockchain/radiantjs";
import { Subscription } from "@app/types";
import { ElectrumHeaderResponse, ElectrumHeadersResponse } from "@lib/types";
import ElectrumManager from "@app/electrum/ElectrumManager";
import { nextBitsAserti32D, bitsToTarget } from "@lib/difficulty";
import db from "@app/db";
import { network } from "@app/signals";
// import { workerInstance } from "@app/verifier";

type BlockData = {
  hash: string;
  height: number;
  timestamp: number;
  bits: number;
};

const checkpoint: BlockData = {
  hash: "00000000895f1da227e7f61d59bb8d55240e506ba950d876ff3dc98602ebd594",
  height: 54974,
  timestamp: 1693625458,
  bits: 486604799,
};

export class HeadersSubscription implements Subscription {
  private electrum: ElectrumManager;
  private latestBlock: BlockData;
  private pending: ElectrumHeaderResponse[];
  private catchingUp: boolean;

  constructor(electrum: ElectrumManager) {
    this.electrum = electrum;
    this.latestBlock = checkpoint;
    this.pending = [];
    this.catchingUp = false;
  }

  async catchup() {
    this.catchingUp = true;
    console.debug("Catching up block headers");
    const fetchFromHeight = this.latestBlock.height;
    const fetchToHeight =
      this.pending[0]?.height || this.latestBlock.height + 1000;

    const response = (await this.electrum.client?.request(
      "blockchain.block.headers",
      fetchFromHeight,
      fetchToHeight - fetchFromHeight
    )) as ElectrumHeadersResponse;

    // Split 80 byte header hex strings
    const headers = response.hex.match(/.{160}/g) || [];

    // Check the first header returned matches our last header
    // If not, there must be a reorg
    const first = headers.shift();
    if (first) {
      const firstHeader = RadJSBlockHeader.fromString(first);
      if (this.latestBlock.hash !== firstHeader.hash) {
        // FIXME check for infinite loop?

        // Reorg. We need to find where the last good header is.
        // Go back 10 blocks and reattempt
        await this.rollback();
        await this.catchup();
        return;
      }
      console.debug("No reorg found");
    }

    console.debug("Processing catchup headers");

    headers.forEach((hex, index) => {
      this.processHeader({
        height: fetchFromHeight + index + 1, // Add one because first header was shifted
        hex,
      });
    });

    // Check if we have caught up
    if (
      this.pending.length &&
      this.latestBlock.height < this.pending[0].height - 1
    ) {
      console.debug("Still not caught up");
      this.catchup();
      return;
    }

    // Process the headers received from the subscription
    await this.processPending();

    this.catchingUp = false;
    console.debug("Finished catching up");
  }

  async syncPending() {}
  async manualSync() {}

  async processPending() {
    console.debug("Processing pending headers");
    while (this.pending.length > 0) {
      this.processHeader(this.pending.shift() as ElectrumHeaderResponse);
    }
  }

  async register() {
    // Get the latest block from the database, otherwise checkpoint will be used
    this.latestBlock = await this.getLatestBlock();

    this.electrum.client?.subscribe("blockchain.headers", (response) => {
      const raw = response as ElectrumHeaderResponse;
      const header = RadJSBlockHeader.fromString(raw.hex);
      const { height } = raw;
      console.debug(`Header received height ${height}`);

      const prevHash = Buffer.from(header.prevHash).reverse().toString("hex");

      if (
        height > this.latestBlock.height + 1 || // Reorg
        height < this.latestBlock.height || // Catchup
        (height === this.latestBlock.height &&
          header.hash !== this.latestBlock.hash) || // Latest hash incorrect
        (height === this.latestBlock.height + 1 &&
          prevHash !== this.latestBlock.hash) // Latest hash incorrect
      ) {
        this.pending.push(raw);
        if (!this.catchingUp) {
          this.catchup();
        }
      } else if (this.latestBlock.hash === header.hash) {
        console.debug("Header already in database");
      } else {
        this.processHeader(raw);
      }
    });
  }

  processHeader(raw: ElectrumHeaderResponse) {
    if (!network) {
      throw new Error("Network must be provided");
    }

    const { height, hex } = raw as ElectrumHeaderResponse;
    const anchor = network.value.anchor;
    console.debug(`Processing header height ${height}`);
    const buffer = Buffer.from(hex, "hex").buffer;
    const nextBits = nextBitsAserti32D(
      anchor.bits,
      this.latestBlock.timestamp - anchor.prevTime,
      this.latestBlock.height - anchor.height
    );

    const header = RadJSBlockHeader.fromString(hex);

    const target = bitsToTarget(nextBits);
    const hitTarget = BigInt(`0x${header.hash}`) <= target;
    const valid =
      Buffer.from(header.prevHash).reverse().toString("hex") ===
        this.latestBlock.hash &&
      header.validProofOfWork() &&
      hitTarget;

    if (!valid) {
      console.debug(`Invalid header received at height ${height}`);
      return;
    }

    db.header.put({
      hash: header.hash,
      height,
      reorg: false,
      buffer,
    });

    this.latestBlock = {
      hash: header.hash,
      height,
      timestamp: header.timestamp,
      bits: header.bits,
    };
  }

  async rollback() {
    // Set the last 10 headers to reorg
    // If we went too far, the database update will fix it when a matching key is found
    const { height } = this.latestBlock;
    console.debug(`Rolling back from ${height}`);

    await db.header
      .where("height")
      .aboveOrEqual(height - 9)
      .modify({ reorg: true });
    this.latestBlock = await this.getLatestBlock();
  }

  async getLatestBlock() {
    const dbBlock = await db.header
      .orderBy("height")
      .filter((block) => !block.reorg)
      .last();
    if (dbBlock) {
      const header = RadJSBlockHeader.fromString(
        Buffer.from(dbBlock.buffer).toString("hex")
      );
      return {
        hash: header.hash,
        height: dbBlock.height,
        timestamp: header.timestamp,
        bits: header.bits,
      };
    } else {
      return checkpoint;
    }
  }
}
