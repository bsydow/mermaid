import { select } from 'd3';
import type { BaseType, Selection } from 'd3';
import type { Diagram } from '../../Diagram.js';
import type { DiagramRenderer, DrawDefinition, SVG } from '../../diagram-api/types.js';
import { getConfig, sanitizeText } from '../../diagram-api/diagramAPI.js';
import utils from '../../utils.js';
import { render, getRegisteredLayoutAlgorithm } from '../../rendering-util/render.js';
import type {
  LayoutData,
  Node as LayoutNode,
  Edge as LayoutEdge,
} from '../../rendering-util/types.js';
import { log } from '../../logger.js';
import { setupViewPortForSVG } from '../../rendering-util/setupViewPortForSVG.js';
import { selectSvgElement } from '../../rendering-util/selectSvgElement.js';
import type { DomainStoryDb } from './domainstorytellingDb.js';

interface AnnotationRenderInfo {
  id: string;
  targetId: string;
  text: string;
  kind: 'actor' | 'workobject' | 'group' | 'sentence';
  sentenceRef?: string;
}

interface Point {
  x: number;
  y: number;
}

const NODE_SIZE = { width: 80, height: 80, padding: 5 } as const;
const ANNOTATION_SIZE = { width: 160, height: 70, padding: 6 } as const;
const GROUP_PADDING = 20;
const SEQUENCE_CIRCLE_RADIUS = 12;
// Neutral Font Awesome defaults applied when a node has no icon declaration.
// Keeps every actor and workobject visually consistent (icon + label) instead
// of dropping back to a bare text node.
const DEFAULT_ACTOR_ICON = 'fa:fa-user';
const DEFAULT_WORKOBJECT_ICON = 'fa:fa-file';
// Fraction along the edge polyline where the sequence-number circle is placed
// (15 % from the source end keeps it near the originating actor).
const SEQUENCE_NUMBER_RATIO = 0.15;
// Extra room on top of the layout padding so edge labels don't get clipped at the viewBox edge.
const VIEWPORT_EXTRA_PADDING = 6;

const getDomainstorytellingLayoutConfig = () => {
  const config = getConfig();
  const domainstorytelling = config.domainstorytelling;

  return {
    nodeSpacing: domainstorytelling?.nodeSpacing ?? 70,
    rankSpacing: domainstorytelling?.rankSpacing ?? 130,
    ranker: domainstorytelling?.ranker ?? 'network-simplex',
    rankdir: domainstorytelling?.rankdir ?? 'LR',
    acyclicer: domainstorytelling?.acyclicer,
    diagramPadding: domainstorytelling?.diagramPadding,
  };
};

// Build a short annotation node ID (no diagram-ID prefix — the render pipeline adds it).
const annotationNodeId = (prefix: string, reference: string) =>
  `ANNO_${prefix}_${reference.replace(/[^\w-]/g, '_')}`;

/**
 * Read a node's laid-out position from the position map populated after render.
 * Returns undefined if the node is missing or hasn't been positioned yet.
 */
const getNodePosition = (
  positions: Map<string, Point | undefined>,
  nodeId: string
): Point | undefined => positions.get(nodeId);

/**
 * Resolve the actual SVG <path> for a rendered edge container. dagre
 * sometimes hands back the path element directly, sometimes a wrapper <g>.
 * The SVGPathElement-undefined branch keeps the check safe in jsdom.
 */
const resolveEdgePath = (edgeElement: Element | null): SVGPathElement | null => {
  if (!edgeElement) {
    return null;
  }
  if (typeof SVGPathElement !== 'undefined' && edgeElement instanceof SVGPathElement) {
    return edgeElement;
  }
  return edgeElement.querySelector<SVGPathElement>('path');
};

/**
 * Convert Font Awesome icon syntax to HTML for icon-only display
 */
