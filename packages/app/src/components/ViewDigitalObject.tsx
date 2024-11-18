import {
  Alert,
  AlertIcon,
  Box,
  BoxProps,
  Button,
  Container,
  Grid,
  GridItem,
  GridProps,
  Heading,
  Icon,
  IconButton,
  SimpleGrid,
  useClipboard,
  useDisclosure,
} from "@chakra-ui/react";
import { Trans, t } from "@lingui/macro";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useLocation, useNavigate } from "react-router-dom";
import db from "@app/db";
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LinkIcon,
} from "@chakra-ui/icons";
import Outpoint from "@lib/Outpoint";
import Identifier from "@app/components/Identifier";
import SendDigitalObject from "@app/components/SendDigitalObject";
import { PropsWithChildren, ReactNode, useRef } from "react";
import Card from "@app/components/Card";
import Photons from "@app/components/Photons";
import ContentContainer from "@app/components/ContentContainer";
import DownloadLink from "@app/components/DownloadLink";
import TokenContent from "@app/components/TokenContent";
import TokenType from "@app/components/TokenType";
import PageHeader from "@app/components/PageHeader";
import MeltDigitalObject from "./MeltDigitalObject";
import TxSuccessModal from "./TxSuccessModal";
import { SmartToken, TxO } from "../types";
import { openModal, wallet } from "@app/signals";
import TokenDetails from "./TokenDetails";
import createExplorerUrl from "@app/network/createExplorerUrl";
import { RiContractRightLine, RiExpandLeftLine } from "react-icons/ri";
import { useViewPanelContext } from "@app/layouts/ViewPanelLayout";
import ActionIcon from "./ActionIcon";
import { MdDeleteForever } from "react-icons/md";
import { TbArrowUpRight, TbBox } from "react-icons/tb";
import mime from "mime";
// import FetchTokenTest from "./FetchMutableTest";
// import EditTokenTest from "./EditTokenTest";

export const PropertyCard = ({
  heading,
  info,
  children,
  ...rest
}: PropsWithChildren<
  { heading: React.ReactNode; info?: ReactNode } & BoxProps
>) => {
  return (
    <Card
      p={4}
      display="grid"
      gridTemplateAreas={`"heading info" "child child"`}
      gridTemplateColumns="auto 30px"
      {...rest}
    >
      <Heading
        size="sm"
        mb={2}
        color="lightBlue.A400"
        display="flex"
        flexDirection="row"
        alignItems="center"
      >
        {heading}
      </Heading>
      <Box>{info}</Box>
      {children}
    </Card>
  );
};

function Warning({ children }: PropsWithChildren) {
  return (
    <Alert status="warning" as={GridItem} justifyContent="center" colSpan={2}>
      <AlertIcon />
      <Trans>{children}</Trans>
    </Alert>
  );
}

