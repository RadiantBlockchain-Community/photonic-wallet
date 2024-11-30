import React, { useEffect, useRef, useState } from "react";
import { t } from "@lingui/macro";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Center,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
} from "@chakra-ui/react";
import { createKeys } from "@app/keys";
import RecoveryPhrase from "@app/components/RecoveryPhrase";
import Card from "@app/components/Card";
import { NetworkKey } from "@lib/types";
import LicenseModal from "@app/components/LicenseModal";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@app/db";
import { PromiseExtended } from "dexie";
import { wallet as walletSignal } from "@app/signals";
import config from "@app/config.json";

const networkKeys = Object.entries(config.networks)
  .filter(([, v]) => v.enabled)
  .map(([k]) => k);

export default function CreateWallet() {
  const password = useRef<HTMLInputElement>(null);
  const confirm = useRef<HTMLInputElement>(null);
  const network = useRef<HTMLSelectElement>(null);
  const [step, setStep] = useState(0);
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const licenseRead = useLiveQuery(
    async () => await (db.kvp.get("licenseRead") as PromiseExtended<boolean>),
    [],
    null
  );

  const [licenseOpen, setLicenseOpen] = useState<boolean | undefined>(false);

  const saveLicenseRead = () => {
    db.kvp.put(true, "licenseRead");
    setLicenseOpen(false);
  };

  useEffect(() => {
    if (licenseRead !== null && !licenseRead) {
      setLicenseOpen(true);
    }
  }, [licenseRead]);

  const createWallet = async (event: React.SyntheticEvent) => {
    event.preventDefault();

    const passwordValue = password.current?.value || "";
    const confirmValue = confirm.current?.value || "";
    if (confirmValue !== passwordValue) {
      setError(t`Passwords do not match`);
      return false;
    }

    if (!networkKeys.includes(network.current?.value || "")) {
      setError(t`Select a valid network`);
      return false;
    }

    setLoading(true);

    // setTimeout allows loading spinner to render without a delay
    setTimeout(async () => {
      setError("");
      try {
        const created = await createKeys(
          network.current?.value as NetworkKey,
          passwordValue
        );
        if (!created) {
          throw new Error("Failed to create wallet");
        }
        setPhrase(created.mnemonic);
        setStep(1);
        const { address, wif, net } = created;
        walletSignal.value = {
          ...walletSignal.value,
          locked: false,
          exists: true,
          net,
          wif,
          address,
        };
      } catch (error) {
        if (error instanceof Error) {
          console.log(error.message);
          setError(error.message);
        }
      }
      setLoading(false);
    }, 1);
    return false;
  };

  // Wait until license read query finishes before rendering
  if (licenseRead === null) {
    return null;
  }

  return (
    <>
      {licenseRead && (
        <Container
          display="flex"
          alignItems="center"
          mt="72px"
          py={2}
          height={{ lg: "calc(100vh - 72px)" }}
        >
          <Card mt={{ base: 4, lg: 0 }} mb={{ lg: 4 }} p={4} width="2xl">
            {step === 0 ? (
              <>
                <Heading size="md" mb={4}>
                  {t`Create a wallet`}
                </Heading>
                {error && (
                  <Alert status="error" mb={4}>
                    <AlertIcon />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <form onSubmit={createWallet}>
                  <FormControl mb={4}>
                    <FormLabel>{t`Password`}</FormLabel>
                    <Input
                      ref={password}
                      type="password"
                      placeholder={t`Password`}
                    />
                  </FormControl>
                  <FormControl mb={4}>
                    <FormLabel>{t`Confirm password`}</FormLabel>
                    <Input
                      ref={confirm}
                      type="password"
                      placeholder={t`Password`}
                    />
                  </FormControl>
                  <FormControl mb={4}>
                    <FormLabel>{t`Network`}</FormLabel>
                    <Select ref={network}>
                      {networkKeys.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    width="full"
                    type="submit"
                    isLoading={loading}
                    loadingText={t`Creating wallet`}
                  >
                    {t`Next`}
                  </Button>
                  <Center mt={4}>
                    <Button variant="ghost" as={Link} to="/recover">
                      {t`Recover my wallet`}
                    </Button>
                  </Center>
                </form>
              </>
            ) : (
              <>
                <Heading size="md" mb={4}>
                  {t`Wallet created`}
                </Heading>
                <Box mb={4}>
                  {t`Your wallet has been created. Please record your recovery phrase below.`}
                </Box>
                <RecoveryPhrase phrase={phrase} />
                <Button
                  display={{ base: "none", lg: "flex" }}
                  as={Link}
                  to="/objects"
                  width="full"
                >
                  {t`Confirm`}
                </Button>
                <Button
                  display={{ base: "flex", lg: "none" }}
                  as={Link}
                  to="/home"
                  width="full"
                >
                  {t`Confirm`}
                </Button>
              </>
            )}
          </Card>
        </Container>
      )}
      <LicenseModal
        isOpen={licenseOpen === true}
        onProceed={saveLicenseRead}
        onCancel={() => navigate("/exit")}
      />
    </>
  );
}
