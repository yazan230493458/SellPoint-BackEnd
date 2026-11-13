#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "lib/i18n/catalog.json");
const messagesPath = path.join(root, "lib/i18n/messages.ts");
const patchDir = path.join(root, "lib/i18n/llm-patches");
const esPath = path.join(__dirname, "es-complete.json");

const LOCALES = [
  "ar","es","fr","de","zh-CN","zh-TW","ja","ko","pt","pt-BR","ru","tr","it","nl","hi","ur","id","ms","bn","fa","th","vi","pl","uk","sv","nb","da","fi","el","he","ro","cs","hu","bg","hr","sr","sk","sl","sw","fil","ta","te","mr","gu","kn","ml","ne","si","az","kk","uz","hy","ka","is","ga","cy","af","am","km","lo","my","mn","bs","mk","sq","lt","lv","et",
];

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const es = JSON.parse(await fs.readFile(esPath, "utf8"));
const keys = Object.keys(catalog);

const fixAdvertisementActivity = {
  am: "የማስታወቂያ እንቅስቃሴ",
  az: "Elan fəaliyyəti",
  bs: "Aktivnost oglasa",
  cy: "Gweithgaredd hysbysebu",
  et: "Kuulutustegevus",
  ga: "Gníomhaíocht fógraíochta",
  hy: "Գովազդային ակտիվություն",
  is: "Auglýsingastarfsemi",
  ka: "სარეკლამო აქტივობა",
  kk: "Жарнамалық белсенділік",
  km: "សកម្មភាពផ្សាយពាណិជ្ជកម្ម",
  lo: "ກິດຈະກຳໂຄສະນາ",
  lt: "Skelbimo veikla",
  lv: "Sludinājumu aktivitāte",
  mn: "Зар сурталчилгааны үйл ажиллагаа",
  my: "ကြော်ငြာလုပ်ဆောင်ချက်",
  sq: "Aktivitet reklamimi",
  sw: "Shughuli za matangazo",
  uz: "E'lon faoliyati",
};

const arExtras = {
  "Category cannot be its own parent": "لا يمكن أن تكون الفئة والدها الخاص",
  "Invalid category hierarchy": "تسلسل هرمي غير صالح للفئات",
};

/** @type {Record<string, Record<string, string>>} */
let packs = {};
try {
  const packFiles = (await fs.readdir(patchDir)).filter(
    (f) => f.startsWith("locale-") && f.endsWith(".json"),
  );
  for (const file of packFiles) {
    const locale = file.slice("locale-".length, -".json".length);
    packs[locale] = JSON.parse(await fs.readFile(path.join(patchDir, file), "utf8"));
  }
} catch {
  packs = {};
}

try {
  const embedded = JSON.parse(
    await fs.readFile(path.join(__dirname, "llm-full-translations.json"), "utf8"),
  );
  for (const [locale, messages] of Object.entries(embedded)) {
    packs[locale] = { ...packs[locale], ...messages };
  }
} catch {
  /* optional bulk file */
}

