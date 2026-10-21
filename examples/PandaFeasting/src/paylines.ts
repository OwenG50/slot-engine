/** Image order: top row left-to-right, then bottom row left-to-right.
 * Values are row indices: 0 = top, 1 = middle, 2 = bottom. */
export const PAYLINES: Record<number, number[]> = {
  1: [0, 0, 0, 0, 0],
  2: [1, 1, 1, 1, 1],
  3: [2, 2, 2, 2, 2],
  4: [0, 1, 2, 1, 0],
  5: [2, 1, 0, 1, 2],
  6: [0, 1, 0, 1, 0],
  7: [1, 2, 1, 2, 1],
  8: [1, 0, 1, 0, 1],
  9: [2, 1, 2, 1, 2],
  10: [0, 0, 1, 2, 2],
  11: [2, 2, 1, 0, 0],
}
