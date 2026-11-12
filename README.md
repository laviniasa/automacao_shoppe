# Ofertas Shopee → WhatsApp

App que busca ofertas pelo Programa de Afiliados da Shopee, mostra o preço antigo riscado e o novo em destaque, e abre o WhatsApp com a mensagem pronta para enviar no grupo.

## Como funciona

- `server.js`: servidor em Node.js (sem dependências). Consulta a Open API de afiliados da Shopee e monta as mensagens.
- `public/index.html`: o app que abre no celular, com a tela de ofertas e a de configurações.

## Configuração

No Render (ou em outro servidor), configure estas variáveis de ambiente:

| Variável | O que é |
|---|---|
| `SHOPEE_APP_ID` | App ID da Open API de afiliados |
| `SHOPEE_APP_SECRET` | App Secret da Open API de afiliados (não coloque no código!) |

Sem essas variáveis, o app roda em **modo demonstração** com ofertas de exemplo.

## Rodar no computador

```bash
SHOPEE_APP_ID=... SHOPEE_APP_SECRET=... node server.js
```

Depois é só abrir http://localhost:3000.
