// Koios-shaped fixtures (field names from the Koios v1 OpenAPI spec).
import { credentialToAddress, credentialToRewardAddress, validatorToAddress } from "@lucid-evolution/lucid";
import { SKULL_POLICY, WORK_POLICY, WORK_NAME_HEX, HANDLE_POLICY, skullNameHex, toHex } from "@wd/shared/wd";
import { anvilLock, nativeScript } from "@wd/shared/rescue";

// a made-up mainnet wallet (real, valid encodings)
export const PAY_KEY = "11".repeat(28), STAKE_KEY = "22".repeat(28);
export const ADDR = credentialToAddress("Mainnet", { type: "Key", hash: PAY_KEY }, { type: "Key", hash: STAKE_KEY });
export const STAKE = credentialToRewardAddress("Mainnet", { type: "Key", hash: STAKE_KEY });
// its Anvil staking vault (unlock time comes from the lock tx message) and an open Minswap order
export const LOCK_MSG = "Staking Contract Assets locked until Sun, 03 Sep 2023 00:49:53 GMT.";
export const VAULT_LOCK = anvilLock(STAKE_KEY, 102135902);
export const VAULT_ADDR = validatorToAddress("Mainnet", nativeScript(VAULT_LOCK), { type: "Key", hash: STAKE_KEY });
export const ORDER_ADDR = credentialToAddress("Mainnet", { type: "Script", hash: "c3e28c36c3447315ba5a56f33da6a6ddc1770a876a8d9f0cb3a97c4c" }, { type: "Key", hash: STAKE_KEY });

export const meta = (n: number, extra: Record<string, unknown> = {}) => ({
  "721": {
    [SKULL_POLICY]: {
      ["TheWorkingDead" + n]: {
        name: `The Working Dead #${n}`,
        image: n % 2 ? `ipfs://QmSkull${n}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` : ["ipfs://ipfs/bafySkull", `${n}bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`],
        mediaType: "image/png",
        Background: "Grave Moss",
        Skull: "Bone",
        Job: { Title: "Night Shift", Tool: "Shovel" },
        ...extra,
      },
    },
  },
});

