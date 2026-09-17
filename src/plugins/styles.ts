import type { Style } from '../plugin';

export const styles: Style[] = [
  {
    id: 'cold-open',
    name: 'Cold open',
    arc: 'Beat 1 is the hardest number in the source, said bare, with no set-up. The middle beats say what it breaks and what moved it. The last beat names the one thing that would change the picture.',
    lines:
      'The first sentence is under ten words and carries a figure. Nothing before it — no date, no company description, no "this week".',
  },
  {
    id: 'counter',
    name: 'The other side',
    arc: 'Beat 1 states what the market already believes, flatly and fairly. Beat 2 turns it with a fact from the source. The middle beats stack the rest of the evidence. The last beat says what would have to be true for the consensus to survive.',
    lines:
      'Give the consensus its best case in one line before cutting it. The turn is a single word — but, except, only — never a paragraph.',
  },
  {
    id: 'three-things',
    name: 'Three things',
    arc: 'Beat 1 promises exactly three things and names what is at stake. The next three beats carry one fact each, strongest last. The final beat says which of the three actually moves the position.',
    lines:
      'Each of the three opens with its own number or name. Drop the "first, second, third" scaffolding — the count is already in the hook.',
  },
  {
    id: 'question',
    name: 'The question',
    arc: 'Beat 1 asks the question the desk is actually asking, in plain words. The middle beats answer it one step at a time with the figures in the source. The last beat answers it outright in one sentence.',
    lines:
      'Ask once, at the top, and never re-ask it. The answer arrives before the clip ends; no teasing, no "stay tuned".',
  },
  {
    id: 'timeline',
    name: 'How it happened',
    arc: 'Beat 1 opens at the moment something changed. The middle beats run in order — what happened, what it triggered, what it cost. The last beat is the next dated event worth watching.',
    lines:
      'Use only the dates the source gives, in order, one move per beat. Say "then" as rarely as possible; the order does the work.',
  },
  {
    id: 'stake',
    name: 'Who pays',
    arc: 'Beat 1 names who wins or loses and by how much. The middle beats walk the mechanism — the price, the volume, the margin that carries it. The last beat names the risk that breaks the trade.',
    lines:
      'Every beat lands on money: a figure, a margin, a share of revenue. No abstraction without a number under it.',
  },
];
