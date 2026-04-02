import { Box, Image as CUIImage, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { filesize } from "filesize";

const size = 64;
const quality = 0.2;
const mimeType = "image/webp";

function buildUint8Array(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });

  return result;
}

function uint8ArrayToDataURL(uint8Array: Uint8Array): string {
  const blob = new Blob([uint8Array as BlobPart], { type: mimeType });
  const dataURL = URL.createObjectURL(blob);
  return dataURL;
}

function minWebp(webpData: Uint8Array): Uint8Array {
  const dataView = new DataView(webpData.buffer);
  let offset = 12;
  const chunks: Uint8Array[] = [new Uint8Array()];
  let skippedBytes = 0;

  while (offset < dataView.byteLength) {
    const fourCC = String.fromCharCode(
      dataView.getUint8(offset),
      dataView.getUint8(offset + 1),
      dataView.getUint8(offset + 2),
      dataView.getUint8(offset + 3)
    );
    const chunkSize = dataView.getUint32(offset + 4, true) + 8;

    // Skip these chunks
    if (["ICCP", "EXIF", "XMP"].includes(fourCC)) {
      skippedBytes += chunkSize;
    } else {
      const chunk = webpData.subarray(offset, offset + chunkSize);

      if (fourCC === "VP8X") {
        // Set ICCP flag to zero
        const byte = chunk[8] & 223;
        chunk[8] = byte;
      }

      chunks.push(chunk);
    }

    offset += chunkSize;
  }

  // Adjust file size in header
  const fileSize = dataView.getUint32(4, true);
  dataView.setInt32(4, fileSize - skippedBytes, true);
  chunks[0] = webpData.subarray(0, 12);

  return buildUint8Array(chunks);
}

async function canvasToWebP(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Uint8Array> {
  const dataURL = canvas.toDataURL(mimeType, quality);
  const base64Data = dataURL.split(",")[1];
  const decodedData = atob(base64Data);
  const uint8Array = new Uint8Array(decodedData.length);

  for (let i = 0; i < decodedData.length; ++i) {
    uint8Array[i] = decodedData.charCodeAt(i);
  }

  return uint8Array;
}

export default function HashStamp({
  img,
  onRender,
}: {
  img: ArrayBuffer;
  onRender?: (data: Uint8Array | undefined) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const temp = useRef<HTMLCanvasElement>(null);
  const [dataURL, setDataURL] = useState<string>("");
  const [data, setData] = useState<Uint8Array>();

  useEffect(() => {
    const image = new Image();
    const blob = new Blob([img], {
      type: "image/jpeg",
    });
    image.src = URL.createObjectURL(blob);
    image.onload = function () {
      const { naturalWidth, naturalHeight } = image;
      const landscape = naturalWidth > naturalHeight;
      const width = landscape
        ? size
        : Math.floor(naturalWidth / (naturalHeight / size));
      const height = landscape
        ? Math.floor(naturalHeight / (naturalWidth / size))
        : size;

      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { colorSpace: "srgb", alpha: false });
      if (!ctx) return;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const toWebp = async () => {
        const webp = await canvasToWebP(canvas, quality);
        const url = uint8ArrayToDataURL(webp);
        const min = minWebp(webp);
        setDataURL(url);
        setData(min);
        onRender && onRender(min);
      };

      toWebp();
    };
  }, [img]);

  return (
    <>
      <Box as="canvas" ref={ref} display="none" />
      <Box as="canvas" ref={temp} display="none" />
      {dataURL && data && (
        <>
          <CUIImage
            src={dataURL}
            sx={{
              imageRendering: "pixelated",
              objectFit: "contain",
            }}
          />
          <Box>
            <div>hs.webp</div>
            <Text color="gray.400">image/webp</Text>
            <Text color="gray.400">
              {filesize(data.byteLength || 0) as string}
            </Text>
          </Box>
        </>
      )}
    </>
  );
}
