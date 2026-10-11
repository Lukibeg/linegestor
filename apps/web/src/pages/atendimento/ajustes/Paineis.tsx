/**
 * Chamados › Ajustes (Patch 1.10, decisão 0047) — PAINÉIS E ETAPAS.
 *
 * Cada painel é uma fila de chamados (Suporte, Desenvolvimento, Interno…) com a sua sigla (SUP-12),
 * a sua cor, quem vê e as suas regras: as opções do campo Tipo, se conta prazo, se o Resolvido fecha
 * sozinho, o que é obrigatório para abrir, se o pai espera os filhos e quem supervisiona.
 *
 * As etapas são da equipe (o Luan: "as etapas têm que ser editáveis"): criar, renomear, tirar e mudar
 * a ordem (arrastando ou pelas setas), e em cada uma o tipo, o nível (N1, N2 e N3 continuam sendo
 * colunas), o que precisa estar preenchido para entrar e quem recebe o aviso. A lista vai inteira
 * para o servidor; a etapa que sai com chamados pede o destino deles — o servidor diz quais, e a
 * janela pergunta para onde vão.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, GripVertical, ListOrdered, Pencil, Plus, RotateCcw, Trash2, Undo2, UserPlus, X } from 'lucide-react';
import {
  AJUSTES_PAINEL_PADRAO, CAMPOS_CHAMADO, CORES_PAINEL, DICA_TIPO_ETAPA, EtapasGravarSchema, NOME_CAMPO, NOME_TIPO_ETAPA, SiglaSchema, TIPOS_ETAPA,
  etiquetasUnicas, paraBusca,
  type CampoObrigatorio, type CorPainel, type EtapaGravarEntrada, type EtapaPainel, type Nivel, type Painel, type PainelGravarEntrada, type PessoaCurta, type TipoEtapa,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { ApiError } from '../../../api/types.js';
import { Carregando, Chip, EscolherComBusca, Modal, Spinner, Toggle, mensagemErro, type OpcaoBusca } from '../../../components/ui/index.js';
import { useArrastar } from '../../../lib/arrastar.js';
import { CodigoChamado, TOM_DO_PAINEL, useDepoisDeMudar, useOpcoes } from '../comum.js';

/** A cor cheia de cada painel (a bolinha do cartão e a amostra da escolha). */
const COR_CHEIA: Record<CorPainel, string> = {
  accent: 'bg-accent', roxo: 'bg-roxo', turquesa: 'bg-turquesa', signal: 'bg-signal', ok: 'bg-ok', rosa: 'bg-rosa', amarelo: 'bg-amarelo', neutral: 'bg-muted',
};
const NOME_COR: Record<CorPainel, string> = {
  accent: 'Azul', roxo: 'Roxo', turquesa: 'Turquesa', signal: 'Laranja', ok: 'Verde', rosa: 'Rosa', amarelo: 'Amarelo', neutral: 'Cinza',
};
/** O tipo da etapa em uma palavra (o resumo da linha); o nome inteiro e a dica ficam na escolha. */
const TIPO_CURTO: Record<TipoEtapa, string> = { entrada: 'Entrada', andamento: 'Andamento', resolvido: 'Resolvido', fechado: 'Fechado' };
/**
 * O que dá para exigir ao abrir: o que o formulário de abrir tem. Solução, causa, checklist e tempo
 * só existem depois de aberto — exigi-los na abertura travaria o painel inteiro.
 */
const CAMPOS_PARA_ABRIR: CampoObrigatorio[] = [
  'cliente', 'contato', 'relato', 'descricao', 'assunto', 'tipo', 'gravidade', 'alcance', 'prioridade', 'produto', 'operadora', 'afetados', 'responsavel',
];

const listaDeNomes = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const nomeDaPessoa = (pessoas: PessoaCurta[], id: string) => pessoas.find((p) => p.id === id)?.nome ?? '(pessoa desativada)';

