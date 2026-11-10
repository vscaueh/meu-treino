# Meu Treino

Aplicação full stack para planejar fichas e acompanhar treinos. Projeto individual dos entregáveis 5 e final de Ambientes de Desenvolvimento de Software.

## Executar localmente

Requer **Node.js 24** ou superior. Não há dependências externas.

```bash
npm install
npm start
```

Abra <http://localhost:3000>, crie uma conta e faça login. Os dados locais ficam no arquivo `data/treinos.sqlite`, excluído do GitHub pelo `.gitignore`.

## Testes

```bash
npm test
```

Os testes cobrem autenticação, proteção das rotas, cadastro de exercícios e fichas, registro e edição de treinos, metas, validação de entradas e isolamento entre usuários.

## O que o sistema faz

1. Cria contas e autentica usuários.
2. Cadastra exercícios e grupos musculares.
3. Cria fichas de treino.
4. Adiciona exercícios às fichas.
5. Registra e edita treinos com séries, repetições, carga e observações.
6. Cria e conclui metas.
7. Mostra o histórico e os indicadores no painel.

O frontend usa HTML, CSS e JavaScript. O backend usa a API HTTP nativa do Node.js. O banco é SQLite. Senhas são armazenadas com `scrypt`; sessões usam cookies HTTP-only. As consultas ao banco são parametrizadas e cada operação consulta o usuário autenticado.

## Publicar na Azure App Service

1. Crie um **Web App** de código com **Node.js 24 LTS** em **Windows**, processo **64 bits**. Escolha o plano de custo compatível com sua assinatura, como Free F1 se disponível.
2. Em **Deployment Center**, conecte este repositório GitHub e a branch `main`.
3. Em **Configuration > Application settings**, defina `NODE_ENV=production` e `WEBSITE_NODE_DEFAULT_VERSION=~24`.
4. Após a publicação, abra a URL `https://<nome-do-app>.azurewebsites.net`, crie uma conta de teste e registre um treino para confirmar a gravação.

O aplicativo usa a porta informada pela Azure em `PORT` e grava o SQLite em `%HOME%/site/wwwroot/App_Data/meu-treino` quando executado no App Service. Também aceita `DATA_DIR` para indicar outro diretório. Faça backup do banco antes de novas publicações. Para uma versão de produção com muitos usuários, migre para um banco gerenciado.

Documentação: [Node.js na Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs) · [Criar Web App Node.js](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs) · [Armazenamento persistente no Windows App Service](https://learn.microsoft.com/en-us/azure/app-service/operating-system-functionality).

