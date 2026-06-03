import { create } from "zustand";

type DrawerState = {
  openMeetingId: string | null;
  open: (id: string) => void;
  close: () => void;
};

export const useDrawerStore = create<DrawerState>((set) => ({
  openMeetingId: null,
  open: (id) => set({ openMeetingId: id }),
  close: () => set({ openMeetingId: null }),
}));
