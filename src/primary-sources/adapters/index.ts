import type { PrimarySourceAdapter } from "../types";
import { congress } from "./congress";
import { consilium } from "./consilium";
import { eeas } from "./eeas";
import { eurLex } from "./eur-lex";
import { federalRegister } from "./federal-register";
import { govInfo } from "./govinfo";
import { govUk } from "./gov-uk";
import { mfaTurkiye } from "./mfa-turkiye";
import { nato } from "./nato";
import { osce } from "./osce";
import { tbmm } from "./tbmm";
import { unitedNations } from "./un";

/** Add a new official institution here; the search contract stays unchanged. */
export const SOURCE_ADAPTERS: PrimarySourceAdapter[] = [
  unitedNations,
  eurLex,
  consilium,
  eeas,
  nato,
  govInfo,
  federalRegister,
  congress,
  govUk,
  mfaTurkiye,
  tbmm,
  osce,
];
