import { electrumWorker } from "@app/electrum/Electrum";
import { wallet } from "@app/signals";
import { lockWallet } from "@app/wallet";
import { useToast } from "@chakra-ui/react";
import { t } from "@lingui/macro";
import { useEffect, useRef } from "react";

type Timeout = ReturnType<typeof setTimeout>;
const LOCK_INACTIVITY_TIME = 600000; // 10 minutes

async function reactivate() {
  if (!(await electrumWorker.value.isActive())) {
    console.debug("Reactivating sync");
    electrumWorker.value.setActive(true);
    electrumWorker.value.syncPending();
  }
}

function deactivate() {
  electrumWorker.value.setActive(false);
  console.debug("Deactivating sync");
}

export default function useActivityDetector() {
  const toast = useToast();
  const timer = useRef<Timeout>();

  const onMouseMove = () => {
    clearTimeout(timer.current);
    reactivate();
    if (wallet.value.exists) {
      timer.current = setTimeout(() => {
        lockWallet();
        toast({
          title: t`Wallet locked`,
          status: "success",
        });
        deactivate();
      }, LOCK_INACTIVITY_TIME);
    }
  };

  const onVisibilityChange = () => {
    // Don't sync while inactive to reduce server load
    if (document.visibilityState === "visible") {
      // Tab is active, allow syncing and sync any pending subscriptions
      reactivate();
    } else {
      // Tab is inactive, disallow syncing
      deactivate();
    }
  };

  const onFocus = () => {
    reactivate();
  };

  const onBlur = () => {
    deactivate();
  };

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", onMouseMove);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
