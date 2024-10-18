import { PropsWithChildren } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Box, Button, ModalBody, ModalFooter } from "@chakra-ui/react";
import { t } from "@lingui/macro";

export default function AddressInput({
  onScan,
  onClose,
  open,
  children,
}: PropsWithChildren<{
  open: boolean;
  onScan: (value: string) => void;
  onClose: () => void;
}>) {
  return (
    <>
      {open && (
        <>
          <ModalBody>
            <Box w="100%" aspectRatio={1}>
              <Scanner onScan={(codes) => onScan(codes[0].rawValue)} />
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => onClose()}>{t`Close`}</Button>
          </ModalFooter>
        </>
      )}
      {children}
    </>
  );
}
