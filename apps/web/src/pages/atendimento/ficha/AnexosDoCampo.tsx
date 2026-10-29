/**
 * Os anexos dos campos do card e das caixinhas (2.3, o Luan: "em todas as opções eu quero poder anexar imagens ou docs
 * que vão ter pré visualização"):
 *
 *  - o Anexar de cada campo (e o clipe de cada caixinha) escolhe um ou vários arquivos de até 10 MB; cada um vai sozinho
 *    para o servidor (um que falha não derruba os outros);
 *  - a imagem aparece em miniatura e abre grande com um clique; o PDF abre no leitor do Gestor, sem baixar; o Word, o Excel
 *    e o resto aparecem com o nome e o ícone e baixam com um clique;
 *  - sai do card quem anexou ou quem cuida dos chamados (o histórico guarda).
 */
import { lazy, Suspense, useRef, useState } from 'react';
import { Download, ExternalLink, FileSpreadsheet, FileText, Paperclip, X } from 'lucide-react';
import type { AnexoDoCampo } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Confirmar, Modal, Spinner } from '../../../components/ui/index.js';
import { lerComoDataUrl, tamanhoDoArquivo } from '../../../lib/arquivos.js';
import { dataHoraCurta, useDepoisDeMudar } from '../comum.js';
import { useAberta, useAcao } from './base.js';
import { dataCompleta } from './Cabecalho.js';

const LeitorDePdf = lazy(() => import('../../../components/LeitorDePdf.js'));
const MAX_BYTES = 10 * 1024 * 1024;
const ehPdf = (a: { tipo: string; nome: string }) => a.tipo === 'application/pdf' || /\.pdf$/i.test(a.nome);
const ehPlanilha = (nome: string) => /\.(xlsx?|xlsm|csv|ods)$/i.test(nome);
const ehDocumento = (nome: string) => /\.(docx?|odt|rtf|txt)$/i.test(nome);

/** Os anexos de um campo (ou de uma caixinha), na ordem em que chegaram. */
export function useAnexosDe(campoId: string, opcaoId: string | null = null): AnexoDoCampo[] {
  const { f } = useAberta();
  return (f.anexosDosCampos ?? []).filter((a) => a.campoId === campoId && (a.opcaoId ?? null) === opcaoId);
}

/**
 * O Anexar: a caixa de escolher arquivos (escondida) e o envio, um arquivo de cada vez. `rotulo` vai no botão e no aviso
 * ("Anexar em Configuração dos ramais").
 */
export function BotaoAnexar({ campoId, opcaoId = null, rotulo, soIcone = false, className = '' }: { campoId: string; opcaoId?: string | null; rotulo: string; soIcone?: boolean; className?: string }) {
  const { f, pode } = useAberta();
  const depois = useDepoisDeMudar();
  const entrada = useRef<HTMLInputElement>(null);
  const [indo, setIndo] = useState<{ feitos: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!pode) return null;
  const enviar = async (arquivos: File[]) => {
    setErro(null);
    if (!arquivos.length) return;
    const problemas: string[] = [];
    setIndo({ feitos: 0, total: arquivos.length });
    let feitos = 0;
    for (const a of arquivos) {
      if (a.size > MAX_BYTES) { problemas.push(`"${a.name}" tem ${tamanhoDoArquivo(a.size)}: o limite é 10 MB por arquivo.`); continue; }
      if (a.size === 0) { problemas.push(`"${a.name}" está vazio.`); continue; }
      try {
        const conteudo = await lerComoDataUrl(a);
        await depois(api.atendimento.anexarNoCampo(f.id, campoId, { opcaoId, anexos: [{ fileName: a.name, conteudo }] }));
        feitos++;
        setIndo({ feitos, total: arquivos.length });
      } catch (e) {
        problemas.push(`"${a.name}": ${e instanceof Error ? e.message : 'não foi'}`);
      }
    }
    setIndo(null);
    if (problemas.length) setErro(problemas.join(' '));
  };
  return (
    <span className={`inline-flex flex-col items-end ${className}`}>
      <input ref={entrada} type="file" multiple className="hidden" aria-hidden tabIndex={-1}
        onChange={(e) => { const xs = [...(e.target.files ?? [])]; e.target.value = ''; void enviar(xs); }} />
      <button type="button" className={soIcone ? 'p-1 rounded-md text-muted hover:text-accent hover:bg-surface-2 disabled:opacity-40' : 'btn-ghost btn-sm -my-1'}
        disabled={!!indo} onClick={() => entrada.current?.click()} aria-label={rotulo} title={`${rotulo} (imagens, PDF, Word, Excel… até 10 MB cada)`} data-anexar="">
        {indo ? <Spinner className="!w-3.5 !h-3.5" /> : <Paperclip size={soIcone ? 14 : 13} />}
        {!soIcone && <span>{indo && indo.total > 1 ? `Anexando ${indo.feitos + 1} de ${indo.total}…` : 'Anexar'}</span>}
      </button>
      {erro && (
        <span role="alert" className="text-bad text-[12px] leading-snug mt-1 max-w-[260px] text-right">
          {erro} <button type="button" className="underline" onClick={() => setErro(null)}>ok</button>
        </span>
      )}
    </span>
  );
}

