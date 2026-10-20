-- O Comercial (Patch 2.0.1, decisão 0050): a permissão de ver o Comercial (o menu Comercial, os painéis de
-- Vendas e os relatórios de vendas) e o papel do time de vendas. Sem a permissão, os painéis de Vendas não
-- aparecem para ninguém (nem para quem cuida dos chamados); o Administrador ganha ela aqui.
UPDATE "roles"
   SET "permissions" = array_append("permissions", 'sales.read')
 WHERE 'admin.manage' = ANY("permissions") AND NOT ('sales.read' = ANY("permissions"));--> statement-breakpoint
-- O papel Comercial (o mesmo de DEFAULT_ROLES, em @gestor/shared/permissoes): as negociações e os relatórios
-- do Comercial, e a consulta dos clientes e dos chamados. Se já houver um papel com esse nome (criado pela
-- tela), ele fica como está.
INSERT INTO "roles" ("id", "key", "name", "description", "permissions", "is_system")
VALUES ('papel-comercial', 'comercial', 'Comercial',
        'O time de vendas: as negociações e os relatórios do Comercial, e a consulta dos clientes e dos chamados. Sem senhas, sem exclusão.',
        ARRAY['records.read', 'support.read', 'tickets.work', 'sales.read']::text[], true)
ON CONFLICT DO NOTHING;
