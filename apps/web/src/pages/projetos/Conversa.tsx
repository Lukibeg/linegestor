/**
 * Comentários e anexos — do projeto inteiro ou de um cliente dele.
 *
 * O anexo aceita qualquer formato (planilha, documento, print, áudio da URA) até 10 MB,
 * e fica guardado no próprio banco, então entra no backup junto com o resto.
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Paperclip, Send, Trash2 } from 'lucide-react';
import { api } from '../../api/index.js';
import type { ClienteDoProjeto, Projeto } from '../../api/types.js';
import { Spinner, mensagemErro, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { relativo } from '../../lib/format.js';
import { tamanho } from './partes.js';

const LIMITE_BYTES = 10 * 1024 * 1024;

type Props = { projeto: Projeto; linha?: ClienteDoProjeto; onMudou: () => void; compacto?: boolean };

/** O título da caixa: "do projeto" ou "deste cliente". */
const onde = (linha?: ClienteDoProjeto) => (linha ? linha.clientName : 'do projeto');

export function Comentarios({ projeto, linha, compacto }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [texto, setTexto] = useState('');
  const lista = projeto.comentarios.filter((c) => (linha ? c.projectClientId === linha.id : !c.projectClientId));
  const recarregar = () => qc.invalidateQueries({ queryKey: ['projeto', projeto.id] });

  const enviar = useMutation({
    mutationFn: () => api.projetos.comentar(projeto.id, texto.trim(), linha?.id ?? null),
    onSuccess: () => { setTexto(''); recarregar(); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const apagar = useMutation({
    mutationFn: (commentId: string) => api.projetos.apagarComentario(projeto.id, commentId),
    onSuccess: recarregar,
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });

  return (
    <section className={compacto ? '' : 'card p-4'}>
      <h2 className={`font-display font-semibold ${compacto ? 'text-sm' : ''} mb-2`}>Comentários {compacto ? `· ${onde(linha)}` : ''}</h2>

      {projeto.podeTrabalhar && (
        <div className="flex items-end gap-2 mb-3">
          <textarea
            className="input min-h-[38px] max-h-[140px] flex-1 py-2"
            rows={compacto ? 1 : 2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) enviar.mutate(); }}
            placeholder={linha ? `O que aconteceu com ${linha.clientName}?` : 'Um recado para quem trabalha neste projeto'}
          />
          <button className="btn-primary" disabled={!texto.trim() || enviar.isPending} onClick={() => enviar.mutate()} aria-label="Comentar">
            {enviar.isPending ? <Spinner className="text-white" /> : <Send size={15} />}
          </button>
        </div>
      )}

      {!lista.length ? (
        <p className="text-sm text-muted">Nenhum comentário ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1">
          {lista.map((c) => (
            <li key={c.id} className="text-sm group">
              <div className="flex items-baseline gap-2">
                <b className="text-[13px]">{c.autor}</b>
                <span className="text-muted text-[12px]">{relativo(c.createdAt)}</span>
                {(c.userId === user?.id || projeto.podeGerenciar) && (
                  <button className="btn-ghost btn-sm text-bad ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={() => apagar.mutate(c.id)} aria-label="Apagar comentário"><Trash2 size={13} /></button>
                )}
              </div>
              <p className="text-ink-2 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Anexos({ projeto, linha, compacto }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const campo = useRef<HTMLInputElement>(null);
  const [subindo, setSubindo] = useState(false);
  const lista = projeto.anexos.filter((a) => (linha ? a.projectClientId === linha.id : !a.projectClientId));
  const recarregar = () => qc.invalidateQueries({ queryKey: ['projeto', projeto.id] });

  const apagar = useMutation({
    mutationFn: (anexoId: string) => api.projetos.apagarAnexo(projeto.id, anexoId),
    onSuccess: recarregar,
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });

  const escolher = async (file: File) => {
    if (file.size > LIMITE_BYTES) return toast.push('erro', `"${file.name}" tem ${tamanho(file.size)} — o limite é 10 MB.`);
    setSubindo(true);
    try {
      const conteudo = await new Promise<string>((ok, erro) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => erro(new Error('Não consegui ler esse arquivo'));
        r.readAsDataURL(file);
      });
      await api.projetos.anexar(projeto.id, { fileName: file.name, conteudo, projectClientId: linha?.id ?? null });
      recarregar();
      toast.push('ok', `"${file.name}" anexado`);
    } catch (e) { toast.push('erro', mensagemErro(e)); } finally {
      setSubindo(false);
      if (campo.current) campo.current.value = '';
    }
  };

  return (
    <section className={compacto ? '' : 'card p-4'}>
      <div className="flex items-center justify-between mb-2">
        <h2 className={`font-display font-semibold ${compacto ? 'text-sm' : ''}`}>Anexos {compacto ? `· ${onde(linha)}` : ''}</h2>
        {projeto.podeTrabalhar && (
          <>
            <input ref={campo} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolher(f); }} />
            <button className="btn-secondary btn-sm" disabled={subindo} onClick={() => campo.current?.click()}>
              {subindo ? <Spinner /> : <Paperclip size={14} />} Anexar
            </button>
          </>
        )}
      </div>

      {!lista.length ? (
        <p className="text-sm text-muted">Nenhum arquivo ainda. Qualquer formato serve, até 10 MB.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line max-h-[320px] overflow-y-auto">
          {lista.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2 text-sm group">
              <Paperclip size={14} className="text-muted shrink-0" />
              <a className="link flex-1 min-w-0 truncate" href={api.projetos.anexoUrl(a.id)} target="_blank" rel="noreferrer" title={a.fileName}>{a.fileName}</a>
              <span className="text-muted text-[12px] tnum shrink-0">{tamanho(a.sizeBytes)}</span>
              <a className="btn-ghost btn-sm text-muted" href={api.projetos.anexoUrl(a.id)} target="_blank" rel="noreferrer" aria-label={`Baixar ${a.fileName}`}><Download size={13} /></a>
              {(a.quem === user?.name || projeto.podeGerenciar) && projeto.podeTrabalhar && (
                <button className="btn-ghost btn-sm text-bad opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => apagar.mutate(a.id)} aria-label={`Tirar ${a.fileName}`}><Trash2 size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
