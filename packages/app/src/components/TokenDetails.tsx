import { bytesToHex } from "@noble/hashes/utils";
import { ExternalLinkIcon, InfoIcon } from "@chakra-ui/icons";
import {
  Image,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Text,
  Flex,
  SimpleGrid,
  Tooltip,
  Divider,
  IconButton,
} from "@chakra-ui/react";
import { t } from "@lingui/macro";
import { filesize } from "filesize";
import TokenData from "./TokenData";
import Identicon from "./Identicon";
import Identifier from "./Identifier";
import { PropertyCard } from "./ViewDigitalObject";
import { SmartToken } from "@app/types";
import Outpoint from "@lib/Outpoint";
import createExplorerUrl from "@app/network/createExplorerUrl";
import { Link } from "react-router-dom";
import { PropsWithChildren } from "react";

function RefProperty({ tokenRef }: { tokenRef: Outpoint }) {
  return (
    <div>
      <Identicon
        value={tokenRef.refHash()}
        width="24px"
        height="24px"
        sx={{ svg: { height: "26px" } }}
        float="left"
      />
      <Identifier showCopy copyValue={tokenRef.ref()}>
        {tokenRef.ref("i")}
      </Identifier>
      <IconButton
        aria-label={t`Open in block explorer`}
        icon={<ExternalLinkIcon />}
        size="xs"
        variant="ghost"
        as={Link}
        to={createExplorerUrl(tokenRef.getTxid())}
        target="_blank"
      />
    </div>
  );
}

export default function TokenDetails({
  glyph,
  author,
  container,
  children,
}: PropsWithChildren<{
  glyph: SmartToken;
  author?: SmartToken;
  container?: SmartToken;
}>) {
  const ref = Outpoint.fromString(glyph.ref);
  const revealRef =
    glyph.revealOutpoint && Outpoint.fromString(glyph.revealOutpoint);
  const authorRef = glyph.author && Outpoint.fromString(glyph.author);
  const containerRef = glyph.container && Outpoint.fromString(glyph.container);
  const hasAttrs = glyph.attrs && Object.keys(glyph.attrs).length > 0;
  const isIPFS = glyph.remote?.u?.startsWith("ipfs://");

  return (
    <div>
      <Tabs>
        <TabList>
          <Tab>{t`Details`}</Tab>
          <Tab>{t`Inspect`}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            {glyph.description && (
              <PropertyCard heading={t`Description`} mb={4}>
                {glyph.description.substring(0, 1000)}
              </PropertyCard>
            )}
            <PropertyCard heading={t`Radiant ID`} mb={4}>
              <RefProperty tokenRef={ref} />
            </PropertyCard>
            {glyph.location && (
              <PropertyCard heading={t`Link`} mb={4}>
                <RefProperty tokenRef={Outpoint.fromString(glyph.location)} />
              </PropertyCard>
            )}
            {revealRef && (
              <PropertyCard heading={t`Mint`} mb={4}>
                <div>
                  <Identifier showCopy copyValue={revealRef.ref()}>
                    {revealRef.ref("i")}
                  </Identifier>
                  <IconButton
                    aria-label={t`Open in block explorer`}
                    icon={<ExternalLinkIcon />}
                    size="xs"
                    variant="ghost"
                    as={Link}
                    to={createExplorerUrl(ref.getTxid())}
                    target="_blank"
                  />
                </div>
              </PropertyCard>
            )}
            {authorRef && (
              <PropertyCard heading={t`Author`} mb={4}>
                <Flex justifyContent="space-between" alignItems="center">
                  {author?.name ? (
                    <Text>{author.name}</Text>
                  ) : (
                    <Text fontStyle="italic">&lt;Unnamed author&gt;</Text>
                  )}
                  <div>
                    <Identicon
                      value={authorRef.refHash()}
                      width="24px"
                      height="24px"
                      sx={{ svg: { height: "26px" } }}
                      float="left"
                    />
                    <Identifier showCopy copyValue={authorRef.ref()}>
                      {authorRef.shortRef()}
                    </Identifier>
                  </div>
                </Flex>
              </PropertyCard>
            )}
            {containerRef && (
              <PropertyCard heading={t`Container`} mb={4}>
                <Flex justifyContent="space-between" alignItems="center">
                  {container?.name ? (
                    <Text>{container.name}</Text>
                  ) : (
                    <Text fontStyle="italic">&lt;Unnamed container&gt;</Text>
                  )}
                  <div>
                    <Identicon
                      value={containerRef.refHash()}
                      width="24px"
                      height="24px"
                      sx={{ svg: { height: "26px" } }}
                      float="left"
                    />
                    <Identifier showCopy copyValue={containerRef.ref()}>
                      {containerRef.shortRef()}
                    </Identifier>
                  </div>
                </Flex>
              </PropertyCard>
            )}
            <SimpleGrid columns={[1, 2]} spacing={4}>
              {isIPFS && (
                <PropertyCard heading={t`IPFS CID`}>
                  <div>
                    <Identifier showCopy>
                      {glyph.remote?.u.replace("ipfs://", "")}
                    </Identifier>
                  </div>
                </PropertyCard>
              )}
              {glyph.remote?.hs && (
                <PropertyCard
                  heading={t`HashStamp`}
                  info={
                    <Tooltip
                      label={t`A HashStamp is a compressed on-chain copy of the token image, displayed alongside the SHA-256 of the original file`}
                      placement="bottom-end"
                      hasArrow
                    >
                      <InfoIcon
                        right={0}
                        color="gray.400"
                        display={{ base: "none", md: "block" }}
                      />
                    </Tooltip>
                  }
                >
                  <Flex gap={4}>
                    <Image
                      src={`data:image/webp;base64, ${btoa(
                        String.fromCharCode(...new Uint8Array(glyph.remote?.hs))
                      )}`}
                      width="64px"
                      height="64px"
                      objectFit="contain"
                      backgroundColor="white"
                    />
                    {glyph.remote?.h && (
                      <div>
                        <Identifier>
                          {bytesToHex(new Uint8Array(glyph.remote?.h))}
                        </Identifier>
                      </div>
                    )}
                  </Flex>
                </PropertyCard>
              )}
              {glyph.embed && (
                <>
                  <PropertyCard heading={t`Content length`}>
                    {filesize(glyph.embed.b.byteLength) as string}
                  </PropertyCard>
                  <PropertyCard heading={t`Content type`}>
                    {glyph.embed.t || "Unknown"}
                  </PropertyCard>
                </>
              )}
              {children}
            </SimpleGrid>
            {hasAttrs && (
              <>
                <Divider my={4} />
                <SimpleGrid columns={[1, 2]} spacing={4} gridAutoRows="1fr">
                  {Object.entries(glyph.attrs).map(([k, v]) => (
                    <PropertyCard heading={k} key={k}>
                      {v}
                    </PropertyCard>
                  ))}
                </SimpleGrid>
              </>
            )}
          </TabPanel>
          <TabPanel px={0}>
            <TokenData glyph={glyph} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}
