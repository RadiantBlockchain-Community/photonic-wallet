import { useEffect } from "react";
import { Outlet /*, ScrollRestoration*/ } from "react-router-dom";
import { batch } from "@preact/signals-react";
import { useLiveQuery } from "dexie-react-hooks";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import Unlock from "./components/Unlock";
import SendReceive from "./components/SendReceive";
import db from "./db";
import { SavedWallet } from "./types";
import { feeRate, network, wallet } from "./signals";
import config from "./config.json";
import useLanguageDetect from "./hooks/useLanguageDetect";
import ReloadPrompt from "./components/ReloadPrompt";
import { NetworkKey } from "@lib/types";
import { ViewPanelProvider } from "./layouts/ViewPanelLayout";
import Electrum from "./electrum/Electrum";
import WalletNotifier from "./components/WalletNotifier";
import { loadWalletFromSaved } from "./wallet";
import useActivityDetector from "./hooks/useActivityDetector";
import ConsolidationModal from "./components/ConsolidationModal";

function Main() {
  useActivityDetector();
  const { exists } = wallet.value;

  return (
    <I18nProvider i18n={i18n}>
      <Electrum />
      <WalletNotifier />
      {/* <ScrollRestoration /> Disabled for now, causing issues with some buttons  */}
      <ViewPanelProvider>
        <Outlet />
      </ViewPanelProvider>
      {exists && (
        <>
          <Unlock />
          <SendReceive />
          <ConsolidationModal />
        </>
      )}
      <ReloadPrompt />
    </I18nProvider>
  );
}

export default function App() {
  const saved = useLiveQuery(
    async () =>
      (await db.kvp.bulkGet(["wallet", "feeRate"])) as [SavedWallet, number],
    [],
    null
  );

  useLanguageDetect();

  useEffect(() => {
    if (saved !== null) {
      const [savedWallet, savedFeeRate] = saved;
      const net = savedWallet?.net || "testnet";
      batch(() => {
        loadWalletFromSaved(savedWallet);
        network.value = config.networks[net as NetworkKey];
        feeRate.value = savedFeeRate;
      });
    }
  }, [saved]);

  if (saved === null) {
    return <></>;
  }

  return <Main />;
}
