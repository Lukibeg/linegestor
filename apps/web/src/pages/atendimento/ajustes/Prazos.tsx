/**
 * Chamados › Ajustes (Patch 1.10, decisão 0047) — PRAZOS.
 *
 * O documento "Prioridade e prazos dos chamados" (o ICI-12) virou esta tela: o horário de atendimento
 * (os 7 dias), os feriados, os dois prazos de cada prioridade (a primeira resposta e a solução, em
 * horas úteis ou corridas), a matriz que sugere a prioridade pela gravidade e pelo alcance (e a coluna
 * "Só a gravidade", para os painéis que não usam o alcance), e os alertas (o "perto de vencer" e o "sem dono").
 *
 * As contas são as do `@gestor/shared` (as mesmas do relógio que avisa): o prazo de um chamado é
 * calculado na hora, então mudar aqui muda a conta de todos os chamados abertos.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Trash2 } from 'lucide-react';
import {
  ALCANCES, DICA_GRAVIDADE, DICA_PRIORIDADE, GRAVIDADES, NOME_ALCANCE, NOME_CONTA, NOME_GRAVIDADE, NOME_PRIORIDADE, NOMES_DOS_DIAS, PRIORIDADES,
  AjustesPrazosSchema, campoLigado, duracaoDoPrazo, hhmm,
  type AjustesPrazos, type ContaPrazo, type Feriado, type HorarioDoDia, type Prioridade,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Carregando, Chip, Spinner, Toggle, mensagemErro } from '../../../components/ui/index.js';
import { ThN, TdN } from '../../../lib/contagem.js';
import { Th, ordenarLista, useOrdenacaoLocal } from '../../../lib/ordenacao.js';
import { ChipPrioridade, useDepoisDeMudar, useOpcoes } from '../comum.js';

const CHAVE = ['atendimento', 'ajustes', 'prazos'];
/** A semana começa na segunda (o índice 0 do horário é o domingo). */
const ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0];
/** Os limites do servidor (AjustesPrazosSchema), em minutos. */
const MAX_RESPOSTA = 60 * 24 * 60;
const MAX_SOLUCAO = 60 * 24 * 365;
/** A cor da prioridade escolhida em cada cruzamento da matriz (as mesmas do chip da prioridade). */
const COR_PRIORIDADE: Record<Prioridade, string> = {
  critica: 'bg-bad-soft text-bad border-bad', alta: 'bg-signal-soft text-signal border-signal',
  media: 'bg-amarelo-soft text-amarelo-ink border-amarelo', baixa: 'bg-surface-2 text-ink-2 border-line-strong',
};

type FeriadoNaTela = Feriado & { chave: string };
let sequencia = 0;
const comChave = (f: Feriado): FeriadoNaTela => ({ ...f, chave: `f${++sequencia}` });
const semChave = ({ chave: _chave, ...f }: FeriadoNaTela): Feriado => f;

