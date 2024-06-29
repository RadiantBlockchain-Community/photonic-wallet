import { p2pkhScriptHash } from "@lib/script";
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

export class RXDWorker implements Subscription {
  protected updateTXOs: ElectrumStatusUpdate;
  private electrum: ElectrumManager;
  protected lastReceivedStatus: string;
  protected ready = true;
  protected receivedStatuses: string[] = [];
  protected address = "";

  constructor(electrum: ElectrumManager) {
    this.electrum = electrum;
    this.updateTXOs = buildUpdateTXOs(this.electrum, ContractType.RXD);
    this.lastReceivedStatus = "";
  }

  async onSubscriptionReceived(scriptHash: string, status: string) {
    // Same subscription can be returned twice
    if (status === this.lastReceivedStatus) {
      return;
    }
    if (!this.ready) {
      this.receivedStatuses.push(status);
      return;
    }

    this.ready = false;
    this.lastReceivedStatus = status;

    const { added } = await this.updateTXOs(scriptHash, status);

    added.map((txo) => db.txo.put(txo).catch());

    // Update balances
    let confirmed = 0;
    let unconfirmed = 0;
    await db.txo
      .where({ contractType: ContractType.RXD, spent: 0 })
      .each(({ height, value }) => {
        if (height === Infinity) {
          unconfirmed += value;
        } else {
          confirmed += value;
        }
      });

    setSubscriptionStatus(scriptHash, status, ContractType.RXD);
    db.balance.put({ id: this.address, confirmed, unconfirmed });
    this.ready = true;
    if (this.receivedStatuses.length > 0) {
      const lastStatus = this.receivedStatuses.pop();
      this.receivedStatuses = [];
      if (lastStatus) {
        this.onSubscriptionReceived(scriptHash, lastStatus);
      }
    }
  }

  async register(address: string) {
    const scriptHash = p2pkhScriptHash(address as string);
    this.address = address;

    this.electrum.client?.subscribe(
      "blockchain.scripthash",
      this.onSubscriptionReceived.bind(this) as ElectrumCallback,
      scriptHash
    );
  }
}
