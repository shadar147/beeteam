import { defineStore } from "pinia";

/** Which meeting (if any) is open in the global MeetingDrawer. */
export const useDrawerStore = defineStore("drawer", {
  state: () => ({ openMeetingId: null as string | null }),
  actions: {
    open(id: string) { this.openMeetingId = id; },
    close() { this.openMeetingId = null; },
  },
});
