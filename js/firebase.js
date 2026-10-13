// Configuração do Firebase (projeto calculospaineis3d). A chave de API de apps
// web do Firebase é pública por natureza: quem protege os dados são as regras
// do Firestore (firestore.rules) e o login por e-mail/senha.
export const firebaseConfig = {
  apiKey: "AIzaSyD-kWZ4dBQ6Rzs2lXfNY2tyPs-9fzu3Rfc",
  authDomain: "calculospaineis3d.firebaseapp.com",
  projectId: "calculospaineis3d",
  storageBucket: "calculospaineis3d.firebasestorage.app",
  messagingSenderId: "171724677942",
  appId: "1:171724677942:web:0e33c078164cdf5ee6c997",
  measurementId: "G-VDNPJ5LJQX"
};

// Administrador do sistema — o mesmo e-mail precisa estar em firestore.rules.
export const ADMIN_EMAIL = "eletrica@3darcondicionado.com.br";

export const SDK = "https://www.gstatic.com/firebasejs/10.14.0";

// Modo local (só em localhost, com ?local na URL): usa o localStorage no lugar
// do Firebase, para desenvolver e testar a interface sem tocar no banco real.
export const MODO_LOCAL =
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
  new URLSearchParams(location.search).has("local");
