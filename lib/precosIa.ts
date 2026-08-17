/* ============================================================
   Preços da Claude API em US$ por 1 MILHÃO de tokens.
   ATUALIZAR esta tabela se trocar o modelo (env ANTHROPIC_MODEL) —
   fonte: https://platform.claude.com/docs/en/pricing
   ============================================================ */

export const PRECOS_IA: Record<string, { entrada: number; saida: number }> = {
  'claude-haiku-4-5': { entrada: 1, saida: 5 },
  'claude-haiku-4-5-20251001': { entrada: 1, saida: 5 },
};

/** Preço de fallback para modelo fora da tabela (assume Haiku). */
const FALLBACK = { entrada: 1, saida: 5 };

export function custoUsd(modelo: string, tokensEntrada: number, tokensSaida: number): number {
  const p = PRECOS_IA[modelo] ?? FALLBACK;
  return (tokensEntrada * p.entrada + tokensSaida * p.saida) / 1_000_000;
}

/** Limite mensal em US$ (env IA_LIMITE_MENSAL_USD; default 5). Server-only. */
export function limiteMensalUsd(): number {
  const v = parseFloat(process.env.IA_LIMITE_MENSAL_USD ?? '');
  return Number.isFinite(v) && v >= 0 ? v : 5;
}

/** Início do mês corrente em ISO (para somar o gasto do mês). */
export function inicioDoMesISO(): string {
  const agora = new Date();
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
}
