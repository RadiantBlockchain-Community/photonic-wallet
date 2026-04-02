import React from "react";
import { HStack, Badge, Tooltip, Icon } from "@chakra-ui/react";
import { Trans } from "@lingui/macro";
import {
  MdLock,
  MdVerified,
  MdLocalFireDepartment,
  MdSecurity,
  MdTimer,
  MdFolder,
} from "react-icons/md";
import { GlyphV2Metadata } from "@lib/v2metadata";
import { isSoulbound } from "@lib/soulbound";
import { isContainer } from "@lib/container";
import { isAuthority } from "@lib/authority";
import { isWaveName } from "@lib/wavenaming";
import { GLYPH_ENCRYPTED, GLYPH_TIMELOCK } from "@lib/protocols";

type V2MetadataBadgesProps = {
  metadata: GlyphV2Metadata;
};

export default function V2MetadataBadges({ metadata }: V2MetadataBadgesProps) {
  const showRoyalty = metadata.royalty && metadata.royalty.bps > 0;
  const showSoulbound = isSoulbound(metadata.policy);
  const showEncrypted = metadata.p.includes(GLYPH_ENCRYPTED);
  const showTimelocked = metadata.p.includes(GLYPH_TIMELOCK);
  const showContainer = isContainer(metadata);
  const showAuthority = isAuthority(metadata);
  const showWave = isWaveName(metadata);
  const showCreatorSig = typeof metadata.creator === "object" && metadata.creator.sig;

  return (
    <HStack spacing={2} flexWrap="wrap">
      {showRoyalty && (
        <Tooltip
          label={
            <Trans>
              {metadata.royalty!.enforced ? "Enforced" : "Advisory"} Royalty:{" "}
              {metadata.royalty!.bps / 100}%
            </Trans>
          }
        >
          <Badge
            colorScheme={metadata.royalty!.enforced ? "purple" : "gray"}
            display="flex"
            alignItems="center"
            gap={1}
          >
            <Icon as={MdLocalFireDepartment} />
            <Trans>{metadata.royalty!.bps / 100}% Royalty</Trans>
          </Badge>
        </Tooltip>
      )}

      {showSoulbound && (
        <Tooltip label={<Trans>Non-transferable (Soulbound)</Trans>}>
          <Badge colorScheme="orange" display="flex" alignItems="center" gap={1}>
            <Icon as={MdLock} />
            <Trans>Soulbound</Trans>
          </Badge>
        </Tooltip>
      )}

      {showCreatorSig && (
        <Tooltip label={<Trans>Creator signature verified</Trans>}>
          <Badge colorScheme="green" display="flex" alignItems="center" gap={1}>
            <Icon as={MdVerified} />
            <Trans>Verified</Trans>
          </Badge>
        </Tooltip>
      )}

      {showEncrypted && (
        <Tooltip label={<Trans>Contains encrypted content</Trans>}>
          <Badge colorScheme="blue" display="flex" alignItems="center" gap={1}>
            <Icon as={MdSecurity} />
            <Trans>Encrypted</Trans>
          </Badge>
        </Tooltip>
      )}

      {showTimelocked && (
        <Tooltip label={<Trans>Timelocked reveal</Trans>}>
          <Badge colorScheme="cyan" display="flex" alignItems="center" gap={1}>
            <Icon as={MdTimer} />
            <Trans>Timelocked</Trans>
          </Badge>
        </Tooltip>
      )}

      {showContainer && (
        <Tooltip
          label={
            <Trans>
              Collection ({metadata.container?.minted || 0}/
              {metadata.container?.max_items || "∞"})
            </Trans>
          }
        >
          <Badge colorScheme="teal" display="flex" alignItems="center" gap={1}>
            <Icon as={MdFolder} />
            <Trans>Collection</Trans>
          </Badge>
        </Tooltip>
      )}

      {showAuthority && (
        <Tooltip label={<Trans>Authority Token</Trans>}>
          <Badge colorScheme="red" display="flex" alignItems="center" gap={1}>
            <Icon as={MdSecurity} />
            <Trans>Authority</Trans>
          </Badge>
        </Tooltip>
      )}

      {showWave && (
        <Tooltip label={<Trans>WAVE Name</Trans>}>
          <Badge colorScheme="pink" display="flex" alignItems="center" gap={1}>
            <Trans>WAVE</Trans>
          </Badge>
        </Tooltip>
      )}
    </HStack>
  );
}
