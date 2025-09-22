#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import decodeHexFields from "../src/utils/decodeHexFields.js";
import { jFetch } from "../src/core/net.js";

const require = createRequire(import.meta.url);
const hashMatrix = require("../src/data/hashMatrix.json");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NETWORKS = {
  ghostnet: "https://api.ghostnet.tzkt.io/v1",
  mainnet: "https://api.tzkt.io/v1",
};

const BURN_ADDRESS = "tz1burnburnburnburnburnburnburjAYjjX";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { network: "ghostnet", output: null };
  for (const arg of args) {
    const [key, value] = arg.split("=");
    if (key === "--network" && value) out.network = value.toLowerCase();
    if (key === "--output" && value) out.output = value;
  }
  if (!NETWORKS[out.network]) {
    console.error(`Unsupported network "${out.network}". Use one of: ${Object.keys(NETWORKS).join(", ")}`);
    process.exit(1);
  }
  if (!out.output) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    out.output = path.resolve(__dirname, `../exports/zeroTokens_${out.network}_${stamp}.csv`);
  } else {
    out.output = path.resolve(__dirname, out.output);
  }
  return out;
}

const allowedTypeHashes = new Set(
  Object.keys(hashMatrix)
    .filter((k) => /^-?\d+$/.test(k))
    .map((k) => Number(k)),
);

async function fetchRoster(base) {
  const pageSize = 400;
  const maxPages = 50;
  const list = [];
  const seen = new Set();
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const qs = new URLSearchParams();
    qs.set("typeHash.in", [...allowedTypeHashes].join(","));
    qs.set("select", "address,typeHash,lastActivityTime");
    qs.set("limit", String(pageSize));
    if (offset) qs.set("offset", String(offset));
    const rows = await jFetch(`${base}/contracts?${qs.toString()}`, 2, { ttl: 300_000, priority: "low" }).catch(() => null);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      const address = typeof row?.address === "string" ? row.address : null;
      if (!address || seen.has(address)) continue;
      const rawTypeHash = Number(row?.typeHash ?? row?.type_hash ?? NaN);
      if (Number.isFinite(rawTypeHash) && !allowedTypeHashes.has(rawTypeHash)) continue;
      const lastActivity = Date.parse(row?.lastActivityTime || row?.last_activity_time || "") || 0;
      list.push({ address, typeHash: Number.isFinite(rawTypeHash) ? rawTypeHash : null, lastActivity });
      seen.add(address);
    }
    if (rows.length < pageSize) break;
  }
  list.sort((a, b) => b.lastActivity - a.lastActivity || (a.address > b.address ? 1 : -1));
  return list;
}

function chunk(arr, size = 40) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchBurnedSingles(base, address, ids) {
  if (!ids.length) return new Set();
  const burned = new Set();
  for (const group of chunk(ids, 40)) {
    const qs = new URLSearchParams();
    qs.set("token.contract", address);
    qs.set("token.tokenId.in", group.join(","));
    qs.set("account", BURN_ADDRESS);
    qs.set("balance.gt", "0");
    qs.set("select", "token.tokenId");
    const rows = await jFetch(`${base}/tokens/balances?${qs.toString()}`, 2, { ttl: 45_000, priority: "low" }).catch(() => []);
    for (const row of rows || []) {
      const tokenId = Number(row?.["token.tokenId"] ?? row?.tokenId ?? row);
      if (Number.isFinite(tokenId)) burned.add(tokenId);
    }
  }
  return burned;
}

async function fetchTokensForContract(base, entry) {
  const limit = 200;
  let offset = 0;
  const tokens = [];
  const singles = new Set();

  while (true) {
    const qs = new URLSearchParams();
    qs.set("contract", entry.address);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    qs.set("sort.desc", "tokenId");
    qs.set("totalSupply.gt", "0");
    qs.set("select", "tokenId,totalSupply,holdersCount,metadata,firstTime");
    const rows = await jFetch(`${base}/tokens?${qs.toString()}`, 2, { ttl: 45_000, priority: "low" }).catch(() => null);
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const row of rows) {
      const tokenId = Number(row?.tokenId ?? row?.token?.id ?? NaN);
      if (!Number.isFinite(tokenId)) continue;
      const holdersCount = Number(row?.holdersCount ?? row?.holders_count ?? 0);
      const totalSupply = Number(row?.totalSupply ?? row?.total_supply ?? 0);
      if (totalSupply <= 0) continue;
      if (holdersCount === 1) singles.add(tokenId);
      const metadata = decodeHexFields(row?.metadata || {});
      const firstTime = row?.firstTime || row?.first_time || null;
      tokens.push({
        contract: entry.address,
        typeHash: entry.typeHash,
        tokenId,
        holdersCount,
        totalSupply,
        firstTime,
        metadata,
      });
    }

    offset += rows.length;
    if (rows.length < limit) break;
  }

  if (!tokens.length) return [];
  if (singles.size) {
    const burned = await fetchBurnedSingles(base, entry.address, [...singles]);
    if (burned.size) {
      return tokens.filter((t) => !(t.holdersCount === 1 && burned.has(t.tokenId)));
    }
  }
  return tokens;
}

function formatCsv(rows) {
  const headers = [
    "contract",
    "typeHash",
    "tokenId",
    "firstTime",
    "holdersCount",
    "totalSupply",
    "name",
    "symbol",
    "artifactUri",
    "displayUri",
    "thumbnailUri",
  ];
  const escape = (value) => {
    if (value == null) return "";
    const str = String(value);
    if (/["]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    if (str.includes(",") || str.includes("\n")) return '"' + str + '"';
    return str;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    const data = [
      row.contract,
      row.typeHash,
      row.tokenId,
      row.firstTime || "",
      row.holdersCount,
      row.totalSupply,
      row.metadata?.name ?? "",
      row.metadata?.symbol ?? "",
      row.metadata?.artifactUri ?? row.metadata?.artifact_uri ?? "",
      row.metadata?.displayUri ?? row.metadata?.display_uri ?? "",
      row.metadata?.thumbnailUri ?? row.metadata?.thumbnail_uri ?? "",
    ].map(escape);
    lines.push(data.join(","));
  }
  return lines.join("\n");
}

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const { network, output } = parseArgs();
  const base = NETWORKS[network];
  console.log(`Exporting ZeroContract tokens from ${network} (${base})...`);

  const roster = await fetchRoster(base);
  console.log(`Discovered ${roster.length} ZeroContract collections.`);

  const allTokens = [];
  for (const [index, entry] of roster.entries()) {
    process.stdout.write(`\rScanning contracts ${index + 1}/${roster.length}: ${entry.address}`);
    const tokens = await fetchTokensForContract(base, entry);
    for (const token of tokens) {
      allTokens.push(token);
    }
  }
  process.stdout.write("\r");
  console.log(`Collected ${allTokens.length} active tokens.`);

  allTokens.sort((a, b) => {
    const ta = Date.parse(a.firstTime || "") || 0;
    const tb = Date.parse(b.firstTime || "") || 0;
    if (tb !== ta) return tb - ta;
    if (a.contract !== b.contract) return a.contract > b.contract ? 1 : -1;
    return a.tokenId - b.tokenId;
  });

  const csv = formatCsv(allTokens);
  await ensureDir(output);
  await fs.writeFile(output, csv, "utf8");
  console.log(`CSV written to ${output}`);
}

main().catch((err) => {
  console.error("Export failed", err);
  process.exit(1);
});
