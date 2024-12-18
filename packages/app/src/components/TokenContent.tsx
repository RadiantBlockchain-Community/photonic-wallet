import { Box, Icon, Image } from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { SmartToken } from "@app/types";
import { TbLink } from "react-icons/tb";
import { FaCircleXmark } from "react-icons/fa6";
import {
  BsFileEarmarkFill,
  BsFillFileTextFill,
  BsFillFileImageFill,
  BsFillFileXFill,
} from "react-icons/bs";
import Identifier from "./Identifier";
import useIpfsUrl from "@app/hooks/useIpfsUrl";
import UnsafeImage from "./UnsafeImage";
import { IconBaseProps, IconType } from "react-icons/lib";

export default function TokenContent({
  glyph,
  thumbnail = false,
  defaultIcon = BsFillFileXFill,
}: {
  glyph?: SmartToken;
  thumbnail?: boolean;
  defaultIcon?: ((props: IconBaseProps) => JSX.Element) | IconType;
}) {
  const { embed, remote } = glyph || {};
  const maxLen = 1000;

  // Image URL
  if (remote && remote.t?.startsWith("image/")) {
    const isIpfs = remote.u?.match(/^ipfs:\/\//);
    const url = isIpfs ? useIpfsUrl(remote.u) : remote.u;
    if (isIpfs) {
      return (
        <Image
          src={url}
          width="100%"
          height="100%"
          objectFit="contain"
          //sx={{ imageRendering: "pixelated" }}
          backgroundColor="black"
        />
      );
    } else {
      if (thumbnail) {
        return (
          <Icon
            as={BsFillFileImageFill}
            width="100%"
            height="100%"
            color="gray.500"
          />
        );
      } else {
        return <UnsafeImage src={url} />;
      }
    }
  }

  // Non-image URL
  if (remote) {
    if (thumbnail) {
      return <Icon as={TbLink} width="100%" height="100%" color="gray.500" />;
    }
    return (
      <>
        {thumbnail || (
          <Box borderRadius="md" overflow="hidden" mb={4}>
            <QRCodeSVG size={256} value={remote.u} includeMargin />
          </Box>
        )}
        <div>
          <Identifier copyValue={remote.u} showCopy>
            {remote.u.substring(0, 200)}
            {remote.u.length > 200 && "..."}
          </Identifier>
        </div>
      </>
    );
  }

  if (embed) {
    // Text file
    if (embed.t?.startsWith("text/plain")) {
      if (thumbnail) {
        return (
          <Icon
            as={BsFillFileTextFill}
            width="100%"
            height="100%"
            color="gray.500"
          />
        );
      }

      const text = new TextDecoder("utf-8").decode(embed.b);
      return (
        <Box as="pre" whiteSpace="pre-wrap">
          {text.substring(0, maxLen)}
          {text.length > maxLen && "..."}
        </Box>
      );
    }

    // Image file
    if (embed.t?.startsWith("image/")) {
      const blob = new Blob([embed.b], { type: embed.t });
      const imgUrl = URL.createObjectURL(blob);
      return (
        <Image
          src={imgUrl}
          width="100%"
          height="100%"
          objectFit="contain"
          //sx={{ imageRendering: "pixelated" }} // TODO find a way to apply this to pixel art
          //backgroundColor="white"
        />
      );
    }

    // Unknown file
    if (thumbnail) {
      return (
        <Icon
          as={BsFileEarmarkFill}
          width="100%"
          height="100%"
          color="gray.500"
        />
      );
    }

    return (
      <Icon
        as={BsFileEarmarkFill}
        width="100%"
        height="100%"
        maxWidth="200px"
        color="gray.500"
        mb={2}
      />
    );
  }

  if (thumbnail) {
    return (
      <Icon as={defaultIcon} width="100%" height="100%" color="gray.500" />
    );
  }

  return (
    <>
      <Icon as={FaCircleXmark} boxSize={8} color="gray.500" />
      <Box fontSize="md" userSelect="none" mt={2}>
        No content
      </Box>
    </>
  );
}
