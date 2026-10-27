import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  existsSync,
  readdirSync,
  utimesSync,
  statSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { marked } from "marked";
const root = resolve(import.meta.dirname, "../.."),
  out = join(root, "ui/site-dist"),
  staging = join(root, ".data/public-source-build");
execFileSync(process.execPath, ["--import", "tsx", join(root, "ui/scripts/build-cashflow-example.ts")], { cwd: root, stdio: "inherit" });
const hash = (v) => createHash("sha256").update(v).digest("hex");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// Only this explicit public collection is published. Never traverse private docs/materials.
const navigation = JSON.parse(
  readFileSync(join(root, "docs/protocol/navigation.json"), "utf8")
);
const documents = [];
for (const lang of ["zh", "en"])
  for (const slug of navigation) {
    const text = readFileSync(
      join(root, "docs/protocol", lang, slug + ".md"),
      "utf8"
    );
    let i = 0;
    const headings = [];
    const html = marked
      .parse(text)
      .replace(/<h([23])>(.*?)<\/h\1>/g, (_, n, title) => {
        const id = `section-${++i}`;
        headings.push({ id, text: title.replace(/<[^>]*>/g, "") });
        return `<h${n} id="${id}">${title}</h${n}>`;
      });
    documents.push({
      lang,
      slug,
      title: text.match(/^# (.*)/)[1],
      html,
      headings,
      text: text.replace(/<[^>]*>/g, ""),
    });
  }
writeFileSync(
  join(root, "ui/site/src/docs.generated.json"),
  JSON.stringify(documents)
);
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
const put = (p, data) => {
  mkdirSync(dirname(join(staging, p)), { recursive: true });
  writeFileSync(join(staging, p), data);
};
for (const name of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "hardhat.config.ts",
  "LICENSE",
])
  put(name, readFileSync(join(root, "ui/source-package", name)));
const entries = [
  ["contracts/core/DeyeRWA.sol", "DeyeRWA"],
  ["contracts/revenue/RevenueShareVault.sol", "RevenueShareVault"],
  ["contracts/revenue/RevenueShareVaultV3.sol", "RevenueShareVaultV3"],
  ["contracts/revenue/RevenueShareVaultV4.sol", "RevenueShareVaultV4"],
  ["contracts/revenue/RevenueShareVaultV5.sol", "RevenueShareVaultV5"],
  ["contracts/revenue/HouseholdBilling.sol", "HouseholdBilling"],
  ["contracts/mocks/MockUSDC.sol", "MockUSDC"],
];
const contracts = [],
  sources = {};
