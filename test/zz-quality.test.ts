import { buildBrief } from '../src/brief/builder';
import { makeFixture, OLD_DATE } from './brief/fixtures';
import { writeFileSync } from 'fs';

it('dump qualité', async () => {
  const fixture = makeFixture({ decisions: 9, neighbors: 6, issue: { assignee: '' } });
  fixture.decisions[0].date = OLD_DATE;
  const brief = await buildBrief('TST-101', 's', fixture.deps);
  writeFileSync('/tmp/brief-quality.md', brief.markdown);
  expect(brief.markdown).toContain('ancienne, à confirmer');
});
