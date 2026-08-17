export function fmt(n: number, decimals = 1): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtSigned(n: number, decimals = 1): string {
  const s = fmt(Math.abs(n), decimals);
  return n >= 0 ? `+${s}` : `-${s}`;
}

export function fmtPercent(n: number, decimals = 1): string {
  return `${fmtSigned(n * 100, decimals)}%`;
}
