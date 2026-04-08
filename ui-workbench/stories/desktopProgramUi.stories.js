import { buildIframeStory } from "./workbenchHelpers.js";

export default {
  title: "Desktop Program UI",
};

export const Settings = {
  render: buildIframeStory("/desktop-program-ui/settings/code.html"),
};

export const ReservationOTA = {
  render: buildIframeStory("/desktop-program-ui/reserv%20ota/code.html"),
};

export const OrderList = {
  render: buildIframeStory("/desktop-program-ui/orderlist/code.html"),
};

export const Arrival = {
  render: buildIframeStory("/desktop-program-ui/arrival/code.html"),
};

export const RoomAvailable = {
  render: buildIframeStory("/desktop-program-ui/roomavailable/code.html"),
};

export const Cost = {
  render: buildIframeStory("/desktop-program-ui/cost/code.html"),
};

export const SheetNaverStation = {
  render: buildIframeStory("/desktop-program-ui/sitch_uh_sheet%20naver_station/code.html"),
};

export const StitchOrderListManager = {
  render: buildIframeStory("/desktop-program-ui/stitch_uh_orderlist_manager/code.html"),
};

export const StitchRoomAvailableManager = {
  render: buildIframeStory("/desktop-program-ui/stitch_uh_roomavailable_manager/code.html"),
};

export const StitchArrivalManager = {
  render: buildIframeStory("/desktop-program-ui/stitch_uh_Arrival_manager/code.html"),
};

export const StitchCashingManager = {
  render: buildIframeStory("/desktop-program-ui/stitch_uh_Cashing_manager/code.html"),
};

export const StitchSettingsManager = {
  render: buildIframeStory("/desktop-program-ui/stitch_uh_settings_manager/code.html"),
};
