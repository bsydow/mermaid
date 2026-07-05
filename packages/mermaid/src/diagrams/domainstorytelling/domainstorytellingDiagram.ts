// Domain Storytelling diagram definition for Mermaid
import type { DiagramDefinition } from '../../diagram-api/types.js';
import { parser } from './domainstorytellingParser.js';
import { DomainStoryDb } from './domainstorytellingDb.js';
import { renderer } from './domainstorytellingRenderer.js';
import styles from './domainstorytellingStyles.js';

export const diagram: DiagramDefinition = {
  parser,
  get db() {
    return new DomainStoryDb();
  },
  renderer,
  styles,
};
