/**
 * StudySynth Lite — Adaptive Revision Engine
 * Deterministic, dependency-free, and fully offline.
 *
 * Responsibilities:
 *   1. Build evidence-backed recall cards from the knowledge inventory.
 *   2. Schedule reviews with a fixed, transparent spaced-repetition policy.
 *   3. Select adaptive sessions from due, weak, new, and stale material.
 *
 * Scheduling and selection never touch the DOM or storage. Every time-dependent
 * function takes an explicit timestamp so tests stay deterministic.
 */

(function (global) {
  'use strict';

  const ENGINE_VERSION = 1;

  const RATINGS = ['again', 'hard', 'good', 'easy'];

  const FORM_LABELS = {
    definition: 'Definition recall',
    cloze: 'Cloze recall',
    entity: 'Entity attribute',
    date: 'Date and event',
    numeric: 'Numeric recall',
    classification: 'Classification recall',
    causal: 'Cause and effect',
    sequence: 'Sequence recall',
    comparison: 'Comparison recall',
    fact: 'Direct recall',
    source: 'Source recall'
  };

  const AGAIN_MINUTES = 10;
  const MAX_INTERVAL_DAYS = 365;
  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MINUTE_MS;
  const DEFAULT_SESSION_SIZE = 10;
  const SESSION_TARGETS = [
    { key: 'due', share: 0.6 },
    { key: 'fresh', share: 0.25 },
    { key: 'stale', share: 0.15 }
  ];

  // ==========================================================================
  // Small text helpers
  // ==========================================================================
  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeText(value) {
    return text(value).replace(/\s+/g, ' ').toLowerCase();
  }

  function excerptIncludes(excerpt, value) {
    const needle = normalizeText(value);
    if (!needle) return false;
    return normalizeText(excerpt).indexOf(needle) !== -1;
  }

  function inlineSubject(subject) {
    const clean = text(subject);
    return clean.replace(/^(The|A|An)\s+/, (match) => match.toLowerCase());
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
      event_range: 'the associated period',
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
      causes: 'the stated effect',
      members: 'the stated members',
      sequence: 'the explicit sequence'
    };
    return labels[relation] || text(relation).replace(/_/g, ' ');
  }

  // ==========================================================================
  // Card construction
  // ==========================================================================
  function revisionItemId(moduleId, factId) {
    return String(moduleId) + '::' + String(factId);
  }

  function isUsableFact(fact) {
    if (!fact || typeof fact !== 'object') return false;
    if (fact.fact_type === 'fallback' || fact.extraction_method === 'fallback') return false;
    if (fact.conflict_status === 'conflicting') return false;
    if (fact.confidence_class === 'ocr-unverified') return false;
    if (!text(fact.subject) || !text(fact.object)) return false;
    return true;
  }

  function isBlockedFact(fact) {
    if (!fact || typeof fact !== 'object') return false;
    return fact.conflict_status === 'conflicting' || fact.confidence_class === 'ocr-unverified';
  }

  function baseCard(moduleId, unit, fact, form, extra) {
    const statement = text(unit.statement || unit.supporting_excerpt);
    return Object.assign({
      id: '',
      moduleId: moduleId,
      kuId: text(unit.ku_id),
      factId: fact ? text(fact.fact_id) : null,
      form: form,
      formLabel: FORM_LABELS[form] || form,
      prompt: '',
      answer: '',
      statement: statement,
      excerpt: text(unit.supporting_excerpt || unit.statement),
      sectionId: text(unit.section_id),
      sectionTitle: text(unit.section_title) || 'Source',
      sourcePage: Number.isFinite(unit.source_page) ? unit.source_page : (Number(unit.source_page) || 1),
      confidence: text(unit.confidence_class) || 'verified',
      sourceStart: Number.isFinite(unit.source_start) ? unit.source_start : (Number(unit.source_start) || 0),
      sourceEnd: Number.isFinite(unit.source_end) ? unit.source_end : (Number(unit.source_end) || 0),
      sourceOnly: form === 'source'
    }, extra || {});
  }

  function evidenceUnit(unit, fact) {
    const excerpt = text(fact && fact.supporting_excerpt) || text(unit.supporting_excerpt) || text(unit.statement);
    return Object.assign({}, unit, {
      statement: text(unit.statement) || excerpt,
      supporting_excerpt: excerpt
    });
  }

  function membershipCard(moduleId, unit, fact) {
    const members = Array.isArray(fact.members)
      ? fact.members.map(text).filter(Boolean)
      : [];
    const subject = text(fact.subject);
    const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);

    if (members.length === 1) {
      if (!excerptIncludes(excerpt, members[0]) || !excerptIncludes(excerpt, subject)) return null;
      const card = baseCard(moduleId, unit, fact, 'classification');
      card.prompt = 'Under which category does the source place ' + members[0] + '?';
      card.answer = subject;
      return card;
    }

    if (!members.length) {
      const fallbackMembers = text(fact.object).split(/\s*,\s*/).filter(Boolean);
      if (!fallbackMembers.length) return null;
      if (!fallbackMembers.every((member) => excerptIncludes(excerpt, member))) return null;
      const card = baseCard(moduleId, unit, fact, 'classification');
      card.prompt = 'Which items does the source list under ' + subject + '?';
      card.answer = fallbackMembers.join(', ');
      return card;
    }

    if (!members.every((member) => excerptIncludes(excerpt, member))) return null;
    const card = baseCard(moduleId, unit, fact, 'classification');
    card.prompt = 'Which items does the source list under ' + subject + '?';
    card.answer = members.join(', ');
    return card;
  }

  function sequenceCard(moduleId, unit, fact) {
    const items = Array.isArray(fact.sequence_items) ? fact.sequence_items.map(text).filter(Boolean) : [];
    if (items.length < 2) return null;
    const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
    if (!items.every((item) => excerptIncludes(excerpt, item))) return null;
    const card = baseCard(moduleId, unit, fact, 'sequence');
    card.prompt = 'What order does the source give for the stated procedure?';
    card.answer = items.join(' → ');
    return card;
  }

  function entityCard(moduleId, unit, fact) {
    const subject = text(fact.subject);
    const object = text(fact.object);
    const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
    if (!excerptIncludes(excerpt, object)) return null;

    const prompts = {
      location: 'Where is ' + inlineSubject(subject) + ' located, according to the source?',
      initial_location: 'Where was ' + inlineSubject(subject) + ' initially located?',
      destination_location: 'Where did ' + inlineSubject(subject) + ' move to?',
      office: 'Which office does ' + inlineSubject(subject) + ' hold?',
      launched_by: 'Who launched ' + inlineSubject(subject) + '?',
      implemented_by: 'Who implemented ' + inlineSubject(subject) + '?',
      developed_by: 'Who developed ' + inlineSubject(subject) + '?',
      function: 'What is the stated function of ' + inlineSubject(subject) + '?',
      method: 'Which method does ' + inlineSubject(subject) + ' use?',
      role: 'What role does the source assign to ' + inlineSubject(subject) + '?',
      equipment: 'Which equipment did ' + inlineSubject(subject) + ' use?'
    };
    const card = baseCard(moduleId, unit, fact, 'entity');
    card.prompt = prompts[fact.relation]
      || ('What is ' + relationLabel(fact.relation) + ' of ' + inlineSubject(subject) + '?');
    card.answer = object;
    return card;
  }

  function factCard(moduleId, unit, fact) {
    const type = text(fact.fact_type);
    if (type === 'definition') {
      const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
      if (!excerptIncludes(excerpt, fact.object)) return null;
      const card = baseCard(moduleId, unit, fact, 'definition');
      card.prompt = 'How does the source define ' + inlineSubject(fact.subject) + '?';
      card.answer = text(fact.object);
      return card;
    }

    if (type === 'date') {
      const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
      if (!excerptIncludes(excerpt, fact.object)) return null;
      const card = baseCard(moduleId, unit, fact, 'date');
      const label = text(fact.requested_label);
      card.prompt = label
        ? 'What is ' + label + '?'
        : 'What ' + relationLabel(fact.relation) + ' does the source give for ' + inlineSubject(fact.subject) + '?';
      card.answer = text(fact.object);
      return card;
    }

    if (type === 'numeric') {
      const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
      if (!excerptIncludes(excerpt, fact.object)) return null;
      const card = baseCard(moduleId, unit, fact, 'numeric');
      const subject = inlineSubject(text(fact.subject) || text(fact.attribute));
      card.prompt = 'What value does the source give for ' + subject + '?';
      card.answer = text(fact.object);
      return card;
    }

    if (type === 'membership') return membershipCard(moduleId, unit, fact);
    if (type === 'sequence') return sequenceCard(moduleId, unit, fact);
    if (type === 'entity_attribute') return entityCard(moduleId, unit, fact);

    if (type === 'causal') {
      const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
      if (!excerptIncludes(excerpt, fact.object)) return null;
      const card = baseCard(moduleId, unit, fact, 'causal');
      card.prompt = fact.causal_direction === 'effect_because_cause'
        ? 'What cause does the source give for ' + inlineSubject(fact.subject) + '?'
        : 'What effect does the source attribute to ' + inlineSubject(fact.subject) + '?';
      card.answer = text(fact.object);
      return card;
    }

    if (type === 'comparison') {
      const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
      if (!excerptIncludes(excerpt, fact.object)) return null;
      const card = baseCard(moduleId, unit, fact, 'comparison');
      card.prompt = 'What contrast does the source draw involving ' + inlineSubject(fact.subject) + '?';
      card.answer = text(fact.object);
      return card;
    }

    return clozeCard(moduleId, unit, fact) || directCard(moduleId, unit, fact);
  }

  function clozeCard(moduleId, unit, fact) {
    const object = text(fact.object);
    const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
    if (!object || object.length < 2 || !excerpt) return null;
    if (!excerptIncludes(excerpt, object)) return null;
    const index = normalizeText(excerpt).indexOf(normalizeText(object));
    if (index < 0) return null;
    // Replace in the original text without altering the surrounding wording.
    const before = excerpt.slice(0, index);
    const after = excerpt.slice(index + object.length);
    const clozed = before + '______' + after;
    if (!clozed || normalizeText(clozed) === normalizeText(excerpt)) return null;
    const card = baseCard(moduleId, unit, fact, 'cloze');
    card.prompt = 'Complete the source statement:\n' + clozed;
    card.answer = object;
    return card;
  }

  function directCard(moduleId, unit, fact) {
    const object = text(fact.object);
    const excerpt = text(fact.supporting_excerpt) || text(unit.supporting_excerpt);
    if (!object || !excerptIncludes(excerpt, object)) return null;
    const card = baseCard(moduleId, unit, fact, 'fact');
    card.prompt = 'What does the source state as ' + relationLabel(fact.relation)
      + ' for ' + inlineSubject(fact.subject) + '?';
    card.answer = object;
    return card;
  }

  function sourceCard(moduleId, unit, sequence) {
    const statement = text(unit.statement || unit.supporting_excerpt);
    if (!statement) return null;
    const base = baseCard(moduleId, unit, null, 'source');
    base.id = revisionItemId(moduleId, text(unit.ku_id) || ('KU-source-' + sequence) + ':source');
    base.factId = null;
    base.sourceOnly = true;

    const anchor = text(unit.anchor);
    let clozed = null;
    if (anchor && anchor.length >= 3 && statement !== anchor) {
      const index = normalizeText(statement).indexOf(normalizeText(anchor));
      if (index >= 0) clozed = statement.slice(0, index) + '______' + statement.slice(index + anchor.length);
    }

    if (clozed) {
      base.form = 'cloze';
      base.formLabel = FORM_LABELS.cloze;
      base.sourceOnly = false;
      base.prompt = 'Complete the source statement:\n' + clozed;
      base.answer = anchor;
    } else {
      base.prompt = anchor
        ? 'Recall the key point the source makes about ' + anchor + '.'
        : 'Recall the key point this source passage makes.';
      base.answer = statement;
    }
    return base;
  }

  function buildRevisionItems(module) {
    const mod = module && typeof module === 'object' ? module : {};
    const moduleId = mod.id ? String(mod.id) : 'module';
    const inventory = Array.isArray(mod.inventory) ? mod.inventory : [];
    const cards = [];
    const seen = Object.create(null);
    let sequence = 0;

    inventory.forEach((unit, unitIndex) => {
      if (!unit || typeof unit !== 'object') return;
      const statement = text(unit.statement || unit.supporting_excerpt);
      if (!statement) return;
      if (unit.conflict_status === 'conflicting') return;
      if (unit.confidence_class === 'ocr-unverified') return;

      const facts = Array.isArray(unit.revision_facts) ? unit.revision_facts : [];
      const usable = facts.filter(isUsableFact);
      let built = 0;

      usable.forEach((fact) => {
        const source = evidenceUnit(unit, fact);
        const card = factCard(moduleId, source, fact);
        if (!card) return;
        card.id = revisionItemId(moduleId, text(fact.fact_id));
        card.factId = text(fact.fact_id);
        card.order = { start: card.sourceStart, sequence: sequence++ };
        if (!seen[card.id]) {
          seen[card.id] = true;
          cards.push(card);
          built++;
        }
      });

      if (built > 0) {
        sequence++;
        return;
      }

      // Facts exist but every one is contradictory or low-confidence OCR:
      // exclude the unit rather than revise unsafe content.
      if (facts.length && facts.every(isBlockedFact)) return;

      const fallback = sourceCard(moduleId, unit, sequence++);
      if (fallback && !seen[fallback.id]) {
        seen[fallback.id] = true;
        fallback.order = { start: fallback.sourceStart, sequence: sequence++ };
        cards.push(fallback);
      }
      sequence++;
    });

    cards.sort((a, b) => {
      const startDiff = (a.order ? a.order.start : 0) - (b.order ? b.order.start : 0);
      if (startDiff) return startDiff;
      const seqDiff = (a.order ? a.order.sequence : 0) - (b.order ? b.order.sequence : 0);
      if (seqDiff) return seqDiff;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });

    return cards;
  }

  // ==========================================================================
  // Scheduling
  // ==========================================================================
  function clampDays(days) {
    const rounded = Math.round(days);
    return Math.min(MAX_INTERVAL_DAYS, Math.max(1, rounded));
  }

  function moduleIdOf(itemId) {
    const value = String(itemId);
    const index = value.indexOf('::');
    return index > 0 ? value.slice(0, index) : null;
  }

  function getItemProgress(itemId, progress, now) {
    const raw = (progress && progress[itemId]) || null;
    const reviews = raw && Number.isFinite(Number(raw.reviews)) ? Number(raw.reviews) : 0;
    const record = {
      itemId: String(itemId),
      moduleId: (raw && raw.moduleId) || moduleIdOf(itemId),
      reviews: reviews,
      lapses: raw && Number.isFinite(Number(raw.lapses)) ? Number(raw.lapses) : 0,
      stage: raw && Number.isFinite(Number(raw.stage)) ? Number(raw.stage) : 0,
      streak: raw && Number.isFinite(Number(raw.streak)) ? Number(raw.streak) : 0,
      intervalDays: raw && Number.isFinite(Number(raw.intervalDays)) ? Number(raw.intervalDays) : 0,
      intervalMinutes: raw && raw.intervalMinutes != null ? Number(raw.intervalMinutes) : null,
      lastRating: raw ? raw.lastRating || null : null,
      lastReviewAt: raw && raw.lastReviewAt != null ? Number(raw.lastReviewAt) : null,
      dueAt: raw && raw.dueAt != null ? Number(raw.dueAt) : null,
      createdAt: raw && raw.createdAt != null ? Number(raw.createdAt) : null,
      updatedAt: raw && raw.updatedAt != null ? Number(raw.updatedAt) : null
    };
    record.isNew = record.reviews === 0;
    record.due = !record.isNew && record.dueAt != null && record.dueAt <= now;
    record.status = record.isNew
      ? 'new'
      : (record.lastRating === 'again' ? 'relearning' : (record.streak >= 3 ? 'consistent' : 'learning'));
    return record;
  }

  function gradeItem(itemId, rating, progress, now) {
    if (RATINGS.indexOf(rating) === -1) {
      throw new Error('Unknown rating: ' + rating);
    }
    const map = Object.assign({}, progress || {});
    const current = getItemProgress(itemId, map, now);
    const next = Object.assign({}, map[itemId] || {});
    next.itemId = String(itemId);
    next.moduleId = next.moduleId || current.moduleId || null;
    next.reviews = current.reviews + 1;
    next.lastRating = rating;
    next.lastReviewAt = now;
    next.updatedAt = now;
    next.createdAt = current.createdAt != null ? current.createdAt : now;

    if (rating === 'again') {
      next.lapses = current.lapses + 1;
      next.stage = 0;
      next.streak = 0;
      next.intervalDays = 0;
      next.intervalMinutes = AGAIN_MINUTES;
      next.dueAt = now + AGAIN_MINUTES * MINUTE_MS;
      next.status = 'relearning';
    } else {
      let days;
      if (current.stage === 0) {
        days = rating === 'easy' ? 4 : 1;
      } else if (rating === 'hard') {
        days = current.intervalDays * 1.2;
      } else if (rating === 'good') {
        days = current.stage === 1 ? 3 : current.intervalDays * 2.2;
      } else {
        days = current.intervalDays * 2.8;
      }
      days = clampDays(days);
      next.lapses = current.lapses;
      next.stage = current.stage + 1;
      next.streak = current.streak + 1;
      next.intervalMinutes = null;
      next.intervalDays = days;
      next.dueAt = now + days * DAY_MS;
      next.status = next.streak >= 3 ? 'consistent' : 'learning';
    }

    map[String(itemId)] = next;
    return map;
  }

  // ==========================================================================
  // Session selection
  // ==========================================================================
  function attemptWeaknesses(attempts, questions, moduleId) {
    const facts = Object.create(null);
    const units = Object.create(null);
    const list = Array.isArray(attempts) ? attempts : [];
    const bank = Array.isArray(questions) ? questions : [];
    if (!list.length || !bank.length) return { facts: facts, units: units };

    const byId = Object.create(null);
    bank.forEach((question) => {
      if (question && question.id) byId[question.id] = question;
    });

    list.forEach((attempt) => {
      if (!attempt || !attempt.answers) return;
      if (moduleId && attempt.moduleId && attempt.moduleId !== moduleId) return;
      Object.keys(attempt.answers).forEach((questionId) => {
        const question = byId[questionId];
        if (!question) return;
        const given = attempt.answers[questionId];
        if (!given || given === question.answer_key) return;
        const links = Array.isArray(question.knowledge_units) ? question.knowledge_units : [];
        links.forEach((link) => {
          if (!link) return;
          if (link.fact_id) facts[link.fact_id] = true;
          if (link.ku_id) units[link.ku_id] = true;
        });
        const evidenceFacts = question.evidence && Array.isArray(question.evidence.fact_ids)
          ? question.evidence.fact_ids
          : [];
        evidenceFacts.forEach((factId) => { facts[factId] = true; });
      });
    });

    return { facts: facts, units: units };
  }

  function allocateTargets(size) {
    const raw = SESSION_TARGETS.map((target) => size * target.share);
    const base = raw.map((value) => Math.floor(value));
    let remaining = size - base.reduce((sum, value) => sum + value, 0);
    const order = raw
      .map((value, index) => ({ index: index, remainder: value - Math.floor(value) }))
      .sort((a, b) => (b.remainder - a.remainder) || (a.index - b.index));
    let i = 0;
    while (remaining > 0) {
      base[order[i % order.length].index] += 1;
      remaining -= 1;
      i += 1;
    }
    return base;
  }

  function buildSession(items, progress, attempts, options) {
    const opts = options || {};
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const size = Math.max(1, Math.floor(opts.size || DEFAULT_SESSION_SIZE));
    const list = Array.isArray(items) ? items : [];
    const moduleId = opts.moduleId || (list[0] && list[0].moduleId) || null;

    const unique = [];
    const seen = Object.create(null);
    list.forEach((item) => {
      if (!item || !item.id || seen[item.id]) return;
      seen[item.id] = true;
      unique.push(item);
    });

    const weak = attemptWeaknesses(attempts, opts.questions, moduleId);
    const weakPools = Object.create(null);
    const pools = { weak: [], overdue: [], fresh: [], stale: [] };
    const records = Object.create(null);

    unique.forEach((item) => {
      const record = getItemProgress(item.id, progress, now);
      records[item.id] = record;
      const isWeak = !!(weak.facts[item.factId] || weak.units[item.kuId]);
      weakPools[item.id] = isWeak;
      if (record.isNew) {
        pools.fresh.push(item);
        return;
      }
      if (!record.due) return;
      if (record.lapses > 0 || isWeak) pools.weak.push(item);
      else if (record.streak >= 3) pools.stale.push(item);
      else pools.overdue.push(item);
    });

    const byId = (a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
    const overdueOf = (item) => now - (records[item.id].dueAt || now);

    pools.weak.sort((a, b) =>
      (overdueOf(b) - overdueOf(a))
      || (records[b.id].lapses - records[a.id].lapses)
      || ((weakPools[a.id] ? 0 : 1) - (weakPools[b.id] ? 0 : 1))
      || byId(a, b));
    pools.overdue.sort((a, b) => (overdueOf(b) - overdueOf(a)) || byId(a, b));
    pools.fresh.sort((a, b) =>
      ((weakPools[a.id] ? 0 : 1) - (weakPools[b.id] ? 0 : 1))
      || ((a.order ? a.order.start : 0) - (b.order ? b.order.start : 0))
      || byId(a, b));
    pools.stale.sort((a, b) =>
      ((records[a.id].dueAt || 0) - (records[b.id].dueAt || 0)) || byId(a, b));

    const duePool = pools.weak.concat(pools.overdue);
    const targets = allocateTargets(size);
    const selected = [];

    const take = (pool, count) => {
      while (count > 0 && pool.length) {
        selected.push(pool.shift());
        count -= 1;
      }
    };

    take(duePool, targets[0]);
    take(pools.fresh, targets[1]);
    take(pools.stale, targets[2]);

    let remaining = size - selected.length;
    take(duePool, remaining);
    remaining = size - selected.length;
    take(pools.fresh, remaining);
    remaining = size - selected.length;
    take(pools.stale, remaining);

    const itemIds = selected.map((item) => item.id);

    return {
      version: ENGINE_VERSION,
      moduleId: moduleId,
      itemIds: itemIds,
      size: itemIds.length,
      cursor: 0,
      reviewed: {},
      counts: { again: 0, hard: 0, good: 0, easy: 0 },
      requeued: {},
      startedAt: now,
      updatedAt: now,
      completed: itemIds.length === 0
    };
  }

  function getSessionCard(session, items) {
    if (!session || !Array.isArray(session.itemIds) || !Array.isArray(items)) return null;
    const index = session.cursor;
    if (index < 0 || index >= session.itemIds.length) return null;
    const id = session.itemIds[index];
    const card = items.find((item) => item && item.id === id);
    if (!card) return null;
    return { card: card, index: index, total: session.itemIds.length };
  }

  function rateSessionItem(session, itemId, rating, progress, now) {
    if (!session || session.completed) return { session: session, progress: progress, ignored: true };
    if (RATINGS.indexOf(rating) === -1) return { session: session, progress: progress, ignored: true };
    const currentId = session.itemIds[session.cursor];
    if (currentId !== itemId) return { session: session, progress: progress, ignored: true };

    const nextProgress = gradeItem(itemId, rating, progress, now);
    const next = Object.assign({}, session, {
      reviewed: Object.assign({}, session.reviewed),
      counts: Object.assign({}, session.counts),
      requeued: Object.assign({}, session.requeued),
      itemIds: session.itemIds.slice(),
      updatedAt: now
    });

    next.reviewed[itemId] = rating;
    next.counts[rating] = (next.counts[rating] || 0) + 1;
    next.cursor = session.cursor + 1;

    if (rating === 'again' && !next.requeued[itemId]) {
      next.requeued[itemId] = true;
      next.itemIds.push(itemId);
    }

    next.completed = next.cursor >= next.itemIds.length;
    return { session: next, progress: nextProgress, ignored: false };
  }

  function getSessionSummary(session, progress, now) {
    const source = session || {};
    const counts = Object.assign({ again: 0, hard: 0, good: 0, easy: 0 }, source.counts || {});
    const reviewed = counts.again + counts.hard + counts.good + counts.easy;
    const itemIds = Array.isArray(source.itemIds) ? source.itemIds : [];
    const cursor = Number.isFinite(source.cursor) ? source.cursor : 0;

    let remainingDue = 0;
    let nextDueAt = null;
    const seen = Object.create(null);
    itemIds.forEach((itemId) => {
      if (seen[itemId]) return;
      seen[itemId] = true;
      const record = getItemProgress(itemId, progress, now);
      if (record.due) remainingDue += 1;
      if (record.dueAt != null && record.dueAt > now && (nextDueAt == null || record.dueAt < nextDueAt)) {
        nextDueAt = record.dueAt;
      }
    });

    return {
      total: itemIds.length,
      reviewed: reviewed,
      counts: counts,
      remaining: Math.max(0, itemIds.length - cursor),
      remainingDue: remainingDue,
      nextDueAt: nextDueAt,
      currentIndex: cursor,
      completed: !!source.completed
    };
  }

  function getModuleRevisionStats(items, progress, now) {
    const list = Array.isArray(items) ? items : [];
    const stats = { total: list.length, due: 0, newItems: 0, learning: 0, consistent: 0, nextDueAt: null };
    list.forEach((item) => {
      if (!item || !item.id) {
        stats.total -= 1;
        return;
      }
      const record = getItemProgress(item.id, progress, now);
      if (record.isNew) {
        stats.newItems += 1;
      } else {
        if (record.status === 'consistent') stats.consistent += 1;
        else stats.learning += 1;
        if (record.due) stats.due += 1;
      }
      if (record.dueAt != null && record.dueAt > now && (stats.nextDueAt == null || record.dueAt < stats.nextDueAt)) {
        stats.nextDueAt = record.dueAt;
      }
    });
    return stats;
  }

  // Restore a saved session after a reload: drop stale ids and clamp the cursor.
  function resumeSession(session, items) {
    if (!session || !Array.isArray(session.itemIds)) return null;
    const validIds = Object.create(null);
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item && item.id) validIds[item.id] = true;
    });
    const itemIds = session.itemIds.filter((id) => validIds[id]);
    const reviewed = session.reviewed && typeof session.reviewed === 'object' ? session.reviewed : {};
    let cursor = Number.isFinite(session.cursor) ? session.cursor : 0;
    cursor = Math.max(0, Math.min(cursor, itemIds.length));
    return {
      version: ENGINE_VERSION,
      moduleId: session.moduleId || null,
      itemIds: itemIds,
      size: itemIds.length,
      cursor: cursor,
      reviewed: Object.assign({}, reviewed),
      counts: Object.assign({ again: 0, hard: 0, good: 0, easy: 0 }, session.counts || {}),
      requeued: Object.assign({}, session.requeued || {}),
      startedAt: session.startedAt || null,
      updatedAt: session.updatedAt || null,
      completed: cursor >= itemIds.length
    };
  }

  const RevisionEngine = {
    VERSION: ENGINE_VERSION,
    RATINGS: RATINGS,
    FORM_LABELS: FORM_LABELS,
    DEFAULT_SESSION_SIZE: DEFAULT_SESSION_SIZE,
    AGAIN_MINUTES: AGAIN_MINUTES,
    MAX_INTERVAL_DAYS: MAX_INTERVAL_DAYS,
    revisionItemId: revisionItemId,
    buildRevisionItems: buildRevisionItems,
    buildSession: buildSession,
    gradeItem: gradeItem,
    getItemProgress: getItemProgress,
    getSessionSummary: getSessionSummary,
    getModuleRevisionStats: getModuleRevisionStats,
    getSessionCard: getSessionCard,
    rateSessionItem: rateSessionItem,
    resumeSession: resumeSession
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RevisionEngine;
  if (typeof window !== 'undefined') window.StudySynthRevision = RevisionEngine;
  if (typeof self !== 'undefined' && typeof window === 'undefined') self.StudySynthRevision = RevisionEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
