import React, { useCallback, useReducer, useRef, useState } from "react";
import mime from "mime";
import { t, Trans } from "@lingui/macro";
import { Link } from "react-router-dom";
import { GLYPH_DMINT, GLYPH_FT, GLYPH_MUT, GLYPH_NFT } from "@lib/protocols";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Divider as CUIDivider,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  HStack,
  Icon,
  IconButton,
  Image,
  Input,
  Radio,
  RadioGroup,
  Select,
  SimpleGrid,
  Stack,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Textarea,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes } from "@noble/hashes/utils";
import { filesize } from "filesize";
import { useLiveQuery } from "dexie-react-hooks";
import { AddIcon, DeleteIcon } from "@chakra-ui/icons";
import { DropzoneState, useDropzone } from "react-dropzone";
import { MdCheck, MdImage } from "react-icons/md";
import GlowBox from "@app/components/GlowBox";
import db from "@app/db";
import { ContractType, ElectrumStatus } from "@app/types";
import Outpoint from "@lib/Outpoint";
import { mintToken } from "@lib/mint";
//import { encodeCid, upload } from "@lib/ipfs";
import { photonsToRXD } from "@lib/format";
import TokenType from "@app/components/TokenType";
import ContentContainer from "@app/components/ContentContainer";
import PageHeader from "@app/components/PageHeader";
import HashStamp from "@app/components/HashStamp";
import Identifier from "@app/components/Identifier";
import FormSection from "@app/components/FormSection";
import MintSuccessModal from "@app/components/MintSuccessModal";
import {
  electrumStatus,
  feeRate,
  network,
  openModal,
  wallet,
} from "@app/signals";
import {
  RevealDirectParams,
  RevealDmintParams,
  SmartTokenFile,
  SmartTokenPayload,
  SmartTokenRemoteFile,
  Utxo,
} from "@lib/types";
import { electrumWorker } from "@app/electrum/Electrum";
import { PromiseExtended } from "dexie";
import { mintEmbedMaxBytes } from "@app/config.json";
import { updateRxdBalances } from "@app/utxos";

// IPFS uploading is currently disabled until an alternative to nft.storage can be found
//const MAX_IPFS_BYTES = 5_000_000;

type ContentMode = "file" | "text" | "url" | "dual";

type FileUpload = {
  name: string;
  size: number;
  type: string;
  data: ArrayBuffer;
};

type DualFileState = {
  previewImage?: FileUpload;
  contentFile?: FileUpload;
  previewImgSrc: string;
  previewHash?: Uint8Array;
  contentHash?: Uint8Array;
  totalSize: number;
};

const noDualFile: DualFileState = {
  previewImage: undefined,
  contentFile: undefined,
  previewImgSrc: "",
  previewHash: undefined,
  contentHash: undefined,
  totalSize: 0,
};

function cleanError(message: string) {
  return message.replace(/(\(code \d+\)).*/s, "$1").substring(0, 200);
}

function isMissingInputsError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.toLowerCase().includes("missing inputs");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatNumber(num: number) {
  return new Intl.NumberFormat(navigator.language, {
    maximumFractionDigits: 2,
  }).format(num);
}

// Estimate minting fee based on file size (rough approximation)
// Fee = (baseSize + fileSize) * feeRate * 2 (commit + reveal txs)
function estimateMintFee(fileSizeBytes: number, currentFeeRate: number): number {
  const baseTxSize = 500; // Base transaction overhead
  const feeRate = currentFeeRate || 10000; // Default 10000 sat/byte
  // Rough estimate: file size + overhead for both commit and reveal transactions
  const estimatedSize = baseTxSize + fileSizeBytes;
  // Multiply by ~1.5 to account for script overhead and both transactions
  return Math.ceil(estimatedSize * feeRate * 1.5);
}

function TargetBox({
  getInputProps,
  isDragActive = false,
  onClick,
}: Partial<DropzoneState> & {
  onClick: React.MouseEventHandler<HTMLElement> | undefined;
}) {
  return (
    <GlowBox
      onClick={onClick}
      active={isDragActive}
      height="100%"
      cursor="pointer"
      flexGrow={1}
      borderRadius="md"
      bg="bg.300"
    >
      {getInputProps && <input {...getInputProps()} />}
      <Flex
        alignItems="center"
        justifyContent="center"
        flexDir="column"
        w="100%"
        h="100%"
      >
        {isDragActive ? (
          <>
            <Icon
              as={MdCheck}
              display="block"
              mb={2}
              fontSize="6xl"
              color="green.300"
            />
            <Text color="whiteAlpha.800" fontSize="2xl" mb={2}>
              {t`Drop file`}
            </Text>
          </>
        ) : (
          <>
            <Icon
              as={MdImage}
              display="block"
              mb={2}
              fontSize="6xl"
              color="gray.600"
            />
            <Text color="gray.300" fontSize="xl" mb={1}>
              {t`Upload file`}
            </Text>
            <Text color="gray.300" fontSize="md">
              <Trans>
                Maximum {formatNumber(mintEmbedMaxBytes / 1000)}
                KB - Images, Files, URLs, or Text
              </Trans>
            </Text>
          </>
        )}
      </Flex>
    </GlowBox>
  );
}

function Divider() {
  return <CUIDivider borderColor="whiteAlpha.300" borderBottomWidth={2} />;
}

type TokenType = "object" | "container" | "user" | "fungible";

const formReducer = (
  state: { [key: string]: string },
  event: {
    name: string;
    value: string;
  }
) => {
  return { ...state, [event.name]: event.value };
};

const isAdaptiveDaaMode = (daaMode?: string) => Boolean(daaMode && daaMode !== "fixed");

const MAX_DMIN_CONTRACTS = 32;

const clampNumContracts = (value: string | number): number => {
  const parsed = typeof value === "number" ? value : parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(1, Math.min(MAX_DMIN_CONTRACTS, parsed));
};

const encodeContent = (
  mode: ContentMode,
  fileState: FileState,
  dualFileState: DualFileState,
  text?: string,
  url?: string,
  urlFileType?: string
): [string, SmartTokenFile | { [key: string]: SmartTokenFile } | undefined] => {
  const urlContentType =
    (urlFileType && mime.getType(urlFileType)) || "text/html";
  if (mode === "url") {
    return [`main`, { t: urlContentType, u: url as string }];
  }

  if (mode === "text") {
    return ["main", { t: "text/plain", b: new TextEncoder().encode(text) }];
  }

  if (mode === "dual") {
    const files: { [key: string]: SmartTokenFile } = {};
    
    if (dualFileState.previewImage) {
      files["preview"] = { 
        t: dualFileState.previewImage.type || "", 
        b: new Uint8Array(dualFileState.previewImage.data) 
      };
    }
    
    if (dualFileState.contentFile) {
      files["content"] = { 
        t: dualFileState.contentFile.type || "", 
        b: new Uint8Array(dualFileState.contentFile.data) 
      };
    }
    
    return Object.keys(files).length > 0 ? ["", files] : ["", undefined];
  }

  if (fileState.file) {
    /*if (fileState.ipfs) {
      return ["main", { t: urlContentType, u: `ipfs://${fileState.cid}` }];
    }*/

    return [
      "main",
      { t: fileState.file?.type || "", b: new Uint8Array(fileState.file.data) },
    ];
  }

  return ["", undefined];
};

type FileState = {
  file?: FileUpload;
  cid: string;
  imgSrc: string;
  stampSupported: boolean;
  ipfs: boolean;
  hash?: Uint8Array;
};

