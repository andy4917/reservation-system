# Wings HAR Endpoint Catalog

- endpoint_count: 47
- readonly_count: 43
- mutation_count: 4

| Path | Capability | Read-only | Branches |
| --- | --- | --- | --- |
| `/pms/biz/comn/searchBirthdayIsTodayGuestYN.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/comn/searchLangByNatCode.do` | `nationality_language_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/comn/searchWeddingAnniversaryIsTodayGuestYN.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/comn/sendBookingEngineAPI.do` | `booking_engine_send` | `N` | `COEX` |
| `/pms/biz/comn02_0301/searchListAccountContract.do` | `account_contract_lookup` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/fd00/searchRoomNoLength.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/fd01_0101/searchListLinkedReservation.do` | `linked_reservation_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/fd01_0101/searchListRateByWalkIn.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/fd01_0101/searchListServiceByWalkIn.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/fd01_0201/searchFITInHouse.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/fd01_0201/searchListLinkdeRoom.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/fd02_0100/searchCounting.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/fd02_0200/searchListAmount.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/fd02_0200/searchListGuestExpressCheckOut.do` | `readonly_unknown` | `Y` | `COEX` |
| `/pms/biz/fo05_0600/searchListExchangeWidget.do` | `readonly_unknown` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/ir00_0100/searchListDefaultValues.do` | `readonly_unknown` | `Y` | `COEX` |
| `/pms/biz/ir01_0101/searchMaxGuest.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir01_0102/searchCountDataInfo.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir01_0102/searchFITReserv.do` | `reservation_detail` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir01_0102/searchListSpecialService.do` | `special_service_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir01_0111/searchRoomRateOnRsvn.do` | `reservation_rate_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir01_0124/deleteAssignedRoom.do` | `assigned_room_delete` | `N` | `GANGNAM` |
| `/pms/biz/ir01_0124/insertAssignedRoom.do` | `assigned_room_insert` | `N` | `GANGNAM` |
| `/pms/biz/ir01_0124/searchGuestInfo.do` | `assigned_room_guest_info` | `Y` | `BRANCH_THE_SEOLLEUNG,GANGNAM` |
| `/pms/biz/ir01_0124/searchListAssignedRoom.do` | `assigned_room_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,GANGNAM` |
| `/pms/biz/ir01_0124/searchListRoom.do` | `assignable_room_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,GANGNAM` |
| `/pms/biz/ir01_0124/searchListRoomTypeByParam.do` | `assignable_room_type_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,GANGNAM` |
| `/pms/biz/ir01_0300/searchListColorList.do` | `readonly_unknown` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/ir01_0300/searchListContextMenu.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/ir01_0300/searchListRoomAvaiable.do` | `room_availability_chart` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir01_0300/searchListRoomBlockChart_V03.do` | `room_block_chart` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir01_0300_V03/updateReservationProcessExpress.do` | `reservation_express_update` | `N` | `COEX` |
| `/pms/biz/ir02_0100/searchListRoomAvailable.do` | `room_availability_summary` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir02_0101/searchComList.do` | `readonly_unknown` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/ir02_0101/searchListRoomAvailablebByRoomType.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/ir02_0101/searchRoomSummaryByRoomType.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG` |
| `/pms/biz/ir04/searchListMarket.do` | `market_catalog` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/ir04/searchListRoomType.do` | `room_type_catalog` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/ir04/searchListSource.do` | `source_catalog` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/ir04/selectListRate.do` | `rate_catalog` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/ir04/selectListSalePerson.do` | `sale_person_catalog` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do` | `reservation_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir04_0100X/searchListGlobalRsvn_v03_SUM.do` | `reservation_summary` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
| `/pms/biz/ir04_0200X_V03/searchListRsvn.do` | `reservation_lookup_local` | `Y` | `COEX` |
| `/pms/biz/sc03_0700/searchListConsultationMain.do` | `readonly_unknown` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/widget_onlinebookinglist/searchOnlineBookingList.do` | `online_booking_widget` | `Y` | `COEX,GANGNAM` |
| `/pms/biz/zz99_0400_V50/selectDisplayServiceInfo.do` | `readonly_unknown` | `Y` | `BRANCH_THE_SEOLLEUNG,COEX,GANGNAM` |
