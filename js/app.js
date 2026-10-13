// Interface: login, quadros, cálculos, base normativa e administração.
import * as store from "./store.js";
import { dimensionar, bomParaCSV, TIPOS_QUADRO, TIPOS_EQUIP, PARTIDAS, LEITURAS, PADRAO_QUADRO } from "./dimensionamento.js";
import { CATEGORIAS, BOBINAS } from "./catalogo.js";
import { CALCULADORAS, calcular } from "./calc.js";
import { desenharLayout, LEGENDA_LAYOUT } from "./layout.js";
import { METODOS, REFERENCIAS, CURVAS, LIMITES_QUEDA } from "./normas.js";
import { CV } from "./motores.js";

const $ = (id) => document.getElementById(id);
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, casas = 2) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas }) : "—");
const data = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const clone = (o) => JSON.parse(JSON.stringify(o));
const pares = (o) => (Array.isArray(o) ? o : Object.entries(o ?? {}).map(([k, v]) => ({ k, v: String(v) })));

const S = {
  usuario: null, quadros: [], calculos: [], usuarios: [], aba: "quadros",
  quadro: null, resultado: null, equip: null, equipIndice: null,
  calcId: "cabo", calcValores: {}, filtroHist: "todos", observadores: []
};

function toast(msg, tipo = "") {
  const t = $("toast");
  t.textContent = msg; t.className = `visivel ${tipo}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = ""), 4200);
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
function mostrarTela(id) {
  for (const t of ["telaCarregando", "telaLogin", "telaEspera", "app"]) $(t).hidden = t !== id;
}

function aoSessao({ estado, usuario, erro }) {
  // o próprio cadastro muda (ex.: último acesso) sem alterar a sessão: não reinicia a tela
  const chave = estado === "aprovado" ? `${usuario.uid}|${usuario.role}` : null;
  if (chave && chave === S.sessaoAtiva) { S.usuario = usuario; return; }
  S.sessaoAtiva = chave;
  S.observadores.forEach((parar) => parar());
  S.observadores = [];
  S.usuario = usuario ?? null;
  if (estado === "saiu") return mostrarTela("telaLogin");
  if (estado !== "aprovado") {
    const textos = {
      pendente: ["Aguardando aprovação", `Sua solicitação de acesso (${usuario?.email}) foi enviada ao administrador. Assim que for aprovada, esta página libera o sistema automaticamente.`],
      bloqueado: ["Acesso não liberado", "Seu cadastro foi recusado ou bloqueado pelo administrador. Entre em contato com o setor de Elétrica."],
      erro: ["Não foi possível carregar seu cadastro", erro ?? ""]
    }[estado] ?? ["Acesso indisponível", ""];
    $("esperaTitulo").textContent = textos[0];
    $("esperaTexto").textContent = textos[1];
    return mostrarTela("telaEspera");
  }
  $("usuarioNome").textContent = usuario.nome || usuario.email;
  $("abaAdminBtn").hidden = usuario.role !== "admin";
  mostrarTela("app");
  const erroDados = (m) => toast(m, "erro");
  S.observadores.push(store.observar("quadros", (docs) => {
    S.quadros = docs.sort((a, b) => (b.atualizadoEm ?? "").localeCompare(a.atualizadoEm ?? ""));
    if (!S.quadro) renderQuadros();
    if (S.aba === "calculos") renderHistorico();
  }, erroDados));
  S.observadores.push(store.observar("calculos", (docs) => {
    S.calculos = docs.sort((a, b) => (b.criadoEm ?? "").localeCompare(a.criadoEm ?? ""));
    if (S.aba === "calculos") renderHistorico();
  }, erroDados));
  if (usuario.role === "admin") {
    S.observadores.push(store.observar("usuarios", (docs) => {
      S.usuarios = docs.sort((a, b) => (b.criadoEm ?? "").localeCompare(a.criadoEm ?? ""));
      const pend = docs.filter((u) => u.status === "pendente").length;
      $("badgePendentes").hidden = !pend; $("badgePendentes").textContent = pend;
      if (S.aba === "admin") renderAdmin();
    }, erroDados));
  }
  trocarAba(S.aba === "admin" && usuario.role !== "admin" ? "quadros" : S.aba);
}

function prepararLogin() {
  let modo = "entrar";
  const erro = (m) => { $("loginErro").textContent = m; $("loginErro").hidden = !m; };
  document.querySelectorAll(".abas-login button").forEach((b) => b.addEventListener("click", () => {
    modo = b.dataset.modo;
    document.querySelectorAll(".abas-login button").forEach((x) => x.classList.toggle("ativo", x === b));
    $("campoNome").hidden = modo !== "solicitar"; $("loginNome").required = modo === "solicitar";
    $("loginAviso").hidden = modo !== "solicitar"; $("btnEsqueci").hidden = modo !== "entrar";
    $("loginSenha").autocomplete = modo === "solicitar" ? "new-password" : "current-password";
    $("btnLogin").textContent = modo === "solicitar" ? "Enviar solicitação" : "Entrar";
    erro("");
  }));
  $("formLogin").addEventListener("submit", async (ev) => {
    ev.preventDefault(); erro("");
    $("btnLogin").disabled = true;
    try {
      if (modo === "solicitar") await store.solicitarAcesso($("loginNome").value, $("loginEmail").value, $("loginSenha").value);
      else await store.entrar($("loginEmail").value, $("loginSenha").value);
      $("loginSenha").value = "";
    } catch (e) { erro(store.mensagemErro(e)); }
    $("btnLogin").disabled = false;
  });
  $("btnEsqueci").addEventListener("click", async () => {
    const email = $("loginEmail").value;
    if (!email) return erro("Informe o e-mail para receber o link de redefinição.");
    try { await store.redefinirSenha(email); erro(""); toast("Enviamos um link de redefinição para o seu e-mail."); }
    catch (e) { erro(store.mensagemErro(e)); }
  });
  $("btnSair").addEventListener("click", () => store.sair());
  $("btnSairEspera").addEventListener("click", () => store.sair());
}

function trocarAba(aba) {
  S.aba = aba;
  document.querySelectorAll("#abas button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === aba));
  for (const a of ["quadros", "calculos", "base", "admin"]) $(`aba-${a}`).hidden = a !== aba;
  ({ quadros: renderQuadros, calculos: renderCalculos, base: renderBase, admin: renderAdmin })[aba]();
}

// ---------------------------------------------------------------------------
// Componentes de formulário
// ---------------------------------------------------------------------------
const opcoes = (lista, valor) => lista.map(([v, t]) => `<option value="${h(v)}"${String(v) === String(valor) ? " selected" : ""}>${h(t)}</option>`).join("");
const campo = (rotulo, html, classe = "") => `<label class="campo ${classe}"><span>${rotulo}</span>${html}</label>`;
const entrada = (attr, valor, tipo = "text", extra = "") => `<input type="${tipo}" ${attr} value="${h(valor ?? "")}" ${extra}>`;
const numero = (attr, valor, extra = "") => entrada(attr, valor, "number", `step="any" min="0" inputmode="decimal" ${extra}`);
const marca = (attr, valor, rotulo) => `<label class="marca"><input type="checkbox" ${attr}${valor ? " checked" : ""}> ${rotulo}</label>`;

function lerCampo(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number") return el.value === "" ? "" : Number(el.value);
  return el.tagName === "SELECT" && /^-?\d+(\.\d+)?$/.test(el.value) ? Number(el.value) : el.value;
}

// ---------------------------------------------------------------------------
// Aba Quadros — lista
// ---------------------------------------------------------------------------
function renderQuadros() {
  const sec = $("aba-quadros");
  if (S.quadro) { sec.innerHTML = htmlEditor(); return; }
  const cartoes = S.quadros.map((q) => `
    <button type="button" class="cartao quadro-card" data-acao="abrir" data-id="${h(q.id)}">
      <span class="etiqueta">${h(q.tensao)} V</span>
      <strong>${h(q.nome || "Sem nome")}</strong>
      <span class="sub">${h(TIPOS_QUADRO[q.tipo]?.rotulo ?? q.tipo)}</span>
      <span class="linha-info">${q.resumo ? `${q.resumo.correnteTotal ? `${fmt(q.resumo.correnteTotal, 1)} A · ` : ""}${h(q.resumo.caixa)} · ${q.resumo.itens} itens` : "Rascunho — lista ainda não gerada"}</span>
      <span class="sub">Atualizado em ${data(q.atualizadoEm)}${q.criadoPor ? ` · ${h(q.criadoPor)}` : ""}</span>
    </button>`).join("");
  sec.innerHTML = `
    <div class="barra">
      <h2>Quadros</h2><span class="espaco"></span>
      <button type="button" class="btn btn-primario" data-acao="novo">+ Novo quadro</button>
    </div>
    ${S.quadros.length ? `<div class="grade-cartoes">${cartoes}</div>` : `<div class="cartao vazio"><p>Nenhum quadro cadastrado ainda.</p><p class="sub">Crie um quadro, adicione os equipamentos e gere a lista de materiais.</p></div>`}`;
}

// ---------------------------------------------------------------------------
// Aba Quadros — editor
// ---------------------------------------------------------------------------
function htmlEditor() {
  const q = S.quadro, cfg = TIPOS_QUADRO[q.tipo];
  const tensoes = [[220, "220 V — trifásico"], [380, "380 V — trifásico"], [440, "440 V — trifásico"]];
  const dados = [
    campo("Nome / TAG do quadro", entrada('data-campo="nome"', q.nome, "text", 'placeholder="QFAC-01" required'), "largo"),
    campo("Tensão de alimentação", `<select data-campo="tensao">${opcoes(tensoes, q.tensao)}</select>`),
    campo("Tipo de quadro", `<select data-campo="tipo" data-rerender>${opcoes(Object.entries(TIPOS_QUADRO).map(([k, v]) => [k, v.rotulo]), q.tipo)}</select>`, "largo"),
    cfg.comando || cfg.automacao ? campo("Tensão de comando / bobinas", `<select data-campo="tensaoComando">${opcoes(Object.entries(BOBINAS), q.tensaoComando)}</select>`) : "",
    cfg.porQuantidade ? campo(q.tipo === "remoto" ? "Quantidade de pontos / cargas" : "Quantidade de dispositivos", numero('data-campo="quantity"', q.quantity, 'min="1" step="1"')) : "",
    cfg.potencia ? campo("Distância do alimentador até o quadro (m)", numero('data-campo="distanciaAlimentador"', q.distanciaAlimentador)) : ""
  ].join("");
  const opcionais = [
    cfg.potencia ? marca('data-campo="dps"', q.dps, "DPS na entrada (NBR 5410 6.3.5 / NBR 5419)") : "",
    cfg.automacao ? marca('data-campo="hasIhm" data-rerender', q.hasIhm, "IHM na porta") : "",
    cfg.automacao && q.hasIhm ? `<select data-campo="ihmSize" aria-label="Tamanho da IHM">${opcoes([['4.3"', '4,3"'], ['7"', '7"'], ['10"', '10"'], ['15"', '15"']], q.ihmSize)}</select>` : "",
    cfg.automacao ? marca('data-campo="hasSupervisorio"', q.hasSupervisorio, "Supervisório (Modbus / BACnet)") : ""
  ].join("");
  const criterios = cfg.potencia ? `
    <details class="criterios">
      <summary>Critérios de instalação dos cabos de campo (NBR 5410)</summary>
      <div class="grade">
        ${campo("Método de instalação", `<select data-campo="metodo">${opcoes(Object.entries(METODOS), q.metodo)}</select>`, "largo")}
        ${campo("Isolação", `<select data-campo="isolacao">${opcoes([["PVC", "PVC 70 °C"], ["EPR", "EPR / XLPE 90 °C"]], q.isolacao)}</select>`)}
        ${campo("Temperatura ambiente (°C)", numero('data-campo="tempAmbiente"', q.tempAmbiente))}
        ${campo("Circuitos agrupados no mesmo conduto", numero('data-campo="agrupamento"', q.agrupamento, 'min="1" step="1"'))}
        ${campo("Queda de tensão máxima", `<select data-campo="quedaMax">${opcoes(LIMITES_QUEDA.map((l) => [l.valor, l.rotulo]), q.quedaMax)}</select>`)}
        ${campo("Fator de serviço dos motores", numero('data-campo="fatorServico"', q.fatorServico))}
        ${campo("Fator de demanda / simultaneidade (%)", numero('data-campo="fatorDemanda"', q.fatorDemanda, 'max="100"'))}
        ${campo("Reserva de espaço na placa (%)", numero('data-campo="reserva"', q.reserva, 'max="50"'))}
      </div>
    </details>` : `
    <details class="criterios"><summary>Dimensionamento da caixa</summary>
      <div class="grade">${campo("Reserva de espaço na placa (%)", numero('data-campo="reserva"', q.reserva, 'max="50"'))}</div>
    </details>`;

  const linhasEquip = q.equipamentos.map((e, i) => `
    <tr>
      <td><strong>${h(e.nome)}</strong></td>
      <td>${h(TIPOS_EQUIP[e.tipo]?.rotulo.split(/ — | \(/)[0] ?? e.tipo)}</td>
      <td class="num">${descPotencia(e)}</td>
      <td>${h(TIPOS_EQUIP[e.tipo]?.partidas ? PARTIDAS[e.partida] ?? "—" : "—")}</td>
      <td class="num">${e.distancia ? `${fmt(e.distancia)} m` : "—"}</td>
      <td class="sub">${h(descExtras(e))}</td>
      <td class="acoes">
        <button type="button" class="btn btn-pequeno" data-acao="editar-equip" data-i="${i}">Editar</button>
        <button type="button" class="btn btn-pequeno" data-acao="duplicar-equip" data-i="${i}" title="Duplicar">⧉</button>
        <button type="button" class="btn btn-pequeno btn-perigo" data-acao="remover-equip" data-i="${i}" title="Remover">✕</button>
      </td>
    </tr>`).join("");
  const equipamentos = cfg.porQuantidade ? "" : `
    <div class="cartao">
      <div class="barra"><h3>2. Equipamentos</h3><span class="espaco"></span>
        <button type="button" class="btn btn-primario" data-acao="novo-equip">+ Adicionar equipamento</button></div>
      ${q.equipamentos.length ? `<div class="tabela-rolagem"><table>
        <thead><tr><th>TAG</th><th>Tipo</th><th class="num">Potência</th><th>Partida</th><th class="num">Distância</th><th>Detalhes</th><th></th></tr></thead>
        <tbody>${linhasEquip}</tbody></table></div>` : `<p class="vazio sub">Adicione os equipamentos alimentados ou controlados por este quadro.</p>`}
    </div>`;

  return `
    <div class="barra nao-imprimir">
      <button type="button" class="btn" data-acao="voltar">← Quadros</button>
      <h2>${q.id ? h(q.nome || "Quadro") : "Novo quadro"}</h2><span class="espaco"></span>
      ${q.id ? `<button type="button" class="btn btn-perigo" data-acao="excluir-quadro">Excluir</button>` : ""}
      <button type="button" class="btn" data-acao="salvar-quadro">Salvar rascunho</button>
      <button type="button" class="btn btn-primario" data-acao="gerar">Gerar lista de materiais</button>
    </div>
    <div class="cartao nao-imprimir">
      <h3>1. Dados do painel</h3>
      <div class="grade">${dados}</div>
      ${opcionais ? `<div class="marcas">${opcionais}</div>` : ""}
      ${criterios}
    </div>
    <div class="nao-imprimir">${equipamentos}</div>
    <div id="resultado">${S.resultado ? htmlResultado() : ""}</div>`;
}

function descPotencia(e) {
  if (e.tipo === "VRF") return `${String(e.condensadoras ?? "").trim() || "—"} kW`;
  if (e.tipo === "FANCOLETE") return `${e.fancoleteQty || 1} × 200 W`;
  if (!e.potencia) return "—";
  return e.unidadePot === "cv" ? `${fmt(e.potencia / CV, 2)} cv (${fmt(e.potencia)} kW)` : `${fmt(e.potencia)} kW`;
}

function descExtras(e) {
  const x = [];
  if (e.correntePlaca) x.push(`placa ${fmt(e.correntePlaca)} A`);
  if (e.tipo === "UTA" && e.hasHeating) x.push(`aquecimento ${fmt(e.heatingPower)} kW (${e.heatingType === "scr" ? "SCR" : `${e.heatingStages || 1} estágio(s)`})`);
  if (e.tipo === "UTA" && e.hasHumid) x.push(`umidificador ${fmt(e.humidPower)} kW`);
  if (e.tipo === "VRF" && e.evaporadoras) x.push(`${e.evaporadoras} evaporadoras`);
  if (e.tipo === "SPLITAO" && e.condensadoras) x.push(`cond.: ${e.condensadoras} kW`);
  if (e.tipo === "SPLIT") x.push(e.splitPhase === "tri" ? "trifásico" : "monofásico 220 V");
  if (e.tipo === "CARGA" && e.fases === "mono") x.push("monofásico 220 V");
  if (e.leituras?.length) x.push(`${e.leituras.length} leitura(s)`);
  return x.join(" · ");
}

function htmlResultado() {
  const r = S.resultado, q = S.quadro, s = r.resumo;
  const cartoes = [
    ["Tensão", `${s.tensao} V`], ["Corrente total", s.correnteTotal ? `${fmt(s.correnteTotal, 1)} A` : "—"], ["Potência instalada", s.potenciaTotal ? `${fmt(s.potenciaTotal, 1)} kW` : "—"],
    ["Caixa", s.caixa], ["Dimensões (A × L × P)", s.dimensoes], ["Itens na lista", s.itens]
  ].map(([t, v]) => `<div class="indicador"><span>${t}</span><strong>${h(v)}</strong></div>`).join("");

  const cargas = r.cargas.map((c) => `<tr>
    <td><strong>${h(c.nome)}</strong>${c.qtd > 1 ? ` <span class="sub">× ${c.qtd}</span>` : ""}</td>
    <td>${{ motor: "Motor", resistiva: "Resistência", carga: "Carga" }[c.natureza]}</td>
    <td class="num">${fmt(c.kW)}${c.natureza === "motor" ? ` <span class="sub">(${fmt(c.cv, 1)} cv)</span>` : ""}</td>
    <td class="num">${fmt(c.corrente)}</td><td>${h(PARTIDAS[c.partida] ?? "—")}</td>
    <td>${h(c.protecao)}</td><td>${h(c.acionamento)}</td>
    <td class="num">${c.cabo ? fmt(c.cabo) : "—"}</td><td class="num">${c.cabo ? fmt(c.queda) : "—"}</td></tr>`).join("");

  let grupo = "";
  const bom = r.bom.map((i) => {
    const cab = i.grupo !== grupo ? `<tr class="grupo"><th colspan="7">${h((grupo = i.grupo))}</th></tr>` : "";
    return `${cab}<tr><td>${h(i.tag)}</td><td><strong>${h(i.modelo)}</strong></td><td>${h(i.descricao)}</td>
      <td class="num">${fmt(i.qtd)}</td><td>${h(i.un)}</td><td>${h(i.fabricante)}</td><td class="sub">${h(i.just)}</td></tr>`;
  }).join("");

  const memorial = r.memorial.map((m) => `<details><summary>${h(m.titulo)}</summary>
    <div class="memo"><div><h5>Entradas</h5>${tabelaPares(m.entradas)}</div><div><h5>Resultados</h5>${tabelaPares(m.resultados)}</div></div>
    <p class="sub">Referência: ${h(m.norma)}</p></details>`).join("");

  return `
    <div class="cartao resultado">
      <div class="barra"><h3>Resumo geral — ${h(s.nome)}</h3><span class="espaco"></span>
        <span class="nao-imprimir acoes">
          <button type="button" class="btn btn-pequeno" data-acao="linhas">Linhas de produto</button>
          <button type="button" class="btn btn-pequeno" data-acao="csv">Exportar CSV</button>
          <button type="button" class="btn btn-pequeno" data-acao="imprimir">Imprimir / PDF</button>
        </span></div>
      <p class="sub">${h(s.tipo)}${q.geradoEm ? ` · gerado em ${data(q.geradoEm)}` : ""}</p>
      <div class="indicadores">${cartoes}</div>
      ${r.avisos.length ? `<ul class="avisos">${r.avisos.map((a) => `<li>${h(a)}</li>`).join("")}</ul>` : ""}
    </div>
    ${r.cargas.length ? `<div class="cartao"><h3>Tabela de cargas</h3><div class="tabela-rolagem"><table>
      <thead><tr><th>TAG</th><th>Tipo</th><th class="num">kW</th><th class="num">In (A)</th><th>Partida</th><th>Proteção</th><th>Acionamento</th><th class="num">Cabo (mm²)</th><th class="num">Queda (%)</th></tr></thead>
      <tbody>${cargas}</tbody></table></div>
      <p class="sub">Cabos de campo pela ${h(REFERENCIAS.ampacidade)} e ${h(REFERENCIAS.queda)}; seção mínima de 2,5 mm² para circuitos de força.</p></div>` : ""}
    <div class="cartao"><h3>Lista de materiais</h3><div class="tabela-rolagem"><table class="bom">
      <thead><tr><th>TAG</th><th>Modelo</th><th>Descrição</th><th class="num">Qtd</th><th>Un</th><th>Fabricante</th><th>Justificativa técnica</th></tr></thead>
      <tbody>${bom}</tbody></table></div></div>
    <div class="cartao"><h3>Proteções e automação</h3>
      <dl class="definicoes">${r.protecoes.map(([t, v]) => `<div><dt>${h(t)}</dt><dd>${h(v)}</dd></div>`).join("")}</dl></div>
    <div class="cartao"><h3>Layout do quadro montado</h3>
      <p class="sub">Pré-dimensionamento em escala, com as dimensões de catálogo dos componentes. O detalhamento final é feito no projeto executivo.</p>
      <div class="layout-area">${desenharLayout(r.layout)}</div>
      <ul class="legenda">${LEGENDA_LAYOUT.map((l) => `<li><i style="background:${l.cor}"></i>${h(l.texto)}</li>`).join("")}</ul></div>
    <div class="cartao"><h3>Memorial de cálculo</h3>
      <p class="sub">Cada cálculo abaixo também fica registrado na aba Cálculos, vinculado a este quadro.</p>${memorial}</div>
    <p class="sub rodape-tecnico">Resultado de pré-dimensionamento. A especificação final deve ser conferida e validada pelo responsável técnico, com as normas vigentes e os catálogos atualizados dos fabricantes.</p>`;
}

const tabelaPares = (o) => `<table class="pares"><tbody>${pares(o).map(({ k, v }) => `<tr><th>${h(k)}</th><td>${h(v)}</td></tr>`).join("")}</tbody></table>`;

function novoQuadro() {
  S.quadro = clone(PADRAO_QUADRO); S.resultado = null; renderQuadros();
}

function abrirQuadro(id) {
  const q = S.quadros.find((x) => x.id === id);
  if (!q) return;
  S.quadro = { ...clone(PADRAO_QUADRO), ...clone(q) };
  S.resultado = q.geradoEm ? dimensionar(S.quadro) : null;
  renderQuadros(); window.scrollTo(0, 0);
}

function validarQuadro() {
  const q = S.quadro, cfg = TIPOS_QUADRO[q.tipo];
  if (!q.nome?.trim()) return "Informe o nome / TAG do quadro.";
  if (!cfg.porQuantidade && !q.equipamentos.length) return "Adicione ao menos um equipamento.";
  return "";
}

async function persistirQuadro(resultado) {
  const q = S.quadro;
  const doc = { ...q, criadoPor: q.criadoPor ?? S.usuario.email, criadoEm: q.criadoEm ?? store.agora() };
  if (resultado) {
    doc.geradoEm = store.agora();
    doc.resumo = resultado.resumo;
    doc.memorial = resultado.memorial.map((m) => ({ ...m, entradas: pares(m.entradas), resultados: pares(m.resultados) }));
  }
  const id = await store.salvar("quadros", q.id ?? null, doc);
  S.quadro = { ...doc, id };
}

async function gerarLista(linhas) {
  S.quadro.linhas = linhas;
  S.resultado = dimensionar(S.quadro);
  try { await persistirQuadro(S.resultado); toast("Lista de materiais gerada e salva."); }
  catch (e) { toast(`Lista gerada, mas não foi salva: ${store.mensagemErro(e)}`, "erro"); }
  renderQuadros();
  $("resultado").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Passo final da geração: o usuário define a linha de produto de cada tipo de peça.
function abrirLinhas() {
  const erro = validarQuadro();
  if (erro) return toast(erro, "erro");
  const previa = dimensionar(S.quadro);
  const dlg = $("dlgLinhas");
  dlg.innerHTML = `<form method="dialog">
    <h3>Linhas de produto</h3>
    <p class="sub">Defina a linha de cada tipo de peça usada neste quadro. Os modelos são selecionados nos catálogos da Base de Consulta conforme as correntes calculadas.</p>
    <div class="grade uma">${previa.categoriasUsadas.map((k) => campo(CATEGORIAS[k].rotulo, `<select data-linha="${k}">${opcoes(CATEGORIAS[k].opcoes, previa.linhas[k])}</select>`)).join("")}</div>
    <menu><button type="submit" value="cancelar" class="btn">Cancelar</button><button type="submit" value="ok" class="btn btn-primario">Gerar lista</button></menu>
  </form>`;
  dlg.onclose = () => {
    if (dlg.returnValue !== "ok") return;
    const linhas = { ...S.quadro.linhas };
    dlg.querySelectorAll("[data-linha]").forEach((s) => (linhas[s.dataset.linha] = s.value));
    gerarLista(linhas);
  };
  dlg.returnValue = "";
  dlg.showModal();
}

// ---------------------------------------------------------------------------
// Diálogo de equipamento
// ---------------------------------------------------------------------------
function abrirEquip(indice) {
  S.equipIndice = indice;
  S.equip = indice == null
    ? { tipo: "EXCV", nome: "", potencia: "", unidadePot: "cv", partida: "direta", distancia: "", leituras: [], heatingType: "estagios", heatingStages: 1, humidType: "onoff", valvula: "direta", splitPhase: "mono", fases: "tri" }
    : clone(S.quadro.equipamentos[indice]);
  renderEquip();
  $("dlgEquip").showModal();
}

function renderEquip() {
  const e = S.equip, t = TIPOS_EQUIP[e.tipo], cfg = TIPOS_QUADRO[S.quadro.tipo], V = S.quadro.tensao;
  const temPotencia = !["VRF", "FANCOLETE"].includes(e.tipo);
  const motor = Boolean(t.partidas);
  if (motor && !t.partidas.includes(e.partida)) e.partida = t.partidas[0];
  const valorPot = e.potencia === "" || e.potencia == null ? "" : e.unidadePot === "cv" ? +(e.potencia / CV).toFixed(3) : e.potencia;
  const alimentacao = e.tipo === "SPLIT"
    ? `<select data-e="splitPhase">${opcoes([["mono", "Monofásico / bifásico 220 V"], ["tri", `Trifásico ${V} V`]], e.splitPhase)}</select>`
    : e.tipo === "CARGA"
      ? `<select data-e="fases">${opcoes([["tri", `Trifásico ${V} V`], ["mono", "Monofásico / bifásico 220 V"]], e.fases)}</select>`
      : `<input type="text" value="${["FANCOLETE"].includes(e.tipo) ? "Bifásico 220 V" : `Trifásico ${V} V (tensão do quadro)`}" disabled>`;
  const campos = [
    campo("Tipo de equipamento", `<select data-e="tipo" data-rerender>${opcoes(Object.entries(TIPOS_EQUIP).map(([k, v]) => [k, v.rotulo]), e.tipo)}</select>`, "largo"),
    campo("Nome / TAG", entrada('data-e="nome"', e.nome, "text", 'placeholder="EX-01" required')),
    campo("Tensão de alimentação", alimentacao),
    temPotencia ? campo(e.tipo === "UTA" || e.tipo === "SPLITAO" ? "Potência do motor do ventilador" : "Potência", `<span class="composto">${numero('data-e="potenciaValor"', valorPot, "required")}<select data-e="unidadePot">${opcoes([["cv", "cv"], ["kW", "kW"]], e.unidadePot ?? "kW")}</select></span>`) : "",
    motor ? campo("Tipo de partida", `<select data-e="partida">${opcoes(t.partidas.map((p) => [p, PARTIDAS[p]]), e.partida)}</select>`) : "",
    campo("Distância do quadro (m)", numero('data-e="distancia"', e.distancia)),
    temPotencia ? campo("Corrente de placa (A) — opcional", numero('data-e="correntePlaca"', e.correntePlaca, 'placeholder="prevalece sobre o cálculo"')) : "",
    e.tipo === "VRF" || e.tipo === "SPLITAO" ? campo("Potências das condensadoras (kW), separadas por ;", entrada('data-e="condensadoras"', e.condensadoras, "text", 'placeholder="12; 14; 16"'), "largo") : "",
    e.tipo === "VRF" ? campo("Quantidade de evaporadoras (200 W cada)", numero('data-e="evaporadoras"', e.evaporadoras, 'step="1"')) : "",
    e.tipo === "FANCOLETE" ? campo("Quantidade de fancoletes (200 W cada)", numero('data-e="fancoleteQty"', e.fancoleteQty ?? 1, 'min="1" step="1"')) : ""
  ].join("");
  const uta = e.tipo !== "UTA" ? "" : `
    <fieldset><legend>Aquecimento, umidificação e válvula</legend>
      <div class="marcas">${marca('data-e="hasHeating" data-rerender', e.hasHeating, "Resistência de aquecimento")}${marca('data-e="hasHumid" data-rerender', e.hasHumid, "Umidificador")}</div>
      <div class="grade">
        ${e.hasHeating ? campo("Potência do aquecimento (kW)", numero('data-e="heatingPower"', e.heatingPower)) + campo("Controle do aquecimento", `<select data-e="heatingType" data-rerender>${opcoes([["estagios", "Estágios (contatores)"], ["scr", "Proporcional (SCR)"]], e.heatingType)}</select>`) + (e.heatingType !== "scr" ? campo("Número de estágios", numero('data-e="heatingStages"', e.heatingStages ?? 1, 'min="1" step="1"')) : "") : ""}
        ${e.hasHumid ? campo("Potência do umidificador (kW)", numero('data-e="humidPower"', e.humidPower)) + campo("Controle do umidificador", `<select data-e="humidType">${opcoes([["onoff", "On-Off"], ["prop", "Proporcional"]], e.humidType)}</select>`) : ""}
        ${campo("Válvula de água / expansão", `<select data-e="valvula">${opcoes([["direta", "Direta"], ["indireta", "Indireta — proporcional 0-10 V"]], e.valvula)}</select>`)}
      </div>
    </fieldset>`;
  const leituras = cfg.automacao && t.leituras ? `
    <fieldset><legend>Leituras de automação</legend>
      <div class="marcas">${t.leituras.map((l) => marca(`data-leitura="${l}"`, e.leituras?.includes(l), LEITURAS[l][0])).join("")}</div>
    </fieldset>` : "";
  $("dlgEquip").innerHTML = `<form id="formEquip">
    <h3>${S.equipIndice == null ? "Adicionar equipamento" : "Editar equipamento"}</h3>
    <div class="grade">${campos}</div>${uta}${leituras}
    <menu><button type="button" class="btn" data-acao="cancelar-equip">Cancelar</button><button type="submit" class="btn btn-primario">${S.equipIndice == null ? "Adicionar" : "Salvar"}</button></menu>
  </form>`;
}

function coletarEquip() {
  const e = S.equip;
  $("dlgEquip").querySelectorAll("[data-e]").forEach((el) => {
    const v = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
    e[el.dataset.e] = v;
  });
  const leit = $("dlgEquip").querySelectorAll("[data-leitura]");
  if (leit.length) e.leituras = [...leit].filter((x) => x.checked).map((x) => x.dataset.leitura);
  if ("potenciaValor" in e) {
    e.potencia = e.potenciaValor === "" ? "" : +(e.potenciaValor * (e.unidadePot === "cv" ? CV : 1)).toFixed(4);
    delete e.potenciaValor;
  }
}

// ---------------------------------------------------------------------------
// Aba Cálculos
// ---------------------------------------------------------------------------
function renderCalculos() {
  const c = CALCULADORAS.find((x) => x.id === S.calcId);
  const valores = (S.calcValores[c.id] ??= Object.fromEntries(c.campos.map((f) => [f.id, f.padrao])));
  const campos = c.campos.map((f) => campo(
    f.rotulo + (f.unidade ? ` <em>(${h(f.unidade)})</em>` : ""),
    f.tipo === "sel" ? `<select data-calc="${f.id}">${opcoes(f.opcoes, valores[f.id])}</select>` : numero(`data-calc="${f.id}"`, valores[f.id], f.passo ? `step="${f.passo}"` : ""),
    f.largo ? "largo" : "")).join("");
  $("aba-calculos").innerHTML = `
    <div class="calc-layout">
      <nav class="calc-menu" aria-label="Calculadoras">
        ${CALCULADORAS.map((x) => `<button type="button" data-acao="calc" data-id="${x.id}" class="${x.id === c.id ? "ativo" : ""}">${h(x.nome)}</button>`).join("")}
      </nav>
      <div class="calc-corpo">
        <div class="cartao">
          <h2>${h(c.nome)}</h2><p class="sub">${h(c.descricao)}</p>
          <form id="formCalc" class="grade" onsubmit="return false">${campos}</form>
          <div id="calcResultado"></div>
          <div class="salvar-calc">
            ${campo("Descrição (opcional)", entrada('id="calcDescricao"', "", "text", 'placeholder="Ex.: alimentador da bomba BAG-02"'), "largo")}
            ${campo("Vincular a", `<select id="calcQuadro"><option value="">Cálculo avulso</option>${S.quadros.map((q) => `<option value="${h(q.id)}">${h(q.nome)}</option>`).join("")}</select>`)}
            <button type="button" class="btn btn-primario" data-acao="salvar-calc">Salvar no histórico</button>
          </div>
        </div>
        <div class="cartao">
          <div class="barra"><h3>Histórico de cálculos</h3><span class="espaco"></span>
            <select id="filtroHist" aria-label="Filtrar histórico"></select></div>
          <div id="historico"></div>
        </div>
      </div>
    </div>`;
  renderResultadoCalc();
  renderHistorico();
}

function renderResultadoCalc() {
  const c = CALCULADORAS.find((x) => x.id === S.calcId);
  let r;
  try { r = calcular(c.id, S.calcValores[c.id]); } catch (e) { r = { linhas: [], alertas: ["Verifique os valores informados."], passos: [] }; }
  S.calcAtual = r;
  $("calcResultado").innerHTML = `
    <div class="resultado-calc">
      ${r.linhas.length ? `<table class="pares">${r.linhas.map(([k, v, d]) => `<tr class="${d ? "destaque" : ""}"><th>${h(k)}</th><td>${h(v)}</td></tr>`).join("")}</table>` : ""}
      ${r.alertas.map((a) => `<p class="alerta">${h(a)}</p>`).join("")}
      ${r.passos.length ? `<p class="sub passos">${r.passos.map(h).join("<br>")}</p>` : ""}
      <p class="sub">Referência: ${h(c.norma)}</p>
    </div>`;
}

function renderHistorico() {
  if (!$("historico")) return;
  const doQuadro = S.quadros.flatMap((q) => (q.memorial ?? []).map((m) => ({ ...m, origem: "quadro", quadroId: q.id, quadroNome: q.nome, quando: q.geradoEm })));
  const salvos = S.calculos.map((c) => ({ ...c, origem: c.quadroId ? "vinculado" : "avulso", quadroNome: S.quadros.find((q) => q.id === c.quadroId)?.nome, quando: c.criadoEm }));
  const filtro = $("filtroHist");
  filtro.innerHTML = opcoes([["todos", "Todos"], ["avulsos", "Somente avulsos"], ...S.quadros.map((q) => [q.id, `Quadro ${q.nome}`])], S.filtroHist);
  const itens = [...salvos, ...doQuadro].filter((i) => S.filtroHist === "todos" || (S.filtroHist === "avulsos" ? i.origem === "avulso" : i.quadroId === S.filtroHist))
    .sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? "")).slice(0, 300);
  $("historico").innerHTML = itens.length ? itens.map((i) => `
    <details><summary><span>${h(i.titulo)}</span>
      <span class="etiqueta ${i.origem}">${i.origem === "avulso" ? "Avulso" : h(i.quadroNome ?? "Quadro")}${i.origem === "quadro" ? " · automático" : ""}</span>
      <span class="sub">${data(i.quando)}</span></summary>
      <div class="memo"><div><h5>Entradas</h5>${tabelaPares(i.entradas)}</div><div><h5>Resultados</h5>${tabelaPares(i.resultados)}</div></div>
      <p class="sub">Referência: ${h(i.norma ?? "—")}${i.criadoPor ? ` · por ${h(i.criadoPor)}` : ""}
        ${i.origem !== "quadro" ? ` <button type="button" class="btn-link perigo" data-acao="excluir-calc" data-id="${h(i.id)}">Excluir</button>` : ""}</p>
    </details>`).join("") : `<p class="vazio sub">Nenhum cálculo registrado neste filtro.</p>`;
}

async function salvarCalculo() {
  const c = CALCULADORAS.find((x) => x.id === S.calcId), r = S.calcAtual;
  if (!r?.linhas.length) return toast("Não há resultado para salvar.", "erro");
  const rotulos = Object.fromEntries(c.campos.map((f) => [f.id, f]));
  const entradas = Object.entries(r.valores).map(([k, v]) => {
    const f = rotulos[k];
    const texto = f.tipo === "sel" ? f.opcoes.find(([o]) => String(o) === String(v))?.[1] ?? v : `${fmt(v, 3)}${f.unidade ? " " + f.unidade : ""}`;
    return { k: f.rotulo, v: String(texto) };
  });
  const descricao = $("calcDescricao").value.trim();
  try {
    await store.salvar("calculos", null, {
      tipo: c.id, titulo: descricao ? `${c.nome} — ${descricao}` : c.nome, norma: c.norma, entradas,
      resultados: r.linhas.map(([k, v]) => ({ k, v: String(v) })), quadroId: $("calcQuadro").value || null,
      criadoPor: S.usuario.email, criadoEm: store.agora()
    });
    $("calcDescricao").value = "";
    toast("Cálculo salvo no histórico.");
  } catch (e) { toast(store.mensagemErro(e), "erro"); }
}

// ---------------------------------------------------------------------------
// Aba Normas e base
// ---------------------------------------------------------------------------
function renderBase() {
  const normas = [
    ["ABNT NBR 5410", "Instalações elétricas de baixa tensão", "Capacidade de condução (Tab. 36 a 39), fatores de correção (Tab. 40 e 42), queda de tensão (6.2.7), seção mínima (Tab. 47), coordenação IB ≤ In ≤ Iz (5.3.4), condutor de proteção (Tab. 58), ocupação de eletrodutos (6.2.11.1.6), circuitos de motores (6.5.1) e DPS (6.3.5)."],
    ["ABNT NBR 5419", "Proteção contra descargas atmosféricas", "Parte 4: medidas de proteção contra surtos — define a inclusão do DPS Classe II (ou I+II) na entrada do quadro."],
    ["ABNT NBR IEC 60898 / NBR NM 60898", "Minidisjuntores", `Curvas de disparo dos MDW: B (${CURVAS.B}); C (${CURVAS.C}); D (${CURVAS.D}). Capacidade de interrupção deve ser ≥ Icc presumida.`],
    ["ABNT NBR 6147", "Plugues e tomadas", "Norma cancelada e substituída pela NBR NM 60884-1 e pela padronização NBR 14136 — aplicada à tomada de serviço 2P+T do quadro."],
    ["ABNT NBR 6524", "Fios e cabos de cobre duro e meio duro para instalações aéreas", "Sem aplicação direta à fiação interna do painel; referência apenas para condutores nus de aterramento. Os cabos isolados seguem a NBR NM 247-3 (750 V) e a NBR 7286/7288 (0,6/1 kV)."],
    ["ABNT NBR IEC 61439-1/2", "Conjuntos de manobra e comando de baixa tensão", "Critério de reserva de espaço e de elevação de temperatura usado no pré-dimensionamento da caixa e da ventilação."]
  ];
  const catalogos = [
    ["Disjuntores-motores MPW", "WEG 50009822"], ["Contatores CWB / CWM e minicontatores CWC", "WEG 50042424, 50051271, 50040226"], ["Relés de sobrecarga RW", "WEG 50042397"],
    ["Minidisjuntores MDW/MDWH, DWP, DR e soluções integradas", "WEG 50009824"], ["Disjuntores em caixa moldada AGW", "WEG 50051732"], ["Seccionadoras MSW", "WEG 50161813"],
    ["Inversores CFW500", "Catálogo CFW-500"], ["Soft-starters SSW05 / SSW07 / SSW900", "WEG 10525004"], ["Fontes PSS24-W", "WEG 50058708"], ["DPS SPW03 / SPW13", "WEG 50160727"],
    ["Comando e sinalização CSW", "WEG CSW"], ["Bornes BTW", "WEG BTW"], ["Caixas BRCE e armários BRK", "Catálogo parcial de armários e caixas"], ["Caixa Volt 160 e barramentos Volt EX", "Catálogos Volt"], ["Conversor de potência MPCTPF", "LOTI rev. 6"]
  ];
  $("aba-base").innerHTML = `
    <div class="barra"><h2>Normas e base de consulta</h2></div>
    <div class="cartao"><h3>Normas aplicadas</h3>
      <div class="tabela-rolagem"><table><thead><tr><th>Norma</th><th>Assunto</th><th>Como é usada no sistema</th></tr></thead>
      <tbody>${normas.map((n) => `<tr><td><strong>${n[0]}</strong></td><td>${n[1]}</td><td>${h(n[2])}</td></tr>`).join("")}</tbody></table></div>
      <p class="sub">As tabelas normativas estão transcritas no sistema; os PDFs das normas não fazem parte da base. Todo resultado é um pré-dimensionamento e deve ser validado pelo responsável técnico.</p></div>
    <div class="cartao"><h3>Catálogos utilizados na seleção de materiais</h3>
      <div class="tabela-rolagem"><table><thead><tr><th>Linha de produto</th><th>Documento</th></tr></thead>
      <tbody>${catalogos.map((c) => `<tr><td>${c[0]}</td><td>${c[1]}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="cartao"><h3>Premissas de cálculo</h3>
      <ul class="lista">
        <li>Corrente de motores: tabela de valores típicos WEG W22 IR3 Premium, 4 polos, 60 Hz. A corrente de placa, quando informada, prevalece.</li>
        <li>Demais cargas trifásicas: I = P / (√3 · V · 0,85). Cargas monofásicas: I = P / (V · 0,9). Resistências: cosφ = 1.</li>
        <li>Cabos de campo: maior seção entre capacidade de condução corrigida, queda de tensão, coordenação com a proteção e mínimo de 2,5 mm².</li>
        <li>Proteção geral: soma das correntes × fator de demanda + 25% da corrente do maior motor.</li>
        <li>Composição do quadro (itens fixos, bornes por equipamento, cabos internos, regra de 440 V): arquivo EstruturadeCriação.txt.</li>
        <li>TAGs e itens de automação (CLP CAREL, relés de interface, barramentos BDS): projetos QFAC de referência.</li>
      </ul></div>`;
}

// ---------------------------------------------------------------------------
// Aba Administração
// ---------------------------------------------------------------------------
function renderAdmin() {
  if (S.usuario?.role !== "admin") return;
  const pend = S.usuarios.filter((u) => u.status === "pendente");
  const botoes = (u) => {
    if (u.email?.toLowerCase() === store.ADMIN_EMAIL) return `<span class="sub">administrador</span>`;
    const b = [];
    if (u.status !== "aprovado") b.push(`<button type="button" class="btn btn-pequeno btn-primario" data-acao="usuario" data-id="${h(u.id)}" data-status="aprovado">Aprovar</button>`);
    if (u.status !== "bloqueado") b.push(`<button type="button" class="btn btn-pequeno" data-acao="usuario" data-id="${h(u.id)}" data-status="bloqueado">${u.status === "pendente" ? "Recusar" : "Bloquear"}</button>`);
    b.push(`<button type="button" class="btn btn-pequeno btn-perigo" data-acao="excluir-usuario" data-id="${h(u.id)}">Excluir</button>`);
    return b.join(" ");
  };
  $("aba-admin").innerHTML = `
    <div class="barra"><h2>Administração de usuários</h2></div>
    <div class="cartao"><h3>Solicitações pendentes ${pend.length ? `<span class="badge">${pend.length}</span>` : ""}</h3>
      ${pend.length ? pend.map((u) => `<div class="solicitacao"><div><strong>${h(u.nome)}</strong><br><span class="sub">${h(u.email)} · solicitado em ${data(u.criadoEm)}</span></div><div class="acoes">${botoes(u)}</div></div>`).join("") : `<p class="vazio sub">Nenhuma solicitação aguardando aprovação.</p>`}
    </div>
    <div class="cartao"><h3>Usuários cadastrados (${S.usuarios.length})</h3>
      <div class="tabela-rolagem"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Situação</th><th>Cadastro</th><th>Último acesso</th><th></th></tr></thead>
      <tbody>${S.usuarios.map((u) => `<tr><td><strong>${h(u.nome)}</strong></td><td>${h(u.email)}</td>
        <td><span class="etiqueta ${h(u.status)}">${{ aprovado: "Aprovado", pendente: "Pendente", bloqueado: "Bloqueado" }[u.status] ?? h(u.status)}</span></td>
        <td>${data(u.criadoEm)}</td><td>${data(u.ultimoAcesso)}</td><td class="acoes">${botoes(u)}</td></tr>`).join("")}</tbody></table></div>
      <p class="sub">Excluir remove apenas o cadastro neste sistema; a credencial de login continua no Firebase Authentication e pode ser apagada pelo console.</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
function baixar(nome, conteudo, tipo) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const ACOES = {
  novo: novoQuadro,
  abrir: (el) => abrirQuadro(el.dataset.id),
  voltar: () => { S.quadro = null; S.resultado = null; renderQuadros(); },
  gerar: abrirLinhas,
  linhas: abrirLinhas,
  "salvar-quadro": async () => {
    if (!S.quadro.nome?.trim()) return toast("Informe o nome / TAG do quadro.", "erro");
    try { await persistirQuadro(null); toast("Quadro salvo."); renderQuadros(); } catch (e) { toast(store.mensagemErro(e), "erro"); }
  },
  "excluir-quadro": async () => {
    if (!confirm(`Excluir o quadro ${S.quadro.nome}? Esta ação não pode ser desfeita.`)) return;
    try { await store.remover("quadros", S.quadro.id); S.quadro = null; S.resultado = null; renderQuadros(); toast("Quadro excluído."); } catch (e) { toast(store.mensagemErro(e), "erro"); }
  },
  "novo-equip": () => abrirEquip(null),
  "editar-equip": (el) => abrirEquip(Number(el.dataset.i)),
  "duplicar-equip": (el) => {
    const e = clone(S.quadro.equipamentos[Number(el.dataset.i)]);
    e.nome = `${e.nome} (cópia)`; S.quadro.equipamentos.push(e); S.resultado = null; renderQuadros();
  },
  "remover-equip": (el) => { S.quadro.equipamentos.splice(Number(el.dataset.i), 1); S.resultado = null; renderQuadros(); },
  "cancelar-equip": () => $("dlgEquip").close(),
  csv: () => baixar(`lista-materiais-${S.quadro.nome || "quadro"}.csv`, bomParaCSV(S.resultado), "text/csv;charset=utf-8"),
  imprimir: () => window.print(),
  calc: (el) => { S.calcId = el.dataset.id; renderCalculos(); },
  "salvar-calc": salvarCalculo,
  "excluir-calc": async (el) => {
    if (!confirm("Excluir este cálculo do histórico?")) return;
    try { await store.remover("calculos", el.dataset.id); } catch (e) { toast(store.mensagemErro(e), "erro"); }
  },
  usuario: async (el) => {
    try {
      await store.atualizar("usuarios", el.dataset.id, { status: el.dataset.status, avaliadoPor: S.usuario.email, avaliadoEm: store.agora() });
      toast(el.dataset.status === "aprovado" ? "Usuário aprovado." : "Acesso bloqueado.");
    } catch (e) { toast(store.mensagemErro(e), "erro"); }
  },
  "excluir-usuario": async (el) => {
    if (!confirm("Excluir o cadastro deste usuário?")) return;
    try { await store.remover("usuarios", el.dataset.id); } catch (e) { toast(store.mensagemErro(e), "erro"); }
  }
};

function prepararEventos() {
  $("abas").addEventListener("click", (ev) => { const b = ev.target.closest("[data-aba]"); if (b) trocarAba(b.dataset.aba); });

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-acao]");
    if (el && ACOES[el.dataset.acao]) ACOES[el.dataset.acao](el);
  });

  // Dados do painel
  $("aba-quadros").addEventListener("change", (ev) => {
    const el = ev.target.closest("[data-campo]");
    if (!el || !S.quadro) return;
    S.quadro[el.dataset.campo] = lerCampo(el);
    if (el.dataset.campo === "tipo") {
      const cfg = TIPOS_QUADRO[S.quadro.tipo];
      S.quadro.tensaoComando = cfg.automacao ? "24Vcc" : "220Vca";
    }
    if (S.resultado) { S.resultado = null; toast("Dados alterados: gere a lista novamente para atualizar o resultado."); }
    if (el.dataset.rerender !== undefined || $("resultado")?.innerHTML) renderQuadros();
  });

  // Diálogo de equipamento
  $("dlgEquip").addEventListener("change", (ev) => {
    if (ev.target.closest("[data-rerender]")) { coletarEquip(); renderEquip(); }
  });
  $("dlgEquip").addEventListener("submit", (ev) => {
    ev.preventDefault();
    coletarEquip();
    const e = S.equip;
    if (!e.nome?.trim()) return toast("Informe o nome / TAG do equipamento.", "erro");
    if (e.tipo === "VRF" && !String(e.condensadoras ?? "").trim() && !(e.evaporadoras > 0)) return toast("Informe as condensadoras ou a quantidade de evaporadoras.", "erro");
    if (S.equipIndice == null) S.quadro.equipamentos.push(e); else S.quadro.equipamentos[S.equipIndice] = e;
    S.resultado = null;
    $("dlgEquip").close();
    renderQuadros();
  });

  // Calculadoras: recalcula a cada alteração
  $("aba-calculos").addEventListener("input", (ev) => {
    const el = ev.target.closest("[data-calc]");
    if (!el) return;
    S.calcValores[S.calcId][el.dataset.calc] = el.value;
    renderResultadoCalc();
  });
  $("aba-calculos").addEventListener("change", (ev) => {
    if (ev.target.id === "filtroHist") { S.filtroHist = ev.target.value; renderHistorico(); }
  });
}

prepararLogin();
prepararEventos();
store.iniciar(aoSessao).catch((e) => {
  mostrarTela("telaLogin");
  $("loginErro").textContent = `Falha ao conectar ao Firebase: ${store.mensagemErro(e)}`;
  $("loginErro").hidden = false;
});
