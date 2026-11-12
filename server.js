// Servidor de ofertas da Shopee (Programa de Afiliados)
// Não precisa instalar nada: só Node.js 18 ou mais novo.
//
// Variáveis de ambiente (configuradas no Render, nunca no código):
//   SHOPEE_APP_ID     -> App ID da afiliada
//   SHOPEE_APP_SECRET -> App Secret da afiliada (chave secreta)
//   PORT              -> o Render preenche sozinho
//
// Sem as chaves, o servidor roda em "modo demonstração" com ofertas de exemplo.

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const APP_ID = process.env.SHOPEE_APP_ID || "";
const APP_SECRET = process.env.SHOPEE_APP_SECRET || "";
const PORT = process.env.PORT || 3000;
const API_URL = "https://open-api.affiliate.shopee.com.br/graphql";
const MODO_DEMO = !APP_ID || !APP_SECRET;

// ---------- Conversa com a Shopee ----------

// Assinatura exigida pela Shopee: SHA256(AppId + Timestamp + Corpo + Secret)
function cabecalhoAutorizacao(corpo) {
  const timestamp = Math.floor(Date.now() / 1000);
  const assinatura = crypto
    .createHash("sha256")
    .update(APP_ID + timestamp + corpo + APP_SECRET)
    .digest("hex");
  return `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${assinatura}`;
}

async function buscarNaShopee({ palavra, pagina, limite }) {
  const query = `
    query Ofertas($keyword: String, $page: Int, $limit: Int, $sortType: Int) {
      productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType) {
        nodes {
          itemId
          productName
          priceMin
          priceMax
          priceDiscountRate
          commissionRate
          imageUrl
          offerLink
          shopName
          sales
          ratingStar
        }
        pageInfo { page limit hasNextPage }
      }
    }`;

  const corpo = JSON.stringify({
    query,
    variables: {
      keyword: palavra || null,
      page: pagina,
      limit: limite,
      sortType: 2, // mais vendidos primeiro
    },
  });

  const resposta = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: cabecalhoAutorizacao(corpo),
    },
    body: corpo,
  });

  const dados = await resposta.json();
  if (dados.errors && dados.errors.length) {
    throw new Error("Shopee respondeu com erro: " + dados.errors.map((e) => e.message).join("; "));
  }
  return dados.data.productOfferV2.nodes || [];
}

// ---------- Transformar em oferta pronta ----------

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

function montarOferta(item) {
  const precoNovo = Number(item.priceMin);
  const desconto = Number(item.priceDiscountRate) || 0;
  // A Shopee informa o preço atual e a % de desconto; o preço antigo é calculado.
  const precoAntigo = desconto > 0 && desconto < 100 ? precoNovo / (1 - desconto / 100) : precoNovo;

  return {
    id: String(item.itemId),
    nome: item.productName,
    imagem: item.imageUrl,
    loja: item.shopName,
    vendidos: Number(item.sales) || 0,
    nota: Number(item.ratingStar) || 0,
    precoAntigo: arredondar(precoAntigo),
    precoNovo: arredondar(precoNovo),
    desconto,
    comissao: Math.round(Number(item.commissionRate) * 1000) / 10, // em %
    link: item.offerLink, // link de afiliada já rastreado
  };
}

function reais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Mensagem no formato do WhatsApp: *negrito* e ~riscado~
function montarMensagem(o) {
  return [
    `🔥 *${o.nome}*`,
    ``,
    `De: ~${reais(o.precoAntigo)}~`,
    `*Por: ${reais(o.precoNovo)}* (${o.desconto}% OFF)`,
    ``,
    `🛒 ${o.link}`,
  ].join("\n");
}

// ---------- Ofertas de exemplo (modo demonstração) ----------

const EXEMPLOS = [
  { itemId: 1, productName: "Fone de Ouvido Bluetooth TWS", priceMin: "39.90", priceDiscountRate: 60, commissionRate: "0.08", imageUrl: "", offerLink: "https://s.shopee.com.br/exemplo1", shopName: "Loja Exemplo", sales: 5321, ratingStar: "4.8" },
  { itemId: 2, productName: "Kit 3 Potes Herméticos de Vidro", priceMin: "49.90", priceDiscountRate: 45, commissionRate: "0.10", imageUrl: "", offerLink: "https://s.shopee.com.br/exemplo2", shopName: "Casa Exemplo", sales: 1830, ratingStar: "4.9" },
  { itemId: 3, productName: "Camiseta Básica Algodão", priceMin: "24.90", priceDiscountRate: 20, commissionRate: "0.12", imageUrl: "", offerLink: "https://s.shopee.com.br/exemplo3", shopName: "Moda Exemplo", sales: 920, ratingStar: "4.6" },
];

// ---------- Rotas do servidor ----------

async function rotaOfertas(url, res) {
  const palavra = url.searchParams.get("palavra") || "";
  const descontoMinimo = Number(url.searchParams.get("descontoMinimo") || 0);
  const limite = Math.min(Number(url.searchParams.get("limite") || 20), 50);
  const pagina = Number(url.searchParams.get("pagina") || 1);

  const itens = MODO_DEMO ? EXEMPLOS : await buscarNaShopee({ palavra, pagina, limite });

  const ofertas = itens
    .map(montarOferta)
    .filter((o) => o.desconto >= descontoMinimo)
    .filter((o) => !palavra || !MODO_DEMO || o.nome.toLowerCase().includes(palavra.toLowerCase()))
    .map((o) => ({ ...o, mensagem: montarMensagem(o) }));

  enviarJson(res, 200, { modoDemo: MODO_DEMO, total: ofertas.length, ofertas });
}

function enviarJson(res, status, dados) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(dados));
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/ofertas") return await rotaOfertas(url, res);
    if (url.pathname === "/api/status") return enviarJson(res, 200, { ok: true, modoDemo: MODO_DEMO });

    // Qualquer outra coisa: entrega o app (index.html)
    const arquivo = path.join(__dirname, "public", "index.html");
    if (fs.existsSync(arquivo)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(arquivo));
    }
    res.writeHead(404);
    res.end("App ainda não foi colocado na pasta public/");
  } catch (erro) {
    console.error(erro);
    enviarJson(res, 500, { erro: erro.message });
  }
});

servidor.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}${MODO_DEMO ? " (modo demonstração, sem chaves)" : ""}`);
});
