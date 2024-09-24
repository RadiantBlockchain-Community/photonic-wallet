<p align="center">
  <img src="./splash.png">
</p>

## Introduction

Photonic Wallet is a non-custodial wallet for minting and transferring tokens, following the Glyphs Protocol. The code runs completely client side and only requires a connection to an ElectrumX server.

This is alpha software in active development. If you would like to test it, please be cautious and report any bugs.

## Features

- Mint and transfer non-fungible and fungible tokens
- PoW mint contract creation
- Container and author tokens
- IPFS file uploading
- On-chain image thumbnail generation
- CLI for batch minting

## Roadmap

- Modify and seal operations for mutable tokens
- Transfer history
- SPV

## Getting Started

### Install

```bash
pnpm install
```

### Run web development server

```bash
pnpm dev
```

If not using localhost, https may be required for crypto functions to work. This can be enabled by uncommenting `basicSsl` in `vite.config.ts`.

### Build web app and CLI

```bash
pnpm build
```

Builds will be in `packages/app/dist` and `packages/cli/dist`. Web app can be served as a static site.

### Build for Windows, Linux or macOS

```bash
pnpm build:tauri
```

Executables will be in `pacakges/app/src-tauri/target/release`.

Add `-d` for a debug build.

## Photonic Factory CLI

The CLI is used for batch minting tokens. See `packages/cli/README.md` for more information.

## License

MIT. See [LICENSE](LICENSE).
