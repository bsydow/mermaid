// Domain Storytelling diagram parser using Langium-generated parser
import { DomainStoryDb } from './domainstorytellingDb.js';
import type { DomainStory } from '@mermaid-js/parser';
import { parse } from '@mermaid-js/parser';
import type { DiagramDB, ParserDefinition } from '../../diagram-api/types.js';
import { log } from '../../logger.js';
import { populateCommonDb } from '../common/populateCommonDb.js';
import type { DomainstorytellingDB } from './domainstorytellingTypes.js';

const generateWorkobjectId = (name: string, sentenceIdx: number, sentenceId?: string) =>
  sentenceId ? `${name}-${sentenceId}` : `${name}-${sentenceIdx}`;

const buildSentenceRef = (sentence: { noOfSeq: number; sentenceId?: string }) =>
  sentence.sentenceId ?? `#${sentence.noOfSeq}`;

const stripQuotes = (text: string) => {
  if (!text) {
    return text;
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
};

interface DomainStorySentenceLike {
  actor: string;
  noOfSeq: number;
  sentenceId?: string;
  activity: string;
  workobject: string;
  group?: string;
  continuations?: DomainStoryContinuationLike[];
}

interface AdditionalWorkObjectLike {
  $type: 'AdditionalWorkObject';
  activity: string;
  workobject: string;
  group?: string;
}
interface AdditionalActorLike {
  $type: 'AdditionalActor';
  activity: string;
  actor: string;
}
interface ReverseActorLike {
  $type: 'ReverseActor';
  activity: string;
  actor: string;
}
type DomainStoryContinuationLike =
  | AdditionalWorkObjectLike
  | AdditionalActorLike
  | ReverseActorLike;

interface DeclaredLabels {
  actorLabels: Map<string, string>;
  workobjectLabels: Map<string, string>;
}

interface AnnotationLike {
  actor?: string;
  group?: string;
  noOfSeq?: number;
  sentenceId?: string;
  workobject?: string;
  workobjectSeqNo?: number;
  workobjectSentenceId?: string;
  body: string;
}

interface ProcessedSentenceRef {
  noOfSeq: number;
  sentenceId?: string;
  workobjectNodeIds: Map<string, string[]>;
}

const processSentence = (
  block: DomainStorySentenceLike,
  db: DomainstorytellingDB,
  labels: DeclaredLabels,
  defaultWorkobjectGroup?: string
): ProcessedSentenceRef => {
  const sentenceRef = buildSentenceRef(block);
  const workobjectNodeIds = new Map<string, string[]>();
  const registerWorkobjectNodeId = (workobjectName: string, nodeId: string) => {
    const existingIds = workobjectNodeIds.get(workobjectName);
    if (existingIds) {
      existingIds.push(nodeId);
      return;
    }
    workobjectNodeIds.set(workobjectName, [nodeId]);
  };

  // Actor
  db.addActor(block.actor, labels.actorLabels.get(block.actor));

  // Workobjects
  const workobjectId = generateWorkobjectId(block.workobject, block.noOfSeq, block.sentenceId);
  db.addWorkobject(workobjectId, labels.workobjectLabels.get(block.workobject), block.workobject);
  registerWorkobjectNodeId(block.workobject, workobjectId);
  const mainGroup = block.group ?? defaultWorkobjectGroup;
  if (mainGroup) {
    db.setWorkobjectGroup(workobjectId, mainGroup);
  }
  db.setSentenceTarget(sentenceRef, block.actor);

  // Edge: Actor -> Workobject
  db.addEdge(block.actor, workobjectId, stripQuotes(block.activity), block.noOfSeq, sentenceRef);

  // Continuation segments are consumed in source order.
  // Actor/reverse segments stay anchored to the latest workobject node.
  let latestWorkobjectId = workobjectId;

  for (const continuation of block.continuations ?? []) {
    switch (continuation.$type) {
      case 'AdditionalWorkObject': {
        const additionalId = generateWorkobjectId(
          continuation.workobject,
          block.noOfSeq,
          block.sentenceId
        );
        db.addWorkobject(
          additionalId,
          labels.workobjectLabels.get(continuation.workobject),
          continuation.workobject
        );
        registerWorkobjectNodeId(continuation.workobject, additionalId);
        const additionalGroup = continuation.group ?? defaultWorkobjectGroup;
        if (additionalGroup) {
          db.setWorkobjectGroup(additionalId, additionalGroup);
        }
        db.addEdge(
          latestWorkobjectId,
          additionalId,
          stripQuotes(continuation.activity),
          undefined,
          sentenceRef
        );
        latestWorkobjectId = additionalId;
        break;
      }
      case 'ReverseActor': {
        db.addActor(continuation.actor, labels.actorLabels.get(continuation.actor));
        // Reverse arrows inherit the sentence seqNo only when no AdditionalWorkObject
        // has advanced the latest pointer — i.e., they still anchor to the sentence's
        // main workobject. AdditionalActor never advances the pointer, so subsequent
        // reverses after an AdditionalActor still inherit the seqNo.
        db.addEdge(
          continuation.actor,
          latestWorkobjectId,
          stripQuotes(continuation.activity),
          latestWorkobjectId === workobjectId ? block.noOfSeq : undefined,
          sentenceRef
        );
        break;
      }
      case 'AdditionalActor': {
        db.addActor(continuation.actor, labels.actorLabels.get(continuation.actor));
        db.addEdge(
          latestWorkobjectId,
          continuation.actor,
          stripQuotes(continuation.activity),
          undefined,
          sentenceRef
        );
        break;
      }
      default: {
        const exhaustive: never = continuation;
        throw new Error(`[DomainStory] Unhandled continuation type: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  return {
    noOfSeq: block.noOfSeq,
    sentenceId: block.sentenceId,
    workobjectNodeIds,
  };
};

const populateDb = (ast: DomainStory, db: DomainstorytellingDB) => {
  // Populate common diagram metadata (title, accessibility fields).
  populateCommonDb(ast, db);
  log.debug(ast);

  // Process group definitions: declare named groups with optional title and parent
  const astAny = ast as unknown as {
    groupDefinitions?: { id: string; title?: string; parent?: string }[];
    groupBlocks?: {
      id: string;
      title?: string;
      parent?: string;
      sentences?: DomainStorySentenceLike[];
    }[];
    actorDeclarations?: { actor: string; label?: string; icon?: string; group?: string }[];
    workObjectDeclarations?: { workobject: string; label?: string; icon?: string }[];
    annotations?: AnnotationLike[];
  };

  const processedSentences: ProcessedSentenceRef[] = [];

  const labels: DeclaredLabels = {
    actorLabels: new Map<string, string>(),
    workobjectLabels: new Map<string, string>(),
  };

  const setDeclaredLabel = (target: Map<string, string>, id: string, rawLabel?: string) => {
    const normalized = rawLabel ? stripQuotes(rawLabel) : undefined;
    if (!normalized) {
      return;
    }

    const existing = target.get(id);
    if (existing && existing !== normalized) {
      log.warn(
        `[DomainStory] Conflicting declaration label for '${id}'. Keeping '${existing}' and ignoring '${normalized}'.`
      );
      return;
    }

    target.set(id, normalized);
  };
  if (astAny.groupDefinitions) {
    astAny.groupDefinitions.forEach((fd) => {
      db.addGroup(fd.id, fd.title ? stripQuotes(fd.title) : undefined, fd.parent);
    });
  }

  // Process actor declarations: optional icon and/or group membership
  if (astAny.actorDeclarations) {
    astAny.actorDeclarations.forEach((ad) => {
      setDeclaredLabel(labels.actorLabels, ad.actor, ad.label);
      if (ad.icon) {
        db.addIconDefinition(ad.actor, ad.icon);
      }
      if (ad.group) {
        db.setActorGroup(ad.actor, ad.group);
      }
    });
  }

  // Process workobject declarations: labels are declared here, sentence usage remains ID-only.
  if (astAny.workObjectDeclarations) {
    astAny.workObjectDeclarations.forEach((wd) => {
      setDeclaredLabel(labels.workobjectLabels, wd.workobject, wd.label);
      if (wd.icon) {
        db.addIconDefinition(wd.workobject, wd.icon);
      }
    });
  }

  // Process group blocks after declarations so sentence rendering can pick up declared labels.
  if (astAny.groupBlocks) {
    astAny.groupBlocks.forEach((groupBlock) => {
      db.addGroup(
        groupBlock.id,
        groupBlock.title ? stripQuotes(groupBlock.title) : undefined,
        groupBlock.parent
      );

      for (const sentence of groupBlock.sentences ?? []) {
        processedSentences.push(processSentence(sentence, db, labels, groupBlock.id));
      }
    });
  }

  if (ast.sentences) {
    ast.sentences.forEach((block) => processedSentences.push(processSentence(block, db, labels)));
  }

  const resolveSentenceRef = ({
    noOfSeq,
    sentenceId,
  }: {
    noOfSeq?: number;
    sentenceId?: string;
  }) => {
    if (sentenceId) {
      const byId = processedSentences.filter((ref) => ref.sentenceId === sentenceId);
      if (byId.length === 0) {
        throw new Error(
          `[DomainStory] Unknown sentence reference '${sentenceId}'. Add a matching 'id ${sentenceId}' to the target sentence.`
        );
      }
      if (byId.length > 1) {
        throw new Error(
          `[DomainStory] Duplicate sentence ID '${sentenceId}'. Sentence IDs must be unique.`
        );
      }
      return byId[0];
    }

    if (noOfSeq === undefined) {
      throw new Error(
        '[DomainStory] Missing sentence reference. Provide a seqNo or a sentence ID.'
      );
    }

    const bySeqNo = processedSentences.filter((ref) => ref.noOfSeq === noOfSeq);
    if (bySeqNo.length === 0) {
      throw new Error(`[DomainStory] Unknown sentence sequence number '${noOfSeq}'.`);
    }
    if (bySeqNo.length > 1) {
      throw new Error(
        `[DomainStory] Ambiguous sentence sequence number '${noOfSeq}'. Use explicit sentence IDs and annotate by 'S_...'.`
      );
    }
    return bySeqNo[0];
  };

  if (astAny.annotations) {
    astAny.annotations.forEach((annotation) => {
      const body = stripQuotes(annotation.body).trim();

      if (annotation.actor) {
        if (!db.hasActor(annotation.actor)) {
          throw new Error(`[DomainStory] Unknown actor '${annotation.actor}' in annotation.`);
        }
        db.setActorComment(annotation.actor, body);
        return;
      }

      if (annotation.group) {
        if (!db.hasGroup(annotation.group)) {
          throw new Error(`[DomainStory] Unknown group '${annotation.group}' in annotation.`);
        }
        db.setGroupComment(annotation.group, body);
        return;
      }

      if (annotation.workobject) {
        const sentenceRef = resolveSentenceRef({
          noOfSeq: annotation.workobjectSeqNo,
          sentenceId: annotation.workobjectSentenceId,
        });
        const nodeIds = sentenceRef.workobjectNodeIds.get(annotation.workobject);
        if (!nodeIds || nodeIds.length === 0) {
          throw new Error(
            `[DomainStory] Unknown workobject '${annotation.workobject}' for the selected sentence reference in annotation.`
          );
        }
        if (nodeIds.length > 1) {
          throw new Error(
            `[DomainStory] Ambiguous workobject '${annotation.workobject}' in sentence. Ensure it appears once for this sentence before annotating.`
          );
        }
        db.setWorkobjectComment(nodeIds[0], body);
        return;
      }

      const sentenceRef = resolveSentenceRef({
        noOfSeq: annotation.noOfSeq,
        sentenceId: annotation.sentenceId,
      });
      db.setSentenceComment(buildSentenceRef(sentenceRef), body);
    });
  }

  // Prune only after all declarations/blocks/sentences are processed so order stays flexible.
  db.pruneUnknownGroupReferences();
};

export const parser: ParserDefinition = {
  parser: {
    // yy is set externally to a DomainStoryDb instance before parse() runs.
    yy: undefined as unknown as DiagramDB,
  },
  parse: async (input: string): Promise<void> => {
    const ast: DomainStory = await parse('domainstorytelling', input);
    log.debug(ast);
    const db = parser.parser?.yy;
    if (!(db instanceof DomainStoryDb)) {
      throw new Error(
        'parser.parser?.yy was not a DomainStoryDb. This is due to a bug within Mermaid, please report this issue at https://github.com/mermaid-js/mermaid/issues.'
      );
    }
    populateDb(ast, db);
  },
};
