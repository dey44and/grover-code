import { useEffect, useRef, useState, type ReactNode } from 'react';

interface CodeBlockProps {
  readonly children: string;
  readonly label?: string;
}

function CodeBlock({ children, label = 'Exemplu BAC-RO' }: CodeBlockProps) {
  return (
    <figure className="docs-code">
      <figcaption>{label}</figcaption>
      <pre>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

interface CalloutProps {
  readonly children: ReactNode;
  readonly title: string;
  readonly tone?: 'info' | 'warning';
}

function Callout({ children, title, tone = 'info' }: CalloutProps) {
  return (
    <aside className={`docs-callout docs-callout--${tone}`} role="note" aria-label={title}>
      <strong>{title}</strong>
      <div>{children}</div>
    </aside>
  );
}

const sectionGroups = [
  {
    label: 'Introducere',
    sections: [
      ['despre', 'Despre'],
      ['primul-program', 'Primul program'],
    ],
  },
  {
    label: 'Limbaj',
    sections: [
      ['model-lexical', 'Token-uri si identificatori'],
      ['valori', 'Valori si variabile'],
      ['operatori', 'Operatori'],
      ['intrare-iesire', 'Input si output'],
      ['decizie', 'daca / altfel'],
      ['cat-timp', 'cat timp'],
      ['repeta', 'repeta / pana cand'],
      ['pentru', 'pentru'],
    ],
  },
  {
    label: 'Instrumente',
    sections: [
      ['debugger', 'Debugger'],
      ['erori-limite', 'Erori si limite'],
    ],
  },
  {
    label: 'Extra',
    sections: [
      ['compatibilitate', 'Compatibilitate BAC'],
      ['surse', 'Surse si versiune'],
      ['planificat', 'Arrays si matrices'],
    ],
  },
] as const;

type PageSection = readonly [id: string, label: string];

const pageSections: readonly PageSection[] = sectionGroups.flatMap<PageSection>(
  (group) => group.sections,
);

const sectionFromLocation = (): string | undefined => {
  let id: string;
  try {
    id = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return undefined;
  }
  return pageSections.some(([sectionId]) => sectionId === id) ? id : undefined;
};

const focusSection = (id: string): void => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const target = document.getElementById(id);
      const heading = target?.matches('h1, h2') === true ? target : target?.querySelector('h1, h2');
      target?.scrollIntoView?.({ behavior: 'auto', block: 'start' });
      if (heading instanceof HTMLElement) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
  });
};

