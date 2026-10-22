/**
 * OS MESES DE ANTES DO SUPORTE NA PRÉVIA (Patch 2.0.5, decisão 0055).
 *
 * Os Relatórios dos painéis precisam de história para mostrar alguma coisa: a Entrada × saída por semana, a
 * Previsão da semana (8 semanas completas), o Sobe e desce (o período de antes), o Fechamento do mês (o mês de
 * antes), os 12 meses do Raio-X. Os exemplos (`demo-atendimento-exemplos.ts`) cobrem só as últimas semanas, com
 * as histórias pedidas uma a uma; aqui fica o volume de antes deles: uns cinco meses de chamados do Suporte, já
 * resolvidos e fechados, sorteados com uma semente fixa (a prévia mostra a mesma coisa no mesmo dia).
 *
 * É só o plano — quem abriu e quando, o assunto, quem pegou, as subidas com o motivo, a espera pelo cliente, o
 * protocolo na operadora, o tempo lançado, a solução e a causa. O `demo-atendimento.ts` vive cada passo pelas
 * mesmas funções da tela, como faz com os exemplos: o histórico de cada chamado, a trajetória e os prazos batem
 * entre si (e com o que o servidor faria).
 *
 * No sistema de verdade não há nada disso: o módulo novo começa vazio na virada (os chamados do Helena ficam no
 * Legado do Helena), e os relatórios enchem com o uso.
 */
import { instanteLocal, somarDias, somarMinutosUteis, type Calendario, type Gravidade, type Prioridade } from '@gestor/shared';
import type { Pessoa } from './demo-atendimento-exemplos.js';

export type PassoDoHistorico =
  /** pegar o chamado (sai do Novo para o N1; a primeira resposta, no que veio do robô) */
  | { faz: 'assumir'; em: Date; por: Pessoa }
  | { faz: 'subir'; em: Date; por: Pessoa; para: 'n2' | 'n3' | 'dev'; motivo: string; responsavel: Pessoa }
  | { faz: 'descer'; em: Date; por: Pessoa; motivo: string; responsavel: Pessoa }
  | { faz: 'esperarCliente'; em: Date; por: Pessoa; motivo: string }
  | { faz: 'clienteVoltou'; em: Date; por: Pessoa }
  | { faz: 'operadora'; em: Date; por: Pessoa; operadora: string; protocolo: string; prometidoPara: Date }
  | { faz: 'fecharProtocolo'; em: Date; por: Pessoa; texto: string }
  | { faz: 'tempo'; em: Date; por: Pessoa; minutos: number; nota: string }
  /** a solução escrita e o chamado em observação (o cliente testa antes de resolver) */
  | { faz: 'observacao'; em: Date; por: Pessoa; solucao: string }
  | { faz: 'resolver'; em: Date; por: Pessoa; solucao: string; causa: string; responsabilidade: string | null }
  | { faz: 'reabrir'; em: Date; por: Pessoa; motivo: string }
  | { faz: 'repete'; em: Date; por: Pessoa; com: string };

export type ChamadoDoHistorico = {
  chave: string;
  abre: Date;
  /** veio do robô do LineChat (o WhatsApp do cliente); senão, aberto por uma pessoa da equipe */
  robo: boolean;
  por: Pessoa;
  titulo: string; relato: string;
  cliente: string;
  contato: [string, string] | null;
  /** o caminho do assunto ("Ramal › Configuração › Criação") */
  assunto: string;
  tipo: string; gravidade: Gravidade;
  /** só quando foi trocada da sugerida (com o motivo) */
  prioridade: Prioridade | null; motivoPrioridade: string | null;
  /** os códigos dos produtos e os nomes das operadoras */
  produtos: string[]; operadoras: string[];
  passos: PassoDoHistorico[];
};

// =====================================================================
//  O SORTEIO (sempre o mesmo para a mesma semente)
// =====================================================================

function sorteador(semente: number) {
  let a = semente >>> 0;
  const x = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const entre = (de: number, ate: number) => de + Math.floor(x() * (ate - de + 1));
  const um = <T>(xs: readonly T[]): T => xs[Math.floor(x() * xs.length)]!;
  const pesado = <T>(xs: ReadonlyArray<readonly [T, number]>): T => {
    const total = xs.reduce((s, [, p]) => s + p, 0);
    let r = x() * total;
    for (const [v, p] of xs) { r -= p; if (r <= 0) return v; }
    return xs[xs.length - 1]![0];
  };
  /** quantos chegam num dia (Poisson, pelo método de Knuth: λ é pequeno) */
  const poisson = (lambda: number) => {
    const l = Math.exp(-lambda);
    let k = 0; let p = 1;
    do { k++; p *= x(); } while (p > l);
    return k - 1;
  };
  return { x, entre, um, pesado, poisson, chance: (p: number) => x() < p };
}

// =====================================================================
//  O QUE CHEGA AO SUPORTE (os assuntos da lista da equipe, com o jeito de cada um)
// =====================================================================

type Modelo = {
  /** o peso do assunto no sorteio */
  peso: number;
  titulos: string[];
  relato: string;
  tipo: 'Incidente' | 'Requisição' | 'Dúvida' | 'Mudança';
  gravidades: ReadonlyArray<readonly [Gravidade, number]>;
  solucoes: string[];
  causas: string[];
  /** de quem costuma ser a falha (o campo Responsabilidade) */
  falha: ReadonlyArray<readonly [string, number]>;
  produtos?: string[];
  /** o assunto que costuma subir de nível (a chance de ir ao N2) */
  sobe?: number;
  /** o assunto que depende da operadora (abre protocolo) */
  operadora?: boolean;
};

const INGLINE: ReadonlyArray<readonly [string, number]> = [['Ingline', 6], ['Cliente', 3], ['Fornecedor', 1]];
const DO_CLIENTE: ReadonlyArray<readonly [string, number]> = [['Cliente', 8], ['Ingline', 1], ['Fornecedor', 1]];
const DA_OPERADORA: ReadonlyArray<readonly [string, number]> = [['Operadora', 8], ['Ingline', 1], ['Cliente', 1]];
const PEDIDO: ReadonlyArray<readonly [Gravidade, number]> = [['nao_se_aplica', 1]];
const DEFEITO: ReadonlyArray<readonly [Gravidade, number]> = [['inoperancia', 3], ['intermitencia', 3], ['performance', 1], ['disfuncional', 3]];
const PARADO: ReadonlyArray<readonly [Gravidade, number]> = [['inoperancia', 6], ['intermitencia', 3], ['disfuncional', 1]];

