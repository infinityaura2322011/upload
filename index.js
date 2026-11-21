"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.game = void 0;
const game_1 = require("./game");
// Simple CLI demonstration of the guessing game.
const game = (0, game_1.createGuessGame)();
exports.game = game;
console.log('Guess the number between 1 and 100.');
console.log('(This is a demo; the secret number is hidden.)');
