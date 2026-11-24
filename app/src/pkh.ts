import { getAddressDetails } from "@lucid-evolution/lucid";
export const pkhOf = (addr: string) => getAddressDetails(addr).paymentCredential!.hash;
