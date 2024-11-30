import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  Center,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Textarea,
  useBreakpointValue,
} from "@chakra-ui/react";
import { t } from "@lingui/macro";
import { recoverKeys } from "@app/keys";
import Card from "@app/components/Card";
import { NetworkKey } from "@lib/types";
import config from "@app/config.json";
import { initWallet } from "@app/wallet";

const networkKeys = Object.entries(config.networks)
  .filter(([, v]) => v.enabled)
  .map(([k]) => k);

export default function RecoverWallet() {
  const phrase = useRef<HTMLTextAreaElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirm = useRef<HTMLInputElement>(null);
  const network = useRef<HTMLSelectElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const isMobile = useBreakpointValue({ base: true, lg: false });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
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
        const result = await recoverKeys(
          network.current?.value as NetworkKey,
          phrase.current?.value || "",
          passwordValue
        );
        if (!result) {
          return;
        }
        const { address, wif, net } = result;
        initWallet({ net, wif, address });
        navigate(isMobile ? "/home" : "/objects");
      } catch (error) {
        console.log(error);
        if (error instanceof Error) {
          if (error.message === "Invalid mnemonic") {
            setError(t`Invalid recovery phrase`);
          } else {
            setError(error.message);
          }
        } else {
          setError(t`Unknown error`);
        }
      }
      setLoading(false);
    }, 1);
    return false;
  };

  return (
    <Container
      display="flex"
      alignItems="center"
      mt="72px"
      py={2}
      height={{ lg: "calc(100vh - 72px)" }}
    >
      <Card mb={4} p={4} width="2xl">
        <Heading size="md" mb={4}>
          {t`Recover your wallet`}
        </Heading>
        {error && (
          <Alert status="error" mb={4}>
            <AlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={submit}>
          <FormControl mb={4}>
            <FormLabel>{t`Enter your 12 word recovery phrase`}</FormLabel>
            <Textarea
              ref={phrase}
              placeholder={t`Recovery phrase`}
              size="sm"
              resize="none"
              autoFocus
            />
          </FormControl>
          <FormControl mb={4}>
            <FormLabel>{t`New password`}</FormLabel>
            <Input ref={password} type="password" placeholder="Password" />
          </FormControl>
          <FormControl mb={4}>
            <FormLabel>{t`Confirm password`}</FormLabel>
            <Input ref={confirm} type="password" placeholder="Password" />
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
            loadingText={t`Recovering`}
          >
            {t`Submit`}
          </Button>
          <Center mt={4}>
            <Button
              variant="ghost"
              as={Link}
              to="/create-wallet"
            >{t`Create a new wallet`}</Button>
          </Center>
        </form>
      </Card>
    </Container>
  );
}
