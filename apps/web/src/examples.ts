export interface ExampleProgram {
  readonly description: string;
  readonly id: string;
  readonly input: string;
  readonly name: string;
  readonly source: string;
}

export const examples: readonly ExampleProgram[] = [
  {
    id: 'cifre-pare',
    name: 'Cifre pare',
    description: 'Exemplu de tip BAC cu repeta, decizie si mai multe atribuiri.',
    input: '250326',
    source: `citeste n
// n este numar natural
x <- 0; y <- 0; p <- 1
repeta
  c <- n % 10; n <- [n / 10]
  daca c % 2 = 0 atunci
    x <- x * 10 + c
    y <- c * p + y; p <- p * 10
  sfarsit daca
pana cand n = 0
daca x < y atunci
  scrie x
altfel
  scrie y
sfarsit daca`,
  },
  {
    id: 'cmmdc',
    name: 'Algoritmul lui Euclid',
    description: 'Bucla cu test initial si doua variabile de intrare.',
    input: '48 18',
    source: `citeste a, b
cat timp b != 0 executa
  r <- a % b
  a <- b
  b <- r
sfarsit cat timp
scrie a`,
  },
  {
    id: 'suma',
    name: 'Suma 1..n',
    description: 'Structura pentru, cu limite incluse si pas implicit.',
    input: '10',
    source: `citeste n
s <- 0
pentru i <- 1, n executa
  s <- s + i
sfarsit pentru
scrie s`,
  },
] as const;
