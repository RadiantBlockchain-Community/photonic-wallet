import { useRef, useState } from "react";
import { t } from "@lingui/macro";
import {
  Button,
  Center,
  Container,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Select,
  Text,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import PasswordModal from "@app/components/PasswordModal";
import RecoveryPhrase from "@app/components/RecoveryPhrase";
import { feeRate, language, wallet } from "@app/signals";
import FormSection from "@app/components/FormSection";
import db from "@app/db";
import { loadCatalog } from "@app/i18n";
import config from "@app/config.json";
import { useLiveQuery } from "dexie-react-hooks";
import { PromiseExtended } from "dexie";
import { electrumWorker } from "@app/electrum/Electrum";

export default function WalletSettings() {
  const disclosure = useDisclosure();
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const passwordSuccess = (walletMnemonic: string) => {
    setMnemonic(walletMnemonic as string);
    setShowMnemonic(true);
    disclosure.onClose();
  };
  const languageRef = useRef<HTMLSelectElement>(null);
  const feeRateRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const keys = ["language", "feeRate"];
  const save = async () => {
    const newLanguage = languageRef.current?.value;
    const changeLang = language.value !== newLanguage;
    const feeRateNum = parseInt(feeRateRef.current?.value || "", 10);

    db.kvp.bulkPut([languageRef.current?.value, feeRateNum], keys);
    toast({
      title: t`Saved`,
      status: "success",
    });

    // Update fee rate signal
    feeRate.value = feeRateNum;

    if (changeLang && newLanguage) {
      // Change language
      await loadCatalog(newLanguage);
      // Trigger rerender on the currently rendered components
      language.value = newLanguage;
    }
  };
  const response = useLiveQuery(
    async () => await (db.kvp.bulkGet(keys) as PromiseExtended<string[]>),
    [],
    null
  );

  const consolidationRequired = useLiveQuery(() =>
    db.kvp.get("consolidationRequired")
  );

  if (response === null) return null;

  const [savedLanguage, savedFeeRate] = response;

  return (
    <Container maxW="container.md" px={4} display="grid" gap={8}>
      <FormSection>
        <Heading size="md">{t`Address`}</Heading>
        <Text pt="2" fontSize="sm">
          Main: {wallet.value.address}
        </Text>
        <Text pt="2" fontSize="sm">
          Swap: {wallet.value.swapAddress}
        </Text>
      </FormSection>

      <FormSection>
        <Heading size="md" mb={8}>
          {t`Recovery phrase`}
        </Heading>
        {showMnemonic ? (
          <RecoveryPhrase phrase={mnemonic} />
        ) : (
          <Center mt={8} mb={16}>
            <Button onClick={() => disclosure.onOpen()}>
              {t`Show recovery phrase`}
            </Button>
          </Center>
        )}
        <PasswordModal
          header={t`Enter password`}
          allowClose
          onSuccess={passwordSuccess}
          isOpen={disclosure.isOpen}
          onClose={disclosure.onClose}
        />
      </FormSection>

      <FormSection>
        <Heading size="md">{t`Manual Sync`}</Heading>
        {consolidationRequired === true &&
          t`If your wallet fails to consolidate UTXOs, a resync may be required`}
        <Center mt={8} mb={16}>
          <Button onClick={() => electrumWorker.value.manualSync()}>
            {t`Resync Wallet`}
          </Button>
        </Center>
      </FormSection>

      <FormSection>
        <FormControl>
          <FormLabel>{t`Language`}</FormLabel>
          <Select ref={languageRef} defaultValue={savedLanguage || ""}>
            {Object.entries(config.i18n.languages).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel>{t`Fee Rate`}</FormLabel>
          <Input
            ref={feeRateRef}
            placeholder="5000"
            name="gateway"
            defaultValue={savedFeeRate}
          />
          <FormHelperText>Photons per byte</FormHelperText>
        </FormControl>
      </FormSection>
      <Flex justifyContent="center" py={8} mb={16}>
        <Button size="lg" w="240px" maxW="100%" shadow="dark-md" onClick={save}>
          {t`Save`}
        </Button>
      </Flex>
    </Container>
  );
}
