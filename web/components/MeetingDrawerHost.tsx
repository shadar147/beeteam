"use client";
import { useDrawerStore } from "@/lib/store/drawer";
import { MeetingDrawer } from "./MeetingDrawer";

export function MeetingDrawerHost() {
  const openMeetingId = useDrawerStore((s) => s.openMeetingId);
  const close = useDrawerStore((s) => s.close);
  if (!openMeetingId) return null;
  return <MeetingDrawer meetingId={openMeetingId} onClose={close} />;
}