const pt = {
  "Unauthorized": "Não autorizado",
  "Forbidden": "Proibido",
  "User not found": "Utilizador não encontrado",
  "Invalid input": "Entrada inválida",
  "Endpoint not found": "Endpoint não encontrado",
  "Internal server error": "Erro interno do servidor",
  "Record already exists": "O registo já existe",
  "Record not found": "Registo não encontrado",
  "Ad not found": "Anúncio não encontrado",
  "Comment not found": "Comentário não encontrado",
  "New comment": "Novo comentário",
  "Report updated": "Denúncia atualizada",
  "Invalid token": "Token inválido",
  "Invalid credentials": "Credenciais inválidas",
  "Account is disabled": "A conta está desativada",
  "User already exists": "O utilizador já existe",
  "Too many requests": "Demasiados pedidos",
  "Cross-site request blocked": "Pedido entre sites bloqueado",
  "Invalid data provided": "Dados inválidos fornecidos",
  "Invalid country": "País inválido",
  "Invalid city": "Cidade inválida",
  "Invalid category": "Categoria inválida",
  "Invalid ad name": "Nome do anúncio inválido",
  "Invalid ad ID": "ID do anúncio inválido",
  "Invalid main image index": "Índice da imagem principal inválido",
  "Invalid image path": "Caminho da imagem inválido",
  "Eligible user not found": "Utilizador elegível não encontrado",
  "Administrator not found": "Administrador não encontrado",
  "You cannot change your own status": "Não pode alterar o seu próprio estado",
  "The final owner cannot be disabled": "O proprietário final não pode ser desativado",
  "Invalid user": "Utilizador inválido",
  "You cannot delete your own account here": "Não pode eliminar a sua conta aqui",
  "Owner accounts cannot be deleted": "Contas de proprietário não podem ser eliminadas",
  "Advertisement not found": "Anúncio não encontrado",
  "Report not found": "Denúncia não encontrada",
  "Setting not found": "Definição não encontrada",
  "Invalid setting value": "Valor de definição inválido",
  "Two-factor authentication is not enrolled": "A autenticação de dois fatores não está ativa",
  "Invalid or expired verification challenge": "Desafio de verificação inválido ou expirado",
  "Invalid or expired recovery token": "Token de recuperação inválido ou expirado",
  "Invalid or expired verification code": "Código de verificação inválido ou expirado",
  "This message was already sent": "Esta mensagem já foi enviada",
  "Invalid message": "Mensagem inválida",
  "Message not found": "Mensagem não encontrada",
  "Conversation not found": "Conversa não encontrada",
  "You cannot message yourself": "Não pode enviar mensagens a si próprio",
  "Seller not found": "Vendedor não encontrado",
  "This user is not accepting messages": "Este utilizador não aceita mensagens",
  "You cannot message this user": "Não pode enviar mensagens a este utilizador",
  "Invalid conversation": "Conversa inválida",
  "Image is required": "A imagem é obrigatória",
  "Attachment not found": "Anexo não encontrado",
  "Invalid attachment": "Anexo inválido",
  "Invalid mobile number": "Número de telemóvel inválido",
  "You must accept the terms and conditions": "Deve aceitar os termos e condições",
  "Ad created successfully": "Anúncio criado com sucesso",
  "Ad removed successfully": "Anúncio removido com sucesso",
  "Ad updated successfully": "Anúncio atualizado com sucesso",
  "Advertisement activity": "Atividade publicitária",
  "Administrator access granted": "Acesso de administrador concedido",
  "An owner granted you administrator access.": "Um proprietário concedeu-lhe acesso de administrador.",
  "User set as admin successfully": "Utilizador definido como administrador com sucesso",
  "Administrator access revoked": "Acesso de administrador revogado",
  "Account deleted": "Conta eliminada",
  "Advertisement updated": "Anúncio atualizado",
  "Advertisement removed": "Anúncio removido",
  "Comment deleted": "Comentário eliminado",
  "Review deleted": "Avaliação eliminada",
  "An account identifier is required": "É necessário um identificador de conta",
  "Session retrieved": "Sessão recuperada",
  "Two-factor authentication is required": "É necessária autenticação de dois fatores",
  "Login successful": "Início de sessão bem-sucedido",
  "User registered successfully": "Utilizador registado com sucesso",
  "Logged out": "Sessão terminada",
  "Session renewed": "Sessão renovada",
  "If an account with that email exists and delivery succeeds, a password reset message will arrive shortly.":
    "Se existir uma conta com esse e-mail e a entrega for bem-sucedida, receberá em breve uma mensagem para redefinir a palavra-passe.",
  "Password recovery email is not configured.":
    "O e-mail de recuperação da palavra-passe não está configurado.",
  "Password changed": "Palavra-passe alterada",
  "Your password was reset.": "A sua palavra-passe foi redefinida.",
  "Password updated": "Palavra-passe atualizada",
  "Verification delivery is not configured.": "A entrega de verificação não está configurada.",
  "Verification code created.": "Código de verificação criado.",
  "Verification completed": "Verificação concluída",
  "Invalid category ID": "ID de categoria inválido",
  "Category not found": "Categoria não encontrada",
  "Parent category not found": "Categoria principal não encontrada",
  "Parent category is inactive": "A categoria principal está inativa",
  "Category name or slug already exists": "O nome da categoria ou o slug já existe",
  "Category cannot be its own parent": "Uma categoria não pode ser o seu próprio pai",
  "Invalid category hierarchy": "Hierarquia de categorias inválida",
  "Subscription active": "Subscrição ativa",
  "Your payment was verified and your subscription is now active.":
    "O seu pagamento foi verificado e a sua subscrição está agora ativa.",
  "Password must contain a number": "A palavra-passe deve conter um número",
  "Password must contain a lowercase letter": "A palavra-passe deve conter uma letra minúscula",
  "Password must contain an uppercase letter": "A palavra-passe deve conter uma letra maiúscula",
  "Password must contain a special character": "A palavra-passe deve conter um carácter especial",
  "Password must not contain spaces": "A palavra-passe não deve conter espaços",
  "Upload rejected": "Carregamento rejeitado",
  "User is already an administrator": "O utilizador já é administrador",
};

