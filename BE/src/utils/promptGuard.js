// Edge-layer prompt-injection / jailbreak detection.
//
// This mirrors the AI service's app/services/prompt_guard.py so obvious direct
// attacks are rejected at the Node API boundary before they ever reach the AI
// service. The AI service remains the authoritative choke point — this is a
// fast, cheap first filter (defense in depth), not the only line of defense.
//
// Only run this against DIRECT user input (chat questions, review criteria,
// extraction column definitions, custom draft instructions). Never run it
// against document/PDF content — legitimate research papers trip the patterns.

// Warm, kind refusal shown when a direct attack is detected.
const KIND_REFUSAL =
  "I'd genuinely love to help you dig into your research papers! \u{1F60A} " +
  "I'm just not able to change how I work or step outside my role here. " +
  'But ask me anything about your uploaded documents — a summary, the key ' +
  "findings, a comparison across papers — and I'll jump right in.";

// Zero-width / bidi characters used to obfuscate keywords. Built from code
// points via RegExp so the source file contains no invisible characters.
const HIDDEN_CODEPOINTS = [
  0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x180e, // zero-width
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, // bidi
];
const HIDDEN_CHARS = new RegExp(
  '[' + HIDDEN_CODEPOINTS.map((cp) => '\\u' + cp.toString(16).padStart(4, '0')).join('') + ']',
  'g'
);

const INJECTION_PATTERNS = [
  // "ignore / disregard / forget / override the previous/system instructions"
  /\b(ignore|disregard|forget|override|bypass|neglect|overrule)\b[\s\S]{0,50}?\b(previous|prior|above|earlier|initial|original|all|your|these|the|system)\b[\s\S]{0,25}?\b(instruction|instructions|prompt|prompts|rule|rules|guideline|guidelines|directive|directives|context|constraint|constraints|restriction|restrictions)\b/i,
  // "reveal / show / repeat / what is your system prompt / instructions"
  /\b(reveal|show|print|display|repeat|reprint|expose|leak|disclose|tell me|give me|output|what\s+(is|are|were)|what'?s)\b[\s\S]{0,50}?\b(your|the|these|this|initial|original|system)\b[\s\S]{0,25}?\b(system\s+prompt|prompt|instruction|instructions|rule|rules|configuration|config|guidelines?|directive|directives)\b/i,
  // named jailbreak modes
  /\b(developer\s+mode|dev\s+mode|dan\s+mode|do\s+anything\s+now|jailbreak|jail\s*break|sudo\s+mode|god\s+mode|root\s+mode|unfiltered\s+mode|unrestricted\s+mode|no\s+restrictions\s+mode)\b/i,
  // "pretend / roleplay / act as ... with no rules / unrestricted / uncensored"
  /\b(pretend|imagine|roleplay|role-play|role\s+play|act\s+as|behave\s+as|you\s+are\s+now|from\s+now\s+on\s+you)\b[\s\S]{0,40}?\b(no\s+(rules|restrictions|limits|filter|guardrails)|without\s+(rules|restrictions|limits)|unrestricted|uncensored|unfiltered|jailbroken|evil|amoral|no\s+longer\s+bound)\b/i,
  // "repeat everything/the text above verbatim" (prompt-leak probe)
  /\b(repeat|print|output|echo|say)\b[\s\S]{0,25}?\b(everything|the\s+text|all\s+text|the\s+words|verbatim|above|preceding|prior)\b[\s\S]{0,25}?\b(above|before|prior|preceding|verbatim|system)\b/i,
  // direct identity-override
  /\byou\s+are\s+(now\s+)?(a\s+|an\s+)?(dan|jailbroken|unrestricted|uncensored|unfiltered|evil|different\s+ai|new\s+ai|no\s+longer)\b/i,
];

// Returns true if `text` looks like a direct jailbreak / prompt-extraction attempt.
function detectInjection(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.replace(HIDDEN_CHARS, '').replace(/[ \t\r\n]+/g, ' ');
  return INJECTION_PATTERNS.some((p) => p.test(normalized));
}

module.exports = { detectInjection, KIND_REFUSAL };