const renderIconOnly = (icon: string | undefined): string => {
  if (!icon) {
    return '';
  }

  // Convert fa:fa-icon-name to HTML with larger size
  const iconHtml = icon.replace(
    /fa:fa-[\w-]+/g,
    (s) => `<i class='${s.replace(':', ' ')} fa-3x'></i>`
  );

  return iconHtml;
};

/**
 * Create HTML structure with icon on top and label below. Callers fall back to
 * DEFAULT_ACTOR_ICON / DEFAULT_WORKOBJECT_ICON when the node has no explicit
 * icon declaration, so this function always renders the full wrapper.
 */
const renderIconWithLabel = (icon: string, labelText: string): string => {
  const iconHtml = renderIconOnly(icon);
  return `<div class="domainstorytelling-node"><div class="domainstorytelling-icon">${iconHtml}</div><div class="domainstorytelling-label">${labelText}</div></div>`;
};

const renderAnnotationLabel = (text: string): string => {
  return `<div class="domainstorytelling-annotation-content domainstorytelling-annotation-side-right">${text}</div>`;
};

const getSequencePointByRef = (
  element: Selection<BaseType, unknown, HTMLElement, unknown>,
  sentenceRef: string
): Point | undefined => {
  const sequenceGroup = element.select(
    `.sequence-number-group[data-sentence-ref="${sentenceRef}"]`
  );
  if (sequenceGroup.empty()) {
    return undefined;
  }
  const transform = sequenceGroup.attr('transform');
  if (!transform) {
    return undefined;
  }
  const match = /translate\(([\d.-]+),\s*([\d.-]+)\)/.exec(transform);
  if (!match) {
    return undefined;
  }
  return { x: Number(match[1]), y: Number(match[2]) };
};

const collectAnnotations = (db: DomainStoryDb): AnnotationRenderInfo[] => {
  const annotations: AnnotationRenderInfo[] = [];

  db.actorComments.forEach((comment, actorId) => {
    if (!comment) {
      return;
    }
    annotations.push({
      id: annotationNodeId('actor', actorId),
      targetId: actorId,
      text: comment,
      kind: 'actor',
    });
  });

  db.workobjectComments.forEach((comment, workobjectId) => {
    if (!comment) {
      return;
    }
    annotations.push({
      id: annotationNodeId('workobject', workobjectId),
      targetId: workobjectId,
      text: comment,
      kind: 'workobject',
    });
  });

  db.groupComments.forEach((comment, groupId) => {
    if (!comment) {
      return;
    }
    annotations.push({
      id: annotationNodeId('group', groupId),
      targetId: groupId,
      text: comment,
      kind: 'group',
    });
  });

  db.sentenceComments.forEach((comment, sentenceRef) => {
    if (!comment) {
      return;
    }
    const targetId = db.getSentenceTarget(sentenceRef);
    if (!targetId) {
      return;
    }
    annotations.push({
      id: annotationNodeId('sentence', sentenceRef),
      targetId,
      text: comment,
      kind: 'sentence',
      sentenceRef,
    });
  });

  return annotations;
};

/**
 * Add group nodes and parent relationships to the nodes array.
 * Called after addVertices so that actor nodes already exist.
 */
