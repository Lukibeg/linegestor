/**
 * A barra de ações da ficha: Assumir, Mover (o menu das etapas do painel, cada uma dizendo o que falta
 * para ir para ela e os filhos que travam), o atalho "Escalonar para N2", Esperar (o cliente ou a
 * operadora) ou Parar de esperar, Avisar o cliente pelo WhatsApp, Preencher com IA e o menu Mais (ligar, filho, pai, problema, trocar de painel, reabrir, observar, lixeira).
 *
 * Mover usa o `useMover()` comum: ele pede o motivo ao subir ou descer de nível e mostra o que falta
 * quando o servidor recusa. O erro das ações diretas (assumir, parar de esperar…) aparece logo
 * embaixo da barra, com o nome da ação.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft, ArrowUpRight, Columns3, Copy, Eye, EyeOff, GitBranch, Hourglass, Layers, Link2, MessageCircle, MoreHorizontal, RotateCcw, Sparkles, ThumbsDown, Trash2, Trophy, Unlink, UserCheck,
} from 'lucide-react';
import { etapaAoAssumir, movimentoDeNivel, nomeDoObrigatorio, type SugestaoIa, type TipoEspera } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Confirmar, Spinner, mensagemErro, useToast } from '../../../components/ui/index.js';
import { paraALista } from '../../../lib/voltar.js';
import { chaveDaFicha, fundoDaJanela } from '../comum.js';
import { ErroPerto, ItemMenu, MenuSuspenso, SeparadorMenu, linkDaFicha, lista, nomeComNivel, useAberta, useAcao } from './base.js';
import { JanelaIa, pedirSugestao } from './Ia.js';
import { JanelaAbrirLigado, JanelaAvisar, JanelaEscolherChamado, JanelaEsperar, JanelaLigar, JanelaReabrir, JanelaTrocarPainel } from './Janelas.js';

type Janela =
  | { tipo: 'esperar'; espera: TipoEspera }
  | { tipo: 'avisar' }
  | { tipo: 'ia'; s: SugestaoIa }
  | { tipo: 'ligar' }
  | { tipo: 'pai' }
  | { tipo: 'problema' }
  | { tipo: 'painel' }
  | { tipo: 'reabrir' }
  | { tipo: 'lixeira' }
  // o filho e o problema a partir deste: o Abrir chamado numa janela (o pedido do Luan na prévia)
  | { tipo: 'filho' }
  | { tipo: 'novoProblema' };

export function BarraDeAcoes() {
  const { f, opcoes, painel, etapa, cuida, eu, mover } = useAberta();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const acao = useAcao();
  const [qual, setQual] = useState('');
  const [janela, setJanela] = useState<Janela | null>(null);
  const [lendo, setLendo] = useState(false);
  const [apagando, setApagando] = useState(false);
  const fechar = () => setJanela(null);

  const aberto = f.situacao === 'aberto';
  const meu = !!eu && f.responsavel?.id === eu.id;
  const etapas = painel?.etapas ?? [];
  // a negociação (o painel de Vendas): Ganhou e Perdeu à mão; sem escalonar, operadora, aviso ao cliente e IA
  const vendas = painel?.tipo === 'vendas';
  const ganho = vendas ? etapas.find((e) => e.resultado === 'ganho') : undefined;
  const perdido = vendas ? etapas.find((e) => e.resultado === 'perdido') : undefined;
  // o atalho: o próximo nível acima (N1 → N2), quando o chamado está numa etapa com nível
  const acima = aberto && etapa?.nivel ? etapas.filter((e) => e.nivel && e.nivel > etapa.nivel!).sort((a, b) => a.nivel! - b.nivel!)[0] : undefined;
  const podeAvisar = !vendas && opcoes.whatsapp.cliente && !!f.contato?.telefone;

  /** Uma ação direta: o erro fica embaixo da barra, com o nome dela. */
  const direta = async <T,>(nome: string, fazer: () => Promise<T>, ok?: string) => {
    setQual(nome);
    return acao.rodar(fazer, ok);
  };

  const assumir = async () => {
    const r = await direta('Assumir', () => api.atendimento.assumir(f.id), `${f.codigo} agora é seu`);
    // na entrada, o Assumir leva para a primeira etapa de andamento — se não faltar nada para ela
    if (r.ok && etapa?.tipo === 'entrada' && r.r.etapaId === f.etapaId) {
      const alvo = etapaAoAssumir(etapas, f.etapaId);
      const faltam = alvo ? r.r.faltam[alvo.id] ?? [] : [];
      if (alvo && faltam.length) toast.push('info', `Ficou com você, mas continua em ${etapa.nome}: para ir para ${alvo.nome}, falta ${lista(faltam.map((x) => nomeDoObrigatorio(x, opcoes.campos)))}.`);
    }
  };

  const pedirIa = async () => {
    setQual('Preencher com IA');
    acao.limpar();
    setLendo(true);
    const r = await pedirSugestao(f.id);
    setLendo(false);
    if (r.ok) setJanela({ tipo: 'ia', s: r.s });
    else acao.setErro(r.erro);
  };

  const copiarLink = async () => {
    try { await navigator.clipboard.writeText(linkDaFicha(f.codigo)); toast.push('ok', `Link do ${f.codigo} copiado`); } catch { toast.push('erro', `Não deu para copiar: o código é ${f.codigo}`); }
  };

  const mandarParaLixeira = async () => {
    setApagando(true);
    try {
      await api.atendimento.remover(f.id);
      // na janela por cima da tela, volta para a tela; na página inteira, para a lista
      const fundo = fundoDaJanela(location);
      if (fundo) navigate(`${fundo.pathname}${fundo.search}${fundo.hash}`, { replace: true, state: fundo.state });
      else navigate(paraALista('/atendimento/lista'));
      // sai da ficha antes de esquecê-la (senão ela pede de novo o chamado que acabou de sair)
      window.setTimeout(() => {
        qc.removeQueries({ queryKey: chaveDaFicha(f.codigo) });
        qc.removeQueries({ queryKey: chaveDaFicha(f.id) });
        for (const k of ['quadro', 'lista', 'meu-dia', 'opcoes']) void qc.invalidateQueries({ queryKey: ['atendimento', k] });
      }, 0);
      toast.push('ok', `${f.codigo} foi para a lixeira`);
    } catch (e) {
      setJanela(null);
      setQual('Mandar para a lixeira');
      acao.setErro(mensagemErro(e));
    } finally {
      setApagando(false);
    }
  };

  const ocupadoMover = mover.ocupado === f.id;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={vendas ? 'Ações da negociação' : 'Ações do chamado'}>
        {!meu && f.situacao !== 'fechado' && (
          <button type="button" className="btn-primary btn-sm" disabled={acao.ocupado} onClick={() => void assumir()} title={vendas ? 'Ficar com a negociação' : 'Ficar com o chamado (na entrada, ele vai para o andamento)'}>
            {acao.ocupado && qual === 'Assumir' ? <Spinner className="text-white" /> : <UserCheck size={15} />} Assumir
          </button>
        )}

        <MenuSuspenso classe="btn-secondary btn-sm" largura="w-[320px]" titulo="Mover para outra etapa (ou escalonar)"
          rotulo={<>{ocupadoMover ? <Spinner /> : <ArrowRightLeft size={15} />} Mover</>}>
          {(fecharMenu) => (
            <>
              <div className="px-2.5 pt-1 pb-1.5 eyebrow">Etapas do {painel?.nome ?? 'painel'}</div>
              {etapas.map((e) => {
                const atual = e.id === f.etapaId;
                const faltam = f.faltam[e.id] ?? [];
                const filhos = f.filhosTravam[e.id] ?? [];
                const sentido = atual ? null : movimentoDeNivel(etapa, e);
                return (
                  <ItemMenu key={e.id} desativado={atual} marcado={atual}
                    onClick={() => { fecharMenu(); void mover.mover(f, e.id); }}
                    dica={atual ? 'o chamado está aqui' : (faltam.length || filhos.length) ? (
                      <span className="text-signal">
                        {faltam.length > 0 && <>Falta: {lista(faltam.map((x) => nomeDoObrigatorio(x, opcoes.campos)))}.</>}
                        {faltam.length > 0 && filhos.length > 0 && ' '}
                        {filhos.length > 0 && <>Filhos em aberto: {filhos.join(', ')}.</>}
                      </span>
                    ) : sentido === 'sobe' ? 'escalonar: pede o motivo' : sentido === 'desce' ? 'voltar de nível: pede o motivo' : undefined}>
                    <span className="flex items-center gap-2">
                      <span className={atual ? 'font-semibold' : ''}>{nomeComNivel(e)}</span>
                      {sentido === 'sobe' && <ArrowUpRight size={13} className="text-muted" aria-label="sobe de nível" />}
                    </span>
                  </ItemMenu>
                );
              })}
            </>
          )}
        </MenuSuspenso>

        {/* a negociação aberta: o resultado à mão (a janela pede o valor e o dia, ou o motivo da perda) */}
        {vendas && aberto && ganho && (
          <button type="button" className="btn-secondary btn-sm text-ok" disabled={ocupadoMover} onClick={() => void mover.mover(f, ganho.id)} id="acao-ganhou" title="Marcar como ganho: o valor e o dia em que fechou">
            <Trophy size={15} /> Ganhou
          </button>
        )}
        {vendas && aberto && perdido && (
          <button type="button" className="btn-secondary btn-sm text-bad" disabled={ocupadoMover} onClick={() => void mover.mover(f, perdido.id)} id="acao-perdeu" title="Marcar como perdido: o motivo e o dia">
            <ThumbsDown size={15} /> Perdeu
          </button>
        )}

        {acima && (
          <button type="button" className="btn-secondary btn-sm" disabled={ocupadoMover} onClick={() => void mover.mover(f, acima.id)} title={`Passar para o ${acima.nome} (pede o motivo)`}>
            <ArrowUpRight size={15} /> Escalonar para {acima.nome}
          </button>
        )}

        {aberto && (f.espera ? (
          <button type="button" className="btn-secondary btn-sm" disabled={acao.ocupado}
            onClick={() => void direta('Parar de esperar', () => api.atendimento.esperar(f.id, { tipo: null }), 'A marca de espera saiu')}
            title={f.espera.tipo === 'cliente' ? 'Tirar a marca: o prazo volta a correr' : 'Tirar a marca de espera'}>
            {acao.ocupado && qual === 'Parar de esperar' ? <Spinner /> : <Hourglass size={15} />} Parar de esperar
          </button>
        ) : (
          vendas ? (
            // na venda, só o cliente (a resposta à proposta, a reunião com o sócio…)
            <button type="button" className="btn-secondary btn-sm" onClick={() => setJanela({ tipo: 'esperar', espera: 'cliente' })} title="Marcar que a negociação espera o cliente (a resposta à proposta, por exemplo)">
              <Hourglass size={15} /> Esperar o cliente
            </button>
          ) : (
            <MenuSuspenso classe="btn-secondary btn-sm" largura="w-[290px]" titulo="Marcar que o chamado está esperando alguém" rotulo={<><Hourglass size={15} /> Esperar</>}>
              {(fecharMenu) => (
                <>
                  <ItemMenu dica="O prazo para de correr enquanto espera." onClick={() => { fecharMenu(); setJanela({ tipo: 'esperar', espera: 'cliente' }); }}>Esperar o cliente…</ItemMenu>
                  <ItemMenu dica="O prazo continua correndo." onClick={() => { fecharMenu(); setJanela({ tipo: 'esperar', espera: 'operadora' }); }}>Esperar a operadora…</ItemMenu>
                </>
              )}
            </MenuSuspenso>
          )
        ))}

        {podeAvisar && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setJanela({ tipo: 'avisar' })} title="Mandar uma mensagem ao contato pelo WhatsApp oficial">
            <MessageCircle size={15} /> Avisar o cliente
          </button>
        )}

        {opcoes.ia.ativa && !vendas && (
          <button type="button" className="btn-secondary btn-sm" disabled={lendo} onClick={() => void pedirIa()}
            title={f.sessaoId ? 'A IA lê a conversa no LineChat e sugere o preenchimento (nada é gravado sem você aplicar)' : 'A IA lê o chamado e sugere o preenchimento (nada é gravado sem você aplicar)'}>
            {lendo ? <><Spinner /> A IA está lendo…</> : <><Sparkles size={15} /> Preencher com IA</>}
          </button>
        )}

        {!aberto && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setJanela({ tipo: 'reabrir' })}><RotateCcw size={15} /> Reabrir</button>
        )}

        <MenuSuspenso classe="btn-ghost btn-sm" largura="w-[300px]" alinhar="direita" titulo="Mais ações" rotuloAcessivel="Mais ações" rotulo={<><MoreHorizontal size={16} /> Mais</>}>
          {(fecharMenu) => {
            const ir = (fazer: () => void) => () => { fecharMenu(); fazer(); };
            return (
              <>
                <ItemMenu icone={<Link2 size={15} />} onClick={ir(() => setJanela({ tipo: 'ligar' }))} dica="relacionado, duplicado de, repete">{vendas ? 'Ligar a outro chamado ou negociação…' : 'Ligar a outro chamado…'}</ItemMenu>
                <ItemMenu icone={<GitBranch size={15} />} onClick={ir(() => setJanela({ tipo: 'filho' }))} dica={vendas ? 'a implantação no Suporte, por exemplo' : 'pode ser em outro painel (o Desenvolvimento)'}>Criar um filho…</ItemMenu>
                <ItemMenu icone={<GitBranch size={15} className="rotate-180" />} onClick={ir(() => setJanela({ tipo: 'pai' }))}>{f.pai ? `Trocar o pai (${f.pai.codigo})…` : 'Definir o pai…'}</ItemMenu>
                {f.pai && <ItemMenu icone={<Unlink size={15} />} onClick={ir(() => void direta('Tirar o pai', () => api.atendimento.definirPai(f.id, null), `${f.codigo} não é mais filho de ${f.pai!.codigo}`))}>Tirar o pai ({f.pai.codigo})</ItemMenu>}
                {f.tipoChamado === 'chamado' && !vendas && (
                  <>
                    <SeparadorMenu />
                    <ItemMenu icone={<Layers size={15} />} onClick={ir(() => setJanela({ tipo: 'problema' }))} dica="o problema junta os incidentes iguais de várias empresas">
                      {f.problema ? `Trocar o problema (${f.problema.codigo})…` : 'Ligar a um problema…'}
                    </ItemMenu>
                    {f.problema && <ItemMenu icone={<Unlink size={15} />} onClick={ir(() => void direta('Tirar do problema', () => api.atendimento.definirProblema(f.id, null), `${f.codigo} saiu do problema ${f.problema!.codigo}`))}>Tirar do problema ({f.problema.codigo})</ItemMenu>}
                    <ItemMenu icone={<Layers size={15} />} onClick={ir(() => setJanela({ tipo: 'novoProblema' }))} dica="este chamado vira o primeiro incidente dele">Abrir um problema a partir deste…</ItemMenu>
                  </>
                )}
                <SeparadorMenu />
                <ItemMenu icone={<Columns3 size={15} />} onClick={ir(() => setJanela({ tipo: 'painel' }))} dica="o código não muda">Trocar de painel…</ItemMenu>
                {!aberto && <ItemMenu icone={<RotateCcw size={15} />} onClick={ir(() => setJanela({ tipo: 'reabrir' }))}>Reabrir…</ItemMenu>}
                <ItemMenu icone={f.observando ? <EyeOff size={15} /> : <Eye size={15} />}
                  onClick={ir(() => void direta(f.observando ? 'Deixar de observar' : 'Observar', () => api.atendimento.observar(f.id, !f.observando), f.observando ? 'Você deixou de observar' : 'Você passou a observar: recebe os avisos dele e o vê no seu Meu dia'))}
                  dica={f.observando ? undefined : 'aparece no seu Meu dia'}>
                  {f.observando ? 'Deixar de observar' : 'Observar'}
                </ItemMenu>
                <ItemMenu icone={<Copy size={15} />} onClick={ir(() => void copiarLink())} dica="para colar na conversa ou no WhatsApp">Copiar o link</ItemMenu>
                {cuida && (
                  <>
                    <SeparadorMenu />
                    <ItemMenu icone={<Trash2 size={15} />} perigoso onClick={ir(() => setJanela({ tipo: 'lixeira' }))}>Mandar para a lixeira…</ItemMenu>
                  </>
                )}
              </>
            );
          }}
        </MenuSuspenso>
      </div>
      <ErroPerto erro={acao.erro ? `${qual}: ${acao.erro}` : null} />

      {janela?.tipo === 'esperar' && <JanelaEsperar tipo={janela.espera} onFechar={fechar} />}
      {janela?.tipo === 'avisar' && <JanelaAvisar onFechar={fechar} />}
      {janela?.tipo === 'ia' && <JanelaIa s={janela.s} onFechar={fechar} />}
      {janela?.tipo === 'ligar' && <JanelaLigar onFechar={fechar} />}
      {janela?.tipo === 'pai' && (
        <JanelaEscolherChamado titulo={f.pai ? `Trocar o pai de ${f.codigo}` : `O pai de ${f.codigo}`} botao="Definir o pai" excluir={f.pai ? [f.pai.codigo] : []}
          texto={<>O pai pode ser de outro painel. {painel?.ajustes.paiEsperaFilhos ? 'Ele só resolve e fecha depois que os filhos fecharem.' : ''}</>}
          fazer={(c) => api.atendimento.definirPai(f.id, c)} ok={(c) => `${f.codigo} agora é filho de ${c}`} onFechar={fechar} />
      )}
      {janela?.tipo === 'problema' && (
        <JanelaEscolherChamado titulo={`Ligar ${f.codigo} a um problema`} botao="Ligar ao problema" tipoChamado="problema" excluir={f.problema ? [f.problema.codigo] : []}
          texto="O problema junta os incidentes iguais (de uma ou de várias empresas). A lista mostra só os problemas."
          fazer={(c) => api.atendimento.definirProblema(f.id, c)} ok={(c) => `${f.codigo} agora é incidente do problema ${c}`} onFechar={fechar} />
      )}
      {janela?.tipo === 'painel' && <JanelaTrocarPainel onFechar={fechar} />}
      {janela?.tipo === 'filho' && <JanelaAbrirLigado tipo="filho" onFechar={fechar} />}
      {janela?.tipo === 'novoProblema' && <JanelaAbrirLigado tipo="problema" onFechar={fechar} />}
      {janela?.tipo === 'reabrir' && <JanelaReabrir onFechar={fechar} />}
      {janela?.tipo === 'lixeira' && <Confirmar open onClose={fechar} onConfirm={() => void mandarParaLixeira()} loading={apagando} perigoso
        titulo={`Mandar ${f.codigo} para a lixeira`} botao="Mandar para a lixeira"
        texto={vendas
          ? <>A negociação <b>{f.titulo}</b> sai do quadro, da lista e do relatório de vendas para todo mundo. O número {f.codigo} não volta a ser usado. Dá para restaurar em Administração › Lixeira.</>
          : <>O chamado <b>{f.titulo}</b> sai do quadro e da lista para todo mundo. O número {f.codigo} não volta a ser usado. Dá para restaurar em Administração › Lixeira.</>} />}
    </div>
  );
}