let settings, compiler;
for (const [source, name] of entries) {
  const artifactDir = join(root, "onchain/artifacts", source);
  const dbg = JSON.parse(
    readFileSync(join(artifactDir, `${name}.dbg.json`), "utf8")
  );
  const info = JSON.parse(
    readFileSync(resolve(artifactDir, dbg.buildInfo), "utf8")
  );
  const compiled = info.output.contracts[source][name];
  const metadata = JSON.parse(compiled.metadata);
  for (const file of Object.keys(metadata.sources)) {
    const content = info.input.sources[file].content;
    // Reject stale compiler artifacts rather than advertising old code as the current source.
    const local = join(
      root,
      file.startsWith("@") ? "node_modules" : "onchain",
      file
    );
    if (readFileSync(local, "utf8") !== content)
      throw new Error(`Compile current sources first: ${file}`);
    sources[file] = { content };
    put(file.startsWith("@") ? "vendor/" + file : file, content);
  }
  settings = info.input.settings;
  compiler = info.solcLongVersion;
  put(`abi/${name}.json`, JSON.stringify(compiled.abi, null, 2) + "\n");
  contracts.push({
    name,
    source,
    abi: compiled.abi,
    runtimeBytecode: compiled.evm.deployedBytecode.object,
    immutableReferences: compiled.evm.deployedBytecode.immutableReferences,
  });
}
put(
  "licenses/OpenZeppelin-LICENSE.txt",
  readFileSync(join(root, "ui/source-package/OpenZeppelin-LICENSE.txt"))
);
put("scripts/monthly-code.ts",readFileSync(join(root,"onchain/scripts/monthly-code.ts")));
put("test/revenue-monthly.spec.ts",readFileSync(join(root,"onchain/test/revenue-monthly.spec.ts")));
const input = { language: "Solidity", sources, settings };
put("compiler-input.json", JSON.stringify(input, null, 2) + "\n");
put(
  "build-manifest.json",
  JSON.stringify({ compiler, contracts }, null, 2) + "\n"
);
put(
  "test/revenue-share.spec.ts",
  readFileSync(join(root, "onchain/test/revenue-share.spec.ts"))
);
put("test/household-billing.spec.ts",readFileSync(join(root,"onchain/test/household-billing.spec.ts")));
put(
  "scripts/deploy-revenue.ts",
  readFileSync(join(root, "onchain/scripts/deploy-revenue.ts"))
);
put(
  "scripts/deploy-local.ts",
  `import { ethers } from "hardhat";\nasync function main(){\n const [admin]=await ethers.getSigners(); if(!admin)throw new Error("Configure DEPLOYER_PRIVATE_KEY for a local test system account");\n const required=["MANAGER_ADDRESS","TRUSTEE_A_ADDRESS","TRUSTEE_B_ADDRESS","TREASURY_ADDRESS"];\n const roles=required.map(k=>{if(!process.env[k])throw new Error("Missing "+k);return ethers.getAddress(process.env[k]!);});\n if(new Set(roles.slice(0,3)).size!==3)throw new Error("Manager and trustees must be distinct");\n const usdc=await(await ethers.getContractFactory("MockUSDC")).deploy(admin.address); await usdc.waitForDeployment();\n const station=await(await ethers.getContractFactory("DeyeRWA")).deploy(admin.address); await station.waitForDeployment();\n const vault=await(await ethers.getContractFactory("RevenueShareVaultV5")).deploy(admin.address,...roles,await usdc.getAddress(),await station.getAddress()); await vault.waitForDeployment();\n await(await station.grantRole(await station.ISSUER_ROLE(),roles[0])).wait();\n const billing=await(await ethers.getContractFactory("HouseholdBilling")).deploy(await usdc.getAddress(),await vault.getAddress(),roles[0],roles[3]); await billing.waitForDeployment(); await(await vault.grantRole(await vault.TREASURY(),await billing.getAddress())).wait();\n console.log(JSON.stringify({chainId:Number((await ethers.provider.getNetwork()).chainId),usdc:await usdc.getAddress(),station:await station.getAddress(),vault:await vault.getAddress(),billing:await billing.getAddress()},null,2));\n}\nmain().catch(e=>{console.error(e.message);process.exitCode=1;});\n`
);
put(
  "scripts/reproduce.cjs",
  `const fs=require('node:fs'),assert=require('node:assert/strict'),solc=require('solc');\nconst input=JSON.parse(fs.readFileSync('compiler-input.json')),manifest=JSON.parse(fs.readFileSync('build-manifest.json'));\nassert.equal(solc.version(),manifest.compiler);const result=JSON.parse(solc.compile(JSON.stringify(input)));\nassert.equal((result.errors||[]).filter(e=>e.severity==='error').length,0);\nfor(const c of manifest.contracts){const actual=result.contracts[c.source][c.name];assert.equal(actual.evm.deployedBytecode.object,c.runtimeBytecode);assert.deepEqual(actual.abi,c.abi);console.log('PASS '+c.name+' bytecode and ABI');}\n`
);
put(
  "README.md",
  `# Deye RWA contracts\n\nLocal revenue-rights demonstration. Project code is MIT; see LICENSE and licenses/. This code has not been independently audited.\n\n## Reproduce and test\n\nUse Node.js 22.19 or later. Run npm ci, npm run compile, npm test, and npm run reproduce. Solidity is pinned to 0.8.26 with Cancun and optimizer runs 200; the local solc package avoids compiler downloads. Tests use disposable in-process Hardhat accounts.\n\ncompiler-input.json contains the exact standard compiler input; vendor/ includes the transitive OpenZeppelin sources used. build-manifest.json records compiler output and ABI. npm run reproduce checks both. The outer source manifest identifies the archive by SHA-256.\n\n## Optional local deployment\n\nSet LOCAL_RPC_URL (default http://127.0.0.1:18545), DEPLOYER_PRIVATE_KEY for a funded local system wallet, MANAGER_ADDRESS, TRUSTEE_A_ADDRESS, TRUSTEE_B_ADDRESS, and TREASURY_ADDRESS. Run npm run deploy. This explicitly deploys a NEW set of contracts and does not update an existing application's deployment manifest. Do not use real-money accounts. No secrets are included in this package.\n\nEquipment remains with its owner. No guaranteed coupon or principal repayment is provided. One station NFT identifies defined rights; investor shares mint only at successful settlement.\n`
);
const files = [];
function collect(dir, prefix = "") {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name),
      relative = prefix + name;
    if (statSync(path).isDirectory()) collect(path, relative + "/");
    else files.push({ path: relative, sha256: hash(readFileSync(path)) });
    utimesSync(path, 0, 0);
  }
}
collect(staging);
utimesSync(staging, 0, 0);
const publicDir = join(out, "contracts");
mkdirSync(publicDir, { recursive: true });
cpSync(staging, join(publicDir, "files"), { recursive: true });
// Archive contains only allowlisted/generated files. Fixed timestamps make repeat builds stable.
const archive = join(publicDir, "deye-rwa-source.tar.gz");
execFileSync(
  "tar",
  ["-czf", archive, "-C", staging, ...readdirSync(staging).sort()],
  { env: { ...process.env, COPYFILE_DISABLE: "1" } }
);
writeFileSync(
  join(publicDir, "manifest.json"),
  JSON.stringify({
    version: "deye-public-source.v1",
    compiler,
    contracts,
    files,
    bundleHash: hash(readFileSync(archive)),
  })
);
console.log(
  `Public build prepared: ${documents.length} documents, ${files.length} source-package files.`
);