const ptBR = Object.fromEntries(
  Object.entries(pt).map(([k, v]) => {
    const br = v
      .replace(/palavra-passe/g, "senha")
      .replace(/Palavra-passe/g, "Senha")
      .replace(/Utilizador/g, "Usuário")
      .replace(/utilizador/g, "usuário")
      .replace(/telemóvel/g, "celular")
      .replace(/registado/g, "registrado")
      .replace(/Subscrição/g, "Assinatura")
      .replace(/subscrição/g, "assinatura")
      .replace(/carácter/g, "caractere")
      .replace(/eliminar/g, "excluir")
      .replace(/Eliminad/g, "Excluíd")
      .replace(/definição/g, "configuração");
    return [k, br];
  }),
);
ptBR["User not found"] = "Usuário não encontrado";
ptBR["Logged out"] = "Sessão encerrada";

packs.pt = { ...pt, ...packs.pt };
packs["pt-BR"] = { ...ptBR, ...packs["pt-BR"] };

for (const [locale, messages] of Object.entries(packs)) {
  for (const key of keys) {
    if (!messages[key]) continue;
    catalog[key] ??= {};
    catalog[key][locale] = messages[key];
  }
}

for (const [key, text] of Object.entries(arExtras)) {
  catalog[key] ??= {};
  catalog[key].ar = text;
}

for (const [locale, text] of Object.entries(fixAdvertisementActivity)) {
  catalog["Advertisement activity"] ??= {};
  catalog["Advertisement activity"][locale] = text;
}

const messagesTs = `import type { BackendLocale } from "./locales.js";

type MessageCatalog = Record<string, Partial<Record<BackendLocale, string>>>;

export const apiMessages = ${JSON.stringify(catalog, null, 2)} as MessageCatalog;

export const translateMessage = (message: string, locale: BackendLocale) => {
  if (locale === "en") return message;
  const entry = apiMessages[message];
  return entry?.[locale] ?? message;
};
`;

await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await fs.writeFile(messagesPath, messagesTs);

let gaps = 0;
const gapLocales = new Set();
for (const key of keys) {
  for (const locale of LOCALES) {
    if (!catalog[key][locale]) {
      gaps += 1;
      gapLocales.add(locale);
    }
  }
}

console.log(`Keys: ${keys.length}, locales: ${LOCALES.length}`);
console.log(`Remaining gaps: ${gaps}`);
console.log(`Locales with gaps: ${[...gapLocales].sort().join(", ")}`);
