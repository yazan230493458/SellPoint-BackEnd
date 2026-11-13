import es from "../es-complete.json" with { type: "json" };
import { TR } from "./phrase-tr.mjs";
import { PL } from "./phrase-pl.mjs";
import { UK } from "./phrase-uk.mjs";
import { RO } from "./phrase-ro.mjs";
import { CS } from "./phrase-cs.mjs";
import { HU } from "./phrase-hu.mjs";
import { SK } from "./phrase-sk.mjs";
import { SL } from "./phrase-sl.mjs";
import { BG } from "./phrase-bg.mjs";
import { HR } from "./phrase-hr.mjs";
import { SR } from "./phrase-sr.mjs";
import { MK } from "./phrase-mk.mjs";
import { BS } from "./phrase-bs.mjs";
import { SQ } from "./phrase-sq.mjs";
import { SV } from "./phrase-sv.mjs";
import { NB } from "./phrase-nb.mjs";
import { DA } from "./phrase-da.mjs";
import { FI } from "./phrase-fi.mjs";
import { EL } from "./phrase-el.mjs";
import { IS } from "./phrase-is.mjs";
import { LT } from "./phrase-lt.mjs";
import { LV } from "./phrase-lv.mjs";
import { ET } from "./phrase-et.mjs";
import { ZH_CN } from "./phrase-zh-CN.mjs";
import { ZH_TW } from "./phrase-zh-TW.mjs";
import { JA } from "./phrase-ja.mjs";
import { KO } from "./phrase-ko.mjs";
import { HI } from "./phrase-hi.mjs";
import { UR } from "./phrase-ur.mjs";
import { FA } from "./phrase-fa.mjs";
import { HE } from "./phrase-he.mjs";
import { ID } from "./phrase-id.mjs";
import { MS } from "./phrase-ms.mjs";
import { BN } from "./phrase-bn.mjs";
import { TH } from "./phrase-th.mjs";
import { VI } from "./phrase-vi.mjs";
import { FIL } from "./phrase-fil.mjs";
import { TA } from "./phrase-ta.mjs";
import { TE } from "./phrase-te.mjs";
import { MR } from "./phrase-mr.mjs";
import { GU } from "./phrase-gu.mjs";
import { KN } from "./phrase-kn.mjs";
import { ML } from "./phrase-ml.mjs";
import { NE } from "./phrase-ne.mjs";
import { SI } from "./phrase-si.mjs";
import { AZ } from "./phrase-az.mjs";
import { KK } from "./phrase-kk.mjs";
import { UZ } from "./phrase-uz.mjs";
import { HY } from "./phrase-hy.mjs";
import { KA } from "./phrase-ka.mjs";
import { SW } from "./phrase-sw.mjs";
import { AF } from "./phrase-af.mjs";
import { AM } from "./phrase-am.mjs";
import { KM } from "./phrase-km.mjs";
import { LO } from "./phrase-lo.mjs";
import { MY } from "./phrase-my.mjs";
import { MN } from "./phrase-mn.mjs";
import { GA } from "./phrase-ga.mjs";
import { CY } from "./phrase-cy.mjs";

const PHRASE_BY_LOCALE = {
  tr: TR,
  pl: PL,
  uk: UK,
  ro: RO,
  cs: CS,
  hu: HU,
  sk: SK,
  sl: SL,
  bg: BG,
  hr: HR,
  sr: SR,
  mk: MK,
  bs: BS,
  sq: SQ,
  sv: SV,
  nb: NB,
  da: DA,
  fi: FI,
  el: EL,
  is: IS,
  lt: LT,
  lv: LV,
  et: ET,
  "zh-CN": ZH_CN,
  "zh-TW": ZH_TW,
  ja: JA,
  ko: KO,
  hi: HI,
  ur: UR,
  fa: FA,
  he: HE,
  id: ID,
  ms: MS,
  bn: BN,
  th: TH,
  vi: VI,
  fil: FIL,
  ta: TA,
  te: TE,
  mr: MR,
  gu: GU,
  kn: KN,
  ml: ML,
  ne: NE,
  si: SI,
  az: AZ,
  kk: KK,
  uz: UZ,
  hy: HY,
  ka: KA,
  sw: SW,
  af: AF,
  am: AM,
  km: KM,
  lo: LO,
  my: MY,
  mn: MN,
  ga: GA,
  cy: CY,
};

function fromEs(map) {
  return Object.fromEntries(
    Object.entries(es).map(([key, spanish]) => [key, map[spanish] ?? spanish]),
  );
}

export const LOCALE_MAPS = Object.fromEntries(
  Object.entries(PHRASE_BY_LOCALE).map(([locale, map]) => [locale, fromEs(map)]),
);
