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

// IPFS uploading is currently disabled until an alternative to nft.storage can be found
const MAX_BYTES = 100_000;
//const MAX_IPFS_BYTES = 5_000_000;

type ContentMode = "file" | "text" | "url";

function Divider() {
  return <CUIDivider borderColor="whiteAlpha.300" borderBottomWidth={2} />;
}

function cleanError(message: string) {
  return message.replace(/(\(code \d+\)).*/s, "$1").substring(0, 200);
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
              {t`Maximum 100kb`}
            </Text>
          </>
        )}
      </Flex>
    </GlowBox>
  );
}

type FileUpload = {
  name: string;
  size: number;
  type: string;
  data: ArrayBuffer;
};

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

const encodeContent = (
  mode: ContentMode,
  fileState: FileState,
  text?: string,
  url?: string,
  urlFileType?: string
): [string, SmartTokenFile | undefined] => {
  const urlContentType =
    (urlFileType && mime.getType(urlFileType)) || "text/html";
  if (mode === "url") {
    return [`main`, { t: urlContentType, u: url as string }];
  }

  if (mode === "text") {
    return ["main", { t: "text/plain", b: new TextEncoder().encode(text) }];
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
  const [enableHashstamp, setEnableHashstamp] = reset(useState(true));
  const [hashStamp, setHashstamp] = reset(useState<ArrayBuffer | undefined>());
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
    setFormData({ name: event.target.name, value: event.target.value });
  };
  const img = useRef<HTMLImageElement>(null);

  const preview = (event: React.FormEvent) => {
    event.preventDefault();
    submit(true);
    return false;
  };
  const mint = (event: React.FormEvent) => {
    event.preventDefault();
    submit(false);
    return false;
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
        onClose: (success) => success && submit(dryRun),
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

    const outputValue = tokenType === "fungible" ? parseInt(supply, 10) : 1;
    if (outputValue < 0 || outputValue > 1000000000000) {
      toast({
        status: "error",
        title: t`Token supply is too high`,
      });
      return;
    }

    setLoading(true);

    const coins = await db.txo
      .where({ contractType: ContractType.RXD, spent: 0 })
      .toArray();

    const [payloadFilename, content] = encodeContent(
      mode,
      fileState,
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
        ? {
            [payloadFilename]: content,
          }
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

    const payload: SmartTokenPayload = {
      p: protocols,
      ...(Object.keys(args).length ? args : undefined),
      ...meta,
      ...fileObj,
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
            const { difficulty, maxHeight, reward, premine, numContracts } =
              fields;
            // Value 1 is for the dmint contracts
            return {
              value: 1,
              method: "dmint" as const,
              params: {
                difficulty: parseInt(difficulty, 10),
                numContracts: parseInt(numContracts, 10),
                maxHeight: parseInt(maxHeight, 10),
                reward: parseInt(reward, 10),
                premine: parseInt(premine, 10),
                address,
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

      const { commitTx, revealTx, fees, size } = mintToken(
        tokenType === "fungible" ? "ft" : "nft",
        deploy,
        wallet.value.wif as string,
        coins,
        payload,
        relInputs,
        feeRate.value
      );

      const broadcast = async (rawTx: string) =>
        await electrumWorker.value.broadcast(rawTx);

      if (!dryRun) {
        // Broadcast commit
        await broadcast(commitTx.toString());
        // Broadcast reveal
        await broadcast(revealTx.toString());
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
      if (files[0].size > MAX_BYTES) {
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

  const changeMode = (m: ContentMode) => {
    setMode(m);
    delImg();
    setFormData({ name: "text", value: "" });
    setFormData({ name: "url", value: "" });
  };

  const calcTimeToMine = (diff: number) => {
    // 33 bits (4 bytes + 1 bit to make the next 64 bit number unsigned)
    // Estimate is for RTX 4090, approx 5 GH/s
    const seconds = Math.round((diff * Math.pow(2, 33)) / 5000000000);
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
  const totalDmintSupply =
    parseInt(formData.numContracts, 10) *
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
                      {t`Upload an image, text file or other content`}
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
                <Alert status="info">
                  <AlertIcon /> {t`Your file will be stored on-chain.`}
                </Alert>
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
              {mode === "text" && (
                <>
                  <FormControl>
                    <FormLabel>Text</FormLabel>
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
                  <HStack>
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
                        <FormLabel>{t`Difficulty`}</FormLabel>
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
                            Approx {timeToMine} to mine on an RTX 4090
                          </FormHelperText>
                        )}
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t`Number of contracts`}</FormLabel>
                        <Input
                          defaultValue={formData.numContracts}
                          placeholder=""
                          name="numContracts"
                          type="number"
                          onChange={onFormChange}
                          min={1}
                          max={32}
                        />
                        <FormHelperText>
                          {t`Multiple contracts allows parallel mining, reducing congestion for low difficulty contracts`}
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
