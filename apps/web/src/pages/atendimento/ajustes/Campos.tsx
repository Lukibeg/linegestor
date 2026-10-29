/**
 * Painéis › Ajustes (Patch 2.0, decisão 0047) — OS CAMPOS DE CADA PAINEL.
 *
 * O pedido do Luan na prévia: "vou ter outros painéis, então nem sempre vai ser assuntos; pode ter
 * algum painel que não tenha assuntos e sim outro campo personalizado — o correto é fazer ajustes e
 * campos personalizados, e aí sim eu edito os campos de cada painel". Aqui, painel por painel:
 *
 *  - os campos do sistema que o painel usa: o Assunto (a árvore abre daqui), o Tipo (e as opções dele),
 *    a Gravidade e o alcance, os Produtos e as Operadoras — ligados ou desligados;
 *  - os campos que a equipe cria: texto, texto longo, número, data, sim ou não e lista (de uma ou de
 *    várias opções), cada um obrigatório para abrir ou para entrar nas etapas escolhidas;
 *  - a implantação (2.3): as caixinhas (o que já foi feito, com quem marcou e quando) e os módulos do produto; e, em
 *    qualquer campo, a parte da ficha (Curadoria, Configuração, Testes: o campo vai para o meio da ficha, num cartão
 *    com os da mesma parte) e o produto (o campo só aparece no chamado que tem o produto).
 *
 * Desligar e desativar nunca apagam: o que os chamados já têm fica guardado e volta com o campo. O
 * resto do chamado (cliente, contato, relato, descrição, prioridade, responsável, solução, causa,
 * etiquetas) está em todo painel.
 */
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ListTree, Pencil, Plus, Undo2, X } from 'lucide-react';
import {
  camposDoSistemaDoTipo, DICA_CAMPO_DO_SISTEMA, DICA_TIPO_CAMPO, MAX_CAMPOS_DO_PAINEL, MAX_OPCOES_DO_CAMPO, NOME_CAMPO_DO_SISTEMA, NOME_TIPO_CAMPO,
  OBRIGATORIOS_DO_CAMPO, TIPOS_CAMPO, chaveDoCampo, etiquetasUnicas, nomeDoSistemaIgual, paraBusca, partesDoPainel, temOpcoesEscritas,
  type CampoDoSistema, type CampoGravarEntrada, type CampoPersonalizado, type Painel, type TipoCampo,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Carregando, Chip, Confirmar, Modal, Spinner, Toggle, Vazio, mensagemErro } from '../../../components/ui/index.js';
import { TOM_DO_PAINEL, useDepoisDeMudar, useOpcoes } from '../comum.js';
import { AjustesAssuntos } from './Assuntos.js';
import { caixinhasParaGravar, EditorDasCaixinhas, pastasDoEditor, problemaNasPastas, type PastaRascunho } from './EditorDasCaixinhas.js';

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** Onde o painel pede estas chaves: "para abrir" e os nomes das etapas. */
function ondePede(painel: Painel, chaves: string[]): string[] {
  return [
    ...(painel.ajustes.obrigatoriosAoAbrir.some((k) => chaves.includes(k)) ? ['para abrir'] : []),
    ...painel.etapas.filter((e) => e.obrigatorios.some((k) => chaves.includes(k))).map((e) => e.nome),
  ];
}

/**
 * A escolha do painel nos Ajustes que são de cada painel (os campos e, desde o 2.0.3, as etiquetas): um botão
 * por painel, com a sigla na cor dele.
 */
