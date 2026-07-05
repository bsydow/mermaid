import type { DiagramStylesProvider } from '../../diagram-api/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getStyles = (options: any) => `
  /* Remove default shapes and borders. Scoped to domainstorytelling nodes so
     sequence/state diagrams that also use .actor stay unaffected. */
  .domainstorytelling-node-container.actor, .domainstorytelling-node-container.workobject {
    fill: transparent !important;
    stroke: none !important;
    stroke-width: 0 !important;
  }
  
  /* Domain Storytelling node container styling */
  .domainstorytelling-node-container {
    background: transparent;
  }
  
  /* Icon and label structure */
  .domainstorytelling-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    height: 100%;
    width: 100%;
  }
  
  .domainstorytelling-icon {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 8px;
  }
  
  .domainstorytelling-icon i {
    font-size: 2.5em !important; /* Large icons */
    color: ${options.primaryTextColor ?? '#333'};
    display: block;
  }
  
  .domainstorytelling-label {
    font-family: ${options.fontFamily ?? 'Arial, sans-serif'};
    font-size: ${options.fontSize ?? '14px'};
    font-weight: 500;
    color: ${options.primaryTextColor ?? '#333'};
    text-align: center;
    line-height: 1.2;
    max-width: 70px;
    white-space: normal;
    overflow-wrap: normal;
    word-break: keep-all;
    margin: 4px auto 0;
  }
  
  /* Different colors for actors vs workobjects. Override via the diagram
     header (themeVariables: { domainstorytellingActorColor: '#xxx', ... }). */
  .domainstorytelling-node-container.actor .domainstorytelling-icon i {
    color: ${options.domainstorytellingActorColor};
  }

  .domainstorytelling-node-container.workobject .domainstorytelling-icon i {
    color: ${options.domainstorytellingWorkobjectColor};
  }
  
  /* Fallback styling for nodes without icons */
  .domainstorytelling-node-container foreignObject {
    overflow: visible;
  }
  
  /* Sequence number circles. Stroke matches background so edges that cross
     under the circle get a clean "halo" gap. */
  .sequence-number-circle {
    fill: ${options.domainstorytellingSequenceColor};
    stroke: ${options.background ?? '#fff'};
    stroke-width: 2px;
  }
  
  .sequence-number-text {
    /* Pair with .sequence-number-circle (filled with primaryBorderColor):
       background gives us automatic contrast in both light and dark themes. */
    fill: ${options.background ?? '#fff'};
    font-weight: bold;
    text-anchor: middle;
    dominant-baseline: central;
    font-family: ${options.fontFamily ?? 'Arial, sans-serif'};
    font-size: 0.95em;
  }
  
  /* Edge styling */
  .domainstorytelling-link {
    stroke: ${options.lineColor ?? '#333'};
    stroke-width: 2px;
    fill: none;
  }

  .domainstorytelling-annotation-link {
    stroke: ${options.lineColor ?? '#666'};
    stroke-width: 1.5px;
    stroke-dasharray: 6 4;
    fill: none;
  }

  .domainstorytelling-annotation-content {
    position: relative;
    font-family: ${options.fontFamily ?? 'Arial, sans-serif'};
    font-size: 12px;
    line-height: 1.25;
    color: ${options.primaryTextColor ?? '#333'};
    background: ${options.mainBkg ?? '#fff'};
    padding: 8px 10px;
    min-width: 110px;
    max-width: 180px;
    white-space: normal;
    word-break: break-word;
  }

  .domainstorytelling-annotation-content::before,
  .domainstorytelling-annotation-content::after {
    content: '';
    position: absolute;
    background: ${options.lineColor ?? '#333'};
  }

  .domainstorytelling-annotation-side-right {
    border-right: 2px solid ${options.lineColor ?? '#333'};
  }

  .domainstorytelling-annotation-side-right::before,
  .domainstorytelling-annotation-side-right::after {
    right: 0;
    width: 12px;
    height: 2px;
  }

  .domainstorytelling-annotation-side-right::before {
    top: 0;
  }

  .domainstorytelling-annotation-side-right::after {
    bottom: 0;
  }

  .domainstorytelling-annotation-side-left {
    border-left: 2px solid ${options.lineColor ?? '#333'};
  }

  .domainstorytelling-annotation-side-left::before,
  .domainstorytelling-annotation-side-left::after {
    left: 0;
    width: 12px;
    height: 2px;
  }

  .domainstorytelling-annotation-side-left::before {
    top: 0;
  }

  .domainstorytelling-annotation-side-left::after {
    bottom: 0;
  }

  .domainstorytelling-annotation-side-top {
    border-top: 2px solid ${options.lineColor ?? '#333'};
  }

  .domainstorytelling-annotation-side-top::before,
  .domainstorytelling-annotation-side-top::after {
    top: 0;
    width: 2px;
    height: 12px;
  }

  .domainstorytelling-annotation-side-top::before {
    left: 0;
  }

  .domainstorytelling-annotation-side-top::after {
    right: 0;
  }

  .domainstorytelling-annotation-side-bottom {
    border-bottom: 2px solid ${options.lineColor ?? '#333'};
  }

  .domainstorytelling-annotation-side-bottom::before,
  .domainstorytelling-annotation-side-bottom::after {
    bottom: 0;
    width: 2px;
    height: 12px;
  }

  .domainstorytelling-annotation-side-bottom::before {
    left: 0;
  }

  .domainstorytelling-annotation-side-bottom::after {
    right: 0;
  }

  /* Edge label styling: target inner HTML label only, not the outer SVG <g>. */
  .edgeLabel .label rect {
    fill: ${options.background ?? '#fff'};
  }

  .edgeLabel .label span {
    display: inline-block;
    background-color: ${options.background ?? '#fff'};
    padding: 1px 4px;
    border-radius: 1px;
    font-size: 0.9em;
    font-family: ${options.fontFamily ?? 'Arial, sans-serif'};
    line-height: 1.1;
    white-space: nowrap;
    color: ${options.primaryTextColor ?? '#333'};
  }

  .edgeLabel .label p {
    margin: 0;
  }

  /* dagre-wrapper unconditionally emits an outer .edgeLabel wrapper for every
     edge, even when the label text is empty (e.g. annotation links). Hide
     wrappers whose inner span carries no content. */
  .edgeLabel:has(.edgeLabel:empty) {
    display: none;
  }

  /* Group (cluster) container */
  .cluster.domainstorytelling-group rect {
    rx: 4px;
    ry: 4px;
    fill: transparent;
    stroke: ${options.domainstorytellingGroupColor ?? options.clusterBorder ?? options.nodeBorder ?? '#555'};
    stroke-width: 2px;
  }

  /* Annotation node container: transparent so only the inner HTML bracket shows. */
  .domainstorytelling-annotation-node rect {
    fill: transparent;
    stroke: none;
  }

  /* Group title label */
  .cluster.domainstorytelling-group .cluster-label {
    font-family: ${options.fontFamily ?? 'Arial, sans-serif'};
    font-size: 13px;
    font-weight: bold;
    fill: ${options.primaryTextColor ?? '#333'};
  }
`;

const styles: DiagramStylesProvider = (options) => getStyles(options);

export default styles;
