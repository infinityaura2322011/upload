"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGuessGame = createGuessGame;
/**
 * Creates a simple number guessing game.
 * @param target Optional target number for deterministic testing.
 */
function createGuessGame(target) {
    const secret = target ?? Math.floor(Math.random() * 100) + 1;
    return {
        secret,
        guess: (n) => {
            if (n === secret)
                return 'correct';
            return n < secret ? 'higher' : 'lower';
        }
    };
}
