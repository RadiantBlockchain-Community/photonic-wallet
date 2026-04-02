import { Button, ButtonProps } from "@chakra-ui/react";
import { t } from "@lingui/macro";

export default function DownloadLink({
  children,
  data,
  filename,
  mimeType,
  ...rest
}: {
  data: ArrayBuffer | Uint8Array;
  filename: string;
  mimeType: string;
} & ButtonProps) {
  const downloadUint8ArrayAsFile = () => {
    const blob = new Blob([data as BlobPart], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.style.display = "none";
    a.href = blobUrl;
    a.download = filename;

    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <Button onClick={downloadUint8ArrayAsFile} {...rest}>
      {children || t`Download`}
    </Button>
  );
}
