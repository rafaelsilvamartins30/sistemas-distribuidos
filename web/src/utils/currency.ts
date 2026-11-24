const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBrl(minorUnits: number): string {
  return brl.format(minorUnits / 100);
}
