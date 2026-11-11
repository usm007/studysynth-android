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

  // Sentence-role classification.
  //
  // Only declarative assertions may become facts. Questions, instructions,
  // captions, headings and bare labels are filtered before extraction so a
  // worksheet prompt or a diagram label can never be turned into a quiz item.
  const ASSERTION_ROLE = 'assertion';

  const WH_START = /^(?:what|which|who|whom|whose|where|when|why|how)\b/i;
  const AUX_START = /^(?:is|are|was|were|am|do|does|did|can|could|will|would|shall|should|may|might|must|has|have|had)\b/i;
  const INSTRUCTION_VERB = /^(?:state|name|explain|describe|define|list|give|write|find|calculate|choose|select|match|tick|fill|answer|discuss|compare|differentiate|identify|mention|observe|look|read|see|draw|label|mark|circle|underline|complete|solve|measure|count|arrange|classify|predict|guess|suggest|think|try|work|make|use|take|put|turn|open|close|pick|point|show|tell|recall|note|justify|prove|derive|verify|test|record|collect|visit|ask|prepare|paste|cut|colour|color|trace|locate|highlight)\b/i;
  const INSTRUCTION_OBJECT = /^(?:the|a|an|any|all|each|every|two|three|four|five|your|its|their|his|her|whether|why|how|what|which|who|where|when|if|in|on|at|from|with|by|below|above|following|out|one|another)\b/i;
  const CAPTION_START = /^(?:fig(?:ure)?|table|photo|chart|diagram|plate)\s*\.?\s*\d/i;
  const CAPTION_QUALIFIER = /^(?:map|chart|diagram|figure|table|photo|plate)\s+(?:showing|of|not to scale|based on|depicting|illustrating)\b/i;
  const SOURCE_NOTE = /^(?:source|legend|scale|note)\s*[:.]/i;
  const FINITE_VERB = /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|includes?|contains?|consists?|comprises?|stretches?|extends?|covers?|lies?|flows?|rises?|falls?|grows?|produces?|causes?|leads?|forms?|makes?|uses?|provides?|receives?|gets?|gives?|takes?|holds?|keeps?|shows?|means?|refers?|called|known|located|found|built|established|founded|became|becomes|remains?|appears?|seems?|occupies?|surrounds?|borders?|separates?|connects?|divides?|reaches?|measures?|weighs?|begins?|starts?|ends?|occurs?|happens?|exists?|represents?|indicates?|depends?|requires?|allows?|helps?|prevents?|enables?)\b/i;
  // Function words that can never end a complete sentence. A line that stops
  // on one of these was cut at a page, column, or box boundary.
  const TRUNCATED_END = /\b(?:a|an|the|of|in|on|at|to|and|or|but|with|for|from|by|as|that|which|who|whom|whose|is|are|was|were|be|been|being|has|have|had|its|their|his|her|this|these|those|such|than|then|when|where|while|because|into|over|under|between|among|through|during|about|after|before|against|within|without|across|along|around|behind|below|above|near|off|out|up|down|regarding|including|per|via)$/i;

  function classifySentenceRole(text) {
    const raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!raw) return 'fragment';

    const words = raw.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const endsWithQuestionMark = /\?["'”’)\]]*$/.test(raw);
    const endsWithTerminal = /[.!?]["'”’)\]]*$/.test(raw);
    const endsWithColon = /:$/.test(raw);

    if (endsWithQuestionMark) return 'question';

    if (CAPTION_START.test(raw) || CAPTION_QUALIFIER.test(raw) || SOURCE_NOTE.test(raw)) {
      return 'caption';
    }

    if (WH_START.test(raw)) {
      // "What is ...", "Why do ..." and chapter-title questions alike are not
      // assertions. A subordinate "When the rains arrive, ..." clause is rare
      // in textbook prose; excluding it is the safe choice.
      return 'question';
    }
    if (AUX_START.test(raw) && wordCount >= 3) {
      // "Is the ...", "Do plants ..." — interrogative word order.
      return 'question';
    }

    if (INSTRUCTION_VERB.test(raw)) {
      const rest = raw.replace(INSTRUCTION_VERB, '').trim();
      if (!rest || INSTRUCTION_OBJECT.test(rest) || /^[,;:]/.test(rest)) return 'instruction';
    }

    const hasVerb = FINITE_VERB.test(raw);
    const titleLike = wordCount <= 12 && !endsWithTerminal;
    const allCaps = /[A-Z]/.test(raw) && !/[a-z]/.test(raw);
    const titleCase = words.length > 1 &&
      words.filter((word) => /^[A-Z]/.test(word)).length >= Math.ceil(words.length * 0.6);

    // A sentence that stops on a function word was cut at a page or column
    // boundary; it is not a complete assertion.
    if (!endsWithTerminal && TRUNCATED_END.test(raw)) return 'fragment';

    if (titleLike && (allCaps || titleCase) && !hasVerb) return 'heading';
    if (!endsWithTerminal && !hasVerb && wordCount <= 8) return 'label';
    if (!endsWithTerminal && !hasVerb && wordCount <= 14 && (endsWithColon || titleCase)) return 'heading';

    return ASSERTION_ROLE;
  }

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

  // ---------------------------------------------------------------------------
  // Answer-span integrity
  //
  // A question option must be a short, self-contained phrase. These guards stop
  // sentence fragments, run-on clauses and discourse leftovers from becoming
  // correct answers or distractors. They are intentionally conservative: an
  // unsafe span is rejected, never trimmed, because a trimmed option can change
  // the meaning of the source claim.
  // ---------------------------------------------------------------------------
  const SPAN_FUNCTION_WORD_END = /^(?:a|an|the|of|in|on|at|to|and|or|but|with|for|from|by|as|that|which|who|whom|whose|is|are|was|were|be|been|being|has|have|had|its|their|his|her|this|these|those|such|than|then|when|where|while|because|into|over|under|between|among|through|during|about|after|before|against|within|without|across|along|around|behind|below|above|near|regarding|including|per|via)$/i;
  const SPAN_DISCOURSE_OPENER = /^(?:hence|however|thus|therefore|moreover|furthermore|similarly|likewise|consequently|in\s+fact|indeed|also|for\s+example|for\s+instance|given\s+below|given\s+above|on\s+the\s+other\s+hand|in\s+addition|as\s+a\s+result|meanwhile|nevertheless|in\s+contrast|by\s+contrast|this|these|those|it|they)\b/i;
  const SPAN_SENTENCE_PUNCT = /(?:[;?!:]|\.\s|\.$)/;
  const SPAN_QUOTES = /["“”‘’]/;
  const SPAN_BAD_START = /^(?:them|him|her|us|me|it|they|this|these|those|which|who|whom|whose|that|being|been|violated|reorganised|reorganized|created|continued|evolved|includes?|consists?|comprises?|contains?|integrates?|promotes?|provides?|helps?|allows?|enables?|imagine|soon|with|without|as|and|but|or)\b/i;
  const SPAN_EMBEDDED_SENTENCE_START = /\s(?:The|A|An|This|These|Those|It|They|He|She|We|You|In|On|At|For|But|And|However|Therefore|Thus|Hence|Soon|Imagine|Historians|According|When|While|If|After|Before|During|With|Without)\s/;
  const SPAN_CLAUSE_MARKER = /(?:;|\u2014|\u2013|\b(?:which|whom|whose|whereas|although|though)\b|,\s*(?:but|yet|so|and\s+then)\b)/i;
  const SPAN_FINITE_VERB = /\b(?:is|are|was|were|has|have|had|does|do|did|makes?|made|causes?|caused|shows?|showed|shown|means?|meant|said|includes?|included|becomes?|became|gives?|gave|takes?|took|comes?|came|goes?|went|consists?|comprises?|contains?|integrates?|promotes?|provides?|helps?|allows?|enables?|pursued|contained|imposed)\b/i;

  function lastWord(value) {
    const tokens = String(value || '').trim().split(/\s+/);
    return tokens.length ? tokens[tokens.length - 1] : '';
  }

  function endsOnFunctionWord(value) {
    const text = String(value || '').trim();
    if (/(?:and\s+)?so\s+on$/i.test(text)) return false;
    const token = lastWord(text).replace(/[.,;:!?"'”’)\]]+$/g, '');
    if (!token || /[’']/.test(lastWord(text))) return false;
    return SPAN_FUNCTION_WORD_END.test(token);
  }

  /**
   * True when a span can be shown verbatim as a multiple-choice option.
   */
  function isSafeSpan(value, maxLength) {
    const text = cleanText(value);
    const limit = Number.isFinite(maxLength) ? maxLength : 160;
    if (!text || text.length < 2 || text.length > limit) return false;
    if (SPAN_SENTENCE_PUNCT.test(text)) return false;
    if (SPAN_QUOTES.test(text)) return false;
    if (SPAN_DISCOURSE_OPENER.test(text)) return false;
    if (SPAN_BAD_START.test(text)) return false;
    if (SPAN_EMBEDDED_SENTENCE_START.test(text)) return false;
    if (endsOnFunctionWord(text)) return false;
    return true;
  }

  /**
   * True when a span is a concise noun phrase rather than a whole clause.
   */
  function isNounPhraseSpan(value, maxLength) {
    if (!isSafeSpan(value, maxLength)) return false;
    const text = cleanText(value);
    if (SPAN_CLAUSE_MARKER.test(text)) return false;
    if (text.split(/\s+/).length > 12) return false;
    if (text.split(/\s+/).length > 2 && SPAN_FINITE_VERB.test(text)) return false;
    return true;
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
    splitSentencesWithOffsets,
    classifySentenceRole,
    analyzeSentenceLinguistics,
    detectModality,
    detectPolarity,
    detectQuantification,
    extractNounPhrases,
    normalizeConcept,
    isSafeSpan,
    isNounPhraseSpan,
    endsOnFunctionWord,
    CAUSAL_CONNECTIVES,
    CONDITIONAL_CONNECTIVES,
    CONTRAST_CONNECTIVES,
    EXCEPTION_CONNECTIVES,
    SEQUENCE_CONNECTIVES
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Linguistics;
  global.ReasoningLinguistics = Linguistics;
})(typeof globalThis !== 'undefined' ? globalThis : this);
