import { useState } from "react";
import db from "@app/db";
import { PrivateKey } from "@radiantblockchain/radiantjs";
import { ContractType } from "@app/types";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ModalCloseButton,
  useDisclosure,
  Box,
  useToast,
} from "@chakra-ui/react";
import { t } from "@lingui/macro";
import { useLiveQuery } from "dexie-react-hooks";
import ContractName from "./ContractName";
import { p2pkhScript, p2pkhScriptSigSize, txSize } from "@lib/script";
import { feeRate, openModal, wallet } from "@app/signals";
import { buildTx } from "@lib/tx";
import { UnfinalizedInput, Utxo } from "@lib/types";
import { electrumWorker } from "@app/electrum/Electrum";
import { fundTx } from "@lib/coinSelect";

const unlock = (fn: () => void) => {
  if (wallet.value.locked) {
    openModal.value = {
      modal: "unlock",
      onClose: (success) => success && fn(),
    };
  } else {
    fn();
  }
};

async function consolidate() {
  // Consolidate RXD UTXOs first
  const rxd: UnfinalizedInput[] = await db.txo
    .where({ contractType: ContractType.RXD, spent: 0 })
    .toArray();

  // Use the consolidated UTXO for funding FT transactions
  const { consolidated } = await consolidateUtxos(rxd, [], false);

  if (!consolidated) {
    console.debug("No funding");
    throw new Error("No funding");
  }

  let funding: Utxo[] = [consolidated];

  const allFts = await db.txo
    .where({ contractType: ContractType.FT, spent: 0 })
    .toArray();

  // Group by token
  const fts: { [key: string]: Utxo[] } = {};
  allFts.map((ft) => {
    if (!fts[ft.script]) {
      fts[ft.script] = [];
    }
    fts[ft.script].push(ft);
  });

  for (const utxos of Object.values(fts)) {
    const result = await consolidateUtxos(utxos, funding, true);
    funding = result.funding;
  }

  db.kvp.put(false, "consolidationRequired");
}

async function consolidateUtxos(
  utxos: Utxo[],
  funding: UnfinalizedInput[],
  requiresFunding: boolean
) {
  if (!utxos.length) {
    return { funding, consolidated: undefined };
  }

  if (utxos.length === 1) {
    return { funding, consolidated: utxos[0] };
  }

  const maxInputs = 50;
  const totalUtxos = utxos.length;
  let consolidated: Utxo | undefined = undefined;

  // Output script will be the same
  const script = utxos[0].script;
  const scriptSize = script.length / 2;
  const p2pkh = p2pkhScript(wallet.value.address);

  for (let i = 0; i < totalUtxos; i += maxInputs) {
    const inputs: Utxo[] = utxos.slice(i, i + maxInputs);

    if (consolidated) {
      inputs.push(consolidated);
    }

    const total = inputs.reduce((sum, cur) => sum + cur.value, 0);

    const privKey = PrivateKey.fromString(wallet.value.wif as string);
    const outputs = [];

    let fund;

    if (requiresFunding) {
      outputs.push({ script, value: total });

      // Need funding input for FTs
      fund = fundTx(
        wallet.value.address,
        funding,
        inputs,
        outputs,
        p2pkh,
        feeRate.value
      );
      if (!fund.funded) {
        console.log("Failed to fund");
        throw new Error("Failed to fund");
      }
      inputs.push(...fund.funding);
      outputs.push(...fund.change);
    } else {
      const size = txSize(new Array(inputs.length).fill(p2pkhScriptSigSize), [
        scriptSize,
      ]);
      const fee = size * feeRate.value;
      outputs.push({ script, value: total - fee });
    }

    const tx = buildTx(
      wallet.value.address,
      privKey.toString(),
      inputs,
      outputs,
      false
    );

    if (requiresFunding) {
      funding = fund?.remaining || [];
      if (fund?.change.length) {
        funding.push(
          ...fund.change.map((change, index) => ({
            txid: tx.id,
            vout: index + 1,
            ...change,
          }))
        );
      }
    }

    const rawTx = tx.toString();
    const txid = await electrumWorker.value.broadcast(rawTx);
    db.broadcast.put({
      txid,
      date: Date.now(),
      description: "consolidate",
    });
    consolidated = { ...outputs[0], vout: 0, txid };
  }
  return { funding, consolidated };
}

const OutputCounts = () => {
  const subs = useLiveQuery(async () => {
    return (await Promise.all(
      (
        await db.subscriptionStatus.toArray()
      ).map(async (sub) => {
        const count = await db.txo
          .where({ contractType: sub.contractType, spent: 0 })
          .count();

        return [sub.contractType, count];
      })
    )) as [ContractType, number][];
  });
  return subs?.map(
    ([contractType, count]) =>
      contractType !== ContractType.NFT && (
        <div key={contractType}>
          <ContractName contractType={contractType} />: {count}{" "}
          {count === 1 ? "UTXO" : "UTXOs"}
        </div>
      )
  );
};

export default function ConsolidationModal() {
  const toast = useToast();
  const disclosure = useDisclosure();
  const [waiting, setWaiting] = useState(false);

  useLiveQuery(async () => {
    const consolidationRequired = await db.kvp.get("consolidationRequired");
    if (consolidationRequired && !disclosure.isOpen) {
      disclosure.onOpen();
    }
  });

  const onClick = () => {
    setWaiting(true);
    unlock(async () => {
      try {
        await consolidate();
        setWaiting(false);
        disclosure.onClose();
        toast({
          title: t`UTXO consolidation complete`,
          status: "success",
        });
      } catch (error) {
        setWaiting(false);
        if (error instanceof Error) {
          toast({
            title: error.message,
            status: "error",
          });
        } else {
          toast({
            title: "Could not consolidate UTXOs",
            status: "error",
          });
        }
      }
    });
  };

  return (
    <Modal
      isOpen={disclosure.isOpen}
      onClose={disclosure.onClose}
      closeOnOverlayClick={false}
      isCentered
      size="lg"
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t`Consolidation required`}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          Your wallet contains many unspent outputs that will cause long sync
          times. Output consolidation is required.
          <Box mt={2}>{disclosure.isOpen && <OutputCounts />}</Box>
        </ModalBody>

        <ModalFooter>
          <Button isLoading={waiting} onClick={onClick}>
            {waiting ? t`Consolidating UTXOs` : t`Start consolidation process`}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