export function EscolhaDoPainel({ paineis, atual, onEscolher, id, rotulo }: { paineis: Painel[]; atual: Painel; onEscolher: (id: string) => void; id: string; rotulo: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={rotulo} id={id}>
      <span className="text-[12.5px] font-semibold text-ink-2 mr-1">Painel</span>
      {paineis.map((p) => {
        const ativo = p.id === atual.id;
        return (
          <button key={p.id} type="button" role="radio" aria-checked={ativo} onClick={() => onEscolher(p.id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13.5px] ${ativo ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
            <Chip tone={TOM_DO_PAINEL[p.cor]} className="font-mono">{p.sigla}</Chip> {p.nome}
          </button>
        );
      })}
    </div>
  );
}

export function AjustesCampos() {
  const opcoes = useOpcoes();
  const [sp, setSp] = useSearchParams();
  const [janela, setJanela] = useState<CampoPersonalizado | 'novo' | null>(null);
  const [tipos, setTipos] = useState(false);

  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError || !opcoes.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(opcoes.error)}</p>;
  const { paineis } = opcoes.data;
  // o painel fica no endereço (?painel=), o mesmo da aba Painéis e etapas
  const painel = paineis.find((p) => p.id === sp.get('painel')) ?? paineis[0];
  if (!painel) return <Vazio titulo="Nenhum painel" texto="Crie um painel em Painéis e etapas: os campos são de cada painel." />;

  const mudar = (o: Record<string, string | null>) => setSp((s) => {
    const n = new URLSearchParams(s);
    for (const [k, v] of Object.entries(o)) { if (v === null) n.delete(k); else n.set(k, v); }
    return n;
  }, { replace: true });
  // a árvore de assuntos abre aqui mesmo (?ver=assuntos): é a configuração do campo Assunto deste painel
  if (sp.get('ver') === 'assuntos') return <AjustesAssuntos painel={painel} onVoltar={() => mudar({ ver: null })} />;

  const campos = opcoes.data.campos.filter((c) => c.painelId === painel.id);
  const nAssuntos = opcoes.data.assuntos.filter((a) => a.painelId === painel.id).length;

  return (
    <div className="flex flex-col gap-4">
      <EscolhaDoPainel paineis={paineis} atual={painel} onEscolher={(id) => mudar({ painel: id })} id="campos-painel" rotulo="O painel dos campos" />

      <CamposDoSistema painel={painel} nAssuntos={nAssuntos} onAssuntos={() => mudar({ ver: 'assuntos' })} onTipos={() => setTipos(true)} />
      <CamposDoPainel painel={painel} campos={campos} onNovo={() => setJanela('novo')} onEditar={setJanela} />

      <p className="text-[12.5px] text-muted max-w-3xl">
        Desligar um campo do sistema ou desativar um campo do painel <b className="text-ink-2">nunca apaga</b>: some da ficha, do Abrir chamado e das
        regras, e o que os chamados já têm fica guardado — volta se o campo voltar. O que é obrigatório para entrar em cada etapa também se marca
        em Painéis e etapas.
      </p>

      {janela && <JanelaCampo key={janela === 'novo' ? 'novo' : janela.id} painel={painel} campo={janela === 'novo' ? null : janela} onFechar={() => setJanela(null)} />}
      {tipos && <JanelaTipos painel={painel} onFechar={() => setTipos(false)} />}
    </div>
  );
}

// =====================================================================
//  OS CAMPOS DO SISTEMA (ligados ou desligados em cada painel)
// =====================================================================

function CamposDoSistema({ painel, nAssuntos, onAssuntos, onTipos }: { painel: Painel; nAssuntos: number; onAssuntos: () => void; onTipos: () => void }) {
  const depois = useDepoisDeMudar();
  const [desligando, setDesligando] = useState<CampoDoSistema | null>(null);
  const [ocupado, setOcupado] = useState<CampoDoSistema | null>(null);
  const [erro, setErro] = useState('');
  const desligados = painel.ajustes.camposDesligados;

  const gravar = async (c: CampoDoSistema, novos: CampoDoSistema[], ok: string) => {
    setOcupado(c); setErro('');
    try {
      await depois(api.atendimento.salvarCamposDoSistema(painel.id, { desligados: novos, tipos: painel.ajustes.tipos }), ok);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(null);
    }
  };
  const pedeAgora = desligando ? ondePede(painel, OBRIGATORIOS_DO_CAMPO[desligando]) : [];

  return (
    <section className="card min-w-0" aria-labelledby="campos-sistema-titulo" id="campos-do-sistema">
      <header className="px-3 py-2.5 sm:px-4 border-b border-line">
        <h3 className="font-display font-semibold text-[15px]" id="campos-sistema-titulo">Os campos do sistema</h3>
        <p className="text-[12.5px] text-muted">
          {painel.tipo === 'vendas'
            ? 'Toda negociação tem a empresa, o título, o valor, o responsável e as etiquetas. Estes, cada painel usa ou não:'
            : 'Todo chamado tem o título, a descrição, o responsável e as etiquetas. Estes, cada painel usa ou não (sem a prioridade, o painel não conta prazo):'}
        </p>
      </header>
      <ul className="divide-y divide-line">
        {camposDoSistemaDoTipo(painel.tipo).map((c) => {
          const ligado = !desligados.includes(c);
          const pede = ligado ? ondePede(painel, OBRIGATORIOS_DO_CAMPO[c]) : [];
          const nome = NOME_CAMPO_DO_SISTEMA[c];
          return (
            <li key={c} className="px-3 py-2.5 sm:px-4 flex flex-wrap items-start gap-x-3 gap-y-1.5" data-campo-sistema={c}>
              <span className="mt-0.5" title={ligado ? `Desligar ${nome} neste painel` : `Ligar ${nome} neste painel`}>
                <Toggle checked={ligado} onChange={(v) => (v ? void gravar(c, desligados.filter((x) => x !== c), `${nome}: ligado no painel ${painel.nome}`) : setDesligando(c))} />
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`font-semibold text-[14px] ${ligado ? 'text-ink' : 'text-muted'}`}>{nome}</span>
                  {!ligado && <Chip tone="muted">desligado neste painel</Chip>}
                  {pede.length > 0 && <Chip tone="signal" title={`Obrigatório: ${lista(pede)}`}>obrigatório: {lista(pede)}</Chip>}
                  {ocupado === c && <Spinner className="!w-3.5 !h-3.5" />}
                </div>
                <p className="text-[12.5px] text-muted leading-snug">{DICA_CAMPO_DO_SISTEMA[c]}</p>
                {c === 'tipo' && ligado && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {painel.ajustes.tipos.length ? painel.ajustes.tipos.map((t) => <Chip key={t} tone="neutral">{t}</Chip>) : <span className="text-[12.5px] text-muted">Sem opções: o Tipo não aparece.</span>}
                  </div>
                )}
              </div>
              {c === 'assunto' && ligado && (
                <button type="button" className="btn-secondary btn-sm shrink-0" id="campos-abrir-assuntos" onClick={onAssuntos} title="A árvore de assuntos deste painel: descrição, checklist e de-para">
                  <ListTree size={14} /> A árvore <span className="tnum text-muted font-normal">({nAssuntos})</span>
                </button>
              )}
              {c === 'tipo' && ligado && (
                <button type="button" className="btn-secondary btn-sm shrink-0" id="campos-editar-tipos" onClick={onTipos}><Pencil size={14} /> As opções</button>
              )}
            </li>
          );
        })}
      </ul>
      {erro && <p role="alert" className="text-bad text-[13px] px-4 pb-3">{erro}</p>}
      <Confirmar open={!!desligando} onClose={() => setDesligando(null)} botao="Desligar"
        titulo={desligando ? `Desligar ${NOME_CAMPO_DO_SISTEMA[desligando]} no painel ${painel.nome}?` : ''}
        texto={desligando ? (
          <>
            Some da ficha, do Abrir chamado, do quadro e da lista deste painel{pedeAgora.length ? <> e deixa de ser pedido ({lista(pedeAgora)})</> : ''}.
            {' '}O que os chamados já têm fica guardado: volta se você ligar de novo.
          </>
        ) : ''}
        onConfirm={() => { const c = desligando!; setDesligando(null); void gravar(c, [...desligados, c], `${NOME_CAMPO_DO_SISTEMA[c]}: desligado no painel ${painel.nome}`); }} />
    </section>
  );
}

