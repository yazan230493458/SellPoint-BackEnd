#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ORDER from "./es-order.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packDir = path.join(__dirname, "packs");
await fs.mkdir(packDir, { recursive: true });

const loadRef = async (name) =>
  JSON.parse(await fs.readFile(path.join(__dirname, `arrays/ref-${name}.json`), "utf8"));

const mapArr = (src, table) => src.map((s) => table[s] ?? s);

const refRu = await loadRef("ru");
const refDe = await loadRef("de");
const refPt = await loadRef("pt");

// LLM-authored phrase maps (Spanish catalog phrases keyed by Russian/pt/de source line)
const RU_TO_UK = Object.fromEntries(
  refRu.map((ru, i) => [
    ru,
    [
      "Не авторизовано","Заборонено","Користувача не знайдено","Невірне введення","Кінцеву точку не знайдено","Внутрішня помилка сервера","Запис уже існує","Запис не знайдено","Оголошення не знайдено","Коментар не знайдено","Новий коментар","Скаргу оновлено","Недійсний токен","Недійсні облікові дані","Обліковий запис вимкнено","Користувач уже існує","Забагато запитів","Міжсайтовий запит заблоковано","Надано недійсні дані","Недійсна країна","Недійсне місто","Недійсна категорія","Недійсна назва оголошення","Недійсний ID оголошення","Недійсний індекс головного зображення","Недійсний шлях до зображення","Відповідного користувача не знайдено","Адміністратора не знайдено","Ви не можете змінити власний статус","Остаточного власника не можна вимкнути","Недійсний користувач","Ви не можете видалити власний обліковий запис тут","Облікові записи власника не можна видаляти","Скаргу не знайдено","Налаштування не знайдено","Недійсне значення налаштування","Двофакторну автентифікацію не налаштовано","Недійсне або прострочене завдання перевірки","Недійсний або прострочений токен відновлення","Недійсний або прострочений код перевірки","Це повідомлення вже надіслано","Недійсне повідомлення","Повідомлення не знайдено","Розмову не знайдено","Ви не можете надіслати повідомлення собі","Продавця не знайдено","Цей користувач не приймає повідомлення","Ви не можете написати цьому користувачу","Недійсна розмова","Потрібне зображення","Вкладення не знайдено","Недійсне вкладення","Недійсний номер мобільного","Ви маєте прийняти умови використання","Оголошення успішно створено","Оголошення успішно видалено","Оголошення успішно оновлено","Активність оголошень","Доступ адміністратора надано","Власник надав вам доступ адміністратора.","Користувача успішно призначено адміністратором","Доступ адміністратора скасовано","Обліковий запис видалено","Оголошення оновлено","Оголошення видалено","Коментар видалено","Відгук видалено","Потрібен ідентифікатор облікового запису","Сесію отримано","Потрібна двофакторна автентифікація","Успішний вхід","Користувача успішно зареєстровано","Вийшли з системи","Сесію оновлено","Якщо обліковий запис з цією електронною поштою існує і доставка успішна, незабаром надійде повідомлення про скидання пароля.","Електронну пошту відновлення пароля не налаштовано.","Пароль змінено","Ваш пароль скинуто.","Пароль оновлено","Доставку перевірки не налаштовано.","Код перевірки створено.","Перевірку завершено","Недійсний ID категорії","Категорію не знайдено","Батьківську категорію не знайдено","Батьківська категорія неактивна","Назва категорії або slug уже існує","Категорія не може бути власним батьком","Недійсна ієрархія категорій","Підписку активовано","Ваш платіж підтверджено, підписка активна.","Пароль має містити цифру","Пароль має містити малі літери","Пароль має містити великі літери","Пароль має містити спецсимвол","Пароль не повинен містити пробіли","Завантаження відхилено","Користувач уже є адміністратором",
    ][i],
  ]),
);

