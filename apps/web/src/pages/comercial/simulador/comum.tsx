/**
 * O que as telas do Simulador do Comercial (Patch 2.0.2, decisão 0052) usam juntas: as consultas, o erro
 * legível, o sinal da margem (verde, amarelo, vermelho), as abas e os campos de valor — reais, o valor de cada
 * um (até R$ 0,0001, para os R$ 0,045 por contato da Helena), percentual e número inteiro. Os campos
 * recalculam enquanto a pessoa escreve (o valor que já dá para ler entra na conta) e arrumam o texto ao sair.
 */
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  NOME_DO_SINAL, lerPercentual, lerReais, lerValorUnitario, percentualDaFracao, textoDoPercentual, textoDoValorUnitario,
  type Sinal,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { ApiError } from '../../../api/types.js';
import { FAIXA_ABAS, classeAba, mensagemErro } from '../../../components/ui/index.js';

export const CHAVE_DO_SIMULADOR = ['simulador'] as const;

/** Os Ajustes do Simulador e o que a pessoa pode fazer. */
export const useOpcoesDoSimulador = () =>
  useQuery({ queryKey: [...CHAVE_DO_SIMULADOR, 'opcoes'], queryFn: () => api.simulador.opcoes(), staleTime: 60_000 });

/** O erro: as frases da validação já dizem o que fazer (sem o nome técnico do campo). */
export function erroDoSimulador(e: unknown): string {
  if (e instanceof ApiError && Array.isArray(e.details) && e.details.length) {
    return [...new Set((e.details as Array<{ message?: string }>).map((d) => d?.message ?? String(d)))].join(' ');
  }
  return mensagemErro(e);
}

/** "R$ 1.250,00" (o espaço do R$ não quebra) */
export const reais = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** "R$ 1.250" quando é redondo; "R$ 1.250,50" quando não. */
export const reaisLimpo = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Math.round(centavos) % 100 ? 2 : 0, maximumFractionDigits: 2 });

// =====================================================================
//  O SINAL DA MARGEM
// =====================================================================

export const FUNDO_DO_SINAL: Record<Sinal, string> = { verde: 'bg-ok-soft text-ok', amarelo: 'bg-amarelo-soft text-amarelo-ink', vermelho: 'bg-bad-soft text-bad' };
export const PONTO_DO_SINAL: Record<Sinal, string> = { verde: 'bg-ok', amarelo: 'bg-amarelo', vermelho: 'bg-bad' };

/** O sinal com a margem: "● Verde · 60,2%". Sem mensalidade, sem sinal. */
/** O sinal da margem: "Verde · 42%"; `curto`, só a margem ("42%"); `soOSinal`, só o nome ("Verde", ao lado da margem grande). */
export function ChipDoSinal({ sinal, margem, curto = false, soOSinal = false, className = '' }: { sinal: Sinal | null; margem: number | null; curto?: boolean; soOSinal?: boolean; className?: string }) {
  if (!sinal || margem == null) return <span className={`chip whitespace-nowrap bg-surface-2 text-muted ${className}`}>sem mensalidade</span>;
  return (
    <span className={`chip whitespace-nowrap ${FUNDO_DO_SINAL[sinal]} ${className}`} title={`Margem ${percentualDaFracao(margem)}: ${NOME_DO_SINAL[sinal].toLocaleLowerCase('pt-BR')}`}>
      <span className={`w-2 h-2 rounded-full ${PONTO_DO_SINAL[sinal]}`} aria-hidden />
      {soOSinal ? NOME_DO_SINAL[sinal] : curto ? percentualDaFracao(margem) : `${NOME_DO_SINAL[sinal]} · ${percentualDaFracao(margem)}`}
    </span>
  );
}

// =====================================================================
//  AS ABAS (Simulações | Ajustes)
// =====================================================================

export function AbasDoSimulador({ atual, podeCuidar }: { atual: 'simulacoes' | 'ajustes'; podeCuidar: boolean }) {
  if (!podeCuidar) return null;
  return (
    <nav className={FAIXA_ABAS} aria-label="O Simulador">
      <Link to="/comercial/simulador" className={classeAba(atual === 'simulacoes')} aria-current={atual === 'simulacoes' ? 'page' : undefined}>Simulações</Link>
      <Link to="/comercial/simulador/ajustes" className={classeAba(atual === 'ajustes')} aria-current={atual === 'ajustes' ? 'page' : undefined} id="simulador-aba-ajustes">Ajustes</Link>
    </nav>
  );
}

// =====================================================================
//  OS CAMPOS DE VALOR
// =====================================================================

type Basico = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

/**
 * O campo que lê enquanto a pessoa escreve: o texto fica como ela escreveu; o valor entra na conta assim
 * que dá para ler; ao sair do campo, o texto fica arrumado ("1250" → "1.250,00"). Vazio = nulo.
 *
 * Ao entrar no campo (o Luan: "quando eu vou escrever, tem que tirar os 0 e já deixar apenas o que eu
 * escrevi"): com zero, o campo fica vazio para escrever; com um valor, ele fica todo marcado, e o que se
 * escreve entra no lugar. Saindo sem escrever, o valor volta como estava.
 */
