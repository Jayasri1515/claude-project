/** Architecture 5.5. Exists so updatedAt and date logic are testable. */
export interface Clock {
  now(): Date;
}
