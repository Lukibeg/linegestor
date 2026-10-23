/**
 * Relatórios › Volume (2.1): **Entrada × saída**, **Idade da fila**, **Mapa de calor da semana**, **Dias
 * fora da curva** e **Previsão da semana** — quanto chega, quanto sai e quando.
 */
import { DIAS_DA_SEMANA } from '@gestor/shared';
import { Vazio } from '../../../components/ui/index.js';
import { LinkDoChamado } from '../comum.js';
import { Cartao, Colunas, NumeroClicavel, Numero, Numeros, corDaCelula, diaCurto, nf, plural, type PropsDoRelatorio } from './pecas.js';

const DIAS_POR_EXTENSO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

// ---------- Entrada × saída ----------

export function Fila({ r, abrir }: PropsDoRelatorio) {
  const x = r.fila;
  const saldo = x.saldoRecente;
  const max = Math.max(1, ...x.pontos.flatMap((p) => [p.entrou, p.saiu]));
  const altura = 140;
  const passo = x.pontos.length <= 16 ? 1 : Math.ceil(x.pontos.length / 12);
  const nome = x.por === 'mes' ? 'mês' : 'semana';
  return (
    <Cartao id="fila" rodape={<>Por {x.por === 'mes' ? 'mês (em períodos de mais de 4 meses)' : 'semana (de segunda a domingo)'}: quantos chegaram, quantos foram resolvidos e a fila no fim de cada {nome} — os que já tinham chegado e ainda não tinham sido resolvidos (pelo que se sabe hoje). O * marca {x.por === 'mes' ? 'o mês' : 'a semana'} pela metade.</>}>
      <Numeros>
        <Numero valor={nf(x.entrou)} rotulo="chegaram no período" />
        <Numero valor={nf(x.saiu)} rotulo="resolvidos no período" />
        <Numero valor={nf(x.filaHoje.n)} rotulo="na fila hoje" abrir={abrir} ids={x.filaHoje.ids} janela="Na fila hoje" />
        <Numero valor={`${saldo.n > 0 ? '+' : ''}${nf(saldo.n)}`} tom={saldo.n > 0 ? 'signal' : saldo.n < 0 ? 'ok' : undefined}
          rotulo={`saldo ${saldo.pontos > 1 ? `das últimas ${saldo.pontos} ${x.por === 'mes' ? 'meses' : 'semanas'}` : `do último ${nome}`}`}
          sub={<span className="text-muted">{saldo.n > 0 ? 'a fila está crescendo' : saldo.n < 0 ? 'a fila está diminuindo' : 'a fila está parada'}</span>} />
      </Numeros>
      {!x.pontos.length || (!x.entrou && !x.saiu) ? <Vazio titulo="Nada no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <div>
          <div className="eyebrow mb-2">Por {nome} · clique numa coluna para ver os chamados</div>
          <div className="flex items-end gap-1.5" style={{ height: altura }}>
            {x.pontos.map((p) => (
              <div key={p.id} className="flex-1 min-w-0 h-full flex items-end justify-center gap-[2px]" title={`${p.rotulo}${p.parcial ? ' (pela metade)' : ''}: chegaram ${p.entrou}, resolvidos ${p.saiu}, fila no fim ${p.fila}`}>
                {[{ n: p.entrou, ids: p.idsEntrou, cor: 'bg-accent', txt: 'Chegaram' }, { n: p.saiu, ids: p.idsSaiu, cor: 'bg-ok', txt: 'Resolvidos' }].map((b) => (
                  <button key={b.txt} type="button" disabled={!b.n} onClick={() => abrir({ titulo: `${b.txt} — ${x.por === 'mes' ? p.rotulo : `semana de ${p.rotulo}`}`, ids: b.ids })}
                    className="flex-1 max-w-[22px] h-full flex flex-col justify-end items-center group enabled:cursor-pointer" aria-label={`${b.txt} em ${p.rotulo}: ${b.n}`}>
                    {b.n > 0 && x.pontos.length <= 16 && <span className="text-[10px] tnum leading-none mb-0.5 text-ink-2">{b.n}</span>}
                    <span className={`block w-full rounded-t ${b.cor} group-enabled:group-hover:brightness-110`} style={{ height: b.n ? Math.max(3, (b.n / max) * (altura - 16)) : 0 }} />
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 border-t border-line mt-0.5 pt-1">
            {x.pontos.map((p, i) => (
              <span key={p.id} className="flex-1 min-w-0 text-center text-[10.5px] leading-tight text-muted whitespace-nowrap overflow-visible">
                {i % passo === 0 || i === x.pontos.length - 1 ? `${p.rotulo}${p.parcial ? '*' : ''}` : ''}
                <span className="block tnum text-ink-2" title="a fila no fim">{i % passo === 0 || i === x.pontos.length - 1 ? p.fila : ''}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-ink-2">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> chegaram</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok" /> resolvidos</span>
            <span className="text-muted">embaixo: a fila no fim de cada {nome}</span>
          </div>
        </div>
      )}
    </Cartao>
  );
}

// ---------- Idade da fila ----------

export function Idade({ r, abrir }: PropsDoRelatorio) {
  const x = r.idade;
  return (
    <Cartao id="idade" rodape={<>Os chamados em aberto agora, de qualquer data (o período não vale aqui), pela idade em dias corridos. A partir de 7 dias, em laranja.</>}>
      <Numeros>
        <Numero valor={nf(x.abertos)} rotulo="em aberto agora" />
        <Numero valor={x.medianaDias === null ? '—' : `${nf(x.medianaDias)} ${x.medianaDias === 1 ? 'dia' : 'dias'}`} rotulo="idade mediana" />
        {x.maisAntigo && (
          <div className="min-w-[120px] max-w-[300px]">
            <span className="block font-display text-[22px] sm:text-2xl font-semibold tnum leading-tight text-signal">{plural(x.maisAntigo.dias, 'dia', 'dias')}</span>
            <span className="block text-[12.5px] text-muted leading-snug">o mais antigo: <LinkDoChamado codigo={x.maisAntigo.codigo} className="link font-mono">{x.maisAntigo.codigo}</LinkDoChamado> <span className="line-clamp-1">{x.maisAntigo.titulo}</span></span>
          </div>
        )}
      </Numeros>
      {!x.abertos ? <Vazio titulo="Nenhum chamado em aberto" texto="A fila está vazia." /> : (
        <>
          <div>
            <div className="eyebrow mb-2">Há quanto tempo estão abertos · clique numa faixa para ver os chamados</div>
            <Colunas altura={120} abrir={abrir} pontos={x.faixas.map((f, i) => ({ id: f.id, rotulo: f.rotulo, n: f.n, ids: f.ids, janela: `Abertos há ${f.rotulo}`, cor: i >= 3 ? 'var(--signal)' : undefined }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Etapa</th><th className="!text-right">Em aberto</th><th className="!text-right">Há mais de 7 dias</th></tr></thead>
              <tbody>
                {x.porEtapa.map((e) => (
                  <tr key={e.id}>
                    <td className="text-[13px]">{e.nome}</td>
                    <td className="text-right text-[13px]"><NumeroClicavel ids={e.ids} titulo={`Em aberto em ${e.nome}`} abrir={abrir} /></td>
                    <td className={`text-right tnum text-[13px] ${e.velhos ? 'text-signal font-semibold' : 'text-muted'}`}>{nf(e.velhos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Cartao>
  );
}

// ---------- Mapa de calor da semana ----------

export function Calor({ r, abrir }: PropsDoRelatorio) {
  const x = r.calor;
  if (!x.n) return <Cartao id="calor"><Vazio titulo="Nada chegou no período" texto="Escolha um período maior ou tire algum filtro." /></Cartao>;
  // as horas mostradas: as do horário de atendimento e as que tiveram chamado
  const abertas = x.horario.filter((h) => h.abre);
  let de = Math.min(8, ...abertas.map((h) => Math.floor(h.de)));
  let ate = Math.max(18, ...abertas.map((h) => Math.ceil(h.ate)));
  x.porHora.forEach((n, h) => { if (n) { de = Math.min(de, h); ate = Math.max(ate, h + 1); } });
  const horas = Array.from({ length: ate - de }, (_, i) => de + i);
  const max = Math.max(1, ...x.celulas.flat());
  const pico = x.pico;
  const cheio = x.porDia.indexOf(Math.max(...x.porDia));
  const dentro = (dia: number, hora: number) => { const h = x.horario[dia]!; return h.abre && hora >= h.de && hora + 1 <= h.ate + 1e-9; };
  return (
    <Cartao id="calor" rodape={<>Os chamados que chegaram no período, pelo dia da semana e a hora (de Brasília), somando todas as semanas. A célula tracejada é fora do horário de atendimento (Painéis › Ajustes › Prazos). Clique numa célula para ver os chamados.</>}>
      <Numeros>
        {pico && <Numero valor={`${DIAS_POR_EXTENSO[pico.dia]}, ${pico.hora}h`} rotulo={`o pico: ${plural(pico.n, 'chamado', 'chamados')}${x.ocorrencias[pico.dia] ? ` (${nf(pico.n / x.ocorrencias[pico.dia]!)} por semana)` : ''}`} />}
        <Numero valor={DIAS_POR_EXTENSO[cheio]!} rotulo={`o dia mais cheio: ${plural(x.porDia[cheio]!, 'chamado', 'chamados')}`} />
        <Numero valor={nf(x.foraDoHorario)} rotulo="chegaram fora do horário de atendimento" sub={<span className="text-muted">{Math.round((x.foraDoHorario / x.n) * 100)}% do total</span>} />
      </Numeros>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="border-separate border-spacing-[3px] text-[11px] min-w-[560px] w-full" aria-label="Chamados por dia da semana e hora">
          <thead>
            <tr>
              <th className="w-[38px]" />
              {horas.map((h) => <th key={h} scope="col" className="font-normal text-muted tnum">{h}h</th>)}
              <th scope="col" className="font-normal text-muted text-right pl-1">total</th>
            </tr>
          </thead>
          <tbody>
            {DIAS_DA_SEMANA.map((nome, dia) => (
              <tr key={nome}>
                <th scope="row" className="font-semibold text-ink-2 text-left text-[12px]">{nome}</th>
                {horas.map((h) => {
                  const n = x.celulas[dia]![h]!;
                  const ids = x.ids[`${dia}-${h}`] ?? [];
                  const fora = !dentro(dia, h);
                  return (
                    <td key={h} className="p-0">
                      <button type="button" disabled={!n} onClick={() => abrir({ titulo: `Chegaram ${DIAS_POR_EXTENSO[dia]}, das ${h}h às ${h + 1}h`, ids })}
                        title={`${DIAS_POR_EXTENSO[dia]}, ${h}h: ${plural(n, 'chamado', 'chamados')}${fora ? ' (fora do horário)' : ''}`}
                        className={`w-full h-7 rounded tnum text-ink enabled:hover:ring-2 enabled:hover:ring-accent ${fora ? 'border border-dashed border-line-strong' : ''}`}
                        style={{ background: n ? corDaCelula(n / max) : fora ? 'transparent' : 'var(--surface-2)' }}>
                        {n || ''}
                      </button>
                    </td>
                  );
                })}
                <td className="text-right tnum text-ink-2 pl-1 font-semibold">{x.porDia[dia]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

// ---------- Dias fora da curva ----------

export function Curva({ r, abrir }: PropsDoRelatorio) {
  const x = r.curva;
  return (
    <Cartao id="curva" rodape={<>O normal de um dia é a mediana do mesmo dia da semana nas 8 semanas de antes (só com 2 semanas de história ou mais). Fora da curva é chegar pelo menos 5 chamados, o dobro do normal e 5 a mais que ele. O gráfico aparece nos períodos de até 3 meses.</>}>
      {x.pontos.length > 0 && (
        <div>
          <div className="eyebrow mb-2">Os chamados de cada dia · fora da curva em laranja</div>
          <Colunas altura={110} abrir={abrir} pontos={x.pontos.map((p) => {
            const doPico = x.picos.find((k) => k.dia === p.id);
            return { id: p.id, rotulo: p.rotulo, n: p.n, ids: doPico?.ids, cor: p.pico ? 'var(--signal)' : undefined, forte: p.pico, janela: `Chegaram em ${p.rotulo}`, titulo: `${p.rotulo}: ${p.n} (normal ${p.normal})` };
          })} />
        </div>
      )}
      {!x.picos.length ? <p className="text-[13px] text-muted">Nenhum dia fora da curva no período.</p> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Dia</th><th className="!text-right">Chegaram</th><th className="!text-right">Normal</th><th>O assunto que dominou</th><th>O cliente que mais abriu</th></tr></thead>
            <tbody>
              {x.picos.map((p) => (
                <tr key={p.dia}>
                  <td className="text-[13px] whitespace-nowrap">{diaCurto(p.dia)} <span className="text-muted">({DIAS_DA_SEMANA[(new Date(`${p.dia}T12:00:00Z`).getUTCDay() + 6) % 7]!.toLowerCase()})</span></td>
                  <td className="text-right text-[13px]"><NumeroClicavel ids={p.ids} titulo={`Chegaram em ${diaCurto(p.dia)}`} abrir={abrir} tom="text-signal font-semibold" /></td>
                  <td className="text-right tnum text-[13px] text-muted">{p.normal}</td>
                  <td className="text-[13px]">{p.assunto ? <>{p.assunto.rotulo} <span className="text-muted tnum">({p.assunto.n})</span></> : <span className="text-muted">—</span>}</td>
                  <td className="text-[13px]">{p.cliente ? <>{p.cliente.rotulo} <span className="text-muted tnum">({p.cliente.n})</span></> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

// ---------- Previsão da semana ----------

export function Previsao({ r }: PropsDoRelatorio) {
  const x = r.previsao;
  if (!x.semanas) return <Cartao id="previsao"><Vazio titulo="Ainda sem semanas completas" texto="A previsão usa as semanas completas de antes: ela aparece depois da primeira semana inteira do painel." /></Cartao>;
  const acima = x.semanaAtual.ateHoje - x.semanaAtual.esperadoAteHoje;
  return (
    <Cartao id="previsao" rodape={<>Cada dia da próxima semana é a média do mesmo dia nas {plural(x.semanas, 'semana completa', 'semanas completas')} de antes{x.semanas < 8 ? ' (a conta usa até 8; com o tempo, ela melhora)' : ''}, com o menor e o maior que já aconteceu. Não usa o período escolhido: é sempre a próxima semana.</>}>
      <Numeros>
        <Numero valor={`${nf(x.total)}`} rotulo={`chamados previstos de ${diaCurto(x.semana.de)} a ${diaCurto(x.semana.ate)}`} sub={<span className="text-muted">uma semana normal tem de {x.faixa.min} a {x.faixa.max}</span>} />
        <Numero valor={nf(x.semanaAtual.ateHoje)} rotulo="nesta semana, até hoje" tom={acima > 3 ? 'signal' : undefined}
          sub={<span className="text-muted">o esperado até hoje era {x.semanaAtual.esperadoAteHoje}</span>} />
      </Numeros>
      <div>
        <div className="eyebrow mb-2">A próxima semana, dia a dia (a média; passe o mouse para ver o menor e o maior)</div>
        <Colunas altura={110} pontos={x.dias.map((d) => ({ id: d.dia, rotulo: d.rotulo, n: d.media, titulo: `${d.rotulo}: ${nf(d.media)} em média (de ${d.min} a ${d.max})` }))} />
      </div>
    </Cartao>
  );
}