/** As opções do Tipo do painel ("que tratativa foi essa?"). */
function JanelaTipos({ painel, onFechar }: { painel: Painel; onFechar: () => void }) {
  const depois = useDepoisDeMudar();
  const [tipos, setTipos] = useState<string[]>(painel.ajustes.tipos);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true); setErro('');
    try {
      await depois(api.atendimento.salvarCamposDoSistema(painel.id, { desligados: painel.ajustes.camposDesligados, tipos }), `As opções do Tipo do painel ${painel.nome} foram salvas`);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Modal open onClose={onFechar} titulo={`As opções do Tipo no painel ${painel.nome}`}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="tipos-salvar" disabled={salvando} onClick={() => void salvar()}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
      </>}>
      <label className="label" htmlFor="tipos-lista">As opções</label>
      <ListaDeTextos id="tipos-lista" valor={tipos} max={30} maxLetras={40} placeholder="Ex.: Visita técnica" onChange={setTipos} />
      <p className="text-[12.5px] text-muted mt-1.5">O Tipo responde "que tratativa foi essa?". Digite e aperte Enter; o × tira. O chamado que já tem uma opção que saiu continua com ela.</p>
    </Modal>
  );
}

// =====================================================================
//  OS CAMPOS DO PAINEL (os que a equipe cria)
// =====================================================================

