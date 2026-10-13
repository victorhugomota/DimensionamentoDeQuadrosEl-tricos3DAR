# Dimensionamento de Quadros Elétricos — 3D AR

Site para dimensionamento e levantamento de lista de materiais de quadros elétricos de
automação e potência (HVAC e indústria).

**Acesso:** https://victorhugomota.github.io/DimensionamentoDeQuadrosEl-tricos3DAR/

## O que o sistema faz

- **Quadros** — cadastro do painel (tensão 220/380/440 V, tipo, comando, IHM, supervisório) e
  dos equipamentos (tensão, potência, tipo de partida, distância do quadro). Ao gerar a lista, o
  sistema pede a **linha de produto de cada tipo de peça** e devolve:
  - resumo geral e tabela de cargas (corrente, proteção, acionamento, cabo e queda de tensão);
  - lista quantitativa de materiais com justificativa técnica, exportável em CSV;
  - resumo de proteções e automação (disjuntor geral, transformador, fonte 24 V, CLP/IHM, ventilação);
  - tamanho da caixa/armário e desenho do quadro montado (vista interna e externa);
  - memorial de cálculo.
- **Cálculos** — registra cada cálculo feito por quadro e oferece calculadoras avulsas:
  seção de cabo, ocupação de eletroduto, corrente de motor trifásico, corrente tri/mono,
  queda de tensão, curto-circuito, correção do fator de potência, ventilação do painel e
  partida estrela-triângulo.
- **Normas e base** — normas aplicadas, catálogos usados e premissas de cálculo.
- **Administração** — o administrador aprova, bloqueia ou exclui usuários.

## Regras e fontes

| Assunto | Fonte |
| --- | --- |
| Composição do quadro, tipos de equipamento, itens fixos | `EstruturadeCriação.txt` |
| Cabos, proteção, eletrodutos, DPS | NBR 5410, NBR 5419, NBR IEC 60898 (tabelas em `js/normas.js`) |
| Correntes de motores | Valores típicos WEG W22 IR3 Premium, 4 polos (`js/motores.js`) |
| Modelos e dimensões dos componentes | Catálogos da pasta *Base De Consulta* (`js/catalogo.js`) |
| TAGs, CLP, relés de interface, barramentos | Projetos QFAC da pasta *Projetos* |

Os PDFs de catálogos, normas e projetos **não** fazem parte do repositório — só os dados de
seleção extraídos deles. Todo resultado é um pré-dimensionamento e deve ser validado pelo
responsável técnico.

## Configuração do Firebase (uma única vez)

O banco é o projeto `calculospaineis3d`. No [console do Firebase](https://console.firebase.google.com/):

1. **Authentication → Sign-in method** — ative o provedor **E-mail/senha**.
2. **Authentication → Users → Add user** — crie o usuário administrador com o e-mail definido em
   `ADMIN_EMAIL` (`js/firebase.js`). Faça isso antes de divulgar o link.
3. **Firestore Database → Rules** — cole o conteúdo de `firestore.rules` e publique. Sem isso o
   banco fica com as regras abertas do modo de teste.
4. (Opcional) **Authentication → Settings → Authorized domains** — adicione `victorhugomota.github.io`.

Depois disso: novos usuários usam **Solicitar acesso** na tela de login; o pedido aparece na aba
**Administração** do administrador, que aprova ou recusa.

### Coleções

- `usuarios/{uid}` — nome, e-mail, `status` (`pendente`, `aprovado`, `bloqueado`) e `role`.
- `quadros/{id}` — dados de entrada do quadro, resumo e memorial de cálculo.
- `calculos/{id}` — cálculos avulsos salvos no histórico.

## Desenvolvimento

Site estático, sem etapa de build (HTML + CSS + módulos ES).

```bash
python -m http.server 8765
```

- `http://localhost:8765/` — usa o Firebase real.
- `http://localhost:8765/?local` — modo local: grava no `localStorage` do navegador, sem login.

| Arquivo | Conteúdo |
| --- | --- |
| `js/normas.js` | Tabelas da NBR 5410 e dimensionamento de cabos |
| `js/motores.js` | Tabela de correntes de motores |
| `js/catalogo.js` | Linhas de produto e seleção de modelos |
| `js/dimensionamento.js` | Motor de dimensionamento e lista de materiais |
| `js/layout.js` | Escolha da caixa e desenho do quadro |
| `js/calc.js` | Calculadoras avulsas |
| `js/store.js`, `js/firebase.js` | Login e banco de dados |
| `js/app.js` | Interface |