export default function ViewDigitalObject({
  sref,
  context,
  ...rest
}: {
  sref: string;
  context?: string;
} & GridProps) {
  const [collapsed, setCollapsed] = useViewPanelContext();
  const size = collapsed ? "md" : "sm";
  const { search } = useLocation();
  const navigate = useNavigate();
  const sendDisclosure = useDisclosure();
  const meltDisclosure = useDisclosure();
  const successDisclosure = useDisclosure();
  const [nft, txo, author, container] = useLiveQuery(
    async () => {
      const nft = await db.glyph.get({ ref: sref });
      if (!nft?.lastTxoId) return [undefined, undefined];
      const txo = await db.txo.get(nft.lastTxoId);
      const a = nft?.author && (await db.glyph.get({ ref: nft.author }));
      const c = nft?.container && (await db.glyph.get({ ref: nft.container }));
      return [nft, txo, a, c] as [SmartToken, TxO, SmartToken?, SmartToken?];
    },
    [sref],
    []
  );
  const txid = useRef("");
  const { onCopy: onLinkCopy } = useClipboard(nft?.remote?.u || "");

  // TODO show loading or 404
  if (!txo || !nft) {
    return (
      <ContentContainer>
        <PageHeader />
      </ContentContainer>
    );
  }

  const unlock = (fn: () => void) => {
    if (wallet.value.locked) {
      openModal.value = {
        modal: "unlock",
        onClose: (success) => success && fn(),
      };
    } else {
      fn();
    }
  };

  const openSend = () => sendDisclosure.onOpen();

  const openMelt = () => meltDisclosure.onOpen();

  const openSuccess = (id: string) => {
    txid.current = id;
    successDisclosure.onOpen();
  };

  const isIPFS = nft.remote?.u?.startsWith("ipfs://");
  const isKnownEmbed = [
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/svg+xml",
  ].includes(nft.embed?.t || "");
  const location = Outpoint.fromUTXO(txo.txid, txo.vout);
  const isLink = !!nft.location;

  return (
    <>
      <Grid gridTemplateRows="auto 1fr" height="100vh" {...rest}>
        <PageHeader
          close
          to={`${context}${search}`}
          toolbar={
            <IconButton
              display={{ base: "none", "2xl": "flex" }}
              isRound
              aria-label="Back"
              variant="ghost"
              icon={
                <Icon
                  as={collapsed ? RiContractRightLine : RiExpandLeftLine}
                  fontSize="2xl"
                />
              }
              onClick={() => setCollapsed(!collapsed)}
            />
          }
        >
          {nft.name || t`Unnamed token`}
        </PageHeader>
        <Container maxW="container.xl" overflowY="auto" pb={4}>
          <Grid
            columnGap={8}
            rowGap={4}
            templateColumns={
              size === "sm" ? "1fr" : { base: "1fr", xl: "2fr 3fr" }
            }
            alignItems="start"
          >
            <SimpleGrid columns={2} gap={2}>
              <GridItem
                p={4}
                minHeight="120px"
                alignItems="center"
                justifyContent="center"
                position="relative"
                as={Card}
                colSpan={2}
                sx={{
                  "& img": {
                    maxWidth: "400px",
                    maxHeight: "400px",
                  },
                }}
              >
                {isLink && (
                  <Box
                    position="absolute"
                    top={2}
                    right={2}
                    bgColor="blackAlpha.400"
                    p={2}
                    borderRadius={4}
                  >
                    <LinkIcon boxSize={8} />
                  </Box>
                )}
                <TokenContent glyph={nft} />
              </GridItem>
              {nft.embed && !isKnownEmbed && (
                <Warning>{t`Files may be unsafe and result in loss of funds`}</Warning>
              )}
              {nft.swapPending && (
                <Alert
                  status="info"
                  as={GridItem}
                  justifyContent="center"
                  colSpan={2}
                >
                  <AlertIcon />
                  <Trans>Swap pending</Trans>
                </Alert>
              )}
              {!nft.embed && nft.remote && !isIPFS && (
                <Warning>
                  {t`URLs may be unsafe and result in loss of funds`}
                </Warning>
              )}
              {nft.embed && (
                <GridItem
                  as={DownloadLink}
                  data={nft.embed.b}
                  filename={`main.${mime.getExtension(nft.embed.t) || "dat"}`}
                  leftIcon={<ActionIcon as={DownloadIcon} />}
                  colSpan={2}
                >
                  {t`Download`}
                </GridItem>
              )}
              {!nft.embed && nft.remote && (
                <>
                  <GridItem
                    as={Button}
                    onClick={onLinkCopy}
                    leftIcon={<ActionIcon as={CopyIcon} />}
                    colSpan={2}
                  >
                    {t`Copy URL`}
                  </GridItem>
                </>
              )}
              {/* Edit mutable token, for testing purposes only
              {nft.immutable === false && (
                <>
                  <EditTokenTest token={nft} txo={txo} />
                  <FetchTokenTest token={nft} />
                </>
              )} */}
              <Button
                disabled={nft.swapPending}
                leftIcon={<ActionIcon as={TbArrowUpRight} />}
                onClick={() => unlock(openSend)}
              >
                {t`Send`}
              </Button>
              <Button
                disabled={nft.swapPending}
                leftIcon={<ActionIcon as={MdDeleteForever} />}
                onClick={() => unlock(openMelt)}
                _hover={{ bg: "red.600" }}
              >
                {t`Melt`}
              </Button>
              {nft.type === "container" && (
                <Button
                  as={Link}
                  to={`/container/${nft.ref}`}
                  leftIcon={<ActionIcon as={TbBox} />}
                  sx={{ gridColumn: "span 2 / span 2" }}
                >
                  {t`View contents`}
                </Button>
              )}
            </SimpleGrid>
            {nft && (
              <TokenDetails glyph={nft} container={container} author={author}>
                <PropertyCard heading={t`Output value`}>
                  <Photons value={txo.value} />
                </PropertyCard>
                {nft.type && (
                  <PropertyCard heading={t`Type`}>
                    <TokenType type={nft.type} />
                  </PropertyCard>
                )}
                <PropertyCard heading={t`Location`}>
                  <div>
                    <Identifier showCopy copyValue={txo.txid}>
                      {location.shortOutput()}
                    </Identifier>
                    <IconButton
                      aria-label={t`Open in block explorer`}
                      icon={<ExternalLinkIcon />}
                      size="xs"
                      variant="ghost"
                      as={Link}
                      to={createExplorerUrl(location.getTxid())}
                      target="_blank"
                    />
                  </div>
                </PropertyCard>
                {/* Temporarily disabled. See comment regarding date in buildUpdateTXOs.
                      <PropertyCard heading={t`Received`}>
                        {txo.date
                          ? dayjs(txo.date * 1000).format("lll")
                          : "Unconfirmed"}
                      </PropertyCard>
                      */}
                <PropertyCard heading={t`Height`}>
                  {txo.height === Infinity ? t`Unconfirmed` : txo.height}
                </PropertyCard>
              </TokenDetails>
            )}
          </Grid>
        </Container>
      </Grid>
      <SendDigitalObject
        glyph={nft}
        txo={txo}
        disclosure={sendDisclosure}
        onSuccess={(txid) => {
          sendDisclosure.onClose();
          openSuccess(txid);
        }}
      />
      <MeltDigitalObject
        asset={txo}
        disclosure={meltDisclosure}
        onSuccess={(txid: string) => {
          meltDisclosure.onClose();
          openSuccess(txid);
        }}
      />
      <TxSuccessModal
        onClose={() => {
          successDisclosure.onClose;
          navigate(context || "/objects");
        }}
        isOpen={successDisclosure.isOpen}
        txid={txid.current}
      />
    </>
  );
}
