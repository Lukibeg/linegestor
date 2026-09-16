# 0011 — A logo do cliente fica no banco, reduzida antes de subir

**Contexto.** Cada cliente pode ter uma logo, que aparece no cartão, na lista e na ficha. Guardar imagens
num sistema publicado em plataforma gerenciada tem uma armadilha: o disco da máquina é apagado a cada
nova versão, então arquivo solto em pasta some sem avisar.

**Decisão.**
- A imagem fica no próprio banco, numa tabela separada (`client_logos`), lida só quando alguém a exibe.
  Assim ela entra no mesmo backup dos dados, sem serviço extra de armazenamento (S3) para contratar e pagar.
- A interface **reduz a imagem no navegador** (no máximo 512 px, PNG, ou JPEG se ficar grande) antes de
  enviar. O servidor recusa qualquer coisa acima de 512 KB e qualquer arquivo que não seja imagem.
- O endereço da imagem carrega a data da última troca (`?v=…`), para o navegador não mostrar a antiga do cache.

**Consequência.** Uma logo pesa alguns KB no banco. Se um dia forem milhares de imagens grandes, muda-se
só o lugar de guardar — quem exibe continua pedindo o mesmo endereço.
