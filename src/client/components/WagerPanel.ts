import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getServerConfigFromClient } from "../../core/configuration/ConfigLoader";
import { LobbyConfig } from "../ClientGameRunner";
import { createConfig, http, reconnect, getAccount, connect, disconnect } from "@wagmi/core";
import { injected } from "@wagmi/connectors";
import { defineChain, Chain, custom } from "viem";

@customElement("wager-panel")
export class WagerPanel extends LitElement {
  @property({ type: Object }) lobby!: LobbyConfig;
  @state() private connected = false;
  @state() private address: string | null = null;
  @state() private error: string | null = null;
  @state() private buyInWei: string | null = null;
  @state() private contract: string | null = null;
  @state() private loading = false;

  private wagmiConfigInitialized = false;

  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.initializeWagmi();
    const wager = await this.fetchWager();
    this.buyInWei = (wager?.buyInWei as string) ?? null;
    this.contract = (wager?.contractAddress as string) ?? null;
  }

  private async initializeWagmi() {
    if (this.wagmiConfigInitialized) return;
    // Detect chainId from injected provider if available, else default to 1
    const injectedProvider = (window as any).ethereum;
    const detectedChainIdHex = injectedProvider?.chainId as string | undefined;
    const chainId = detectedChainIdHex ? parseInt(detectedChainIdHex, 16) : 1;
    const chain: Chain = defineChain({
      id: chainId,
      name: "Ethereum",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["/"] } },
    });

    const config = createConfig({
      chains: [chain],
      transports: {
        [chain.id]: injectedProvider ? (custom(injectedProvider) as any) : http(),
      },
      connectors: [injected()],
    });
    (window as any).__wagmi = config;
    await reconnect(config);
    const account = getAccount(config);
    this.connected = account.isConnected;
    this.address = account.address ?? null;
    this.wagmiConfigInitialized = true;
  }

  private async fetchWager(): Promise<
    | {
      enabled: boolean;
      buyInWei?: string;
      contractAddress?: string;
    }
    | undefined
  > {
    try {
      const cfg = await getServerConfigFromClient();
      const resp = await fetch(`/${cfg.workerPath(this.lobby.gameID)}/api/wager/${this.lobby.gameID}`);
      if (!resp.ok) return undefined;
      const json = (await resp.json()) as any;
      return json.wager as
        | { enabled: boolean; buyInWei?: string; contractAddress?: string }
        | undefined;
    } catch {
      return undefined;
    }
  }

  private async onConnect() {
    const config = (window as any).__wagmi;
    try {
      this.error = null;
      await connect(config, { connector: injected() });
      const account = getAccount(config);
      this.connected = account.isConnected;
      this.address = account.address ?? null;
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  private async onDisconnect() {
    const config = (window as any).__wagmi;
    await disconnect(config);
    const account = getAccount(config);
    this.connected = account.isConnected;
    this.address = account.address ?? null;
  }

  private async onPayIn() {
    if (!this.buyInWei || !this.contract) return;
    const config = (window as any).__wagmi;
    this.loading = true;
    try {
      const { writeContract, waitForTransactionReceipt } = await import("@wagmi/core");
      const abi = [
        {
          type: "function",
          name: "joinWager",
          stateMutability: "payable",
          inputs: [{ name: "_gameId", type: "string" }],
          outputs: [],
        },
      ] as const;
      const hash = await writeContract(config, {
        address: this.contract as `0x${string}`,
        abi,
        functionName: "joinWager",
        args: [this.lobby.gameID],
        value: BigInt(this.buyInWei),
      });
      await waitForTransactionReceipt(config, { hash });
      this.error = null;
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (!this.buyInWei || !this.contract) return html``;
    const eth = (BigInt(this.buyInWei) / 10n ** 18n).toString();
    return html`
      <div class="wager-panel">
        <div class="text-sm">Buy-in: ${eth} ETH</div>
        ${this.connected
          ? html`<div class="text-xs">${this.address}</div>
              <button class="btn" ?disabled=${this.loading} @click=${this.onPayIn.bind(this)}>
                ${this.loading ? "Paying..." : "Pay Buy-in"}
              </button>
              <button class="btn-secondary" @click=${this.onDisconnect.bind(this)}>Disconnect</button>`
          : html`<button class="btn" @click=${this.onConnect.bind(this)}>Connect Wallet</button>`}
        ${this.error ? html`<div class="text-red-600 text-xs mt-2">${this.error}</div>` : ""}
      </div>
    `;
  }
}


