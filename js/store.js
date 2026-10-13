// Camada de dados e autenticação. Coleções no Firestore:
//   usuarios/{uid} — cadastro e status de aprovação (pendente | aprovado | bloqueado)
//   quadros/{id}   — quadros dimensionados (dados de entrada, resumo e memorial)
//   calculos/{id}  — cálculos avulsos salvos no histórico
import { firebaseConfig, ADMIN_EMAIL, SDK, MODO_LOCAL } from "./firebase.js";

let fs, au, db, auth;
let nomePendente = "";

const ERROS = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/email-already-in-use": "Este e-mail já possui cadastro. Use a aba Entrar.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "auth/network-request-failed": "Sem conexão com o servidor. Verifique a internet.",
  "auth/operation-not-allowed": "O login por e-mail/senha ainda não foi ativado no console do Firebase (Authentication → Sign-in method).",
  "permission-denied": "Sem permissão para esta operação. Verifique se as regras do Firestore foram publicadas."
};
export const mensagemErro = (e) => ERROS[e?.code] ?? e?.message ?? "Erro inesperado.";

const agora = () => new Date().toISOString();
const limpo = (o) => JSON.parse(JSON.stringify(o)); // o Firestore rejeita undefined

// ---------------------------------------------------------------------------
// Modo local (localStorage)
// ---------------------------------------------------------------------------
const local = {
  ouvintes: {},
  ler: (c) => JSON.parse(localStorage.getItem(`dq_${c}`) ?? "[]"),
  gravar(c, docs) { localStorage.setItem(`dq_${c}`, JSON.stringify(docs)); (this.ouvintes[c] ?? []).forEach((f) => f(docs)); }
};

export async function iniciar(aoMudarSessao) {
  if (MODO_LOCAL) {
    aoMudarSessao({ estado: "aprovado", usuario: { uid: "local", email: "local@teste", nome: "Modo local", role: "admin", status: "aprovado" } });
    return;
  }
  const [appMod, fsMod, auMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-firestore.js`), import(`${SDK}/firebase-auth.js`)
  ]);
  fs = fsMod; au = auMod;
  const app = appMod.initializeApp(firebaseConfig);
  db = fs.getFirestore(app);
  auth = au.getAuth(app);

  let pararPerfil = null;
  au.onAuthStateChanged(auth, async (user) => {
    pararPerfil?.(); pararPerfil = null;
    if (!user) return aoMudarSessao({ estado: "saiu" });
    const ref = fs.doc(db, "usuarios", user.uid);
    try {
      const snap = await fs.getDoc(ref);
      const admin = user.email?.toLowerCase() === ADMIN_EMAIL;
      if (!snap.exists()) {
        await fs.setDoc(ref, {
          email: user.email, nome: nomePendente || user.email.split("@")[0],
          status: admin ? "aprovado" : "pendente", role: admin ? "admin" : "usuario", criadoEm: agora(), ultimoAcesso: agora()
        });
      } else {
        fs.updateDoc(ref, { ultimoAcesso: agora() }).catch(() => {});
      }
      pararPerfil = fs.onSnapshot(ref, (s) => {
        if (!s.exists()) return aoMudarSessao({ estado: "bloqueado", usuario: { uid: user.uid, email: user.email } });
        const perfil = { uid: user.uid, ...s.data() };
        if (admin) { perfil.role = "admin"; perfil.status = "aprovado"; }
        aoMudarSessao({ estado: perfil.status === "aprovado" ? "aprovado" : perfil.status, usuario: perfil });
      }, (e) => aoMudarSessao({ estado: "erro", erro: mensagemErro(e) }));
    } catch (e) {
      aoMudarSessao({ estado: "erro", erro: mensagemErro(e), usuario: { uid: user.uid, email: user.email } });
    }
  });
}

export const entrar = (email, senha) => au.signInWithEmailAndPassword(auth, email.trim(), senha);
export const redefinirSenha = (email) => au.sendPasswordResetEmail(auth, email.trim());
export const sair = () => (MODO_LOCAL ? location.reload() : au.signOut(auth));
export function solicitarAcesso(nome, email, senha) {
  nomePendente = nome.trim();
  return au.createUserWithEmailAndPassword(auth, email.trim(), senha);
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------
/** Observa uma coleção em tempo real. Devolve a função para cancelar. */
export function observar(colecao, aoMudar, aoErrar = () => {}) {
  if (MODO_LOCAL) {
    (local.ouvintes[colecao] ??= []).push(aoMudar);
    aoMudar(local.ler(colecao));
    return () => { local.ouvintes[colecao] = local.ouvintes[colecao].filter((f) => f !== aoMudar); };
  }
  return fs.onSnapshot(fs.collection(db, colecao),
    (snap) => aoMudar(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => aoErrar(mensagemErro(e)));
}

/** Cria (id nulo) ou substitui um documento. Devolve o id. */
export async function salvar(colecao, id, dados) {
  const { id: _descartado, ...resto } = dados;
  const docLimpo = limpo({ ...resto, atualizadoEm: agora() });
  if (MODO_LOCAL) {
    const docs = local.ler(colecao);
    const novoId = id ?? `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const i = docs.findIndex((d) => d.id === novoId);
    if (i >= 0) docs[i] = { id: novoId, ...docLimpo }; else docs.push({ id: novoId, ...docLimpo });
    local.gravar(colecao, docs);
    return novoId;
  }
  if (id) { await fs.setDoc(fs.doc(db, colecao, id), docLimpo); return id; }
  return (await fs.addDoc(fs.collection(db, colecao), docLimpo)).id;
}

export async function atualizar(colecao, id, campos) {
  if (MODO_LOCAL) {
    local.gravar(colecao, local.ler(colecao).map((d) => (d.id === id ? { ...d, ...campos } : d)));
    return;
  }
  await fs.updateDoc(fs.doc(db, colecao, id), limpo(campos));
}

export async function remover(colecao, id) {
  if (MODO_LOCAL) return local.gravar(colecao, local.ler(colecao).filter((d) => d.id !== id));
  await fs.deleteDoc(fs.doc(db, colecao, id));
}

export { agora, MODO_LOCAL, ADMIN_EMAIL };