export function koiosFetch(log: string[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/api\/v1/, "");
    const q = new URL(url).searchParams;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    log.push(path);
    let out: unknown;
    switch (path) {
      case "/address_info":
        out = [{ address: ADDR, balance: "12500000", stake_address: STAKE }];
        break;
      case "/account_info":
        out = [{ stake_address: STAKE, total_balance: "42000000" }];
        break;
      case "/account_assets":
        out = [
          { stake_address: STAKE, policy_id: SKULL_POLICY, asset_name: skullNameHex(2498), quantity: "1" },
          { stake_address: STAKE, policy_id: SKULL_POLICY, asset_name: skullNameHex(131), quantity: "1" },
          { stake_address: STAKE, policy_id: SKULL_POLICY, asset_name: skullNameHex(1311), quantity: "1" },
          { stake_address: STAKE, policy_id: SKULL_POLICY, asset_name: skullNameHex(1334), quantity: "1" },
          { stake_address: STAKE, policy_id: WORK_POLICY, asset_name: WORK_NAME_HEX, quantity: "68085" },
          { stake_address: STAKE, policy_id: "ab".repeat(28), asset_name: "00", quantity: "5" },
        ];
        break;
      case "/account_utxos": {
        const a = (policy_id: string, asset_name: string, quantity: string) => ({ policy_id, asset_name, quantity });
        out = [
          { tx_hash: "aa".repeat(32), tx_index: 0, address: ADDR, value: "40000000", asset_list: [a(SKULL_POLICY, skullNameHex(2498), "1")] },
          { tx_hash: "bb".repeat(32), tx_index: 0, address: VAULT_ADDR, value: "3000000", asset_list: [a(SKULL_POLICY, skullNameHex(1311), "1"), a(SKULL_POLICY, skullNameHex(1334), "1")] },
          { tx_hash: "cc".repeat(32), tx_index: 1, address: ORDER_ADDR, value: "4000000", asset_list: [a(WORK_POLICY, WORK_NAME_HEX, "2500")] },
        ];
        break;
      }
      case "/credential_txs":
        out = [{ tx_hash: "dd".repeat(32), block_time: 1693702230 }];
        break;
      case "/tx_metadata":
        out = [{ tx_hash: "dd".repeat(32), metadata: { "674": { msg: [LOCK_MSG] } } }];
        break;
      case "/asset_info":
        out = body._asset_list.map(([p, n]: string[]) => {
          const num = Number(Buffer.from(n, "hex").toString().replace("TheWorkingDead", ""));
          return { policy_id: p, asset_name: n, minting_tx_metadata: meta(num) };
        });
        break;
      case "/asset_addresses":
        if (q.get("_asset_policy") === HANDLE_POLICY)
          out = q.get("_asset_name") === "000de140" + toHex("deadhead") ? [{ payment_address: ADDR, stake_address: STAKE, quantity: "1" }] : [];
        else out = [{ payment_address: ADDR, stake_address: STAKE, quantity: "1" }];
        break;
      default:
        return new Response("nope", { status: 404 });
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

/** Koios /epoch_params row built from Lucid's default protocol parameters. */
export async function epochParams() {
  const { PROTOCOL_PARAMETERS_DEFAULT: p } = await import("@lucid-evolution/lucid");
  const zeroNums = ["pvt_motion_no_confidence", "pvt_committee_normal", "pvt_committee_no_confidence", "pvt_hard_fork_initiation", "pvtpp_security_group",
    "dvt_motion_no_confidence", "dvt_committee_normal", "dvt_committee_no_confidence", "dvt_update_to_constitution", "dvt_hard_fork_initiation",
    "dvt_p_p_network_group", "dvt_p_p_economic_group", "dvt_p_p_technical_group", "dvt_p_p_gov_group", "dvt_treasury_withdrawal",
    "committee_min_size", "committee_max_term_length", "gov_action_lifetime", "drep_activity", "epoch_no", "max_block_size", "max_bh_size",
    "max_epoch", "optimal_pool_count", "influence", "monetary_expand_rate", "treasury_growth_rate", "decentralisation", "max_block_ex_mem", "max_block_ex_steps"];
  return [{
    ...Object.fromEntries(zeroNums.map((k) => [k, 0])),
    gov_action_deposit: String(p.govActionDeposit), drep_deposit: String(p.drepDeposit),
    min_fee_ref_script_cost_per_byte: p.minFeeRefScriptCostPerByte, min_fee_a: p.minFeeA, min_fee_b: p.minFeeB,
    max_tx_size: p.maxTxSize, key_deposit: String(p.keyDeposit), pool_deposit: String(p.poolDeposit),
    extra_entropy: null, protocol_major: (p as any).protocolMajorVersion ?? 10, protocol_minor: (p as any).protocolMinorVersion ?? 0,
    min_utxo_value: "0", min_pool_cost: "0", nonce: "00", block_hash: null,
    cost_models: { PlutusV1: p.costModels.PlutusV1, PlutusV2: p.costModels.PlutusV2, PlutusV3: p.costModels.PlutusV3 },
    price_mem: p.priceMem, price_step: p.priceStep, max_tx_ex_mem: Number(p.maxTxExMem), max_tx_ex_steps: Number(p.maxTxExSteps),
    max_val_size: p.maxValSize, collateral_percent: p.collateralPercentage, max_collateral_inputs: p.maxCollateralInputs,
    coins_per_utxo_size: String(p.coinsPerUtxoByte),
  }];
}

/** The same made-up wallet, served Blockfrost-style. */
export function blockfrostFetch(log: string[] = []): typeof fetch {
  const amt = (lovelace: string, assets: [string, string][] = []) => [{ unit: "lovelace", quantity: lovelace }, ...assets.map(([unit, quantity]) => ({ unit, quantity }))];
  const S = (n: number) => SKULL_POLICY + skullNameHex(n);
  return (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v0/, "");
    log.push(path);
    if ((init?.headers as any)?.project_id !== "mainnetTESTKEY") return new Response("{}", { status: 403 });
    const page = Number(u.searchParams.get("page") ?? "1");
    const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
    if (path === `/addresses/${ADDR}`) return json({ address: ADDR, stake_address: STAKE, amount: amt("40000000", [[S(2498), "1"]]) });
    if (path === `/accounts/${STAKE}`) return json({ controlled_amount: "47000000" });
    if (path === `/accounts/${STAKE}/addresses/assets`) return json(page > 1 ? [] : [[S(2498), "1"], [S(1311), "1"], [S(1334), "1"], [WORK_POLICY + WORK_NAME_HEX, "2500"]].map(([unit, quantity]) => ({ unit, quantity })));
    if (path === `/accounts/${STAKE}/addresses`) return json(page > 1 ? [] : [{ address: ADDR }, { address: VAULT_ADDR }, { address: ORDER_ADDR }]);
    if (path === `/addresses/${VAULT_ADDR}/utxos`) return json(page > 1 ? [] : [{ tx_hash: "bb".repeat(32), output_index: 0, amount: amt("3000000", [[S(1311), "1"], [S(1334), "1"]]), data_hash: null, inline_datum: null }]);
    if (path === `/addresses/${ORDER_ADDR}/utxos`) return json(page > 1 ? [] : [{ tx_hash: "cc".repeat(32), output_index: 1, amount: amt("4000000", [[WORK_POLICY + WORK_NAME_HEX, "2500"]]), data_hash: "ee".repeat(32), inline_datum: null }]);
    if (path === `/addresses/${ADDR}/utxos`) throw new Error("should only fetch script addresses");
    if (path === `/addresses/${VAULT_ADDR}/transactions`) return json([{ tx_hash: "dd".repeat(32) }]);
    if (path === `/txs/${"dd".repeat(32)}/metadata`) return json([{ label: "674", json_metadata: { msg: [LOCK_MSG] } }]);
    if (path.startsWith(`/assets/${HANDLE_POLICY}`)) return path.includes("000de140" + toHex("deadhead")) ? json([{ address: ADDR, quantity: "1" }]) : new Response("{}", { status: 404 });
    const m = /^\/assets\/([0-9a-f]{56})([0-9a-f]*)$/.exec(path);
    if (m) { const num = Number(Buffer.from(m[2], "hex").toString().replace("TheWorkingDead", "")); return json({ policy_id: m[1], asset_name: m[2], onchain_metadata: (meta(num) as any)["721"][m[1]]["TheWorkingDead" + num] }); }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}
