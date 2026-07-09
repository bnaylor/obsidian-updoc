import { UpdocSettings } from './types';

export const DEFAULT_SETTINGS: UpdocSettings = {
  clientId: '',
  clientSecret: '',
  tokens: null,
  calendarId: 'primary',
  meetingFolderPattern: 'Meetings/{{year}}/{{month}}/{{day}}',
  filenamePattern: '{{HHmm}} {{title}}',
  sidebarPosition: 'right',
  filterRules: [],
  templateRules: [],
};
