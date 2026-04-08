import { buildIframeStory } from "./workbenchHelpers.js";

export default {
  title: "Stitch Recovery",
};

export const UnifiedWorkspace = {
  render: buildIframeStory("/stitch-recovery/stitch_/code.html"),
};

export const TaskManagerOrderList = {
  render: buildIframeStory("/stitch-recovery/stitch_uh_task_manager/code.html"),
};

export const TaskManagerReservationInventory = {
  render: buildIframeStory("/stitch-recovery/stitch_uh_task_manager_(1)/code.html"),
};

export const TaskManagerRoomOccupancy = {
  render: buildIframeStory("/stitch-recovery/stitch_uh_task_manager_(2)/code.html"),
};

export const TaskManagerArrival = {
  render: buildIframeStory("/stitch-recovery/stitch_uh_task_manager_(3)/code.html"),
};

export const TaskManagerCashing = {
  render: buildIframeStory("/stitch-recovery/stitch_uh_task_manager_(4)/code.html"),
};

export const TaskManagerSettings = {
  render: buildIframeStory("/stitch-recovery/stitch_uh_task_manager_(5)/code.html"),
};
