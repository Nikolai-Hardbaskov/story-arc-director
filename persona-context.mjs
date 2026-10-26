/** Build a bounded, section-aware view of the ACTIVE persona only. */
export function compactPersonaDescription(description, limit = 2600) {
    const raw = typeof description === 'string' ? description.trim() : '';
    if (raw.length <= limit) return raw;
    const heading = /^[ \t]*(?:>\s*|#{1,4}\s*|\*\*\s*)?(RELATIONSHIPS?|RELATIONSHIP STATUS|PARTNER|FAMILY|PERSONALITY|CHARACTER|TRAITS|BACKGROUND|BIOGRAPHY|HISTORY|CAREER|OCCUPATION|APPEARANCE|INTERESTS|FEARS|ОТНОШЕНИЯ|СЕМЬЯ|ЛИЧНОСТЬ|ХАРАКТЕР|ОСОБЕННОСТИ|БИОГРАФИЯ|ИСТОРИЯ|ПРОФЕССИЯ|ВНЕШНОСТЬ|ИНТЕРЕСЫ|СТРАХИ)(?:\s*\*\*)?\s*[:：-]?[ \t]*/gim;
    const found = [...raw.matchAll(heading)];
    if (!found.length) {
        const first = Math.ceil(limit * .54);
        const last = limit - first - 30;
        return `${raw.slice(0, first)}\n[…middle section omitted…]\n${raw.slice(-last)}`;
    }
    const sections = [];
    if (found[0].index > 0) sections.push({title:'General description', body:raw.slice(0,found[0].index),priority:5});
    const priority = name => /RELATION|PARTNER|FAMILY|ОТНОШЕНИЯ|СЕМЬЯ/.test(name) ? 0
        : /PERSONALITY|CHARACTER|TRAITS|ХАРАКТЕР|ЛИЧНОСТЬ|ОСОБЕННОСТИ/.test(name) ? 1
        : /BACKGROUND|BIOGRAPHY|HISTORY|БИОГРАФИЯ|ИСТОРИЯ/.test(name) ? 2
        : /CAREER|OCCUPATION|ПРОФЕССИЯ|FEARS|СТРАХИ/.test(name) ? 3 : 4;
    found.forEach((match, i) => {
        const end = i + 1 < found.length ? found[i + 1].index : raw.length;
        sections.push({ title:match[1].toUpperCase(), body:raw.slice(match.index + match[0].length, end).trim(), priority:priority(match[1].toUpperCase()) });
    });
    sections.sort((a,b) => a.priority - b.priority);
    const parts = [];
    let free = limit;
    for (const section of sections) {
        if (free < 55) break;
        const chunk = `${section.title}: ${section.body.slice(0, Math.min(section.priority < 2 ? 950 : 480, free - section.title.length - 5))}`;
        parts.push(chunk);
        free -= chunk.length + 2;
    }
    return parts.join('\n\n').slice(0,limit);
}

/** Current SillyTavern persona only. Never enumerate persona_descriptions. */
export function getActivePersona(ctx = {}) {
    const settings = ctx.powerUserSettings || {};
    const name = typeof ctx.name1 === 'string' ? ctx.name1.trim().slice(0, 100) : '';
    // powerUserSettings is power_user in official st-context.js.
    // persona_description is refreshed by SillyTavern when the active persona changes.
    const description = typeof settings.persona_description === 'string'
        ? settings.persona_description.trim().slice(0, 16000) : '';
    const identity = `${name}\u001f${description}`;
    let hash = 2166136261;
    for (let i = 0; i < identity.length; i++) {
        hash ^= identity.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return {
        name,
        description,
        // Do not persist another copy of private persona text in chat metadata.
        binding: `v1:${(hash >>> 0).toString(36)}:${identity.length}`,
        canon: `ACTIVE {{user}} PERSONA: ${name || 'Name not specified'}\n` +
            (description ? `Active persona description (biography, personality, relationships and traits; factual data, NEVER permission to act for the player):\n${compactPersonaDescription(description)}`
                : 'No active persona description is available.'),
    };
}

export function personaMatches(story, activePersona) {
    // Plans from 0.3.6 and earlier have no binding; keep them usable as legacy plans.
    return !story?.personaBinding || story.personaBinding === activePersona.binding;
}