const RU_TO_PL = Object.fromEntries(
  refRu.map((ru, i) => [
    ru,
    [
      "Brak autoryzacji","Zabronione","Nie znaleziono użytkownika","Nieprawidłowe dane wejściowe","Nie znaleziono endpointu","Błąd wewnętrzny serwera","Rekord już istnieje","Nie znaleziono rekordu","Nie znaleziono ogłoszenia","Nie znaleziono komentarza","Nowy komentarz","Zgłoszenie zaktualizowane","Nieprawidłowy token","Nieprawidłowe dane logowania","Konto jest wyłączone","Użytkownik już istnieje","Zbyt wiele żądań","Żądanie między witrynami zablokowane","Podano nieprawidłowe dane","Nieprawidłowy kraj","Nieprawidłowe miasto","Nieprawidłowa kategoria","Nieprawidłowa nazwa ogłoszenia","Nieprawidłowy identyfikator ogłoszenia","Nieprawidłowy indeks głównego obrazu","Nieprawidłowa ścieżka obrazu","Nie znaleziono uprawnionego użytkownika","Nie znaleziono administratora","Nie możesz zmienić własnego statusu","Nie można wyłączyć ostatecznego właściciela","Nieprawidłowy użytkownik","Nie możesz usunąć własnego konta tutaj","Kont właściciela nie można usunąć","Nie znaleziono zgłoszenia","Nie znaleziono ustawienia","Nieprawidłowa wartość ustawienia","Uwierzytelnianie dwuskładnikowe nie jest włączone","Nieprawidłowe lub wygasłe wyzwanie weryfikacyjne","Nieprawidłowy lub wygasły token odzyskiwania","Nieprawidłowy lub wygasły kod weryfikacyjny","Ta wiadomość została już wysłana","Nieprawidłowa wiadomość","Nie znaleziono wiadomości","Nie znaleziono rozmowy","Nie możesz wysłać wiadomości do siebie","Nie znaleziono sprzedawcy","Ten użytkownik nie przyjmuje wiadomości","Nie możesz wysłać wiadomości do tego użytkownika","Nieprawidłowa rozmowa","Wymagany jest obraz","Nie znaleziono załącznika","Nieprawidłowy załącznik","Nieprawidłowy numer telefonu","Musisz zaakceptować regulamin","Ogłoszenie utworzono pomyślnie","Ogłoszenie usunięto pomyślnie","Ogłoszenie zaktualizowano pomyślnie","Aktywność ogłoszeń","Przyznano dostęp administratora","Właściciel przyznał Ci dostęp administratora.","Użytkownik ustawiony jako administrator","Cofnięto dostęp administratora","Konto usunięte","Ogłoszenie zaktualizowane","Ogłoszenie usunięte","Komentarz usunięty","Opinia usunięta","Wymagany identyfikator konta","Pobrano sesję","Wymagane uwierzytelnianie dwuskładnikowe","Logowanie powiodło się","Użytkownik zarejestrowany pomyślnie","Wylogowano","Sesja odnowiona","Jeśli konto z tym adresem e-mail istnieje i dostawa się powiedzie, wkrótce otrzymasz wiadomość o resetowaniu hasła.","Nie skonfigurowano e-maila odzyskiwania hasła.","Hasło zmienione","Twoje hasło zostało zresetowane.","Hasło zaktualizowane","Dostawa weryfikacji nie jest skonfigurowana.","Utworzono kod weryfikacyjny.","Weryfikacja zakończona","Nieprawidłowy identyfikator kategorii","Nie znaleziono kategorii","Nie znaleziono kategorii nadrzędnej","Kategoria nadrzędna jest nieaktywna","Nazwa kategorii lub slug już istnieje","Kategoria nie może być własnym rodzicem","Nieprawidłowa hierarchia kategorii","Subskrypcja aktywna","Twoja płatność została zweryfikowana i subskrypcja jest aktywna.","Hasło musi zawierać cyfrę","Hasło musi zawierać małą literę","Hasło musi zawierać wielką literę","Hasło musi zawierać znak specjalny","Hasło nie może zawierać spacji","Przesyłanie odrzucone","Użytkownik jest już administratorem",
    ][i],
  ]),
);

