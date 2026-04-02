import fs from "fs";
import path from "path";
import { confirm, input, select } from "@inquirer/prompts";
import { Command } from "commander";
import { errorMessage, g, resolveDir } from "../utils";
import { BundleFile, BundleTokenNft } from "../types";

const { log } = console;

export default async function bundleInit(this: Command, inputDir: string) {
  const bundleDir = resolveDir(inputDir);
  const bundle: Partial<BundleFile> = {};
  const filename = path.join(bundleDir, "bundle.json");

  if (fs.existsSync(filename)) {
    this.error(errorMessage("bundle.json already exists"));
  }

  const token: Partial<BundleTokenNft> = {};
  const type = await select({
    message: "Type",
    choices: [
      { name: "Object", value: "object" },
      { name: "User", value: "user" },
      { name: "Container", value: "container" },
    ],
  });
  if (type !== "object") {
    token.type = type;
  }
  if (type !== "user") {
    const author = await input({
      message: "Author ref",
    });
    if (author) {
      token.authorRefs = [author];
    }
  }
  if (type === "object") {
    const container = await input({
      message: "Container ref",
    });
    if (container) {
      token.containerRefs = [container];
    }
  }

  token.name = await input({ message: "Name" });
  const desc = await input({ message: "Description" });
  if (desc) {
    token.desc = desc;
  }

  const inscribe = await select({
    message: "Inscribe",
    choices: [
      { name: "No inscription", value: 0 },
      { name: "File", value: 1 },
      { name: "URL", value: 2 },
    ],
  });

  if (inscribe) {
    const destination = await input({
      message: inscribe === 1 ? "File" : "URL",
    });

    const payloadFilename = await input({ message: "Payload filename" });
    const stamp =
      inscribe === 2 &&
      (await confirm({
        message: "Create on-chain HashStamp image?",
        default: true,
      }));

    token.files = {
      [payloadFilename]:
        inscribe === 1 ? { path: destination } : { src: destination, stamp },
    };
  }

  bundle.tokens = [token as BundleTokenNft];

  fs.writeFileSync(filename, JSON.stringify(bundle, undefined, 2));

  log(g("Bundle file created!"));

  return;
}