const addGroups = function (
  nodes: LayoutNode[],
  db: DomainStoryDb,
  annotations: AnnotationRenderInfo[]
) {
  const groups = db.getGroups();
  if (groups.length === 0) {
    return;
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Create a cluster node for each group
  groups.forEach((group) => {
    nodes.push({
      id: group.id,
      label: sanitizeText(group.title ?? ''),
      shape: 'rect',
      isGroup: true,
      cssClasses: 'domainstorytelling-group',
      rx: 4,
      ry: 4,
      padding: GROUP_PADDING,
    } as LayoutNode);
    nodeById.set(group.id, nodes[nodes.length - 1]);
  });

  // Nest group nodes inside their parent groups
  groups.forEach((group) => {
    if (group.parentId) {
      const groupNode = nodeById.get(group.id);
      if (groupNode) {
        groupNode.parentId = group.parentId;
      }
    }
  });

  // Build lookup: node short ID → group short ID
  const nodeToGroup = new Map<string, string | undefined>();

  // Assign actors to their groups
  db.actors.forEach((actor) => {
    if (actor.group) {
      const actorNode = nodeById.get(actor.id);
      if (actorNode) {
        actorNode.parentId = actor.group;
      }
      nodeToGroup.set(actor.id, actor.group);
    }
  });

  // Assign workobjects to their groups
  db.workobjects.forEach((workobject) => {
    if (workobject.group) {
      const workobjectNode = nodeById.get(workobject.id);
      if (workobjectNode) {
        workobjectNode.parentId = workobject.group;
      }
      nodeToGroup.set(workobject.id, workobject.group);
    }
  });

  // Keep non-group annotations inside the same group cluster as their target node.
  annotations.forEach((annotation) => {
    if (annotation.kind === 'group') {
      return;
    }

    const groupId = nodeToGroup.get(annotation.targetId);
    if (
      groupId &&
      nodeById.has(annotation.id) &&
      nodeById.has(annotation.targetId) &&
      nodeById.has(groupId)
    ) {
      const annotationNode = nodeById.get(annotation.id);
      if (annotationNode) {
        annotationNode.parentId = groupId;
      }
    }
  });
};

/**
 * Function that adds the vertices found during parsing to the nodes array.
 */
const addVertices = function (
  nodes: LayoutNode[],
  db: DomainStoryDb,
  annotations: AnnotationRenderInfo[]
) {
  // HTML labels are styled entirely via CSS; labelStyle is only for the SVG
  // <text> fallback. Do NOT include fill here — styles2String routes fill to
  // nodeStyles (not labelStyles), which makes it land as an inline style on the
  // shape's <rect> and overpowers any CSS transparency rules.
  const nodeLabelStyle = `font-size:14px;text-align:center;`;
  const annotationLabelStyle = `font-size:12px;text-align:left;`;

  // Add actors (icon and label)
  db.actors.forEach((actor) => {
    const safeLabel = sanitizeText(actor.label || actor.id);
    const labelWithIcon = renderIconWithLabel(actor.icon ?? DEFAULT_ACTOR_ICON, safeLabel);

    nodes.push({
      id: actor.id,
      label: labelWithIcon,
      useHtmlLabels: true,
      labelStyle: nodeLabelStyle,
      shape: 'rect',
      isGroup: false,
      cssClasses: 'actor domainstorytelling-node-container',
      width: NODE_SIZE.width,
      height: NODE_SIZE.height,
      padding: NODE_SIZE.padding,
    } as LayoutNode);
  });

  // Add workobjects (icon and label)
  db.workobjects.forEach((workobject) => {
    const safeLabel = sanitizeText(workobject.label || workobject.id);
    const labelWithIcon = renderIconWithLabel(
      workobject.icon ?? DEFAULT_WORKOBJECT_ICON,
      safeLabel
    );

    nodes.push({
      id: workobject.id,
      label: labelWithIcon,
      useHtmlLabels: true,
      labelStyle: nodeLabelStyle,
      shape: 'rect',
      isGroup: false,
      cssClasses: 'workobject domainstorytelling-node-container',
      width: NODE_SIZE.width,
      height: NODE_SIZE.height,
      padding: NODE_SIZE.padding,
    } as LayoutNode);
  });

  annotations.forEach((annotation) => {
    const safeText = sanitizeText(annotation.text);

    nodes.push({
      id: annotation.id,
      label: renderAnnotationLabel(safeText),
      useHtmlLabels: true,
      labelStyle: annotationLabelStyle,
      shape: 'rect',
      isGroup: false,
      cssClasses: 'domainstorytelling-annotation-node',
      width: ANNOTATION_SIZE.width,
      height: ANNOTATION_SIZE.height,
      padding: ANNOTATION_SIZE.padding,
    } as LayoutNode);
  });
};

/**
 * Add edges to the edges array based on parsed graph definition
 */
const addEdges = function (
  edges: LayoutEdge[],
  db: DomainStoryDb,
  annotations: AnnotationRenderInfo[]
) {
  let cnt = 0;
  const nodeToGroup = new Map<string, string | undefined>();

  db.actors.forEach((actor) => {
    nodeToGroup.set(actor.id, actor.group);
  });
  db.workobjects.forEach((workobject) => {
    nodeToGroup.set(workobject.id, workobject.group);
  });

  db.edges.forEach((edge) => {
    cnt++;
    const fromGroup = nodeToGroup.get(edge.from);
    const toGroup = nodeToGroup.get(edge.to);
    const isCrossGroup = Boolean(fromGroup && toGroup && fromGroup !== toGroup);

    // Extra dagre-specific properties (weight, minlen, noOfSeq, sentenceRef) pass through
    // prepareLayoutForDagre via object spread — dagre reads weight/minlen from edge labels.
    const edgeExtras = {
      weight: edge.noOfSeq ? (isCrossGroup ? 2 : 4) : isCrossGroup ? 1 : 2,
      minlen: isCrossGroup ? 2 : 1,
      noOfSeq: edge.noOfSeq,
      sentenceRef: edge.sentenceRef,
    };

    edges.push({
      id: `L-${edge.from}-${edge.to}-${cnt}`,
      start: edge.from,
      end: edge.to,
      arrowhead: 'normal',
      arrowTypeStart: 'arrow_open',
      arrowTypeEnd: 'arrow_point',
      arrowheadStyle: 'fill: #333',
      label: edge.label,
      labelpos: 'c',
      thickness: 'normal',
      pattern: 'solid',
      classes: 'domainstorytelling-link',
      ...edgeExtras,
    } as LayoutEdge);
  });

  let annotationEdgeCount = cnt;
  annotations.forEach((annotation) => {
    annotationEdgeCount++;
    edges.push({
      id: `L-${annotation.id}-${annotation.targetId}-${annotationEdgeCount}`,
      start: annotation.id,
      end: annotation.targetId,
      arrowhead: 'none',
      arrowTypeStart: 'none',
      arrowTypeEnd: 'none',
      arrowheadStyle: '',
      thickness: 'normal',
      pattern: 'dashed',
      classes: 'domainstorytelling-annotation-link',
      ...{ weight: 0, minlen: 1 },
    } as LayoutEdge);
  });
};

const applyAnnotationBracketOrientation = function (
  positions: Map<string, Point | undefined>,
  element: Selection<BaseType, unknown, HTMLElement, unknown>,
  diagramId: string,
  annotations: AnnotationRenderInfo[]
) {
  annotations.forEach((annotation) => {
    const annotationPosition = getNodePosition(positions, annotation.id);
    if (!annotationPosition) {
      return;
    }

    const sequencePoint =
      annotation.kind === 'sentence' && annotation.sentenceRef
        ? getSequencePointByRef(element, annotation.sentenceRef)
        : undefined;
    const targetPosition = sequencePoint ?? getNodePosition(positions, annotation.targetId);
    if (!targetPosition) {
      return;
    }

    const dx = targetPosition.x - annotationPosition.x;
    const dy = targetPosition.y - annotationPosition.y;
    const side =
      Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top';

    // domId = diagramId + '-' + annotation.id (prefixed by the render pipeline)
    const annotationLabel = element.select(
      `#${diagramId}-${annotation.id} .domainstorytelling-annotation-content`
    );
    if (annotationLabel.empty()) {
      return;
    }

    annotationLabel
      .classed('domainstorytelling-annotation-side-right', false)
      .classed('domainstorytelling-annotation-side-left', false)
      .classed('domainstorytelling-annotation-side-top', false)
      .classed('domainstorytelling-annotation-side-bottom', false)
      .classed(`domainstorytelling-annotation-side-${side}`, true);
  });
};

const routeSentenceAnnotationLinksToSequenceNumbers = function (
  positions: Map<string, Point | undefined>,
  element: Selection<BaseType, unknown, HTMLElement, unknown>,
  diagramId: string,
  annotations: AnnotationRenderInfo[]
) {
  annotations
    .filter((annotation) => annotation.kind === 'sentence' && annotation.sentenceRef)
    .forEach((annotation) => {
      if (!annotation.sentenceRef) {
        return;
      }
      const annotationPosition = getNodePosition(positions, annotation.id);
      if (!annotationPosition) {
        return;
      }
      const targetPoint = getSequencePointByRef(element, annotation.sentenceRef);
      if (!targetPoint) {
        return;
      }

      // Edge SVG element ID = diagramId + '-' + edge.id (set by insertEdge in edges.js)
      const edgeContainer = element.select(
        `[id^="${diagramId}-L-${annotation.id}-${annotation.targetId}-"]`
      );
      if (edgeContainer.empty()) {
        return;
      }

      const edgePathElement = resolveEdgePath(edgeContainer.node() as Element | null);
      if (!edgePathElement) {
        return;
      }

      select(edgePathElement).attr(
        'd',
        `M ${annotationPosition.x},${annotationPosition.y} L ${targetPoint.x},${targetPoint.y}`
      );
    });
};

/**
 * After sequence-number circles exist in the DOM, redirect sentence-annotation
 * links to those circles and re-apply bracket orientation. Re-routing changes
 * which targets the orientation step needs to consider, so the two operations
 * are intentionally bundled — call sites should treat them as one step.
 */
const routeSentenceAnnotationsAndReorient = (
  positions: Map<string, Point | undefined>,
  element: Selection<BaseType, unknown, HTMLElement, unknown>,
  diagramId: string,
  annotations: AnnotationRenderInfo[]
) => {
  routeSentenceAnnotationLinksToSequenceNumbers(positions, element, diagramId, annotations);
  applyAnnotationBracketOrientation(positions, element, diagramId, annotations);
};

const pointAtRatioOnPolyline = (points: Point[], ratio: number): Point | undefined => {
  if (points.length === 0) {
    return undefined;
  }
  if (points.length === 1) {
    return points[0];
  }

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const length = Math.hypot(dx, dy);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength === 0) {
    return points[0];
  }

  const targetLength = totalLength * ratio;
  let traversed = 0;

  for (const [i, segmentLength] of segmentLengths.entries()) {
    if (traversed + segmentLength >= targetLength) {
      const localRatio = (targetLength - traversed) / segmentLength;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * localRatio,
        y: points[i].y + (points[i + 1].y - points[i].y) * localRatio,
      };
    }
    traversed += segmentLength;
  }

  return points[points.length - 1];
};