/** As miniaturas e os arquivos de um campo (ou de uma caixinha); nada quando não tem anexo. */
export function ListaDeAnexos({ anexos, pequeno = false }: { anexos: AnexoDoCampo[]; pequeno?: boolean }) {
  const { f, pode } = useAberta();
  const acao = useAcao();
  const [grande, setGrande] = useState<AnexoDoCampo | null>(null);
  const [pdf, setPdf] = useState<AnexoDoCampo | null>(null);
  const [tirar, setTirar] = useState<AnexoDoCampo | null>(null);
  if (!anexos.length) return null;
  const imagens = anexos.filter((a) => a.imagem);
  const arquivos = anexos.filter((a) => !a.imagem);
  const quem = (a: AnexoDoCampo) => `${a.por?.nome ?? 'alguém'} · ${dataHoraCurta(a.em)}`;
  const BotaoTirar = ({ a }: { a: AnexoDoCampo }) => (pode && a.podeTirar ? (
    <button type="button" onClick={() => setTirar(a)} aria-label={`Tirar ${a.nome}`} title={`Tirar ${a.nome}`}
      className="absolute -top-1.5 -right-1.5 grid place-items-center w-5 h-5 rounded-full bg-surface border border-line text-muted hover:text-bad shadow-sm sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100">
      <X size={12} />
    </button>
  ) : null);
  return (
    <div className={`flex flex-col gap-1.5 ${pequeno ? 'mt-1' : 'mt-2'}`} data-anexos="">
      {imagens.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {imagens.map((a) => (
            <li key={a.id} className="relative group">
              <button type="button" onClick={() => setGrande(a)} className="block rounded-md border border-line overflow-hidden bg-surface hover:border-accent" title={`${a.nome} — ${quem(a)}`}>
                <img src={api.atendimento.anexoUrl(a.id)} alt={a.nome} loading="lazy" className={`${pequeno ? 'h-14 max-w-[110px]' : 'h-20 max-w-[170px]'} w-auto object-cover`} />
              </button>
              <BotaoTirar a={a} />
            </li>
          ))}
        </ul>
      )}
      {arquivos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {arquivos.map((a) => {
            const Icone = ehPdf(a) || ehDocumento(a.nome) ? FileText : ehPlanilha(a.nome) ? FileSpreadsheet : Paperclip;
            const conteudo = <><Icone size={12} className="shrink-0" /> <span className="truncate max-w-[200px]">{a.nome}</span> <span className="text-muted font-normal">· {tamanhoDoArquivo(a.tamanho)}</span></>;
            return (
              <li key={a.id} className="relative group">
                {ehPdf(a) ? (
                  // o PDF abre no leitor do Gestor, sem baixar (o Baixar fica na janela)
                  <button type="button" onClick={() => setPdf(a)} className="chip bg-surface-2 text-ink-2 hover:text-accent font-medium max-w-full" title={`Ver ${a.nome} sem baixar — ${quem(a)}`} data-pdf="">{conteudo}</button>
                ) : (
                  <a href={api.atendimento.anexoUrl(a.id)} download={a.nome} className="chip bg-surface-2 text-ink-2 hover:text-accent font-medium max-w-full" title={`Baixar ${a.nome} — ${quem(a)}`}>{conteudo}</a>
                )}
                <BotaoTirar a={a} />
              </li>
            );
          })}
        </ul>
      )}
      {acao.erro && <p role="alert" className="text-bad text-[12.5px]">{acao.erro}</p>}
      {grande && (
        <Modal open onClose={() => setGrande(null)} titulo={grande.nome} largura="max-w-5xl"
          rodape={<>
            <a className="btn-secondary" href={api.atendimento.anexoUrl(grande.id)} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir em outra aba</a>
            <a className="btn-primary" href={api.atendimento.anexoUrl(grande.id)} download={grande.nome}><Download size={15} /> Baixar</a>
          </>}>
          <img src={api.atendimento.anexoUrl(grande.id)} alt={grande.nome} className="max-w-full max-h-[72vh] mx-auto rounded-md" />
          <p className="text-center text-[12px] text-muted mt-2" title={dataCompleta(grande.em)}>{tamanhoDoArquivo(grande.tamanho)} · anexado por {quem(grande)}</p>
        </Modal>
      )}
      {pdf && (
        <Modal open onClose={() => setPdf(null)} titulo={pdf.nome} largura="max-w-4xl"
          rodape={<a className="btn-primary" href={api.atendimento.anexoUrl(pdf.id)} download={pdf.nome}><Download size={15} /> Baixar</a>}>
          <div id="janela-pdf" className="min-w-0">
            <Suspense fallback={<p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted"><Spinner /> Abrindo o PDF…</p>}>
              <LeitorDePdf id={pdf.id} nome={pdf.nome} carregar={() => api.atendimento.anexoBytes(pdf.id)} />
            </Suspense>
            <p className="text-center text-[12px] text-muted mt-2">{tamanhoDoArquivo(pdf.tamanho)} · anexado por {quem(pdf)}</p>
          </div>
        </Modal>
      )}
      {tirar && (
        <Confirmar open onClose={() => setTirar(null)} loading={acao.ocupado} perigoso titulo="Tirar o anexo" botao="Tirar"
          onConfirm={() => { void acao.rodar(() => api.atendimento.tirarAnexoDoCampo(f.id, tirar.id), 'Anexo tirado').then(() => setTirar(null)); }}
          texto={<><b>{tirar.nome}</b> sai do card. O histórico guarda quem tirou.</>} />
      )}
    </div>
  );
}
