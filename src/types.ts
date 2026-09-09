export type Question = {
  id: string; // Add a unique ID for React keys
  type: 'q';
  q: string;
  a: string;
  pts: number;
};

export type Wildcard = {
  id: string; // Add a unique ID for React keys
  type: 'w';
  action: 'free' | 'lose' | 'steal' | 'swap';
  text: string;
  pts: number;
};

export type CardData = Question | Wildcard;

export type QuizItem = Omit<Question, 'id'> | Omit<Wildcard, 'id'>;

export type Quiz = {
  id: string;
  name: string;
  bank: QuizItem[];
  userId?: string;
};

export type Team = {
  name: string;
  score: number;
};

export type GameMode = 'standard' | 'conquer';
export type DisplayStrategy = 'show' | 'hide';