/**
 * Add sequence number circles to edges
 */
const addSequenceNumberCircles = function (
  layoutEdges: LayoutEdge[],
  element: Selection<BaseType, unknown, HTMLElement, unknown>,
  diagramId: string,
  db: DomainStoryDb
) {
  let edgeIndex = 0;
  db.edges.forEach((edge) => {
    edgeIndex++;

    if (!edge.noOfSeq) {
      return;
    }

    // Edge SVG element ID = diagramId + '-' + edge.id (set by insertEdge in edges.js)
    const resolvedEdgeId = `${diagramId}-L-${edge.from}-${edge.to}-${edgeIndex}`;
    const edgeNode =
      (element.select(`#${resolvedEdgeId}`).node() as Element | null) ??
      (element.select(`[id^="${resolvedEdgeId}-"]`).node() as Element | null) ??
      (element.select(`[id^="${diagramId}-L-${edge.from}-${edge.to}-"]`).node() as Element | null);

    const pathElement = resolveEdgePath(edgeNode);

    const pointFromPath =
      pathElement?.getTotalLength && pathElement.getPointAtLength
        ? pathElement.getPointAtLength(pathElement.getTotalLength() * SEQUENCE_NUMBER_RATIO)
        : undefined;

    // Find the edge in the layout data to get polyline points
    const edgeId = `L-${edge.from}-${edge.to}-${edgeIndex}`;
    const layoutEdge = layoutEdges.find((e) => e.id === edgeId);
    const pointFromLayout = layoutEdge?.points
      ? pointAtRatioOnPolyline(layoutEdge.points as Point[], SEQUENCE_NUMBER_RATIO)
      : undefined;

    const point = pointFromPath ?? pointFromLayout;
    if (!point) {
      return;
    }

    // Place circle in the same SVG coordinate context as the edge path.
    const overlayContainer = pathElement?.parentElement
      ? select(pathElement.parentElement)
      : element;

    // Create group for circle and text
    const circleGroup = (overlayContainer as Selection<BaseType, unknown, BaseType, unknown>)
      .append('g')
      .attr('class', 'sequence-number-group')
      .attr('transform', `translate(${point.x}, ${point.y})`);

    if (edge.sentenceRef) {
      circleGroup.attr('data-sentence-ref', edge.sentenceRef);
    }

    // Add circle
    circleGroup
      .append('circle')
      .attr('r', SEQUENCE_CIRCLE_RADIUS)
      .attr('class', 'sequence-number-circle');

    // Add text
    circleGroup.append('text').attr('class', 'sequence-number-text').text(edge.noOfSeq.toString());
  });
};

