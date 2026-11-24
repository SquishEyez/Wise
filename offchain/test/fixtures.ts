// Koios-shaped fixtures (field names from the Koios v1 OpenAPI spec).
import { SKULL_POLICY, WORK_POLICY, WORK_NAME_HEX, HANDLE_POLICY, skullNameHex, toHex } from "@wd/shared/wd";

export const ADDR = "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
export const STAKE = "stake1u9ylzsgxaa6xctf4juup682ar3juj85n8tx3hthnljg47zctvm3rc";

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
          { stake_address: STAKE, policy_id: WORK_POLICY, asset_name: WORK_NAME_HEX, quantity: "68085" },
          { stake_address: STAKE, policy_id: "ab".repeat(28), asset_name: "00", quantity: "5" },
        ];
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
