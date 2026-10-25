/**
 * StudySynth Lite — Deterministic Reasoning Engine V2
 * linguistics.js — Rule-based linguistic analysis, clause segmentation,
 * connective extraction, negation/modality/quantifier scoping, and voice normalization.
 */

(function (global) {
  'use strict';

  const Types = (typeof module !== 'undefined' && module.exports)
    ? require('./types.js')
    : global.ReasoningTypes;

  const { POLARITY, MODALITY, QUANTIFICATION } = Types;

  // Common sentence abbreviations to prevent false sentence splits
  const ABBREVIATIONS = new Set([
    'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'etc', 'i.e', 'e.g',
    'approx', 'dept', 'fig', 'no', 'vol', 'al', 'jan', 'feb', 'mar', 'apr',
    'aug', 'sep', 'sept', 'oct', 'nov', 'dec'
  ]);

  // ---------------------------------------------------------------------------
  // Sentence-role classification (Repair 002, Phase 4). Deterministic and
  // shared with the production generator: only 'assertion' sentences may
  // generate ordinary factual propositions. Interrogatives, instructions
  // and ambiguous fragments must never become factual claims.
  // ---------------------------------------------------------------------------
  const IMPERATIVE_PHRASES = [
    'think about', 'look at'
  ];
  const IMPERATIVE_VERBS = [
    'consider', 'imagine', 'take', 'observe', 'discuss', 'explain', 'compare',
    'answer', 'try', 'use', 'draw', 'write', 'describe', 'suppose', 'assume'
  ];
  const INTERROGATIVE_WORDS = [
    'what', 'who', 'whom', 'whose', 'which', 'when', 'where', 'why', 'how'
  ];
  const AUXILIARY_WORDS = [
    'do', 'does', 'did', 'is', 'are', 'was', 'were', 'can', 'could', 'will',
    'would', 'should', 'may', 'might', 'has', 'have', 'had'
  ];

  function classifySentenceRole(text) {
    if (!text || typeof text !== 'string') return 'ambiguous';
    const trimmed = String(text).trim().replace(/\s+/g, ' ');
    if (!trimmed) return 'ambiguous';
    // 1. Terminal question mark, including one followed by closing quotes
    //    or brackets.
    if (/\?\s*['"’”\)\]]*\s*$/.test(trimmed)) return 'interrogative';
    const lower = trimmed.toLowerCase();
    // 3 (checked before bare interrogative words, so "Explain why ..."
    //    is an instruction, not a question): textbook imperatives at the
    //    start of the sentence.
    for (const phrase of IMPERATIVE_PHRASES) {
      if (lower === phrase || lower.startsWith(phrase + ' ')) return 'instruction';
    }
    const firstWord = lower.split(/\s+/)[0].replace(/^[^a-z]+|[^a-z]+$/g, '');
    if (IMPERATIVE_VERBS.includes(firstWord)) return 'instruction';
    // 2. Interrogative constructions even when punctuation is missing.
    if (INTERROGATIVE_WORDS.includes(firstWord)) {
      // Subordinate-clause exception: "When light intensity increases,
      // the rate of photosynthesis increases ..." is an assertion with
      // a temporal clause, not a question. A question in this form
      // would end with a question mark, which is handled above, so a
      // when/where/why/how sentence with a comma followed by a main
      // clause is not interrogative.
      if (['when', 'where', 'why', 'how'].includes(firstWord)) {
        const commaIndex = trimmed.indexOf(',');
        if (commaIndex > 0 && trimmed.slice(commaIndex + 1).trim().split(/\s+/).length >= 2) {
          // Fall through to assertion.
        } else {
          return 'interrogative';
        }
      } else {
        return 'interrogative';
      }
    }
    if (AUXILIARY_WORDS.includes(firstWord)) {
      // A sentence opening with an auxiliary verb is a question in
      // textbook prose ("Is the river...?", "Do human actions...?").
      // An assertion that merely contains an auxiliary later in the
      // sentence is unaffected, because only the first word is checked.
      return 'interrogative';
    }
    // 4. Fragments, prompt-like text and unclear roles are ambiguous.
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return 'ambiguous';
    if (/[:_]{2,}|_{3,}|\.\.\./.test(trimmed)) return 'ambiguous';
    if (/^(q\.|question|activity|exercise|note|hint)\s*[:.]/i.test(trimmed)) return 'ambiguous';
    // A three-word fragment ("Map of India") has no verb in the middle
    // position; a three-word assertion ("Rain helps farmers.") does.
    // The middle word ending in -s/-es is the usual third-person verb
    // form in textbook prose, so it counts as a verb here.
    if (words.length === 3) {
      // A three-word sentence may be subject-verb-object ("Rain helps
      // farmers.") or subject-verb ("The river floods."). Either the
      // middle or the last word being verb-like makes it an assertion;
      // a fragment such as "Map of India" has no verb in either place.
      const verbLikeWord = (w) => {
        const clean = w.replace(/[^a-z]/gi, '').toLowerCase();
        return /^(is|are|was|were|has|have|had|causes?|leads?|means?|refers?|consists?|includes?|helps?|supports?|affects?|flows?|floods?|rises?|falls?|grows?)$/i.test(w)
          || (clean.length > 3 && /s$/.test(clean) && !/ss$/.test(clean));
      };
      if (!verbLikeWord(words[1]) && !verbLikeWord(words[2])) return 'ambiguous';
    }
    return 'assertion';
  }

  // Clean and normalize whitespace while preserving exact offset mapping if needed
  function cleanText(text) {
    if (!text) return '';
    return String(text)
      .normalize('NFKC')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[ \t]+/g, ' ');
  }

  // Split text into sentences with exact character offsets
  function splitSentencesWithOffsets(text) {
    if (!text || typeof text !== 'string') return [];
    const cleaned = text;
    const sentences = [];
    let currentStart = 0;
    let i = 0;
    const len = cleaned.length;

    while (i < len) {
      const ch = cleaned[i];
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        // Lookahead check for abbreviations or decimal numbers
        const isNewline = ch === '\n';
        const isDecimal = !isNewline && i + 1 < len && /\d/.test(cleaned[i + 1]) && i > 0 && /\d/.test(cleaned[i - 1]);

        let isAbbrev = false;
        if (!isNewline && !isDecimal && ch === '.') {
          // Check previous token
          let tokenStart = i - 1;
          while (tokenStart >= currentStart && /[A-Za-z]/.test(cleaned[tokenStart])) {
            tokenStart--;
          }
          const word = cleaned.slice(tokenStart + 1, i).toLowerCase();
          if (ABBREVIATIONS.has(word)) {
            isAbbrev = true;
          }
        }

        if (!isDecimal && !isAbbrev) {
          // Check if boundary
          let end = i + 1;
          // Consume closing quotes or brackets
          while (end < len && /['"’”\)]/.test(cleaned[end])) {
            end++;
          }
          // Consume trailing spaces/newlines
          let nextStart = end;
          while (nextStart < len && /[ \t\r\n]/.test(cleaned[nextStart])) {
            nextStart++;
          }

          const rawSentence = cleaned.slice(currentStart, end).trim();
          if (rawSentence.length > 0) {
            // Calculate trim offset
            const offsetInSlice = cleaned.slice(currentStart, end).indexOf(rawSentence);
            const sentenceStart = currentStart + Math.max(0, offsetInSlice);
            const sentenceEnd = sentenceStart + rawSentence.length;
            sentences.push({
              text: rawSentence,
              start: sentenceStart,
              end: sentenceEnd
            });
          }
          currentStart = nextStart;
          i = nextStart - 1;
        }
      }
      i++;
    }

    if (currentStart < len) {
      const raw = cleaned.slice(currentStart).trim();
      if (raw.length > 0) {
        const offset = cleaned.slice(currentStart).indexOf(raw);
        sentences.push({
          text: raw,
          start: currentStart + offset,
          end: currentStart + offset + raw.length
        });
      }
    }

    return sentences;
  }

  // Connective pattern definitions
  const CAUSAL_CONNECTIVES = [
    { pattern: /\bbecause of\b/i, type: 'CAUSAL_PREPOSITION', direction: 'EFFECT_BEFORE_CAUSE' },
    { pattern: /\bbecause\b/i, type: 'CAUSAL_SUBORDINATE', direction: 'EFFECT_BEFORE_CAUSE' },
    { pattern: /\bas a result of\b/i, type: 'CAUSAL_PREPOSITION', direction: 'EFFECT_BEFORE_CAUSE' },
    { pattern: /\bas a result,\b/i, type: 'CAUSAL_ADVERBIAL', direction: 'CAUSE_BEFORE_EFFECT' },
    { pattern: /\bconsequently,\b/i, type: 'CAUSAL_ADVERBIAL', direction: 'CAUSE_BEFORE_EFFECT' },
    { pattern: /\bresults in\b/i, type: 'CAUSAL_VERB', direction: 'CAUSE_BEFORE_EFFECT' },
    { pattern: /\bleads to\b/i, type: 'CAUSAL_VERB', direction: 'CAUSE_BEFORE_EFFECT' },
    { pattern: /\bcauses\b/i, type: 'CAUSAL_VERB', direction: 'CAUSE_BEFORE_EFFECT' },
    { pattern: /\bcaused by\b/i, type: 'CAUSAL_PASSIVE', direction: 'EFFECT_BEFORE_CAUSE' },
    { pattern: /\bproduces\b/i, type: 'CAUSAL_VERB', direction: 'CAUSE_BEFORE_EFFECT' },
    { pattern: /\bproduced by\b/i, type: 'CAUSAL_PASSIVE', direction: 'EFFECT_BEFORE_CAUSE' },
    { pattern: /\benables\b/i, type: 'ENABLE_VERB', direction: 'CAUSE_BEFORE_EFFECT' },
    { pattern: /\bprevents\b/i, type: 'PREVENT_VERB', direction: 'CAUSE_BEFORE_EFFECT', polarity: POLARITY.NEGATIVE },
    { pattern: /\bthereby\b/i, type: 'CAUSAL_ADVERBIAL', direction: 'CAUSE_BEFORE_EFFECT' },
    { pattern: /\bdue to\b/i, type: 'CAUSAL_PREPOSITION', direction: 'EFFECT_BEFORE_CAUSE' }
  ];

  const CONDITIONAL_CONNECTIVES = [
    { pattern: /\bonly if\b/i, type: 'CONDITIONAL_NECESSARY' },
    { pattern: /\bif and only if\b/i, type: 'CONDITIONAL_BICONDITIONAL' },
    { pattern: /\bprovided that\b/i, type: 'CONDITIONAL_SUFFICIENT' },
    { pattern: /\bif\b/i, type: 'CONDITIONAL_SUFFICIENT' },
    { pattern: /\bwhen\b/i, type: 'CONDITIONAL_TEMPORAL' },
    { pattern: /\bwhenever\b/i, type: 'CONDITIONAL_GENERAL' },
    { pattern: /\bunless\b/i, type: 'CONDITIONAL_NEGATIVE' },
    { pattern: /\bin order to\b/i, type: 'PURPOSE_REQUIREMENT' }
  ];

  const CONTRAST_CONNECTIVES = [
    { pattern: /\bhowever,\b/i, type: 'CONTRAST_ADVERBIAL' },
    { pattern: /\bon the other hand,\b/i, type: 'CONTRAST_ADVERBIAL' },
    { pattern: /\bwhereas\b/i, type: 'CONTRAST_SUBORDINATE' },
    { pattern: /\bwhile\b/i, type: 'CONTRAST_SUBORDINATE' },
    { pattern: /\bunlike\b/i, type: 'CONTRAST_PREPOSITION' },
    { pattern: /\bin contrast to\b/i, type: 'CONTRAST_PREPOSITION' },
    { pattern: /\balthough\b/i, type: 'CONCESSION_SUBORDINATE' },
    { pattern: /\beven though\b/i, type: 'CONCESSION_SUBORDINATE' },
    { pattern: /\bdespite\b/i, type: 'CONCESSION_PREPOSITION' }
  ];

  const EXCEPTION_CONNECTIVES = [
    { pattern: /\bwith the exception of\b/i, type: 'EXCEPTION' },
    { pattern: /\bexcept for\b/i, type: 'EXCEPTION' },
    { pattern: /\bexcept\b/i, type: 'EXCEPTION' },
    { pattern: /\bexcluding\b/i, type: 'EXCEPTION' },
    { pattern: /\bapart from\b/i, type: 'EXCEPTION' }
  ];

  const SEQUENCE_CONNECTIVES = [
    { pattern: /\bfirst,\b/i, type: 'SEQ_FIRST' },
    { pattern: /\binitially,\b/i, type: 'SEQ_FIRST' },
    { pattern: /\bthen,\b/i, type: 'SEQ_NEXT' },
    { pattern: /\bsubsequently,\b/i, type: 'SEQ_NEXT' },
    { pattern: /\bfollowing this,\b/i, type: 'SEQ_NEXT' },
    { pattern: /\bfollowed by\b/i, type: 'SEQ_NEXT' },
    { pattern: /\bprior to\b/i, type: 'SEQ_PRIOR' },
    { pattern: /\bbefore\b/i, type: 'SEQ_PRIOR' },
    { pattern: /\bafter\b/i, type: 'SEQ_AFTER' },
    { pattern: /\bfinally,\b/i, type: 'SEQ_FINAL' }
  ];

  // Detect modality
  function detectModality(text) {
    if (/\b(?:must|strictly|always|necessarily|is required to|shall)\b/i.test(text)) {
      return MODALITY.OBLIGATION;
    }
    if (/\b(?:may|might|could|possibly|potentially|suggests that|hypothesized to)\b/i.test(text)) {
      return MODALITY.POSSIBILITY;
    }
    if (/\b(?:suppose|hypothetically|assuming)\b/i.test(text)) {
      return MODALITY.HYPOTHETICAL;
    }
    return MODALITY.FACT;
  }

  // Detect polarity and negation
  function detectPolarity(text) {
    // Check for explicit double negation first (e.g. "not uncommon", "not impossible")
    if (/\bnot\s+(?:uncommon|impossible|unlikely|insignificant)\b/i.test(text)) {
      return { polarity: POLARITY.POSITIVE, negationWord: null, doubleNegation: true };
    }
    const match = text.match(/\b(not|never|neither|nor|no|fails to|cannot|does not|did not|is not|are not|was not|were not|without|lacks)\b/i);
    if (match) {
      return {
        polarity: POLARITY.NEGATIVE,
        negationWord: match[1].toLowerCase(),
        doubleNegation: false
      };
    }
    return { polarity: POLARITY.POSITIVE, negationWord: null, doubleNegation: false };
  }

  // Detect quantification
  function detectQuantification(text) {
    if (/\b(?:all|every|each|universal|universally|entirely)\b/i.test(text)) {
      return QUANTIFICATION.UNIVERSAL;
    }
    if (/\b(?:no|none|neither|zero)\b/i.test(text)) {
      return QUANTIFICATION.NONE;
    }
    if (/\b(?:some|many|several|various|a portion of|partially)\b/i.test(text)) {
      return QUANTIFICATION.EXISTENTIAL;
    }
    return QUANTIFICATION.UNSPECIFIED;
  }

  // Parse sentence into structured linguistic clauses with connectives
  function analyzeSentenceLinguistics(sentenceObj, fullSourceText) {
    const raw = sentenceObj.text;
    const sStart = sentenceObj.start;
    const sEnd = sentenceObj.end;

    const modality = detectModality(raw);
    const polarityInfo = detectPolarity(raw);
    const quantification = detectQuantification(raw);

    // Identify connectives
    const detectedConnectives = [];

    // Search causal
    for (const c of CAUSAL_CONNECTIVES) {
      const match = c.pattern.exec(raw);
      if (match) {
        detectedConnectives.push({
          category: 'CAUSAL',
          name: match[0],
          type: c.type,
          direction: c.direction,
          index: match.index,
          length: match[0].length,
          polarityOverride: c.polarity || null
        });
      }
    }

    // Search conditional
    for (const c of CONDITIONAL_CONNECTIVES) {
      const match = c.pattern.exec(raw);
      if (match) {
        detectedConnectives.push({
          category: 'CONDITIONAL',
          name: match[0],
          type: c.type,
          index: match.index,
          length: match[0].length
        });
      }
    }

    // Search contrast
    for (const c of CONTRAST_CONNECTIVES) {
      const match = c.pattern.exec(raw);
      if (match) {
        detectedConnectives.push({
          category: 'CONTRAST',
          name: match[0],
          type: c.type,
          index: match.index,
          length: match[0].length
        });
      }
    }

    // Search exception
    for (const c of EXCEPTION_CONNECTIVES) {
      const match = c.pattern.exec(raw);
      if (match) {
        detectedConnectives.push({
          category: 'EXCEPTION',
          name: match[0],
          type: c.type,
          index: match.index,
          length: match[0].length
        });
      }
    }

    // Search sequence
    for (const c of SEQUENCE_CONNECTIVES) {
      const match = c.pattern.exec(raw);
      if (match) {
        detectedConnectives.push({
          category: 'SEQUENCE',
          name: match[0],
          type: c.type,
          index: match.index,
          length: match[0].length
        });
      }
    }

    // Sort detected connectives by position in sentence
    detectedConnectives.sort((a, b) => a.index - b.index);

    // Extract clauses based on primary connective or punctuation
    const clauses = [];
    if (detectedConnectives.length > 0) {
      let lastIndex = 0;
      for (const conn of detectedConnectives) {
        const leftPart = raw.slice(lastIndex, conn.index).trim();
        if (leftPart.length > 3) {
          clauses.push({
            text: leftPart,
            start: sStart + lastIndex,
            end: sStart + conn.index,
            role: 'PRE_CONNECTIVE'
          });
        }
        lastIndex = conn.index + conn.length;
      }
      const remainder = raw.slice(lastIndex).trim();
      if (remainder.length > 3) {
        clauses.push({
          text: remainder,
          start: sStart + lastIndex,
          end: sEnd,
          role: 'POST_CONNECTIVE'
        });
      }
    } else {
      clauses.push({
        text: raw,
        start: sStart,
        end: sEnd,
        role: 'INDEPENDENT'
      });
    }

    return {
      text: raw,
      start: sStart,
      end: sEnd,
      modality,
      polarity: polarityInfo.polarity,
      negationWord: polarityInfo.negationWord,
      doubleNegation: polarityInfo.doubleNegation,
      quantification,
      connectives: detectedConnectives,
      clauses
    };
  }

  // Extract core concepts (noun phrases, technical terms, named entities)
  function extractNounPhrases(clauseText) {
    if (!clauseText) return [];
    const tokens = clauseText
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const STOPWORDS = new Set([
      'the', 'this', 'that', 'these', 'those', 'with', 'from', 'into', 'during',
      'including', 'until', 'against', 'among', 'throughout', 'despite', 'towards',
      'upon', 'concerning', 'to', 'in', 'for', 'on', 'by', 'about', 'like', 'through',
      'over', 'before', 'between', 'after', 'since', 'without', 'under', 'within',
      'along', 'following', 'across', 'behind', 'beyond', 'plus', 'except', 'but', 'up',
      'out', 'around', 'down', 'off', 'above', 'near', 'and', 'or', 'nor', 'yet', 'so',
      'both', 'either', 'neither', 'not', 'only', 'can', 'may', 'will', 'must', 'should',
      'would', 'could', 'might', 'shall', 'been', 'have', 'has', 'had', 'having', 'were',
      'is', 'are', 'was', 'am', 'being', 'which', 'what', 'where', 'when', 'who', 'whom',
      'whose', 'why', 'how', 'each', 'every', 'all', 'any', 'most', 'some', 'such', 'very',
      'also', 'just', 'more', 'less'
    ]);

    const phrases = [];
    let current = [];
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (STOPWORDS.has(lower)) {
        if (current.length > 0) {
          const phrase = current.join(' ');
          if (phrase.length > 3) phrases.push(phrase);
          current = [];
        }
      } else {
        current.push(token);
      }
    }
    if (current.length > 0) {
      const phrase = current.join(' ');
      if (phrase.length > 3) phrases.push(phrase);
    }
    return phrases;
  }

  // Conservative concept normalization (preserves surface form, normalizes ID)
  function normalizeConcept(surface) {
    if (!surface) return '';
    let norm = String(surface)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Conservative plural to singular
    if (norm.endsWith('ies') && norm.length > 5) {
      norm = norm.slice(0, -3) + 'y';
    } else if (norm.endsWith('es') && norm.length > 4 && /[sxz]|ch|sh/.test(norm.slice(-4, -2))) {
      norm = norm.slice(0, -2);
    } else if (norm.endsWith('s') && !norm.endsWith('ss') && norm.length > 3) {
      norm = norm.slice(0, -1);
    }

    return norm;
  }

  const Linguistics = {
    cleanText,
    classifySentenceRole,
    splitSentencesWithOffsets,
    analyzeSentenceLinguistics,
    detectModality,
    detectPolarity,
    detectQuantification,
    extractNounPhrases,
    normalizeConcept,
    CAUSAL_CONNECTIVES,
    CONDITIONAL_CONNECTIVES,
    CONTRAST_CONNECTIVES,
    EXCEPTION_CONNECTIVES,
    SEQUENCE_CONNECTIVES
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Linguistics;
  global.ReasoningLinguistics = Linguistics;
})(typeof globalThis !== 'undefined' ? globalThis : this);
