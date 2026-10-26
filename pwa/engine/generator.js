/**
 * StudySynth Lite — Client-Side Deterministic Quiz Engine
 * Runs 100% offline in browser (Android PWA) and Node.js environments.
 *
 * The engine is deliberately conservative: it extracts a small set of
 * explicitly recognisable fact patterns, verifies every answer against that
 * registry, and abstains when the source cannot support a safe MCQ.
 */

(function (global) {
  let ReasoningV2 = null;
  if (typeof require === 'function') {
    try {
      ReasoningV2 = require('./reasoning/engine_v2.js');
    } catch (_) {
      ReasoningV2 = (typeof global !== 'undefined' && global.StudySynthReasoningV2) || null;
    }
  } else {
    ReasoningV2 = (typeof global !== 'undefined' && global.StudySynthReasoningV2) || null;
  }

  const KEYS = ['A', 'B', 'C', 'D'];
  const DEFAULT_TARGET = 15;
  const LOW_OCR_CONFIDENCE = 90;
  const VALID_CONFUSION_TYPES = [
    'adjacent_value', 'wrong_entity', 'wrong_date', 'partial_truth',
    'near_synonym', 'wrong_place', 'scope_error', 'reversed_relation'
  ];
  const VALID_DISTRACTOR_PURPOSES = [
    'adjacent_value', 'wrong_entity', 'wrong_date', 'partial_truth',
    'confusable_fact', 'wrong_category', 'scope_error', 'reversed_relation'
  ];
  const FILLER_PATTERNS = [
    'in accordance with statutory guidelines',
    'under applicable norms',
    'nodal oversight of competent statutory authority',
    'regulatory framework is strictly deferred',
    'jurisdiction applies exclusively to foreign commercial enterprises',
    'provisions are restricted to emergency measures'
  ];

  const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
  const DATE_TOKEN = `(?:\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}|(?:${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}|(?:${MONTHS})\\s+\\d{4}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4})`;
  const DATE_RANGE = `${DATE_TOKEN}\\s+(?:and|to)\\s+${DATE_TOKEN}`;

  const EVENT_META = {
    established: { relation: 'establishment_year', base: 'establish', passive: true },
    founded: { relation: 'establishment_year', base: 'found', passive: true },
    formed: { relation: 'establishment_year', base: 'form', passive: true },
    created: { relation: 'establishment_year', base: 'create', passive: true },
    constituted: { relation: 'establishment_year', base: 'constitute', passive: true },
    incorporated: { relation: 'establishment_year', base: 'incorporate', passive: true },
    'set up': { relation: 'establishment_year', base: 'set up', passive: true },
    commissioned: { relation: 'completion_year', base: 'commission', passive: true },
    launched: { relation: 'launch_year', base: 'launch', passive: true },
    started: { relation: 'launch_year', base: 'start', passive: true },
    introduced: { relation: 'launch_year', base: 'introduce', passive: true },
    began: { relation: 'launch_year', base: 'begin', passive: true },
    implemented: { relation: 'implementation_year', base: 'implement', passive: true },
    approved: { relation: 'approval_year', base: 'approve', passive: true },
    opened: { relation: 'completion_year', base: 'open', passive: true },
    enacted: { relation: 'enactment_year', base: 'enact', passive: true },
    adopted: { relation: 'adoption_year', base: 'adopt', passive: true },
    signed: { relation: 'signing_year', base: 'sign', passive: true },
    built: { relation: 'completion_year', base: 'build', passive: true },
    constructed: { relation: 'completion_year', base: 'construct', passive: true },
    held: { relation: 'event_year', base: 'hold', passive: true },
    conducted: { relation: 'event_year', base: 'conduct', passive: true },
    organised: { relation: 'event_year', base: 'organise', passive: true },
    organized: { relation: 'event_year', base: 'organize', passive: true },
    announced: { relation: 'approval_year', base: 'announce', passive: true },
    declared: { relation: 'event_year', base: 'declare', passive: true },
    passed: { relation: 'enactment_year', base: 'pass', passive: true },
    ratified: { relation: 'adoption_year', base: 'ratify', passive: true },
    published: { relation: 'launch_year', base: 'publish', passive: true },
    released: { relation: 'launch_year', base: 'release', passive: true },
    completed: { relation: 'completion_year', base: 'complete', passive: true },
    awarded: { relation: 'event_year', base: 'award', passive: true },
    renamed: { relation: 'event_year', base: 'rename', passive: true },
    merged: { relation: 'event_year', base: 'merge', passive: true },
    dissolved: { relation: 'event_year', base: 'dissolve', passive: true },
    occurred: { relation: 'event_year', base: 'occur', passive: false },
    happened: { relation: 'event_year', base: 'happen', passive: false },
    'took place': { relation: 'event_year', base: 'take place', passive: false }
  };
  const EVENT_VERB_RE = Object.keys(EVENT_META).sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');

  const BY_VERB_RE = 'launched|introduced|implemented|developed|approved|created|established|founded|built|constructed|conducted|organised|organized|published|designed|administered|commissioned|ratified|awarded|managed';
  const SINGLE_VALUED_RELATIONS = new Set([
    'establishment_year', 'completion_year', 'launch_year', 'implementation_year',
    'approval_year', 'enactment_year', 'adoption_year', 'signing_year', 'event_year',
    'move_year', 'date_field', 'event_range', 'numeric_value', 'definition',
    'initial_location', 'destination_location', 'location', 'office', 'launched_by',
    'implemented_by', 'developed_by', 'function', 'method', 'role', 'equipment',
    'causes', 'comparison', 'members', 'sequence', 'superlative'
  ]);
  const SUBTYPE_RANK = {
    // V2 Reasoning Subtypes (Prioritized for Conceptual Understanding)
    multihop_synthesis: 0,
    contrastive_explanation: 0,
    conceptual_discrimination: 0,
    causal_reasoning: 0,
    counterfactual_reasoning: 0,
    rule_application: 0,
    exception_reasoning: 0,
    conditional_reasoning: 0,
    comparative_reasoning: 0,
    process_sequence: 0,
    constraint_inference: 0,
    evidence_conclusion: 0,
    error_diagnosis: 0,
    category_classification: 0,
    quantitative_reasoning: 0,

    // Legacy Factual Subtypes (Preserving baseline single-fact priority over multi-statement)
    date_recall: 0,
    numeric_recall: 0,
    entity_attribute: 1,
    definition: 2,
    fill_blank: 3,
    comparison: 4,
    classification_membership: 5,
    sequence_order: 6,
    cause_effect: 7,
    multi_statement: 8,
    statement_option: 9,
    multi_statement_3: 10,
    assertion_reason: 11,
    matching: 12,
    chronology: 13,
    table_question: 14
  };
  const SUBTYPE_FACT_TYPES = {
    date_recall: ['date'],
    numeric_recall: ['numeric'],
    entity_attribute: ['entity_attribute'],
    definition: ['definition'],
    fill_blank: ['date', 'numeric', 'entity_attribute', 'definition'],
    comparison: ['comparison'],
    classification_membership: ['membership'],
    sequence_order: ['sequence'],
    cause_effect: ['causal'],
    multi_statement: ['date', 'numeric', 'entity_attribute', 'definition'],
    multi_statement_3: ['date', 'numeric', 'entity_attribute', 'definition'],
    statement_option: ['date', 'numeric', 'entity_attribute', 'definition'],
    assertion_reason: ['causal', 'date', 'numeric', 'entity_attribute', 'definition'],
    matching: ['entity_attribute', 'definition', 'date', 'causal'],
    chronology: ['date'],
    table_question: ['table'],

    // V2 Conceptual Reasoning Subtypes
    rule_application: ['rule', 'entity_attribute', 'definition', 'causal'],
    causal_reasoning: ['causal'],
    conditional_reasoning: ['conditional', 'entity_attribute'],
    comparative_reasoning: ['comparison'],
    process_sequence: ['sequence'],
    constraint_inference: ['entity_attribute', 'definition'],
    category_classification: ['membership', 'definition'],
    exception_reasoning: ['entity_attribute', 'definition', 'membership'],
    contrastive_explanation: ['comparison', 'entity_attribute', 'causal'],
    evidence_conclusion: ['entity_attribute', 'causal', 'definition'],
    error_diagnosis: ['causal', 'comparison', 'entity_attribute'],
    quantitative_reasoning: ['numeric', 'comparison'],
    conceptual_discrimination: ['comparison', 'definition', 'entity_attribute'],
    multihop_synthesis: ['causal', 'entity_attribute', 'definition'],
    counterfactual_reasoning: ['causal', 'numeric', 'entity_attribute'],
    single_choice: ['date', 'numeric', 'entity_attribute', 'definition', 'comparison', 'causal', 'membership', 'sequence']
  };

  // Controlled distractor pools were removed (quality, cross-subject):
  // distractors must now come from the source itself, not from hardcoded
  // Indian/space topic lists that were off-topic for other subjects.
  // Exception: classification category rules below are narrow, same-type
  // alternatives (other colours for a colour list, other spacecraft for
  // a spacecraft list). They only trigger when the category matches,
  // and a single-list source cannot otherwise supply any distractors
  // at all — without them, a source listing only red/green/blue could
  // never produce a classification question.
  const CONTROLLED_CATEGORY_RULES = [
    { test: /colou?rs?\s+of\s+light|primary\s+colou?rs?/i, alternatives: ['yellow', 'orange', 'purple', 'violet'] },
    { test: /chandrayaan|spacecraft|lander/i, alternatives: ['Orion Capsule', 'Curiosity Rover', 'Cassini Orbiter', 'Artemis Lander'] },
    { test: /pragyan|rover|payload/i, alternatives: ['Magnetometer', 'Radiometer', 'Seismometer', 'Laser Altimeter'] },
    { test: /regolith|lunar soil/i, alternatives: ['Gold', 'Lead', 'Mercury', 'Silver'] },
    { test: /prasar\s+bharati|broadcaster/i, alternatives: ['NDTV', 'Zee Media', 'Star India', 'Sun TV Network'] },
    { test: /electronic\s+components?|semiconductor/i, alternatives: ['solar panels', 'wind turbines', 'display panels', 'optical fibres'] }
  ];

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function cleanText(str) {
    if (!str) return '';
    return str.toString().normalize('NFKC').replace(/\s+/g, ' ').trim();
  }

  // Sentence-role classification (Repair 002, Phase 4). This mirrors
  // ReasoningLinguistics.classifySentenceRole exactly, so the production
  // generator and Reasoning V2 apply the same deterministic rules. The
  // browser load order in index.html now loads reasoning first, and
  // when it is available the generator prefers that shared
  // implementation (see classifySentenceRoleShared below); the local
  // mirror is the fallback when reasoning is not loaded. Only
  // 'assertion' sentences may generate ordinary factual propositions.
  function classifySentenceRoleLocal(text) {
    if (!text || typeof text !== 'string') return 'ambiguous';
    const trimmed = String(text).trim().replace(/\s+/g, ' ');
    if (!trimmed) return 'ambiguous';
    if (/\?\s*['"’”\)\]]*\s*$/.test(trimmed)) return 'interrogative';
    const lower = trimmed.toLowerCase();
    const imperativePhrases = ['think about', 'look at'];
    for (const phrase of imperativePhrases) {
      if (lower === phrase || lower.startsWith(phrase + ' ')) return 'instruction';
    }
    // Exercise list markers ("c) Explain why this event was
    // important") and sentences that point at a table, figure or
    // page ("The table on the facing page provides...") are not
    // claims about the subject; they leaked into options and
    // statements in the manual read. Treat them as ambiguous so
    // extraction skips them, like any other non-assertion unit.
    if (/^(?:[a-e]|[ivx]{1,4}|\d+)\)\s/i.test(trimmed)) return 'ambiguous';
    if (/\b(facing page|table on|figure\s+\d|we saw|we have seen|as you may notice|you may notice|in grade\s+\d|previous chapter|next chapter|see page|on page\s+\d|as shown in|as mentioned)\b/i.test(trimmed)) return 'ambiguous';
    const imperativeVerbs = [
      'consider', 'imagine', 'take', 'observe', 'discuss', 'explain', 'compare',
      'answer', 'try', 'use', 'draw', 'write', 'describe', 'suppose', 'assume'
    ];
    const firstWord = lower.split(/\s+/)[0].replace(/^[^a-z]+|[^a-z]+$/g, '');
    if (imperativeVerbs.includes(firstWord)) return 'instruction';
    const interrogativeWords = ['what', 'who', 'whom', 'whose', 'which', 'when', 'where', 'why', 'how'];
    if (interrogativeWords.includes(firstWord)) {
      // Subordinate-clause exception: "When light intensity increases,
      // the rate of photosynthesis increases ..." is an assertion with
      // a temporal clause, not a question. A question in this form
      // would end with a question mark, which is handled above, so a
      // when/where/why/how sentence with a comma followed by a main
      // clause is not interrogative.
      if (['when', 'where', 'why', 'how'].includes(firstWord)) {
        const commaIndex = trimmed.indexOf(',');
        if (commaIndex > 0 && trimmed.slice(commaIndex + 1).trim().split(/\s+/).length >= 2) {
          // Fall through to assertion (it is not an imperative either,
          // as imperatives were checked above).
        } else {
          return 'interrogative';
        }
      } else {
        return 'interrogative';
      }
    }
    const auxiliaryWords = ['do', 'does', 'did', 'is', 'are', 'was', 'were', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'has', 'have', 'had'];
    if (auxiliaryWords.includes(firstWord)) return 'interrogative';
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return 'ambiguous';
    if (/[:_]{2,}|_{3,}|\.\.\./.test(trimmed)) return 'ambiguous';
    if (/^(q\.|question|activity|exercise|note|hint)\s*[:.]/i.test(trimmed)) return 'ambiguous';
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

  function classifySentenceRoleShared(text) {
    try {
      if (ReasoningV2 && ReasoningV2.Linguistics && typeof ReasoningV2.Linguistics.classifySentenceRole === 'function') {
        return ReasoningV2.Linguistics.classifySentenceRole(text);
      }
    } catch (e) { /* fall through to the local mirror */ }
    if (typeof global !== 'undefined' && global.ReasoningLinguistics && typeof global.ReasoningLinguistics.classifySentenceRole === 'function') {
      return global.ReasoningLinguistics.classifySentenceRole(text);
    }
    return classifySentenceRoleLocal(text);
  }

  function classifySentenceRole(text) {
    return classifySentenceRoleShared(text);
  }

  function splitSentences(text, locale = 'en') {
    text = cleanText(text);
    if (!text) return [];

    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
        const segments = Array.from(segmenter.segment(text), s => s.segment.trim());
        const result = [];
        for (const seg of segments) {
          if (seg.length >= 25 && seg.length <= 320) {
            result.push(seg);
          } else if (seg.length > 320) {
            const subs = seg.split(/;\s*|(?<=\w)\s*●\s*|(?<=\w)\s*[-—]\s*(?=[A-Z0-9])/);
            for (const sub of subs) {
              const cleanSub = cleanText(sub);
              if (cleanSub.length >= 25 && cleanSub.length <= 250) result.push(cleanSub);
            }
          }
        }
        if (result.length > 0) return result;
      } catch (e) {
        // Fall through to the regex segmenter.
      }
    }

    const rawParts = text.split(/(?<=[.!?;।॥\n])\s+(?=[A-Z0-9A-Za-z\u0900-\u097F])/);
    const res = [];
    for (const p of rawParts) {
      const pStr = cleanText(p);
      if (pStr.length >= 25 && pStr.length <= 320) {
        res.push(pStr);
      } else if (pStr.length > 320) {
        const subs = pStr.split(/;\s*|,\s*(?=[A-Z\u0900-\u097F])/);
        for (const sub of subs) {
          const cleanSub = cleanText(sub);
          if (cleanSub.length >= 25 && cleanSub.length <= 250) res.push(cleanSub);
        }
      }
    }
    return res;
  }

  function extractAnchors(text) {
    const anchors = new Set();
    const clean = cleanText(text);
    const patterns = [
      /\b(?:Article\s+\d+(?:\([a-z0-9]+\))*)/gi,
      /\b(?:Act,?\s+\d{4})/gi,
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g,
      /\b[A-Z]{2,}(?:-[A-Z]+)?\b/g,
      /(?:₹|\$|US\$)\s*[\d,.]+\s*(?:crore|billion|lakh|million|trillion)?/gi,
      /\b(?:19|20)\d{2}\b/g
    ];
    for (const pat of patterns) {
      const matches = clean.match(pat);
      if (!matches) continue;
      for (const m of matches) {
        const item = m.trim();
        if (item.length >= 3 && !/^(The|And|With|From|This|That|Under|Also|Such|Into)$/i.test(item)) {
          anchors.add(item);
        }
      }
    }
    return Array.from(anchors);
  }

  // Kept for API compatibility. Length balancing must never invent wording.
  function balanceDistractorLength(correctText, distractorText) {
    return cleanText(distractorText);
  }

  function normalizeWhitespace(value) {
    return String(value == null ? '' : value).normalize('NFKC').replace(/\s+/g, ' ').trim();
  }

  function normalizeOption(value) {
    return normalizeWhitespace(value)
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s*%\s*/g, '%')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:!?]+$/g, '')
      .trim();
  }

  function normalizeSubject(value) {
    return normalizeWhitespace(value)
      .toLowerCase()
      .replace(/^(?:the|a|an)\s+/i, '')
      .replace(/^(?:same)\s+/i, '')
      .replace(/[.,;:!?]+$/g, '')
      .trim();
  }

  function normalizeRelation(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '_');
  }

  function normalizeObject(value) {
    if (Array.isArray(value)) return value.map(normalizeObject).join('|');
    return normalizeWhitespace(value)
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s*%\s*/g, '%')
      .replace(/[.,;:!?]+$/g, '')
      .trim();
  }

  function optionSignature(value) {
    const text = normalizeOption(value);
    const numberMatch = text.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (numberMatch) {
      const numeric = numberMatch[0].replace(/,/g, '');
      const rest = text.replace(numberMatch[0], '#').replace(/\s+/g, ' ').trim();
      return `n:${numeric}|${rest}`;
    }
    return `t:${text}`;
  }

  function stableHash(value) {
    let hash = 0;
    const text = String(value == null ? '' : value);
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function padNumber(num, width) {
    return String(num).padStart(width, '0');
  }

  function isSentenceBoundary(source, index) {
    const char = source[index];
    if (char === '\n') return true;
    if (!/[.!?]/.test(char)) return false;

    const previous = source[index - 1] || '';
    const next = source[index + 1] || '';

    // Decimal points and dotted abbreviations (47.75, U.S) are not sentence ends.
    if (char === '.' && /[0-9]/.test(previous) && /[0-9]/.test(next)) return false;
    if (char === '.' && /[A-Za-z]/.test(previous) && /[A-Za-z]/.test(next)) return false;

    let cursor = index + 1;
    while (cursor < source.length && /[.!?]/.test(source[cursor])) cursor++;
    while (cursor < source.length && /[ \t\r]/.test(source[cursor])) cursor++;
    if (cursor >= source.length) return true;
    if (source[cursor] === '\n') return true;

    // A lowercase continuation is normally a decimal, abbreviation, or OCR fragment.
    if (/[a-z]/.test(source[cursor])) return false;

    const trailing = source.slice(Math.max(0, index - 14), index);
    const tokenMatch = trailing.match(/([A-Za-z][A-Za-z.]*)$/);
    const token = tokenMatch ? tokenMatch[1] : '';
    if (/^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|e\.g|i\.e|No|Fig|pp|Vol|Inc|Ltd|Co|Corp|Dept|Est|approx|Gov|Hon|Smt|Shri|al)$/i.test(token)) {
      return false;
    }
    if (/^(?:[A-Za-z]\.){1,}[A-Za-z]?$/.test(token)) return false;
    return true;
  }

  function segmentSentencesWithOffsets(text) {
    const source = String(text == null ? '' : text);
    const records = [];
    if (!source.trim()) return records;

    let cursor = 0;
    while (cursor < source.length) {
      while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
      if (cursor >= source.length) break;
      const start = cursor;
      let boundary = -1;
      while (cursor < source.length) {
        const char = source[cursor];
        if (char === '\n') {
          boundary = cursor;
          break;
        }
        if (/[.!?]/.test(char) && isSentenceBoundary(source, cursor)) {
          boundary = cursor + 1;
          while (boundary < source.length && /[.!?]/.test(source[boundary])) boundary++;
          break;
        }
        cursor++;
      }
      if (boundary === -1) boundary = source.length;
      let end = boundary;
      while (end > start && /\s/.test(source[end - 1])) end--;
      if (end > start) {
        const sentence = source.slice(start, end);
        if (sentence.replace(/[^A-Za-z0-9\u0900-\u097F]/g, '').length >= 6) {
          records.push({ text: sentence, start, end });
        }
      }
      cursor = boundary > start ? boundary : start + 1;
    }

    if (!records.length && source.trim()) {
      const start = source.search(/\S/);
      const end = source.length - (source.match(/\s*$/) || [''])[0].length;
      records.push({ text: source.slice(start, end), start, end });
    }
    return records;
  }

  function sourceConfidenceClass(sourceMeta) {
    if (!sourceMeta || !sourceMeta.origin) return 'verified';
    if (sourceMeta.origin !== 'ocr') return 'verified';
    const confidence = Number.isFinite(sourceMeta.confidence) ? sourceMeta.confidence : 0;
    if (confidence < LOW_OCR_CONFIDENCE) {
      return sourceMeta.confirmed ? 'ocr-confirmed' : 'ocr-unverified';
    }
    return 'verified';
  }

  function factConfidenceClass(draft, sourceMeta) {
    if (draft && draft.extraction_method === 'fallback') {
      if (sourceMeta && sourceMeta.origin === 'ocr') return sourceConfidenceClass(sourceMeta);
      return 'unclassified';
    }
    return sourceConfidenceClass(sourceMeta);
  }

  function locateInSection(sectionText, needle, fallbackStart, fallbackEnd) {
    if (!needle) return { start: fallbackStart, end: fallbackEnd };
    const index = sectionText.indexOf(needle);
    if (index === -1) return { start: fallbackStart, end: fallbackEnd };
    return { start: index, end: index + needle.length };
  }

  function buildFactIndex(facts) {
    const index = {
      facts: facts || [],
      byType: Object.create(null),
      byRelation: Object.create(null),
      bySubject: Object.create(null),
      places: [],
      institutions: [],
      persons: [],
      definitions: [],
      functions: [],
      roles: [],
      equipment: [],
      effects: [],
      comparisons: [],
      members: [],
      dates: [],
      numbers: []
    };
    const addUnique = (bucket, value) => {
      if (!value) return;
      const normalized = normalizeObject(value);
      if (!normalized) return;
      if (!bucket.some((item) => normalizeObject(item) === normalized)) bucket.push(value);
    };

    for (const fact of index.facts) {
      const type = fact.fact_type || 'fallback';
      (index.byType[type] || (index.byType[type] = [])).push(fact);
      const relation = fact.normalized_relation || normalizeRelation(fact.relation);
      (index.byRelation[relation] || (index.byRelation[relation] = [])).push(fact);
      const subject = fact.normalized_subject || normalizeSubject(fact.subject);
      if (subject) (index.bySubject[subject] || (index.bySubject[subject] = [])).push(fact);

      if (type === 'date') {
        addUnique(index.dates, fact.object);
      } else if (type === 'numeric') {
        addUnique(index.numbers, fact.object);
      } else if (type === 'definition') {
        addUnique(index.definitions, fact.object);
      } else if (type === 'causal') {
        addUnique(index.effects, fact.object);
      } else if (type === 'comparison') {
        addUnique(index.comparisons, fact.object);
      } else if (type === 'membership') {
        for (const member of fact.members || []) addUnique(index.members, member);
      } else if (type === 'entity_attribute') {
        if (fact.answer_kind === 'place') addUnique(index.places, fact.object);
        else if (fact.answer_kind === 'institution') addUnique(index.institutions, fact.object);
        else if (fact.answer_kind === 'person') addUnique(index.persons, fact.object);
        else if (fact.answer_kind === 'role') addUnique(index.roles, fact.object);
        else if (fact.answer_kind === 'equipment') addUnique(index.equipment, fact.object);
        else if (fact.answer_kind === 'function') addUnique(index.functions, fact.object);
      }

      const subjectLooksInstitution = /\b(?:Ministry|Commission|Bank|Court|Mission|Institute|University|Council|Authority|Department|Committee|Board|Bharati)\b/.test(fact.subject || '');
      if (subjectLooksInstitution) addUnique(index.institutions, fact.subject);
      if (fact.answer_kind === 'place') addUnique(index.places, fact.object);
    }
    return index;
  }

  function normalizeRegistry(registry) {
    if (!registry) return { facts: [], index: buildFactIndex([]), conflicts: [], sections: [] };
    if (Array.isArray(registry)) {
      return { facts: registry, index: buildFactIndex(registry), conflicts: [], sections: [] };
    }
    const facts = Array.isArray(registry.facts) ? registry.facts : [];
    return {
      facts,
      index: registry.index || buildFactIndex(facts),
      conflicts: Array.isArray(registry.conflicts) ? registry.conflicts : [],
      sections: Array.isArray(registry.sections) ? registry.sections : [],
      inventory: registry.inventory
    };
  }

  function isFactUnsafe(fact) {
    if (!fact) return true;
    if (fact.extraction_method === 'fallback') return true;
    if (fact.fact_type === 'fallback') return true;
    if (fact.conflict_status === 'conflicting') return true;
    if (fact.confidence_class === 'ocr-unverified') return true;
    if (fact.polarity === 'negative') return true;
    if (fact.precision === 'approximate') return true;
    return false;
  }

  function relationLabel(relation) {
    const labels = {
      establishment_year: 'the establishment year',
      completion_year: 'the completion year',
      launch_year: 'the launch year',
      implementation_year: 'the implementation year',
      approval_year: 'the approval year',
      enactment_year: 'the enactment year',
      adoption_year: 'the adoption year',
      signing_year: 'the signing year',
      event_year: 'the event year',
      move_year: 'the move year',
      date_field: 'the recorded date',
      numeric_value: 'the stated value',
      initial_location: 'the initial location',
      destination_location: 'the destination location',
      location: 'the location',
      office: 'the office held',
      launched_by: 'the launching institution',
      implemented_by: 'the implementing institution',
      developed_by: 'the developing institution',
      function: 'the stated function',
      method: 'the stated method',
      role: 'the stated role',
      equipment: 'the equipment used',
      causes: 'the stated effect'
    };
    return labels[relation] || relation.replace(/_/g, ' ');
  }

  function inlineSubject(subject) {
    const text = cleanText(subject);
    return text.replace(/^(The|A|An)\s+/, (m) => m.toLowerCase());
  }

  // Words that can never name the thing a question is about. A subject that
  // starts with one of these is a leftover pronoun, modal or connective, not a
  // noun phrase a learner could look up.
  const UNUSABLE_SUBJECT_START = /^(?:we|you|they|it|this|that|there|these|those|he|she|i|us|them|their|his|her|its|our|your|has|have|had|is|are|was|were|do|does|did|will|would|shall|should|can|could|may|might|must|however|but|thus|therefore|hence|also|and|or|if|when|while|where|which|then|than|so|as|at|by|for|from|in|of|on|to|with|other|another|some|any|many|most|more|all|both|each|every|either|neither|such|together|only|even|now|here|again|still|yet|just|very|too|quite|rather|almost|about|around|over|under|between|among|through|across|along|behind|below|above|near|off|out|up|down)\b/i;

  // A subject has to be a noun phrase, not a sentence fragment. A lowercase
  // dummy pronoun anywhere inside it means extraction stopped mid-sentence.
  const DUMMY_SUBJECT_WORD = /\b(?:we|you|they|it|this|that|there|these|those|he|she|their|his|her|its|our|your|them|us|him|me)\b/;

  // Detailed explainable subject quality validation
  function checkSubjectQuality(value) {
    const text = cleanText(value);
    if (!text || text.length < 2) {
      return { valid: false, code: 'TOO_SHORT', reason: 'Subject is missing or under 2 characters' };
    }
    if (!/^[A-Za-z0-9"\u201c']/.test(text)) {
      return { valid: false, code: 'INVALID_START', reason: 'Subject must start with an alphanumeric character or quote' };
    }
    if (/[.?!]$/.test(text)) {
      return { valid: false, code: 'TERMINAL_PUNCTUATION_FRAGMENT', reason: 'Subject ends with sentence terminal punctuation' };
    }
    if (/(?<=[a-z0-9])\.\s+[A-Z]/.test(text) || text.includes(':') || text.includes(';')) {
      return { valid: false, code: 'INTERNAL_SENTENCE_BOUNDARY', reason: 'Subject contains an internal sentence boundary, colon, or semicolon' };
    }
    if (UNUSABLE_SUBJECT_START.test(text)) {
      return { valid: false, code: 'FORBIDDEN_START_WORD', reason: 'Subject starts with a pronoun, modal, auxiliary verb, or connective' };
    }
    if (DUMMY_SUBJECT_WORD.test(text)) {
      return { valid: false, code: 'DUMMY_PRONOUN', reason: 'Subject contains an internal dummy pronoun' };
    }
    // Manual-read gates: a subject that is a discourse fragment
    // ("Few indeed in the whole world"), contains a question word
    // ("Exposure to what"), contains a finite verb ("Soon the
    // club's membership increased and its activities"), or ends
    // in a correlative ("a well-planned city not only") is a
    // sentence fragment captured as a subject, not a noun phrase
    // a learner could look up on its own.
    if (/\bindeed\b/i.test(text)) {
      return { valid: false, code: 'DISCOURSE_FRAGMENT', reason: 'Subject contains a discourse word (indeed) and is not a clean noun phrase' };
    }
    if (/\b(what|why|how|when|where|who|whom|whose|which)\b/i.test(text)) {
      return { valid: false, code: 'QUESTION_WORD_SUBJECT', reason: 'Subject contains a question word and is not identifiable on its own' };
    }
    if (/\b(is|are|was|were|has|have|had|increased|decreased|became|began|started|ended|rose|fell|grew|changed|continued|remained|died|arrived|left|joined|formed|passed|helps|provides|allows|enables|makes|causes|leads|results|shows|indicates|means|refers|contains|includes|protects|guarantees|ensures|states|describes|defines|facilitates|supports|affects|influences|determines|drives|promotes|prevents|reduces|increases|decreases)\b/i.test(text)) {
      return { valid: false, code: 'FINITE_VERB_SUBJECT', reason: 'Subject contains a finite verb and is a clause, not a noun phrase' };
    }
    if (/\b(not only|not just|only|also)\s*$/i.test(text)) {
      return { valid: false, code: 'DANGLING_CORRELATIVE', reason: 'Subject ends in a correlative fragment (not only / only / also)' };
    }
    if (/^(the same|the following)\b/i.test(text)) {
      return { valid: false, code: 'VAGUE_REFERENCE_SUBJECT', reason: 'Subject is a vague reference (the same / the following), not an identifiable entity' };
    }
    if (/^(find|explain|describe|discuss|list|identify|state|write|draw|answer|consider|imagine|observe|suppose|assume|compare|try|use|take)\b/i.test(text)) {
      return { valid: false, code: 'IMPERATIVE_SUBJECT', reason: 'Subject starts with an imperative verb and is an instruction, not an entity' };
    }
    if ((text.match(/["\u201c\u201d]/g) || []).length % 2 !== 0) {
      return { valid: false, code: 'UNBALANCED_QUOTES', reason: 'Subject contains unbalanced quotation marks' };
    }
    if ((text.match(/\(/g) || []).length !== (text.match(/\)/g) || []).length) {
      return { valid: false, code: 'UNBALANCED_PARENS', reason: 'Subject contains unbalanced parentheses' };
    }
    if (!/[A-Za-z]{3}/.test(text)) {
      return { valid: false, code: 'INSUFFICIENT_LETTERS', reason: 'Subject lacks a three-letter word' };
    }

    // 1. Map compass directions (e.g. "E W S N", "N S E W")
    if (/\b[NESW]\b(?:\s+[NESW]\b)+/i.test(text) || /\b(?:north|south|east|west)\b.*\b(?:north|south|east|west)\b.*\b(?:north|south|east|west)\b/i.test(text)) {
      return { valid: false, code: 'COMPASS_DIRECTION_SEQUENCE', reason: 'Subject contains a sequence of compass directions' };
    }

    // 2. Excessive or repeated single-letter tokens (e.g. isolated map initials "I I", "A A")
    const singleLetters = text.match(/(?<![A-Za-z0-9.])[A-Za-z](?![A-Za-z0-9.])/g) || [];
    if (singleLetters.length >= 2 || /\b([A-Za-z])\s+\1\b/i.test(text)) {
      return { valid: false, code: 'EXCESSIVE_SINGLE_LETTERS', reason: 'Subject contains repeated or multiple isolated single-letter tokens' };
    }

    // 3. Textbook running headers / footers / print metadata
    if (/\b(?:Exploring Society|Grade\s+\d+|Part\s+\d+|Chapter\s+\d+\.indd|\.indd\b|NCERT|Textbook)\b/i.test(text) ||
        /\b(?:India and Beyond\s*\|\s*Grade)\b/i.test(text)) {
      return { valid: false, code: 'RUNNING_FURNITURE', reason: 'Subject contains textbook running header or publication metadata' };
    }

    // 4. Map legend / figure furniture labels
    if (/\b(?:Legend|Map\s+Scale|Route\s+City|Scale\s+Bar)\b/i.test(text) ||
        (/\b(?:Legend)\b/i.test(text) && /\b(?:Route|City|Canal|Ocean)\b/i.test(text))) {
      return { valid: false, code: 'MAP_LEGEND_ARTIFACT', reason: 'Subject contains map legend or cartographic labels' };
    }

    // 5. Concatenations of multiple all-caps geographical labels (e.g. "ASIA AFRICA Suez Canal")
    const allCapsWords = text.match(/\b[A-Z]{3,}\b/g) || [];
    if (allCapsWords.length >= 3) {
      return { valid: false, code: 'ALL_CAPS_LABEL_CONCATENATION', reason: 'Subject contains three or more concatenated uppercase diagram labels' };
    }

    // 6. Dangling prepositions or conjunctions at the end
    if (/\s+(?:and|or|in|of|to|for|with|on|at|by|from|into|onto|under|over|about)\s*$/i.test(text)) {
      return { valid: false, code: 'DANGLING_CONNECTOR', reason: 'Subject ends with a dangling preposition or conjunction' };
    }

    // 7. Page numbering prefixes like "10 Exploring..."
    if (/^\d+\s+[A-Z]/.test(text) && !/^\d+(?:st|nd|rd|th)\b/i.test(text)) {
      return { valid: false, code: 'NUMERIC_HEADER_PREFIX', reason: 'Subject begins with an unpunctuated page or section number' };
    }

    // 8. Textbook callout banners and activity headers
    if (/\b(?:DO\s+N['’]T\s+MISS\s+OUT|LET['’]S\s+EXPLORE|DID\s+YOU\s+KNOW|THINK\s+ABOUT\s+IT|ACTIVITY|EXERCISE)\b/i.test(text)) {
      return { valid: false, code: 'CALLOUT_BANNER_ARTIFACT', reason: 'Subject contains callout box or activity banner' };
    }

    // 9. Figure, diagram, or table reference labels
    if (/\b(?:Fig(?:\.|\b)\s*\d+|Figure\s*\d+|Table\s*\d+|Map\s*\d+)\b/i.test(text)) {
      return { valid: false, code: 'FIGURE_REFERENCE_ARTIFACT', reason: 'Subject contains figure or table reference' };
    }

    // 10. Non-year numeric artifacts inside subjects (e.g. "Argentina 5000")
    if (/\b\d{3,}\b/.test(text) && !/\b(?:1[0-9]{3}|20[0-9]{2})\b/.test(text) && !/\b\d+(?:st|nd|rd|th)\b/i.test(text)) {
      return { valid: false, code: 'NUMERIC_MAP_ARTIFACT', reason: 'Subject contains ungrounded numeric map or contour code' };
    }

    return { valid: true };
  }

  function isUsableSubject(value) {
    return checkSubjectQuality(value).valid;
  }

  // The source line shown before answering: the excerpt with the tested value
  // blanked out, so the learner has context without being handed the key.
  const CONTEXT_MIN_CHARS = 40;

  function maskExpectedAnswer(excerpt, expected) {
    const answer = cleanText(expected);
    const source = cleanText(excerpt);
    if (!answer || answer.length < 3 || !source) return null;
    if (/^\d$/.test(answer)) return null;
    const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const left = /^[A-Za-z0-9]/.test(answer) ? '\\b' : '';
    const right = /[A-Za-z0-9]$/.test(answer) ? '\\b' : '';
    const pattern = new RegExp(left + escaped + right, 'gi');
    if (!pattern.test(source)) return null;
    const masked = source.replace(pattern, '______');
    if (masked === source || masked.length < CONTEXT_MIN_CHARS) return null;
    return masked;
  }

  function buildStemContext(stem, excerpt, expected) {
    // Quality rule: a stem must stand on its own in an exam, with no
    // passage in front of the student. "According to the passage/source"
    // is generator scaffolding, never part of the question, so it is
    // always stripped here, whatever context the app may also show.
    // The masked excerpt, when available, is returned only as
    // supplementary app context; the stem must be answerable without it.
    const raw = String(stem || '');
    const text = raw
      .replace(/^According to the (passage|source),\s*/i, '')
      .replace(/^([a-z])/, (letter) => letter.toUpperCase());
    const context = maskExpectedAnswer(excerpt, expected);
    return { stem: text, context: context || null };
  }

  function replaceOnce(text, needle, replacement) {
    if (!needle) return null;
    const index = text.indexOf(needle);
    if (index === -1) return null;
    return text.slice(0, index) + replacement + text.slice(index + needle.length);
  }

  function isEquivalentOption(a, b) {
    return optionSignature(a) === optionSignature(b) || normalizeOption(a) === normalizeOption(b);
  }

  // Collapse an immediately repeated phrase of 3+ words, which is
  // almost always a PDF heading merged with the sentence that follows
  // it ("Right to constitutional remedies The right to constitutional
  // remedies", "Right to life The right to life also"), not natural
  // repetition. The second occurrence, plus a preceding article, is
  // removed. Legitimate short repetitions ("had had") are below the
  // 3-word threshold and are left alone.
  function collapseRepeatedPhrase(raw) {
    let words = String(raw || '').split(/\s+/).filter(Boolean);
    for (let round = 0; round < 3; round++) {
      let changed = false;
      const lower = words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
      outer: for (let len = 6; len >= 3; len--) {
        for (let i = 0; i + len <= words.length; i++) {
          for (const gap of [0, 1]) {
            const j = i + len + gap;
            if (j + len > words.length) continue;
            let match = true;
            for (let k = 0; k < len; k++) {
              if (lower[i + k] !== lower[j + k]) { match = false; break; }
            }
            if (!match) continue;
            const removeFrom = (gap === 1 && /^(the|a|an)$/i.test(words[j - 1])) ? j - 1 : j;
            words = words.slice(0, removeFrom).concat(words.slice(j + len));
            changed = true;
            break outer;
          }
        }
      }
      if (!changed) break;
    }
    return words.join(' ');
  }

  function cleanFactSubject(raw) {
    let subject = collapseRepeatedPhrase(cleanText(raw).replace(/[,;:]+$/, '').trim());
    if (!subject || subject.length > 150) return null;
    // Clause boundary (Phase 8 fix): a causal subject must come from the
    // clause that actually contains the causal verb. A subject taken from
    // before a semicolon, or before "for instance/for example", misattributes
    // the effect to an earlier, unrelated subject — e.g. "Human lives are
    // deeply connected to its many features; for instance, the distant
    // Southern Indian Ocean influences the monsoon" must give the Southern
    // Indian Ocean, not Human lives, as the cause.
    if (subject.includes(';')) {
      subject = subject.split(';').pop().trim();
    }
    subject = subject.replace(/^for (?:instance|example)\s*,\s*/i, '').trim();
    subject = subject.replace(/\bfor (?:instance|example)\s*,\s*/i, '').trim();
    const split = subject.match(/^(.{2,80}?)\s+(?:is|are|was|were|has|have|had)\s+(.+)$/i);
    if (split && split[1].trim().split(/\s+/).length <= 8 && !/[,]/.test(split[1])) {
      subject = split[1].trim();
    }
    subject = subject.replace(/[,;:]+$/, '').trim();
    return subject.length >= 2 ? subject : null;
  }

  // A phrase is a fragment, not a usable concept, if it is a bare pronoun,
  // starts with a preposition/conjunction, ends with a dangling relative
  // pronoun/preposition/article, or is a single non-name word. Fragment
  // phrases must never become a causal subject/effect, a numeric answer,
  // or a distractor object (Phase 8 fix).
  function isFragmentPhrase(raw) {
    const text = cleanText(raw || '');
    if (!text || text.length < 2) return true;
    if (/^(it|they|this|that|these|those|us|you|he|she|we|them|him|her)$/i.test(text)) return true;
    if (/^(of|to|in|on|for|with|by|as|if|when|while|and|or|but|from|at|into|over|under|about|through|against|between|among|behind|below|above|near|off|out|up|down|like)\b/i.test(text)) return true;
    if (/\b(which|that|who|whom|whose|when|where|and|or|but|of|to|in|on|for|with|by|as|the|a|an|through|from|into|onto|under|over|against|about|between|among|behind|below|above|near|they|them|he|she|it|us|you|we|him|her|his|their|its|not only|was|were|is|are|has|have|had)\s*[.!?]?\s*$/.test(text)) return true;
    // A pronoun-start phrase with no verb is a truncated clause, not
    // an answer ("it one of the most productive regions" lost its
    // verb "make"). A pronoun-start phrase WITH a verb ("it means
    // many children are being born") is a readable clause and stays.
    if (/^(it|they|he|she)\b/i.test(text) && !/\b(is|are|was|were|has|have|had|means?|makes?|leads?|results?|shows?|indicates?|refers?|represents?|allows?|enables?|helps?|causes?)\b/i.test(text)) return true;
    if (text.includes(';') || text.includes('|')) return true;
    if (/\b[a-e]\)\s+[A-Z]/.test(text)) return true;
    if (/\btrue or false\b/i.test(text)) return true;
    if (/^[^A-Za-z0-9]+/.test(text)) return true;
    if (/\b(would|could|should|will|can|may|might)\s*[.!?]?\s*$/.test(text)) return true;
    return false;
  }

  function isCleanQuantity(raw) {
    const text = cleanText(raw || '');
    // A clean quantity starts with a number and is a short number + unit /
    // count phrase. In particular a comma followed by a word ("1908, two
    // young members") is a merged year + count, not a quantity, while
    // "2,000 km" (comma followed by a digit) is a thousands separator
    // and is allowed.
    if (!text) return false;
    if (/,\s*[A-Za-z]/.test(text)) return false;
    if (!/^-?\d/.test(text)) return false;
    if (text.split(/\s+/).length > 3) return false;
    // A quantity is a number plus a unit, not a clause. "14 states that
    // the State" (Article 14 states that the State…) is a merged article
    // number + verb + noun, not a quantity, and must never become an
    // answer.
    if (/\b(that|which|who|shall|during|the|a|an)\b/i.test(text)) return false;
    return true;
  }

  function resolveSubject(raw, context) {
    let subject = cleanText(raw);
    const previous = context && context.previousSubject;
    if (!subject) return subject;
    if (/^its\b/i.test(subject) && previous) {
      return previous.replace(/'s$/i, '') + "'s " + subject.replace(/^its\s+/i, '');
    }
    if (/^(?:it|they|this|these|those)\b/i.test(subject) && previous) {
      return subject.replace(/^(?:it|they|this|these|those)\b/i, previous);
    }
    return subject;
  }

  function stripTrailingPurpose(value) {
    return cleanText(value)
      .replace(/,\s*(?:aimed at|which|that|to)\b[\s\S]*$/i, '')
      .replace(/\s+to\s+(?:analy[sz]e|create|promote|support|ensure|provide|highlight|transform|build)\b[\s\S]*$/i, '')
      .trim();
  }

  function cleanMember(value) {
    return cleanText(value)
      .replace(/^(?:and|or)\s+/i, '')
      .replace(/^(?:the|a|an)\s+/i, '')
      .replace(/[,;:.]+$/g, '')
      .trim();
  }

  function splitList(value) {
    const source = stripTrailingPurpose(value);
    // A colon commonly introduces a definitional clause. In that case commas
    // belong to the explanation, not to a list separator.
    if (/:\s+\S/.test(source)) {
      return source
        .split(/\s*;\s*/)
        .map(cleanMember)
        .filter((item) => item.length >= 2 && item.length <= 120);
    }
    // Commas are the primary separators. When the writer used an Oxford comma,
    // a bare "and" inside an item belongs to that item's noun phrase. Without
    // an Oxford comma, split the final "and" pair as well.
    if (source.includes(',')) {
      const oxford = /,\s*(?:and|or)\s+/i.test(source);
      const parts = source.split(/\s*,\s*/i);
      const expanded = oxford ? parts : parts.flatMap((part) => part.split(/\s+and\s+/i));
      return expanded
        .map(cleanMember)
        .filter((item) => item.length >= 2 && item.length <= 120);
    }
    return source
      .split(/\s+and\s+/i)
      .map(cleanMember)
      .filter((item) => item.length >= 2 && item.length <= 120);
  }

  function parseSequence(text) {
    const match = text.match(/\b(?:first|firstly|1st)\s+(.+?)(?:,\s*|\s*;\s*)(?:then|second|secondly|2nd)\s+(.+?)(?:,\s*(?:and\s+)?|\s+and\s+)(?:finally|third|thirdly|3rd|last)\s+(.+?)[.!?]?\s*$/i);
    if (!match) return null;
    const items = [match[1], match[2], match[3]]
      .map((item) => cleanText(item).replace(/^[,;:\s]+|[,;:\s]+$/g, ''))
      .filter(Boolean);
    if (items.length !== 3 || new Set(items.map(normalizeObject)).size !== 3) return null;
    return {
      fact_type: 'sequence',
      subject: 'the stated procedure',
      relation: 'sequence',
      object: items.join(' → '),
      sequence_items: items,
      answer_kind: 'sequence',
      relation_label: 'the explicit sequence',
      extraction_method: 'sequence_markers'
    };
  }

  function parseInitialMove(text, context) {
    const match = text.match(/^\s*(.+?)\s+(?:was|were)\s+initially\s+in\s+(.+?)\s+and\s+moved\s+to\s+(.+?)\s+in\s+(\d{4})\s*[.!?]?\s*$/i);
    if (!match) return null;
    const subject = resolveSubject(match[1], context);
    const initial = cleanText(match[2]).replace(/[.,;:]+$/, '');
    const destination = cleanText(match[3]).replace(/[.,;:]+$/, '');
    const year = match[4];
    if (!subject || !initial || !destination) return null;
    return [
      {
        fact_type: 'entity_attribute',
        subject,
        relation: 'initial_location',
        object: initial,
        answer_kind: 'place',
        temporal_scope: 'initial',
        extraction_method: 'entity_initial_location'
      },
      {
        fact_type: 'entity_attribute',
        subject,
        relation: 'destination_location',
        object: destination,
        answer_kind: 'place',
        temporal_scope: 'later',
        extraction_method: 'entity_destination_location'
      },
      {
        fact_type: 'date',
        subject,
        relation: 'move_year',
        object: year,
        event_base: 'move',
        event_type: 'active',
        event_object: destination,
        answer_kind: 'year',
        requested_label: `the year ${inlineSubject(subject)} moved to ${destination}`,
        extraction_method: 'date_move'
      }
    ];
  }

  function parseDefinition(text) {
    // Pattern 1 — explicit definition verbs
    let match = text.match(/^(.+?)\s+(?:is|are)\s+defined\s+as\s+(.+?)[.!?]?\s*$/i);
    if (!match) match = text.match(/^(.+?)\s+(?:means|refers?\s+to)\s+(.+?)[.!?]?\s*$/i);
    if (!match) match = text.match(/^(.+?)\s+(?:is|are)\s+known\s+as\s+(.+?)[.!?]?\s*$/i);
    if (!match) {
      match = text.match(/^(.+?)\s+(?:is|are)\s+(the\s+(?:process|term|study|practice|system|method|condition|phenomenon|concept|principle|theory|approach|technique|procedure|mechanism|strategy|framework|policy|scheme)\s+(?:by\s+which|in\s+which|that|where|whereby|through\s+which)\s+.+?)[.!?]?\s*$/i);
    }
    // Pattern 2 — described / characterised as
    if (!match) match = text.match(/^(.+?)\s+(?:can\s+be|is|are|was|were)\s+described\s+as\s+(.+?)[.!?]?\s*$/i);
    if (!match) match = text.match(/^(.+?)\s+(?:is|are|was|were)\s+(?:characterized|characterised|distinguished|identified|recognized|recognised)\s+by\s+(.+?)[.!?]?\s*$/i);
    // Pattern 3 — classified / categorised as
    if (!match) match = text.match(/^(.+?)\s+(?:is|are|was|were)\s+(?:classified|categorized|categorised|grouped)\s+as\s+(.+?)[.!?]?\s*$/i);
    // Pattern 4 — a type/kind/form/example of
    if (!match) match = text.match(/^(.+?)\s+(?:is|are|was|were)\s+a\s+(?:type|kind|form|class|category|example|instance|variant)\s+of\s+(.+?)[.!?]?\s*$/i);
    // Pattern 5 — also called / also known as (standalone)
    if (!match) match = text.match(/^(.+?)\s+(?:is\s+also\s+(?:called|known\s+as)|can\s+also\s+be\s+called)\s+(.+?)[.!?]?\s*$/i);
    // Pattern 6 — represents / denotes / signifies / stands for
    if (!match) match = text.match(/^(.+?)\s+(?:represents?|denotes?|signifies?|stands?\s+for|symbolizes?|symbolises?)\s+(.+?)[.!?]?\s*$/i);
    // Pattern 7 — another name / term / word for
    if (!match) match = text.match(/^(.+?)\s+(?:is|was)\s+another\s+(?:name|term|word|expression)\s+for\s+(.+?)[.!?]?\s*$/i);
    if (!match) return null;
    const subject = cleanFactSubject(match[1]);
    const object = cleanText(match[2]).replace(/[.,;:]+$/, '');
    if (!subject || !object || object.length < 6 || object.length > 320) return null;
    if (/^(?:it|this|these|those|they)\b/i.test(subject)) return null;
    if (UNUSABLE_SUBJECT_START.test(subject)) return null;
    return {
      fact_type: 'definition',
      subject,
      relation: 'definition',
      object,
      answer_kind: 'definition',
      extraction_method: 'definition_explicit'
    };
  }

  // Abbreviation/acronym: "Full Name (ABBR)" — very common in study material.
  function parseAbbreviation(text) {
    const m = text.match(/\b([A-Z][A-Za-z]{1,}(?:\s+[A-Za-z]{1,}){1,8})\s+\(([A-Z]{2,8})\)/);
    if (!m) return null;
    const fullName = cleanText(m[1]).replace(/[.,;:]+$/, '');
    const abbrev = m[2];
    if (!fullName || fullName.split(/\s+/).length < 2) return null;
    return {
      fact_type: 'definition',
      subject: abbrev,
      relation: 'definition',
      object: fullName,
      answer_kind: 'definition',
      extraction_method: 'definition_abbreviation'
    };
  }

  function parseMembership(text, context) {
    let subject = null;
    let members = null;
    let exhaustive = false;
    let observedBy = null;

    const presence = text.match(/^(.+?)\s+confirmed\s+the\s+presence\s+of\s+(.+?)\s+in\s+(.+?)[.!?]?\s*$/i);
    if (presence) {
      observedBy = cleanFactSubject(presence[1]);
      members = splitList(presence[2]);
      subject = cleanText(presence[3]).replace(/[.,;:]+$/, '');
      exhaustive = false;
    }

    if (!members) {
      const plural = text.match(/^The\s+(.+?)\s+are\s+(.+?)[.!?]?\s*$/i);
      if (plural && /\band\b|,/i.test(plural[2])) {
        subject = 'The ' + cleanText(plural[1]).replace(/[.,;:]+$/, '');
        members = splitList(plural[2]);
        exhaustive = /\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(subject);
      }
    }

    if (!members) {
      const listed = text.match(/^(.+?)\s+(includes?|included|consists?\s+of|comprised?|comprises?|contains?|carried|carries|encompass(?:es)?|cover(?:s)?)\s+(.+?)[.!?]?\s*$/i);
      if (listed) {
        subject = resolveSubject(listed[1], context);
        members = splitList(listed[3]);
        exhaustive = /\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(subject);
      }
    }

    // "Among [the] X are Y, Z..." — rich listing pattern
    if (!members) {
      const among = text.match(/^Among\s+(?:the\s+)?(.+?)\s+are\s+(.+?)[.!?]?\s*$/i);
      if (among && /\band\b|,/i.test(among[2])) {
        subject = cleanText(among[1]).replace(/[.,;:]+$/, '');
        members = splitList(among[2]);
        exhaustive = false;
      }
    }

    // "X and Y are [both] Z" — two items sharing a category
    if (!members) {
      const bothAre = text.match(/^([A-Z][^,]{2,50}?)\s+and\s+([^,]{2,50}?)\s+are\s+(?:both\s+)?(.{4,60}?)[.!?]?\s*$/i);
      if (bothAre) {
        const item1 = cleanMember(bothAre[1]);
        const item2 = cleanMember(bothAre[2]);
        const category = cleanText(bothAre[3]).replace(/[.,;:]+$/, '');
        if (item1 && item2 && category.length >= 4 && category.length <= 60
            && !/\b(?:is|are|was|were|has|have|had|not|also|very|quite)\b/i.test(category)
            && !UNUSABLE_SUBJECT_START.test(item1)) {
          subject = category;
          members = [item1, item2];
          exhaustive = false;
        }
      }
    }

    if (!subject || !members || !members.length) return null;
    if (members.length > 20) return null;
    if (/^(?:features|these|they|it|this|there|some|many|several)$/i.test(subject)) return null;
    const unique = [];
    for (const member of members) {
      if (!unique.some((item) => normalizeObject(item) === normalizeObject(member))) unique.push(member);
    }
    if (!unique.length) return null;
    return {
      fact_type: 'membership',
      subject,
      relation: 'members',
      object: unique.join(', '),
      members: unique,
      exhaustive,
      observed_by: observedBy,
      answer_kind: 'member',
      extraction_method: observedBy ? 'membership_presence' : 'membership_list'
    };
  }

  function parseCause(text) {
    // Phase 8 fix: work on the clause containing the causal verb, not the
    // whole multi-clause sentence. If the sentence has a semicolon and the
    // text after the last semicolon still contains a causal verb, that
    // clause is the causal clause; earlier clauses must not supply the
    // subject. "for instance/for example" introductions are dropped.
    if (typeof text === 'string' && text.includes(';')) {
      const after = text.slice(text.lastIndexOf(';') + 1).trim();
      if (/(causes?|leads?\s+to|results?\s+in|enables?|produces?|triggers?|influences?|determines?)\b/i.test(after)) {
        text = after;
      }
    }
    if (typeof text === 'string') {
      text = text.replace(/\bfor (?:instance|example)\s*,\s*/i, '');
    }
    // Phase 8 fix (second round): a naming explanation is not a causal
    // mechanism. "Mountains are called water towers because they are at
    // a height" does not mean mountains cause height, and "Mongolia is
    // called the Land of the Eternal Blue Sky because it has sunny
    // weather" does not mean Mongolia causes sunny weather.
    if (typeof text === 'string' && /\bis called\b|\bknown as\b/i.test(text) && /\bbecause\b/i.test(text)) {
      return null;
    }
    // Pattern 1 — explicit direct causal verb. Repair 002: supports,
    // helps, allows, makes and affects are NOT direct causation merely
    // because they occur in a broad relation pattern, so they are removed
    // from this list. Two narrow causative constructions are handled
    // separately below, only where the extracted arguments themselves
    // state a direct effect clause (allows + infinitive effect, makes +
    // base-verb effect); a bare "X supports Y" / "X helps Y" /
    // "X affects Y" never becomes CAUSES here.
    let match = text.match(/^(.+?)\s+(causes?|leads?\s+to|results?\s+in|enables?|produces?|brings?\s+about|triggers?|contributes?\s+to|promotes?|stimulates?|inhibits?|prevents?|reduces?|increases?|decreases?|generates?|influences?|determines?|drives?|encourages?|forces?|strengthens?|weakens?|accelerates?|slows?\s+down)\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      const object = cleanText(match[3]).replace(/[.,;:]+$/, '');
      if (!subject || !object || object.length < 3) return null;
      if (isFragmentPhrase(subject) || isFragmentPhrase(object)) return null;
      // Phase 8 fix (second round): an effect must be a concept, not a
      // compound predicate ("climate, and is home to a variety") and not
      // a pronoun clause ("it has sunny weather"). A heading subject
      // ("Water towers: Mountains") is not a cause concept either.
      if (/\band\s+(is|are|was|were|has|have)\b/i.test(object)) return null;
      if (/^(it|they|you|he|she|we)\b/i.test(object)) return null;
      if (subject.includes(':')) return null;
      return {
        fact_type: 'causal',
        subject,
        relation: 'causes',
        object,
        relation_verb: cleanText(match[2]).toLowerCase(),
        causal_direction: 'cause_to_effect',
        answer_kind: 'effect',
        extraction_method: 'causal_explicit'
      };
    }

    // Pattern 1b — narrow causative constructions only. "X allows Y to
    // <verb> ..." states an explicit effect clause, and "X makes Y
    // <verb> ..." is a causative construction; both keep cause -> effect
    // order and are not reversed. Anything without that effect clause
    // falls through and is not forced into CAUSES.
    const allowsMatch = text.match(/^(.+?)\s+allows?\s+(.+?\s+to\s+\S.+?)[.!?]?\s*$/i);
    if (allowsMatch) {
      const subject = cleanFactSubject(allowsMatch[1]);
      const object = cleanText(allowsMatch[2]).replace(/[.,;:]+$/, '');
      if (subject && object && object.length >= 5) {
        return {
          fact_type: 'causal',
          subject,
          relation: 'causes',
          object,
          relation_verb: 'allows',
          causal_direction: 'cause_to_effect',
          answer_kind: 'effect',
          extraction_method: 'causal_allows_infinitive'
        };
      }
    }
    const makesMatch = text.match(/^(.+?)\s+makes?\s+(.+?\s+[a-z]+(?:\s+.+)?)[.!?]?\s*$/i);
    if (makesMatch) {
      // Only accept when the object clause contains a verb-like effect
      // after a short noun phrase (e.g. "the metal expand", not a bare
      // noun object such as "the students").
      const object = cleanText(makesMatch[2]).replace(/[.,;:]+$/, '');
      const objectWords = object.split(/\s+/);
      if (objectWords.length >= 3) {
        const subject = cleanFactSubject(makesMatch[1]);
        if (subject && object.length >= 5) {
          return {
            fact_type: 'causal',
            subject,
            relation: 'causes',
            object,
            relation_verb: 'makes',
            causal_direction: 'cause_to_effect',
            answer_kind: 'effect',
            extraction_method: 'causal_makes_effect'
          };
        }
      }
    }

    // Pattern 2 — "X because Y"
    const because = text.match(/^(.+?)\s+because\s+(.+?)[.!?]?\s*$/i);
    if (because) {
      const effect = cleanFactSubject(because[1]);
      const cause = cleanText(because[2]).replace(/[.,;:]+$/, '');
      if (!effect || !cause || cause.length < 3) return null;
      if (/^(it|they|you|he|she|we)\s+(is|are|was|were|has|have|had|can|could|will|would)\b/i.test(cause)) return null;
      if (effect.includes(':')) return null;
      return {
        fact_type: 'causal',
        subject: effect,
        relation: 'causes',
        object: cause,
        relation_verb: 'because',
        causal_direction: 'effect_because_cause',
        answer_kind: 'effect',
        extraction_method: 'causal_because'
      };
    }

    // Pattern 3 — "Due to / Owing to / Because of / As a result of X, Y"
    const dueToMatch = text.match(/^(?:Due\s+to|Owing\s+to|Because\s+of|As\s+a\s+result\s+of|As\s+a\s+consequence\s+of|On\s+account\s+of)\s+(.+?),\s+(.+?)[.!?]?\s*$/i);
    if (dueToMatch) {
      const cause = cleanText(dueToMatch[1]).replace(/[.,;:]+$/, '');
      const effect = cleanText(dueToMatch[2]).replace(/[.,;:]+$/, '');
      if (!cause || !effect || cause.length < 3 || effect.length < 5) return null;
      const causeSubject = cleanFactSubject(cause);
      if (!causeSubject || UNUSABLE_SUBJECT_START.test(causeSubject)) return null;
      return {
        fact_type: 'causal',
        subject: causeSubject,
        relation: 'causes',
        object: effect,
        relation_verb: 'due to',
        causal_direction: 'cause_to_effect',
        answer_kind: 'effect',
        extraction_method: 'causal_due_to'
      };
    }

    // Pattern 4 — "X is responsible for Y" / "X is the cause of Y"
    const responsibleMatch = text.match(/^(.+?)\s+(?:is|was|are|were)\s+(?:responsible\s+for|the\s+(?:main\s+|primary\s+|direct\s+)?cause\s+of|the\s+reason\s+(?:for|behind))\s+(.+?)[.!?]?\s*$/i);
    if (responsibleMatch) {
      const subject = cleanFactSubject(responsibleMatch[1]);
      const object = cleanText(responsibleMatch[2]).replace(/[.,;:]+$/, '');
      if (!subject || !object || object.length < 3 || UNUSABLE_SUBJECT_START.test(subject)) return null;
      return {
        fact_type: 'causal',
        subject,
        relation: 'causes',
        object,
        relation_verb: 'is responsible for',
        causal_direction: 'cause_to_effect',
        answer_kind: 'effect',
        extraction_method: 'causal_responsible'
      };
    }

    // Pattern 5 — passive: "Y results from X" / "Y is caused by X"
    const passiveMatch = text.match(/^(.+?)\s+(?:results?\s+from|(?:is|are|was|were)\s+caused\s+by|(?:is|are|was|were)\s+triggered\s+by|(?:is|are|was|were)\s+brought\s+about\s+by)\s+(.+?)[.!?]?\s*$/i);
    if (passiveMatch) {
      const effect = cleanFactSubject(passiveMatch[1]);
      const cause = cleanText(passiveMatch[2]).replace(/[.,;:]+$/, '');
      if (!effect || !cause || cause.length < 3 || UNUSABLE_SUBJECT_START.test(effect)) return null;
      const causeSubject = cleanFactSubject(cause);
      if (!causeSubject) return null;
      return {
        fact_type: 'causal',
        subject: causeSubject,
        relation: 'causes',
        object: effect,
        relation_verb: 'causes',
        causal_direction: 'cause_to_effect',
        answer_kind: 'effect',
        extraction_method: 'causal_passive'
      };
    }

    return null;
  }

  // Conditional/situational causal facts: if/when/unless sentence openers.
  function parseConditional(text) {
    // "If X, [then] Y"
    const ifMatch = text.match(/^If\s+(.+?),\s*(?:then\s+)?(.+?)[.!?]?\s*$/i);
    if (ifMatch) {
      const condition = cleanText(ifMatch[1]).replace(/[.,;:]+$/, '');
      const consequence = cleanText(ifMatch[2]).replace(/[.,;:]+$/, '');
      // Phase 8 fix (fourth round): the condition must be a full clause,
      // not just its noun subject. cleanFactSubject("senior Congress
      // leaders were arrested") gave "senior Congress leaders", making
      // the stem "what happens when senior Congress leaders?" unanswerable.
      // A two-word proper name with no verb ("Muhammad Iqbal", before an
      // appositive comma) is not a condition at all and must be rejected.
      const condSubject = cleanText(condition);
      if (condSubject && consequence && consequence.length >= 8
          && condSubject.split(/\s+/).length >= 3 && condSubject.split(/\s+/).length <= 12
          && !UNUSABLE_SUBJECT_START.test(condSubject)) {
        return {
          fact_type: 'causal',
          subject: condSubject,
          relation: 'causes',
          object: consequence,
          relation_verb: 'if',
          causal_direction: 'cause_to_effect',
          answer_kind: 'effect',
          extraction_method: 'causal_conditional'
        };
      }
    }

    // "When X, Y"
    const whenMatch = text.match(/^When\s+(.+?),\s+(.+?)[.!?]?\s*$/i);
    if (whenMatch) {
      const condition = cleanText(whenMatch[1]).replace(/[.,;:]+$/, '');
      const consequence = cleanText(whenMatch[2]).replace(/[.,;:]+$/, '');
      const condSubject = cleanText(condition);
      if (condSubject && consequence && consequence.length >= 8
          && condSubject.split(/\s+/).length >= 3 && condSubject.split(/\s+/).length <= 12
          && !UNUSABLE_SUBJECT_START.test(condSubject)) {
        return {
          fact_type: 'causal',
          subject: condSubject,
          relation: 'causes',
          object: consequence,
          relation_verb: 'when',
          causal_direction: 'cause_to_effect',
          answer_kind: 'effect',
          extraction_method: 'causal_conditional'
        };
      }
    }

    // "Unless X, Y"
    const unlessMatch = text.match(/^Unless\s+(.+?),\s+(.+?)[.!?]?\s*$/i);
    if (unlessMatch) {
      const condition = cleanText(unlessMatch[1]).replace(/[.,;:]+$/, '');
      const consequence = cleanText(unlessMatch[2]).replace(/[.,;:]+$/, '');
      const condSubject = cleanText(condition);
      if (condSubject && consequence && consequence.length >= 8
          && condSubject.split(/\s+/).length >= 3 && condSubject.split(/\s+/).length <= 12
          && !UNUSABLE_SUBJECT_START.test(condSubject)) {
        return {
          fact_type: 'causal',
          subject: condSubject,
          relation: 'causes',
          object: consequence,
          relation_verb: 'unless',
          causal_direction: 'cause_to_effect',
          answer_kind: 'effect',
          extraction_method: 'causal_conditional'
        };
      }
    }

    return null;
  }

  function parseComparison(text) {
    // Pattern 1 — "Unlike X, Y"
    let match = text.match(/^Unlike\s+(.+?),\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subA = cleanFactSubject(match[1]);
      if (!subA) return null;
      return {
        fact_type: 'comparison',
        subject: subA,
        relation: 'comparison',
        object: cleanText(match[2]).replace(/[.,;:]+$/, ''),
        comparison: { subject_a: subA, subject_b: null, direction: 'contrast' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_unlike'
      };
    }

    // Pattern 2 — "X, whereas Y"
    match = text.match(/^(.+?),\s*whereas\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subA = cleanFactSubject(match[1]);
      if (!subA) return null;
      return {
        fact_type: 'comparison',
        subject: subA,
        relation: 'comparison',
        object: cleanText(match[2]).replace(/[.,;:]+$/, ''),
        comparison: { subject_a: subA, subject_b: null, direction: 'contrast' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_whereas'
      };
    }

    // Pattern 3 — directional comparison (greatly expanded adjective list)
    match = text.match(/^(.+?)\s+(?:is|are|was|were)\s+(higher|lower|larger|smaller|greater|less|more|fewer|deeper|wider|taller|heavier|lighter|stronger|weaker|faster|slower|older|newer|richer|poorer|better|worse|longer|shorter|warmer|cooler|hotter|colder|denser|thinner|brighter|darker)\s+than\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      if (!subject) return null;
      const direction = match[2].toLowerCase();
      const other = cleanText(match[3]).replace(/[.,;:]+$/, '');
      return {
        fact_type: 'comparison',
        subject,
        relation: 'comparison',
        object: `${direction} than ${other}`,
        comparison: { subject_a: subject, subject_b: other, direction: 'contrast' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_directional'
      };
    }

    // Pattern 4 — "While/Although/Though X, Y"
    match = text.match(/^(?:While|Although|Though|Even\s+though)\s+(.+?),\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subA = cleanFactSubject(match[1]);
      const subB = cleanText(match[2]).replace(/[.,;:]+$/, '');
      if (!subA || !subB || subB.length < 6 || UNUSABLE_SUBJECT_START.test(subA)) return null;
      return {
        fact_type: 'comparison',
        subject: subA,
        relation: 'comparison',
        object: subB,
        comparison: { subject_a: subA, subject_b: null, direction: 'contrast' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_while'
      };
    }

    // Pattern 5 — "X differs from Y in Z"
    match = text.match(/^(.+?)\s+differs?\s+from\s+(.+?)\s+in\s+(?:that\s+|how\s+|its?\s+)?(.+?)[.!?]?\s*$/i);
    if (match) {
      const subA = cleanFactSubject(match[1]);
      const subB = cleanText(match[2]).replace(/[.,;:]+$/, '');
      const aspect = cleanText(match[3]).replace(/[.,;:]+$/, '');
      if (!subA || !subB || !aspect || UNUSABLE_SUBJECT_START.test(subA)) return null;
      return {
        fact_type: 'comparison',
        subject: subA,
        relation: 'comparison',
        object: `differs from ${subB} in ${aspect}`,
        comparison: { subject_a: subA, subject_b: subB, direction: 'contrast' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_differs'
      };
    }

    // Pattern 6 — "Like X, Y" (similarity)
    match = text.match(/^Like\s+(.+?),\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subA = cleanFactSubject(match[1]);
      const subB = cleanText(match[2]).replace(/[.,;:]+$/, '');
      if (!subA || !subB || subB.length < 6 || UNUSABLE_SUBJECT_START.test(subA)) return null;
      return {
        fact_type: 'comparison',
        subject: subA,
        relation: 'comparison',
        object: subB,
        comparison: { subject_a: subA, subject_b: null, direction: 'similar' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_like'
      };
    }

    // Pattern 7 — "X is similar to Y [in Z]"
    match = text.match(/^(.+?)\s+(?:is|are|was|were)\s+similar\s+to\s+(.+?)(?:\s+in\s+(.+?))?[.!?]?\s*$/i);
    if (match) {
      const subA = cleanFactSubject(match[1]);
      const subB = cleanText(match[2]).replace(/[.,;:]+$/, '');
      if (!subA || !subB || UNUSABLE_SUBJECT_START.test(subA)) return null;
      const aspect = match[3] ? cleanText(match[3]).replace(/[.,;:]+$/, '') : null;
      const obj = aspect ? `similar to ${subB} in ${aspect}` : `similar to ${subB}`;
      return {
        fact_type: 'comparison',
        subject: subA,
        relation: 'comparison',
        object: obj,
        comparison: { subject_a: subA, subject_b: subB, direction: 'similar' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_similar'
      };
    }

    // Pattern 8 — "X, on the other hand, Y"
    match = text.match(/^(.+?),\s+on\s+the\s+other\s+hand,\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subA = cleanFactSubject(match[1]);
      const subB = cleanText(match[2]).replace(/[.,;:]+$/, '');
      if (!subA || !subB || subB.length < 6 || UNUSABLE_SUBJECT_START.test(subA)) return null;
      return {
        fact_type: 'comparison',
        subject: subA,
        relation: 'comparison',
        object: subB,
        comparison: { subject_a: subA, subject_b: null, direction: 'contrast' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_other_hand'
      };
    }

    // Pattern 9 — "In contrast [to X], Y"
    match = text.match(/^In\s+contrast(?:\s+to\s+(.+?))?,\s+(.+?)[.!?]?\s*$/i);
    if (match && match[2] && match[2].length >= 8) {
      const subA = match[1] ? cleanFactSubject(match[1]) : 'the previous';
      const subB = cleanText(match[2]).replace(/[.,;:]+$/, '');
      if (!subB || (match[1] && UNUSABLE_SUBJECT_START.test(subA))) return null;
      return {
        fact_type: 'comparison',
        subject: subA || 'the previous',
        relation: 'comparison',
        object: subB,
        comparison: { subject_a: subA, subject_b: null, direction: 'contrast' },
        answer_kind: 'comparison',
        extraction_method: 'comparison_contrast'
      };
    }

    return null;
  }

  function dateKind(value) {
    const text = cleanText(value);
    if (/\b(?:between|to)\b/i.test(text) && (text.match(/\d{4}/g) || []).length >= 2) return 'range';
    if (/^\d{4}$/.test(text)) return 'year';
    return 'date';
  }

  function parseDates(text, context) {
    const drafts = [];
    const eventRe = new RegExp(`^(.+?)\\s+(?:(?:was|were|is|are|has been|have been|had been)\\s+)?(${EVENT_VERB_RE})\\s+(?:in|on)\\s+(${DATE_TOKEN})(?:\\s+(?:by|under|as|at|with|and|to|for)\\b[\\s\\S]*)?[.!?]?$`, 'i');
    const match = text.match(eventRe);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      const verb = cleanText(match[2]).toLowerCase();
      const meta = EVENT_META[verb];
      const value = cleanText(match[3]);
      if (subject && meta && value) {
        drafts.push({
          fact_type: 'date',
          subject,
          relation: meta.relation,
          object: value,
          event_base: meta.base,
          event_type: meta.passive ? 'passive' : 'active',
          event_object: null,
          answer_kind: dateKind(value),
          requested_label: `${relationLabel(meta.relation)} of ${subject}`,
          extraction_method: 'date_event'
        });
      }
    }

    if (!drafts.length) {
      const rangeRe = new RegExp(`^(.+?)\\s+(?:lasted|operated|existed|continued|remained|spanned|ran)\\s+(?:between|from)\\s+(${DATE_TOKEN})\\s+(?:and|to)\\s+(${DATE_TOKEN})(?:\\s+[\\s\\S]*)?[.!?]?$`, 'i');
      const range = text.match(rangeRe);
      const genericRange = range || text.match(new RegExp(`^(.+?)\\s+between\\s+(${DATE_TOKEN})\\s+and\\s+(${DATE_TOKEN})[.!?]?$`, 'i'));
      if (genericRange) {
        const subject = cleanFactSubject(genericRange[1]);
        const value = `between ${genericRange[2]} and ${genericRange[3]}`;
        if (subject) {
          drafts.push({
            fact_type: 'date',
            subject,
            relation: 'event_range',
            object: value,
            event_base: 'occur',
            event_type: 'active',
            event_object: null,
            answer_kind: 'range',
            requested_label: `the period associated with ${subject}`,
            extraction_method: 'date_range'
          });
        }
      }
    }

    if (!drafts.length) {
      const field = text.match(new RegExp(`^([^:]{2,80}):\\s*(${DATE_TOKEN})[.!?]?$`, 'i'));
      if (field) {
        const subject = cleanFactSubject(field[1]);
        const value = cleanText(field[2]);
        if (subject) {
          drafts.push({
            fact_type: 'date',
            subject,
            relation: 'date_field',
            object: value,
            event_base: 'record',
            event_type: 'passive',
            event_object: null,
            answer_kind: dateKind(value),
            requested_label: `the date recorded for ${subject}`,
            extraction_method: 'date_field'
          });
        }
      }
    }

    return drafts.filter((draft) => draft.subject && draft.object);
  }

  function trimFunctionObject(value) {
    return cleanText(value)
      .replace(/\s+and\s+(?:ferried|carried|used|provided|conducted|performed|measured|recorded)\b[\s\S]*$/i, '')
      .replace(/\s*,?\s+(?:while|whereas)\b[\s\S]*$/i, '')
      .replace(/\s+between\b[\s\S]*$/i, '')
      .replace(/\s+including\b[\s\S]*$/i, '')
      .replace(/\s+to\s+[a-z]+\b[\s\S]*$/i, '')
      .replace(/[.,;:]+$/g, '')
      .trim();
  }

  function parseEntityAttributes(text, context) {
    const drafts = [];

    let match = text.match(/^(.+?)\s+(?:is|was|are|were)\s+(?:located|based|situated|headquartered)\s+in\s+(.+?)(?:[.;]|$)/i);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      const object = cleanText(match[2]).replace(/[.,;:]+$/, '');
      if (subject && object) {
        drafts.push({
          fact_type: 'entity_attribute',
          subject,
          relation: 'location',
          object,
          answer_kind: 'place',
          extraction_method: 'entity_location'
        });
      }
    }

    match = text.match(/^(.+?)\s+(?:is|was)\s+(?:the\s+)?(president|vice president|prime minister|chief minister|chairperson|chairman|director|secretary|governor|minister|chief executive|ceo)\s+of\s+(.+?)(?:[.;]|$)/i);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      const object = cleanText(match[2] + ' of ' + match[3]).replace(/[.,;:]+$/, '');
      if (subject && object) {
        drafts.push({
          fact_type: 'entity_attribute',
          subject,
          relation: 'office',
          object,
          answer_kind: 'role',
          extraction_method: 'entity_office'
        });
      }
    }

    const byRe = new RegExp(`^(.+?)\\s+(?:(?:was|were|is|are|has been|have been)\\s+)?(${BY_VERB_RE})\\s+(?:in\\s+${DATE_TOKEN}\\s+)?by\\s+(.+?)(?:\\s+(?:under|in|on|at|as|with|to)\\b[\\s\\S]*)?[.!?]?$`, 'i');
    match = text.match(byRe);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      let object = cleanText(match[3]).replace(/[.,;:]+$/, '');
      object = object.split(/,\s*(?:was|were|is|are|which|that)\b/i)[0].replace(/[.,;:]+$/, '').trim();
      if (subject && object) {
        const verb = cleanText(match[2]).toLowerCase();
        const relation = verb === 'implemented' ? 'implemented_by'
          : (verb === 'developed' ? 'developed_by' : 'launched_by');
        drafts.push({
          fact_type: 'entity_attribute',
          subject,
          relation,
          object,
          answer_kind: 'institution',
          extraction_method: 'entity_agent'
        });
      }
    }

    match = text.match(/^(.+?)\s+(?:aims?\s+to|is\s+designed\s+to|are\s+designed\s+to|serves?\s+to|helps?\s+to|works?\s+to|is\s+used\s+to|are\s+used\s+to|is\s+intended\s+to|are\s+intended\s+to|is\s+meant\s+to|are\s+meant\s+to)\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      const object = trimFunctionObject(match[2]);
      if (subject && object && object.length >= 4) {
        drafts.push({
          fact_type: 'entity_attribute',
          subject,
          relation: 'function',
          object,
          answer_kind: 'function',
          extraction_method: 'entity_function'
        });
      }
    }

    match = text.match(/^(.+?)\s+(performed|provides?|offers?|delivers?|records?|measures?|carries?\s+out|coordinates?|monitors?|regulates?|oversees?|manages?|facilitates?|administers?|supervises?|governs?)\s+(.+?)[.!?]?\s*$/i);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      const object = trimFunctionObject(match[3]);
      if (subject && object && object.length >= 4) {
        drafts.push({
          fact_type: 'entity_attribute',
          subject,
          relation: 'function',
          object,
          answer_kind: 'function',
          extraction_method: 'entity_function'
        });
      }
    }

    match = text.match(/^(.+?)\s+employed\s+(.+?)(?:\s+to\s+[a-z]+\b[\s\S]*)?[.!?]?\s*$/i);
    if (match) {
      const subject = cleanFactSubject(match[1]);
      const object = cleanText(match[2]).replace(/[.,;:]+$/, '');
      if (subject && object && object.length >= 4) {
        drafts.push({
          fact_type: 'entity_attribute',
          subject,
          relation: 'method',
          object,
          answer_kind: 'equipment',
          extraction_method: 'entity_method'
        });
      }
    }

    match = text.match(/^(.+?)\s+(?:is|was)\s+(?:a|an)\s+(.+?)(?:,|\s+(?:launched|established|located|based|integrated|under|which|that)\b|$)/i);
    if (match) {
      const roleSubject = match[1];
      const clauseLikeRole = /\b(?:has|have|had)\s+(?:held|said|stated|ruled|observed|noted|ordered|directed|announced|reported)\b/i.test(roleSubject)
        || /\b(?:that|which|who)\b/i.test(roleSubject);
      const subject = cleanFactSubject(roleSubject);
      const object = cleanText(match[2]).replace(/[.,;:]+$/, '');
      if (subject && object && object.length >= 4 && !clauseLikeRole && !/^(?:it|this|these|those|they)\b/i.test(subject)) {
        drafts.push({
          fact_type: 'entity_attribute',
          subject,
          relation: 'role',
          object,
          answer_kind: 'role',
          extraction_method: 'entity_role'
        });
      }
    }

    // Superlative attribute: "X is/was the first/only/largest/most... [context]"
    // Flipped: subject = description, object = entity (so the question asks "which X is described as...?")
    match = text.match(/^(.+?)\s+(?:is|was|remains?)\s+(the\s+(?:first|second|third|only|sole|largest|smallest|biggest|highest|lowest|tallest|longest|shortest|fastest|slowest|oldest|newest|richest|poorest|most\s+\w+(?:\s+\w+){0,2}|least\s+\w+(?:\s+\w+){0,2}))\s+(.{4,80}?)[.!?]?\s*$/i);
    if (match) {
      const entityRaw = cleanText(match[1]).replace(/[.,;:]+$/, '');
      const superlative = cleanText(match[2]).toLowerCase();
      const contextRaw = cleanText(match[3]).replace(/[.,;:]+$/, '');
      const entitySubject = cleanFactSubject(entityRaw);
      if (entitySubject && !UNUSABLE_SUBJECT_START.test(entitySubject) && !DUMMY_SUBJECT_WORD.test(entitySubject)
          && contextRaw.length >= 3 && contextRaw.length <= 100) {
        const answerKind = /\b(?:country|nation|state|city|town|district|province|region|place)\b/i.test(contextRaw + ' ' + entityRaw)
          ? 'place'
          : /\b(?:ministry|commission|court|council|board|agency|authority|organization|organisation|institute|university|mission)\b/i.test(entityRaw)
          ? 'institution'
          : /\b(?:person|leader|president|minister|scientist|writer|author|poet|artist|director)\b/i.test(contextRaw)
          ? 'person'
          : 'role';
        drafts.push({
          fact_type: 'entity_attribute',
          subject: `${superlative} ${contextRaw}`,
          relation: 'superlative',
          object: entitySubject,
          attribute: contextRaw.split(/\s+/).slice(-1)[0].toLowerCase(),
          answer_kind: answerKind,
          extraction_method: 'superlative_pattern'
        });
      }
    }

    return drafts.filter((draft) => draft.subject && draft.object);
  }

  function parseNumericValue(value) {
    const text = String(value == null ? '' : value);
    const match = text.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (!match) return null;
    const raw = match[0];
    const number = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(number)) return null;
    const decimals = (raw.split('.')[1] || '').length;
    return {
      number,
      raw,
      start: match.index,
      end: match.index + raw.length,
      decimals,
      hasComma: raw.includes(',')
    };
  }

  function cleanNumericAttribute(raw) {
    let value = normalizeWhitespace(raw)
      .replace(/^\([^)]*\)\s*/, '')
      .replace(/^[,.;:)\]]+\s*/, '')
      .replace(/^(?:of|the|a|an|in|on|for|under|to|with|from|by|at|has|have|had|is|are|was|were)\s+(?:an?|the)?\s*/i, '')
      .replace(/[),.;:]+$/, '')
      .replace(/[.;].*$/, '')
      .replace(/\s*,\s*(?:and|but|or)\s+(?:it|this|that|these|those|they|we|he|she)\b[\s\S]*$/i, '')
      .replace(/\s*,\s*(?:which|who|where|when|that)\b[\s\S]*$/i, '')
      .replace(/\s+(?:which|that|was|were|is|are|has|have|had)\b[\s\S]*$/i, '')
      .replace(/\s+to\s+[a-z]+\b[\s\S]*$/i, '')
      .trim();
    for (let i = 0; i < 4; i++) {
      value = value.replace(/(?<!\bwing)\s+spans?\s*$/i, '')
        .replace(/\s+(?:was|were|is|are|has|have|had|not|no|never|extends?|stretches?|covers?|measures?|reaches?|amounts?\s+to|totals?|equals?|for|of|by|to|at|in|about|around)\s*$/i, '')
        .trim();
    }
    if (value.length > 90) value = value.slice(0, 90).replace(/\s+\S*$/, '');
    if (!value || /^(?:value|number|amount|quantity|it|this|that|there)$/i.test(value)) return '';
    return value;
  }

  function numericAttribute(text, match, kind) {
    const object = cleanText(match[0]);
    if (kind === 'count') {
      const withoutNumber = object.replace(/^-?\d[\d,]*(?:\.\d+)?\s*/, '');
      const cleaned = cleanNumericAttribute(withoutNumber);
      return isUsableSubject(cleaned) ? cleaned : '';
    }

    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);

    // 1. Inspect 'before': does preceding text establish the measured subject?
    // Examples: "length of 2,000 km", "population of India is 1.4 billion", "area of 350,000 sq km"
    const wordsBefore = before.trim().split(/\s+/).slice(-6).join(' ');
    const cleanedBefore = cleanNumericAttribute(wordsBefore);
    if (cleanedBefore && cleanedBefore.length >= 3 && isUsableSubject(cleanedBefore)) {
      return cleanedBefore;
    }

    // 2. Inspect 'after': ONLY accept 'after' if it explicitly connects via a preposition
    // or relational adjective (e.g. "of coastline", "in length", "long", "wide", "deep", "high").
    // Rejects adjacent map/diagram labels (e.g. "1000 km Equator ASIA...").
    if (/^\s*(?:of|in|across|throughout|from|to|long|wide|deep|high|tall|thick|broad)\b/i.test(after)) {
      const cleanedAfter = cleanNumericAttribute(after);
      if (cleanedAfter && cleanedAfter.length >= 3 && isUsableSubject(cleanedAfter)) {
        return cleanedAfter;
      }
    }

    // If neither before nor after establishes an explicit, valid subject relationship, return empty
    return '';
  }

  function isInsideParentheses(text, index) {
    let depth = 0;
    for (let i = 0; i < index; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && depth > 0) depth--;
    }
    return depth > 0;
  }

  function numericDrafts(text) {
    const drafts = [];
    const patterns = [
      { kind: 'currency', re: /(?:US\$|₹|\$)\s*-?\d[\d,]*(?:\.\d+)?(?:\s*(?:crore|billion|lakh|million|trillion))?/gi },
      { kind: 'percentage', re: /-?\d[\d,]*(?:\.\d+)?\s*(?:%|percent(?:age)?)/gi },
      { kind: 'measurement', re: /-?\d[\d,]*(?:\.\d+)?\s*(?:km|kilometres?|kilometers?|metres?|meters?|cm|mm|kg|kilograms?|grams?|g|°c|degrees?(?:\s+celsius)?|hectares?|sq\.?\s*km)\b/gi },
      { kind: 'count', re: /-?\d[\d,]*(?:\.\d+)?\s+(?:[A-Za-z][A-Za-z-]*\s+){0,3}(?:channels?|services?|people|persons|children|students|states?|districts?|countries|years?|months?|days?|hours?|minutes?|seconds?|steps?|members?|seats?|videos?)\b/gi }
    ];

    for (const pattern of patterns) {
      let match;
      pattern.re.lastIndex = 0;
      while ((match = pattern.re.exec(text)) !== null) {
        if (isInsideParentheses(text, match.index)) continue;
        const object = cleanText(match[0]);
        const info = parseNumericValue(object);
        if (!info) continue;
        if (!isCleanQuantity(object)) continue;
        const prefix = text.slice(Math.max(0, match.index - 30), match.index);
        const approximate = /(?:~|over|about|approximately|around|nearly|almost|more\s+than|less\s+than|under|at\s+least|at\s+most|up\s+to)\s*$/i.test(prefix);
        const negative = info.raw.startsWith('-') || /(?:not|never|cannot|no|without|nor|neither)\b[^.;]{0,24}$/i.test(prefix);
        const attribute = numericAttribute(text, match, pattern.kind);
        if (!attribute) continue;
        const subject = attribute;
        const answerKind = pattern.kind === 'currency' ? 'amount'
          : (pattern.kind === 'percentage' ? 'percentage'
            : (pattern.kind === 'measurement' ? 'measurement' : 'number'));
        const duplicate = drafts.some((draft) =>
          normalizeObject(draft.object) === normalizeObject(object) &&
          normalizeSubject(draft.subject) === normalizeSubject(subject)
        );
        if (duplicate) continue;
        drafts.push({
          fact_type: 'numeric',
          subject,
          relation: 'numeric_value',
          object,
          attribute,
          answer_kind: answerKind,
          precision: approximate ? 'approximate' : 'exact',
          polarity: negative ? 'negative' : 'positive',
          numeric_kind: pattern.kind,
          extraction_method: 'numeric_quantity'
        });
      }
    }
    return drafts;
  }

  function parseFactRelations(sentence, sectionContext) {
    const text = cleanText(sentence);
    const context = sectionContext || {};
    if (!text) return [];
    // Sentence-role gate (Repair 002, Phase 4): only assertions may
    // generate ordinary factual propositions. This runs before causal,
    // conditional, comparison, definition, sequence, exception or any
    // other factual-relation extraction, and before the fallback below.
    const sentenceRole = classifySentenceRole(text);
    if (sentenceRole !== 'assertion') return [];
    // Phase 8 fix: running book titles are page furniture, not facts, even
    // when the layout extractor merged a footer line with body text on the
    // same line (e.g. "Exploring Society: India and Beyond | G rade 8
    // Part 2 launched in 1906."). A sentence unit containing that title
    // pattern, or a spaced-out "G rade" artefact, must not become a fact.
    if (/\bexploring society\b/i.test(text) && /\bgrade\b/i.test(text)) return [];
    if (/\|\s*G\s*rade\b/i.test(text)) return [];
    if (/^exploring society:/i.test(text)) return [];
    const facts = [];
    const add = (draft) => {
      if (!draft || !draft.subject || draft.object == null || draft.object === '') return;
      const duplicate = facts.some((fact) =>
        fact.fact_type === draft.fact_type &&
        normalizeSubject(fact.subject) === normalizeSubject(draft.subject) &&
        normalizeRelation(fact.relation) === normalizeRelation(draft.relation) &&
        normalizeObject(fact.object) === normalizeObject(draft.object)
      );
      if (!duplicate) {
        facts.push(Object.assign({ supporting_excerpt: text, extraction_method: 'explicit' }, draft));
      }
    };

    const sequence = parseSequence(text);
    if (sequence) {
      add(sequence);
      return facts;
    }

    const initialMove = parseInitialMove(text, context);
    if (initialMove) {
      initialMove.forEach(add);
      return facts;
    }

    const membership = parseMembership(text, context);
    if (membership) add(membership);

    // Abbreviation extraction runs before definition to avoid duplicate on same sentence.
    const abbreviation = parseAbbreviation(text);
    if (abbreviation) add(abbreviation);

    const definition = parseDefinition(text);
    if (definition) {
      add(definition);
      // Don't return early — a sentence may also contain dates or entity attributes.
    }

    const cause = parseCause(text);
    if (cause) {
      add(cause);
      if (!facts.some((f) => f.fact_type === 'causal')) return facts;
    }

    const conditional = parseConditional(text);
    if (conditional) {
      add(conditional);
      if (!facts.some((f) => f.fact_type !== 'causal' && f.fact_type !== 'fallback')) return facts;
    }

    const comparison = parseComparison(text);
    if (comparison) {
      add(comparison);
      if (!facts.some((f) => f.fact_type !== 'comparison' && f.fact_type !== 'fallback')) return facts;
    }

    const dates = parseDates(text, context);
    dates.forEach(add);

    parseEntityAttributes(text, context).forEach(add);
    if (!dates.length) numericDrafts(text).forEach(add);

    // Generic relational-verb fallback (quality, cross-subject): for
    // sentences that yielded nothing, try "[Subject] <verb> [object]"
    // with common relational verbs. This is what lets geography and
    // civics sources work, not just "is/was" textbook sentences:
    // "The Ganga originates from the Gangotri glacier" and
    // "Article 19 protects freedom of speech" are facts, even though
    // no earlier parser recognised "originates from" or "protects".
    // Only specific subjects and clean noun-phrase objects qualify;
    // clauses ("states that the State shall…") are allowed only for
    // "states", where the clause itself is the answer, and other
    // clause objects are rejected.
    if (!facts.length) {
      const genericMatch = text.match(/^([A-Z][^,.:!?]{2,60}?)\s+(originates from|flows through|runs? parallel to|protects|guarantees|ensures|provides|contains|covers|states that|is known for|is famous for)\s+(.+?)[.!?]?\s*$/i);
      if (genericMatch) {
        const genericSubject = cleanFactSubject(genericMatch[1]);
        let genericVerb = genericMatch[2].toLowerCase().replace(/\s+/g, '_');
        if (genericVerb === 'run_parallel_to') genericVerb = 'runs_parallel_to';
        const genericObject = cleanText(genericMatch[3]).replace(/[.,;:]+$/, '');
        const isClauseObject = /^(that|the state shall|the state|it)\b/i.test(genericObject) && genericVerb !== 'states_that';
        if (genericSubject && genericObject
            && isUsableSubject(genericSubject)
            && !isFragmentPhrase(genericObject)
            && !isClauseObject
            && genericObject.length >= 3 && genericObject.length <= 100) {
          add({
            fact_type: 'entity_attribute',
            subject: genericSubject,
            relation: genericVerb,
            object: genericObject,
            answer_kind: genericVerb === 'originates_from' ? 'place' : 'entity',
            extraction_method: 'generic_relational_verb'
          });
        }
      }
    }
    // Pattern-enriched fallback: for sentences that yielded nothing, try a broad
    // "[ProperNoun] is/was [description]" extraction. Guards keep it safe.
    if (!facts.length) {
      const enrichMatch = text.match(/^([A-Z][^,.:!?]{2,50}?)\s+(?:is|was|are|were)\s+(.{10,100}?)[.!?]?\s*$/);
      if (enrichMatch) {
        const enrichSubject = cleanFactSubject(enrichMatch[1]);
        const enrichObject = cleanText(enrichMatch[2]).replace(/[.,;:]+$/, '');
        if (enrichSubject && enrichObject
            && isUsableSubject(enrichSubject)
            && !UNUSABLE_SUBJECT_START.test(enrichObject)
            && enrichObject.length >= 10 && enrichObject.length <= 100) {
          add({
            fact_type: 'entity_attribute',
            subject: enrichSubject,
            relation: 'role',
            object: enrichObject,
            answer_kind: 'role',
            extraction_method: 'pattern_enriched'
          });
        }
      }
    }

    return facts;
  }

  function collectSentenceUnits(sections) {
    const units = [];
    let kuSeq = 0;
    const list = Array.isArray(sections) ? sections : [];
    for (let sectionIndex = 0; sectionIndex < list.length; sectionIndex++) {
      const section = list[sectionIndex] || {};
      const sectionId = section.id || ('sec_' + (sectionIndex + 1));
      const title = cleanText(section.title || ('Section ' + (sectionIndex + 1)));
      const sectionText = String(section.text || '');
      const records = segmentSentencesWithOffsets(sectionText);
      for (const record of records) {
        kuSeq++;
        units.push({
          ku_id: 'KU-LITE-' + padNumber(kuSeq, 3),
          section,
          section_id: sectionId,
          section_title: title,
          source_page: section.page != null ? section.page : 1,
          source_text: record.text,
          source_start: record.start,
          source_end: record.end,
          sentence_role: classifySentenceRole(record.text)
        });
      }
    }
    return units;
  }

  // Table parsing (mock-test quality, tables as facts): a table
  // is not prose, so sentence extraction cannot read it, and the
  // old pipeline turned every table row into a fallback fact.
  // Two formats reach this stage. The PDF parser renders a table
  // block as one paragraph with rows separated by ' ; ' and cells
  // by ' | '. A pasted text table with rows on separate lines
  // arrives as consecutive pipe-delimited sentence units (the
  // sentence splitter breaks on newlines). Both are parsed here,
  // into one fact per cell: subject = row header, relation =
  // column header, object = cell value. A table question is then
  // a normal single-choice question on a table fact, with
  // distractors from the same column, so it passes the same
  // validation as every other question instead of being a
  // special case that bypasses evidence checks.
  function parseTableRow(text) {
    if (!text || text.indexOf('|') === -1) return null;
    const cells = String(text).split('|').map((c) => cleanText(c));
    if (cells.length < 2) return null;
    for (const cell of cells) {
      if (!cell || cell.length > 40 || cell.indexOf('?') !== -1 || /^[^A-Za-z0-9]/.test(cell)) return null;
    }
    return cells;
  }

  function tableGroupIsClean(rows) {
    if (!rows || rows.length < 4) return false;
    const count = rows[0].length;
    if (count < 2) return false;
    for (const row of rows) if (row.length !== count) return false;
    const headers = rows[0];
    if (headers.some((h) => !/[A-Za-z]/.test(h) || /^\d+$/.test(h))) return false;
    if (new Set(headers.map((h) => h.toLowerCase())).size !== headers.length) return false;
    const rowHeaders = rows.slice(1).map((r) => r[0].toLowerCase());
    if (new Set(rowHeaders).size !== rowHeaders.length) return false;
    return true;
  }

  function detectTableGroups(units) {
    const groups = [];
    const consumed = new Set();
    for (let i = 0; i < units.length; i++) {
      if (consumed.has(i)) continue;
      const unit = units[i];
      // Format A: one PDF table paragraph, rows separated by ' ; '.
      if (unit.source_text.indexOf(' ; ') !== -1 && unit.source_text.indexOf('|') !== -1) {
        const rows = unit.source_text.split(' ; ').map(parseTableRow);
        if (rows.every(Boolean) && tableGroupIsClean(rows)) {
          groups.push({ unitIndices: [i], rows, tableText: cleanText(unit.source_text), sectionId: unit.section_id });
          consumed.add(i);
          continue;
        }
      }
      // Format B: consecutive pipe-delimited units, one row each.
      const rows = [];
      const indices = [];
      for (let j = i; j < units.length; j++) {
        if (units[j].section_id !== unit.section_id) break;
        const row = parseTableRow(units[j].source_text);
        if (!row) break;
        if (rows.length && row.length !== rows[0].length) break;
        rows.push(row);
        indices.push(j);
      }
      if (tableGroupIsClean(rows)) {
        groups.push({ unitIndices: indices, rows, tableText: rows.map((r) => r.join(' | ')).join(' ; '), sectionId: unit.section_id });
        for (const idx of indices) consumed.add(idx);
      }
    }
    return groups;
  }

  function extractSourceFacts(sections, options) {
    const opts = options || {};
    const sourceMeta = opts.sourceMeta || null;
    const facts = [];
    const units = collectSentenceUnits(sections);
    let factSeq = 0;
    let previousSubject = '';
    const tableGroups = detectTableGroups(units);
    const tableUnitMap = new Map();
    tableGroups.forEach((group, groupIndex) => {
      group.unitIndices.forEach((unitIndex, position) => {
        tableUnitMap.set(unitIndex, { group, groupIndex, position });
      });
    });

    for (let unitIndex = 0; unitIndex < units.length; unitIndex++) {
      const unit = units[unitIndex];
      const tableInfo = tableUnitMap.get(unitIndex);
      if (tableInfo) {
        // Table rows do not enter prose fact extraction and must
        // not seed the previous-subject chain for the next
        // sentence. Header rows emit no facts; each data row
        // emits one fact per non-first column.
        if (tableInfo.group.unitIndices.length === 1) {
          // Format A: one unit holds the whole table.
          const rows = tableInfo.group.rows;
          const headers = rows[0];
          const tableId = tableInfo.group.sectionId + '|' + unitIndex + '|' + headers.join('|').toLowerCase();
          for (let r = 1; r < rows.length; r++) {
            for (let c = 1; c < headers.length; c++) {
              const column = headers[c].replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
              if (!column) continue;
              factSeq++;
              facts.push({
                fact_id: 'F-LITE-' + padNumber(factSeq, 3),
                ku_id: unit.ku_id,
                section_id: unit.section_id,
                section_title: unit.section_title,
                source_page: unit.source_page,
                source_text: unit.source_text,
                supporting_excerpt: unit.source_text,
                source_start: unit.source_start,
                source_end: unit.source_end,
                object_start: unit.source_start,
                object_end: unit.source_end,
                fact_type: 'table',
                subject: rows[r][0],
                relation: 'table_' + column,
                object: rows[r][c],
                normalized_subject: normalizeSubject(rows[r][0]),
                normalized_relation: normalizeRelation('table_' + column),
                normalized_object: normalizeObject(rows[r][c]),
                temporal_scope: '',
                extraction_method: 'table_cell',
                confidence_class: factConfidenceClass({}, sourceMeta),
                conflict_status: 'clear',
                answer_kind: 'table_cell',
                sentence_role: 'assertion',
                table_id: tableId,
                table_header: headers[c],
                table_row: rows[r][0],
                table_text: tableInfo.group.tableText
              });
            }
          }
        } else if (tableInfo.position > 0) {
          const rows = tableInfo.group.rows;
          const headers = rows[0];
          const row = rows[tableInfo.position];
          const tableId = tableInfo.group.sectionId + '|' + tableInfo.group.unitIndices[0] + '|' + headers.join('|').toLowerCase();
          for (let c = 1; c < headers.length; c++) {
            const column = headers[c].replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
            if (!column) continue;
            factSeq++;
            facts.push({
              fact_id: 'F-LITE-' + padNumber(factSeq, 3),
              ku_id: unit.ku_id,
              section_id: unit.section_id,
              section_title: unit.section_title,
              source_page: unit.source_page,
              source_text: unit.source_text,
              supporting_excerpt: unit.source_text,
              source_start: unit.source_start,
              source_end: unit.source_end,
              object_start: unit.source_start,
              object_end: unit.source_end,
              fact_type: 'table',
              subject: row[0],
              relation: 'table_' + column,
              object: row[c],
              normalized_subject: normalizeSubject(row[0]),
              normalized_relation: normalizeRelation('table_' + column),
              normalized_object: normalizeObject(row[c]),
              temporal_scope: '',
              extraction_method: 'table_cell',
              confidence_class: factConfidenceClass({}, sourceMeta),
              conflict_status: 'clear',
              answer_kind: 'table_cell',
              sentence_role: 'assertion',
              table_id: tableId,
              table_header: headers[c],
              table_row: row[0],
              table_text: tableInfo.group.tableText
            });
          }
        }
        continue;
      }
      const context = {
        previousSubject,
        sectionTitle: unit.section_title,
        sectionId: unit.section_id,
        sourcePage: unit.source_page
      };
      const sentenceRole = classifySentenceRole(unit.source_text);
      // Never create fallback facts from an excluded interrogative,
      // instruction or ambiguous unit.
      if (sentenceRole !== 'assertion') continue;
      let drafts = parseFactRelations(unit.source_text, context);
      if (!drafts.length) {
        drafts = [{
          fact_type: 'fallback',
          subject: '',
          relation: 'unclassified',
          object: '',
          answer_kind: 'none',
          extraction_method: 'fallback',
          supporting_excerpt: unit.source_text
        }];
      }

      for (const draft of drafts) {
        factSeq++;
        const objectText = draft.object == null ? '' : String(draft.object);
        const objectIndex = objectText
          ? unit.section.text.indexOf(objectText, unit.source_start)
          : -1;
        const objectStart = objectIndex >= 0 && objectIndex < unit.source_end ? objectIndex : unit.source_start;
        const objectEnd = objectIndex >= 0 && objectIndex < unit.source_end ? objectIndex + objectText.length : unit.source_end;
        const fact = {
          fact_id: 'F-LITE-' + padNumber(factSeq, 3),
          ku_id: unit.ku_id,
          section_id: unit.section_id,
          section_title: unit.section_title,
          source_page: unit.source_page,
          source_text: unit.source_text,
          supporting_excerpt: unit.source_text,
          source_start: unit.source_start,
          source_end: unit.source_end,
          object_start: objectStart,
          object_end: objectEnd,
          fact_type: draft.fact_type || 'fallback',
          subject: draft.subject || '',
          relation: draft.relation || 'unclassified',
          object: objectText,
          normalized_subject: normalizeSubject(draft.subject || ''),
          normalized_relation: normalizeRelation(draft.relation || 'unclassified'),
          normalized_object: normalizeObject(objectText),
          temporal_scope: draft.temporal_scope || '',
          extraction_method: draft.extraction_method || 'explicit',
          confidence_class: factConfidenceClass(draft, sourceMeta),
          conflict_status: 'clear',
          answer_kind: draft.answer_kind || 'none',
          sentence_role: sentenceRole
        };

        const carry = [
          'members', 'exhaustive', 'observed_by', 'sequence_items', 'comparison',
          'event_base', 'event_type', 'event_object', 'requested_label',
          'relation_label', 'relation_verb', 'causal_direction', 'attribute',
          'precision', 'polarity', 'numeric_kind'
        ];
        for (const key of carry) {
          if (draft[key] !== undefined) fact[key] = draft[key];
        }
        if (fact.members) fact.members = fact.members.slice();
        if (fact.sequence_items) fact.sequence_items = fact.sequence_items.slice();
        facts.push(fact);
      }

      const subjectSource = facts
        .filter((fact) => fact.ku_id === unit.ku_id && fact.fact_type !== 'fallback' && fact.subject)
        .sort((a, b) => {
          const order = { date: 0, entity_attribute: 1, membership: 2, numeric: 3 };
          return (order[a.fact_type] == null ? 9 : order[a.fact_type]) - (order[b.fact_type] == null ? 9 : order[b.fact_type]);
        })[0];
      if (subjectSource) previousSubject = subjectSource.subject;
    }
    return facts;
  }

  function detectFactConflicts(facts) {
    const source = Array.isArray(facts) ? facts : [];
    const cloned = source.map((fact) => {
      const copy = Object.assign({}, fact);
      if (Array.isArray(fact.members)) copy.members = fact.members.slice();
      if (Array.isArray(fact.sequence_items)) copy.sequence_items = fact.sequence_items.slice();
      return copy;
    });
    const groups = Object.create(null);
    for (const fact of cloned) {
      if (fact.extraction_method === 'fallback' || fact.fact_type === 'fallback') continue;
      if (!SINGLE_VALUED_RELATIONS.has(fact.normalized_relation)) continue;
      const scope = normalizeObject(fact.temporal_scope || '');
      const key = `${fact.normalized_subject}|${fact.normalized_relation}|${scope}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(fact);
    }

    const conflicts = [];
    let conflictSeq = 0;
    for (const key of Object.keys(groups)) {
      const group = groups[key];
      const values = new Map();
      for (const fact of group) {
        if (!values.has(fact.normalized_object)) values.set(fact.normalized_object, fact);
      }
      if (values.size <= 1) continue;
      conflictSeq++;
      const conflictId = 'CF-LITE-' + padNumber(conflictSeq, 3);
      const conflict = {
        conflict_id: conflictId,
        key,
        subject: group[0].subject,
        relation: group[0].relation,
        temporal_scope: group[0].temporal_scope || '',
        fact_ids: group.map((fact) => fact.fact_id),
        values: group.map((fact) => ({
          fact_id: fact.fact_id,
          object: fact.object,
          source_excerpt: fact.supporting_excerpt
        }))
      };
      conflicts.push(conflict);
      for (const fact of group) {
        fact.conflict_status = 'conflicting';
        fact.conflict_id = conflictId;
      }
    }

    return { facts: cloned, conflicts, conflictGroups: groups };
  }

  function buildKnowledgeInventory(sections, options) {
    const opts = options || {};
    const extracted = opts.facts
      ? opts.facts
      : (() => {
        const raw = extractSourceFacts(sections, opts);
        return detectFactConflicts(raw).facts;
      })();
    const facts = Array.isArray(extracted) ? extracted : [];
    const byKu = new Map();
    for (const fact of facts) {
      if (!byKu.has(fact.ku_id)) byKu.set(fact.ku_id, []);
      byKu.get(fact.ku_id).push(fact);
    }

    const units = collectSentenceUnits(sections);
    const inventory = units.map((unit) => {
      const unitFacts = byKu.get(unit.ku_id) || [];
      const usable = unitFacts.filter((fact) => fact.fact_type !== 'fallback' && fact.extraction_method !== 'fallback');
      const primary = usable[0] || unitFacts[0] || null;
      const conflict = unitFacts.some((fact) => fact.conflict_status === 'conflicting');
      const sourceClass = sourceConfidenceClass(opts.sourceMeta);
      let confidence = 'verified';
      if (unitFacts.some((fact) => fact.confidence_class === 'ocr-unverified')) {
        confidence = 'ocr-unverified';
      } else if (unitFacts.some((fact) => fact.confidence_class === 'ocr-confirmed')) {
        confidence = 'ocr-confirmed';
      } else if (unitFacts.length && unitFacts.every((fact) => fact.confidence_class === 'unclassified')) {
        confidence = sourceClass === 'ocr-unverified'
          ? 'ocr-unverified'
          : (sourceClass === 'ocr-confirmed' ? 'ocr-confirmed' : 'unclassified');
      }
      return {
        ku_id: unit.ku_id,
        tier: usable.length ? 1 : 3,
        section_id: unit.section_id,
        section_title: unit.section_title,
        statement: unit.source_text,
        anchor: primary && primary.subject ? primary.subject : unit.section_title,
        supporting_excerpt: unit.source_text,
        source_page: unit.source_page,
        source_start: unit.source_start,
        source_end: unit.source_end,
        fact_ids: unitFacts.map((fact) => fact.fact_id),
        fact_types: Array.from(new Set(unitFacts.map((fact) => fact.fact_type))),
        extraction_method: primary ? primary.extraction_method : 'fallback',
        confidence_class: confidence,
        conflict_status: conflict ? 'conflicting' : 'clear'
      };
    });
    Object.defineProperty(inventory, 'facts', { value: facts, enumerable: false });
    Object.defineProperty(inventory, 'conflicts', { value: opts.conflicts || [], enumerable: false });
    return inventory;
  }

  // Parse Raw Document (Markdown, TXT, or structured text)
  function parseRawDocument(rawText, defaultTitle) {
    // Repair 002, Phase 3: paragraph and page boundaries are structural.
    // A blank line flushes the current paragraph (it does not disappear);
    // a page marker flushes the current paragraph AND its section and
    // updates page metadata; a heading flushes both and starts a new
    // section. Wrapped lines inside one paragraph stay connected (joined
    // with a single space). Two paragraphs are never joined into one
    // fact-extraction unit, and the end of one page is never merged with
    // the start of the next. Section.text joins paragraphs with blank
    // lines so sentence segmentation still sees the boundary.
    const titleFallback = defaultTitle || 'Study Document';
    const lines = String(rawText == null ? '' : rawText).split(/\r?\n/);
    const sections = [];
    let currentTitle = titleFallback;
    let currentParagraphLines = [];
    let currentParagraphs = [];
    let currentParagraphMeta = [];
    let pageNum = 1;

    const flushParagraph = () => {
      if (!currentParagraphLines.length) return;
      const paragraphText = currentParagraphLines.join(' ');
      currentParagraphs.push(paragraphText);
      currentParagraphMeta.push({ text: paragraphText, page: pageNum, title: currentTitle });
      currentParagraphLines = [];
    };
    const flushSection = () => {
      flushParagraph();
      if (!currentParagraphs.length) return;
      sections.push({
        id: 'sec_' + (sections.length + 1),
        title: currentTitle,
        text: currentParagraphs.join('\n\n'),
        page: pageNum,
        paragraphs: currentParagraphs.slice(),
        paragraphMeta: currentParagraphMeta.slice()
      });
      currentParagraphs = [];
      currentParagraphMeta = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      // Blank line: paragraph boundary, not ignored, not a section break.
      if (!trimmed) {
        flushParagraph();
        continue;
      }

      const pageMatch = trimmed.match(/^page\s+(\d+)/i) || trimmed.match(/^==Page\s+(\d+)/i);
      if (pageMatch) {
        flushSection();
        pageNum = parseInt(pageMatch[1], 10);
        continue;
      }

      const isHeader = /^#{1,4}\s+(.+)$/.test(trimmed) ||
        /^(\d+\.|\([A-Za-z0-9]+\))\s+[A-Z]/.test(trimmed) ||
        /^Topic\s+\d+:/i.test(trimmed);

      if (isHeader) {
        flushSection();
        currentTitle = trimmed.replace(/^#{1,4}\s+/, '').replace(/^(\d+\.|\([A-Za-z0-9]+\))\s+/, '');
      } else {
        currentParagraphLines.push(trimmed);
      }
    }

    flushSection();

    if (sections.length === 0 && cleanText(rawText).length > 20) {
      sections.push({
        id: 'sec_1',
        title: titleFallback,
        text: cleanText(rawText),
        page: 1,
        paragraphs: [cleanText(rawText)],
        paragraphMeta: [{ text: cleanText(rawText), page: 1, title: titleFallback }]
      });
    }

    return sections;
  }

  function isValueSupported(facts, subject, relation, value, scope) {
    const ns = normalizeSubject(subject);
    const nr = normalizeRelation(relation);
    const nv = normalizeObject(value);
    const nscope = normalizeObject(scope || '');
    return (facts || []).some((fact) =>
      fact.normalized_subject === ns &&
      fact.normalized_relation === nr &&
      fact.normalized_object === nv &&
      normalizeObject(fact.temporal_scope || '') === nscope
    );
  }

  function validCalendarValue(value) {
    const match = value.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
    if (!match) return true;
    const day = parseInt(match[1], 10);
    const month = new Date(`${match[2]} 1, 2000`).getMonth();
    const year = parseInt(match[3], 10);
    const days = new Date(year, month + 1, 0).getDate();
    return day >= 1 && day <= days;
  }

  function replaceYears(value, offset) {
    return String(value).replace(/\b(?:1\d{3}|20\d{2})\b/g, (yearText) => {
      const year = parseInt(yearText, 10) + offset;
      if (year < 1000 || year > 2999) return yearText;
      return String(year);
    });
  }

  function buildDateDistractors(fact, registry, questionSubtype) {
    const ctx = normalizeRegistry(registry);
    const facts = ctx.facts;
    const correct = String(fact.object || '');
    if (!/\d{4}/.test(correct)) return [];
    const results = [];
    const offsets = [-3, 3, -2, 2, -1, 1];
    for (const offset of offsets) {
      if (results.length >= 6) break;
      const candidate = replaceYears(correct, offset);
      if (normalizeObject(candidate) === normalizeObject(correct)) continue;
      if (!validCalendarValue(candidate)) continue;
      if (isValueSupported(facts, fact.subject, fact.relation, candidate, fact.temporal_scope)) continue;
      if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
      results.push({
        text: candidate,
        origin: 'deterministic_value_offset',
        confusion_type: 'wrong_date',
        distractor_purpose: 'wrong_date'
      });
    }

    for (const other of (ctx.index.dates || [])) {
      if (results.length >= 6) break;
      if (other.fact_id === fact.fact_id) continue;
      if (normalizeObject(other.object) === normalizeObject(correct)) continue;
      if (normalizeSubject(other.subject) === normalizeSubject(fact.subject) &&
          normalizeRelation(other.relation) === normalizeRelation(fact.relation)) continue;
      if (results.some((item) => isEquivalentOption(item.text, other.object))) continue;
      results.push({
        text: other.object,
        origin: 'source_date_pool',
        confusion_type: 'wrong_date',
        distractor_purpose: 'wrong_date'
      });
    }
    return results;
  }

  function formatNumberLike(info, number) {
    let text = number.toFixed(info.decimals);
    if (info.hasComma) {
      const sign = text.startsWith('-') ? '-' : '';
      const unsigned = sign ? text.slice(1) : text;
      const parts = unsigned.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      text = sign + parts.join('.');
    }
    return text;
  }

  function formatNumericValue(original, info, number) {
    return original.slice(0, info.start) + formatNumberLike(info, number) + original.slice(info.end);
  }

  function buildNumericDistractors(fact, registry, questionSubtype) {
    const ctx = normalizeRegistry(registry);
    const facts = ctx.facts;
    const correct = String(fact.object || '');
    const info = parseNumericValue(correct);
    if (!info) return [];
    const isPercentage = fact.numeric_kind === 'percentage' || /%|percent(?:age)?/i.test(correct);
    const offsets = info.decimals > 0
      ? [-0.25, 0.25, -0.5, 0.5, -1, 1]
      : (isPercentage
        ? [-5, 5, -2, 2, -10, 10]
        : [-1, 1, -2, 2, -5, 5]);
    const results = [];
    for (const offset of offsets) {
      if (results.length >= 6) break;
      const next = info.number + offset;
      if (info.number >= 0 && next < 0) continue;
      if (isPercentage && (next < 0 || next > 100)) continue;
      const candidate = formatNumericValue(correct, info, next);
      if (normalizeObject(candidate) === normalizeObject(correct)) continue;
      if (isValueSupported(facts, fact.subject, fact.relation, candidate, fact.temporal_scope)) continue;
      if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
      results.push({
        text: candidate,
        origin: 'deterministic_value_offset',
        confusion_type: 'adjacent_value',
        distractor_purpose: 'adjacent_value'
      });
    }
    return results;
  }

  function entityPool(fact, registry) {
    const ctx = normalizeRegistry(registry);
    const index = ctx.index;
    const facts = ctx.facts;
    let pool = [];
    // Quality, cross-subject: distractors must come from the source
    // itself. The old controlled pools (Indian institutions, space
    // functions, "statutory regulator", "orbit correction"…) produced
    // off-topic options in science, history and pedagogy sources, where
    // a student could eliminate them without knowing the topic. If the
    // source does not supply three same-type distractors, the candidate
    // is rejected — a missing question is better than a giveaway.
    if (fact.answer_kind === 'place') pool = index.places.slice();
    else if (fact.answer_kind === 'institution') pool = index.institutions.slice();
    else if (fact.answer_kind === 'person') pool = index.persons.slice();
    else if (fact.answer_kind === 'role') pool = index.roles.slice();
    else if (fact.answer_kind === 'equipment') pool = index.equipment.slice();
    else if (fact.answer_kind === 'function') pool = index.functions.slice();
    else pool = index.functions.concat(index.roles);

    const sameSubjectPlaces = new Set();
    if (fact.answer_kind === 'place') {
      for (const other of facts) {
        if (other.normalized_subject === fact.normalized_subject &&
            /location/.test(other.normalized_relation)) {
          sameSubjectPlaces.add(other.normalized_object);
        }
      }
    }

    return pool.filter((candidate) => {
      if (!candidate) return false;
      if (isFragmentPhrase(candidate)) return false;
      const normalized = normalizeObject(candidate);
      if (!normalized || normalized === normalizeObject(fact.object)) return false;
      if (sameSubjectPlaces.has(normalized)) return false;
      if (isValueSupported(facts, fact.subject, fact.relation, candidate, fact.temporal_scope)) return false;
      return true;
    });
  }

  function buildEntityDistractors(fact, registry, questionSubtype) {
    const ctx = normalizeRegistry(registry);
    const results = [];
    const pool = entityPool(fact, ctx);
    for (const candidate of pool) {
      if (results.length >= 6) break;
      if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
      results.push({
        text: candidate,
        origin: fact.answer_kind === 'place' ? 'controlled_place_pool' : 'typed_entity_pool',
        confusion_type: fact.answer_kind === 'place' ? 'wrong_place' : 'wrong_entity',
        distractor_purpose: fact.answer_kind === 'place' ? 'wrong_entity' : 'confusable_fact'
      });
    }
    return results;
  }

  function buildDefinitionDistractors(fact, registry, questionSubtype) {
    const ctx = normalizeRegistry(registry);
    const results = [];
    for (const candidate of ctx.index.definitions) {
      if (results.length >= 6) break;
      if (isFragmentPhrase(candidate)) continue;
      if (normalizeObject(candidate) === normalizeObject(fact.object)) continue;
      if (isValueSupported(ctx.facts, fact.subject, fact.relation, candidate, fact.temporal_scope)) continue;
      if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
      results.push({
        text: candidate,
        origin: 'source_definition_pool',
        confusion_type: 'partial_truth',
        distractor_purpose: 'confusable_fact'
      });
    }
    // Fallback: functions, roles, comparisons as plausible wrong definitions
    if (results.length < 3) {
      const fallback = [...ctx.index.functions, ...ctx.index.roles, ...ctx.index.comparisons];
      for (const candidate of fallback) {
        if (results.length >= 6) break;
        if (!candidate) continue;
        if (normalizeObject(candidate) === normalizeObject(fact.object)) continue;
        if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
        results.push({
          text: candidate,
          origin: 'typed_entity_pool',
          confusion_type: 'partial_truth',
          distractor_purpose: 'confusable_fact'
        });
      }
    }
    return results;
  }

  function membershipAlternatives(fact, registry) {
    const ctx = normalizeRegistry(registry);
    const category = fact.subject || '';
    const members = fact.members || [];
    const memberSet = new Set(members.map(normalizeObject));
    let alternatives = [];
    for (const rule of CONTROLLED_CATEGORY_RULES) {
      if (rule.test.test(category)) {
        alternatives = alternatives.concat(rule.alternatives);
      }
    }
    for (const other of ctx.index.members) {
      if (alternatives.length >= 8) break;
      if (memberSet.has(normalizeObject(other))) continue;
      alternatives.push(other);
    }
    return alternatives.filter((candidate, index, list) =>
      candidate &&
      !/\b(for|over|about|around|approximately|more than|less than)\s+\d+\s*$/i.test(candidate) &&
      !isFragmentPhrase(candidate) &&
      !/^\d/.test(candidate) &&
      !/^(about|around|approximately|over|under|nearly)\s+\d/i.test(candidate) &&
      !memberSet.has(normalizeObject(candidate)) &&
      list.findIndex((item) => normalizeObject(item) === normalizeObject(candidate)) === index
    );
  }

  function buildMembershipDistractors(fact, registry, correctMember) {
    const results = [];
    for (const candidate of membershipAlternatives(fact, registry)) {
      if (results.length >= 6) break;
      if (isEquivalentOption(candidate, correctMember)) continue;
      results.push({
        text: candidate,
        origin: 'controlled_category_pool',
        confusion_type: 'wrong_category',
        distractor_purpose: 'wrong_category'
      });
    }
    return results;
  }

  function buildCauseDistractors(fact, registry, questionSubtype) {
    const ctx = normalizeRegistry(registry);
    const results = [];
    for (const candidate of ctx.index.effects) {
      if (results.length >= 6) break;
      if (normalizeObject(candidate) === normalizeObject(fact.object)) continue;
      // Phase 8 fix (fourth round): causal effects used as distractors
      // must not be fragments ("of the high-pitched chants ...", "it
      // clear, therefore, that ...") or sentence-long clauses.
      if (isFragmentPhrase(candidate)) continue;
      if (/^(it|they|this|that|of|to|in|on|for|with|by|as)\b/i.test(candidate)) continue;
      if (candidate.split(/\s+/).filter(Boolean).length > 12) continue;
      if (isValueSupported(ctx.facts, fact.subject, fact.relation, candidate, fact.temporal_scope)) continue;
      if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
      results.push({
        text: candidate,
        origin: 'source_causal_pool',
        confusion_type: 'reversed_relation',
        distractor_purpose: 'confusable_fact'
      });
    }
    // Fallback: functions, definitions, and comparisons as plausible wrong effects
    if (results.length < 3) {
      const fallback = [...ctx.index.functions, ...ctx.index.definitions,
                        ...ctx.index.comparisons];
      for (const candidate of fallback) {
        if (results.length >= 6) break;
        if (!candidate) continue;
        if (normalizeObject(candidate) === normalizeObject(fact.object)) continue;
        if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
        results.push({
          text: candidate,
          origin: 'controlled_effect_pool',
          confusion_type: 'reversed_relation',
          distractor_purpose: 'scope_error'
        });
      }
    }
    return results;
  }

  function buildComparisonDistractors(fact, registry, questionSubtype) {
    const ctx = normalizeRegistry(registry);
    const results = [];
    for (const candidate of ctx.index.comparisons) {
      if (results.length >= 6) break;
      if (normalizeObject(candidate) === normalizeObject(fact.object)) continue;
      if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
      results.push({
        text: candidate,
        origin: 'source_comparison_pool',
        confusion_type: 'scope_error',
        distractor_purpose: 'partial_truth'
      });
    }
    // Fallback: effects, definitions, functions as plausible wrong comparisons
    if (results.length < 3) {
      const fallback = [...ctx.index.effects, ...ctx.index.definitions, ...ctx.index.functions];
      for (const candidate of fallback) {
        if (results.length >= 6) break;
        if (!candidate) continue;
        if (normalizeObject(candidate) === normalizeObject(fact.object)) continue;
        if (results.some((item) => isEquivalentOption(item.text, candidate))) continue;
        results.push({
          text: candidate,
          origin: 'typed_entity_pool',
          confusion_type: 'scope_error',
          distractor_purpose: 'partial_truth'
        });
      }
    }
    return results;
  }

  function buildDistractorCandidates(fact, factRegistry, questionSubtype) {
    if (!fact) return [];
    if (isFactUnsafe(fact)) return [];
    if (questionSubtype === 'classification_membership') {
      const correct = fact.members && fact.members.length
        ? fact.members[stableHash(fact.fact_id) % fact.members.length]
        : fact.object;
      return buildMembershipDistractors(fact, factRegistry, correct);
    }
    let results = [];
    if (questionSubtype === 'cause_effect') results = buildCauseDistractors(fact, factRegistry, questionSubtype);
    else if (questionSubtype === 'comparison') results = buildComparisonDistractors(fact, factRegistry, questionSubtype);
    else if (fact.fact_type === 'date') return buildDateDistractors(fact, factRegistry, questionSubtype);
    else if (fact.fact_type === 'numeric') return buildNumericDistractors(fact, factRegistry, questionSubtype);
    else if (fact.fact_type === 'definition') results = buildDefinitionDistractors(fact, factRegistry, questionSubtype);
    else if (fact.fact_type === 'entity_attribute') results = buildEntityDistractors(fact, factRegistry, questionSubtype);
    // General source-object fallback (quality, cross-subject): when the
    // typed pool is too small — typical for short sources, notes, and
    // user documents — fill from other facts' objects in the SAME
    // source, with a similar length, rather than from generic pools or
    // not at all. This is what rescues a science or civics excerpt:
    // its own other effects, definitions and entities are plausible
    // wrong answers, while "statutory regulator" for photosynthesis is
    // not. Date and numeric questions are excluded: their distractors
    // must be dates/numbers, not arbitrary objects.
    if (results.length < 6) {
      const ctx = normalizeRegistry(factRegistry);
      const expected = cleanText(fact.object || '');
      const expectedLen = expected.length || 1;
      // Misconception preference (mock-test quality): a distractor
      // from a fact about the SAME subject family is a real test of
      // knowledge, while a distractor from an unrelated part of the
      // source is eliminable by topic alone — e.g. "oblate spheroid"
      // as a distractor for Yellowstone's role. So the fallback pool
      // is ordered by shared subject words first, then by length
      // closeness, instead of raw source order.
      const subjectWords = new Set(String(fact.subject || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !['about', 'which', 'their', 'these', 'those'].includes(w)));
      const pool = [];
      for (const other of ctx.facts || []) {
        if (!other || other.fact_id === fact.fact_id) continue;
        if (other.fact_type === 'numeric' || other.fact_type === 'date') continue;
        const otherWords = new Set(String(other.subject || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
        let overlap = 0;
        for (const w of subjectWords) if (otherWords.has(w)) overlap++;
        // Members of other lists are not answers: they leaked
        // animals ("bilbies", "dingoes") and counts ("about 350")
        // into unrelated questions as distractors. Only the other
        // fact's own object may be a fallback distractor.
        const values = [];
        if (other.object) values.push(other.object);
        for (const value of values) {
          const cand = cleanText(value);
          if (!cand || cand.length < 3 || cand.length > 150) continue;
          if (isFragmentPhrase(cand)) continue;
          if (/^(of|to|in|on|for|with|by|as)\b/i.test(cand)) continue;
          if (isEquivalentOption(cand, expected)) continue;
          if (isValueSupported(ctx.facts, fact.subject, fact.relation, cand, fact.temporal_scope)) continue;
          if (cand.length < expectedLen / 8 || cand.length > expectedLen * 8) continue;
          if (!pool.some((item) => isEquivalentOption(item.text, cand))) pool.push({ text: cand, overlap, sameType: other.fact_type === fact.fact_type });
        }
      }
      // Same-type distractors first: in a large source they are
      // always preferred over a cross-type phrase, so the fallback
      // only supplies cross-type options when no same-type option
      // exists (small sources, where dropping the question would
      // leave nothing at all).
      pool.sort((a, b) => ((b.sameType ? 1 : 0) - (a.sameType ? 1 : 0)) || (b.overlap - a.overlap) || (Math.abs(a.text.length - expectedLen) - Math.abs(b.text.length - expectedLen)));
      for (const item of pool) {
        if (results.length >= 6) break;
        if (results.some((r) => isEquivalentOption(r.text, item.text))) continue;
        results.push({
          text: item.text,
          origin: 'source_object_pool',
          confusion_type: 'partial_truth',
          distractor_purpose: 'confusable_fact'
        });
      }
    }
    return results;
  }

  const PAST_TENSE = {
    establish: 'established', found: 'founded', form: 'formed', create: 'created',
    constitute: 'constituted', incorporate: 'incorporated', 'set up': 'set up',
    commission: 'commissioned', launch: 'launched', start: 'started',
    introduce: 'introduced', begin: 'begun', implement: 'implemented',
    approve: 'approved', open: 'opened', enact: 'enacted', adopt: 'adopted',
    sign: 'signed', build: 'built', construct: 'constructed', hold: 'held',
    conduct: 'conducted', organise: 'organised', organize: 'organized',
    announce: 'announced', declare: 'declared', pass: 'passed', ratify: 'ratified',
    publish: 'published', release: 'released', complete: 'completed',
    award: 'awarded', rename: 'renamed', merge: 'merged', dissolve: 'dissolved',
    occur: 'occurred', happen: 'happened', 'take place': 'taken place',
    move: 'moved', record: 'recorded'
  };

  function pastTense(base) {
    return PAST_TENSE[base] || (String(base || '').endsWith('e') ? String(base) + 'd' : String(base) + 'ed');
  }

  function dateStem(fact) {
    if (!isUsableSubject(fact.subject)) return null;
    const subject = inlineSubject(fact.subject);
    if (fact.relation === 'date_field') {
      return `what date is recorded for ${subject}?`;
    }
    if (fact.answer_kind === 'range') {
      return `which period is associated with ${subject}?`;
    }
    const dateWord = fact.answer_kind === 'year' ? 'year' : 'date';
    if (fact.event_type === 'active') {
      const tail = fact.event_object ? ` to ${fact.event_object}` : '';
      return `in which ${dateWord} did ${subject} ${fact.event_base}${tail}?`;
    }
    return `in which ${dateWord} was ${subject} ${pastTense(fact.event_base)}?`;
  }

  function numericStem(fact) {
    const attribute = cleanText(fact.attribute || fact.subject || 'the stated quantity');
    if (!attribute || /^the stated quantity$/i.test(attribute)) return null;
    if (!isUsableSubject(attribute)) return null;
    // Dimension gate (manual read): an attribute that names no
    // dimension ("km from east", "long years") produces a stem
    // no student can parse ("What measurement is stated for km
    // from east?"). Reject it; a future entity-extraction step
    // may turn such facts into "How far / How many years" stems,
    // but a unit-fragment stem must never ship.
    const DIMENSION_NOUNS = /\b(distance|length|height|width|depth|area|volume|weight|mass|population|strength|span|age|speed|temperature|rate|percentage|proportion|count|number|total|amount|size|value|price|cost|duration|density|elevation|altitude)\b/i;
    // Refinement: an attribute that IS the subject ("Great Barrier
    // Reef" for "2300 kilometres") is a named entity, and the stem
    // "What measurement is stated for the Great Barrier Reef?" is
    // self-contained. Only a separate attribute phrase that names
    // neither a dimension nor a proper noun ("km from east",
    // "long years") is a unit fragment and is rejected.
    if (/\b(can|could|will|would|shall|should|may|might|must)\b/i.test(attribute)) return null;
    if (/^(km|kilometres?|metres?|cm|mm|kg|g|litres?|years?|days?)\b/i.test(attribute)) return null;
    if (/^long years$/i.test(attribute)) return null;
    const attrIsSubject = fact.attribute && cleanText(fact.attribute) === cleanText(fact.subject);
    if (!attrIsSubject && !DIMENSION_NOUNS.test(attribute) && !/[A-Z]/.test(attribute)) return null;
    const kind = fact.answer_kind === 'amount' ? 'amount'
      : fact.answer_kind === 'percentage' ? 'percentage'
        : fact.answer_kind === 'measurement' ? 'measurement'
          : 'number';
    const expected = cleanText(fact.object).toLowerCase();
    // "1,500 years" does not make "years" the thing being asked about, and
    // a bare-unit question ("What number is stated?" for "28 States") is
    // meaningless in an exam: it names no entity being counted. Reject
    // such facts rather than generating a context-free stem; a future
    // entity-extraction step may turn them into "How many States does
    // India have?" questions, but a vague stem must never ship.
    if (attribute.split(/\s+/).length === 1 && expected.endsWith(attribute.toLowerCase())) {
      return null;
    }
    // Stem polish: if the attribute itself contains a measured
    // value ("40°C during the day"), the stem asks for a
    // measurement for a measurement, and the question is
    // unanswerable without the excerpt ("What measurement is
    // stated for 40°C during the day?" for the answer 5°C).
    // A year in the attribute ("population in 2020") is a
    // qualifier, not a measured value, so it is allowed; a
    // number with a unit is not. Reject, do not ship the stem.
    if (/\d+\s*(°|%|km|m|cm|mm|kg|g|litres?|years?|days?)\b/i.test(attribute) && !/^\d{4}$/.test(attribute)) {
      const hasYearOnly = attribute.replace(/\b(1|2)\d{3}\b/g, '').trim();
      if (/\d/.test(hasYearOnly)) return null;
    }
    return `what ${kind} is stated for ${inlineSubject(attribute)}?`;
  }

  function entityStem(fact) {
    if (!isUsableSubject(fact.subject)) return null;
    const subject = inlineSubject(fact.subject);
    // Generic-subject gate (quality): a stem about "the following",
    // "the air", "one important factor", a subject ending in an adverb
    // ("the complex also", "subordinate courts broadly"), or a subject
    // containing a question word ("exposure to what") is not
    // identifiable on its own. Reject, do not ship a vague stem.
    if (/^(the following|the air|one important factor|the first task|the second outcome)$/i.test(subject)) return null;
    // A bare definite noun ("the mosque", "the palace", "the present
    // structure") does not identify which mosque or palace, so the
    // stem cannot be answered on its own. A named or modified version
    // ("the Dilwara Temples", "the mosque at Mount Abu") is fine.
    if (/^(the|a)\s+(mosque|palace|temple|fort|building|structure|church|tomb|monument)$/i.test(subject)) return null;
    if (/^(the)\s+(present|main|current)\s+(structure|building|mosque|palace|temple)$/i.test(subject)) return null;
    if (/\b(also|often|broadly|here|not only|not just|only)\s*[.!?]?$/i.test(subject)) return null;
    if (/\?/.test(subject) || /\bwhat\b/i.test(subject)) return null;
    // Superlative: subject IS the description; question asks which entity fits it.
    if (fact.relation === 'superlative') {
      return `which is described as ${subject}?`;
    }
    // Pattern-enriched fallback facts get a more neutral, natural stem.
    if (fact.extraction_method === 'pattern_enriched') {
      return `which of the following correctly describes ${subject}?`;
    }
    const stems = {
      initial_location: `where was ${subject} initially located?`,
      destination_location: `where did ${subject} move to?`,
      location: `where is ${subject} located?`,
      office: `which office did ${subject} hold?`,
      launched_by: `who launched ${subject}?`,
      implemented_by: `who implemented ${subject}?`,
      developed_by: `who developed ${subject}?`,
      function: `what is the stated function of ${subject}?`,
      method: `what method is associated with ${subject}?`,
      role: `what role is associated with ${subject}?`,
      equipment: `what equipment is used by ${subject}?`,
      originates_from: `where does ${subject} originate from?`,
      flows_through: `through what does ${subject} flow?`,
      runs_parallel_to: `what does ${subject} run parallel to?`,
      protects: `what does ${subject} protect?`,
      guarantees: `what does ${subject} guarantee?`,
      ensures: `what does ${subject} ensure?`,
      provides: `what does ${subject} provide?`,
      contains: `what does ${subject} contain?`,
      covers: `what does ${subject} cover?`,
      states_that: `what does ${subject} state?`,
      is_known_for: `what is ${subject} known for?`,
      is_famous_for: `what is ${subject} famous for?`
    };
    // No recognised relation means no self-contained question: a vague
    // "what does the source state about X?" stem must never ship.
    return stems[fact.relation] || null;
  }

  function causeStem(fact) {
    if (!isUsableSubject(fact.subject)) return null;
    const subject = inlineSubject(fact.subject);
    // A cause subject must be a concept, not a whole clause or a
    // discourse starter: "Let us…", "Besides,…", "Though …" and
    // subjects over 12 words ("the larger ones often include one or
    // several domes…") produce stems that are not questions at all.
    if (/^(let us|besides|though|while|although|however)\b/i.test(subject)) return null;
    if (subject.split(/\s+/).filter(Boolean).length > 12) return null;
    const verb = cleanText(fact.relation_verb || 'causes').toLowerCase();
    if (/^leads?\s+to$/.test(verb)) return `what does ${subject} lead to?`;
    if (/^results?\s+in$/.test(verb)) return `what does ${subject} result in?`;
    if (/^allows?$/.test(verb)) return `what does ${subject} allow?`;
    if (/^enables?$/.test(verb)) return `what does ${subject} enable?`;
    if (/^produces?$/.test(verb)) return `what does ${subject} produce?`;
    if (/^brings?\s+about$/.test(verb)) return `what does ${subject} bring about?`;
    if (/^triggers?$/.test(verb)) return `what does ${subject} trigger?`;
    if (/^contributes?\s+to$/.test(verb)) return `what does ${subject} contribute to?`;
    if (/^promotes?$/.test(verb)) return `what does ${subject} promote?`;
    if (/^stimulates?$/.test(verb)) return `what does ${subject} stimulate?`;
    if (/^inhibits?$/.test(verb)) return `what does ${subject} inhibit?`;
    if (/^prevents?$/.test(verb)) return `what does ${subject} prevent?`;
    if (/^reduces?$/.test(verb)) return `what does ${subject} reduce?`;
    if (/^increases?$/.test(verb)) return `what does ${subject} increase?`;
    if (/^decreases?$/.test(verb)) return `what does ${subject} decrease?`;
    if (/^influences?$/.test(verb)) return `what does ${subject} influence?`;
    if (/^affects?$/.test(verb)) return `what does ${subject} affect?`;
    if (/^determines?$/.test(verb)) return `what does ${subject} determine?`;
    if (/^drives?$/.test(verb)) return `what does ${subject} drive?`;
    if (/^encourages?$/.test(verb)) return `what does ${subject} encourage?`;
    if (/^generates?$/.test(verb)) return `what does ${subject} generate?`;
    if (/^strengthens?$/.test(verb)) return `what does ${subject} strengthen?`;
    if (/^weakens?$/.test(verb)) return `what does ${subject} weaken?`;
    if (/^accelerates?$/.test(verb)) return `what does ${subject} accelerate?`;
    if (/^helps?$/.test(verb)) return `what does ${subject} help achieve?`;
    if (/^makes?$/.test(verb)) return `what does ${subject} make possible?`;
    if (/^forces?$/.test(verb)) return `what does ${subject} force?`;
    if (/^supports?$/.test(verb)) return `what does ${subject} support?`;
    if (/^(?:due\s+to|owing\s+to|because\s+of|as\s+a\s+result\s+of|as\s+a\s+consequence\s+of)$/.test(verb)) {
      return `what is the effect of ${subject}?`;
    }
    if (/^is\s+responsible\s+for$/.test(verb)) return `what is ${subject} responsible for?`;
    if (/^(?:if|when|unless)$/.test(verb)) return `what happens when ${subject}?`;
    return `what does ${subject} cause?`;
  }

  function factExplanation(fact, subtype, expected, correct) {
    const excerpt = fact.supporting_excerpt;
    if (fact.fact_type === 'definition') {
      return `The source defines or describes ${fact.subject} as follows: “${excerpt}” The correct answer is ${expected}.`;
    }
    if (fact.fact_type === 'membership') {
      return `The source states: “${excerpt}” This lists ${correct} as a member of ${fact.subject}.`;
    }
    if (fact.fact_type === 'sequence') {
      return `The source presents the sequence as: “${excerpt}” The correct order follows that explicit sequence.`;
    }
    if (fact.fact_type === 'causal') {
      return `The source explicitly describes the relationship as: “${excerpt}” The answer preserves the stated direction of that relationship.`;
    }
    if (fact.fact_type === 'comparison') {
      return `The source states: “${excerpt}” This establishes the comparison in the stated direction.`;
    }
    if (fact.fact_type === 'date') {
      return `The source states: “${excerpt}” This identifies ${fact.requested_label || relationLabel(fact.relation)} as ${expected}.`;
    }
    if (fact.fact_type === 'numeric') {
      return `The source states: “${excerpt}” This identifies the value for ${fact.attribute || fact.subject} as ${expected}.`;
    }
    if (subtype === 'fill_blank') {
      return `The source states: “${excerpt}” This identifies the missing value as ${expected}.`;
    }
    return `The source states: “${excerpt}” This identifies ${relationLabel(fact.relation)} of ${fact.subject} as ${expected}.`;
  }

  // Difficulty is a property of the work the question asks, not just
  // its form label. A single-value recall is easy; a single relation
  // (cause, comparison, one table cell) is medium; anything that asks
  // the student to evaluate several statements, order events, match
  // pairs, or judge an Assertion-Reason pair is hard, because it
  // requires holding several claims in mind at once. Statement-option
  // was previously medium, but evaluating four full sentences is
  // multi-claim work, so it is hard here. This label is what the
  // mock-test assembler uses for its difficulty mix, so it must
  // reflect the task, not the subtype's age in the codebase.
  function difficultyFor(subtype) {
    if (subtype === 'multi_statement' || subtype === 'multi_statement_3' || subtype === 'assertion_reason' || subtype === 'matching' || subtype === 'statement_option' || subtype === 'chronology') return 'hard';
    if (subtype === 'date_recall' || subtype === 'numeric_recall') return 'easy';
    return 'medium';
  }

  function cognitiveFor(subtype) {
    if (subtype === 'multi_statement' || subtype === 'multi_statement_3' || subtype === 'statement_option' || subtype === 'assertion_reason' || subtype === 'matching' || subtype === 'chronology') return 'analysis';
    if (subtype === 'cause_effect' || subtype === 'comparison' || subtype === 'sequence_order' || subtype === 'table_question') return 'understanding';
    if (subtype === 'classification_membership' || subtype === 'definition') return 'understanding';
    return 'recall';
  }

  function optionMetadata(distractor) {
    return {
      origin: distractor.origin,
      confusion_type: VALID_CONFUSION_TYPES.includes(distractor.confusion_type) ? distractor.confusion_type : 'partial_truth',
      purpose: VALID_DISTRACTOR_PURPOSES.includes(distractor.distractor_purpose) ? distractor.distractor_purpose : 'confusable_fact'
    };
  }

  // Per-distractor explanations (mock-test quality): a student who
  // got a question wrong should learn why each wrong option fails,
  // not just that the correct option is right. Every sentence here
  // is tied to the distractor's origin, and every claim is true by
  // construction: the distractor is not the fact's object, so it is
  // not the value the source states for this subject and relation.
  // Sentences name option texts, never option letters, because the
  // bank builder rotates options after selection and a letter in
  // the explanation would then point at the wrong option.
  function explainDistractor(distractor, fact, expected, subtype) {
    const text = cleanText(distractor && distractor.text ? distractor.text : '');
    if (!text) return '';
    if (subtype === 'exception_reasoning' && distractor.origin === 'source_member_pool') {
      return `“${text}” is a true member of the list, so it cannot be the exception.`;
    }
    if (distractor.confusion_type === 'wrong_date') {
      return `“${text}” is a nearby year, but the source states ${expected} for this subject, not ${text}.`;
    }
    if (distractor.confusion_type === 'adjacent_value') {
      return `“${text}” is a nearby value, but the source states ${expected}, not ${text}.`;
    }
    if (distractor.origin === 'deterministic_permutation') {
      return `“${text}” swaps steps in the stated sequence.`;
    }
    if (distractor.confusion_type === 'wrong_place') {
      return `“${text}” is a different place of the same kind, not the one the source states for this subject.`;
    }
    if (distractor.confusion_type === 'wrong_entity') {
      return `“${text}” is a different entity of the same kind, not the one the source states for this subject.`;
    }
    if (distractor.origin === 'source_definition_pool') {
      return `“${text}” is a definition stated elsewhere in the source, not the definition of this subject.`;
    }
    if (distractor.origin === 'source_causal_pool' || distractor.origin === 'controlled_effect_pool') {
      return `“${text}” is an effect stated elsewhere in the source, not the effect of this cause.`;
    }
    if (distractor.origin === 'source_comparison_pool') {
      return `“${text}” is a different comparison, not the one the source states for this subject.`;
    }
    if (distractor.origin === 'source_object_pool') {
      return `“${text}” is stated in the source, but not for this subject.`;
    }
    if (distractor.origin === 'controlled_category_pool') {
      return `“${text}” is not a member of this list.`;
    }
    if (distractor.origin === 'table_column_pool') {
      return `“${text}” is the value for a different row in the same column, not for this row.`;
    }
    return `“${text}” is not the value the source states for this subject.`;
  }

  function buildSingleChoiceCandidate(fact, subtype, stem, expected, distractors, explanation, extra) {
    const usable = [];
    for (const distractor of distractors || []) {
      if (!distractor || !distractor.text) continue;
      // Length matching is applied after collection (below): distractors
      // are collected first, then the three closest in length to the
      // correct answer are chosen, so a long clause answer does not sit
      // next to only short one-word distractors as a giveaway.
      // Quality: a fragment distractor must never become an option, and
      // must not kill the whole question either — skip it and use the
      // next clean distractor from the pool, if one exists. Without this
      // central filter, a pool containing "type of" or "of its deep
      // roots…" poisoned otherwise valid questions (notably hees209,
      // which fell from 15 to 6 questions when validation alone
      // rejected them).
      const dt = cleanText(distractor.text);
      if (isFragmentPhrase(dt)) continue;
      if (/^(involving|including|leading|resulting|causing|following|concerning)\b/i.test(dt)) continue;
      if (/^(of|to|in|on|for|with|by|as)\b/i.test(dt)) continue;
      if (/^(type|path|kind) of$/i.test(dt)) continue;
      if (/^[^A-Za-z0-9]/.test(dt)) continue;
      if (isEquivalentOption(distractor.text, expected)) continue;
      if (usable.some((item) => isEquivalentOption(item.text, distractor.text))) continue;
      usable.push(distractor);
      if (usable.length >= 10) break;
    }
    if (usable.length < 3) return null;
    // Quality: choose the three distractors closest in length to the
    // correct answer. The pool is already type-matched and
    // source-derived; picking the first three in source order produced
    // systematic length giveaways (a 100-char clause answer next to
    // 10-char distractors). Length-matching keeps the options
    // homogeneous without inventing new distractors.
    usable.sort((a, b) => Math.abs(cleanText(a.text).length - cleanText(expected).length) - Math.abs(cleanText(b.text).length - cleanText(expected).length));
    usable.length = 3;

    const options = [{ key: 'A', text: expected, is_correct: true }];
    usable.forEach((distractor, index) => {
      options.push({
        key: KEYS[index + 1],
        text: cleanText(distractor.text),
        is_correct: false,
        distractor_origin: distractor.origin,
        confusion_type: optionMetadata(distractor).confusion_type,
        distractor_purpose: optionMetadata(distractor).purpose
      });
    });

    const framed = buildStemContext(stem, fact.supporting_excerpt, expected);
    // Per-distractor teaching, for direct single-value questions
    // only. Statement-option distractors are full mutated sentences,
    // so a value-based sentence would be wrong for them, and
    // multi/Assertion-Reason/matching already explain per statement,
    // per pair, or per code. For the direct forms, append one
    // sentence per chosen distractor, in option order.
    let fullExplanation = explanation;
    const directSubtypes = ['date_recall', 'numeric_recall', 'definition', 'entity_attribute', 'classification_membership', 'cause_effect', 'comparison', 'sequence_order', 'fill_blank', 'exception_reasoning'];
    if (directSubtypes.includes(subtype)) {
      const reasons = options.filter((o) => !o.is_correct).map((o) => {
        const src = usable.find((d) => cleanText(d.text) === cleanText(o.text)) || { text: o.text, origin: o.distractor_origin, confusion_type: o.confusion_type };
        return explainDistractor(src, fact, expected, subtype);
      }).filter(Boolean);
      if (reasons.length) fullExplanation = `${explanation} Why the other options are wrong: ${reasons.join(' ')}`;
    }
    const question = {
      id: '',
      type: 'single_choice',
      question_subtype: subtype,
      stem: framed.stem,
      context: framed.context,
      options,
      answer_key: 'A',
      expected_answer: expected,
      knowledge_units: [{ ku_id: fact.ku_id, fact_id: fact.fact_id, role: 'primary' }],
      source_title: fact.section_title,
      source_page: fact.source_page,
      supporting_excerpt: fact.supporting_excerpt,
      explanation: fullExplanation,
      difficulty: difficultyFor(subtype),
      cognitive_level: cognitiveFor(subtype),
      evidence: {
        fact_ids: [fact.fact_id],
        excerpts: [fact.supporting_excerpt],
        source_offsets: [{ fact_id: fact.fact_id, start: fact.source_start, end: fact.source_end }],
        stem_relation: fact.normalized_relation,
        temporal_scope: fact.temporal_scope || '',
        fact_type: fact.fact_type,
        source_title: fact.section_title,
        source_page: fact.source_page
      },
      verification: { status: 'candidate', rules: ['source_fact', 'typed_options', 'evidence_quoted'] },
      answer_relation_key: fact.fact_id + '|' + normalizeObject(fact.object),
      relation_keys: [fact.fact_id + '|' + normalizeObject(fact.object)],
      candidate_sort: { source_start: fact.source_start, fact_id: fact.fact_id }
    };
    return Object.assign(question, extra || {});
  }

  function fillBlankForFact(fact) {
    if (!fact.object || String(fact.object).length < 2 || String(fact.object).length > 120) return null;
    if (!fact.source_text || fact.source_text.indexOf(fact.object) === -1) return null;
    return replaceOnce(fact.source_text, fact.object, '______');
  }

  function makeFillBlankCandidate(fact, registry) {
    const blanked = fillBlankForFact(fact);
    if (!blanked) return null;
    const distractors = buildDistractorCandidates(fact, registry, 'fill_blank');
    if (distractors.length < 3) return null;
    const expected = fact.object;
    const stem = `Complete the statement according to the passage: “${blanked}”`;
    const explanation = factExplanation(fact, 'fill_blank', expected, expected);
    return buildSingleChoiceCandidate(fact, 'fill_blank', stem, expected, distractors, explanation);
  }

  function makeDateCandidate(fact, registry) {
    const distractors = buildDistractorCandidates(fact, registry, 'date_recall');
    if (distractors.length < 3) return null;
    const expected = fact.object;
    const stem = dateStem(fact);
    if (!stem) return null;
    const explanation = factExplanation(fact, 'date_recall', expected, expected);
    return buildSingleChoiceCandidate(fact, 'date_recall', stem, expected, distractors, explanation);
  }

  function makeNumericCandidate(fact, registry) {
    const stem = numericStem(fact);
    if (!stem) return null;
    const distractors = buildDistractorCandidates(fact, registry, 'numeric_recall');
    if (distractors.length < 3) return null;
    const expected = fact.object;
    const explanation = factExplanation(fact, 'numeric_recall', expected, expected);
    return buildSingleChoiceCandidate(fact, 'numeric_recall', stem, expected, distractors, explanation);
  }

  function makeDefinitionCandidate(fact, registry) {
    if (!isUsableSubject(fact.subject)) return null;
    const distractors = buildDistractorCandidates(fact, registry, 'definition');
    if (distractors.length < 3) return null;
    const expected = fact.object;
    if (isFragmentPhrase(expected)) return null;
    const subject = inlineSubject(fact.subject);
    // Rotate stem phrasing deterministically based on fact ID hash.
    const stemVariants = [
      `what does ${subject} mean?`,
      `which of the following best describes ${subject}?`,
      `how is ${subject} defined or described?`
    ];
    const stem = stemVariants[stableHash(fact.fact_id) % stemVariants.length];
    const explanation = factExplanation(fact, 'definition', expected, expected);
    return buildSingleChoiceCandidate(fact, 'definition', stem, expected, distractors, explanation);
  }

  function makeEntityCandidate(fact, registry) {
    const distractors = buildDistractorCandidates(fact, registry, 'entity_attribute');
    if (distractors.length < 3) return null;
    const expected = fact.object;
    // Manual read: "Who launched Cities?" with the answer
    // "everybody" is an extraction artefact, not a question. A
    // bare quantifier or adverb is never a usable entity answer.
    if (/^(everybody|everyone|anybody|anyone|somebody|someone|generally|usually|people|any|some)$/i.test(cleanText(expected))) return null;
    if (isFragmentPhrase(expected)) return null;
    const stem = entityStem(fact);
    if (!stem) return null;
    const explanation = factExplanation(fact, 'entity_attribute', expected, expected);
    return buildSingleChoiceCandidate(fact, 'entity_attribute', stem, expected, distractors, explanation);
  }

  function makeMembershipCandidate(fact, registry) {
    if (!isUsableSubject(fact.subject)) return null;
    // Same generic-subject gate as entity stems: a membership subject
    // ending in an adverb or a discourse marker ("the complex also",
    // "rural areas, on the other hand") is not a identifiable category.
    const memSubject = inlineSubject(fact.subject);
    if (/\b(also|often|broadly)\s*[.!?]?$/i.test(memSubject)) return null;
    if (/on the other hand/i.test(memSubject)) return null;
    if (!fact.members || !fact.members.length) return null;
    const corrected = fact.members[stableHash(fact.fact_id) % fact.members.length];
    if (isFragmentPhrase(corrected) || /^\d/.test(corrected) || /^(about|around|approximately|over|under|nearly)\s+\d/i.test(corrected) || /\b(for|over|about|around|approximately|more than|less than)\s+\d+\s*$/.test(corrected)) return null;
    const distractors = buildDistractorCandidates(fact, registry, 'classification_membership');
    if (distractors.length < 3) return null;
    const subject = inlineSubject(fact.subject);
    // Rotate stem phrasing deterministically.
    const stemVariants = [
      `which of the following is included in ${subject}?`,
      `which of the following is listed as part of ${subject}?`,
      `which one is mentioned as belonging to ${subject}?`
    ];
    const stem = stemVariants[stableHash(fact.fact_id + 'stem') % stemVariants.length];
    const explanation = factExplanation(fact, 'classification_membership', corrected, corrected);
    const candidate = buildSingleChoiceCandidate(
      fact,
      'classification_membership',
      stem,
      corrected,
      distractors,
      explanation,
      { answer_relation_key: fact.fact_id + '|members', relation_keys: [fact.fact_id + '|members'] }
    );
    if (!candidate) return null;
    candidate.expected_member = corrected;
    return candidate;
  }

  // Mock-test form 1 (books: "Which of the following is NOT ...?").
  // A membership fact gives a true list; the correct answer is an
  // outsider from another list in the same source, and the three
  // distractors are all true members. A student who only knows one
  // member cannot answer it, and a student who knows the list can.
  // NOT is capitalised in the stem: in a real exam a missed "not"
  // flips the whole question, so it must be impossible to skim past.
  function makeExceptionCandidate(fact, registry) {
    if (!isUsableSubject(fact.subject)) return null;
    const memSubject = inlineSubject(fact.subject);
    if (/\b(also|often|broadly)\s*[.!?]?$/i.test(memSubject)) return null;
    if (/on the other hand/i.test(memSubject)) return null;
    if (!fact.members || fact.members.length < 3) return null;
    const members = fact.members.map((m) => cleanText(m)).filter((m) => m && !isFragmentPhrase(m) && !/^[^A-Za-z0-9]/.test(m) && !/\b(for|over|about|around|approximately|more than|less than)\s+\d+\s*$/.test(m));
    if (members.length < 3) return null;
    const ctx = normalizeRegistry(registry);
    const outsiders = membershipAlternatives(fact, ctx).filter((cand) => {
      const c = cleanText(cand);
      if (!c || c.length < 3 || c.length > 150) return false;
      if (isFragmentPhrase(c)) return false;
      if (/^(of|to|in|on|for|with|by|as)\b/i.test(c)) return false;
      if (members.some((m) => isEquivalentOption(m, c))) return false;
      // The outsider must not be a member of the same category under
      // any other fact in this source, or the "exception" is not one.
      for (const other of ctx.facts || []) {
        if (other.fact_id === fact.fact_id) continue;
        if (other.fact_type !== 'membership') continue;
        if (normalizeSubject(other.subject) !== normalizeSubject(fact.subject)) continue;
        if (Array.isArray(other.members) && other.members.some((m) => isEquivalentOption(m, c))) return false;
      }
      return true;
    });
    if (!outsiders.length) return null;
    const outsider = outsiders[0];
    const distractors = members.slice(0, 3).map((m) => ({
      text: m,
      origin: 'source_member_pool',
      confusion_type: 'partial_truth',
      distractor_purpose: 'confusable_fact'
    }));
    if (distractors.length < 3) return null;
    const subject = inlineSubject(fact.subject);
    const stemVariants = [
      `which of the following is NOT included in ${subject}?`,
      `which of the following is NOT listed as part of ${subject}?`,
      `which one of the following is NOT a member of ${subject}?`
    ];
    const stem = stemVariants[stableHash(fact.fact_id + 'exc') % stemVariants.length];
    const explanation = `The source states: “${fact.supporting_excerpt}” The members listed are ${members.join(', ')}. ${outsider} is not among them, so it is the exception.`;
    const candidate = buildSingleChoiceCandidate(
      fact,
      'exception_reasoning',
      stem,
      outsider,
      distractors,
      explanation,
      { answer_relation_key: fact.fact_id + '|members', relation_keys: [fact.fact_id + '|members'] }
    );
    return candidate;
  }

  // Mock-test form 2 (books: "Which of the following statements is
  // correct about X?"). The options are full sentences, not single
  // entities, so the student must evaluate a complete claim. The
  // correct option is the exact source sentence; each distractor is
  // that same sentence with its value replaced by a value the source
  // does not state for this subject — a near-miss claim, not a
  // random other fact. A distractor that is actually supported
  // elsewhere for this subject is rejected, or the question would
  // have two correct answers.
  function makeStatementOptionCandidate(fact, registry) {
    if (!isUsableSubject(fact.subject)) return null;
    const subject = inlineSubject(fact.subject);
    if (/\b(also|often|broadly)\s*[.!?]?$/i.test(subject)) return null;
    if (/on the other hand/i.test(subject)) return null;
    if (/^(the following|the air|one important factor|the first task|the second outcome)$/i.test(subject)) return null;
    if (/\?/.test(subject)) return null;
    const src = cleanText(fact.source_text || '');
    if (!src || /^[^A-Za-z0-9]/.test(src) || !/[.!?]$/.test(src) || src.split(/\s+/).length < 5) return null;
    if (/^[a-z]/.test(src)) return null;
    if (!hasMainVerb(src)) return null;
    if (!fact.object || src.indexOf(fact.object) === -1) return null;
    const ctx = normalizeRegistry(registry);
    let values = [];
    if (fact.fact_type === 'date') values = buildDateDistractors(fact, ctx, 'date_recall');
    else if (fact.fact_type === 'numeric') values = buildNumericDistractors(fact, ctx, 'numeric_recall');
    else if (fact.fact_type === 'definition') values = buildDefinitionDistractors(fact, ctx, 'definition');
    else if (fact.fact_type === 'entity_attribute') values = buildEntityDistractors(fact, ctx, 'entity_attribute');
    else return null;
    const distractors = [];
    for (const v of values) {
      if (distractors.length >= 3) break;
      if (!v || !v.text) continue;
      if (isEquivalentOption(v.text, fact.object)) continue;
      if (isValueSupported(ctx.facts, fact.subject, fact.relation, v.text, fact.temporal_scope)) continue;
      const sentence = replaceOnce(src, fact.object, v.text);
      if (!sentence || /^[^A-Za-z0-9]/.test(sentence) || !/[.!?]$/.test(sentence) || sentence.split(/\s+/).length < 5) continue;
      if (isFragmentPhrase(sentence)) continue;
      if (!isCleanMutatedSentence(sentence, v.text, fact.object)) continue;
      if (distractors.some((d) => isEquivalentOption(d.text, sentence))) continue;
      distractors.push({
        text: sentence,
        origin: v.origin || 'source_value_pool',
        confusion_type: 'partial_truth',
        distractor_purpose: 'confusable_fact'
      });
    }
    if (distractors.length < 3) return null;
    const stem = `which of the following statements is correct about ${subject}?`;
    const explanation = `The source states: “${fact.supporting_excerpt}” The correct statement preserves that value. The other options replace it with a value the source does not state for ${subject}.`;
    return buildSingleChoiceCandidate(fact, 'statement_option', stem, src, distractors, explanation);
  }

  function permutations(items) {
    if (items.length <= 1) return [items.slice()];
    const result = [];
    for (let i = 0; i < items.length; i++) {
      const rest = items.slice(0, i).concat(items.slice(i + 1));
      for (const tail of permutations(rest)) result.push([items[i]].concat(tail));
    }
    return result;
  }

  function makeSequenceCandidate(fact, registry) {
    const items = fact.sequence_items || [];
    if (items.length < 2 || items.length > 5) return null;
    const expected = items.join(' → ');
    const variants = permutations(items)
      .map((perm) => perm.join(' → '))
      .filter((text) => normalizeObject(text) !== normalizeObject(expected))
      .sort((a, b) => a.localeCompare(b));
    if (variants.length < 3) return null;
    const distractors = variants.slice(0, 3).map((text) => ({
      text,
      origin: 'deterministic_permutation',
      confusion_type: 'scope_error',
      distractor_purpose: 'scope_error'
    }));
    const stem = 'What is the correct order of the steps?';
    const explanation = factExplanation(fact, 'sequence_order', expected, expected);
    return buildSingleChoiceCandidate(
      fact,
      'sequence_order',
      stem,
      expected,
      distractors,
      explanation,
      { answer_relation_key: fact.fact_id + '|sequence', relation_keys: [fact.fact_id + '|sequence'] }
    );
  }

  function makeCauseCandidate(fact, registry) {
    if (fact.causal_direction === 'effect_because_cause') return null;
    const distractors = buildDistractorCandidates(fact, registry, 'cause_effect');
    if (distractors.length < 3) return null;
    const expected = fact.object;
    if (isFragmentPhrase(expected)) return null;
    const stem = causeStem(fact);
    if (!stem) return null;
    const explanation = factExplanation(fact, 'cause_effect', expected, expected);
    return buildSingleChoiceCandidate(fact, 'cause_effect', stem, expected, distractors, explanation);
  }

  function makeComparisonCandidate(fact, registry) {
    const distractors = buildDistractorCandidates(fact, registry, 'comparison');
    if (distractors.length < 3) return null;
    const expected = fact.object;
    const comp = fact.comparison || {};
    const subjectUsable = isUsableSubject(fact.subject);
    const subject = subjectUsable ? inlineSubject(fact.subject) : null;

    let stem;
    if (subject && comp.subject_b && comp.direction === 'contrast') {
      stem = `how does ${subject} compare to ${comp.subject_b}?`;
    } else if (subject && comp.subject_b && comp.direction === 'similar') {
      stem = `in what way is ${subject} similar to ${comp.subject_b}?`;
    } else {
      // A sentence that merely contains a contrast word is not a
      // comparison question. Without two named entities and a direction,
      // the only available stem ("what is stated about <whole clause>?")
      // is vague and unanswerable on its own, so reject the candidate.
      return null;
    }

    const explanation = factExplanation(fact, 'comparison', expected, expected);
    return buildSingleChoiceCandidate(fact, 'comparison', stem, expected, distractors, explanation);
  }

  function buildFalseValue(fact, registry) {
    const ctx = normalizeRegistry(registry);
    let distractors = [];
    if (fact.fact_type === 'date') distractors = buildDateDistractors(fact, ctx, 'date_recall');
    else if (fact.fact_type === 'numeric') distractors = buildNumericDistractors(fact, ctx, 'numeric_recall');
    else if (fact.fact_type === 'definition') distractors = buildDefinitionDistractors(fact, ctx, 'definition');
    else if (fact.fact_type === 'entity_attribute') distractors = buildEntityDistractors(fact, ctx, 'entity_attribute');
    for (const distractor of distractors) {
      if (!distractor || !distractor.text) continue;
      if (isEquivalentOption(distractor.text, fact.object)) continue;
      if (isValueSupported(ctx.facts, fact.subject, fact.relation, distractor.text, fact.temporal_scope)) continue;
      return distractor.text;
    }
    return null;
  }

  // A mutated sentence is only a fair false claim if it reads like a
  // sentence of the same kind. Manual read found three systematic
  // failures: a replacement that is a participle verb phrase
  // ("was an composed in local languages"), a pronoun inside the
  // replacement ("was a killed or tortured for his or her"), and
  // an article that no longer agrees with the replacement ("was
  // an path of Islam", "is a oblate spheroid"). Any of these makes
  // the item answerable by grammar, not knowledge, so the mutation
  // is rejected and the caller falls back to another variant.
  const PARTICIPLE_START = /^(killed|observed|taken|composed|called|considered|described|known|used|made|given|shown|found|built|written|created|established|located|situated|based|related|associated|connected|involved|engaged|employed|appointed|elected|selected|chosen|named|titled|termed|defined|referred|regarded|viewed|seen|heard|said|stated|mentioned|noted|reported|recorded|listed|included|excluded|divided|classified|grouped|organised|organized)\b/i;
  // A source sentence must contain a main verb, or it is a fragment
  // ("40°C during the day to 5°C at night"). "during" is a
  // preposition, not a verb, so it is excluded from the -ing test,
  // and irregular past forms ("took place", "was formed") are
  // covered by an explicit list, not only by -ed endings.
  const MAIN_VERBS = new Set(('is are was were has have had be been being took take takes began begin became become held hold formed form built build gave give made make led lead rose fell grew grow died die lived live worked work fought fight won win lost lose wrote write said say saw see came come went go found find left leave joined join started start ended end changed change moved move passed pass arrived arrive launched launch established establish created create developed develop introduced introduce opened open signed sign declared declare announced announce published publish recorded record followed follow continued continue remained remain increased increase decreased decrease caused cause resulted result allowed allow enabled enable helped help produced produce provided provide protected protect guaranteed guarantee ensured ensure stated state described describe defined define known know called call named name referred refer meant mean represents represent includes include contains contain consists consist covers cover stretches stretch extends extend lies lie located situated provides allows makes causes leads results shows indicates states').split(' '));
  function hasMainVerb(text) {
    const words = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (MAIN_VERBS.has(w)) return true;
      if (/^[a-z]{3,}s$/.test(w) && !/^(this|that|thus|also)$/.test(w)) return true;
      if (/^[a-z]{3,}ed$/.test(w)) return true;
      if (/^[a-z]{3,}ing$/.test(w) && w !== 'during') return true;
    }
    return false;
  }
  const PRONOUN_IN_VALUE = /\b(his|her|their|it|they|him|them|us|we|you|he|she)\b/i;
  function isCleanMutatedSentence(text, replacement, original) {
    if (!text || !replacement) return false;
    if (PARTICIPLE_START.test(replacement)) return false;
    if (PRONOUN_IN_VALUE.test(replacement)) return false;
    if (/(?:^|\s)[A-Za-z](?:\s|$)/.test(replacement) && !/^(a|I)$/.test(replacement.trim())) return false;
    if (isFragmentPhrase(replacement)) return false;
    if (String(replacement).split(/\s+/).filter(Boolean).length === 1 && String(original || '').split(/\s+/).filter(Boolean).length >= 4) return false;
    const stripped = cleanText(text).replace(/[.!?]+\s*$/, '');
    if (/\b(of|to|in|on|for|with|by|as|through|from|the|a|an|it|they|them)\s*$/i.test(stripped)) return false;
    // Article agreement, ignoring the silent-h and vowel-sound
    // exceptions ("an hour", "a university", "a one"): a mismatch
    // is a grammar giveaway, so the mutation is rejected outright
    // rather than repaired, because repairing the article does not
    // repair a replacement of the wrong kind.
    if (/\b(a|an)\s+the\b/i.test(text)) return false;
    const forCheck = text.replace(/\b(an)\s+(hour|honest)\b/gi, '$1 XX').replace(/\b(a)\s+(one|university|european|user|uniform)\b/gi, '$1 XX');
    if (/\ba\s+[aeiouAEIOU]/.test(forCheck)) return false;
    if (/\ban\s+[^aeiouAEIOU\s]/.test(forCheck)) return false;
    return true;
  }

  function falseStatementFor(fact, replacement) {
    if (!replacement || !fact.object) return null;
    // Mutated-statement readability gate (mock-test quality): the
    // Assertion-Reason builders already reject long, clausal
    // replacements, but multi-statement builders did not, and a
    // long clausal replacement spliced into another sentence
    // produced garbled items in the banks (a three-statement item
    // whose false statement read as two clauses joined with no
    // connector). Reject a replacement that is itself a clause, or
    // longer than eight words, and reject a mutated sentence with
    // a repeated four-word phrase or a dangling relative ending
    // ("that allows us"). Callers fall back to another variant
    // (all-true, or a different false position) rather than
    // shipping the garbled statement.
    if (isClausalValue(replacement)) return null;
    if (String(replacement).split(/\s+/).filter(Boolean).length > 8) return null;
    const text = replaceOnce(fact.source_text, fact.object, replacement);
    if (!text) return null;
    if (!isCleanMutatedSentence(text, replacement, fact.object)) return null;
    const words = cleanText(text).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const phrases = new Set();
    for (let i = 0; i + 4 <= words.length; i++) {
      const phrase = words.slice(i, i + 4).join(' ');
      if (phrases.has(phrase)) return null;
      phrases.add(phrase);
    }
    if (/\bthat (allows|lets|helps|enables) (us|them|it)\.?$/i.test(cleanText(text))) return null;
    return {
      text,
      alteration: {
        field: 'object',
        original: fact.object,
        replacement,
        method: 'deterministic_typed_alteration'
      }
    };
  }

  // Combo text for a set of true statement numbers. For two
  // statements this is the classic CTET form ("1 only", "2 only",
  // "Both 1 and 2", "Neither 1 nor 2"); for three it is the
  // corresponding subset ("1 and 3 only", "1, 2 and 3", ...).
  function comboTextForTrueNumbers(trueNumbers, count) {
    const set = new Set(trueNumbers);
    if (count === 2) {
      if (set.size === 2) return 'Both 1 and 2';
      if (set.size === 1) return set.has(1) ? '1 only' : '2 only';
      return 'Neither 1 nor 2';
    }
    if (set.size === 0) return 'None of the above';
    if (set.size === 3) return '1, 2 and 3';
    const parts = [1, 2, 3].filter((n) => set.has(n));
    if (parts.length === 1) return `${parts[0]} only`;
    return `${parts.join(' and ')} only`;
  }

  function comboSetForText(text) {
    const nums = [];
    for (const m of String(text || '').matchAll(/[123]/g)) nums.push(Number(m[0]));
    if (/neither|none/i.test(text)) return new Set();
    return new Set(nums);
  }

  // Ordered multi-statement builder. Statements stay in the order
  // their facts occur in the source, with a truth value each — this
  // is what makes "2 only" and "1 and 3 only" reachable. The old
  // builder grouped all true statements first, so the first statement
  // was always true and "2 only" could never be the answer, which
  // is why no selected bank ever contained it.
  function makeOrderedMultiCandidate(items, sourceTitle) {
    if (!Array.isArray(items) || items.length < 2 || items.length > 3) return null;
    const count = items.length;
    const statements = items.map((item, i) => {
      const number = i + 1;
      const s = {
        index: number,
        number: number,
        text: item.text,
        fact_id: item.fact.fact_id,
        source_excerpt: item.fact.supporting_excerpt,
        truth_value: item.truth_value
      };
      if (item.alteration) s.alteration = item.alteration;
      return s;
    });
    const trueNumbers = statements.filter((s) => s.truth_value).map((s) => s.number);
    const correctText = comboTextForTrueNumbers(trueNumbers, count);
    let optionTexts;
    if (count === 2) {
      optionTexts = ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2'];
    } else {
      const allCombos = ['1 only', '2 only', '3 only', '1 and 2 only', '1 and 3 only', '2 and 3 only', '1, 2 and 3'];
      const correctSet = comboSetForText(correctText);
      const byDistance = allCombos.filter((c) => c !== correctText).map((c) => {
        const s = comboSetForText(c);
        let dist = 0;
        for (const n of [1, 2, 3]) if (s.has(n) !== correctSet.has(n)) dist++;
        return { text: c, dist };
      }).sort((a, b) => a.dist - b.dist || allCombos.indexOf(a.text) - allCombos.indexOf(b.text));
      // Distractors are near-miss combinations: a student who gets
      // two of three statements right must still fail, and a student
      // who gets one wrong must not be able to guess from a far-off
      // combination.
      const chosen = [correctText].concat(byDistance.slice(0, 3).map((d) => d.text));
      optionTexts = allCombos.filter((c) => chosen.includes(c));
    }
    const options = optionTexts.map((text, optionIndex) => {
      const correct = text === correctText;
      const result = { key: KEYS[optionIndex], text, is_correct: correct };
      if (!correct) {
        result.distractor_origin = 'statement_combination_pool';
        result.confusion_type = 'partial_truth';
        result.distractor_purpose = 'partial_truth';
      }
      return result;
    });
    const answerKey = options.find((option) => option.is_correct).key;
    const allFacts = items.map((item) => item.fact);
    const excerptParts = allFacts.map((fact) => fact.supporting_excerpt);
    const explanationParts = statements.map((statement) => {
      if (statement.truth_value) {
        return `Statement ${statement.index} is correct. The source states: “${statement.source_excerpt}” This supports statement ${statement.index}.`;
      }
      const original = statement.alteration ? statement.alteration.original : '';
      const replacement = statement.alteration ? statement.alteration.replacement : '';
      return `Statement ${statement.index} is false. The source states: “${statement.source_excerpt}” The stated value is ${original}, not ${replacement}.`;
    });
    const subtype = count === 3 ? 'multi_statement_3' : 'multi_statement';
    return {
      id: '',
      type: 'multi_statement',
      question_subtype: subtype,
      // Phase 8 fix: do not put a section title in the stem. Section titles
      // are derived from textbook headings and numbered learning-objective
      // lists, and on real NCERT pages they arrive truncated or merged
      // ("based on What are the unique physical:"), which made the stem
      // unanswerable. The statements themselves are rendered by the app
      // and by the batch markdown report; the stem only needs to introduce
      // them. sourceTitle is kept for source_title metadata, not the stem.
      stem: 'Consider the following statements:',
      prompt_suffix: 'Which of the statements given above is/are correct?',
      options,
      answer_key: answerKey,
      expected_answer: correctText,
      statements,
      knowledge_units: allFacts.map((fact) => ({ ku_id: fact.ku_id, fact_id: fact.fact_id, role: 'evidence' })),
      source_title: allFacts[0].section_title,
      source_page: allFacts[0].source_page,
      supporting_excerpt: allFacts[0].supporting_excerpt,
      explanation: explanationParts.join(' '),
      difficulty: 'hard',
      cognitive_level: 'analysis',
      evidence: {
        fact_ids: allFacts.map((fact) => fact.fact_id),
        excerpts: excerptParts,
        source_offsets: allFacts.map((fact) => ({ fact_id: fact.fact_id, start: fact.source_start, end: fact.source_end })),
        stem_relation: 'multi_statement',
        temporal_scope: '',
        fact_type: 'multi_statement',
        source_title: allFacts[0].section_title,
        source_page: allFacts[0].source_page
      },
      verification: { status: 'candidate', rules: ['two_source_facts', 'explicit_alteration', 'truth_pattern_keyed'] },
      answer_relation_key: allFacts.map((fact) => fact.fact_id + '|' + normalizeObject(fact.object)).join('&'),
      relation_keys: allFacts.map((fact) => fact.fact_id + '|' + normalizeObject(fact.object)),
      candidate_sort: { source_start: allFacts[0].source_start, fact_id: allFacts[0].fact_id }
    };
  }

  function multiEligible(fact) {
    // A multi-statement item is only as good as its two statements.
    // Reject facts whose source sentence is a marker, a fragment, or
    // does not end as a complete sentence — those produced garbled
    // statement 2s such as "A person who is sub-magistrate in a
    // district of Bengal" and statements starting with the "Æ" marker.
    const src = cleanText(fact && fact.source_text ? fact.source_text : '');
    if (!src || /^[^A-Za-z0-9]/.test(src) || !/[.!?]$/.test(src) || src.split(/\s+/).length < 5) return false;
    if (/^(they|it|this|that|these|those|he|she|its|their|his|her|our|your|however|for example|for instance|moreover|besides|meanwhile|in fact|as you may notice)\b/i.test(src)) return false;
    if (/^[a-z]/.test(src)) return false;
    if (src.includes(';')) return false;
    if (/\b(of|to|in|on|for|with|by|as|through|from|the|a|an|it|they|them)[.!?]?\s*$/.test(src.replace(/[.!?]+\s*$/, ''))) return false;
    if (/\ba\s+[aeiouAEIOU]/.test(src) || /\ban\s+[^aeiouAEIOU\s]/.test(src)) return false;
    if (/\b(facing page|table on|figure\s+\d|we saw|as you may notice|grade\s+\d)\b/i.test(src)) return false;
    return fact &&
      !isFactUnsafe(fact) &&
      fact.object &&
      typeof fact.object === 'string' &&
      fact.fact_type !== 'fallback' &&
      fact.fact_type !== 'membership' &&
      fact.fact_type !== 'sequence' &&
      fact.fact_type !== 'causal' &&
      fact.fact_type !== 'comparison' &&
      SINGLE_VALUED_RELATIONS.has(fact.normalized_relation) &&
      fact.source_text.indexOf(fact.object) !== -1;
  }

  function buildMultiCandidates(ctx, seqStart) {
    // Expand fact pool and consider non-adjacent pairs within a sliding window.
    const facts = ctx.facts.filter(multiEligible).slice(0, 14);
    if (facts.length < 2) return [];
    const candidates = [];
    let seq = seqStart;
    const pairs = [];
    // Non-adjacent pairs within a window of 3 positions, up to 8 total pairs.
    for (let i = 0; i < facts.length - 1 && pairs.length < 8; i++) {
      for (let j = i + 1; j < Math.min(i + 4, facts.length) && pairs.length < 8; j++) {
        pairs.push([facts[i], facts[j]]);
      }
    }
    for (const pair of pairs) {
      const first = pair[0];
      const second = pair[1];
      const firstFalse = buildFalseValue(first, ctx);
      const secondFalse = buildFalseValue(second, ctx);
      const variants = [];
      if (secondFalse) {
        const falseStatement = falseStatementFor(second, secondFalse);
        if (falseStatement) variants.push({ trueItems: [{ fact: first }], falseItems: [{ fact: second, text: falseStatement.text, alteration: falseStatement.alteration }], trueFacts: [first], falseFacts: [second] });
      }
      if (firstFalse) {
        const falseStatement = falseStatementFor(first, firstFalse);
        if (falseStatement) variants.push({ trueItems: [{ fact: second }], falseItems: [{ fact: first, text: falseStatement.text, alteration: falseStatement.alteration }], trueFacts: [second], falseFacts: [first] });
      }
      variants.push({ trueItems: [{ fact: first }, { fact: second }], falseItems: [], trueFacts: [first, second], falseFacts: [] });
      if (firstFalse && secondFalse) {
        const firstStatement = falseStatementFor(first, firstFalse);
        const secondStatement = falseStatementFor(second, secondFalse);
        if (firstStatement && secondStatement) {
          variants.push({
            trueItems: [],
            falseItems: [
              { fact: first, text: firstStatement.text, alteration: firstStatement.alteration },
              { fact: second, text: secondStatement.text, alteration: secondStatement.alteration }
            ],
            trueFacts: [],
            falseFacts: [first, second]
          });
        }
      }
      // Variety fix: rotate the variant order by a hash of the pair, so
      // the selected pattern is not always the first variant ("1 only").
      // Variants are, in order: 1-only, 2-only, Both, Neither. Rotating
      // by content hash varies the pattern across chapters and pairs
      // without depending on the pair's position in the source. This
      // must happen after all variants (including Neither) are built,
      // because selection picks the earliest-id variant for a pair.
      {
        // Rotate by the statements' actual text, not by fact_id:
        // fact_ids are sequential (F-LITE-001, F-LITE-002…) and therefore
        // identical for the first pair in every chapter, which made the
        // "rotation" produce the same pattern everywhere. Content hash
        // varies genuinely across chapters and pairs.
        const rotateBy = variants.length ? stableHash((first.source_text || '') + '|' + (second.source_text || '')) % variants.length : 0;
        const rotated = variants.slice(rotateBy).concat(variants.slice(0, rotateBy));
        variants.length = 0;
        for (const v of rotated) variants.push(v);
      }
      for (const variant of variants) {
        const orderedItems = pair.map((fact) => {
          const trueItem = variant.trueItems.find((item) => item.fact.fact_id === fact.fact_id);
          if (trueItem) return { fact, truth_value: true, text: fact.source_text };
          const falseItem = variant.falseItems.find((item) => item.fact.fact_id === fact.fact_id);
          return { fact, truth_value: false, text: falseItem.text, alteration: falseItem.alteration };
        });
        const candidate = makeOrderedMultiCandidate(orderedItems, first.section_title);
        if (candidate) {
          candidate.id = 'C-LITE-' + padNumber(seq++, 4);
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  // Three-statement form (books: "Consider the following three
  // statements..."). A triple is taken in source order; each
  // statement is true or mutated false. Variants with all three
  // false are skipped: a question with no true statement is a
  // "none correct" trick, not a test of the source. The correct
  // combination is always a subset of {1,2,3}, and the distractors
  // are near-miss subsets, so partial knowledge does not guess it.
  function buildMulti3Candidates(ctx, seqStart) {
    const facts = ctx.facts.filter(multiEligible).slice(0, 12);
    if (facts.length < 3) return [];
    const candidates = [];
    let seq = seqStart;
    const triples = [];
    for (let i = 0; i < facts.length - 2 && triples.length < 6; i++) {
      triples.push([facts[i], facts[i + 1], facts[i + 2]]);
    }
    for (const triple of triples) {
      const falseValues = triple.map((fact) => buildFalseValue(fact, ctx));
      const variants = [];
      // All true.
      variants.push([true, true, true]);
      // Exactly one false, at each position.
      for (let k = 0; k < 3; k++) {
        if (falseValues[k]) {
          const v = [true, true, true];
          v[k] = false;
          variants.push(v);
        }
      }
      // Exactly one true, at each position.
      for (let k = 0; k < 3; k++) {
        const othersHaveFalse = triple.every((fact, idx) => idx === k || Boolean(falseValues[idx]));
        if (othersHaveFalse) {
          const v = [false, false, false];
          v[k] = true;
          variants.push(v);
        }
      }
      const rotateBy = variants.length ? stableHash(triple.map((f) => f.source_text || '').join('|')) % variants.length : 0;
      const rotated = variants.slice(rotateBy).concat(variants.slice(0, rotateBy));
      for (const variant of rotated) {
        const items = [];
        let ok = true;
        for (let idx = 0; idx < 3; idx++) {
          const fact = triple[idx];
          if (variant[idx]) {
            items.push({ fact, truth_value: true, text: fact.source_text });
          } else {
            const falseStatement = falseStatementFor(fact, falseValues[idx]);
            if (!falseStatement) { ok = false; break; }
            items.push({ fact, truth_value: false, text: falseStatement.text, alteration: falseStatement.alteration });
          }
        }
        if (!ok) continue;
        const candidate = makeOrderedMultiCandidate(items, triple[0].section_title);
        if (candidate) {
          candidate.id = 'C-LITE-' + padNumber(seq++, 4);
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  // Assertion-Reason standard options, in CTET order. These are
  // the fixed code set for the form, not source-derived distractors:
  // every A-R question in a real paper offers exactly these four
  // judgements, and the student must pick the one that matches the
  // truth of A, the truth of R, and whether R explains A.
  const AR_OPTION_TEXTS = [
    'Both A and R are true and R is the correct explanation of A',
    'Both A and R are true but R is NOT the correct explanation of A',
    'A is true but R is false',
    'A is false but R is true'
  ];

  // Render an effect claim from a causal fact, only when it is safe.
  // The effect phrase is often not a sentence ("the judicial system
  // more accessible and transparent"), so it must be turned into one
  // without inventing content: either it already contains a finite
  // verb, or it is a short noun phrase followed by a comparative
  // remainder, where inserting "is" is the only change. Anything
  // else (a bare noun phrase, a verb phrase, a clause) returns null
  // and the causal fact simply yields no type-(a) A-R item.
  function renderEffectClaim(fact) {
    const obj = cleanText(fact.object || '');
    if (!obj || obj.length < 5 || obj.length > 150) return null;
    if (/^(that|which|who|whom|whose|to|of|for|with|by|as|they|it|you|we|he|she)\b/i.test(obj)) return null;
    if (/[,;]/.test(obj)) return null;
    if (/\b(that|which|who|when|if|but)\b/i.test(obj)) return null;
    const m = obj.match(/^((?:the|a|an)\s+(?:[A-Za-z'’-]+\s+){0,3}[A-Za-z'’-]+)\s+(more|less|better|greater|higher|lower|increasing|decreasing)\b(.*)$/i);
    if (!m) return null;
    const noun = m[1].trim();
    const rest = (m[2] + (m[3] || '')).trim();
    if (/\b(is|are|was|were|that|which|who|when|if|but)\b/i.test(rest)) return null;
    let s = noun.charAt(0).toUpperCase() + noun.slice(1) + ' is ' + rest;
    if (!/[.!?]$/.test(s)) s += '.';
    if (s.split(/\s+/).length > 20) return null;
    if (isFragmentPhrase(s)) return null;
    return s;
  }

  function makeAROptionSet(pattern) {
    const correctText = AR_OPTION_TEXTS[pattern === 'a' ? 0 : pattern === 'b' ? 1 : pattern === 'c' ? 2 : 3];
    const options = AR_OPTION_TEXTS.map((text, idx) => {
      const result = { key: KEYS[idx], text, is_correct: text === correctText };
      if (!result.is_correct) {
        result.distractor_origin = 'assertion_reason_code_pool';
        result.confusion_type = 'partial_truth';
        result.distractor_purpose = 'partial_truth';
      }
      return result;
    });
    return { options, correctText, answerKey: options.find((o) => o.is_correct).key };
  }

  function makeARCandidate(assertion, reason, pattern, truth, facts, explanation, alteration) {
    if (!assertion || !reason || assertion === reason) return null;
    for (const s of [assertion, reason]) {
      if (/^[^A-Za-z0-9]/.test(s) || !/[.!?]$/.test(s) || s.split(/\s+/).length < 3) return null;
    }
    const { options, correctText, answerKey } = makeAROptionSet(pattern);
    const first = facts[0];
    const candidate = {
      id: '',
      type: 'single_choice',
      question_subtype: 'assertion_reason',
      stem: `Assertion (A): ${assertion} Reason (R): ${reason} Which of the following is correct?`,
      assertion,
      reason,
      ar_pattern: pattern,
      ar_truth: truth,
      options,
      answer_key: answerKey,
      expected_answer: correctText,
      knowledge_units: facts.map((fact) => ({ ku_id: fact.ku_id, fact_id: fact.fact_id, role: 'evidence' })),
      source_title: first.section_title,
      source_page: first.source_page,
      supporting_excerpt: first.supporting_excerpt,
      explanation,
      difficulty: 'hard',
      cognitive_level: 'analysis',
      evidence: {
        fact_ids: facts.map((fact) => fact.fact_id),
        excerpts: facts.map((fact) => fact.supporting_excerpt),
        source_offsets: facts.map((fact) => ({ fact_id: fact.fact_id, start: fact.source_start, end: fact.source_end })),
        stem_relation: first.normalized_relation,
        temporal_scope: first.temporal_scope || '',
        fact_type: first.fact_type,
        source_title: first.section_title,
        source_page: first.source_page
      },
      verification: { status: 'candidate', rules: ['assertion_reason_pattern', 'explicit_alteration_or_source'] },
      answer_relation_key: facts.map((fact) => fact.fact_id + '|' + normalizeObject(fact.object)).join('&'),
      relation_keys: facts.map((fact) => fact.fact_id + '|' + normalizeObject(fact.object)),
      candidate_sort: { source_start: first.source_start, fact_id: first.fact_id }
    };
    if (alteration) candidate.ar_alteration = alteration;
    return candidate;
  }

  // Assertion-Reason builder. Pattern (a) — both true, R explains A —
  // comes only from a causal fact whose effect can be rendered as a
  // standalone claim (see renderEffectClaim); the Reason is the
  // causal sentence itself, which states the mechanism. Patterns
  // (b), (c) and (d) come from pairs of multi-eligible statements:
  // (b) both true but unrelated, (c) A true / R mutated false,
  // (d) A mutated false / R true. For (b) the two facts must share
  // no content word and neither may be causal, so the claim "R does
  // not explain A" is not debatable. For (c) and (d) the explanation
  // link is moot (one statement is false), so the pair only needs
  // to be topically coherent — same section when possible.
  // Shared gates for the new forms, reusing the engine's existing
  // subject quality rules and adding the ones the old builders
  // already apply: a generic subject ("one important factor"), a
  // bare definite noun ("the temple", "the range", "the main
  // alignment"), an anaphoric subject ("a similar push") and a
  // dangling object ("... from", "... if they") are not identifiable
  // on their own, so a matching or Assertion-Reason item built from
  // them is not an exam question, however technically correct its
  // code is. These gates are why the first NCERT run's hees206
  // matching set (subjects "This could potentially", "One important
  // factor", objects ending in "from" and "if they") is rejected.
  function isCleanNewFormSubject(subject) {
    if (!isUsableSubject(subject)) return false;
    const s = cleanText(subject);
    if (/^(its|their|his|her|our|your)\b/i.test(s)) return false;
    if (/^(the following|the air|one important factor|the first task|the second outcome)$/i.test(s)) return false;
    if (/^(the|a)\s+(mosque|palace|temple|fort|building|structure|church|tomb|monument|range|alignment|region|area|place|site|period|phase|stage|level|type|kind|group|class|section|part|aspect|factor|move|event|development|change|process|situation|condition|trend|phenomenon|outcome|result|effect|impact|role|purpose|aim|objective|function|feature|side|form)$/i.test(s)) return false;
    if (/^(the)\s+(present|main|current)\s+[a-z][a-z'’-]+$/i.test(s)) return false;
    if (/\b(similar|such)\b/i.test(s)) return false;
    if (/\b(also|often|broadly|here)\s*[.!?]?$/i.test(s)) return false;
    if (/\?/.test(s) || /\bwhat\b/i.test(s)) return false;
    return true;
  }

  function isCleanNewFormObject(obj) {
    const o = cleanText(obj);
    if (!o) return false;
    if (isFragmentPhrase(o)) return false;
    if (/^(of|to|in|on|for|with|by|as)\b/i.test(o)) return false;
    if (/\s+(?:and|or|in|of|to|for|with|on|at|by|from|into|onto|under|over|about|if|that|when|they|them|it|these|those|this)\s*$/i.test(o)) return false;
    if (/^like\b/i.test(o)) return false;
    return true;
  }

  // A mutation value that is itself a clause or verb phrase ("better
  // understand the people living") creates a double-predicate
  // sentence when substituted into another sentence ("... manage
  // better understand ..."). Only non-clausal values may be mutated
  // into an Assertion-Reason statement.
  function isClausalValue(value) {
    return /\b(is|are|was|were|has|have|understand|understands|manage|manages|allocate|allocates|determine|determines|improve|improves|become|becomes|lead|leads|make|makes|made|help|helps|provide|provides|follow|follows|give|gives|take|takes)\b/i.test(String(value || ''));
  }

  function buildARCandidates(ctx, seqStart) {
    const candidates = [];
    let seq = seqStart;
    const push = (cand) => {
      if (!cand) return;
      cand.id = 'C-LITE-' + padNumber(seq++, 4);
      candidates.push(cand);
    };
    // Pattern (a): causal facts.
    const causalFacts = ctx.facts.filter((f) => f && f.fact_type === 'causal' && !isFactUnsafe(f) && f.causal_direction !== 'effect_because_cause');
    for (const fact of causalFacts.slice(0, 4)) {
      const claim = renderEffectClaim(fact);
      if (!claim) continue;
      const reason = cleanText(fact.source_text);
      if (!reason || reason === claim) continue;
      const explanation = `Assertion is correct: ${claim} Reason is correct and states the mechanism: “${fact.supporting_excerpt}” Therefore R is the correct explanation of A.`;
      push(makeARCandidate(claim, reason, 'a', { assertion: true, reason: true, explains: true }, [fact], explanation));
    }
    // Patterns (b), (c), (d): pairs of multi-eligible facts, further
    // filtered to statements that are testable claims on their own:
    // a clean subject, a statement that does not start with a
    // pronoun, modal or discourse marker ("Let us", "Hence",
    // "It clear"), and at most 25 words, so introductory meta-prose
    // ("In a vast and diverse country ... we offer a few vignettes")
    // never becomes an Assertion or a Reason.
    const statementUsable = (fact) => {
      if (!isCleanNewFormSubject(fact.subject)) return false;
      const s = cleanText(fact.source_text || '');
      if (!s || s.split(/\s+/).length > 25) return false;
      if (!/^[A-Z]/.test(s)) return false;
      if (/^(we|you|they|it|its|this|that|there|these|those|he|she|i|us|them|their|his|her|our|your|let|hence|therefore|thus|often|besides|while|although|however|in|on|at|by|for|with|from|to|of|in a vast|in this|as we|we will|for example)\b/i.test(s)) return false;
      if (/\s+(?:and|or|in|of|to|for|with|on|at|by|from|if|that|when|they|them|it|these|those|this)\s*[.!?]?$/i.test(s)) return false;
      return true;
    };
    const facts = ctx.facts.filter((f) => multiEligible(f) && statementUsable(f)).slice(0, 14);
    const pairs = [];
    for (let i = 0; i < facts.length - 1 && pairs.length < 8; i++) {
      for (let j = i + 1; j < Math.min(i + 4, facts.length) && pairs.length < 8; j++) {
        pairs.push([facts[i], facts[j]]);
      }
    }
    const contentWords = (text) => new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
    // Near-duplicate means one statement contains the other as a
    // contiguous substring (a restatement with a discourse prefix),
    // not merely that two parallel sentences share template words
    // ("The Alpha Commission was established in 1990" vs "The Beta
    // Commission was established in 1995" share most words, but are
    // different facts and a valid pair).
    const nearDuplicate = (a, b) => {
      const na = normalizeOption(a), nb = normalizeOption(b);
      if (!na || !nb) return true;
      return na.includes(nb) || nb.includes(na);
    };
    for (const pair of pairs) {
      const [first, second] = pair;
      // Two statements that are near-duplicates of each other (one
      // restating the other with a discourse prefix) are not an
      // Assertion-Reason pair; they are the same claim twice.
      if (nearDuplicate(first.source_text, second.source_text)) continue;
      const rotateBy = stableHash((first.source_text || '') + '|' + (second.source_text || '')) % 3;
      const patterns = ['b', 'c', 'd'].slice(rotateBy).concat(['b', 'c', 'd'].slice(0, rotateBy));
      for (const pattern of patterns) {
        if (pattern === 'b') {
          if (first.fact_type === 'causal' || second.fact_type === 'causal') continue;
          const w1 = contentWords(first.subject + ' ' + first.source_text);
          const w2 = contentWords(second.subject + ' ' + second.source_text);
          let shared = false;
          for (const w of w1) if (w2.has(w)) { shared = true; break; }
          if (shared) continue;
          const explanation = `Assertion is correct: “${first.supporting_excerpt}” Reason is correct: “${second.supporting_excerpt}” However, R does not state a cause or reason for A, so it is not the correct explanation of A.`;
          push(makeARCandidate(cleanText(first.source_text), cleanText(second.source_text), 'b', { assertion: true, reason: true, explains: false }, [first, second], explanation));
          break;
        }
        if (pattern === 'c') {
          const falseValue = buildFalseValue(second, ctx);
          if (!falseValue || isClausalValue(falseValue)) continue;
          if (String(second.object || '').split(/\s+/).length > 5 || String(falseValue).split(/\s+/).length > 5) continue;
          const falseStatement = falseStatementFor(second, falseValue);
          if (!falseStatement) continue;
          const explanation = `Assertion is correct: “${first.supporting_excerpt}” Reason is false: the source states “${second.supporting_excerpt}” The stated value is ${second.object}, not ${falseValue}.`;
          push(makeARCandidate(cleanText(first.source_text), cleanText(falseStatement.text), 'c', { assertion: true, reason: false, explains: false }, [first, second], explanation, falseStatement.alteration));
          break;
        }
        if (pattern === 'd') {
          const falseValue = buildFalseValue(first, ctx);
          if (!falseValue || isClausalValue(falseValue)) continue;
          if (String(first.object || '').split(/\s+/).length > 5 || String(falseValue).split(/\s+/).length > 5) continue;
          const falseStatement = falseStatementFor(first, falseValue);
          if (!falseStatement) continue;
          const explanation = `Assertion is false: the source states “${first.supporting_excerpt}” The stated value is ${first.object}, not ${falseValue}. Reason is correct: “${second.supporting_excerpt}”`;
          push(makeARCandidate(cleanText(falseStatement.text), cleanText(second.source_text), 'd', { assertion: false, reason: true, explains: false }, [first, second], explanation, falseStatement.alteration));
          break;
        }
      }
    }
    return candidates;
  }

  // Matching builder (books: "Match List I with List II").
  // Four facts from the same section, each with a short subject and
  // a distinct, short object, become List I (subjects, labelled A-D)
  // and List II (objects, numbered 1-4, shuffled so the correct code
  // is not the trivial A-1, B-2, C-3, D-4). The options are codes;
  // the distractors are near-miss codes obtained by swapping two
  // targets in the correct code, so a student who matches three of
  // four pairs correctly still fails. A pair is rejected if its
  // object is also supported for another subject in the set, or the
  // matching would be ambiguous and have two correct codes.
  function buildMatchingCandidates(ctx, seqStart) {
    const candidates = [];
    let seq = seqStart;
    const eligible = ctx.facts.filter((f) => {
      if (!f || isFactUnsafe(f)) return false;
      if (!['entity_attribute', 'definition', 'date', 'causal'].includes(f.fact_type)) return false;
      if (f.extraction_method === 'fallback' || f.fact_type === 'fallback') return false;
      const subj = cleanText(f.subject || '');
      const obj = cleanText(f.object || '');
      if (!subj || !obj) return false;
      if (!isCleanNewFormSubject(subj) || !isCleanNewFormObject(obj)) return false;
      // Matching-only gates: List I items must be entities or
      // concepts, not sentences or gerund phrases ("Children need
      // special protection", "Living in a place", "the Indian
      // Constitution came into effect in 1950"), and List II items
      // must not start with a pronoun ("you a resident ...", "they
      // depend ...", "it had no ..."), or the pair is a sentence
      // fragment, not a matchable value. A set that fails any of
      // these is rejected whole, not repaired by editing.
      if (/\b(need|needs|want|wants|came|went|became|becomes|is|are|was|were|has|have|had|can|could|will|would|should|must|may|might|does|did|do)\b/i.test(subj)) return false;
      const subjWords = subj.split(/\s+/);
      if (subjWords.length >= 2 && /ing$/i.test(subjWords[0]) && /^(in|on|at|by|for|with|from|to|of|a|the)$/i.test(subjWords[1])) return false;
      if (/^(you|they|it|we|he|she|this|that|these|those)\b/i.test(obj)) return false;
      if (subj.split(/\s+/).length > 8 || obj.split(/\s+/).length > 15) return false;
      if (obj.length > 100) return false;
      if (!f.source_text || f.source_text.indexOf(f.object) === -1) return false;
      return true;
    });
    // Two groupings, both tried, deduplicated by fact set. Grouping
    // by section alone gives the Articles set (four Articles with
    // different relations, one theme); grouping by section and
    // relation as well gives coherent sets from a long chapter
    // section where consecutive facts are unrelated (all "protects"
    // facts, all "located" facts). Either grouping alone loses a
    // real set, so both are tried and a fact set is used once.
    const groupings = [];
    const bySection = new Map();
    for (const f of eligible) {
      const key = f.section_title || 'Unknown';
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key).push(f);
    }
    groupings.push(bySection);
    const byRelation = new Map();
    for (const f of eligible) {
      const key = (f.section_title || 'Unknown') + '|' + f.fact_type + '|' + (f.normalized_relation || f.relation || '');
      if (!byRelation.has(key)) byRelation.set(key, []);
      byRelation.get(key).push(f);
    }
    groupings.push(byRelation);
    const seenSets = new Set();
    for (const grouping of groupings) {
    for (const [section, group] of grouping) {
      // Take up to two matching sets per section, from consecutive
      // facts, so a long section can yield more than one set.
      for (let start = 0; start + 4 <= group.length && start < 8; start += 4) {
        const set = group.slice(start, start + 4);
        const setKey = set.map((f) => f.fact_id).sort().join('&');
        if (seenSets.has(setKey)) continue;
        seenSets.add(setKey);
        const subjects = set.map((f) => normalizeSubject(f.subject));
        const objects = set.map((f) => normalizeObject(f.object));
        if (new Set(subjects).size !== 4 || new Set(objects).size !== 4) continue;
        // Ambiguity check: no object may be supported for another
        // subject in the set under the same relation.
        let ambiguous = false;
        for (let i = 0; i < 4 && !ambiguous; i++) {
          for (let j = 0; j < 4; j++) {
            if (i === j) continue;
            if (isValueSupported(ctx.facts, set[i].subject, set[i].relation, set[j].object, set[i].temporal_scope)) { ambiguous = true; break; }
          }
        }
        if (ambiguous) continue;
        // List II order: sort by hash, then rotate if it happens to
        // be the identity order (which would make the code trivial).
        let list2Order = [0, 1, 2, 3].sort((a, b) => stableHash(set[a].subject + '|' + set[a].object) - stableHash(set[b].subject + '|' + set[b].object));
        if (list2Order.every((v, idx) => v === idx)) list2Order = [1, 2, 3, 0];
        // Correct code: for List I item i (A-D), the number of its
        // object in List II (1-based).
        const correctTargets = set.map((_, i) => list2Order.indexOf(i) + 1);
        const formatCode = (targets) => targets.map((n, i) => `${String.fromCharCode(65 + i)}-${n}`).join(', ');
        const correctCode = formatCode(correctTargets);
        // Distractor codes: swap two targets at a time.
        const distractorCodes = [];
        const swaps = [[0, 1], [0, 2], [1, 3]];
        for (const [a, b] of swaps) {
          const targets = correctTargets.slice();
          const tmp = targets[a]; targets[a] = targets[b]; targets[b] = tmp;
          const code = formatCode(targets);
          if (code !== correctCode && !distractorCodes.includes(code)) distractorCodes.push(code);
        }
        if (distractorCodes.length < 3) continue;
        const list1 = set.map((f, i) => ({ label: String.fromCharCode(65 + i), text: cleanText(f.subject) }));
        const list2 = list2Order.map((origIdx, pos) => ({ label: String(pos + 1), text: cleanText(set[origIdx].object) }));
        const list1Text = list1.map((item) => `${item.label}. ${item.text}`).join('; ');
        const list2Text = list2.map((item) => `${item.label}. ${item.text}`).join('; ');
        const stem = `Match List I with List II and select the correct answer using the codes given below. List I: ${list1Text}. List II: ${list2Text}.`;
        const optionTexts = [correctCode].concat(distractorCodes.slice(0, 3));
        // Order options by hash so the correct code is not always first.
        const ordered = optionTexts.map((text) => ({ text, h: stableHash(text) })).sort((a, b) => a.h - b.h).map((o) => o.text);
        const options = ordered.map((text, idx) => {
          const result = { key: KEYS[idx], text, is_correct: text === correctCode };
          if (!result.is_correct) {
            result.distractor_origin = 'matching_permutation_pool';
            result.confusion_type = 'partial_truth';
            result.distractor_purpose = 'partial_truth';
          }
          return result;
        });
        const answerKey = options.find((o) => o.is_correct).key;
        const explanationParts = set.map((f, i) => `${list1[i].label} matches ${list2[correctTargets[i] - 1].label}: the source states “${f.supporting_excerpt}”`);
        const first = set[0];
        const candidate = {
          id: 'C-LITE-' + padNumber(seq++, 4),
          type: 'single_choice',
          question_subtype: 'matching',
          stem,
          lists: { list1, list2 },
          matching_pairs: set.map((f, i) => ({ subject: cleanText(f.subject), object: cleanText(f.object), list2_index: correctTargets[i] })),
          options,
          answer_key: answerKey,
          expected_answer: correctCode,
          knowledge_units: set.map((f) => ({ ku_id: f.ku_id, fact_id: f.fact_id, role: 'evidence' })),
          source_title: first.section_title,
          source_page: first.source_page,
          supporting_excerpt: first.supporting_excerpt,
          explanation: explanationParts.join(' '),
          difficulty: 'hard',
          cognitive_level: 'analysis',
          evidence: {
            fact_ids: set.map((f) => f.fact_id),
            excerpts: set.map((f) => f.supporting_excerpt),
            source_offsets: set.map((f) => ({ fact_id: f.fact_id, start: f.source_start, end: f.source_end })),
            stem_relation: first.normalized_relation,
            temporal_scope: first.temporal_scope || '',
            fact_type: first.fact_type,
            source_title: first.section_title,
            source_page: first.source_page
          },
          verification: { status: 'candidate', rules: ['matching_pairs_verified', 'permutation_codes'] },
          answer_relation_key: set.map((f) => f.fact_id + '|' + normalizeObject(f.object)).join('&'),
          relation_keys: set.map((f) => f.fact_id + '|' + normalizeObject(f.object)),
          candidate_sort: { source_start: first.source_start, fact_id: first.fact_id }
        };
        candidates.push(candidate);
      }
    }
    }
    return candidates;
  }

  // Chronology ordering (mock-test quality, sequence from dates):
  // the existing sequence_order form needs an explicit "first...
  // then... finally..." sentence, which NCERT prose almost never
  // contains, so it yielded zero items. History chapters do
  // contain dated events, and ordering them is a standard CTET
  // form. Four date facts from one section become one question:
  // the events are listed with letters (in a hash-shuffled order
  // that is never the chronological order, or the answer would be
  // A, B, C, D), and the options are the chronological letter
  // sequence plus three near-miss sequences that swap two
  // adjacent events. Years are never printed in the list, or
  // ordering would be mechanical sorting, not knowledge, and an
  // event whose subject itself contains a year is rejected for
  // the same reason.
  function extractYear(text) {
    const match = String(text || '').match(/\b(1|2)\d{3}\b/);
    if (!match) return null;
    const year = parseInt(match[0], 10);
    return year >= 1000 && year <= 2100 ? year : null;
  }

  function buildChronologyCandidates(ctx, seqStart) {
    const candidates = [];
    let seq = seqStart;
    const bySection = new Map();
    for (const fact of ctx.facts || []) {
      if (!fact || fact.fact_type !== 'date' || isFactUnsafe(fact)) continue;
      if (!isUsableSubject(fact.subject)) continue;
      if (/\d{4}/.test(String(fact.subject || ''))) continue;
      const year = extractYear(fact.object);
      if (!year) continue;
      const key = fact.section_title || 'Unknown';
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key).push({ fact, year });
    }
    for (const group of bySection.values()) {
      const seenSubjects = new Set();
      const seenYears = new Set();
      const events = [];
      for (const entry of group) {
        const subjectKey = normalizeSubject(entry.fact.subject);
        if (seenSubjects.has(subjectKey) || seenYears.has(entry.year)) continue;
        seenSubjects.add(subjectKey);
        seenYears.add(entry.year);
        events.push(entry);
        if (events.length >= 4) break;
      }
      if (events.length < 4) continue;
      let order = [0, 1, 2, 3].sort((a, b) => stableHash(events[a].fact.subject + '|' + events[a].year) - stableHash(events[b].fact.subject + '|' + events[b].year));
      const chronological = events.map((_, i) => i).sort((a, b) => events[a].year - events[b].year);
      // Presentation order must not be the chronological order.
      if (order.every((v, idx) => v === chronological[idx])) order = [1, 2, 3, 0].map((i) => order[i]);
      const presented = order.map((i) => events[i]);
      const letters = presented.map((_, i) => String.fromCharCode(65 + i));
      const correctTargets = chronological.map((origIdx) => letters[order.indexOf(origIdx)]);
      const correctCode = correctTargets.join(', ');
      const distractorCodes = [];
      for (const swap of [[0, 1], [1, 2], [2, 3]]) {
        const targets = correctTargets.slice();
        const tmp = targets[swap[0]]; targets[swap[0]] = targets[swap[1]]; targets[swap[1]] = tmp;
        const code = targets.join(', ');
        if (code !== correctCode && !distractorCodes.includes(code)) distractorCodes.push(code);
      }
      if (distractorCodes.length < 3) continue;
      const eventList = presented.map((entry, i) => `${letters[i]}) ${cleanText(entry.fact.subject)}`).join('; ');
      const stem = `Arrange the following events in chronological order (earliest first): ${eventList}.`;
      const optionTexts = [correctCode].concat(distractorCodes.slice(0, 3));
      const ordered = optionTexts.map((text) => ({ text, h: stableHash(text) })).sort((a, b) => a.h - b.h).map((o) => o.text);
      const options = ordered.map((text, idx) => {
        const result = { key: KEYS[idx], text, is_correct: text === correctCode };
        if (!result.is_correct) {
          result.distractor_origin = 'chronology_permutation_pool';
          result.confusion_type = 'scope_error';
          result.distractor_purpose = 'scope_error';
        }
        return result;
      });
      const answerKey = options.find((o) => o.is_correct).key;
      const chronologicalItems = chronological.map((origIdx) => events[origIdx]);
      const explanationParts = chronologicalItems.map((entry) => {
        const letter = letters[order.indexOf(events.indexOf(entry))];
        return `${letter} (${cleanText(entry.fact.subject)}) occurred in ${entry.year}. The source states: “${entry.fact.supporting_excerpt}”`;
      });
      explanationParts.push('The other options swap the order of two events, so they are not chronological.');
      // The question's supporting excerpt must be the first
      // referenced fact's excerpt (validation requires an exact
      // match for date facts), not the shuffled first presented
      // event, even though the presented list is shuffled.
      const first = events[0];
      candidates.push({
        id: 'C-LITE-' + padNumber(seq++, 4),
        type: 'single_choice',
        question_subtype: 'chronology',
        stem,
        chronology_items: presented.map((entry, i) => ({ letter: letters[i], subject: cleanText(entry.fact.subject), year: entry.year })),
        options,
        answer_key: answerKey,
        expected_answer: correctCode,
        knowledge_units: events.map((entry) => ({ ku_id: entry.fact.ku_id, fact_id: entry.fact.fact_id, role: 'evidence' })),
        source_title: first.fact.section_title,
        source_page: first.fact.source_page,
        supporting_excerpt: first.fact.supporting_excerpt,
        explanation: explanationParts.join(' '),
        difficulty: 'hard',
        cognitive_level: 'analysis',
        evidence: {
          fact_ids: events.map((entry) => entry.fact.fact_id),
          excerpts: events.map((entry) => entry.fact.supporting_excerpt),
          source_offsets: events.map((entry) => ({ fact_id: entry.fact.fact_id, start: entry.fact.source_start, end: entry.fact.source_end })),
          stem_relation: events[0].fact.normalized_relation,
          temporal_scope: events[0].fact.temporal_scope || '',
          fact_type: 'date',
          source_title: first.fact.section_title,
          source_page: first.fact.source_page
        },
        verification: { status: 'candidate', rules: ['chronology_years_verified', 'permutation_codes'] },
        answer_relation_key: events.map((entry) => entry.fact.fact_id + '|' + normalizeObject(entry.fact.object)).join('&'),
        relation_keys: events.map((entry) => entry.fact.fact_id + '|' + normalizeObject(entry.fact.object)),
        candidate_sort: { source_start: first.fact.source_start, fact_id: first.fact.fact_id }
      });
      break;
    }
    return candidates;
  }

  // Table questions from table facts: the stem shows the table
  // (a table question is unanswerable without it, unlike the
  // self-contained direct forms), and asks for one cell. The
  // distractors are the other cells in the same column, so they
  // are the same kind of value and cannot be eliminated by type
  // alone. At most four questions per table, so a large table
  // does not crowd a bank.
  function buildTableCandidates(ctx, seqStart) {
    const candidates = [];
    let seq = seqStart;
    const byTable = new Map();
    for (const fact of ctx.facts || []) {
      if (!fact || fact.fact_type !== 'table' || isFactUnsafe(fact)) continue;
      if (!byTable.has(fact.table_id)) byTable.set(fact.table_id, []);
      byTable.get(fact.table_id).push(fact);
    }
    for (const tableFacts of byTable.values()) {
      const ordered = tableFacts.map((f) => ({ f, h: stableHash(f.fact_id) })).sort((a, b) => a.h - b.h).map((o) => o.f);
      let made = 0;
      for (const fact of ordered) {
        if (made >= 4) break;
        const sameColumn = tableFacts.filter((other) => other.relation === fact.relation && other.fact_id !== fact.fact_id && normalizeObject(other.object) !== normalizeObject(fact.object));
        const distractors = [];
        for (const other of sameColumn) {
          if (distractors.length >= 3) break;
          if (distractors.some((d) => isEquivalentOption(d.text, other.object))) continue;
          if (isFragmentPhrase(cleanText(other.object))) continue;
          distractors.push({ text: cleanText(other.object), origin: 'table_column_pool', confusion_type: 'partial_truth', distractor_purpose: 'confusable_fact' });
        }
        if (distractors.length < 3) continue;
        const stem = `In the table below, what is the ${fact.table_header} for ${fact.table_row}? Table: ${fact.table_text}`;
        const explanation = `The table states: “${fact.supporting_excerpt}” The value in the ${fact.table_header} column for ${fact.table_row} is ${fact.object}. The other options are values for different rows in the same column, not for ${fact.table_row}.`;
        const candidate = buildSingleChoiceCandidate(fact, 'table_question', stem, cleanText(fact.object), distractors, explanation, {
          table: { headers: null, text: fact.table_text, row: fact.table_row, column: fact.table_header },
          answer_relation_key: fact.fact_id + '|' + normalizeObject(fact.object),
          relation_keys: [fact.fact_id + '|' + normalizeObject(fact.object)]
        });
        if (candidate) {
          candidate.id = 'C-LITE-' + padNumber(seq++, 4);
          candidates.push(candidate);
          made++;
        }
      }
    }
    return candidates;
  }

  // Case-based sets (mock-test quality): a case set is not a new
  // question form, it is a presentation grouping. Questions in
  // one bank that share a section are about the same topic, so
  // they can be presented together with that section's own
  // excerpts as the case, instead of as isolated items. The
  // questions themselves stay self-contained (their stems
  // already are), so the case adds context, it does not supply
  // missing information, and no scenario is invented. Grouping
  // by page as well was tried first and formed almost no sets,
  // because a diverse bank spreads its questions across pages;
  // section alone is the case unit that actually groups.
  // Groups need at least three questions of different subtypes
  // and different relation keys; a set carries up to four.
  function assembleCaseSets(questions, options) {
    const opts = options || {};
    const maxSets = Number.isFinite(opts.maxSets) && opts.maxSets > 0 ? Math.floor(opts.maxSets) : 3;
    const perSet = Number.isFinite(opts.questionsPerSet) && opts.questionsPerSet > 0 ? Math.floor(opts.questionsPerSet) : 4;
    const all = Array.isArray(questions) ? questions.filter((q) => q && Array.isArray(q.options) && q.options.length === 4) : [];
    const groups = new Map();
    for (const q of all) {
      const key = q.source_title || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(q);
    }
    const sets = [];
    for (const group of groups.values()) {
      if (sets.length >= maxSets) break;
      const seenKeys = new Set();
      const seenSubtypes = new Set();
      const picked = [];
      for (const q of group) {
        const keys = Array.isArray(q.relation_keys) ? q.relation_keys : [q.answer_relation_key];
        if (keys.some((k) => seenKeys.has(k))) continue;
        picked.push(q);
        for (const k of keys) seenKeys.add(k);
        seenSubtypes.add(q.question_subtype);
        if (picked.length >= perSet) break;
      }
      if (picked.length < 3 || seenSubtypes.size < 2) continue;
      const excerpts = [];
      for (const q of picked) {
        const candidates = (q.evidence && Array.isArray(q.evidence.excerpts) && q.evidence.excerpts.length)
          ? q.evidence.excerpts
          : (q.supporting_excerpt ? [q.supporting_excerpt] : []);
        for (const excerpt of candidates) {
          if (excerpt && !excerpts.includes(excerpt)) excerpts.push(excerpt);
        }
      }
      sets.push({
        case_id: 'CASE-' + padNumber(sets.length + 1, 2),
        case_title: picked[0].source_title || 'Unknown',
        case_page: picked[0].source_page,
        case_context: excerpts.join(' '),
        questions: picked,
        question_count: picked.length,
        subtypes: Array.from(seenSubtypes)
      });
    }
    return {
      sets,
      audit: {
        groupsFound: groups.size,
        setsCreated: sets.length,
        questionsUsed: sets.reduce((n, s) => n + s.question_count, 0),
        questionsTotal: all.length
      }
    };
  }

  function buildQuestionCandidates(factRegistry, options) {
    const opts = options || {};
    const base = normalizeRegistry(factRegistry);
    const ctx = {
      facts: base.facts,
      index: base.index,
      conflicts: base.conflicts,
      sections: base.sections
    };
    const candidates = [];
    const buildMetrics = {
      missingOptions: 0,
      unsafeFacts: 0,
      unsupportedFacts: 0,
      multiMissing: 0
    };
    let seq = 1;
    const push = (candidate) => {
      if (!candidate) return false;
      candidate.id = 'C-LITE-' + padNumber(seq++, 4);
      candidates.push(candidate);
      return true;
    };

    for (const fact of ctx.facts) {
      if (!fact || fact.fact_type === 'fallback' || fact.extraction_method === 'fallback') {
        buildMetrics.unsupportedFacts++;
        continue;
      }
      if (isFactUnsafe(fact)) {
        buildMetrics.unsafeFacts++;
        continue;
      }

      if (fact.fact_type === 'date') {
        if (!push(makeDateCandidate(fact, ctx))) buildMetrics.missingOptions++;
        if (push(makeFillBlankCandidate(fact, ctx))) {
          // Fill-in is retained as a lower-ranked alternative.
        }
      } else if (fact.fact_type === 'numeric') {
        const direct = makeNumericCandidate(fact, ctx);
        if (direct) push(direct);
        if (!push(direct ? null : makeFillBlankCandidate(fact, ctx))) {
          if (!direct) buildMetrics.missingOptions++;
        }
        if (direct && makeFillBlankCandidate(fact, ctx)) {
          // A duplicate fill-in is intentionally not added when the direct recall exists.
        }
      } else if (fact.fact_type === 'definition') {
        if (!push(makeDefinitionCandidate(fact, ctx))) buildMetrics.missingOptions++;
      } else if (fact.fact_type === 'entity_attribute') {
        if (!push(makeEntityCandidate(fact, ctx))) buildMetrics.missingOptions++;
      } else if (fact.fact_type === 'membership') {
        if (!push(makeMembershipCandidate(fact, ctx))) buildMetrics.missingOptions++;
        // Exception form for the same list: relation_keys collide with
        // the membership candidate, so a bank never tests the same
        // list twice, once as "included" and once as "NOT included".
        push(makeExceptionCandidate(fact, ctx));
      } else if (fact.fact_type === 'sequence') {
        if (!push(makeSequenceCandidate(fact, ctx))) buildMetrics.missingOptions++;
      } else if (fact.fact_type === 'causal') {
        if (!push(makeCauseCandidate(fact, ctx))) buildMetrics.missingOptions++;
      } else if (fact.fact_type === 'comparison') {
        if (!push(makeComparisonCandidate(fact, ctx))) buildMetrics.missingOptions++;
      }
    }

    for (const fact of ctx.facts) {
      if (!fact || fact.fact_type === 'fallback' || fact.extraction_method === 'fallback') continue;
      if (isFactUnsafe(fact)) continue;
      if (!['date', 'numeric', 'definition', 'entity_attribute'].includes(fact.fact_type)) continue;
      if (!multiEligible(fact)) continue;
      const candidate = makeStatementOptionCandidate(fact, ctx);
      if (candidate) {
        candidate.id = 'C-LITE-' + padNumber(seq++, 4);
        candidates.push(candidate);
      }
    }

    const multi = buildMultiCandidates(ctx, seq);
    if (!multi.length) buildMetrics.multiMissing++;
    for (const candidate of multi) candidates.push(candidate);
    const multi3 = buildMulti3Candidates(ctx, seq + multi.length);
    for (const candidate of multi3) candidates.push(candidate);
    const ar = buildARCandidates(ctx, seq + multi.length + multi3.length);
    for (const candidate of ar) candidates.push(candidate);
    const matching = buildMatchingCandidates(ctx, seq + multi.length + multi3.length + ar.length);
    for (const candidate of matching) candidates.push(candidate);
    const chronology = buildChronologyCandidates(ctx, seq + multi.length + multi3.length + ar.length + matching.length);
    for (const candidate of chronology) candidates.push(candidate);
    const table = buildTableCandidates(ctx, seq + multi.length + multi3.length + ar.length + matching.length + chronology.length);
    for (const candidate of table) candidates.push(candidate);

    Object.defineProperty(candidates, 'buildMetrics', { value: buildMetrics, enumerable: false });
    Object.defineProperty(candidates, 'facts', { value: ctx.facts, enumerable: false });
    Object.defineProperty(candidates, 'conflicts', { value: ctx.conflicts, enumerable: false });
    return candidates;
  }

  function validationIssue(question, rule, message, evidence) {
    return {
      qid: question && question.id ? question.id : '',
      rule,
      message,
      evidence: evidence || null
    };
  }

  function validateQuestion(question, factRegistry, sourceContext) {
    const issues = [];
    const context = sourceContext && !Array.isArray(sourceContext) ? sourceContext : {};
    const directFacts = Array.isArray(factRegistry)
      ? factRegistry
      : (factRegistry && Array.isArray(factRegistry.facts) ? factRegistry.facts : []);
    const contextFacts = Array.isArray(context.facts)
      ? context.facts
      : (context.factRegistry && Array.isArray(context.factRegistry.facts) ? context.factRegistry.facts : []);
    const facts = directFacts.length ? directFacts : contextFacts;
    const registrySections = factRegistry && !Array.isArray(factRegistry) && Array.isArray(factRegistry.sections)
      ? factRegistry.sections
      : [];
    const sections = Array.isArray(context.sections) ? context.sections : registrySections;
    const add = (rule, message, evidence) => issues.push(validationIssue(question, rule, message, evidence));
    if (!question || typeof question !== 'object') {
      add('question_contract', 'Question object is missing.');
      return { valid: false, issues, qid: '', expectedAnswer: null };
    }

    if (question.type !== 'single_choice' && question.type !== 'multi_statement') {
      add('renderer_contract', 'Question type must remain single_choice or multi_statement.', { type: question.type });
    }
    if (!SUBTYPE_FACT_TYPES[question.question_subtype]) {
      add('unsupported_subtype', 'Question subtype is not recognised.', { subtype: question.question_subtype });
    }

    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length !== 4) add('option_count', 'Exactly four options are required.', { count: options.length });
    const normalizedOptions = options.map((option) => normalizeOption(option.text));
    const signatures = options.map((option) => optionSignature(option.text));
    if (new Set(normalizedOptions).size !== options.length) {
      add('option_uniqueness', 'Options must be unique after normalization.', { options: options.map((option) => option.text) });
    } else if (new Set(signatures).size !== options.length) {
      add('option_uniqueness', 'Options must be semantically distinct.', { options: options.map((option) => option.text) });
    }
    if (new Set(options.map((option) => option.key)).size !== options.length) {
      add('option_keys', 'Option keys must be unique.');
    }
    const correctOptions = options.filter((option) => option.is_correct === true);
    if (correctOptions.length !== 1) {
      add('correct_option_count', 'Exactly one option must be marked correct.', { count: correctOptions.length });
    }
    const keyed = options.find((option) => option.key === question.answer_key);
    if (!keyed) add('answer_key', 'answer_key must reference an existing option.', { answer_key: question.answer_key });
    else if (!keyed.is_correct) add('answer_key', 'answer_key must reference the correct option.');

    for (const option of options) {
      if (!option || !option.text || !option.key) {
        add('option_contract', 'Every option needs a key and text.');
        continue;
      }
      const normalized = normalizeOption(option.text);
      for (const filler of FILLER_PATTERNS) {
        if (normalized.includes(normalizeOption(filler))) {
          add('generic_filler', 'Option contains forbidden generic filler.', { text: option.text });
        }
      }
      if (option.is_correct !== true) {
        if (!option.distractor_origin || option.distractor_origin === 'generic_filler') {
          add('distractor_provenance', 'Every distractor must identify a typed source or controlled origin.', { text: option.text });
        }
      }
    }

    // Phase 8 fix: evidence and answers must be standalone and complete.
    // A running book title, a figure reference, or a dangling fragment
    // cannot be evidence, and a numeric answer cannot be a merged
    // year + count phrase.
    const excerptText = cleanText(question.supporting_excerpt || '');
    if (excerptText && /\bexploring society\b/i.test(excerptText) && /\bgrade\b/i.test(excerptText)) {
      add('page_furniture', 'Supporting excerpt is a running book title, not body prose.');
    }
    if (excerptText && /\(Fig\.|Fig\.\s*\d|Figure\s+\d/i.test(excerptText)) {
      add('figure_reference', 'Supporting excerpt depends on a figure reference and is not standalone evidence.');
    }
    if (excerptText && /\b(which|that|who|whom|whose|and|or|but|of|to|in|on|for|with|by|as|the|a|an)\s*[.!?]?\s*$/.test(excerptText)) {
      add('fragment_excerpt', 'Supporting excerpt ends with a dangling word and is not a complete statement.');
    }
    if (question.question_subtype === 'numeric_recall' && correctOptions.length === 1 && !isCleanQuantity(correctOptions[0].text)) {
      add('numeric_answer', 'A numeric answer must be a clean quantity, not a merged phrase.', { text: correctOptions[0].text });
    }
    // Quality gates: stems must be self-contained and must never
    // reference a passage/source/text the student cannot see.
    const stemText = String(question.stem || '');
    if (/according to the (passage|source|text)\b|based on the (source|passage|text)\b|in the (passage|source|text)\b/i.test(stemText)) {
      add('stem_source_reference', 'Stem must not reference a passage, source or text the student cannot see.', { stem: stemText });
    }
    if (/^what (number|measurement|amount|percentage|value) is stated\?$/i.test(stemText.trim())
      || /^what is stated\?$/i.test(stemText.trim())
      || /^which comparison is explicitly stated\?$/i.test(stemText.trim())) {
      add('stem_context_free', 'Stem carries no subject or context and cannot be answered on its own.', { stem: stemText });
    }
    // V2 causal stem polish: "What causes X?" is only a question
    // when X is a noun phrase the student can identify. A pronoun
    // subject ("their urbanisation") has no antecedent in the stem
    // alone, and a clause subject ("the colonial government
    // finally decided to withdraw it in 1911") is not a thing that
    // can be caused — it needs "Why did...?", which this form
    // does not generate. Reject both, rather than shipping a
    // clause-like or antecedent-free stem.
    if (question.question_subtype === 'causal_reasoning' && /^what (causes|makes)\s+/i.test(stemText)) {
      const caused = stemText.replace(/^what (causes|makes)\s+/i, '').replace(/\?\s*$/, '');
      if (/^(their|his|her|its|our|your|they|he|she|it|them|this|that|these|those)\b/i.test(caused)) {
        add('stem_pronoun_subject', 'A causal stem must not start with a pronoun or possessive with no antecedent.', { stem: stemText });
      } else if (/\b(decided|withdrew|withdraw|became|become|was|were|is|are|had|has|did|does|will|would|could|should|may|might|must|lost|won|changed|moved|started|ended)\b/i.test(caused)) {
        add('stem_clause_subject', 'A causal stem subject must be a noun phrase, not a clause with a finite verb.', { stem: stemText });
      }
    }
    for (const option of options) {
      if (option && !option.is_correct && option.text) {
        const ot = cleanText(option.text);
        if (/^[^A-Za-z0-9]/.test(ot) || /^(of|to|in|on|for|with|by|as)\b/i.test(ot) || /^type of$/i.test(ot) || /^path of$/i.test(ot)) {
          add('fragment_distractor', 'Distractor must not be a fragment or preposition phrase.', { text: option.text });
        }
      }
    }
    // Length giveaway gate (quality): if the correct answer is more
    // than 2.5x the median distractor length, a student can guess it
    // by length alone. Multi-statement options are fixed patterns and
    // are exempt. This forces selection to pick a different fact
    // whose distractors are length-matched, rather than shipping a
    // giveaway.
    if (question.question_subtype !== 'multi_statement' && question.question_subtype !== 'multi_statement_3' && question.question_subtype !== 'assertion_reason' && question.question_subtype !== 'matching' && correctOptions.length === 1) {
      const distLens = options.filter((o) => !o.is_correct && o.text).map((o) => cleanText(o.text).length).sort((a, b) => a - b);
      if (distLens.length >= 3) {
        const median = distLens[Math.floor(distLens.length / 2)];
        const correctLen = cleanText(correctOptions[0].text).length;
        if (median > 0 && correctLen > 2.5 * median) {
          add('length_giveaway', 'Correct answer is far longer than the distractors and can be guessed by length.', { correct_length: correctLen, median_distractor_length: median });
        }
      }
    }
    if (question.question_subtype === 'multi_statement' || question.question_subtype === 'multi_statement_3') {
      const expectedStatements = question.question_subtype === 'multi_statement_3' ? 3 : 2;
      if (!Array.isArray(question.statements) || question.statements.length !== expectedStatements) {
        add('statement_count', 'Multi-statement questions must carry exactly two (or three, for multi_statement_3) statements for rendering.');
      }
      if (/based on\s+\S/.test(question.stem || '') && /:/.test(question.stem || '')) {
        // The fixed stem is exactly "Consider the following statements:";
        // any "based on <section title>" stem is the old truncated form.
        add('multi_stem', 'Multi-statement stem must not depend on a section title.', { stem: question.stem });
      }
    }

    const evidence = question.evidence || {};
    const evidenceIds = Array.isArray(evidence.fact_ids) ? evidence.fact_ids : [];
    if (!evidenceIds.length) add('fact_reference', 'Question must reference at least one extracted fact.');
    const referenced = evidenceIds.map((id) => facts.find((fact) => fact.fact_id === id)).filter(Boolean);
    if (referenced.length !== evidenceIds.length) {
      add('fact_reference', 'Every referenced fact must exist in the registry.', { fact_ids: evidenceIds });
    }
    for (const fact of referenced) {
      if (fact.conflict_status === 'conflicting') {
        add('conflict', 'Question uses a fact whose relation is conflicting.', { fact_id: fact.fact_id });
      }
      if (fact.confidence_class === 'ocr-unverified') {
        add('unverified_ocr', 'Low-confidence OCR facts must not be published as verified.', { fact_id: fact.fact_id });
      }
      if (!fact.source_text || !fact.supporting_excerpt || fact.source_text.indexOf(fact.supporting_excerpt) === -1) {
        add('source_evidence', 'Supporting excerpt must occur exactly in the extracted source sentence.', { fact_id: fact.fact_id });
      }
      if (sections.length) {
        const section = sections.find((item) => item.id === fact.section_id);
        if (section && typeof section.text === 'string') {
          const slice = section.text.slice(fact.source_start, fact.source_end);
          if (slice !== fact.source_text) {
            add('source_offsets', 'Source offsets must select the exact extracted source text.', { fact_id: fact.fact_id });
          }
        }
      }
    }

    const explanation = normalizeOption(question.explanation || '');
    for (const filler of FILLER_PATTERNS) {
      if (explanation.includes(normalizeOption(filler))) {
        add('generic_filler', 'Explanation contains forbidden generic filler.');
      }
    }
    if (!question.explanation || referenced.length === 0) {
      add('explanation_evidence', 'Explanation must quote the exact evidence for every referenced fact.');
    } else {
      for (const fact of referenced) {
        if (!explanation.includes(normalizeOption(fact.supporting_excerpt))) {
          add('explanation_evidence', 'Explanation must quote the exact evidence for every referenced fact.', { fact_id: fact.fact_id });
        }
      }
    }

    if (!correctOptions.length || !referenced.length) {
      return {
        valid: issues.length === 0,
        issues,
        qid: question.id || '',
        expectedAnswer: correctOptions.length ? correctOptions[0].text : null
      };
    }

    const correct = correctOptions[0];
    if (question.question_subtype === 'multi_statement' || question.question_subtype === 'multi_statement_3') {
      if (question.type !== 'multi_statement') add('renderer_contract', 'Multi-statement subtype must use the multi_statement renderer type.');
      const statements = Array.isArray(question.statements) ? question.statements : [];
      const expectedStatementCount = question.question_subtype === 'multi_statement_3' ? 3 : 2;
      if (statements.length !== expectedStatementCount) add('statement_count', 'Multi-statement questions require exactly two (or three, for multi_statement_3) verified statements.');
      const seenTrue = [];
      for (const statement of statements) {
        const fact = facts.find((item) => item.fact_id === statement.fact_id);
        if (!fact) {
          add('statement_fact', 'Every statement must reference a real extracted fact.', { fact_id: statement.fact_id });
          continue;
        }
        if (statement.truth_value === true) {
          if (normalizeOption(statement.text) !== normalizeOption(fact.source_text)) {
            add('statement_truth', 'A true statement must preserve the exact source statement.', { fact_id: fact.fact_id });
          }
          seenTrue.push(statement);
        } else if (statement.truth_value === false) {
          const alteration = statement.alteration || {};
          if (!alteration.original || !alteration.replacement) {
            add('statement_alteration', 'A false statement must record its exact alteration.', { fact_id: fact.fact_id });
            continue;
          }
          if (normalizeOption(alteration.original) !== normalizeOption(fact.object)) {
            add('statement_alteration', 'A false statement must alter the extracted value.', { fact_id: fact.fact_id });
          }
          if (normalizeOption(alteration.replacement) === normalizeOption(fact.object)) {
            add('statement_alteration', 'A false replacement must differ from the source value.', { fact_id: fact.fact_id });
          }
          const expectedFalseText = replaceOnce(fact.source_text, fact.object, alteration.replacement);
          if (!expectedFalseText || normalizeOption(statement.text) !== normalizeOption(expectedFalseText)) {
            add('statement_alteration', 'A false statement must preserve the source wording except for the altered value.', { fact_id: fact.fact_id });
          }
          if (isValueSupported(facts, fact.subject, fact.relation, alteration.replacement, fact.temporal_scope)) {
            add('statement_supported', 'A false replacement must not be supported elsewhere under the same scope.', { fact_id: fact.fact_id });
          }
        } else {
          add('statement_truth', 'Every statement needs a verified truth value.', { fact_id: statement.fact_id });
        }
      }
      const trueNumbers = statements.filter((statement) => statement.truth_value === true).map((statement) => statement.number);
      // Statements are in source order, so the correct combination is
      // the set of true numbers, not just how many are true.
      let expectedText = comboTextForTrueNumbers(trueNumbers, statements.length);
      if (normalizeOption(correct.text) !== normalizeOption(expectedText)) {
        add('truth_pattern', 'The keyed option must match the verified truth pattern.', { expected: expectedText, actual: correct.text });
      }
      if (normalizeOption(question.expected_answer) !== normalizeOption(expectedText)) {
        add('expected_answer', 'expected_answer must match the verified truth pattern.', { expected: expectedText, actual: question.expected_answer });
      }
      return { valid: issues.length === 0, issues, qid: question.id || '', expectedAnswer: expectedText };
    }

    const fact = referenced[0];
    const allowed = SUBTYPE_FACT_TYPES[question.question_subtype] || [];
    if (!allowed.includes(fact.fact_type)) {
      add('subtype_fact_mismatch', 'Question subtype is not supported by the primary fact type.', {
        subtype: question.question_subtype,
        fact_type: fact.fact_type
      });
    }
    if (evidence.stem_relation && evidence.stem_relation !== fact.normalized_relation) {
      add('stem_relation', 'Stem must target the same subject and relation as the answer fact.', {
        expected: fact.normalized_relation,
        actual: evidence.stem_relation
      });
    }
    if (normalizeObject(evidence.temporal_scope || '') !== normalizeObject(fact.temporal_scope || '')) {
      add('stem_relation', 'Stem must preserve the extracted temporal scope.', {
        expected: fact.temporal_scope || '',
        actual: evidence.temporal_scope || ''
      });
    }

    let expected = fact.object;
    if (question.question_subtype === 'matching') {
      // The correct option must be the code for the recorded pairs,
      // and every pair must be a verified fact: the List I subject
      // must have exactly that object in the source.
      if (!Array.isArray(question.matching_pairs) || question.matching_pairs.length !== 4) {
        add('source_answer', 'Matching questions must carry exactly four verified pairs.', {});
      } else {
        const pairs = question.matching_pairs;
        for (const pair of pairs) {
          const pf = facts.find((item) => normalizeSubject(item.subject) === normalizeSubject(pair.subject));
          if (!pf) {
            add('source_answer', 'Every matching pair must reference a real fact.', { subject: pair.subject });
          } else if (normalizeObject(pf.object) !== normalizeObject(pair.object)) {
            add('source_answer', 'Matching pair object must equal the extracted fact value.', { subject: pair.subject });
          }
        }
        // Parse the correct code and compare it with the pairs.
        const codeMap = {};
        for (const m of String(correct.text || '').matchAll(/([A-D])-(\d)/g)) codeMap[m[1]] = Number(m[2]);
        for (let i = 0; i < 4; i++) {
          const letter = String.fromCharCode(65 + i);
          if (codeMap[letter] !== pairs[i].list2_index) {
            add('source_answer', 'Matching code must map each List I item to its verified List II number.', { letter, expected: pairs[i].list2_index, actual: codeMap[letter] });
          }
        }
      }
      // Every code option must be a permutation of 1-4.
      for (const opt of options) {
        const nums = [...String(opt.text || '').matchAll(/-(\d)/g)].map((m) => Number(m[1])).sort().join(',');
        if (nums !== '1,2,3,4') {
          add('source_answer', 'Matching code options must be permutations of 1, 2, 3 and 4.', { text: opt.text });
        }
      }
      expected = correct.text;
    } else if (question.question_subtype === 'assertion_reason') {
      // A-R answers are codes, not fact values: the correct option
      // must be the standard text for the recorded pattern, and the
      // Assertion and Reason must be present, distinct, complete
      // sentences. Truth re-derivation for (a) is builder-side (the
      // effect claim is derived, not a source sentence); for other
      // patterns the recorded truth is checked by the regression
      // tests, not by re-running the builder here.
      if (!question.assertion || !question.reason || question.assertion === question.reason) {
        add('source_answer', 'Assertion-Reason questions must carry distinct Assertion and Reason statements.', {});
      }
      for (const s of [question.assertion, question.reason]) {
        if (s && (!/[.!?]$/.test(s) || s.split(/\s+/).length < 3)) {
          add('source_answer', 'Assertion and Reason must be complete sentences.', { text: s });
        }
      }
      const patternIndex = { a: 0, b: 1, c: 2, d: 3 }[question.ar_pattern];
      if (patternIndex == null) {
        add('source_answer', 'Assertion-Reason questions must record a pattern a/b/c/d.', { pattern: question.ar_pattern });
      } else {
        const expectedTexts = [
          'Both A and R are true and R is the correct explanation of A',
          'Both A and R are true but R is NOT the correct explanation of A',
          'A is true but R is false',
          'A is false but R is true'
        ];
        if (normalizeOption(correct.text) !== normalizeOption(expectedTexts[patternIndex])) {
          add('source_answer', 'Assertion-Reason key must match the recorded pattern.', { pattern: question.ar_pattern, actual: correct.text });
        }
        const optionTexts = options.map((o) => normalizeOption(o.text));
        for (const et of expectedTexts) {
          if (!optionTexts.includes(normalizeOption(et))) {
            add('source_answer', 'Assertion-Reason options must be the four standard judgements.', { missing: et });
          }
        }
      }
      expected = correct.text;
    } else if (question.question_subtype === 'exception_reasoning') {
      // The correct answer must NOT be a member; every distractor
      // must be a true member, or the "exception" is not one.
      if (!Array.isArray(fact.members) || fact.members.some((member) => normalizeObject(member) === normalizeOption(correct.text))) {
        add('source_answer', 'Exception answer must not be one of the stated members.', { answer: correct.text });
      }
      for (const opt of options) {
        if (!opt.is_correct && (!Array.isArray(fact.members) || !fact.members.some((member) => normalizeObject(member) === normalizeOption(opt.text)))) {
          add('source_answer', 'Exception distractors must all be true members.', { answer: opt.text });
        }
      }
      expected = correct.text;
    } else if (question.question_subtype === 'statement_option') {
      if (normalizeOption(correct.text) !== normalizeOption(fact.source_text)) {
        add('source_answer', 'Statement-option answer must be the exact source statement.', { answer: correct.text });
      }
      expected = correct.text;
    } else if (question.question_subtype === 'classification_membership') {
      if (!Array.isArray(fact.members) || !fact.members.some((member) => normalizeObject(member) === normalizeOption(correct.text))) {
        add('source_answer', 'Membership answer must be one of the stated members.', { answer: correct.text });
      }
      expected = correct.text;
    } else if (question.question_subtype === 'sequence_order') {
      expected = (fact.sequence_items || []).join(' → ');
      if (normalizeOption(correct.text) !== normalizeOption(expected)) {
        add('source_answer', 'Sequence answer must preserve the explicit source order.', { answer: correct.text });
      }
    } else if (question.question_subtype === 'chronology') {
      // The correct option must be a permutation of A-D whose
      // letters map to years in ascending order, and every
      // distractor must be a different permutation of A-D.
      const items = Array.isArray(question.chronology_items) ? question.chronology_items : [];
      if (items.length !== 4) {
        add('source_answer', 'Chronology questions must carry exactly four dated events.', {});
      } else {
        const yearByLetter = {};
        for (const item of items) yearByLetter[item.letter] = item.year;
        const parseSequence = (text) => String(text || '').split(',').map((s) => s.trim());
        const correctSeq = parseSequence(correct.text);
        if (correctSeq.slice().sort().join(',') !== 'A,B,C,D') {
          add('source_answer', 'Chronology options must be permutations of A, B, C and D.', { text: correct.text });
        } else {
          const years = correctSeq.map((letter) => yearByLetter[letter]);
          if (years.some((y) => y == null) || years.some((y, i) => i > 0 && years[i - 1] >= y)) {
            add('source_answer', 'The correct chronology sequence must list events in ascending year order.', { text: correct.text });
          }
        }
        for (const opt of options) {
          if (opt.is_correct) continue;
          if (parseSequence(opt.text).slice().sort().join(',') !== 'A,B,C,D') {
            add('source_answer', 'Chronology distractor options must be permutations of A, B, C and D.', { text: opt.text });
          }
        }
      }
      expected = correct.text;
    } else if (question.proof_trace && question.derived_proposition) {
      if (normalizeOption(correct.text) !== normalizeOption(question.expected_answer)) {
        add('source_answer', 'Keyed answer must equal the verified derived proposition.', {
          expected: question.expected_answer,
          actual: correct.text
        });
      }
      expected = correct.text;
    } else if (normalizeOption(correct.text) !== normalizeObject(fact.object)) {
      add('source_answer', 'Keyed answer must equal the extracted source fact.', {
        expected: fact.object,
        actual: correct.text
      });
    }

    if (question.question_subtype === 'fill_blank') {
      if (!String(question.stem || '').includes('______')) {
        add('fill_blank_contract', 'Fill-in stem must contain an explicit blank.');
      }
      if (!fact.source_text || fact.source_text.indexOf(fact.object) === -1) {
        add('fill_blank_contract', 'Fill-in blank must replace an exact source value.');
      }
    }

    if (normalizeOption(question.expected_answer) !== normalizeOption(correct.text)) {
      add('expected_answer', 'expected_answer must equal the keyed option.', {
        expected: correct.text,
        actual: question.expected_answer
      });
    }
    if (['date', 'numeric', 'entity_attribute'].includes(fact.fact_type)) {
      if (normalizeOption(question.supporting_excerpt) !== normalizeOption(fact.supporting_excerpt)) {
        add('source_evidence', 'supporting_excerpt must be the exact fact evidence.');
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      qid: question.id || '',
      expectedAnswer: expected
    };
  }

  function validateQuestionBank(questions, context) {
    const ctx = context || {};
    const list = Array.isArray(questions) ? questions : [];
    const facts = Array.isArray(ctx.facts)
      ? ctx.facts
      : (ctx.factRegistry ? normalizeRegistry(ctx.factRegistry).facts : []);
    const validationContext = Object.assign({}, ctx, { facts });
    const issues = [];
    const issueQids = new Set();
    const seenIds = new Set();
    const seenStems = new Map();
    const seenRelations = new Map();

    for (const question of list) {
      const result = validateQuestion(question, facts, validationContext);
      for (const issue of result.issues) {
        issues.push(issue);
        if (issue.qid) issueQids.add(issue.qid);
      }
      if (question && question.id) {
        if (seenIds.has(question.id)) {
          const issue = validationIssue(question, 'duplicate_id', 'Question ids must be unique.', { id: question.id });
          issues.push(issue);
          issueQids.add(question.id);
        }
        seenIds.add(question.id);
      }
      const stem = normalizeOption(question && question.stem);
      if (stem) {
        if (seenStems.has(stem)) {
          const issue = validationIssue(question, 'duplicate_stem', 'Question stems must be unique.', { stem: question.stem });
          issues.push(issue);
          if (question.id) issueQids.add(question.id);
        }
        seenStems.set(stem, question.id || '');
      }
      const relationKey = question && question.answer_relation_key;
      if (relationKey) {
        if (seenRelations.has(relationKey)) {
          const issue = validationIssue(question, 'duplicate_relation', 'A fact relation may not be tested twice without a new cognitive contract.', { relation_key: relationKey });
          issues.push(issue);
          if (question.id) issueQids.add(question.id);
        }
        seenRelations.set(relationKey, question.id || '');
      }
    }

    const acceptedQuestions = list.filter((question) => !issueQids.has(question && question.id));
    const accepted = acceptedQuestions.length;
    const totalCandidates = ctx.candidateCount != null ? ctx.candidateCount : list.length;
    const rejected = Math.max(0, totalCandidates - accepted);
    const byRule = {};
    for (const issue of issues) byRule[issue.rule] = (byRule[issue.rule] || 0) + 1;
    const subtypeDistribution = {};
    const keyDistribution = {};
    const usedFactIds = new Set();
    for (const question of acceptedQuestions) {
      const subtype = question.question_subtype || 'unknown';
      subtypeDistribution[subtype] = (subtypeDistribution[subtype] || 0) + 1;
      const key = question.answer_key || 'unknown';
      keyDistribution[key] = (keyDistribution[key] || 0) + 1;
      for (const id of (question.evidence && question.evidence.fact_ids) || []) usedFactIds.add(id);
    }
    const unusedFactIds = facts.filter((fact) => !usedFactIds.has(fact.fact_id)).map((fact) => fact.fact_id);
    const conflictedFacts = facts.filter((fact) => fact.conflict_status === 'conflicting').map((fact) => fact.fact_id);
    const rejectionCounts = ctx.rejectionCounts || (ctx.generation && ctx.generation.rejectionCounts) || {};

    return {
      valid: issues.length === 0,
      total: list.length,
      totalCandidates,
      accepted,
      rejected,
      issues,
      byRule,
      rejectionCounts,
      subtypeDistribution,
      keyDistribution,
      unusedFacts: unusedFactIds.length,
      unusedFactIds,
      conflictedFacts: conflictedFacts.length,
      conflictedFactIds: conflictedFacts
    };
  }

  function reorderOptions(options, correctIndex, targetIndex) {
    const correct = options[correctIndex];
    const others = options.filter((option, index) => index !== correctIndex);
    const ordered = [];
    let otherIndex = 0;
    for (let index = 0; index < 4; index++) {
      const source = index === targetIndex ? correct : others[otherIndex++];
      ordered.push(Object.assign({}, source, { key: KEYS[index] }));
    }
    return ordered;
  }

  function noVerifiedQuestionsError(message, metrics) {
    const error = new Error(message);
    error.code = 'NO_VERIFIED_QUESTIONS';
    error.metrics = metrics || null;
    return error;
  }

  function incrementCount(counts, key) {
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  }

  function generateQuestionBank(inventory, options) {
    const opts = options || {};
    const inventoryFacts = Array.isArray(inventory && inventory.facts) ? inventory.facts : [];
    let facts = Array.isArray(opts.facts) ? opts.facts : inventoryFacts;
    if (!facts.length && Array.isArray(opts.sections)) {
      facts = extractSourceFacts(opts.sections, opts);
    }
    const targetCount = Number.isFinite(opts.targetCount) && opts.targetCount > 0 ? Math.floor(opts.targetCount) : DEFAULT_TARGET;
    if (!facts.length || !Array.isArray(inventory) || inventory.length === 0) {
      throw noVerifiedQuestionsError(
        'No verified questions could be created because the source did not contain reliably interpretable facts.',
        { factCount: facts.length, totalCandidates: 0, accepted: 0 }
      );
    }

    // Always recompute conflict status before building candidates. Callers may
    // supply a precomputed conflict list, but the fact records must still carry
    // the matching conflict_status so unsafe relations cannot be published.
    const conflictResult = detectFactConflicts(facts);
    facts = conflictResult.facts;
    const conflicts = Array.isArray(opts.conflicts) ? opts.conflicts : conflictResult.conflicts;
    const ctx = {
      facts,
      conflicts,
      sections: Array.isArray(opts.sections) ? opts.sections : []
    };

    const candidates = buildQuestionCandidates(ctx, opts);

    // Repair 002, Phase 5: the production generator must NOT merge raw
    // V2 candidates. It now calls the validated V2 question-bank API,
    // which internally compiles propositions, builds the graph, runs
    // operators and enforces V2 proof validation (Validator.validateCandidate)
    // before returning. The candidates returned here are then also run
    // through existing production validation below, so only candidates
    // passing BOTH layers may be published. Evidence and source metadata
    // are preserved as returned by V2; nothing is manufactured to make a
    // candidate pass. A V2 exception is recorded in diagnostics
    // (v2Failed / v2Error) and is never silently presented as a fully
    // validated bank.
    let v2Candidates = [];
    let v2Generation = null;
    let v2Error = null;
    if (ReasoningV2 && typeof ReasoningV2.generateReasoningQuestionBank === 'function') {
      try {
        const sectionsForV2 = (ctx.sections && ctx.sections.length) ? ctx.sections : (opts.sections || []);
        if (sectionsForV2.length) {
          const v2Bank = ReasoningV2.generateReasoningQuestionBank(sectionsForV2, {
            facts: facts,
            targetCount: targetCount
          });
          v2Generation = v2Bank && v2Bank.generation ? v2Bank.generation : null;
          v2Candidates = Array.isArray(v2Bank) ? v2Bank.slice() : [];
          // Preserve original evidence references: drop only candidates
          // whose evidence does not reference any supplied fact at all.
          // V2-validated candidates normally carry production fact ids
          // (see constructors.js); this is a safety filter, not a
          // substitute for V2 or production validation.
          const initialFactIds = new Set(facts.map((f) => f.fact_id));
          v2Candidates = v2Candidates.filter((cand) => {
            if (!cand || !cand.evidence || !Array.isArray(cand.evidence.fact_ids)) return false;
            return cand.evidence.fact_ids.some((id) => initialFactIds.has(id));
          });
        }
      } catch (err) {
        v2Error = err;
        v2Candidates = [];
      }
    } else if (ReasoningV2) {
      v2Error = new Error('ReasoningV2.generateReasoningQuestionBank is not available');
    }

    const allCandidates = [...v2Candidates, ...candidates];
    const buildMetrics = candidates.buildMetrics || {};
    const rejectionCounts = {};
    if (buildMetrics.missingOptions) rejectionCounts.missing_options = buildMetrics.missingOptions;
    if (buildMetrics.unsafeFacts) rejectionCounts.unsafe_facts = buildMetrics.unsafeFacts;
    if (buildMetrics.unsupportedFacts) rejectionCounts.unsupported_facts = buildMetrics.unsupportedFacts;
    if (buildMetrics.multiMissing) rejectionCounts.multi_missing = buildMetrics.multiMissing;

    const validated = [];
    for (const candidate of allCandidates) {
      const result = validateQuestion(candidate, facts, ctx);
      if (result.valid) {
        validated.push(candidate);
      } else {
        const rule = result.issues[0] ? result.issues[0].rule : 'validation';
        incrementCount(rejectionCounts, rule, 1);
      }
    }

    const selected = [];
    const usedRelations = new Set();
    const usedStems = new Set();
    const subtypeUse = {};
    // Fact-expensive forms first: a three-statement question consumes
    // three facts for one question, so if direct questions claim
    // those facts first, it can never be selected at all — which is
    // why the first mock-test regeneration contained no multi_3
    // items despite them existing as candidates. Give multi_3 and
    // multi_statement first claim on their facts, one each, then
    // fill normally. This is allocation, not a quota: if no triple
    // survives, the bank simply has no multi_3 item.
    // Only when facts are abundant: in a small source, a multi
    // question that consumes three facts for one question starves
    // the bank (a science sample fell from 5 to 4 questions), so
    // the first pass is skipped there and the bank fills normally.
    const distinctFactCount = new Set(validated.flatMap((c) => (c.evidence && c.evidence.fact_ids) || [])).size;
    // Rare-subtype first claim (coverage, mock-test quality):
    // a chapter that yields one date, one comparison, one
    // sequence, one chronology or one table question should
    // actually include it, instead of losing it because a
    // fact-expensive multi-statement or Assertion-Reason item
    // claimed the same fact first, or because entity and
    // statement-option candidates crowd it out. One per rare
    // subtype, before the fact-expensive pass, so the bank
    // reads like a paper covering the chapter, not a pool of
    // the easiest forms to generate.
    for (const rareSubtype of ['chronology', 'date_recall', 'comparison', 'sequence_order', 'table_question']) {
      if (selected.length >= targetCount) break;
      // Chronology consumes four facts for one question, so on
      // a small source it would starve the bank (four date facts
      // became one chronology question instead of three varied
      // questions). Gate it by abundance, like the fact-expensive
      // pass; the single-fact rare forms are not gated.
      if (rareSubtype === 'chronology' && distinctFactCount < targetCount * 2) continue;
      const pool = validated.filter((candidate) =>
        candidate.question_subtype === rareSubtype &&
        !candidate.relation_keys.some((key) => usedRelations.has(key)) &&
        !usedStems.has(normalizeOption(candidate.stem))
      );
      if (!pool.length) continue;
      pool.sort((a, b) => {
        const startA = a.candidate_sort ? a.candidate_sort.source_start : 0;
        const startB = b.candidate_sort ? b.candidate_sort.source_start : 0;
        if (startA !== startB) return startA - startB;
        return String(a.id).localeCompare(String(b.id));
      });
      const chosen = pool[0];
      selected.push(chosen);
      for (const key of chosen.relation_keys) usedRelations.add(key);
      usedStems.add(normalizeOption(chosen.stem));
      subtypeUse[chosen.question_subtype] = (subtypeUse[chosen.question_subtype] || 0) + 1;
    }
    const factExpensiveFirst = distinctFactCount >= targetCount * 2;
    for (const prioritySubtype of (factExpensiveFirst ? ['multi_statement_3', 'multi_statement', 'assertion_reason'] : [])) {
      if (selected.length >= targetCount) break;
      const pool = validated.filter((candidate) =>
        candidate.question_subtype === prioritySubtype &&
        !candidate.relation_keys.some((key) => usedRelations.has(key)) &&
        !usedStems.has(normalizeOption(candidate.stem))
      );
      if (!pool.length) continue;
      pool.sort((a, b) => {
        const startA = a.candidate_sort ? a.candidate_sort.source_start : 0;
        const startB = b.candidate_sort ? b.candidate_sort.source_start : 0;
        if (startA !== startB) return startA - startB;
        return String(a.id).localeCompare(String(b.id));
      });
      const chosen = pool[0];
      selected.push(chosen);
      for (const key of chosen.relation_keys) usedRelations.add(key);
      usedStems.add(normalizeOption(chosen.stem));
      subtypeUse[chosen.question_subtype] = (subtypeUse[chosen.question_subtype] || 0) + 1;
    }
    while (selected.length < targetCount) {
      const available = validated.filter((candidate) => {
        if (candidate.relation_keys.some((key) => usedRelations.has(key))) return false;
        if (usedStems.has(normalizeOption(candidate.stem))) return false;
        // Variety cap (quality): no subtype may exceed 40% of the
        // bank. A descriptive chapter that only yields entity facts
        // must yield a smaller, balanced bank, not a 67% entity bank.
        // Target count is a maximum, not a quota to be filled by
        // repeating one subtype.
        const cap = Math.ceil(targetCount * 0.4);
        if ((subtypeUse[candidate.question_subtype] || 0) >= cap) return false;
        return true;
      });
      if (!available.length) break;
      available.sort((a, b) => {
        const useA = subtypeUse[a.question_subtype] || 0;
        const useB = subtypeUse[b.question_subtype] || 0;
        if (useA !== useB) return useA - useB;
        const rankA = SUBTYPE_RANK[a.question_subtype] == null ? 99 : SUBTYPE_RANK[a.question_subtype];
        const rankB = SUBTYPE_RANK[b.question_subtype] == null ? 99 : SUBTYPE_RANK[b.question_subtype];
        if (rankA !== rankB) return rankA - rankB;
        const startA = a.candidate_sort ? a.candidate_sort.source_start : 0;
        const startB = b.candidate_sort ? b.candidate_sort.source_start : 0;
        if (startA !== startB) return startA - startB;
        return String(a.id).localeCompare(String(b.id));
      });
      const chosen = available[0];
      selected.push(chosen);
      for (const key of chosen.relation_keys) usedRelations.add(key);
      usedStems.add(normalizeOption(chosen.stem));
      subtypeUse[chosen.question_subtype] = (subtypeUse[chosen.question_subtype] || 0) + 1;
    }

    const accepted = [];
    let sequence = 0;
    for (const candidate of selected) {
      const correctIndex = candidate.options.findIndex((option) => option.is_correct === true);
      if (correctIndex === -1) continue;
      const targetIndex = sequence % 4;
      candidate.options = reorderOptions(candidate.options, correctIndex, targetIndex);
      candidate.answer_key = KEYS[targetIndex];
      candidate.id = 'Q-LITE-' + padNumber(sequence + 1, 3);
      candidate.verification = {
        status: 'verified',
        rules: ['source_fact', 'typed_options', 'evidence_quoted', 'answer_verified', 'scope_preserved']
      };
      const check = validateQuestion(candidate, facts, ctx);
      if (!check.valid) {
        const rule = check.issues[0] ? check.issues[0].rule : 'post_rotation_validation';
        incrementCount(rejectionCounts, rule, 1);
        continue;
      }
      accepted.push(candidate);
      sequence++;
    }

    const remaining = validated.filter((candidate) => !selected.includes(candidate));
    for (const candidate of remaining) {
      incrementCount(rejectionCounts, selected.length >= targetCount ? 'target_limit' : 'duplicate_relation', 1);
    }

    if (v2Error) rejectionCounts.v2_error = (rejectionCounts.v2_error || 0) + 1;
    if (v2Generation && v2Generation.rejectionCounts) {
      for (const key of Object.keys(v2Generation.rejectionCounts)) {
        rejectionCounts['v2_' + key] = (rejectionCounts['v2_' + key] || 0) + v2Generation.rejectionCounts[key];
      }
    }
    if (!accepted.length) {
      const metrics = {
        factCount: facts.length,
        totalCandidates: allCandidates.length,
        accepted: 0,
        rejected: allCandidates.length,
        conflictCount: conflicts.length,
        rejectionCounts,
        buildMetrics,
        v2Failed: Boolean(v2Error),
        v2Error: v2Error ? (v2Error.message || String(v2Error)) : null,
        v2Generation: v2Generation
      };
      throw noVerifiedQuestionsError(
        'No verified questions could be created from this source. The material was unsupported, ambiguous, or in conflict, so nothing was published.',
        metrics
      );
    }

    const subtypeDistribution = {};
    const keyDistribution = {};
    const usedFactIds = new Set();
    for (const question of accepted) {
      subtypeDistribution[question.question_subtype] = (subtypeDistribution[question.question_subtype] || 0) + 1;
      keyDistribution[question.answer_key] = (keyDistribution[question.answer_key] || 0) + 1;
      for (const id of question.evidence.fact_ids) usedFactIds.add(id);
    }
    const unusedFactIds = facts.filter((fact) => !usedFactIds.has(fact.fact_id)).map((fact) => fact.fact_id);
    const conflictedFactIds = facts.filter((fact) => fact.conflict_status === 'conflicting').map((fact) => fact.fact_id);
    const metrics = {
      factCount: facts.length,
      totalCandidates: allCandidates.length,
      productionCandidates: candidates.length,
      v2Candidates: v2Candidates.length,
      accepted: accepted.length,
      rejected: Math.max(0, allCandidates.length - accepted.length),
      requestedCount: targetCount,
      conflictCount: conflicts.length,
      conflictedFactCount: conflictedFactIds.length,
      conflictedFactIds,
      unusedFactCount: unusedFactIds.length,
      unusedFactIds,
      rejectionCounts,
      buildMetrics,
      subtypeDistribution,
      keyDistribution,
      v2Failed: Boolean(v2Error),
      v2Error: v2Error ? (v2Error.message || String(v2Error)) : null,
      v2Generation: v2Generation
    };
    Object.defineProperty(accepted, 'generation', { value: metrics, enumerable: false });
    Object.defineProperty(accepted, 'facts', { value: facts, enumerable: false });
    Object.defineProperty(accepted, 'v2Diagnostics', {
      value: { failed: Boolean(v2Error), error: v2Error ? (v2Error.message || String(v2Error)) : null, generation: v2Generation },
      enumerable: false
    });
    return accepted;
  }

  // Mock-test assembly (not a bank dump). A bank is a pool of
  // verified questions; a mock test is a selected paper with a
  // blueprint: coverage across sections, a difficulty mix, no fact
  // reused, no answer leaked by another question, and balanced
  // answer keys. Selection is deterministic (input order + hashes),
  // so the same bank always assembles the same paper, and a
  // different bank assembles a different one.
  function assembleMockTest(questions, options) {
    const opts = options || {};
    const all = Array.isArray(questions) ? questions.filter((q) => q && Array.isArray(q.options) && q.options.length === 4 && q.options.filter((o) => o.is_correct).length === 1) : [];
    const target = Number.isFinite(opts.targetCount) && opts.targetCount > 0 ? Math.floor(opts.targetCount) : Math.min(20, all.length);
    const mixRaw = opts.difficultyMix || { easy: 0.3, medium: 0.5, hard: 0.2 };
    const mixSum = (mixRaw.easy || 0) + (mixRaw.medium || 0) + (mixRaw.hard || 0) || 1;
    const mix = { easy: (mixRaw.easy || 0) / mixSum, medium: (mixRaw.medium || 0) / mixSum, hard: (mixRaw.hard || 0) / mixSum };
    const patternAnswers = new Set(['1 only', '2 only', '3 only', 'both 1 and 2', 'neither 1 nor 2', '1 and 2 only', '1 and 3 only', '2 and 3 only', '1, 2 and 3', 'none of the above']);
    function questionText(q) {
      // Only stems and statements count as leakage: an answer that
      // appears as a distractor in another question is normal exam
      // practice (the same set of places, years, or terms recurs as
      // options), not a giveaway. An answer stated in another
      // question's stem or in a multi-statement, however, gives it
      // away before the student even reads the options.
      const parts = [q.stem || ''];
      for (const s of q.statements || []) parts.push(s.text || '');
      return normalizeOption(parts.join(' '));
    }
    function leaks(a, b) {
      // Does a's answer appear in b's text, or b's answer in a's?
      const pairs = [[a, b], [b, a]];
      for (const [first, second] of pairs) {
        const ans = normalizeOption(first.expected_answer || '');
        if (!ans || ans.length < 3 || patternAnswers.has(ans)) continue;
        if (questionText(second).includes(ans)) return true;
      }
      return false;
    }
    const sections = [];
    for (const q of all) {
      const s = q.source_title || 'Unknown';
      if (!sections.includes(s)) sections.push(s);
    }
    const selected = [];
    const rejected = new Set();
    const usedRelations = new Set();
    const usedStems = new Set();
    const subtypeUse = {};
    const difficultyUse = { easy: 0, medium: 0, hard: 0 };
    let leakageRejected = 0;
    let reuseRejected = 0;
    let sectionCursor = 0;
    // Round-robin across sections, so a paper does not come only
    // from the first chapter section that happened to yield facts.
    // Within a section, prefer the difficulty with the largest
    // remaining deficit against the mix, then the least-used subtype.
    while (selected.length < target) {
      let progressed = false;
      for (let round = 0; round < sections.length && selected.length < target; round++) {
        const section = sections[(sectionCursor + round) % sections.length];
        const pool = all.filter((q) => (q.source_title || 'Unknown') === section && !selected.includes(q) && !rejected.has(q));
        if (!pool.length) continue;
        const deficits = {};
        for (const d of ['easy', 'medium', 'hard']) {
          deficits[d] = Math.round(mix[d] * target) - (difficultyUse[d] || 0);
        }
        pool.sort((a, b) => {
          const da = deficits[a.difficulty] || 0;
          const db = deficits[b.difficulty] || 0;
          if (db !== da) return db - da;
          const ua = subtypeUse[a.question_subtype] || 0;
          const ub = subtypeUse[b.question_subtype] || 0;
          if (ua !== ub) return ua - ub;
          return all.indexOf(a) - all.indexOf(b);
        });
        let chosen = null;
        for (const cand of pool) {
          const stemKey = normalizeOption(cand.stem || '');
          const rels = Array.isArray(cand.relation_keys) ? cand.relation_keys : [];
          // Relation keys (fact id + value) are the reuse identity:
          // fact ids alone restart at F-LITE-001 for every source, so
          // they cannot be used to detect reuse across combined banks.
          if (usedStems.has(stemKey) || rels.some((r) => usedRelations.has(r))) {
            rejected.add(cand);
            reuseRejected++;
            continue;
          }
          if (selected.some((s) => leaks(s, cand))) {
            rejected.add(cand);
            leakageRejected++;
            continue;
          }
          chosen = cand;
          break;
        }
        if (!chosen) continue;
        selected.push(chosen);
        usedStems.add(normalizeOption(chosen.stem || ''));
        for (const r of chosen.relation_keys || []) usedRelations.add(r);
        subtypeUse[chosen.question_subtype] = (subtypeUse[chosen.question_subtype] || 0) + 1;
        difficultyUse[chosen.difficulty] = (difficultyUse[chosen.difficulty] || 0) + 1;
        progressed = true;
      }
      sectionCursor = (sectionCursor + 1) % Math.max(1, sections.length);
      if (!progressed) break;
    }
    // Key balancing: reassign keys so counts differ by at most one,
    // choosing the least-used key per question (tie-broken by a hash
    // of the question id, so the key sequence is not a simple ABCD
    // rotation a student could learn). Input questions are copied,
    // never mutated.
    const keyCounts = { A: 0, B: 0, C: 0, D: 0 };
    const balanced = selected.map((q) => {
      const copy = Object.assign({}, q);
      const correct = q.options.find((o) => o.is_correct);
      const distractors = q.options.filter((o) => !o.is_correct);
      let targetKey = KEYS[0];
      let bestScore = Infinity;
      for (const key of KEYS) {
        const score = keyCounts[key] * 10 + (stableHash(q.id || q.stem || '') % 4 === KEYS.indexOf(key) ? 0 : 1);
        if (score < bestScore) { bestScore = score; targetKey = key; }
      }
      keyCounts[targetKey]++;
      const newOptions = [];
      let dIdx = 0;
      for (const key of KEYS) {
        if (key === targetKey) newOptions.push(Object.assign({}, correct, { key }));
        else newOptions.push(Object.assign({}, distractors[dIdx++], { key }));
      }
      copy.options = newOptions;
      copy.answer_key = targetKey;
      return copy;
    });
    const audit = {
      total: balanced.length,
      target,
      byDifficulty: { easy: difficultyUse.easy || 0, medium: difficultyUse.medium || 0, hard: difficultyUse.hard || 0 },
      difficultyTarget: { easy: Math.round(mix.easy * target), medium: Math.round(mix.medium * target), hard: Math.round(mix.hard * target) },
      bySubtype: subtypeUse,
      bySection: {},
      keyDistribution: keyCounts,
      sectionsCovered: 0,
      sectionsAvailable: sections.length,
      leakageRejected,
      reuseRejected
    };
    for (const q of balanced) {
      const s = q.source_title || 'Unknown';
      audit.bySection[s] = (audit.bySection[s] || 0) + 1;
    }
    audit.sectionsCovered = Object.keys(audit.bySection).length;
    return { questions: balanced, audit };
  }

  const StudySynthEngine = {
    cleanText,
    classifySentenceRole,
    splitSentences,
    extractAnchors,
    balanceDistractorLength,
    parseRawDocument,
    extractSourceFacts,
    parseFactRelations,
    detectFactConflicts,
    buildKnowledgeInventory,
    buildDistractorCandidates,
    buildQuestionCandidates,
    validateQuestion,
    validateQuestionBank,
    generateQuestionBank,
    assembleMockTest,
    assembleCaseSets,
    isUsableSubject,
    checkSubjectQuality,
    cleanNumericAttribute,
    maskExpectedAnswer,
    buildStemContext,
    LOW_OCR_CONFIDENCE,
    ReasoningV2
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = StudySynthEngine;
  global.StudySynthEngine = StudySynthEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