const fmtData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const diaDaSemana = (iso: string) => NOMES_DOS_DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()] ?? '';
const hojeEmBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
/** HH:MM de 24 horas (o mesmo formato que o servidor aceita). */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const horaValida = (t: string) => HORA.test(t);
/** "0800" ou "08:00" → "08:00"; vai pondo os dois-pontos enquanto a pessoa digita. */
const mascaraHora = (t: string) => { const d = t.replace(/\D/g, '').slice(0, 4); return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`; };
const minutosDoDia = (h: HorarioDoDia) => (h.abre && horaValida(h.inicio) && horaValida(h.fim) ? Math.max(0, hhmm(h.fim) - hhmm(h.inicio)) : 0);
const numero = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Quanto dura um dia útil: o horário mais comum da semana (de segunda a sexta, das 8h às 18h, são 10 h
 * — o sábado de meio período não muda a conta). É o que transforma "20 h úteis" em "≈ 2 dias".
 */
function duracaoDoDiaUtil(horario: HorarioDoDia[]): number {
  const vezes = new Map<number, number>();
  for (const h of horario) { const m = minutosDoDia(h); if (m > 0) vezes.set(m, (vezes.get(m) ?? 0) + 1); }
  let melhor = 0; let maisVezes = 0;
  for (const [m, n] of vezes) if (n > maisVezes || (n === maisVezes && m > melhor)) { melhor = m; maisVezes = n; }
  return melhor;
}

/** "20 h úteis ≈ 2 dias", "4 h úteis", "48 h corridas ≈ 2 dias". */
function textoDoLimite(min: number, conta: ContaPrazo, diaUtil: number): string {
  const base = `${duracaoDoPrazo(min)} ${conta === 'uteis' ? 'úteis' : 'corridas'}`;
  const dia = conta === 'uteis' ? diaUtil : 24 * 60;
  if (!dia || min < dia) return base;
  const dias = Math.round((min / dia) * 10) / 10;
  return `${base} ≈ ${numero(dias)} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** As conferências do servidor, ditas com o nome do dia, da prioridade e do campo (o erro do schema é técnico). */
function problemaNoFormulario(a: AjustesPrazos): string | null {
  for (const i of ORDEM_DA_SEMANA) {
    const h = a.calendario.horario[i];
    if (h?.abre && (!horaValida(h.inicio) || !horaValida(h.fim))) return `${NOMES_DOS_DIAS[i]}: escreva o começo e o fim com hora e minuto, como 08:00.`;
    if (h?.abre && !(hhmm(h.fim) > hhmm(h.inicio))) return `${NOMES_DOS_DIAS[i]}: o fim do atendimento precisa ser depois do começo.`;
  }
  for (const f of a.calendario.feriados) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return 'Um feriado está sem a data.';
    if (!f.nome.trim()) return `O feriado de ${fmtData(f.data)} está sem nome.`;
  }
  for (const p of PRIORIDADES) {
    const x = a.prazos[p];
    if (x.resposta < 1) return `${NOME_PRIORIDADE[p]}: a primeira resposta precisa de pelo menos 1 minuto.`;
    if (x.solucao < 1) return `${NOME_PRIORIDADE[p]}: a solução precisa de pelo menos 1 minuto.`;
    if (x.resposta > MAX_RESPOSTA) return `${NOME_PRIORIDADE[p]}: a primeira resposta vai até ${MAX_RESPOSTA / 60} horas.`;
    if (x.solucao > MAX_SOLUCAO) return `${NOME_PRIORIDADE[p]}: a solução vai até ${MAX_SOLUCAO / 60} horas.`;
  }
  if (!Number.isInteger(a.alertaPercentual) || a.alertaPercentual < 10 || a.alertaPercentual > 99) return 'O aviso de "perto de vencer" vai de 10% a 99% do prazo.';
  if (!Number.isInteger(a.semDonoMinutos) || a.semDonoMinutos < 1 || a.semDonoMinutos > 24 * 60) return 'O aviso de "sem responsável" vai de 1 minuto a 24 horas (1440 minutos).';
  const r = AjustesPrazosSchema.safeParse(a);
  return r.success ? null : r.error.issues[0]?.message ?? 'Confira os campos.';
}