const draw: DrawDefinition = async (_text, id, _version, diagObj: Diagram) => {
  log.info('Drawing domainstorytelling');

  const db = diagObj.db as DomainStoryDb;
  const layoutConfig = getDomainstorytellingLayoutConfig();
  const config = getConfig();

  // Collect annotations once so downstream helpers don't re-walk the db.
  const annotations = collectAnnotations(db);

  // Build LayoutData (nodes and edges arrays) instead of a graphlib.Graph.
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  addVertices(nodes, db, annotations);
  addGroups(nodes, db, annotations);
  addEdges(edges, db, annotations);

  const data4Layout: LayoutData = {
    nodes,
    edges,
    config,
    // Honor the global `layout` config (e.g. `layout: elk`) like flowchart/class/state do.
    // Falls back to dagre when the requested algorithm (e.g. ELK) isn't registered.
    layoutAlgorithm: getRegisteredLayoutAlgorithm(config.layout),
    direction: layoutConfig.rankdir,
    nodeSpacing: layoutConfig.nodeSpacing,
    rankSpacing: layoutConfig.rankSpacing,
    markers: ['point', 'circle', 'cross'],
    diagramId: id,
    type: 'domainstorytelling',
  };

  const svg: SVG = selectSvgElement(id);

  // Run the renderer — this lays out the graph and draws all nodes, edges, and markers.
  await render(data4Layout, svg);

  // Build a node position lookup from the layout results (positions populated by render).
  const positions = new Map<string, Point | undefined>(
    data4Layout.nodes.map((n) => [
      n.id,
      n.x !== undefined && n.y !== undefined ? { x: n.x, y: n.y } : undefined,
    ])
  );

  // For DOM queries we need a D3 selection of the SVG container.
  const element = svg as unknown as Selection<BaseType, unknown, HTMLElement, unknown>;

  applyAnnotationBracketOrientation(positions, element, id, annotations);

  // Add sequence number circles after rendering
  addSequenceNumberCircles(data4Layout.edges, element, id, db);

  // Re-route sentence annotations to the seq-number circles and re-orient
  // the brackets together — the latter depends on the former.
  routeSentenceAnnotationsAndReorient(positions, element, id, annotations);

  utils.insertTitle(svg, 'domainstorytellingTitleText', 20, diagObj.db.getDiagramTitle?.() ?? '');

  // Use minimal padding to fit viewBox correctly
  const padding = (layoutConfig.diagramPadding ?? 8) + VIEWPORT_EXTRA_PADDING;
  setupViewPortForSVG(svg, padding, 'domainstorytellingClass', true);
};

export const renderer: DiagramRenderer = { draw };
