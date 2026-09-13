# 0015 — Unidade do cliente no aparelho, e "marcar tudo / desmarcar tudo" em todo filtro

**Contexto.** Um cliente grande não é um endereço só: o Hospital Vale Verde tem a matriz na Ramiro Campelo, a
unidade de Simões Filho e o ambulatório do centro. Saber que o telefone "está no Vale Verde" não basta para achar o
aparelho. Junto disso, os painéis de marcar (Colunas, Produtos, Módulos) só deixavam clicar item por item, e a
"etiqueta interna" do aparelho nunca chegou a ser usada.

**Decisão.**
- O aparelho ganha **Unidade** — texto livre, preenchido na hora de entregar ao cliente (no painel *Movimentar*) ou
  depois, na ficha do aparelho. O campo sugere as unidades já usadas, então a segunda vez que alguém escrever
  "Loja Simões Filho" vai ser escolhendo da lista, não digitando de novo.
- A unidade **só existe enquanto o aparelho está com o cliente**: na devolução ela é apagada junto, porque no estoque
  não há unidade a que pertencer.
- Ela aparece como coluna na lista do inventário e na ficha do cliente, entra na busca (junto com MAC, IP e local
  físico) e dá para ordenar por ela como por qualquer outra coluna.
- **Etiqueta** saiu de todas as telas. A coluna no banco continua lá, vazia, para não perder o que foi importado do
  Nexus; se um dia a etiqueta voltar a fazer sentido, é só voltar a mostrá-la.
- "Onde está" virou **Atribuído a** e "Como" virou **Modalidade**, no inventário e na ficha do cliente.
- Todo painel de marcar passou a ter **tudo** e **nada** no topo, e **marcar/desmarcar grupo** em cada seção. Vale
  para Colunas, Produtos, Módulos e para a lista de permissões dos papéis.

**Consequência.** As peças `lib/colunas.tsx` (colunas escolhidas + painel) e `lib/filtros.tsx` (filtro em botão)
agora são as mesmas em qualquer tela — a lista de clientes deixou de ter cópias locais delas. Qualquer tabela nova
ganha o mesmo comportamento importando essas duas peças.
