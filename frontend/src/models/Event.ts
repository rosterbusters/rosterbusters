export interface Event {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: any;
}