/** As chaves seguem a lista colada da equipe ("Ramal - Configuração - Criação"). */
const MODELOS: Record<string, Modelo> = {
  'Ramal - Configuração - Identidade': { peso: 4, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Trocar o nome do ramal {r} ({s})', 'Bina do ramal {r} com o nome antigo'], relato: 'Pediram para mostrar o nome certo do ramal {r} nas ligações internas.', solucoes: ['Nome do ramal atualizado no LinePBX e o aparelho reiniciado.'], causas: ['A pessoa do setor mudou e o cadastro ficou com o nome antigo.'] },
  'Ramal - Configuração - Criação': { peso: 9, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Criar {n} ramais para {s}', 'Ramal novo para {s}', 'Criar ramal para a nova funcionária ({s})'], relato: 'O cliente pediu ramal novo para {s}, com o mesmo perfil dos outros do setor.', solucoes: ['Ramal criado, aparelho provisionado e testado com o cliente.', 'Ramais criados no LinePBX e entregues com a senha ao responsável.'], causas: ['Pedido do cliente (contratação nova).', 'Pedido do cliente (setor novo).'] },
  'Ramal - Configuração - Exclusão': { peso: 3, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Excluir o ramal {r}', 'Tirar {n} ramais de quem saiu ({s})'], relato: 'Pediram para excluir o ramal {r}: a pessoa saiu da empresa.', solucoes: ['Ramal excluído e o desvio das ligações dele apontado para o setor.'], causas: ['Pedido do cliente (desligamento).'] },
  'Ramal - Configuração - WebRTC': { peso: 3, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Ramal no navegador para {s}', 'Liberar o WebRTC do ramal {r}'], relato: 'Querem atender pelo navegador no ramal {r}, sem o aparelho.', solucoes: ['WebRTC liberado no ramal e testado no navegador do cliente.'], causas: ['Pedido do cliente (trabalho remoto).'] },
  'Ramal - Configuração - Outros': { peso: 3, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Siga-me do ramal {r} para o celular', 'Cadeado no ramal {r} para ligações de celular'], relato: 'Pediram um ajuste no ramal {r} ({s}).', solucoes: ['Ajuste feito no ramal e testado com o cliente.'], causas: ['Pedido do cliente.'] },
  'Ramal - Incidente - Sem serviço': { peso: 10, tipo: 'Incidente', gravidades: PARADO, falha: [['Cliente', 4], ['Ingline', 3], ['Fornecedor', 2]], produtos: ['linepbx'], sobe: 0.25, titulos: ['Ramal {r} sem sinal ({s})', 'Ramal {r} não registra', 'Telefone do {s} mudo'], relato: 'O ramal {r} do {s} parou: não faz nem recebe ligação.', solucoes: ['O aparelho voltou a registrar depois de reiniciar e conferir o cabo.', 'Trocamos o aparelho e o ramal voltou.', 'Liberamos o IP novo do aparelho no firewall do PABX.'], causas: ['Cabo de rede solto no setor.', 'Aparelho com defeito na fonte.', 'O switch do cliente trocou o IP do aparelho.'] },
  'Ramal - Incidente - WebRTC': { peso: 3, tipo: 'Incidente', gravidades: DEFEITO, falha: INGLINE, produtos: ['linepbx'], sobe: 0.3, titulos: ['Ramal no navegador sem áudio ({s})', 'WebRTC do ramal {r} cai a cada ligação'], relato: 'O ramal {r} no navegador conecta mas fica sem áudio.', solucoes: ['Permissão do microfone liberada no navegador e o certificado conferido.'], causas: ['O navegador bloqueou o microfone depois da atualização.'] },
  'Equipamentos - Solicitação - Headset': { peso: 4, tipo: 'Requisição', gravidades: PEDIDO, falha: [['Fornecedor', 5], ['Cliente', 3], ['Ingline', 2]], produtos: ['equipamentos'], titulos: ['Headset novo para {s}', 'Trocar {n} headsets do {s}'], relato: 'Pediram headset para {s}.', solucoes: ['Headsets separados no estoque e entregues no cliente.'], causas: ['Pedido do cliente (headset gasto).'] },
  'Equipamentos - Solicitação - Telefone': { peso: 3, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['equipamentos'], titulos: ['Telefone IP para {s}', '{n} telefones para a {u}'], relato: 'Precisam de telefone para {s}.', solucoes: ['Aparelho configurado e entregue (comodato).'], causas: ['Pedido do cliente (ponto novo).'] },
  'Equipamentos - Solicitação - Troca': { peso: 3, tipo: 'Requisição', gravidades: [['nao_se_aplica', 2], ['disfuncional', 1]], falha: [['Fornecedor', 6], ['Cliente', 3], ['Ingline', 1]], produtos: ['equipamentos'], titulos: ['Trocar o telefone do ramal {r}', 'Telefone do {s} com o visor apagado'], relato: 'O telefone do ramal {r} está com defeito e pediram a troca.', solucoes: ['Aparelho trocado; o com defeito voltou para a garantia.'], causas: ['Defeito de fábrica no aparelho.'] },
  'Equipamentos - Ajustes e configurações': { peso: 3, tipo: 'Requisição', gravidades: [['nao_se_aplica', 3], ['disfuncional', 1]], falha: INGLINE, produtos: ['equipamentos'], titulos: ['Teclas de atalho do telefone do {s}', 'Volume do toque do ramal {r}'], relato: 'Pediram ajuste no telefone do {s}.', solucoes: ['Aparelho ajustado por acesso remoto.'], causas: ['Pedido do cliente.'] },
  'SBC e Tronco - Configuração - Ativação': { peso: 2, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['voicenet'], sobe: 0.5, titulos: ['Ativar o tronco novo da {u}', 'Ativação do tronco SIP ({n} canais)'], relato: 'O tronco novo foi entregue pela operadora e precisa ser ativado no SBC.', solucoes: ['Tronco ativado no SBC e as rotas testadas com o cliente.'], causas: ['Pedido do cliente (unidade nova).'] },
  'SBC e Tronco - Configuração - Rota de entrada': { peso: 3, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], sobe: 0.35, titulos: ['Número {d} cair direto na fila do {s}', 'Mudar o destino do DID {d}'], relato: 'Querem que o número {d} caia direto no {s}.', solucoes: ['Rota de entrada do DID apontada para a fila e testada.'], causas: ['Pedido do cliente (mudança de atendimento).'] },
  'SBC e Tronco - Configuração - Rota de saída': { peso: 2, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], sobe: 0.35, titulos: ['Ligações para celular saindo pela VC1', 'Rota de saída por menor custo'], relato: 'Pediram para mudar a rota de saída das ligações para celular.', solucoes: ['Rota de saída ajustada no SBC e conferida nos relatórios.'], causas: ['Pedido do cliente (custo).'] },
  'SBC e Tronco - Configuração - Apontamento de IP': { peso: 2, tipo: 'Mudança', gravidades: PEDIDO, falha: [['Cliente', 5], ['Ingline', 5]], produtos: ['linepbx'], sobe: 0.4, titulos: ['IP novo do link da {u}', 'Apontar o SBC para o IP novo do cliente'], relato: 'O cliente trocou o link e o IP mudou.', solucoes: ['SBC apontado para o IP novo e o registro conferido.'], causas: ['O cliente trocou o provedor de internet.'] },
  'Operadora - Incidente - DID de entrada': { peso: 5, tipo: 'Incidente', gravidades: PARADO, falha: DA_OPERADORA, produtos: ['voicenet'], sobe: 0.45, operadora: true, titulos: ['Ligações para o {d} não chegam', 'Número {d} dá ocupado'], relato: 'Quem liga para o {d} ouve ocupado ou a ligação não completa.', solucoes: ['A operadora corrigiu o roteamento do número; testamos com o cliente.', 'Rota refeita do lado da operadora e as ligações voltaram.'], causas: ['Falha de roteamento na operadora.', 'A operadora perdeu a portabilidade do número.'] },
  'Operadora - Incidente - DID de saída': { peso: 3, tipo: 'Incidente', gravidades: PARADO, falha: DA_OPERADORA, produtos: ['voicenet'], sobe: 0.45, operadora: true, titulos: ['Ligações de saída com o número errado', 'Saída para fixo não completa ({u})'], relato: 'As ligações de saída não completam ou saem com o número errado.', solucoes: ['A operadora liberou a identificação do número e as ligações saíram.'], causas: ['Bloqueio cadastral na operadora.'] },
  'Operadora - Incidente - Canais': { peso: 4, tipo: 'Incidente', gravidades: PARADO, falha: DA_OPERADORA, produtos: ['voicenet'], sobe: 0.5, operadora: true, titulos: ['Tronco com os canais ocupados', 'Ligações caindo no tronco da {u}', 'Sem canal para ligar ({u})'], relato: 'O tronco ficou sem canal: as ligações não completam.', solucoes: ['A operadora reiniciou o tronco e liberou os canais.', 'A operadora trocou o equipamento e o tronco estabilizou.'], causas: ['Instabilidade na rede da operadora.', 'Equipamento da operadora com defeito.'] },
  'Infraestrutura do cliente - Rede - Energia': { peso: 2, tipo: 'Incidente', gravidades: PARADO, falha: DO_CLIENTE, titulos: ['Queda de energia derrubou os telefones da {u}', 'Nobreak da recepção desligou'], relato: 'Faltou energia e os telefones não voltaram.', solucoes: ['Os aparelhos voltaram depois de religar o switch do cliente.'], causas: ['Queda de energia na unidade do cliente.'] },
  'Infraestrutura do cliente - Rede - Interna': { peso: 4, tipo: 'Incidente', gravidades: DEFEITO, falha: DO_CLIENTE, sobe: 0.2, titulos: ['Áudio picotando no {s}', 'Telefones do {s} caindo da rede'], relato: 'As ligações do {s} picotam e às vezes caem.', solucoes: ['Ajustada a prioridade de voz (QoS) no roteador do cliente.', 'O TI do cliente trocou o switch do setor.'], causas: ['Rede interna do cliente sem prioridade para a voz.', 'Switch do cliente com defeito.'] },
  'Infraestrutura do cliente - Rede - Externa': { peso: 3, tipo: 'Incidente', gravidades: PARADO, falha: DO_CLIENTE, titulos: ['Internet da {u} fora', 'Link do cliente instável'], relato: 'A internet da {u} caiu e os ramais pararam.', solucoes: ['O provedor do cliente restabeleceu o link; os ramais voltaram sozinhos.'], causas: ['Queda do provedor de internet do cliente.'] },
  'Infraestrutura do cliente - Periféricos': { peso: 2, tipo: 'Incidente', gravidades: [['disfuncional', 3], ['performance', 1]], falha: DO_CLIENTE, titulos: ['Headset sem microfone no {s}', 'Fone do caixa {n} chiando'], relato: 'O headset do {s} não pega o microfone.', solucoes: ['Headset trocado pelo de reserva do cliente.'], causas: ['Cabo do headset rompido.'] },
  'Infraestrutura do cliente - Recursos': { peso: 1, tipo: 'Dúvida', gravidades: PEDIDO, falha: DO_CLIENTE, titulos: ['Dúvida sobre o computador do {s}'], relato: 'O cliente perguntou se o computador do {s} aguenta o softphone.', solucoes: ['Explicado o mínimo de memória e mandado o guia.'], causas: ['Dúvida do cliente.'] },
  'Fortics - Incidente': { peso: 1, tipo: 'Incidente', gravidades: DEFEITO, falha: [['Fornecedor', 7], ['Ingline', 3]], produtos: ['szchat'], sobe: 0.4, titulos: ['SZChat sem receber mensagens'], relato: 'O SZChat parou de receber as mensagens do WhatsApp.', solucoes: ['Sessão do WhatsApp refeita no SZChat.'], causas: ['A sessão do WhatsApp expirou no SZChat.'] },
  'Centrais terceiras - Configuração': { peso: 1, tipo: 'Requisição', gravidades: PEDIDO, falha: [['Fornecedor', 5], ['Cliente', 5]], titulos: ['Ajuste na central antiga da {u}'], relato: 'A {u} ainda usa a central antiga e pediu um ajuste.', solucoes: ['Ajuste feito com o técnico da central.'], causas: ['Pedido do cliente.'] },
  'Centrais terceiras - Incidente': { peso: 1, tipo: 'Incidente', gravidades: DEFEITO, falha: [['Fornecedor', 6], ['Cliente', 4]], sobe: 0.3, titulos: ['Central antiga da {u} travada'], relato: 'A central da {u} travou e não recebe ligações.', solucoes: ['A central voltou depois de reiniciada pelo técnico dela.'], causas: ['Central do fornecedor travada.'] },
  'LinePBX - Configuração - URA': { peso: 5, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Trocar o áudio da URA ({s})', 'Opção nova na URA para o {s}'], relato: 'Pediram para mudar a URA: {s}.', solucoes: ['URA alterada e testada ligando de fora.'], causas: ['Pedido do cliente (campanha).', 'Pedido do cliente (setor novo).'] },
  'LinePBX - Configuração - Horários de funcionamento': { peso: 3, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Horário especial do dia {dia}', 'Horário de sábado novo da {u}'], relato: 'Pediram o horário especial para o dia {dia}.', solucoes: ['Horário especial cadastrado e a mensagem de fora do horário conferida.'], causas: ['Pedido do cliente (feriado).'] },
  'LinePBX - Configuração - Dial plan': { peso: 2, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], sobe: 0.4, titulos: ['Discagem de 0800 bloqueada', 'Prefixo para ligações internacionais'], relato: 'Pediram ajuste no plano de discagem.', solucoes: ['Plano de discagem ajustado e testado.'], causas: ['Pedido do cliente.'] },
  'LinePBX - Configuração - Firewall': { peso: 2, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], sobe: 0.4, titulos: ['Liberar o IP da {u} no firewall'], relato: 'A {u} vai usar ramal remoto: liberar o IP no firewall.', solucoes: ['IP liberado no firewall do PABX.'], causas: ['Pedido do cliente (unidade nova).'] },
  'LinePBX - Incidente - Erro de firewall': { peso: 3, tipo: 'Incidente', gravidades: PARADO, falha: INGLINE, produtos: ['linepbx'], sobe: 0.5, titulos: ['Ramais remotos bloqueados pelo firewall', 'Firewall bloqueou o IP da {u}'], relato: 'Os ramais remotos pararam de registrar: o IP parece bloqueado.', solucoes: ['IP desbloqueado e a regra do fail2ban ajustada.'], causas: ['Tentativas de senha errada bloquearam o IP do cliente.'] },
  'LinePBX - Incidente - Processos travados': { peso: 2, tipo: 'Incidente', gravidades: PARADO, falha: [['Ingline', 8], ['Fornecedor', 2]], produtos: ['linepbx'], sobe: 0.6, titulos: ['PABX lento e chamadas sem áudio', 'Gravações paradas desde {h}'], relato: 'O PABX está lento e as ligações ficam mudas.', solucoes: ['Processo travado reiniciado e o disco limpo.'], causas: ['Disco do servidor cheio de gravações antigas.'] },
  'LinePBX - Incidente - Certificado': { peso: 1, tipo: 'Incidente', gravidades: [['disfuncional', 2], ['intermitencia', 1]], falha: [['Ingline', 9], ['Fornecedor', 1]], produtos: ['linepbx'], sobe: 0.5, titulos: ['Certificado vencido no LinePBX Web', 'Navegador acusa site inseguro no painel do PABX'], relato: 'O navegador mostra o certificado vencido ao abrir o LinePBX Web.', solucoes: ['Certificado renovado e o serviço reiniciado.'], causas: ['A renovação automática do certificado falhou.'] },
  'Filas - Configuração - Agentes': { peso: 5, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Pôr {n} agentes na fila do {s}', 'Tirar a agente que saiu da fila do {s}'], relato: 'Pediram para mexer nos agentes da fila do {s}.', solucoes: ['Agentes ajustados na fila e testado o atendimento.'], causas: ['Pedido do cliente.'] },
  'Filas - Configuração - Geral': { peso: 3, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Tempo de toque da fila do {s}', 'Fila do {s} transbordar para o celular'], relato: 'Pediram ajuste na fila do {s}.', solucoes: ['Fila ajustada e testada.'], causas: ['Pedido do cliente.'] },
  'Filas - Configuração - Anúncios': { peso: 2, tipo: 'Mudança', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Anúncio de posição na fila do {s}', 'Música de espera nova ({s})'], relato: 'Pediram para mudar o anúncio da fila do {s}.', solucoes: ['Anúncio trocado e conferido ligando de fora.'], causas: ['Pedido do cliente.'] },
  'Filas - Incidente - Distribuição de atendimentos': { peso: 4, tipo: 'Incidente', gravidades: DEFEITO, falha: [['Ingline', 5], ['Cliente', 5]], produtos: ['linepbx'], sobe: 0.35, titulos: ['Fila do {s} não distribui para todas', 'Ligações paradas na fila do {s}'], relato: 'A fila do {s} manda tudo para a mesma agente.', solucoes: ['Estratégia da fila corrigida e as agentes deslogadas e logadas de novo.'], causas: ['Agentes com pausa presa no sistema.', 'Estratégia da fila trocada por engano.'] },
  'Relatórios - LineReports - Ativação': { peso: 1, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linereports'], titulos: ['Ativar o LineReports da {u}'], relato: 'Contrataram o LineReports e pediram a ativação.', solucoes: ['LineReports ativado e os acessos entregues.'], causas: ['Pedido do cliente (contratação).'] },
  'Relatórios - LineReports - Criação de logins': { peso: 3, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linereports'], titulos: ['Login do LineReports para a supervisão do {s}', '{n} logins do LineReports'], relato: 'Pediram login do LineReports para o {s}.', solucoes: ['Logins criados e enviados por e-mail.'], causas: ['Pedido do cliente.'] },
  'Relatórios - LineReports - Erro de exportação': { peso: 2, tipo: 'Incidente', gravidades: [['disfuncional', 3], ['performance', 1]], falha: [['Ingline', 9], ['Cliente', 1]], produtos: ['linereports'], sobe: 0.5, titulos: ['Exportação do LineReports não termina', 'Planilha do mês sai vazia'], relato: 'A exportação do relatório do mês não termina.', solucoes: ['Exportação feita por partes e o limite do servidor aumentado.'], causas: ['Limite de memória do serviço de exportação.'] },
  'Relatórios - LineReports - Erro de visualização': { peso: 2, tipo: 'Incidente', gravidades: [['disfuncional', 3], ['performance', 1]], falha: INGLINE, produtos: ['linereports'], sobe: 0.3, titulos: ['Gráfico de filas em branco no LineReports'], relato: 'O gráfico das filas abre em branco.', solucoes: ['Cache do LineReports limpo e o gráfico voltou.'], causas: ['Cache do LineReports desatualizado.'] },
  'Relatórios - LineChat - Solicitação': { peso: 2, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linechat'], titulos: ['Relatório de atendimentos do LineChat ({s})'], relato: 'Pediram o relatório de atendimentos do LineChat do {s}.', solucoes: ['Relatório gerado e enviado.'], causas: ['Pedido do cliente.'] },
  'FOP2 - Configuração - Credenciais': { peso: 1, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Senha do FOP2 do {s}'], relato: 'Esqueceram a senha do FOP2 do {s}.', solucoes: ['Senha redefinida e passada ao responsável.'], causas: ['Pedido do cliente.'] },
  'FOP2 - Configuração - Logins': { peso: 2, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Logins do FOP2 para o {s}'], relato: 'Pediram logins do FOP2 para o {s}.', solucoes: ['Logins criados no FOP2.'], causas: ['Pedido do cliente.'] },
  'FOP2 - Configuração - Grupos e permissões': { peso: 1, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Grupo do {s} no FOP2'], relato: 'Pediram um grupo do {s} no FOP2.', solucoes: ['Grupo criado com as permissões pedidas.'], causas: ['Pedido do cliente.'] },
  'FOP2 - Incidente - Falha massiva': { peso: 1, tipo: 'Incidente', gravidades: PARADO, falha: [['Ingline', 7], ['Fornecedor', 3]], produtos: ['linepbx'], sobe: 0.6, titulos: ['FOP2 fora do ar ({u})'], relato: 'O FOP2 não abre para ninguém.', solucoes: ['Serviço do FOP2 reiniciado e a licença conferida.'], causas: ['Serviço do FOP2 parado depois da atualização.'] },
  'FOP2 - Incidente - Erro de pausa': { peso: 2, tipo: 'Incidente', gravidades: [['disfuncional', 3], ['intermitencia', 1]], falha: INGLINE, produtos: ['linepbx'], sobe: 0.3, titulos: ['Pausa do FOP2 não sai ({s})'], relato: 'A agente do {s} não consegue sair da pausa no FOP2.', solucoes: ['Pausa liberada e o ramal da agente relogado.'], causas: ['Pausa presa depois de queda da rede.'] },
  'FOP2 - Incidente - Callback': { peso: 1, tipo: 'Incidente', gravidades: [['disfuncional', 1]], falha: INGLINE, produtos: ['linepbx'], sobe: 0.3, titulos: ['Retorno do FOP2 não completa ({s})'], relato: 'O retorno (callback) do FOP2 não completa.', solucoes: ['Contexto do callback corrigido.'], causas: ['Contexto de saída errado no callback.'] },
  'Omniboard - Configuração - Credenciais': { peso: 1, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Senha do Omniboard da supervisão'], relato: 'Pediram a troca da senha do Omniboard.', solucoes: ['Senha redefinida.'], causas: ['Pedido do cliente.'] },
  'Omniboard - Configuração - Logins': { peso: 2, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['{n} agentes novas no Omniboard'], relato: 'Pediram logins do Omniboard para as agentes novas.', solucoes: ['Logins criados e as agentes postas nas filas.'], causas: ['Pedido do cliente (contratações).'] },
  'Omniboard - Configuração - Grupos e permissões': { peso: 1, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linepbx'], titulos: ['Supervisora do {s} ver as filas no Omniboard'], relato: 'Pediram para a supervisora do {s} ver as filas.', solucoes: ['Permissão dada no Omniboard.'], causas: ['Pedido do cliente.'] },
  'Omniboard - Incidente - Falha massiva': { peso: 1, tipo: 'Incidente', gravidades: PARADO, falha: [['Ingline', 7], ['Fornecedor', 3]], produtos: ['linepbx'], sobe: 0.6, titulos: ['Omniboard não abre ({u})'], relato: 'O Omniboard não abre para as agentes.', solucoes: ['Serviço reiniciado e o banco do Omniboard reindexado.'], causas: ['Banco do Omniboard lento depois da atualização.'] },
  'Omniboard - Incidente - Transferência': { peso: 2, tipo: 'Incidente', gravidades: [['disfuncional', 2], ['intermitencia', 1]], falha: INGLINE, produtos: ['linepbx'], sobe: 0.3, titulos: ['Transferência do Omniboard cai ({s})'], relato: 'Ao transferir pelo Omniboard, a ligação cai.', solucoes: ['Contexto de transferência corrigido no Omniboard.'], causas: ['Contexto de transferência apontando para a fila antiga.'] },
  'Omniboard - Incidente - Sincronismo de status': { peso: 1, tipo: 'Incidente', gravidades: [['disfuncional', 1]], falha: INGLINE, produtos: ['linepbx'], sobe: 0.3, titulos: ['Status das agentes atrasado no Omniboard'], relato: 'O status das agentes demora a mudar no Omniboard.', solucoes: ['Serviço de eventos reiniciado.'], causas: ['Fila de eventos do Omniboard travada.'] },
  'BM - Configuração - Conta do WhatsApp': { peso: 2, tipo: 'Requisição', gravidades: PEDIDO, falha: INGLINE, produtos: ['linechat'], titulos: ['Número novo no WhatsApp oficial ({u})', 'Verificar a conta do WhatsApp da {u}'], relato: 'Pediram para ligar um número novo ao WhatsApp oficial.', solucoes: ['Número ligado ao BM e o modelo de mensagem aprovado.'], causas: ['Pedido do cliente.'] },
  'BM - Incidente - Meio de pagamento': { peso: 1, tipo: 'Incidente', gravidades: [['inoperancia', 1]], falha: DO_CLIENTE, produtos: ['linechat'], titulos: ['WhatsApp oficial parou por falta de pagamento'], relato: 'As mensagens pararam: o cartão do BM foi recusado.', solucoes: ['O cliente trocou o cartão no BM e as mensagens voltaram.'], causas: ['Cartão do BM vencido.'] },
};

const CLIENTES: ReadonlyArray<readonly [string, number]> = [
  ['Hospital Vale Verde', 18], ['Clínica Aurora', 16], ['Supermercado Bom Preço', 14], ['Distribuidora Norte', 12],
  ['Laboratório Exame Certo', 12], ['Construtora Horizonte', 9], ['Home Care Viver Bem', 10], ['Escritório Prado & Lima', 7],
];
const SETORES = ['recepção', 'financeiro', 'SAC', 'faturamento', 'centro cirúrgico', 'almoxarifado', 'diretoria', 'RH', 'caixa 3', 'televendas', 'plantão', 'laboratório', 'compras', 'expedição'];
const UNIDADES = ['Loja Centro', 'filial de Lauro de Freitas', 'unidade Pituba', 'CD de Feira de Santana', 'unidade de Camaçari', 'loja Simões Filho', 'matriz'];
const CONTATOS: Array<[string, string]> = [
  ['Patrícia Gomes', '(71) 98811-2031'], ['Rafael Nunes', '(71) 99702-4410'], ['Juliana Matos', '(71) 98134-5562'], ['Carlos Eduardo', '(71) 99977-1203'],
  ['Fernanda Lopes', '(75) 98822-6634'], ['Tiago Reis', '(71) 98650-3381'], ['Aline Santos', '(71) 99144-7720'], ['Marcos Vinícius', '(71) 98203-9915'],
];
const OPERADORA_DO_CLIENTE: Record<string, string> = {
  'Hospital Vale Verde': 'ALGAR', 'Clínica Aurora': 'ALGAR', 'Supermercado Bom Preço': 'ALGAR', 'Distribuidora Norte': 'VC1',
  'Laboratório Exame Certo': 'ALGAR', 'Construtora Horizonte': 'VC1', 'Home Care Viver Bem': 'Vivo', 'Escritório Prado & Lima': 'Vivo',
};

const MOTIVOS_DE_SUBIR: Record<'n2' | 'n3' | 'dev', string[]> = {
  n2: ['Precisa de acesso ao servidor do cliente', 'Mexe no SBC: é do N2', 'O teste básico não resolveu', 'Precisa abrir protocolo com a operadora', 'Configuração avançada da fila'],
  n3: ['O N2 não achou a causa', 'Precisa olhar os logs do Asterisk', 'Problema se repete em mais de um cliente', 'Mexe na infraestrutura do servidor'],
  dev: ['É erro do sistema: precisa de correção', 'Precisa de programação no LineReports', 'Integração com problema de código'],
};
const MOTIVOS_DE_DESCER = ['Era configuração simples, o N1 termina', 'O N2 deixou o passo a passo para o N1 concluir'];
const MOTIVOS_DE_ESPERA = ['Aguardando o cliente testar', 'O cliente vai mandar o print do erro', 'Aguardando o TI do cliente liberar o acesso', 'O cliente só pode depois do expediente'];
const NOTAS_DE_TEMPO = ['Análise e testes com o cliente', 'Configuração no PABX', 'Acesso remoto ao cliente', 'Conversa com a operadora', 'Testes depois da correção'];
const MOTIVOS_DE_REABRIR = ['O cliente disse que voltou a acontecer', 'O cliente testou de novo e não ficou certo'];
const MOTIVOS_DA_PRIORIDADE = ['Centro cirúrgico parado: área crítica', 'A diretoria do cliente pediu urgência', 'Cliente em evento hoje', 'Pode esperar a janela de manutenção'];

/** Quem pega em cada nível (o N1 é do dia a dia; o N3 e o DEV, de quem conhece o servidor). */
const DO_N1: ReadonlyArray<readonly [Pessoa, number]> = [['marina', 4], ['lucio', 4], ['bruno', 1.5], ['luan', 0.5]];
const DO_N2: ReadonlyArray<readonly [Pessoa, number]> = [['lucio', 5], ['bruno', 4], ['luan', 1]];
const DO_N3: ReadonlyArray<readonly [Pessoa, number]> = [['bruno', 5], ['luan', 5]];

/** Os pesos das horas do dia em que chegam os chamados (o robô atende de noite também). */
const HORAS: ReadonlyArray<readonly [number, number]> = [
  [7, 0.5], [8, 4], [9, 9], [10, 10], [11, 8], [12, 4], [13, 6], [14, 8], [15, 8], [16, 7], [17, 5], [18, 1.5], [19, 1], [20, 0.6], [21, 0.4],
];
/**
 * Quantos chegam por dia da semana (0 = domingo), antes da tendência: uns 4 por dia útil, perto dos 100 por mês
 * do painel do Helena (o robô atende no fim de semana também).
 */
const POR_DIA: Record<number, number> = { 0: 0.2, 1: 4.6, 2: 4.2, 3: 4.0, 4: 3.9, 5: 3.4, 6: 0.4 };

// =====================================================================
//  O PLANO
// =====================================================================

export type PedidoDoHistorico = {
  /** o primeiro e o último dia em que chegam chamados (AAAA-MM-DD) */
  de: string; ate: string;
  cal: Calendario;
  /** agora: o chamado que ainda não estaria fechado agora fica de fora (o histórico é todo passado) */
  limite: Date;
  /** quantos exemplos chegam em cada dia: o histórico completa o dia até o normal (sem empilhar) */
  exemplosPorDia?: ReadonlyMap<string, number>;
  semente?: number;
};

const preencher = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? k);
const depois = (de: Date, minutos: number, cal: Calendario) => somarMinutosUteis(de, Math.max(1, Math.round(minutos)), cal);

/**
 * Os chamados de antes dos exemplos, em ordem de chegada. Cada um nasce, é pego, às vezes sobe de nível,
 * espera o cliente ou a operadora, é resolvido (com a solução, a causa e de quem era a falha) e fecha sozinho
 * depois (o relógio do `demo-atendimento.ts` faz essa parte). Os que não terminariam antes do `limite` saem.
 */
export function planoDoHistorico(p: PedidoDoHistorico): ChamadoDoHistorico[] {
  const s = sorteador(p.semente ?? 20261101);
  const cal = p.cal;
  const chaves = Object.keys(MODELOS);
  const pesos = chaves.map((k) => [k, MODELOS[k]!.peso] as const);
  const totalDeDias = Math.max(1, Math.round((Date.parse(`${p.ate}T12:00:00Z`) - Date.parse(`${p.de}T12:00:00Z`)) / 86_400_000));
  // os dias fora da curva: uma queda da operadora (muitos clientes ao mesmo tempo) e o certificado do PABX vencido
  const feriado = new Set(cal.feriados.filter((f) => !f.atende).map((f) => f.data));
  /** o dia útil (segunda a sexta, fora dos feriados) a partir de um dia */
  const util = (dia: string): string => {
    let d = dia;
    while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) || feriado.has(d)) d = somarDias(d, 1);
    return d;
  };
  const diaDaQueda = util(somarDias(p.de, Math.round(totalDeDias * 0.78)));
  const diaDoCertificado = util(somarDias(p.de, Math.round(totalDeDias * 0.42)));
  const recentesDoCliente = new Map<string, Array<{ chave: string; assunto: string; dia: string }>>();
  const out: ChamadoDoHistorico[] = [];
  let n = 0;

  for (let dia = p.de, i = 0; dia <= p.ate; dia = somarDias(dia, 1), i++) {
    const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
    // a tendência: o suporte cresce um pouco a cada mês (o Sobe e desce e o Fechamento têm o que comparar)
    const tendencia = 0.82 + 0.36 * (i / totalDeDias);
    const lambda = Math.max(0, (feriado.has(dia) ? POR_DIA[0]! : POR_DIA[dow]!) * tendencia - (p.exemplosPorDia?.get(dia) ?? 0));
    const chegadas: Array<{ assunto?: string; hora?: number }> = Array.from({ length: s.poisson(lambda) }, () => ({}));
    if (dia === diaDaQueda) for (let k = 0; k < 12; k++) chegadas.push({ assunto: s.chance(0.6) ? 'Operadora - Incidente - Canais' : 'Operadora - Incidente - DID de entrada', hora: s.entre(9, 11) });
    if (dia === diaDoCertificado) for (let k = 0; k < 9; k++) chegadas.push({ assunto: 'LinePBX - Incidente - Certificado', hora: s.entre(8, 10) });

    const doDia: ChamadoDoHistorico[] = [];
    for (const ch of chegadas) {
      const hora = ch.hora ?? s.pesado(HORAS);
      const abre = instanteLocal(dia, `${String(hora).padStart(2, '0')}:${String(s.entre(0, 59)).padStart(2, '0')}`);
      const cliente = s.pesado(CLIENTES);
      // às vezes o cliente volta com o mesmo assunto de umas semanas atrás (o "Voltou com o mesmo problema")
      const recentes = (recentesDoCliente.get(cliente) ?? []).filter((r) => r.dia >= somarDias(dia, -28));
      const volta = !ch.assunto && recentes.length > 0 && s.chance(0.07) ? s.um(recentes) : null;
      const chave = ch.assunto ?? volta?.assunto ?? s.pesado(pesos);
      const plano = planejar(s, cal, { chave, abre, cliente, volta: volta?.chave ?? null, numero: ++n, foraDaCurva: !!ch.assunto });
      if (!plano) continue;
      const ultimo = plano.passos[plano.passos.length - 1]!;
      // o que ainda não estaria fechado agora fica de fora (o histórico é passado: os exemplos são o presente)
      if (somarMinutosUteis(ultimo.em, 3 * 600 + 10, cal).getTime() >= p.limite.getTime()) continue;
      doDia.push(plano);
      recentesDoCliente.set(cliente, [...(recentesDoCliente.get(cliente) ?? []), { chave: plano.chave, assunto: chave, dia }]);
    }
    out.push(...doDia.sort((a, b) => a.abre.getTime() - b.abre.getTime()));
  }
  return out.sort((a, b) => a.abre.getTime() - b.abre.getTime());
}

function planejar(
  s: ReturnType<typeof sorteador>, cal: Calendario,
  o: { chave: string; abre: Date; cliente: string; volta: string | null; numero: number; foraDaCurva: boolean },
): ChamadoDoHistorico | null {
  const m = MODELOS[o.chave];
  if (!m) return null;
  const valores = {
    r: String(s.entre(2001, 2399)), s: s.um(SETORES), u: s.um(UNIDADES), n: String(s.entre(2, 6)),
    d: `(71) 3${s.entre(100, 399)}-${String(s.entre(0, 9999)).padStart(4, '0')}`, h: `${s.entre(8, 16)}h`, dia: `${String(s.entre(1, 28)).padStart(2, '0')}/${String(s.entre(1, 12)).padStart(2, '0')}`,
  };
  const gravidade = s.pesado(m.gravidades);
  // quase tudo chega pelo WhatsApp (o robô do LineChat); o resto, por telefone, aberto por quem atendeu
  const robo = s.chance(0.85);
  const n1 = s.pesado(DO_N1);
  const por: Pessoa = robo ? n1 : s.chance(0.7) ? n1 : 'luan';
  // a prioridade sai da gravidade; às vezes a equipe troca, com o motivo (o centro cirúrgico parado vira Crítica)
  let prioridade: Prioridade | null = null; let motivoPrioridade: string | null = null;
  if (gravidade === 'inoperancia' && o.cliente === 'Hospital Vale Verde' && s.chance(0.45)) { prioridade = 'critica'; motivoPrioridade = MOTIVOS_DA_PRIORIDADE[0]!; }
  else if (gravidade !== 'nao_se_aplica' && s.chance(0.05)) { prioridade = s.chance(0.5) ? 'alta' : 'baixa'; motivoPrioridade = prioridade === 'alta' ? s.um(MOTIVOS_DA_PRIORIDADE.slice(1, 3)) : MOTIVOS_DA_PRIORIDADE[3]!; }
  const urgente = prioridade === 'critica' || (prioridade === null && gravidade === 'inoperancia');
  const pedido = gravidade === 'nao_se_aplica';
  const passos: PassoDoHistorico[] = [];

  // pegar: do robô, a primeira resposta (minutos úteis depois, às vezes bem depois); na tela, quem abriu já atende
  let t = o.abre;
  const espera = urgente ? s.entre(2, 25) : s.chance(0.75) ? s.entre(4, 35) : s.chance(0.7) ? s.entre(35, 120) : s.entre(120, 420);
  t = robo ? depois(t, espera, cal) : new Date(t.getTime() + 60_000);
  passos.push({ faz: 'assumir', em: t, por: n1 });
  let responsavel: Pessoa = n1;
  if (o.volta && s.chance(0.6)) passos.push({ faz: 'repete', em: depois(t, s.entre(3, 15), cal), por: n1, com: o.volta });

  // subir de nível: o N2 (pelo assunto), o N3 e o DEV (poucos)
  const subir: Array<'n2' | 'n3' | 'dev'> = [];
  if (s.chance((m.sobe ?? 0.08) * (o.foraDaCurva ? 0.6 : 1))) {
    subir.push('n2');
    if (s.chance(0.22)) { subir.push('n3'); if (s.chance(0.2)) subir.push('dev'); }
  }
  // o tempo de trabalho em cada nível: o pedido espera mais, o urgente anda mais rápido (a prioridade faz diferença)
  const ritmo = prioridade === 'critica' ? 0.35 : urgente ? 0.6 : 1;
  const trabalho = (nivel: 1 | 2 | 3 | 4) => ritmo * (nivel === 1 ? (pedido ? s.entre(120, 1100) : s.entre(30, 330))
    : nivel === 2 ? s.entre(90, 720) : nivel === 3 ? s.entre(400, 1800) : s.entre(1200, 3600));
  t = depois(t, trabalho(1) * (subir.length ? 0.4 : 1), cal);
  let nivel: 1 | 2 | 3 | 4 = 1;
  for (const para of subir) {
    const quem = para === 'n2' ? s.pesado(DO_N2) : para === 'n3' ? s.pesado(DO_N3) : 'luan';
    passos.push({ faz: 'subir', em: t, por: responsavel, para, motivo: s.um(MOTIVOS_DE_SUBIR[para]), responsavel: quem });
    responsavel = quem;
    nivel = para === 'n2' ? 2 : para === 'n3' ? 3 : 4;
    // às vezes o N2 devolve para o N1 terminar
    if (nivel === 2 && subir.length === 1 && s.chance(0.08)) {
      t = depois(t, s.entre(30, 180), cal);
      const volta = s.pesado(DO_N1);
      passos.push({ faz: 'descer', em: t, por: responsavel, motivo: s.um(MOTIVOS_DE_DESCER), responsavel: volta });
      responsavel = volta; nivel = 1;
    }
    t = depois(t, trabalho(nivel) * (para === subir[subir.length - 1] ? 0.5 : 0.4), cal);
  }

  // a operadora: o protocolo, o prometido e quando ela resolveu (nem sempre no prometido)
  if (m.operadora && (nivel >= 2 || s.chance(0.5))) {
    const prometido = depois(t, s.entre(120, 600), cal);
    passos.push({ faz: 'operadora', em: t, por: responsavel, operadora: OPERADORA_DO_CLIENTE[o.cliente] ?? 'ALGAR', protocolo: String(s.entre(1_000_000, 9_999_999)), prometidoPara: prometido });
    t = depois(t, s.chance(0.7) ? s.entre(60, 540) : s.entre(600, 1500), cal);
    passos.push({ faz: 'fecharProtocolo', em: t, por: responsavel, texto: 'A operadora confirmou a correção.' });
  }
  // esperar o cliente (o prazo para enquanto isso)
  if (s.chance(pedido ? 0.18 : 0.14)) {
    passos.push({ faz: 'esperarCliente', em: t, por: responsavel, motivo: s.um(MOTIVOS_DE_ESPERA) });
    t = depois(t, s.entre(60, 900), cal);
    passos.push({ faz: 'clienteVoltou', em: t, por: responsavel });
  }
  // o tempo lançado (a maioria lança alguma coisa)
  if (s.chance(0.62)) {
    for (let k = 0, quantos = s.entre(1, nivel >= 2 ? 3 : 2); k < quantos; k++) {
      passos.push({ faz: 'tempo', em: t, por: k === 0 ? responsavel : s.pesado(DO_N2), minutos: s.pesado([[15, 3], [20, 2], [30, 4], [45, 3], [60, 2], [90, 1], [120, 1]] as const), nota: s.um(NOTAS_DE_TEMPO) });
    }
  }
  const solucao = s.um(m.solucoes);
  const causa = s.um(m.causas);
  const falha = s.chance(0.9) ? s.pesado(m.falha) : null;
  // alguns passam pela observação (o cliente testa antes de resolver)
  if (!pedido && s.chance(0.12)) {
    passos.push({ faz: 'observacao', em: t, por: responsavel, solucao });
    t = depois(t, s.entre(120, 900), cal);
  }
  t = depois(t, s.entre(5, 40), cal);
  passos.push({ faz: 'resolver', em: t, por: responsavel, solucao, causa, responsabilidade: falha });
  // e uns poucos voltam (reabertos) e são resolvidos de novo
  if (s.chance(0.035)) {
    t = depois(t, s.entre(120, 900), cal);
    passos.push({ faz: 'reabrir', em: t, por: responsavel, motivo: s.um(MOTIVOS_DE_REABRIR) });
    t = depois(t, s.entre(60, 480), cal);
    passos.push({ faz: 'resolver', em: t, por: responsavel, solucao, causa, responsabilidade: falha });
  }

  const titulo = preencher(s.um(m.titulos), valores);
  return {
    chave: `historico-${o.numero}`, abre: o.abre, robo, por,
    titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
    relato: preencher(m.relato, valores), cliente: o.cliente, contato: robo || s.chance(0.5) ? s.um(CONTATOS) : null,
    assunto: o.chave.split(' - ').join(' › '), tipo: m.tipo, gravidade, prioridade, motivoPrioridade,
    produtos: m.produtos ?? [], operadoras: m.operadora ? [OPERADORA_DO_CLIENTE[o.cliente] ?? 'ALGAR'] : [],
    passos,
  };
}