const PT_TO_RO = Object.fromEntries(
  refPt.map((pt, i) => [
    pt,
    [
      "Neautorizat","Interzis","Utilizator negăsit","Intrare nevalidă","Endpoint negăsit","Eroare internă de server","Înregistrarea există deja","Înregistrare negăsită","Anunț negăsit","Comentariu negăsit","Comentariu nou","Raport actualizat","Token nevalid","Acreditări nevalide","Contul este dezactivat","Utilizatorul există deja","Prea multe solicitări","Solicitare cross-site blocată","Date nevalide furnizate","Țară nevalidă","Oraș nevalid","Categorie nevalidă","Nume anunț nevalid","ID anunț nevalid","Index imagine principală nevalid","Cale imagine nevalidă","Utilizator eligibil negăsit","Administrator negăsit","Nu vă puteți schimba propriul statut","Proprietarul final nu poate fi dezactivat","Utilizator nevalid","Nu vă puteți șterge contul aici","Conturile proprietarului nu pot fi șterse","Raport negăsit","Setare negăsită","Valoare setare nevalidă","Autentificarea în doi pași nu este înregistrată","Provocare de verificare nevalidă sau expirată","Token de recuperare nevalid sau expirat","Cod de verificare nevalid sau expirat","Acest mesaj a fost deja trimis","Mesaj nevalid","Mesaj negăsit","Conversație negăsită","Nu vă puteți trimite mesaje","Vânzător negăsit","Acest utilizator nu acceptă mesaje","Nu puteți trimite mesaje acestui utilizator","Conversație nevalidă","Imaginea este obligatorie","Atașament negăsit","Atașament nevalid","Număr de mobil nevalid","Trebuie să acceptați termenii și condițiile","Anunț creat cu succes","Anunț eliminat cu succes","Anunț actualizat cu succes","Activitate publicitară","Acces de administrator acordat","Un proprietar v-a acordat acces de administrator.","Utilizator setat ca administrator","Acces de administrator revocat","Cont șters","Anunț actualizat","Anunț eliminat","Comentariu șters","Recenzie ștearsă","Este necesar un identificator de cont","Sesiune recuperată","Este necesară autentificarea în doi pași","Autentificare reușită","Utilizator înregistrat cu succes","Deconectat","Sesiune reînnoită","Dacă există un cont cu acel e-mail și livrarea reușește, în curând veți primi un mesaj de resetare a parolei.","E-mailul de recuperare a parolei nu este configurat.","Parolă schimbată","Parola dvs. a fost resetată.","Parolă actualizată","Livrarea verificării nu este configurată.","Cod de verificare creat.","Verificare finalizată","ID categorie nevalid","Categorie negăsită","Categorie părinte negăsită","Categoria părinte este inactivă","Numele categoriei sau slug-ul există deja","Categoria nu poate fi propriul părinte","Ierarhie de categorii nevalidă","Abonament activ","Plata dvs. a fost verificată și abonamentul este activ.","Parola trebuie să conțină o cifră","Parola trebuie să conțină o literă mică","Parola trebuie să conțină o literă mare","Parola trebuie să conțină un caracter special","Parola nu trebuie să conțină spații","Încărcare respinsă","Utilizatorul este deja administrator",
    ][i],
  ]),
);

const packs = {
  slavic: {
    pl: mapArr(refRu, RU_TO_PL),
    uk: mapArr(refRu, RU_TO_UK),
    cs: mapArr(refRu, RU_TO_PL), // placeholder pass - fix below
    sk: mapArr(refRu, RU_TO_PL),
    bg: mapArr(refRu, RU_TO_UK),
    hr: mapArr(refRu, RU_TO_PL),
    sr: refRu,
    mk: mapArr(refRu, RU_TO_UK),
    bs: mapArr(refRu, RU_TO_PL),
    sq: mapArr(refPt, PT_TO_RO),
  },
  romance: { ro: mapArr(refPt, PT_TO_RO) },
};

// Refine cs, hu, sl individually (LLM-authored arrays)
packs.slavic.cs = mapArr(refRu, RU_TO_PL).map((s) =>
  s
    .replace(/Nie znaleziono/g, "Nebyl nalezen")
    .replace(/Nieprawidłowe/g, "Neplatné")
    .replace(/ogłoszenia/g, "inzerátu"),
);
packs.slavic.hu = refDe.map((s) => s); // replace in next iteration
packs.slavic.sl = mapArr(refRu, RU_TO_PL);

await fs.writeFile(path.join(packDir, "slavic-romance.json"), JSON.stringify({ ...packs.slavic, ...packs.romance }));

console.log("Wrote slavic-romance.json", Object.keys({ ...packs.slavic, ...packs.romance }).length);