const noFile: FileState = {
  file: undefined,
  cid: "",
  imgSrc: "",
  stampSupported: false,
  ipfs: false,
  hash: undefined,
};

function onSetState(fn: () => void) {
  function clean<T, TT>([state, setState]: [T, React.Dispatch<TT>]): [
    T,
    React.Dispatch<TT>
  ] {
    return [
      state,
      (value: TT) => {
        fn();
        setState(value);
      },
    ];
  }
  return clean;
}

export default function Mint({ tokenType }: { tokenType: TokenType }) {
  const toast = useToast();
  const [clean, setClean] = useState(false);
  const reset = onSetState(() => {
    setClean(false);
    setStats({ fee: 0, size: 0 });
  });
  const [stats, setStats] = useState({ fee: 0, size: 0 });
  const [loading, setLoading] = useState(false);
  const [attrs, setAttrs] = reset(useState<[string, string][]>([]));
  const [mode, setMode] = reset(useState<ContentMode>("file"));
  const [fileState, setFileState] = reset(useState<FileState>({ ...noFile }));
  const [dualFileState, setDualFileState] = reset(useState<DualFileState>({ ...noDualFile }));
  const [enableHashstamp, setEnableHashstamp] = reset(useState(true));
  const [hashStamp, setHashstamp] = reset(useState<Uint8Array | undefined>());
  const attrName = useRef<HTMLInputElement>(null);
  const attrValue = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = reset(
    useReducer(formReducer, {
      deployMethod: "direct",
      difficulty: "10",
      numContracts: "1",
      maxHeight: "100",
      reward: "10",
      premine: "0",
      immutable: ["user", "container"].includes(tokenType) ? "0" : "1",
      algorithm: "blake3", // Default to Blake3 for new contracts
      daaMode: "asert",    // Default to ASERT for dynamic difficulty
      targetBlockTime: "60", // Default 60 seconds
      // DAA-specific parameters
      asertHalfLife: "1000",
      asertAsymptote: "0",
      lwmaWindowSize: "144",
      epochLength: "2016",
      maxAdjustment: "4",
      schedule: "0:1000,1000:500,2000:250",
    })
  );
  const isConnected = electrumStatus.value === ElectrumStatus.CONNECTED;
  const users = useLiveQuery(
    async () => await db.glyph.where({ type: "user", spent: 0 }).toArray(),
    [],
    []
  );
  const containers = useLiveQuery(
    async () => await db.glyph.where({ type: "container", spent: 0 }).toArray(),
    [],
    []
  );

  const apiKey = useLiveQuery(
    async () =>
      (await (db.kvp.get("nftStorageApiKey") as PromiseExtended<string>)) || ""
  );

  const {
    isOpen: isSuccessModalOpen,
    onOpen: onSuccessModalOpen,
    onClose: onSuccessModalClose,
  } = useDisclosure();

  const revealTxIdRef = useRef("");

  const onFormChange = (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = event.target;

    if (name === "numContracts") {
      setFormData({ name, value: clampNumContracts(value).toString() });
      return;
    }

    setFormData({ name, value });

    if (name === "daaMode" && isAdaptiveDaaMode(value)) {
      setFormData({ name: "numContracts", value: "1" });
    }
  };
  const img = useRef<HTMLImageElement>(null);

  const preview = (event: React.FormEvent) => {
    event.preventDefault();
    handleErrors(submit(true));
    return false;
  };
  const mint = (event: React.FormEvent) => {
    event.preventDefault();
    handleErrors(submit(false));
    return false;
  };

  const handleErrors = (p: Promise<unknown>) => {
    p.catch((error) => {
      console.log(error);
      toast({
        title: t`Error`,
        description: cleanError((error as Error).message || "") || undefined,
        status: "error",
      });
      setLoading(false);
    });
  };

  const submit = async (dryRun: boolean) => {
    if (fileState.ipfs && !apiKey) {
      toast({
        status: "error",
        title: t`No NFT.Storage API key provided`,
      });
      return;
    }

    if (wallet.value.locked) {
      openModal.value = {
        modal: "unlock",
        onClose: (success) => success && handleErrors(submit(dryRun)),
      };
      return;
    }

    const {
      authorId,
      containerId,
      text,
      url,
      urlFileType = "html",
      immutable,
      ticker,
      supply,
      deployMethod,
      ...fields
    } = formData;

    if (mode === "url" && !mime.getType(urlFileType)) {
      toast({
        status: "error",
        title: t`Unrecognized URL file type`,
      });
      return;
    }

    // Validate content size for text and URL modes
    if (mode === "text" && text) {
      const textSize = new TextEncoder().encode(text).length;
      if (textSize > mintEmbedMaxBytes) {
        toast({
          status: "error",
          title: t`Text content is too large`,
          description: t`Maximum size is ${formatNumber(mintEmbedMaxBytes / 1000)} KB`,
        });
        return;
      }
    }

    if (mode === "url" && url) {
      const urlSize = new TextEncoder().encode(url).length;
      if (urlSize > mintEmbedMaxBytes) {
        toast({
          status: "error",
          title: t`URL content is too large`,
          description: t`Maximum size is ${formatNumber(mintEmbedMaxBytes / 1000)} KB`,
        });
        return;
      }
    }

    // Validate dual upload mode
    if (mode === "dual") {
      if (!dualFileState.previewImage && !dualFileState.contentFile) {
        toast({
          status: "error",
          title: t`No files uploaded`,
          description: t`Please upload at least a preview image or content file`,
        });
        return;
      }
      
      if (dualFileState.totalSize > mintEmbedMaxBytes) {
        toast({
          status: "error",
          title: t`Combined file size is too large`,
          description: t`Maximum size is ${formatNumber(mintEmbedMaxBytes / 1000)} KB`,
        });
        return;
      }
    }

    const outputValue = tokenType === "fungible" ? parseInt(supply, 10) : 1;
    if (outputValue < 0 || outputValue > 1000000000000) {
      toast({
        status: "error",
        title: t`Token supply is too high`,
      });
      return;
    }

    setLoading(true);

    try {
      await electrumWorker.value.manualSync();
    } catch (error) {
      console.debug("[Mint] Preflight UTXO refresh failed", error);
    }

    const coins = await db.txo
      .where({ contractType: ContractType.RXD, spent: 0 })
      .toArray();
    
    console.debug("[Mint] Available coins:", coins.length, "Total value:", coins.reduce((a, c) => a + c.value, 0));

    const [payloadFilename, content] = encodeContent(
      mode,
      fileState,
      dualFileState,
      text,
      url,
      urlFileType
    );

    if (content && enableHashstamp && hashStamp) {
      (content as SmartTokenRemoteFile).hs = new Uint8Array(hashStamp);
      (content as SmartTokenRemoteFile).h = fileState.hash;
    }

    const userIndex =
      authorId !== "" && authorId !== undefined
        ? parseInt(authorId, 10)
        : undefined;
    const userGlyph = userIndex !== undefined ? users[userIndex] : undefined;
    const userInput = userGlyph
      ? await db.txo.get(userGlyph.lastTxoId as number)
      : undefined;

    if (userIndex && !(userGlyph && userInput)) {
      setLoading(false);
      toast({
        title: "Error",
        description: t`Couldn't find user`,
        status: "error",
      });
      return;
    }

    const containerIndex =
      containerId !== "" && containerId !== undefined
        ? parseInt(containerId, 10)
        : undefined;
    const containerGlyph =
      containerIndex !== undefined ? containers[containerIndex] : undefined;
    const containerInput = containerGlyph
      ? await db.txo.get(containerGlyph.lastTxoId as number)
      : undefined;

    if (containerIndex && !(containerGlyph && containerInput)) {
      setLoading(false);
      toast({
        title: "Error",
        description: t`Couldn't find container`,
        status: "error",
      });
      return;
    }

    const meta = Object.fromEntries(
      [
        ["name", fields.name],
        [
          "type",
          tokenType === "object" || tokenType === "fungible"
            ? undefined
            : tokenType,
        ],
        ["license", fields.license],
        ["desc", fields.desc],
        [
          "in",
          containerGlyph && [
            hexToBytes(
              Outpoint.fromString(containerGlyph.ref).reverse().toString()
            ),
          ],
        ],
        [
          "by",
          userGlyph && [
            hexToBytes(Outpoint.fromString(userGlyph.ref).reverse().toString()),
          ],
        ],
        ["attrs", attrs.length && Object.fromEntries(attrs)],
      ].filter(([, v]) => v)
    );

    const fileObj =
      content && payloadFilename
        ? mode === "dual" && typeof content === "object" && "preview" in content
          ? content
          : { [payloadFilename]: content }
        : undefined;

    const protocols = [tokenType === "fungible" ? GLYPH_FT : GLYPH_NFT];
    if (deployMethod === "dmint") {
      protocols.push(GLYPH_DMINT);
    }

    if (immutable === "0") {
      protocols.push(GLYPH_MUT);
    }

    const args: { [key: string]: unknown } = {};
    if (tokenType === "fungible") {
      args.ticker = ticker;
    }

    // Build dmint object for v2 compliance per Glyph v2 spec Section 11.7
    let dmintPayload: { [key: string]: unknown } | undefined;
    if (deployMethod === "dmint") {
      const { 
        difficulty, 
        maxHeight, 
        reward, 
        premine, 
        numContracts,
        algorithm, 
        daaMode, 
        targetBlockTime,
        asertHalfLife,
        asertAsymptote,
        lwmaWindowSize,
        epochLength,
        maxAdjustment,
        schedule
      } = fields;
      const resolvedNumContracts = isAdaptiveDaaMode(daaMode)
        ? 1
        : clampNumContracts(numContracts);
      
      dmintPayload = {
        algo: algorithm === 'sha256d' ? 0x00 : 
              algorithm === 'blake3' ? 0x01 : 
              algorithm === 'k12' ? 0x02 : 0x00,
        numContracts: resolvedNumContracts,
        maxHeight: parseInt(maxHeight, 10),
        reward: parseInt(reward, 10),
        premine: parseInt(premine, 10),
        diff: parseInt(difficulty, 10),
      };
      
      // Add DAA configuration if not fixed
      if (daaMode && daaMode !== 'fixed') {
        const daaConfig: { [key: string]: unknown } = {
          mode: daaMode === 'epoch' ? 0x01 : 
                daaMode === 'asert' ? 0x02 : 
                daaMode === 'lwma' ? 0x03 : 
                daaMode === 'schedule' ? 0x04 : 0x00,
          targetBlockTime: parseInt(targetBlockTime, 10) || 60,
        };
        
        if (daaMode === 'asert') {
          daaConfig.halfLife = parseInt(asertHalfLife, 10) || 1000;
          if (asertAsymptote) daaConfig.asymptote = parseInt(asertAsymptote, 10);
        } else if (daaMode === 'lwma') {
          daaConfig.windowSize = parseInt(lwmaWindowSize, 10) || 144;
        } else if (daaMode === 'epoch') {
          daaConfig.epochLength = parseInt(epochLength, 10) || 2016;
          daaConfig.maxAdjustment = parseFloat(maxAdjustment) || 4;
        } else if (daaMode === 'schedule' && schedule) {
          daaConfig.schedule = schedule.split(',').map((pair: string) => {
            const [h, d] = pair.split(':').map(Number);
            return { height: h, difficulty: d };
          });
        }
        
        dmintPayload.daa = daaConfig;
      }
    }

    const payload: SmartTokenPayload = {
      v: 2, // Glyph v2 version
      p: protocols,
      ...(Object.keys(args).length ? args : undefined),
      ...meta,
      ...fileObj,
      ...(dmintPayload ? { dmint: dmintPayload } : undefined),
    };

    try {
      /*if (fileState.ipfs && fileState.file?.data) {
        // FIXME does this throw an error when unsuccessful?
        await upload(
          fileState.file?.data,
          fileState.cid,
          dryRun,
          apiKey as string
        );
      }*/

      const relInputs: Utxo[] = [];
      if (userInput) relInputs.push(userInput);
      if (containerInput) relInputs.push(containerInput);

      const buildDeployParams = () => {
        const address = wallet.value.address;
        if (tokenType === "fungible") {
          if (deployMethod === "dmint") {
            const { 
              difficulty, 
              maxHeight, 
              reward, 
              premine, 
              numContracts, 
              algorithm, 
              daaMode, 
              targetBlockTime,
              asertHalfLife,
              asertAsymptote,
              lwmaWindowSize,
              epochLength,
              maxAdjustment,
              schedule
            } = fields;
            const resolvedNumContracts = isAdaptiveDaaMode(daaMode)
              ? 1
              : clampNumContracts(numContracts);
            // Value 1 is for the dmint contracts
            return {
              value: 1,
              method: "dmint" as const,
              params: {
                difficulty: parseInt(difficulty, 10),
                numContracts: resolvedNumContracts,
                maxHeight: parseInt(maxHeight, 10),
                reward: parseInt(reward, 10),
                premine: parseInt(premine, 10),
                address,
                algorithm,
                daaMode,
                daaParams: daaMode !== 'fixed' ? {
                  targetBlockTime: parseInt(targetBlockTime, 10),
                  // Add DAA-specific parameters
                  ...(daaMode === 'asert' && {
                    halfLife: parseInt(asertHalfLife, 10),
                    asymptote: parseInt(asertAsymptote, 10) || undefined,
                  }),
                  ...(daaMode === 'lwma' && {
                    windowSize: parseInt(lwmaWindowSize, 10),
                  }),
                  ...(daaMode === 'epoch' && {
                    epochLength: parseInt(epochLength, 10),
                    maxAdjustment: parseFloat(maxAdjustment),
                  }),
                  ...(daaMode === 'schedule' && {
                    schedule: schedule.split(',').map(pair => {
                      const [height, difficulty] = pair.split(':').map(Number);
                      return { height, difficulty };
                    }),
                  }),
                } : null,
              } as RevealDmintParams,
            };
          } else {
            return {
              value: parseInt(supply, 10),
              method: "direct" as const,
              params: { address } as RevealDirectParams,
            };
          }
        } else {
          return {
            value: 1,
            method: "direct" as const,
            params: { address },
          };
        }
      };

      const deploy = buildDeployParams();

      const shortTokenType = tokenType === "fungible" ? "ft" : "nft";
      const { commitTx, revealTx, fees, size } = mintToken(
        shortTokenType,
        deploy,
        wallet.value.wif as string,
        coins,
        payload,
        relInputs,
        feeRate.value
      );

      const broadcast = async (rawTx: string) =>
        await electrumWorker.value.broadcast(rawTx);

      const broadcastRevealWithRetry = async (rawTx: string) => {
        try {
          return await broadcast(rawTx);
        } catch (error) {
          if (!isMissingInputsError(error)) {
            throw error;
          }

          console.debug(
            "[Mint] Reveal broadcast returned Missing inputs; refreshing UTXOs and retrying"
          );
          await electrumWorker.value.manualSync();
          await wait(1500);
          return await broadcast(rawTx);
        }
      };

      if (!dryRun) {
        // Broadcast commit
        const commitTxId = await broadcast(commitTx.toString());
        await db.broadcast.put({
          txid: commitTxId,
          date: Date.now(),
          description: `${shortTokenType}_mint`,
        });

        try {
          await electrumWorker.value.manualSync();
        } catch (error) {
          console.debug("[Mint] Post-commit UTXO refresh failed", error);
        }
        await updateRxdBalances(wallet.value.address);

        // Broadcast reveal
        const revealTxId = await broadcastRevealWithRetry(revealTx.toString());
        await db.broadcast.put({
          txid: revealTxId,
          date: Date.now(),
          description: `${shortTokenType}_mint`,
        });

        try {
          await electrumWorker.value.manualSync();
        } catch (error) {
          console.debug("[Mint] Post-reveal UTXO refresh failed", error);
        }
        await updateRxdBalances(wallet.value.address);
      }

      revealTxIdRef.current = revealTx.id;
      const fee = fees.reduce((a, f) => a + f, 0);

      if (dryRun) {
        setStats({ fee, size });
        setClean(true);
      } else {
        onSuccessModalOpen();
        toast({
          title: t`Minted. Fee ${photonsToRXD(fee)} ${network.value.ticker}`,
          status: "success",
        });
      }
    } catch (error) {
      console.log(error);
      toast({
        title: t`Error`,
        description: cleanError((error as Error).message || "") || undefined,
        status: "error",
      });
    }
    setLoading(false);
  };

  const onDrop = useCallback(async (files: File[]) => {
    const reader = new FileReader();

    reader.onload = async () => {
      const newState: FileState = { ...noFile };

      //if (files[0].size > MAX_IPFS_BYTES) {
      if (files[0].size > mintEmbedMaxBytes) {
        toast({ title: t`File is too large`, status: "error" });
        setFileState(newState);
        return;
      }
      const { name, size, type } = files[0];
      if (!type) {
        toast({ title: t`Unrecognized file type`, status: "error" });
        setFileState(newState);
        return;
      }

      newState.file = {
        name: `main${name.substring(name.lastIndexOf("."))}`,
        type,
        size,
        data: reader.result as ArrayBuffer,
      };

      // SVG not working yet
      newState.stampSupported = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif",
      ].includes(type);

      const typedArray = new Uint8Array(reader.result as ArrayBuffer);

      if (
        [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "image/avif",
          "image/svg+xml",
        ].includes(type)
      ) {
        newState.imgSrc = btoa(
          typedArray.reduce((data, byte) => {
            return data + String.fromCharCode(byte);
          }, "")
        );
      }

      newState.hash = sha256(typedArray);

      /*if (size > MAX_BYTES) {
        newState.ipfs = true;
        newState.cid = await encodeCid(reader.result as ArrayBuffer);
      }*/

      setFileState(newState);
    };
    reader.readAsArrayBuffer(files[0]);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
  });
  const { onClick, ...rootProps } = getRootProps();

  const onPreviewDrop = useCallback(async (files: File[]) => {
    const reader = new FileReader();

    reader.onload = async () => {
      const newState = { ...dualFileState };

      if (files[0].size > mintEmbedMaxBytes) {
        toast({ title: t`Preview image is too large`, status: "error" });
        return;
      }

      const { name, size, type } = files[0];
      if (!type || !type.startsWith('image/')) {
        toast({ title: t`Preview must be an image file`, status: "error" });
        return;
      }

      newState.previewImage = {
        name: `preview${name.substring(name.lastIndexOf("."))}`,
        type,
        size,
        data: reader.result as ArrayBuffer,
      };

      newState.totalSize = (newState.previewImage?.size || 0) + (newState.contentFile?.size || 0);

      if (newState.totalSize > mintEmbedMaxBytes) {
        toast({ 
          title: t`Combined file size is too large`, 
          description: t`Maximum is ${formatNumber(mintEmbedMaxBytes / 1000)} KB`,
          status: "error" 
        });
        return;
      }

      const typedArray = new Uint8Array(reader.result as ArrayBuffer);
      newState.previewImgSrc = btoa(
        typedArray.reduce((data, byte) => {
          return data + String.fromCharCode(byte);
        }, "")
      );
      newState.previewHash = sha256(typedArray);

      setDualFileState(newState);
    };
    reader.readAsArrayBuffer(files[0]);
  }, [dualFileState]);

  const onContentDrop = useCallback(async (files: File[]) => {
    const reader = new FileReader();

    reader.onload = async () => {
      const newState = { ...dualFileState };

      if (files[0].size > mintEmbedMaxBytes) {
        toast({ title: t`Content file is too large`, status: "error" });
        return;
      }

      const { name, size, type } = files[0];

      newState.contentFile = {
        name: `content${name.substring(name.lastIndexOf("."))}`,
        type,
        size,
        data: reader.result as ArrayBuffer,
      };

      newState.totalSize = (newState.previewImage?.size || 0) + (newState.contentFile?.size || 0);

      if (newState.totalSize > mintEmbedMaxBytes) {
        toast({ 
          title: t`Combined file size is too large`, 
          description: t`Maximum is ${formatNumber(mintEmbedMaxBytes / 1000)} KB`,
          status: "error" 
        });
        return;
      }

      const typedArray = new Uint8Array(reader.result as ArrayBuffer);
      newState.contentHash = sha256(typedArray);

      setDualFileState(newState);
    };
    reader.readAsArrayBuffer(files[0]);
  }, [dualFileState]);

  const { getRootProps: getPreviewRootProps, getInputProps: getPreviewInputProps, isDragActive: isPreviewDragActive } = useDropzone({
    onDrop: onPreviewDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.avif']
    }
  });
  const { onClick: onPreviewClick, ...previewRootProps } = getPreviewRootProps();

  const { getRootProps: getContentRootProps, getInputProps: getContentInputProps, isDragActive: isContentDragActive } = useDropzone({
    onDrop: onContentDrop,
  });
  const { onClick: onContentClick, ...contentRootProps } = getContentRootProps();

  const addAttr = () => {
    if (attrName.current?.value && attrValue.current?.value) {
      setAttrs([...attrs, [attrName.current.value, attrValue.current.value]]);
      attrName.current.value = "";
      attrValue.current.value = "";
    }
    attrName.current?.focus();
  };

  const delAttr = (index: number) => {
    const newAttrs = attrs.slice();
    newAttrs.splice(index, 1);
    setAttrs(newAttrs);
  };

  const delImg = () => {
    setFileState({ ...noFile });
    //setHashstamp(undefined);
  };

  const delDualFiles = () => {
    setDualFileState({ ...noDualFile });
  };

  const delPreviewImage = () => {
    setDualFileState(prev => ({
      ...prev,
      previewImage: undefined,
      previewImgSrc: "",
      previewHash: undefined,
      totalSize: prev.contentFile?.size || 0,
    }));
  };

  const delContentFile = () => {
    setDualFileState(prev => ({
      ...prev,
      contentFile: undefined,
      contentHash: undefined,
      totalSize: prev.previewImage?.size || 0,
    }));
  };

  const changeMode = (m: ContentMode) => {
    setMode(m);
    delImg();
    delDualFiles();
    setFormData({ name: "text", value: "" });
    setFormData({ name: "url", value: "" });
  };

  const calcTimeToMine = (diff: number) => {
    // 33 bits (4 bytes + 1 bit to make the next 64 bit number unsigned)
    // Hashrate estimates per algorithm (RTX 4090 approx):
    //   SHA256d: ~5 GH/s, Blake3: ~8 GH/s, K12: ~6 GH/s
    const hashRates: Record<string, number> = {
      'sha256d': 5_000_000_000,
      'blake3': 8_000_000_000,
      'k12': 6_000_000_000,
    };
    const rate = hashRates[formData.algorithm] || 5_000_000_000;
    const seconds = Math.round((diff * Math.pow(2, 33)) / rate);
    if (seconds > 86400) {
      return `${Math.round(seconds / 864) / 100} days`;
    }
    if (seconds > 3600) {
      return `${Math.round(seconds / 36) / 100} hours`;
    }
    if (seconds > 60) {
      return `${Math.round(seconds / 0.6) / 100} minutes`;
    }
    return `${seconds} seconds`;
  };

  const diff = parseInt(formData.difficulty, 10);
  const timeToMine = diff > 0 ? calcTimeToMine(diff) : "";
  const effectiveNumContracts = isAdaptiveDaaMode(formData.daaMode)
    ? 1
    : clampNumContracts(formData.numContracts);
  const totalDmintSupply =
    effectiveNumContracts *
      parseInt(formData.maxHeight, 10) *
      parseInt(formData.reward, 10) +
    parseInt(formData.premine, 10);

  return (
    <>
      <ContentContainer>
        <PageHeader back to="/objects">
          <Trans>
            Mint <TokenType type={tokenType} />
          </Trans>
        </PageHeader>

        <form onSubmit={clean ? mint : preview}>
          <Container
            as={Grid}
            maxW="container.lg"
            gap={4}
            mb={16}
            pt={8}
            mt={-4}
            {...rootProps}
          >
            {apiKey === "" && fileState.ipfs && (
              <Alert status="info">
                <AlertIcon />
                <span>
                  <Trans>
                    No NFT.Storage API key has been provided. To upload large
                    files, please go to{" "}
                    <Text
                      as={Link}
                      to="/settings/ipfs"
                      textDecoration="underline"
                    >
                      IPFS Settings
                    </Text>{" "}
                    and enter your key.
                  </Trans>
                </span>
              </Alert>
            )}
            {tokenType !== "user" && (
              <FormSection>
                <FormControl>
                  <FormLabel>{t`Author`}</FormLabel>
                  <Select name="authorId" onChange={onFormChange}>
                    <option value="">{t`None`}</option>
                    {users.map((u, index) => (
                      <option key={u.ref} value={index}>
                        {u.name} [{Outpoint.fromString(u.ref).shortRef()}]
                      </option>
                    ))}
                  </Select>
                  <FormHelperText>
                    {t`Assigning an author is recommended for authentication of tokens.`}
                  </FormHelperText>
                </FormControl>
                {tokenType === "object" && (
                  <FormControl>
                    <FormLabel>{t`Container`}</FormLabel>
                    <Select name="containerId" onChange={onFormChange}>
                      <option value="">None</option>
                      {containers.map((c, index) => (
                        <option key={c.ref} value={index}>
                          {c.name} [{Outpoint.fromString(c.ref).shortRef()}]
                        </option>
                      ))}
                    </Select>
                    <FormHelperText>
                      {t`Containers can be used to create token collections`}
                    </FormHelperText>
                  </FormControl>
                )}
              </FormSection>
            )}
            <FormSection>
              <FormControl>
                <FormLabel>{t`What data do you want to store?`}</FormLabel>
                <RadioGroup defaultValue="file" onChange={changeMode}>
                  <Stack spacing={5} direction="row">
                    <Radio value="file">{t`File`}</Radio>
                    <Radio value="dual">{t`Preview + Content`}</Radio>
                    <Radio value="url">{t`URL`}</Radio>
                    <Radio value="text">{t`Text`}</Radio>
                  </Stack>
                </RadioGroup>
              </FormControl>
              <Divider />

              {mode === "file" && (
                <>
                  {/* Not sure why z-index fixes glow box */}
                  <FormControl zIndex={0}>
                    <FormLabel>{t`File`}</FormLabel>
                    <FormHelperText mb={4}>
                      {t`Upload an image, text file or other content (max ${formatNumber(mintEmbedMaxBytes / 1000)} KB)`}
                    </FormHelperText>
                    {fileState.file?.data ? (
                      <Flex
                        height={{ base: "150px", md: "200px" }}
                        p={4}
                        alignItems="center"
                        justifyContent="space-between"
                        flexDir="row"
                        gap={4}
                        bg="blackAlpha.500"
                        borderRadius="md"
                      >
                        {fileState.imgSrc && (
                          <Image
                            ref={img}
                            src={`data:${fileState.file.type};base64, ${fileState.imgSrc}`}
                            objectFit="contain"
                            height="100%"
                            maxW={{ base: "160px", md: "230px" }}
                            //sx={{ imageRendering: "pixelated" }} // TODO find a way to apply this to pixel art
                          />
                        )}
                        <Box flexGrow={1}>
                          <div>{fileState.file.name}</div>
                          <Text color="gray.400">
                            {fileState.file.type || "text/plain"}
                          </Text>
                          <Text color="gray.400">
                            {filesize(fileState.file.size || 0) as string}
                          </Text>
                        </Box>
                        <IconButton
                          icon={<DeleteIcon />}
                          onClick={() => delImg()}
                          isDisabled={!fileState.file?.data}
                          aria-label="delete"
                          mx={4}
                        />
                      </Flex>
                    ) : (
                      <Flex
                        justifyContent="center"
                        alignItems="center"
                        gap={6}
                        height="200px"
                      >
                        <TargetBox
                          getInputProps={getInputProps}
                          isDragActive={isDragActive}
                          onClick={onClick}
                        />
                      </Flex>
                    )}
                  </FormControl>
                </>
              )}
              {mode === "file" && fileState.file?.data && !fileState.ipfs && (
                <>
                  <Alert status="info">
                    <AlertIcon /> {t`Your file will be stored on-chain.`}
                  </Alert>
                  <Alert status="warning" mt={2}>
                    <AlertIcon />
                    <Text>
                      {t`Estimated fee: ~${photonsToRXD(estimateMintFee(fileState.file.size || 0, feeRate.value))} ${network.value.ticker}`}
                      {(fileState.file.size || 0) > 50000 && (
                        <Text as="span" fontWeight="bold" color="orange.300">
                          {" "}{t`(Large file - consider compressing)`}
                        </Text>
                      )}
                    </Text>
                  </Alert>
                </>
              )}
              {mode === "file" && fileState.file?.data && fileState.ipfs && (
                <Alert status="info">
                  <AlertIcon />
                  {t`Your file will be stored in IPFS.`}{" "}
                  {fileState.stampSupported &&
                    t`A HashStamp image may be stored on-chain.`}
                </Alert>
              )}
              {mode === "file" && fileState.file?.data && fileState.ipfs && (
                <>
                  <Divider />
                  {fileState.cid && (
                    <FormControl>
                      <FormLabel>{t`IPFS`}</FormLabel>
                      <Trans>
                        <FormHelperText mb={4}>
                          Your uploaded file will have the following URL
                        </FormHelperText>
                        <Identifier overflowWrap="anywhere">
                          ipfs://{fileState.cid}
                        </Identifier>
                      </Trans>
                    </FormControl>
                  )}
                  {fileState.stampSupported && (
                    <>
                      <Divider />
                      <FormControl>
                        <FormLabel>{t`HashStamp`}</FormLabel>
                        <RadioGroup
                          defaultValue="1"
                          onChange={(value) => setEnableHashstamp(!!value)}
                        >
                          <Stack spacing={5} direction="row">
                            <Radio value="1">
                              {t`Store HashStamp on-chain`}
                            </Radio>
                            <Radio value="">{t`No HashStamp`}</Radio>
                          </Stack>
                        </RadioGroup>
                        <FormHelperText mb={4}>
                          {t`A compressed copy of the token image stored on-chain`}
                        </FormHelperText>
                        {enableHashstamp && (
                          <>
                            <div />
                            <Flex
                              p={4}
                              alignItems="top"
                              flexDir="row"
                              gap={4}
                              bg="blackAlpha.500"
                              borderRadius="md"
                            >
                              {fileState.file && (
                                <HashStamp
                                  img={fileState.file.data}
                                  onRender={(hashStampData) =>
                                    setHashstamp(hashStampData)
                                  }
                                />
                              )}
                            </Flex>
                          </>
                        )}
                      </FormControl>
                    </>
                  )}
                </>
              )}
              {mode === "dual" && (
                <>
                  <FormControl>
                    <FormLabel>{t`Preview Image + Content File`}</FormLabel>
                    <FormHelperText mb={4}>
                      {t`Upload a preview image (like book cover) and content file (max ${formatNumber(mintEmbedMaxBytes / 1000)} KB total)`}
                    </FormHelperText>
                  </FormControl>
                  
                  {/* Preview Image Upload */}
                  <FormControl zIndex={0}>
                    <FormLabel>{t`Preview Image`}</FormLabel>
                    {dualFileState.previewImage?.data ? (
                      <Flex
                        height={{ base: "120px", md: "150px" }}
                        p={4}
                        alignItems="center"
                        justifyContent="space-between"
                        flexDir="row"
                        gap={4}
                        bg="blackAlpha.500"
                        borderRadius="md"
                      >
                        {dualFileState.previewImgSrc && (
                          <Image
                            src={`data:${dualFileState.previewImage.type};base64, ${dualFileState.previewImgSrc}`}
                            objectFit="contain"
                            height="100%"
                            maxW={{ base: "120px", md: "150px" }}
                          />
                        )}
                        <Box flexGrow={1}>
                          <div>{dualFileState.previewImage.name}</div>
                          <Text color="gray.400">
                            {dualFileState.previewImage.type}
                          </Text>
                          <Text color="gray.400">
                            {filesize(dualFileState.previewImage.size) as string}
                          </Text>
                        </Box>
                        <IconButton
                          icon={<DeleteIcon />}
                          onClick={() => delPreviewImage()}
                          aria-label="delete preview"
                        />
                      </Flex>
                    ) : (
                      <Flex
                        justifyContent="center"
                        alignItems="center"
                        gap={6}
                        height="120px"
                      >
                        <TargetBox
                          getInputProps={getPreviewInputProps}
                          isDragActive={isPreviewDragActive}
                          onClick={onPreviewClick}
                        />
                      </Flex>
                    )}
                  </FormControl>

                  {/* Content File Upload */}
                  <FormControl zIndex={0}>
                    <FormLabel>{t`Content File`}</FormLabel>
                    {dualFileState.contentFile?.data ? (
                      <Flex
                        height={{ base: "120px", md: "150px" }}
                        p={4}
                        alignItems="center"
                        justifyContent="space-between"
                        flexDir="row"
                        gap={4}
                        bg="blackAlpha.500"
                        borderRadius="md"
                      >
                        <Box flexGrow={1}>
                          <div>{dualFileState.contentFile.name}</div>
                          <Text color="gray.400">
                            {dualFileState.contentFile.type || "application/octet-stream"}
                          </Text>
                          <Text color="gray.400">
                            {filesize(dualFileState.contentFile.size) as string}
                          </Text>
                        </Box>
                        <IconButton
                          icon={<DeleteIcon />}
                          onClick={() => delContentFile()}
                          aria-label="delete content"
                        />
                      </Flex>
                    ) : (
                      <Flex
                        justifyContent="center"
                        alignItems="center"
                        gap={6}
                        height="120px"
                      >
                        <TargetBox
                          getInputProps={getContentInputProps}
                          isDragActive={isContentDragActive}
                          onClick={onContentClick}
                        />
                      </Flex>
                    )}
                  </FormControl>

                  {/* Combined Size Display */}
                  {(dualFileState.previewImage || dualFileState.contentFile) && (
                    <>
                      <Alert status="info">
                        <AlertIcon />
                        <Text>
                          {t`Combined size: ${filesize(dualFileState.totalSize) as string} / ${formatNumber(mintEmbedMaxBytes / 1000)} KB`}
                        </Text>
                      </Alert>
                      <Alert status="warning" mt={2}>
                        <AlertIcon />
                        <Text>
                          {t`Estimated fee: ~${photonsToRXD(estimateMintFee(dualFileState.totalSize, feeRate.value))} ${network.value.ticker}`}
                          {dualFileState.totalSize > 50000 && (
                            <Text as="span" fontWeight="bold" color="orange.300">
                              {" "}{t`(Large file - consider compressing)`}
                            </Text>
                          )}
                        </Text>
                      </Alert>
                    </>
                  )}
                </>
              )}
              {mode === "text" && (
                <>
                  <FormControl>
                    <FormLabel>Text</FormLabel>
                    <FormHelperText mb={4}>
                      {t`Enter text content (max ${formatNumber(mintEmbedMaxBytes / 1000)} KB)`}
                    </FormHelperText>
                    <Textarea
                      name="text"
                      bgColor="whiteAlpha.50"
                      borderColor="transparent"
                      onChange={onFormChange}
                    />
                  </FormControl>
                </>
              )}
              {mode === "url" && (
                <>
                  <FormControl>
                    <FormLabel>URL</FormLabel>
                    <FormHelperText mb={4}>
                      {t`Enter a URL (max ${formatNumber(mintEmbedMaxBytes / 1000)} KB)`}
                    </FormHelperText>
                    <Input name="url" onChange={onFormChange} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>File type</FormLabel>
                    <Input
                      placeholder="html"
                      name="urlFileType"
                      onChange={onFormChange}
                    />
                    <FormHelperText>
                      {t`Type of content the URL links to. Leave empty for a website link.`}
                    </FormHelperText>
                  </FormControl>
                </>
              )}
            </FormSection>
            <FormSection>
              {tokenType === "fungible" && (
                <>
                  <FormControl>
                    <FormLabel>{t`Ticker`}</FormLabel>
                    <Input
                      placeholder="Ticker"
                      name="ticker"
                      onChange={onFormChange}
                      required
                    />
                  </FormControl>
                </>
              )}
              <FormControl>
                <FormLabel>{t`Name`}</FormLabel>
                <Input
                  placeholder={t`Name`}
                  name="name"
                  onChange={onFormChange}
                  required
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t`Description`}</FormLabel>
                <Input
                  placeholder={t`Description`}
                  name="desc"
                  onChange={onFormChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t`License`}</FormLabel>
                <Input
                  placeholder={t`License`}
                  name="license"
                  onChange={onFormChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t`Attributes`}</FormLabel>
                <Box>
                  <HStack wrap="wrap">
                    <Input
                      placeholder={t`Name`}
                      ref={attrName}
                      width="auto"
                      flexGrow={1}
                    />
                    <Input
                      placeholder={t`Value`}
                      ref={attrValue}
                      width="auto"
                      flexGrow={1}
                    />
                    <Button
                      leftIcon={<AddIcon />}
                      onClick={addAttr}
                      aria-label={t`Add attribute`}
                    >
                      Add
                    </Button>
                  </HStack>
                  <FormHelperText>
                    {t`Properties that describe your asset`}
                  </FormHelperText>
                  {attrs.length > 0 && (
                    <Flex gap={4} flexWrap="wrap" mt={4}>
                      {attrs.map(([name, value], index) => (
                        <Tag size="lg" key={`${name}-${value}-${index}`}>
                          <TagLabel>
                            <b>{name}:</b> {value}
                          </TagLabel>
                          <TagCloseButton onClick={() => delAttr(index)} />
                        </Tag>
                      ))}
                    </Flex>
                  )}
                </Box>
              </FormControl>
              {tokenType !== "fungible" && (
                <FormControl>
                  <FormLabel>{t`Immutable`}</FormLabel>
                  <RadioGroup
                    name="immutable"
                    defaultValue={tokenType === "object" ? "1" : "0"}
                  >
                    <Stack spacing={5} direction="row">
                      <Radio value="1" onChange={onFormChange}>
                        {t`Yes`}
                      </Radio>
                      <Radio value="0" onChange={onFormChange}>
                        {t`No, allow token owner to modify`}
                      </Radio>
                    </Stack>
                  </RadioGroup>
                  {["user", "container"].includes(tokenType) && (
                    <FormHelperText mb={4}>
                      {t`Mutable tokens are recommended for user and container tokens`}
                    </FormHelperText>
                  )}
                </FormControl>
              )}
            </FormSection>
            {formData.immutable !== "1" && (
              <Alert status="info">
                <AlertIcon />
                {t`Mutable tokens are not yet fully supported by Photonic Wallet, however a mutable contract containing 1 photon will be created.`}
              </Alert>
            )}
            {tokenType === "fungible" && (
              <>
                <FormSection>
                  <FormControl>
                    <FormLabel>{t`Deployment method`}</FormLabel>
                    <Select name="deployMethod" onChange={onFormChange}>
                      <option value="direct">{t`Direct to wallet`}</option>
                      <option value="dmint">{t`Decentralized mint`}</option>
                    </Select>
                  </FormControl>
                  <Divider />
                  {formData.deployMethod === "dmint" && (
                    <>
                      <FormControl>
                        <FormLabel>{t`Mining Algorithm`}</FormLabel>
                        <Select
                          name="algorithm"
                          defaultValue={formData.algorithm}
                          onChange={onFormChange}
                        >
                          <option value="sha256d">SHA256d (Legacy)</option>
                          <option value="blake3">Blake3 (Recommended)</option>
                          <option value="k12">KangarooTwelve</option>
                        </Select>
                        <FormHelperText>
                          {formData.algorithm === 'sha256d' 
                            ? "Legacy double-SHA256 algorithm. Competes with Radiant L1 mining hashrate."
                            : formData.algorithm === 'blake3'
                            ? "High-performance GPU-friendly hash. Requires V2 fork (block 410,000)."
                            : formData.algorithm === 'k12'
                            ? "Keccak-based hash, excellent CPU/GPU balance. Requires V2 fork (block 410,000)."
                            : ""
                          }
                        </FormHelperText>
                      </FormControl>
                      {(formData.algorithm === 'blake3' || formData.algorithm === 'k12') && (
                        <Alert status="info" fontSize="sm">
                          <AlertIcon />
                          {formData.algorithm === 'blake3' ? 'Blake3' : 'KangarooTwelve'} uses on-chain OP_{formData.algorithm === 'blake3' ? 'BLAKE3' : 'K12'} (V2 hard fork, block 410,000). Contracts deployed before activation will not be mineable.
                        </Alert>
                      )}
                      <FormControl>
                        <FormLabel>{t`Difficulty Adjustment`}</FormLabel>
                        <Select
                          name="daaMode"
                          defaultValue={formData.daaMode}
                          onChange={onFormChange}
                        >
                          <option value="fixed">Fixed Difficulty</option>
                          <option value="asert">ASERT (Recommended)</option>
                          <option value="lwma">LWMA</option>
                          <option value="epoch">Epoch-Based</option>
                          <option value="schedule">Schedule</option>
                        </Select>
                        <FormHelperText>
                          {formData.daaMode === 'fixed'
                            ? "Difficulty never changes"
                            : formData.daaMode === 'asert'
                            ? "Exponential moving average, smooth adjustments"
                            : formData.daaMode === 'lwma'
                            ? "Linear weighted moving average"
                            : formData.daaMode === 'epoch'
                            ? "Bitcoin-style periodic adjustment"
                            : "Pre-determined difficulty curve"
                          }
                        </FormHelperText>
                      </FormControl>
                      {formData.daaMode !== 'fixed' && (
                        <FormControl>
                          <FormLabel>{t`Target Block Time (seconds)`}</FormLabel>
                          <Input
                            defaultValue={formData.targetBlockTime}
                            placeholder="60"
                            name="targetBlockTime"
                            type="number"
                            onChange={onFormChange}
                            min={10}
                            max={3600}
                          />
                          <FormHelperText>
                            Desired time between mints. Higher values reduce collisions.
                          </FormHelperText>
                        </FormControl>
                      )}
                      
                      {/* DAA-specific parameters */}
                      {formData.daaMode === 'asert' && (
                        <>
                          <FormControl>
                            <FormLabel>{t`ASERT Half Life (blocks)`}</FormLabel>
                            <Input
                              defaultValue={formData.asertHalfLife || "1000"}
                              placeholder="1000"
                              name="asertHalfLife"
                              type="number"
                              onChange={onFormChange}
                              min={100}
                              max={10000}
                            />
                            <FormHelperText>
                              Controls how quickly difficulty adjusts. Higher values = slower adjustment.
                            </FormHelperText>
                          </FormControl>
                          <FormControl>
                            <FormLabel>{t`ASERT Asymptote (optional)`}</FormLabel>
                            <Input
                              defaultValue={formData.asertAsymptote || "0"}
                              placeholder="0"
                              name="asertAsymptote"
                              type="number"
                              onChange={onFormChange}
                              min={0}
                              max={1000000}
                            />
                            <FormHelperText>
                              Maximum difficulty ceiling. 0 = no ceiling.
                            </FormHelperText>
                          </FormControl>
                        </>
                      )}
                      
                      {formData.daaMode === 'lwma' && (
                        <FormControl>
                          <FormLabel>{t`LWMA Window Size (blocks)`}</FormLabel>
                          <Input
                            defaultValue={formData.lwmaWindowSize || "144"}
                            placeholder="144"
                            name="lwmaWindowSize"
                            type="number"
                            onChange={onFormChange}
                            min={10}
                            max={1000}
                          />
                          <FormHelperText>
                            Number of recent blocks to consider for difficulty calculation.
                          </FormHelperText>
                        </FormControl>
                      )}
                      
                      {formData.daaMode === 'epoch' && (
                        <>
                          <FormControl>
                            <FormLabel>{t`Epoch Length (blocks)`}</FormLabel>
                            <Input
                              defaultValue={formData.epochLength || "2016"}
                              placeholder="2016"
                              name="epochLength"
                              type="number"
                              onChange={onFormChange}
                              min={100}
                              max={10000}
                            />
                            <FormHelperText>
                              Number of blocks between difficulty adjustments.
                            </FormHelperText>
                          </FormControl>
                          <FormControl>
                            <FormLabel>{t`Max Adjustment Factor`}</FormLabel>
                            <Input
                              defaultValue={formData.maxAdjustment || "4"}
                              placeholder="4"
                              name="maxAdjustment"
                              type="number"
                              onChange={onFormChange}
                              min={1}
                              max={100}
                              step={0.1}
                            />
                            <FormHelperText>
                              Maximum factor difficulty can change per adjustment (e.g., 4 = 4x increase/decrease).
                            </FormHelperText>
                          </FormControl>
                        </>
                      )}
                      
                      {formData.daaMode === 'schedule' && (
                        <FormControl>
                          <FormLabel>{t`Difficulty Schedule`}</FormLabel>
                          <Textarea
                            defaultValue={formData.schedule || "0:1000,1000:500,2000:250"}
                            placeholder="0:1000,1000:500,2000:250"
                            name="schedule"
                            onChange={onFormChange}
                            rows={3}
                          />
                          <FormHelperText>
                            Comma-separated list of height:difficulty pairs. Example: "0:1000,1000:500,2000:250"
                          </FormHelperText>
                        </FormControl>
                      )}
                      <FormControl>
                        <FormLabel>{t`Initial Difficulty`}</FormLabel>
                        <Input
                          defaultValue={formData.difficulty}
                          placeholder="10"
                          name="difficulty"
                          type="number"
                          onChange={onFormChange}
                          min={1}
                          max={1000000}
                        />
                        {timeToMine && (
                          <FormHelperText>
                            Approx {timeToMine} to mine on an RTX 4090 ({formData.algorithm === 'blake3' ? 'Blake3' : formData.algorithm === 'k12' ? 'K12' : 'SHA256d'})
                          </FormHelperText>
                        )}
                        {formData.daaMode === 'fixed' && Number(formData.difficulty) < 2500000 && (
                          <FormHelperText color="orange.500">
                            ⚠️ Low fixed difficulty may cause high collision rates. Consider using dynamic DAA.
                          </FormHelperText>
                        )}
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t`Number of contracts`}</FormLabel>
                        <Input
                          value={isAdaptiveDaaMode(formData.daaMode) ? "1" : formData.numContracts}
                          placeholder=""
                          name="numContracts"
                          type="number"
                          onChange={onFormChange}
                          min={1}
                          max={isAdaptiveDaaMode(formData.daaMode) ? 1 : 32}
                          isDisabled={isAdaptiveDaaMode(formData.daaMode)}
                        />
                        <FormHelperText>
                          {isAdaptiveDaaMode(formData.daaMode)
                            ? t`Adaptive DAA modes require a single contract.`
                            : t`Multiple contracts allows parallel mining, reducing congestion for low difficulty contracts`}
                        </FormHelperText>
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t`Number of mints`}</FormLabel>
                        <Input
                          defaultValue={formData.maxHeight}
                          placeholder=""
                          name="maxHeight"
                          type="number"
                          onChange={onFormChange}
                          min={1}
                        />
                        <FormHelperText>
                          {t`Total number of mints`}
                        </FormHelperText>
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t`Reward`}</FormLabel>
                        <Input
                          defaultValue={formData.reward}
                          placeholder=""
                          name="reward"
                          type="number"
                          onChange={onFormChange}
                          min={1}
                        />
                        <FormHelperText>
                          {t`Number of tokens created on each mint`}
                        </FormHelperText>
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t`Premine`}</FormLabel>
                        <Input
                          placeholder=""
                          name="premine"
                          type="number"
                          onChange={onFormChange}
                          required
                          min={0}
                        />
                        <FormHelperText>
                          {t`Token supply sent directly to your wallet. Requires an equal amount of RXD photons.`}
                        </FormHelperText>
                      </FormControl>
                    </>
                  )}
                  {formData.deployMethod === "direct" && (
                    <FormControl>
                      <FormLabel>{t`Photon Supply`}</FormLabel>
                      <Input
                        placeholder=""
                        name="supply"
                        type="number"
                        onChange={onFormChange}
                        required
                        min={1}
                      />
                      <FormHelperText>
                        {t`Token supply requires an equal amount of RXD photons. This must be provided on mint for "direct to wallet" deployments.`}
                      </FormHelperText>
                    </FormControl>
                  )}
                </FormSection>
                {formData.deployMethod === "dmint" && totalDmintSupply > 0 && (
                  <Alert status="info">
                    <AlertIcon />
                    {t`Total minted supply will be ${totalDmintSupply} ${formData.ticker}`}
                  </Alert>
                )}
              </>
            )}
            {clean && (
              <FormSection>
                <FormControl>
                  <FormLabel>{t`Summary`}</FormLabel>
                  <SimpleGrid
                    templateColumns="max-content max-content"
                    columnGap={8}
                    rowGap={2}
                    py={2}
                  >
                    <Box>{t`Transaction size`}</Box>
                    <Box>{filesize(stats.size) as string}</Box>
                    <Box>{t`Fee`}</Box>
                    <Box>
                      {photonsToRXD(stats.fee)} {network.value.ticker}
                    </Box>
                    {tokenType === "fungible" &&
                      formData.deployMethod === "direct" && (
                        <>
                          <Box>{t`FT supply funding`}</Box>
                          <Box>
                            {photonsToRXD(parseInt(formData.supply, 10))}{" "}
                            {network.value.ticker}
                          </Box>
                        </>
                      )}
                    {tokenType === "fungible" &&
                      formData.deployMethod === "dmint" &&
                      parseInt(formData.premine, 10) > 0 && (
                        <>
                          <Box>{t`Premine supply funding`}</Box>
                          <Box>
                            {photonsToRXD(parseInt(formData.premine, 10))}{" "}
                            {network.value.ticker}
                          </Box>
                        </>
                      )}
                  </SimpleGrid>
                </FormControl>
              </FormSection>
            )}
            <div />
            {clean ? (
              <>
                {isConnected ? (
                  <Alert status="success">
                    <AlertIcon />
                    {t`Your token is ready to mint. Please review all data and the transaction fee before proceeding.`}
                  </Alert>
                ) : (
                  <Alert status="warning">
                    <AlertIcon />
                    {t`Please reconnect to mint your token`}
                  </Alert>
                )}
                <Flex justifyContent="center" py={8} mb={16}>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    w="240px"
                    maxW="100%"
                    isLoading={loading}
                    loadingText="Minting"
                    shadow="dark-md"
                    isDisabled={!isConnected}
                  >
                    {t`Mint`}
                  </Button>
                </Flex>
              </>
            ) : (
              <Flex justifyContent="center" py={8} mb={16}>
                <Button
                  type="submit"
                  size="lg"
                  w="240px"
                  maxW="100%"
                  isLoading={loading}
                  loadingText="Calculating"
                  shadow="dark-md"
                >
                  {t`Calculate Fee`}
                </Button>
              </Flex>
            )}
          </Container>
        </form>
      </ContentContainer>
      <MintSuccessModal
        returnTo={tokenType === "fungible" ? "/fungible" : "/objects"}
        isOpen={isSuccessModalOpen}
        onClose={onSuccessModalClose}
        txid={revealTxIdRef.current}
      />
    </>
  );
}
