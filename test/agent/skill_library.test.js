import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillLibrary } from '../../src/agent/library/skill_library.js';

test('skill docs word-overlap fallback compares against doc text after embedding failure', async () => {
    const library = new SkillLibrary({}, null);
    library.embedding_model = null;
    library.skill_docs_embeddings = {
        'skills.placeBlock(bot, blockType, x, y, z)\nPlace a block in the world.': [0.1, 0.2],
        'skills.breakBlockAt(bot, x, y, z)\nBreak a block in the world.': [0.3, 0.4],
    };
    library.always_show_skills_docs = {};

    const docs = await library.getRelevantSkillDocs('place oak block', 1);

    assert.match(docs, /skills\.(placeBlock|breakBlockAt)/);
    assert.doesNotMatch(docs, /0\.1,0\.2/);
});