function useCampo<T>(valor: T | null, ler: (t: string) => T | null, escrever: (v: T) => string, onChange: (v: T | null) => void) {
  const [texto, setTexto] = useState(valor == null ? '' : escrever(valor));
  const [focado, setFocado] = useState(false);
  const [invalido, setInvalido] = useState(false);
  useEffect(() => { if (!focado) { setTexto(valor == null ? '' : escrever(valor)); setInvalido(false); } }, [valor, focado]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    texto, invalido,
    props: {
      value: texto,
      onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
        setFocado(true);
        if (ler(texto) === 0) { setTexto(''); return; }
        // depois do clique (que põe o cursor), para a marcação ficar
        const el = e.currentTarget;
        window.requestAnimationFrame(() => { if (document.activeElement === el) el.select(); });
      },
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const t = e.target.value;
        setTexto(t);
        if (!t.trim()) { setInvalido(false); onChange(null); return; }
        const v = ler(t);
        setInvalido(v == null);
        if (v != null) onChange(v);
      },
      onBlur: () => { setFocado(false); },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); },
      'aria-invalid': invalido || undefined,
    },
  };
}

const reaisDoCampo = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Reais (centavos inteiros): a mensalidade, a ativação, o preço do aparelho. `unitario`: até 4 casas (R$ 0,045). */
export function CampoDeReais({ valor, onChange, unitario = false, className = '', ...resto }: { valor: number | null; onChange: (centavos: number | null) => void; unitario?: boolean } & Basico) {
  const c = useCampo<number>(valor, unitario ? lerValorUnitario : lerReais, unitario ? textoDoValorUnitario : reaisDoCampo, onChange);
  return (
    <div className={`relative min-w-0 ${className}`}>
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-[12.5px] pointer-events-none" aria-hidden>R$</span>
      <input {...resto} {...c.props} type="text" inputMode="decimal" autoComplete="off" placeholder={resto.placeholder ?? '0,00'}
        className={`input pl-8 text-right tabular-nums ${c.invalido ? '!border-bad' : ''}`} title={c.invalido ? 'Escreva como 1.250,00' : resto.title} />
    </div>
  );
}

/** Percentual (até duas casas): o imposto, a comissão, a margem que se quer. */
export function CampoDePercentual({ valor, onChange, className = '', ...resto }: { valor: number | null; onChange: (pontos: number | null) => void } & Basico) {
  const c = useCampo<number>(valor, lerPercentual, textoDoPercentual, onChange);
  return (
    <div className={`relative min-w-0 ${className}`}>
      <input {...resto} {...c.props} type="text" inputMode="decimal" autoComplete="off" placeholder={resto.placeholder ?? '0'}
        className={`input pr-7 text-right tabular-nums ${c.invalido ? '!border-bad' : ''}`} title={c.invalido ? 'Escreva como 6 ou 6,5' : resto.title} />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-[12.5px] pointer-events-none" aria-hidden>%</span>
    </div>
  );
}

const lerInteiro = (t: string) => { const s = t.trim().replace(/\./g, ''); return /^\d{1,9}$/.test(s) ? Number(s) : null; };
const escreverInteiro = (n: number) => n.toLocaleString('pt-BR');

/** Número inteiro (a quantidade, o prazo): vazio vale `vazio`. */
export function CampoInteiro({ valor, onChange, vazio = 0, sufixo, className = '', ...resto }: { valor: number; onChange: (n: number) => void; vazio?: number; sufixo?: string } & Basico) {
  const c = useCampo<number>(valor, lerInteiro, escreverInteiro, (v) => onChange(v ?? vazio));
  return (
    <div className={`relative min-w-0 ${className}`}>
      <input {...resto} {...c.props} type="text" inputMode="numeric" autoComplete="off" placeholder={resto.placeholder ?? '0'}
        className={`input text-right tabular-nums ${sufixo ? 'pr-14' : ''} ${c.invalido ? '!border-bad' : ''}`} />
      {sufixo && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-[12px] pointer-events-none" aria-hidden>{sufixo}</span>}
    </div>
  );
}

/** "1 usuário", "5 usuários", "1 conexão", "3 conexões", "2 canais" (o plural do português, nos casos da tabela). */
export function plural(n: number, unidade: string | null, padrao = ['unidade', 'unidades']): string {
  const um = unidade || padrao[0]!;
  if (n === 1) return `1 ${um}`;
  const muitos = !unidade ? padrao[1]! : /ão$/.test(um) ? um.replace(/ão$/, 'ões') : /[rzs]$/.test(um) ? `${um}es` : /l$/.test(um) ? um.replace(/l$/, 'is') : `${um}s`;
  return `${n.toLocaleString('pt-BR')} ${muitos}`;
}
