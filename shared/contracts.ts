// Single source of truth for talking to the validators, used by both the
// emulator tests (Node) and the web app (Vite). Reads the Aiken blueprint.
import blueprintJson from "../onchain/plutus.json" with { type: "json" };
import {
  applyDoubleCborEncoding,
  applyParamsToScript,
  Constr,
  Data,
  mintingPolicyToId,
  validatorToAddress,
  type Network,
  type Script,
} from "@lucid-evolution/lucid";

type Blueprint = { validators: { title: string; compiledCode: string }[] };
const blueprint = blueprintJson as Blueprint;

function code(title: string): string {
  const v = blueprint.validators.find((x) => x.title === title);
  if (!v) throw new Error(`validator ${title} missing from plutus.json — run 'aiken build'`);
  return v.compiledCode;
}

// ---- Vault -------------------------------------------------------------
export const vaultScript: Script = {
  type: "PlutusV3",
  script: applyDoubleCborEncoding(code("vault.vault.spend")),
};
export const vaultAddress = (network: Network) => validatorToAddress(network, vaultScript);

/** VaultDatum { owner: VerificationKeyHash, unlock_after: Int (POSIX ms) } */
export const vaultDatum = (ownerPkh: string, unlockAfterMs: number) =>
  Data.to(new Constr(0, [ownerPkh, BigInt(unlockAfterMs)]));
export const Withdraw = Data.to(new Constr(0, []));

// ---- Course badge ------------------------------------------------------
export const badgePolicy = (issuerPkh: string): Script => ({
  type: "PlutusV3",
  script: applyDoubleCborEncoding(applyParamsToScript(code("course_badge.course_badge.mint"), [issuerPkh])),
});
export const badgePolicyId = (issuerPkh: string) => mintingPolicyToId(badgePolicy(issuerPkh));
export const Issue = Data.to(new Constr(0, []));
export const Burn = Data.to(new Constr(1, []));