export function DocsPage() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(() => sectionFromLocation() ?? 'despre');

  useEffect(() => {
    const initialSection = sectionFromLocation();
    if (initialSection === undefined) titleRef.current?.focus();
    else focusSection(initialSection);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const sections = pageSections
      .map(([id]) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        if (visible?.target instanceof HTMLElement) setActiveSection(visible.target.id);
      },
      { rootMargin: '-18% 0px -68%', threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!navigationOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setNavigationOpen(false);
      window.requestAnimationFrame(() => navigationToggleRef.current?.focus());
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [navigationOpen]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mobileLayout = window.matchMedia('(max-width: 799px)');
    const closeNavigationWhenLeavingMobile = (event: MediaQueryListEvent): void => {
      if (!event.matches) setNavigationOpen(false);
    };
    mobileLayout.addEventListener('change', closeNavigationWhenLeavingMobile);
    return () => mobileLayout.removeEventListener('change', closeNavigationWhenLeavingMobile);
  }, []);

  const closeNavigationAndFocus = (id: string): void => {
    setActiveSection(id);
    setNavigationOpen(false);
    focusSection(id);
  };

  return (
    <main className="docs-layout">
      <aside className="docs-nav" aria-label="Cuprins documentatie">
        <button
          ref={navigationToggleRef}
          type="button"
          className="docs-nav__toggle"
          aria-controls="docs-navigation"
          aria-expanded={navigationOpen}
          onClick={() => setNavigationOpen((open) => !open)}
        >
          <span>Cuprins</span>
          <span aria-hidden="true">{navigationOpen ? '−' : '+'}</span>
        </button>
        <div
          id="docs-navigation"
          className={`docs-nav__body${navigationOpen ? ' docs-nav__body--open' : ''}`}
        >
          <div className="docs-nav__identity">
            <div className="docs-nav__title">Documentatie</div>
            <span>BAC</span>
          </div>
          {/* <a className="docs-skip" href="#docs-title">
            Sari la continut
          </a> */}
          <nav aria-label="Sectiuni documentatie">
            {sectionGroups.map((group) => (
              <div className="docs-nav__group" key={group.label}>
                <span className="docs-nav__group-label">{group.label}</span>
                {group.sections.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    aria-current={activeSection === id ? 'location' : undefined}
                    onClick={() => closeNavigationAndFocus(id)}
                  >
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <article className="docs-content" inert={navigationOpen ? true : undefined}>
        <header className="docs-hero">
          <h1 ref={titleRef} id="docs-title" tabIndex={-1}>
            Pseudocod BAC-RO
          </h1>
        </header>

        <section id="despre" className="docs-overview">
          <h2>Despre BAC-RO</h2>
          <p className="docs-lead">
            BAC-RO este un dialect, construit pentru conventiile de pseudocod folosite la
            bacalaureatul din Romania. Pastreaza notatia din subiecte si defineste detalii de
            runtime de care un interpretor si un debugger au nevoie.
          </p>
          <dl className="docs-meta">
            <div>
              <dt>Versiune</dt>
              <dd>1.0</dd>
            </div>
            <div>
              <dt>Variabile</dt>
              <dd>Scalare</dd>
            </div>
            <div>
              <dt>Text</dt>
              <dd>ASCII</dd>
            </div>
          </dl>
          <Callout title="Conventie importanta">
            Cuvintele cheie sunt afisate fara diacritice. La copy&paste sunt acceptate si forme
            precum <code>citește</code>, <code>dacă</code> sau <code>până când</code>. Formatorul
            produce intotdeauna forma care contine doar caractere ASCII.
          </Callout>
        </section>

        <section id="primul-program">
          <h2>Primul program</h2>
          <p>
            Un program este o secventa de instructiuni. Variabilele nu se declara separat: ele sunt
            create de instructiunea <code>citeste</code> sau la prima atribuire.
          </p>
          <CodeBlock>{`citeste a, b
suma <- a + b
scrie suma`}</CodeBlock>
          <p>
            In exemplul de mai sus, pentru datele de intrare <code>7 12</code>, variabilele primesc
            valorile in ordine si se afiseaza <code>19</code>.
          </p>
        </section>

        <section id="model-lexical">
          <h2>Token-uri si identificatori</h2>
          <p>
            Lexer-ul separa codul sursa in token-uri: cuvinte cheie, identificatori, valori
            literale, operatori si delimitatori. Spatiile si liniile goale nu schimba semantica, iar
            un comentariu incepe cu <code>//</code> si continua pana la finalul liniei.
          </p>
          <ul>
            <li>
              Un identificator incepe cu o litera sau <code>_</code>.
            </li>
            <li>
              Restul numelui poate contine litere, cifre si <code>_</code>.
            </li>
            <li>
              Keywords sunt case-insensitive: <code>DACA</code> si <code>daca</code> sunt
              echivalente.
            </li>
            <li>
              Mai multe instructiuni simple pot fi separate prin <code>;</code>.
            </li>
          </ul>
          <CodeBlock>{`// trei instructiuni pe acelasi rand
x <- 0; y <- 0; p <- 1`}</CodeBlock>
        </section>

        <section id="valori">
          <h2>Valori si variabile</h2>
          <p>Versiunea curenta a limbajului are patru tipuri de date:</p>
          <div className="docs-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tip</th>
                  <th>Exemple</th>
                  <th>Semantica</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>intreg</td>
                  <td>
                    <code>0</code>, <code>-42</code>, <code>250326</code>
                  </td>
                  <td>Precizie arbitrara; nu este limitat de tipul integer folosit de backend.</td>
                </tr>
                <tr>
                  <td>real</td>
                  <td>
                    <code>3.14</code>, <code>-0.5</code>
                  </td>
                  <td>Floating-point, conform formatului IEEE 754.</td>
                </tr>
                <tr>
                  <td>logic</td>
                  <td>
                    <code>adevarat</code>, <code>fals</code>
                  </td>
                  <td>Folosit de conditii si operatorii logici.</td>
                </tr>
                <tr>
                  <td>sir</td>
                  <td>
                    <code>&quot;rezultat&quot;</code>
                  </td>
                  <td>
                    Disponibil pentru output; operatiile avansate pe siruri <b>nu sunt</b>{' '}
                    disponibile.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Callout title="Variabila neinitializata" tone="warning">
            Folosirea unei variabile care nu a primit o valoare produce un runtime error (eroare de
            executie). Interpretorul nu seteaza implicit valoarea zero pentru o variabila
            neinitializata.
          </Callout>
        </section>

        <section id="operatori">
          <h2>Operatori si prioritate</h2>
          <p>
            Operatorii de pe un rand cu prioritate mai mare se evalueaza inaintea celor de pe
            randurile urmatoare. Parantezele rotunde pot schimba ordinea evaluarii.
          </p>
          <div className="docs-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prioritate</th>
                  <th>Operatori</th>
                  <th>Rol</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>
                    <code>[expresie]</code>, <code>(expresie)</code>
                  </td>
                  <td>Parte intreaga, grupare</td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>
                    <code>^</code>
                  </td>
                  <td>Ridicare la putere</td>
                </tr>
                <tr>
                  <td>3</td>
                  <td>
                    <code>+ -</code>
                  </td>
                  <td>Operatori aritmetici unari</td>
                </tr>
                <tr>
                  <td>4</td>
                  <td>
                    <code>* / %</code>
                  </td>
                  <td>Inmultire, impartire, rest</td>
                </tr>
                <tr>
                  <td>5</td>
                  <td>
                    <code>+ -</code>
                  </td>
                  <td>Adunare, scadere</td>
                </tr>
                <tr>
                  <td>6</td>
                  <td>
                    <code>= != &lt; &lt;= &gt; &gt;=</code>
                  </td>
                  <td>Comparatii</td>
                </tr>
                <tr>
                  <td>7</td>
                  <td>
                    <code>nu</code>
                  </td>
                  <td>Negatie logica</td>
                </tr>
                <tr>
                  <td>8</td>
                  <td>
                    <code>si</code>
                  </td>
                  <td>Conjunctie logica cu short-circuit</td>
                </tr>
                <tr>
                  <td>9</td>
                  <td>
                    <code>sau</code>
                  </td>
                  <td>Disjunctie logica cu short-circuit</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Operatorul <code>/</code> produce o valoare reala. Pentru catul intreg se foloseste
            notatia din subiecte: <code>[a / b]</code>. Operatorul <code>%</code> accepta doar
            operanzi intregi.
          </p>
        </section>

        <section id="intrare-iesire">
          <h2>Input si output</h2>
          <p>
            <code>citeste</code> preia valori succesive din sectiunea <span lang="en">Input</span>.
            O instructiune cu mai multe variabile este atomica: daca nu exista suficiente valori,
            runtime-ul trece in starea <code>WAITING_INPUT</code> fara sa modifice partial
            variabilele.
          </p>
          <CodeBlock>{`citeste n, m
scrie "suma=", n + m`}</CodeBlock>
          <p>
            Valorile sunt separate prin spatii, virgula sau <code>;</code>. Pentru un sir care
            contine spatii se folosesc ghilimele; sunt acceptate escape sequences precum{' '}
            <code>\n</code>, <code>\t</code>, <code>\\</code> si <code>\uXXXX</code>. Fiecare{' '}
            <code>scrie</code> adauga valorile sale in output stream.
          </p>
          <CodeBlock>{`scrie "A"
scrie "B"
scrie "\\n"
scrie "C"`}</CodeBlock>
          <p>
            <code>scrie</code> nu adauga automat un newline sau alt separator la final. In exemplul
            de mai sus, output-ul este <code>AB</code>, urmat de un newline explicit si apoi de{' '}
            <code>C</code>. Valorile din aceeasi instructiune <code>scrie</code> sunt separate
            printr-un spatiu; instructiunile consecutive continua exact dupa ultimul caracter
            afisat.
          </p>
        </section>

        <section id="decizie">
          <h2>Structura daca / altfel</h2>
          <CodeBlock>{`daca n % 2 = 0 atunci
  scrie "par"
altfel
  scrie "impar"
sfarsit daca`}</CodeBlock>
          <p>
            Conditia trebuie sa produca o valoare logica. Ramura <code>altfel</code> este optionala.
            In formatul vizual, <code>sfarsit daca</code> este redat prin coltul inferior si
            patratul negru.
          </p>
        </section>

        <section id="cat-timp">
          <h2>Structura cat timp</h2>
          <CodeBlock>{`cat timp n > 0 executa
  suma <- suma + n % 10
  n <- [n / 10]
sfarsit cat timp`}</CodeBlock>
          <p>
            Conditia este evaluata inaintea fiecarei iteratii. Daca este initial falsa, blocul de
            instructiuni nu se executa. Fiecare evaluare a conditiei este un pas vizibil in
            debugger.
          </p>
        </section>

        <section id="repeta">
          <h2>Structura repeta / pana cand</h2>
          <CodeBlock>{`repeta
  cifra <- n % 10
  n <- [n / 10]
pana cand n = 0`}</CodeBlock>
          <p>
            Body-ul se executa cel putin o data. Repetarea se opreste cand conditia devine{' '}
            <code>adevarat</code>. Aceasta structura <b>nu este</b> echivalenta cu{' '}
            <code>do...while</code> din C/C++.
          </p>
        </section>

        <section id="pentru">
          <h2>Structura pentru</h2>
          <CodeBlock>{`pentru i <- 1, n executa
  suma <- suma + i
sfarsit pentru

pentru i <- n, 1, -1 executa
  scrie i
sfarsit pentru`}</CodeBlock>
          <p>
            Capetele precizate sunt incluse in parcurgere. Expresiile pentru valoarea initiala,
            limita si pas se evalueaza o singura data la intrarea in bucla. Pasul implicit este{' '}
            <code>1</code>, iar pasul zero produce un runtime error.
          </p>
        </section>

        <section id="debugger">
          <h2>
            <span lang="en">Debugger</span> si <span lang="en">execution trace</span>
          </h2>
          <p>Debugger-ul opereaza la nivel semantic, nu doar la nivel de rand:</p>
          <ul>
            <li>
              <strong>Pas</strong> executa o atribuire, o citire, o afisare sau o evaluare de
              conditie.
            </li>
            <li>
              <strong>Inapoi</strong> produce intoarcerea la executia anterioara, restaurand starea
              variabilelor si afisarea.
            </li>
            <li>
              <strong>Ruleaza</strong> continua pana la final, input lipsa, eroare sau execution
              limit.
            </li>
            <li>
              Cand un <code>citeste</code> asteapta valori, campul{' '}
              <strong>Valori suplimentare</strong> adauga valori in <span lang="en">Input</span>;
              istoricul executiei nu este pierdut.
            </li>
            <li>
              <strong>Reseteaza</strong> sterge execution trace si reseteaza toate variabilele la
              starea initiala.
            </li>
          </ul>
          <p>
            Daca un rand contine <code>x &lt;- 0; y &lt;- 0</code>, cele doua atribuiri sunt doi
            pasi. Evidentierea din editor indica expresia activa, iar Variables afiseaza valoarea
            anterioara si valoarea noua.
          </p>
        </section>

        <section id="erori-limite">
          <h2>Diagnoza, erori de runtime si limite</h2>
          <p>
            Diagnozele emise de parser indica un loc exact in sursa si sunt separate de erorile de
            runtime. Un program cu erori de sintaxa nu poate fi executat.
          </p>
          <ul>
            <li>Impartirea sau restul la zero opresc executia.</li>
            <li>Tipurile incompatibile produc o eroare explicita.</li>
            <li>O limita de executie protejeaza interfata de bucle infinite.</li>
            <li>Output-ul si dimensiunea valorilor sunt limitate pentru predictibilitate.</li>
          </ul>
          <p>
            Configuratia standard permite 100.000 de pasi semantici, 65.536 biti pentru un intreg,
            512 noduri intr-o expresie si cate 1.000.000 de unitati de cod UTF-16 pentru un sir sau
            pentru output. Depasirea unei limite indica locul exact din sursa si nu finalizeaza
            executia instructiunii curente.
          </p>
        </section>

        <section id="compatibilitate">
          <h2>Compatibilitate cu notatia de la BAC</h2>
          <p>
            Parser-ul accepta forme ASCII si Unicode: <code>&lt;-</code>/<code>←</code>,{' '}
            <code>!=</code>/<code>≠</code>, <code>&lt;=</code>/<code>≤</code>. De asemenea, accepta
            keyword-uri cu diacritice la lipire si le normalizeaza. Liniile cu precizari precum{' '}
            <code>(numar natural nenul)</code> sunt metadate si nu genereaza instructiuni.
          </p>
          <p>
            BAC-RO este un dialect, dar care nu poate acoperi toate cazurile ce pot aparea in
            scrierea unui pseudocod. Cand o conventie oficiala nu precizeaza un caz limita, acea
            functionalitate e posibil sa nu fie acoperita de acest limbaj.
          </p>
          <Callout title="Liniile din formatul de examen">
            Reprezentarea oficiala foloseste linii subtiri continue, cu caracterele vizuale{' '}
            <code>┌</code>, <code>│</code> si <code>└</code>, nu linii intrerupte. Blocurile{' '}
            <code>daca</code>, <code>cat timp</code> si <code>pentru</code> se incheie cu un patrat
            negru; blocul <code>repeta</code> se incheie direct prin <code>pana cand conditie</code>
            .
          </Callout>
        </section>

        <section id="surse">
          <h2>Surse normative si versionare</h2>
          <p>
            Programa de examen stabileste continuturile, dar nu publica o gramatica formala
            completa. BAC-RO 1 separa de aceea conventiile observabile in documentele oficiale de
            deciziile explicite ale dialectului, precum operator precedence, tipurile runtime si
            tratarea erorilor.
          </p>
          <p>
            Pentru BAC 2026 ramane aplicabila programa aprobata pentru 2011. Programa noua aprobata
            prin OM 6930/2025 se aplica progresiv, incepand cu elevii clasei a IX-a din anul scolar
            2026-2027; tabelul ei de conventii uzuale confirma reprezentarea vizuala, dar nu este o
            gramatica formala pentru examenul curent.
          </p>
          <ul>
            <li>
              <a href="https://www.edu.ro/sites/default/files/Programa_Bac_2011_E%20d%29_Informatica.pdf">
                Programa pentru examenul de Bacalaureat — Informatica
              </a>
            </li>
            <li>
              <a href="https://www.edu.ro/sites/default/files/_fi%C8%99iere/Legislatie/2025/OMEC_6059_2025.pdf">
                Ordinul privind organizarea Bacalaureatului 2026
              </a>
            </li>
            <li>
              <a href="https://www.edu.ro/press_rel_02_2026">
                Publicarea oficiala a OM 6930/2025 si a programelor scolare aferente
              </a>
            </li>
          </ul>
        </section>

        <section id="planificat">
          <h2>
            <span lang="en">Tablouri unidimensionale</span> si <span lang="en">matrice</span>
          </h2>
          <Callout title="Planificat pentru versiunea urmatoare" tone="warning">
            Tablourile, accesarea elementelor si modul lor de initializare nu fac parte din BAC-RO
            1. Sintaxa va fi introdusa numai dupa ce stabilim explicit regulile de utilizare si
            interpretare a lucrului cu tablouri.
          </Callout>
        </section>
      </article>
    </main>
  );
}
