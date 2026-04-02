import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ModalCloseButton,
  Text,
  ModalProps,
  Link,
} from "@chakra-ui/react";
import { t } from "@lingui/macro";
import Identifier from "./Identifier";
import { Link as RouterLink } from "react-router-dom";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import createExplorerUrl from "@app/network/createExplorerUrl";

export default function TxSuccessModal({
  isOpen,
  onClose,
  txid,
}: Pick<ModalProps, "isOpen" | "onClose"> & {
  txid: string;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick={false}
      isCentered
      size="lg"
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t`Transaction successful`}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text mb={2}>{t`Transaction ID:`}</Text>
          <div>
            <Identifier showCopy>{txid || t`Unknown`}</Identifier>
          </div>
          <Link
            as={RouterLink}
            to={createExplorerUrl(txid)}
            target="_blank"
            isExternal
            my={4}
          >
            {t`View on block explorer`}
            <ExternalLinkIcon mx="2px" />
          </Link>
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose}>{t`Close`}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