function CamposDoPainel({ painel, campos, onNovo, onEditar }: { painel: Painel; campos: CampoPersonalizado[]; onNovo: () => void; onEditar: (c: CampoPersonalizado) => void }) {
  const depois = useDepoisDeMudar();
  const opcoes = useOpcoes();
  const nomeDoProduto = (id: string) => opcoes.data?.produtos.find((p) => p.id === id)?.nome ?? 'produto fora do catálogo';
  const [erro, setErro] = useState('');
  const [movendo, setMovendo] = useState(false);
  const mover = async (id: string, delta: number) => {
    const ids = campos.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    setMovendo(true); setErro('');
    try { await depois(api.atendimento.ordenarCampos(painel.id, ids)); } catch (e) { setErro(mensagemErro(e)); } finally { setMovendo(false); }
  };
  return (
    <section className="card min-w-0" aria-labelledby="campos-painel-titulo" id="campos-do-painel">
      <header className="px-3 py-2.5 sm:px-4 border-b border-line flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-[15px]" id="campos-painel-titulo">Os campos do painel {painel.nome}</h3>
          <p className="text-[12.5px] text-muted">Os que a equipe cria. Aparecem na ficha e no Abrir chamado, nesta ordem (o texto longo fica junto do relato; os que têm parte vão para o meio da ficha, num cartão por parte).</p>
        </div>
        <button type="button" className="btn-primary btn-sm" id="campos-novo" onClick={onNovo} disabled={campos.length >= MAX_CAMPOS_DO_PAINEL}
          title={campos.length >= MAX_CAMPOS_DO_PAINEL ? `Um painel vai até ${MAX_CAMPOS_DO_PAINEL} campos` : undefined}>
          <Plus size={14} /> Novo campo
        </button>
      </header>
      {!campos.length ? (
        <p className="px-4 py-4 text-[13.5px] text-muted" id="campos-vazio">
          Nenhum campo criado neste painel ainda. Exemplos: <b className="text-ink-2">Sistema</b> (uma lista), <b className="text-ink-2">Versão publicada</b> (texto),{' '}
          <b className="text-ink-2">Previsão de entrega</b> (data).
        </p>
      ) : (
        <ul className="divide-y divide-line" id="campos-lista">
          {campos.map((c, i) => {
            const pede = c.ativo ? ondePede(painel, [chaveDoCampo(c.id)]) : [];
            const ativas = c.opcoes.filter((o) => o.ativa);
            return (
              <li key={c.id} className="flex items-start gap-1.5 px-2 py-2 sm:px-3" data-campo={c.nome}>
                <span className="flex shrink-0">
                  <BotaoIcone rotulo={`Subir ${c.nome}`} desativado={i === 0 || movendo} onClick={() => void mover(c.id, -1)}><ArrowUp size={15} /></BotaoIcone>
                  <BotaoIcone rotulo={`Descer ${c.nome}`} desativado={i === campos.length - 1 || movendo} onClick={() => void mover(c.id, 1)}><ArrowDown size={15} /></BotaoIcone>
                </span>
                <button type="button" className={`min-w-0 flex-1 text-left py-0.5 ${c.ativo ? '' : 'opacity-60'}`} onClick={() => onEditar(c)}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink break-words">{c.nome}</span>
                    <Chip tone="neutral">{NOME_TIPO_CAMPO[c.tipo]}</Chip>
                    {c.parte && <Chip tone="accent" title="A parte da ficha: o campo fica no cartão dela, no meio da ficha">{c.parte}</Chip>}
                    {c.produtoId && <Chip tone="neutral" title="Só aparece no chamado que tem este produto">{nomeDoProduto(c.produtoId)}</Chip>}
                    {!c.ativo && <Chip tone="muted">desativado</Chip>}
                    {pede.length > 0 && <Chip tone="signal">obrigatório: {lista(pede)}</Chip>}
                  </span>
                  {temOpcoesEscritas(c.tipo) && <span className="block text-[12.5px] text-ink-2 break-words">{ativas.map((o) => o.nome).join(' · ') || 'Sem opções ativas'}</span>}
                  {c.tipo === 'modulos' && <span className="block text-[12.5px] text-ink-2 break-words">{ativas.map((o) => o.nome).join(' · ') || 'O produto ainda não tem módulos (Administração › Produtos)'}</span>}
                  {c.dica && <span className="block text-[12.5px] text-muted leading-snug break-words">{c.dica}</span>}
                </button>
                <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => onEditar(c)} aria-label={`Editar o campo ${c.nome}`}>
                  <Pencil size={14} /><span className="hidden sm:inline">Editar</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {erro && <p role="alert" className="text-bad text-[13px] px-4 pb-3">{erro}</p>}
    </section>
  );
}

// =====================================================================
//  A JANELA DO CAMPO (novo ou editar)
// =====================================================================

type OpcaoRascunho = { chave: string; id?: string; nome: string; ativa: boolean };
let sequencia = 0;

function JanelaCampo({ painel, campo, onFechar }: { painel: Painel; campo: CampoPersonalizado | null; onFechar: () => void }) {
  const depois = useDepoisDeMudar();
  const opcoesDoModulo = useOpcoes();
  const produtos = opcoesDoModulo.data?.produtos ?? [];
  // as partes que o painel já tem (para escolher sem escrever de novo)
  const partes = partesDoPainel((opcoesDoModulo.data?.campos ?? []).filter((c) => c.painelId === painel.id));
  const chave = campo ? chaveDoCampo(campo.id) : null;
  const [f, setF] = useState(() => ({
    nome: campo?.nome ?? '',
    tipo: campo?.tipo ?? ('texto' as TipoCampo),
    dica: campo?.dica ?? '',
    ativo: campo?.ativo ?? true,
    opcoes: (campo?.opcoes ?? []).map((o): OpcaoRascunho => ({ chave: o.id, id: o.id, nome: o.nome, ativa: o.ativa })),
    obrigatorioAoAbrir: chave ? painel.ajustes.obrigatoriosAoAbrir.includes(chave) : false,
    etapas: chave ? painel.etapas.filter((e) => e.obrigatorios.includes(chave)).map((e) => e.id) : [],
    incluirNaHora: campo?.incluirNaHora ?? false,
    parte: campo?.parte ?? '',
    produtoId: campo?.produtoId ?? '',
    escolhidosEm: campo?.escolhidosEm ?? '',
    anexos: campo?.anexos ?? false,
  }));
  // as caixinhas, em pastas (2.3)
  const [pastas, setPastas] = useState<PastaRascunho[]>(() => pastasDoEditor(campo?.opcoes ?? []));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mudar = (o: Partial<typeof f>) => { setF((x) => ({ ...x, ...o })); setErro(''); };
  // trocar o tipo do campo novo leva as opções já escritas (da lista para as caixinhas e de volta)
  const mudarTipo = (tipo: TipoCampo) => {
    if (tipo === 'caixinhas' && f.tipo !== 'caixinhas') setPastas([{ chave: 'sem', nome: '', caixinhas: f.opcoes.map((o) => ({ chave: o.chave, nome: o.nome, ativa: o.ativa })) }]);
    if (tipo !== 'caixinhas' && f.tipo === 'caixinhas') { mudar({ tipo, opcoes: pastas.flatMap((p) => p.caixinhas).map((c) => ({ chave: c.chave, nome: c.nome, ativa: c.ativa })) }); return; }
    mudar({ tipo });
  };
  const lista_ = temOpcoesEscritas(f.tipo);
  // os módulos são os do produto: o produto não muda depois de criado
  const produtoTravado = !!campo && campo.tipo === 'modulos';
  // o checklist dos módulos (2.3) segue um campo de módulos do mesmo produto, que seja a escolha
  const fontes = (opcoesDoModulo.data?.campos ?? []).filter((c) => c.painelId === painel.id && c.tipo === 'modulos' && !c.escolhidosEm && c.id !== campo?.id && (c.produtoId ?? '') === f.produtoId);
  const seguido = !!campo && (opcoesDoModulo.data?.campos ?? []).some((c) => c.escolhidosEm === campo.id);

  const salvar = async () => {
    const nome = f.nome.trim();
    if (!nome) { setErro('Dê um nome ao campo.'); document.getElementById('campo-nome')?.focus(); return; }
    const doSistema = nomeDoSistemaIgual(nome, painel.ajustes);
    if (doSistema) { setErro(`Todo chamado do painel ${painel.nome} já tem o campo ${doSistema}: escolha outro nome.`); document.getElementById('campo-nome')?.focus(); return; }
    const opcoes = f.opcoes.map((o) => ({ ...o, nome: o.nome.trim() })).filter((o) => o.nome || o.id);
    if (f.tipo === 'caixinhas') {
      const problema = problemaNasPastas(pastas);
      if (problema) { setErro(problema); return; }
    } else if (lista_) {
      if (opcoes.some((o) => !o.nome)) { setErro('Dê um nome a cada opção (ou tire a que ficou vazia).'); return; }
      // a lista que inclui na hora pode começar vazia (as opções nascem nos chamados, 2.0.3)
      if (!opcoes.some((o) => o.ativa) && !(f.tipo === 'lista' && f.incluirNaHora)) {
        setErro('A lista precisa de pelo menos uma opção.');
        document.getElementById('campo-opcao-nova')?.focus(); return;
      }
      const vistas = new Set<string>();
      for (const o of opcoes) {
        if (vistas.has(paraBusca(o.nome))) { setErro(`Duas opções com o nome ${o.nome}.`); return; }
        vistas.add(paraBusca(o.nome));
      }
    }
    if (f.tipo === 'modulos' && !f.produtoId) { setErro('Escolha o produto: os módulos são os dele.'); document.getElementById('campo-produto')?.focus(); return; }
    const d: CampoGravarEntrada = {
      nome, tipo: f.tipo, dica: f.dica.trim() || null, ativo: f.ativo, parte: f.parte.trim() || null, produtoId: f.produtoId || null,
      escolhidosEm: f.tipo === 'modulos' && fontes.some((c) => c.id === f.escolhidosEm) ? f.escolhidosEm : null,
      anexos: f.anexos,
      opcoes: f.tipo === 'caixinhas' ? caixinhasParaGravar(pastas) : lista_ ? opcoes.map((o) => ({ ...(o.id ? { id: o.id } : {}), nome: o.nome, ativa: o.ativa })) : [],
      obrigatorioAoAbrir: f.obrigatorioAoAbrir, etapas: f.etapas, incluirNaHora: f.tipo === 'lista' && f.incluirNaHora,
    };
    setSalvando(true); setErro('');
    try {
      await depois(api.atendimento.salvarCampo(painel.id, campo?.id ?? null, d),
        !campo ? `Campo ${nome} criado no painel ${painel.nome}` : campo.ativo !== f.ativo ? `Campo ${nome} ${f.ativo ? 'reativado' : 'desativado'}` : `Campo ${nome} salvo`);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} largura="max-w-xl" titulo={campo ? `Editar o campo ${campo.nome}` : `Novo campo no painel ${painel.nome}`}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert" id="campo-erro">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="campo-salvar" disabled={salvando} onClick={() => void salvar()}>{salvando ? <Spinner className="text-white" /> : campo ? 'Salvar' : 'Criar campo'}</button>
      </>}>
      <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); void salvar(); }} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Rotulo rotulo="Nome" id="campo-nome">
            <input className="input" id="campo-nome" value={f.nome} maxLength={40} placeholder="Ex.: Sistema" autoFocus={!campo} onChange={(e) => mudar({ nome: e.target.value })} />
          </Rotulo>
          <Rotulo rotulo="Tipo" id="campo-tipo" dica={campo ? 'O tipo não muda depois de criado.' : undefined}>
            <select className="input" id="campo-tipo" value={f.tipo} disabled={!!campo} onChange={(e) => mudarTipo(e.target.value as TipoCampo)}>
              {TIPOS_CAMPO.map((t) => <option key={t} value={t}>{NOME_TIPO_CAMPO[t]}</option>)}
            </select>
          </Rotulo>
        </div>
        <p className="text-[12.5px] text-muted -mt-2.5">{DICA_TIPO_CAMPO[f.tipo]}</p>

        {f.tipo === 'caixinhas' ? (
          <div className="min-w-0">
            <div className="label">As caixinhas</div>
            <EditorDasCaixinhas id="campo-caixinhas" pastas={pastas} onChange={(p) => { setPastas(p); setErro(''); }} />
          </div>
        ) : lista_ && <EditarOpcoes opcoes={f.opcoes} onChange={(opcoes) => mudar({ opcoes })} />}
        {/* a lista que cresce no próprio chamado (2.0.3, a Indicação do Comercial: "eu tenho que conseguir criar por aqui mesmo") */}
        {f.tipo === 'lista' && (
          <label className="flex items-start gap-2.5 text-sm cursor-pointer -mt-1" id="campo-incluir-na-hora">
            <Toggle checked={f.incluirNaHora} onChange={(v) => mudar({ incluirNaHora: v })} />
            <span>Quem trabalha inclui uma opção ali mesmo
              <span className="block text-[12.5px] text-muted">No Abrir chamado e na ficha, o que for escrito e não estiver na lista vira “Incluir”. Bom para listas que crescem, como a Indicação.</span>
            </span>
          </label>
        )}

        {f.tipo === 'modulos' && campo && (
          <div className="text-[12.5px] -mt-1" id="campo-modulos">
            <span className="text-ink-2 font-semibold">Os módulos de hoje: </span>
            <span className="text-ink-2">{campo.opcoes.filter((o) => o.ativa).map((o) => o.nome).join(' · ') || 'nenhum'}</span>
            <span className="block text-muted">Entram e saem em Administração › Produtos: o campo acompanha.</span>
          </div>
        )}

        {/* a implantação (2.3): a parte da ficha e o produto */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Rotulo rotulo="Parte da ficha (opcional)" id="campo-parte" dica="Com ela, o campo vai para o meio da ficha, num cartão com os da mesma parte. Ex.: Curadoria, Configuração, Testes.">
            <input className="input" id="campo-parte" list="campo-partes" value={f.parte} maxLength={40} placeholder={partes[0] ? `Ex.: ${partes[0]}` : 'Ex.: Curadoria'}
              onChange={(e) => mudar({ parte: e.target.value })} />
            <datalist id="campo-partes">{partes.map((p) => <option key={p} value={p} />)}</datalist>
          </Rotulo>
          <Rotulo rotulo={f.tipo === 'modulos' ? 'Produto' : 'Produto (opcional)'} id="campo-produto"
            dica={produtoTravado ? 'O produto dos módulos não muda depois de criado.' : f.tipo === 'modulos' ? 'Os módulos dele viram as caixinhas.' : 'Com ele, o campo só aparece no chamado que tem o produto.'}>
            <select className="input" id="campo-produto" value={f.produtoId} disabled={produtoTravado} onChange={(e) => mudar({ produtoId: e.target.value })}>
              <option value="">{f.tipo === 'modulos' ? 'Escolha o produto…' : 'Todo chamado'}</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              {f.produtoId && !produtos.some((p) => p.id === f.produtoId) && <option value={f.produtoId}>(produto fora do catálogo)</option>}
            </select>
          </Rotulo>
        </div>

        {f.tipo === 'modulos' && f.produtoId && !seguido && (
          <Rotulo rotulo="Os módulos que aparecem" id="campo-escolhidos-em"
            dica="Com um campo escolhido, este vira o checklist: só os módulos marcados lá aparecem aqui e entram na conta da parte. Ex.: a Ativação dos módulos (Configuração) segue o Módulos a ativar (Curadoria).">
            <select className="input" id="campo-escolhidos-em" value={f.escolhidosEm} onChange={(e) => mudar({ escolhidosEm: e.target.value })}>
              <option value="">Todos os do produto (aqui se escolhe)</option>
              {fontes.map((c) => <option key={c.id} value={c.id}>Só os marcados em {c.nome}{c.parte ? ` (${c.parte})` : ''}</option>)}
            </select>
          </Rotulo>
        )}

        <Rotulo rotulo="Explicação (opcional)" id="campo-dica" dica="Aparece embaixo do campo, na ficha e no Abrir chamado.">
          <input className="input" id="campo-dica" value={f.dica} maxLength={200} placeholder="Ex.: o sistema em que o problema aparece" onChange={(e) => mudar({ dica: e.target.value })} />
        </Rotulo>

        {/* 2.3: o Anexar do campo (o Luan: "eu quis dizer todas as opções de curadoria") */}
        <label className="flex items-start gap-2.5 text-sm cursor-pointer" id="campo-anexos">
          <Toggle checked={f.anexos} onChange={(v) => mudar({ anexos: v })} />
          <span>Recebe anexos
            <span className="block text-[12.5px] text-muted">Na ficha, o Anexar do campo{f.tipo === 'caixinhas' || f.tipo === 'modulos' ? ' (nas caixinhas, o clipe de cada uma)' : ''}: imagens, PDF, Word e Excel, de até 10 MB. Desligado, o que já foi anexado continua lá.</span>
          </span>
        </label>

        <fieldset className={`flex flex-col gap-2.5 rounded-lg border border-line p-3 ${f.ativo ? '' : 'opacity-60'}`} disabled={!f.ativo}>
          <legend className="label px-1 mb-0">Quando é obrigatório</legend>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.obrigatorioAoAbrir} onChange={(v) => mudar({ obrigatorioAoAbrir: v })} />
            <span>Para abrir o chamado
              <span className="block text-[12.5px] text-muted">Quem abre pela tela não abre sem ele. O robô e o agendado abrem mesmo assim: o que faltar é pedido para o chamado andar.</span>
            </span>
          </label>
          <div>
            <div className="text-[13px] text-ink mb-1">Para entrar nas etapas</div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 min-[480px]:grid-cols-2" id="campo-etapas">
              {painel.etapas.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-[13px] cursor-pointer py-0.5">
                  <input type="checkbox" className="accent-[var(--accent)]" checked={f.etapas.includes(e.id)}
                    onChange={(ev) => mudar({ etapas: ev.target.checked ? painel.etapas.filter((x) => x.id === e.id || f.etapas.includes(x.id)).map((x) => x.id) : f.etapas.filter((x) => x !== e.id) })} />
                  {e.nome}
                </label>
              ))}
            </div>
            <p className="text-[12.5px] text-muted mt-1">Sem ele, o chamado não entra na etapa: a ficha diz o que falta.</p>
          </div>
        </fieldset>

        {campo && (
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.ativo} onChange={(v) => mudar({ ativo: v })} />
            <span>Ativo <span className="block text-[12.5px] text-muted">Desativado, some da ficha e do Abrir chamado e deixa de ser pedido; o que os chamados já têm fica guardado.</span></span>
          </label>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/**
 * As opções da lista: renomear, mudar a ordem e tirar. A opção que já existia não some: fica
 * desativada (o chamado que a tem continua com ela) e pode voltar; a nova, ainda não salva, só sai.
 */
function EditarOpcoes({ opcoes, onChange }: { opcoes: OpcaoRascunho[]; onChange: (o: OpcaoRascunho[]) => void }) {
  const [nova, setNova] = useState('');
  const mudar = (chave: string, o: Partial<OpcaoRascunho>) => onChange(opcoes.map((x) => (x.chave === chave ? { ...x, ...o } : x)));
  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= opcoes.length) return;
    const n = [...opcoes];
    [n[i], n[j]] = [n[j]!, n[i]!];
    onChange(n);
  };
  const incluir = () => {
    // várias de uma vez: uma por linha (ou separadas por ponto e vírgula)
    const nomes = etiquetasUnicas(nova.split(/[;\n]/).map((x) => x.trim().slice(0, 60)).filter(Boolean))
      .filter((n) => !opcoes.some((o) => paraBusca(o.nome) === paraBusca(n)));
    if (!nomes.length) { setNova(''); return; }
    onChange([...opcoes, ...nomes.map((nome) => ({ chave: `nova-${++sequencia}`, nome, ativa: true }))].slice(0, MAX_OPCOES_DO_CAMPO));
    setNova('');
  };
  return (
    <div className="min-w-0" id="campo-opcoes">
      <div className="label">As opções</div>
      {opcoes.length > 0 && (
        <ol className="flex flex-col gap-1 mb-2">
          {opcoes.map((o, i) => (
            <li key={o.chave} className="flex items-center gap-1">
              <span className="flex shrink-0">
                <BotaoIcone rotulo={`Subir ${o.nome || 'a opção'}`} desativado={i === 0} onClick={() => mover(i, -1)}><ArrowUp size={14} /></BotaoIcone>
                <BotaoIcone rotulo={`Descer ${o.nome || 'a opção'}`} desativado={i === opcoes.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={14} /></BotaoIcone>
              </span>
              <input className={`input py-1.5 text-[13.5px] min-w-0 flex-1 ${o.ativa ? '' : 'line-through text-muted'}`} value={o.nome} maxLength={60} disabled={!o.ativa}
                aria-label={`Opção ${i + 1}`} onChange={(e) => mudar(o.chave, { nome: e.target.value })} />
              {o.ativa ? (
                <BotaoIcone rotulo={o.id ? `Desativar a opção ${o.nome}` : `Tirar a opção ${o.nome || 'nova'}`} perigo
                  onClick={() => (o.id ? mudar(o.chave, { ativa: false }) : onChange(opcoes.filter((x) => x.chave !== o.chave)))}><X size={14} /></BotaoIcone>
              ) : (
                <button type="button" className="btn-ghost btn-sm shrink-0 text-[12.5px]" onClick={() => mudar(o.chave, { ativa: true })} title="Os chamados que já têm esta opção continuam com ela">
                  <Undo2 size={13} /> Reativar
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-1.5">
        <input className="input py-1.5 text-[13.5px] min-w-0" id="campo-opcao-nova" value={nova} maxLength={600} placeholder={opcoes.length ? 'Outra opção' : 'Ex.: LinePBX'}
          onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); incluir(); } }}
          onPaste={(e) => {
            // colar uma lista (uma por linha) inclui todas de uma vez
            const t = e.clipboardData.getData('text');
            if (t.includes('\n')) { e.preventDefault(); setNova(t); window.setTimeout(() => document.getElementById('campo-opcao-incluir')?.click(), 0); }
          }} />
        <button type="button" className="btn-secondary btn-sm shrink-0" id="campo-opcao-incluir" onClick={incluir} disabled={!nova.trim() || opcoes.length >= MAX_OPCOES_DO_CAMPO}>
          <Plus size={14} /> Incluir
        </button>
      </div>
      <p className="text-[12.5px] text-muted mt-1">Enter inclui (colar uma lista, uma por linha, inclui todas). A opção que já foi usada não some: fica desativada.</p>
    </div>
  );
}

// =====================================================================
//  AS PEÇAS
// =====================================================================

function BotaoIcone({ rotulo, onClick, desativado, perigo, children }: { rotulo: string; onClick: () => void; desativado?: boolean; perigo?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={desativado} aria-label={rotulo} title={rotulo}
      className={`p-1.5 rounded-md text-ink-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent ${perigo ? 'hover:text-bad' : 'hover:text-ink'}`}>
      {children}
    </button>
  );
}

function Rotulo({ rotulo, id, dica, children }: { rotulo: string; id: string; dica?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>{rotulo}</label>
      {children}
      {dica && <div className="text-muted text-[12.5px] mt-1">{dica}</div>}
    </div>
  );
}

/** Uma lista de textos curtos (as opções do Tipo): digita e Enter (ou vírgula); o × tira. */
export function ListaDeTextos({ id, valor, onChange, max, maxLetras, placeholder }: { id: string; valor: string[]; onChange: (v: string[]) => void; max: number; maxLetras: number; placeholder: string }) {
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