export function AjustesPrazos() {
  const q = useQuery({ queryKey: CHAVE, queryFn: () => api.atendimento.ajustesPrazos() });
  if (q.isLoading) return <Carregando />;
  if (q.isError || !q.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p>;
  return <Formulario inicial={q.data} />;
}

function Formulario({ inicial }: { inicial: AjustesPrazos }) {
  const qc = useQueryClient();
  const depois = useDepoisDeMudar();
  const [f, setF] = useState<AjustesPrazos>(inicial);
  const [feriados, setFeriados] = useState<FeriadoNaTela[]>(() => inicial.calendario.feriados.map(comChave));
  /** o que está gravado (para saber se mudou) */
  const [base, setBase] = useState<AjustesPrazos>(inicial);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const montado: AjustesPrazos = { ...f, calendario: { horario: f.calendario.horario, feriados: feriados.map(semChave) } };
  const mudou = JSON.stringify(montado) !== JSON.stringify(base);
  const diaUtil = duracaoDoDiaUtil(f.calendario.horario);
  const mexeu = () => { setErro(''); setSalvo(false); };

  const mudarDia = (i: number, o: Partial<HorarioDoDia>) => {
    setF((x) => ({ ...x, calendario: { ...x.calendario, horario: x.calendario.horario.map((h, j) => (j === i ? { ...h, ...o } : h)) } }));
    mexeu();
  };
  const mudarPrazo = (p: Prioridade, o: Partial<AjustesPrazos['prazos'][Prioridade]>) => { setF((x) => ({ ...x, prazos: { ...x.prazos, [p]: { ...x.prazos[p], ...o } } })); mexeu(); };
  const mudarMatriz = (g: (typeof GRAVIDADES)[number], a: (typeof ALCANCES)[number], p: Prioridade) => {
    setF((x) => ({ ...x, matriz: { ...x.matriz, [g]: { ...x.matriz[g], [a]: p } } }));
    mexeu();
  };
  const mudarSemAlcance = (g: (typeof GRAVIDADES)[number], p: Prioridade) => { setF((x) => ({ ...x, semAlcance: { ...x.semAlcance, [g]: p } })); mexeu(); };
  // quais painéis usam o alcance (Ajustes › Campos): nos outros, vale a coluna "Só a gravidade"
  const opcoes = useOpcoes();
  const comAlcance = (opcoes.data?.paineis ?? []).filter((p) => p.ativo && campoLigado(p.ajustes, 'gravidade') && campoLigado(p.ajustes, 'alcance'));

  const salvar = async () => {
    const problema = problemaNoFormulario(montado);
    if (problema) { setErro(problema); return; }
    setSalvando(true); setErro('');
    try {
      const r = await depois(api.atendimento.salvarPrazos(montado));
      qc.setQueryData(CHAVE, r);
      // o servidor devolve os feriados em ordem de data: a tela fica igual ao que foi gravado
      setF(r); setBase(r); setFeriados(r.calendario.feriados.map(comChave)); setSalvo(true);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };
  const desfazer = () => { setF(base); setFeriados(base.calendario.feriados.map(comChave)); setErro(''); };

  const semana = ORDEM_DA_SEMANA.reduce((t, i) => t + minutosDoDia(f.calendario.horario[i]!), 0);

  return (
    <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); void salvar(); }} className="flex flex-col gap-4">
      <p className="text-[13.5px] text-ink-2 max-w-3xl">
        O documento "Prioridade e prazos dos chamados" virou esta tela. O prazo de cada chamado é contado na hora, com o que está aqui:
        mudou, muda a conta de todos os chamados abertos. O horário é o de Brasília.
      </p>

      {/* ---------- o horário ---------- */}
      <Cartao titulo="Horário de atendimento" dica={`Os prazos em horas úteis só andam dentro deste horário. ${semana ? `São ${duracaoDoPrazo(semana)} de atendimento por semana${diaUtil ? `; um dia útil tem ${duracaoDoPrazo(diaUtil)}` : ''}.` : 'Sem nenhum dia de atendimento, os prazos contam o tempo corrido.'}`}>
        <ul className="flex flex-col divide-y divide-line" id="prazos-horario">
          {ORDEM_DA_SEMANA.map((i) => {
            const h = f.calendario.horario[i]!;
            const incompleto = h.abre && (!horaValida(h.inicio) || !horaValida(h.fim));
            const invalido = h.abre && !incompleto && !(hhmm(h.fim) > hhmm(h.inicio));
            return (
              <li key={i} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
                <span className="w-[72px] font-semibold text-[13.5px] text-ink">{NOMES_DOS_DIAS[i]}</span>
                <Toggle checked={h.abre} onChange={(v) => mudarDia(i, { abre: v })} label={h.abre ? 'atende' : 'não atende'} />
                {h.abre && (
                  <span className="flex items-center gap-2 text-[13px]">
                    <CampoHora valor={h.inicio} rotulo={`${NOMES_DOS_DIAS[i]}: começo`} id={`horario-${i}-inicio`} onChange={(v) => mudarDia(i, { inicio: v })} />
                    às
                    <CampoHora valor={h.fim} rotulo={`${NOMES_DOS_DIAS[i]}: fim`} id={`horario-${i}-fim`} onChange={(v) => mudarDia(i, { fim: v })} />
                    {!invalido && !incompleto && <span className="text-muted tnum">{duracaoDoPrazo(minutosDoDia(h))}</span>}
                  </span>
                )}
                {incompleto && <span className="text-bad text-[12.5px] basis-full sm:basis-auto">Hora e minuto, como 08:00.</span>}
                {invalido && <span className="text-bad text-[12.5px] basis-full sm:basis-auto">O fim precisa ser depois do começo.</span>}
              </li>
            );
          })}
        </ul>
      </Cartao>

      {/* ---------- os feriados ---------- */}
      <Feriados lista={feriados} onChange={(v) => { setFeriados(v); mexeu(); }} />

      {/* ---------- os prazos por prioridade ---------- */}
      <Cartao titulo="Prazos por prioridade" dica={`A primeira resposta de uma pessoa da equipe e a solução. Em horas úteis, o relógio só anda no horário de atendimento${diaUtil ? ` (um dia útil = ${duracaoDoPrazo(diaUtil)})` : ''}; esperando o cliente, o prazo para.`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" id="prazos-prioridades">
          {PRIORIDADES.map((p) => {
            const x = f.prazos[p];
            return (
              <div key={p} className="rounded-lg border border-line p-3 flex flex-col gap-2.5 min-w-0">
                <div>
                  <ChipPrioridade p={p} />
                  {/* a dica com a altura de duas linhas: os campos ficam alinhados de um cartão para o outro */}
                  <p className="text-[12px] text-muted mt-1 leading-snug sm:min-h-[2.75em]">{DICA_PRIORIDADE[p]}</p>
                </div>
                <Duracao id={`prazo-${p}-resposta`} rotulo="Primeira resposta" minutos={x.resposta} conta={x.conta} diaUtil={diaUtil} max={MAX_RESPOSTA}
                  onChange={(m) => mudarPrazo(p, { resposta: m })} />
                <Duracao id={`prazo-${p}-solucao`} rotulo="Solução" minutos={x.solucao} conta={x.conta} diaUtil={diaUtil} max={MAX_SOLUCAO}
                  onChange={(m) => mudarPrazo(p, { solucao: m })} />
                {x.resposta > x.solucao && x.solucao > 0 && <p className="text-signal text-[12px]">A primeira resposta está maior que a solução.</p>}
                <div>
                  <label className="label" htmlFor={`prazo-${p}-conta`}>Conta em</label>
                  <select className="input py-1.5" id={`prazo-${p}-conta`} value={x.conta} onChange={(e) => mudarPrazo(p, { conta: e.target.value as ContaPrazo })}>
                    {(['uteis', 'corridas'] as const).map((c) => <option key={c} value={c}>{NOME_CONTA[c]}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </Cartao>

      {/* ---------- a matriz ---------- */}
      <Cartao titulo="A prioridade sugerida" dica="Ao abrir um chamado, a gravidade sugere a prioridade: no painel que usa o alcance (Ajustes › Campos), cruzada com ele; no painel sem o alcance, pela coluna Só a gravidade. Trocar a sugestão pede o motivo, que fica no histórico.">
        <p className="text-[12.5px] text-ink-2 mb-3" id="prazos-quem-usa-alcance">
          {comAlcance.length
            ? <>Usam o alcance: <b>{comAlcance.map((p) => p.nome).join(', ')}</b>. Os outros painéis seguem a coluna <b>Só a gravidade</b>.</>
            : <>Nenhum painel usa o alcance agora: vale a coluna <b>Só a gravidade</b>. O alcance liga em Chamados › Ajustes › Campos.</>}
        </p>
        {/* no celular, uma gravidade por bloco (a tabela com várias escolhas por linha não cabe sem rolar de lado) */}
        <div className="sm:hidden flex flex-col gap-2" id="prazos-matriz-celular">
          {GRAVIDADES.map((g) => (
            <div key={g} className="rounded-lg border border-line p-3">
              <div className="text-[13.5px] font-semibold text-ink">{NOME_GRAVIDADE[g]}</div>
              <div className="text-[12px] text-muted leading-snug mb-2">{DICA_GRAVIDADE[g]}</div>
              <div className="grid grid-cols-1 gap-1.5">
                <label className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-ink font-semibold">Só a gravidade</span>
                  <EscolhaDaMatriz valor={f.semAlcance[g]} rotulo={`${NOME_GRAVIDADE[g]}, no painel sem o alcance`} onChange={(p) => mudarSemAlcance(g, p)} />
                </label>
                {ALCANCES.map((a) => (
                  <label key={a} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-ink-2">{NOME_ALCANCE[a]}</span>
                    <EscolhaDaMatriz valor={f.matriz[g][a]} rotulo={`${NOME_GRAVIDADE[g]} com alcance "${NOME_ALCANCE[a]}"`} onChange={(p) => mudarMatriz(g, a, p)} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* a matriz não é uma lista: a ordem das linhas e das colunas é a do documento (sem # e sem ordenar) */}
        <div className="hidden sm:block overflow-x-auto -mx-1 px-1">
          <table className="table min-w-[760px]" id="prazos-matriz">
            <thead>
              <tr>
                <th rowSpan={2} className="align-bottom">Gravidade</th>
                <th rowSpan={2} className="!text-center align-bottom">Só a gravidade<span className="block text-[11px] font-normal normal-case tracking-normal text-muted">painel sem o alcance</span></th>
                <th colSpan={ALCANCES.length} className="!text-center">Com o alcance</th>
              </tr>
              <tr>
                {/* a segunda linha do cabeçalho não arredonda os cantos (os cantos são da primeira) */}
                {ALCANCES.map((a) => <th key={a} className="!text-center !rounded-none">{NOME_ALCANCE[a]}</th>)}
              </tr>
            </thead>
            <tbody>
              {GRAVIDADES.map((g) => (
                <tr key={g}>
                  <th scope="row" className={`!bg-surface !font-body !font-normal !text-left align-middle ${g === GRAVIDADES[GRAVIDADES.length - 1] ? '!border-b-0' : ''}`}>
                    <span className="block text-[13.5px] font-semibold text-ink">{NOME_GRAVIDADE[g]}</span>
                    <span className="block text-[12px] text-muted leading-snug">{DICA_GRAVIDADE[g]}</span>
                  </th>
                  <td className="text-center">
                    <EscolhaDaMatriz valor={f.semAlcance[g]} rotulo={`${NOME_GRAVIDADE[g]}, no painel sem o alcance`} onChange={(p) => mudarSemAlcance(g, p)} />
                  </td>
                  {ALCANCES.map((a) => (
                    <td key={a} className="text-center">
                      <EscolhaDaMatriz valor={f.matriz[g][a]} rotulo={`${NOME_GRAVIDADE[g]} com alcance "${NOME_ALCANCE[a]}"`} onChange={(p) => mudarMatriz(g, a, p)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      {/* ---------- os alertas ---------- */}
      <Cartao titulo="Alertas" dica="Na tela (o sininho) e no WhatsApp, conforme Avisos e WhatsApp.">
        <div className="flex flex-col gap-3 text-[13.5px]">
          <div className="flex flex-wrap items-center gap-2">
            <span>Avisar o responsável quando o prazo chegar a</span>
            <input type="number" className="input w-20 py-1.5 tnum" id="prazos-percentual" min={10} max={99} value={Number.isFinite(f.alertaPercentual) ? f.alertaPercentual : ''}
              onChange={(e) => { setF((x) => ({ ...x, alertaPercentual: e.target.valueAsNumber })); mexeu(); }} aria-label="Percentual do prazo para o aviso de perto de vencer" />
            <span>% <span className="text-muted">("perto de vencer"; vencido, avisa também os supervisores)</span></span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Avisar os supervisores do chamado sem responsável há</span>
            <input type="number" className="input w-20 py-1.5 tnum" id="prazos-sem-dono" min={1} max={1440} value={Number.isFinite(f.semDonoMinutos) ? f.semDonoMinutos : ''}
              onChange={(e) => { setF((x) => ({ ...x, semDonoMinutos: e.target.valueAsNumber })); mexeu(); }} aria-label="Minutos sem responsável até o aviso" />
            <span>minutos <span className="text-muted">(na etapa de entrada)</span></span>
          </div>
        </div>
      </Cartao>

      {/* o botão acompanha a rolagem: a tela é comprida e o erro precisa aparecer perto dele */}
      <div className="sticky bottom-0 z-10 -mx-4 px-4 py-3 bg-bg border-t border-line flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" id="prazos-salvar" disabled={salvando || !mudou}>{salvando ? <Spinner className="text-white" /> : null} Salvar</button>
        <button type="button" className="btn-ghost" disabled={salvando || !mudou} onClick={desfazer}>Desfazer as mudanças</button>
        <span className={`text-[12.5px] ${erro ? 'text-bad' : mudou ? 'text-signal font-semibold' : salvo ? 'text-ok font-semibold' : 'text-muted'}`} role={erro ? 'alert' : undefined} aria-live="polite" id="prazos-situacao">
          {erro || (mudou ? 'Há mudanças não salvas.' : salvo ? 'Salvo.' : 'Nada mudou.')}
        </span>
      </div>
    </form>
  );
}

/** Um cruzamento da matriz: a prioridade, por extenso, na cor dela. */
function EscolhaDaMatriz({ valor, rotulo, onChange }: { valor: Prioridade; rotulo: string; onChange: (p: Prioridade) => void }) {
  return (
    <select className={`rounded-lg border px-2 py-1.5 text-[13px] font-semibold cursor-pointer w-[150px] max-w-full ${COR_PRIORIDADE[valor]}`} value={valor}
      aria-label={rotulo} onChange={(e) => onChange(e.target.value as Prioridade)}>
      {PRIORIDADES.map((x) => <option key={x} value={x}>{NOME_PRIORIDADE[x]}</option>)}
    </select>
  );
}

/** A hora sempre em 24 horas ("18:00", nunca "06:00 PM"), com os dois-pontos postos sozinhos. */
function CampoHora({ valor, rotulo, id, onChange }: { valor: string; rotulo: string; id: string; onChange: (v: string) => void }) {
  return (
    <input className={`input w-[76px] py-1.5 tnum text-center ${valor && !horaValida(valor) ? 'border-bad' : ''}`} id={id} inputMode="numeric" maxLength={5} placeholder="08:00"
      value={valor} aria-label={rotulo} onChange={(e) => onChange(mascaraHora(e.target.value))} />
  );
}

function Cartao({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5 min-w-0">
      <h2 className="font-display font-semibold text-[15px]">{titulo}</h2>
      {dica && <p className="text-[12.5px] text-muted mt-0.5 max-w-3xl">{dica}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Um prazo em horas e minutos, com o texto ("20 h úteis ≈ 2 dias") logo abaixo. */
function Duracao({ id, rotulo, minutos, conta, diaUtil, max, onChange }: {
  id: string; rotulo: string; minutos: number; conta: ContaPrazo; diaUtil: number; max: number; onChange: (m: number) => void;
}) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  const ler = (v: string) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
  const erro = minutos < 1 ? 'Pelo menos 1 minuto.' : minutos > max ? `No máximo ${max / 60} horas.` : '';
  return (
    <div>
      <label className="label" htmlFor={`${id}-h`}>{rotulo}</label>
      <div className="flex items-center gap-1.5 text-[13px]">
        <input type="number" className="input w-[72px] py-1.5 tnum" id={`${id}-h`} min={0} value={h} aria-label={`${rotulo}: horas`} onChange={(e) => onChange(ler(e.target.value) * 60 + m)} />
        <span className="text-muted">h</span>
        <input type="number" className="input w-[64px] py-1.5 tnum" id={`${id}-min`} min={0} max={59} value={m} aria-label={`${rotulo}: minutos`} onChange={(e) => onChange(h * 60 + Math.min(59, ler(e.target.value)))} />
        <span className="text-muted">min</span>
      </div>
      <p className={`text-[12px] mt-1 ${erro ? 'text-bad' : 'text-muted'}`}>{erro || textoDoLimite(minutos, conta, diaUtil)}</p>
    </div>
  );
}

/**
 * Os feriados: em ordem de data (qualquer coluna ordena). A ordem só muda quando a pessoa pede (outra
 * coluna) ou quando um feriado entra ou sai — escrever o nome não faz a linha pular de lugar.
 */
function Feriados({ lista, onChange }: { lista: FeriadoNaTela[]; onChange: (v: FeriadoNaTela[]) => void }) {
  const o = useOrdenacaoLocal('data', 'asc');
  const [novo, setNovo] = useState<{ data: string; nome: string; atende: boolean }>({ data: '', nome: '', atende: false });
  const [erro, setErro] = useState('');
  const hoje = hojeEmBrasilia();
  const chaves = lista.map((x) => x.chave).join('|');
  const ordem = useMemo(() => ordenarLista(lista, o, {
    data: (x) => x.data, nome: (x) => x.nome.toLocaleLowerCase('pt-BR'), atende: (x) => (x.atende ? 0 : 1),
  }).map((x) => x.chave), [o.ord, o.dir, chaves]); // eslint-disable-line react-hooks/exhaustive-deps
  const linhas = ordem.map((k) => lista.find((x) => x.chave === k)).filter((x): x is FeriadoNaTela => !!x);
  const comAtendimento = lista.filter((x) => x.atende).length;

  const incluir = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novo.data)) { setErro('Escolha a data do feriado.'); document.getElementById('feriado-data')?.focus(); return; }
    if (!novo.nome.trim()) { setErro('Escreva o nome do feriado.'); document.getElementById('feriado-nome')?.focus(); return; }
    if (lista.some((x) => x.data === novo.data)) { setErro(`Já há um feriado em ${fmtData(novo.data)}.`); return; }
    onChange([...lista, comChave({ data: novo.data, nome: novo.nome.trim(), atende: novo.atende })]);
    setNovo({ data: '', nome: '', atende: false }); setErro('');
  };
  const mudar = (chave: string, o2: Partial<Feriado>) => onChange(lista.map((x) => (x.chave === chave ? { ...x, ...o2 } : x)));

  return (
    <Cartao titulo={`Feriados (${lista.length})`} dica={`No feriado sem atendimento, o prazo para como num domingo. Marque "atende" nos dias em que a equipe trabalha${comAtendimento ? ` (${comAtendimento} ${comAtendimento === 1 ? 'marcado' : 'marcados'})` : ''}.`}>
      <div className="flex flex-wrap items-end gap-2 mb-3" id="feriado-novo">
        <div>
          <label className="label" htmlFor="feriado-data">Data</label>
          <input type="date" className="input py-1.5 w-[160px]" id="feriado-data" value={novo.data} onChange={(e) => { setNovo({ ...novo, data: e.target.value }); setErro(''); }} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label" htmlFor="feriado-nome">Nome</label>
          <input className="input py-1.5" id="feriado-nome" value={novo.nome} maxLength={80} placeholder="Ex.: Aniversário de Salvador"
            onChange={(e) => { setNovo({ ...novo, nome: e.target.value }); setErro(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); incluir(); } }} />
        </div>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer pb-2">
          <input type="checkbox" className="accent-[var(--accent)]" checked={novo.atende} onChange={(e) => setNovo({ ...novo, atende: e.target.checked })} /> atende
        </label>
        <button type="button" className="btn-secondary" id="feriado-incluir" onClick={incluir}><CalendarPlus size={15} /> Incluir feriado</button>
        {erro && <p className="text-bad text-[12.5px] basis-full" role="alert" id="feriado-erro">{erro}</p>}
      </div>
      {!lista.length ? <p className="text-[13px] text-muted">Nenhum feriado: os prazos contam todos os dias do horário de atendimento.</p> : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="table min-w-[520px]" id="prazos-feriados">
            <thead>
              <tr>
                <ThN />
                <Th o={o} col="data">Data</Th>
                <Th o={o} col="nome">Nome</Th>
                <Th o={o} col="atende" align="center">Atende?</Th>
                <th className="w-[1%]" aria-label="Tirar" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((x, i) => {
                const passou = x.data < hoje;
                return (
                  <tr key={x.chave} className={passou ? 'text-muted' : ''}>
                    <TdN n={i + 1} />
                    <td className="whitespace-nowrap tnum">
                      {fmtData(x.data)} <span className="text-muted text-[12px]">{diaDaSemana(x.data).toLowerCase()}</span>
                      {passou && <Chip tone="muted" className="ml-1.5">passou</Chip>}
                    </td>
                    <td className="min-w-[200px]">
                      <input className="input py-1 px-2 text-[13px]" value={x.nome} maxLength={80} aria-label={`Nome do feriado de ${fmtData(x.data)}`}
                        onChange={(e) => mudar(x.chave, { nome: e.target.value })} />
                    </td>
                    <td className="text-center">
                      <input type="checkbox" className="accent-[var(--accent)] w-4 h-4 align-middle" checked={x.atende} aria-label={`Atende em ${fmtData(x.data)}`}
                        onChange={(e) => mudar(x.chave, { atende: e.target.checked })} />
                    </td>
                    <td>
                      <button type="button" className="btn-ghost btn-sm text-muted hover:text-bad" onClick={() => onChange(lista.filter((y) => y.chave !== x.chave))}
                        aria-label={`Tirar o feriado de ${fmtData(x.data)} (${x.nome})`} title="Tirar"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

