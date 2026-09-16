/**
 * Documentação viva da API em /api/docs: lista toda operação, com os campos que aceita e devolve.
 * É gerada a partir dos próprios schemas das rotas — se a rota muda, a página muda.
 */
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export default fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Ingline Gestão — API',
        description:
          'Todas as operações do servidor. Cada grupo corresponde a uma área da interface. ' +
          'Para chamar qualquer operação (exceto login) é preciso estar logado; o cookie de sessão é enviado automaticamente pelo navegador.',
        version: '0.1.0',
      },
      tags: [
        { name: 'Sessão', description: 'Entrar, sair, quem sou eu' },
        { name: 'Clientes', description: 'Cadastro de clientes e produtos assinados' },
        { name: 'Circuitos', description: 'Feixes contratados junto às operadoras' },
        { name: 'DIDs', description: 'Numeração: alocar, liberar, criar faixas, editar em massa' },
        { name: 'Inventário', description: 'Modelos, aparelhos e movimentações' },
        { name: 'Painel', description: 'Indicadores e busca global' },
        { name: 'Dados', description: 'Importar e exportar CSV' },
        { name: 'Segredos', description: 'Revelar senhas guardadas (com registro)' },
        { name: 'Administração', description: 'Usuários, papéis, catálogos, auditoria e lixeira' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs', uiConfig: { docExpansion: 'list', deepLinking: true } });
});
