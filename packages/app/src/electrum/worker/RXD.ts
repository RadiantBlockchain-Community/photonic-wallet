import { p2pkhScript, p2pkhScriptHash } from "@lib/script";
import {
  Subscription,
  ContractType,
  ElectrumCallback,
  ElectrumStatusUpdate,
} from "@app/types";
import { buildUpdateTXOs } from "./updateTxos";
import db from "@app/db";
import ElectrumManager from "@app/electrum/ElectrumManager";
import setSubscriptionStatus from "./setSubscriptionStatus";
import { Worker } from "./electrumWorker";
import { consolidationCheck } from "./consolidationCheck";
import { updateRxdBalances } from "@app/utxos";

export class RXDWorker implements Subscription {
  protected worker: Worker;
  protected updateTXOs: ElectrumStatusUpdate;
  private electrum: ElectrumManager;
  protected lastReceivedStatus: string;
  protected ready = true;
  protected receivedStatuses: string[] = [];
  protected address = "";
  protected scriptHash = "";

  constructor(worker: Worker, electrum: ElectrumManager) {
    this.worker = worker;
    this.electrum = electrum;
    this.updateTXOs = buildUpdateTXOs(this.electrum, ContractType.RXD, () =>
      p2pkhScript(this.address)
    );
    this.lastReceivedStatus = "";
  }

  async syncPending() {
    if (this.ready && this.receivedStatuses.length > 0) {
      const lastStatus = this.receivedStatuses.pop();
      this.receivedStatuses = [];
      if (lastStatus) {
        await this.onSubscriptionReceived(this.scriptHash, lastStatus);
      }
    }
  }

  async manualSync() {
    if (this.ready) {
      this.receivedStatuses = [];
      await this.onSubscriptionReceived(this.scriptHash, "", true);
    }
  }

  async onSubscriptionReceived(
    scriptHash: string,
    status: string,
    manual = false
  ) {
    // Same subscription can be returned twice
    if (!manual && status === this.lastReceivedStatus) {
      return;
    }

    if (
      !this.ready ||
      (!manual &&
        (!this.worker.active || (await db.kvp.get("consolidationRequired"))))
    ) {
      this.receivedStatuses.push(status);
      return;
    }

    this.ready = false;
    this.lastReceivedStatus = status;

    const { added } = await this.updateTXOs(scriptHash, status, manual);

    added.map((txo) => db.txo.put(txo).catch());

    updateRxdBalances(this.address);

    setSubscriptionStatus(scriptHash, status, ContractType.RXD);
    this.ready = true;
    if (this.receivedStatuses.length > 0) {
      const lastStatus = this.receivedStatuses.pop();
      this.receivedStatuses = [];
      if (lastStatus) {
        this.onSubscriptionReceived(scriptHash, lastStatus);
      }
    }

    consolidationCheck();
  }

  async register(address: string) {
    this.scriptHash = p2pkhScriptHash(address as string);
    this.address = address;

    this.electrum.client?.subscribe(
      "blockchain.scripthash",
      this.onSubscriptionReceived.bind(this) as ElectrumCallback,
      this.scriptHash
    );
  }
}
