export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  scopes: string[];
}

export interface SyncMeta {
  lastSyncedRevision: string;
  lastSyncedLocalContent: string;
}

export interface TemplateRule {
  id: string;
  name: string;
  matchType: 'title' | 'email' | 'count';
  pattern: string;
  templateContent: string;
  cssClass?: string;
}

export interface Attendee {
  email: string;
  displayName?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  description?: string;
  attendees: Attendee[];
}

export interface UpdocSettings {
  clientId: string;
  clientSecret: string;
  tokens: TokenData | null;
  calendarId: string;
  meetingFolderPattern: string;
  filenamePattern: string;
  sidebarPosition: 'left' | 'right';
  filterRules: string[];
  templateRules: TemplateRule[];
  syncEnabled: boolean;
  syncMeta: Record<string, SyncMeta>;
}

// ── GDocs API types ──────────────────────────────────────────────────────────

export interface GDocsDocument {
  documentId: string;
  revisionId?: string;
  title: string;
  body: GDocsBody;
  inlineObjects?: Record<string, GDocsInlineObject>;
  lists?: Record<string, GDocsList>;
}

export interface GDocsBody {
  content: GDocsStructuralElement[];
}

export interface GDocsStructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: GDocsParagraph;
}

export interface GDocsParagraph {
  elements: GDocsParagraphElement[];
  bullet?: GDocsBullet;
  paragraphStyle?: GDocsParagraphStyle;
}

export interface GDocsBullet {
  listId?: string;
  nestingLevel?: number;
  textStyle?: GDocsTextStyle;
}

export interface GDocsParagraphStyle {
  namedStyleType?: string;
}

export interface GDocsParagraphElement {
  startIndex?: number;
  endIndex?: number;
  textRun?: GDocsTextRun;
  inlineObjectElement?: GDocsInlineObjectElement;
}

export interface GDocsTextRun {
  content?: string;
  textStyle?: GDocsTextStyle;
}

export interface GDocsTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  weightedFontFamily?: GDocsWeightedFontFamily;
  link?: GDocsLink;
}

export interface GDocsWeightedFontFamily {
  fontFamily: string;
  weight?: number;
}

export interface GDocsLink {
  url?: string;
}

export interface GDocsInlineObjectElement {
  inlineObjectId: string;
}

export interface GDocsInlineObject {
  objectId: string;
  inlineObjectProperties: GDocsInlineObjectProperties;
}

export interface GDocsInlineObjectProperties {
  embeddedObject: GDocsEmbeddedObject;
}

export interface GDocsEmbeddedObject {
  title?: string;
  description?: string;
  imageProperties?: { contentUri?: string };
}

export interface GDocsList {
  listProperties?: GDocsListProperties;
}

export interface GDocsListProperties {
  nestingLevels?: GDocsNestingLevel[];
}

export interface GDocsNestingLevel {
  glyphFormat?: string;
  glyphType?: string;
}

export interface GDocsWriteControl {
  requiredRevisionId?: string;
}

export interface GDocsBatchUpdateRequest {
  requests: GDocsRequest[];
  writeControl?: GDocsWriteControl;
}

export interface GDocsBatchUpdateResponse {
  replies: GDocsReply[];
}

export interface GDocsReply {
  insertInlineImage?: { objectId: string };
}

export interface GDocsRequest {
  insertText?: { text: string; location: { index: number } };
  deleteContentRange?: { range: GDocsRange };
  updateParagraphStyle?: {
    range: GDocsRange;
    paragraphStyle: GDocsParagraphStyle;
    fields: string;
  };
  createParagraphBullets?: { range: GDocsRange; bulletPreset: string };
  updateTextStyle?: {
    range: GDocsRange;
    textStyle: GDocsTextStyle;
    fields: string;
  };
}

export interface GDocsRange {
  startIndex: number;
  endIndex: number;
}
