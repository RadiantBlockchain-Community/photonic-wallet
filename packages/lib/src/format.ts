import Big from "big.js";

export function photonsToRXD(photons: number, exact?: boolean) {
  const fixed = Big(photons).div(100000000).toString();
  return Intl.NumberFormat(
    navigator.language,
    exact ? undefined : { maximumSignificantDigits: 12 }
  ).format(fixed as unknown as number);
}

export function formatPhotons(photons: number) {
  return Intl.NumberFormat(navigator.language).format(photons);
}