export function AjustesPaineis() {
  const opcoes = useOpcoes();
  const [sp, setSp] = useSearchParams();
  /** a janela do painel: um painel (editar), 'novo', ou fechada */
  const [janela, setJanela] = useState<Painel | 'novo' | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const chegou = useRef(false);
  // vindo da tela inicial dos chamados: "Configurar" desce até as etapas daquele painel; "Novo
  // painel" abre a janela (e o pedido sai do endereço, para o Voltar não abrir de novo)
  useEffect(() => {
    if (!opcoes.data || chegou.current) return;
    chegou.current = true;
    if (sp.get('novo') === '1') {
      setJanela('novo');
      setSp((s) => { const n = new URLSearchParams(s); n.delete('novo'); return n; }, { replace: true });
    } else if (sp.get('painel')) {
      window.setTimeout(() => editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  }, [opcoes.data, sp, setSp]);

  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError || !opcoes.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(opcoes.error)}</p>;
  const { paineis } = opcoes.data;
  const pessoas = opcoes.data.pessoas.filter((p) => p.ativo);
  // o painel das etapas fica no endereço (?painel=): a aba Assuntos abre no mesmo
  const escolhido = paineis.find((p) => p.id === sp.get('painel')) ?? paineis[0];
  const escolher = (id: string, rolar = false) => {
    setSp((s) => { const n = new URLSearchParams(s); n.set('painel', id); return n; }, { replace: true });
    if (rolar) window.setTimeout(() => editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[13.5px] text-ink-2 max-w-3xl">
          Cada painel é uma fila de chamados, com a sua sigla (o começo do código, como <b>SUP</b>-12), as suas etapas e as suas regras.
          As etapas são as colunas do quadro, da esquerda para a direita.
        </p>
        <button type="button" className="btn-primary" id="painel-novo" onClick={() => setJanela('novo')}><Plus size={16} /> Novo painel</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {paineis.map((p) => (
          <CartaoPainel key={p.id} p={p} pessoas={opcoes.data.pessoas} escolhido={p.id === escolhido?.id}
            onEditar={() => setJanela(p)} onEtapas={() => escolher(p.id, true)} />
        ))}
      </div>

      {escolhido && (
        <div ref={editor} className="scroll-mt-20">
          <EditorDeEtapas key={escolhido.id} painel={escolhido} pessoas={pessoas} todasAsPessoas={opcoes.data.pessoas} />
        </div>
      )}

      {janela && (
        <JanelaPainel painel={janela === 'novo' ? null : janela} pessoas={pessoas} todasAsPessoas={opcoes.data.pessoas}
          onFechar={() => setJanela(null)} onSalvo={(p) => { setJanela(null); escolher(p.id); }} />
      )}
    </div>
  );
}

// =====================================================================
//  O PAINEL NUM CARTÃO
// =====================================================================

function CartaoPainel({ p, pessoas, escolhido, onEditar, onEtapas }: { p: Painel; pessoas: PessoaCurta[]; escolhido: boolean; onEditar: () => void; onEtapas: () => void }) {
  const a = p.ajustes;
  const quemVe = p.acesso === 'todos'
    ? 'Todos que veem chamados'
    : p.pessoas.length ? `Só ${listaDeNomes(p.pessoas.map((id) => nomeDaPessoa(pessoas, id)))}` : 'Só quem cuida dos chamados (ninguém escolhido)';
  const regras = [
    a.tipos.length ? `Tipos: ${a.tipos.join(', ')}` : 'Sem opções de tipo',
    a.contaPrazo ? 'Conta prazo' : 'Não conta prazo',
    a.fecharSozinhoDias ? `O Resolvido fecha sozinho em ${a.fecharSozinhoDias} ${a.fecharSozinhoDias === 1 ? 'dia útil' : 'dias úteis'}` : 'O Resolvido não fecha sozinho',
    a.obrigatoriosAoAbrir.length ? `Para abrir: ${CAMPOS_CHAMADO.filter((c) => a.obrigatoriosAoAbrir.includes(c)).map((c) => NOME_CAMPO[c]).join(', ')}` : 'Abre sem exigir nenhum campo',
    a.paiEsperaFilhos ? 'O pai espera os filhos fecharem' : 'O pai fecha sem esperar os filhos',
    a.supervisores.length ? `Supervisão: ${listaDeNomes(a.supervisores.map((id) => nomeDaPessoa(pessoas, id)))}` : 'Sem supervisores',
  ];
  return (
    <section className={`card p-4 flex flex-col gap-2.5 min-w-0 ${escolhido ? 'border-accent ring-1 ring-accent' : ''}`} aria-label={`Painel ${p.nome}`}>
      <div className="flex items-start gap-2.5">
        <span className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${COR_CHEIA[p.cor]}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-display font-semibold text-[15px] break-words">{p.nome}</h3>
            <Chip tone={TOM_DO_PAINEL[p.cor]} className="font-mono">{p.sigla}</Chip>
            {!p.ativo && <Chip tone="muted">desativado</Chip>}
          </div>
          {p.descricao && <p className="text-[12.5px] text-muted leading-snug mt-0.5">{p.descricao}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-muted">Abertos</dt>
        <dd>
          <Link to={`/atendimento/lista?painel=${encodeURIComponent(p.id)}`} className="font-semibold tnum text-ink hover:text-accent" title={`Ver os chamados abertos do ${p.nome} na lista`}>
            {p.abertos} {p.abertos === 1 ? 'chamado' : 'chamados'}
          </Link>
        </dd>
        <dt className="text-muted">Quem vê</dt><dd className="text-ink-2 break-words">{quemVe}</dd>
        <dt className="text-muted">Etapas</dt><dd className="text-ink-2 break-words">{p.etapas.map((e) => e.nome).join(' → ') || '—'}</dd>
      </dl>
      <ul className="text-[12px] text-muted leading-snug flex flex-col gap-0.5 border-t border-line pt-2">
        {regras.map((r) => <li key={r} className="break-words">{r}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2 mt-auto pt-1">
        <button type="button" className="btn-secondary btn-sm" onClick={onEditar} aria-label={`Editar o painel ${p.nome}`}><Pencil size={14} /> Editar</button>
        <button type="button" className={escolhido ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={onEtapas} aria-pressed={escolhido} aria-label={`As etapas do painel ${p.nome}`}>
          <ListOrdered size={14} /> Etapas ({p.etapas.length})
        </button>
      </div>
    </section>
  );
}

// =====================================================================
//  A JANELA DO PAINEL (novo ou editar): o nome, a sigla, a cor, quem vê e as regras
// =====================================================================

type FormPainel = {
  nome: string; sigla: string; descricao: string; cor: CorPainel; acesso: 'todos' | 'escolhidos'; pessoas: string[]; ativo: boolean;
  tipos: string[]; contaPrazo: boolean; fecharSozinho: boolean; fecharSozinhoDias: string; obrigatoriosAoAbrir: CampoObrigatorio[];
  paiEsperaFilhos: boolean; supervisores: string[];
};

function formDoPainel(p: Painel | null): FormPainel {
  const a = p?.ajustes ?? AJUSTES_PAINEL_PADRAO;
  return {
    nome: p?.nome ?? '', sigla: p?.sigla ?? '', descricao: p?.descricao ?? '', cor: p?.cor ?? 'accent', acesso: p?.acesso ?? 'todos', pessoas: p?.pessoas ?? [],
    ativo: p?.ativo ?? true, tipos: [...a.tipos], contaPrazo: a.contaPrazo, fecharSozinho: a.fecharSozinhoDias !== null,
    fecharSozinhoDias: String(a.fecharSozinhoDias ?? AJUSTES_PAINEL_PADRAO.fecharSozinhoDias ?? 3), obrigatoriosAoAbrir: [...a.obrigatoriosAoAbrir],
    paiEsperaFilhos: a.paiEsperaFilhos, supervisores: [...a.supervisores],
  };
}

function JanelaPainel({ painel, pessoas, todasAsPessoas, onFechar, onSalvo }: {
  painel: Painel | null; pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[]; onFechar: () => void; onSalvo: (p: Painel) => void;
}) {
  const depois = useDepoisDeMudar();
  const [f, setF] = useState<FormPainel>(() => formDoPainel(painel));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mudar = (o: Partial<FormPainel>) => { setF((x) => ({ ...x, ...o })); setErro(''); };

  const sigla = f.sigla.trim().toUpperCase();
  const siglaOk = SiglaSchema.safeParse(sigla);
  // a sugestão da sigla: as três primeiras letras do nome, sem acento (só no lugar vazio, a pessoa decide)
  const siglaSugerida = paraBusca(f.nome).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
  const dias = Number(f.fecharSozinhoDias);
  const diasOk = Number.isInteger(dias) && dias >= 1 && dias <= 60;

  const salvar = async () => {
    if (!f.nome.trim()) { setErro('Dê um nome ao painel.'); document.getElementById('painel-nome')?.focus(); return; }
    if (!siglaOk.success) { setErro('A sigla tem de 2 a 5 letras, sem acento (ex.: SUP).'); document.getElementById('painel-sigla')?.focus(); return; }
    if (f.fecharSozinho && !diasOk) { setErro('O "fecha sozinho" vai de 1 a 60 dias úteis.'); document.getElementById('painel-dias')?.focus(); return; }
    const d: PainelGravarEntrada = {
      nome: f.nome.trim(), sigla, descricao: f.descricao.trim() || null, cor: f.cor, acesso: f.acesso,
      // quem estava escolhido fica guardado mesmo com "todos": voltar para "escolhidos" não perde a lista
      pessoas: f.pessoas, ativo: f.ativo,
      ajustes: {
        tipos: f.tipos, contaPrazo: f.contaPrazo, fecharSozinhoDias: f.fecharSozinho ? dias : null,
        obrigatoriosAoAbrir: CAMPOS_CHAMADO.filter((c) => f.obrigatoriosAoAbrir.includes(c)), paiEsperaFilhos: f.paiEsperaFilhos, supervisores: f.supervisores,
      },
    };
    setSalvando(true); setErro('');
    try {
      const p = await depois(api.atendimento.salvarPainel(painel?.id ?? null, d),
        painel ? `Painel ${d.nome} salvo` : `Painel ${d.nome} criado, com as etapas Novo, Em andamento, Resolvido e Fechado`);
      onSalvo(p);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} largura="max-w-2xl" titulo={painel ? `Editar o painel ${painel.nome}` : 'Novo painel'}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert" id="painel-erro">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="painel-salvar" disabled={salvando} onClick={salvar}>{salvando ? <Spinner className="text-white" /> : painel ? 'Salvar' : 'Criar painel'}</button>
      </>}>
      <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); void salvar(); }} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
          <CampoRotulo rotulo="Nome" id="painel-nome">
            <input className="input" id="painel-nome" value={f.nome} maxLength={40} placeholder="Ex.: Interno" autoFocus={!painel} onChange={(e) => mudar({ nome: e.target.value })} />
          </CampoRotulo>
          <CampoRotulo rotulo="Sigla" id="painel-sigla" erro={f.sigla && !siglaOk.success ? 'De 2 a 5 letras, sem acento.' : undefined}>
            <input className="input font-mono uppercase" id="painel-sigla" value={f.sigla} maxLength={5} placeholder={siglaSugerida.length >= 2 ? siglaSugerida : 'SUP'}
              onChange={(e) => mudar({ sigla: e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '') })} />
          </CampoRotulo>
        </div>
        <p className="text-[12.5px] text-muted -mt-2.5">
          A sigla é o começo do código dos chamados, como <CodigoChamado codigo={`${siglaOk.success ? sigla : siglaSugerida.length >= 2 ? siglaSugerida : 'SUP'}-12`} cor={f.cor} link={false} />.
          {' '}<b className="text-ink-2">Ela não muda depois do primeiro chamado</b> (os códigos já dados continuam valendo).
        </p>

        <CampoRotulo rotulo="Descrição" id="painel-descricao" dica="Para que serve o painel (aparece no formulário de abrir chamado).">
          <textarea className="input min-h-[60px]" id="painel-descricao" value={f.descricao} maxLength={300} onChange={(e) => mudar({ descricao: e.target.value })} />
        </CampoRotulo>

        <CampoRotulo rotulo="Cor" id="painel-cor" grupo>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor do painel" id="painel-cor">
            {CORES_PAINEL.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={f.cor === c} onClick={() => mudar({ cor: c })}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] ${f.cor === c ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                <span className={`w-3.5 h-3.5 rounded-full ${COR_CHEIA[c]}`} aria-hidden /> {NOME_COR[c]}
              </button>
            ))}
          </div>
        </CampoRotulo>

        <CampoRotulo rotulo="Quem vê" id="painel-acesso" grupo dica="Quem cuida dos chamados vê todos os painéis, mesmo os de pessoas escolhidas. Para os outros, o chamado de um painel que não veem não existe.">
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Quem vê" id="painel-acesso">
            <Opcao ativo={f.acesso === 'todos'} onClick={() => mudar({ acesso: 'todos' })} titulo="Todos que veem chamados" texto="O Suporte, por exemplo." />
            <Opcao ativo={f.acesso === 'escolhidos'} onClick={() => mudar({ acesso: 'escolhidos' })} titulo="Só as pessoas escolhidas" texto="Um painel Interno ou Administrativo." />
            {f.acesso === 'escolhidos' && (
              <div className="pl-3 border-l-2 border-line ml-1.5">
                <EscolherPessoas id="painel-pessoas" rotulo="Quem vê o painel" valor={f.pessoas} pessoas={pessoas} todasAsPessoas={todasAsPessoas}
                  vazio="Ninguém escolhido: só quem cuida dos chamados vai ver." onChange={(v) => mudar({ pessoas: v })} />
              </div>
            )}
          </div>
        </CampoRotulo>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <Toggle checked={f.ativo} onChange={(v) => mudar({ ativo: v })} />
          <span>Painel ativo <span className="block text-[12.5px] text-muted">Desativado, o painel não recebe chamado novo; os que já existem continuam lá.</span></span>
        </label>

        <section className="border-t border-line pt-4 flex flex-col gap-4">
          <h4 className="font-display font-semibold text-[14px]">As regras</h4>

          <CampoRotulo rotulo="As opções do campo Tipo" id="painel-tipos" dica='O Tipo responde "que tratativa foi essa?". Digite e aperte Enter; o × tira.'>
            <ListaDeTextos id="painel-tipos" valor={f.tipos} max={30} maxLetras={40} placeholder="Ex.: Visita técnica" onChange={(v) => mudar({ tipos: v })} />
          </CampoRotulo>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.contaPrazo} onChange={(v) => mudar({ contaPrazo: v })} />
            <span>Conta prazo <span className="block text-[12.5px] text-muted">A primeira resposta e a solução, pela prioridade (Ajustes › Prazos). O Desenvolvimento, por exemplo, não conta.</span></span>
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <Toggle checked={f.fecharSozinho} onChange={(v) => mudar({ fecharSozinho: v })} />
              <span>O Resolvido fecha sozinho <span className="block text-[12.5px] text-muted">Quando o cliente não responde depois da solução.</span></span>
            </label>
            {f.fecharSozinho ? (
              <div className="flex flex-wrap items-center gap-2 text-sm pl-12">
                depois de
                <input className="input w-20 tnum" id="painel-dias" type="number" min={1} max={60} value={f.fecharSozinhoDias} onChange={(e) => mudar({ fecharSozinhoDias: e.target.value })}
                  aria-label="Dias úteis até fechar sozinho" />
                {dias === 1 ? 'dia útil' : 'dias úteis'} sem resposta
                {!diasOk && <span className="text-bad text-[12.5px] basis-full">De 1 a 60 dias úteis.</span>}
              </div>
            ) : <p className="text-[12.5px] text-muted pl-12">Nunca: o Resolvido espera alguém fechar.</p>}
          </div>

          <CampoRotulo rotulo="O que é obrigatório para abrir" id="painel-obrigatorios" grupo
            dica="O formulário de abrir mostra um * nestes campos, e o chamado não abre sem eles. O que só existe depois de aberto (solução, causa, checklist, tempo) fica nas regras de cada etapa.">
            <Caixinhas id="painel-obrigatorios" campos={CAMPOS_PARA_ABRIR} valor={f.obrigatoriosAoAbrir} onChange={(v) => mudar({ obrigatoriosAoAbrir: v })} />
          </CampoRotulo>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.paiEsperaFilhos} onChange={(v) => mudar({ paiEsperaFilhos: v })} />
            <span>O pai só resolve e fecha com os filhos fechados <span className="block text-[12.5px] text-muted">E diz quais faltam, mesmo os filhos em outro painel.</span></span>
          </label>

          <CampoRotulo rotulo="Supervisores" id="painel-supervisores" grupo dica="Recebem o aviso do que vence, do que fica sem dono e do que chega Crítico.">
            <EscolherPessoas id="painel-supervisores" rotulo="Supervisores" valor={f.supervisores} pessoas={pessoas} todasAsPessoas={todasAsPessoas}
              vazio="Ninguém." onChange={(v) => mudar({ supervisores: v })} />
          </CampoRotulo>
        </section>
        {/* o Enter num campo de texto salva (o botão de verdade fica no rodapé) */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

// =====================================================================
//  AS ETAPAS DO PAINEL
// =====================================================================

type EtapaRascunho = EtapaGravarEntrada & { chave: string; nome: string; tipo: TipoEtapa; nivel: Nivel | null; obrigatorios: CampoObrigatorio[]; avisar: string[] };
type Saindo = { etapa: EtapaRascunho; posicao: number };
type EtapaComChamados = { id: string; nome: string; chamados: number };

const daEtapa = (e: EtapaPainel): EtapaRascunho => ({ chave: e.id, id: e.id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: [...e.obrigatorios], avisar: [...e.avisar] });
const paraGravar = ({ chave: _chave, ...e }: EtapaRascunho): EtapaGravarEntrada => ({ ...e, nome: e.nome.trim() });
const assinatura = (xs: EtapaRascunho[]) => JSON.stringify(xs.map(paraGravar));
let sequencia = 0;
/** O limite do servidor (EtapasGravarSchema). */
const MAX_ETAPAS = 20;

/** "Andamento · N2 · pede: Cliente, Relato do cliente, Assunto · avisa: Pedro". */
function resumoDaEtapa(e: EtapaRascunho, pessoas: PessoaCurta[]): string {
  const pede = CAMPOS_CHAMADO.filter((c) => e.obrigatorios.includes(c)).map((c) => NOME_CAMPO[c]);
  return [
    TIPO_CURTO[e.tipo],
    e.nivel ? `N${e.nivel}` : '',
    pede.length ? `pede: ${pede.join(', ')}` : 'não pede nada',
    e.avisar.length ? `avisa: ${listaDeNomes(e.avisar.map((id) => nomeDaPessoa(pessoas, id)))}` : '',
  ].filter(Boolean).join(' · ');
}

function EditorDeEtapas({ painel, pessoas, todasAsPessoas }: { painel: Painel; pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[] }) {
  const depois = useDepoisDeMudar();
  const [rascunho, setRascunho] = useState<EtapaRascunho[]>(() => painel.etapas.map(daEtapa));
  /** as etapas como estão no servidor (para saber se mudou e para o "Desfazer") */
  const [base, setBase] = useState<EtapaRascunho[]>(() => painel.etapas.map(daEtapa));
  const [saindo, setSaindo] = useState<Saindo[]>([]);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  /** o servidor disse que estas etapas saem com chamados: a janela pergunta para onde eles vão */
  const [semDestino, setSemDestino] = useState<{ mensagem: string; etapas: EtapaComChamados[] } | null>(null);
  const [salvoAgora, setSalvoAgora] = useState(false);

  const mudou = assinatura(rascunho) !== assinatura(base) || saindo.length > 0;
  // outra pessoa (ou a janela do painel) mudou o painel: sem mudança aqui, a lista acompanha
  const doServidor = assinatura(painel.etapas.map(daEtapa));
  useEffect(() => {
    if (mudou) return;
    if (doServidor !== assinatura(base)) { const n = painel.etapas.map(daEtapa); setRascunho(n); setBase(n); }
  }, [doServidor]); // eslint-disable-line react-hooks/exhaustive-deps

  // quantos chamados há em cada etapa (o quadro do painel conta), para tirar uma etapa sabendo o que ela tem
  const quadro = useQuery({ queryKey: ['atendimento', 'quadro', 'ajustes', painel.id], queryFn: () => api.atendimento.quadro({ painel: painel.id }), staleTime: 30_000 });
  const chamadosNa = (id: string | undefined) => (id ? quadro.data?.colunas.find((c) => c.etapa.id === id)?.total ?? null : null);

  const mexer = (fn: (xs: EtapaRascunho[]) => EtapaRascunho[]) => { setRascunho(fn); setErro(''); setSalvoAgora(false); };
  const mudarEtapa = (chave: string, o: Partial<EtapaRascunho>) => mexer((xs) => xs.map((e) => (e.chave === chave ? { ...e, ...o } : e)));
  const moverPara = (chave: string, delta: number) => mexer((xs) => {
    const i = xs.findIndex((e) => e.chave === chave);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= xs.length) return xs;
    const n = [...xs];
    [n[i], n[j]] = [n[j]!, n[i]!];
    return n;
  });
  const alternar = (chave: string) => setAbertas((s) => { const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });

  const incluir = () => {
    const chave = `nova-${++sequencia}`;
    const nova: EtapaRascunho = { chave, nome: '', tipo: 'andamento', nivel: null, obrigatorios: [], avisar: [] };
    // a etapa nova costuma ser de andamento: entra antes do Resolvido (dá para mudar de lugar depois)
    mexer((xs) => {
      const i = xs.findIndex((e) => e.tipo === 'resolvido' || e.tipo === 'fechado');
      return i < 0 ? [...xs, nova] : [...xs.slice(0, i), nova, ...xs.slice(i)];
    });
    setAbertas((s) => new Set(s).add(chave));
    window.setTimeout(() => document.getElementById(`etapa-nome-${chave}`)?.focus(), 30);
  };
  const tirar = (e: EtapaRascunho) => {
    const posicao = rascunho.findIndex((x) => x.chave === e.chave);
    mexer((xs) => xs.filter((x) => x.chave !== e.chave));
    // a que já existia fica na lista "saem ao salvar" (dá para trazer de volta); a nova só some
    if (e.id) setSaindo((s) => [...s, { etapa: e, posicao }]);
  };
  const trazerDeVolta = (s: Saindo) => {
    setSaindo((xs) => xs.filter((x) => x.etapa.chave !== s.etapa.chave));
    mexer((xs) => [...xs.slice(0, s.posicao), s.etapa, ...xs.slice(s.posicao)]);
  };
  const desfazer = () => { setRascunho(base); setSaindo([]); setAbertas(new Set()); setErro(''); };

  const arrasto = useArrastar(rascunho.map((e) => e.chave), (nova) => mexer((xs) => nova.map((k) => xs.find((e) => e.chave === k)!).filter(Boolean)));

  const enviar = async (destino: Record<string, string>) => {
    // as mesmas conferências do servidor (o schema do @gestor/shared), ditas com o número da etapa
    const conferido = EtapasGravarSchema.safeParse({ etapas: rascunho.map(paraGravar), destino });
    if (!conferido.success) {
      const i = conferido.error.issues[0]!;
      const n = typeof i.path[1] === 'number' ? i.path[1] : null;
      setErro(n !== null ? `Etapa ${n + 1}: ${i.message}.` : `${i.message}.`);
      if (n !== null) { const k = rascunho[n]?.chave; if (k) setAbertas((s) => new Set(s).add(k)); }
      return;
    }
    setSalvando(true); setErro('');
    try {
      const p = await depois(api.atendimento.salvarEtapas(painel.id, { etapas: rascunho.map(paraGravar), destino }), `Etapas do ${painel.nome} salvas`);
      const n = p.etapas.map(daEtapa);
      setRascunho(n); setBase(n); setSaindo([]); setAbertas(new Set()); setSemDestino(null); setSalvoAgora(true);
    } catch (e) {
      const d = e instanceof ApiError && e.status === 400 && e.details && typeof e.details === 'object' && !Array.isArray(e.details)
        ? (e.details as { etapas?: EtapaComChamados[] }).etapas : undefined;
      if (d?.length) setSemDestino({ mensagem: e instanceof Error ? e.message : '', etapas: d });
      else setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const nomeDaChave = (k: string) => rascunho.find((e) => e.chave === k)?.nome || 'etapa nova';
  return (
    <section className="card p-4 sm:p-5 min-w-0" aria-label={`As etapas do painel ${painel.nome}`} id="etapas">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display font-semibold text-[16px]">As etapas do painel {painel.nome}</h2>
        <Chip tone={TOM_DO_PAINEL[painel.cor]} className="font-mono">{painel.sigla}</Chip>
      </div>
      <p className="text-[12.5px] text-muted mt-0.5 max-w-3xl">
        Na ordem do quadro, da esquerda para a direita. Arraste pela alça (ou use as setas) para mudar a ordem. O chamado novo cai na
        primeira etapa de <b>Entrada</b>; mover para um nível acima (N1 → N2) é escalonar e pede o motivo.
      </p>

      <ol className="mt-3 flex flex-col gap-2" id="etapas-lista">
        {rascunho.map((e, i) => {
          const aberta = abertas.has(e.chave);
          const n = chamadosNa(e.id);
          return (
            <li key={e.chave} data-arrastavel={e.chave}
              className={`rounded-lg border bg-surface min-w-0 transition-opacity ${arrasto.arrastando === e.chave ? 'opacity-40 border-accent ring-2 ring-accent' : 'border-line'}`}>
              <div className="p-2 sm:p-2.5">
              <div className="flex items-start gap-1.5">
                <button type="button" onPointerDown={(ev) => arrasto.iniciar(e.chave, ev)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'ArrowUp') { ev.preventDefault(); moverPara(e.chave, -1); }
                    if (ev.key === 'ArrowDown') { ev.preventDefault(); moverPara(e.chave, 1); }
                  }}
                  className="touch-none cursor-grab active:cursor-grabbing rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink shrink-0"
                  aria-label={`Mudar ${e.nome || 'a etapa nova'} de lugar: arraste, ou use as setas do teclado`} title="Arraste para mudar de lugar (ou use as setas do teclado)">
                  <GripVertical size={16} />
                </button>
                <span className="tnum text-[12px] text-muted w-4 text-right mt-1 shrink-0 select-none">{i + 1}</span>
                <button type="button" className="min-w-0 flex-1 text-left mt-0.5" onClick={() => alternar(e.chave)} aria-expanded={aberta}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink break-words">{e.nome.trim() || <span className="text-muted italic font-normal">sem nome</span>}</span>
                    {/* o nível em chip, menos quando o nome já é o nível (a etapa "N2") */}
                    {e.nivel && paraBusca(e.nome) !== `n${e.nivel}` && <Chip tone="accent">N{e.nivel}</Chip>}
                    {!e.id && <Chip tone="ok">nova</Chip>}
                  </span>
                </button>
                <span className="flex items-center shrink-0">
                  <BotaoIcone rotulo={`Subir ${e.nome || 'a etapa'}`} desativado={i === 0} onClick={() => moverPara(e.chave, -1)}><ArrowUp size={15} /></BotaoIcone>
                  <BotaoIcone rotulo={`Descer ${e.nome || 'a etapa'}`} desativado={i === rascunho.length - 1} onClick={() => moverPara(e.chave, 1)}><ArrowDown size={15} /></BotaoIcone>
                  <BotaoIcone rotulo={aberta ? `Fechar ${e.nome || 'a etapa'}` : `Editar ${e.nome || 'a etapa'}`} onClick={() => alternar(e.chave)}>{aberta ? <ChevronUp size={15} /> : <Pencil size={15} />}</BotaoIcone>
                  <BotaoIcone rotulo={`Tirar ${e.nome || 'a etapa'}`} onClick={() => tirar(e)} perigo><Trash2 size={15} /></BotaoIcone>
                </span>
              </div>
              {/* o resumo na largura toda (no celular, ao lado dos botões, ficava espremido) */}
              <p className="text-[12.5px] text-muted leading-snug pl-[52px] pr-1 break-words cursor-pointer" onClick={() => alternar(e.chave)}>
                {resumoDaEtapa(e, todasAsPessoas)}
                {/* o número leva à lista com os chamados desta etapa */}
                {n !== null && n > 0 && e.id && <> · <Link to={`/atendimento/lista?painel=${encodeURIComponent(painel.id)}&etapa=${encodeURIComponent(e.id)}&situacao=todos`}
                  className="font-semibold text-ink-2 hover:text-accent tnum" onClick={(ev) => ev.stopPropagation()} title={`Ver os chamados de ${e.nome} na lista`}>{n} {n === 1 ? 'chamado' : 'chamados'}</Link></>}
              </p>
              </div>
              {aberta && <EditarEtapa e={e} pessoas={pessoas} todasAsPessoas={todasAsPessoas} onMudar={(o) => mudarEtapa(e.chave, o)} />}
            </li>
          );
        })}
      </ol>

      {saindo.length > 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-line-strong p-2.5 text-[13px] flex flex-wrap items-center gap-2" id="etapas-saindo">
          <span className="text-muted">Saem ao salvar:</span>
          {saindo.map((s) => {
            const n = chamadosNa(s.etapa.id);
            return (
              <span key={s.etapa.chave} className="chip bg-bad-soft text-bad">
                <span className="line-through">{s.etapa.nome}</span>{n ? <span className="font-normal no-underline">({n} {n === 1 ? 'chamado' : 'chamados'})</span> : null}
                <button type="button" className="hover:opacity-70 inline-flex items-center gap-0.5 font-semibold" onClick={() => trazerDeVolta(s)} aria-label={`Trazer ${s.etapa.nome} de volta`}>
                  <Undo2 size={12} /> trazer de volta
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" id="etapas-incluir" onClick={incluir} disabled={rascunho.length >= MAX_ETAPAS}><Plus size={14} /> Incluir etapa</button>
        {rascunho.length >= MAX_ETAPAS && <span className="text-[12.5px] text-muted">Um painel vai até {MAX_ETAPAS} etapas.</span>}
      </div>

      <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" id="etapas-salvar" disabled={!mudou || salvando} onClick={() => void enviar({})}>
          {salvando ? <Spinner className="text-white" /> : null} Salvar as etapas
        </button>
        <button type="button" className="btn-ghost" disabled={!mudou || salvando} onClick={desfazer}><RotateCcw size={15} /> Desfazer as mudanças</button>
        <span className={`text-[12.5px] ${mudou ? 'text-signal font-semibold' : salvoAgora ? 'text-ok font-semibold' : 'text-muted'}`} aria-live="polite">
          {mudou ? 'Há mudanças não salvas.' : salvoAgora ? 'Salvo.' : 'Nenhuma mudança.'}
        </span>
        {erro && <p className="text-bad text-[13px] basis-full" role="alert" id="etapas-erro">{erro}</p>}
      </div>

      {/* o nome da etapa acompanha o ponteiro enquanto se arrasta */}
      {arrasto.arrastando && createPortal(
        <div ref={arrasto.fantasma} className="fixed left-0 top-0 z-50 pointer-events-none card shadow-lg px-3 py-2 text-sm font-semibold flex items-center gap-2"
          style={{ transform: `translate(${arrasto.posicao.current.x + 14}px, ${arrasto.posicao.current.y + 10}px)` }}>
          <GripVertical size={15} className="text-muted" /> {nomeDaChave(arrasto.arrastando)}
        </div>,
        document.body,
      )}

      {semDestino && (
        <JanelaDestino mensagem={semDestino.mensagem} saem={semDestino.etapas} ficam={rascunho.filter((e) => !!e.id)} saindo={saindo}
          salvando={salvando} onFechar={() => setSemDestino(null)} onConfirmar={(destino) => void enviar(destino)} />
      )}
    </section>
  );
}

function BotaoIcone({ rotulo, onClick, desativado, perigo, children }: { rotulo: string; onClick: () => void; desativado?: boolean; perigo?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={desativado} aria-label={rotulo} title={rotulo}
      className={`p-1.5 rounded-md text-ink-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent ${perigo ? 'hover:text-bad' : 'hover:text-ink'}`}>
      {children}
    </button>
  );
}

/** Os detalhes de uma etapa: o nome, o tipo (com a dica), o nível, o que pede para entrar e quem avisa. */
function EditarEtapa({ e, pessoas, todasAsPessoas, onMudar }: { e: EtapaRascunho; pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[]; onMudar: (o: Partial<EtapaRascunho>) => void }) {
  const base = `etapa-${e.chave}`;
  const fecha = e.tipo === 'resolvido' || e.tipo === 'fechado';
  return (
    <div className="border-t border-line p-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CampoRotulo rotulo="Nome" id={`etapa-nome-${e.chave}`}>
        <input className="input" id={`etapa-nome-${e.chave}`} value={e.nome} maxLength={40} placeholder="Ex.: Aguardando peça" autoComplete="off" onChange={(ev) => onMudar({ nome: ev.target.value })} />
      </CampoRotulo>
      <CampoRotulo rotulo="Tipo" id={`${base}-tipo`} dica={DICA_TIPO_ETAPA[e.tipo]}>
        <select className="input" id={`${base}-tipo`} value={e.tipo} onChange={(ev) => onMudar({ tipo: ev.target.value as TipoEtapa })}>
          {TIPOS_ETAPA.map((t) => <option key={t} value={t}>{NOME_TIPO_ETAPA[t]}</option>)}
        </select>
      </CampoRotulo>
      <CampoRotulo rotulo="Nível" id={`${base}-nivel`} grupo dica="Mover para um nível acima é escalonar; para um abaixo, voltar de nível (os dois pedem o motivo).">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Nível" id={`${base}-nivel`}>
          {([null, 1, 2, 3] as const).map((n) => (
            <button key={n ?? 0} type="button" role="radio" aria-checked={e.nivel === n} onClick={() => onMudar({ nivel: n })}
              className={`rounded-lg border px-3 py-1.5 text-[13px] min-w-[44px] ${e.nivel === n ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
              {n ? `N${n}` : '—'}
            </button>
          ))}
        </div>
      </CampoRotulo>
      <CampoRotulo rotulo="Quem recebe o aviso quando um chamado chega aqui" id={`${base}-avisar`} grupo dica="Na tela e no WhatsApp (se ligado em Avisos e WhatsApp). Quem moveu não é avisado.">
        <EscolherPessoas id={`${base}-avisar`} rotulo="Quem recebe o aviso" valor={e.avisar} pessoas={pessoas} todasAsPessoas={todasAsPessoas} vazio="Ninguém." onChange={(v) => onMudar({ avisar: v })} />
      </CampoRotulo>
      <CampoRotulo rotulo="O que precisa estar preenchido para entrar" id={`${base}-obrigatorios`} grupo className="sm:col-span-2"
        dica={fecha ? 'O problema (ITIL) sempre pede a causa, a solução e a validação para resolver e fechar, em qualquer painel.' : 'Sem o que está marcado, o chamado não entra: a tela diz o que falta.'}>
        <Caixinhas id={`${base}-obrigatorios`} campos={[...CAMPOS_CHAMADO]} valor={e.obrigatorios} onChange={(v) => onMudar({ obrigatorios: v })} />
      </CampoRotulo>
    </div>
  );
}

/**
 * O servidor recusou: uma etapa que sai tem chamados. Para cada uma, para qual das etapas que ficam
 * os chamados vão (a sugestão é uma do mesmo tipo). Só as que já existem servem de destino: a etapa
 * nova ganha o seu lugar quando a lista é salva.
 */
function JanelaDestino({ mensagem, saem, ficam, saindo, salvando, onFechar, onConfirmar }: {
  mensagem: string; saem: EtapaComChamados[]; ficam: EtapaRascunho[]; saindo: Saindo[]; salvando: boolean;
  onFechar: () => void; onConfirmar: (destino: Record<string, string>) => void;
}) {
  const [destino, setDestino] = useState<Record<string, string>>(() => Object.fromEntries(saem.map((s) => {
    const tipo = saindo.find((x) => x.etapa.id === s.id)?.etapa.tipo;
    return [s.id, (ficam.find((e) => e.tipo === tipo) ?? ficam[0])?.id ?? ''];
  })));
  const completo = saem.every((s) => !!destino[s.id]);
  return (
    <Modal open onClose={onFechar} titulo="Para onde vão os chamados?" largura="max-w-lg"
      rodape={<>
        <button type="button" className="btn-secondary" onClick={onFechar}>Voltar</button>
        <button type="button" className="btn-primary" id="destino-confirmar" disabled={!completo || salvando} onClick={() => onConfirmar(destino)}>
          {salvando ? <Spinner className="text-white" /> : 'Mover e salvar as etapas'}
        </button>
      </>}>
      <p className="text-sm text-ink-2">{mensagem}</p>
      {!ficam.length ? (
        <p className="text-sm text-bad mt-3">Nenhuma das etapas que já existiam fica no painel. Traga uma de volta (ou salve as novas primeiro) para receber os chamados.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {saem.map((s) => (
            <div key={s.id} className="rounded-lg border border-line p-3">
              <label className="label" htmlFor={`destino-${s.id}`}>
                {s.chamados === 1 ? 'O chamado' : `Os ${s.chamados} chamados`} de <span className="line-through">{s.nome}</span> {s.chamados === 1 ? 'vai' : 'vão'} para
              </label>
              <select className="input" id={`destino-${s.id}`} value={destino[s.id] ?? ''} onChange={(e) => setDestino((d) => ({ ...d, [s.id]: e.target.value }))}>
                <option value="">— escolha —</option>
                {ficam.map((e) => <option key={e.id} value={e.id}>{e.nome} ({TIPO_CURTO[e.tipo]}{e.nivel ? ` · N${e.nivel}` : ''})</option>)}
              </select>
            </div>
          ))}
          <p className="text-[12.5px] text-muted">
            O histórico de cada chamado diz que ele mudou de etapa porque a etapa saiu do painel, e ninguém é avisado (é arrumação, não
            trabalho no chamado). Só as etapas que já existiam servem de destino: a nova ganha o seu lugar quando a lista é salva.
          </p>
        </div>
      )}
    </Modal>
  );
}

// =====================================================================
//  AS PEÇAS DOS FORMULÁRIOS
// =====================================================================

function CampoRotulo({ rotulo, id, erro, dica, grupo = false, className = '', children }: {
  rotulo: string; id: string; erro?: string; dica?: string;
  /** um grupo de botões ou caixinhas: o título não é um <label> de campo */
  grupo?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      {grupo ? <div className="label" id={`${id}-rotulo`}>{rotulo}</div> : <label className="label" htmlFor={id}>{rotulo}</label>}
      {children}
      {erro ? <div className="text-bad text-[12.5px] mt-1">{erro}</div> : dica ? <div className="text-muted text-[12.5px] mt-1">{dica}</div> : null}
    </div>
  );
}

function Opcao({ ativo, onClick, titulo, texto }: { ativo: boolean; onClick: () => void; titulo: string; texto: string }) {
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2 flex items-start gap-2.5 ${ativo ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}>
      <span className={`mt-1 w-3.5 h-3.5 rounded-full border-2 shrink-0 ${ativo ? 'border-accent bg-accent' : 'border-line-strong'}`} aria-hidden />
      <span><span className={`block text-[13.5px] font-semibold ${ativo ? 'text-accent-ink' : 'text-ink'}`}>{titulo}</span><span className="block text-[12px] text-muted">{texto}</span></span>
    </button>
  );
}

/** As caixinhas dos campos (o que é obrigatório), na ordem da lista de campos. */
function Caixinhas({ id, campos, valor, onChange }: { id: string; campos: CampoObrigatorio[]; valor: CampoObrigatorio[]; onChange: (v: CampoObrigatorio[]) => void }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 min-[480px]:grid-cols-2 md:grid-cols-3" id={id}>
      {campos.map((c) => (
        <label key={c} className="flex items-center gap-2 text-[13px] cursor-pointer py-0.5">
          <input type="checkbox" className="accent-[var(--accent)]" checked={valor.includes(c)}
            onChange={(e) => onChange(e.target.checked ? CAMPOS_CHAMADO.filter((x) => x === c || valor.includes(x)) : valor.filter((x) => x !== c))} />
          {NOME_CAMPO[c]}
        </label>
      ))}
    </div>
  );
}

/** Várias pessoas: as escolhidas em etiquetas (com o ×), e o "Incluir" procura entre as que faltam. */
function EscolherPessoas({ id, rotulo, valor, pessoas, todasAsPessoas, vazio, onChange }: {
  id: string; rotulo: string; valor: string[]; pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[]; vazio: string; onChange: (v: string[]) => void;
}) {
  const resto: OpcaoBusca[] = pessoas.filter((p) => !valor.includes(p.id)).map((p) => ({ id: p.id, nome: p.nome }));
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-[34px]" id={id}>
      {valor.map((v) => (
        <span key={v} className="chip bg-accent-soft text-accent-ink">
          {nomeDaPessoa(todasAsPessoas, v)}
          <button type="button" className="hover:opacity-70" onClick={() => onChange(valor.filter((x) => x !== v))} aria-label={`Tirar ${nomeDaPessoa(todasAsPessoas, v)}`}><X size={12} /></button>
        </span>
      ))}
      {!valor.length && <span className="text-[12.5px] text-muted">{vazio}</span>}
      {resto.length > 0 && (
        <EscolherComBusca valor="" opcoes={resto} onChange={(v) => v && onChange([...valor, v])} procurar="Procurar pessoa…" rotulo={`${rotulo}: incluir pessoa`}
          gatilho={(abrir) => <button type="button" className="btn-ghost btn-sm" onClick={abrir}><UserPlus size={14} /> Incluir <ChevronDown size={13} /></button>} />
      )}
    </div>
  );
}

/** Uma lista de textos curtos (as opções do Tipo): digita e Enter (ou vírgula); o × tira. */
function ListaDeTextos({ id, valor, onChange, max, maxLetras, placeholder }: { id: string; valor: string[]; onChange: (v: string[]) => void; max: number; maxLetras: number; placeholder: string }) {
  const [t, setT] = useState('');
  const somar = () => {
    const novas = t.split(/[,;\n]/).map((x) => x.trim().slice(0, maxLetras)).filter(Boolean);
    if (novas.length) onChange(etiquetasUnicas([...valor, ...novas]).slice(0, max));
    setT('');
  };
  return (
    <div className="input flex flex-wrap items-center gap-1.5 py-1.5 min-h-[40px]">
      {valor.map((p) => (
        <span key={p} className="chip bg-surface-2 text-ink-2">{p}<button type="button" className="hover:opacity-70" onClick={() => onChange(valor.filter((x) => x !== p))} aria-label={`Tirar ${p}`}><X size={12} /></button></span>
      ))}
      <input className="flex-1 min-w-[140px] bg-transparent outline-none text-sm py-0.5" id={id} autoComplete="off" value={t} maxLength={maxLetras}
        placeholder={valor.length ? '' : placeholder} onChange={(e) => setT(e.target.value)} onBlur={somar}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); somar(); } else if (e.key === 'Backspace' && !t && valor.length) onChange(valor.slice(0, -1)); }} />
    </div>
  );
}

