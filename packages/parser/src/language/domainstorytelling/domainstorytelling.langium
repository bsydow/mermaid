grammar DomainStoryGrammar
import "../common/common";

entry DomainStory:
  NEWLINE*
  "domainstorytelling-beta"
  (
    NEWLINE* TitleAndAccessibilities
    DomainStoryElements*
    | NEWLINE+
    DomainStoryElements*
    | NEWLINE*
  )
;

fragment DomainStoryElements:
  groupBlocks+=GroupBlock
  | groupDefinitions+=GroupDefinition
  | actorDeclarations+=ActorDeclaration
  | workObjectDeclarations+=WorkObjectDeclaration
  | sentences+=DomainStorySentence
  | annotations+=Annotation
;

GroupBlock:
  'group' id=GROUP_ID title=ACTIVITY_LABEL? ('in' parent=GROUP_ID)? '{' EOL?
  (sentences+=DomainStorySentence)*
  '}' EOL
;

GroupDefinition:
  'group' id=GROUP_ID title=ACTIVITY_LABEL? ('in' parent=GROUP_ID)? EOL
;

ActorDeclaration:
  actor=ACTOR label=ACTIVITY_LABEL? icon=ICON_REF? ('in' group=GROUP_ID)? EOL
;

WorkObjectDeclaration:
  workobject=WORKOBJECT label=ACTIVITY_LABEL? icon=ICON_REF? EOL
;

DomainStorySentence:
  actor=ACTOR ':' noOfSeq=SEQNO '--' activity=ACTIVITY_LABEL '->' workobject=WORKOBJECT ('in' group=GROUP_ID)?
  (continuations+=AdditionalWorkObject | continuations+=AdditionalActor | continuations+=ReverseActor)*
  ('id' sentenceId=SENTENCE_ID)?
  EOL
;

Annotation:
  'annotate'
  ( 'actor' actor=ACTOR
  | 'group' group=GROUP_ID
  | 'sentence' (noOfSeq=SEQNO | sentenceId=SENTENCE_ID)
  | 'workobject' workobject=WORKOBJECT '@' (workobjectSeqNo=SEQNO | workobjectSentenceId=SENTENCE_ID)
  )
  body=ACTIVITY_LABEL
  EOL?
;

AdditionalWorkObject:
  '--' activity=ACTIVITY_LABEL '->' workobject=WORKOBJECT ('in' group=GROUP_ID)?
;

AdditionalActor:
  '--' activity=ACTIVITY_LABEL '->' actor=ACTOR
;

ReverseActor:
  '<-' activity=ACTIVITY_LABEL '--' actor=ACTOR
;

terminal SEQNO returns number: /0[1-9]|[1-9][0-9]+/;
terminal ACTIVITY_LABEL returns string: /"[^"]+"|'[^']+'/;
terminal ACTOR: /A_[a-zA-Z0-9]+/;
terminal WORKOBJECT: /W_[a-zA-Z0-9]+/;
terminal GROUP_ID: /G_[a-zA-Z0-9]+/;
terminal ICON_REF: /fa:fa-[a-zA-Z0-9\-]+/;
terminal SENTENCE_ID: /S_[a-zA-Z0-9_]+/;

/*
domainstorytelling-beta

A_A : 01 -- "works on" -> W_W
A_A : 02 -- "works on" -> W_W -- "using" -> W_V
A_A : 03 -- "hands over" -> W_W -- "to" -> A_B
A_A : 04 -- "hands over" -> W_W -- "to" -> A_B -- "and" -> A_C
A_A : 05 -- "collaborates on" -> W_W <- "collaborates on" -- A_B

group G_Frontend "Frontend"
group G_Backend "Backend" in G_Frontend
A_A fa:fa-user in G_Frontend
A_B fa:fa-cog in G_Backend
A_C in G_Frontend
*/