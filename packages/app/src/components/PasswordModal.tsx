import { useEffect, useRef, useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  FormControl,
  FormLabel,
  Input,
  ModalCloseButton,
  Alert,
  AlertDescription,
  AlertIcon,
  ModalProps,
} from "@chakra-ui/react";
import { t } from "@lingui/macro";
import { decryptKeys } from "@app/keys";
import { wallet } from "@app/signals";
import db from "@app/db";

interface Props {
  header: string;
  allowClose?: boolean;
  onSuccess?: (mnemonic: string, wif: string, swapWif: string) => void;
}

export default function PasswordModal({
  header,
  allowClose = false,
  onSuccess,
  isOpen,
  onClose = () => undefined,
  ...rest
}: Props & Partial<ModalProps>) {
  const password = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(true);

  useEffect(() => {
    setSuccess(true);
    setLoading(false);
  }, [isOpen]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(true);
    setLoading(true);

    requestAnimationFrame(async () => {
      const pwd: string = password.current?.value || "";
      try {
        const { mnemonic, wif, swapWif, swapAddress } = await decryptKeys(
          wallet.value.net,
          pwd
        );

        // For old wallets, put swapAddress into database and signal
        if (!wallet.value.swapAddress) {
          db.kvp.update("wallet", { swapAddress });
          wallet.value.swapAddress = swapAddress;
        }

        onSuccess && onSuccess(mnemonic, wif, swapWif);
      } catch (error) {
        setSuccess(false);
        setLoading(false);
      }
    });
  };

  if (!isOpen) return null;

  return (
    <Modal
      closeOnOverlayClick={allowClose}
      isOpen={isOpen}
      onClose={onClose}
      initialFocusRef={password}
      isCentered
      {...rest}
    >
      <form onSubmit={submit}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{header}</ModalHeader>
          {allowClose && <ModalCloseButton />}
          <ModalBody pb={6}>
            {success || (
              <Alert status="error" mb={4}>
                <AlertIcon />
                <AlertDescription>{t`Incorrect password`}</AlertDescription>
              </Alert>
            )}
            <FormControl>
              <FormLabel>{t`Password`}</FormLabel>
              <Input ref={password} type="password" placeholder={t`Password`} />
            </FormControl>
          </ModalBody>

          <ModalFooter>
            <Button type="submit" isLoading={loading}>
              {t`Unlock`}
            </Button>
          </ModalFooter>
        </ModalContent>
      </form>
    </Modal>
  );
}
