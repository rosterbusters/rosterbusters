import { Navigate, Calendar, momentLocalizer, View, ToolbarProps } from "react-big-calendar";
import moment from "moment";
import { useState, useCallback, useMemo, ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import CustomMonthView from "./CustomLeaveView";
import { Box, Grid, HStack, Span } from "@chakra-ui/react";
import cx from "clsx";
import { LeaveRequestsService, ShiftRequestsService } from "@/client";

const localizer = momentLocalizer(moment);

const MONTHS = moment.months();

const selectStyle: React.CSSProperties = {
  color: "#373a3c",
  background: "none",
  border: "1px solid #ccc",
  padding: "0.375em 0.6em",
  borderRadius: "4px",
  lineHeight: "normal",
  cursor: "pointer",
  fontSize: "inherit",
};

const LeaveToolbar: ComponentType<ToolbarProps> = ({ date, localizer, onNavigate }) => {
  const currentMonth = moment(date).month();
  const currentYear = moment(date).year();
  const thisYear = moment().year();
  const years = Array.from({ length: 4 }, (_, i) => thisYear - 2 + i);

  return (
    <Grid
      templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
      className={cx("rbc-toolbar")}
      gap={{ base: "2", md: "0" }}
      position={{ base: "sticky", md: "relative" }}
    >
      <Span className={cx("rbc-btn-group")} justifySelf={{ base: "center", md: "start" }}>
        <button onClick={() => onNavigate(Navigate.PREVIOUS)}>
          {localizer.messages.previous}
        </button>
      </Span>
      <HStack justifySelf="center" gap={1}>
        <select
          value={currentMonth}
          style={selectStyle}
          onChange={(e) =>
            onNavigate(Navigate.DATE, moment(date).month(parseInt(e.target.value)).toDate())
          }
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
        <select
          value={currentYear}
          style={selectStyle}
          onChange={(e) =>
            onNavigate(Navigate.DATE, moment(date).year(parseInt(e.target.value)).toDate())
          }
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </HStack>
      <Span justifySelf={{ base: "center", md: "end" }} className={cx("rbc-btn-group")}>
        <button onClick={() => onNavigate(Navigate.NEXT)}>
          {localizer.messages.next}
        </button>
      </Span>
    </Grid>
  );
};

interface Event {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: any;
}

interface GroupedLeaveRequestResource {
  nurseName: string;
  isOwn: boolean;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  requestId: number;
  requests: Array<{
    requestId: number;
    nurseName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
}

interface LeaveRequestCalendarProps {
  wardId: number | null | undefined;
}

export default function LeaveRequestCalendar({ wardId }: LeaveRequestCalendarProps) {
  const [date, setDate] = useState(() => moment().startOf("month").toDate());
  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);

  const { data: leaveRequests } = useQuery({
    queryKey: ["ward-leave-requests", wardId],
    queryFn: () => LeaveRequestsService.getWardLeaveRequests({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 0,
  });

  const { data: wardNurses } = useQuery({
    queryKey: ["ward-nurses", wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 5 * 60 * 1000,
  });

  const nurseMap = useMemo(() => {
    if (!wardNurses) return new Map<number, string>();
    return new Map(wardNurses.map((n) => [n.nurseid, n.name]));
  }, [wardNurses]);

  const events: Event[] = useMemo(() => {
    if (!leaveRequests) return [];
    const grouped = new Map<string, GroupedLeaveRequestResource>();

    leaveRequests.forEach((lr) => {
      const nurseName = nurseMap.get(lr.nurseid) ?? `Nurse ${lr.nurseid}`;
      const key = `${lr.startdate}__${lr.enddate}__${lr.leavetype}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.requests.push({
          requestId: lr.leaveid,
          nurseName,
          leaveType: lr.leavetype,
          startDate: lr.startdate,
          endDate: lr.enddate,
          status: lr.status,
        });
        existing.nurseName = existing.requests.map((request) => request.nurseName).join(", ");
        return;
      }

      grouped.set(key, {
        nurseName,
        isOwn: false,
        requestId: lr.leaveid,
        leaveType: lr.leavetype,
        startDate: lr.startdate,
        endDate: lr.enddate,
        status: lr.status,
        requests: [
          {
            requestId: lr.leaveid,
            nurseName,
            leaveType: lr.leavetype,
            startDate: lr.startdate,
            endDate: lr.enddate,
            status: lr.status,
          },
        ],
      });
    });

    return Array.from(grouped.values()).map((group) => ({
      title: group.leaveType,
      start: new Date(group.startDate),
      end: new Date(group.endDate),
      allDay: true,
      resource: group,
    }));
  }, [leaveRequests, nurseMap]);

  const MonthViewWithWard = useMemo(() => {
    const WrappedMonthView = (props: any) => (
      <CustomMonthView {...props} wardId={wardId} />
    );

    WrappedMonthView.range = CustomMonthView.range;
    WrappedMonthView.navigate = CustomMonthView.navigate;
    WrappedMonthView.title = CustomMonthView.title;

    return WrappedMonthView;
  }, [wardId]);

  const { views, defaultView } = useMemo(() => ({
    views: {
      month: MonthViewWithWard,
      week: false,
      day: false,
    } as any,
    defaultView: "month" as View,
  }), [MonthViewWithWard]);

  return (
    <Box h="100%" borderWidth="1px" p={3} borderColor="border" borderRadius={10}>
      <Calendar
        localizer={localizer}
        startAccessor="start"
        endAccessor="end"
        events={events}
        components={{ toolbar: LeaveToolbar }}
        view={defaultView}
        views={views}
        date={date}
        showAllEvents
        onNavigate={onNavigate}
      />
    </Box>
  );
}
