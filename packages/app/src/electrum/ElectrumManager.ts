import { ElectrumWS } from "ws-electrumx-client";

// ElectrumWS doesn't support changing endpoint so this class is used to reconnect and resubscribe
// TODO Refactor so ws-electrumx-client can be removed and not need the manager class
export default class ElectrumManager {
  public endpoint?: string;
  public client?: ElectrumWS;
  public generation = 0;

  public connected(): boolean {
    return !!this.client && this.client.isConnected();
  }

  public events: [string, (...args: unknown[]) => void][] = [];

  public addEvent(eventName: string, callback: (...args: unknown[]) => void) {
    this.events.push([eventName, callback]);
  }

  public changeEndpoint(endpoint: string): boolean {
    console.debug("[ElectrumManager] changeEndpoint called:", endpoint);
    this.generation++;
    if (this.client) {
      console.debug("[ElectrumManager] Closing existing connection");
      this.client.close("switching");
    }
    this.endpoint = endpoint;
    try {
      console.debug("[ElectrumManager] Creating new ElectrumWS client");
      this.client = new ElectrumWS(endpoint);
      console.debug("[ElectrumManager] ElectrumWS client created successfully");
    } catch (error) {
      console.error("[ElectrumManager] Failed to create ElectrumWS client:", error);
      return false;
    }

    this.events.forEach(([eventName, callback]) => {
      console.debug("[ElectrumManager] Registering event:", eventName);
      this.client?.on(eventName, callback);
    });

    return true;
  }

  public reconnect() {
    if (this.endpoint) {
      return this.changeEndpoint(this.endpoint);
    }
    return false;
  }

  public disconnect(reason = "") {
    if (this.client) {
      this.client.close(reason);
    }
  }
}
