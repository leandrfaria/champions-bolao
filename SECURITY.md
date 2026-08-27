# Segurança e publicação

## O que pode ficar no frontend

O aplicativo React usa somente:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Esses valores são credenciais de cliente e chegam ao navegador por definição. A segurança dos dados não depende de escondê-los; depende de autenticação, grants mínimos e Row Level Security (RLS).

## O que nunca pode ir para o frontend ou GitHub

Nunca inclua em arquivos `VITE_*`, código React ou commits:

- `service_role`
- `sb_secret_*`
- senha do banco/Postgres
- connection strings privadas
- tokens de WhatsApp/Meta
- chaves de backend de terceiros

Segredos futuros devem ficar somente em backend/Edge Functions e em secrets/env vars do ambiente servidor.

## Arquivos de ambiente

O repositório ignora `.env` e todas as variações `.env.*`, exceto `.env.example`.

Para desenvolvimento local:

```bash
cp .env.example .env.local
```

Preencha o `.env.local` localmente. Ele não deve ser commitado.

Na Vercel, configure as variáveis pelo painel do projeto e não envie um `.env` real para o GitHub.

## Segurança do banco

O arquivo `supabase/setup.sql`:

- habilita RLS nas tabelas da aplicação;
- remove acesso do role `anon` às tabelas;
- concede apenas operações necessárias ao role `authenticated`;
- mantém palpites privados até o horário de início da partida;
- não concede ao admin leitura antecipada dos palpites;
- restringe RPCs explicitamente;
- altera privilégios padrão para que novos objetos em `public` não sejam expostos automaticamente.

## Antes de publicar

1. Execute a versão mais recente de `supabase/setup.sql`.
2. Desative `Allow new users to sign up` no Supabase Auth.
3. Mantenha `Allow anonymous sign-ins` desativado.
4. Crie usuários somente em `Authentication > Users`.
5. Rode o Security Advisor do Supabase e revise qualquer alerta.
6. Cadastre as duas variáveis públicas do Supabase na Vercel.


## Fotos de participantes

A v1.4 usa o Supabase Storage para as fotos dos jogadores. O bucket `avatars` é criado como **privado**.

- `anon`: sem leitura e sem escrita.
- `authenticated`: pode ler as imagens do bucket por URL assinada temporária.
- `admin`: pode enviar, substituir e excluir arquivos.
- O banco guarda apenas o caminho do arquivo em `profiles.avatar_path`; não há URL pública permanente.

Se você veio da v1.3, execute `supabase/upgrade-v1.4.sql` para criar a coluna, o bucket e as policies.
