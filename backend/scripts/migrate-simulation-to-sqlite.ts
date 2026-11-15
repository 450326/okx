import * as fs from 'fs';
import * as path from 'path';
import { SimulationEngine } from '../src/modules/simulation/simulation-engine';
import { SimulationRepository } from '../src/modules/simulation/simulation.repository';

const dataDir = path.resolve(__dirname, '../data');
const repository = new SimulationRepository();

function userIdForFile(name: string): string | null {
  if (name === 'simulation.json') return 'u_demo';
  const match = /^simulation-([A-Za-z0-9_-]+)\.json$/.exec(name);
  return match ? match[1] : null;
}

for (const name of fs.readdirSync(dataDir)) {
  const userId = userIdForFile(name);
  if (!userId) continue;
  const filePath = path.join(dataDir, name);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (parsed?.version !== 2 || !parsed.account) continue;
    if (!repository.hasAccount(userId)) {
      const engine = new SimulationEngine(parsed.account);
      repository.save(userId, engine.getState());
      console.log(`migrated ${name} -> sim_* (${userId})`);
    }
    const archive = `${filePath}.migrated-${Date.now()}`;
    fs.renameSync(filePath, archive);
    console.log(`archived ${name} -> ${path.basename(archive)}`);
  } catch (error) {
    console.error(`failed ${name}: ${(error as Error).message}`);
  }
}
