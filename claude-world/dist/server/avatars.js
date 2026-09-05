// Deterministic Hollywood-adjacent *archetypes* (not real people's likenesses),
// combined from two word lists so the cast feels bigger and funnier than a
// fixed roster. Same session always gets the same character.
const PREFIXES = [
    'The Caffeinated', 'The Reluctant', 'The Sleep-Deprived', 'The Overconfident',
    'The Chaos', 'The Legendary', 'The Merge-Conflict', 'The Rubber-Duck',
    'The Midnight', 'The Undefeated', 'The Rogue', 'The Notorious',
    'The Unstoppable', 'The Semi-Retired', 'The Battle-Hardened', 'The Ill-Advised',
    'The Free-Range', 'The Artisanal', 'The Off-Brand', 'The Deprecated',
    'The Experimental', 'The Overclocked', 'The Underpaid', 'The Self-Taught',
    'The Ninja-Adjacent', 'The Wanted', 'The Aspiring', 'The Certified',
    'The Discount', 'The Suspiciously Calm',
];
const ARCHETYPES = [
    { noun: 'Gunslinger', emoji: '🤠', color: '#c2703d' },
    { noun: 'Detective', emoji: '🕵️', color: '#4a5568' },
    { noun: 'Chosen One', emoji: '🕶️', color: '#2b2d42' },
    { noun: 'Rebel Pilot', emoji: '🚀', color: '#2b6cb0' },
    { noun: 'Femme Fatale', emoji: '💃', color: '#9b2c2c' },
    { noun: 'Underdog Boxer', emoji: '🥊', color: '#975a16' },
    { noun: 'Mad Scientist', emoji: '🧪', color: '#276749' },
    { noun: 'Wizard', emoji: '🧙', color: '#553c9a' },
    { noun: 'Spy', emoji: '🎩', color: '#1a202c' },
    { noun: 'Pirate Captain', emoji: '🏴‍☠️', color: '#744210' },
    { noun: 'Samurai', emoji: '⚔️', color: '#742a2a' },
    { noun: 'Vampire Hunter', emoji: '🧛', color: '#22543d' },
    { noun: 'Bounty Hunter', emoji: '🎯', color: '#7b341e' },
    { noun: 'Superhero', emoji: '🦸', color: '#c53030' },
    { noun: 'Villain', emoji: '🦹', color: '#2d3748' },
    { noun: 'Astronaut', emoji: '👨‍🚀', color: '#2c5282' },
    { noun: 'Cyborg', emoji: '🤖', color: '#4a5568' },
    { noun: 'Ninja', emoji: '🥷', color: '#1a1a1a' },
    { noun: 'Explorer', emoji: '🗺️', color: '#975a16' },
    { noun: 'Rockstar', emoji: '🎸', color: '#b83280' },
    { noun: 'Director', emoji: '🎬', color: '#3a3a3a' },
    { noun: 'Racer', emoji: '🏎️', color: '#c53030' },
    { noun: 'Time Traveler', emoji: '⏱️', color: '#2b6cb0' },
    { noun: 'Master Chef', emoji: '👨‍🍳', color: '#975a16' },
    { noun: 'Gremlin', emoji: '👹', color: '#4a5c2f' },
    { noun: 'Sommelier', emoji: '🍷', color: '#5c1a2b' },
    { noun: 'Barbarian', emoji: '🪓', color: '#6b3410' },
    { noun: 'Alchemist', emoji: '⚗️', color: '#3d5a4c' },
    { noun: 'Diplomat', emoji: '🎓', color: '#2c3e6b' },
    { noun: 'Gladiator', emoji: '🛡️', color: '#8a6d3b' },
];
function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}
export function avatarFor(sessionId) {
    const h = hash(sessionId);
    const prefix = PREFIXES[h % PREFIXES.length];
    const archetype = ARCHETYPES[Math.floor(h / PREFIXES.length) % ARCHETYPES.length];
    return { name: `${prefix} ${archetype.noun}`, emoji: archetype.emoji, color: archetype.color };
}
export function nameFor(sessionId, displayName) {
    return displayName?.trim() ? displayName : `Agent ${sessionId.slice(0, 4)}`;
}
// Same word lists as avatarFor, salted differently so an island's name never
// collides with an agent avatar name derived from the same string.
export function islandNameFor(projectPath) {
    const h = hash(`island:${projectPath}`);
    const prefix = PREFIXES[h % PREFIXES.length];
    const archetype = ARCHETYPES[Math.floor(h / PREFIXES.length) % ARCHETYPES.length];
    return `${prefix} ${archetype.noun}`;
}
