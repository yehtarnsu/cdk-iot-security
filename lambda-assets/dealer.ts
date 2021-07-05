export interface Dealer <T> {
  deal(): T | Promise<T>;
}

export enum State {
  Incomplete,
  Complete,
}